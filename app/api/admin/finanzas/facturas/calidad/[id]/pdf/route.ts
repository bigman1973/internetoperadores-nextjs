import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { downloadFile } from '@/lib/finanzas/microsoft-graph'
import { jsonPrivado, requireFacturaAccess } from '@/lib/finanzas/invoice-quality-db'

export const dynamic = 'force-dynamic'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i
const MAX_PDF_BYTES = 25 * 1024 * 1024

function safeName(value: string | null | undefined) {
  const fallback = 'documento.pdf'
  if (!value) return fallback
  const name = value.split('/').pop() || fallback
  return name.replace(/[\r\n"\\]/g, '_').slice(0, 180) || fallback
}

/**
 * PDF B2 privado: el ID sólo puede señalar una revisión abierta o una factura
 * histórica en REVISAR_LECTURA. No usa archivoUrl, no redirige a Graph ni muta
 * itemId/ruta; Graph se limita a la descarga de bytes por drive/item persistidos.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) return jsonPrivado({ error: 'Identificador de documento inválido' }, 400)
    const access = await requireFacturaAccess(false)
    if ('error' in access) return access.error
    const [revision, historica] = await Promise.all([
      prisma.revisionLecturaFacturaRecibida.findFirst({ where: { id, resueltaAt: null, facturaResueltaId: null }, select: { oneDriveItemId: true, oneDriveDriveId: true, archivoOneDrive: true } }),
      prisma.facturaRecibida.findFirst({ where: { id, calidad: 'REVISAR_LECTURA' }, select: { oneDriveItemId: true, oneDriveDriveId: true, archivoOneDrive: true } }),
    ])
    const document = revision || historica
    if (!document) return jsonPrivado({ error: 'Documento de calidad no disponible' }, 404)
    if (!document.oneDriveItemId || !document.oneDriveDriveId) return jsonPrivado({ error: 'Documento sin referencia privada de OneDrive' }, 404)
    const bytes = await downloadFile(document.oneDriveDriveId, document.oneDriveItemId)
    if (bytes.length > MAX_PDF_BYTES) return jsonPrivado({ error: 'El documento excede el límite privado de visualización' }, 413)
    const name = safeName(document.archivoOneDrive)
    const contentType = /\.pdf$/i.test(name) ? 'application/pdf' : 'application/octet-stream'
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${contentType === 'application/pdf' ? 'inline' : 'attachment'}; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return jsonPrivado({ error: 'No se pudo obtener el documento privado de calidad' }, 502)
  }
}
