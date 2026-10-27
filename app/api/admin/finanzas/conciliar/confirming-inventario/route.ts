import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { CARPETAS, FACTURAS_BASE_PATH, downloadFile, getAccessToken, listFolderContents, resolveInvoiceLibrary } from '@/lib/finanzas/microsoft-graph'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180
export const preferredRegion = 'sfo1'

/** Revisión documental solicitada por Dirección: sólo lectura y sólo staging.
 * Nunca se llama al abrir Conciliar, ni importa, parsea, vincula o cobra.
 * El archivo se resuelve por una lista positiva del directorio fijo; no se
 * aceptan URL, drive, ruta ni itemId elegidos por el navegador. */
export async function GET(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const entries = [...request.nextUrl.searchParams.entries()]
    if (request.nextUrl.search.length > 256 || entries.length > 1 || entries.some(([key]) => key !== 'archivo')) return privateJson({ error: 'Consulta documental no válida.' }, 400)
    const archivo = request.nextUrl.searchParams.get('archivo')
    if (archivo !== null && !/^[a-f0-9]{24}$/.test(archivo)) return privateJson({ error: 'Archivo documental no válido.' }, 400)
    const library = await resolveInvoiceLibrary()
    const token = await getAccessToken()
    const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(library.siteId)}?$select=webUrl`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store' })
    if (!siteResponse.ok) return privateJson({ error: 'No se pudo verificar el sitio documental.' }, 503)
    const site = await siteResponse.json()
    let requestedSite = false
    try { requestedSite = new URL(site.webUrl).pathname.toLowerCase().split('/').includes('vola_finance') } catch { /* no generic-site fallback */ }
    if (!requestedSite) return privateJson({ error: 'La biblioteca configurada no pertenece al sitio documental solicitado.', codigo: 'CONFIRMING_SITE_MISMATCH' }, 409)
    const root = `${FACTURAS_BASE_PATH}/${CARPETAS.CONFIRMING_DRAXTON}`
    const items = await listFolderContents(library.driveId, root, true)
    const files = items.filter(item => !item.folder && /\.(pdf|xls|xlsx)$/i.test(item.name)).sort((a, b) => a.fullPath.localeCompare(b.fullPath, 'es'))
    if (files.length > 200) return privateJson({ error: 'El inventario documental supera el límite de esta revisión.' }, 409)
    const catalog = files.map(item => ({
      key: createHash('sha256').update(`CONFIRMING_REVIEW_V1:${library.driveId}:${item.id}`).digest('hex').slice(0, 24),
      nombre: item.name,
      grupo: item.folderPath === root ? 'RAIZ' : item.folderPath === `${root}/1. Confirmings BBVA Draxton 2026` ? 'BBVA' : item.folderPath === `${root}/2. Confirmings Caixabank Draxton 2026` ? 'CAIXABANK' : 'OTRA',
      extension: item.name.toLowerCase().split('.').pop(),
      size: item.size,
    }))
    if (archivo !== null) {
      const index = catalog.findIndex(item => item.key === archivo)
      if (index < 0) return privateJson({ error: 'El archivo no pertenece al inventario documental autorizado.' }, 404)
      if (Number(files[index].size) > 20 * 1024 * 1024) return privateJson({ error: 'El archivo supera el límite de lectura.' }, 409)
      const bytes = await downloadFile(library.driveId, files[index].id)
      if (bytes.length > 20 * 1024 * 1024) return privateJson({ error: 'El archivo supera el límite de lectura.' }, 409)
      const extension = catalog[index].extension
      if (extension === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) return privateJson({ error: 'El PDF no se pudo verificar.' }, 409)
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': extension === 'pdf' ? 'application/pdf' : extension === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="confirming.${extension}"`, 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } })
    }
    return privateJson({ inventoryComplete: true, siteVerified: true, readAt: new Date().toISOString(), files: catalog, imports: 0, businessWrites: 0 })
  } catch (error) {
    if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, codigo: error.code }, error.status)
    return privateJson({ error: 'No se pudo completar la lectura documental. No se ha importado ni confirmado ningún cobro.', codigo: 'CONFIRMING_INVENTORY_READ_FAILED' }, 503)
  }
}

export async function POST() { return privateJson({ error: 'Esta revisión sólo admite lectura.' }, 405) }
