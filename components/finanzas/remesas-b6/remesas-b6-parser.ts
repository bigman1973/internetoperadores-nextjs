import {
  B6_FACTURAS_SOURCE_HASH_VERSION,
  B6_MAX_OFFSET,
  B6_MAX_QUERY_LENGTH,
  B6_PAGE_SIZE,
  type AsociarDevolucionPayloadB6,
  type AsociarFacturasPayloadB6,
  type DevolucionB4B6,
  type DevolucionesB4ResponseB6,
  type FacturaISPChoiceB6,
  type FacturasISPChoicesResponseB6,
  type FuenteFechaB6,
  type FuenteImporteB6,
  type FuenteFacturaB6,
  type MiembrosRemesaResponseB6,
  type PaginacionB6,
  type RemesaB6,
  type RemesasListaResponseB6,
  B6_MAX_MIEMBROS_REMESA,
} from './remesas-b6-types'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fail(message: string): never {
  throw new Error(`LECTURA_B6_INVALIDA: ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) fail(`${label} debe ser un objeto.`)
  return value
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} debe ser texto.`)
  return value
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null
  return string(value, label)
}

function integer(value: unknown, label: string, minimum?: number): number {
  if (!Number.isSafeInteger(value) || (minimum !== undefined && (value as number) < minimum)) {
    fail(`${label} debe ser un entero seguro${minimum === undefined ? '' : ` >= ${minimum}`}.`)
  }
  return value as number
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} debe ser booleano.`)
  return value
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label)
}

function parseFecha(value: unknown, label: string): FuenteFechaB6 {
  const raw = record(value, label)
  const iso = nullableString(raw.iso, `${label}.iso`)
  const exacta = boolean(raw.exacta, `${label}.exacta`)
  const codigoFuente = nullableString(raw.codigoFuente, `${label}.codigoFuente`)
  if (exacta && (!iso || codigoFuente !== null)) fail(`${label} exacta debe incluir ISO y no código de error.`)
  if (!exacta && codigoFuente === null) fail(`${label} no exacta debe conservar código fuente.`)
  return { iso, exacta, codigoFuente }
}

function parseImporte(value: unknown, label: string): FuenteImporteB6 {
  const raw = record(value, label)
  const texto = nullableString(raw.texto, `${label}.texto`)
  const centimos = nullableInteger(raw.centimos, `${label}.centimos`)
  const exacto = boolean(raw.exacto, `${label}.exacto`)
  const codigoFuente = nullableString(raw.codigoFuente, `${label}.codigoFuente`)
  if (exacto && (centimos === null || texto === null || codigoFuente !== null)) {
    fail(`${label} exacto debe incluir texto y céntimos, sin código de error.`)
  }
  if (!exacto && codigoFuente === null) fail(`${label} no exacto debe conservar código fuente.`)
  return { texto, centimos, exacto, codigoFuente }
}

function parsePaginacion(value: unknown): PaginacionB6 {
  const raw = record(value, 'paginacion')
  const limit = integer(raw.limit, 'paginacion.limit', 1)
  const offset = integer(raw.offset, 'paginacion.offset', 0)
  const total = integer(raw.total, 'paginacion.total', 0)
  if (limit > B6_PAGE_SIZE || offset > B6_MAX_OFFSET) fail('paginacion fuera de los límites B6.')
  return { limit, offset, total }
}

function parseRemesa(value: unknown): RemesaB6 {
  const raw = record(value, 'remesa')
  const targetRaw = raw.targetSource
  const targetSource = targetRaw === null ? null : (() => {
    const source = record(targetRaw, 'remesa.targetSource')
    return {
      totalCentimos: integer(source.totalCentimos, 'remesa.targetSource.totalCentimos'),
      sourceFingerprintSHA256: sha256Hex(string(source.sourceFingerprintSHA256, 'remesa.targetSource.sourceFingerprintSHA256'), 'remesa.targetSource.sourceFingerprintSHA256'),
    }
  })()
  return {
    id: integer(raw.id, 'remesa.id', 1),
    ispGestionId: integer(raw.ispGestionId, 'remesa.ispGestionId', 1),
    nombre: nullableString(raw.nombre, 'remesa.nombre'),
    fecha: parseFecha(raw.fecha, 'remesa.fecha'),
    importe: parseImporte(raw.importe, 'remesa.importe'),
    numeroRegistros: nullableInteger(raw.numeroRegistros, 'remesa.numeroRegistros'),
    targetSource,
  }
}

function parseFacturaSource(value: unknown): FuenteFacturaB6 {
  const raw = record(value, 'factura.source')
  return {
    id: integer(raw.id, 'factura.source.id', 1),
    ispGestionId: integer(raw.ispGestionId, 'factura.source.ispGestionId', 1),
    fecha: isoDate(string(raw.fecha, 'factura.source.fecha'), 'factura.source.fecha'),
    totalCentimos: integer(raw.totalCentimos, 'factura.source.totalCentimos'),
    sourceFingerprintSHA256: sha256Hex(string(raw.sourceFingerprintSHA256, 'factura.source.sourceFingerprintSHA256'), 'factura.source.sourceFingerprintSHA256'),
  }
}

function parseFactura(value: unknown): FacturaISPChoiceB6 {
  const raw = record(value, 'factura')
  const fiRaw = raw.facturaEmitidaActual
  const facturaEmitidaActual = fiRaw === null ? null : (() => {
    const fi = record(fiRaw, 'factura.facturaEmitidaActual')
    return {
      id: string(fi.id, 'factura.facturaEmitidaActual.id'),
      importe: parseImporte(fi.importe, 'factura.facturaEmitidaActual.importe'),
      coincideConISP: boolean(fi.coincideConISP, 'factura.facturaEmitidaActual.coincideConISP'),
    }
  })()
  return {
    id: integer(raw.id, 'factura.id', 1),
    ispGestionId: integer(raw.ispGestionId, 'factura.ispGestionId', 1),
    serieFactura: nullableString(raw.serieFactura, 'factura.serieFactura'),
    numeroDocumento: nullableString(raw.numeroDocumento, 'factura.numeroDocumento'),
    nombreCompleto: nullableString(raw.nombreCompleto, 'factura.nombreCompleto'),
    codigoCliente: nullableString(raw.codigoCliente, 'factura.codigoCliente'),
    fecha: parseFecha(raw.fecha, 'factura.fecha'),
    importe: parseImporte(raw.importe, 'factura.importe'),
    remesaId: nullableInteger(raw.remesaId, 'factura.remesaId'),
    facturaEmitidaActual,
    source: raw.source === null ? null : parseFacturaSource(raw.source),
    tieneEvidenciaDirectaB4: boolean(raw.tieneEvidenciaDirectaB4, 'factura.tieneEvidenciaDirectaB4'),
  }
}

function parseDevolucion(value: unknown): DevolucionB4B6 {
  const raw = record(value, 'devolucionB4')
  if (raw.facturaAsignadaId !== null) fail('devolucionB4.facturaAsignadaId debe ser null para ser candidata.')
  return {
    vinculoId: uuid(string(raw.vinculoId, 'devolucionB4.vinculoId'), 'devolucionB4.vinculoId'),
    movimientoId: string(raw.movimientoId, 'devolucionB4.movimientoId'),
    remesaId: integer(raw.remesaId, 'devolucionB4.remesaId', 1),
    fecha: isoDate(string(raw.fecha, 'devolucionB4.fecha'), 'devolucionB4.fecha'),
    concepto: string(raw.concepto, 'devolucionB4.concepto'),
    importeDocumentoCentimos: integer(raw.importeDocumentoCentimos, 'devolucionB4.importeDocumentoCentimos'),
    importeBancoCentimos: integer(raw.importeBancoCentimos, 'devolucionB4.importeBancoCentimos'),
    facturaAsignadaId: null,
  }
}

function parseItems(value: unknown, parser: (item: unknown) => unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} debe ser una lista.`)
  return value.map(parser)
}

function sha256Hex(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) fail(`${label} debe ser SHA-256 hexadecimal.`)
  return value.toLowerCase()
}

function uuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(`${label} debe ser UUID.`)
  return value.toLowerCase()
}

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} debe ser una fecha ISO YYYY-MM-DD.`)
  return value
}

/** Rechaza una lectura parcial: jamás sustituye fuentes desconocidas por ceros. */
export function parseRemesasListaResponseB6(value: unknown): RemesasListaResponseB6 {
  const raw = record(value, 'respuesta')
  if (raw.recurso !== 'remesasLista') fail('recurso esperado remesasLista.')
  return {
    recurso: 'remesasLista',
    paginacion: parsePaginacion(raw.paginacion),
    items: parseItems(raw.items, parseRemesa, 'items') as readonly RemesaB6[],
  }
}

export function parseFacturasISPChoicesResponseB6(value: unknown): FacturasISPChoicesResponseB6 {
  const raw = record(value, 'respuesta')
  if (raw.recurso !== 'facturasISPchoices') fail('recurso esperado facturasISPchoices.')
  return {
    recurso: 'facturasISPchoices',
    remesaId: nullableInteger(raw.remesaId, 'remesaId'),
    paginacion: parsePaginacion(raw.paginacion),
    items: parseItems(raw.items, parseFactura, 'items') as readonly FacturaISPChoiceB6[],
  }
}

/** La fuente de miembros es independiente del catálogo de candidatas. */
export function parseMiembrosRemesaResponseB6(value: unknown): MiembrosRemesaResponseB6 {
  const raw = record(value, 'respuesta')
  if (raw.recurso !== 'miembrosRemesa') fail('recurso esperado miembrosRemesa.')
  const remesaId = integer(raw.remesaId, 'remesaId', 1)
  const paginacion = parsePaginacion(raw.paginacion)
  if (paginacion.total > B6_MAX_MIEMBROS_REMESA) fail('membresia de remesa supera el límite contractual B6.')
  const items = parseItems(raw.items, parseFactura, 'items') as readonly FacturaISPChoiceB6[]
  if (items.some((factura) => factura.remesaId !== remesaId)) fail('miembrosRemesa contiene una factura de otra remesa.')
  return { recurso: 'miembrosRemesa', remesaId, paginacion, items }
}

export function parseDevolucionesB4ResponseB6(value: unknown): DevolucionesB4ResponseB6 {
  const raw = record(value, 'respuesta')
  if (raw.recurso !== 'devolucionesB4') fail('recurso esperado devolucionesB4.')
  return {
    recurso: 'devolucionesB4',
    paginacion: parsePaginacion(raw.paginacion),
    items: parseItems(raw.items, parseDevolucion, 'items') as readonly DevolucionB4B6[],
  }
}

export function backendMessageB6(value: unknown, fallback: string): string {
  if (!isRecord(value) || typeof value.error !== 'string' || !value.error.trim()) return fallback
  return value.error
}

export function codigoBackendB6(value: unknown): string | null {
  return isRecord(value) && typeof value.codigo === 'string' ? value.codigo : null
}

export function b6ReadUrl(
  recurso: 'remesasLista' | 'facturasISPchoices' | 'miembrosRemesa' | 'devolucionesB4',
  options: Readonly<{ limit?: number; offset?: number; q?: string; remesaId?: number }> = {},
): string {
  const limit = options.limit ?? B6_PAGE_SIZE
  const offset = options.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || limit > B6_PAGE_SIZE || !Number.isInteger(offset) || offset < 0 || offset > B6_MAX_OFFSET) {
    throw new Error('PAGINACION_UI_B6_INVALIDA')
  }
  const params = new URLSearchParams({ recurso, limit: String(limit), offset: String(offset) })
  const q = options.q?.trim() ?? ''
  if (q.length > B6_MAX_QUERY_LENGTH) throw new Error('QUERY_UI_B6_INVALIDA')
  if (q) params.set('q', q)
  if (recurso === 'miembrosRemesa' && options.remesaId === undefined) throw new Error('REMESA_UI_B6_OBLIGATORIA')
  if (options.remesaId !== undefined) {
    if (!Number.isSafeInteger(options.remesaId) || options.remesaId < 1) throw new Error('REMESA_UI_B6_INVALIDA')
    params.set('remesaId', String(options.remesaId))
  }
  return `/api/admin/finanzas/remesas/b6?${params.toString()}`
}

/** JSON canónico equivalente al contrato B6 de servidor para valores JSON. */
export function canonicalJsonB6(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('B6_CANONICAL_NON_FINITE_NUMBER')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonB6).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonB6(value[key])}`).join(',')}}`
  }
  throw new Error('B6_CANONICAL_UNSUPPORTED_VALUE')
}

/** WebCrypto del navegador exclusivamente; no importa crypto de Node. */
export async function sha256CanonicalB6(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WEBCRYPTO_NO_DISPONIBLE')
  const bytes = new TextEncoder().encode(canonicalJsonB6(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Debe coincidir byte a byte con facturasSourceHash del servicio B6. */
export async function facturasSourceHashB6(facturas: readonly FacturaISPChoiceB6[]): Promise<string> {
  const sourceRows = facturas.map((factura) => {
    if (!factura.source) throw new Error(`FUENTE_FACTURA_DESCONOCIDA:${factura.id}`)
    return {
      id: factura.source.id,
      ispGestionId: factura.source.ispGestionId,
      fecha: factura.source.fecha,
      totalCentimos: factura.source.totalCentimos,
    }
  }).sort((left, right) => left.id - right.id)
  for (let index = 1; index < sourceRows.length; index += 1) {
    if (sourceRows[index - 1].id === sourceRows[index].id) throw new Error('B6_SOURCE_DUPLICATE_FACTURA')
  }
  return sha256CanonicalB6({ version: B6_FACTURAS_SOURCE_HASH_VERSION, facturas: sourceRows })
}

export function sumSignedCentimosB6(facturas: readonly FacturaISPChoiceB6[]): number {
  const total = facturas.reduce((sum, factura) => {
    if (!factura.source || !Number.isSafeInteger(factura.source.totalCentimos)) throw new Error(`FUENTE_FACTURA_DESCONOCIDA:${factura.id}`)
    return sum + factura.source.totalCentimos
  }, 0)
  if (!Number.isSafeInteger(total)) throw new Error('SUMA_CENTIMOS_NO_SEGURA')
  return total
}

export function remesaPuedeAsociarseB6(remesa: RemesaB6 | null): remesa is RemesaB6 & { targetSource: NonNullable<RemesaB6['targetSource']> } {
  return Boolean(
    remesa?.targetSource
    && remesa.fecha.exacta
    && remesa.importe.exacto
    && remesa.importe.centimos === remesa.targetSource.totalCentimos,
  )
}

export function facturaPuedeAsociarseB6(factura: FacturaISPChoiceB6, remesaId: number): boolean {
  return Boolean(
    factura.source
    && factura.fecha.exacta
    && factura.importe.exacto
    && factura.importe.centimos === factura.source.totalCentimos
    && (factura.remesaId === null || factura.remesaId === remesaId),
  )
}

export function facturaEsMiembroActualB6(factura: FacturaISPChoiceB6, remesaId: number): boolean {
  return factura.remesaId === remesaId && facturaPuedeAsociarseB6(factura, remesaId)
}

/** No exige recorrer el catálogo global: acredita sólo la fuente de miembros. */
export function puedePrepararAsociacionFacturasB6(
  remesa: RemesaB6 | null,
  facturasSeleccionadas: readonly FacturaISPChoiceB6[],
  completeMemberRead: boolean,
): boolean {
  if (!completeMemberRead || !remesaPuedeAsociarseB6(remesa) || facturasSeleccionadas.length === 0) return false
  if (facturasSeleccionadas.some((factura) => !facturaPuedeAsociarseB6(factura, remesa.id))) return false
  try {
    return sumSignedCentimosB6(facturasSeleccionadas) === remesa.targetSource.totalCentimos
  } catch {
    return false
  }
}

export function crearIdempotencyKeyB6(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('WEBCRYPTO_UUID_NO_DISPONIBLE')
  return globalThis.crypto.randomUUID()
}

export function crearPayloadAsociarFacturasB6(
  remesaId: number,
  totalRemesaCentimos: number,
  expectedRemesaHashSHA256: string,
  facturaIdsISP: readonly number[],
  expectedFacturasHashSHA256: string,
  idempotencyKey: string,
): AsociarFacturasPayloadB6 {
  const ids = [...facturaIdsISP]
  if (!Number.isSafeInteger(remesaId) || remesaId < 1 || !Number.isSafeInteger(totalRemesaCentimos) || totalRemesaCentimos === 0 || ids.length < 1 || new Set(ids).size !== ids.length) {
    throw new Error('PAYLOAD_FACTURAS_B6_INVALIDO')
  }
  return {
    action: 'asociar_facturas', remesaId, facturaIdsISP: ids.sort((a, b) => a - b), confirmacion: true,
    idempotencyKey: uuid(idempotencyKey, 'idempotencyKey'), expectedRemesaTotalCentimos: totalRemesaCentimos,
    expectedRemesaHashSHA256: sha256Hex(expectedRemesaHashSHA256, 'expectedRemesaHashSHA256'),
    expectedFacturasHashSHA256: sha256Hex(expectedFacturasHashSHA256, 'expectedFacturasHashSHA256'),
  }
}

export function crearPayloadAsociarDevolucionB6(
  remesaId: number,
  facturaISPId: number,
  vinculoId: string,
  movimientoId: string,
  idempotencyKey: string,
): AsociarDevolucionPayloadB6 {
  if (!Number.isSafeInteger(remesaId) || remesaId < 1 || !Number.isSafeInteger(facturaISPId) || facturaISPId < 1 || !movimientoId) {
    throw new Error('PAYLOAD_DEVOLUCION_B6_INVALIDO')
  }
  return {
    action: 'asociar_devolucion', remesaId, facturaISPId, vinculoId: uuid(vinculoId, 'vinculoId'),
    movimientoId, confirmacion: true, idempotencyKey: uuid(idempotencyKey, 'idempotencyKey'),
  }
}

export function formatCentimosB6(centimos: number): string {
  if (!Number.isSafeInteger(centimos)) return 'Fuente desconocida'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(centimos / 100)
}
