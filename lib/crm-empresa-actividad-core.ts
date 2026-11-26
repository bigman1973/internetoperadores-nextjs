/** Contrato exclusivamente local. Compartido con el sandbox, sin proveedores ni BD. */
export const EMPRESA_ACTIVIDAD_ACTION = 'registrar_actividad'
const TYPES = new Set(['NOTA', 'LLAMADA', 'TAREA', 'REUNION'])
const CALL_RESULTS = new Set(['CONTACTADO', 'SIN_RESPUESTA', 'OCUPADO', 'BUZON_DE_VOZ', 'NUMERO_INCORRECTO', 'OTRO'])
const PRIORITIES = new Set(['BAJA', 'MEDIA', 'ALTA'])
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
export function isEmpresaLocalActivityCommand(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  return b.action === EMPRESA_ACTIVIDAD_ACTION && (b.accion === undefined || b.accion === b.action)
    && typeof b.type === 'string' && TYPES.has(b.type)
    && ['syncOutlook', 'viaOutlook', 'prepareExternalChannel', 'onlineMeeting', 'inviteAttendees'].every(k => b[k] === undefined || b[k] === false)
}
export class EmpresaActivityValidationError extends Error {}
export function parseEmpresaLocalActivity(b: Record<string, unknown>, now = new Date()) {
  const fail = (message: string): never => { throw new EmpresaActivityValidationError(message) }
  if (!isEmpresaLocalActivityCommand(b)) fail('El contrato de actividad local no es válido.')
  const type = b.type as string
  const description = text(b.description, 20_000)
  if (!description) fail('Añade una descripción útil de la actividad.')
  const title = text(b.title, 250)
  const clientRequestId = text(b.clientRequestId, 100)
  if (!clientRequestId || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientRequestId)) fail('No se ha podido identificar esta operación. Recarga la ficha.')
  const activityDate = b.activityDate === undefined ? now : typeof b.activityDate === 'string' ? new Date(b.activityDate) : new Date(NaN)
  if (Number.isNaN(activityDate.getTime())) fail('La fecha de la actividad no es válida.')
  if (!['REUNION', 'TAREA'].includes(type) && activityDate.getTime() > now.getTime() + 86_400_000) fail('Esta actividad no puede registrarse con una fecha futura.')
  const durationMinutes = b.durationMinutes == null || b.durationMinutes === '' ? null : Number(b.durationMinutes)
  if (durationMinutes != null && (!['number', 'string'].includes(typeof b.durationMinutes) || !Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 10_080)) fail('La duración debe estar entre 0 y 10.080 minutos.')
  const direction = ['ENTRANTE', 'SALIENTE'].includes(String(b.direction)) ? String(b.direction) : null
  const result = text(b.result, 80)
  if (type === 'LLAMADA' && !direction) fail('Selecciona si la llamada fue entrante o saliente.')
  if (type === 'LLAMADA' && (!result || !CALL_RESULTS.has(result))) fail('Selecciona el resultado de la llamada.')
  const rawIds = b.contactIds === undefined ? [] : b.contactIds
  if (!Array.isArray(rawIds) || rawIds.length > 50) fail('Contactos asociados no válidos.')
  if (b.contactId !== undefined && b.contactId !== null && b.contactId !== '' && typeof b.contactId !== 'string') fail('Persona no válida.')
  const ids = [...new Set([...(b.contactId ? [b.contactId] : []), ...(rawIds as unknown[])])]
  if (ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || ids.length > 50) fail('Personas asociadas no válidas.')
  if (b.dealIds !== undefined && (!Array.isArray(b.dealIds) || b.dealIds.length)) fail('Este formulario local no admite asociaciones a negocios.')
  let followUp: { title: string; dueAt: Date; priority: string } | null = null
  if (b.followUp !== undefined && b.followUp !== null) {
    if (typeof b.followUp !== 'object' || Array.isArray(b.followUp)) fail('Datos de seguimiento no válidos.')
    const f = b.followUp as Record<string, unknown>
    const dueAt = typeof f.dueAt === 'string' ? new Date(f.dueAt) : new Date(NaN)
    if (Number.isNaN(dueAt.getTime())) fail('La fecha límite de la tarea no es válida.')
    if (dueAt.getTime() < now.getTime() - 3_600_000) fail('La tarea debe vencer en el futuro.')
    followUp = { title: text(f.title, 250) || title || (type === 'TAREA' ? 'Tarea' : 'Seguimiento de actividad'), dueAt, priority: PRIORITIES.has(String(f.priority)) ? String(f.priority) : 'MEDIA' }
  }
  if (type === 'TAREA' && !followUp) fail('Indica la fecha límite de la tarea.')
  const labels: Record<string, string> = { NOTA: 'Nota', LLAMADA: `Llamada ${direction === 'ENTRANTE' ? 'entrante' : 'saliente'}`, TAREA: 'Tarea', REUNION: 'Reunión' }
  return { type, description: description!, title: title || labels[type], clientRequestId: clientRequestId!, activityDate, durationMinutes, direction, result: result || (type === 'TAREA' ? 'PENDIENTE' : 'REGISTRADA'), contactIds: ids as string[], followUp, location: text(b.location, 500) }
}
