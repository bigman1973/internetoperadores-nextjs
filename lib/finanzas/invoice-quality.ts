export const TOLERANCIA_CENTIMOS = 0.02

export type ProcedenciaFechaOcr = 'DOCUMENTO' | 'NOMBRE_ARCHIVO' | 'HISTORICA' | 'SIN_CONFIRMAR'

export type LineaOcr = {
  importeNeto?: unknown
  importe?: unknown
  [key: string]: unknown
}

export type ResultadoOcrFactura = {
  proveedor?: unknown
  cif?: unknown
  numFactura?: unknown
  fecha?: unknown
  fechaProvenancia?: unknown
  base?: unknown
  tipoIva?: unknown
  importeIva?: unknown
  tipoIrpf?: unknown
  importeIrpf?: unknown
  total?: unknown
  confianza?: unknown
  lineas?: unknown
}

export type ValidacionOcr =
  | { ok: true; identidad: string }
  | { ok: false; motivo: string }

const HYPHENS = /[‐‑‒–—−]/g
const CONTROL = /[\u0000-\u001F\u007F]/

/**
 * El CIF no tiene separadores semánticos: se eliminan espacios y puntuación de
 * formato. Para el número se conservan / . _ y -, que sí distinguen series.
 */
function textoIdentidad(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const original = valor.normalize('NFKC').trim().toLocaleUpperCase('es-ES').replace(HYPHENS, '-')
  if (!original || original.length > maximo * 3 || CONTROL.test(original)) return null
  if (!/^[A-Z0-9 ._\-/]+$/.test(original)) return null
  return original
}

export function normalizarCif(valor: unknown): string | null {
  const original = textoIdentidad(valor, 20)
  if (!original) return null
  const normalizado = original.replace(/[\s._\-/]+/g, '')
  if (normalizado.length < 7 || normalizado.length > 20 || !/[A-Z0-9]/.test(normalizado)) return null
  return normalizado
}

export function normalizarNumeroFactura(valor: unknown): string | null {
  const original = textoIdentidad(valor, 100)
  if (!original) return null
  // Sólo los espacios son de formato en una serie. F1/1, F1-1 y F1.1 no se
  // convierten nunca en F11 ni entre sí.
  const normalizado = original.replace(/\s+/g, '')
  if (normalizado.length < 1 || normalizado.length > 100 || !/[A-Z0-9]/.test(normalizado)) return null
  return normalizado
}

export function claveCanonicaFactura(cif: unknown, numFactura: unknown): string | null {
  const cifNormalizado = normalizarCif(cif)
  const numeroNormalizado = normalizarNumeroFactura(numFactura)
  if (!cifNormalizado || !numeroNormalizado) return null
  return `CIF:${cifNormalizado}|NUM:${numeroNormalizado}`
}

export function esFechaDocumentoIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T12:00:00.000Z`)
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

export function fechaDocumentoUtc(valor: string): Date {
  return new Date(`${valor}T12:00:00.000Z`)
}

export function esImporteFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && Math.abs(valor) <= 1_000_000_000
}

/** Importe almacenable como céntimos exactos, incluido abono o rectificativa con signo. */
export function esImporteCentimosFinito(valor: unknown): valor is number {
  return esImporteFinito(valor) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7
}

export function aCentimosExactos(valor: number): number {
  if (!esImporteCentimosFinito(valor)) throw new Error('IMPORTE_NO_ENTERO_CENTIMOS')
  return Math.round(valor * 100)
}

export function totalCuadraEnCentimos(base: number, importeIva: number, importeIrpf: number, total: number): boolean {
  return aCentimosExactos(total) === aCentimosExactos(base) + aCentimosExactos(importeIva) - aCentimosExactos(importeIrpf)
}

export function casiIgualImporte(a: number, b: number, tolerancia = TOLERANCIA_CENTIMOS): boolean {
  return Math.abs(a - b) <= tolerancia
}

function proveedorLegible(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= 300 && !/^ERROR_OCR$/i.test(valor.trim()) && !/^DESCONOCIDO$/i.test(valor.trim())
}

/**
 * Un resultado nuevo sólo puede crear una factura cuando la fecha se leyó del
 * documento y todos los importes (también rectificativas negativas) cuadran.
 * En cualquier duda el documento va a cuarentena: nunca se sustituye por 0.
 */
export function validarResultadoOcrNuevo(datos: ResultadoOcrFactura): ValidacionOcr {
  if (!proveedorLegible(datos.proveedor)) return { ok: false, motivo: 'PROVEEDOR_NO_LEIDO' }
  if (datos.fechaProvenancia !== 'DOCUMENTO') return { ok: false, motivo: 'FECHA_NO_DOCUMENTAL' }
  if (!esFechaDocumentoIso(datos.fecha)) return { ok: false, motivo: 'FECHA_INVALIDA' }
  const identidad = claveCanonicaFactura(datos.cif, datos.numFactura)
  if (!identidad) return { ok: false, motivo: 'IDENTIDAD_INCOMPLETA' }
  if (!esImporteCentimosFinito(datos.base) || !esImporteCentimosFinito(datos.importeIva) || !esImporteCentimosFinito(datos.importeIrpf) || !esImporteCentimosFinito(datos.total)) {
    return { ok: false, motivo: 'IMPORTES_NO_LEIDOS' }
  }
  if (!esImporteCentimosFinito(datos.tipoIva) || !esImporteCentimosFinito(datos.tipoIrpf) || datos.tipoIva < 0 || datos.tipoIva > 100 || datos.tipoIrpf < 0 || datos.tipoIrpf > 100) {
    return { ok: false, motivo: 'TIPOS_IMPUESTO_INVALIDOS' }
  }
  if (!totalCuadraEnCentimos(datos.base, datos.importeIva, datos.importeIrpf, datos.total)) {
    return { ok: false, motivo: 'TOTAL_NO_CUADRA' }
  }
  if (!Array.isArray(datos.lineas) || datos.lineas.length === 0) return { ok: false, motivo: 'LINEAS_NO_LEIDAS' }
  let sumaLineas = 0
  for (const linea of datos.lineas as LineaOcr[]) {
    if (!linea || !esImporteCentimosFinito(linea.importeNeto)) return { ok: false, motivo: 'LINEA_SIN_IMPORTE_NETO' }
    sumaLineas += linea.importeNeto
  }
  if (!casiIgualImporte(sumaLineas, datos.base)) return { ok: false, motivo: 'LINEAS_NO_CUADRAN' }
  if (!esImporteFinito(datos.confianza) || datos.confianza < 0.5 || datos.confianza > 1) return { ok: false, motivo: 'CONFIANZA_INSUFICIENTE' }
  return { ok: true, identidad }
}

export function hayErrorOcrHistorico(datosOcrRaw: unknown, proveedor: unknown, ocrCompletado: unknown): boolean {
  if (typeof proveedor === 'string' && /^(ERROR_OCR|DESCONOCIDO)$/i.test(proveedor.trim())) return true
  if (typeof datosOcrRaw !== 'string') return false
  try {
    const datos = JSON.parse(datosOcrRaw) as Record<string, unknown>
    const concepto = typeof datos.concepto === 'string' ? datos.concepto : ''
    return /^ERROR_OCR\s*:/i.test(concepto) || datos.fechaProvenancia === 'NOMBRE_ARCHIVO' || (ocrCompletado === false && datos.confianza === 0)
  } catch {
    return false
  }
}

export function conflictoDeDuplicados(rows: Array<{ proveedor?: unknown; fecha?: unknown; base?: unknown; importeIva?: unknown; importeIrpf?: unknown; total?: unknown }>): boolean {
  if (rows.length < 2) return false
  const normalizarTexto = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').trim().toLocaleUpperCase('es-ES') : ''
  const firma = (row: typeof rows[number]) => JSON.stringify({
    proveedor: normalizarTexto(row.proveedor),
    fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : String(row.fecha || ''),
    base: typeof row.base === 'number' && esImporteCentimosFinito(row.base) ? aCentimosExactos(row.base) : row.base,
    importeIva: typeof row.importeIva === 'number' && esImporteCentimosFinito(row.importeIva) ? aCentimosExactos(row.importeIva) : row.importeIva,
    importeIrpf: typeof row.importeIrpf === 'number' && esImporteCentimosFinito(row.importeIrpf) ? aCentimosExactos(row.importeIrpf) : row.importeIrpf,
    total: typeof row.total === 'number' && esImporteCentimosFinito(row.total) ? aCentimosExactos(row.total) : row.total,
  })
  return new Set(rows.map(firma)).size > 1
}

/**
 * Sólo una factura VALIDA puede ser canónica. Una fila REVISAR_LECTURA nunca
 * desplaza una canónica existente aunque tenga enlaces; entre candidatas válidas
 * se preserva la única que ya tiene enlaces y después gana fecha/ID.
 */
export function elegirCanonicaDeterminista<T extends { id: string; createdAt: Date; enlaces?: number; calidad?: string; copiaDeId?: string | null }>(rows: T[]): T | null {
  const validas = rows.filter(row => row.calidad === undefined || (row.calidad === 'VALIDA' && !row.copiaDeId))
  if (!validas.length) return null
  const conEnlaces = validas.filter(row => (row.enlaces || 0) > 0)
  const candidatos = conEnlaces.length === 1 ? conEnlaces : validas
  return [...candidatos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0]
}
