import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { easyCounterpartyBulkErrorResponse, readEasyCounterpartyBulkPreview, runEasyCounterpartyBulk } from '@/lib/finanzas/easy-counterparty-bulk-db'
import { parseEasyCounterpartyBulkPreviewInput } from '@/lib/finanzas/easy-counterparty-bulk-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 45
const MAX_JSON_BYTES = 16 * 1024

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
  const response = easyCounterpartyBulkErrorResponse(error)
  return privateJson(response.body, response.status)
}

/** Shows a bounded current list only. It never appends a P1 receipt or changes B4. */
export async function GET(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const input = parseEasyCounterpartyBulkPreviewInput({
      desde: req.nextUrl.searchParams.get('desde'), hasta: req.nextUrl.searchParams.get('hasta'),
      limit: req.nextUrl.searchParams.get('limit'), offset: req.nextUrl.searchParams.get('offset'),
      q: req.nextUrl.searchParams.get('q'), sentido: req.nextUrl.searchParams.get('sentido'), tarjeta: req.nextUrl.searchParams.get('tarjeta'),
    })
    return privateJson(await readEasyCounterpartyBulkPreview(input, access.actor.id))
  } catch (error) { return errorResponse(error) }
}

/** A person has selected every row; POST still re-checks the actor and every row under one SERIALIZABLE transaction. */
export async function POST(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'El origen de la solicitud no es válido.' }, 403)
    const body = await boundedJson(req)
    if ('response' in body) return body.response
    return privateJson(await runEasyCounterpartyBulk(access.actor.id, body.value))
  } catch (error) { return errorResponse(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
