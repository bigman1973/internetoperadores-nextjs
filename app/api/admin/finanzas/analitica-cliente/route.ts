import { NextRequest } from 'next/server'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import {
  PhoneCostInputError,
  parsePhoneCostReadOptions,
  readPhoneCostAnalytics,
} from '@/lib/finanzas/phone-cost-db'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'

export const dynamic = 'force-dynamic'

/**
 * Telefonía/SOFÍA remains staging-only: use the strict assertion (not the
 * promoted Modo fácil/Reparto guard) before authentication and every SELECT.
 * It is therefore unavailable in production even to an administrator.
 */
export async function GET(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura')
    if (access.ok === false) return access.response
    const options = parsePhoneCostReadOptions(request.nextUrl.searchParams)
    return privateJson(await readPhoneCostAnalytics(options))
  } catch (error) {
    if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, code: error.code }, error.status)
    if (error instanceof PhoneCostInputError) return privateJson({ error: error.message }, 400)
    // Deliberately never logs OCR, phone values, client names or source text.
    return privateJson({ error: 'No se pudo cargar la analítica telefónica. No se ha modificado ningún dato.' }, 500)
  }
}
