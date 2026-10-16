import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import {
  getAccessToken,
  findSharePointSite,
  getSiteDrive,
} from "@/lib/finanzas/microsoft-graph";
import { Norma, ValidationError } from "./core";
export const MAX_DOCUMENT = 4 * 1024 * 1024;
const GRAPH = "https://graph.microsoft.com/v1.0";
export function validateDocument(bytes: Buffer, filename: string) {
  if (!bytes.length || bytes.length > MAX_DOCUMENT)
    throw new ValidationError("El archivo debe tener como máximo 4 MB");
  if (/\.pdf$/i.test(filename) && bytes.subarray(0, 5).toString() === "%PDF-")
    return { extension: "pdf", mime: "application/pdf" };
  if (/\.docx$/i.test(filename) && bytes.subarray(0, 2).toString() === "PK") {
    let count = 0,
      expanded = 0;
    try {
      const entries = unzipSync(bytes, {
        filter: (entry) => {
          count++;
          expanded += entry.originalSize;
          if (
            count > 300 ||
            expanded > 32 * 1024 * 1024 ||
            entry.originalSize > 16 * 1024 * 1024 ||
            /vbaProject|\.exe$|\.dll$/i.test(entry.name)
          )
            throw new Error("Paquete no permitido");
          return ["[Content_Types].xml", "word/document.xml"].includes(
            entry.name,
          );
        },
      });
      if (entries["[Content_Types].xml"] && entries["word/document.xml"])
        return {
          extension: "docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
    } catch {
      throw new ValidationError("Word no válido o paquete demasiado grande");
    }
  }
  throw new ValidationError("Solo se admiten archivos PDF o Word DOCX válidos");
}
async function credentials() {
  const token = await getAccessToken();
  const drive =
    process.env.SHAREPOINT_DRIVE_ID ||
    (await getSiteDrive((await findSharePointSite()).siteId));
  return { token, drive };
}
function base(drive: string) {
  return `${GRAPH}/drives/${encodeURIComponent(drive)}`;
}
async function folder(
  drive: string,
  token: string,
  path: string,
  parent: string | null,
  name: string,
) {
  const url = `${base(drive)}/root:/${path.split("/").map(encodeURIComponent).join("/")}`;
  const current = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (current.ok) {
    if (!(await current.json()).folder)
      throw new Error("Ruta documental no válida");
    return;
  }
  if (current.status !== 404)
    throw new Error("No se pudo verificar la carpeta corporativa privada");
  const parentUrl = parent
    ? `${base(drive)}/root:/${parent.split("/").map(encodeURIComponent).join("/")}:/children`
    : `${base(drive)}/root/children`;
  const r = await fetch(parentUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok && r.status !== 409)
    throw new Error("No se pudo crear la carpeta corporativa privada");
}
async function download(drive: string, item: string, token: string) {
  if (
    !/^[A-Za-z0-9!_.~-]{4,220}$/.test(drive) ||
    !/^[A-Za-z0-9!_.~-]{4,220}$/.test(item)
  )
    throw new Error("Referencia privada no válida");
  const r = await fetch(
    `${base(drive)}/items/${encodeURIComponent(item)}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    },
  );
  if (
    !r.ok ||
    !r.body ||
    Number(r.headers.get("content-length")) > MAX_DOCUMENT
  )
    throw new Error("No se pudo recuperar el documento privado");
  const reader = r.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_DOCUMENT) {
        await reader.cancel();
        throw new Error("Documento demasiado grande");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
export async function uploadCertificationDocument(
  n: Norma,
  bytes: Buffer,
  filename: string,
) {
  const { mime, extension } = validateDocument(bytes, filename),
    hash = createHash("sha256").update(bytes).digest("hex");
  const { drive, token } = await credentials();
  await folder(drive, token, "Certificaciones", null, "Certificaciones");
  await folder(drive, token, `Certificaciones/${n}`, "Certificaciones", n);
  const url = `${base(drive)}/root:/Certificaciones/${n}/${hash}.bin`;
  const existing = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (existing.ok) {
    const data = await existing.json(),
      stored = await download(drive, data.id, token);
    if (createHash("sha256").update(stored).digest("hex") !== hash)
      throw new Error(
        "El archivo ya existe pero no coincide; no se sobrescribe",
      );
    return { drive, item: String(data.id), hash, mime };
  }
  if (existing.status !== 404)
    throw new Error("No se pudo comprobar el documento");
  const r = await fetch(url + ":/content", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "If-None-Match": "*",
    },
    body: new Uint8Array(bytes),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 409 || r.status === 412) {
    const concurrent = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!concurrent.ok)
      throw new Error("Conflicto de archivo. Vuelve a intentarlo.");
    const data = await concurrent.json(),
      stored = await download(drive, data.id, token);
    if (createHash("sha256").update(stored).digest("hex") !== hash)
      throw new Error("Documento distinto; no se ha sobrescrito");
    return { drive, item: String(data.id), hash, mime };
  }
  if (!r.ok)
    throw new Error(
      "No se pudo guardar el documento privado; comprueba los permisos corporativos",
    );
  const data = await r.json();
  if (typeof data.id !== "string" || !data.id)
    throw new Error("OneDrive no confirmó el archivo");
  return { drive, item: data.id, hash, mime };
}
export async function downloadCertificationDocument(
  drive: string,
  item: string,
  hash: string,
) {
  const bytes = await download(drive, item, await getAccessToken());
  if (createHash("sha256").update(bytes).digest("hex") !== hash)
    throw new Error("El documento original ha cambiado; revisión necesaria");
  return bytes;
}
