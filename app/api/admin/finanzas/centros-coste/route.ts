// app/api/admin/finanzas/centros-coste/route.ts
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import {
  B8CentroCosteServiceError,
  crearCentroCosteFinanzas,
  desactivarCentroCosteFinanzas,
  editarCentroCosteFinanzas,
  leerAnaliticaCentrosCoste,
  leerLineasConfirmadasCentroCoste,
  readCentrosCosteFinanzas,
  type CurrentSourceValidatorB8,
} from '@/lib/finanzas/centros-coste-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 64 * 1024

/**
 * This lazy B4 import prevents a B8->B4 static import cycle. The B4 factory is
 * mandatory and must call B4's actual signed/cap source policy under the passed
 * transaction; it is not a session/client callback or an optional fallback.
 */
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
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande', codigo: 'CUERPO_DEMASIADO_GRANDE' }, 413) } }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON', codigo: 'VALIDATION_ERROR' }, 400) }
    return { ok: true, value }
  } catch {
    return { ok: false, response: privateJson({ error: 'JSON no válido', codigo: 'JSON_INVALIDO' }, 400) }
  }
}
function boolQuery(value: string | null): boolean | null {
  if (value === null) return false
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}
function isoDateQuery(value: string | null): string | null { return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null }
function limitQuery(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^\d+$/.test(value)) return '__invalid__'
  return value
}
function apiError(error: unknown) {
  if (error instanceof B8CentroCosteServiceError) return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) }, error.status)
  const prismaCode = (error as { code?: unknown } | null)?.code
  if (prismaCode === 'P2002' || prismaCode === 'P2034') return privateJson({ error: 'Conflicto concurrente B8; relea o reintente la misma solicitud.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  if (error instanceof Error && error.message === 'STAGING_ISOLATION_REQUIRED') return privateJson({ error: 'Staging aislado no verificado', codigo: 'STAGING_ISOLATION_REQUIRED' }, 503)
  return privateJson({ error: 'No se pudo procesar centros de coste', codigo: 'CENTROS_COSTE_FALLIDA' }, 500)
}

/** GET resource contract: centros | analitica | lineas-confirmadas. */
export async function GET(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const recurso = req.nextUrl.searchParams.get('recurso') ?? 'centros'
    if (recurso === 'centros' || recurso === 'catalogo') {
      const incluirInactivos = boolQuery(req.nextUrl.searchParams.get('incluirInactivos'))
      if (incluirInactivos === null) return privateJson({ error: 'incluirInactivos no válido', codigo: 'LECTURA_INVALIDA' }, 400)
      return privateJson(await readCentrosCosteFinanzas({ actorId: access.actor.id, incluirInactivos }))
    }
    const validator = await requiredCurrentSourceValidator()
    if (recurso === 'analitica') {
      const rawFechaCorte = req.nextUrl.searchParams.get('fechaCorte')
      const fechaCorte = rawFechaCorte === null ? null : isoDateQuery(rawFechaCorte)
      if (rawFechaCorte !== null && fechaCorte === null) return privateJson({ error: 'fechaCorte debe ser YYYY-MM-DD', codigo: 'LECTURA_INVALIDA' }, 400)
      return privateJson(await leerAnaliticaCentrosCoste({ actorId: access.actor.id, fechaCorte, requiredCurrentSourceValidator: validator }))
    }
    if (recurso === 'lineas-confirmadas') {
      const limit = limitQuery(req.nextUrl.searchParams.get('limit'))
      if (limit === '__invalid__') return privateJson({ error: 'limit debe ser entero positivo', codigo: 'LECTURA_INVALIDA' }, 400)
      const pagina = limitQuery(req.nextUrl.searchParams.get('pagina'))
      if (pagina === '__invalid__') return privateJson({ error: 'pagina debe ser entero positivo', codigo: 'LECTURA_INVALIDA' }, 400)
      return privateJson(await leerLineasConfirmadasCentroCoste({ actorId: access.actor.id, limit, pagina, requiredCurrentSourceValidator: validator }))
    }
    return privateJson({ error: 'recurso no admitido', codigo: 'LECTURA_INVALIDA' }, 400)
  } catch (error) { return apiError(error) }
}

/** Catalog writes are root-only in the DB transaction; this route guard is merely early auth. */
export async function POST(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido', codigo: 'ORIGEN_INVALIDO' }, 403)
    const body = await readBoundedJson(req); if ('response' in body) return body.response
    return privateJson({ ok: true, ...(await crearCentroCosteFinanzas(access.actor.id, body.value)) }, 201)
  } catch (error) { return apiError(error) }
}
export async function PATCH(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido', codigo: 'ORIGEN_INVALIDO' }, 403)
    const body = await readBoundedJson(req); if ('response' in body) return body.response
    const mode = (body.value as Record<string, unknown>).mode
    if (mode === 'editar') return privateJson({ ok: true, ...(await editarCentroCosteFinanzas(access.actor.id, body.value)) })
    if (mode === 'desactivar') return privateJson({ ok: true, ...(await desactivarCentroCosteFinanzas(access.actor.id, body.value)) })
    return privateJson({ error: 'PATCH de catálogo sólo admite editar o desactivar', codigo: 'MODO_INVALIDO' }, 400)
  } catch (error) { return apiError(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
