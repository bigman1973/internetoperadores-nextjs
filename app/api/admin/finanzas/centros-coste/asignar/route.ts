// app/api/admin/finanzas/centros-coste/asignar/route.ts
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import {
  asignarCentroCosteFinanzas,
  B8CentroCosteServiceError,
  type CurrentSourceValidatorB8,
} from '@/lib/finanzas/centros-coste-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 64 * 1024

/** Lazy bridge preserves an acyclic B4/B8 module graph. */
async function requiredCurrentSourceValidator(): Promise<CurrentSourceValidatorB8> {
  const b4 = await import('@/lib/finanzas/reconciliation-db') as {
    createB8CurrentSourceValidator?: () => CurrentSourceValidatorB8
  }
  if (typeof b4.createB8CurrentSourceValidator !== 'function') {
    throw new B8CentroCosteServiceError(503, 'B8_SOURCE_VALIDATOR_REQUIRED', 'Falta el puente B4 de fuente documental actual.')
  }
  return b4.createB8CurrentSourceValidator()
}
async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  const contentType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json', codigo: 'CONTENT_TYPE_REQUERIDO' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande', codigo: 'CUERPO_DEMASIADO_GRANDE' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío', codigo: 'CUERPO_VACIO' }, 400) }
  const reader = req.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0; let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande', codigo: 'CUERPO_DEMASIADO_GRANDE' }, 413) } }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON', codigo: 'VALIDATION_ERROR' }, 400) }
    return { ok: true, value }
  } catch { return { ok: false, response: privateJson({ error: 'JSON no válido', codigo: 'JSON_INVALIDO' }, 400) } }
}
function apiError(error: unknown) {
  if (error instanceof B8CentroCosteServiceError) return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) }, error.status)
  const prismaCode = (error as { code?: unknown } | null)?.code
  if (prismaCode === 'P2002' || prismaCode === 'P2034') return privateJson({ error: 'Conflicto concurrente B8; relea o reintente la misma solicitud.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  if (error instanceof Error && error.message === 'STAGING_ISOLATION_REQUIRED') return privateJson({ error: 'Staging aislado no verificado', codigo: 'STAGING_ISOLATION_REQUIRED' }, 503)
  return privateJson({ error: 'No se pudo procesar la imputación del centro de coste', codigo: 'ASIGNACION_CENTRO_COSTE_FALLIDA' }, 500)
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido', codigo: 'ORIGEN_INVALIDO' }, 403)
    const body = await readBoundedJson(req); if ('response' in body) return body.response
    const result = await asignarCentroCosteFinanzas(access.actor.id, body.value, await requiredCurrentSourceValidator())
    return privateJson({ ok: true, ...result }, result.idempotente ? 200 : 201)
  } catch (error) { return apiError(error) }
}
export async function GET() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function POST() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
