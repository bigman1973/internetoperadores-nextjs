import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { ConciliarDbError, conciliarDbErrorResponse, readConciliarHistory } from '@/lib/finanzas/conciliar-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_QUERY_BYTES = 512

function fail(message: string): never { throw new Error(message) }
function positiveInteger(value: string | null, field: string, min: number, max: number): number {
  const source = value ?? (field === 'limit' ? '50' : '0')
  if (!/^\d{1,6}$/.test(source)) fail('PAGINACION_INVALIDA')
  const parsed = Number(source)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) fail('PAGINACION_INVALIDA')
  return parsed
}
function input(request: NextRequest): { limit: number; offset: number } {
  if (request.nextUrl.search.length > MAX_QUERY_BYTES) fail('PAGINACION_INVALIDA')
  const seen = new Set<string>()
  for (const [key] of request.nextUrl.searchParams) {
    if (!['limit', 'offset'].includes(key) || seen.has(key)) fail('PAGINACION_INVALIDA')
    seen.add(key)
  }
  return {
    limit: positiveInteger(request.nextUrl.searchParams.get('limit'), 'limit', 1, 100),
    offset: positiveInteger(request.nextUrl.searchParams.get('offset'), 'offset', 0, 100_000),
  }
}
function errorResponse(error: unknown) {
  if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof ConciliarDbError) {
    const response = conciliarDbErrorResponse(error)
    return privateJson(response.body, response.status)
  }
  if (error instanceof Error && error.message === 'PAGINACION_INVALIDA') return privateJson({ error: 'La paginación no es válida.', codigo: 'PAGINACION_INVALIDA' }, 400)
  return privateJson({ error: 'No se pudo leer el historial de Conciliar.', codigo: 'CONCILIAR_HISTORIAL_FAILED' }, 500)
}

/** Only the current B4 actor's Conciliar receipts are exposed; no other operation source is queried. */
export async function GET(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const page = input(request)
    return privateJson(await readConciliarHistory(access.actor.id, page.limit, page.offset))
  } catch (error) { return errorResponse(error) }
}

export async function POST() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function HEAD() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function OPTIONS() { return privateJson({ error: 'Método no permitido.' }, 405) }
