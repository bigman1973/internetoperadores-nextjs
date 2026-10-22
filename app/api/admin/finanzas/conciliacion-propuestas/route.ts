// app/api/admin/finanzas/conciliacion-propuestas/route.ts — INTEGRATION DRAFT
import { NextRequest } from 'next/server'
import {B4ServiceError} from '@/lib/finanzas/reconciliation-db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { B6ProposalServiceError, readPropuestaConciliacionB6 } from '@/lib/finanzas/reconciliation-proposals-db'

export const dynamic = 'force-dynamic'

function opaqueId(value: string | null): string | null {
  if (value === null || value.length === 0 || value.length > 160) return null
  return value
}
function apiError(error: unknown) {
  if (error instanceof B6ProposalServiceError || error instanceof B4ServiceError) {
    return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) }, error.status)
  }
  // Infrastructure failure is not rendered as a fake zero/no-candidate proposal.
  return privateJson({ error: 'No se pudo leer la propuesta B6', codigo: 'LECTURA_PROPUESTA_FALLIDA' }, 500)
}

/**
 * GET /api/admin/finanzas/conciliacion-propuestas?movimientoId=<opaque id>
 *
 * No B4 operation is created and no legacy reconciliation/payment field changes.
 * `fingerprintB4` is an optimistic display fingerprint only; B4 re-reads and
 * serializably validates source, version and capacity at its existing POST flow.
 */
export async function GET(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const movimientoId = opaqueId(req.nextUrl.searchParams.get('movimientoId'))
    if (!movimientoId) return privateJson({ error: 'movimientoId es obligatorio y debe ser un identificador opaco válido.' }, 400)
    return privateJson(await readPropuestaConciliacionB6(movimientoId))
  } catch (error) {
    return apiError(error)
  }
}

// Confirmation is exclusively the existing B4 endpoint. This route is read-only.
export async function POST() { return privateJson({ error: 'Método no permitido; confirme sólo mediante B4.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
