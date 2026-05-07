import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'

// GET: Listar productos con KPIs y estrategias
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filtro = searchParams.get('filtro') || 'todos' // publicados, historicos, todos
    const categoria = searchParams.get('categoria') || ''

    // Construir filtro de publicación
    let whereClause: any = {}
    if (filtro === 'publicados') {
      whereClause.OR = [
        { publicarWebParticular: true },
        { publicarWebEmpresa: true },
      ]
    } else if (filtro === 'historicos') {
      whereClause.AND = [
        { publicarWebParticular: false },
        { publicarWebEmpresa: false },
      ]
    }
    // Si filtro es 'todos', no filtramos por publicación

    if (categoria) {
      whereClause.categoria = categoria
    }

    // Obtener tarifas con sus estrategias
    const tarifas = await prisma.tarifa.findMany({
      where: whereClause,
      select: {
        id: true,
        nombre: true,
        nombreComercial: true,
        categoria: true,
        subcategoria: true,
        precioSinIva: true,
        precioConIva: true,
        costeOperador: true,
        publicarWebParticular: true,
        publicarWebEmpresa: true,
        activa: true,
        ispGestionId: true,
        grupoProducto: true,
        varianteLabel: true,
        estrategias: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ categoria: 'asc' }, { grupoProducto: 'asc' }, { nombre: 'asc' }],
    })

    // Obtener KPIs de contratos (unidades vendidas y facturación)
    const contratosKpis = await prisma.$queryRaw<Array<{
      tarifa: string
      unidades_activas: bigint
      unidades_totales: bigint
      facturacion_mensual: number
    }>>`
      SELECT 
        tarifa,
        COUNT(*) FILTER (WHERE activo = true) as unidades_activas,
        COUNT(*) as unidades_totales,
        COALESCE(SUM(CASE WHEN activo = true THEN precio ELSE 0 END), 0) as facturacion_mensual
      FROM contratos_servicio
      GROUP BY tarifa
    `

    // Crear mapa de KPIs por nombre de tarifa
    const kpisMap = new Map<string, { unidadesActivas: number; unidadesTotales: number; facturacionMensual: number }>()
    for (const row of contratosKpis) {
      kpisMap.set(row.tarifa.toUpperCase(), {
        unidadesActivas: Number(row.unidades_activas),
        unidadesTotales: Number(row.unidades_totales),
        facturacionMensual: Number(row.facturacion_mensual),
      })
    }

    // Combinar datos
    const resultado = tarifas.map(t => {
      const precioVenta = Number(t.precioSinIva)
      const precioCoste = t.costeOperador ? Number(t.costeOperador) : null
      const margen = precioCoste !== null && precioVenta > 0
        ? ((precioVenta - precioCoste) / precioVenta) * 100
        : null

      const kpis = kpisMap.get(t.nombre.toUpperCase()) || { unidadesActivas: 0, unidadesTotales: 0, facturacionMensual: 0 }

      return {
        id: t.id,
        nombre: t.nombre,
        nombreComercial: t.nombreComercial,
        categoria: t.categoria,
        subcategoria: t.subcategoria,
        grupoProducto: t.grupoProducto,
        varianteLabel: t.varianteLabel,
        precioVenta: precioVenta,
        precioCoste: precioCoste,
        margen: margen !== null ? Math.round(margen * 100) / 100 : null,
        unidadesActivas: kpis.unidadesActivas,
        unidadesTotales: kpis.unidadesTotales,
        facturacionMensual: kpis.facturacionMensual,
        publicadoWeb: t.publicarWebParticular || t.publicarWebEmpresa,
        activa: t.activa,
        ispGestionId: t.ispGestionId,
        estrategias: t.estrategias.map(e => ({
          id: e.id,
          estrategia: e.estrategia,
          autor: e.autor,
          createdAt: e.createdAt,
        })),
      }
    })

    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Error al obtener estrategias:', error)
    return NextResponse.json({ error: 'Error al obtener datos' }, { status: 500 })
  }
}

// POST: Crear nueva estrategia para un producto
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tarifaId, estrategia, autor } = body

    if (!tarifaId || !estrategia) {
      return NextResponse.json({ error: 'tarifaId y estrategia son obligatorios' }, { status: 400 })
    }

    const nueva = await prisma.estrategiaProducto.create({
      data: {
        tarifaId: parseInt(tarifaId),
        estrategia,
        autor: autor || 'Admin',
      },
    })

    return NextResponse.json(nueva, { status: 201 })
  } catch (error) {
    console.error('Error al crear estrategia:', error)
    return NextResponse.json({ error: 'Error al crear estrategia' }, { status: 500 })
  }
}
