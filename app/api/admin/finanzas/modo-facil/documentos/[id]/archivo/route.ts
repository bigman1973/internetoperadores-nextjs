import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { archivoRecibidaControlado } from '@/lib/finanzas/archivo-fuente-controlada'
import { descargarGraphPrivadoAcotado, DescargaPrivadaGraphError } from '@/lib/finanzas/descarga-privada-graph'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Never caches a resolved item/path in legacy data and never accepts a provider URL. */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const { id } = await context.params
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return privateJson({ error: 'Documento no válido.' }, 400)
    const invoice = await prisma.facturaRecibida.findUnique({
      where: { id }, select: { oneDriveDriveId: true, oneDriveItemId: true, archivoOneDrive: true },
    })
    const location = archivoRecibidaControlado(invoice)
    if (!location) return privateJson({ error: 'No existe archivo controlado disponible para esta factura.' }, 404)
    const bytes = await descargarGraphPrivadoAcotado(location.driveId, location.itemId, 12 * 1024 * 1024)
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Cache-Control': 'private, no-store', 'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="factura.pdf"', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    if (error instanceof DescargaPrivadaGraphError) return privateJson({ error: 'No se pudo recuperar el archivo privado.' }, error.code === 'ARCHIVO_FUERA_DE_LIMITE' ? 413 : 502)
    if (error instanceof Error && 'status' in error) return privateJson({ error: error.message }, Number(error.status))
    return privateJson({ error: 'No se pudo leer el documento.' }, 500)
  }
}
export async function POST() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
