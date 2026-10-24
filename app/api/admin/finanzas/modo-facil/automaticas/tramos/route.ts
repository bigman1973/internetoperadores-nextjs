import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { assertFinanceEasyRuntime } from '@/lib/finanzas/prototype-staging'
import { canManageEasyAutomation } from '@/lib/finanzas/easy-access-profile'
import {
  bankChainGapErrorResponse,
  parseBankChainGapPageInput,
  readBankChainGapPage,
  readBankChainGapSummary,
} from '@/lib/finanzas/bank-chain-gaps-db'

export const dynamic = 'force-dynamic'

function errorResponse(error: unknown) {
  const response = bankChainGapErrorResponse(error)
  return privateJson(response.body, response.status)
}

/**
 * Private diagnostic read only. It accepts no body and never changes balances,
 * movements, automatic confirmations, attestations, or coverage metadata.
 */
export async function GET(req: NextRequest) {
  try {
    const runtime = await assertFinanceEasyRuntime()
    const session = await getServerSession(authOptions)
    const access = await requireB4FinanceAccess('lectura', session)
    if ('response' in access) return access.response
    if (!await canManageEasyAutomation(access.actor.id, runtime)) {
      return privateJson({ error: 'El perfil vivo no puede consultar el diagnóstico de tramos de saldo.', codigo: 'TRAMOS_CADENA_NO_AUTORIZADOS' }, 403)
    }
    const page = parseBankChainGapPageInput(req.nextUrl.searchParams)
    return privateJson(page
      ? await readBankChainGapPage(access.actor.id, page)
      : await readBankChainGapSummary(access.actor.id))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
