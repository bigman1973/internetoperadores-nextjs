import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { CreditLinkHumanError, decideCreditLinkHuman, readCreditLinkHumanDecisions } from '@/lib/finanzas/finance-credit-note-human-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 4096
function stagingOnly() { return process.env.FINANCE_STAGING_SANDBOX === '1' }
function errorResponse(error: unknown) {
  if (error instanceof CreditLinkHumanError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof Error && (error.message === 'STAGING_ISOLATION_REQUIRED' || error.message === 'FINANCE_RUNTIME_NOT_APPROVED')) return privateJson({ error: 'Entorno financiero no aprobado', codigo: error.message }, 503)
  if (['P2002', 'P2034'].includes(String((error as { code?: string } | null)?.code ?? ''))) return privateJson({ error: 'Conflicto concurrente; relea y reintente.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  return privateJson({ error: 'No se pudo procesar la decisión de rectificativa.' }, 500)
}
async function body(req: NextRequest): Promise<unknown> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new CreditLinkHumanError(415, 'CONTENT_TYPE', 'Se requiere application/json.')
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) throw new CreditLinkHumanError(413, 'BODY_TOO_LARGE', 'Cuerpo demasiado grande.')
  const text = await req.text()
  if (text.length === 0 || Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) throw new CreditLinkHumanError(413, 'BODY_TOO_LARGE', 'Cuerpo no válido o demasiado grande.')
  try { return JSON.parse(text) } catch { throw new CreditLinkHumanError(400, 'INVALID_JSON', 'JSON no válido.') }
}
export async function GET() {
  if (!stagingOnly()) return privateJson({ error: 'Rectificativas humanas aún no están habilitadas fuera de staging.' }, 403)
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if (access.ok === false) return access.response
    return privateJson(await readCreditLinkHumanDecisions())
  } catch (error) { return errorResponse(error) }
}
export async function POST(req: NextRequest) {
  if (!stagingOnly()) return privateJson({ error: 'Rectificativas humanas aún no están habilitadas fuera de staging.' }, 403)
  try {
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if (access.ok === false) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de solicitud no válido.' }, 403)
    return privateJson(await decideCreditLinkHuman(access.actor.id, await body(req)))
  } catch (error) { return errorResponse(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
