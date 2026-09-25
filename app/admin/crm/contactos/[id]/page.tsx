import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  CircleStackIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import prisma from '@/lib/prisma'
import CrmContactoSettings from '@/components/admin/CrmContactoSettings'
import CrmContactoDataEditor from '@/components/admin/CrmContactoDataEditor'

export const dynamic = 'force-dynamic'

const SEGMENT_LABELS: Record<string, string> = {
  PARTICULAR: 'Particular',
  EMPRESA: 'Empresa',
  PARTNER: 'Partner',
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

export default async function CrmContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAreaRead('admin.crm.contactos', ['MARKETING', 'VENTAS'])
  await registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm')
  const { id } = await params

  const contact = await prisma.crmRegistroHubspot.findFirst({
    where: { id, objectTypeId: '0-1' },
    include: {
      clienteWeb: true,
      listas: {
        where: { activo: true, lista: { activo: true } },
        include: { lista: true },
        orderBy: [{ lista: { nombre: 'asc' } }],
      },
    },
  })
  if (!contact) notFound()

  const propertyDefinitions = await prisma.crmPropiedadHubspot.findMany({
    where: { objectTypeId: '0-1', oculta: false },
    orderBy: [{ grupoNombre: 'asc' }, { ordenVisual: 'asc' }, { etiqueta: 'asc' }],
  })
  const visiblePropertyNames = new Set(propertyDefinitions.map((property) => property.nombre))

  const matchingCustomers = contact.email
    ? await prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS total
        FROM clientes_web
        WHERE LOWER(TRIM(email)) = LOWER(TRIM(${contact.email}))
      `
    : [{ total: BigInt(0) }]
  const ambiguousMatches = Number(matchingCustomers[0]?.total || 0)

  const segment = contact.clienteWeb?.segmentoCrm || contact.segmentoCrm
  const isCustomer = Boolean(contact.clienteWebId)

  return (
    <main className="space-y-6 px-1 py-1 sm:px-2">
      <Link href="/admin/crm/contactos" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700"><ArrowLeftIcon className="h-4 w-4" />Volver a contactos</Link>

      <header className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <UserIcon className="h-8 w-8 text-orange-600" />
              <h1 className="break-words text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{contact.nombre || contact.email || `Contacto #${contact.hubspotId}`}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isCustomer ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{isCustomer ? 'Cliente' : 'Lead'}</span>
              {segment && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{SEGMENT_LABELS[segment] || segment}</span>}
            </div>
            <p className="mt-2 text-sm text-gray-500">HubSpot #{contact.hubspotId} · {contact.listas.length.toLocaleString('es-ES')} {contact.listas.length === 1 ? 'lista' : 'listas'}</p>
          </div>
          {contact.clienteWebId && <Link href={`/admin/clientes/${contact.clienteWebId}/editar`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">Abrir ficha de cliente <ArrowRightIcon className="h-4 w-4" /></Link>}
        </div>
      </header>

      {isCustomer ? (
        <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900"><CheckBadgeIcon className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Contacto convertido en cliente.</strong> Su correo coincide con una persona o empresa que ya ha comprado. Conserva sus listas y su histórico de origen.</p></div>
      ) : ambiguousMatches > 1 ? (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><UserIcon className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Lead pendiente de revisión.</strong> Este correo aparece en {ambiguousMatches.toLocaleString('es-ES')} clientes distintos. No se ha convertido automáticamente para evitar una asociación equivocada.</p></div>
      ) : (
        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><UserIcon className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Lead.</strong> Todavía no existe una compra asociada a este correo. Pasará automáticamente a cliente cuando aparezca en la cartera del panel.</p></div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Info icon={<EnvelopeIcon className="h-5 w-5" />} label="Correo" value={contact.email || 'No disponible'} breakValue />
        <Info icon={<PhoneIcon className="h-5 w-5" />} label="Teléfono" value={contact.telefono || 'No disponible'} />
        <Info icon={<BuildingOffice2Icon className="h-5 w-5" />} label="Empresa" value={contact.empresa || contact.clienteWeb?.nombreComercial || 'No informada'} />
        <Info icon={<CalendarDaysIcon className="h-5 w-5" />} label={isCustomer ? 'Vínculo con cliente detectado' : 'Actualizado desde HubSpot'} value={(contact.convertidoAt || contact.sincronizadoAt)?.toLocaleString('es-ES') || 'Sin fecha'} />
      </section>

      {contact.clienteWeb && (
        <section className="rounded-xl border border-green-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-green-700">Cliente vinculado</p><h2 className="mt-1 text-xl font-bold text-gray-900">{contact.clienteWeb.nombre}</h2><p className="mt-1 text-sm text-gray-600">{contact.clienteWeb.activo ? 'Cliente activo' : 'Cliente histórico/inactivo'} · {SEGMENT_LABELS[contact.clienteWeb.segmentoCrm]}</p></div>
            <Link href={`/admin/clientes/${contact.clienteWeb.id}/editar`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 text-sm font-semibold text-orange-800 hover:bg-orange-100">Ver datos del cliente <ArrowRightIcon className="h-4 w-4" /></Link>
          </div>
        </section>
      )}

      <CrmContactoDataEditor
        id={contact.id}
        sourceProperties={pickStringRecord(contact.propiedades, visiblePropertyNames)}
        localProperties={pickStringRecord(contact.propiedadesLocales, visiblePropertyNames)}
        definitions={propertyDefinitions.map((property) => ({
          name: property.nombre,
          label: property.etiqueta,
          groupName: property.grupoNombre,
          type: property.tipo,
          fieldType: property.tipoCampo,
          description: property.descripcion,
          options: Array.isArray(property.opciones) ? property.opciones as Array<{ label?: string; value?: string; hidden?: boolean; displayOrder?: number }> : [],
          readOnly: property.soloLectura,
          hidden: property.oculta,
          calculated: property.calculada,
          displayOrder: property.ordenVisual,
        }))}
        initialNotes={contact.notasInternas || ''}
        updatedAt={contact.datosActualizadoAt?.toISOString() || null}
        updatedBy={contact.datosActualizadoPor}
        history={asHistory(contact.historialCambios)}
        fullPropertiesAt={contact.propiedadesCompletasAt?.toISOString() || null}
        syncError={null}
        initialVersion={contact.datosVersion}
      />

      <CrmContactoSettings id={contact.id} initialSegment={contact.segmentoCrm} isCustomer={isCustomer} customerSegment={segment ? SEGMENT_LABELS[segment] || segment : null} />

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-5 sm:p-6"><div className="flex items-center gap-2"><CircleStackIcon className="h-5 w-5 text-orange-600" /><h2 className="text-lg font-semibold text-gray-900">Listas a las que pertenece</h2></div><p className="mt-1 text-sm text-gray-500">La conversión a cliente no elimina ni altera ninguna pertenencia.</p></div>
        {contact.listas.length === 0 ? <div className="p-8 text-sm text-gray-500">No pertenece a ninguna lista activa en la última sincronización.</div> : <div className="divide-y divide-gray-100">{contact.listas.map((membership) => (
          <article key={membership.id} className={`p-5 sm:px-6 ${membership.lista.proposito === 'SUPRESION' ? 'bg-amber-50/40' : ''}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-semibold text-gray-900">{membership.lista.nombre}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>{membership.lista.processingType === 'DYNAMIC' ? 'Activa' : membership.lista.processingType === 'SNAPSHOT' ? 'Instantánea' : 'Estática'}</span><span>{PURPOSE_LABELS[membership.lista.proposito] || membership.lista.proposito}</span><span>Desde {membership.incorporadoAt?.toLocaleDateString('es-ES') || 'fecha no disponible'}</span></div></div><Link href={`/admin/crm/listas/${membership.lista.id}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800">Ver lista <ArrowRightIcon className="h-4 w-4" /></Link></div>
          </article>
        ))}</div>}
      </section>
    </main>
  )
}

function Info({ icon, label, value, breakValue = false }: { icon: React.ReactNode; label: string; value: string; breakValue?: boolean }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-medium text-gray-500">{icon}{label}</div><p className={`mt-2 font-semibold text-gray-900 ${breakValue ? 'break-all' : 'break-words'}`}>{value}</p></div>
}

function asStringRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, field]) => [key, field == null ? null : String(field)]))
}

function pickStringRecord(value: unknown, allowed: Set<string>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(asStringRecord(value)).filter(([key]) => allowed.has(key)))
}

function asHistory(value: unknown): Array<{ fecha?: string; autor?: string; cambios?: Array<{ campo?: string; anterior?: string | null; nuevo?: string | null }> }> {
  return Array.isArray(value) ? value as Array<{ fecha?: string; autor?: string; cambios?: Array<{ campo?: string; anterior?: string | null; nuevo?: string | null }> }> : []
}
