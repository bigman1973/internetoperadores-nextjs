export const ESTADOS_PETICION = [
  'pendiente',
  'aprobada',
  'en_desarrollo',
  'pendiente_validacion',
  'ajustes_solicitados',
  'resuelta',
  'descartada',
] as const

export type EstadoPeticion = (typeof ESTADOS_PETICION)[number]

export const ESTADOS_CAMBIABLES_POR_ADMIN: EstadoPeticion[] = [
  'pendiente',
  'aprobada',
  'en_desarrollo',
  'descartada',
]

const ESTADOS_ENTREGABLES: EstadoPeticion[] = [
  'aprobada',
  'en_desarrollo',
  'ajustes_solicitados',
]

export function esEstadoPeticion(value: unknown): value is EstadoPeticion {
  return typeof value === 'string' && ESTADOS_PETICION.includes(value as EstadoPeticion)
}

export function puedeCambiarEstadoAdmin(value: unknown): value is EstadoPeticion {
  return esEstadoPeticion(value) && ESTADOS_CAMBIABLES_POR_ADMIN.includes(value)
}

export function puedeEnviarAValidacion(estado: unknown): boolean {
  return esEstadoPeticion(estado) && ESTADOS_ENTREGABLES.includes(estado)
}

export function estadoTrasFeedback(satisfecho: boolean): EstadoPeticion {
  return satisfecho ? 'resuelta' : 'ajustes_solicitados'
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}
