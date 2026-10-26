import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertFinanceEasyRuntime } from '@/lib/finanzas/prototype-staging'
import { easyErrorResponse, confirmEasyReconciliation, readEasyReconciliation } from '@/lib/finanzas/easy-reconciliation-db'
import { parseEasyReadInput } from '@/lib/finanzas/easy-reconciliation-core'
import { readEasyStepCounters } from '@/lib/finanzas/easy-counterparty-db'
import { readEasyCollectionsForMovements } from '@/lib/finanzas/easy-collections-db'
import { scheduleConciliarProjectionRefresh } from '@/lib/finanzas/conciliar-refresh'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 16 * 1024

async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return { ok: false, response: privateJson({ error: 'Se requiere application/json' }, 415) }
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) }
  if (!req.body) return { ok: false, response: privateJson({ error: 'Cuerpo vacío' }, 400) }
  const reader = req.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0; let text = ''
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); return { ok: false, response: privateJson({ error: 'Cuerpo demasiado grande' }, 413) } }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, response: privateJson({ error: 'El cuerpo debe ser un objeto JSON' }, 400) }
    return { ok: true, value }
  } catch { return { ok: false, response: privateJson({ error: 'JSON no válido' }, 400) } }
}
function errorResponse(error: unknown) { const response = easyErrorResponse(error); return privateJson(response.body, response.status) }

/** Projection only: no wrappers, B4 states, ticket management or rules are created by GET. */
export async function GET(req: NextRequest) {
  try {
    await assertFinanceEasyRuntime()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('lectura', session)
    if ('response' in access) return access.response
    const input = parseEasyReadInput({
      desde: req.nextUrl.searchParams.get('desde'), hasta: req.nextUrl.searchParams.get('hasta'),
      limit: req.nextUrl.searchParams.get('limit'), offset: req.nextUrl.searchParams.get('offset'),
      q: req.nextUrl.searchParams.get('q'), sentido: req.nextUrl.searchParams.get('sentido'), tarjeta: req.nextUrl.searchParams.get('tarjeta'),
    })
    const [reconciliation, pasos] = await Promise.all([
      readEasyReconciliation(input),
      // P1 and P2 remain separate read cohorts; GET does not append any P1 receipt.
      readEasyStepCounters(input),
    ])
    // Read-only enrichment: the current collection proposal (remesa, confirming, varias
    // facturas) of each visible movement. It never blocks the queue if unavailable.
    const movimientos = Array.isArray(reconciliation?.movimientos) ? reconciliation.movimientos : []
    let propuestas = new Map<string, unknown>()
    try { propuestas = await readEasyCollectionsForMovements(movimientos.map(movement => movement.id), access.actor.id) }
    catch (error) { console.warn('[modo-facil] propuestas de cobro no disponibles', (error as { code?: unknown })?.code ?? 'ERROR') }
    return privateJson({ ...reconciliation, movimientos: movimientos.map(movement => ({ ...movement, propuestaCobro: propuestas.get(movement.id) ?? null })), pasos })
  } catch (error) { return errorResponse(error) }
}

/** Explicit human confirmation only; the service ignores any client amount/document/source fields. */
export async function POST(req: NextRequest) {
  try {
    await assertFinanceEasyRuntime()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('escritura', session)
    if ('response' in access) return access.response
    if (!sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const body = await readBoundedJson(req)
    if ('response' in body) return body.response
    const result = await confirmEasyReconciliation(access.actor.id, body.value)
    scheduleConciliarProjectionRefresh(access.actor.id)
    return privateJson(result)
  } catch (error) { return errorResponse(error) }
}
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
