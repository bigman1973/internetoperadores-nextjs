import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jsonPrivado, requireFacturaAccess } from '@/lib/finanzas/invoice-quality-db'
import { assertFinanceStagingIsolated } from '@/lib/finanzas/staging-safety'
import { parseFiscalPeriod } from '@/lib/finanzas/fiscal-estimate-core'
import { readFiscalEstimate } from '@/lib/finanzas/fiscal-estimate-db'

export const dynamic = 'force-dynamic'
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
function queryPeriod(params: URLSearchParams) {
  const keys = [...params.keys()]
  if (keys.some(key => key !== 'desde' && key !== 'hasta') || params.getAll('desde').length !== 1 || params.getAll('hasta').length !== 1) throw new Error('Se requieren exclusivamente desde y hasta, una vez cada uno.')
  const desde = params.get('desde'), hasta = params.get('hasta')
  if (!desde || !hasta || !DATE.test(desde) || !DATE.test(hasta)) throw new Error('desde y hasta deben ser fechas ISO YYYY-MM-DD.')
  return parseFiscalPeriod({ desde, hasta })
}
export async function GET(request: NextRequest) {
  try {
    const access = await requireFacturaAccess(false)
    if ('error' in access) return access.error
    const period = queryPeriod(request.nextUrl.searchParams)
    await assertFinanceStagingIsolated()
    const estimate = await readFiscalEstimate(prisma, period)
    return jsonPrivado({ recurso: 'estimacionFiscalDocumental', estimacion: estimate })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo leer la estimación documental.'
    const invalid = /desde|hasta|período|fecha|exclusivamente|límite|acota/i.test(message)
    return jsonPrivado({ error: invalid ? message : 'No se pudo leer la estimación documental. No se sustituyen datos por ceros.' }, invalid ? 400 : 500)
  }
}
