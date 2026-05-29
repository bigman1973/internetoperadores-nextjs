export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

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

    // Obtener contratos usando el ID largo (cliente_id_isp)
    const matchId = cliente.clienteIdIsp || cliente.ispGestionId
    const contratos: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM contratos_servicio WHERE cliente_id = $1 ORDER BY activo DESC, fecha_inicio DESC`,
      matchId
    )

    // Separar activos e inactivos
    const activos = contratos.filter((c: any) => c.activo)
    const inactivos = contratos.filter((c: any) => !c.activo)

    // Calcular facturación mensual total
    const facturacionMensual = activos.reduce((sum: number, c: any) => sum + Number(c.precio || 0), 0)

    // Agrupar por categoría
    const porCategoria: Record<string, { count: number; total: number }> = {}
    activos.forEach((c: any) => {
      const cat = c.categoria || 'Otros'
      if (!porCategoria[cat]) porCategoria[cat] = { count: 0, total: 0 }
      porCategoria[cat].count++
      porCategoria[cat].total += Number(c.precio || 0)
    })

    return NextResponse.json({
      contratos: contratos.map((c: any) => ({
        id: c.id,
        titulo: c.titulo,
        tarifa: c.tarifa,
        precio: Number(c.precio || 0),
        importeRemesar: Number(c.importe_remesar || 0),
        fechaInicio: c.fecha_inicio ? new Date(c.fecha_inicio).toISOString().split('T')[0] : null,
        fechaBaja: c.fecha_baja ? new Date(c.fecha_baja).toISOString().split('T')[0] : null,
        causaBaja: c.causa_baja,
        permanencia: c.permanencia,
        fechaPermanencia: c.fecha_permanencia ? new Date(c.fecha_permanencia).toISOString().split('T')[0] : null,
        categoria: c.categoria,
        telefonosContrato: c.telefonos_contrato,
        observaciones: c.observaciones,
        activo: c.activo,
        conceptoFacturacion: c.concepto_facturacion,
      })),
      stats: {
        totalActivos: activos.length,
        totalInactivos: inactivos.length,
        facturacionMensual: Math.round(facturacionMensual * 100) / 100,
      },
      porCategoria: Object.entries(porCategoria).map(([cat, data]) => ({
        categoria: cat,
        count: data.count,
        total: Math.round(data.total * 100) / 100,
      })),
    })
  } catch (error: any) {
    console.error('Error obteniendo servicios del cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
