import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { HISTORICAL_BLOCK_RECEIPTS_MAX_BLOCKS, readHistoricalBlockReceipts } from '@/lib/finanzas/historical-block-receipts-db'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function readLimit(value: string | null): number | null {
  if (value === null) return HISTORICAL_BLOCK_RECEIPTS_MAX_BLOCKS
  if (!/^\d{1,3}$/.test(value)) return null
  const limit = Number(value)
  return limit >= 1 && limit <= HISTORICAL_BLOCK_RECEIPTS_MAX_BLOCKS ? limit : null
}

/**
 * Sólo lectura de recibos ya auditados. No acepta contexto de delegación, hashes,
 * claves de idempotencia ni otros datos de una ejecución de bloque.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const limit = readLimit(request.nextUrl.searchParams.get('limit'))
    if (limit === null) return privateJson({ error: 'Límite de recibos históricos no válido.' }, 400)
    await assertFinanceRuntimeReady()
    return privateJson({ items: await readHistoricalBlockReceipts(limit) })
  } catch {
    return privateJson({ error: 'No se pudieron leer los recibos históricos.' }, 500)
  }
}

export async function POST() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
