export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Detectar periodicidad del concepto de facturación
function detectarPeriodicidad(concepto: string | null): string {
  if (!concepto) return '/mes';
  const upper = concepto.toUpperCase();
  if (upper.includes('TRIANUAL') || upper.includes('3 AÑO') || upper.includes('THREE YEAR')) return '/3 años';
  if (upper.includes('BIANUAL') || upper.includes('2 AÑO') || upper.includes('TWO YEAR')) return '/2 años';
  if (upper.includes('ANUAL') || upper.includes('CUOTA ANUAL')) return '/año';
  if (upper.includes('TRIMESTRAL')) return '/trim.';
  if (upper.includes('SEMESTRAL')) return '/sem.';
  return '/mes';
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const clienteEmail = session.user.email
    const cliente = await prisma.clienteWeb.findFirst({
      where: { email: clienteEmail, activo: true }
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Obtener contratos activos
    const matchId = cliente.clienteIdIsp || cliente.ispGestionId
    const contratos: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM contratos_servicio WHERE cliente_id = $1 AND activo = true ORDER BY fecha_inicio DESC`,
      matchId
    )

    // Obtener facturas recientes
    const ispId = parseInt(cliente.ispGestionId)
    const facturas = await prisma.factura.findMany({
      where: { idCliente: ispId },
      orderBy: { fecha: 'desc' },
      take: 5,
    })

    // Calcular KPIs
    const serviciosActivos = contratos.length
    const facturacionMensual = contratos.reduce((sum: number, c: any) => sum + Number(c.precio || 0), 0)
    
    const facturasPendientes = await prisma.factura.count({
      where: { idCliente: ispId, situacion: { not: 'COBRADA' } }
    })

    const totalPendiente = await prisma.factura.aggregate({
      where: { idCliente: ispId, situacion: { not: 'COBRADA' } },
      _sum: { totalPendiente: true }
    })

    return NextResponse.json({
      cliente: {
        nombre: cliente.nombre,
        nombreComercial: cliente.nombreComercial,
        codigo: cliente.codigo,
        email: cliente.email,
        fechaAlta: cliente.fechaAlta,
      },
      kpis: {
        serviciosActivos,
        facturacionMensual: Math.round(facturacionMensual * 100) / 100,
        facturasPendientes,
        totalPendiente: Number(totalPendiente._sum.totalPendiente || 0),
      },
      ultimasFacturas: facturas.map(f => ({
        id: f.id,
        documento: f.documento,
        fecha: f.fecha.toISOString().split('T')[0],
        total: Number(f.total),
        situacion: f.situacion,
        totalPendiente: Number(f.totalPendiente),
      })),
      serviciosResumen: contratos.slice(0, 5).map((c: any) => ({
        id: c.id,
        titulo: c.titulo,
        tarifa: c.tarifa,
        precio: Number(c.precio),
        periodicidad: detectarPeriodicidad(c.concepto_facturacion),
      })),
    })
  } catch (error: any) {
    console.error('Error en dashboard cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
