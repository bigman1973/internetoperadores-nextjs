import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
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
import CrmNegociosSyncPanel from '@/components/admin/CrmNegociosSyncPanel'
import CrmHubspotMigrationSection from '@/components/admin/CrmHubspotMigrationSection'
import CrmBusinessUnitQuickEditor from '@/components/admin/CrmBusinessUnitQuickEditor'
import {
  CRM_BUSINESS_UNIT_NONE,
  CRM_BUSINESS_UNIT_PROPERTY,
  getCrmBusinessUnitOptions,
} from '@/lib/crm-unidades-negocio'

export const dynamic = 'force-dynamic'

type SearchParams = {
  search?: string
  status?: string
  segment?: string
  unit?: string
  list?: string
  pipeline?: string
  stage?: string
  dealStatus?: string
  deal?: string
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

function filterQueryString(params: SearchParams, unit?: string) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== 'page' && key !== 'unit') query.set(key, value)
  })
  if (unit) query.set('unit', unit)
  return query.toString()
}

export default async function CrmContactosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminAreaRead('admin.crm.contactos', ['MARKETING', 'VENTAS'])
  await registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm')

  const params = await searchParams
  const page = Math.max(1, Number(params.page || 1) || 1)
  const pageSize = 40
  const businessUnitDefinition = await prisma.crmPropiedadHubspot.findUnique({
    where: { objectTypeId_nombre: { objectTypeId: '0-1', nombre: CRM_BUSINESS_UNIT_PROPERTY } },
    select: { opciones: true, soloLectura: true, calculada: true, oculta: true },
  })
  const businessUnitOptions = getCrmBusinessUnitOptions(businessUnitDefinition?.opciones)
  const businessUnitEditable = Boolean(businessUnitDefinition && !businessUnitDefinition.soloLectura && !businessUnitDefinition.calculada && !businessUnitDefinition.oculta)
  const visibleContactScope = {
    OR: [
      { listas: { some: { activo: true, lista: { activo: true } } } },
      { negocios: { some: { negocio: { activo: true } } } },
    ],
  }
  const andFilters: any[] = [visibleContactScope]
  const where: any = {
    objectTypeId: '0-1',
    AND: andFilters,
  }

  if (params.search?.trim()) {
    const search = params.search.trim()
    andFilters.push({
      OR: [
        { nombre: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
        { empresa: { contains: search, mode: 'insensitive' } },
      ],
    })
  }
  if (params.status === 'lead') where.clienteWebId = null
  if (params.status === 'cliente') where.clienteWebId = { not: null }
  if (['PARTICULAR', 'EMPRESA', 'PARTNER'].includes(params.segment || '')) {
    andFilters.push({
      OR: [
        { clienteWebId: null, segmentoCrm: params.segment },
        { clienteWeb: { segmentoCrm: params.segment } },
      ],
    })
  }
  if (params.unit === CRM_BUSINESS_UNIT_NONE) where.unidadesNegocio = { isEmpty: true }
  else if (params.unit) where.unidadesNegocio = { has: params.unit }
  if (params.list) where.listas = { some: { activo: true, listaId: params.list, lista: { activo: true } } }

  const dealWhere: any = { activo: true }
  if (params.pipeline) dealWhere.pipelineHubspotId = params.pipeline
  if (params.stage) dealWhere.etapaClave = params.stage
  if (params.deal?.trim()) dealWhere.nombre = { contains: params.deal.trim(), mode: 'insensitive' }
  if (params.dealStatus === 'open') dealWhere.cerrado = false
  if (params.dealStatus === 'won') Object.assign(dealWhere, { cerrado: true, ganado: true })
  if (params.dealStatus === 'lost') Object.assign(dealWhere, { cerrado: true, ganado: false })
  const hasPositiveDealFilter = Boolean(params.pipeline || params.stage || params.deal?.trim() || ['open', 'won', 'lost'].includes(params.dealStatus || ''))
  if (hasPositiveDealFilter) where.negocios = { some: { negocio: dealWhere } }
  if (params.dealStatus === 'without-open') {
    const openDealWhere = { ...dealWhere, cerrado: false }
    delete openDealWhere.ganado
    where.negocios = { none: { negocio: openDealWhere } }
  }
  const displayedDealWhere = hasPositiveDealFilter ? dealWhere : { activo: true }

  const [contacts, total, totalContacts, customers, withoutEmail, lists, ambiguous, fullContacts, failedContacts, unitCounts, withoutBusinessUnit, pipelines, contactsWithOpenDeals] = await Promise.all([
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
        negocios: {
          where: { negocio: displayedDealWhere },
          include: {
            negocio: {
              include: {
                pipeline: { select: { hubspotId: true, nombre: true } },
                etapa: { select: { clave: true, nombre: true } },
              },
            },
          },
          orderBy: [{ negocio: { cerrado: 'asc' } }, { negocio: { hubspotActualizadoAt: 'desc' } }],
          take: 4,
        },
        _count: {
          select: {
            listas: { where: { activo: true, lista: { activo: true } } },
            negocios: { where: { negocio: displayedDealWhere } },
          },
        },
      },
      orderBy: [{ nombre: 'asc' }, { email: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmRegistroHubspot.count({ where }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', ...visibleContactScope } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', clienteWebId: { not: null }, ...visibleContactScope } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', email: null, ...visibleContactScope } }),
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
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', propiedadesCompletasAt: { not: null }, ...visibleContactScope } }),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', propiedadesCompletasError: { not: null }, ...visibleContactScope } }),
    prisma.$queryRaw<Array<{ unidad: string; total: bigint }>>`
      SELECT unidad, COUNT(DISTINCT contacto.id)::bigint AS total
      FROM crm_registros_hubspot contacto
      CROSS JOIN LATERAL unnest(contacto.unidades_negocio) AS unidad
      WHERE contacto.object_type_id = '0-1'
        AND (
          EXISTS (
            SELECT 1
            FROM crm_lista_miembros miembro
            JOIN crm_listas lista ON lista.id = miembro.lista_id
            WHERE miembro.registro_id = contacto.id AND miembro.activo = true AND lista.activo = true
          )
          OR EXISTS (
            SELECT 1
            FROM crm_negocio_contactos relacion
            JOIN crm_negocios_hubspot negocio ON negocio.hubspot_id = relacion.negocio_hubspot_id
            WHERE relacion.contacto_id = contacto.id AND negocio.activo = true
          )
        )
      GROUP BY unidad
    `,
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', unidadesNegocio: { isEmpty: true }, ...visibleContactScope } }),
    prisma.crmPipelineHubspot.findMany({
      where: { negocios: { some: { activo: true } } },
      include: { etapas: { where: { negocios: { some: { activo: true } } }, orderBy: [{ displayOrder: 'asc' }, { nombre: 'asc' }] } },
      orderBy: [{ displayOrder: 'asc' }, { nombre: 'asc' }],
    }),
    prisma.crmRegistroHubspot.count({
      where: { objectTypeId: '0-1', negocios: { some: { negocio: { activo: true, cerrado: false } } } },
    }),
  ])

  const leads = totalContacts - customers
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const unitCountMap = new Map(unitCounts.map((row) => [row.unidad, Number(row.total)]))
  const stageOptions = params.pipeline
    ? pipelines.find((pipeline) => pipeline.hubspotId === params.pipeline)?.etapas || []
    : pipelines.flatMap((pipeline) => pipeline.etapas.map((stage) => ({ ...stage, pipelineNombre: pipeline.nombre })))

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
            Directorio corporativo unificado de leads y clientes. Cuando un correo coincide con un cliente que ha comprado, el contacto pasa automáticamente a cliente sin perder sus listas, negocios ni información histórica.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Contactos" value={totalContacts} icon={<UserGroupIcon className="h-5 w-5" />} />
        <Kpi label="Leads" value={leads} icon={<UserPlusIcon className="h-5 w-5" />} tone="blue" />
        <Kpi label="Ya son clientes" value={customers} icon={<CheckBadgeIcon className="h-5 w-5" />} tone="green" />
        <Kpi label="Con negocio abierto" value={contactsWithOpenDeals} icon={<BriefcaseIcon className="h-5 w-5" />} tone="orange" />
        <Kpi label="Sin correo" value={withoutEmail} icon={<MagnifyingGlassIcon className="h-5 w-5" />} tone="amber" />
        <Kpi label="Correo duplicado" value={Number(ambiguous[0]?.total || 0)} icon={<ExclamationTriangleIcon className="h-5 w-5" />} tone="amber" />
      </section>

      <CrmHubspotMigrationSection description="Importación final de fichas, pipelines y negocios. El directorio y su edición diaria ya funcionan dentro del panel.">
        <CrmContactosDataSyncPanel total={totalContacts} initialCompleted={fullContacts} initialFailed={failedContacts} />
        <CrmNegociosSyncPanel />
      </CrmHubspotMigrationSection>

      <section className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <BuildingOffice2Icon className="mt-0.5 h-6 w-6 shrink-0 text-orange-700" />
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">Directorio corporativo del Grupo LFGD</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-gray-600">
              Desde Internet Operadores se mantiene acceso al directorio completo. La unidad de negocio sirve para filtrar y ordenar, nunca para ocultar contactos. Como la selección es múltiple, una misma persona puede aparecer en varias unidades.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`?${filterQueryString(params)}`} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${!params.unit ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:border-orange-400'}`}>Todas · {totalContacts.toLocaleString('es-ES')}</Link>
          {businessUnitOptions.map((unit) => (
            <Link key={unit.value} href={`?${filterQueryString(params, unit.value)}`} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${params.unit === unit.value ? 'bg-orange-600 text-white' : 'border border-orange-200 bg-white text-orange-900 hover:border-orange-400'}`}>
              {unit.label} · {(unitCountMap.get(unit.value) || 0).toLocaleString('es-ES')}
            </Link>
          ))}
          <Link href={`?${filterQueryString(params, CRM_BUSINESS_UNIT_NONE)}`} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${params.unit === CRM_BUSINESS_UNIT_NONE ? 'bg-amber-600 text-white' : 'border border-amber-200 bg-white text-amber-900 hover:border-amber-400'}`}>Sin unidad · {withoutBusinessUnit.toLocaleString('es-ES')}</Link>
        </div>
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <strong>Conversión automática:</strong> la sincronización de clientes de ISPGestión y las altas manuales del panel comprueban el correo. La conversión no crea duplicados y conserva todas las pertenencias a listas. Si el mismo correo corresponde a varios clientes, el contacto sigue como lead para evitar una asociación equivocada.
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <form method="get" className="border-b border-gray-200">
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-12">
            <FilterField label="Buscar contacto" className="sm:col-span-2 xl:col-span-4">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input name="search" defaultValue={params.search} placeholder="Nombre, correo, teléfono o empresa…" className="min-h-11 w-full rounded-lg border-gray-300 pl-10 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
              </div>
            </FilterField>
            <FilterField label="Estado" className="xl:col-span-2">
              <select name="status" defaultValue={params.status || ''} className="min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                <option value="">Leads y clientes</option>
                <option value="lead">Solo leads</option>
                <option value="cliente">Solo clientes</option>
              </select>
            </FilterField>
            <FilterField label="Área CRM" className="xl:col-span-2">
              <select name="segment" defaultValue={params.segment || ''} className="min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                <option value="">Todas las áreas</option>
                <option value="PARTICULAR">Particulares</option>
                <option value="EMPRESA">Empresas</option>
                <option value="PARTNER">Partners</option>
              </select>
            </FilterField>
            <FilterField label="Unidad de negocio" className="xl:col-span-2">
              <select name="unit" defaultValue={params.unit || ''} className="min-h-11 w-full min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                <option value="">Todas las unidades</option>
                {businessUnitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                <option value={CRM_BUSINESS_UNIT_NONE}>Sin unidad asignada</option>
              </select>
            </FilterField>
            <FilterField label="Lista" className="xl:col-span-2">
              <select name="list" defaultValue={params.list || ''} className="min-h-11 w-full min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                <option value="">Todas las listas</option>
                {lists.map((list) => <option key={list.id} value={list.id}>{list.nombre}</option>)}
              </select>
            </FilterField>
          </div>

          <div className="border-t border-gray-100 bg-orange-50/40 p-4">
            <div className="mb-3 flex items-start gap-2">
              <BriefcaseIcon className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Negocio y pipeline</h2>
                <p className="mt-0.5 text-xs leading-5 text-gray-600">Combina estos filtros con la unidad de negocio para saber qué oportunidad concreta está abierta, en qué pipeline y en qué etapa.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
              <FilterField label="Negocio" className="xl:col-span-3">
                <input name="deal" defaultValue={params.deal} placeholder="Buscar por nombre del negocio…" className="min-h-11 w-full rounded-lg border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
              </FilterField>
              <FilterField label="Pipeline" className="xl:col-span-3">
                <select name="pipeline" defaultValue={params.pipeline || ''} className="min-h-11 w-full min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                  <option value="">Todos los pipelines</option>
                  {pipelines.map((pipeline) => <option key={pipeline.hubspotId} value={pipeline.hubspotId}>{pipeline.nombre}</option>)}
                </select>
              </FilterField>
              <FilterField label="Etapa" className="xl:col-span-3">
                <select name="stage" defaultValue={params.stage || ''} className="min-h-11 w-full min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                  <option value="">Todas las etapas</option>
                  {stageOptions.map((stage: any) => <option key={stage.clave} value={stage.clave}>{stage.pipelineNombre ? `${stage.pipelineNombre} · ` : ''}{stage.nombre}</option>)}
                </select>
              </FilterField>
              <FilterField label="Situación" className="xl:col-span-2">
                <select name="dealStatus" defaultValue={params.dealStatus || ''} className="min-h-11 w-full min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                  <option value="">Con o sin negocio</option>
                  <option value="open">Con negocio abierto</option>
                  <option value="without-open">{params.pipeline || params.stage || params.deal?.trim() ? 'Sin negocio abierto que coincida' : 'Sin ningún negocio abierto'}</option>
                  <option value="won">Con negocio ganado</option>
                  <option value="lost">Con negocio perdido</option>
                </select>
              </FilterField>
              <div className="flex items-end xl:col-span-1">
                <button className="min-h-11 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Aplicar</button>
              </div>
            </div>
          </div>
        </form>

        {contacts.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No hay contactos con estos filtros</h2>
            <p className="mt-2 text-sm text-gray-500">Prueba otra búsqueda, unidad, lista, pipeline, etapa o situación del negocio.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 lg:hidden">
              {contacts.map((contact) => <ContactCard key={contact.id} contact={contact} businessUnitOptions={businessUnitOptions} businessUnitEditable={businessUnitEditable} dealsFiltered={hasPositiveDealFilter} />)}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr><Th>Contacto</Th><Th>Empresa</Th><Th>Unidad de negocio · editable</Th><Th>Negocios</Th><Th>Estado</Th><Th>Listas</Th><Th>Actualización</Th><Th><span className="sr-only">Abrir</span></Th></tr></thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td className="px-5 py-4"><p className="font-semibold text-gray-900">{contact.nombre || contact.email || `Contacto #${contact.hubspotId}`}</p><p className="mt-1 text-sm text-gray-500">{contact.email || contact.telefono || 'Sin correo ni teléfono'}</p></td>
                      <td className="px-5 py-4 text-sm text-gray-700">{contact.empresa || '—'}</td>
                      <td className="px-5 py-4"><CrmBusinessUnitQuickEditor contactId={contact.id} initialUnits={contact.unidadesNegocio} options={businessUnitOptions} editable={businessUnitEditable} version={contact.datosVersion} sourceSyncedAt={contact.sincronizadoAt?.toISOString() || null} /></td>
                      <td className="px-5 py-4"><DealSummary contact={contact} filtered={hasPositiveDealFilter} /></td>
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

function FilterField({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`min-w-0 text-xs font-semibold text-gray-600 ${className}`}><span className="mb-1.5 block">{label}</span>{children}</label>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>
}

function Kpi({ label, value, icon, tone = 'gray' }: { label: string; value: number; icon: React.ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' | 'orange' }) {
  const styles = tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : tone === 'green' ? 'border-green-200 bg-green-50 text-green-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'orange' ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-gray-200 bg-white text-gray-700'
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

function DealSummary({ contact, filtered = false }: { contact: any; filtered?: boolean }) {
  if (contact._count.negocios === 0) return <span className="text-xs text-gray-400">Sin negocio asociado</span>
  const displayed = contact.negocios.slice(0, 2)
  return (
    <div className="max-w-xs">
      <div className="space-y-1.5">
        {displayed.map(({ negocio }: any) => (
          <div key={negocio.hubspotId} className="min-w-0" title={`${negocio.pipeline.nombre} · ${negocio.etapa.nombre}`}>
            <p className="max-w-52 truncate text-xs font-semibold text-gray-900">{negocio.nombre}</p>
            <p className={`max-w-52 truncate text-[11px] font-medium ${negocio.cerrado ? (negocio.ganado ? 'text-green-700' : 'text-gray-500') : 'text-orange-700'}`}>
              {negocio.cerrado ? (negocio.ganado ? 'Ganado' : 'Cerrado') : 'Abierto'} · {negocio.pipeline.nombre} · {negocio.etapa.nombre}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-500">{contact._count.negocios.toLocaleString('es-ES')} {filtered ? (contact._count.negocios === 1 ? 'coincidencia' : 'coincidencias') : (contact._count.negocios === 1 ? 'negocio' : 'negocios')}</p>
    </div>
  )
}

function ContactCard({ contact, businessUnitOptions, businessUnitEditable, dealsFiltered = false }: { contact: any; businessUnitOptions: Array<{ value: string; label: string }>; businessUnitEditable: boolean; dealsFiltered?: boolean }) {
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-gray-900">{contact.nombre || contact.email || `Contacto #${contact.hubspotId}`}</p><p className="mt-1 break-all text-sm text-gray-500">{contact.email || contact.telefono || 'Sin correo ni teléfono'}</p></div><ContactStatus contact={contact} /></div>{contact.empresa && <p className="mt-3 text-sm text-gray-600">{contact.empresa}</p>}<div className="mt-3"><p className="mb-1 text-xs text-gray-500">Unidad de negocio</p><CrmBusinessUnitQuickEditor contactId={contact.id} initialUnits={contact.unidadesNegocio} options={businessUnitOptions} editable={businessUnitEditable} version={contact.datosVersion} sourceSyncedAt={contact.sincronizadoAt?.toISOString() || null} /></div><div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Negocios</p><DealSummary contact={contact} filtered={dealsFiltered} /></div><div className="mt-3 flex items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs text-gray-500">Pertenece a</p><p className="truncate text-sm font-medium text-gray-800">{contact._count.listas.toLocaleString('es-ES')} {contact._count.listas === 1 ? 'lista' : 'listas'}</p></div><Link href={`/admin/crm/contactos/${contact.id}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-orange-700">Ver ficha <ArrowRightIcon className="h-4 w-4" /></Link></div></article>
}
