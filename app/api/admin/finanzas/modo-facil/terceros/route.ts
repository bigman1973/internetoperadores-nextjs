import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { easyCounterpartyErrorResponse, mutateEasyCounterparty, readEasyCounterparties, searchEasyCounterparties } from '@/lib/finanzas/easy-counterparty-db'
import { parseCounterpartyReadInput, parseCounterpartySearchInput } from '@/lib/finanzas/easy-counterparty-core'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 8 * 1024

async function boundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío' }, 400) }
  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let body = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
    const value = JSON.parse(body)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON' }, 400) }
  } catch {
    return { ok: false, response: privateJson({ error: 'JSON no válido' }, 400) }
  }
}

function errorResponse(error: unknown) {
  const response = easyCounterpartyErrorResponse(error)
  return privateJson(response.body, response.status)
}

/** P1 is projection-only. `pendientes=SI` is computed before pagination. */
export async function GET(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('lectura', session)
    if ('response' in access) return access.response
    const recurso = req.nextUrl.searchParams.get('recurso')
    if (recurso === 'buscar') {
      return privateJson(await searchEasyCounterparties(parseCounterpartySearchInput({
        movimientoId: req.nextUrl.searchParams.get('movimientoId'),
        buscar: req.nextUrl.searchParams.get('buscar'),
        limit: req.nextUrl.searchParams.get('limit'),
      })))
    }
    if (recurso !== null) return privateJson({ error: 'recurso no es válido' }, 400)
    const input = parseCounterpartyReadInput({
      desde: req.nextUrl.searchParams.get('desde'), hasta: req.nextUrl.searchParams.get('hasta'),
      limit: req.nextUrl.searchParams.get('limit'), offset: req.nextUrl.searchParams.get('offset'),
      q: req.nextUrl.searchParams.get('q'), sentido: req.nextUrl.searchParams.get('sentido'),
      tarjeta: req.nextUrl.searchParams.get('tarjeta'), pendientes: req.nextUrl.searchParams.get('pendientes'),
    })
    return privateJson(await readEasyCounterparties(input))
  } catch (error) { return errorResponse(error) }
}

/** Only explicit same-origin human confirmation may append/reverse P1 receipts. */
export async function POST(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('escritura', session)
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await boundedJson(req)
    if ('response' in body) return body.response
    return privateJson(await mutateEasyCounterparty(access.actor.id, body.value))
  } catch (error) { return errorResponse(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
