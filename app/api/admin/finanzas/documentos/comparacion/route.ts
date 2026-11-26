import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { FACTURAS_BASE_PATH, listFolderContents, resolveInvoiceLibrary } from '@/lib/finanzas/microsoft-graph'
import { descargarGraphPrivadoAcotado, DescargaPrivadaGraphError } from '@/lib/finanzas/descarga-privada-graph'
import {
  COMPARACION_LIMITS, RangoComparacionError, comparacionDocumentosCsv, crearProveedorPanelComparacion,
  crearProveedoresGraphComparacion, ejecutarComparacionDocumental, opaqueDocumentoId, parseRangoComparacion,
} from '@/lib/finanzas/documentos-panel-comparacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' }
function privateResponse(response: Response) { for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value); return response }
// Default Vercel responses are capped at 4.5 MB too. Never truncate a comparison
// silently: an oversized report is incomplete, not a smaller successful scope.
const RESPONSE_MAX_BYTES = 4 * 1024 * 1024
function boundedPayload(body: string, headers: Record<string, string>) {
  if (Buffer.byteLength(body, 'utf8') > RESPONSE_MAX_BYTES) return privateResponse(privateJson({
    error: 'El informe supera 4 MiB. Reduzca el rango; esta comparación no certifica cobertura completa.',
    codigo: 'DOCUMENTOS_COMPARACION_RESPONSE_LIMIT', semanaCompleta: false,
  }, 413))
  return new Response(body, { headers: { ...PRIVATE_HEADERS, ...headers } })
}

/** Staging exclusivamente. Parámetros allowlist, sin actuación y permisos vivos VFactura+B4Read.
 * No mailbox, importer, cron, tareas, validación, movimientos Graph ni escrituras DB. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const actingSession = session as (typeof session & { impersonation?: unknown })
    const actingUser = session?.user as (typeof session.user & { impersonation?: unknown })
    if (actingSession?.impersonation != null || actingUser?.impersonation != null || request.headers.has('x-io-acting-session')
      || ['verComo', 'actingAs', 'actorId', 'userId'].some(key => request.nextUrl.searchParams.has(key))) {
      return privateResponse(privateJson({ error: 'Comparación no disponible durante actuación o vista como otro usuario.' }, 403))
    }
    const b4 = await requireB4FinanceAccess('lectura', session)
    if ('response' in b4) return privateResponse(b4.response)
    // Reusar sesión autenticada con ROL VIVO, no el rol posiblemente obsoleto del JWT.
    const liveSession = { ...session, user: { ...session!.user, role: b4.actor.rol, roles: b4.actor.roles } }
    const invoiceDenied = await checkAdminAreaRead('admin.finanzas.facturas', ['CONTABILIDAD'], liveSession)
    if (invoiceDenied) return privateResponse(invoiceDenied)
    await assertPrototypeStaging()
    const params = request.nextUrl.searchParams
    const entries = [...params.entries()]
    if (request.nextUrl.search.length > 512 || entries.some(([key]) => !['from', 'to', 'format', 'archivo'].includes(key))
      || new Set(entries.map(([key]) => key)).size !== entries.length) {
      return privateResponse(privateJson({ error: 'Parámetros de comparación no válidos.' }, 400))
    }
    const range = parseRangoComparacion(params.get('from'), params.get('to'))
    const format = params.get('format') ?? 'json', archivo = params.get('archivo')
    if (!['json', 'csv'].includes(format) || (archivo !== null && (!/^[a-f0-9]{32}$/.test(archivo) || params.has('format')))) {
      return privateResponse(privateJson({ error: 'Formato o identificador opaco no válido.' }, 400))
    }
    // MVP FINANCE FACTURAS exclusivamente. Aunque exista raíz payroll nativa,
    // no se leen modelos, nombres ni bytes de nóminas; falta un alcance/ACL separado.
    // La cobertura omitida queda NO_VERIFICABLE, nunca verde ni globalmente completa.
    const includePayroll = false
    const driveId = process.env.SHAREPOINT_DRIVE_ID?.trim() || process.env.DRIVE_ID?.trim()
    const protectedReferences = new Set<string>()
    const selectedForHash = new Set<string>()
    let graphScopeReady = false
    const panelProvider = crearProveedorPanelComparacion(prisma, includePayroll, driveId, protectedReferences, selectedForHash)
    const registry = [
      { ...panelProvider, async read(range: Parameters<typeof ejecutarComparacionDocumental>[0]) {
        const inventory = await panelProvider.read(range)
        graphScopeReady = inventory.completo && !inventory.truncado
        return inventory
      } },
      ...crearProveedoresGraphComparacion({ async resolveInvoiceLibrary() {
        // No exponer posibles archivos protegidos si falta el registro nativo/ACL
        // por fallo o cap. El registry ejecuta panel primero; nunca autoGraph.
        if (!graphScopeReady) throw new Error('FINANCE_SCOPE_NOT_VERIFIED')
        return resolveInvoiceLibrary()
      }, listFolderContents,
        // La descarga explícita no precalcula hashes de otros archivos.
        ...(archivo ? {} : { readBytes: descargarGraphPrivadoAcotado }),
      }, FACTURAS_BASE_PATH, includePayroll, protectedReferences, selectedForHash),
    ]
    const { resultado, inventarios } = await ejecutarComparacionDocumental(range, registry)
    if (archivo) {
      // El navegador no elige ruta, drive, itemId ni URL. Resuelve sólo el inventario
      // Graph íntegro autorizado, nunca un puntero huérfano de DB.
      const candidates = inventarios.filter(i => i.key !== 'panel' && i.completo && !i.truncado)
        .flatMap(i => i.documentos.map(d => ({ provider: i.key, d })))
      let found = candidates.find(x => opaqueDocumentoId(x.provider, x.d) === archivo)?.d
      if (!found) {
        const panel = inventarios.find(i => i.key === 'panel')?.documentos.find(d => opaqueDocumentoId('panel', d) === archivo)
        if (panel?.referencia) found = candidates.find(x => x.d.referencia?.driveId === panel.referencia!.driveId && x.d.referencia?.itemId === panel.referencia!.itemId)?.d
      }
      if (!found?.referencia) return privateResponse(privateJson({ error: 'Archivo no verificable en el inventario privado autorizado.' }, 404))
      const bytes = await descargarGraphPrivadoAcotado(found.referencia.driveId, found.referencia.itemId, COMPARACION_LIMITS.hashBytesPerFile)
      if (bytes.byteLength > RESPONSE_MAX_BYTES) return privateResponse(privateJson({ error: 'El archivo supera 4 MiB.', codigo: 'DOCUMENTOS_COMPARACION_FILE_LIMIT' }, 413))
      return new Response(new Uint8Array(bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(found.nombre.replace(/[\r\n"\\/]/g, '_'))}` } })
    }
    if (format === 'csv') return boundedPayload(comparacionDocumentosCsv(resultado), {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comparacion-documentos-${range.from}-${range.to}.csv"` })
    return boundedPayload(JSON.stringify(resultado), { 'Content-Type': 'application/json; charset=utf-8' })
  } catch (error) {
    if (error instanceof DescargaPrivadaGraphError && error.code === 'ARCHIVO_FUERA_DE_LIMITE') return privateResponse(privateJson({ error: 'El archivo supera 4 MiB.', codigo: 'DOCUMENTOS_COMPARACION_FILE_LIMIT' }, 413))
    if (error instanceof RangoComparacionError) return privateResponse(privateJson({ error: error.message }, 400))
    if (error instanceof PrototypeStagingError) return privateResponse(privateJson({ error: error.message, codigo: error.code }, error.status))
    return privateResponse(privateJson({ error: 'Comparación no verificable. No se han importado documentos, modificado carpetas ni contabilizado importes.', codigo: 'DOCUMENTOS_COMPARACION_READ_FAILED' }, 503))
  }
}
export async function POST() { return privateResponse(privateJson({ error: 'La comparación sólo admite lectura.' }, 405)) }
export async function PUT() { return POST() }
export async function PATCH() { return POST() }
export async function DELETE() { return POST() }
