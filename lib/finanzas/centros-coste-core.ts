/*
 * Finanzas B8 — núcleo puro consolidado de centros de coste.
 *
 * Sin Prisma, red, entorno, UUID aleatorio ni E/S. Un centro es metadato
 * analítico explícito de una línea B4 DOCUMENTO; nunca integra identidad,
 * hash o snapshot económico de B4.
 */
import { createHash } from 'node:crypto'

export const B8_AREA_FINANZAS = 'admin.finanzas.conciliacion'
export const B8_AUDIT_SCHEMA_VERSION = 'B8_CENTROS_COSTE_V1'
export const B8_CHOICE_SCHEMA = 'B8_CENTRO_CHOICE_P2_V1'
export const B8_RECEIPT_SCHEMA = 'B8_CENTRO_RECEIPT_V1'
export const B8_NOT_SELECTED = 'notselected' as const
export const B8_SOURCE_NOTE_RULE = 'EXPLICIT_UI_SELECTION_ONLY'
export const B8_INT_MIN = -2_147_483_648
export const B8_INT_MAX = 2_147_483_647

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/i
const CODIGO = /^[A-Z0-9][A-Z0-9._/-]{0,63}$/
type JsonRecord = Record<string, unknown>

export type B8Error = Readonly<{ codigo: string; mensaje: string; ruta?: string }>
export type B8Result<T> = Readonly<{ ok: true; value: T } | { ok: false; errors: readonly B8Error[] }>
export type ActorFinanzas = Readonly<{ id: number; activo: boolean; rol: string }>
export type CentroCosteActual = Readonly<{ id: string; codigo: string; nombre: string; activo: boolean; version: number }>

export type ModoAsignacionCentroCoste = 'asignar' | 'desasignar'
export type AsignacionCentroCosteInput = Readonly<{
  mode: ModoAsignacionCentroCoste
  vinculoMovimientoDocumentoId: string
  centroCosteFinanzasId: string | null
  versionCentroCoste: number
  idempotencyKey: string
}>

export type TrazaLineaB8 = Readonly<{
  vinculoMovimientoDocumentoId: string
  movimientoId: string
  /** Added source identifier; absent legacy callers fail closed at DB source validation. */
  documentoConciliableId?: string | null
  tipoLinea: 'DOCUMENTO' | 'DIFERENCIA' | string
  vinculoActivo: boolean
  estadoMovimientoB4: 'JUSTIFICADO' | string | null
  operacionCreacionEstado: 'APLICADA' | string | null
  operacionCreacionRevertida: boolean
  todasOperacionesActivasAplicadas: boolean
  importeBancoCentimos: number | null
  cierreActualCentimos: number | null
  lineasDocumentoActuales: number
  versionCentroCosteActual: number
  centroCosteFinanzasIdActual: string | null
  payloadHashOperacionB4: string | null
}>

export type EvidenciaAnaliticaB8 = Readonly<{
  importeBancoCentimos: number | null
  cierreActualCentimos: number | null
  importeDocumentalCentimos: number
}>

export type ChoiceInput = Readonly<{
  /** Índice original de la línea DOCUMENTO en borrador.lineas; no se reenumera. */
  indiceLinea: number
  documentoConciliableId: string
  /** Ausente y null son exactamente «sin centro» al confirmar B4. */
  centroCosteFinanzasId?: string | null
}>
export type ChoiceCanonical = Readonly<{
  indiceLinea: number
  documentoConciliableId: string
  centroCosteFinanzasId: string | typeof B8_NOT_SELECTED
}>
export type ChoiceMappingForAudit = Readonly<{
  indiceLinea: number
  documentoConciliableId: string
  centroCosteFinanzasId: string | null
}>
export type PruebaActualB8 = Readonly<{
  operacionAplicadaNoRevertida: boolean
  estadoJustificado: boolean
  lineasDocumentoActivas: number
  todasOperacionesActivasAplicadas: boolean
  importeBancoCentimos: number | null
  cierreActualCentimos: number | null
  actualDocumentSourceGoal: boolean
}>
export type AlcanceConfirmacionB4ParaRecibo = Readonly<{
  estadoBorrador: 'JUSTIFICADO' | 'NO_REQUIERE'
}>

function own(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}
function isRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
function fail<T = never>(...errors: B8Error[]): B8Result<T> { return { ok: false, errors } }
function ok<T>(value: T): B8Result<T> { return { ok: true, value } }
function errorsOf<T>(result: B8Result<T>): readonly B8Error[] { return result.ok === true ? [] : result.errors }
function valueOf<T>(result: B8Result<T>): T {
  if (result.ok === false) throw new Error('B8_VALUE_REQUESTED_FROM_ERROR')
  return result.value
}
function requireExactKeys(value: unknown, keys: readonly string[], label: string): B8Result<JsonRecord> {
  if (!isRecord(value)) return fail({ codigo: 'OBJETO_INVALIDO', ruta: label, mensaje: `${label} debe ser un objeto JSON.` })
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !own(value, key))) {
    return fail({ codigo: 'CLAVES_INVALIDAS', ruta: label, mensaje: `${label} contiene claves fuera del contrato.` })
  }
  return ok(value)
}
function enteroNoNegativo(value: unknown, ruta: string): B8Result<number> {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > B8_INT_MAX) {
    return fail({ codigo: 'VERSION_INVALIDA', ruta, mensaje: `${ruta} debe ser un entero 0..${B8_INT_MAX}.` })
  }
  return ok(value as number)
}
function cadenaNoVacia(value: unknown, ruta: string, maximo: number): B8Result<string> {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximo) {
    return fail({ codigo: 'CADENA_INVALIDA', ruta, mensaje: `${ruta} debe ser una cadena no vacía de hasta ${maximo} caracteres.` })
  }
  return ok(value.trim())
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('B8_CANONICAL_NON_FINITE_NUMBER')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as JsonRecord
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('B8_CANONICAL_UNSUPPORTED_VALUE')
}
export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}
export function esHashSha256(value: unknown): value is string { return typeof value === 'string' && SHA256.test(value) }
export function uuidCanonico(value: unknown, ruta: string): B8Result<string> {
  if (typeof value !== 'string' || !UUID.test(value)) return fail({ codigo: 'UUID_INVALIDO', ruta, mensaje: `${ruta} debe ser un UUID canónico.` })
  return ok(value.toLowerCase())
}

export function normalizarCodigoCentroCoste(value: unknown): B8Result<string> {
  const parsed = cadenaNoVacia(value, 'codigo', 64)
  if (parsed.ok === false) return parsed
  const codigo = parsed.value.toUpperCase()
  if (!CODIGO.test(codigo)) return fail({ codigo: 'CODIGO_INVALIDO', ruta: 'codigo', mensaje: 'codigo sólo admite A-Z, 0-9, punto, guion, barra y guion bajo.' })
  return ok(codigo)
}
export function parseCrearCentroCoste(raw: unknown): B8Result<Readonly<{ codigo: string; nombre: string }>> {
  const exact = requireExactKeys(raw, ['codigo', 'nombre'], '$')
  if (exact.ok === false) return exact
  const codigo = normalizarCodigoCentroCoste(exact.value.codigo)
  const nombre = cadenaNoVacia(exact.value.nombre, 'nombre', 160)
  const errors = [...errorsOf(codigo), ...errorsOf(nombre)]
  return errors.length ? fail(...errors) : ok({ codigo: valueOf(codigo), nombre: valueOf(nombre) })
}
export function parseEditarCentroCoste(raw: unknown): B8Result<Readonly<{ id: string; version: number; codigo: string; nombre: string }>> {
  const exact = requireExactKeys(raw, ['mode', 'id', 'version', 'codigo', 'nombre'], '$')
  if (exact.ok === false) return exact
  if (exact.value.mode !== 'editar') return fail({ codigo: 'MODO_INVALIDO', ruta: 'mode', mensaje: 'mode debe ser editar.' })
  const id = uuidCanonico(exact.value.id, 'id')
  const version = enteroNoNegativo(exact.value.version, 'version')
  const codigo = normalizarCodigoCentroCoste(exact.value.codigo)
  const nombre = cadenaNoVacia(exact.value.nombre, 'nombre', 160)
  const errors = [...errorsOf(id), ...errorsOf(version), ...errorsOf(codigo), ...errorsOf(nombre)]
  return errors.length ? fail(...errors) : ok({ id: valueOf(id), version: valueOf(version), codigo: valueOf(codigo), nombre: valueOf(nombre) })
}
export function parseDesactivarCentroCoste(raw: unknown): B8Result<Readonly<{ id: string; version: number }>> {
  const exact = requireExactKeys(raw, ['mode', 'id', 'version'], '$')
  if (exact.ok === false) return exact
  if (exact.value.mode !== 'desactivar') return fail({ codigo: 'MODO_INVALIDO', ruta: 'mode', mensaje: 'mode debe ser desactivar.' })
  const id = uuidCanonico(exact.value.id, 'id')
  const version = enteroNoNegativo(exact.value.version, 'version')
  const errors = [...errorsOf(id), ...errorsOf(version)]
  return errors.length ? fail(...errors) : ok({ id: valueOf(id), version: valueOf(version) })
}
export function parseAsignacionCentroCoste(raw: unknown): B8Result<AsignacionCentroCosteInput> {
  const exact = requireExactKeys(raw, ['mode', 'vinculoMovimientoDocumentoId', 'centroCosteFinanzasId', 'versionCentroCoste', 'idempotencyKey'], '$')
  if (exact.ok === false) return exact
  const value = exact.value
  if (value.mode !== 'asignar' && value.mode !== 'desasignar') return fail({ codigo: 'MODO_INVALIDO', ruta: 'mode', mensaje: 'mode debe ser asignar o desasignar.' })
  const vinculo = uuidCanonico(value.vinculoMovimientoDocumentoId, 'vinculoMovimientoDocumentoId')
  const version = enteroNoNegativo(value.versionCentroCoste, 'versionCentroCoste')
  const key = uuidCanonico(value.idempotencyKey, 'idempotencyKey')
  const centro = value.centroCosteFinanzasId === null ? ok<string | null>(null) : uuidCanonico(value.centroCosteFinanzasId, 'centroCosteFinanzasId')
  const errors: B8Error[] = [...errorsOf(vinculo), ...errorsOf(version), ...errorsOf(key), ...errorsOf(centro)]
  if (value.mode === 'asignar' && centro.ok && centro.value === null) errors.push({ codigo: 'CENTRO_REQUERIDO', ruta: 'centroCosteFinanzasId', mensaje: 'asignar exige un centro UUID.' })
  if (value.mode === 'desasignar' && centro.ok && centro.value !== null) errors.push({ codigo: 'CENTRO_DEBE_SER_NULL', ruta: 'centroCosteFinanzasId', mensaje: 'desasignar exige centroCosteFinanzasId:null explícito.' })
  return errors.length ? fail(...errors) : ok({ mode: value.mode, vinculoMovimientoDocumentoId: valueOf(vinculo), centroCosteFinanzasId: valueOf(centro), versionCentroCoste: valueOf(version), idempotencyKey: valueOf(key) })
}
/** Validador estructural que B4 usa sólo en DOCUMENTO. */
export function parseCentroCosteFinanzasIdOpcional(value: unknown, ruta = 'centroCosteFinanzasId'): B8Result<string | null | undefined> {
  if (value === undefined || value === null) return ok<string | null | undefined>(value as null | undefined)
  return uuidCanonico(value, ruta)
}

export function actorPuedeAdministrarCatalogo(actor: ActorFinanzas): boolean {
  return Number.isSafeInteger(actor.id) && actor.id > 0 && actor.activo === true && actor.rol === 'SUPER_ADMIN'
}
export function validarCentroSeleccionable(centro: Pick<CentroCosteActual, 'id' | 'activo'> | null): B8Result<void> {
  if (!centro) return fail({ codigo: 'CENTRO_NO_ENCONTRADO', mensaje: 'El centro de coste no existe.' })
  if (!centro.activo) return fail({ codigo: 'CENTRO_INACTIVO', mensaje: 'El centro de coste está desactivado y no admite nuevas imputaciones.' })
  return ok(undefined)
}
export function validarTrazaAsignable(traza: TrazaLineaB8): B8Result<void> {
  const errors: B8Error[] = []
  if (traza.tipoLinea !== 'DOCUMENTO') errors.push({ codigo: 'LINEA_NO_DOCUMENTAL', mensaje: 'Sólo DOCUMENTO admite centro de coste.' })
  if (!traza.vinculoActivo) errors.push({ codigo: 'VINCULO_INACTIVO', mensaje: 'El vínculo B4 ya no está activo.' })
  if (traza.estadoMovimientoB4 !== 'JUSTIFICADO') errors.push({ codigo: 'MOVIMIENTO_NO_JUSTIFICADO', mensaje: 'El movimiento debe estar actualmente JUSTIFICADO.' })
  if (traza.operacionCreacionEstado !== 'APLICADA' || traza.operacionCreacionRevertida || !traza.todasOperacionesActivasAplicadas) errors.push({ codigo: 'OPERACION_B4_NO_VIGENTE', mensaje: 'Toda operación creadora activa debe estar APLICADA y no revertida.' })
  if (!Number.isSafeInteger(traza.importeBancoCentimos)) errors.push({ codigo: 'IMPORTE_BANCO_DESCONOCIDO', mensaje: 'El importe bancario actual no es verificable; nunca se sustituye por 0.' })
  if (!Number.isSafeInteger(traza.cierreActualCentimos) || traza.importeBancoCentimos === null || traza.cierreActualCentimos !== traza.importeBancoCentimos) errors.push({ codigo: 'CIERRE_B4_NO_EXACTO', mensaje: 'Las líneas B4 activas deben cerrar exactamente contra el banco actual.' })
  if (!Number.isSafeInteger(traza.lineasDocumentoActuales) || traza.lineasDocumentoActuales < 1) errors.push({ codigo: 'SIN_DOCUMENTO_ACTUAL', mensaje: 'Debe existir al menos una línea DOCUMENTO activa.' })
  if (!Number.isSafeInteger(traza.versionCentroCosteActual) || traza.versionCentroCosteActual < 0) errors.push({ codigo: 'VERSION_LINEA_INVALIDA', mensaje: 'La versión B8 de la línea es inválida.' })
  return errors.length ? fail(...errors) : ok(undefined)
}
export function comprobarVersionLinea(actual: number, esperada: number): B8Result<void> {
  if (!Number.isSafeInteger(actual) || !Number.isSafeInteger(esperada) || actual < 0 || esperada < 0 || actual !== esperada) return fail({ codigo: 'VERSION_CONFLICT', mensaje: 'La imputación cambió; relea y reintente.' })
  return ok(undefined)
}
export function validarCambioAsignacion(actual: string | null, destino: string | null): B8Result<void> {
  return actual === destino ? fail({ codigo: 'ASIGNACION_SIN_CAMBIO', mensaje: 'El centro solicitado ya es el valor actual; no se crea auditoría vacía.' }) : ok(undefined)
}
export function hashSolicitudAsignacion(input: AsignacionCentroCosteInput): string { return sha256Canonical(input) }
export function hashValorAsignacion(value: Readonly<{ vinculoMovimientoDocumentoId: string; movimientoId: string; centroCosteFinanzasIdAnterior: string | null; centroCosteFinanzasIdResultante: string | null; versionCentroCosteAnterior: number; versionCentroCosteResultante: number; importeBancoCentimos: number }>): string { return sha256Canonical(value) }
export function evaluarReplayIdempotente(previo: Readonly<{ payloadHash: string; snapshotResultado: unknown }> | null, payloadHash: string): B8Result<Readonly<{ idempotente: boolean; resultado?: unknown }>> {
  if (!previo) return ok({ idempotente: false })
  if (previo.payloadHash !== payloadHash) return fail({ codigo: 'IDEMPOTENCY_PAYLOAD_MISMATCH', mensaje: 'La clave de idempotencia ya se usó con un payload B8 distinto.' })
  return ok({ idempotente: true, resultado: previo.snapshotResultado })
}
export function sumarImporteDocumentalConfirmadoPorCentro(items: readonly EvidenciaAnaliticaB8[]): B8Result<number> {
  let total = BigInt(0)
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (!Number.isSafeInteger(item.importeBancoCentimos) || !Number.isSafeInteger(item.cierreActualCentimos)) return fail({ codigo: 'IMPORTE_BANCO_DESCONOCIDO', ruta: `items[${i}]`, mensaje: 'Una fuente bancaria desconocida no aporta un cero analítico.' })
    if (item.cierreActualCentimos !== item.importeBancoCentimos) return fail({ codigo: 'CIERRE_B4_NO_EXACTO', ruta: `items[${i}]`, mensaje: 'La evidencia no cierra contra la fuente bancaria.' })
    if (!Number.isSafeInteger(item.importeDocumentalCentimos) || item.importeDocumentalCentimos < B8_INT_MIN || item.importeDocumentalCentimos > B8_INT_MAX) return fail({ codigo: 'IMPORTE_DOCUMENTAL_INVALIDO', ruta: `items[${i}]`, mensaje: 'El importe documental debe ser un Int firmado.' })
    total += BigInt(item.importeDocumentalCentimos)
  }
  if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) return fail({ codigo: 'SUMA_FUERA_RANGO_SEGURO', mensaje: 'La suma no cabe exactamente en Number.' })
  return ok(Number(total))
}

/** Ausente/null se hacen notselected; orden estable por documento+índice. */
export function canonicalizarEleccionesCentro(choices: readonly ChoiceInput[]): B8Result<readonly ChoiceCanonical[]> {
  const errors: B8Error[] = []
  const seenIndices = new Set<number>()
  const seenDocumentIndex = new Set<string>()
  const output: ChoiceCanonical[] = []
  choices.forEach((choice, position) => {
    const ruta = `choices[${position}]`
    if (!Number.isSafeInteger(choice?.indiceLinea) || choice.indiceLinea < 0) { errors.push({ codigo: 'INDICE_LINEA_INVALIDO', ruta: `${ruta}.indiceLinea`, mensaje: 'indiceLinea debe ser entero no negativo.' }); return }
    if (seenIndices.has(choice.indiceLinea)) { errors.push({ codigo: 'INDICE_LINEA_DUPLICADO', ruta: `${ruta}.indiceLinea`, mensaje: 'Cada línea DOCUMENTO sólo puede aparecer una vez.' }); return }
    const documentId = uuidCanonico(choice.documentoConciliableId, `${ruta}.documentoConciliableId`)
    const center = choice.centroCosteFinanzasId === undefined || choice.centroCosteFinanzasId === null ? ok<string | typeof B8_NOT_SELECTED>(B8_NOT_SELECTED) : uuidCanonico(choice.centroCosteFinanzasId, `${ruta}.centroCosteFinanzasId`)
    if (documentId.ok === false) { errors.push(...documentId.errors); return }
    if (center.ok === false) { errors.push(...center.errors); return }
    const pair = `${documentId.value}:${choice.indiceLinea}`
    if (seenDocumentIndex.has(pair)) { errors.push({ codigo: 'MAPEO_DOCUMENTO_INDICE_DUPLICADO', ruta, mensaje: 'El mapeo documental/índice se repite.' }); return }
    seenIndices.add(choice.indiceLinea); seenDocumentIndex.add(pair)
    output.push({ indiceLinea: choice.indiceLinea, documentoConciliableId: documentId.value, centroCosteFinanzasId: center.value })
  })
  return errors.length ? fail(...errors) : ok(Object.freeze(output.sort((a, b) => a.documentoConciliableId.localeCompare(b.documentoConciliableId) || a.indiceLinea - b.indiceLinea)))
}
/** Sólo DOCUMENTO llama aquí; una propiedad B8 en DIFERENCIA se rechaza. */
export function eleccionesDesdeLineasB4(rawLines: unknown): B8Result<readonly ChoiceCanonical[]> {
  if (!Array.isArray(rawLines)) return fail({ codigo: 'LINEAS_INVALIDAS', ruta: 'borrador.lineas', mensaje: 'lineas debe ser un array.' })
  const choices: ChoiceInput[] = []; const errors: B8Error[] = []
  rawLines.forEach((raw, indiceLinea) => {
    if (!isRecord(raw)) return
    if (raw.tipo === 'DIFERENCIA') {
      if (own(raw, 'centroCosteFinanzasId')) errors.push({ codigo: 'CENTRO_EN_DIFERENCIA', ruta: `borrador.lineas[${indiceLinea}].centroCosteFinanzasId`, mensaje: 'DIFERENCIA no admite centro de coste.' })
      return
    }
    if (raw.tipo === 'DOCUMENTO') choices.push({ indiceLinea, documentoConciliableId: String(raw.documentoConciliableId ?? ''), ...(own(raw, 'centroCosteFinanzasId') ? { centroCosteFinanzasId: raw.centroCosteFinanzasId as string | null } : {}) })
  })
  return errors.length ? fail(...errors) : canonicalizarEleccionesCentro(choices)
}
export function mappingAuditable(choices: readonly ChoiceCanonical[]): readonly ChoiceMappingForAudit[] {
  return Object.freeze(choices.map((choice) => ({ indiceLinea: choice.indiceLinea, documentoConciliableId: choice.documentoConciliableId, centroCosteFinanzasId: choice.centroCosteFinanzasId === B8_NOT_SELECTED ? null : choice.centroCosteFinanzasId })))
}
export function metadataHashEleccionesCentro(choices: readonly ChoiceCanonical[]): string { return sha256Canonical({ schema: B8_CHOICE_SCHEMA, elecciones: choices }) }
export function relatedSourceHashP2(choices: readonly ChoiceCanonical[]): string { return sha256Canonical({ schema: 'P2_RELATED_SOURCE_IDS_V1', elecciones: mappingAuditable(choices) }) }
export function todasEleccionesNoSeleccionadas(choices: readonly ChoiceCanonical[]): boolean { return choices.every((choice) => choice.centroCosteFinanzasId === B8_NOT_SELECTED) }
export function comprobarReplayEleccion(receipt: Readonly<{ metadataHash: string; snapshotResultado: unknown }> | null, requestedMetadataHash: string): B8Result<Readonly<{ replay: boolean; snapshotResultado?: unknown }>> {
  if (!receipt) return ok({ replay: false })
  if (receipt.metadataHash !== requestedMetadataHash) return fail({ codigo: 'B8_PAYLOAD_COLLISION', ruta: 'borrador.lineas', mensaje: 'La clave financiera B4 ya se confirmó con una elección de centro distinta; use PATCH B8 para un cambio posterior.' })
  return ok({ replay: true, snapshotResultado: receipt.snapshotResultado })
}
/** Decodifica sólo el alcance inmutable B4 que puede originar un recibo B8. */
export function decodificarAlcanceConfirmacionB4(snapshotSolicitud: unknown): B8Result<AlcanceConfirmacionB4ParaRecibo> {
  if (!isRecord(snapshotSolicitud) || snapshotSolicitud.action !== 'confirmar' || !isRecord(snapshotSolicitud.borrador)) return fail({ codigo: 'B8_FINANCIAL_KEY_INVALID', mensaje: 'La operación no contiene una confirmación B4 inmutable decodificable.' })
  const estado = snapshotSolicitud.borrador.estado
  if (estado !== 'JUSTIFICADO' && estado !== 'NO_REQUIERE') return fail({ codigo: 'B8_FINANCIAL_KEY_INVALID', ruta: 'borrador.estado', mensaje: 'El estado del borrador B4 no admite recibo B8.' })
  return ok({ estadoBorrador: estado })
}
export function validarPruebaActualB8(proof: PruebaActualB8): B8Result<void> {
  const errors: B8Error[] = []
  if (!proof.operacionAplicadaNoRevertida) errors.push({ codigo: 'B8_B4_OPERATION_NOT_CURRENT', ruta: 'operacion', mensaje: 'La operación creadora debe estar APLICADA y no revertida.' })
  if (!proof.estadoJustificado) errors.push({ codigo: 'B8_B4_NOT_JUSTIFICADO', ruta: 'estado', mensaje: 'El movimiento debe estar actualmente JUSTIFICADO.' })
  if (!Number.isSafeInteger(proof.lineasDocumentoActivas) || proof.lineasDocumentoActivas < 1) errors.push({ codigo: 'B8_NO_ACTIVE_DOCUMENT', ruta: 'lineas', mensaje: 'Debe existir al menos una línea DOCUMENTO activa.' })
  if (!proof.todasOperacionesActivasAplicadas) errors.push({ codigo: 'B8_ACTIVE_OPERATION_NOT_APPLIED', ruta: 'lineas', mensaje: 'Toda operación creadora activa debe estar APLICADA y no revertida.' })
  if (!Number.isSafeInteger(proof.importeBancoCentimos)) errors.push({ codigo: 'B8_BANK_AMOUNT_UNKNOWN', ruta: 'importeBancoCentimos', mensaje: 'El importe bancario actual es desconocido; no se convierte a cero.' })
  if (!Number.isSafeInteger(proof.cierreActualCentimos) || proof.cierreActualCentimos !== proof.importeBancoCentimos) errors.push({ codigo: 'B8_CURRENT_CLOSURE_INVALID', ruta: 'cierreActualCentimos', mensaje: 'El cierre firmado actual debe ser igual al banco.' })
  if (!proof.actualDocumentSourceGoal) errors.push({ codigo: 'B8_DOCUMENT_SOURCE_STALE', ruta: 'actualDocumentSourceGoal', mensaje: 'La fuente documental actual no acredita la política B4 actual.' })
  return errors.length ? fail(...errors) : ok(undefined)
}
export function assertResult<T>(result: B8Result<T>): T {
  if (result.ok === false) throw new Error(`B8_INVALID:${result.errors.map((error) => error.codigo).join(',')}`)
  return result.value
}
