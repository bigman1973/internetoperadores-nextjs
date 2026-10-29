import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import {
  ConfirmingControlledSupportRegistryError,
  declareConfirmingControlledSupport,
  readConfirmingControlledSupportCandidates,
} from '@/lib/finanzas/confirming-controlled-support-registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MAX_JSON_BYTES = 4096
function stagingOnly(): boolean { return process.env.FINANCE_STAGING_SANDBOX === '1' }
function errorResponse(error: unknown) {
  if (error instanceof ConfirmingControlledSupportRegistryError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof Error && (error.message === 'STAGING_ISOLATION_REQUIRED' || error.message === 'FINANCE_RUNTIME_NOT_APPROVED')) {
    return privateJson({ error: 'Entorno financiero no aprobado.', codigo: error.message }, 503)
  }
  if (['P2002', 'P2034'].includes(String((error as { code?: unknown } | null)?.code ?? ''))) {
    return privateJson({ error: 'Conflicto concurrente; relea la fuente y reintente.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  }
  return privateJson({ error: 'No se pudo registrar la declaración de soporte confirming.', codigo: 'CONFIRMING_SUPPORT_REGISTRY_FAILED' }, 500)
}
async function body(req: NextRequest): Promise<unknown> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ConfirmingControlledSupportRegistryError(415, 'CONTENT_TYPE', 'Se requiere application/json.')
  }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    throw new ConfirmingControlledSupportRegistryError(413, 'BODY_TOO_LARGE', 'El cuerpo supera el límite permitido.')
  }
  const text = await req.text()
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) {
    throw new ConfirmingControlledSupportRegistryError(413, 'BODY_TOO_LARGE', 'El cuerpo no es válido o supera el límite permitido.')
  }
  try { return JSON.parse(text) } catch { throw new ConfirmingControlledSupportRegistryError(400, 'INVALID_JSON', 'JSON no válido.') }
}

/** Sólo lista metadata ya persistida: nunca llama Graph, OCR, PDF ni ingesta. */
export async function GET() {
  if (!stagingOnly()) return privateJson({ error: 'El registro humano de fuentes confirming sólo está habilitado en staging.' }, 403)
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if (access.ok === false) return access.response
    return privateJson(await readConfirmingControlledSupportCandidates())
  } catch (error) { return errorResponse(error) }
}

/** Una declaración humana prepara la revisión posterior; no importa ni confirma cobros. */
export async function POST(req: NextRequest) {
  if (!stagingOnly()) return privateJson({ error: 'El registro humano de fuentes confirming sólo está habilitado en staging.' }, 403)
  try {
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if (access.ok === false) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de solicitud no válido.' }, 403)
    return privateJson(await declareConfirmingControlledSupport(access.actor.id, await body(req)))
  } catch (error) { return errorResponse(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
