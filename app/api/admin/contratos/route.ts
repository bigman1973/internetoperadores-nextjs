export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import prisma from '../../../../lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const modo = searchParams.get('modo') || 'stats' // stats, list, grouped

    if (modo === 'stats') {
      // Dashboard stats: general + by category
      const [generalStats, categoryStats, topClients]: any = await Promise.all([
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
            COALESCE(categoria, 'Sin categoría') as categoria,
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE activo = true)::int as activos,
            COUNT(*) FILTER (WHERE activo = false)::int as bajas,
            COALESCE(SUM(precio) FILTER (WHERE activo = true), 0) as facturacion
          FROM contratos_servicio
          GROUP BY COALESCE(categoria, 'Sin categoría')
          ORDER BY facturacion DESC
        `),
        prisma.$queryRawUnsafe(`
          SELECT 
            cs.cliente_id,
            COALESCE(cw.nombre, 'Cliente ' || cs.cliente_id) as nombre_cliente,
            COUNT(*) FILTER (WHERE cs.activo = true)::int as contratos_activos,
            COALESCE(SUM(cs.precio) FILTER (WHERE cs.activo = true), 0) as facturacion
          FROM contratos_servicio cs
          LEFT JOIN clientes_web cw ON cw.isp_gestion_id = cs.cliente_id
          WHERE cs.activo = true
          GROUP BY cs.cliente_id, cw.nombre
          ORDER BY facturacion DESC
          LIMIT 15
        `)
      ])

      return NextResponse.json({
        general: generalStats[0],
        categorias: categoryStats,
        topClientes: topClients
      })
    }

    if (modo === 'grouped') {
      // Grouped by client view
      const search = searchParams.get('search') || ''
      const estado = searchParams.get('estado') || ''
      const categoria = searchParams.get('categoria') || ''
      const page = parseInt(searchParams.get('page') || '1')
      const pageSize = 20

      let whereClause = 'WHERE 1=1'
      const params: any[] = []
      let paramIndex = 1

      if (estado === 'activo') {
        whereClause += ` AND cs.activo = true`
      } else if (estado === 'baja') {
        whereClause += ` AND cs.activo = false`
      }

      if (categoria) {
        whereClause += ` AND cs.categoria = $${paramIndex}`
        params.push(categoria)
        paramIndex++
      }

      if (search) {
        whereClause += ` AND (cw.nombre ILIKE $${paramIndex} OR cs.titulo ILIKE $${paramIndex} OR cs.tarifa ILIKE $${paramIndex} OR cs.telefonos_contrato ILIKE $${paramIndex} OR cs.cliente_id ILIKE $${paramIndex})`
        params.push(`%${search}%`)
        paramIndex++
      }

      // Get grouped clients with their contract summaries
      const countQuery = `
        SELECT COUNT(DISTINCT cs.cliente_id)::int as count
        FROM contratos_servicio cs
        LEFT JOIN clientes_web cw ON cw.isp_gestion_id = cs.cliente_id
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
        LEFT JOIN clientes_web cw ON cw.isp_gestion_id = cs.cliente_id
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
        
        if (estado === 'activo') contractWhere += ` AND cs.activo = true`
        else if (estado === 'baja') contractWhere += ` AND cs.activo = false`
        if (categoria) {
          contractWhere += ` AND cs.categoria = $${clientIds.length + 1}`
          contractsForClients = await prisma.$queryRawUnsafe(
            `SELECT cs.* FROM contratos_servicio cs ${contractWhere} ORDER BY cs.activo DESC, cs.fecha_inicio DESC`,
            ...clientIds, categoria
          )
        } else {
          contractsForClients = await prisma.$queryRawUnsafe(
            `SELECT cs.* FROM contratos_servicio cs ${contractWhere} ORDER BY cs.activo DESC, cs.fecha_inicio DESC`,
            ...clientIds
          )
        }
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
    const search = searchParams.get('search') || ''
    const estado = searchParams.get('estado') || ''
    const categoria = searchParams.get('categoria') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = 30

    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let paramIndex = 1

    if (estado === 'activo') {
      whereClause += ` AND cs.activo = true`
    } else if (estado === 'baja') {
      whereClause += ` AND cs.activo = false`
    }

    if (categoria) {
      whereClause += ` AND cs.categoria = $${paramIndex}`
      params.push(categoria)
      paramIndex++
    }

    if (search) {
      whereClause += ` AND (cw.nombre ILIKE $${paramIndex} OR cs.titulo ILIKE $${paramIndex} OR cs.tarifa ILIKE $${paramIndex} OR cs.telefonos_contrato ILIKE $${paramIndex} OR cs.cliente_id ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    const offset = (page - 1) * pageSize

    const [contratos, countResult]: any = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT cs.*, COALESCE(cw.nombre, 'Cliente ' || cs.cliente_id) as nombre_cliente, cw.id as cliente_db_id
         FROM contratos_servicio cs
         LEFT JOIN clientes_web cw ON cw.isp_gestion_id = cs.cliente_id
         ${whereClause}
         ORDER BY cs.activo DESC, cs.fecha_inicio DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        ...params, pageSize, offset
      ),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as count
         FROM contratos_servicio cs
         LEFT JOIN clientes_web cw ON cw.isp_gestion_id = cs.cliente_id
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
