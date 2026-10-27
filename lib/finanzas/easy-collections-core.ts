import { createHash } from 'node:crypto'

export const EASY_COLLECTIONS_MAX_ITEMS = 25
/** El ensayo real de staging mantuvo este máximo con margen antes de los 60 segundos de ruta. */
export const EASY_COLLECTIONS_MAX_BLOCK_ITEMS = 12
export const EASY_COLLECTIONS_MAX_OFFSET = 10_000
export const EASY_COLLECTIONS_MAX_QUERY = 120
export const EASY_COLLECTIONS_MAX_LINES = 40
export const EASY_COLLECTIONS_METHODS = [
  'REMESA_VENCIMIENTO', 'REMESA_UNION', 'REMESA_RESIDUO', 'REF_FACTURA',
  'REF_FACTURA_PARCIAL', 'COBRO_ISP', 'CLIENTE_IMPORTE', 'SUMA_CLIENTE',
  'CONFIRMING_C9', 'TRASPASO_PROPIO', 'DEVOLUCION_RECIBO',
] as const
export const EASY_COLLECTIONS_LEVELS = ['EXACTA', 'REVISAR'] as const
export const EASY_COLLECTIONS_STATES = ['JUSTIFICADO', 'NO_REQUIERE'] as const
export const EASY_COLLECTIONS_DOCUMENT_TYPES = ['FACTURA_EMITIDA', 'REMESA'] as const
export const EASY_COLLECTIONS_DIFFERENCE_REASONS = ['COMISION', 'INTERESES', 'IVA_COMISION', 'REDONDEO'] as const

export type EasyCollectionMethod = typeof EASY_COLLECTIONS_METHODS[number]
export type EasyCollectionLevel = typeof EASY_COLLECTIONS_LEVELS[number]
export type EasyCollectionState = typeof EASY_COLLECTIONS_STATES[number]
export type EasyCollectionDocumentType = typeof EASY_COLLECTIONS_DOCUMENT_TYPES[number]
export type EasyCollectionDifferenceReason = typeof EASY_COLLECTIONS_DIFFERENCE_REASONS[number]
export type EasyCollectionLine =
  | Readonly<{ tipo: 'DOCUMENTO'; tipoDocumento: EasyCollectionDocumentType; sourceId: string; importeCentimos: number }>
  | Readonly<{ tipo: 'DIFERENCIA'; motivoDiferencia: EasyCollectionDifferenceReason; importeCentimos: number }>
export type EasyCollectionFingerprintInput = Readonly<{
  v: 1
  movimientoId: string
  movimientoParId: string | null
  importeMovimientoCentimos: number
  metodo: EasyCollectionMethod
  nivel: EasyCollectionLevel
  estadoPropuesto: EasyCollectionState
  motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO' | null
  lineas: readonly EasyCollectionLine[]
}>
export type EasyCollectionPreviewInput = Readonly<{
  nivel: 'EXACTA' | 'REVISAR' | 'TODAS'
  metodo?: EasyCollectionMethod
  q?: string
  limit: number
  offset: number
}>
export type EasyCollectionSelection = Readonly<{ propuestaId: string; movimientoId: string; fingerprint: string }>
export type EasyCollectionConfirmCommand = Readonly<{
  action: 'confirmar_bloque'
  confirmacion: true
  idempotencyKey: string
  previewToken: string
  items: readonly EasyCollectionSelection[]
}>
export type EasyCollectionUndoCommand = Readonly<{
  action: 'deshacer_bloque'
  confirmacion: true
  idempotencyKey: string
  bloqueId: string
}>
export type EasyCollectionCommand = EasyCollectionConfirmCommand | EasyCollectionUndoCommand

export class EasyCollectionsValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}
const fail = (status: number, code: string, message: string): never => { throw new EasyCollectionsValidationError(status, code, message) }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^[a-f0-9]{64}$/
const CENTS_MIN = -2_147_483_648
const CENTS_MAX = 2_147_483_647

type RecordValue = Record<string, unknown>
function record(value: unknown, message = 'La solicitud no es válida.'): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(400, 'VALIDATION_ERROR', message)
  return value as RecordValue
}
function exactKeys(value: unknown, keys: readonly string[], message = 'La solicitud contiene campos no admitidos.'): RecordValue {
  const row = record(value)
  const actual = Object.keys(row)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))) fail(400, 'VALIDATION_ERROR', message)
  return row
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value as string
}
function opaqueMovementId(value: unknown, field: string): string { return text(value, field, 160) }
function uuid(value: unknown, field: string): string {
  const parsed = text(value, field, 64).toLowerCase()
  if (!UUID.test(parsed)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return parsed
}
function cents(value: unknown, field: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < CENTS_MIN || (value as number) > CENTS_MAX || (!allowZero && value === 0)) fail(400, 'VALIDATION_ERROR', `${field} debe ser un importe entero de céntimos válido.`)
  return value as number
}
function oneOf<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value as T[number]
}

/** JSON canónico compatible byte por byte con json.dumps(..., sort_keys=True, separators=(',', ':'), ensure_ascii=False). */
function pythonUnicodeKeyOrder(left: string, right: string): number {
  // Array#sort compara UTF-16; Python compara puntos de código Unicode. Para
  // claves que contienen caracteres suplementarios ambos órdenes pueden diferir.
  const a = Array.from(left), b = Array.from(right), length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const delta = a[index].codePointAt(0)! - b[index].codePointAt(0)!
    if (delta !== 0) return delta
  }
  return a.length - b.length
}
export function canonicalEasyCollectionsJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalEasyCollectionsJson).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as RecordValue
    return `{${Object.keys(row).sort(pythonUnicodeKeyOrder).map(key => `${JSON.stringify(key)}:${canonicalEasyCollectionsJson(row[key])}`).join(',')}}`
  }
  const rendered = JSON.stringify(value)
  if (rendered === undefined) throw new Error('EASY_COLLECTIONS_CANONICAL_UNSUPPORTED')
  return rendered
}
export function easyCollectionsDigest(value: unknown): string {
  return createHash('sha256').update(canonicalEasyCollectionsJson(value), 'utf8').digest('hex')
}

/** Comprueba y normaliza el JSON append-only antes de usarlo en una confirmación B4. */
export function parseEasyCollectionLines(raw: unknown, importeMovimientoCentimos: number, estadoPropuesto: EasyCollectionState, motivoNoRequiere: string | null): readonly EasyCollectionLine[] {
  if (!Array.isArray(raw) || raw.length > EASY_COLLECTIONS_MAX_LINES) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'Las líneas de una propuesta ya no son válidas.')
  const seenDocuments = new Set<string>()
  const entries = raw as unknown[]
  const lines: EasyCollectionLine[] = entries.map((entry, index) => {
    const row = record(entry, 'Las líneas de una propuesta ya no son válidas.')
    const tipo = row.tipo
    if (tipo === 'DOCUMENTO') {
      exactKeys(row, ['tipo', 'tipoDocumento', 'sourceId', 'importeCentimos'], 'Las líneas de una propuesta ya no son válidas.')
      const tipoDocumento = oneOf(row.tipoDocumento, EASY_COLLECTIONS_DOCUMENT_TYPES, `lineas[${index}].tipoDocumento`)
      const sourceId = text(row.sourceId, `lineas[${index}].sourceId`, 160)
      if (tipoDocumento === 'REMESA' && !/^\d+$/.test(sourceId)) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La remesa indicada en una propuesta ya no es válida.')
      const importeCentimos = cents(row.importeCentimos, `lineas[${index}].importeCentimos`)
      const key = `${tipoDocumento}:${sourceId}`
      if (seenDocuments.has(key)) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'Una propuesta no puede repetir el mismo documento.')
      seenDocuments.add(key)
      return { tipo: 'DOCUMENTO', tipoDocumento, sourceId, importeCentimos }
    }
    if (tipo === 'DIFERENCIA') {
      exactKeys(row, ['tipo', 'motivoDiferencia', 'importeCentimos'], 'Las líneas de una propuesta ya no son válidas.')
      return { tipo: 'DIFERENCIA', motivoDiferencia: oneOf(row.motivoDiferencia, EASY_COLLECTIONS_DIFFERENCE_REASONS, `lineas[${index}].motivoDiferencia`), importeCentimos: cents(row.importeCentimos, `lineas[${index}].importeCentimos`) }
    }
    fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'Las líneas de una propuesta ya no son válidas.')
  })
  const sum = lines.reduce((total, line) => total + line.importeCentimos, 0)
  if (!Number.isSafeInteger(sum)) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La suma de una propuesta no es válida.')
  if (estadoPropuesto === 'NO_REQUIERE') {
    if (motivoNoRequiere !== 'TRASPASO_INTERNO_SIN_DOCUMENTO' || lines.length !== 0) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La propuesta sin documento ya no es válida.')
  } else {
    if (motivoNoRequiere !== null || !lines.some(line => line.tipo === 'DOCUMENTO') || sum !== importeMovimientoCentimos) fail(409, 'PROPUESTA_INTEGRA_INVALIDA', 'La propuesta ya no cierra exactamente con el movimiento.')
  }
  return lines
}

export function easyCollectionFingerprint(input: EasyCollectionFingerprintInput): string {
  return easyCollectionsDigest({
    v: 1,
    movimientoId: input.movimientoId,
    movimientoParId: input.movimientoParId,
    importeMovimientoCentimos: input.importeMovimientoCentimos,
    metodo: input.metodo,
    nivel: input.nivel,
    estadoPropuesto: input.estadoPropuesto,
    motivoNoRequiere: input.motivoNoRequiere,
    lineas: input.lineas,
  })
}

export function methodLabel(metodo: EasyCollectionMethod): string {
  const labels: Record<EasyCollectionMethod, string> = {
    REMESA_VENCIMIENTO: 'Remesa de recibos',
    REMESA_UNION: 'Remesa de recibos (varios vencimientos)',
    REMESA_RESIDUO: 'Resto de una remesa de recibos',
    REF_FACTURA: 'Nº de factura en el concepto',
    REF_FACTURA_PARCIAL: 'Pago parcial de la factura citada',
    COBRO_ISP: 'Cobro anotado en ISP Gestión',
    CLIENTE_IMPORTE: 'Mismo cliente e importe',
    SUMA_CLIENTE: 'Varias facturas del mismo cliente',
    CONFIRMING_C9: 'Confirming de Draxton',
    TRASPASO_PROPIO: 'Traspaso entre cuentas propias',
    DEVOLUCION_RECIBO: 'Devolución de un recibo',
  }
  return labels[metodo]
}

export type EasyCollectionSelectionFacts = Readonly<{
  importeMovimientoCentimos: number
  metodo: EasyCollectionMethod
  nivel: EasyCollectionLevel
  estadoPropuesto: EasyCollectionState
  movimientoParId: string | null
  parValido: boolean
}>
/** Regla visible. La transacción vuelve a evaluar todos estos datos con los bloqueos puestos. */
export function easyCollectionSelection(facts: EasyCollectionSelectionFacts): { seleccionable: boolean; motivoNoSeleccionable: string | null } {
  if (facts.estadoPropuesto === 'JUSTIFICADO' && facts.importeMovimientoCentimos < 0) return { seleccionable: false, motivoNoSeleccionable: 'Los cargos justificados necesitan un archivo controlado y no se pueden confirmar desde esta lista.' }
  if (facts.metodo === 'TRASPASO_PROPIO') {
    return facts.importeMovimientoCentimos > 0 && !!facts.movimientoParId && facts.parValido
      ? { seleccionable: true, motivoNoSeleccionable: null }
      : { seleccionable: false, motivoNoSeleccionable: 'El traspaso ya no tiene dos movimientos opuestos entre cuentas distintas.' }
  }
  if (facts.estadoPropuesto !== 'JUSTIFICADO') return { seleccionable: false, motivoNoSeleccionable: 'Sólo los traspasos entre cuentas propias pueden quedar sin documento en esta lista.' }
  if (facts.importeMovimientoCentimos <= 0) return { seleccionable: false, motivoNoSeleccionable: 'Sólo se pueden confirmar cobros desde esta lista.' }
  return { seleccionable: true, motivoNoSeleccionable: facts.nivel === 'REVISAR' ? 'Esta propuesta sólo se puede confirmar de una en una.' : null }
}

export function assertEasyCollectionBlockSelection(items: readonly EasyCollectionSelectionFacts[]): void {
  if (!items.length || items.length > EASY_COLLECTIONS_MAX_BLOCK_ITEMS) fail(400, 'VALIDATION_ERROR', 'Selecciona entre una y doce propuestas.')
  if (items.length > 1 && items.some(item => item.nivel !== 'EXACTA')) fail(409, 'SELECCION_CAMBIADA', 'Las propuestas que requieren revisión sólo se pueden confirmar de una en una.')
  for (const item of items) {
    const allowed = easyCollectionSelection(item)
    if (!allowed.seleccionable) fail(409, 'SELECCION_CAMBIADA', allowed.motivoNoSeleccionable ?? 'Una propuesta ya no se puede confirmar.')
  }
}

export function parseEasyCollectionsPreviewInput(raw: Readonly<Record<string, string | null | undefined>>): EasyCollectionPreviewInput {
  const allowed = ['nivel', 'metodo', 'q', 'limit', 'offset']
  if (Object.keys(raw).some(key => !allowed.includes(key))) fail(400, 'VALIDATION_ERROR', 'La consulta contiene campos no admitidos.')
  const nivelRaw = raw.nivel ?? 'EXACTA'
  if (nivelRaw !== 'EXACTA' && nivelRaw !== 'REVISAR' && nivelRaw !== 'TODAS') fail(400, 'VALIDATION_ERROR', 'El nivel no es válido.')
  const methodRaw = raw.metodo
  const metodo = methodRaw === undefined || methodRaw === null || methodRaw === '' ? undefined : oneOf(methodRaw, EASY_COLLECTIONS_METHODS, 'El método')
  const qRaw = raw.q
  const q = qRaw === undefined || qRaw === null || qRaw === '' ? undefined : qRaw.trim()
  if (q !== undefined && (!q || q.length > EASY_COLLECTIONS_MAX_QUERY)) fail(400, 'VALIDATION_ERROR', 'La búsqueda no es válida.')
  const limitRaw = raw.limit ?? '25', offsetRaw = raw.offset ?? '0'
  if (!/^\d{1,2}$/.test(limitRaw) || !/^\d{1,5}$/.test(offsetRaw)) fail(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  const limit = Number(limitRaw), offset = Number(offsetRaw)
  if (!Number.isInteger(limit) || limit < 1 || limit > EASY_COLLECTIONS_MAX_ITEMS || !Number.isInteger(offset) || offset < 0 || offset > EASY_COLLECTIONS_MAX_OFFSET) fail(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  return { nivel: nivelRaw as EasyCollectionPreviewInput['nivel'], ...(metodo ? { metodo } : {}), ...(q ? { q } : {}), limit, offset }
}

function parseSelection(raw: unknown): readonly EasyCollectionSelection[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > EASY_COLLECTIONS_MAX_BLOCK_ITEMS) fail(400, 'VALIDATION_ERROR', 'Selecciona entre una y doce propuestas.')
  const seenMovements = new Set<string>(), seenProposals = new Set<string>()
  const selected = (raw as unknown[]).map((value, index) => {
    const row = exactKeys(value, ['propuestaId', 'movimientoId', 'fingerprint'])
    const propuestaId = uuid(row.propuestaId, `items[${index}].propuestaId`)
    const movimientoId = opaqueMovementId(row.movimientoId, `items[${index}].movimientoId`)
    const fingerprint = text(row.fingerprint, `items[${index}].fingerprint`, 64)
    if (!HEX.test(fingerprint) || seenMovements.has(movimientoId) || seenProposals.has(propuestaId)) fail(400, 'VALIDATION_ERROR', 'La selección contiene propuestas repetidas o no válidas.')
    seenMovements.add(movimientoId); seenProposals.add(propuestaId)
    return { propuestaId, movimientoId, fingerprint }
  })
  return [...selected].sort((left, right) => left.movimientoId.localeCompare(right.movimientoId) || left.propuestaId.localeCompare(right.propuestaId))
}

export function parseEasyCollectionsCommand(value: unknown): EasyCollectionCommand {
  const raw = record(value)
  if (raw.action === 'confirmar_bloque') {
    const input = exactKeys(raw, ['action', 'confirmacion', 'idempotencyKey', 'previewToken', 'items'])
    if (input.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'Confirma el bloque antes de continuar.')
    const previewToken = text(input.previewToken, 'previewToken', 24_000)
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(previewToken)) fail(400, 'VALIDATION_ERROR', 'La previsualización no es válida.')
    return { action: 'confirmar_bloque', confirmacion: true, idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'), previewToken, items: parseSelection(input.items) }
  }
  if (raw.action === 'deshacer_bloque') {
    const input = exactKeys(raw, ['action', 'confirmacion', 'idempotencyKey', 'bloqueId'])
    if (input.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'Confirma que quieres deshacer el bloque.')
    return { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'), bloqueId: uuid(input.bloqueId, 'bloqueId') }
  }
  fail(400, 'VALIDATION_ERROR', 'La acción no es válida.')
}

export function easyCollectionsRequestHash(actorId: number, command: EasyCollectionCommand): string {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) fail(400, 'VALIDATION_ERROR', 'El usuario no es válido.')
  return easyCollectionsDigest({ schema: 'EASY_COLLECTIONS_V1', actorId, command })
}
