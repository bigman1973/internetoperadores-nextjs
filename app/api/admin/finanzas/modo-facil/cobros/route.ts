import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertFinanceEasyRuntime } from '@/lib/finanzas/prototype-staging'
import { easyCollectionsErrorResponse, readEasyCollectionsPreview, runEasyCollectionsAction } from '@/lib/finanzas/easy-collections-db'
import { parseEasyCollectionsPreviewInput } from '@/lib/finanzas/easy-collections-core'
import { scheduleConciliarProjectionRefresh } from '@/lib/finanzas/conciliar-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const MAX_JSON_BYTES = 16 * 1024
const QUERY_KEYS = new Set(['nivel', 'metodo', 'q', 'limit', 'offset'])

async function boundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json.' }, 415) }
  const declared = req.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'El envío es demasiado grande.' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'No se ha recibido ninguna selección.' }, 400) }
  const reader = req.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0, body = ''
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, response: privateJson({ error: 'El envío es demasiado grande.' }, 413) }
      }
      body += decoder.decode(part.value, { stream: true })
    }
    body += decoder.decode()
    const value = JSON.parse(body)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, response: privateJson({ error: 'La selección no es válida.' }, 400) }
  } catch { return { ok: false, response: privateJson({ error: 'La selección no es válida.' }, 400) } }
}
function errorResponse(error: unknown) {
  const response = easyCollectionsErrorResponse(error)
  return privateJson(response.body, response.status)
}

/** Muestra sólo la generación actual. Esta lectura nunca confirma ni crea documentos B4. */
export async function GET(req: NextRequest) {
  try {
    await assertFinanceEasyRuntime()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if ([...req.nextUrl.searchParams.keys()].some(key => !QUERY_KEYS.has(key))) return privateJson({ error: 'La consulta contiene campos no admitidos.' }, 400)
    const input = parseEasyCollectionsPreviewInput({
      nivel: req.nextUrl.searchParams.get('nivel'), metodo: req.nextUrl.searchParams.get('metodo'),
      q: req.nextUrl.searchParams.get('q'), limit: req.nextUrl.searchParams.get('limit'), offset: req.nextUrl.searchParams.get('offset'),
    })
    return privateJson(await readEasyCollectionsPreview(input, access.actor.id))
  } catch (error) { return errorResponse(error) }
}

/** La persona ya eligió el bloque; la transacción vuelve a comprobar cada propuesta antes de escribir. */
export async function POST(req: NextRequest) {
  try {
    await assertFinanceEasyRuntime()
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'El origen de la solicitud no es válido.' }, 403)
    const body = await boundedJson(req)
    if ('response' in body) return body.response
    const result = await runEasyCollectionsAction(access.actor.id, body.value)
    scheduleConciliarProjectionRefresh(access.actor.id)
    return privateJson(result)
  } catch (error) { return errorResponse(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
