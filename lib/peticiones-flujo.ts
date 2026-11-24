export const ESTADOS_PETICION = [
  'nueva', 'en_analisis', 'aprobada', 'en_desarrollo', 'en_pruebas', 'hecha', 'descartada',
] as const
export type EstadoPeticion = (typeof ESTADOS_PETICION)[number]
const LEGADO: Record<string, EstadoPeticion> = {
  pendiente: 'nueva', pendiente_validacion: 'en_pruebas',
  ajustes_solicitados: 'en_desarrollo', resuelta: 'hecha',
}
export const NOMBRES_ESTADO: Record<EstadoPeticion, string> = {
  nueva: 'Nueva', en_analisis: 'En análisis', aprobada: 'Aprobada',
  en_desarrollo: 'En desarrollo', en_pruebas: 'En pruebas', hecha: 'Hecha', descartada: 'Descartada',
}
export function normalizarEstado(estado: unknown): EstadoPeticion | null {
  if (typeof estado !== 'string') return null
  if (ESTADOS_PETICION.includes(estado as EstadoPeticion)) return estado as EstadoPeticion
  return Object.prototype.hasOwnProperty.call(LEGADO, estado) ? LEGADO[estado] : null
}
export function estadosCompatibles(estado: EstadoPeticion): string[] {
  return [estado, ...Object.keys(LEGADO).filter(key => LEGADO[key] === estado)]
}
export const ESTADOS_CAMBIABLES_POR_ADMIN: EstadoPeticion[] = ['nueva', 'en_analisis', 'aprobada', 'en_desarrollo', 'descartada']
export function esEstadoPeticion(value: unknown): value is EstadoPeticion {
  return typeof value === 'string' && ESTADOS_PETICION.includes(value as EstadoPeticion)
}
export function puedeCambiarEstadoAdmin(value: unknown): value is EstadoPeticion {
  return esEstadoPeticion(value) && ESTADOS_CAMBIABLES_POR_ADMIN.includes(value)
}
/** Un cierre confirmado no se reabre ni se descarta por un cambio genérico. */
export function transicionAdminPermitida(origen: unknown, destino: unknown): boolean {
  const from = normalizarEstado(origen)
  const to = normalizarEstado(destino)
  if (!from || !to || !puedeCambiarEstadoAdmin(to) || from === to) return false
  const siguientes: Record<EstadoPeticion, EstadoPeticion[]> = {
    nueva: ['en_analisis', 'descartada'],
    en_analisis: ['nueva', 'aprobada', 'descartada'],
    aprobada: ['en_analisis', 'en_desarrollo', 'descartada'],
    en_desarrollo: ['en_analisis', 'descartada'],
    en_pruebas: [], hecha: [], descartada: [],
  }
  return siguientes[from].includes(to)
}
export function puedeEnviarAValidacion(estado: unknown): boolean {
  const normalized = normalizarEstado(estado)
  return normalized === 'aprobada' || normalized === 'en_desarrollo'
}
export function estadoTrasFeedback(satisfecho: boolean): EstadoPeticion {
  return satisfecho ? 'hecha' : 'en_desarrollo'
}
export function normalizarEmail(email: string): string { return email.trim().toLowerCase() }
