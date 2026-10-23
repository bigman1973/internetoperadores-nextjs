import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { readHistoricalExclusionsReport } from '@/lib/finanzas/historical-exclusions-db'
import { renderHistoricalExclusionsCsv, renderHistoricalExclusionsHtml } from '@/lib/finanzas/historical-exclusions-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

function attachment(body: string, type: string, filename: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': type, 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const formato = req.nextUrl.searchParams.get('formato') ?? 'json'
    if (!['json', 'html', 'csv'].includes(formato)) return privateJson({ error: 'Formato de informe no válido.' }, 400)
    await assertFinanceRuntimeReady()
    const report = await readHistoricalExclusionsReport()
    if (formato === 'html') return attachment(renderHistoricalExclusionsHtml(report), 'text/html; charset=utf-8', 'informe-propuestas-heredadas-excluidas.html')
    if (formato === 'csv') return attachment(renderHistoricalExclusionsCsv(report), 'text/csv; charset=utf-8', 'informe-propuestas-heredadas-excluidas.csv')
    return privateJson(report)
  } catch (error) {
    console.error('HISTORICAL_EXCLUSIONS_REPORT_FAILED', error)
    return privateJson({ error: 'No se pudo generar el informe de propuestas heredadas excluidas.' }, 500)
  }
}
