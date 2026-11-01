import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { rebuildConciliarProjection } from '@/lib/finanzas/conciliar-db'
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { HttpGuardError, readJsonLimited } from '@/lib/finanzas/sync-jobs/api-guards'
import { ImpersonationError, nextAuthSessionCookieName, requireLiveSuperAdmin } from '@/lib/impersonation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180
export const preferredRegion = 'sfo1'

function isPrepararVistaCommand(value: unknown): value is { action: 'preparar-vista' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === 'action' && (value as Record<string, unknown>).action === 'preparar-vista'
}

function errorResponse(error: unknown) {
  if (error instanceof ConciliarRuntimeError) return privateJson({ error: 'No disponible.' }, 404)
  if (error instanceof HttpGuardError) {
    if (error.status === 415) return privateJson({ error: 'Se requiere application/json.' }, 415)
    if (error.status === 413) return privateJson({ error: 'El cuerpo JSON supera el límite permitido.' }, 413)
    return privateJson({ error: 'El cuerpo JSON no es válido.' }, 400)
  }
  if (error instanceof ImpersonationError) return privateJson({ error: 'No autorizado.' }, error.status)
  return privateJson({ error: 'No se pudo preparar la vista.' }, 500)
}

/** Mantenimiento manual de la proyección: sólo staging, actor real y mandato cerrado. */
export async function POST(request: NextRequest) {
  try {
    // This maintenance endpoint has no promoted production mode, regardless of
    // the Conciliar presentation/runtime flags.
    if (process.env.VERCEL_ENV === 'production') return privateJson({ error: 'No disponible.' }, 404)
    const runtimeContext = await assertConciliarRuntime()
    if (runtimeContext.runtime !== 'staging') return privateJson({ error: 'No disponible.' }, 404)
    if (!sameOrigin(request)) return privateJson({ error: 'Origen de la solicitud no válido.' }, 403)

    const command = await readJsonLimited(request)
    if (!isPrepararVistaCommand(command)) return privateJson({ error: 'La acción solicitada no es válida.' }, 400)

    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: nextAuthSessionCookieName() })
    const liveActor = await requireLiveSuperAdmin(token)
    if (access.actor.id !== liveActor.id) return privateJson({ error: 'No autorizado.' }, 403)

    const rebuilt = await rebuildConciliarProjection(liveActor.id)
    return privateJson({ rows: rebuilt.rows, rebuiltAt: rebuilt.rebuiltAt })
  } catch (error) {
    return errorResponse(error)
  }
}
