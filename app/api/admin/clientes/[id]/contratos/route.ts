export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../../lib/auth'
import prisma from '../../../../../../lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const clienteId = parseInt(resolvedParams.id)

    // First get the client to find their ISP Gestión ID
    const cliente = await prisma.clienteWeb.findUnique({
      where: { id: clienteId },
      select: { ispGestionId: true }
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Now fetch all contracts for this client using their ISP Gestión ID
    const contratos: any = await prisma.$queryRawUnsafe(
      `SELECT * FROM contratos_servicio WHERE cliente_id = $1 ORDER BY activo DESC, fecha_inicio DESC`,
      cliente.ispGestionId
    )

    const activos = contratos.filter((c: any) => c.activo).length
    const bajas = contratos.filter((c: any) => !c.activo).length
    const facturacionMensual = contratos
      .filter((c: any) => c.activo)
      .reduce((sum: number, c: any) => sum + Number(c.precio || 0), 0)

    return NextResponse.json({
      contratos,
      total: contratos.length,
      activos,
      bajas,
      facturacionMensual
    })
  } catch (error: any) {
    console.error('Error al obtener contratos del cliente:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener contratos del cliente' },
      { status: 500 }
    )
  }
}
