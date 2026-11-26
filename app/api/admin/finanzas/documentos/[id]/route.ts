import { NextRequest } from 'next/server'
import { createDocumentosPanelForRequest, documentosPanelError, jsonPrivado, readPanelJson } from '@/lib/finanzas/documentos-panel'
import { fail } from '@/lib/finanzas/documentos-panel-core'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function GET(req: NextRequest, context: Context) {
  try {
    if ([...req.nextUrl.searchParams.keys()].some(k => k !== 'original') || (req.nextUrl.searchParams.has('original') && req.nextUrl.searchParams.get('original') !== 'true')) fail(400, 'QUERY_INVALIDA', 'Sólo original=true o metadata sin query.')
    const { service } = await createDocumentosPanelForRequest(req)
    const { id } = await context.params
    if (req.nextUrl.searchParams.get('original') !== 'true') return jsonPrivado({ documento: await service.get(id) })
    const original = await service.get(id, true) as { bytes: Buffer; mime: string; nombre: string }
    return new Response(new Uint8Array(original.bytes), { headers: { 'Content-Type': original.mime, 'Content-Length': String(original.bytes.length), 'Content-Disposition': `attachment; filename="original.${original.mime === 'application/pdf' ? 'pdf' : original.mime === 'image/png' ? 'png' : 'jpg'}"; filename*=UTF-8''${encodeURIComponent(original.nombre)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
  } catch (error) { return documentosPanelError(error) }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    // Auth/origin/staging before stream read; service rechecks live C in tx/provider.
    const { service } = await createDocumentosPanelForRequest(req, true)
    const body = await readPanelJson(req)
    const { id } = await context.params
    return jsonPrivado({ documento: await service.action(id, body) })
  } catch (error) { return documentosPanelError(error) }
}
