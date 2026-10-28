import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { ConciliarDbError, conciliarDbErrorResponse } from '@/lib/finanzas/conciliar-errors'
import { parseConciliarDocumentDetail } from '@/lib/finanzas/conciliar-document-detail-contract'
import { ConciliarDocumentDetailError, CONCILIAR_DOCUMENT_DETAIL_ROW_ID, readConciliarDocumentDetail } from '@/lib/finanzas/conciliar-document-detail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
export const preferredRegion = 'sfo1'

function errorResponse(error: unknown) {
  if (error instanceof ConciliarRuntimeError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof ConciliarDocumentDetailError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof ConciliarDbError) {
    const response = conciliarDbErrorResponse(error)
    return privateJson(response.body, response.status)
  }
  return privateJson({ error: 'No se pudo leer el detalle documental de Conciliar.', codigo: 'DETALLE_DOCUMENTAL_FAILED' }, 500)
}

/**
 * La única selección admitida es el rowId opaco ya persistido en la proyección.
 * La sesión efectiva se resuelve de nuevo y el lector no acepta fuentes, importes,
 * hashes, IDs documentales ni localizadores proporcionados por el navegador.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertConciliarRuntime()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const { id } = await context.params
    if (request.nextUrl.search || !CONCILIAR_DOCUMENT_DETAIL_ROW_ID.test(id)) {
      return privateJson({ error: 'Selecciona una única fila documental válida.', codigo: 'FILA_INVALIDA' }, 400)
    }
    // Parsing the server-produced value keeps this endpoint at the public DTO
    // boundary and prevents accidental addition of locators or source identifiers.
    return privateJson(parseConciliarDocumentDetail(await readConciliarDocumentDetail(id, access.actor.id)))
  } catch (error) { return errorResponse(error) }
}

export async function POST() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
export async function PUT() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
export async function PATCH() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
export async function DELETE() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
export async function HEAD() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
export async function OPTIONS() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
