// app/api/admin/finanzas/remesas/b6/route.ts — integration-only B6 route.
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import {
  B6RemesaServiceError,
  confirmarAsociacionDevolucionRemesaB6,
  confirmarAsociacionFacturasRemesaB6,
  readFacturasISPChoicesB6,
  readDevolucionesB4B6,
  readRemesasListaB6,
} from '@/lib/finanzas/b6-remesas-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 256 * 1024

/** Content-Length is only an early rejection; the stream counter is authoritative. */
async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  const contentType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json', codigo: 'CONTENT_TYPE_REQUERIDO' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande', codigo: 'CUERPO_DEMASIADO_GRANDE' }, 413) }
  }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío', codigo: 'CUERPO_VACIO' }, 400) }
  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande', codigo: 'CUERPO_DEMASIADO_GRANDE' }, 413) }
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON', codigo: 'VALIDATION_ERROR' }, 400) }
    }
    return { ok: true, value }
  } catch {
    return { ok: false, response: privateJson({ error: 'JSON no válido', codigo: 'JSON_INVALIDO' }, 400) }
  }
}

function pageLimit(value: string | null): number | null {
  if (value === null) return 50
  if (!/^\d{1,3}$/.test(value)) return null
  const parsed = Number(value)
  return parsed >= 1 && parsed <= 100 ? parsed : null
}

function pageOffset(value: string | null): number | null {
  if (value === null) return 0
  if (!/^\d{1,6}$/.test(value)) return null
  const parsed = Number(value)
  return parsed >= 0 && parsed <= 100_000 ? parsed : null
}

function readQuery(value: string | null): string | null | undefined {
  if (value === null) return undefined
  const normalized = value.trim()
  return normalized.length <= 120 ? normalized : null
}

function optionalPositiveInt(value: string | null): number | null | undefined {
  if (value === null) return undefined
  if (!/^\d{1,10}$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 2_147_483_647 ? parsed : null
}

function apiError(error: unknown) {
  if (error instanceof B6RemesaServiceError) {
    return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) }, error.status)
  }
  const prismaCode = (error as { code?: unknown } | null)?.code
  if (prismaCode === 'P2002' || prismaCode === 'P2034') {
    return privateJson({ error: 'Conflicto concurrente B6; relea y reintente.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  }
  if (error instanceof Error && error.message === 'STAGING_ISOLATION_REQUIRED') {
    return privateJson({ error: 'Staging aislado no verificado', codigo: 'STAGING_ISOLATION_REQUIRED' }, 503)
  }
  // No database/internal error is returned to the caller.
  return privateJson({ error: 'No se pudo procesar la operación B6', codigo: 'REMESAS_B6_FALLIDA' }, 500)
}

/**
 * GET ?recurso=remesasLista|facturasISPchoices&limit=1..100&offset=0..2000&q<=120
 * Optional facturasISPchoices remesaId filters to unassigned + that remesa only.
 * The result is a human-review picker and source fingerprint, never an authorization.
 */
export async function GET(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const recurso = req.nextUrl.searchParams.get('recurso')
    const limit = pageLimit(req.nextUrl.searchParams.get('limit'))
    const offset = pageOffset(req.nextUrl.searchParams.get('offset'))
    const q = readQuery(req.nextUrl.searchParams.get('q'))
    const remesaId = optionalPositiveInt(req.nextUrl.searchParams.get('remesaId'))
    if ((recurso !== 'remesasLista' && recurso !== 'facturasISPchoices' && recurso !== 'devolucionesB4' && recurso !== 'miembrosRemesa') || limit === null || offset === null || q === null || remesaId === null) {
      return privateJson({ error: 'Parámetro de lectura no válido', codigo: 'LECTURA_INVALIDA' }, 400)
    }
    if (recurso === 'remesasLista') {
      if (remesaId !== undefined) return privateJson({ error: 'remesaId sólo aplica a facturasISPchoices', codigo: 'LECTURA_INVALIDA' }, 400)
      return privateJson(await readRemesasListaB6({ limit, offset, q }))
    }
    if(recurso==='miembrosRemesa'){if(remesaId===undefined)return privateJson({error:'Seleccione remesa',codigo:'LECTURA_INVALIDA'},400);return privateJson(await readFacturasISPChoicesB6({remesaId,onlyMembers:true,limit,offset,q}))}
    if(recurso==='devolucionesB4')return privateJson(await readDevolucionesB4B6({remesaId,limit,offset,q}))
    return privateJson(await readFacturasISPChoicesB6({ remesaId, limit, offset, q }))
  } catch (error) {
    return apiError(error)
  }
}

/**
 * POST action='asociar_facturas' or action='asociar_devolucion'. Both require a
 * live B4 escritura check and same origin. No proposal/no-op write action exists.
 */
export async function POST(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido', codigo: 'ORIGEN_INVALIDO' }, 403)
    const body = await readBoundedJson(req)
    if ('response' in body) return body.response
    const action = (body.value as Record<string, unknown>).action
    if (action === 'asociar_facturas') {
      const result = await confirmarAsociacionFacturasRemesaB6(access.actor.id, body.value)
      return privateJson({ ok: true, ...result }, result.idempotente ? 200 : 201)
    }
    if (action === 'asociar_devolucion') {
      const result = await confirmarAsociacionDevolucionRemesaB6(access.actor.id, body.value)
      return privateJson({ ok: true, ...result }, result.idempotente ? 200 : 201)
    }
    return privateJson({ error: 'Acción B6 no admitida', codigo: 'ACCION_NO_ADMITIDA' }, 400)
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
