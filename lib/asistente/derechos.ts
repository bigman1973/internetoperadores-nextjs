import { ErrorPrivacidad, confirmarPrivacidad, previsualizarDerecho, type AccionPrivacidad, type TipoObjetivoPrivacidad } from '@/lib/asistente/retencion'

export type SolicitudDerecho = {
  accion: Extract<AccionPrivacidad, 'SUPRESION' | 'REVOCACION'>
  objetivoTipo: Exclude<TipoObjetivoPrivacidad, 'RETENCION'>
  objetivoId: string
}

export type ConfirmacionDerecho = {
  previewToken: string
  confirmacion: true
  idempotencyKey: string
}

function objetoPlano(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

function clavesExactas(valor: Record<string, unknown>, claves: string[]): boolean {
  const recibidas = Object.keys(valor)
  return recibidas.length === claves.length && claves.every(clave => Object.hasOwn(valor, clave)) && recibidas.every(clave => claves.includes(clave))
}

function uuid(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}

export function validarSolicitudDerecho(valor: unknown): SolicitudDerecho {
  if (!objetoPlano(valor) || !clavesExactas(valor, ['accion', 'objetivoTipo', 'objetivoId'])) throw new ErrorPrivacidad('SOLICITUD_INVALIDA')
  if ((valor.accion !== 'SUPRESION' && valor.accion !== 'REVOCACION') || (valor.objetivoTipo !== 'CONVERSACION' && valor.objetivoTipo !== 'LEAD' && valor.objetivoTipo !== 'ESCALADO') || !uuid(valor.objetivoId)) throw new ErrorPrivacidad('SOLICITUD_INVALIDA')
  if (valor.accion === 'REVOCACION' && valor.objetivoTipo === 'CONVERSACION') throw new ErrorPrivacidad('REVOCACION_OBJETIVO_INVALIDO')
  return { accion: valor.accion, objetivoTipo: valor.objetivoTipo, objetivoId: valor.objetivoId }
}

export function validarConfirmacionDerecho(valor: unknown): ConfirmacionDerecho {
  if (!objetoPlano(valor) || !clavesExactas(valor, ['previewToken', 'confirmacion', 'idempotencyKey'])) throw new ErrorPrivacidad('SOLICITUD_INVALIDA')
  if (typeof valor.previewToken !== 'string' || valor.previewToken.length < 32 || valor.previewToken.length > 4096 || valor.confirmacion !== true || !uuid(valor.idempotencyKey)) throw new ErrorPrivacidad('SOLICITUD_INVALIDA')
  return { previewToken: valor.previewToken, confirmacion: true, idempotencyKey: valor.idempotencyKey }
}

export async function previsualizarDerechoAsistente(actorId: number, valor: unknown) {
  const entrada = validarSolicitudDerecho(valor)
  return previsualizarDerecho({ actorId, ...entrada })
}

export async function confirmarDerechoAsistente(actorId: number, valor: unknown) {
  const entrada = validarConfirmacionDerecho(valor)
  return confirmarPrivacidad({ actorId, ...entrada, ejecutor: 'admin.derechos' })
}
