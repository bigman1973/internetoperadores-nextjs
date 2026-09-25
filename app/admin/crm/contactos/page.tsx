import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import prisma from '@/lib/prisma'
import CrmContactosDataSyncPanel from '@/components/admin/CrmContactosDataSyncPanel'

export const dynamic = 'force-dynamic'

type SearchParams = {
  search?: string
  status?: string
  segment?: string
  list?: string
  page?: string
}

const SEGMENT_LABELS: Record<string, string> = {
  PARTICULAR: 'Particular',
  EMPRESA: 'Empresa',
  PARTNER: 'Partner',
}

function queryString(params: SearchParams, page: number) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== 'page') query.set(key, value)
  })
  query.set('page', String(page))
  return query.toString()
}

export default async function CrmContactosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminAreaRead('admin.crm.contactos', ['MARKETING', 'VENTAS'])
  await registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm')

  const params = await searchParams
  const page = Math.max(1, Number(params.page || 1) || 1)
  const pageSize = 40
  const where: any = {
    objectTypeId: '0-1',
    listas: { some: { activo: true, lista: { activo: true } } },
  }

  if (params.search?.trim()) {
    const search = params.search.trim()
    where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { telefono: { contains: search, mode: 'insensitive' } },
      { empresa: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (params.status === 'lead') where.clienteWebId = null
  if (params.status === 'cliente') where.clienteWebId = { not: null }
  if (['PARTICULAR', 'EMPRESA', 'PARTNER'].includes(params.segment || '')) {
    where.AND = [
      {
        OR: [
          { clienteWebId: null, segmentoCrm: params.segment },
          { clienteWeb: { segmentoCrm: params.segment } },
        ],
      },
    ]
  }
  if (params.list) where.listas = { some: { activo: true, listaId: params.list, lista: { activo: true } } }

  const [contacts, total, totalContacts, customers, withoutEmail, lists, ambiguous, fullContacts, failedContacts] = await Promise.all([
    prisma.crmRegistroHubspot.findMany({
      where,
      include: {
        clienteWeb: { select: { id: true, nombre: true, segmentoCrm: true, activo: true } },
        listas: {
          where: { activo: true, lista: { activo: true } },
          include: { lista: { select: { id: true, nombre: true, processingType: true, proposito: true } } },
          orderBy: { incorporadoAt: 'desc' },
          take: 4,
        },
        _count: { select: { listas: { where: { activo: true, lista: { activo: true } } } } },
      },
      orderBy: [{ nombre: 'asc' }, { email: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmRegistroHubspot.count({ where }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', listas: { some: { activo: true, lista: { activo: true } } } } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', clienteWebId: { not: null }, listas: { some: { activo: true, lista: { activo: true } } } } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', email: null, listas: { some: { activo: true, lista: { activo: true } } } } }),
    prisma.crmLista.findMany({ where: { activo: true, objectTypeId: '0-1' }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.$queryRaw<Array<{ total: bigint }>>`
      WITH emails_duplicados AS (
        SELECT LOWER(TRIM(email)) AS email_normalizado
        FROM clientes_web
        WHERE email IS NOT NULL
          AND TRIM(email) <> ''
          AND LOWER(TRIM(email)) NOT LIKE '%@placeholder.local'
        GROUP BY LOWER(TRIM(email))
        HAVING COUNT(*) > 1
      )
      SELECT COUNT(*)::bigint AS total
      FROM crm_registros_hubspot contacto
      JOIN emails_duplicados duplicado ON duplicado.email_normalizado = LOWER(TRIM(contacto.email))
      WHERE contacto.object_type_id = '0-1'
    `,
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', propiedadesCompletasAt: { not: null }, listas: { some: { activo: true, lista: { activo: true } } } } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', propiedadesCompletasError: { not: null }, listas: { some: { activo: true, lista: { activo: true } } } } }),
  ])

  const leads = totalContacts - customers
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <main className="space-y-6 px-1 py-1 sm:px-2">
      <header className="space-y-4">
        <Link href="/admin/crm" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al CRM
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <UserGroupIcon className="h-8 w-8 text-orange-600" />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Contactos</h1>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">CRM operativo</span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
            Todos los contactos importados de HubSpot empiezan como leads. Cuando su correo coincide con un cliente que ha comprado, pasan automáticamente a cliente sin perder ninguna de sus listas.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Contactos" value={totalContacts} icon={<UserGroupIcon className="h-5 w-5" />} />
        <Kpi label="Leads" value={leads} icon={<UserPlusIcon className="h-5 w-5" />} tone="blue" />
        <Kpi label="Ya son clientes" value={customers} icon={<CheckBadgeIcon className="h-5 w-5" />} tone="green" />
        <Kpi label="Sin correo" value={withoutEmail} icon={<MagnifyingGlassIcon className="h-5 w-5" />} tone="amber" />
        <Kpi label="Correo duplicado" value={Number(ambiguous[0]?.total || 0)} icon={<ExclamationTriangleIcon className="h-5 w-5" />} tone="amber" />
      </section>

      <CrmContactosDataSyncPanel total={totalContacts} initialCompleted={fullContacts} initialFailed={failedContacts} />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <strong>Conversión automática:</strong> la sincronización de clientes de ISPGestión y las altas manuales del panel comprueban el correo. La conversión no crea duplicados, no modifica HubSpot y conserva todas las pertenencias a listas. Si el mismo correo corresponde a varios clientes, el contacto sigue como lead para evitar una asociación equivocada.
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <form method="get" className="grid gap-3 border-b border-gray-200 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative sm:col-span-2">
            <span className="sr-only">Buscar contactos</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input name="search" defaultValue={params.search} placeholder="Nombre, correo, teléfono o empresa…" className="min-h-11 w-full rounded-lg border-gray-300 pl-10 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
          </label>
          <select name="status" defaultValue={params.status || ''} aria-label="Estado comercial" className="min-h-11 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Leads y clientes</option>
            <option value="lead">Solo leads</option>
            <option value="cliente">Solo clientes</option>
          </select>
          <select name="segment" defaultValue={params.segment || ''} aria-label="Área CRM" className="min-h-11 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todas las áreas</option>
            <option value="PARTICULAR">Particulares</option>
            <option value="EMPRESA">Empresas</option>
            <option value="PARTNER">Partners</option>
          </select>
          <select name="list" defaultValue={params.list || ''} aria-label="Lista de pertenencia" className="min-h-11 min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
            <option value="">Todas las listas</option>
            {lists.map((list) => <option key={list.id} value={list.id}>{list.nombre}</option>)}
          </select>
          <button className="min-h-11 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Aplicar filtros</button>
        </form>

        {contacts.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No hay contactos con estos filtros</h2>
            <p className="mt-2 text-sm text-gray-500">Prueba otra búsqueda, estado o lista.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 lg:hidden">
              {contacts.map((contact) => <ContactCard key={contact.id} contact={contact} />)}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr><Th>Contacto</Th><Th>Empresa</Th><Th>Estado</Th><Th>Listas</Th><Th>Actualización</Th><Th><span className="sr-only">Abrir</span></Th></tr></thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td className="px-5 py-4"><p className="font-semibold text-gray-900">{contact.nombre || contact.email || `Contacto #${contact.hubspotId}`}</p><p className="mt-1 text-sm text-gray-500">{contact.email || contact.telefono || 'Sin correo ni teléfono'}</p></td>
                      <td className="px-5 py-4 text-sm text-gray-700">{contact.empresa || '—'}</td>
                      <td className="px-5 py-4"><ContactStatus contact={contact} /></td>
                      <td className="px-5 py-4"><ListSummary contact={contact} /></td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">{contact.sincronizadoAt?.toLocaleDateString('es-ES') || 'Pendiente'}</td>
                      <td className="px-5 py-4 text-right"><Link href={`/admin/crm/contactos/${contact.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800">Ver ficha <ArrowRightIcon className="h-4 w-4" /></Link></td>
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
          <span className="text-center text-gray-600">Página {page} de {totalPages} · {total.toLocaleString('es-ES')} resultados</span>
          {page < totalPages ? <Link href={`?${queryString(params, page + 1)}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700">Siguiente</Link> : <span />}
        </nav>
      )}
    </main>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>
}

function Kpi({ label, value, icon, tone = 'gray' }: { label: string; value: number; icon: React.ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' }) {
  const styles = tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : tone === 'green' ? 'border-green-200 bg-green-50 text-green-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-700'
  return <div className={`rounded-xl border p-4 ${styles}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">{icon}{label}</div><p className="mt-2 text-2xl font-bold text-gray-900">{value.toLocaleString('es-ES')}</p></div>
}

function ContactStatus({ contact }: { contact: any }) {
  if (contact.clienteWebId) {
    const segment = contact.clienteWeb?.segmentoCrm || contact.segmentoCrm
    return <div><span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">Cliente</span>{segment && <p className="mt-1 text-xs font-medium text-gray-500">{SEGMENT_LABELS[segment] || segment}</p>}</div>
  }
  return <div><span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">Lead</span><p className="mt-1 text-xs text-gray-500">{contact.segmentoCrm ? SEGMENT_LABELS[contact.segmentoCrm] : 'Por clasificar'}</p></div>
}

function ListSummary({ contact }: { contact: any }) {
  return <div className="max-w-xs"><div className="flex flex-wrap gap-1">{contact.listas.slice(0, 2).map((membership: any) => <span key={membership.id} className="max-w-40 truncate rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700" title={membership.lista.nombre}>{membership.lista.nombre}</span>)}</div><p className="mt-1 text-xs text-gray-500">{contact._count.listas.toLocaleString('es-ES')} {contact._count.listas === 1 ? 'lista' : 'listas'}</p></div>
}

function ContactCard({ contact }: { contact: any }) {
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-gray-900">{contact.nombre || contact.email || `Contacto #${contact.hubspotId}`}</p><p className="mt-1 break-all text-sm text-gray-500">{contact.email || contact.telefono || 'Sin correo ni teléfono'}</p></div><ContactStatus contact={contact} /></div>{contact.empresa && <p className="mt-3 text-sm text-gray-600">{contact.empresa}</p>}<div className="mt-3 flex items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs text-gray-500">Pertenece a</p><p className="truncate text-sm font-medium text-gray-800">{contact._count.listas.toLocaleString('es-ES')} {contact._count.listas === 1 ? 'lista' : 'listas'}</p></div><Link href={`/admin/crm/contactos/${contact.id}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-orange-700">Ver ficha <ArrowRightIcon className="h-4 w-4" /></Link></div></article>
}
