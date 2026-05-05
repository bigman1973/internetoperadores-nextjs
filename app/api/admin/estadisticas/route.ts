import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../../../lib/middleware/auth'
import { prisma } from '../../../../lib/prisma'

export async function GET(request: NextRequest) {
  try {
    await requireAuth('admin')
    
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') || 'mensual' // mensual, clientes, categorias

    if (tipo === 'mensual') {
      // Evolución mensual 2025 vs 2026
      const datos2025 = await prisma.$queryRawUnsafe(`
        SELECT mes, 
          COUNT(*)::int as facturas,
          SUM(precio_sin_iva)::float as total_sin_iva,
          SUM(total_con_iva)::float as total_con_iva,
          COUNT(DISTINCT codigo_cliente)::int as clientes_unicos
        FROM facturacion_historica 
        WHERE anio = 2025
        GROUP BY mes ORDER BY mes
      `) as any[]

      const datos2026 = await prisma.$queryRawUnsafe(`
        SELECT EXTRACT(MONTH FROM fecha)::int as mes,
          COUNT(*)::int as facturas,
          SUM(base)::float as total_sin_iva,
          SUM(total)::float as total_con_iva,
          COUNT(DISTINCT codigo_cliente)::int as clientes_unicos
        FROM facturas
        WHERE ejercicio = 2026
        GROUP BY mes ORDER BY mes
      `) as any[]

      // Totales anuales
      const total2025 = await prisma.$queryRawUnsafe(`
        SELECT SUM(precio_sin_iva)::float as total_sin_iva, 
          SUM(total_con_iva)::float as total_con_iva,
          COUNT(*)::int as facturas,
          COUNT(DISTINCT codigo_cliente)::int as clientes
        FROM facturacion_historica WHERE anio = 2025
      `) as any[]

      const total2026 = await prisma.$queryRawUnsafe(`
        SELECT SUM(base)::float as total_sin_iva,
          SUM(total)::float as total_con_iva,
          COUNT(*)::int as facturas,
          COUNT(DISTINCT codigo_cliente)::int as clientes
        FROM facturas WHERE ejercicio = 2026
      `) as any[]

      return NextResponse.json({
        datos2025,
        datos2026,
        totales: {
          año2025: total2025[0],
          año2026: total2026[0]
        }
      })
    }

    if (tipo === 'clientes') {
      const limit = parseInt(searchParams.get('limit') || '20')
      
      // Top clientes con comparativa mensual
      const topClientes2025 = await prisma.$queryRawUnsafe(`
        SELECT codigo_cliente, nombre_cliente,
          SUM(total_con_iva)::float as total_anual,
          COUNT(*)::int as facturas,
          json_agg(json_build_object('mes', mes, 'total', total_mes)) as meses
        FROM (
          SELECT codigo_cliente, nombre_cliente, mes,
            SUM(total_con_iva)::float as total_mes
          FROM facturacion_historica WHERE anio = 2025
          GROUP BY codigo_cliente, nombre_cliente, mes
        ) sub
        GROUP BY codigo_cliente, nombre_cliente
        ORDER BY total_anual DESC
        LIMIT $1
      `, limit) as any[]

      // Mismos clientes en 2026
      const codigosClientes = topClientes2025.map((c: any) => c.codigo_cliente)
      
      let topClientes2026: any[] = []
      if (codigosClientes.length > 0) {
        topClientes2026 = await prisma.$queryRawUnsafe(`
          SELECT codigo_cliente::int, nombre_completo as nombre_cliente,
            SUM(total)::float as total_anual,
            COUNT(*)::int as facturas,
            json_agg(json_build_object('mes', EXTRACT(MONTH FROM fecha)::int, 'total', total_mes)) as meses
          FROM (
            SELECT codigo_cliente::int, nombre_completo, fecha,
              SUM(total)::float as total_mes
            FROM facturas 
            WHERE ejercicio = 2026 AND codigo_cliente::int = ANY($1)
            GROUP BY codigo_cliente, nombre_completo, fecha
          ) sub
          GROUP BY codigo_cliente, nombre_cliente
          ORDER BY total_anual DESC
        `, codigosClientes) as any[]
      }

      return NextResponse.json({
        clientes2025: topClientes2025,
        clientes2026: topClientes2026
      })
    }

    if (tipo === 'categorias') {
      // Para 2025 no tenemos categoría en el archivo original, 
      // pero podemos cruzar con las tarifas/contratos
      // Por ahora agrupamos por los principales clientes/servicios
      
      // Datos de 2026 por categoría (si existe en facturas)
      // Como la tabla facturas no tiene categoría directamente,
      // podemos intentar cruzar con contratos o usar el nombre del servicio
      
      // Alternativa: agrupar por rangos de facturación
      const distribucion2025 = await prisma.$queryRawUnsafe(`
        SELECT 
          CASE 
            WHEN total_cliente > 50000 THEN 'Grandes Cuentas (>50K)'
            WHEN total_cliente > 10000 THEN 'Medianas (10K-50K)'
            WHEN total_cliente > 2000 THEN 'Pequeñas (2K-10K)'
            ELSE 'Micro (<2K)'
          END as segmento,
          COUNT(*)::int as num_clientes,
          SUM(total_cliente)::float as total_segmento
        FROM (
          SELECT codigo_cliente, SUM(total_con_iva)::float as total_cliente
          FROM facturacion_historica WHERE anio = 2025
          GROUP BY codigo_cliente
        ) sub
        GROUP BY segmento
        ORDER BY total_segmento DESC
      `) as any[]

      const distribucion2026 = await prisma.$queryRawUnsafe(`
        SELECT 
          CASE 
            WHEN total_cliente > 50000 THEN 'Grandes Cuentas (>50K)'
            WHEN total_cliente > 10000 THEN 'Medianas (10K-50K)'
            WHEN total_cliente > 2000 THEN 'Pequeñas (2K-10K)'
            ELSE 'Micro (<2K)'
          END as segmento,
          COUNT(*)::int as num_clientes,
          SUM(total_cliente)::float as total_segmento
        FROM (
          SELECT codigo_cliente::int, SUM(total)::float as total_cliente
          FROM facturas WHERE ejercicio = 2026
          GROUP BY codigo_cliente
        ) sub
        GROUP BY segmento
        ORDER BY total_segmento DESC
      `) as any[]

      // Evolución mensual por segmento 2025
      const mensualSegmento2025 = await prisma.$queryRawUnsafe(`
        SELECT mes,
          CASE 
            WHEN total_cliente > 50000/11.0 THEN 'Grandes Cuentas'
            WHEN total_cliente > 10000/11.0 THEN 'Medianas'
            WHEN total_cliente > 2000/11.0 THEN 'Pequeñas'
            ELSE 'Micro'
          END as segmento,
          SUM(total_mes)::float as total
        FROM (
          SELECT codigo_cliente, mes, 
            SUM(total_con_iva)::float as total_mes,
            AVG(SUM(total_con_iva)) OVER (PARTITION BY codigo_cliente)::float as total_cliente
          FROM facturacion_historica WHERE anio = 2025
          GROUP BY codigo_cliente, mes
        ) sub
        GROUP BY mes, segmento
        ORDER BY mes, segmento
      `) as any[]

      const mensualSegmento2026 = await prisma.$queryRawUnsafe(`
        SELECT EXTRACT(MONTH FROM fecha)::int as mes,
          CASE 
            WHEN total_cliente > 50000/5.0 THEN 'Grandes Cuentas'
            WHEN total_cliente > 10000/5.0 THEN 'Medianas'
            WHEN total_cliente > 2000/5.0 THEN 'Pequeñas'
            ELSE 'Micro'
          END as segmento,
          SUM(total_mes)::float as total
        FROM (
          SELECT codigo_cliente::int, fecha,
            SUM(total)::float as total_mes,
            AVG(SUM(total)) OVER (PARTITION BY codigo_cliente)::float as total_cliente
          FROM facturas WHERE ejercicio = 2026
          GROUP BY codigo_cliente, fecha
        ) sub
        GROUP BY mes, segmento
        ORDER BY mes, segmento
      `) as any[]

      return NextResponse.json({
        distribucion2025,
        distribucion2026,
        mensualSegmento2025,
        mensualSegmento2026
      })
    }

    return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 })
  } catch (error: any) {
    console.error('Error estadísticas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
