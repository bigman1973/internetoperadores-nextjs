/** Transporte puro: identifica la foto guardada; no congela ni recalcula fuentes. */
import type { DesgloseResultado } from './desglose'

export type FotoMetadata = {
  id: string; month: string; version: number; kind: string; sourceHash: string; createdAt: string | null
}
export type DesgloseConFoto = DesgloseResultado & { snapshot: FotoMetadata }

/** Sin fecha verificable nunca se autoriza leer la última versión contractual. */
export function fechaFoto(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
export function metadataFoto(row: { id: string; month: string; version: number; kind: string; sourceHash: string; createdAt?: unknown }): FotoMetadata {
  return { id: row.id, month: row.month, version: row.version, kind: row.kind, sourceHash: row.sourceHash, createdAt: fechaFoto(row.createdAt) }
}

/** La API no añade euros para forzar un cuadre entre detalle actual y foto guardada. */
export function conFoto(resultado: DesgloseResultado, snapshot: FotoMetadata): DesgloseConFoto {
  const filas = resultado.filas.filter(fila => !fila.ajuste)
  const sinAjustes = filas.length !== resultado.filas.length
  const sumaDetalle = sinAjustes ? Math.round(filas.reduce((s, fila) => s + Number(fila.importe ?? 0), 0) * 100) / 100 : resultado.sumaDetalle
  const diferencia = sinAjustes && resultado.cifraTabla !== null && sumaDetalle !== null
    ? Math.round((resultado.cifraTabla - sumaDetalle) * 100) / 100 : resultado.diferencia
  const cuadra = sinAjustes ? diferencia === 0 : resultado.cuadra
  const notas = resultado.notas.filter(nota => !/Recalcula el mes/.test(nota))
  if (resultado.vista === 'contratos') {
    notas.push(snapshot.createdAt
      ? 'Cuota, alta, baja y estado proceden de la última versión importada hasta la fecha de esta foto, no de versiones posteriores.'
      : 'Esta foto no conserva una fecha verificable: cuota, alta, baja y estado quedan sin dato; no se usa la última versión arbitrariamente.')
  } else {
    notas.push('Los importes y fuentes de la tabla pertenecen a esta foto guardada. Las líneas y cabeceras documentales del detalle se consultan en su estado actual: no son fuentes congeladas.')
  }
  if (!cuadra) notas.push('El detalle disponible no coincide con la foto guardada. Recarga la pantalla o revisa las fuentes; no se ha recalculado el mes ni añadido un ajuste para ocultar la diferencia.')
  const cobertura = sinAjustes ? { ...resultado.cobertura, [resultado.vista === 'coste' ? 'lineasDeCoste' : 'lineas']: filas.length } : resultado.cobertura
  return { ...resultado, filas, sumaDetalle, diferencia, cuadra, notas, cobertura, snapshot }
}
