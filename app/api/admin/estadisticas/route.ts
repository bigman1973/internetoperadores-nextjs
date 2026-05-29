import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../../../lib/middleware/auth'
import { prisma } from '../../../../lib/prisma'

export async function GET(request: NextRequest) {
  try {
    await requireAuth('admin')
    
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') || 'mensual' // mensual, clientes, categorias

    // Obtener el último mes con datos en 2026
    const ultimoMes2026Result = await prisma.$queryRawUnsafe(`
      SELECT MAX(EXTRACT(MONTH FROM fecha))::int as ultimo_mes
      FROM facturas WHERE ejercicio = 2026
    `) as any[]
    const ultimoMesConDatos = ultimoMes2026Result[0]?.ultimo_mes || 5
    
    // Para estadísticas usamos solo meses CERRADOS (el mes con datos más reciente es parcial)
    // Si solo hay 1 mes con datos, usamos ese (asumimos cerrado)
    const ultimoMesCerrado = ultimoMesConDatos > 1 ? ultimoMesConDatos - 1 : 1
    const mesEnCurso = ultimoMesConDatos
    // Variable principal para todas las queries de comparativa
    const ultimoMes2026 = ultimoMesCerrado

    // Obtener el primer mes con datos en 2025 (puede no tener enero)
    const primerMes2025Result = await prisma.$queryRawUnsafe(`
      SELECT MIN(mes)::int as primer_mes FROM facturacion_historica WHERE anio = 2025
    `) as any[]
    const primerMes2025 = primerMes2025Result[0]?.primer_mes || 1
    const mesesLabel = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    // El inicio del período comparable es el mayor entre el primer mes con datos 2025 y enero
    const mesInicioComparable = primerMes2025 > 1 ? primerMes2025 : 1
    const periodoComparadoLabel = `${mesesLabel[mesInicioComparable - 1]} - ${mesesLabel[ultimoMes2026 - 1]}`

    if (tipo === 'mensual') {
      // Evolución mensual 2025 (todo el ejercicio) vs 2026 (solo meses cerrados)
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
        WHERE ejercicio = 2026 AND EXTRACT(MONTH FROM fecha) <= $1
        GROUP BY mes ORDER BY mes
      `, ultimoMes2026) as any[]

      // Totales 2026 SOLO meses cerrados (para que coincida con la etiqueta)
      const total2026 = await prisma.$queryRawUnsafe(`
        SELECT SUM(base)::float as total_sin_iva,
          SUM(total)::float as total_con_iva,
          COUNT(*)::int as facturas,
          COUNT(DISTINCT codigo_cliente)::int as clientes
        FROM facturas WHERE ejercicio = 2026 AND EXTRACT(MONTH FROM fecha) <= $1
      `, ultimoMes2026) as any[]

      // Total 2025 mismo período (para comparativa justa - desde el primer mes con datos)
      const total2025MismoPeriodo = await prisma.$queryRawUnsafe(`
        SELECT SUM(precio_sin_iva)::float as total_sin_iva, 
          SUM(total_con_iva)::float as total_con_iva,
          COUNT(*)::int as facturas,
          COUNT(DISTINCT codigo_cliente)::int as clientes
        FROM facturacion_historica WHERE anio = 2025 AND mes >= $1 AND mes <= $2
      `, mesInicioComparable, ultimoMes2026) as any[]

      // Total anual completo 2025 (para referencia)
      const total2025 = await prisma.$queryRawUnsafe(`
        SELECT SUM(precio_sin_iva)::float as total_sin_iva, 
          SUM(total_con_iva)::float as total_con_iva,
          COUNT(*)::int as facturas,
          COUNT(DISTINCT codigo_cliente)::int as clientes
        FROM facturacion_historica WHERE anio = 2025
      `) as any[]

      return NextResponse.json({
        datos2025,
        datos2026,
        ultimoMes2026,
        mesEnCurso,
        primerMes2025,
        periodoComparado: periodoComparadoLabel,
        totales: {
          año2025: total2025[0],
          año2025MismoPeriodo: total2025MismoPeriodo[0],
          año2026: total2026[0]
        }
      })
    }

    if (tipo === 'clientes') {
      const limit = parseInt(searchParams.get('limit') || '20')
      
      // Top clientes 2025 - mismo período comparable
      const topClientes2025 = await prisma.$queryRawUnsafe(`
        SELECT codigo_cliente, nombre_cliente,
          SUM(total_mes)::float as total_periodo,
          COUNT(*)::int as meses_activo,
          json_agg(json_build_object('mes', mes, 'total', total_mes) ORDER BY mes) as meses
        FROM (
          SELECT codigo_cliente, nombre_cliente, mes,
            SUM(total_con_iva)::float as total_mes
          FROM facturacion_historica WHERE anio = 2025 AND mes >= $1 AND mes <= $2
          GROUP BY codigo_cliente, nombre_cliente, mes
        ) sub
        GROUP BY codigo_cliente, nombre_cliente
        ORDER BY total_periodo DESC
        LIMIT $3
      `, mesInicioComparable, ultimoMes2026, limit) as any[]

      // Total anual completo 2025 para cada cliente (para referencia)
      const codigosClientes = topClientes2025.map((c: any) => c.codigo_cliente)
      
      let totalAnual2025: any[] = []
      if (codigosClientes.length > 0) {
        totalAnual2025 = await prisma.$queryRawUnsafe(`
          SELECT codigo_cliente, SUM(total_con_iva)::float as total_anual
          FROM facturacion_historica WHERE anio = 2025 AND codigo_cliente = ANY($1)
          GROUP BY codigo_cliente
        `, codigosClientes) as any[]
      }

      // Mismos clientes en 2026 (mismo período cerrado)
      let topClientes2026: any[] = []
      if (codigosClientes.length > 0) {
        topClientes2026 = await prisma.$queryRawUnsafe(`
          SELECT codigo_cliente, nombre_cliente,
            SUM(total_mes)::float as total_periodo,
            COUNT(*)::int as meses_activo,
            json_agg(json_build_object('mes', mes, 'total', total_mes) ORDER BY mes) as meses
          FROM (
            SELECT codigo_cliente::int as codigo_cliente, nombre_completo as nombre_cliente, 
              EXTRACT(MONTH FROM fecha)::int as mes,
              SUM(total)::float as total_mes
            FROM facturas 
            WHERE ejercicio = 2026 AND codigo_cliente::int = ANY($1) AND EXTRACT(MONTH FROM fecha) >= $2 AND EXTRACT(MONTH FROM fecha) <= $3
            GROUP BY codigo_cliente, nombre_completo, EXTRACT(MONTH FROM fecha)::int
          ) sub
          GROUP BY codigo_cliente, nombre_cliente
          ORDER BY total_periodo DESC
        `, codigosClientes, mesInicioComparable, ultimoMes2026) as any[]
      }

      return NextResponse.json({
        clientes2025: topClientes2025,
        clientes2026: topClientes2026,
        totalAnual2025,
        ultimoMes2026,
        mesEnCurso,
        primerMes2025,
        periodoComparado: periodoComparadoLabel,
        periodoLabel: `Meses cerrados (${periodoComparadoLabel})`
      })
    }

    if (tipo === 'categorias') {
      // Distribución por segmento 2025 - mismo período comparable
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
          FROM facturacion_historica WHERE anio = 2025 AND mes >= $1 AND mes <= $2
          GROUP BY codigo_cliente
        ) sub
        GROUP BY segmento
        ORDER BY total_segmento DESC
      `, mesInicioComparable, ultimoMes2026) as any[]

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
          FROM facturas WHERE ejercicio = 2026 AND EXTRACT(MONTH FROM fecha) >= $1 AND EXTRACT(MONTH FROM fecha) <= $2
          GROUP BY codigo_cliente
        ) sub
        GROUP BY segmento
        ORDER BY total_segmento DESC
      `, mesInicioComparable, ultimoMes2026) as any[]

      // Evolución mensual por segmento 2025 (mismo período comparable)
      const numMesesComparables = ultimoMes2026 - mesInicioComparable + 1
      const mensualSegmento2025 = await prisma.$queryRawUnsafe(`
        SELECT mes,
          CASE 
            WHEN total_cliente > 50000/$3::float THEN 'Grandes Cuentas'
            WHEN total_cliente > 10000/$3::float THEN 'Medianas'
            WHEN total_cliente > 2000/$3::float THEN 'Pequeñas'
            ELSE 'Micro'
          END as segmento,
          SUM(total_mes)::float as total
        FROM (
          SELECT codigo_cliente, mes, 
            SUM(total_con_iva)::float as total_mes,
            AVG(SUM(total_con_iva)) OVER (PARTITION BY codigo_cliente)::float as total_cliente
          FROM facturacion_historica WHERE anio = 2025 AND mes >= $1 AND mes <= $2
          GROUP BY codigo_cliente, mes
        ) sub
        GROUP BY mes, segmento
        ORDER BY mes, segmento
      `, mesInicioComparable, ultimoMes2026, numMesesComparables) as any[]

      const mensualSegmento2026 = await prisma.$queryRawUnsafe(`
        SELECT mes,
          CASE 
            WHEN total_cliente > 50000/$3::float THEN 'Grandes Cuentas'
            WHEN total_cliente > 10000/$3::float THEN 'Medianas'
            WHEN total_cliente > 2000/$3::float THEN 'Pequeñas'
            ELSE 'Micro'
          END as segmento,
          SUM(total_mes)::float as total
        FROM (
          SELECT codigo_cliente::int, EXTRACT(MONTH FROM fecha)::int as mes,
            SUM(total)::float as total_mes,
            AVG(SUM(total)) OVER (PARTITION BY codigo_cliente)::float as total_cliente
          FROM facturas WHERE ejercicio = 2026 AND EXTRACT(MONTH FROM fecha) >= $1 AND EXTRACT(MONTH FROM fecha) <= $2
          GROUP BY codigo_cliente, EXTRACT(MONTH FROM fecha)::int
        ) sub
        GROUP BY mes, segmento
        ORDER BY mes, segmento
      `, mesInicioComparable, ultimoMes2026, numMesesComparables) as any[]

      return NextResponse.json({
        distribucion2025,
        distribucion2026,
        mensualSegmento2025,
        mensualSegmento2026,
        ultimoMes2026,
        mesEnCurso,
        primerMes2025,
        periodoComparado: periodoComparadoLabel
      })
    }

    return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 })
  } catch (error: any) {
    console.error('Error estadísticas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
