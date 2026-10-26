import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { HttpGuardError, readJsonLimited, sameOrigin } from '@/lib/finanzas/sync-jobs/api-guards'
import {
  ConciliarConfirmingServiceError,
  applyDocumentedConfirmingInterestInvoiceSupport,
  parseApplyDocumentedConfirmingInterestInvoiceSupport,
  parseUndoDocumentedConfirmingInterestInvoiceSupport,
  readDocumentedConfirmingInterestInvoiceCandidates,
  type ConfirmingQueryClient,
  undoDocumentedConfirmingInterestInvoiceSupport,
} from '@/lib/finanzas/conciliar-confirming'
import { scheduleConciliarProjectionRefresh } from '@/lib/finanzas/conciliar-refresh'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MAX_JSON_BYTES = 8 * 1024
const MAX_QUERY_BYTES = 2 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// PrismaClient has an overloaded $transaction not structurally assignable to
// the narrow query protocol. The real singleton is deliberately cast only here.
const confirmingDb = prisma as unknown as ConfirmingQueryClient

function errorResponse(error: unknown) {
  if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof ConciliarConfirmingServiceError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof HttpGuardError) return privateJson({ error: 'El cuerpo JSON no es válido para esta acción.', codigo: error.code }, error.status)
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'P2002' || code === 'P2034') return privateJson({ error: 'La relación cambió; vuelve a leer el historial.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  return privateJson({ error: 'No se pudo completar la relación manual de intereses.', codigo: 'C10_INTERESES_FAILED' }, 500)
}

function lotIds(request: NextRequest): readonly string[] | undefined {
  if (request.nextUrl.search.length > MAX_QUERY_BYTES) throw new ConciliarConfirmingServiceError(400, 'VALIDATION_ERROR', 'La consulta supera el límite permitido.')
  const values = request.nextUrl.searchParams.getAll('loteId')
  if (values.length === 0) return undefined
  if (values.length > 100 || values.some((value) => !UUID.test(value))) throw new ConciliarConfirmingServiceError(400, 'VALIDATION_ERROR', 'loteId no es válido.')
  if ([...request.nextUrl.searchParams.keys()].some((key) => key !== 'loteId')) throw new ConciliarConfirmingServiceError(400, 'VALIDATION_ERROR', 'La consulta contiene campos no admitidos.')
  return [...new Set(values.map((value) => value.toLowerCase()))].sort()
}

/** Sólo lista lotes C10 confirmados: no crea facturas, no descarga PDFs ni detecta vínculos. */
export async function GET(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    return privateJson(await readDocumentedConfirmingInterestInvoiceCandidates(confirmingDb, { loteIds: lotIds(request) }))
  } catch (error) { return errorResponse(error) }
}

/** Cuerpo cerrado; sólo la persona decide vínculo/desvínculo después de ver el documento disponible. */
export async function POST(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(request)) return privateJson({ error: 'Origen de la solicitud no válido.', codigo: 'INVALID_ORIGIN' }, 403)
    const raw = await readJsonLimited(request, MAX_JSON_BYTES)
    const action = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).action : null
    if (action === 'vincular_factura_interes') {
      const input = parseApplyDocumentedConfirmingInterestInvoiceSupport(raw)
      const result = await applyDocumentedConfirmingInterestInvoiceSupport(confirmingDb, access.actor.id, input)
      scheduleConciliarProjectionRefresh(access.actor.id)
      return privateJson({ ok: true, ...result })
    }
    if (action === 'desvincular_factura_interes') {
      const input = parseUndoDocumentedConfirmingInterestInvoiceSupport(raw)
      const result = await undoDocumentedConfirmingInterestInvoiceSupport(confirmingDb, access.actor.id, input)
      scheduleConciliarProjectionRefresh(access.actor.id)
      return privateJson({ ok: true, ...result })
    }
    return privateJson({ error: 'Acción C10 no admitida.', codigo: 'VALIDATION_ERROR' }, 400)
  } catch (error) { return errorResponse(error) }
}

export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function HEAD() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function OPTIONS() { return privateJson({ error: 'Método no permitido.' }, 405) }
