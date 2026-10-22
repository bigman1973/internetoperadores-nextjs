/**
 * Catálogo B3 de movimientos bancarios. Es deliberadamente independiente de
 * CategoriaImputacion y de los centros de coste: no reutiliza ninguna dimensión
 * de rentabilidad ni crea valores desde conceptos o reglas históricas.
 */

export const CATEGORIAS_MOVIMIENTO = [
  'Estructura',
  'Operadora',
  'Draxton',
  'Vola',
  'Sotic',
  'Impuestos',
  'Sueldos y Salarios',
  'Dietas',
  'Desplazamientos',
  'Gastos Financieros',
  'Comisiones V-Valley',
  'Comisiones Draxton',
  'Comisiones Bancos',
  'Retenciones',
  'Tesoreria',
  'Traspaso',
  'Proyectos Singulares',
  'ZOOM',
  'Hotspot',
  'Morosos',
  'Otros Gastos',
  'Gastos Devoluciones',
  'Embargos',
] as const

export const TIPOS_MOVIMIENTO = [
  'Factura',
  'IVA',
  'IRPF',
  'IS',
  'SS',
  'Nómina',
  'Domiciliación',
  'Transferencia',
  'Débito',
  'Confirming',
  'Remesa',
  'Préstamo',
  'Comisión',
  'Suscripción',
  'Devolución',
] as const

export type CategoriaMovimiento = typeof CATEGORIAS_MOVIMIENTO[number]
export type TipoMovimiento = typeof TIPOS_MOVIMIENTO[number]

type TipoCatalogo = 'CATEGORIA' | 'TIPO'

export interface ErrorCatalogoMovimiento {
  ok: false
  codigo: 'CATEGORIA_NO_PERMITIDA' | 'TIPO_NO_PERMITIDO'
  mensaje: string
  valorOriginal: unknown
}

export interface ValorHistoricoCatalogo<T extends string> {
  valor: T | string | null
  valorOriginal: unknown
  esLegacy: boolean
  fueAlias: boolean
}

export type ResultadoCategoriaNueva =
  | { ok: true; valor: CategoriaMovimiento; fueAlias: boolean }
  | ErrorCatalogoMovimiento

export type ResultadoTipoMovimientoNuevo =
  | { ok: true; valor: TipoMovimiento; fueAlias: boolean }
  | ErrorCatalogoMovimiento

export interface DeteccionComision {
  esComisionPositiva: boolean
  importe: number | null
  motivo: 'SIN_TEXTO_COMISION' | 'COMISION_SIN_IMPORTE' | 'COMISION_CERO_O_NEGATIVA' | 'COMISION_POSITIVA'
}

export interface IdentidadPropiaTraspaso {
  tercero?: string | null
  iban?: string | null
}

export interface EntradaPistaTraspaso {
  concepto: unknown
  tercero?: unknown
  ibanContraparte?: unknown
  identidadesPropias: readonly IdentidadPropiaTraspaso[]
}

export interface PistaTraspasoPropio {
  esPistaTextual: boolean
  tieneIdentidadPropia: boolean
  esCandidatoTraspasoPropio: boolean
  coincidencia: 'TERCERO' | 'IBAN' | null
  motivo: 'SIN_PISTA_TEXTUAL' | 'SIN_IDENTIDAD_PROPIA' | 'CANDIDATO_PENDIENTE_PAREJA'
  /** Siempre true en B3: la pareja compatible se evalúa posteriormente (B6). */
  requiereParejaCompatible: true
  /** B3 nunca concilia automáticamente una pista de traspaso. */
  puedeConciliarAutomaticamente: false
  /** B3 nunca convierte una pista en un cobro. */
  puedeClasificarComoCobrado: false
}

function claveTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const normalizado = valor
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-ES')
  return normalizado || null
}

function claveIban(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const normalizado = valor.normalize('NFKC').replace(/[\s.\-]/g, '').toLocaleUpperCase('es-ES')
  return /^[A-Z]{2}[A-Z0-9]{13,32}$/.test(normalizado) ? normalizado : null
}

/**
 * La identidad empresarial sólo elimina separadores de razón social (p. ej.
 * `S.L.` frente a `SL`); el contenido alfanumérico debe seguir coincidiendo.
 */
function claveIdentidadTercero(valor: unknown): string | null {
  const texto = claveTexto(valor)
  return texto?.replace(/[^A-Z0-9]/g, '') || null
}

function mapaCatalogo<T extends string>(valores: readonly T[]): Map<string, T> {
  return new Map(valores.map(valor => [claveTexto(valor)!, valor]))
}

const categoriasPorClave = mapaCatalogo(CATEGORIAS_MOVIMIENTO)
const tiposPorClave = mapaCatalogo(TIPOS_MOVIMIENTO)

/** Alias autorizados explícitamente. No se infieren ni se normalizan valores libres. */
const ALIASES_CATEGORIA = new Map<string, CategoriaMovimiento>([
  [claveTexto('Oros Gastos')!, 'Otros Gastos'],
  [claveTexto('IMPUESTOS')!, 'Impuestos'],
])
const ALIASES_TIPO = new Map<string, TipoMovimiento>([
  [claveTexto('Nomina')!, 'Nómina'],
  [claveTexto('Debito')!, 'Débito'],
])

function resolver<T extends string>(
  valor: unknown,
  canones: Map<string, T>,
  aliases: Map<string, T>,
): { valor: T; fueAlias: boolean } | null {
  const clave = claveTexto(valor)
  if (!clave) return null
  const canonico = canones.get(clave)
  if (canonico) return { valor: canonico, fueAlias: canonico !== valor }
  const alias = aliases.get(clave)
  return alias ? { valor: alias, fueAlias: true } : null
}

export function validarCategoriaNueva(valor: unknown): ResultadoCategoriaNueva {
  const resuelto = resolver(valor, categoriasPorClave, ALIASES_CATEGORIA)
  if (resuelto) return { ok: true, ...resuelto }
  return {
    ok: false,
    codigo: 'CATEGORIA_NO_PERMITIDA',
    mensaje: `Categoría no permitida. Valores admitidos: ${CATEGORIAS_MOVIMIENTO.join(', ')}.`,
    valorOriginal: valor,
  }
}

/** Consulta canónica que incluye sólo sus alias autorizados, sin modificar filas. */
export function valoresCategoriaFiltro(valor: string): string[] {
  const validacion = validarCategoriaNueva(valor)
  if (!validacion.ok) return [valor]
  return [...new Set([validacion.valor, ...Array.from(ALIASES_CATEGORIA.entries())
    .filter(([, canonico]) => canonico === validacion.valor).map(([alias]) => alias)])]
}

export function validarTipoMovimientoNuevo(valor: unknown): ResultadoTipoMovimientoNuevo {
  const resuelto = resolver(valor, tiposPorClave, ALIASES_TIPO)
  if (resuelto) return { ok: true, ...resuelto }
  return {
    ok: false,
    codigo: 'TIPO_NO_PERMITIDO',
    mensaje: `Tipo de movimiento no permitido. Valores admitidos: ${TIPOS_MOVIMIENTO.join(', ')}.`,
    valorOriginal: valor,
  }
}

function presentarHistorico<T extends string>(
  valor: unknown,
  canones: Map<string, T>,
  aliases: Map<string, T>,
): ValorHistoricoCatalogo<T> {
  if (valor === null || valor === undefined) return { valor: null, valorOriginal: valor, esLegacy: false, fueAlias: false }
  const resuelto = resolver(valor, canones, aliases)
  if (resuelto) return { valor: resuelto.valor, valorOriginal: valor, esLegacy: false, fueAlias: resuelto.fueAlias }
  return {
    valor: typeof valor === 'string' ? valor : String(valor),
    valorOriginal: valor,
    esLegacy: true,
    fueAlias: false,
  }
}

/** Conserva en lectura cualquier valor histórico desconocido, sin escribirlo. */
export function presentarCategoriaHistorica(valor: unknown): ValorHistoricoCatalogo<CategoriaMovimiento> {
  return presentarHistorico(valor, categoriasPorClave, ALIASES_CATEGORIA)
}

/** Conserva en lectura cualquier tipo histórico desconocido, sin escribirlo. */
export function presentarTipoMovimientoHistorico(valor: unknown): ValorHistoricoCatalogo<TipoMovimiento> {
  return presentarHistorico(valor, tiposPorClave, ALIASES_TIPO)
}

function parseImporteTexto(valor: string): number | null {
  const limpio = valor.replace(/[\s\u00A0]/g, '')
  if (!/^[+-]?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?$/.test(limpio)) return null
  const signo = limpio.startsWith('-') ? -1 : 1
  const sinSigno = limpio.replace(/^[+-]/, '')
  const ultimaComa = sinSigno.lastIndexOf(',')
  const ultimoPunto = sinSigno.lastIndexOf('.')
  const separadorDecimal = ultimaComa > ultimoPunto ? ',' : ultimoPunto > ultimaComa ? '.' : null
  let decimal = ''
  let entero = sinSigno
  if (separadorDecimal !== null) {
    const posicion = sinSigno.lastIndexOf(separadorDecimal)
    const posibleDecimal = sinSigno.slice(posicion + 1)
    // Tres dígitos tras un separador único son miles, no céntimos.
    if (posibleDecimal.length <= 2) {
      entero = sinSigno.slice(0, posicion)
      decimal = posibleDecimal
    }
  }
  const numero = Number(`${entero.replace(/[.,]/g, '')}.${decimal || '0'}`) * signo
  return Number.isFinite(numero) ? numero : null
}

/**
 * Sólo reconoce una comisión cuando el término lleva una cifra monetaria
 * contigua y estrictamente positiva. No clasifica compras ni movimientos.
 */
export function detectarComisionEnConcepto(concepto: unknown): DeteccionComision {
  if (typeof concepto !== 'string' || !/\bCOMISI(?:O|Ó)N(?:ES)?\b/iu.test(concepto)) {
    return { esComisionPositiva: false, importe: null, motivo: 'SIN_TEXTO_COMISION' }
  }

  const coincidencia = concepto.match(/\bCOMISI(?:O|Ó)N(?:ES)?\b\s*(?:(?:DE|POR)\s+)?(?:[:=;]\s*)?([+-]?(?:\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[,.]\d{1,2})?)\s*(?:€|EUR\b)?(?=$|\s|[;:)\]])/iu)
  if (!coincidencia?.[1]) return { esComisionPositiva: false, importe: null, motivo: 'COMISION_SIN_IMPORTE' }

  const importe = parseImporteTexto(coincidencia[1])
  if (importe === null || importe <= 0) {
    return { esComisionPositiva: false, importe: importe ?? null, motivo: 'COMISION_CERO_O_NEGATIVA' }
  }
  return { esComisionPositiva: true, importe, motivo: 'COMISION_POSITIVA' }
}

/**
 * `TRASSPAS` es una pista textual, no una clasificación ni una conciliación.
 * Sólo se eleva a candidato si el tercero o IBAN coincide exactamente con una
 * identidad propia ya configurada. La pareja de importe opuesto queda para B6.
 */
export function evaluarPistaTraspasoPropio(entrada: EntradaPistaTraspaso): PistaTraspasoPropio {
  const esPistaTextual = typeof entrada.concepto === 'string' && /\bTRAS+P(?:AS|ASS|ASO)?\w*/iu.test(entrada.concepto)
  const base = {
    esPistaTextual,
    requiereParejaCompatible: true as const,
    puedeConciliarAutomaticamente: false as const,
    puedeClasificarComoCobrado: false as const,
  }
  if (!esPistaTextual) {
    return { ...base, tieneIdentidadPropia: false, esCandidatoTraspasoPropio: false, coincidencia: null, motivo: 'SIN_PISTA_TEXTUAL' }
  }

  const tercero = claveIdentidadTercero(entrada.tercero)
  const iban = claveIban(entrada.ibanContraparte)
  for (const identidad of entrada.identidadesPropias) {
    const terceroPropio = claveIdentidadTercero(identidad.tercero)
    if (tercero && terceroPropio && tercero === terceroPropio) {
      return { ...base, tieneIdentidadPropia: true, esCandidatoTraspasoPropio: true, coincidencia: 'TERCERO', motivo: 'CANDIDATO_PENDIENTE_PAREJA' }
    }
    const ibanPropio = claveIban(identidad.iban)
    if (iban && ibanPropio && iban === ibanPropio) {
      return { ...base, tieneIdentidadPropia: true, esCandidatoTraspasoPropio: true, coincidencia: 'IBAN', motivo: 'CANDIDATO_PENDIENTE_PAREJA' }
    }
  }

  return { ...base, tieneIdentidadPropia: false, esCandidatoTraspasoPropio: false, coincidencia: null, motivo: 'SIN_IDENTIDAD_PROPIA' }
}
