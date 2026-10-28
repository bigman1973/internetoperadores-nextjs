import { createHash } from 'node:crypto'

export const EASY_AUTO_POLICY_KEY = 'MODO_FACIL_AUTO_RESTRINGIDA_STAGING_20261024' as const
export const EASY_AUTO_DATA_FROM = '2026-01-01' as const
export const EASY_AUTO_DATA_UNTIL = '2026-10-08' as const
export const EASY_AUTO_ORIGIN = 'REGLA' as const
export const EASY_AUTO_MAX_LIMIT = 100

export type EasyAutoClass = 'TRASPASO_PROPIO' | 'COMISION_BANCARIA'
export type EasyAutoReason = 'TRASPASO_INTERNO_SIN_DOCUMENTO' | 'COMISION_BANCARIA'

export class EasyAutoValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

function fail(status: number, code: string, message: string): never {
  throw new EasyAutoValidationError(status, code, message)
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value)) fail(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const received = Object.keys(value)
  if (received.length !== keys.length || received.some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail(400, 'VALIDATION_ERROR', 'El cuerpo contiene claves fuera del contrato de automatización restringida.')
  }
  return value
}

function isoDay(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe usar YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'VALIDATION_ERROR', `${field} no es una fecha válida.`)
  return value
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value as number
}

function uuidV4(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail(400, 'VALIDATION_ERROR', `${field} debe ser un UUID v4.`)
  }
  return value.toLowerCase()
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return `{${Object.keys(source).sort().map(key => `${JSON.stringify(key)}:${canonical(source[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export function sha256Canonical(value: unknown): string { return sha256(canonical(value)) }

/**
 * Adapter único para importes legacy Float/Numeric ya serializados por PostgreSQL
 * como `::text`. Nunca recibe un number y nunca redondea.
 */
export function centsFromExactSqlText(value: unknown, field: string, allowZero = false): number {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no contiene un decimal SQL exacto de hasta dos posiciones.`)
  }
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [wholeText, decimal = ''] = unsigned.split('.')
  const cents = BigInt(wholeText) * BigInt(100) + BigInt((decimal + '00').slice(0, 2))
  const signed = negative ? -cents : cents
  if (signed < BigInt(-2147483648) || signed > BigInt(2147483647) || (!allowZero && signed === BigInt(0))) {
    fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no contiene céntimos B4 no nulos dentro de rango.`)
  }
  return Number(signed)
}

export function normalizeEasyAutoText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  return normalized.length > 0 && normalized.length <= 300 ? normalized : null
}

function dayNumber(day: string): number {
  const parsed = new Date(`${day}T00:00:00.000Z`)
  return Math.trunc(parsed.getTime() / 86_400_000)
}
export function calendarDistanceDays(left: string, right: string): number {
  return Math.abs(dayNumber(left) - dayNumber(right))
}

export type EasyAutoMovement = Readonly<{
  id: string
  cuentaId: string
  fecha: string
  importeCentimos: number
  versionB4: number
  concepto: string | null
  referencia: string | null
  infoAdicional: string | null
  tercero: string | null
  /** Campo estable de CuentaBancaria, no texto libre de MovimientoBancario. */
  bancoCuenta: string | null
}>

export type EasyAutoTransferCandidate = Readonly<{
  clase: 'TRASPASO_PROPIO'
  origen: typeof EASY_AUTO_ORIGIN
  fingerprint: string
  movimientos: readonly [EasyAutoMovement, EasyAutoMovement]
  motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO'
  controles: readonly string[]
}>

export type EasyAutoCommissionCandidate = Readonly<{
  clase: 'COMISION_BANCARIA'
  origen: typeof EASY_AUTO_ORIGIN
  fingerprint: string
  movimientos: readonly [EasyAutoMovement]
  motivoNoRequiere: 'COMISION_BANCARIA'
  /** Banco cobrador derivado del registro de la cuenta, nunca de m.tercero. */
  bancoCobradorNormalizado: string
  controles: readonly string[]
}>

export type EasyAutoCandidate = EasyAutoTransferCandidate | EasyAutoCommissionCandidate

function movementText(movement: EasyAutoMovement): string {
  return [movement.concepto, movement.referencia, movement.infoAdicional, movement.tercero]
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
    .replace(/\s+/g, ' ').trim()
}

/** A transfer label is additional fail-closed evidence, never a fuzzy identity. */
export function hasTransferBankCue(movement: EasyAutoMovement): boolean {
  return /\b(?:TRASPASO|TRANSFERENCIA(?:\s+INTERNA)?|TRANSF\.?|ENTRE\s+CUENTAS)\b/.test(movementText(movement))
}

function pairFingerprint(left: EasyAutoMovement, right: EasyAutoMovement): string {
  const movements = [left, right].sort((a, b) => a.id.localeCompare(b.id))
  return sha256Canonical({
    schema: 'EASY_AUTO_TRANSFER_V2', origin: EASY_AUTO_ORIGIN,
    movements: movements.map(item => ({ id: item.id, cuentaId: item.cuentaId, fecha: item.fecha, importeCentimos: item.importeCentimos, versionB4: item.versionB4 })),
  })
}

/**
 * Selects only a one-to-one, signed-zero, 0..3 calendar-day pair. A member with
 * two possible counterparts is excluded, rather than selected by amount/order.
 * Account ownership and exact-balance-chain evidence are checked by the DB layer.
 */
export function selectBilateralTransfers(movements: readonly EasyAutoMovement[]): EasyAutoTransferCandidate[] {
  // Eligibility is immutable within this invocation. Do not normalize the same
  // bank text for every possible pair; preserve source order and duplicates.
  const eligible = movements.filter(movement => movement && Number.isSafeInteger(movement.importeCentimos)
    && movement.importeCentimos !== 0 && hasTransferBankCue(movement))
  const possible: Array<readonly [EasyAutoMovement, EasyAutoMovement]> = []
  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    const left = eligible[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const right = eligible[rightIndex]
      if (left.cuentaId === right.cuentaId || left.importeCentimos + right.importeCentimos !== 0) continue
      if (calendarDistanceDays(left.fecha, right.fecha) > 3) continue
      possible.push([left, right])
    }
  }
  const degrees = new Map<string, number>()
  for (const [left, right] of possible) {
    degrees.set(left.id, (degrees.get(left.id) ?? 0) + 1)
    degrees.set(right.id, (degrees.get(right.id) ?? 0) + 1)
  }
  return possible
    .filter(([left, right]) => degrees.get(left.id) === 1 && degrees.get(right.id) === 1)
    .map(([rawLeft, rawRight]) => {
      const pair = [rawLeft, rawRight].sort((left, right) => left.id.localeCompare(right.id)) as [EasyAutoMovement, EasyAutoMovement]
      return {
        clase: 'TRASPASO_PROPIO' as const,
        origen: EASY_AUTO_ORIGIN,
        fingerprint: pairFingerprint(pair[0], pair[1]),
        movimientos: pair,
        motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO' as const,
        controles: ['CUENTAS_PROPIAS_ATESTADAS', 'CENTIMOS_FIRMADOS_SUMAN_CERO', 'VENTANA_CALENDARIO_0_A_3_DIAS', 'UNIDAD_BILATERAL', 'PISTA_BANCARIA_TRASPASO', 'CADENA_SALDOS_AMBAS_CUENTAS'],
      }
    })
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
}

export function isPureBankCommission(movement: EasyAutoMovement): boolean {
  if (movement.importeCentimos >= 0) return false
  const text = movementText(movement)
  if (!/\bCOMISION(?:ES)?\b/.test(text)) return false
  // No reconocer sólo el prefijo entero «0» de una comisión no nula (0,60).
  if (/\bCOMISION(?:ES)?\s*(?:DE\s+)?[:=]?\s*0(?:[,.]0+)?(?![\d,.])\b/.test(text)) return false
  // A card/POS purchase, interest or financing fee is economically distinct and
  // cannot become an automatic bank-account commission merely by containing words.
  if (/\b(?:POS|TPV|TARJETA|CARD|VISA|MASTERCARD|AMEX|INTERES(?:ES)?|INTEREST|PRESTAMO|CREDITO|LEASING|FINANCIACION|COMPRA)\b/.test(text)) return false
  return true
}

/**
 * Pure bank commissions intentionally need neither bilateral transfer proof nor
 * account-ownership attestation. Their P1 counterparty is the tested `banco` on
 * CuentaBancaria, not `m.tercero` and not a legacy EntidadFiscal association.
 */
export function selectPureBankCommissions(movements: readonly EasyAutoMovement[]): EasyAutoCommissionCandidate[] {
  const candidates: EasyAutoCommissionCandidate[] = []
  for (const movement of movements) {
    const banco = normalizeEasyAutoText(movement.bancoCuenta)
    if (!banco || !isPureBankCommission(movement)) continue
    candidates.push({
      clase: 'COMISION_BANCARIA', origen: EASY_AUTO_ORIGIN,
      fingerprint: sha256Canonical({ schema: 'EASY_AUTO_COMMISSION_V2', origin: EASY_AUTO_ORIGIN, movimiento: { id: movement.id, cuentaId: movement.cuentaId, fecha: movement.fecha, importeCentimos: movement.importeCentimos, versionB4: movement.versionB4 }, bancoCuenta: banco }),
      movimientos: [movement], motivoNoRequiere: 'COMISION_BANCARIA', bancoCobradorNormalizado: banco,
      controles: ['CUENTA_BANCARIA_ACTIVA', 'BANCO_COBRADOR_DERIVADO_DE_CUENTA', 'TEXTO_COMISION_PURA', 'SIN_CADENA_BILATERAL_NI_ATESTACION_DE_TITULARIDAD', 'EXCLUSION_POS_TARJETA_INTERES_PRESTAMO_COMISION_CERO'],
    })
  }
  return candidates.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
}

export function autoCommissionSourceIdentity(movement: EasyAutoMovement, bancoCobradorNormalizado: string): string {
  return `EASY_AUTO_CUENTA_BANCO_V1:${movement.cuentaId}:${bancoCobradorNormalizado}`
}

export function autoTransferSourceIdentity(receiptId: string, oppositeAccountId: string): string {
  return `EASY_AUTO_TRASPASO_CUENTA_PROPIA_V1:${receiptId}:${oppositeAccountId}`
}

/**
 * A balance row represents a directed exact edge: saldoAntes = saldo - importe
 * and saldoDespues = saldo. There is no inferred database row order. Same-day
 * edges can be ordered only when these values form one unique path.
 */
export type EasyAutoBalanceRow = Readonly<{
  id: string
  cuentaId: string
  fecha: string
  importeCentimos: number | null
  saldoCentimos: number | null
}>

export type EasyAutoBalanceEvidenceCode =
  | 'SALDO_NO_EXACTO_O_AUSENTE'
  | 'CADENA_SALDO_SIN_VECINDARIO'
  | 'CADENA_SALDO_AMBIGUA'
  | 'CADENA_SALDO_CICLICA'

export type EasyAutoBalanceEvidence = Readonly<{ ok: boolean; code: EasyAutoBalanceEvidenceCode | null }>

type ExactBalanceEdge = Readonly<{
  id: string
  cuentaId: string
  fecha: string
  before: number
  after: number
}>

function exactBalanceEdge(row: EasyAutoBalanceRow): ExactBalanceEdge | null {
  if (!row.id || !row.cuentaId || !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) return null
  if (!Number.isSafeInteger(row.importeCentimos) || !Number.isSafeInteger(row.saldoCentimos)) return null
  const before = row.saldoCentimos - row.importeCentimos
  if (!Number.isSafeInteger(before)) return null
  return { id: row.id, cuentaId: row.cuentaId, fecha: row.fecha, before, after: row.saldoCentimos }
}

/**
 * Proves only the component touching a requested transfer leg. It requires one
 * exact predecessor and successor for that leg, then walks the connected path to
 * reject a branch or a cycle. A malformed row elsewhere in the account is not a
 * reason to block the local proof; a malformed same-day row is, because its
 * intraday position cannot be assumed.
 */
export function proveLocalBalanceNeighborhoods(
  rows: readonly EasyAutoBalanceRow[],
  movementIds: readonly string[],
): ReadonlyMap<string, EasyAutoBalanceEvidence> {
  const requested = new Set(movementIds)
  const byId = new Map<string, EasyAutoBalanceRow>()
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row)
    else byId.set(row.id, { ...row, importeCentimos: null, saldoCentimos: null })
  }
  const edgesByAccount = new Map<string, ExactBalanceEdge[]>()
  for (const row of byId.values()) {
    const edge = exactBalanceEdge(row)
    if (!edge) continue
    const list = edgesByAccount.get(edge.cuentaId) ?? []
    list.push(edge)
    edgesByAccount.set(edge.cuentaId, list)
  }
  const result = new Map<string, EasyAutoBalanceEvidence>()
  for (const movementId of requested) {
    const source = byId.get(movementId)
    const edge = source ? exactBalanceEdge(source) : null
    if (!source || !edge) {
      result.set(movementId, { ok: false, code: 'SALDO_NO_EXACTO_O_AUSENTE' })
      continue
    }
    // A no-balance row on the same calendar day has an unknown possible location;
    // accepting a local intraday ordering around it would fabricate evidence.
    const sameDayInvalid = [...byId.values()].some(row => row.cuentaId === edge.cuentaId && row.fecha === edge.fecha && exactBalanceEdge(row) === null)
    if (sameDayInvalid) {
      result.set(movementId, { ok: false, code: 'SALDO_NO_EXACTO_O_AUSENTE' })
      continue
    }
    const accountEdges = edgesByAccount.get(edge.cuentaId) ?? []
    const predecessors = (current: ExactBalanceEdge) => accountEdges.filter(item => item.id !== current.id && item.after === current.before && item.fecha <= current.fecha)
    const successors = (current: ExactBalanceEdge) => accountEdges.filter(item => item.id !== current.id && item.before === current.after && item.fecha >= current.fecha)
    const immediatePrevious = predecessors(edge)
    const immediateNext = successors(edge)
    if (immediatePrevious.length === 0 || immediateNext.length === 0) {
      result.set(movementId, { ok: false, code: 'CADENA_SALDO_SIN_VECINDARIO' })
      continue
    }
    if (immediatePrevious.length !== 1 || immediateNext.length !== 1) {
      result.set(movementId, { ok: false, code: 'CADENA_SALDO_AMBIGUA' })
      continue
    }
    let failure: EasyAutoBalanceEvidenceCode | null = null
    const visitedForward = new Set<string>()
    let forward: ExactBalanceEdge | undefined = edge
    while (forward) {
      if (visitedForward.has(forward.id)) { failure = 'CADENA_SALDO_CICLICA'; break }
      visitedForward.add(forward.id)
      const next = successors(forward)
      if (next.length > 1) { failure = 'CADENA_SALDO_AMBIGUA'; break }
      forward = next[0]
    }
    const visitedBackward = new Set<string>()
    let backward: ExactBalanceEdge | undefined = edge
    while (!failure && backward) {
      if (visitedBackward.has(backward.id)) { failure = 'CADENA_SALDO_CICLICA'; break }
      visitedBackward.add(backward.id)
      const previous = predecessors(backward)
      if (previous.length > 1) { failure = 'CADENA_SALDO_AMBIGUA'; break }
      backward = previous[0]
    }
    // Arithmetic equality must not jump an intervening bank row. All rows in
    // the local predecessor/leg/successor calendar window must belong to the
    // unique connected path; unknown or disconnected rows break the proof.
    if (!failure) {
      const pathIds = new Set([...visitedForward, ...visitedBackward])
      const from = immediatePrevious[0].fecha
      const until = immediateNext[0].fecha
      for (const row of byId.values()) {
        if (row.cuentaId !== edge.cuentaId || row.fecha < from || row.fecha > until) continue
        if (exactBalanceEdge(row) === null) { failure = 'SALDO_NO_EXACTO_O_AUSENTE'; break }
        if (!pathIds.has(row.id)) { failure = 'CADENA_SALDO_AMBIGUA'; break }
      }
    }
    result.set(movementId, failure ? { ok: false, code: failure } : { ok: true, code: null })
  }
  return result
}

export type EasyAutoPreviewInput = Readonly<{ action: 'previsualizar'; desde: string; hasta: string; limite: number }>
export type EasyAutoExecuteInput = Readonly<{ action: 'ejecutar'; desde: string; hasta: string; limite: number; idempotencyKey: string; reviewHash: string; confirmacion: true }>
export type EasyAutoUndoInput = Readonly<{ action: 'deshacer'; operationId: string; idempotencyKey: string; confirmacion: true }>
export type EasyAutoRegisterPolicyInput = Readonly<{ action: 'registrar_politica'; confirmacion: true; referenciaAutorizacion: string }>
/** A single selected account only. The confirmation is evidence supplied by an
 * authorized human; policy activation never grants ownership automatically. */
export type EasyAutoAccountAttestationInput = Readonly<{
  action: 'atestiguar_cuenta'
  cuentaId: string
  titularDeclarado: string
  cifTitular?: string
  referenciaEvidencia: string
  confirmacionTitularidadIo: true
  confirmacion: true
}>
export type EasyAutoInput = EasyAutoPreviewInput | EasyAutoExecuteInput | EasyAutoUndoInput | EasyAutoRegisterPolicyInput | EasyAutoAccountAttestationInput

type WindowAction = 'previsualizar' | 'ejecutar'
function windowFrom<A extends WindowAction>(value: Record<string, unknown>, action: A): Readonly<{ action: A; desde: string; hasta: string; limite: number }> {
  const desde = isoDay(value.desde, 'desde')
  const hasta = isoDay(value.hasta, 'hasta')
  if (desde !== EASY_AUTO_DATA_FROM || hasta !== EASY_AUTO_DATA_UNTIL) {
    fail(422, 'VENTANA_POLITICA_RESTRINGIDA', `La automatización sólo admite ${EASY_AUTO_DATA_FROM} a ${EASY_AUTO_DATA_UNTIL}.`)
  }
  return { action, desde, hasta, limite: integer(value.limite, 'limite', 1, EASY_AUTO_MAX_LIMIT) }
}

export function parseEasyAutoInput(raw: unknown): EasyAutoInput {
  if (!record(raw) || typeof raw.action !== 'string') fail(400, 'VALIDATION_ERROR', 'action es obligatoria.')
  if (raw.action === 'previsualizar') return windowFrom(exactKeys(raw, ['action', 'desde', 'hasta', 'limite']), 'previsualizar')
  if (raw.action === 'ejecutar') {
    const value = exactKeys(raw, ['action', 'desde', 'hasta', 'limite', 'idempotencyKey', 'reviewHash', 'confirmacion'])
    if (value.confirmacion !== true || typeof value.reviewHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.reviewHash)) fail(422, 'CONFIRMACION_REQUERIDA', 'ejecutar exige confirmacion:true y reviewHash SHA-256.')
    return { ...windowFrom(value, 'ejecutar'), idempotencyKey: uuidV4(value.idempotencyKey, 'idempotencyKey'), reviewHash: value.reviewHash, confirmacion: true }
  }
  if (raw.action === 'deshacer') {
    const value = exactKeys(raw, ['action', 'operationId', 'idempotencyKey', 'confirmacion'])
    if (value.confirmacion !== true || typeof value.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.operationId)) fail(422, 'CONFIRMACION_REQUERIDA', 'deshacer exige operationId UUID y confirmacion:true.')
    return { action: 'deshacer', operationId: value.operationId.toLowerCase(), idempotencyKey: uuidV4(value.idempotencyKey, 'idempotencyKey'), confirmacion: true }
  }
  if (raw.action === 'registrar_politica') {
    const value = exactKeys(raw, ['action', 'confirmacion', 'referenciaAutorizacion'])
    if (value.confirmacion !== true || typeof value.referenciaAutorizacion !== 'string' || value.referenciaAutorizacion.trim().length < 12 || value.referenciaAutorizacion.trim().length > 300) {
      fail(422, 'CONFIRMACION_REQUERIDA', 'registrar_politica exige confirmacion:true y referencia de autorización acotada.')
    }
    return { action: 'registrar_politica', confirmacion: true, referenciaAutorizacion: value.referenciaAutorizacion.trim() }
  }
  if (raw.action === 'atestiguar_cuenta') {
    const keys = Object.keys(raw)
    const allowed = ['action', 'cuentaId', 'titularDeclarado', 'cifTitular', 'referenciaEvidencia', 'confirmacionTitularidadIo', 'confirmacion']
    if (keys.some(key => !allowed.includes(key)) || !['action', 'cuentaId', 'titularDeclarado', 'referenciaEvidencia', 'confirmacionTitularidadIo', 'confirmacion'].every(key => Object.prototype.hasOwnProperty.call(raw, key))) {
      fail(400, 'VALIDATION_ERROR', 'atestiguar_cuenta contiene claves fuera del contrato.')
    }
    if (typeof raw.cuentaId !== 'string' || raw.cuentaId.length < 1 || raw.cuentaId.length > 160) fail(400, 'VALIDATION_ERROR', 'cuentaId no es válido.')
    if (typeof raw.titularDeclarado !== 'string' || raw.titularDeclarado.trim().length < 3 || raw.titularDeclarado.trim().length > 300) fail(400, 'VALIDATION_ERROR', 'titularDeclarado no es válido.')
    if (raw.cifTitular !== undefined && (typeof raw.cifTitular !== 'string' || raw.cifTitular.trim().length < 5 || raw.cifTitular.trim().length > 32)) fail(400, 'VALIDATION_ERROR', 'cifTitular no es válido.')
    if (typeof raw.referenciaEvidencia !== 'string' || raw.referenciaEvidencia.trim().length < 12 || raw.referenciaEvidencia.trim().length > 500) fail(400, 'VALIDATION_ERROR', 'referenciaEvidencia no es válida.')
    if (raw.confirmacionTitularidadIo !== true || raw.confirmacion !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'La atestación exige ambas confirmaciones explícitas true.')
    return {
      action: 'atestiguar_cuenta', cuentaId: raw.cuentaId,
      titularDeclarado: raw.titularDeclarado.trim(), ...(typeof raw.cifTitular === 'string' ? { cifTitular: raw.cifTitular.trim() } : {}),
      referenciaEvidencia: raw.referenciaEvidencia.trim(), confirmacionTitularidadIo: true, confirmacion: true,
    }
  }
  fail(400, 'VALIDATION_ERROR', 'action no admitida para automatización restringida.')
}

export function reviewHash(policyId: string, candidates: readonly EasyAutoCandidate[]): string {
  return sha256Canonical({
    schema: 'EASY_AUTO_REVIEW_V2', policyId, origin: EASY_AUTO_ORIGIN,
    candidates: candidates.map(candidate => ({
      fingerprint: candidate.fingerprint, clase: candidate.clase,
      movimientos: candidate.movimientos.map(movement => ({ id: movement.id, versionB4: movement.versionB4, importeCentimos: movement.importeCentimos, fecha: movement.fecha, cuentaId: movement.cuentaId })),
    })).sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
  })
}

export function requestHash(actorId: number, input: EasyAutoExecuteInput | EasyAutoUndoInput): string {
  return sha256Canonical({ schema: 'EASY_AUTO_REQUEST_V2', actorId, input })
}

/** Deterministic internal key derived from an already validated external UUID. */
export function derivedUuidV4(namespace: string, value: string): string {
  const hash = sha256Canonical({ schema: 'EASY_AUTO_DERIVED_UUID_V1', namespace, value })
  const hex = `${hash.slice(0, 12)}4${hash.slice(13, 16)}${(['8', '9', 'a', 'b'][parseInt(hash.slice(16, 17), 16) % 4])}${hash.slice(17, 32)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
