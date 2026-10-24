/**
 * Analítica de teléfono de prototipo: núcleo puro, sin Prisma, entorno, red ni logs.
 *
 * Los importes viajan como texto decimal y se convierten a bigint de céntimos.  No se
 * acepta un número de teléfono por el mero hecho de contener nueve dígitos: sólo se
 * lee un campo semántico de teléfono o texto precedido por una etiqueta telefónica.
 */

import { createHash } from 'node:crypto'

export type PhoneCostReasonCode =
  | 'SIN_TELEFONO_EN_CONTEXTO'
  | 'TELEFONO_NO_NORMALIZABLE'
  | 'TELEFONO_SIN_CONTRATO_VIGENTE'
  | 'TELEFONO_CONTRATO_AMBIGUO'
  | 'VIGENCIA_ALTA_DESCONOCIDA'
  | 'VIGENCIA_BAJA_NO_DETERMINABLE'
  | 'CLIENTE_NO_UNIVOCO'
  | 'SUBTOTAL_NO_VERIFICADO'
  | 'IVA_LINEA_NO_CONCILIA'
  | 'LINEA_MULTIPLE_TELEFONOS'
  | 'SUMA_LINEAS_SUPERA_BASE_FACTURA'
  | 'BASE_FACTURA_DESCONOCIDA'
  | 'LINEAS_OCR_INVALIDAS'
  | 'OCR_INVALIDO'
  | 'FACTURA_EMITIDA_SIN_ESPEJO_ISP_EXPLICITO'
  /** Propuesta de base total fundada en un PDF de un único servicio, aún no confirmada. */
  | 'EVIDENCIA_PDF_SERVICIO_UNICO'
  | 'EVIDENCIA_PDF_INCONSISTENTE'
  | 'EVIDENCIA_PDF_AMBIGUA'

export type PhoneCostDocumentState = 'PROPUESTA_PARCIAL' | 'SIN_PROPUESTA' | 'REVISION' | 'BASE_DESCONOCIDA'

export type PhoneCostPeriod = Readonly<{ desde: string; hasta: string }>

export type PhoneCostCustomerRow = Readonly<{
  cliente: { id: number; nombre: string }
  ingresos: { baseCentimos: string; facturas: number }
  coste: {
    asignablePropuestoCentimos: string
    confirmadoCentimos: string | null
    baseDocumentadaRelacionadaCentimos: string | null
    porcentajeAsignablePorCosteBaseBp: number | null
    documentos: number
    lineasPropuestas: number
  }
  margenConfirmado: { centimos: string | null; porcentajeBp: number | null }
  margenPotencialEstimado: { centimos: string | null; porcentajeBp: number | null; costeCompletoAsegurado: false }
  revision: { motivos: PhoneCostReasonCode[]; documentos: number; lineas: number }
}>

export type PhoneCostDocumentRow = Readonly<{
  facturaId: string
  /** Referencia documental segura para UI; nunca contiene teléfono u OCR. */
  numeroFactura?: string | null
  fecha: string
  proveedor: string
  baseFacturaCentimos: string | null
  costePropuestoCentimos: string
  baseNoAsignadaCentimos: string | null
  lineasDetectadas: number
  lineasPropuestas: number
  estado: PhoneCostDocumentState
  motivos: PhoneCostReasonCode[]
}>

export type PhoneCostDeduplication = Readonly<{
  documentosRecibidosExcluidos: number
  facturasEmitidasEspejoNoSumadas: number
  telefonosConContratoDuplicado: number
  telefonosSinContratoVigente: number
  contratosSinFechaInicio: number
  contratosConFechaBajaNoDeterminable: number
  clientesNoUnivocos: number
  lineasRechazadasPorControlBase: number
}>

export type PhoneCostTotals = Readonly<{
  ingresoBaseCentimos: string
  costeBaseDocumentadoCentimos: string | null
  costeAsignablePropuestoCentimos: string
  costeConfirmadoCentimos: string | null
  porcentajeAsignablePorCosteBaseBp: number | null
  bolsaSinAsignar: {
    baseConocidaNoAsignadaCentimos: string
    documentosBaseConocidaNoAsignada: number
    documentosImporteDesconocido: number
    importeDesconocidoCentimos: null
  }
  margenConfirmado: { centimos: string | null; porcentajeBp: number | null; caveat: string }
  margenPotencialEstimado: { centimos: string | null; porcentajeBp: number | null; costeCompletoAsegurado: false; caveat: string }
  documentos: { total: number; conBaseConocida: number; conCosteLineaPropuesto: number }
  lineas: { detectadasConContexto: number; propuestas: number; enRevision: number }
}>

export type PhoneCostAnalyticsDto = Readonly<{
  stagingOnly: true
  automaticas: false
  proposalsOnly: true
  periodo: { desde: string; hasta: string; baseTemporal: 'fecha_factura' }
  proveedor: { clave: 'TELEFONICA'; documentosEncontrados: number; documentosIncluidos: number }
  totales: PhoneCostTotals
  clientes: PhoneCostCustomerRow[]
  documentos: PhoneCostDocumentRow[]
  deduplicacion: PhoneCostDeduplication
  bancoTelefono: {
    estado: 'CALCULADO_SIN_ASIGNAR_COSTE'
    usadoEnCoste: false
    movimientosTotal: number
    movimientosConTelefono: number
    movimientosConClienteUnico: number
    importeBancoIdentificadoCentimos: string
    mensaje: string
  }
  avisos: PhoneCostReasonCode[]
}>

export type PhoneCostContractInput = Readonly<{
  id: number
  /** ContratoServicio.clienteId → ClienteWeb.clienteIdIsp, exacto. */
  clienteContratoId: string | null
  telefonosContrato: string | null
  fechaInicio: string | null
  fechaBaja: string | null
  activo: boolean
}>

export type PhoneCostClientInput = Readonly<{
  id: number
  /** ClienteWeb.clienteIdIsp; única clave permitida desde ContratoServicio. */
  clienteContratoId: string | null
  /** ClienteWeb.ispGestionId; única clave permitida desde Factura.idCliente. */
  clienteFacturaIspId: string | null
  nombre: string
}>

export type PhoneCostIspInvoiceInput = Readonly<{
  id: number
  /** Factura.idCliente → ClienteWeb.ispGestionId, exacto tras texto canónico. */
  clienteFacturaIspId: string | null
  fecha: string | null
  baseText: string | null
}>

export type PhoneCostReceivedDocumentInput = Readonly<{
  id: string
  numFactura?: string | null
  proveedor: string
  fecha: string | null
  baseText: string | null
  /** Exact source total lexeme; required only by whole-PDF evidence matching. */
  totalText?: string | null
  economica: boolean
  telefonoServicio: string | null
  datosOcrRaw: string | null
  lineasDetalleRaw: string | null
  /**
   * Propuestas extraídas de la tabla staging inmutable. Nunca son un coste
   * confirmado ni prueban que el fichero remoto siga disponible o sin cambios.
   * Se conserva plural para poder rechazar dos PDF válidos del mismo FR como
   * ambigüedad, en vez de escoger silenciosamente el más reciente.
   */
  evidenciasServicioUnico?: readonly PhoneCostSingleServiceEvidenceInput[]
}>

/**
 * Contrato de entrada para `evidencias_coste_telefono_stage.evidencia`.
 * `baseCentimos` llega como texto entero (no Float), y los importes fuente
 * siguen siendo lexemas decimales exactos sin símbolo monetario.
 */
export type PhoneCostSingleServiceEvidenceInput = Readonly<{
  telefono: string
  baseCentimos: string
  baseFuenteText: string
  totalFuenteText: string
  pdfSha256: string
  servicioDesde: string
  servicioHasta: string
  numeroFactura: string
  fechaFactura: string
  schema: string | null
  versionExtractor: string | null
  /** Inventario extraído del PDF; debe ser exactamente el teléfono del registro. */
  telefonosServicio: readonly string[] | null
  /** Hora de creación del snapshot staging; no certifica la versión online actual. */
  snapshotAt?: string | null
  /** El adaptador lo calcula sobre toda la tabla staging, no sólo sobre el período. */
  pdfCompartidoEntreFacturas?: boolean
  /**
   * El cargador coteja este hash con la factura fuente actual antes de entregar
   * la evidencia al core. `false` es una revisión obligatoria; `undefined` se
   * conserva sólo para fixtures puros sin adaptador de base de datos.
   */
  sourceSnapshotMatches?: boolean
}>

/** Campos de la FR que el staging evidencia y que nunca deben actualizarse aquí. */
export type PhoneCostEvidenceSourceSnapshot = Readonly<{
  facturaId: string
  proveedor: string | null
  numeroFactura: string | null
  fechaFactura: string | null
  baseFuenteText: string | null
  totalFuenteText: string | null
  sourcePointer: Readonly<{
    archivoOneDrive: string | null
    oneDriveDriveId: string | null
    oneDriveItemId: string | null
    oneDriveRutaActual: string | null
    archivoUrl: string | null
  }>
}>

/** Stable JSON is intentionally small and local; it is a provenance hash, not a password hash. */
function canonicalEvidenceJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalEvidenceJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalEvidenceJson(record[key])}`).join(',')}}`
  }
  return 'null'
}

/** Shared importer/loader contract: current source must hash exactly as staged snapshot. */
export function phoneCostEvidenceSourceSnapshotSha256(snapshot: PhoneCostEvidenceSourceSnapshot): string {
  return createHash('sha256').update(canonicalEvidenceJson(snapshot), 'utf8').digest('hex')
}

/** Sólo evidencia de contexto; nunca se suma ni sustituye a Factura ISP. */
export type PhoneCostIssuedMirrorInput = Readonly<{
  facturaIspId: number | null
  lineasRaw: string | null
}>

/**
 * Extracto bancario ya limitado al proveedor telefónico. El texto no sale del
 * core; sólo un teléfono etiquetado contextualmente puede entrar al censo. Un
 * token de nueve dígitos aislado no es evidencia telefónica.
 */
export type PhoneCostBankMovementInput = Readonly<{
  fecha: string | null
  importeText: string | null
  texto: string | null
}>

/**
 * Futuro registro de asignación durable. `confirmado` legacy por sí solo no es
 * auditoría de línea/cliente/vigencia y por ello no habilita un coste confirmado.
 * El devengo de una factura no depende de ningún cobro bancario.
 */
export type PhoneCostConfirmedCostInput = Readonly<{
  id: string
  facturaRecibidaId: string
  clienteId: number
  importeText: string | null
  confirmado: boolean
  asignacionAcreditada: boolean
}>

export type PhoneCostCalculationInput = Readonly<{
  periodo: PhoneCostPeriod
  documentosRecibidos: readonly PhoneCostReceivedDocumentInput[]
  contratos: readonly PhoneCostContractInput[]
  clientes: readonly PhoneCostClientInput[]
  facturasIsp: readonly PhoneCostIspInvoiceInput[]
  facturasEmitidasEspejo: readonly PhoneCostIssuedMirrorInput[]
  movimientosBancoTelefono?: readonly PhoneCostBankMovementInput[]
  costesConfirmados?: readonly PhoneCostConfirmedCostInput[]
}>

const MONEY = /^([+-]?)(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER)
const ZERO_CENTS = BigInt(0)
const ONE_CENT = BigInt(1)
const HUNDRED_CENTS = BigInt(100)
const TEN_THOUSAND_BP = BigInt(10_000)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * JSON.parse hydrates numeric literals as JavaScript Number and loses their
 * source representation. Monetary source fields must instead reach the exact
 * cents parser as their original JSON lexeme; this transformer quotes numeric
 * tokens outside strings before parsing. Exponent notation remains a lexeme and
 * is subsequently rejected by exactPhoneCostCents rather than rounded.
 */
function parseJsonPreservingNumberLexemes(raw: string): unknown {
  let transformed = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < raw.length;) {
    const char = raw[index]
    if (inString) {
      transformed += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      index++
      continue
    }
    if (char === '"') {
      inString = true
      transformed += char
      index++
      continue
    }
    if (char === '-' || /\d/.test(char)) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index))
      const token = match?.[0]
      const next = token ? raw[index + token.length] : undefined
      if (token && (next === undefined || /[\s,}\]]/.test(next))) {
        transformed += JSON.stringify(token)
        index += token.length
        continue
      }
    }
    transformed += char
    index++
  }
  return JSON.parse(transformed)
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Numeric zero padding is normalized only for explicit external identity keys. */
function canonicalExternalIdentity(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (!/^\d+$/.test(text)) return text
  return text.replace(/^0+(?=\d)/, '')
}

function uniqueReasons(values: Iterable<PhoneCostReasonCode>): PhoneCostReasonCode[] {
  return [...new Set(values)].sort()
}

function parseDate(value: string | null | undefined): string | null {
  if (!value || !DATE.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

function bigintToCents(value: bigint): string {
  return value.toString()
}

function safeBigint(value: bigint): bigint | null {
  return value <= MAX_CENTS && value >= -MAX_CENTS ? value : null
}

/** Exact conversion of source text. Never accepts a hydrated JavaScript float. */
export function exactPhoneCostCents(value: unknown): bigint | null {
  const text = typeof value === 'string'
    ? value.trim()
    : null
  if (!text) return null
  const match = MONEY.exec(text)
  if (!match) return null
  try {
    const whole = BigInt(match[2])
    const fraction = BigInt((match[3] ?? '').padEnd(2, '0') || '0')
    const result = (whole * HUNDRED_CENTS + fraction) * (match[1] === '-' ? -ONE_CENT : ONE_CENT)
    return safeBigint(result)
  } catch {
    return null
  }
}

/**
 * Normalizes a standalone Spanish telephone value. Labels are intentionally not
 * stripped here: callers must already have a semantic telephone context.
 */
export function normalizeSpanishPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (!compact || /[^+\d]/.test(compact) || (compact.match(/\+/g)?.length ?? 0) > 1 || (compact.includes('+') && !compact.startsWith('+'))) return null
  let digits = compact.startsWith('+') ? compact.slice(1) : compact
  if (digits.startsWith('0034')) digits = digits.slice(4)
  else if (digits.startsWith('34') && digits.length === 11) digits = digits.slice(2)
  if (!/^[6789]\d{8}$/.test(digits)) return null
  return digits
}

/** Contextual text scan. CIF, IBAN and invoice/order numbers lack this label and are ignored. */
export function contextualSpanishPhones(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const found = new Set<string>()
  const pattern = /(?:\btel[eé]fono\b|\btel\.?\b|\bm[oó]vil\b|\bl[ií]nea\b|\bn[uú]mero\s+(?:de\s+)?(?:tel[eé]fono|l[ií]nea)\b)\s*(?:n[ºo]\s*)?[:#-]?\s*((?:\+|00)?34[\s().-]*)?[6789](?:[\s().-]*\d){8}\b/gi
  for (const match of value.matchAll(pattern)) {
    const normalized = normalizeSpanishPhone(match[0].replace(/^[^:#+\d]*[:#-]?\s*/i, ''))
      ?? normalizeSpanishPhone(match[0].match(/(?:\+|00)?34[\s().-]*[6789](?:[\s().-]*\d){8}|[6789](?:[\s().-]*\d){8}/)?.[0] ?? '')
    if (normalized) found.add(normalized)
  }
  return [...found]
}

/**
 * Banco: un token desnudo sigue sin ser teléfono por sí solo. Sólo puede entrar
 * al censo si coincide con un número que ya vive en `telefonos_contrato` y la
 * resolución histórica posterior es única. El patrón mantiene los límites para
 * no absorber CIF/NIF, IBAN ni referencias alfanuméricas.
 */
function standaloneSpanishPhoneTokens(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const found = new Set<string>()
  const pattern = /(?<![A-Za-z0-9])(?:(?:\+|00)?34[\s().-]*)?[6789](?:[\s().-]*\d){8}(?![A-Za-z0-9])/g
  for (const match of value.matchAll(pattern)) {
    const phone = normalizeSpanishPhone(match[0])
    if (phone) found.add(phone)
  }
  return [...found]
}

function semanticPhoneValue(key: string): boolean {
  const normalized = normalizeKey(key)
  return normalized.includes('telefono') || normalized.includes('phone') || normalized === 'tel' || normalized.includes('movil')
}

function phonesFromSemanticRecord(record: Record<string, unknown>): string[] {
  const phones = new Set<string>()
  for (const [key, value] of Object.entries(record)) {
    if (!semanticPhoneValue(key)) continue
    const direct = normalizeSpanishPhone(value)
    if (direct) phones.add(direct)
    if (typeof value === 'string') for (const phone of contextualSpanishPhones(value)) phones.add(phone)
  }
  return [...phones]
}

/** Only semantic JSON keys are read; a free OCR blob is never scanned for digits. */
function phonesFromOcr(raw: string | null): { phones: string[]; invalid: boolean } {
  if (!raw) return { phones: [], invalid: false }
  try {
    const root = parseJsonPreservingNumberLexemes(raw)
    const phones = new Set<string>()
    const walk = (value: unknown, depth: number) => {
      if (depth > 5 || value === null || value === undefined) return
      if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return }
      if (!isPlainRecord(value)) return
      for (const [key, child] of Object.entries(value)) {
        if (semanticPhoneValue(key)) {
          const phone = normalizeSpanishPhone(child)
          if (phone) phones.add(phone)
          if (typeof child === 'string') for (const contextual of contextualSpanishPhones(child)) phones.add(contextual)
        }
        if (isPlainRecord(child) || Array.isArray(child)) walk(child, depth + 1)
      }
    }
    walk(root, 0)
    return { phones: [...phones], invalid: false }
  } catch {
    return { phones: [], invalid: true }
  }
}

function lineDescriptionValues(record: Record<string, unknown>): string[] {
  return Object.entries(record)
    .filter(([key, value]) => ['descripcion', 'descripcionlinea', 'concepto', 'detalle', 'texto'].includes(normalizeKey(key)) && typeof value === 'string')
    .map(([, value]) => value as string)
}

function phonesFromLine(record: Record<string, unknown>): string[] {
  const phones = new Set(phonesFromSemanticRecord(record))
  for (const text of lineDescriptionValues(record)) for (const phone of contextualSpanishPhones(text)) phones.add(phone)
  return [...phones]
}

function moneyForKeys(record: Record<string, unknown>, allowed: readonly string[]): { value: bigint | null; present: boolean; conflict: boolean } {
  const normalizedAllowed = new Set(allowed.map(normalizeKey))
  const values: bigint[] = []
  let present = false
  for (const [key, raw] of Object.entries(record)) {
    if (!normalizedAllowed.has(normalizeKey(key))) continue
    present = true
    const cents = exactPhoneCostCents(raw)
    if (cents === null) return { value: null, present, conflict: true }
    values.push(cents)
  }
  if (!values.length) return { value: null, present, conflict: false }
  if (values.some(value => value !== values[0])) return { value: null, present, conflict: true }
  return { value: values[0], present, conflict: false }
}

function exactBaseFromUnitPrice(record: Record<string, unknown>): { cents: bigint | null; reason: PhoneCostReasonCode | null } {
  const price = moneyForKeys(record, ['precio', 'precioUnitario', 'unitPrice'])
  const quantity = moneyForKeys(record, ['cantidad', 'unidades', 'cantidadunidades', 'quantity', 'qty'])
  const discount = moneyForKeys(record, ['descuento', 'discount'])
  if (price.conflict || quantity.conflict || discount.conflict || price.value === null) return { cents: null, reason: 'SUBTOTAL_NO_VERIFICADO' }
  if (discount.present && discount.value !== ZERO_CENTS) return { cents: null, reason: 'SUBTOTAL_NO_VERIFICADO' }
  const quantityCents = quantity.present ? quantity.value : HUNDRED_CENTS
  if (quantityCents === null || quantityCents < ZERO_CENTS) return { cents: null, reason: 'SUBTOTAL_NO_VERIFICADO' }
  const product = price.value * quantityCents
  if (product % HUNDRED_CENTS !== ZERO_CENTS) return { cents: null, reason: 'SUBTOTAL_NO_VERIFICADO' }
  return { cents: safeBigint(product / HUNDRED_CENTS), reason: null }
}

/**
 * The only accepted allocation values are a named tax-exclusive subtotal, or a
 * line price reconciled exactly with a VAT amount and a total. No global invoice
 * allocation, VAT estimation or floating-point division is performed.
 */
function verifiedLineBase(record: Record<string, unknown>): { cents: bigint | null; reason: PhoneCostReasonCode | null } {
  const explicitBase = moneyForKeys(record, ['base', 'baseimponible', 'subtotal', 'importesiniva', 'importeantesdeiva', 'neto', 'importeneto', 'importe_linea_neto'])
  const vat = moneyForKeys(record, ['iva', 'importeiva', 'ivaimporte', 'cuotaiva', 'impuestoiva'])
  const total = moneyForKeys(record, ['importe', 'total', 'importetotal', 'totalLinea'])

  if (explicitBase.conflict || vat.conflict || total.conflict) return { cents: null, reason: 'SUBTOTAL_NO_VERIFICADO' }
  const derived = explicitBase.value === null ? exactBaseFromUnitPrice(record) : { cents: null, reason: null }
  const base = explicitBase.value ?? derived.cents
  if (base === null) return { cents: null, reason: 'SUBTOTAL_NO_VERIFICADO' }

  const reconciliationFieldsPresent = vat.present || total.present
  if (reconciliationFieldsPresent) {
    if (vat.value === null || total.value === null) return { cents: null, reason: 'IVA_LINEA_NO_CONCILIA' }
    if (safeBigint(base + vat.value) === null || base + vat.value !== total.value) return { cents: null, reason: 'IVA_LINEA_NO_CONCILIA' }
  }
  return { cents: base, reason: null }
}

type ParsedPhoneLine = { lineIndex: number; phones: string[]; baseCents: bigint | null; reason: PhoneCostReasonCode | null }

function parsePhoneLines(raw: string | null): { lines: ParsedPhoneLine[]; invalid: boolean } {
  if (!raw) return { lines: [], invalid: false }
  try {
    const parsed = parseJsonPreservingNumberLexemes(raw)
    if (!Array.isArray(parsed)) return { lines: [], invalid: true }
    const lines: ParsedPhoneLine[] = []
    parsed.forEach((value, index) => {
      if (!isPlainRecord(value)) return
      const phones = phonesFromLine(value)
      if (!phones.length) return
      const monetary = verifiedLineBase(value)
      lines.push({ lineIndex: index, phones, baseCents: monetary.cents, reason: monetary.reason })
    })
    return { lines, invalid: false }
  } catch {
    return { lines: [], invalid: true }
  }
}

function phonesFromContract(value: string | null): string[] {
  if (!value) return []
  const phones = new Set<string>()
  for (const token of value.split(/[;,|/\n]+/)) {
    const direct = normalizeSpanishPhone(token)
    if (direct) phones.add(direct)
    for (const contextual of contextualSpanishPhones(token)) phones.add(contextual)
  }
  return [...phones]
}

function addToMap(map: Map<number, bigint>, key: number, cents: bigint): void {
  map.set(key, (map.get(key) ?? ZERO_CENTS) + cents)
}

function percentageBasisPoints(part: bigint, whole: bigint): number | null {
  if (whole <= ZERO_CENTS || part < ZERO_CENTS) return null
  const result = (part * TEN_THOUSAND_BP) / whole
  return result > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(result)
}

function documentState(base: bigint | null, proposed: bigint, reasons: Set<PhoneCostReasonCode>): PhoneCostDocumentState {
  if (base === null) return 'BASE_DESCONOCIDA'
  if (proposed !== ZERO_CENTS) return 'PROPUESTA_PARCIAL'
  return reasons.size ? 'REVISION' : 'SIN_PROPUESTA'
}

function clientMap(input: readonly PhoneCostClientInput[], selector: (client: PhoneCostClientInput) => string | null): Map<string, PhoneCostClientInput[]> {
  const result = new Map<string, PhoneCostClientInput[]>()
  for (const client of input) {
    const key = canonicalExternalIdentity(selector(client))
    if (!key) continue
    const list = result.get(key) ?? []
    list.push(client)
    result.set(key, list)
  }
  return result
}

type ContractResolution = { client: PhoneCostClientInput | null; reasons: PhoneCostReasonCode[]; duplicate: boolean; noCurrent: boolean; missingStart: Set<number>; uncertainEnd: Set<number> }

type SingleServiceEvidence = Readonly<{
  phone: string
  cents: bigint
  pdfSha256: string
  serviceFrom: string
  serviceUntil: string
}>

const EVIDENCE_SCHEMA = 'TELEFONICA_UNICA_PDF_V1'
const EVIDENCE_HASH = /^[a-f0-9]{64}$/
const POSITIVE_INT_TEXT = /^[1-9]\d*$/
const MAX_EVIDENCE_CENTS = BigInt(2_147_483_647)

/** `base_centimos` is PostgreSQL INTEGER, never a hydrated decimal or float. */
function evidenceCents(value: unknown): bigint | null {
  if (typeof value !== 'string' || !POSITIVE_INT_TEXT.test(value)) return null
  try {
    const cents = BigInt(value)
    return cents <= MAX_EVIDENCE_CENTS ? cents : null
  } catch {
    return null
  }
}

/**
 * Validates the redundant immutable snapshot fields before they are allowed to
 * replace legacy per-line amounts. The `baseFuenteText` is the PDF's explicit
 * "Base imponible", not a recomputation of four-decimal service components.
 */
function validateSingleServiceEvidence(
  document: PhoneCostReceivedDocumentInput,
  documentDate: string,
  documentBase: bigint | null,
  evidence: PhoneCostSingleServiceEvidenceInput,
): SingleServiceEvidence | null {
  if (evidence.schema !== EVIDENCE_SCHEMA || evidence.versionExtractor !== EVIDENCE_SCHEMA) return null
  if (!EVIDENCE_HASH.test(evidence.pdfSha256)) return null
  const phone = normalizeSpanishPhone(evidence.telefono)
  const cents = evidenceCents(evidence.baseCentimos)
  const sourceBase = exactPhoneCostCents(evidence.baseFuenteText)
  const sourceTotal = exactPhoneCostCents(evidence.totalFuenteText)
  const documentTotal = exactPhoneCostCents(document.totalText)
  const invoiceDate = parseDate(evidence.fechaFactura)
  const serviceFrom = parseDate(evidence.servicioDesde)
  const serviceUntil = parseDate(evidence.servicioHasta)
  const evidencePhones = new Set((evidence.telefonosServicio ?? []).map(normalizeSpanishPhone).filter((value): value is string => Boolean(value)))
  const sourceInvoiceNumber = document.numFactura?.trim() ?? ''
  if (!phone || !cents || sourceBase === null || sourceBase !== cents || sourceTotal === null || sourceTotal < ZERO_CENTS) return null
  if (evidencePhones.size !== 1 || !evidencePhones.has(phone)) return null
  if (!invoiceDate || !serviceFrom || !serviceUntil || serviceFrom > serviceUntil || serviceUntil > invoiceDate) return null
  if (documentDate !== invoiceDate || documentBase === null || documentBase !== cents || documentTotal === null || documentTotal !== sourceTotal) return null
  if (!sourceInvoiceNumber || sourceInvoiceNumber !== evidence.numeroFactura.trim()) return null
  if (evidence.pdfCompartidoEntreFacturas === true) return null
  if (evidence.sourceSnapshotMatches === false) return null
  return { phone, cents, pdfSha256: evidence.pdfSha256, serviceFrom, serviceUntil }
}

/** A dated contract may overlap when neither known endpoint excludes the whole service period. */
function contractMayOverlapPeriod(contract: PhoneCostContractInput, serviceFrom: string, serviceUntil: string): boolean {
  const start = parseDate(contract.fechaInicio)
  const end = contract.fechaBaja === null ? null : parseDate(contract.fechaBaja)
  if (start && start > serviceUntil) return false
  if (end && end < serviceFrom) return false
  return true
}

/**
 * Resolves a single PDF service period. Invoice-date resolution is deliberately
 * insufficient: the accepted contract must cover every billed day, and any
 * other contract that overlaps even one day makes the proposed assignment
 * ambiguous, including a different overlapping contract for the same client.
 */
function resolvePhoneContractForServicePeriod(
  phone: string,
  serviceFrom: string,
  serviceUntil: string,
  byPhone: Map<string, PhoneCostContractInput[]>,
  clientsByExternalId: Map<string, PhoneCostClientInput[]>,
): ContractResolution {
  const overlaps: PhoneCostContractInput[] = []
  const covers: PhoneCostContractInput[] = []
  const missingStart = new Set<number>()
  const uncertainEnd = new Set<number>()

  for (const contract of byPhone.get(phone) ?? []) {
    if (!contractMayOverlapPeriod(contract, serviceFrom, serviceUntil)) continue
    const start = parseDate(contract.fechaInicio)
    const end = contract.fechaBaja === null ? null : parseDate(contract.fechaBaja)
    if (!start) { missingStart.add(contract.id); continue }
    if (contract.fechaBaja !== null && !end) { uncertainEnd.add(contract.id); continue }
    if (end === null && !contract.activo) { uncertainEnd.add(contract.id); continue }
    overlaps.push(contract)
    if (start <= serviceFrom && ((end !== null && end >= serviceUntil) || (end === null && contract.activo))) covers.push(contract)
  }

  const hasUncertainCandidate = missingStart.size > 0 || uncertainEnd.size > 0
  const uniqueCoverage = covers.length === 1 && overlaps.length === 1 && !hasUncertainCandidate
  if (!uniqueCoverage) {
    const reasons: PhoneCostReasonCode[] = []
    if (covers.length > 1 || overlaps.length > 1 || (covers.length === 1 && hasUncertainCandidate)) reasons.push('TELEFONO_CONTRATO_AMBIGUO')
    if (missingStart.size) reasons.push('VIGENCIA_ALTA_DESCONOCIDA')
    if (uncertainEnd.size) reasons.push('VIGENCIA_BAJA_NO_DETERMINABLE')
    // A merely partial contract does not establish that every period day was a
    // customer service day; never infer continuity across two contracts.
    reasons.push('TELEFONO_SIN_CONTRATO_VIGENTE')
    return {
      client: null,
      reasons,
      duplicate: covers.length > 1 || overlaps.length > 1 || hasUncertainCandidate,
      noCurrent: covers.length === 0,
      missingStart,
      uncertainEnd,
    }
  }

  const externalId = canonicalExternalIdentity(covers[0].clienteContratoId)
  const candidates = externalId ? (clientsByExternalId.get(externalId) ?? []) : []
  if (candidates.length !== 1) {
    return { client: null, reasons: ['CLIENTE_NO_UNIVOCO'], duplicate: false, noCurrent: false, missingStart, uncertainEnd }
  }
  return { client: candidates[0], reasons: [], duplicate: false, noCurrent: false, missingStart, uncertainEnd }
}

function resolvePhoneContract(
  phone: string,
  invoiceDate: string,
  byPhone: Map<string, PhoneCostContractInput[]>,
  clientsByExternalId: Map<string, PhoneCostClientInput[]>,
): ContractResolution {
  const contracts = byPhone.get(phone) ?? []
  const missingStart = new Set<number>()
  const uncertainEnd = new Set<number>()
  const valid: PhoneCostContractInput[] = []

  for (const contract of contracts) {
    const start = parseDate(contract.fechaInicio)
    const end = contract.fechaBaja === null ? null : parseDate(contract.fechaBaja)
    if (!start) { missingStart.add(contract.id); continue }
    if (contract.fechaBaja !== null && !end) { uncertainEnd.add(contract.id); continue }
    if (invoiceDate < start) continue
    if (end !== null && invoiceDate > end) continue
    // An inactive contract without dated baja cannot establish past validity.
    if (end === null && !contract.activo) { uncertainEnd.add(contract.id); continue }
    valid.push(contract)
  }

  // A known valid contract cannot win over another candidate whose dates do not
  // permit historical exclusion. Otherwise an unknown alta/baja would silently
  // force a client assignment for the invoice date.
  if (valid.length !== 1 || missingStart.size > 0 || uncertainEnd.size > 0) {
    const reasons: PhoneCostReasonCode[] = []
    if (valid.length > 1 || (valid.length === 1 && (missingStart.size > 0 || uncertainEnd.size > 0))) reasons.push('TELEFONO_CONTRATO_AMBIGUO')
    if (missingStart.size || uncertainEnd.size || valid.length === 0) {
      if (missingStart.size) reasons.push('VIGENCIA_ALTA_DESCONOCIDA')
      if (uncertainEnd.size) reasons.push('VIGENCIA_BAJA_NO_DETERMINABLE')
      reasons.push('TELEFONO_SIN_CONTRATO_VIGENTE')
    }
    return { client: null, reasons, duplicate: valid.length > 1 || (valid.length === 1 && (missingStart.size > 0 || uncertainEnd.size > 0)), noCurrent: valid.length === 0, missingStart, uncertainEnd }
  }

  const externalId = canonicalExternalIdentity(valid[0].clienteContratoId)
  const candidates = externalId ? (clientsByExternalId.get(externalId) ?? []) : []
  if (candidates.length !== 1) {
    return { client: null, reasons: ['CLIENTE_NO_UNIVOCO'], duplicate: false, noCurrent: false, missingStart, uncertainEnd }
  }
  return { client: candidates[0], reasons: [], duplicate: false, noCurrent: false, missingStart, uncertainEnd }
}

/** Main pure calculation. It intentionally does not mutate, log or expose a telephone. */
export function calculatePhoneCostAnalytics(input: PhoneCostCalculationInput): PhoneCostAnalyticsDto {
  const periodFrom = parseDate(input.periodo.desde)
  const periodTo = parseDate(input.periodo.hasta)
  if (!periodFrom || !periodTo || periodFrom > periodTo) throw new Error('PHONE_COST_PERIOD_INVALID')

  const clientsByContractId = clientMap(input.clientes, client => client.clienteContratoId)
  const clientsByFacturaIspId = clientMap(input.clientes, client => client.clienteFacturaIspId)
  const clientsById = new Map(input.clientes.map(client => [client.id, client]))
  const contractsByPhone = new Map<string, PhoneCostContractInput[]>()
  for (const contract of input.contratos) {
    for (const phone of phonesFromContract(contract.telefonosContrato)) {
      const list = contractsByPhone.get(phone) ?? []
      list.push(contract)
      contractsByPhone.set(phone, list)
    }
  }

  // Banco es sólo censo contextual. No alimenta coste devengado, propuesta,
  // ingreso, cobertura o margen, aunque la relación resulte única.
  let bankMovementsTotal = 0
  let bankMovementsWithPhone = 0
  let bankMovementsWithUniqueClient = 0
  let bankIdentifiedCents = ZERO_CENTS
  for (const movement of input.movimientosBancoTelefono ?? []) {
    const date = parseDate(movement.fecha)
    if (!date || date < periodFrom || date > periodTo) continue
    bankMovementsTotal++
    const labelled = contextualSpanishPhones(movement.texto)
    // A bare token is eligible only because an explicitly typed contract phone
    // corroborates it; it still needs the full unique temporal/client bridge.
    const corroborated = standaloneSpanishPhoneTokens(movement.texto).filter(phone => contractsByPhone.has(phone))
    const phones = [...new Set([...labelled, ...corroborated])]
    if (phones.length !== 1) continue
    bankMovementsWithPhone++
    const resolution = resolvePhoneContract(phones[0], date, contractsByPhone, clientsByContractId)
    if (!resolution.client) continue
    bankMovementsWithUniqueClient++
    const amount = exactPhoneCostCents(movement.importeText)
    if (amount !== null) bankIdentifiedCents += amount
  }

  const income = new Map<number, bigint>()
  const incomeInvoices = new Map<number, number>()
  const customerReasons = new Map<number, Set<PhoneCostReasonCode>>()
  const unresolvedCustomerIds = new Set<string>()
  for (const invoice of input.facturasIsp) {
    const date = parseDate(invoice.fecha)
    if (!date || date < periodFrom || date > periodTo) continue
    const base = exactPhoneCostCents(invoice.baseText)
    const invoiceCustomerId = canonicalExternalIdentity(invoice.clienteFacturaIspId)
    const candidates = invoiceCustomerId ? clientsByFacturaIspId.get(invoiceCustomerId) ?? [] : []
    if (base === null || candidates.length !== 1) {
      if (invoice.clienteFacturaIspId) unresolvedCustomerIds.add(invoice.clienteFacturaIspId)
      continue
    }
    addToMap(income, candidates[0].id, base)
    incomeInvoices.set(candidates[0].id, (incomeInvoices.get(candidates[0].id) ?? 0) + 1)
  }

  const proposed = new Map<number, bigint>()
  const proposedLines = new Map<number, number>()
  const proposedDocuments = new Map<number, Set<string>>()
  const confirmed = new Map<number, bigint>()
  const confirmedFound = new Set<number>()
  const documentRows: PhoneCostDocumentRow[] = []
  const documentCustomers = new Map<string, Set<number>>()
  const documentBases = new Map<string, bigint | null>()
  const lineRevisionsByCustomer = new Map<number, number>()
  const documentRevisionsByCustomer = new Map<number, Set<string>>()
  const phoneNoCurrent = new Set<string>()
  const phoneDuplicate = new Set<string>()
  const missingStart = new Set<number>()
  const uncertainEnd = new Set<number>()
  const noClientPhone = new Set<string>()
  let excludedDocuments = 0
  let lineCount = 0
  let proposedLineCount = 0
  let lineReviewCount = 0
  let rejectedLineControl = 0
  let knownBaseTotal = ZERO_CENTS
  let unknownBaseDocuments = 0
  let baseKnownDocuments = 0
  let documentsWithProposal = 0
  // A hash reused by two FR inputs is never a second source document. The DB
  // adapter also checks this across the staging table; this pure guard keeps
  // fixtures and future callers fail-closed.
  const evidenceDocumentIdsByPdf = new Map<string, Set<string>>()
  for (const document of input.documentosRecibidos) {
    for (const evidence of document.evidenciasServicioUnico ?? []) {
      if (EVIDENCE_HASH.test(evidence.pdfSha256)) {
        const documentIds = evidenceDocumentIdsByPdf.get(evidence.pdfSha256) ?? new Set<string>()
        documentIds.add(document.id)
        evidenceDocumentIdsByPdf.set(evidence.pdfSha256, documentIds)
      }
    }
  }

  for (const document of input.documentosRecibidos) {
    if (!document.economica) { excludedDocuments++; continue }
    const date = parseDate(document.fecha)
    if (!date || date < periodFrom || date > periodTo) continue
    const reasons = new Set<PhoneCostReasonCode>()
    const base = exactPhoneCostCents(document.baseText)
    documentBases.set(document.id, base)
    if (base === null) { reasons.add('BASE_FACTURA_DESCONOCIDA'); unknownBaseDocuments++ }
    else { knownBaseTotal += base; baseKnownDocuments++ }

    const directPhone = normalizeSpanishPhone(document.telefonoServicio)
    if (document.telefonoServicio && !directPhone) reasons.add('TELEFONO_NO_NORMALIZABLE')
    const ocr = phonesFromOcr(document.datosOcrRaw)
    if (ocr.invalid) reasons.add('OCR_INVALIDO')
    const parsedLines = parsePhoneLines(document.lineasDetalleRaw)
    if (parsedLines.invalid) reasons.add('LINEAS_OCR_INVALIDAS')
    const contextualPhones = new Set<string>([...(directPhone ? [directPhone] : []), ...ocr.phones])
    for (const line of parsedLines.lines) for (const phone of line.phones) contextualPhones.add(phone)
    if (!contextualPhones.size) reasons.add('SIN_TELEFONO_EN_CONTEXTO')

    type CandidateLine = { clientId: number; cents: bigint; lineIndex: number }
    const candidateLines: CandidateLine[] = []
    // A staged-evidence-bearing document must resolve through its immutable PDF
    // source. Falling back to a legacy OCR line after a mismatched PDF identity
    // would turn contradictory sources into a silent cost proposal.
    let evidenceBlocksLegacy = (document.evidenciasServicioUnico?.length ?? 0) > 0
    const evidenceByPdf = new Map<string, SingleServiceEvidence>()
    let evidenceInconsistent = false
    for (const evidence of document.evidenciasServicioUnico ?? []) {
      const parsedEvidence = validateSingleServiceEvidence(document, date, base, evidence)
      if (!parsedEvidence
        || evidence.pdfCompartidoEntreFacturas === true
        || (evidenceDocumentIdsByPdf.get(evidence.pdfSha256)?.size ?? 0) > 1) {
        evidenceInconsistent = true
        continue
      }
      // Repeat reads of the immutable same-PDF row coalesce; the base cannot be
      // summed twice merely because it was supplied by two reader paths.
      evidenceByPdf.set(parsedEvidence.pdfSha256, parsedEvidence)
    }

    let evidenceCandidate: CandidateLine | null = null
    if (evidenceByPdf.size > 1) {
      evidenceBlocksLegacy = true
      reasons.add('EVIDENCIA_PDF_AMBIGUA')
    } else if (evidenceByPdf.size === 1) {
      evidenceBlocksLegacy = true
      const evidence = [...evidenceByPdf.values()][0]
      // The staged PDF inventory asserts exactly one service. A distinct phone
      // from semantically parsed FR/OCR fields contradicts that assertion.
      if (contextualPhones.size > 1 || (contextualPhones.size === 1 && !contextualPhones.has(evidence.phone)) || evidenceInconsistent) {
        reasons.add('EVIDENCIA_PDF_INCONSISTENTE')
      } else {
        const resolution = resolvePhoneContractForServicePeriod(
          evidence.phone,
          evidence.serviceFrom,
          evidence.serviceUntil,
          contractsByPhone,
          clientsByContractId,
        )
        resolution.missingStart.forEach(id => missingStart.add(id))
        resolution.uncertainEnd.forEach(id => uncertainEnd.add(id))
        if (resolution.duplicate) phoneDuplicate.add(evidence.phone)
        if (resolution.noCurrent) phoneNoCurrent.add(evidence.phone)
        if (!resolution.client) {
          resolution.reasons.forEach(reason => reasons.add(reason))
          if (resolution.reasons.includes('CLIENTE_NO_UNIVOCO')) noClientPhone.add(evidence.phone)
        } else {
          evidenceCandidate = { clientId: resolution.client.id, cents: evidence.cents, lineIndex: -1 }
          // The immutable PDF service inventory is itself a semantic telephone
          // source; no legacy OCR/FR phone field is required for this path.
          reasons.delete('SIN_TELEFONO_EN_CONTEXTO')
          reasons.add('EVIDENCIA_PDF_SERVICIO_UNICO')
        }
      }
    } else if ((document.evidenciasServicioUnico?.length ?? 0) > 0 && evidenceInconsistent) {
      reasons.add('EVIDENCIA_PDF_INCONSISTENTE')
    }

    if (evidenceCandidate) {
      candidateLines.push(evidenceCandidate)
    } else if (!evidenceBlocksLegacy) {
      for (const line of parsedLines.lines) {
        lineCount++
        if (line.phones.length !== 1) {
          reasons.add('LINEA_MULTIPLE_TELEFONOS')
          lineReviewCount++
          continue
        }
        if (line.baseCents === null) {
          reasons.add(line.reason ?? 'SUBTOTAL_NO_VERIFICADO')
          lineReviewCount++
          continue
        }
        // Válida como texto documental, pero 0 no es un coste asignable ni una
        // propuesta que deba inflar los contadores de líneas o cobertura.
        if (line.baseCents === ZERO_CENTS) continue
        const resolution = resolvePhoneContract(line.phones[0], date, contractsByPhone, clientsByContractId)
        resolution.missingStart.forEach(id => missingStart.add(id))
        resolution.uncertainEnd.forEach(id => uncertainEnd.add(id))
        if (resolution.duplicate) phoneDuplicate.add(line.phones[0])
        if (resolution.noCurrent) phoneNoCurrent.add(line.phones[0])
        if (!resolution.client) {
          resolution.reasons.forEach(reason => reasons.add(reason))
          if (resolution.reasons.includes('CLIENTE_NO_UNIVOCO')) noClientPhone.add(line.phones[0])
          lineReviewCount++
          continue
        }
        candidateLines.push({ clientId: resolution.client.id, cents: line.baseCents, lineIndex: line.lineIndex })
      }
    }

    let documentProposed = ZERO_CENTS
    const candidateSum = candidateLines.reduce((total, line) => total + line.cents, ZERO_CENTS)
    if (base === null) {
      if (candidateLines.length) {
        lineReviewCount += candidateLines.length
        for (const candidate of candidateLines) lineRevisionsByCustomer.set(candidate.clientId, (lineRevisionsByCustomer.get(candidate.clientId) ?? 0) + 1)
      }
    } else if (candidateLines.length && (candidateSum > base || candidateSum < ZERO_CENTS || base < ZERO_CENTS)) {
      reasons.add('SUMA_LINEAS_SUPERA_BASE_FACTURA')
      rejectedLineControl += candidateLines.length
      lineReviewCount += candidateLines.length
      for (const candidate of candidateLines) lineRevisionsByCustomer.set(candidate.clientId, (lineRevisionsByCustomer.get(candidate.clientId) ?? 0) + 1)
    } else {
      for (const candidate of candidateLines) {
        addToMap(proposed, candidate.clientId, candidate.cents)
        proposedLines.set(candidate.clientId, (proposedLines.get(candidate.clientId) ?? 0) + 1)
        const docs = proposedDocuments.get(candidate.clientId) ?? new Set<string>()
        docs.add(document.id)
        proposedDocuments.set(candidate.clientId, docs)
        const customerSet = documentCustomers.get(document.id) ?? new Set<number>()
        customerSet.add(candidate.clientId)
        documentCustomers.set(document.id, customerSet)
        documentProposed += candidate.cents
        proposedLineCount++
      }
      if (documentProposed !== ZERO_CENTS) documentsWithProposal++
    }

    for (const customerId of documentCustomers.get(document.id) ?? []) {
      const docs = documentRevisionsByCustomer.get(customerId) ?? new Set<string>()
      if (reasons.size) docs.add(document.id)
      documentRevisionsByCustomer.set(customerId, docs)
      const specific = customerReasons.get(customerId) ?? new Set<PhoneCostReasonCode>()
      reasons.forEach(reason => specific.add(reason))
      customerReasons.set(customerId, specific)
    }

    documentRows.push({
      facturaId: document.id,
      numeroFactura: document.numFactura ?? null,
      fecha: date,
      proveedor: document.proveedor,
      baseFacturaCentimos: base === null ? null : bigintToCents(base),
      costePropuestoCentimos: bigintToCents(documentProposed),
      baseNoAsignadaCentimos: base === null ? null : bigintToCents(base - documentProposed),
      lineasDetectadas: parsedLines.lines.length,
      lineasPropuestas: base === null || candidateSum > (base ?? ZERO_CENTS) || candidateSum < ZERO_CENTS || (base ?? ZERO_CENTS) < ZERO_CENTS ? 0 : candidateLines.length,
      estado: documentState(base, documentProposed, reasons),
      motivos: uniqueReasons(reasons),
    })
  }

  const validDocumentIds = new Set(documentRows.map(row => row.facturaId))
  const seenConfirmations = new Set<string>()
  for (const cost of input.costesConfirmados ?? []) {
    if (seenConfirmations.has(cost.id) || !validDocumentIds.has(cost.facturaRecibidaId)) continue
    seenConfirmations.add(cost.id)
    // Cobro real no es requisito de devengo. Esta rama separada sólo reconoce
    // una futura asignación durable que sí pruebe línea, cliente y vigencia.
    if (!cost.confirmado || !cost.asignacionAcreditada) continue
    const cents = exactPhoneCostCents(cost.importeText)
    if (cents === null || !clientsById.has(cost.clienteId)) continue
    addToMap(confirmed, cost.clienteId, cents)
    confirmedFound.add(cost.clienteId)
  }

  const allCustomerIds = new Set<number>([
    ...income.keys(), ...proposed.keys(), ...confirmed.keys(),
  ])
  const customerRows: PhoneCostCustomerRow[] = []
  for (const customerId of [...allCustomerIds].sort((a, b) => a - b)) {
    const client = clientsById.get(customerId)
    if (!client) continue
    const revenue = income.get(customerId) ?? ZERO_CENTS
    const proposedCost = proposed.get(customerId) ?? ZERO_CENTS
    const confirmedCost = confirmed.get(customerId)
    const customerDocumentIds = proposedDocuments.get(customerId) ?? new Set<string>()
    let relatedBase: bigint | null = ZERO_CENTS
    for (const docId of customerDocumentIds) {
      const owners = documentCustomers.get(docId) ?? new Set<number>()
      const base = documentBases.get(docId) ?? null
      if (owners.size !== 1 || base === null) { relatedBase = null; break }
      relatedBase += base
    }
    const revisions = customerReasons.get(customerId) ?? new Set<PhoneCostReasonCode>()
    const marginConfirmed = confirmedFound.has(customerId) ? revenue - (confirmedCost ?? ZERO_CENTS) : null
    // A per-customer potential margin is meaningful only when every documented
    // cent in its uniquely related source documents is covered by proposals.
    // In particular, revenue - 0 is not a margin when no cost was attributable.
    const potentialMarginKnown = proposedCost !== ZERO_CENTS && relatedBase !== null && relatedBase === proposedCost
    customerRows.push({
      cliente: { id: client.id, nombre: client.nombre },
      ingresos: { baseCentimos: bigintToCents(revenue), facturas: incomeInvoices.get(customerId) ?? 0 },
      coste: {
        asignablePropuestoCentimos: bigintToCents(proposedCost),
        confirmadoCentimos: confirmedFound.has(customerId) ? bigintToCents(confirmedCost ?? ZERO_CENTS) : null,
        baseDocumentadaRelacionadaCentimos: relatedBase === null ? null : bigintToCents(relatedBase),
        porcentajeAsignablePorCosteBaseBp: relatedBase === null ? null : percentageBasisPoints(proposedCost, relatedBase),
        documentos: customerDocumentIds.size,
        lineasPropuestas: proposedLines.get(customerId) ?? 0,
      },
      margenConfirmado: { centimos: marginConfirmed === null ? null : bigintToCents(marginConfirmed), porcentajeBp: null },
      margenPotencialEstimado: { centimos: potentialMarginKnown ? bigintToCents(revenue - proposedCost) : null, porcentajeBp: null, costeCompletoAsegurado: false },
      revision: {
        motivos: uniqueReasons(revisions),
        documentos: documentRevisionsByCustomer.get(customerId)?.size ?? 0,
        lineas: lineRevisionsByCustomer.get(customerId) ?? 0,
      },
    })
  }

  const revenueTotal = [...income.values()].reduce((total, value) => total + value, ZERO_CENTS)
  const proposedTotal = [...proposed.values()].reduce((total, value) => total + value, ZERO_CENTS)
  const confirmedTotal = confirmedFound.size ? [...confirmed.values()].reduce((total, value) => total + value, ZERO_CENTS) : null
  const baseUnallocated = documentRows.reduce((total, document) => total + (document.baseNoAsignadaCentimos === null ? ZERO_CENTS : BigInt(document.baseNoAsignadaCentimos)), ZERO_CENTS)
  const potentialMarginKnown = unknownBaseDocuments === 0 && baseUnallocated === ZERO_CENTS
  const totalReasons = new Set<PhoneCostReasonCode>()
  if (unknownBaseDocuments) totalReasons.add('BASE_FACTURA_DESCONOCIDA')
  if (unresolvedCustomerIds.size || noClientPhone.size) totalReasons.add('CLIENTE_NO_UNIVOCO')

  return {
    stagingOnly: true,
    automaticas: false,
    proposalsOnly: true,
    periodo: { desde: periodFrom, hasta: periodTo, baseTemporal: 'fecha_factura' },
    proveedor: { clave: 'TELEFONICA', documentosEncontrados: input.documentosRecibidos.length, documentosIncluidos: documentRows.length },
    totales: {
      ingresoBaseCentimos: bigintToCents(revenueTotal),
      // Unknown document amounts remain a separate null bucket. The known base is
      // still measurable and is the only denominator used for assignable coverage.
      costeBaseDocumentadoCentimos: knownBaseTotal !== ZERO_CENTS ? bigintToCents(knownBaseTotal) : unknownBaseDocuments ? null : bigintToCents(ZERO_CENTS),
      costeAsignablePropuestoCentimos: bigintToCents(proposedTotal),
      costeConfirmadoCentimos: confirmedTotal === null ? null : bigintToCents(confirmedTotal),
      porcentajeAsignablePorCosteBaseBp: percentageBasisPoints(proposedTotal, knownBaseTotal),
      bolsaSinAsignar: {
        baseConocidaNoAsignadaCentimos: bigintToCents(baseUnallocated),
        documentosBaseConocidaNoAsignada: documentRows.filter(document => document.baseNoAsignadaCentimos !== null && document.baseNoAsignadaCentimos !== '0').length,
        documentosImporteDesconocido: unknownBaseDocuments,
        importeDesconocidoCentimos: null,
      },
      margenConfirmado: {
        centimos: confirmedTotal === null ? null : bigintToCents(revenueTotal - confirmedTotal),
        porcentajeBp: null,
        caveat: 'Sólo resta asignaciones durables acreditadas; el campo legacy confirmado no acredita asignación, cliente ni vigencia. No acredita coste completo.',
      },
      margenPotencialEstimado: {
        centimos: potentialMarginKnown ? bigintToCents(revenueTotal - proposedTotal) : null,
        porcentajeBp: null,
        costeCompletoAsegurado: false,
        caveat: potentialMarginKnown
          ? 'Resta propuestas documentales, incluidas evidencias PDF staging de snapshot inmutable pendientes de validación humana; no es margen confirmado, no garantiza cobertura futura ni acredita el PDF online actual.'
          : 'No calculable como total: existe base sin asignar o importe documental desconocido; no se presenta ingreso menos cero como beneficio.',
      },
      documentos: { total: documentRows.length, conBaseConocida: baseKnownDocuments, conCosteLineaPropuesto: documentsWithProposal },
      lineas: { detectadasConContexto: lineCount, propuestas: proposedLineCount, enRevision: lineReviewCount },
    },
    clientes: customerRows.sort((a, b) => {
      const left = BigInt(a.ingresos.baseCentimos)
      const right = BigInt(b.ingresos.baseCentimos)
      return left === right ? a.cliente.id - b.cliente.id : left > right ? -1 : 1
    }),
    documentos: documentRows.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.facturaId.localeCompare(b.facturaId)),
    deduplicacion: {
      documentosRecibidosExcluidos: excludedDocuments,
      facturasEmitidasEspejoNoSumadas: input.facturasEmitidasEspejo.filter(invoice => invoice.facturaIspId !== null).length,
      telefonosConContratoDuplicado: phoneDuplicate.size,
      telefonosSinContratoVigente: phoneNoCurrent.size,
      contratosSinFechaInicio: missingStart.size,
      contratosConFechaBajaNoDeterminable: uncertainEnd.size,
      clientesNoUnivocos: noClientPhone.size + unresolvedCustomerIds.size,
      lineasRechazadasPorControlBase: rejectedLineControl,
    },
    bancoTelefono: {
      estado: 'CALCULADO_SIN_ASIGNAR_COSTE',
      usadoEnCoste: false,
      movimientosTotal: bankMovementsTotal,
      movimientosConTelefono: bankMovementsWithPhone,
      movimientosConClienteUnico: bankMovementsWithUniqueClient,
      importeBancoIdentificadoCentimos: bigintToCents(bankIdentifiedCents),
      mensaje: 'Censo contextual banco→teléfono→contrato→cliente calculado; sus importes no se usan como coste, ingreso, pago exigido ni margen.',
    },
    avisos: uniqueReasons(totalReasons),
  }
}
