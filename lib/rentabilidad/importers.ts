import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import * as XLSX from 'xlsx'
import { RentabilidadError, canonicalDecimal, moneyToCents, isoDate, normalizedName, sourceHash, type ImportPayload, type JsonRecord } from './types'

export type ImportFileKind = 'contracts' | 'lines' | 'costs' | 'references'
export type ImportPreview = { payload: ImportPayload; fileHash: string; leidas: number; validas: number; rechazadas: number; errores: { row: number; code: string }[] }
const MAX_FILE_BYTES = 40 * 1024 * 1024

/** RFC4180-style parser with multiline quoted cells. No eval, shell or formula execution. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const content = text.replace(/^\uFEFF/, '')
  const firstLine = content.split(/\r?\n/, 1)[0]
  const sep = delimiter ?? (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',')
  if (![',', ';', '\t'].includes(sep)) throw new RentabilidadError('INVALID_DELIMITER')
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (quoted) {
      if (char === '"') { if (content[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } }
      else cell += char
    } else if (char === '"') {
      if (cell.length || closed) throw new RentabilidadError('CSV_QUOTE_INVALID'); quoted = true
    } else if (char === sep) { row.push(cell); cell = ''; closed = false }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i++
      row.push(cell); if (row.some(value => value.trim())) rows.push(row)
      row = []; cell = ''; closed = false
    } else {
      if (closed && !/\s/.test(char)) throw new RentabilidadError('CSV_QUOTE_INVALID')
      if (!closed) cell += char
    }
  }
  if (quoted) throw new RentabilidadError('CSV_UNCLOSED_QUOTE')
  row.push(cell); if (row.some(value => value.trim())) rows.push(row)
  return rows
}
function header(value: unknown) { return normalizedName(String(value ?? '')).replace(/[^A-Z0-9]/g, '') }
function records(rows: unknown[][]): JsonRecord[] {
  const start = rows.findIndex(row => row.filter(cell => String(cell ?? '').trim()).length >= 3)
  if (start < 0) throw new RentabilidadError('IMPORT_HEADER_MISSING')
  const keys = rows[start].map(header)
  const nonEmpty = keys.filter(Boolean)
  if (new Set(nonEmpty).size !== nonEmpty.length) throw new RentabilidadError('DUPLICATED_HEADER')
  return rows.slice(start + 1).filter(row => row.some(cell => String(cell ?? '').trim())).map(row => Object.fromEntries(keys.filter(Boolean).map(key => [key, row[keys.indexOf(key)] ?? ''])))
}
function pick(row: JsonRecord, names: string[], optional = false): any {
  const candidates = names.map(header).map(key => row[key]).filter(value => value !== undefined && value !== null && String(value).trim() !== '')
  if (!candidates.length) { if (optional) return undefined; throw new RentabilidadError('REQUIRED_COLUMN_MISSING') }
  return candidates[0]
}
export function importDate(raw: unknown): string {
  if (typeof raw === 'number') {
    const parts = XLSX.SSF.parse_date_code(raw)
    if (!parts) throw new RentabilidadError('INVALID_DATE')
    return isoDate(`${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`)
  }
  const text = String(raw ?? '').trim()
  if (/^20\d{2}-\d{2}-\d{2}(?:T|\s)/.test(text)) return isoDate(text.slice(0, 10))
  const match = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})$/.exec(text)
  return match ? isoDate(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`) : isoDate(text)
}
export function importMoney(raw: unknown): string {
  return moneyToCents(importDecimal(raw))
}
export function importDecimal(raw: unknown): string {
  if (typeof raw === 'number') return canonicalDecimal(raw)
  let text = String(raw ?? '').trim().replace(/[€\s\u00a0]/g, '')
  if (text.includes(',')) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,40}$/.test(text)) throw new RentabilidadError('INVALID_MONEY')
    text = text.replace(/\./g, '').replace(',', '.')
  }
  return canonicalDecimal(text)
}
function period(raw: unknown): 1 | 3 | 6 | 12 | undefined {
  if (raw === undefined) return undefined
  const key = normalizedName(String(raw))
  const values: Record<string, 1 | 3 | 6 | 12> = { '1': 1, '3': 3, '6': 6, '12': 12, MENSUAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }
  if (!values[key]) throw new RentabilidadError('PERIODICITY_UNVERIFIED')
  return values[key]
}
export function normalizeImportRow(kind: ImportFileKind, row: JsonRecord): JsonRecord {
  if (kind === 'lines') {
    const fecha = importDate(pick(row, ['fecha', 'fecha factura', 'fecha facturacion', 'date']))
    return {
      codigoContratoIsp: String(pick(row, ['codigo contrato', 'cod contrato', 'contrato codigo', 'numero contrato', 'contratoid'])).trim(),
      fechaFuente: fecha, mesServicio: fecha.slice(0, 7), concepto: String(pick(row, ['concepto', 'concepto factura', 'descripcion'])).trim(),
      importeBaseCentimos: importMoney(pick(row, ['precio', 'precio base', 'importe base', 'base', 'importe'])),
      importeBaseExacto: importDecimal(pick(row, ['precio', 'precio base', 'importe base', 'base', 'importe'])),
      importeBaseLexema: String(pick(row, ['precio', 'precio base', 'importe base', 'base', 'importe'])),
      codigoCliente: String(pick(row, ['codigo cliente', 'codigo clientes', 'codigo', 'cod cliente'], true) ?? ''),
      nombreCliente: String(pick(row, ['nombre cliente', 'nombre clientes', 'nombre', 'cliente'], true) ?? ''),
      cif: String(pick(row, ['cif', 'nif', 'nifcif'], true) ?? ''),
      tarifa: String(pick(row, ['nombre tarifa', 'tarifa'], true) ?? ''),
      tipoTarifa: String(pick(row, ['tipo tarifa'], true) ?? ''),
      periodicidadOriginal: String(pick(row, ['periodicidad', 'periocidad forma pago'], true) ?? ''),
      titulo: String(pick(row, ['contrato', 'titulo'], true) ?? ''),
      source: 'LISTADO299_EXPORT',
      ...(pick(row, ['serie'], true) ? { serie: String(pick(row, ['serie'])) } : {}),
      ...(pick(row, ['numero factura', 'factura'], true) ? { numeroFactura: String(pick(row, ['numero factura', 'factura'])) } : {}),
    }
  }
  if (kind === 'contracts') {
    const result: JsonRecord = {
      codigoContratoIsp: String(pick(row, ['numero contrato', 'n contrato', 'nº contrato', 'contrato', 'codigo contrato'])).trim(), source: 'LORENA',
    }
    for (const [target, aliases] of Object.entries({ proveedor: ['proveedor', 'operador'], velocidadOriginal: ['velocidad', 'velocidad mb', 'mbps'], identificadorLineaOperador: ['identificador operador', 'identificador del operador', 'id operador', 'service id'], lineaAsociada: ['linea asociada', 'linea'], permanencia: ['permanencia'], tarifa: ['tarifa'], cif: ['dni/cif', 'cif'], nombreCliente: ['cliente'], descripcionSede: ['descripcion /ubicacion'], estadoOriginal: ['estado'] })) {
      const value = pick(row, aliases, true); if (value !== undefined) result[target] = value
    }
    if (result.velocidadOriginal !== undefined) {
      const text = String(result.velocidadOriginal).trim().toUpperCase()
      const speed = /^(\d+(?:[.,]\d+)?)\s*(MB(?:PS)?|GB(?:PS)?|M|G)?$/.exec(text)
      if (speed) result.velocidadBajadaMb = Number(speed[1].replace(',', '.')) * (speed[2]?.startsWith('G') ? 1000 : 1)
    }
    const price = pick(row, ['importe sin iva', 'importe (sin iva)', 'precio'], true)
    if (price !== undefined) { result.precioPeriodo = importDecimal(price); result.price = result.precioPeriodo; result.priceRaw = String(price) }
    const discount = pick(row, ['descuento'], true)
    if (discount !== undefined) { result.discount = importDecimal(discount); result.discountRaw = String(discount) }
    for (const [target, aliases] of Object.entries({ fechaAlta: ['fecha alta', 'alta'], fechaBaja: ['fecha baja', 'baja'] })) {
      const value = pick(row, aliases, true); if (value !== undefined) result[target] = importDate(value)
    }
    const units = period(pick(row, ['periodicidad', 'perioricidad'], true)); if (units) result.periodicidadMeses = units
    result.estado = result.fechaBaja ? 'BAJA' : 'ACTIVO'
    return result
  }
  throw new RentabilidadError('NORMALIZED_JSON_REQUIRED_FOR_COSTS_REFERENCES')
}
export async function previewImportFile(path: string, kind: ImportFileKind, sheetName?: string): Promise<ImportPreview> {
  const bytes = await readFile(path)
  if (bytes.length > MAX_FILE_BYTES) throw new RentabilidadError('IMPORT_FILE_TOO_LARGE')
  const suffix = extname(path).toLowerCase()
  let input: JsonRecord[]
  if (suffix === '.csv') input = records(parseCsv(bytes.toString('utf8')))
  else if (suffix === '.xlsx') {
    const book = XLSX.read(bytes, { type: 'buffer', cellDates: false, cellFormula: false, cellHTML: false })
    const selected = sheetName ?? book.SheetNames[0]
    if (!book.Sheets[selected]) throw new RentabilidadError('IMPORT_SHEET_NOT_FOUND')
    input = records(XLSX.utils.sheet_to_json(book.Sheets[selected], { header: 1, raw: true, defval: '' }))
  } else throw new RentabilidadError('IMPORT_FORMAT_UNSUPPORTED')
  const output: JsonRecord[] = []; const errores: { row: number; code: string }[] = []
  input.forEach((row, index) => {
    try { output.push(normalizeImportRow(kind, row)) }
    catch (error) { errores.push({ row: index + 2, code: error instanceof RentabilidadError ? error.code : 'INVALID_ROW' }) }
  })
  const fileHash = sourceHash({ format: suffix, bytesSha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex') })
  return { payload: { source: kind === 'contracts' ? 'LORENA' : 'LISTADO299_EXPORT', [kind]: output }, fileHash, leidas: input.length, validas: output.length, rechazadas: errores.length, errores }
}
