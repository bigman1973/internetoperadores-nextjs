export const dynamic = "force-dynamic";
import { requireAuth } from '../../lib/middleware/auth'
import prisma from '../../lib/prisma'
import DashboardClient from '../../components/admin/DashboardClient'

async function getDashboardStats() {
  try {
    const tarifasActivas = await prisma.tarifa.count({ where: { activa: true } })

    const clientesResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(DISTINCT c.id)::int as total,
        COUNT(DISTINCT c.id) FILTER (WHERE c.persona_fisica = false)::int as empresas,
        COUNT(DISTINCT c.id) FILTER (WHERE c.persona_fisica = true)::int as particulares
      FROM clientes_web c
      INNER JOIN contratos_servicio cs ON cs.cliente_id = c.cliente_id_isp
      WHERE c.activo = true AND cs.activo = true
    `)

    const contratosResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total FROM contratos_servicio WHERE activo = true
    `)

    const facturacionResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
        COALESCE(SUM(total), 0)::float as total, 
        COALESCE(SUM(base), 0)::float as base_imponible,
        COUNT(*)::int as num_facturas
      FROM facturas 
      WHERE ejercicio = EXTRACT(YEAR FROM CURRENT_DATE)::int 
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)::int
    `)

    return {
      tarifasActivas,
      clientesActivos: clientesResult[0]?.total || 0,
      clientesEmpresa: clientesResult[0]?.empresas || 0,
      clientesParticular: clientesResult[0]?.particulares || 0,
      contratosActivos: contratosResult[0]?.total || 0,
      facturacionMesActual: facturacionResult[0]?.total || 0,
      baseImponibleMes: facturacionResult[0]?.base_imponible || 0,
      facturasMes: facturacionResult[0]?.num_facturas || 0,
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return {
      tarifasActivas: 0,
      clientesActivos: 0,
      clientesEmpresa: 0,
      clientesParticular: 0,
      contratosActivos: 0,
      facturacionMesActual: 0,
      baseImponibleMes: 0,
      facturasMes: 0,
    }
  }
}

export default async function AdminDashboard() {
  const session = await requireAuth('admin')
  
  const stats = await getDashboardStats()
  const mesActual = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const userName = session.user.name || 'Usuario'

  return (
    <DashboardClient
      userName={userName}
      stats={stats}
      mesActual={mesActual}
    />
  )
}
