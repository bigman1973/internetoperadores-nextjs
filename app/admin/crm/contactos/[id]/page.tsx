import { notFound } from 'next/navigation'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import prisma from '@/lib/prisma'
import CrmContactoWorkspace from '@/components/admin/CrmContactoWorkspace'
import { CRM_BUSINESS_UNIT_PROPERTY, crmBusinessUnitLabel, getCrmBusinessUnitOptions } from '@/lib/crm-unidades-negocio'
import { getDefaultEmailSender } from '@/lib/email'
import { getOutlookConnectionStatus } from '@/lib/outlook-user-connection'
import {
  formatCrmContactPropertyValue,
  friendlyPropertyLabel,
  getCrmContactInitialPropertyCatalog,
  serializeCrmContactPropertyDefinitions,
} from '@/lib/crm-contact-property-catalog'

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
  const session = await requireAdminAreaRead('admin.crm.contactos', ['MARKETING', 'VENTAS'])
  const { id } = await params
  const [, contact, activities, propertyDefinitions, outlookConnection, matchingCustomers] = await Promise.all([
    registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm'),
    prisma.crmRegistroHubspot.findFirst({
      relationLoadStrategy: 'join',
      where: { id, objectTypeId: '0-1' },
      include: {
        clienteWeb: true,
        listas: {
          where: { activo: true, lista: { activo: true } },
          include: { lista: true },
          orderBy: [{ lista: { nombre: 'asc' } }],
        },
        negocios: {
          where: { negocio: { activo: true } },
          include: {
            negocio: {
              include: {
                pipeline: true,
                etapa: true,
              },
            },
          },
          orderBy: [{ negocio: { cerrado: 'asc' } }, { negocio: { hubspotActualizadoAt: 'desc' } }],
        },
      },
    }),
    prisma.crmActividad.findMany({
      relationLoadStrategy: 'join',
      where: { contactos: { some: { contactoId: id } } },
      include: {
        negocios: { include: { negocio: true } },
        tareaSeguimiento: true,
      },
      orderBy: [{ fechaActividad: 'desc' }, { createdAt: 'desc' }],
    }),
    getCrmContactInitialPropertyCatalog(),
    getOutlookConnectionStatus(Number(session.user.id)),
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total
      FROM clientes_web cliente
      JOIN crm_registros_hubspot contacto
        ON contacto.id = ${id}
       AND cliente.email = contacto.email
    `,
  ])
  if (!contact) notFound()
  const visiblePropertyNames = new Set(propertyDefinitions.map((property) => property.nombre))
  const definitionsByName = new Map(propertyDefinitions.map((property) => [property.nombre, property]))
  const businessUnitDefinition = propertyDefinitions.find((property) => property.nombre === CRM_BUSINESS_UNIT_PROPERTY)
  const businessUnitOptions = getCrmBusinessUnitOptions(businessUnitDefinition?.opciones)
  const sourceProperties = pickStringRecord(contact.propiedades, visiblePropertyNames)
  const localProperties = pickStringRecord(contact.propiedadesLocales, visiblePropertyNames)
  const effectiveProperties = { ...sourceProperties, ...localProperties }

  const ambiguousMatches = Number(matchingCustomers[0]?.total || 0)

  const segment = contact.clienteWeb?.segmentoCrm || contact.segmentoCrm
  const isCustomer = Boolean(contact.clienteWebId)
  const email = effectiveProperties.email || contact.email || ''
  const phone = effectiveProperties.phone || effectiveProperties.mobilephone || contact.telefono || ''
  const linkedIn = effectiveProperties.hs_linkedin_url || ''
  const company = effectiveProperties.company || contact.empresa || contact.clienteWeb?.nombreComercial || ''
  const jobTitle = effectiveProperties.jobtitle || ''
  const website = effectiveProperties.website || ''
  const city = effectiveProperties.city || ''
  const contactName = [effectiveProperties.firstname, effectiveProperties.lastname].filter(Boolean).join(' ').trim() || contact.nombre || email || `Contacto #${contact.hubspotId}`
  const units = contact.unidadesNegocio.map((unit) => crmBusinessUnitLabel(unit, businessUnitOptions))
  const lifecycle = formatCrmContactPropertyValue(effectiveProperties.lifecyclestage, definitionsByName.get('lifecyclestage'))
  const leadStatus = formatCrmContactPropertyValue(effectiveProperties.hs_lead_status, definitionsByName.get('hs_lead_status'))
  const owner = effectiveProperties.hubspot_owner_id ? 'Asignado' : 'Sin asignar'

  const qualityIssues: string[] = []
  if (!email) qualityIssues.push('Falta el correo electrónico.')
  if (!phone) qualityIssues.push('Falta un teléfono de contacto.')
  if (!company) qualityIssues.push('No se ha informado la empresa.')
  if (units.length === 0) qualityIssues.push('Falta asignar la unidad de negocio.')
  if (!effectiveProperties.lifecyclestage) qualityIssues.push('Falta revisar el ciclo de vida comercial.')
  if (ambiguousMatches > 1) qualityIssues.push(`El correo coincide con ${ambiguousMatches.toLocaleString('es-ES')} clientes y requiere revisión manual.`)
  if (contact.propiedadesCompletasError) qualityIssues.push('La última importación de origen no pudo recuperar toda la información del contacto.')

  const statusNotice = isCustomer
    ? { tone: 'green' as const, title: 'Contacto convertido en cliente.', text: 'Su correo coincide con una persona o empresa que ya ha comprado. Conserva sus listas y su histórico de origen.' }
    : ambiguousMatches > 1
      ? { tone: 'amber' as const, title: 'Lead pendiente de revisión.', text: `Este correo aparece en ${ambiguousMatches.toLocaleString('es-ES')} clientes distintos. No se ha convertido automáticamente para evitar una asociación equivocada.` }
      : { tone: 'blue' as const, title: 'Lead.', text: 'Todavía no existe una compra asociada a este correo. Pasará automáticamente a cliente cuando aparezca en la cartera del panel.' }

  const definitions = serializeCrmContactPropertyDefinitions(propertyDefinitions)

  return (
    <CrmContactoWorkspace
      contact={{
        id: contact.id,
        hubspotId: contact.hubspotId,
        name: contactName,
        email: email || 'Sin informar',
        phone: phone || 'Sin informar',
        linkedIn,
        company: company || 'Sin informar',
        jobTitle: jobTitle || 'Sin informar',
        website: website || 'Sin informar',
        city: city || 'Sin informar',
        isCustomer,
        segmentLabel: segment ? SEGMENT_LABELS[segment] || segment : null,
        units,
        lifecycle,
        leadStatus,
        owner,
        createdAt: formatDateTime(contact.hubspotCreadoAt),
        sourceUpdatedAt: formatDateTime(contact.hubspotActualizadoAt || contact.sincronizadoAt),
        fullPropertiesAt: formatDateTime(contact.propiedadesCompletasAt),
        localUpdatedAt: formatDateTime(contact.datosActualizadoAt),
        localUpdatedBy: contact.datosActualizadoPor,
        localChanges: Object.keys(localProperties).length,
        notes: contact.notasInternas || '',
      }}
      statusNotice={statusNotice}
      customer={contact.clienteWeb ? {
        id: contact.clienteWeb.id,
        name: contact.clienteWeb.nombre,
        active: contact.clienteWeb.activo,
        segment: SEGMENT_LABELS[contact.clienteWeb.segmentoCrm] || contact.clienteWeb.segmentoCrm,
      } : null}
      deals={contact.negocios.map(({ negocio }) => ({
        id: negocio.hubspotId,
        hubspotId: negocio.hubspotId,
        name: negocio.nombre,
        pipeline: negocio.pipeline.nombre,
        stage: negocio.etapa.nombre,
        amount: formatDealAmount(negocio.importe, negocio.moneda),
        closeDate: negocio.fechaCierre?.toLocaleDateString('es-ES') || null,
        owner: negocio.propietarioNombre || 'Sin asignar',
        closed: negocio.cerrado,
        won: negocio.ganado,
      }))}
      lists={contact.listas.map((membership) => ({
        id: membership.id,
        listId: membership.lista.id,
        name: membership.lista.nombre,
        kind: membership.lista.processingType === 'DYNAMIC' ? 'Activa' : membership.lista.processingType === 'SNAPSHOT' ? 'Instantánea' : 'Estática',
        purpose: PURPOSE_LABELS[membership.lista.proposito] || membership.lista.proposito,
        suppression: membership.lista.proposito === 'SUPRESION',
        joinedAt: membership.incorporadoAt?.toLocaleDateString('es-ES') || null,
      }))}
      activities={activities.map((activity) => ({
        id: activity.id,
        contactId: contact.id,
        type: activity.tipo,
        title: activity.titulo || (activity.tipo === 'LLAMADA' ? 'Llamada' : 'Actividad'),
        description: activity.descripcion,
        date: formatDateTime(activity.fechaActividad) || 'Fecha no disponible',
        direction: activity.direccion,
        result: activity.resultado,
        durationMinutes: activity.duracionSegundos == null ? null : Math.max(0, Math.round(activity.duracionSegundos / 60)),
        author: activity.creadoPorNombre || 'Usuario no identificado',
        origin: activity.origen,
        metadata: asActivityMetadata(activity.metadatos),
        deals: activity.negocios.map(({ negocio }) => ({ id: negocio.hubspotId, name: negocio.nombre })),
        followUp: activity.tareaSeguimiento ? {
          id: activity.tareaSeguimiento.id,
          title: activity.tareaSeguimiento.titulo,
          dueAt: formatDateTime(activity.tareaSeguimiento.venceAt) || 'Sin fecha',
          state: activity.tareaSeguimiento.estado,
        } : null,
      }))}
      emailSender={getDefaultEmailSender()}
      outlookConnection={outlookConnection}
      qualityIssues={qualityIssues}
      history={asHistory(contact.historialCambios).reverse().map((entry) => ({
        date: entry.fecha ? formatDateTime(new Date(entry.fecha)) : null,
        author: entry.autor || 'Administrador',
        changes: (entry.cambios || []).map((change) => {
          const definition = change.campo ? definitionsByName.get(change.campo) : undefined
          return {
            field: change.campo || 'dato',
            label: change.campo === 'notas_internas' ? 'Notas internas' : friendlyPropertyLabel(change.campo || 'dato', definition?.etiqueta),
            previous: formatCrmContactPropertyValue(change.anterior, definition),
            next: formatCrmContactPropertyValue(change.nuevo, definition),
          }
        }),
      }))}
      dataEditor={{
        id: contact.id,
        sourceProperties,
        localProperties,
        definitions,
        initialNotes: contact.notasInternas || '',
        updatedAt: contact.datosActualizadoAt?.toISOString() || null,
        updatedBy: contact.datosActualizadoPor,
        fullPropertiesAt: contact.propiedadesCompletasAt?.toISOString() || null,
        sourceSyncedAt: contact.sincronizadoAt?.toISOString() || null,
        syncError: contact.propiedadesCompletasError,
        initialVersion: contact.datosVersion,
      }}
      settings={{ initialSegment: contact.segmentoCrm, customerSegment: segment ? SEGMENT_LABELS[segment] || segment : null }}
    />
  )
}

function formatDealAmount(value: unknown, currency: string | null) {
  if (value == null) return 'Importe no informado'
  const amount = Number(String(value))
  if (!Number.isFinite(amount)) return String(value)
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: (currency || 'EUR').toUpperCase(), maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toLocaleString('es-ES')} ${currency || 'EUR'}`
  }
}

function formatDateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString('es-ES') : null
}

function asStringRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, field]) => [key, field == null ? null : String(field)]))
}

function asActivityMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const metadata = value as Record<string, unknown>
  const publicMetadata = Object.fromEntries(['remitente', 'para', 'cc', 'ubicacion', 'guardadoEnEnviados', 'estadoGraph', 'codigoGraph', 'estadoCalendario', 'reunionTeams', 'modoAsistido', 'canalPreparado']
    .filter((key) => metadata[key] !== undefined)
    .map((key) => [key, metadata[key]]))
  if (typeof metadata.outlookWebLink === 'string') publicMetadata.outlookDisponible = true
  if (typeof metadata.teamsJoinUrl === 'string') publicMetadata.teamsDisponible = true
  return publicMetadata
}

function pickStringRecord(value: unknown, allowed: Set<string>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(asStringRecord(value)).filter(([key]) => allowed.has(key)))
}

function asHistory(value: unknown): Array<{ fecha?: string; autor?: string; cambios?: Array<{ campo?: string; anterior?: string | null; nuevo?: string | null }> }> {
  return Array.isArray(value) ? value as Array<{ fecha?: string; autor?: string; cambios?: Array<{ campo?: string; anterior?: string | null; nuevo?: string | null }> }> : []
}
