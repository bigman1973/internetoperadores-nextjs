import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertFinanceEasyRuntime } from '@/lib/finanzas/prototype-staging'
import { canManageEasyAutomation } from '@/lib/finanzas/easy-access-profile'
import { easyAutoErrorResponse, mutateEasyAutomation, readEasyAutomation } from '@/lib/finanzas/easy-auto-db'

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
  const response = easyAutoErrorResponse(error)
  return privateJson(response.body, response.status)
}

async function requireAutomationManager(accessLevel: 'lectura' | 'escritura', session?: Session | null) {
  const runtime = await assertFinanceEasyRuntime()
  const access = await requireB4FinanceAccess(accessLevel, session)
  if ('response' in access) return access
  if (!await canManageEasyAutomation(access.actor.id, runtime)) {
    return { response: privateJson({ error: 'El perfil vivo no puede gestionar automatización restringida.', codigo: 'AUTOMATIZACION_NO_AUTORIZADA' }, 403) }
  }
  return { access, runtime }
}

/** Read-only projection of technically blocked candidates, actionable chain failures,
 * applied receipts and reversible operations. It never initializes policy/state. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const gate = await requireAutomationManager('lectura', session)
    if ('response' in gate) return gate.response
    return privateJson(await readEasyAutomation())
  } catch (error) {
    return errorResponse(error)
  }
}

/** The only mutating entry point: explicit policy opt-in, one-account transfer
 * attestation, finite execution and atomic undo all re-check live manager access.
 * A pure commission's bank is derived server-side from CuentaBancaria.banco. */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const gate = await requireAutomationManager('escritura', session)
    if ('response' in gate) return gate.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await readBoundedJson(req)
    if ('response' in body) return body.response
    return privateJson(await mutateEasyAutomation(gate.access.actor.id, body.value))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
