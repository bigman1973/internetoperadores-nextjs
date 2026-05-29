export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')

    const clienteEmail = session.user.email
    const cliente = await prisma.clienteWeb.findFirst({
      where: { email: clienteEmail, activo: true }
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const ispId = parseInt(cliente.ispGestionId)
    if (isNaN(ispId)) {
      return NextResponse.json({ facturas: [], stats: {} })
    }

    // Filtrar por año si se especifica
    const whereClause: any = { idCliente: ispId }
    if (year) {
      whereClause.ejercicio = parseInt(year)
    }

    const facturas = await prisma.factura.findMany({
      where: whereClause,
      orderBy: { fecha: 'desc' },
    })

    // Estadísticas
    const cobradas = facturas.filter(f => f.situacion === 'COBRADA')
    const pendientes = facturas.filter(f => f.situacion !== 'COBRADA')
    const totalFacturado = facturas.reduce((sum, f) => sum + Number(f.total), 0)
    const totalPendiente = pendientes.reduce((sum, f) => sum + Number(f.totalPendiente), 0)

    // Facturación por mes
    const porMesMap = new Map<string, { base: number; iva: number; total: number; count: number }>()
    facturas.forEach(f => {
      const mes = f.fecha.toISOString().slice(0, 7)
      const existing = porMesMap.get(mes) || { base: 0, iva: 0, total: 0, count: 0 }
      existing.base += Number(f.base)
      existing.iva += Number(f.totalImpuesto)
      existing.total += Number(f.total)
      existing.count += 1
      porMesMap.set(mes, existing)
    })
    const porMes = Array.from(porMesMap.entries())
      .map(([mes, data]) => ({ mes, ...data }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    // Años disponibles
    const aniosDisponibles = [...new Set(facturas.map(f => f.ejercicio))].sort((a, b) => b - a)

    return NextResponse.json({
      facturas: facturas.map(f => ({
        id: f.id,
        ispGestionId: f.ispGestionId,
        serieFactura: f.serieFactura,
        numeroDocumento: f.numeroDocumento,
        documento: f.documento,
        fecha: f.fecha.toISOString().split('T')[0],
        base: Number(f.base),
        totalImpuesto: Number(f.totalImpuesto),
        total: Number(f.total),
        situacion: f.situacion,
        totalPendiente: Number(f.totalPendiente),
        ejercicio: f.ejercicio,
      })),
      stats: {
        total: facturas.length,
        cobradas: cobradas.length,
        pendientes: pendientes.length,
        totalFacturado: Math.round(totalFacturado * 100) / 100,
        totalPendiente: Math.round(totalPendiente * 100) / 100,
      },
      porMes,
      aniosDisponibles,
    })
  } catch (error: any) {
    console.error('Error obteniendo facturas del cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
