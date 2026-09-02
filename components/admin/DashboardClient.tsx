'use client'

import { useRole } from './RoleContext'
import PendingPetitionsAlert from '@/components/peticiones/PendingPetitionsAlert'
import { 
  CreditCardIcon, 
  UsersIcon,
  DocumentTextIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  UserIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  PhoneIcon,
  CloudIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'

interface DashboardStats {
  tarifasActivas: number
  clientesActivos: number
  clientesEmpresa: number
  clientesParticular: number
  contratosActivos: number
  facturacionMesActual: number
  baseImponibleMes: number
  facturasMes: number
}

function formatEur(value: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)
}

export default function DashboardClient({ 
  userName, 
  stats, 
  mesActual 
}: { 
  userName: string
  stats: DashboardStats
  mesActual: string 
}) {
  const { effectiveRole, isViewingAs, isViewingAsUser, viewingUser, isSuperAdmin } = useRole()
  
  // Nombre a mostrar: si estamos simulando un usuario, usar su nombre
  const displayName = (isViewingAsUser && viewingUser) ? viewingUser.nombre : userName
  
  // Solo mostrar KPIs si es directivo real (no simulando otro rol)
  const showKPIs = (isSuperAdmin && !isViewingAs) || 
    (effectiveRole === 'GERENTE' && !isViewingAs) ||
    (effectiveRole === 'SUPER_ADMIN')

  return (
    <>
      <PendingPetitionsAlert
        asEmail={isViewingAsUser ? viewingUser?.email : null}
        asName={isViewingAsUser ? viewingUser?.nombre : null}
      />
      {!showKPIs
        ? <VisorDashboard userName={displayName} />
        : <DirectivoDashboard userName={displayName} stats={stats} mesActual={mesActual} />}
    </>
  )
}

function VisorDashboard({ userName }: { userName: string }) {
  return (
    <div className="space-y-8">
      {/* Welcome hero */}
      <div className="bg-gradient-to-br from-orange-50 via-white to-indigo-50 rounded-2xl border border-gray-200 p-8 md:p-12">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold text-gray-900">
            Bienvenido al Panel de Administración
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Hola, <span className="font-semibold text-orange-600">{userName}</span>
          </p>
          <p className="mt-4 text-gray-500 leading-relaxed">
            Este es el panel interno de <strong>Internet Operadores S.L.</strong>, donde gestionamos 
            todos los aspectos operativos de la empresa: clientes, facturación, contratos, 
            grandes cuentas, personal y mucho más.
          </p>
          <p className="mt-3 text-gray-500 leading-relaxed">
            Tienes acceso a las secciones que tu administrador te ha asignado. 
            Utiliza el menú lateral para navegar a tus áreas de trabajo.
          </p>
        </div>
      </div>

      {/* Qué es Internet Operadores */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Sobre Internet Operadores</h2>
        <p className="text-gray-600 leading-relaxed mb-6">
          Somos un operador de telecomunicaciones y servicios IT especializado en soluciones 
          empresariales. Ofrecemos conectividad, telefonía, cloud, seguridad y servicios gestionados 
          a empresas de todos los tamaños, con un enfoque especial en grandes cuentas industriales.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 border border-blue-100">
            <ComputerDesktopIcon className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Internet y Conectividad</h3>
              <p className="text-xs text-gray-500 mt-1">Fibra, MPLS, SD-WAN para empresas</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50/50 border border-green-100">
            <PhoneIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Telefonía</h3>
              <p className="text-xs text-gray-500 mt-1">Fija, móvil y comunicaciones unificadas</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-50/50 border border-purple-100">
            <CloudIcon className="w-6 h-6 text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Cloud y Backup</h3>
              <p className="text-xs text-gray-500 mt-1">Hosting, backup, infraestructura cloud</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-orange-50/50 border border-orange-100">
            <ShieldCheckIcon className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Seguridad</h3>
              <p className="text-xs text-gray-500 mt-1">CSOC, firewalls, protección avanzada</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-indigo-50/50 border border-indigo-100">
            <WrenchScrewdriverIcon className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Servicios Gestionados</h3>
              <p className="text-xs text-gray-500 mt-1">Soporte técnico, guardias, mantenimiento</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-50/50 border border-gray-200">
            <CreditCardIcon className="w-6 h-6 text-gray-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Hardware</h3>
              <p className="text-xs text-gray-500 mt-1">Equipos de red, servidores, dispositivos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Secciones del panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Secciones del Panel</h2>
        <p className="text-sm text-gray-500 mb-6">
          Estas son las áreas principales que gestiona el equipo. Tu acceso dependerá del perfil que te asigne un administrador.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { name: 'Tarifas', desc: 'Catálogo de productos y precios' },
            { name: 'Clientes', desc: 'Base de datos de clientes y grandes cuentas' },
            { name: 'Leads', desc: 'Oportunidades comerciales y seguimiento' },
            { name: 'Contratos', desc: 'Contratos de servicio activos' },
            { name: 'Facturación', desc: 'Emisión y gestión de facturas' },
            { name: 'Finanzas', desc: 'Movimientos bancarios, conciliación y cobros' },
            { name: 'Personal', desc: 'Nóminas, vacaciones y costes de personal' },
            { name: 'Estadísticas', desc: 'Métricas y análisis del negocio' },
          ].map(section => (
            <div key={section.name} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50/50">
              <div className="w-2 h-2 rounded-full bg-orange-400"></div>
              <div>
                <span className="text-sm font-medium text-gray-900">{section.name}</span>
                <span className="text-xs text-gray-400 ml-2">{section.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Formaciones (placeholder para futuro) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-100">
            <AcademicCapIcon className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Formación</h2>
            <p className="text-sm text-gray-500">Material formativo personalizado para tu rol</p>
          </div>
        </div>
        <div className="rounded-lg bg-amber-50/50 border border-amber-100 p-6 text-center">
          <p className="text-sm text-amber-700">
            Próximamente tendrás disponible aquí material de formación adaptado a tu perfil y responsabilidades.
          </p>
        </div>
      </div>


    </div>
  )
}

function DirectivoDashboard({ userName, stats, mesActual }: { userName: string; stats: DashboardStats; mesActual: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Hola, {userName} 👋</h2>
        <p className="mt-1 text-sm text-gray-500">Aquí tienes un resumen de tu negocio</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-blue-500 p-3">
              <CreditCardIcon className="h-6 w-6 text-white" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Tarifas Activas</p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{stats.tarifasActivas}</p>
          </dd>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-purple-500 p-3">
              <UsersIcon className="h-6 w-6 text-white" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Clientes Activos</p>
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

        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-green-500 p-3">
              <DocumentTextIcon className="h-6 w-6 text-white" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Contratos Activos</p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{stats.contratosActivos.toLocaleString('es-ES')}</p>
            <p className="ml-2 text-xs text-gray-500">facturables</p>
          </dd>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6 border border-gray-200">
          <dt>
            <div className="absolute rounded-md bg-orange-500 p-3">
              <BanknotesIcon className="h-6 w-6 text-white" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Facturación {mesActual}</p>
          </dt>
          <dd className="ml-16">
            <p className="text-2xl font-semibold text-gray-900">{formatEur(stats.facturacionMesActual)}</p>
            <p className="mt-0.5 text-xs text-gray-500">{stats.facturasMes} facturas · Base: {formatEur(stats.baseImponibleMes)}</p>
          </dd>
        </div>
      </div>

      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Acciones Rápidas</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <a href="/admin/tarifas" className="flex items-center justify-center rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500">
              Gestionar Tarifas
            </a>
            <a href="/admin/clientes" className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
              Ver Clientes
            </a>
            <a href="/admin/estadisticas" className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
              Ver Estadísticas
            </a>
            <a href="/admin/historial" className="flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
              Historial Desarrollos
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
