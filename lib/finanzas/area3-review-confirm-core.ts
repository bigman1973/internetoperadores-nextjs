import { createHash } from 'node:crypto'
import { normalizarReferenciaFactura, referenciasFacturaCitadas } from './conciliar-issued-reference-core'

/**
 * Área 3 — excepción humana para pagos de proveedor que permanecen ámbar.
 *
 * Este módulo no promociona una fila a VERDE ni consulta fuentes. La capa DB
 * debe construir `Area3ReviewConfirmMaterial` sólo con filas del servidor y
 * ejecutar esta misma función tanto en el preflight como bajo los bloqueos de
 * la confirmación. Así la UI nunca inventa una condición seleccionable.
 */
export const AREA3_REVIEW_CONFIRM_SCHEMA = 'AREA3_REVIEW_CONFIRM_V2' as const
export const AREA3_REVIEW_ACK_SCHEMA = 'AREA3_REVIEW_ACK_V2' as const
export const AREA3_REVIEW_ACK_VERSION = '2026-11-01' as const
export const AREA3_REVIEW_CONFIRM_REASONS = [
  'SIN_REFERENCIA_DOCUMENTAL',
  'REFERENCIA_NUMERO_INCOMPLETO',
] as const
export type Area3ReviewConfirmReason = typeof AREA3_REVIEW_CONFIRM_REASONS[number]

export type Area3ReviewAcknowledgement = Readonly<{
  schema: typeof AREA3_REVIEW_ACK_SCHEMA
  version: typeof AREA3_REVIEW_ACK_VERSION
  motivo: Area3ReviewConfirmReason
  sourceHash: string
  /** El usuario reconoce la advertencia llana, sin cambiar la semántica ámbar. */
  advertenciaReconocida: true
}>

export type Area3ReviewConfirmMaterial = Readonly<{
  rowId: string
  rowColor: 'VERDE' | 'AMBAR' | 'ROJO'
  rowSelectable: boolean
  decisionHash: string
  projectionSourceHash: string
  motivoProyeccion: Area3ReviewConfirmReason | null
  movimientoId: string
  versionB4: number
  importeBancoCentimos: number
  fechaBanco: string | null
  textoBanco: string
  referenciaBanco: string | null
  proveedorExacto: boolean
  /** Clasificación server-only: DOCUMENTARY nunca equivale a identidad exacta. */
  tipoProveedor: 'EXACT' | 'DOCUMENTARY' | 'INCOHERENT' | 'UNKNOWN'
  /** Alias documental controlado que se mostrará sólo para la advertencia humana. */
  proveedorDocumental: string | null
  facturaRecibidaId: string
  referenciaDocumento: string | null
  fechaDocumento: string | null
  importeObjetivoDocumentoCentimos: number | null
  netoActivoPrevioCentimos: number | null
  archivoControladoDisponible: boolean
  documentoAccesible: boolean
  documentoCanonico: boolean
  /** Snapshot de estado documental productivo, revalidado con la guarda server-owned. */
  documentStateSnapshotEligible: boolean
  /** Nunca representa bytes remotos ni una huella de contenido. */
  documentStateSnapshotKind: 'PRODUCTIVE_CANONICAL_STATE' | null
  /** Sello SHA-256 del estado productivo canónico; nunca es input HTTP. */
  documentStateSnapshotHash: string | null
}>

export type Area3ReviewBlockCode =
  | 'FILA_NO_AMBAR_REVISABLE'
  | 'MOTIVO_REVISION_NO_ADMITIDO'
  | 'PROVEEDOR_NO_EXACTO'
  | 'PROVEEDOR_DOCUMENTAL_DESCONOCIDO'
  | 'PROVEEDOR_TIPO_INCOHERENTE'
  | 'DOCUMENTO_NO_CANONICO'
  | 'DOCUMENTO_NO_ACCESIBLE'
  | 'ARCHIVO_CONTROLADO_REQUERIDO'
  | 'DOCUMENT_STATE_SNAPSHOT_NO_VIGENTE'
  | 'DOCUMENT_STATE_SNAPSHOT_KIND_REQUIRED'
  | 'DOCUMENT_STATE_SNAPSHOT_HASH_REQUIRED'
  | 'IMPORTE_DOCUMENTAL_DESCONOCIDO'
  | 'IMPORTE_BANCARIO_INVALIDO'
  | 'FECHA_BANCO_INVALIDA'
  | 'FECHA_DOCUMENTO_FALTANTE'
  | 'FECHA_DOCUMENTO_POSTERIOR'
  | 'REFERENCIA_EXPLICITA_CONTRADICTORIA'
  | 'CAPACIDAD_DOCUMENTAL_DESCONOCIDA'
  | 'CAPACIDAD_DOCUMENTAL_EXCEDIDA'
  | 'DOCUMENTO_YA_USADO'
  | 'IMPORTE_DOCUMENTAL_NO_EXACTO'
  | 'ACK_REQUERIDO'
  | 'ACK_VERSION_INVALIDA'
  | 'ACK_MOTIVO_INVALIDO'
  | 'ACK_SOURCE_STALE'
  | 'ACK_ADVERTENCIA_REQUERIDA'

export type Area3ReviewDecision =
  | Readonly<{
    ok: true
    /** Sigue siendo ámbar: confirmable exclusivamente por REVIEW_CONFIRM humano. */
    color: 'AMBAR'
    puedeConfirmarRevision: true
    confirmableGreen: false
    motivo: Area3ReviewConfirmReason
    advertencia: string
    sourceHash: string
    documentStateSnapshotKind: 'PRODUCTIVE_CANONICAL_STATE'
    documentStateSnapshotHash: string
    versionB4: number
    importeLineaCentimos: number
    restoMovimientoCentimos: 0
    netoDocumentoPrevioCentimos: number
    netoDocumentoResultanteCentimos: number
  }>
  | Readonly<{
    ok: false
    color: 'AMBAR' | 'ROJO'
    puedeConfirmarRevision: false
    confirmableGreen: false
    codigo: Area3ReviewBlockCode
    mensaje: string
    sourceHash: string | null
  }>

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).filter(key => row[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`
  }
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('AREA3_REVIEW_STABLE_VALUE_INVALID')
  return result
}

export function area3ReviewSourceHash(material: Area3ReviewConfirmMaterial): string {
  const canonical = {
    schema: AREA3_REVIEW_CONFIRM_SCHEMA,
    rowId: material.rowId,
    decisionHash: material.decisionHash,
    projectionSourceHash: material.projectionSourceHash,
    motivoProyeccion: material.motivoProyeccion,
    movimientoId: material.movimientoId,
    versionB4: material.versionB4,
    importeBancoCentimos: material.importeBancoCentimos,
    fechaBanco: material.fechaBanco,
    textoBanco: material.textoBanco,
    referenciaBanco: material.referenciaBanco,
    proveedorExacto: material.proveedorExacto,
    tipoProveedor: material.tipoProveedor,
    proveedorDocumental: material.proveedorDocumental,
    facturaRecibidaId: material.facturaRecibidaId,
    referenciaDocumento: material.referenciaDocumento,
    fechaDocumento: material.fechaDocumento,
    importeObjetivoDocumentoCentimos: material.importeObjetivoDocumentoCentimos,
    netoActivoPrevioCentimos: material.netoActivoPrevioCentimos,
    archivoControladoDisponible: material.archivoControladoDisponible,
    documentoAccesible: material.documentoAccesible,
    documentoCanonico: material.documentoCanonico,
    documentStateSnapshotEligible: material.documentStateSnapshotEligible,
    documentStateSnapshotKind: material.documentStateSnapshotKind,
    documentStateSnapshotHash: material.documentStateSnapshotHash,
  }
  return createHash('sha256').update(stable(canonical), 'utf8').digest('hex')
}

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647
}

function warning(material: Area3ReviewConfirmMaterial): string {
  if (material.tipoProveedor === 'DOCUMENTARY') {
    const provider = material.proveedorDocumental?.trim()
    const invoice = material.referenciaDocumento?.trim()
    return `El nombre del proveedor «${provider}» sólo coincide de forma documental en el texto bancario; no es una coincidencia exacta. Revisa la factura ${invoice} y comprueba que corresponde a este proveedor y a este pago; el importe coincide, pero requiere revisión humana.`
  }
  const reason = material.motivoProyeccion
  return reason === 'SIN_REFERENCIA_DOCUMENTAL'
    ? 'El proveedor y el importe coinciden, pero el banco no cita una factura; revísala antes de confirmar.'
    : 'El número citado no coincide con el número completo de la factura candidata; el importe coincide, pero requiere revisión.'
}

/**
 * Un número sólo numérico puede ser incompleto respecto a una serie documental.
 * Cualquier referencia bancaria alfanumérica completa distinta del documento
 * bloquea la excepción: no se sustituye por proveedor+importe.
 */
export function area3HasExplicitContradictoryReference(textoBanco: string, referenciaBanco: string | null, referenciaDocumento: string | null, proveedorDocumental?: string | null): boolean {
  const documentReference = normalizarReferenciaFactura(referenciaDocumento)
  if (!documentReference) return true
  const cited = new Set<string>(referenciasFacturaCitadas(textoBanco))
  // A provider such as «ACME 2042» is not itself an invoice reference. Only
  // disregard its exact parsed tokens when no invoice label precedes them;
  // a separately stored bank reference is never removed this way.
  const providerTokens = new Set(referenciasFacturaCitadas(proveedorDocumental ?? ''))
  const normalizedBankText = textoBanco.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const separateBankReference = normalizarReferenciaFactura(referenciaBanco)
  for (const token of cited) {
    const labelledCard = /^(?:TARJETA|TARJ|CARD|VISA|MASTERCARD)(?:\d{4}|\d{12,19})$/.test(token)
    if (!providerTokens.has(token) && !labelledCard) continue
    const explicitlyCited = new RegExp(`(?:FACTURA|INVOICE|FACT|FRA)(?:NUMERO|NRO|NUM|NO|N)?${token}`).test(normalizedBankText)
    if (token !== separateBankReference && !explicitlyCited) cited.delete(token)
  }
  if (referenciaBanco) {
    const isolated = normalizarReferenciaFactura(referenciaBanco)
    if (isolated) cited.add(isolated)
  }
  for (const citedReference of cited) {
    if (/^\d{4,12}$/.test(citedReference)) continue
    if (citedReference !== documentReference) return true
  }
  return false
}

function blocked(codigo: Area3ReviewBlockCode, mensaje: string, sourceHash: string | null, color: 'AMBAR' | 'ROJO' = 'AMBAR'): Area3ReviewDecision {
  return { ok: false, color, puedeConfirmarRevision: false, confirmableGreen: false, codigo, mensaje, sourceHash }
}

/**
 * Núcleo G7 para el preflight de sólo lectura y para la confirmación dentro de
 * la transacción serializable. `acknowledgement` es opcional en preview y
 * obligatoria en la mutación. REVIEW_APPROVED sólo admite el pendiente
 * documental exacto: no ofrece parcialidad, diferencia ni comisión inventada.
 * Nunca devuelve VERDE.
 */
export function evaluateArea3ReviewConfirm(
  material: Area3ReviewConfirmMaterial,
  acknowledgement?: Area3ReviewAcknowledgement,
): Area3ReviewDecision {
  const sourceHash = area3ReviewSourceHash(material)
  if (material.rowColor !== 'AMBAR' || material.rowSelectable) {
    return blocked('FILA_NO_AMBAR_REVISABLE', 'Esta excepción sólo se admite desde una fila ámbar no seleccionable.', sourceHash)
  }
  if (!material.motivoProyeccion || !(AREA3_REVIEW_CONFIRM_REASONS as readonly string[]).includes(material.motivoProyeccion)) {
    return blocked('MOTIVO_REVISION_NO_ADMITIDO', 'La propuesta no conserva uno de los motivos de revisión humana admitidos.', sourceHash)
  }
  if (material.tipoProveedor === 'INCOHERENT' || material.tipoProveedor === 'UNKNOWN') {
    return blocked('PROVEEDOR_TIPO_INCOHERENTE', 'La identidad o el tipo del proveedor no es coherente con el documento.', sourceHash, 'ROJO')
  }
  if (material.tipoProveedor === 'EXACT' && !material.proveedorExacto) {
    return blocked('PROVEEDOR_NO_EXACTO', 'El proveedor no coincide exactamente con el documento propuesto.', sourceHash)
  }
  if (material.tipoProveedor === 'DOCUMENTARY') {
    const provider = material.proveedorDocumental?.trim()
    if (!provider || provider.length < 4 || material.proveedorExacto) {
      return blocked('PROVEEDOR_DOCUMENTAL_DESCONOCIDO', 'La coincidencia documental del proveedor ya no se puede comprobar con seguridad.', sourceHash)
    }
  } else if (material.tipoProveedor !== 'EXACT') {
    return blocked('PROVEEDOR_NO_EXACTO', 'El proveedor no coincide exactamente con el documento propuesto.', sourceHash)
  }
  if (!material.documentoCanonico) {
    return blocked('DOCUMENTO_NO_CANONICO', 'El documento ya no es una fuente económica canónica disponible.', sourceHash, 'ROJO')
  }
  if (!material.documentoAccesible) {
    return blocked('DOCUMENTO_NO_ACCESIBLE', 'El documento propuesto ya no está disponible para revisión.', sourceHash)
  }
  if (!material.archivoControladoDisponible) {
    return blocked('ARCHIVO_CONTROLADO_REQUERIDO', 'El documento no conserva un archivo controlado accesible.', sourceHash)
  }
  if (!material.documentStateSnapshotEligible) {
    return blocked('DOCUMENT_STATE_SNAPSHOT_NO_VIGENTE', 'El estado documental productivo ya no es vigente o cambió desde la propuesta; actualiza y vuelve a revisar.', sourceHash)
  }
  if (material.documentStateSnapshotKind !== 'PRODUCTIVE_CANONICAL_STATE') {
    return blocked('DOCUMENT_STATE_SNAPSHOT_KIND_REQUIRED', 'El documento no conserva un estado productivo verificable para esta excepción.', sourceHash)
  }
  if (typeof material.documentStateSnapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(material.documentStateSnapshotHash)) {
    return blocked('DOCUMENT_STATE_SNAPSHOT_HASH_REQUIRED', 'El documento no conserva un snapshot de estado verificable para esta excepción.', sourceHash)
  }
  if (!isCents(material.importeBancoCentimos)) {
    return blocked('IMPORTE_BANCARIO_INVALIDO', 'El importe bancario no se puede comprobar con seguridad.', sourceHash, 'ROJO')
  }
  if (!isCents(material.importeObjetivoDocumentoCentimos) || material.importeObjetivoDocumentoCentimos === 0) {
    return blocked('IMPORTE_DOCUMENTAL_DESCONOCIDO', 'El importe disponible del documento no se puede comprobar.', sourceHash)
  }
  if (!isCents(material.netoActivoPrevioCentimos)) {
    return blocked('CAPACIDAD_DOCUMENTAL_DESCONOCIDA', 'La capacidad actual del documento no se puede comprobar.', sourceHash)
  }
  if (material.netoActivoPrevioCentimos !== 0) {
    return blocked('DOCUMENTO_YA_USADO', 'El documento ya tiene un uso activo; esta revisión no admite reutilizarlo.', sourceHash, 'ROJO')
  }
  if (!isDay(material.fechaBanco)) {
    return blocked('FECHA_BANCO_INVALIDA', 'El movimiento no conserva una fecha bancaria verificable.', sourceHash, 'ROJO')
  }
  if (!isDay(material.fechaDocumento)) {
    return blocked('FECHA_DOCUMENTO_FALTANTE', 'Falta la fecha verificable del documento.', sourceHash)
  }
  if (material.fechaDocumento > material.fechaBanco) {
    return blocked('FECHA_DOCUMENTO_POSTERIOR', 'La fecha del documento es posterior al movimiento bancario.', sourceHash)
  }
  if (area3HasExplicitContradictoryReference(material.textoBanco, material.referenciaBanco, material.referenciaDocumento, material.proveedorDocumental)) {
    return blocked('REFERENCIA_EXPLICITA_CONTRADICTORIA', 'El número de factura citado por el banco no coincide con el documento propuesto.', sourceHash, 'ROJO')
  }
  if (material.importeObjetivoDocumentoCentimos !== material.importeBancoCentimos) {
    return blocked('IMPORTE_DOCUMENTAL_NO_EXACTO', 'El importe disponible del documento no coincide exactamente con el banco; esta revisión no admite pagos parciales ni diferencias.', sourceHash)
  }
  const netoResultante = material.importeBancoCentimos
  if (!acknowledgement) {
    return blocked('ACK_REQUERIDO', warning(material), sourceHash)
  }
  if (acknowledgement.schema !== AREA3_REVIEW_ACK_SCHEMA || acknowledgement.version !== AREA3_REVIEW_ACK_VERSION) {
    return blocked('ACK_VERSION_INVALIDA', 'La revisión debe reconocer la versión vigente de la advertencia.', sourceHash)
  }
  if (acknowledgement.motivo !== material.motivoProyeccion) {
    return blocked('ACK_MOTIVO_INVALIDO', 'El motivo reconocido no coincide con la propuesta ámbar actual.', sourceHash)
  }
  if (acknowledgement.sourceHash !== sourceHash) {
    return blocked('ACK_SOURCE_STALE', 'La fuente revisada cambió; vuelve a abrir la propuesta.', sourceHash)
  }
  if (acknowledgement.advertenciaReconocida !== true) {
    return blocked('ACK_ADVERTENCIA_REQUERIDA', 'Debes reconocer expresamente la advertencia antes de confirmar.', sourceHash)
  }
  return {
    ok: true,
    color: 'AMBAR',
    puedeConfirmarRevision: true,
    confirmableGreen: false,
    motivo: material.motivoProyeccion,
    advertencia: warning(material),
    sourceHash,
    documentStateSnapshotKind: material.documentStateSnapshotKind,
    documentStateSnapshotHash: material.documentStateSnapshotHash,
    versionB4: material.versionB4,
    importeLineaCentimos: material.importeBancoCentimos,
    restoMovimientoCentimos: 0,
    netoDocumentoPrevioCentimos: material.netoActivoPrevioCentimos,
    netoDocumentoResultanteCentimos: netoResultante,
  }
}
