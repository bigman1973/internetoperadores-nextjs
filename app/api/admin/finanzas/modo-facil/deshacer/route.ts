import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { easyUndoErrorResponse, undoEasy } from '@/lib/finanzas/easy-reconciliation-undo'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 16 * 1024

async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío' }, 400) }
  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_JSON_BYTES) {
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

function errorResponse(error: unknown) {
  const response = easyUndoErrorResponse(error)
  return privateJson(response.body, response.status)
}

/** Reversión explícita de una confirmación propia Modo Fácil; no acepta datos B4 del cliente. */
export async function POST(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('escritura', session)
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await readBoundedJson(req)
    if ('response' in body) return body.response
    return privateJson(await undoEasy(access.actor.id, body.value))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
