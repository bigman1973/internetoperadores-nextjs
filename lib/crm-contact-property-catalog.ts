import { unstable_cache } from 'next/cache'
import prisma from '@/lib/prisma'

export const CRM_CONTACT_PROPERTY_CATALOG_TAG = 'crm-contact-property-catalog'

export const CRM_CONTACT_INITIAL_PROPERTY_NAMES = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'mobilephone',
  'company',
  'jobtitle',
  'website',
  'city',
  'lfgd_business_unit',
  'lifecyclestage',
  'hs_lead_status',
  'hubspot_owner_id',
] as const

type PropertyRecord = {
  nombre: string
  etiqueta: string
  grupoNombre: string | null
  tipo: string | null
  tipoCampo: string | null
  descripcion: string | null
  opciones: unknown
  soloLectura: boolean
  oculta: boolean
  calculada: boolean
  ordenVisual: number | null
}

export type CrmContactPropertyDefinitionDto = {
  name: string
  label: string
  groupName: string | null
  type: string | null
  fieldType: string | null
  description: string | null
  options: Array<{ label?: string; value?: string; hidden?: boolean; displayOrder?: number }>
  readOnly: boolean
  hidden: boolean
  calculated: boolean
  displayOrder: number | null
}

export const getCrmContactPropertyCatalog = unstable_cache(
  async () => prisma.crmPropiedadHubspot.findMany({
    where: { objectTypeId: '0-1', oculta: false },
    orderBy: [{ grupoNombre: 'asc' }, { ordenVisual: 'asc' }, { etiqueta: 'asc' }],
  }),
  ['crm-contact-property-catalog-v1'],
  { revalidate: 300, tags: [CRM_CONTACT_PROPERTY_CATALOG_TAG] },
)

export const getCrmContactInitialPropertyCatalog = unstable_cache(
  async () => prisma.crmPropiedadHubspot.findMany({
    where: { objectTypeId: '0-1', oculta: false, nombre: { in: [...CRM_CONTACT_INITIAL_PROPERTY_NAMES] } },
    orderBy: [{ grupoNombre: 'asc' }, { ordenVisual: 'asc' }, { etiqueta: 'asc' }],
  }),
  ['crm-contact-initial-property-catalog-v1'],
  { revalidate: 300, tags: [CRM_CONTACT_PROPERTY_CATALOG_TAG] },
)

export function serializeCrmContactPropertyDefinitions(properties: PropertyRecord[]): CrmContactPropertyDefinitionDto[] {
  return properties.map((property) => ({
    name: property.nombre,
    label: friendlyPropertyLabel(property.nombre, property.etiqueta),
    groupName: property.grupoNombre,
    type: property.tipo,
    fieldType: property.tipoCampo,
    description: friendlyPropertyDescription(property.nombre, property.descripcion),
    options: asPropertyOptions(property.opciones).map((option) => ({
      ...option,
      label: friendlyPropertyOptionLabel(property.nombre, option.value, option.label),
    })),
    readOnly: property.soloLectura,
    hidden: property.oculta,
    calculated: property.calculada,
    displayOrder: property.ordenVisual,
  }))
}

export function asPropertyOptions(value: unknown): Array<{ label?: string; value?: string; hidden?: boolean; displayOrder?: number }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => item && typeof item === 'object' && !Array.isArray(item) ? [item as { label?: string; value?: string; hidden?: boolean; displayOrder?: number }] : [])
}

export function friendlyPropertyLabel(name: string, fallback?: string | null) {
  return FRIENDLY_PROPERTY_LABELS[name] || fallback || humanize(name)
}

export function friendlyPropertyDescription(name: string, fallback?: string | null) {
  return FRIENDLY_PROPERTY_DESCRIPTIONS[name] || fallback || null
}

export function friendlyPropertyOptionLabel(propertyName: string | undefined, value: string | undefined, fallback?: string) {
  if (!value) return fallback || 'Sin informar'
  return (propertyName && FRIENDLY_PROPERTY_OPTIONS[propertyName]?.[value]) || fallback || value
}

export function formatCrmContactPropertyValue(value: string | null | undefined, property?: PropertyRecord) {
  if (value == null || value === '') return 'Sin informar'
  const text = String(value)
  const options = asPropertyOptions(property?.opciones)
  const parts = text.split(';').filter(Boolean)
  if (parts.length > 1 || text.includes(';')) return parts.map((part) => friendlyPropertyOptionLabel(property?.nombre, part, options.find((option) => option.value === part)?.label)).join(', ')
  const option = options.find((item) => item.value === text)
  if (option?.label) return friendlyPropertyOptionLabel(property?.nombre, text, option.label)
  if (property?.tipo === 'bool') return text === 'true' ? 'Sí' : text === 'false' ? 'No' : text
  if (property?.tipo === 'date' || property?.tipo === 'datetime') {
    const numeric = /^\d+$/.test(text) ? Number(text) : NaN
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(text)
    if (!Number.isNaN(date.getTime())) return property.tipo === 'date' ? date.toLocaleDateString('es-ES') : date.toLocaleString('es-ES')
  }
  return text
}

const FRIENDLY_PROPERTY_LABELS: Record<string, string> = {
  firstname: 'Nombre',
  lastname: 'Apellidos',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  mobilephone: 'Teléfono móvil',
  company: 'Empresa',
  jobtitle: 'Cargo',
  website: 'Sitio web',
  address: 'Dirección',
  city: 'Localidad',
  state: 'Provincia / Estado',
  zip: 'Código postal',
  country: 'País',
  lifecyclestage: 'Ciclo de vida',
  hs_lead_status: 'Estado del lead',
  hubspot_owner_id: 'Propietario',
  lfgd_business_unit: 'Unidad de negocio',
  industry: 'Sector',
  salutation: 'Tratamiento',
  date_of_birth: 'Fecha de nacimiento',
}

const FRIENDLY_PROPERTY_DESCRIPTIONS: Record<string, string> = {
  firstname: 'Nombre de la persona de contacto.',
  lastname: 'Apellidos de la persona de contacto.',
  email: 'Correo electrónico principal para contactar con esta persona.',
  phone: 'Teléfono principal de contacto.',
  mobilephone: 'Teléfono móvil de contacto.',
  company: 'Empresa u organización con la que se relaciona este contacto.',
  jobtitle: 'Cargo o función que desempeña en su organización.',
  website: 'Sitio web de la empresa o del contacto.',
  address: 'Dirección postal principal.',
  city: 'Localidad de residencia o trabajo.',
  state: 'Provincia, comunidad o estado.',
  zip: 'Código postal de la dirección principal.',
  country: 'País de residencia o actividad.',
  lifecyclestage: 'Momento de la relación comercial: lead, oportunidad, cliente u otro estado.',
  hs_lead_status: 'Situación actual del seguimiento comercial con este contacto.',
  hubspot_owner_id: 'Persona del equipo responsable del seguimiento.',
  lfgd_business_unit: 'Empresa o empresas del grupo con las que interactúa este contacto.',
  industry: 'Sector de actividad de la empresa.',
}

const FRIENDLY_PROPERTY_OPTIONS: Record<string, Record<string, string>> = {
  lifecyclestage: {
    subscriber: 'Suscriptor',
    lead: 'Lead',
    marketingqualifiedlead: 'Lead cualificado de marketing',
    salesqualifiedlead: 'Lead cualificado de ventas',
    opportunity: 'Oportunidad',
    customer: 'Cliente',
    evangelist: 'Prescriptor',
    other: 'Otro',
  },
  hs_lead_status: {
    NEW: 'Nuevo',
    OPEN: 'En curso',
    IN_PROGRESS: 'En progreso',
    OPEN_DEAL: 'Negocio abierto',
    UNQUALIFIED: 'No cualificado',
    ATTEMPTED_TO_CONTACT: 'Intento de contacto',
    CONNECTED: 'Contactado',
    BAD_TIMING: 'No es el momento',
  },
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
