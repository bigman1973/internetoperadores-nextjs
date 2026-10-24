import { NextRequest } from 'next/server'
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging'
import { operatorAuth, operatorJson } from '@/lib/finanzas/operator-costs-auth'
import { CustomerCostAllocationError, SERVICE_PERIOD, UUID, parseAllocationPreparationRequest, parseAllocationRequest } from '@/lib/finanzas/customer-cost-allocation-core'
import { allocationHistory, confirmCustomerCostAllocation, listCandidateContracts, listEligibleSources, prepareCustomerCostAllocationSource, previewCustomerCostAllocation } from '@/lib/finanzas/customer-cost-allocation-db'

export const dynamic = 'force-dynamic'
const MAX_JSON_BYTES = 64 * 1024

function errorResponse(error: unknown) {
  if (error instanceof FinanceEasyRuntimeError) return operatorJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof CustomerCostAllocationError) return operatorJson({ error: error.message, codigo: error.code }, error.status)
  console.error('[customer-cost-allocation]', error)
  return operatorJson({ error: 'No se pudo procesar el reparto de coste.', codigo: 'CUSTOMER_COST_ALLOCATION_FAILED' }, 500)
}
function boundedText(value: string | null, name: string, max = 160): string {
  const text = (value || '').trim()
  if (text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new CustomerCostAllocationError('QUERY_INVALID', `${name} no es válido.`)
  return text
}
function page(value: string | null): number {
  if (value === null) return 1
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000) throw new CustomerCostAllocationError('QUERY_INVALID', 'page no es válida.')
  return Number(value)
}
async function boundedJson(req: NextRequest): Promise<unknown> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CustomerCostAllocationError('CONTENT_TYPE_REQUIRED', 'Se requiere application/json.', 415)
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) throw new CustomerCostAllocationError('BODY_TOO_LARGE', 'Solicitud demasiado grande.', 413)
  const raw = await req.text()
  if (Buffer.byteLength(raw) > MAX_JSON_BYTES) throw new CustomerCostAllocationError('BODY_TOO_LARGE', 'Solicitud demasiado grande.', 413)
  try { return JSON.parse(raw) } catch { throw new CustomerCostAllocationError('JSON_INVALID', 'JSON no válido.') }
}

export async function GET(req: NextRequest) {
  try {
    await assertFinanceEasyRuntime()
    const auth = await operatorAuth(false)
    if (auth instanceof Response) return auth
    const recurso = req.nextUrl.searchParams.get('recurso') || 'fuentes'
    if (recurso === 'fuentes') {
      const facturaId = req.nextUrl.searchParams.get('facturaId') || undefined
      if (facturaId && !UUID.test(facturaId)) throw new CustomerCostAllocationError('QUERY_INVALID', 'Factura no válida.')
      return operatorJson({ ...(await listEligibleSources(boundedText(req.nextUrl.searchParams.get('buscar'), 'buscar'), page(req.nextUrl.searchParams.get('page')), facturaId)), canWrite: auth.canWrite })
    }
    if (recurso === 'contratos') {
      const fuenteId = req.nextUrl.searchParams.get('fuenteId') || ''
      const periodoServicio = req.nextUrl.searchParams.get('periodoServicio') || ''
      if (!UUID.test(fuenteId) || !SERVICE_PERIOD.test(periodoServicio)) throw new CustomerCostAllocationError('QUERY_INVALID', 'Fuente o período de servicio no válido.')
      return operatorJson({ ...(await listCandidateContracts(fuenteId, periodoServicio, boundedText(req.nextUrl.searchParams.get('buscar'), 'buscar'))), canWrite: auth.canWrite })
    }
    if (recurso === 'historial') {
      const fuenteId = req.nextUrl.searchParams.get('fuenteId') || ''
      if (!UUID.test(fuenteId)) throw new CustomerCostAllocationError('QUERY_INVALID', 'Fuente no válida.')
      return operatorJson({ ...(await allocationHistory(fuenteId)), canWrite: auth.canWrite })
    }
    throw new CustomerCostAllocationError('QUERY_INVALID', 'Recurso no admitido.')
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const runtime = await assertFinanceEasyRuntime()
    const auth = await operatorAuth(true)
    if (auth instanceof Response) return auth
    if (req.headers.get('origin') !== req.nextUrl.origin) return operatorJson({ error: 'Origen no autorizado.', codigo: 'ORIGIN_INVALID' }, 403)
    const body = await boundedJson(req)
    if (typeof body === 'object' && body !== null && !Array.isArray(body) && (body as { action?: unknown }).action === 'prepare') {
      const preparation = parseAllocationPreparationRequest(body)
      return operatorJson({ stagingOnly: runtime.stagingOnly, ok: true, ...(await prepareCustomerCostAllocationSource(auth.userId, preparation)) }, 201)
    }
    const request = parseAllocationRequest(body)
    if (request.action === 'preview') return operatorJson({ stagingOnly: runtime.stagingOnly, ok: true, preview: await previewCustomerCostAllocation(request) })
    return operatorJson({ stagingOnly: runtime.stagingOnly, ok: true, ...(await confirmCustomerCostAllocation(auth.userId, request)) }, 201)
  } catch (error) { return errorResponse(error) }
}

export async function PUT() { return operatorJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return operatorJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return operatorJson({ error: 'Método no permitido.' }, 405) }
