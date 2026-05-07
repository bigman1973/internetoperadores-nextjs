export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import prisma from '../../../../lib/prisma'

// SQL CASE expression to classify contracts by product based on tarifa field
const PRODUCTO_CASE = `
  CASE 
    WHEN UPPER(cs.tarifa) LIKE '%CANARIO%' THEN 'Canario'
    WHEN UPPER(cs.tarifa) LIKE '%VOLIBRI%' THEN 'Volibri'
    WHEN UPPER(cs.tarifa) LIKE '%PERDIU%' THEN 'Perdiu'
    WHEN UPPER(cs.tarifa) LIKE '%PERIQUITO%' THEN 'Periquito'
    WHEN UPPER(cs.tarifa) LIKE '%CACATUA%' THEN 'Cacatua'
    WHEN UPPER(cs.tarifa) LIKE '%NINFA%' THEN 'Ninfa'
    WHEN UPPER(cs.tarifa) LIKE '%TRENCALOS%' OR UPPER(cs.tarifa) LIKE '%TRENCALÒS%' THEN 'Trencalòs'
    WHEN UPPER(cs.tarifa) LIKE '%LIFE ONE%' OR UPPER(cs.tarifa) LIKE '%LIFE ORIGINAL%' THEN 'Life One/Original'
    WHEN UPPER(cs.tarifa) LIKE '%PINGÜÍ%' OR UPPER(cs.tarifa) LIKE '%PINGUI%' THEN 'Pingüí Dedicada'
    WHEN UPPER(cs.tarifa) LIKE '%FIBRA%' OR UPPER(cs.tarifa) LIKE '%ADAMO%' OR UPPER(cs.tarifa) LIKE '%T-FIBRA%' OR UPPER(cs.tarifa) LIKE '%CM- FIBRA%' THEN 'Fibra'
    WHEN UPPER(cs.tarifa) LIKE '%4G%' OR UPPER(cs.tarifa) LIKE '%T-INFINITO%' OR UPPER(cs.tarifa) LIKE '%IO 4G%' THEN '4G / Inalámbrico'
    WHEN UPPER(cs.tarifa) LIKE '%CONVERGENTE%' THEN 'Convergente'
    WHEN UPPER(cs.tarifa) LIKE '%MÓVIL%' OR UPPER(cs.tarifa) LIKE '%MOVIL%' OR UPPER(cs.tarifa) LIKE '%TTB%' OR UPPER(cs.tarifa) LIKE '%SÓLO MÓVIL%' THEN 'Móvil'
    WHEN UPPER(cs.tarifa) LIKE '%PBX%' OR UPPER(cs.tarifa) LIKE '%WILDIX%' OR UPPER(cs.tarifa) LIKE '%CENTRALITA%' THEN 'Centralita / PBX'
    WHEN UPPER(cs.tarifa) LIKE '%LINEA FIJA%' OR UPPER(cs.tarifa) LIKE '%LÍNEA FIJA%' OR UPPER(cs.tarifa) LIKE '%LINEA DE FAX%' THEN 'Línea Fija'
    WHEN UPPER(cs.tarifa) LIKE '%IP FIJA%' THEN 'IP Fija'
    WHEN UPPER(cs.tarifa) LIKE '%DOMINIO%' OR UPPER(cs.tarifa) LIKE '%HOSTING%' OR UPPER(cs.tarifa) LIKE '%GOOGLE%' OR UPPER(cs.tarifa) LIKE '%BUZON%' OR UPPER(cs.tarifa) LIKE '%BUZÓN%' OR UPPER(cs.tarifa) LIKE '%SERVIDOR%' THEN 'Hosting / Cloud'
    WHEN UPPER(cs.tarifa) LIKE '%VPN%' THEN 'VPN'
    WHEN UPPER(cs.tarifa) LIKE '%MANTENIMIENTO%' THEN 'Mantenimiento IT'
    WHEN UPPER(cs.tarifa) LIKE '%HOTSPOT%' OR UPPER(cs.tarifa) LIKE '%WIFI%' THEN 'WiFi / Hotspot'
    WHEN UPPER(cs.tarifa) LIKE '%TV%' OR UPPER(cs.tarifa) LIKE '%PLATAFORMA%' THEN 'TV'
    WHEN UPPER(cs.tarifa) LIKE '%TERMINAL%' OR UPPER(cs.tarifa) LIKE '%DECT%' THEN 'Terminales'
    WHEN UPPER(cs.tarifa) LIKE '%SERVICIO%' THEN 'Servicios Varios'
    ELSE 'Otros'
  END
`

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const modo = searchParams.get('modo') || 'stats' // stats, list, grouped, byproduct

    if (modo === 'stats') {
      // Dashboard stats: general + by product + top clients
      const [generalStats, productStats, topClients]: any = await Promise.all([
        prisma.$queryRawUnsafe(`
          SELECT 
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE activo = true)::int as activos,
            COUNT(*) FILTER (WHERE activo = false)::int as bajas,
            COALESCE(SUM(precio) FILTER (WHERE activo = true), 0) as facturacion_mensual,
            COALESCE(SUM(importe_remesar) FILTER (WHERE activo = true), 0) as facturacion_iva,
            COUNT(DISTINCT cliente_id) FILTER (WHERE activo = true)::int as clientes_con_servicio
          FROM contratos_servicio
        `),
        prisma.$queryRawUnsafe(`
          SELECT 
            ${PRODUCTO_CASE} as producto,
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE cs.activo = true)::int as activos,
            COUNT(*) FILTER (WHERE cs.activo = false)::int as bajas,
            COALESCE(SUM(cs.precio) FILTER (WHERE cs.activo = true), 0) as facturacion
          FROM contratos_servicio cs
          GROUP BY producto
          ORDER BY facturacion DESC
        `),
        prisma.$queryRawUnsafe(`
          SELECT 
            cs.cliente_id,
            COALESCE(cw.nombre, 'Cliente ' || cs.cliente_id) as nombre_cliente,
            COUNT(*) FILTER (WHERE cs.activo = true)::int as contratos_activos,
            COALESCE(SUM(cs.precio) FILTER (WHERE cs.activo = true), 0) as facturacion
          FROM contratos_servicio cs
          LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
          WHERE cs.activo = true
          GROUP BY cs.cliente_id, cw.nombre
          ORDER BY facturacion DESC
          LIMIT 15
        `)
      ])

      return NextResponse.json({
        general: generalStats[0],
        productos: productStats,
        topClientes: topClients
      })
    }

    // Common filter params
    const search = searchParams.get('search') || ''
    const estado = searchParams.get('estado') || ''
    const producto = searchParams.get('producto') || ''
    const page = parseInt(searchParams.get('page') || '1')

    // Build WHERE clause helper
    function buildWhere() {
      let whereClause = 'WHERE 1=1'
      const params: any[] = []
      let paramIndex = 1

      if (estado === 'activo') {
        whereClause += ` AND cs.activo = true`
      } else if (estado === 'baja') {
        whereClause += ` AND cs.activo = false`
      }

      if (producto) {
        whereClause += ` AND ${PRODUCTO_CASE} = $${paramIndex}`
        params.push(producto)
        paramIndex++
      }

      if (search) {
        whereClause += ` AND (cw.nombre ILIKE $${paramIndex} OR cs.titulo ILIKE $${paramIndex} OR cs.tarifa ILIKE $${paramIndex} OR cs.telefonos_contrato ILIKE $${paramIndex} OR cs.cliente_id ILIKE $${paramIndex})`
        params.push(`%${search}%`)
        paramIndex++
      }

      return { whereClause, params, paramIndex }
    }

    if (modo === 'byproduct') {
      // Grouped by product view
      const pageSize = 15
      const { whereClause, params, paramIndex } = buildWhere()

      const countQuery = `
        SELECT COUNT(DISTINCT ${PRODUCTO_CASE})::int as count
        FROM contratos_servicio cs
        LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
        ${whereClause}
      `
      const countResult: any = await prisma.$queryRawUnsafe(countQuery, ...params)
      const totalProducts = countResult[0]?.count || 0

      const offset = (page - 1) * pageSize
      const productsQuery = `
        SELECT 
          ${PRODUCTO_CASE} as producto,
          COUNT(*)::int as total_contratos,
          COUNT(*) FILTER (WHERE cs.activo = true)::int as contratos_activos,
          COUNT(*) FILTER (WHERE cs.activo = false)::int as contratos_bajas,
          COUNT(DISTINCT cs.cliente_id)::int as num_clientes,
          COALESCE(SUM(cs.precio) FILTER (WHERE cs.activo = true), 0) as facturacion_mensual
        FROM contratos_servicio cs
        LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
        ${whereClause}
        GROUP BY producto
        ORDER BY facturacion_mensual DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      const products: any = await prisma.$queryRawUnsafe(productsQuery, ...params, pageSize, offset)

      // For each product, get top contracts
      const productGroups = []
      for (const prod of products) {
        const contractParams: any[] = [prod.producto]
        let contractWhere = `WHERE ${PRODUCTO_CASE} = $1`
        let cpIdx = 2

        if (estado === 'activo') contractWhere += ` AND cs.activo = true`
        else if (estado === 'baja') contractWhere += ` AND cs.activo = false`

        if (search) {
          contractWhere += ` AND (cw.nombre ILIKE $${cpIdx} OR cs.titulo ILIKE $${cpIdx} OR cs.tarifa ILIKE $${cpIdx} OR cs.telefonos_contrato ILIKE $${cpIdx} OR cs.cliente_id ILIKE $${cpIdx})`
          contractParams.push(`%${search}%`)
          cpIdx++
        }

        const contracts: any = await prisma.$queryRawUnsafe(
          `SELECT cs.*, COALESCE(cw.nombre, 'Cliente ' || cs.cliente_id) as nombre_cliente, cw.id as cliente_db_id
           FROM contratos_servicio cs
           LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
           ${contractWhere}
           ORDER BY cs.activo DESC, cs.precio DESC
           LIMIT 50`,
          ...contractParams
        )

        // Group these contracts by tarifa for a sub-summary
        const tarifaMap: Record<string, { tarifa: string, total: number, activos: number, facturacion: number }> = {}
        for (const c of contracts) {
          if (!tarifaMap[c.tarifa]) {
            tarifaMap[c.tarifa] = { tarifa: c.tarifa, total: 0, activos: 0, facturacion: 0 }
          }
          tarifaMap[c.tarifa].total++
          if (c.activo) {
            tarifaMap[c.tarifa].activos++
            tarifaMap[c.tarifa].facturacion += Number(c.precio || 0)
          }
        }

        productGroups.push({
          ...prod,
          tarifas: Object.values(tarifaMap).sort((a, b) => b.facturacion - a.facturacion),
          contratos: contracts
        })
      }

      return NextResponse.json({
        productos: productGroups,
        total: totalProducts,
        page,
        pageSize,
        totalPages: Math.ceil(totalProducts / pageSize)
      })
    }

    if (modo === 'grouped') {
      // Grouped by client view
      const pageSize = 20
      const { whereClause, params, paramIndex } = buildWhere()

      const countQuery = `
        SELECT COUNT(DISTINCT cs.cliente_id)::int as count
        FROM contratos_servicio cs
        LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
        ${whereClause}
      `
      const countResult: any = await prisma.$queryRawUnsafe(countQuery, ...params)
      const totalClients = countResult[0]?.count || 0

      const offset = (page - 1) * pageSize
      const clientsQuery = `
        SELECT 
          cs.cliente_id,
          COALESCE(cw.nombre, 'Cliente ' || cs.cliente_id) as nombre_cliente,
          cw.id as cliente_db_id,
          cw.email,
          cw.telefono,
          cw.municipio,
          COUNT(*)::int as total_contratos,
          COUNT(*) FILTER (WHERE cs.activo = true)::int as contratos_activos,
          COUNT(*) FILTER (WHERE cs.activo = false)::int as contratos_bajas,
          COALESCE(SUM(cs.precio) FILTER (WHERE cs.activo = true), 0) as facturacion_mensual
        FROM contratos_servicio cs
        LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
        ${whereClause}
        GROUP BY cs.cliente_id, cw.nombre, cw.id, cw.email, cw.telefono, cw.municipio
        ORDER BY facturacion_mensual DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      const clients: any = await prisma.$queryRawUnsafe(clientsQuery, ...params, pageSize, offset)

      // For each client, get their contracts
      const clientIds = clients.map((c: any) => c.cliente_id)
      let contractsForClients: any[] = []
      
      if (clientIds.length > 0) {
        const placeholders = clientIds.map((_: any, i: number) => `$${i + 1}`).join(',')
        let contractWhere = `WHERE cs.cliente_id IN (${placeholders})`
        const contractParams = [...clientIds]
        let cpIdx = clientIds.length + 1
        
        if (estado === 'activo') contractWhere += ` AND cs.activo = true`
        else if (estado === 'baja') contractWhere += ` AND cs.activo = false`
        
        if (producto) {
          contractWhere += ` AND ${PRODUCTO_CASE} = $${cpIdx}`
          contractParams.push(producto)
          cpIdx++
        }

        contractsForClients = await prisma.$queryRawUnsafe(
          `SELECT cs.*, ${PRODUCTO_CASE} as producto FROM contratos_servicio cs ${contractWhere} ORDER BY cs.activo DESC, cs.fecha_inicio DESC`,
          ...contractParams
        )
      }

      // Group contracts by client
      const contractsByClient: Record<string, any[]> = {}
      for (const c of contractsForClients) {
        if (!contractsByClient[c.cliente_id]) contractsByClient[c.cliente_id] = []
        contractsByClient[c.cliente_id].push(c)
      }

      const groupedData = clients.map((client: any) => ({
        ...client,
        contratos: contractsByClient[client.cliente_id] || []
      }))

      return NextResponse.json({
        clientes: groupedData,
        total: totalClients,
        page,
        pageSize,
        totalPages: Math.ceil(totalClients / pageSize)
      })
    }

    // modo === 'list' - flat list with filters
    const pageSize = 30
    const { whereClause, params, paramIndex } = buildWhere()
    const offset = (page - 1) * pageSize

    const [contratos, countResult]: any = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT cs.*, ${PRODUCTO_CASE} as producto, COALESCE(cw.nombre, 'Cliente ' || cs.cliente_id) as nombre_cliente, cw.id as cliente_db_id
         FROM contratos_servicio cs
         LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
         ${whereClause}
         ORDER BY cs.activo DESC, cs.fecha_inicio DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        ...params, pageSize, offset
      ),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as count
         FROM contratos_servicio cs
         LEFT JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
         ${whereClause}`,
        ...params
      )
    ])

    const total = countResult[0]?.count || 0

    return NextResponse.json({
      contratos,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    })

  } catch (error: any) {
    console.error('Error en API contratos:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener contratos' },
      { status: 500 }
    )
  }
}
