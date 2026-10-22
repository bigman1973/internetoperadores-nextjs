export type Centro = Readonly<{
  id: string
  codigo: string
  nombre: string
  activo: boolean
  version: number
}>

export type Gap = Readonly<{
  codigo: string
  lineas: number
  detalle: string
}>

export type AnaliticaItem = Readonly<{
  centroCosteFinanzasId: string | null
  codigo: string | null
  nombre: string | null
  activo: boolean | null
  fechaOperacion: string
  lineas: number
  /** Exact conversion from a JSON safe integer; never a UI aggregate. */
  importeDocumentalConfirmadoPorCentroCentimos: bigint
}>

export type AnaliticaResponse = Readonly<{
  recurso: 'analitica'
  fechaCorte: string | null
  moneda: 'EUR'
  etiquetaMoneda: 'EUR'
  etiquetaImporte: 'importe documental confirmado por centro'
  sinProrrateo: true
  items: readonly AnaliticaItem[]
  gaps: readonly Gap[]
}>

export type Linea = Readonly<{
  id: string
  movimientoId: string
  referencia: string
  fechaOperacion: string
  centroCosteFinanzasId: string | null
  centroCosteCodigo: string | null
  versionCentroCoste: number
}>

export type Paginacion = Readonly<{
  pagina: number
  limit: number
  siguientePagina: number | null
}>

export type LineasResponse = Readonly<{
  recurso: 'lineas-confirmadas'
  items: readonly Linea[]
  paginacion: Paginacion
  gaps: readonly Gap[]
}>

export class CostCenterPayloadError extends Error {
  constructor(public readonly path: string, expected: string) {
    super(`Respuesta B8 inválida en ${path}: se esperaba ${expected}. No se sustituyen datos desconocidos por cero.`)
    this.name = 'CostCenterPayloadError'
  }
}

type JsonRecord = Record<string, unknown>

function fail(path: string, expected: string): never {
  throw new CostCenterPayloadError(path, expected)
}

function record(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'un objeto')
  return value as JsonRecord
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, 'un array')
  return value
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(path, 'una cadena no vacía')
  return value
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  return nonEmptyString(value, path)
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'un booleano')
  return value
}

function nullableBoolean(value: unknown, path: string): boolean | null {
  if (value === null) return null
  return boolean(value, path)
}

function safeInteger(value: unknown, path: string, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    fail(path, min === 0 ? 'un entero seguro no negativo' : 'un entero seguro positivo')
  }
  return value
}

function nullableIsoDate(value: unknown, path: string): string | null {
  if (value === null) return null
  return isoDate(value, path)
}

function isoDate(value: unknown, path: string): string {
  const text = nonEmptyString(value, path)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(path, 'una fecha YYYY-MM-DD')
  const date = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) fail(path, 'una fecha de calendario válida YYYY-MM-DD')
  return text
}

function gaps(value: unknown, path: string): readonly Gap[] {
  return array(value, path).map((entry, index) => {
    const item = record(entry, `${path}[${index}]`)
    return {
      codigo: nonEmptyString(item.codigo, `${path}[${index}].codigo`),
      lineas: safeInteger(item.lineas, `${path}[${index}].lineas`, 1),
      detalle: nonEmptyString(item.detalle, `${path}[${index}].detalle`),
    }
  })
}

function centro(value: unknown, path: string): Centro {
  const item = record(value, path)
  return {
    id: nonEmptyString(item.id, `${path}.id`),
    codigo: nonEmptyString(item.codigo, `${path}.codigo`),
    nombre: nonEmptyString(item.nombre, `${path}.nombre`),
    activo: boolean(item.activo, `${path}.activo`),
    version: safeInteger(item.version, `${path}.version`, 0),
  }
}

/**
 * Parses only the response shape served by recurso=centros. Every value rendered
 * or used in a mutation is validated; this deliberately does not invent defaults.
 */
export function parseCatalogResponse(value: unknown): readonly Centro[] {
  const body = record(value, '$')
  if (body.recurso !== 'centros') fail('$.recurso', '"centros"')
  return array(body.items, '$.items').map((item, index) => centro(item, `$.items[${index}]`))
}

/**
 * Converts the service's JSON-safe-integer cents directly to BigInt. It rejects
 * floats and unsafe numbers before conversion, so no monetary precision is lost.
 */
function centimos(value: unknown, path: string): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail(path, 'un importe en céntimos que sea number entero seguro')
  }
  return BigInt(value)
}

export function parseAnaliticaResponse(value: unknown): AnaliticaResponse {
  const body = record(value, '$')
  if (body.recurso !== 'analitica') fail('$.recurso', '"analitica"')
  if (body.moneda !== 'EUR') fail('$.moneda', '"EUR"')
  if (body.etiquetaMoneda !== 'EUR') fail('$.etiquetaMoneda', '"EUR"')
  if (body.etiquetaImporte !== 'importe documental confirmado por centro') {
    fail('$.etiquetaImporte', 'la etiqueta documental B8 esperada')
  }
  if (body.sinProrrateo !== true) fail('$.sinProrrateo', 'true')

  const items = array(body.items, '$.items').map((entry, index): AnaliticaItem => {
    const item = record(entry, `$.items[${index}]`)
    const centroId = nullableString(item.centroCosteFinanzasId, `$.items[${index}].centroCosteFinanzasId`)
    const codigo = nullableString(item.codigo, `$.items[${index}].codigo`)
    const nombre = nullableString(item.nombre, `$.items[${index}].nombre`)
    const activo = nullableBoolean(item.activo, `$.items[${index}].activo`)
    if (centroId === null && (codigo !== null || nombre !== null || activo !== null)) {
      fail(`$.items[${index}]`, 'campos de centro nulos cuando no hay centro')
    }
    if (centroId !== null && (codigo === null || nombre === null || activo === null)) {
      fail(`$.items[${index}]`, 'campos completos para el centro informado')
    }
    return {
      centroCosteFinanzasId: centroId,
      codigo,
      nombre,
      activo,
      fechaOperacion: isoDate(item.fechaOperacion, `$.items[${index}].fechaOperacion`),
      lineas: safeInteger(item.lineas, `$.items[${index}].lineas`, 1),
      importeDocumentalConfirmadoPorCentroCentimos: centimos(item.importeDocumentalConfirmadoPorCentroCentimos, `$.items[${index}].importeDocumentalConfirmadoPorCentroCentimos`),
    }
  })

  return {
    recurso: 'analitica',
    fechaCorte: nullableIsoDate(body.fechaCorte, '$.fechaCorte'),
    moneda: 'EUR',
    etiquetaMoneda: 'EUR',
    etiquetaImporte: 'importe documental confirmado por centro',
    sinProrrateo: true,
    items,
    gaps: gaps(body.gaps, '$.gaps'),
  }
}

export function parseLineasResponse(value: unknown): LineasResponse {
  const body = record(value, '$')
  if (body.recurso !== 'lineas-confirmadas') fail('$.recurso', '"lineas-confirmadas"')
  const paginationBody = record(body.paginacion, '$.paginacion')
  const pagina = safeInteger(paginationBody.pagina, '$.paginacion.pagina', 1)
  const limit = safeInteger(paginationBody.limit, '$.paginacion.limit', 1)
  const siguientePagina = paginationBody.siguientePagina === null
    ? null
    : safeInteger(paginationBody.siguientePagina, '$.paginacion.siguientePagina', 1)
  if (siguientePagina !== null && siguientePagina !== pagina + 1) {
    fail('$.paginacion.siguientePagina', 'la página siguiente inmediata o null')
  }

  const items = array(body.items, '$.items').map((entry, index): Linea => {
    const item = record(entry, `$.items[${index}]`)
    const centroId = nullableString(item.centroCosteFinanzasId, `$.items[${index}].centroCosteFinanzasId`)
    const codigo = nullableString(item.centroCosteCodigo, `$.items[${index}].centroCosteCodigo`)
    if ((centroId === null) !== (codigo === null)) {
      fail(`$.items[${index}]`, 'centroCosteFinanzasId y centroCosteCodigo ambos informados o ambos null')
    }
    return {
      id: nonEmptyString(item.id, `$.items[${index}].id`),
      movimientoId: nonEmptyString(item.movimientoId, `$.items[${index}].movimientoId`),
      referencia: nonEmptyString(item.referencia, `$.items[${index}].referencia`),
      fechaOperacion: isoDate(item.fechaOperacion, `$.items[${index}].fechaOperacion`),
      centroCosteFinanzasId: centroId,
      centroCosteCodigo: codigo,
      versionCentroCoste: safeInteger(item.versionCentroCoste, `$.items[${index}].versionCentroCoste`, 0),
    }
  })

  return {
    recurso: 'lineas-confirmadas',
    items,
    paginacion: { pagina, limit, siguientePagina },
    gaps: gaps(body.gaps, '$.gaps'),
  }
}

/** Exact, signed EUR rendering from BigInt cents; never divides through Number. */
export function formatEuroCentimos(centimosValue: bigint): string {
  const negative = centimosValue < BigInt(0)
  const absolute = negative ? -centimosValue : centimosValue
  const euros = absolute / BigInt(100)
  const cents = (absolute % BigInt(100)).toString().padStart(2, '0')
  const groupedEuros = new Intl.NumberFormat('es-ES', {
    useGrouping: true,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(euros)
  return `${negative ? '-' : ''}${groupedEuros},${cents}\u00a0€`
}

export function isCalendarDate(value: string): boolean {
  try {
    return isoDate(value, 'fecha') === value
  } catch {
    return false
  }
}
