export type ActuationTarget = Readonly<{
  id: number
  nombre: string
  rol: string
}>

export type ActiveActuation = Readonly<{
  sessionId: string
  actorName: string
  targetName: string
  targetId: number
  expiresAt: string
}>

export type ActuationState = Readonly<{
  enabled: true
  active: ActiveActuation | null
  canStart: boolean
  targets: ActuationTarget[]
}>

export type AuditEvent = Readonly<{
  id: string | number
  at: string
  kind: string
  actorName: string
  targetName: string
  reason?: string
  method?: string
  path?: string
  ip?: string
  outcome?: string
}>

export type StartAttempt = Readonly<{
  targetId: number
  motivo?: string
  idempotencyKey: string
}>

export type ExitAttempt = Readonly<{
  idempotencyKey: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseActive(value: unknown): ActiveActuation | null {
  if (value === null) return null
  if (!isRecord(value)) throw new Error('El estado de actuación recibido no es válido.')

  const { sessionId, actorName, targetName, targetId, expiresAt } = value
  const numericTargetId = typeof targetId === 'string' && /^[1-9]\d{0,9}$/.test(targetId) ? Number(targetId) : targetId
  if (!nonEmptyString(sessionId) || !nonEmptyString(actorName) || !nonEmptyString(targetName) || !isFiniteId(numericTargetId) || !nonEmptyString(expiresAt) || Number.isNaN(Date.parse(expiresAt))) {
    throw new Error('El estado de actuación recibido no está completo.')
  }

  return { sessionId, actorName, targetName, targetId: numericTargetId, expiresAt }
}

function parseTargets(value: unknown): ActuationTarget[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('El catálogo de destinos no es válido.')

  return value.map((item) => {
    if (!isRecord(item) || !isFiniteId(item.id) || !nonEmptyString(item.nombre) || !nonEmptyString(item.rol)) {
      throw new Error('El catálogo de destinos contiene un elemento no válido.')
    }
    return { id: item.id, nombre: item.nombre, rol: item.rol }
  })
}

/** Valida una respuesta de sólo lectura antes de usarla para pintar la interfaz. */
export function parseActuationState(value: unknown): ActuationState {
  if (!isRecord(value) || value.enabled !== true || typeof value.canStart !== 'boolean' || !('active' in value)) {
    throw new Error('La respuesta de estado no tiene el formato esperado.')
  }

  return {
    enabled: true,
    active: parseActive(value.active),
    canStart: value.canStart,
    targets: parseTargets(value.targets),
  }
}

/** El cliente sólo permite rutas internas; nunca sigue una URL de redirección externa. */
export function safeInternalRedirect(value: unknown, fallback = '/admin'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

export function createStartAttempt(targetId: number, motivo: string, createKey: () => string): StartAttempt {
  const reason = motivo.trim()
  return {
    targetId,
    ...(reason ? { motivo: reason } : {}),
    idempotencyKey: createKey(),
  }
}

export function retryStartAttempt(attempt: StartAttempt): StartAttempt {
  return attempt
}

export function createExitAttempt(createKey: () => string): ExitAttempt {
  return { idempotencyKey: createKey() }
}

export function retryExitAttempt(attempt: ExitAttempt): ExitAttempt {
  return attempt
}

export function parseAuditEvents(value: unknown): { events: AuditEvent[]; total: number } {
  if (!isRecord(value) || !Array.isArray(value.events) || typeof value.total !== 'number' || value.total < 0) {
    throw new Error('El registro recibido no tiene el formato esperado.')
  }

  const events = value.events.map((item): AuditEvent => {
    if (!isRecord(item) || (typeof item.id !== 'string' && typeof item.id !== 'number') || !nonEmptyString(item.at) || !nonEmptyString(item.kind) || !nonEmptyString(item.actorName) || !nonEmptyString(item.targetName)) {
      throw new Error('El registro contiene un evento no válido.')
    }

    const optionalText = (key: 'reason' | 'method' | 'path' | 'outcome' | 'ip') => typeof item[key] === 'string' ? item[key] : undefined
    return {
      id: item.id,
      at: item.at,
      kind: item.kind,
      actorName: item.actorName,
      targetName: item.targetName,
      reason: optionalText('reason'),
      method: optionalText('method'),
      path: optionalText('path'),
      ip: optionalText('ip'),
      outcome: optionalText('outcome'),
    }
  })

  return { events, total: value.total }
}

export function minutesUntil(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000))
}
