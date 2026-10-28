export const CONCILIAR_TABS = ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'] as const
export const CONCILIAR_COLORS = ['VERDE', 'AMBAR', 'ROJO'] as const
export const CONCILIAR_EMITIDAS_GROUPS = ['CON_PROPUESTA', 'PARA_REVISAR', 'SIN_PROPUESTA'] as const
export const CONCILIAR_MAX_LIMIT = 100
export const CONCILIAR_MAX_OFFSET = 100_000
export const CONCILIAR_MAX_QUERY = 120
export const CONCILIAR_MAX_ITEMS = 100
export const CONCILIAR_SCHEMA = 'CONCILIAR_V1' as const
export const CONCILIAR_DEFAULT_CUTOFF = '2026-01-01' as const

export type ConciliarTab = typeof CONCILIAR_TABS[number]
export type ConciliarColor = typeof CONCILIAR_COLORS[number]
export type ConciliarEmitidasGroup = typeof CONCILIAR_EMITIDAS_GROUPS[number]
export type ConciliarAction = 'confirmar' | 'deshacer' | 'pedir'

export type ConciliarDocument = Readonly<{
  referencia: string
  tercero: string | null
  importeCentimos: number
  fecha: string | null
  href: string | null
}>

export type ConciliarMovementLink = Readonly<{ id: string; href: string; etiqueta: string }>

export type ConciliarRow = Readonly<{
  id: string
  movimientoId: string | null
  fecha: string
  concepto: string
  banco: string | null
  cuenta: string | null
  importeCentimos: number
  pendienteCentimos: number
  color: ConciliarColor
  grupo: string | null
  motivo: string
  documento: ConciliarDocument | null
  propuesta: string | null
  seleccionable: boolean
  diferenciaCentimos: number
  linksMovimiento?: readonly ConciliarMovementLink[]
  detail: string | null
  decisionHash: string
}>

export type ConciliarTabSummary = Readonly<{
  tab: ConciliarTab
  count: number
  amountCentimos: number
  colors: Record<ConciliarColor, { count: number; amountCentimos: number }>
}>

export type ConciliarGetInput = Readonly<{
  tab: ConciliarTab
  desde?: string
  hasta?: string
  cuentaId?: string
  q?: string
  cutoffDate?: string
  historic?: boolean
  emitidasGrupo?: ConciliarEmitidasGroup
  limit: number
  offset: number
}>

/** Una vista normalizada sólo sirve para devolver la foto posterior exacta.
 * No participa en la decisión financiera ni identifica fuentes de cobro. */
export type ConciliarResponseView = ConciliarGetInput

export type ConciliarConfirmItem = Readonly<{ id: string; decisionHash: string }>
export type ConciliarConfirmCommand = Readonly<{
  action: 'confirmar'
  idempotencyKey: string
  items: readonly ConciliarConfirmItem[]
  responseView?: ConciliarResponseView
}>
export type ConciliarUndoCommand = Readonly<{
  action: 'deshacer'
  operationId: string
  idempotencyKey: string
  responseView?: ConciliarResponseView
}>
export type ConciliarAskCommand = Readonly<{
  action: 'pedir'
  id: string
  decisionHash: string
  idempotencyKey: string
  responseView?: ConciliarResponseView
}>
export type ConciliarCommand = ConciliarConfirmCommand | ConciliarUndoCommand | ConciliarAskCommand

/** Datos de fuente persistidos en la proyección; nunca se reciben del navegador. */
export type ConciliarProjectionSource = Readonly<{
  kind: 'COBRO_PROPUESTA' | 'COBRO_CONFIRMING' | 'PAGO_FACTURA_RECIBIDA' | 'PAGO_NOMINA' | 'COMISION_BANCARIA' | 'PENDIENTE_FACTURA_EMITIDA' | 'TRANSFERENCIA_PROPIA'
  movimientoId?: string
  movimientoParId?: string
  transferFingerprint?: string
  propuestaId?: string
  proposalFingerprint?: string
  proposalCompositionHash?: string
  remesaId?: number
  confirmingId?: string
  confirmingSourceHash?: string
  facturaEmitidaId?: string
  facturaRecibidaId?: string
  nominaId?: string
  versionB4?: number
  remesaIds?: readonly number[]
}>

export type ConciliarProjectionPayload = Readonly<{
  row: Omit<ConciliarRow, 'decisionHash'>
  source: ConciliarProjectionSource
  sourceFingerprint: string
}>

export class ConciliarValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
function fail(status: number, code: string, message: string): never { throw new ConciliarValidationError(status, code, message) }

type JsonRecord = Record<string, unknown>
function object(value: unknown, message = 'La solicitud no es válida.'): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'VALIDATION_ERROR', message)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(400, 'VALIDATION_ERROR', message)
  return value as JsonRecord
}
function exactKeys(value: unknown, keys: readonly string[]): JsonRecord {
  const row = object(value)
  const actual = Object.keys(row)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))) {
    fail(400, 'VALIDATION_ERROR', 'La solicitud contiene campos no admitidos.')
  }
  return row
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.length > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value
}
function uuid(value: unknown, field: string): string {
  const parsed = text(value, field, 64).toLowerCase()
  if (!UUID.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}
function day(value: string | null | undefined, field: string): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (!DAY.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe usar YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'VALIDATION_ERROR', `${field} no es una fecha válida.`)
  return value
}
function positiveInteger(value: string, field: string, min: number, max: number): number {
  if (!/^\d{1,6}$/.test(value)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}

function responseView(raw: unknown): ConciliarResponseView {
  const value = object(raw, 'responseView no es válida.')
  const allowed = ['tab', 'desde', 'hasta', 'cuentaId', 'q', 'limit', 'offset', 'cutoffDate', 'historic', 'emitidasGrupo']
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'VALIDATION_ERROR', 'responseView contiene campos no admitidos.')
  if (typeof value.tab !== 'string' || typeof value.limit !== 'number' || typeof value.offset !== 'number'
    || typeof value.cutoffDate !== 'string' || typeof value.historic !== 'boolean') {
    fail(400, 'VALIDATION_ERROR', 'responseView no conserva una vista normalizada.')
  }
  const strings: Record<string, string | null | undefined> = {
    tab: value.tab,
    desde: value.desde === undefined ? undefined : typeof value.desde === 'string' ? value.desde : null,
    hasta: value.hasta === undefined ? undefined : typeof value.hasta === 'string' ? value.hasta : null,
    cuentaId: value.cuentaId === undefined ? undefined : typeof value.cuentaId === 'string' ? value.cuentaId : null,
    q: value.q === undefined ? undefined : typeof value.q === 'string' ? value.q : null,
    cutoffDate: value.cutoffDate,
    historic: value.historic ? '1' : '0',
    emitidasGrupo: value.emitidasGrupo === undefined ? undefined : typeof value.emitidasGrupo === 'string' ? value.emitidasGrupo : null,
    limit: String(value.limit),
    offset: String(value.offset),
  }
  if ((value.desde !== undefined && strings.desde === null) || (value.hasta !== undefined && strings.hasta === null)
    || (value.cuentaId !== undefined && strings.cuentaId === null) || (value.q !== undefined && strings.q === null)
    || (value.emitidasGrupo !== undefined && strings.emitidasGrupo === null)
    || !Number.isSafeInteger(value.limit) || !Number.isSafeInteger(value.offset)) {
    fail(400, 'VALIDATION_ERROR', 'responseView no conserva una vista normalizada.')
  }
  return parseConciliarGetInput(strings)
}

function commandKeys(root: JsonRecord, required: readonly string[]): JsonRecord {
  const allowed = [...required, 'responseView']
  const actual = Object.keys(root)
  if (actual.some(key => !allowed.includes(key)) || required.some(key => !Object.prototype.hasOwnProperty.call(root, key))) {
    fail(400, 'VALIDATION_ERROR', 'La solicitud contiene campos no admitidos.')
  }
  return root
}

export function parseConciliarGetInput(raw: Readonly<Record<string, string | null | undefined>>): ConciliarGetInput {
  const allowed = ['tab', 'desde', 'hasta', 'cuentaId', 'q', 'limit', 'offset', 'cutoffDate', 'historic', 'emitidasGrupo']
  if (Object.keys(raw).some(key => !allowed.includes(key))) fail(400, 'VALIDATION_ERROR', 'La consulta contiene campos no admitidos.')
  const tab = raw.tab ?? 'COBROS'
  if (!(CONCILIAR_TABS as readonly string[]).includes(tab)) fail(400, 'VALIDATION_ERROR', 'La pestaña no es válida.')
  const desde = day(raw.desde, 'desde'), hasta = day(raw.hasta, 'hasta')
  if (desde && hasta && desde > hasta) fail(400, 'VALIDATION_ERROR', 'desde no puede ser posterior a hasta.')
  const cutoffDate = day(raw.cutoffDate, 'cutoffDate') ?? CONCILIAR_DEFAULT_CUTOFF
  if (raw.historic != null && raw.historic !== '' && raw.historic !== '0' && raw.historic !== '1') fail(400, 'VALIDATION_ERROR', 'La opción de facturas anteriores no es válida.')
  const historic = raw.historic === '1'
  if (historic && tab !== 'EMITIDAS') fail(400, 'VALIDATION_ERROR', 'Las facturas anteriores sólo se consultan en Emitidas.')
  const emitidasGrupo = raw.emitidasGrupo === null || raw.emitidasGrupo === undefined || raw.emitidasGrupo === '' ? undefined : raw.emitidasGrupo
  if (emitidasGrupo !== undefined && !(CONCILIAR_EMITIDAS_GROUPS as readonly string[]).includes(emitidasGrupo)) fail(400, 'VALIDATION_ERROR', 'El grupo de Emitidas no es válido.')
  if (emitidasGrupo !== undefined && tab !== 'EMITIDAS') fail(400, 'VALIDATION_ERROR', 'El grupo sólo se puede consultar en Emitidas.')
  if (historic && emitidasGrupo !== undefined) fail(400, 'VALIDATION_ERROR', 'Las facturas anteriores no se pueden filtrar por grupo.')
  const cuentaId = raw.cuentaId === null || raw.cuentaId === undefined || raw.cuentaId === '' ? undefined : text(raw.cuentaId, 'cuentaId', 160)
  const q = raw.q === null || raw.q === undefined || raw.q === '' ? undefined : raw.q.trim()
  if (q !== undefined && (!q || q.length > CONCILIAR_MAX_QUERY)) fail(400, 'VALIDATION_ERROR', 'La búsqueda no es válida.')
  const limit = positiveInteger(raw.limit ?? '50', 'limit', 1, CONCILIAR_MAX_LIMIT)
  const offset = positiveInteger(raw.offset ?? '0', 'offset', 0, CONCILIAR_MAX_OFFSET)
  return { tab: tab as ConciliarTab, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}), ...(cuentaId ? { cuentaId } : {}), ...(q ? { q } : {}), ...(emitidasGrupo ? { emitidasGrupo: emitidasGrupo as ConciliarEmitidasGroup } : {}), cutoffDate, historic, limit, offset }
}

function parseConfirmItems(raw: unknown): readonly ConciliarConfirmItem[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > CONCILIAR_MAX_ITEMS) fail(400, 'VALIDATION_ERROR', `Selecciona entre una y ${CONCILIAR_MAX_ITEMS} filas.`)
  const ids = new Set<string>()
  const parsed = raw.map((entry, index) => {
    const value = exactKeys(entry, ['id', 'decisionHash'])
    const id = text(value.id, `items[${index}].id`, 240)
    const decisionHash = text(value.decisionHash, `items[${index}].decisionHash`, 64).toLowerCase()
    if (!SHA256.test(decisionHash) || ids.has(id)) fail(400, 'VALIDATION_ERROR', 'La selección contiene filas repetidas o no válidas.')
    ids.add(id)
    return { id, decisionHash }
  })
  return parsed.sort((left, right) => left.id.localeCompare(right.id))
}

export function parseConciliarCommand(raw: unknown): ConciliarCommand {
  const root = object(raw)
  if (root.action === 'confirmar') {
    const value = commandKeys(root, ['action', 'idempotencyKey', 'items'])
    return { action: 'confirmar', idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey'), items: parseConfirmItems(value.items), ...(value.responseView === undefined ? {} : { responseView: responseView(value.responseView) }) }
  }
  if (root.action === 'deshacer') {
    const value = commandKeys(root, ['action', 'operationId', 'idempotencyKey'])
    return { action: 'deshacer', operationId: uuid(value.operationId, 'operationId'), idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey'), ...(value.responseView === undefined ? {} : { responseView: responseView(value.responseView) }) }
  }
  if (root.action === 'pedir') {
    const value = commandKeys(root, ['action', 'id', 'decisionHash', 'idempotencyKey'])
    const decisionHash = text(value.decisionHash, 'decisionHash', 64).toLowerCase()
    if (!SHA256.test(decisionHash)) fail(400, 'VALIDATION_ERROR', 'decisionHash no es válido.')
    return { action: 'pedir', id: text(value.id, 'id', 240), decisionHash, idempotencyKey: uuid(value.idempotencyKey, 'idempotencyKey'), ...(value.responseView === undefined ? {} : { responseView: responseView(value.responseView) }) }
  }
  fail(400, 'VALIDATION_ERROR', 'La acción no es válida.')
}

/** Normaliza sin perder los dígitos significativos de año/serie. No elimina sufijos numéricos. */
export function normalizarReferenciaFactura(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES').replace(/[^A-Z0-9]/g, '')
  if (!normalized || normalized.length > 120 || !/[0-9]/.test(normalized)) return null
  return normalized.replace(/^F(?=\d)/, '')
}

/** Referencias citadas de forma explícita; no se usa una coincidencia por subcadena. */
export function referenciasFacturaCitadas(textoBanco: unknown): readonly string[] {
  if (typeof textoBanco !== 'string') return []
  const normalized = textoBanco.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  const result = new Set<string>()
  // Every match is one syntactic identifier, not the rest of the concept. This
  // preserves meaningful year/series digits (F2600082023) and permits multiple
  // explicit invoice references in a single transfer.
  const explicit = /(?:^|[^A-Z0-9])(?:FACTURA|FACT\.?|FRA\.?|F)\s*(?:N(?:U)?M(?:ERO)?\s*)?[-#:/. ]*([A-Z]{0,6}\s*\d{2,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(explicit)) {
    const reference = normalizarReferenciaFactura(match[1])
    if (reference && reference.length >= 4) result.add(reference)
  }
  // Bank exports commonly omit FACTURA but keep an issuer-like alphabetic series
  // (INST26/68, ZOOM26/2, DRAX26/94). A pure numeric token is deliberately not
  // a reference: dates, amounts and remittance numbers must not make a document
  // look verified. REMESA/RECIBO tokens are semantic bank grouping references,
  // not invoice series.
  const bare = /(?:^|[^A-Z0-9])([A-Z]{2,12}\s*\d{2,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(bare)) {
    const raw = match[1].replace(/\s+/g, '')
    // FACTURA 260007 ya se extrajo como 260007 arriba. FACTURA no es una
    // segunda serie emisora; no debe convertir una referencia exacta en empate.
    if (/^(?:REMESA|RECIBO|SUBREMESA|FACTURA|FACT|FRA|NUMERO|NUM)\d/.test(raw)) continue
    const reference = normalizarReferenciaFactura(raw)
    if (reference && reference.length >= 4) result.add(reference)
  }
  return [...result].sort()
}

export function referenciaFacturaCompatible(textoBanco: unknown, referenciaDocumento: unknown): boolean {
  const cited = referenciasFacturaCitadas(textoBanco)
  if (!cited.length) return true
  const documentReference = normalizarReferenciaFactura(referenciaDocumento)
  return documentReference !== null && cited.every(reference => reference === documentReference)
}

export function evaluarDocumentoExacto(input: Readonly<{
  importeBancoCentimos: number
  importeDocumentoCentimos: number
  fechaBanco: string
  fechaDocumento: string | null
  conceptoBanco: string
  referenciaDocumento: string
  unicoTercero: boolean
}>): { color: ConciliarColor; seleccionable: boolean; diferenciaCentimos: number; motivo: string } {
  const difference = input.importeBancoCentimos - input.importeDocumentoCentimos
  if (!Number.isSafeInteger(difference)) return { color: 'ROJO', seleccionable: false, diferenciaCentimos: 0, motivo: 'El importe no se puede comprobar con seguridad.' }
  if (difference !== 0) return { color: 'AMBAR', seleccionable: false, diferenciaCentimos: difference, motivo: 'El importe del banco no coincide exactamente con el documento.' }
  if (input.fechaDocumento === null) return { color: 'AMBAR', seleccionable: false, diferenciaCentimos: 0, motivo: 'Falta la fecha verificable del documento.' }
  if (input.fechaDocumento > input.fechaBanco) return { color: 'AMBAR', seleccionable: false, diferenciaCentimos: 0, motivo: 'La fecha del documento es posterior al movimiento bancario.' }
  if (!referenciaFacturaCompatible(input.conceptoBanco, input.referenciaDocumento)) {
    return { color: 'AMBAR', seleccionable: false, diferenciaCentimos: 0, motivo: 'El número de factura citado por el banco no coincide con el documento propuesto.' }
  }
  if (!input.unicoTercero) return { color: 'AMBAR', seleccionable: false, diferenciaCentimos: 0, motivo: 'Hay más de una contraparte posible; revísala antes de confirmar.' }
  return { color: 'VERDE', seleccionable: true, diferenciaCentimos: 0, motivo: 'Importe, fecha y referencia del documento coinciden.' }
}

export function textoSeguro(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1_000) || fallback : fallback
}

export function isConciliarBankFee(input: Readonly<{ importeCentimos: number; concepto: string | null; referencia?: string | null; infoAdicional?: string | null; tercero?: string | null; banco: string | null }>): boolean {
  if (!Number.isSafeInteger(input.importeCentimos) || input.importeCentimos >= 0 || !textoSeguro(input.banco)) return false
  const text = [input.concepto, input.referencia, input.infoAdicional, input.tercero].map(value => textoSeguro(value)).join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  if (/\b(?:POS|TPV|TARJETA|CARD|VISA|MASTERCARD|AMEX|INTERES(?:ES)?|INTEREST|PRESTAMO|CREDITO|LEASING|FINANCIACION|COMPRA)\b/.test(text)) return false
  if (/\b(?:COMISION(?:ES)?|LIQUIDACION\s+POR\s+EMISION|GASTOS?\s+DE\s+DEVOLUCION|CUOTA(?:S)?\s+(?:DE\s+)?MANTENIMIENTO)\b/.test(text) === false) return false
  if (/\b(?:COMISION(?:ES)?|GASTOS?\s+DE\s+DEVOLUCION|CUOTA(?:S)?|LIQUIDACION\s+POR\s+EMISION)\s*(?:DE\s+)?[:=]?\s*0(?:[,.]0+)?(?![\d,.])\b/.test(text)) return false
  return true
}

export function redReasonForMovement(input: Readonly<{ importeCentimos: number; concepto: string; tarjeta: boolean }>): string {
  const text = input.concepto.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  if (input.tarjeta || /\b(?:TARJETA|VISA|MASTERCARD|AMEX|TPV|POS)\b/.test(text)) return 'Falta el ticket o la factura de la tarjeta.'
  if (/\b(?:AEAT|HACIENDA|TGSS|SEGURIDAD\s+SOCIAL|MODELO\s*\d{2,3})\b/.test(text)) return 'Falta el justificante del modelo o del organismo.'
  if (/\b(?:PRESTAMO|LEASING|CUOTA\s+PRESTAMO)\b/.test(text)) return 'Falta el cuadro de amortización.'
  if (/\b(?:DEVOLUCION|DEVUELTO)\b/.test(text) && input.importeCentimos < 0) return 'Hay una devolución de recibo: reclama o revisa el cliente antes de conciliar.'
  return input.importeCentimos < 0 ? 'Falta la factura o el justificante del proveedor.' : 'Falta el documento que explica este cobro.'
}
