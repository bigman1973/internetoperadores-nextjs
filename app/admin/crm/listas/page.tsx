import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { requireAuth } from '@/lib/middleware/auth'
import { registrarArea } from '@/lib/permisos'
import prisma from '@/lib/prisma'
import CrmListasSyncPanel from '@/components/admin/CrmListasSyncPanel'

export const dynamic = 'force-dynamic'

type SearchParams = {
  search?: string
  type?: string
  segment?: string
  purpose?: string
  page?: string
}

const PURPOSE_LABELS: Record<string, string> = {
  SIN_CLASIFICAR: 'Sin clasificar',
  COMERCIAL: 'Seguimiento comercial',
  CAPTACION: 'Captación',
  NEWSLETTER: 'Newsletter',
  PARTNERS: 'Partners',
  SUPRESION: 'Exclusión / bajas',
  OPERATIVA: 'Operativa interna',
}

const SEGMENT_LABELS: Record<string, string> = {
  PARTICULAR: 'Particulares',
  EMPRESA: 'Empresas',
  PARTNER: 'Partners',
}

const TYPE_LABELS: Record<string, string> = {
  DYNAMIC: 'Activa',
  MANUAL: 'Estática',
  SNAPSHOT: 'Instantánea',
}

function queryString(params: SearchParams, page: number) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== 'page') query.set(key, value)
  })
  query.set('page', String(page))
  return query.toString()
}

export default async function CrmListasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAuth('admin')
  await registrarArea('admin.crm.listas', 'CRM > Listas', 'admin.crm')
  const params = await searchParams
  const page = Math.max(1, Number(params.page || 1) || 1)
  const pageSize = 30
  const where: any = { activo: true }

  if (params.search) where.nombre = { contains: params.search.trim(), mode: 'insensitive' }
  if (['DYNAMIC', 'MANUAL', 'SNAPSHOT'].includes(params.type || '')) where.processingType = params.type
  if (['PARTICULAR', 'EMPRESA', 'PARTNER'].includes(params.segment || '')) where.segmentoCrm = params.segment
  if (Object.hasOwn(PURPOSE_LABELS, params.purpose || '')) where.proposito = params.purpose

  const [lists, total, aggregate, activeLists, staticLists, unclassified, exclusionLists, lastSync] = await Promise.all([
    prisma.crmLista.findMany({
      where,
      orderBy: [{ nombre: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmLista.count({ where }),
    prisma.crmLista.aggregate({ where: { activo: true }, _sum: { tamanoHubspot: true }, _count: { _all: true } }),
    prisma.crmLista.count({ where: { activo: true, processingType: 'DYNAMIC' } }),
    prisma.crmLista.count({ where: { activo: true, processingType: { in: ['MANUAL', 'SNAPSHOT'] } } }),
    prisma.crmLista.count({ where: { activo: true, segmentoCrm: null } }),
    prisma.crmLista.count({ where: { activo: true, proposito: 'SUPRESION' } }),
    prisma.crmSincronizacionHubspot.findFirst({ orderBy: { iniciadoAt: 'desc' } }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasData = aggregate._count._all > 0

  return (
    <main className="space-y-6 px-1 py-1 sm:px-2">
      <header className="space-y-4">
        <Link href="/admin/crm" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al CRM
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <CircleStackIcon className="h-8 w-8 text-orange-600" />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Listas y segmentos</h1>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Origen HubSpot</span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
            Consulta las listas reales de HubSpot con su nombre, tipo, criterios y miembros. Las listas activas conservan su definición dinámica y muestran una instantánea fechada de sus miembros actuales.
          </p>
        </div>
      </header>

      <CrmListasSyncPanel />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Listas" value={aggregate._count._all} icon={<CircleStackIcon className="h-5 w-5" />} />
        <Kpi label="Listas activas" value={activeLists} icon={<BoltIcon className="h-5 w-5" />} tone="blue" />
        <Kpi label="Listas estáticas" value={staticLists} icon={<FunnelIcon className="h-5 w-5" />} />
        <Kpi label="Membresías" value={aggregate._sum.tamanoHubspot || 0} icon={<UserGroupIcon className="h-5 w-5" />} />
        <Kpi label="Por clasificar" value={unclassified} icon={<ExclamationTriangleIcon className="h-5 w-5" />} tone="amber" />
      </section>

      {exclusionLists > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>{exclusionLists} listas de exclusión, rebotes o bajas</strong> se muestran diferenciadas. No deben utilizarse como listas comerciales ordinarias.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <form method="get" className="grid gap-3 border-b border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="relative sm:col-span-2">
            <span className="sr-only">Buscar listas</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input name="search" defaultValue={params.search} placeholder="Buscar por nombre…" className="min-h-11 w-full rounded-lg border-gray-300 pl-10 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
          </label>
          <select name="type" defaultValue={params.type || ''} aria-label="Tipo de lista" className="min-h-11 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todos los tipos</option>
            <option value="DYNAMIC">Activas</option>
            <option value="MANUAL">Estáticas</option>
            <option value="SNAPSHOT">Instantáneas</option>
          </select>
          <select name="segment" defaultValue={params.segment || ''} aria-label="Área CRM" className="min-h-11 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todas las áreas</option>
            <option value="PARTICULAR">Particulares</option>
            <option value="EMPRESA">Empresas</option>
            <option value="PARTNER">Partners</option>
          </select>
          <select name="purpose" defaultValue={params.purpose || ''} aria-label="Uso de la lista" className="min-h-11 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todos los usos</option>
            {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="min-h-11 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Aplicar filtros</button>
        </form>

        {!hasData ? (
          <div className="px-5 py-16 text-center">
            <CircleStackIcon className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Las listas aún no se han copiado al CRM</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Pulsa «Comprobar cambios» y después «Sincronizar». La primera comprobación es un ensayo sin escritura.</p>
          </div>
        ) : lists.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-gray-500">No hay listas que coincidan con los filtros seleccionados.</div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 lg:hidden">
              {lists.map((list) => <ListCard key={list.id} list={list} />)}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Nombre</Th><Th>Área y uso</Th><Th>Tipo</Th><Th>Miembros</Th><Th>Última sincronización</Th><Th><span className="sr-only">Abrir</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {lists.map((list) => (
                    <tr key={list.id} className={list.proposito === 'SUPRESION' ? 'bg-amber-50/40' : ''}>
                      <td className="px-5 py-4"><p className="font-semibold text-gray-900">{list.nombre}</p><p className="mt-1 text-xs text-gray-500">HubSpot #{list.hubspotId}</p></td>
                      <td className="px-5 py-4 text-sm"><p className="font-medium text-gray-700">{list.segmentoCrm ? SEGMENT_LABELS[list.segmentoCrm] : 'Sin asignar'}</p><p className="mt-1 text-xs text-gray-500">{PURPOSE_LABELS[list.proposito] || list.proposito}</p></td>
                      <td className="px-5 py-4"><TypeBadge type={list.processingType} /></td>
                      <td className="px-5 py-4 text-right text-sm font-semibold text-gray-900">{list.tamanoHubspot.toLocaleString('es-ES')}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">{list.sincronizadoAt ? list.sincronizadoAt.toLocaleString('es-ES') : 'Pendiente'}</td>
                      <td className="px-5 py-4 text-right"><Link href={`/admin/crm/listas/${list.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800">Ver detalle <ArrowRightIcon className="h-4 w-4" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginación">
          {page > 1 ? <Link href={`?${queryString(params, page - 1)}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700">Anterior</Link> : <span />}
          <span className="text-gray-600">Página {page} de {totalPages} · {total} resultados</span>
          {page < totalPages ? <Link href={`?${queryString(params, page + 1)}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700">Siguiente</Link> : <span />}
        </nav>
      )}

      {lastSync && <p className="text-xs text-gray-500">Última ejecución: {lastSync.iniciadoAt.toLocaleString('es-ES')} · {lastSync.estado.replaceAll('_', ' ').toLowerCase()}.</p>}
    </main>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>
}

function Kpi({ label, value, icon, tone = 'gray' }: { label: string; value: number; icon: React.ReactNode; tone?: 'gray' | 'blue' | 'amber' }) {
  const styles = tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-700'
  return <div className={`rounded-xl border p-4 ${styles}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">{icon}{label}</div><p className="mt-2 text-2xl font-bold text-gray-900">{value.toLocaleString('es-ES')}</p></div>
}

function TypeBadge({ type }: { type: string }) {
  const dynamic = type === 'DYNAMIC'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${dynamic ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{TYPE_LABELS[type] || type}</span>
}

function ListCard({ list }: { list: any }) {
  return (
    <article className={`p-4 ${list.proposito === 'SUPRESION' ? 'bg-amber-50/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="break-words font-semibold text-gray-900">{list.nombre}</p><p className="mt-1 text-xs text-gray-500">HubSpot #{list.hubspotId}</p></div>
        <TypeBadge type={list.processingType} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-gray-500">Área</p><p className="font-medium text-gray-800">{list.segmentoCrm ? SEGMENT_LABELS[list.segmentoCrm] : 'Sin asignar'}</p></div><div><p className="text-xs text-gray-500">Miembros</p><p className="font-semibold text-gray-900">{list.tamanoHubspot.toLocaleString('es-ES')}</p></div></div>
      <Link href={`/admin/crm/listas/${list.id}`} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-orange-700">Ver criterios y miembros <ArrowRightIcon className="h-4 w-4" /></Link>
    </article>
  )
}
