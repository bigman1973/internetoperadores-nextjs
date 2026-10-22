import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { B4ServiceError, confirmarB4, createDocumentoB4, deshacerB4, readConciliacionB4 } from '@/lib/finanzas/reconciliation-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 16 * 1024

async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  const contentType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío' }, 400) }
  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON' }, 400) }
    return { ok: true, value }
  } catch {
    return { ok: false, response: privateJson({ error: 'JSON no válido' }, 400) }
  }
}

function limit(value: string | null): number | null {
  if (value === null) return 50
  if (!/^\d{1,3}$/.test(value)) return null
  const number = Number(value)
  return number >= 1 && number <= 100 ? number : null
}

function offset(value: string | null): number | null {
  if (value === null) return 0
  if (!/^\d{1,6}$/.test(value)) return null
  const number = Number(value)
  return number >= 0 && number <= 100000 ? number : null
}

function query(value: string | null): string | null | undefined {
  if (value === null) return undefined
  const normalized = value.trim()
  return normalized.length <= 120 ? normalized : null
}

function optionalId(value: string | null): string | null | undefined {
  if (value === null) return undefined
  return value.length > 0 && value.length <= 160 ? value : null
}

function apiError(error: unknown) {
  if (error instanceof B4ServiceError) {
    return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) }, error.status)
  }
  const message = error instanceof Error ? error.message : ''
  if (message === 'STAGING_ISOLATION_REQUIRED') return privateJson({ error: 'Staging aislado no verificado', codigo: message }, 503)
  const prismaCode = (error as { code?: unknown } | null)?.code
  if (prismaCode === 'P2002' || prismaCode === 'P2034') {
    return privateJson({ error: 'Conflicto concurrente B4; relea y reintente.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  }
  return privateJson({ error: 'No se pudo procesar la operación B4' }, 500)
}

/** Read-only: no source or B4 record is repaired, initialized, or mutated here. */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('lectura', session)
    if ('response' in access) return access.response
    const movimientosLimit = limit(req.nextUrl.searchParams.get('movimientosLimit'))
    const documentosLimit = limit(req.nextUrl.searchParams.get('documentosLimit'))
    const movimientosOffset = offset(req.nextUrl.searchParams.get('movimientosOffset'))
    const documentosOffset = offset(req.nextUrl.searchParams.get('documentosOffset'))
    const q = query(req.nextUrl.searchParams.get('q'))
    const cuentaId = optionalId(req.nextUrl.searchParams.get('cuentaId'))
    const movimientoId = optionalId(req.nextUrl.searchParams.get('movimientoId'))
    if (movimientosLimit === null || documentosLimit === null || movimientosOffset === null || documentosOffset === null || q === null || cuentaId === null || movimientoId === null) {
      return privateJson({ error: 'Parámetro de lectura no válido' }, 400)
    }
    return privateJson(await readConciliacionB4(movimientosLimit, documentosLimit, { movimientosOffset, documentosOffset, q: q || undefined, cuentaId, movimientoId }))
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('escritura', session)
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await readBoundedJson(req)
    if ('response' in body) return body.response
    const action = (body.value as Record<string, unknown>).action
    if (action === 'documento') {
      const result = await createDocumentoB4(access.actor.id, body.value)
      return privateJson({ ok: true, documento: result.documento }, result.created ? 201 : 200)
    }
    if (action === 'confirmar') {
      const result = await confirmarB4(access.actor.id, body.value)
      return privateJson({ ok: true, ...result })
    }
    if (action === 'deshacer') {
      const result = await deshacerB4(access.actor.id, body.value)
      return privateJson({ ok: true, ...result })
    }
    return privateJson({ error: 'Acción B4 no admitida' }, 400)
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
