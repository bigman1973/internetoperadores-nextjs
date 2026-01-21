import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import { 
  CreditCardIcon, 
  EyeIcon, 
  DocumentTextIcon,
  UsersIcon 
} from '@heroicons/react/24/outline'

async function getDashboardStats() {
  const [
    tarifasActivas,
    // totalClientes,
    // Estadísticas del mes actual
    vistasEsteMes,
    contratacionesEsteMes,
  ] = await Promise.all([
    prisma.tarifa.count({ where: { activa: true } }),
    // TODO: Implementar modelo Cliente
    // prisma.cliente.count({ where: { estado: 'ACTIVO' } }),
    // TODO: Implementar conteo de vistas del mes
    Promise.resolve(0),
    // TODO: Implementar conteo de contrataciones del mes
    Promise.resolve(0),
  ])

  const totalClientes = 0 // Temporal hasta implementar modelo Cliente

  return {
    tarifasActivas,
    totalClientes, // Temporal: 0
    vistasEsteMes,
    contratacionesEsteMes,
  }
}

async function getRecentActivity() {
  // Obtener últimos cambios del historial
  const recentChanges = await prisma.historialCambio.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      usuario: true,
      tarifa: true,
    },
  })

  return recentChanges
}

async function getTopTarifas() {
  // Obtener tarifas más vistas (últimos 7 días)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const topTarifas = await prisma.estadisticaTarifa.groupBy({
    by: ['tarifaId'],
    where: {
      fecha: {
        gte: sevenDaysAgo,
      },
    },
    _sum: {
      vistas: true,
      contrataciones: true,
    },
    orderBy: {
      _sum: {
        vistas: 'desc',
      },
    },
    take: 5,
  })

  // Obtener información de las tarifas
  const tarifasConInfo = await Promise.all(
    topTarifas.map(async (stat) => {
      const tarifa = await prisma.tarifa.findUnique({
        where: { id: stat.tarifaId },
      })
      if (!tarifa) return null
      return {
        ...tarifa,
        vistas: stat._sum.vistas || 0,
        contrataciones: stat._sum.contrataciones || 0,
      }
    })
  )

  // Filtrar nulls
  return tarifasConInfo.filter((t) => t !== null)
}

export default async function AdminDashboard() {
  const session = await requireAuth('admin')
  const stats = await getDashboardStats()
  const recentActivity = await getRecentActivity()
  const topTarifas = await getTopTarifas()

  const statCards = [
    {
      name: 'Tarifas Activas',
      value: stats.tarifasActivas,
      icon: CreditCardIcon,
      color: 'bg-blue-500',
    },
    {
      name: 'Vistas este mes',
      value: stats.vistasEsteMes.toLocaleString('es-ES'),
      icon: EyeIcon,
      color: 'bg-green-500',
    },
    {
      name: 'Contratos este mes',
      value: stats.contratacionesEsteMes,
      icon: DocumentTextIcon,
      color: 'bg-orange-500',
    },
    {
      name: 'Clientes Activos',
      value: stats.totalClientes,
      icon: UsersIcon,
      color: 'bg-purple-500',
    },
  ]

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
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200"
          >
            <dt>
              <div className={`absolute rounded-md ${stat.color} p-3`}>
                <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-gray-500">
                {stat.name}
              </p>
            </dt>
            <dd className="ml-16 flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
            </dd>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top tarifas */}
        <div className="rounded-lg bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Tarifas más vistas (últimos 7 días)
            </h3>
            <div className="mt-4 space-y-3">
              {topTarifas.length > 0 ? (
                topTarifas.map((tarifa, index) => (
                  <div
                    key={tarifa?.id}
                    className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg font-bold text-gray-400">
                        {index + 1}.
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {tarifa?.nombre}
                        </p>
                        <p className="text-xs text-gray-500">
                          {tarifa?.vistas} vistas
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-green-600">
                      {tarifa?.contrataciones} contratos
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  No hay datos de estadísticas aún
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-lg bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Actividad Reciente
            </h3>
            <div className="mt-4 space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => {
                  const accionTexto = {
                    CREAR: 'creó',
                    EDITAR: 'actualizó',
                    ELIMINAR: 'eliminó',
                    ACTIVAR: 'activó',
                    DESACTIVAR: 'desactivó',
                    SUBIDA_MASIVA: 'aplicó subida de precios a',
                  }[activity.accion]

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start space-x-3 border-b border-gray-100 pb-3 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{activity.usuario.nombre}</span>
                          {' '}{accionTexto}{' '}
                          {activity.tarifa && (
                            <span className="font-medium">&quot;{activity.tarifa.nombre}&quot;</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(activity.createdAt).toLocaleString('es-ES')}
                        </p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-gray-500">
                  No hay actividad reciente
                </p>
              )}
            </div>
          </div>
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
              href="/admin/tarifas/nueva"
              className="flex items-center justify-center rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              + Nueva Tarifa
            </a>
            <a
              href="/admin/clientes/nuevo"
              className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              + Nuevo Cliente
            </a>
            <a
              href="/admin/subida-precios"
              className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Subir Precios
            </a>
            <a
              href="/admin/estadisticas"
              className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Ver Estadísticas
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
