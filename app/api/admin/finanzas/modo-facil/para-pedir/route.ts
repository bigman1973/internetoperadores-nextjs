import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { easyErrorResponse, readEasyReconciliation } from '@/lib/finanzas/easy-reconciliation-db'
import { parseEasyReadInput } from '@/lib/finanzas/easy-reconciliation-core'

export const dynamic = 'force-dynamic'
function errorResponse(error: unknown) { const response = easyErrorResponse(error); return privateJson(response.body, response.status) }

/**
 * Single documentary queue for manual collection. This delegates entirely to the
 * existing B4 SIN_DOCUMENTO reader, then projects only movements without a
 * confirmable current document. It does not send, upload, sync, create wrappers
 * or mutate B4/P1. P1 context is deliberately limited to fiscal type/card/account
 * information supplied by the B4 reader for a person to collect a document.
 */
export async function GET(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('lectura', session)
    if ('response' in access) return access.response
    const input = parseEasyReadInput({
      desde: req.nextUrl.searchParams.get('desde'), hasta: req.nextUrl.searchParams.get('hasta'),
      limit: req.nextUrl.searchParams.get('limit'), offset: req.nextUrl.searchParams.get('offset'),
      q: req.nextUrl.searchParams.get('q'), sentido: req.nextUrl.searchParams.get('sentido'), tarjeta: req.nextUrl.searchParams.get('tarjeta'),
    })
    const queue = await readEasyReconciliation(input)
    const movimientos = queue.movimientos.filter(movement => !movement.sugerencias.some(suggestion => suggestion.exacta && (movement.importeCentimos >= 0 || suggestion.archivoDisponible)))
    return privateJson({
      stagingOnly: true as const,
      automaticas: false as const,
      accionExterna: 'NINGUNA' as const,
      criterio: 'Cola documental B4 SIN_DOCUMENTO sin soporte actual confirmable; recogida manual, sin envío ni sincronización.',
      periodo: queue.periodo,
      // The B4 denominator stays explicit even when this projected page has fewer rows.
      contadorPaso2: { cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO' as const, totalMovimientos: queue.total, cargos: queue.totales.cargos, cobros: queue.totales.cobros, cargosCentimos: queue.totales.cargosCentimos, cobrosCentimos: queue.totales.cobrosCentimos },
      limit: queue.limit,
      offset: queue.offset,
      totalPaginaSinSoporte: movimientos.length,
      movimientos,
    })
  } catch (error) { return errorResponse(error) }
}
export async function POST() { return privateJson({ error: 'Para Pedir sólo permite lectura; recoge el soporte manualmente y no envía nada.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
