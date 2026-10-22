/*
 * B5 external preparation — document evidence for a pending bank charge.
 * This module is deliberately inert on import. The route calls the only Graph
 * mutation path only after authentication, exact-origin validation and staging
 * isolation. It never imports or reuses lib/finanzas/onedrive-tickets.ts.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import {requireB4ActorAccess} from "@/lib/finanzas/reconciliation-auth";
import { assertFinanceStagingIsolated } from "@/lib/finanzas/staging-safety";
import { findSharePointSite, getAccessToken, getSiteDrive } from "@/lib/finanzas/microsoft-graph";
import {
  type PendingDocumentInput,
  requestPayloadHash,
  storageNameForPayload,
} from "./pending-document-helper";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_ORIGIN = "https://graph.microsoft.com";
export const STAGING_FINANZAS_NO_CONTABILIZAR = "STAGING_FINANZAS_NO_CONTABILIZAR" as const;

type Tx = Prisma.TransactionClient & Record<string, any>;
type Db = PrismaClient & Record<string, any>;

export class PendingDocumentServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
function fail(status: number, code: string, message: string): never {
  throw new PendingDocumentServiceError(status, code, message);
}
function db(): Db { return prisma as Db; }
function txDb(tx: Prisma.TransactionClient): Tx { return tx as Tx; }

export type StoredGraphEvidence = Readonly<{
  driveId: string;
  itemId: string;
  authenticatedWebUrl: string;
}>;

function graphUrl(path: string): URL {
  const url = new URL(`${GRAPH_BASE}${path}`);
  if (url.protocol !== "https:" || url.origin !== GRAPH_ORIGIN || url.username || url.password || url.hash) {
    throw new Error("Ruta Graph inválida");
  }
  return url;
}
function component(value: string): string {
  if (!value || value.includes("/") || value.includes("\\") || /[\r\n]/.test(value)) throw new Error("Componente de Graph inválido");
  return encodeURIComponent(value);
}
function pinnedSharePointHost(site: { webUrl?: unknown }): string {
  if (typeof site.webUrl !== "string") fail(503, "PINNED_SHAREPOINT_URL_REQUIRED", "El site B1 no expone su webUrl autenticado fijado.");
  try {
    const url = new URL(site.webUrl);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new Error("webUrl de site no permitido");
    }
    return url.hostname;
  } catch {
    fail(503, "PINNED_SHAREPOINT_URL_REQUIRED", "El webUrl fijado del site SharePoint no es válido.");
  }
}
function isPinnedAuthenticatedWebUrl(value: unknown, expectedHost: string): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    // A query can contain a pre-authorized capability. Persist only a canonical,
    // credential-free SharePoint URL for the exact B1-pinned site host.
    return url.protocol === "https:" && url.hostname === expectedHost && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/** Reads the canonical site URL only from authenticated Graph, then pins item
 * webUrl to its exact host. It never follows/uses a pre-authorized URL. */
async function resolvePinnedSharePointHost(siteId: string, token: string): Promise<string> {
  const response = await graphRequest(graphUrl(`/sites/${component(siteId)}`), token, { method: "GET" });
  if (!response.ok) fail(502, "GRAPH_PROVIDER", `No se pudo verificar el site SharePoint configurado (${response.status}).`);
  const site = await response.json();
  if (!site?.id || String(site.id) !== siteId) fail(502, "GRAPH_PROVIDER", "Graph devolvió un site distinto del site B1 configurado.");
  return pinnedSharePointHost(site);
}

async function graphRequest(url: URL, token: string, init: RequestInit): Promise<Response> {
  return fetch(url.toString(), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
    redirect: "error",
  });
}

/** Creation is allowed only on a real, future explicit POST—not during dev/import. */
function assertProviderExecutionAllowed(): void {
  if (process.env.NODE_ENV !== "production") {
    fail(503, "PROVIDER_DISABLED_NON_PRODUCTION", "La subida a Graph está deshabilitada fuera del runtime de despliegue.");
  }
}

async function itemAtStagingRoot(driveId: string, token: string): Promise<any | null> {
  const response = await graphRequest(
    graphUrl(`/drives/${component(driveId)}/root:/${component(STAGING_FINANZAS_NO_CONTABILIZAR)}`), token, { method: "GET" },
  );
  if (response.status === 404) return null;
  if (!response.ok) fail(502, "GRAPH_PROVIDER", `No se pudo comprobar la carpeta de staging (${response.status}).`);
  return response.json();
}

/** No production accounting/ticket/invoice path is ever read, created or used. */
async function resolveExclusiveStagingFolder(driveId: string, token: string): Promise<{ id: string; name: string }> {
  let item = await itemAtStagingRoot(driveId, token);
  if (!item) {
    const response = await graphRequest(graphUrl(`/drives/${component(driveId)}/root/children`), token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: STAGING_FINANZAS_NO_CONTABILIZAR,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    if (response.status === 409) item = await itemAtStagingRoot(driveId, token);
    else if (!response.ok) fail(502, "GRAPH_PROVIDER", `No se pudo crear la carpeta de staging (${response.status}).`);
    else item = await response.json();
  }
  // Verify the actual parent immediately before every content PUT. A returned
  // item ID alone is not authority to write outside the dedicated namespace.
  if (!item?.folder || typeof item.id !== "string" || item.name !== STAGING_FINANZAS_NO_CONTABILIZAR) {
    fail(502, "GRAPH_STAGING_NAMESPACE", "La carpeta devuelta por Graph no es el namespace exclusivo de staging.");
  }
  return { id: item.id, name: item.name };
}

/**
 * PUT-only content upload. A name collision is never renamed/overwritten or
 * inferred as our file: Graph does not standardize a SHA-256 item hash, so an
 * interrupted PUT requires human review rather than unsafe recovery.
 */
export async function uploadPendingDocumentToStaging(input: PendingDocumentInput, payloadHash: string): Promise<StoredGraphEvidence> {
  // This exported provider boundary can be called independently of the service;
  // it must not rely on the caller having asserted staging isolation already.
  await assertFinanceStagingIsolated();
  assertProviderExecutionAllowed();
  const storageName = storageNameForPayload(payloadHash, input.extension);
  // B1 helper path only: site then drive selection stays centralized/pinned by
  // microsoft-graph.ts configuration. This implementation never discovers paths.
  const site = await findSharePointSite();
  const driveId = await getSiteDrive(site.siteId);
  const token = await getAccessToken();
  const expectedSharePointHost = await resolvePinnedSharePointHost(site.siteId, token);
  const parent = await resolveExclusiveStagingFolder(driveId, token);
  if (parent.name !== STAGING_FINANZAS_NO_CONTABILIZAR) fail(502, "GRAPH_STAGING_NAMESPACE", "Padre staging no válido.");

  const put = await graphRequest(
    graphUrl(`/drives/${component(driveId)}/items/${component(parent.id)}:/${component(storageName)}:/content`), token,
    {
      method: "PUT",
      headers: {
        "content-type": input.mimeType,
        "content-length": String(input.file.bytes.length),
        // Required to make collision fail-safe even though the filename is UUID.
        "if-none-match": "*",
      },
      body: Uint8Array.from(input.file.bytes).buffer as ArrayBuffer,
    },
  );
  if (put.status === 409 || put.status === 412) {
    fail(409, "GRAPH_EXISTING_UPLOAD_REVIEW", "Ya existe una subida con ese nombre; requiere revisión humana y no se sobrescribió ni renombró.");
  }
  if (!put.ok) fail(502, "GRAPH_PROVIDER", `No se pudo subir el documento a Graph (${put.status}).`);
  const item = await put.json();
  // Do not read, return, persist or log @microsoft.graph.downloadUrl: that can
  // be pre-authorized. webUrl is the authenticated SharePoint navigation URL.
  if (typeof item?.id !== "string" || !isPinnedAuthenticatedWebUrl(item?.webUrl, expectedSharePointHost)) {
    fail(502, "GRAPH_PROVIDER", "Graph no devolvió ID y webUrl autenticado válidos.");
  }
  return { driveId, itemId: item.id, authenticatedWebUrl: item.webUrl };
}

type MovementState = { id: string; estadoB4: string; fechaOperacion: Date; concepto: string; importe: number };
async function lockPendingMovement(tx: Tx, movimientoId: string): Promise<MovementState> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text), 0))::text AS locked`;
  const rows = await tx.$queryRaw<MovementState[]>`
    SELECT m.id, COALESCE(e.estado::text, 'SIN_DOCUMENTO') AS "estadoB4", m.fecha_operacion AS "fechaOperacion", m.concepto, m.importe
    FROM movimientos_bancarios m
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = m.id
    WHERE m.id = ${movimientoId}
    FOR UPDATE OF m
  `;
  if (rows.length !== 1) fail(404, "MOVIMIENTO_NO_ENCONTRADO", "El movimiento bancario no existe.");
  if (rows[0].estadoB4 !== "SIN_DOCUMENTO") {
    fail(409, "AUTORIDAD_B4", "El movimiento ya está JUSTIFICADO o NO_REQUIERE; no se sube un documento B5.");
  }
  // The document date is always explicit request evidence; this only proves the
  // selected object remains a real, date/text-bearing bank-source row. Neither
  // its date nor its amount is copied, defaulted or accepted as document data.
  if (!(rows[0].fechaOperacion instanceof Date) || !Number.isFinite(rows[0].fechaOperacion.getTime())
    || typeof rows[0].concepto !== "string" || rows[0].concepto.trim().length === 0) {
    fail(409, "MOVIMIENTO_FUENTE_INVALIDO", "El movimiento bancario no conserva fecha y texto de origen válidos.");
  }
  return rows[0];
}

async function checkedGestion(tx: Tx, input: PendingDocumentInput) {
  const existing = await tx.gestionPendienteMovimientoB5.findUnique({ where: { movimientoId: input.movimientoId } });
  const version = existing?.version ?? 1;
  if (version !== input.versionGestion) fail(409, "VERSION_CONFLICT", "La gestión pendiente cambió; relea el movimiento antes de subir.");
  return existing;
}

function completedResponse(row: any, idempotent: boolean) {
  if (!row?.id || !row?.oneDriveItemId || !row?.authenticatedWebUrl || (row.tipoDocumento !== "TICKET" && row.tipoDocumento !== "SOPORTE")) {
    fail(409, "IDEMPOTENCY_INCOMPLETE", "La reserva del documento está incompleta; no se puede declarar éxito.");
  }
  if (row.tipoDocumento === "TICKET" && (!row.gastoId || !row.documentoConciliableId)) {
    fail(409, "IDEMPOTENCY_INCOMPLETE", "El ticket reservado no contiene gasto y wrapper B4 completos.");
  }
  if (row.tipoDocumento === "SOPORTE" && (row.gastoId !== null || row.documentoConciliableId !== null)) {
    fail(409, "IDEMPOTENCY_INCOMPLETE", "El soporte no puede convertirse implícitamente en gasto o wrapper B4.");
  }
  return {
    ok: true, idempotent, idAdjunto: row.id, tipoDocumento: row.tipoDocumento,
    gastoId: row.gastoId ?? null, documentoConciliableId: row.documentoConciliableId ?? null,
    oneDriveItemId: row.oneDriveItemId, authenticatedWebUrl: row.authenticatedWebUrl,
  };
}

async function reserveUpload(actorId: number, input: PendingDocumentInput, payloadHash: string) {
  const completed = await db().adjuntoPendienteB5.findUnique({where:{actorId_idempotencyKey:{actorId,idempotencyKey:input.idempotencyKey}}})
  if(completed){
    if(completed.payloadHash!==payloadHash)fail(409,'IDEMPOTENCY_KEY_REUSED','La clave ya pertenece a otra solicitud.')
    if(completed.estado==='UPLOAD_COMPLETO')return {kind:'complete' as const,row:completed}
  }
  return db().$transaction(async (base) => {
    const tx = txDb(base);
    const movement = await lockPendingMovement(tx, input.movimientoId); // B4 guard before provider
    await checkedGestion(tx, input);
    if (input.tipoDocumento === "TICKET" && (!(typeof movement.importe === "number") || !Number.isFinite(movement.importe) || movement.importe >= 0)) {
      fail(422, "TICKET_REQUIERE_CARGO", "Un TICKET de gasto validado sólo puede adjuntarse a un cargo bancario negativo.");
    }
    const existing = await tx.adjuntoPendienteB5.findUnique({ where: { actorId_idempotencyKey: { actorId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.payloadHash !== payloadHash) fail(409, "IDEMPOTENCY_KEY_REUSED", "La clave de idempotencia ya pertenece a otra solicitud.");
      if (existing.estado === "UPLOAD_COMPLETO") return { kind: "complete" as const, row: existing };
      return { kind: "reserved" as const, row: existing };
    }
    const row = await tx.adjuntoPendienteB5.create({ data: {
      actorId, idempotencyKey: input.idempotencyKey, payloadHash, movimientoId: input.movimientoId,
      tipoDocumento: input.tipoDocumento, nombreTercero:input.nombreProveedor, concepto:input.concepto, mimeType:input.mimeType, fechaDocumento: input.fechaDocumento, importeDocumentoCentimos: input.importeCentimos,
      estado: "RESERVADO", fileSha256: input.fileSha256, storageName: storageNameForPayload(payloadHash, input.extension),
    } });
    return { kind: "reserved" as const, row };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finalizeUpload(
  actorId: number,
  input: PendingDocumentInput,
  payloadHash: string,
  graph: StoredGraphEvidence,
) {
  return db().$transaction(async (base) => {
    const tx = txDb(base);
    const movement = await lockPendingMovement(tx, input.movimientoId); // B4 guard again after provider
    const gestionAnterior = await checkedGestion(tx, input);
    if (input.tipoDocumento === "TICKET" && (!(typeof movement.importe === "number") || !Number.isFinite(movement.importe) || movement.importe >= 0)) {
      fail(422, "TICKET_REQUIERE_CARGO", "Un TICKET de gasto validado sólo puede adjuntarse a un cargo bancario negativo.");
    }
    const row = await tx.adjuntoPendienteB5.findUnique({ where: { actorId_idempotencyKey: { actorId, idempotencyKey: input.idempotencyKey } } });
    if (!row || row.payloadHash !== payloadHash) fail(409, "IDEMPOTENCY_CONFLICT", "La reserva del documento no coincide con la solicitud.");
    if (row.estado === "UPLOAD_COMPLETO") return completedResponse(row, true);
    if (row.tipoDocumento !== input.tipoDocumento || row.storageName !== storageNameForPayload(payloadHash, input.extension) || row.fileSha256 !== input.fileSha256) {
      fail(409, "IDEMPOTENCY_CONFLICT", "Los metadatos reservados no coinciden con el archivo validado.");
    }

    // SOPORTE persists only human-entered evidence metadata. It never creates a
    // financial source/wrapper or claims a bank link. TICKET is the only branch
    // that creates an explicit reviewed positive company-card cost.
    const gasto = input.tipoDocumento === "TICKET" ? await tx.gasto.create({ data: {
      concepto: input.concepto,
      importe: input.importeCentimos! / 100,
      fecha: input.fechaDocumento!,
      tipo: "GASTO_GENERAL",
      comercio: input.nombreProveedor,
      metodoPago: "TARJETA_EMPRESA",
      estado: "APROBADO",
      archivoUrl: graph.authenticatedWebUrl,
      archivoNombre: row.storageName,
      oneDriveItemId: graph.itemId,
      ocrCompletado: false,
    } }) : null;
    const documento = gasto ? await tx.documentoConciliable.create({ data: {
      tipo: "TICKET",
      importeObjetivoCentimos: -input.importeCentimos!,
      gastoId: gasto.id,
      activo: true,
    } }) : null;

    const before = gestionAnterior
      ? { responsableAdminId: gestionAnterior.responsableAdminId, estado: gestionAnterior.estado, nota: gestionAnterior.nota, version: gestionAnterior.version }
      : { responsableAdminId: null, estado: "PENDIENTE", nota: null, version: 1 };
    const result = { responsableAdminId: before.responsableAdminId, estado: "RECIBIDO" as const, nota: before.nota, version: before.version + 1 };
    const gestion = gestionAnterior
      ? await tx.gestionPendienteMovimientoB5.update({ where: { id: gestionAnterior.id }, data: result })
      : await tx.gestionPendienteMovimientoB5.create({ data: { movimientoId: input.movimientoId, ...result } });
    await tx.auditoriaGestionPendienteB5.create({ data: {
      gestionId: gestion.id, movimientoId: input.movimientoId, actorId,
      accion: gestionAnterior ? "ACTUALIZACION" : "CREACION",
      versionAnterior: before.version, versionResultante: result.version,
      snapshotAnterior: before,
      snapshotResultado: {
        ...result,
        versionEsperada: input.versionGestion,
        tipoDocumento: input.tipoDocumento,
        gastoId: gasto?.id ?? null,
        documentoConciliableId: documento?.id ?? null,
        payloadHash,
      },
    } });
    const completed = await tx.adjuntoPendienteB5.update({ where: { id: row.id }, data: {
      estado: "UPLOAD_COMPLETO", gastoId: gasto?.id ?? null, documentoConciliableId: documento?.id ?? null,
      driveId: graph.driveId, oneDriveItemId: graph.itemId, authenticatedWebUrl: graph.authenticatedWebUrl,
    } });
    return completedResponse(completed, false);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Full flow. It is intentionally invoked only by POST after access/origin checks. */
export async function createPendingDocument(actorId: number, input: PendingDocumentInput, store: typeof uploadPendingDocumentToStaging = uploadPendingDocumentToStaging) {
  if(input.tipoDocumento==='TICKET' && (!(input.fechaDocumento instanceof Date)||typeof input.importeCentimos!=='number'||input.importeCentimos<=0))fail(422,'TICKET_REVIEW_REQUIRED','El ticket necesita fecha e importe positivos validados.')
  const access=await requireB4ActorAccess(actorId,'escritura')
  if(access.ok===false)fail(access.response.status,'ACCESS_REVOKED','No dispone de escritura B4 activa.')
  const payloadHash = requestPayloadHash(actorId, input);
  // Before every provider action and every service DML. The assertion itself does
  // a SELECT only; failed isolation is a closed 503, not a partial upload.
  await assertFinanceStagingIsolated();
  const reservation = await reserveUpload(actorId, input, payloadHash);
  if (reservation.kind === "complete") return completedResponse(reservation.row, true);
  // The reservation committed DML. Re-attest the isolated copy immediately
  // before the only external/provider action, rather than assuming it remains
  // true across a transaction boundary.
  await assertFinanceStagingIsolated();
  const graph = await store(input, payloadHash);
  try {
    // The provider boundary has elapsed: assert isolation again immediately
    // before the final Gasto/wrapper/gestión/auditoría DML transaction.
    await assertFinanceStagingIsolated();
    const accessAfter=await requireB4ActorAccess(actorId,'escritura')
    if(accessAfter.ok===false)fail(accessAfter.response.status,'ACCESS_REVOKED','El permiso cambió durante la subida; el archivo se conserva para revisión.')
    return await finalizeUpload(actorId, input, payloadHash, graph);
  } catch (error: any) {
    if (error?.code === "P2002" || error?.code === "P2034") {
      fail(409, "CONCURRENT_CONFLICT", "Conflicto concurrente al confirmar el documento; relea y reintente con la misma clave.");
    }
    throw error;
  }
}
