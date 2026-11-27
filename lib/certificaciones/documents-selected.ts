import { createHash } from "node:crypto";
import {
  assertDocumentosPanelRuntime,
  documentosPanelProductionPins,
  DOCUMENTOS_APPROVED_PRODUCTION_PINS,
  DOCUMENTOS_PRODUCTION_ROOT,
} from "@/lib/finanzas/documentos-panel-runtime";
import {
  createSelectedTransport,
  selectedCredential,
  type SelectedDependencies,
} from "@/lib/finanzas/documentos-production-selected";
import { norma, type Norma } from "./core";

type Env = Record<string, string | undefined>;
const ID = /^[A-Za-z0-9!_.~,-]{4,220}$/;
const SELECT = "id,name,folder,file,parentReference,size,remoteItem";
const MAX_BYTES = 4 * 1024 * 1024;
function closed(message: string): never {
  throw new Error(`CERTIFICACIONES_DOCUMENTS_CLOSED: ${message}`);
}
function id(value: string | undefined): string {
  if (!value || !ID.test(value) || value.toLowerCase() === "root")
    closed("Pin exacto obligatorio; nunca raíz de unidad");
  return value;
}
/** Pure configuration only. No defaults, generic credentials or environment fallback.
 * Stage retains DocumentosPanel; Production needs the existing four approved pins
 * and its runtime gates, plus a separate explicit certification writer opt-in. */
function destination(env: Env) {
  const runtime = assertDocumentosPanelRuntime(true, env);
  if (env.FINANCE_CERTIFICACIONES_DOCUMENTS_WRITE_ENABLED !== "1")
    closed("Escritura futura no habilitada explícitamente");
  if (runtime.environment === "production") {
    const pins = documentosPanelProductionPins(env);
    if (!pins || runtime.root !== DOCUMENTOS_PRODUCTION_ROOT)
      closed("Faltan pins aprobados de carpeta 10");
    return Object.freeze({
      environment: runtime.environment,
      driveId: pins.driveId,
      folderItemId: pins.folderItemId,
      relativeLabel: runtime.root,
      parentItemId: null,
    });
  }
  const driveId = id(env.FINANCE_CERTIFICACIONES_STAGING_DRIVE_ID);
  const folderItemId = id(env.FINANCE_CERTIFICACIONES_STAGING_FOLDER_ITEM_ID);
  const parentItemId = id(env.FINANCE_CERTIFICACIONES_STAGING_PARENT_ITEM_ID);
  const approved = DOCUMENTOS_APPROVED_PRODUCTION_PINS;
  if (driveId === approved.driveId || folderItemId === parentItemId ||
      [folderItemId, parentItemId].some(value =>
        [approved.folderItemId, approved.pendingFolderItemId, approved.archivedFolderItemId].includes(value)))
    closed("Pins Production o raíz circular no admitidos como destino Stage");
  return Object.freeze({
    environment: runtime.environment,
    driveId,
    folderItemId,
    relativeLabel: runtime.root,
    parentItemId,
  });
}

/** Inert on import/construction. Uses the existing generic Selected transport, NOT
 * the financial Pendientes/Archivadas transport. Exposes upload only; no request,
 * discovery, folder provisioning, PATCH, DELETE, permission management or legacy
 * fallback. Certificaciones and the chosen norma must already exist below the pin.
 * The local checks do not prove the provider's effective resource grants. */
export function createCertificationDocumentWriter(
  env: Env = process.env,
  dependencies: Partial<SelectedDependencies> = {},
) {
  const target = destination(env);
  const credential = selectedCredential(env, "FINANCE_DOCUMENTOS_GRAPH");
  const guard = async () => {
    const current = destination(env);
    const currentCredential = selectedCredential(env, "FINANCE_DOCUMENTOS_GRAPH");
    if (Object.keys(target).some(key => current[key as keyof typeof current] !== target[key as keyof typeof target]) ||
        Object.keys(credential).some(key => currentCredential[key as keyof typeof credential] !== credential[key as keyof typeof credential]))
      closed("Destino o identidad cambiaron durante la operación");
    await dependencies.guard?.();
  };
  // One root only. In Production it is exactly the approved drive/item10. Stage
  // uses only its independently configured, isolated documentary folder.
  const transport = createSelectedTransport(credential, [target], false, {
    fetch: dependencies.fetch,
    tokenProvider: dependencies.tokenProvider,
    guard,
  });
  const path = (item: string) =>
    `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(id(item))}`;
  const read = async (url: string, nullable = false): Promise<any> => {
    const response = await transport.request(url);
    if (nullable && response.status === 404) return null;
    if (!response.ok) closed("Destino o documento no verificable; sin fallback ni aprovisionamiento");
    return response.json();
  };
  const root = async () => {
    const item = await read(`${path(target.folderItemId)}?$select=${SELECT}`);
    if (item.id !== target.folderItemId || item.name !== target.relativeLabel.split("/").pop() ||
        !item.folder || item.file || item.remoteItem || item.parentReference?.driveId !== target.driveId ||
        (target.parentItemId !== null && item.parentReference?.id !== target.parentItemId))
      closed("Carpeta documental fijada no verificable");
  };
  const folder = async (parent: string, name: string): Promise<string> => {
    const item = await read(`${path(parent)}:/${encodeURIComponent(name)}?$select=${SELECT}`);
    if (!item.folder || item.file || item.remoteItem || item.name !== name ||
        item.parentReference?.id !== parent || item.parentReference?.driveId !== target.driveId)
      closed("Subcarpeta no pertenece al padre documental autorizado");
    return id(item.id);
  };
  const file = (item: any, parent: string, name: string, size: number) => {
    if (!item?.file || item.folder || item.remoteItem || item.name !== name ||
        item.parentReference?.id !== parent || item.parentReference?.driveId !== target.driveId ||
        item.size !== size || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_BYTES)
      closed("ID/nombre/padre/drive/tamaño de archivo no verificables");
    return id(item.id);
  };
  return {
    async upload(n: Norma, bytes: Buffer) {
      const standard = norma(n);
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES)
        closed("Original vacío o superior a 4 MiB");
      const hash = createHash("sha256").update(bytes).digest("hex");
      const name = `${hash}.bin`;
      await guard();
      await root();
      const certifications = await folder(target.folderItemId, "Certificaciones");
      const parent = await folder(certifications, standard);
      const lookup = `${path(parent)}:/${name}`;
      let item = await read(`${lookup}?$select=${SELECT}`, true);
      if (!item) {
        // Recheck the complete known ancestry immediately before the only mutation.
        await root();
        if (await folder(target.folderItemId, "Certificaciones") !== certifications ||
            await folder(certifications, standard) !== parent)
          closed("El destino cambió antes de la escritura");
        const response = await transport.request(`${lookup}:/content?%40microsoft.graph.conflictBehavior=fail`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(bytes.length),
            "If-None-Match": "*",
          },
          body: Uint8Array.from(bytes).buffer,
        });
        if (response.status === 409 || response.status === 412)
          item = await read(`${lookup}?$select=${SELECT}`);
        else {
          if (!response.ok) closed("No se confirmó la conservación; no se reintenta en otra raíz");
          item = await response.json();
        }
      }
      const itemId = file(item, parent, name, bytes.length);
      const stored = await transport.download(target.driveId, itemId, MAX_BYTES);
      if (stored.length !== bytes.length || createHash("sha256").update(stored).digest("hex") !== hash)
        closed("El original no coincide; no se sobrescribe, borra ni sustituye la referencia");
      const checked = await read(`${path(itemId)}?$select=${SELECT}`);
      if (file(checked, parent, name, bytes.length) !== itemId)
        closed("La referencia cambió durante la comprobación");
      await guard();
      return { drive: target.driveId, item: itemId, hash };
    },
  };
}
