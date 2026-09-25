import Link from 'next/link'
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  CircleStackIcon,
  UserGroupIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { requireAuth } from '../../../lib/middleware/auth'
import { registrarArea } from '../../../lib/permisos'
import prisma from '../../../lib/prisma'
import { SEGMENTO_CRM_CONFIG, type SegmentoCrmValue } from '../../../lib/crm-segmentos'

export const dynamic = 'force-dynamic'

const PRODUCTO_LABELS: Record<string, string> = {
  EXAGRID: 'ExaGrid',
  INFRAESTRUCTURA_RED: 'Infraestructura de red',
  MANTENIMIENTO_IT: 'Mantenimiento IT',
  MOVILES: 'Movilidad',
  COMUNICACIONES_UNIFICADAS: 'Comunicaciones unificadas',
  CONECTIVIDAD_AVANZADA: 'Conectividad avanzada',
  MIGRACION_WEB: 'Migración web',
}

const SEGMENT_ICON = {
  PARTICULAR: UserIcon,
  EMPRESA: BuildingOffice2Icon,
  PARTNER: UserGroupIcon,
} as const

export default async function CrmPage() {
  await requireAuth('admin')

  await Promise.all([
    registrarArea('admin.crm', 'CRM', 'admin'),
    registrarArea('admin.crm.particulares', 'CRM > Particulares', 'admin.crm'),
    registrarArea('admin.crm.empresas', 'CRM > Empresas', 'admin.crm'),
    registrarArea('admin.crm.partners', 'CRM > Partners', 'admin.crm'),
    registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm'),
    registrarArea('admin.crm.listas', 'CRM > Listas y segmentos', 'admin.crm'),
  ])

  const [clientesPorSegmento, leadsMigracion, leadsPorProducto, leadsPartner, totalClientes, clientesSinClasificar, listasCrm, listasActivas, membresiasListas, contactosCrm, contactosConvertidos] = await Promise.all([
    prisma.clienteWeb.groupBy({
      by: ['segmentoCrm'],
      where: { activo: true },
      _count: { _all: true },
    }),
    prisma.leadMigracionWeb.count(),
    prisma.leadSolucion.groupBy({
      by: ['tipo', 'segmentoCrm'],
      _count: { _all: true },
      orderBy: { tipo: 'asc' },
    }),
    prisma.leadPartner.count(),
    prisma.clienteWeb.count(),
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total
      FROM clientes_web
      WHERE segmento_crm IS NULL
    `,
    prisma.crmLista.count({ where: { activo: true } }),
    prisma.crmLista.count({ where: { activo: true, processingType: 'DYNAMIC' } }),
    prisma.crmLista.aggregate({ where: { activo: true }, _sum: { tamanoHubspot: true } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', listas: { some: { activo: true, lista: { activo: true } } } } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', clienteWebId: { not: null }, listas: { some: { activo: true, lista: { activo: true } } } } }),
  ])

  const clientesCount = new Map<SegmentoCrmValue, number>(
    clientesPorSegmento.map((item) => [item.segmentoCrm as SegmentoCrmValue, item._count._all])
  )
  const totalLeadsEmpresa = leadsMigracion + leadsPorProducto.reduce((sum, item) => sum + item._count._all, 0)
  const cobertura = totalClientes === 0
    ? 100
    : Math.round(((totalClientes - Number(clientesSinClasificar[0]?.total || 0)) / totalClientes) * 1000) / 10

  const segmentos: Array<{
    key: SegmentoCrmValue
    detalle: string
    enlace: string
    meta: string
  }> = [
    {
      key: 'PARTICULAR',
      detalle: 'Clientes residenciales y futuras oportunidades de fibra, 4G/WiMAX, móvil y telefonía fija.',
      enlace: '/admin/clientes?segmento=PARTICULAR',
      meta: 'Cartera activa',
    },
    {
      key: 'EMPRESA',
      detalle: 'Clientes y oportunidades B2B organizados por producto y por su pipeline comercial específico.',
      enlace: '/admin/clientes?segmento=EMPRESA',
      meta: `${totalLeadsEmpresa} leads clasificados`,
    },
    {
      key: 'PARTNER',
      detalle: 'Gestorías y colaboradores que presentan o comercializan nuestros servicios para terceros.',
      enlace: '/admin/crm/partners',
      meta: `${leadsPartner} solicitudes de adhesión`,
    },
  ]

  return (
    <main className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">CRM</h1>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 ring-1 ring-inset ring-orange-200">
              Base operativa
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Punto común para gestionar la relación comercial sin mezclar particulares, empresas y partners. La naturaleza fiscal del cliente se conserva como un dato independiente.
          </p>
        </div>
        <Link
          href="/admin/clientes"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Revisar clasificación
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </header>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 sm:p-6">
          <div className="flex h-full flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><UserGroupIcon className="h-7 w-7" /></div>
              <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-gray-900">Contactos</h2><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">Leads y clientes</span></div><p className="mt-1 text-sm leading-6 text-gray-600">Directorio central de contactos. Siguen siendo leads hasta que compran y conservan todas sus listas al convertirse.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700"><span><strong className="text-gray-900">{contactosCrm.toLocaleString('es-ES')}</strong> contactos</span><span><strong className="text-green-700">{contactosConvertidos.toLocaleString('es-ES')}</strong> clientes</span></div></div>
            </div>
            <Link href="/admin/crm/contactos" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Abrir contactos <ArrowRightIcon className="h-4 w-4" /></Link>
          </div>
        </article>

        <article className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm">
              <CircleStackIcon className="h-7 w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">Listas y segmentos</h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">HubSpot</span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">Consulta las listas reales, distingue las activas de las estáticas y revisa sus criterios y miembros sin perder la lógica de segmentación.</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
                <span><strong className="text-gray-900">{listasCrm}</strong> listas copiadas</span>
                <span><strong className="text-blue-800">{listasActivas}</strong> activas</span>
                <span><strong className="text-gray-900">{Number(membresiasListas._sum.tamanoHubspot || 0).toLocaleString('es-ES')}</strong> membresías</span>
              </div>
            </div>
          </div>
          <Link href="/admin/crm/listas" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">
            Abrir listas
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {segmentos.map(({ key, detalle, enlace, meta }) => {
          const config = SEGMENTO_CRM_CONFIG[key]
          const Icon = SEGMENT_ICON[key]
          return (
            <article key={key} className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-50">
                  <Icon className="h-6 w-6 text-gray-700" />
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${config.badgeClass}`}>
                  {config.label}
                </span>
              </div>
              <p className="mt-6 text-3xl font-bold text-gray-900">{(clientesCount.get(key) || 0).toLocaleString('es-ES')}</p>
              <p className="mt-1 text-sm font-medium text-gray-700">{meta}</p>
              <p className="mt-4 min-h-[72px] text-sm leading-6 text-gray-600">{detalle}</p>
              <Link href={enlace} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-orange-700 hover:text-orange-800">
                Ver {config.label.toLowerCase()}s
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </article>
          )
        })}
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Clientes clasificados</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalClientes.toLocaleString('es-ES')}</p>
          <p className="mt-1 text-xs text-green-700">Cobertura de clasificación: {cobertura.toLocaleString('es-ES')}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Leads empresariales</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalLeadsEmpresa.toLocaleString('es-ES')}</p>
          <p className="mt-1 text-xs text-gray-500">Todos nacen ya informados como Empresa.</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Leads Partner</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{leadsPartner.toLocaleString('es-ES')}</p>
          <p className="mt-1 text-xs text-gray-500">Las nuevas solicitudes ya quedan guardadas localmente.</p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Captación empresarial ya clasificada</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">Volumen actual que se heredará al pipeline de cada producto.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">Producto</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Segmento</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              <tr>
                <td className="px-5 py-3 text-sm font-medium text-gray-900 sm:px-6">Migración web</td>
                <td className="px-5 py-3"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">Empresa</span></td>
                <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 sm:px-6">{leadsMigracion}</td>
              </tr>
              {leadsPorProducto.map((item) => (
                <tr key={`${item.tipo}-${item.segmentoCrm}`}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 sm:px-6">{PRODUCTO_LABELS[item.tipo] || item.tipo}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">Empresa</span></td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 sm:px-6">{item._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
