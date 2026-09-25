import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeftIcon,
  BoltIcon,
  CalendarDaysIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import prisma from '@/lib/prisma'
import CrmListaSettings from '@/components/admin/CrmListaSettings'

export const dynamic = 'force-dynamic'

type SearchParams = { search?: string; page?: string }

const PROPERTY_LABELS: Record<string, string> = {
  email: 'Correo electrónico',
  firstname: 'Nombre',
  lastname: 'Apellidos',
  phone: 'Teléfono',
  mobilephone: 'Móvil',
  company: 'Empresa',
  lifecyclestage: 'Fase del ciclo de vida',
  hs_marketable_status: 'Estado de marketing',
}

const OPERATOR_LABELS: Record<string, string> = {
  EQ: 'es igual a',
  IS_EQUAL_TO: 'es igual a',
  NEQ: 'no es igual a',
  IS_NOT_EQUAL_TO: 'no es igual a',
  IN: 'está entre',
  NOT_IN: 'no está entre',
  IS_KNOWN: 'tiene valor',
  IS_UNKNOWN: 'no tiene valor',
  NOT_HAS_PROPERTY: 'no tiene valor',
  IS_ANY_OF: 'es uno de',
  CONTAINS: 'contiene',
  CONTAINS_TOKEN: 'contiene',
  DOES_NOT_CONTAIN_TOKEN: 'no contiene',
  GT: 'es mayor que',
  GTE: 'es mayor o igual que',
  IS_GREATER_THAN_OR_EQUAL_TO: 'es mayor o igual que',
  LT: 'es menor que',
  LTE: 'es menor o igual que',
  BETWEEN: 'está entre',
}

function formatValue(value?: string) {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.join(', ')
    if (typeof parsed === 'object') return 'según periodo configurado en HubSpot'
  } catch {}
  return value
}

export default async function CrmListaDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireAdminAreaRead('admin.crm.listas', ['MARKETING', 'VENTAS'])
  await registrarArea('admin.crm.listas', 'CRM > Listas', 'admin.crm')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const page = Math.max(1, Number(query.page || 1) || 1)
  const pageSize = 50

  const list = await prisma.crmLista.findUnique({ where: { id } })
  if (!list) notFound()

  const memberWhere: any = { listaId: id, activo: true }
  if (query.search) {
    memberWhere.registro = {
      OR: [
        { nombre: { contains: query.search.trim(), mode: 'insensitive' } },
        { email: { contains: query.search.trim(), mode: 'insensitive' } },
        { empresa: { contains: query.search.trim(), mode: 'insensitive' } },
      ],
    }
  }

  const [members, totalMembers] = await Promise.all([
    prisma.crmListaMiembro.findMany({
      where: memberWhere,
      include: { registro: true },
      orderBy: [{ registro: { nombre: 'asc' } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmListaMiembro.count({ where: memberWhere }),
  ])

  const criteria = Array.isArray(list.criteriosResumen) ? list.criteriosResumen as Array<{ group?: string; property?: string; operator?: string; value?: string }> : []
  const totalPages = Math.max(1, Math.ceil(totalMembers / pageSize))
  const active = list.processingType === 'DYNAMIC'
  const objectLabel = list.objectTypeId === '0-1' ? 'Contactos' : list.objectTypeId === '0-2' ? 'Empresas' : list.objectTypeId === '0-3' ? 'Oportunidades' : list.objectTypeId

  return (
    <main className="space-y-6 px-1 py-1 sm:px-2">
      <Link href="/admin/crm/listas" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700"><ArrowLeftIcon className="h-4 w-4" />Volver a listas</Link>

      <header className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <CircleStackIcon className="h-8 w-8 text-orange-600" />
              <h1 className="break-words text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{list.nombre}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{active ? 'Activa' : list.processingType === 'SNAPSHOT' ? 'Instantánea' : 'Estática'}</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">HubSpot #{list.hubspotId} · {objectLabel}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-left lg:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Miembros en la última copia</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{list.tamanoHubspot.toLocaleString('es-ES')}</p>
          </div>
        </div>
      </header>

      {active ? (
        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <BoltIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p><strong>Lista activa.</strong> HubSpot recalcula sus miembros cuando cambian los datos. Aquí se conserva el criterio original y se muestra la fotografía obtenida el {list.sincronizadoAt?.toLocaleString('es-ES') || 'día de la importación'}.</p>
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
          <FunnelIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p><strong>Lista estática.</strong> Sus miembros solo cambian cuando alguien los añade o elimina expresamente en HubSpot.</p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-medium text-gray-500"><UserGroupIcon className="h-5 w-5" />Objeto</div><p className="mt-2 text-lg font-semibold text-gray-900">{objectLabel}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-medium text-gray-500"><CalendarDaysIcon className="h-5 w-5" />Actualizada en HubSpot</div><p className="mt-2 text-lg font-semibold text-gray-900">{list.hubspotActualizadoAt?.toLocaleString('es-ES') || 'Sin fecha disponible'}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-medium text-gray-500"><CalendarDaysIcon className="h-5 w-5" />Copiada al CRM</div><p className="mt-2 text-lg font-semibold text-gray-900">{list.sincronizadoAt?.toLocaleString('es-ES') || 'Pendiente'}</p></div>
      </section>

      <CrmListaSettings id={list.id} initialSegment={list.segmentoCrm} initialPurpose={list.proposito} initialNotes={list.notasInternas} />

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-5 sm:p-6"><h2 className="text-lg font-semibold text-gray-900">Criterios de pertenencia</h2><p className="mt-1 text-sm text-gray-500">Definición copiada literalmente desde HubSpot y traducida para consulta.</p></div>
        {criteria.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {criteria.map((criterion, index) => (
              <div key={`${criterion.group}-${index}`} className="grid gap-1 px-5 py-4 text-sm sm:grid-cols-[9rem_1fr] sm:px-6">
                <p className="font-medium text-gray-500">{criterion.group || `Condición ${index + 1}`}</p>
                <p className="text-gray-800"><strong>{PROPERTY_LABELS[criterion.property || ''] || criterion.property || 'Propiedad'}</strong> {OPERATOR_LABELS[criterion.operator || ''] || criterion.operator?.toLowerCase().replaceAll('_', ' ') || 'cumple la condición'} {formatValue(criterion.value) && <span className="font-medium text-gray-900">«{formatValue(criterion.value)}»</span>}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-3 px-5 py-8 text-sm text-gray-600 sm:px-6"><ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" /><p>{active ? 'HubSpot no ha devuelto una definición de filtros para esta lista. Revisa la autorización crm.lists.read o vuelve a sincronizar.' : 'Las listas estáticas no necesitan criterios automáticos: sus miembros se administran manualmente.'}</p></div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div><h2 className="text-lg font-semibold text-gray-900">Miembros</h2><p className="mt-1 text-sm text-gray-500">{totalMembers.toLocaleString('es-ES')} registros en la instantánea local.</p></div>
          <form method="get" className="flex w-full gap-2 sm:max-w-md"><input name="search" defaultValue={query.search} placeholder="Nombre, correo o empresa…" className="min-h-11 min-w-0 flex-1 rounded-lg border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" /><button className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white">Buscar</button></form>
        </div>
        {members.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">{query.search ? 'No hay miembros que coincidan con la búsqueda.' : 'Esta lista no tiene miembros en la última sincronización.'}</div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 md:hidden">
              {members.map((member) => <MemberCard key={member.id} member={member} />)}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><Th>Contacto o registro</Th><Th>Empresa</Th><Th>Incorporación</Th><Th>Estado CRM</Th></tr></thead><tbody className="divide-y divide-gray-100">{members.map((member) => <tr key={member.id}><td className="px-5 py-4"><p className="font-semibold text-gray-900">{member.registro.nombre || `Registro #${member.registro.hubspotId}`}</p><p className="mt-1 text-sm text-gray-500">{member.registro.email || member.registro.telefono || 'Sin datos de contacto'}</p></td><td className="px-5 py-4 text-sm text-gray-700">{member.registro.empresa || '—'}</td><td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">{member.incorporadoAt?.toLocaleDateString('es-ES') || 'No disponible'}</td><td className="px-5 py-4 text-sm"><Link href={`/admin/crm/contactos/${member.registro.id}`} className="font-semibold text-orange-700 hover:text-orange-800">{member.registro.clienteWebId ? 'Cliente · ver ficha' : 'Lead · ver ficha'}</Link></td></tr>)}</tbody></table>
            </div>
          </>
        )}
      </section>

      {totalPages > 1 && <nav className="flex items-center justify-between gap-3 text-sm"><span>{page > 1 ? <Link href={`?page=${page - 1}${query.search ? `&search=${encodeURIComponent(query.search)}` : ''}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700">Anterior</Link> : null}</span><span className="text-gray-600">Página {page} de {totalPages}</span><span>{page < totalPages ? <Link href={`?page=${page + 1}${query.search ? `&search=${encodeURIComponent(query.search)}` : ''}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700">Siguiente</Link> : null}</span></nav>}
    </main>
  )
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th> }
function MemberCard({ member }: { member: any }) { return <article className="p-4"><p className="font-semibold text-gray-900">{member.registro.nombre || `Registro #${member.registro.hubspotId}`}</p><p className="mt-1 break-all text-sm text-gray-500">{member.registro.email || member.registro.telefono || 'Sin datos de contacto'}</p><div className="mt-3 flex items-end justify-between gap-3 text-sm"><span className="text-gray-600">{member.registro.empresa || 'Sin empresa'}</span><Link href={`/admin/crm/contactos/${member.registro.id}`} className="font-semibold text-orange-700">{member.registro.clienteWebId ? 'Ver cliente' : 'Ver lead'}</Link></div></article> }
