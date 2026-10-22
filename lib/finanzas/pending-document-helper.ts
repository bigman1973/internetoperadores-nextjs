import { createHash } from "node:crypto";

/** Deliberately independent from Next/Prisma so fixtures can test it without env. */
export const MAX_MULTIPART_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
const MAX_FIELD_BYTES = 2_048;
const EXPECTED_FIELDS = [
  "movimientoId",
  "versionGestion",
  "fechaDocumento",
  "importeDocumento",
  "nombreProveedor",
  "concepto",
  "confirmacionDocumento",
  "idempotencyKey",
] as const;
const OPTIONAL_FIELDS = ["tipoDocumento"] as const;
const ACCEPTED_FIELDS = [...EXPECTED_FIELDS, ...OPTIONAL_FIELDS] as const;

export type UploadedPart = Readonly<{ mimeType: string; bytes: Buffer }>;
export type MultipartFields = Record<(typeof EXPECTED_FIELDS)[number], string> & Partial<Record<(typeof OPTIONAL_FIELDS)[number], string>>;
export type MultipartInput = Readonly<{ fields: MultipartFields; file: UploadedPart }>;
export type TipoDocumentoPendienteB5 = "TICKET" | "SOPORTE";
export type PendingDocumentInput = Readonly<{
  movimientoId: string;
  versionGestion: number;
  tipoDocumento: TipoDocumentoPendienteB5;
  fechaDocumento: Date | null;
  fechaDocumentoIso: string;
  importeDocumento: string;
  importeCentimos: number | null;
  nombreProveedor: string;
  concepto: string;
  idempotencyKey: string;
  file: UploadedPart;
  fileSha256: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  extension: "pdf" | "jpg" | "png";
}>;

export class UploadValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function reject(status: number, code: string, message: string): never {
  throw new UploadValidationError(status, code, message);
}

function contentLength(headers: Headers): number {
  const value = headers.get("content-length");
  if (value === null || !/^\d+$/.test(value) || Number(value) > MAX_MULTIPART_BYTES) {
    reject(413, "BODY_LIMIT", "Content-Length es obligatorio y no puede superar 4 MiB.");
  }
  return Number(value);
}

function boundaryFrom(headers: Headers): Buffer {
  const contentType = headers.get("content-type") ?? "";
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]{1,100})"|([^;\s]{1,100}))(?:\s*;.*)?$/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || /[\r\n]/.test(boundary)) reject(415, "MULTIPART_REQUIRED", "Se requiere multipart/form-data con boundary válido.");
  return Buffer.from(boundary, "ascii");
}

type Part = { name: string; filename: string | null; mimeType: string; chunks: Buffer[]; size: number };

function parseHeaders(raw: Buffer): Omit<Part, "chunks" | "size"> {
  const text = raw.toString("latin1");
  const lines = text.split("\r\n");
  const values = new Map<string, string>();
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index < 1 || /[\r\n]/.test(line)) reject(400, "MULTIPART_INVALID", "Cabecera multipart inválida.");
    const key = line.slice(0, index).trim().toLowerCase();
    if (values.has(key)) reject(400, "MULTIPART_INVALID", "Cabecera multipart repetida.");
    values.set(key, line.slice(index + 1).trim());
  }
  const disposition = values.get("content-disposition") ?? "";
  const match = /^form-data\s*;\s*name="([A-Za-z][A-Za-z0-9_]*)"(?:\s*;\s*filename="([^"\r\n]{1,255})")?$/i.exec(disposition);
  if (!match) reject(400, "MULTIPART_INVALID", "La disposición multipart no es admitida.");
  if (values.has("content-transfer-encoding")) reject(400, "MULTIPART_INVALID", "No se admite Content-Transfer-Encoding.");
  return { name: match[1], filename: match[2] ?? null, mimeType: (values.get("content-type") ?? "text/plain").split(";", 1)[0].trim().toLowerCase() };
}

/**
 * Incremental parser: never calls Request.formData()/arrayBuffer(), counts every
 * body chunk, and retains only the current part (the sole file is capped at 3 MiB).
 */
export async function readStrictMultipart(req: Pick<Request, "headers" | "body">): Promise<MultipartInput> {
  const declaredLength = contentLength(req.headers);
  const boundary = boundaryFrom(req.headers);
  if (!req.body) reject(400, "BODY_REQUIRED", "El cuerpo multipart es obligatorio.");

  const opening = Buffer.concat([Buffer.from("--"), boundary, Buffer.from("\r\n")]);
  const separator = Buffer.concat([Buffer.from("\r\n--"), boundary]);
  const reader = req.body.getReader();
  let buffer = Buffer.alloc(0);
  let total = 0;
  let state: "opening" | "headers" | "body" | "after" | "end" = "opening";
  let current: Part | null = null;
  const fields = new Map<string, string>();
  let file: UploadedPart | null = null;

  const append = (part: Part, bytes: Buffer) => {
    if (bytes.length === 0) return;
    part.size += bytes.length;
    const isFile = part.filename !== null;
    if (part.size > (isFile ? MAX_DOCUMENT_BYTES : MAX_FIELD_BYTES)) {
      reject(413, isFile ? "FILE_LIMIT" : "FIELD_LIMIT", isFile ? "El archivo supera 3 MiB." : "Campo multipart demasiado grande.");
    }
    part.chunks.push(Buffer.from(bytes));
  };
  const finish = () => {
    if (!current) reject(400, "MULTIPART_INVALID", "Parte multipart ausente.");
    const bytes = Buffer.concat(current.chunks, current.size);
    if (current.filename !== null) {
      if (current.name !== "archivo" || file !== null || bytes.length === 0) reject(400, "MULTIPART_FIELDS", "Se requiere un único archivo no vacío llamado archivo.");
      file = { mimeType: current.mimeType, bytes };
    } else {
      if (!(ACCEPTED_FIELDS as readonly string[]).includes(current.name) || fields.has(current.name)) {
        reject(400, "MULTIPART_FIELDS", "Los campos multipart deben ser únicos y cerrados.");
      }
      let value: string;
      try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { reject(400, "MULTIPART_INVALID", "Un campo no está codificado en UTF-8."); }
      fields.set(current.name, value);
    }
    current = null;
  };

  const consume = (final: boolean) => {
    for (;;) {
      if (state === "opening") {
        if (buffer.length < opening.length) return;
        if (!buffer.subarray(0, opening.length).equals(opening)) reject(400, "MULTIPART_INVALID", "Inicio multipart inválido.");
        buffer = buffer.subarray(opening.length); state = "headers"; continue;
      }
      if (state === "headers") {
        const at = buffer.indexOf("\r\n\r\n");
        if (at < 0) {
          if (buffer.length > 8 * 1024 || final) reject(400, "MULTIPART_INVALID", "Cabeceras multipart incompletas.");
          return;
        }
        const header = parseHeaders(buffer.subarray(0, at));
        current = { ...header, chunks: [], size: 0 };
        buffer = buffer.subarray(at + 4); state = "body"; continue;
      }
      if (state === "body") {
        const at = buffer.indexOf(separator);
        if (at < 0) {
          const retain = separator.length + 2;
          const flush = Math.max(0, buffer.length - retain);
          if (flush > 0) { append(current!, buffer.subarray(0, flush)); buffer = buffer.subarray(flush); continue; }
          if (final) reject(400, "MULTIPART_INVALID", "Cierre multipart ausente.");
          return;
        }
        append(current!, buffer.subarray(0, at));
        buffer = buffer.subarray(at + separator.length); finish(); state = "after"; continue;
      }
      if (state === "after") {
        if (buffer.length < 2) { if (final) reject(400, "MULTIPART_INVALID", "Cierre multipart incompleto."); return; }
        if (buffer.subarray(0, 2).equals(Buffer.from("\r\n"))) { buffer = buffer.subarray(2); state = "headers"; continue; }
        if (buffer.subarray(0, 2).equals(Buffer.from("--"))) { buffer = buffer.subarray(2); state = "end"; continue; }
        reject(400, "MULTIPART_INVALID", "Separador multipart inválido.");
      }
      if (state === "end") {
        // The final CRLF is optional and may arrive split over stream chunks.
        const terminal = Buffer.from("\r\n");
        if (buffer.length > terminal.length || !terminal.subarray(0, buffer.length).equals(buffer)) {
          reject(400, "MULTIPART_INVALID", "Datos después del cierre multipart.");
        }
        if (buffer.length === terminal.length) buffer = Buffer.alloc(0);
        return;
      }
    }
  };

  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_MULTIPART_BYTES) reject(413, "BODY_LIMIT", "El cuerpo supera 4 MiB.");
      buffer = Buffer.concat([buffer, Buffer.from(next.value)]);
      consume(false);
    }
    if (total !== declaredLength) reject(400, "CONTENT_LENGTH_MISMATCH", "El cuerpo recibido no coincide con Content-Length.");
    consume(true);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (String(state) !== "end" || !file || fields.size < EXPECTED_FIELDS.length || fields.size > ACCEPTED_FIELDS.length || EXPECTED_FIELDS.some((name) => !fields.has(name))) {
    reject(400, "MULTIPART_FIELDS", "Faltan campos obligatorios o el formulario contiene una forma no admitida.");
  }
  return { fields: Object.fromEntries(fields) as MultipartFields, file };
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) reject(400, "VALIDATION_ERROR", "fechaDocumento debe ser YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) reject(400, "VALIDATION_ERROR", "fechaDocumento no es una fecha válida.");
  return date;
}

function parseSignedCents(value: string): number {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) reject(400, "VALIDATION_ERROR", "importeDocumento debe ser decimal exacto con signo opcional y hasta dos decimales.");
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fractional = ""] = unsigned.split(".");
  const units = Number(integer);
  const fractionalCents = Number(fractional.padEnd(2, "0"));
  if (!Number.isSafeInteger(units) || !Number.isSafeInteger(fractionalCents)) reject(422, "IMPORTE_NO_ADMITIDO", "importeDocumento no cabe exactamente en céntimos B4.");
  const magnitude = units * 100 + fractionalCents;
  const cents = negative ? -magnitude : magnitude;
  if (!Number.isSafeInteger(cents) || cents === 0 || cents < -2_147_483_648 || cents > 2_147_483_647) {
    reject(422, "IMPORTE_NO_ADMITIDO", "importeDocumento debe ser distinto de cero y caber exactamente en céntimos B4.");
  }
  return cents;
}

function parsePositiveTicketCents(value: string): number {
  const cents = parseSignedCents(value);
  if (cents <= 0) reject(422, "IMPORTE_NO_ADMITIDO", "Un TICKET sólo admite un coste positivo; una nota de crédito no es un TICKET.");
  return cents;
}

function detectedMime(bytes: Buffer): PendingDocumentInput["mimeType"] | null {
  if (bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

function stableUuid(hash: string): string {
  const value = Buffer.from(hash.slice(0, 32), "hex");
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = value.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validatePendingDocument(input: MultipartInput): PendingDocumentInput {
  if(!Buffer.isBuffer(input.file.bytes)||input.file.bytes.length===0||input.file.bytes.length>MAX_DOCUMENT_BYTES)reject(413,'FILE_LIMIT','El archivo debe ser no vacío y no superar 3 MiB.');
  const f = input.fields;
  if (!f.movimientoId || f.movimientoId.trim() !== f.movimientoId || f.movimientoId.length > 160) reject(400, "VALIDATION_ERROR", "movimientoId no es válido.");
  if (!/^[1-9]\d*$/.test(f.versionGestion) || !Number.isSafeInteger(Number(f.versionGestion))) reject(400, "VALIDATION_ERROR", "versionGestion debe ser entero positivo.");
  const tipoDocumento: TipoDocumentoPendienteB5 = f.tipoDocumento === undefined || f.tipoDocumento === "" ? "SOPORTE" : f.tipoDocumento === "TICKET" || f.tipoDocumento === "SOPORTE" ? f.tipoDocumento : reject(400, "VALIDATION_ERROR", "tipoDocumento sólo permite TICKET o SOPORTE.");
  if (f.confirmacionDocumento !== "true") reject(422, "CONFIRMACION_REQUERIDA", "confirmacionDocumento debe ser exactamente true.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(f.idempotencyKey)) reject(400, "VALIDATION_ERROR", "idempotencyKey debe ser un UUID v4.");
  const nombreProveedor = f.nombreProveedor.trim();
  const concepto = f.concepto.trim();
  if (!nombreProveedor || nombreProveedor.length > 300 || !concepto || concepto.length > 1_000) reject(400, "VALIDATION_ERROR", "nombreProveedor o concepto no son válidos.");
  const actualMime = detectedMime(input.file.bytes);
  if (!actualMime || input.file.mimeType !== actualMime) reject(415, "FILE_SIGNATURE", "Sólo se admite PDF, JPEG o PNG cuyo MIME y firma coincidan; SVG no se admite.");
  const extension = actualMime === "application/pdf" ? "pdf" : actualMime === "image/jpeg" ? "jpg" : "png";
  const fileSha256 = createHash("sha256").update(input.file.bytes).digest("hex");
  const importeCentimos = tipoDocumento === "TICKET" ? parsePositiveTicketCents(f.importeDocumento) : f.importeDocumento.trim() === "" ? null : parseSignedCents(f.importeDocumento);
  const canonical = JSON.stringify({ movimientoId: f.movimientoId, versionGestion: Number(f.versionGestion), tipoDocumento, fechaDocumento: f.fechaDocumento, importeDocumento: f.importeDocumento, nombreProveedor, concepto, idempotencyKey: f.idempotencyKey.toLowerCase(), fileSha256 });
  // Kept here as a validation/canonicalization assertion. The actual storage
  // name is actor-bound below, so two distinct authenticated actors cannot
  // collide simply by reusing a client idempotency UUID.
  createHash("sha256").update(canonical).digest("hex");
  return {
    movimientoId: f.movimientoId, versionGestion: Number(f.versionGestion), tipoDocumento, fechaDocumento: tipoDocumento === "SOPORTE" && f.fechaDocumento.trim()==="" ? null : parseDate(f.fechaDocumento), fechaDocumentoIso: f.fechaDocumento,
    importeDocumento: f.importeDocumento, importeCentimos, nombreProveedor, concepto, idempotencyKey: f.idempotencyKey.toLowerCase(),
    file: input.file, fileSha256, mimeType: actualMime, extension,
  };
}

export function requestPayloadHash(actorId: number, input: PendingDocumentInput): string {
  return createHash("sha256").update(JSON.stringify({ actorId, movimientoId: input.movimientoId, versionGestion: input.versionGestion, tipoDocumento: input.tipoDocumento, fechaDocumento: input.fechaDocumentoIso, importeDocumento: input.importeDocumento, nombreProveedor: input.nombreProveedor, concepto: input.concepto, idempotencyKey: input.idempotencyKey, fileSha256: input.fileSha256 })).digest("hex");
}

/** Stable UUID filename; its source hash includes actor + idempotency fields. */
export function storageNameForPayload(payloadHash: string, extension: PendingDocumentInput["extension"]): string {
  if (!/^[0-9a-f]{64}$/i.test(payloadHash)) throw new Error("payloadHash inválido");
  return `${stableUuid(payloadHash)}.${extension}`;
}
