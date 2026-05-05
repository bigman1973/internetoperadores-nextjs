export const dynamic = "force-dynamic";
import { requireAuth } from '../../lib/middleware/auth'
import prisma from '../../lib/prisma'
import { 
  CreditCardIcon, 
  UsersIcon,
  DocumentTextIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  UserIcon
} from '@heroicons/react/24/outline'

async function getDashboardStats() {
  try {
    const tarifasActivas = await prisma.tarifa.count({ where: { activa: true } })

    // Clientes activos con facturación (tienen contratos activos)
    const clientesResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(DISTINCT c.id)::int as total,
        COUNT(DISTINCT c.id) FILTER (WHERE c.persona_fisica = false)::int as empresas,
        COUNT(DISTINCT c.id) FILTER (WHERE c.persona_fisica = true)::int as particulares
      FROM clientes_web c
      INNER JOIN contratos_servicio cs ON cs.cliente_id = c.cliente_id_isp
      WHERE c.activo = true AND cs.activo = true
    `)

    // Contratos activos
    const contratosResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total FROM contratos_servicio WHERE activo = true
    `)

    // Facturación mes actual
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

function formatEur(value: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)
}

export default async function AdminDashboard() {
  const session = await requireAuth('admin')
  const stats = await getDashboardStats()

  const mesActual = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Hola, {session.user.name} 👋
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Aquí tienes un resumen de tu negocio
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tarifas Activas */}
        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-blue-500 p-3">
              <CreditCardIcon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">
              Tarifas Activas
            </p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{stats.tarifasActivas}</p>
          </dd>
        </div>

        {/* Clientes Activos con Facturación */}
        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-purple-500 p-3">
              <UsersIcon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">
              Clientes Activos
            </p>
          </dt>
          <dd className="ml-16">
            <p className="text-2xl font-semibold text-gray-900">{stats.clientesActivos}</p>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <BuildingOfficeIcon className="h-3.5 w-3.5 text-orange-500" />
                {stats.clientesEmpresa} empresas
              </span>
              <span className="inline-flex items-center gap-1 text-gray-600">
                <UserIcon className="h-3.5 w-3.5 text-blue-500" />
                {stats.clientesParticular} particulares
              </span>
            </div>
          </dd>
        </div>

        {/* Contratos Activos */}
        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-green-500 p-3">
              <DocumentTextIcon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">
              Contratos Activos
            </p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{stats.contratosActivos.toLocaleString('es-ES')}</p>
            <p className="ml-2 text-xs text-gray-500">facturables</p>
          </dd>
        </div>

        {/* Facturación Mes Actual */}
        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-orange-500 p-3">
              <BanknotesIcon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">
              Facturación {mesActual}
            </p>
          </dt>
          <dd className="ml-16">
            <p className="text-2xl font-semibold text-gray-900">{formatEur(stats.facturacionMesActual)}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {stats.facturasMes} facturas · Base: {formatEur(stats.baseImponibleMes)}
            </p>
          </dd>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Acciones Rápidas
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <a
              href="/admin/tarifas"
              className="flex items-center justify-center rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              Gestionar Tarifas
            </a>
            <a
              href="/admin/clientes"
              className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Ver Clientes
            </a>
            <a
              href="/admin/estadisticas"
              className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Ver Estadísticas
            </a>
            <a
              href="/admin/historial"
              className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Historial Desarrollos
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
