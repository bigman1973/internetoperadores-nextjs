import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { projectionRow, type ProjectionSqlRow } from '@/lib/finanzas/conciliar-projection-read'
import { readEasyCollectionsRemittanceDetail, easyCollectionsErrorResponse } from '@/lib/finanzas/easy-collections-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
export const preferredRegion = 'sfo1'

/** Source selection and amounts are never accepted from the browser. This GET
 * only expands an authorized current projection; confirmation rechecks its hash
 * and live membership/capacity inside the existing serializable transaction. */
export async function GET(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const entries = [...request.nextUrl.searchParams.entries()]
    const rowId = request.nextUrl.searchParams.get('rowId')
    if (request.nextUrl.search.length > 300 || entries.length !== 1 || entries[0][0] !== 'rowId' || !rowId || !/^[A-Za-z0-9:_-]{1,240}$/.test(rowId)) {
      return privateJson({ error: 'Selecciona una única remesa de Conciliar.', codigo: 'FILA_INVALIDA' }, 400)
    }
    const rows = await prisma.$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${rowId} LIMIT 1`)
    if (rows.length !== 1) return privateJson({ error: 'La fila cambió; actualiza la lista.', codigo: 'DECISION_CAMBIADA' }, 409)
    const row = projectionRow(rows[0]), source = row.source
    if (rows[0].tab !== 'COBROS' || !row.seleccionable || row.color !== 'VERDE' || source.kind !== 'COBRO_PROPUESTA' || !source.propuestaId || !source.movimientoId || !source.proposalFingerprint || !source.proposalCompositionHash || !source.remesaId) {
      return privateJson({ error: 'Esta fila no conserva una remesa completa confirmable.', codigo: 'REMESA_REQUIERE_RECIBO_VERSIONADO' }, 422)
    }
    const detail = await readEasyCollectionsRemittanceDetail({ propuestaId: source.propuestaId, movimientoId: source.movimientoId, fingerprint: source.proposalFingerprint }, access.actor.id)
    if (detail.remesaDetalle.remesaId !== source.remesaId || detail.remesaDetalle.compositionHash !== source.proposalCompositionHash || detail.remesaDetalle.importeBancoCentimos !== row.importeCentimos) {
      return privateJson({ error: 'La composición cambió; actualiza la lista.', codigo: 'COMPOSICION_CAMBIADA' }, 409)
    }
    return privateJson({ preview: detail })
  } catch (error) {
    if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, codigo: error.code }, error.status)
    const known = easyCollectionsErrorResponse(error)
    return privateJson(known.body, known.status)
  }
}
export async function POST() { return privateJson({ error: 'El detalle sólo admite lectura.' }, 405) }
