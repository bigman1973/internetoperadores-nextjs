import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { easyErrorResponse, mutateEasyRule } from '@/lib/finanzas/easy-reconciliation-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 8 * 1024
async function boundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío' }, 400) }
  const reader = req.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let size = 0; let text = ''
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) } }; text += decoder.decode(part.value, { stream: true }) }
    text += decoder.decode(); const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? { ok: true, value } : { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON' }, 400) }
  } catch { return { ok: false, response: privateJson({ error: 'JSON no válido' }, 400) } }
}
function errorResponse(error: unknown) { const response = easyErrorResponse(error); return privateJson(response.body, response.status) }

/** Rules only preserve an explicit B4 decision as a future suggestion refinement; they never confirm. */
export async function POST(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions); const access = await requireB4FinanceAccess('escritura', session)
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await boundedJson(req); if ('response' in body) return body.response
    return privateJson(await mutateEasyRule(access.actor.id, body.value))
  } catch (error) { return errorResponse(error) }
}
export async function GET() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
