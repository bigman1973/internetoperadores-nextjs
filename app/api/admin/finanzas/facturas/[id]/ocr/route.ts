import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jsonPrivado, requireFacturaAccess } from '@/lib/finanzas/invoice-quality-db'

export const dynamic = 'force-dynamic'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i

/**
 * B2 no permite re-OCR destructivo de una factura ya existente. La ruta antigua
 * podía reemplazar importes con 0 o una lectura parcial. Un operador debe usar
 * la cola de calidad (o una revisión explícita) donde se conserva el original,
 * el OCR bruto y la auditoría. Por tanto aquí no se llama Graph ni OpenAI.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!UUID_RE.test(id)) return jsonPrivado({ error: 'Identificador de factura no válido' }, 400)
  const access = await requireFacturaAccess(true)
  if ('error' in access) return access.error
  if (req.headers.get('origin') !== req.nextUrl.origin) return jsonPrivado({ error: 'Origen de la solicitud no válido' }, 403)
  const factura = await prisma.facturaRecibida.findUnique({ where: { id }, select: { id: true, calidad: true, oneDriveItemId: true } })
  if (!factura) return jsonPrivado({ error: 'Factura no encontrada' }, 404)
  return jsonPrivado({
    error: 'OCR_INDIVIDUAL_BLOQUEADO_REVISION_B2',
    mensaje: 'La relectura no puede sobrescribir importes existentes. Abra la cola privada de calidad y corrija el documento con revisión versionada.',
    revisionUrl: '/api/admin/finanzas/facturas/calidad?tipo=cuarentena',
    facturaId: factura.id,
    tieneDocumento: Boolean(factura.oneDriveItemId),
  }, 409)
}
