import pdfParse from 'pdf-parse'
import * as XLSX from 'xlsx'
import { parseConfirmingFile, detectarTipoConfirming } from './confirming-parser'
import type { ConfirmingCuadre, ConfirmingProcedencia, ConfirmingTipoDocumento } from './confirming-parser'

/** Memory-only manual reader. Never imports a C11 lot or proves a bank collection. */
export const CONFIRMING_FILE_MAX_BYTES = 4 * 1024 * 1024
export const CONFIRMING_HEADER_MAX_BYTES = 4096
export const CONFIRMING_BODY_MAX_BYTES = CONFIRMING_FILE_MAX_BYTES + 8192
const MAX_LINES = 10_000
const MAX_EXPANDED_XLSX_BYTES = 25 * 1024 * 1024
export type ConfirmingManualFile = Readonly<{ nombre: string; extension: 'pdf' | 'xls' | 'xlsx'; bytes: Buffer }>
export type ConfirmingDocumentoLinea = Readonly<{
  factura: string; nominal: number | null; intereses: number | null; comision: number | null;
  netoDetalleSinIva: number | null; fechaFactura: string | null; fechaPago: string | null;
  fechaVencimiento: string | null; procedencia: string | null;
}>
export type ConfirmingDocumentoLectura = Readonly<{
  schema: 'CONFIRMING_DOCUMENTO_LECTURA_V1'; lecturaManual: true; stagingOnly: true;
  archivo: { nombre: string; extension: string; bytes: number; sha256: string | null };
  banco: 'BBVA' | 'CaixaBank'; tipoDocumento: ConfirmingTipoDocumento;
  procedencia: ConfirmingProcedencia | null;
  fechaDocumento: string | null; fechaLiquidacion: string | null;
  importes: { nominal: number | null; intereses: number | null; comision: number | null;
    ivaComision: number | null; netoBancario: number | null; deducciones: number | null;
    netoDetalleXlsSinIva: number | null };
  lineas: readonly ConfirmingDocumentoLinea[]; avisos: readonly string[]; cuadre: ConfirmingCuadre;
  confirmable: false; archivado: false; persistido: false;
  efectos: { businessWrites: 0; imports: 0; cobrosConfirmados: 0; facturasMarcadasPagadas: 0 };
}>

export class ConfirmingDocumentosError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}
function reject(status: number, code: string, message: string): never {
  throw new ConfirmingDocumentosError(status, code, message)
}

/** HTTPS and exact canonical Origin only; no referer/forwarded-header fallback. */
export function confirmingDocumentosSameOrigin(req: { headers: Headers; nextUrl: URL }): boolean {
  return req.nextUrl.protocol === 'https:' && req.headers.get('origin') === req.nextUrl.origin
}

function extensionFor(nombre: string): ConfirmingManualFile['extension'] {
  // Preserve UTF-8 browser filenames, but no paths, control chars or alternate streams.
  if (nombre.length > 180 || /[\x00-\x1f\x7f\\/:]/.test(nombre) || nombre.startsWith('.') || nombre !== nombre.trim()) {
    reject(400, 'CONFIRMING_FILENAME_INVALID', 'Nombre de archivo no válido; no se admiten rutas.')
  }
  const extension = /\.([a-z0-9]+)$/i.exec(nombre)?.[1].toLowerCase()
  if (extension !== 'pdf' && extension !== 'xls' && extension !== 'xlsx') {
    reject(415, 'CONFIRMING_EXTENSION_INVALID', 'Sólo se admiten archivos PDF, XLS y XLSX.')
  }
  return extension
}

function readFileHeader(raw: Buffer): { nombre: string; extension: ConfirmingManualFile['extension'] } {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw) }
  catch { reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Cabecera de archivo no válida.') }
  const headers = new Map<string, string>()
  for (const line of text.split('\r\n')) {
    const match = /^([a-z-]+):[ \t]*([^\r\n]*)$/i.exec(line)
    if (!match) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Cabecera multipart no válida.')
    const key = match[1].toLowerCase()
    if (headers.has(key) || !['content-disposition', 'content-type'].includes(key)) {
      reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Cabecera repetida o no admitida.')
    }
    headers.set(key, match[2])
  }
  const disposition = /^form-data;\s*name="archivo";\s*filename="([^"\r\n]+)"$/i.exec(headers.get('content-disposition') ?? '')
  if (!disposition) reject(400, 'CONFIRMING_MULTIPART_FIELDS', 'Se requiere un único archivo llamado archivo, sin campos adicionales.')
  const nombre = disposition[1]
  return { nombre, extension: extensionFor(nombre) }
}

/** Streaming single-file multipart: counts actual bytes, rejects extra parts at their header.
 * No Request.formData()/arrayBuffer(), no disk, no URL/file IDs from the browser. */
export async function readConfirmingDocumentosMultipart(req: Pick<Request, 'headers' | 'body'>): Promise<ConfirmingManualFile> {
  const contentType = req.headers.get('content-type') ?? ''
  const match = /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=? -]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))$/i.exec(contentType)
  const boundary = match?.[1] ?? match?.[2]
  if (!boundary || boundary.endsWith(' ')) reject(415, 'CONFIRMING_MULTIPART_REQUIRED', 'Se requiere multipart/form-data con boundary válido.')
  const declared = req.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > CONFIRMING_BODY_MAX_BYTES)) {
    reject(413, 'CONFIRMING_BODY_LIMIT', 'El cuerpo supera el límite de lectura manual.')
  }
  if (!req.body) reject(400, 'CONFIRMING_BODY_REQUIRED', 'Falta el archivo para lectura.')
  const opening = Buffer.from(`--${boundary}\r\n`)
  const separator = Buffer.from(`\r\n--${boundary}`)
  const reader = req.body.getReader()
  let buffer = Buffer.alloc(0), total = 0, fileSize = 0, terminalSize = 0
  let state: 'opening' | 'headers' | 'file' | 'after' | 'end' = 'opening'
  let fileHeader: ReturnType<typeof readFileHeader> | null = null
  const chunks: Buffer[] = []
  function append(bytes: Buffer) {
    fileSize += bytes.length
    if (fileSize > CONFIRMING_FILE_MAX_BYTES) reject(413, 'CONFIRMING_FILE_LIMIT', 'El archivo supera 4 MiB.')
    if (bytes.length) chunks.push(Buffer.from(bytes))
  }
  function consume(final: boolean) {
    for (;;) {
      if (state === 'opening') {
        if (buffer.length < opening.length) { if (final) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Inicio multipart incompleto.'); return }
        if (!buffer.subarray(0, opening.length).equals(opening)) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Inicio multipart no válido.')
        buffer = buffer.subarray(opening.length); state = 'headers'; continue
      }
      if (state === 'headers') {
        const at = buffer.indexOf('\r\n\r\n')
        if (at > CONFIRMING_HEADER_MAX_BYTES || (at < 0 && buffer.length > CONFIRMING_HEADER_MAX_BYTES + 3)) reject(413, 'CONFIRMING_HEADER_LIMIT', 'Cabecera multipart demasiado grande.')
        if (at < 0) { if (final) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Cabecera incompleta.'); return }
        if (fileHeader) reject(400, 'CONFIRMING_MULTIPART_FIELDS', 'No se admiten archivos duplicados ni campos adicionales.')
        fileHeader = readFileHeader(buffer.subarray(0, at))
        buffer = buffer.subarray(at + 4); state = 'file'; continue
      }
      if (state === 'file') {
        let at = buffer.indexOf(separator)
        // A boundary-like byte sequence inside a binary is not a part delimiter.
        while (at >= 0 && buffer.length >= at + separator.length + 2) {
          const suffix = buffer.subarray(at + separator.length, at + separator.length + 2).toString('ascii')
          if (suffix === '--' || suffix === '\r\n') break
          at = buffer.indexOf(separator, at + 1)
        }
        if (at < 0 || buffer.length < at + separator.length + 2) {
          const flush = Math.max(0, buffer.length - separator.length - 2)
          if (flush) { append(buffer.subarray(0, flush)); buffer = buffer.subarray(flush) }
          if (final) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Falta el cierre multipart.')
          return
        }
        append(buffer.subarray(0, at)); buffer = buffer.subarray(at + separator.length); state = 'after'; continue
      }
      if (state === 'after') {
        if (buffer.subarray(0, 2).equals(Buffer.from('\r\n'))) { buffer = buffer.subarray(2); state = 'headers'; continue }
        if (!buffer.subarray(0, 2).equals(Buffer.from('--'))) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Cierre multipart no válido.')
        buffer = buffer.subarray(2); state = 'end'; continue
      }
      if (state === 'end') {
        const terminal = Buffer.from('\r\n')
        if (terminalSize + buffer.length > 2 || !terminal.subarray(terminalSize, terminalSize + buffer.length).equals(buffer)) {
          reject(400, 'CONFIRMING_MULTIPART_INVALID', 'No se admiten datos tras el cierre multipart.')
        }
        terminalSize += buffer.length; buffer = Buffer.alloc(0); return
      }
    }
  }
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > CONFIRMING_BODY_MAX_BYTES) reject(413, 'CONFIRMING_BODY_LIMIT', 'El cuerpo supera el límite de lectura manual.')
      buffer = Buffer.concat([buffer, Buffer.from(part.value)]); consume(false)
    }
    if (declared !== null && total !== Number(declared)) reject(400, 'CONFIRMING_CONTENT_LENGTH_MISMATCH', 'Content-Length no coincide con el cuerpo recibido.')
    consume(true)
    if (String(state) !== 'end' || terminalSize === 1 || !fileHeader || !fileSize) reject(400, 'CONFIRMING_MULTIPART_INVALID', 'Se requiere un archivo completo no vacío.')
    const file = { ...fileHeader, bytes: Buffer.concat(chunks, fileSize) }
    validateConfirmingDocumentosFile(file)
    return file
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally { reader.releaseLock() }
}

/** Preflight ZIP directory without expanding compressed content (zip-bomb fence). */
function validateXlsxDirectory(bytes: Buffer) {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) reject(415, 'CONFIRMING_FILE_HEADER_INVALID', 'XLSX no válido.')
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12)
  let at = bytes.readUInt32LE(end + 16), expanded = 0
  if (count < 1 || count > 2048 || bytes.readUInt16LE(end + 8) !== count || at + size !== end) reject(413, 'CONFIRMING_WORKBOOK_LIMIT', 'La estructura XLSX supera los límites del lector.')
  const names = new Set<string>()
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) reject(415, 'CONFIRMING_FILE_HEADER_INVALID', 'Directorio XLSX no válido.')
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10)
    const unpacked = bytes.readUInt32LE(at + 24), nameSize = bytes.readUInt16LE(at + 28)
    const next = at + 46 + nameSize + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
    if (next > end || (flags & 1) || ![0, 8].includes(method) || bytes.readUInt16LE(at + 34) !== 0) reject(415, 'CONFIRMING_FILE_HEADER_INVALID', 'XLSX cifrado o estructura no admitida.')
    expanded += unpacked
    if (expanded > MAX_EXPANDED_XLSX_BYTES) reject(413, 'CONFIRMING_WORKBOOK_LIMIT', 'El contenido expandido XLSX supera 25 MiB.')
    const name = bytes.subarray(at + 46, at + 46 + nameSize).toString('utf8')
    if (names.has(name)) reject(415, 'CONFIRMING_FILE_HEADER_INVALID', 'Entradas XLSX duplicadas.')
    names.add(name); at = next
  }
  if (at !== end || !names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) reject(415, 'CONFIRMING_FILE_HEADER_INVALID', 'El archivo ZIP no es un libro XLSX.')
}

export function validateConfirmingDocumentosFile(file: ConfirmingManualFile): void {
  if (extensionFor(file.nombre) !== file.extension) reject(415, 'CONFIRMING_EXTENSION_INVALID', 'Extensión de archivo incoherente.')
  if (!file.bytes.length || file.bytes.length > CONFIRMING_FILE_MAX_BYTES) reject(413, 'CONFIRMING_FILE_LIMIT', 'Se requiere un archivo no vacío de hasta 4 MiB.')
  const valid = file.extension === 'pdf' ? file.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
    : file.extension === 'xls' ? file.bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
      : file.bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  if (!valid) reject(415, 'CONFIRMING_FILE_HEADER_INVALID', 'La cabecera binaria no corresponde a la extensión del archivo.')
  if (file.extension === 'xlsx') validateXlsxDirectory(file.bytes)
}

const amount = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const positiveNominal = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

/** Uses the real native BBVA/Caixa parser on bytes; no AI, provider, DB or file writes. */
export async function leerConfirmingDocumento(file: ConfirmingManualFile): Promise<ConfirmingDocumentoLectura> {
  validateConfirmingDocumentosFile(file)
  if (detectarTipoConfirming(file.nombre) === 'unknown') reject(422, 'CONFIRMING_FORMAT_UNKNOWN', 'El parser nativo no reconoce el formato. El nombre debe identificar Confirming BBVA o Confirming Caixa; no se infiere un banco.')
  // PDF.js bundled by pdf-parse 1.1 can inspect a Buffer's entire backing store.
  // Its internal Buffer clone/slice also pools small documents. Native PDF paths
  // only need byte-array/hash semantics: a plain Uint8Array prevents slab parsing.
  const bytes = file.extension === 'pdf' ? new Uint8Array(file.bytes) as unknown as Buffer : file.bytes
  let pdfText: string | null = null
  try {
    if (file.extension === 'pdf') {
      const pdf = await pdfParse(bytes, { max: 81 })
      if (pdf.numpages > 80 || pdf.text.length > 1024 * 1024) reject(413, 'CONFIRMING_DOCUMENT_LIMIT', 'El PDF supera los límites del lector manual.')
      pdfText = pdf.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase()
    } else {
      const book = XLSX.read(bytes, { type: 'buffer', sheetRows: MAX_LINES + 2 })
      if (!book.SheetNames.length || book.SheetNames.length > 16) reject(413, 'CONFIRMING_WORKBOOK_LIMIT', 'Número de hojas no admitido.')
      for (const name of book.SheetNames) {
        const sheet = book.Sheets[name]
        const ref = sheet['!fullref'] ?? sheet['!ref']
        if (ref) {
          const range = XLSX.utils.decode_range(ref)
          if (range.e.r > MAX_LINES || range.e.c > 127) reject(413, 'CONFIRMING_WORKBOOK_LIMIT', 'La hoja supera 10.000 líneas o 128 columnas.')
        }
      }
    }
    const parsed = await parseConfirmingFile(bytes, file.nombre)
    if (!parsed) reject(422, 'CONFIRMING_FORMAT_UNKNOWN', 'Formato no reconocido por el parser nativo.')
    if (parsed.lineas.length > MAX_LINES) reject(413, 'CONFIRMING_DOCUMENT_LIMIT', 'El documento supera el límite de líneas.')
    let tipoDocumento = parsed.tipoDocumento ?? 'NO_CLASIFICADO'
    // The native BBVA dispatcher historically falls back to liquidation. A filename
    // alone is never evidence of liquidation in this documentary-only projection.
    if (parsed.banco === 'BBVA' && tipoDocumento === 'LIQUIDACION' && !/LIQUIDACIO[N]?\s+DE\s+BESTRETES|LIQUIDACION\s+DE\s+ANTICIPOS/.test(pdfText ?? '')) tipoDocumento = 'NO_CLASIFICADO'
    const xls = file.extension !== 'pdf'
    const lineas: ConfirmingDocumentoLinea[] = parsed.lineas.map(line => ({
      factura: line.numFactura, nominal: positiveNominal(line.importe),
      intereses: amount(line.intereses), comision: amount(line.comision),
      netoDetalleSinIva: xls ? amount(line.importeNeto) : null,
      fechaFactura: line.fechaFactura ?? null, fechaPago: line.fechaPago ?? null,
      fechaVencimiento: line.fechaVencimiento ?? null, procedencia: line.procedencia ?? parsed.procedencia?.lineas ?? null,
    }))
    const nominalCompleto = lineas.length > 0 && lineas.every(line => line.nominal !== null)
    const nominal = xls || tipoDocumento === 'AVISO_CESION'
      ? nominalCompleto ? positiveNominal(parsed.totalRemesa) : null
      : positiveNominal(parsed.totalRemesa)
    const liquidacion = !xls && tipoDocumento === 'LIQUIDACION'
    const importes = {
      nominal, intereses: liquidacion ? amount(parsed.totalIntereses) : null,
      comision: liquidacion ? amount(parsed.totalComisiones) : null,
      ivaComision: liquidacion ? amount(parsed.totalIvaComision) : null,
      netoBancario: liquidacion ? amount(parsed.netoBancario) : null,
      deducciones: liquidacion ? amount(parsed.totalDeducir) : null,
      netoDetalleXlsSinIva: xls && lineas.length > 0 && lineas.every(line => line.netoDetalleSinIva !== null) ? amount(parsed.totalNetoXlsSinIva) : null,
    }
    let cuadre: ConfirmingCuadre = parsed.cuadre ?? { estado: 'NO_VERIFICABLE' }
    if (tipoDocumento === 'AVISO_CESION' || tipoDocumento === 'NO_CLASIFICADO') cuadre = { estado: 'NO_APLICA' }
    else if (xls || importes.nominal === null || (liquidacion && [importes.intereses, importes.comision, importes.ivaComision, importes.netoBancario].includes(null))) {
      cuadre = { ...cuadre, estado: cuadre.estado === 'DESCUADRE' && !xls ? 'DESCUADRE' : 'NO_VERIFICABLE' }
    }
    if (importes.nominal === null && liquidacion) {
      const { diferenciaDeducirCentimos } = cuadre
      cuadre = { estado: diferenciaDeducirCentimos !== undefined && diferenciaDeducirCentimos !== 0 ? 'DESCUADRE' : 'NO_VERIFICABLE', diferenciaDeducirCentimos }
    }
    const avisos = ['Lectura manual temporal en memoria. El archivo no se ha archivado ni persistido.', 'El análisis documental no confirma cobros, no marca facturas pagadas y no crea ni modifica lotes C11.']
    if (tipoDocumento === 'AVISO_CESION') avisos.push('Cesión de créditos: no es una liquidación ni acredita un abono bancario.')
    if (xls) avisos.push('XLS/XLSX Caixa: sólo detalle de facturas. Requiere el PDF bancario para revisar la liquidación; no se infieren IVA, deducciones ni neto bancario del detalle.')
    if (!lineas.length) avisos.push(parsed.banco === 'CaixaBank' && liquidacion ? 'El PDF Caixa contiene resumen; el detalle de facturas se revisa por separado en XLS/XLSX.' : 'No se han recuperado líneas nominales verificables.')
    if (nominal === null || lineas.some(line => line.nominal === null)) avisos.push('Nominal no disponible o detalle incompleto: no se sustituye por cero ni se presenta un total parcial como completo.')
    if (liquidacion && Object.entries(importes).some(([key, value]) => key !== 'netoDetalleXlsSinIva' && value === null)) avisos.push('Faltan conceptos explícitos en el documento. Los campos ausentes permanecen no disponibles; no se calculan por diferencia ni por porcentaje.')
    if (tipoDocumento === 'NO_CLASIFICADO') avisos.push('No se ha acreditado el tipo documental por contenido. El nombre del archivo no convierte un documento en liquidación.')
    if (cuadre.estado === 'DESCUADRE') avisos.push('Existen diferencias documentales en céntimos; requieren revisión humana.')
    if (cuadre.estado === 'CUADRA') avisos.push('Cuadre aritmético documental únicamente: no implica cobro confirmado, factura pagada ni elegibilidad C11.')
    return {
      schema: 'CONFIRMING_DOCUMENTO_LECTURA_V1', lecturaManual: true, stagingOnly: true,
      archivo: { nombre: file.nombre, extension: file.extension, bytes: file.bytes.length, sha256: parsed.sourceHash ?? null },
      banco: parsed.banco, tipoDocumento, procedencia: parsed.procedencia ?? null,
      fechaDocumento: parsed.fechaDocumento ?? null, fechaLiquidacion: parsed.fechaLiquidacion ?? null,
      importes, lineas, avisos, cuadre, confirmable: false, archivado: false, persistido: false,
      efectos: { businessWrites: 0, imports: 0, cobrosConfirmados: 0, facturasMarcadasPagadas: 0 },
    }
  } catch (error) {
    if (error instanceof ConfirmingDocumentosError) throw error
    // Never leak parser raw text, invoice data, stack traces or provider configuration.
    reject(422, 'CONFIRMING_PARSE_FAILED', 'No se pudo leer el archivo con el parser nativo. No se ha archivado ni confirmado ningún cobro.')
  }
}
