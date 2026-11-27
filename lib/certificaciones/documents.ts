import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { getAccessToken } from "@/lib/finanzas/microsoft-graph";
import { Norma, ValidationError } from "./core";
import { createCertificationDocumentWriter } from "./documents-selected";
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
function base(drive: string) {
  return `${GRAPH}/drives/${encodeURIComponent(drive)}`;
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
/** Future writes only: no historical root lookup, provisioning or generic token.
 * A receipt is returned only after Selected metadata/ancestry/bytes verification. */
export async function uploadCertificationDocument(
  n: Norma,
  bytes: Buffer,
  filename: string,
) {
  const { mime } = validateDocument(bytes, filename);
  const stored = await createCertificationDocumentWriter().upload(n, bytes);
  return { ...stored, mime };
}
/** Historical pointers and read credentials remain unchanged: exact drive/item,
 * no migration, relocation, replacement or destination-runtime requirement. */
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
