import { NextRequest } from 'next/server'
import { createDocumentosPanelForRequest, documentosPanelError, jsonPrivado, readPanelMultipart } from '@/lib/finanzas/documentos-panel'
import { fail } from '@/lib/finanzas/documentos-panel-core'
import { assertDocumentosProductionTransportConfigured } from '@/lib/finanzas/documentos-production-selected'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(req: NextRequest) {
  try {
    if ([...req.nextUrl.searchParams.keys()].some(k => !['offset','limit'].includes(k))) fail(400, 'QUERY_INVALIDA', 'Sólo offset y limit.')
    const { service, canWrite, canConfirm, context } = await createDocumentosPanelForRequest(req)
    const offset = req.nextUrl.searchParams.get('offset') ?? '0', limit = req.nextUrl.searchParams.get('limit') ?? '40'
    if (!/^\d+$/.test(offset) || !/^[1-9]\d*$/.test(limit)) fail(400, 'PAGINACION_INVALIDA', 'Paginación inválida.')
    let productionTransportPending = false
    if (!context.stageOnly) { try { assertDocumentosProductionTransportConfigured() } catch { productionTransportPending = true } }
    return jsonPrivado({ ...await service.list(Number(offset), Number(limit)), canWrite: await canWrite(), canConfirm: await canConfirm(), stageOnly: context.stageOnly, environment: context.environment, readOnly: context.readOnly, productionTransportPending })
  } catch (error) { return documentosPanelError(error) }
}
export async function POST(req: NextRequest) {
  try {
    const { service } = await createDocumentosPanelForRequest(req, true)
    const file = await readPanelMultipart(req)
    const documento = await service.upload(file)
    return jsonPrivado({ documento }, documento.repetido ? 200 : 201)
  } catch (error) { return documentosPanelError(error) }
}
