import type { Session } from 'next-auth'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { privateJson, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { CutoffServiceError, confirmManualCutoff, readCutoffAccounts } from '@/lib/finanzas/bank-cutoffs-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 8 * 1024
const B7_AREA = 'admin.facturacion'
const B4_AREA = 'admin.finanzas.conciliacion'
const B3_AREA = 'admin.finanzas.importar'

function errorResponse(error: unknown) {
  if (error instanceof CutoffServiceError) return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { details: error.details }) }, error.status)
  if (error instanceof Error && (error.message === 'STAGING_ISOLATION_REQUIRED' || error.message === 'FINANCE_RUNTIME_NOT_APPROVED' || error.message === 'FINANCE_RUNTIME_DATABASE_MISMATCH')) {
    return privateJson({ error: 'Entorno financiero no aprobado', codigo: error.message }, 503)
  }
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'P2002' || code === 'P2034' || code === '40001') return privateJson({ error: 'Conflicto concurrente; vuelva a leer la cuenta.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  return privateJson({ error: 'No se pudo procesar la cobertura bancaria.' }, 500)
}

async function liveActor(): Promise<{ id: number } | { response: ReturnType<typeof privateJson> }> {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') return { response: privateJson({ error: 'No autorizado' }, 401) }
  const id = Number(session.user.id)
  if (!Number.isInteger(id) || id <= 0) return { response: privateJson({ error: 'No autorizado' }, 401) }
  return { id }
}

/** B5 (Conciliación) o B7 (Facturación) pueden leer el overlay; ambos se comprueban en servidor. */
async function requireCoverageRead(session: Session | null) {
  const b7 = await checkAdminAreaRead(B7_AREA, [], session)
  if (!b7) return null
  const b5 = await checkAdminAreaRead(B4_AREA, ['CONTABILIDAD'], session)
  if (!b5) return null
  const b3=await checkAdminAreaRead(B3_AREA,['CONTABILIDAD'],session)
  if(!b3) return null
  return privateJson({ error: 'Sin permiso de lectura financiera' }, b7.status === 401 || b5.status === 401 ? 401 : 403)
}

async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío' }, 400) }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const reader = req.body.getReader()
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
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON' }, 400) }
  } catch {
    return { ok: false, response: privateJson({ error: 'JSON no válido' }, 400) }
  } finally {
    try { reader.releaseLock() } catch { /* no altera la respuesta */ }
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const denied = await requireCoverageRead(session)
    if (denied) return denied
    return privateJson(await readCutoffAccounts())
  } catch (error) {
    return errorResponse(error)
  }
}

/** Sólo un usuario con escritura B3 viva puede atestiguar un extracto revisado. */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const actor = await liveActor()
    if ('response' in actor) return actor.response
    const denied = await checkAdminAreaWrite(B3_AREA, ['CONTABILIDAD'], session)
    if (denied) return privateJson({ error: denied.status === 401 ? 'No autorizado' : 'Sin permiso de escritura de extractos' }, denied.status)
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await readBoundedJson(req)
    if (body.ok === false) return body.response
    return privateJson(await confirmManualCutoff(actor.id, body.value), 201)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
