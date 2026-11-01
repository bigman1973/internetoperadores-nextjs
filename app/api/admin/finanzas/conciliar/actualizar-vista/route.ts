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

const REBUILD_HEARTBEAT_MS = 10_000
const MAX_REBUILD_HEARTBEATS = 12

type SafeRebuildErrorCode = 'P2028' | 'CONCILIAR_REBUILD_FAILED'

function isPrepararVistaCommand(value: unknown): value is { action: 'preparar-vista' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === 'action' && (value as Record<string, unknown>).action === 'preparar-vista'
}

function safeRebuildErrorCode(error: unknown): SafeRebuildErrorCode {
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2028') return 'P2028'
  return 'CONCILIAR_REBUILD_FAILED'
}

function logRebuildEvent(event: 'begin' | 'end' | 'error', startedAt: number, code?: SafeRebuildErrorCode) {
  const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt))
  console.info('conciliar-view-maintenance', { event, ...(code ? { code } : {}), elapsedMs })
}

/** A single authorized rebuild remains awaited after a reader disconnects; only writes to that reader stop. */
function streamConciliarViewRebuild(liveActorId: number): Response {
  const encoder = new TextEncoder()
  let clientClosed = false
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = performance.now()
      const emit = (event: Record<string, unknown>) => {
        if (clientClosed) return false
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          return true
        } catch {
          clientClosed = true
          return false
        }
      }
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let heartbeatCount = 0
      try {
        logRebuildEvent('begin', startedAt)
        emit({ type: 'preparando' })
        heartbeat = setInterval(() => {
          if (clientClosed || heartbeatCount >= MAX_REBUILD_HEARTBEATS) return
          heartbeatCount += 1
          emit({ type: 'heartbeat' })
          if (heartbeatCount === MAX_REBUILD_HEARTBEATS && heartbeat) {
            clearInterval(heartbeat)
            heartbeat = undefined
          }
        }, REBUILD_HEARTBEAT_MS)
        heartbeat.unref?.()

        const rebuilt = await rebuildConciliarProjection(liveActorId)
        emit({ type: 'terminado', rows: rebuilt.rows, rebuiltAt: rebuilt.rebuiltAt })
        logRebuildEvent('end', startedAt)
      } catch (error) {
        const code = safeRebuildErrorCode(error)
        emit({ type: 'error', error: 'No se pudo preparar la vista.', code })
        logRebuildEvent('error', startedAt, code)
      } finally {
        if (heartbeat) clearInterval(heartbeat)
        if (!clientClosed) {
          try {
            controller.close()
          } catch {
            // Reader cancellation only closes its transport; the awaited rebuild already finished.
          }
        }
      }
    },
    cancel() {
      clientClosed = true
    },
  })
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-encoding': 'identity',
      'x-accel-buffering': 'no',
    },
  })
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

    return streamConciliarViewRebuild(liveActor.id)
  } catch (error) {
    return errorResponse(error)
  }
}
