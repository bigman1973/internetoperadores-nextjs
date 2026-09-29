import prisma from '@/lib/prisma'
import { reconciliarContactosCrmConClientes } from '@/lib/crm-contactos'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { CRM_BUSINESS_UNIT_PROPERTY, parseCrmBusinessUnits } from '@/lib/crm-unidades-negocio'

const HUBSPOT_BASE = 'https://api.hubapi.com'
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', CRM_BUSINESS_UNIT_PROPERTY]
const COMPANY_PROPERTIES = ['name', 'domain', 'phone']
const DEAL_PROPERTIES = [
  'dealname',
  'amount',
  'dealstage',
  'pipeline',
  'closedate',
  'hs_is_closed',
  'hs_is_closed_won',
  'hubspot_owner_id',
  'hs_currency_code',
  'dealtype',
  'description',
  'hs_next_step',
]
const CALL_PROPERTIES = [
  'hs_call_title',
  'hs_call_body',
  'hs_call_direction',
  'hs_call_disposition',
  'hs_call_duration',
  'hs_timestamp',
  'hubspot_owner_id',
]

export type HubspotList = {
  listId: string
  name: string
  objectTypeId: string
  processingType: string
  processingStatus?: string
  listVersion?: number
  createdAt?: string
  updatedAt?: string
  filtersUpdatedAt?: string
  createdById?: string
  updatedById?: string
  filterBranch?: unknown
  additionalProperties?: Record<string, string>
}

type Membership = { recordId: string; membershipTimestamp?: string }

type HubspotRecord = {
  id: string
  properties?: Record<string, string | null>
  createdAt?: string
  updatedAt?: string
  associations?: {
    contacts?: {
      results?: Array<{ id: string; type?: string }>
      paging?: { next?: { after?: string } }
    }
    deals?: {
      results?: Array<{ id: string; type?: string }>
      paging?: { next?: { after?: string } }
    }
  }
}

type HubspotPipelineStage = {
  id: string
  label: string
  displayOrder?: number
  archived?: boolean
  metadata?: {
    isClosed?: boolean | string
    probability?: string
  }
}

type HubspotPipeline = {
  id: string
  label: string
  displayOrder?: number
  archived?: boolean
  stages?: HubspotPipelineStage[]
}

type HubspotAssociationType = {
  category?: string
  typeId?: number
  label?: string | null
}

type HubspotDealContactAssociation = {
  dealId: string
  contactId: string
  associationTypes: HubspotAssociationType[]
}

type HubspotOwner = {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  archived?: boolean
}

type HubspotSalesSnapshot = {
  pipelines: HubspotPipeline[]
  deals: HubspotRecord[]
  associations: HubspotDealContactAssociation[]
  owners: HubspotOwner[]
}

type HubspotCallSnapshot = {
  calls: HubspotRecord[]
  contactAssociations: Array<{ callId: string; contactId: string }>
  dealAssociations: Array<{ callId: string; dealId: string }>
}

type HubspotPropertyDefinition = {
  name: string
  label: string
  groupName?: string
  type?: string
  fieldType?: string
  description?: string
  options?: Array<{ label?: string; value?: string; hidden?: boolean; displayOrder?: number }>
  hidden?: boolean
  calculated?: boolean
  displayOrder?: number
  createdAt?: string
  updatedAt?: string
  modificationMetadata?: { readOnlyValue?: boolean }
}

function getToken() {
  const token = (process.env.HUBSPOT_API_KEY || '').trim()
  if (!token) throw new Error('HUBSPOT_API_KEY no está configurada')
  return token
}

async function hubspotRequest<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${HUBSPOT_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      signal: init?.signal || AbortSignal.timeout(25_000),
      cache: 'no-store',
    })
  } catch (error) {
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
      return hubspotRequest<T>(path, init, attempt + 1)
    }
    throw new Error(`No se ha podido conectar con HubSpot después de varios intentos: ${error instanceof Error ? error.message : 'error de red'}`)
  }

  if ((response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) && attempt < 4) {
    const retryAfter = Number(response.headers.get('retry-after') || 0)
    const delay = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt
    await new Promise((resolve) => setTimeout(resolve, Math.max(1000, delay)))
    return hubspotRequest<T>(path, init, attempt + 1)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.message || payload?.error || `HubSpot respondió ${response.status}`
    throw new Error(String(message))
  }
  return payload as T
}

export async function getAllHubspotLists(): Promise<HubspotList[]> {
  const lists: HubspotList[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const data = await hubspotRequest<{
      lists?: HubspotList[]
      offset?: number
      hasMore?: boolean
      total?: number
    }>('/crm/v3/lists/search', {
      method: 'POST',
      body: JSON.stringify({
        query: '',
        count: 100,
        offset,
        processingTypes: [],
        listIds: [],
        additionalProperties: [],
      }),
    })

    const page = data.lists || []
    lists.push(...page)
    hasMore = Boolean(data.hasMore) && page.length > 0
    offset = typeof data.offset === 'number' && data.offset > offset
      ? data.offset
      : offset + page.length
  }

  return lists
}

async function getAllHubspotPipelines(): Promise<HubspotPipeline[]> {
  const [active, archived] = await Promise.all([
    hubspotRequest<{ results?: HubspotPipeline[] }>('/crm/v3/pipelines/deals?archived=false'),
    hubspotRequest<{ results?: HubspotPipeline[] }>('/crm/v3/pipelines/deals?archived=true'),
  ])
  return [...new Map([...(active.results || []), ...(archived.results || [])].map((pipeline) => [pipeline.id, pipeline])).values()]
}

async function getAllHubspotDeals(): Promise<HubspotRecord[]> {
  const deals: HubspotRecord[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({
      limit: '100',
      archived: 'false',
      properties: DEAL_PROPERTIES.join(','),
      associations: 'contacts',
    })
    if (after) query.set('after', after)
    const data = await hubspotRequest<{
      results?: HubspotRecord[]
      paging?: { next?: { after?: string } }
    }>(`/crm/v3/objects/deals?${query}`)
    deals.push(...(data.results || []))
    after = data.paging?.next?.after
  } while (after)

  return [...new Map(deals.map((deal) => [deal.id, deal])).values()]
}

async function getAllHubspotOwners(): Promise<HubspotOwner[]> {
  const owners: HubspotOwner[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({ limit: '500', archived: 'false' })
    if (after) query.set('after', after)
    const data = await hubspotRequest<{
      results?: HubspotOwner[]
      paging?: { next?: { after?: string } }
    }>(`/crm/v3/owners?${query}`)
    owners.push(...(data.results || []))
    after = data.paging?.next?.after
  } while (after)

  return [...new Map(owners.map((owner) => [owner.id, owner])).values()]
}

async function getHubspotDealContactAssociations(deals: HubspotRecord[]): Promise<HubspotDealContactAssociation[]> {
  const associations: HubspotDealContactAssociation[] = []
  type AssociationPage = {
    results?: Array<{ id: string; type?: string }>
    paging?: { next?: { after?: string } }
  }

  const append = (dealId: string, rows: Array<{ id: string; type?: string }>) => {
    for (const association of rows) {
      associations.push({
        dealId,
        contactId: String(association.id),
        associationTypes: association.type ? [{ category: 'HUBSPOT_DEFINED', label: association.type }] : [],
      })
    }
  }

  for (const deal of deals) {
    const included = deal.associations?.contacts
    append(deal.id, included?.results || [])
    let after = included?.paging?.next?.after
    while (after) {
      const query = new URLSearchParams({ limit: '500', after })
      const next = await hubspotRequest<AssociationPage>(`/crm/v3/objects/deals/${encodeURIComponent(deal.id)}/associations/contacts?${query}`)
      append(deal.id, next.results || [])
      after = next.paging?.next?.after
    }
  }

  return [...new Map(associations.map((association) => [
    `${association.dealId}:${association.contactId}`,
    association,
  ])).values()]
}

async function getHubspotSalesSnapshot(): Promise<HubspotSalesSnapshot> {
  const [pipelines, deals, owners] = await Promise.all([
    getAllHubspotPipelines(),
    getAllHubspotDeals(),
    getAllHubspotOwners().catch(() => []),
  ])
  const associations = await getHubspotDealContactAssociations(deals)
  return { pipelines, deals, associations, owners }
}

async function getAllHubspotCalls(): Promise<HubspotRecord[]> {
  const calls: HubspotRecord[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({
      limit: '100',
      archived: 'false',
      properties: CALL_PROPERTIES.join(','),
      associations: 'contacts,deals',
    })
    if (after) query.set('after', after)
    const data = await hubspotRequest<{
      results?: HubspotRecord[]
      paging?: { next?: { after?: string } }
    }>(`/crm/v3/objects/calls?${query}`)
    calls.push(...(data.results || []))
    after = data.paging?.next?.after
  } while (after)

  return [...new Map(calls.map((call) => [call.id, call])).values()]
}

async function getHubspotCallAssociations(calls: HubspotRecord[], type: 'contacts' | 'deals') {
  const rows: Array<{ callId: string; recordId: string }> = []
  type AssociationPage = { results?: Array<{ id: string }>; paging?: { next?: { after?: string } } }

  for (const call of calls) {
    const included = call.associations?.[type]
    for (const association of included?.results || []) rows.push({ callId: call.id, recordId: String(association.id) })
    let after = included?.paging?.next?.after
    while (after) {
      const query = new URLSearchParams({ limit: '500', after })
      const next = await hubspotRequest<AssociationPage>(`/crm/v3/objects/calls/${encodeURIComponent(call.id)}/associations/${type}?${query}`)
      for (const association of next.results || []) rows.push({ callId: call.id, recordId: String(association.id) })
      after = next.paging?.next?.after
    }
  }

  return [...new Map(rows.map((row) => [`${row.callId}:${row.recordId}`, row])).values()]
}

async function getHubspotCallSnapshot(): Promise<HubspotCallSnapshot> {
  const calls = await getAllHubspotCalls()
  const [contacts, deals] = await Promise.all([
    getHubspotCallAssociations(calls, 'contacts'),
    getHubspotCallAssociations(calls, 'deals'),
  ])
  return {
    calls,
    contactAssociations: contacts.map((row) => ({ callId: row.callId, contactId: row.recordId })),
    dealAssociations: deals.map((row) => ({ callId: row.callId, dealId: row.recordId })),
  }
}

async function getHubspotListDetail(listId: string): Promise<HubspotList> {
  const data = await hubspotRequest<HubspotList | { list?: HubspotList }>(
    `/crm/v3/lists/${encodeURIComponent(listId)}?includeFilters=true`
  )
  return 'list' in data && data.list ? data.list : data as HubspotList
}

async function getHubspotMemberships(listId: string): Promise<{ results: Membership[]; total: number }> {
  const results: Membership[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({ limit: '250' })
    if (after) query.set('after', after)
    const data = await hubspotRequest<{
      results?: Membership[]
      total?: number
      paging?: { next?: { after?: string } }
    }>(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships/join-order?${query}`)
    results.push(...(data.results || []))
    after = data.paging?.next?.after
  } while (after)

  const uniqueResults = [...new Map(results.map((membership) => [membership.recordId, membership])).values()]
  return { results: uniqueResults, total: uniqueResults.length }
}

function objectPath(objectTypeId: string) {
  if (objectTypeId === '0-1') return { path: 'contacts', properties: CONTACT_PROPERTIES }
  if (objectTypeId === '0-2') return { path: 'companies', properties: COMPANY_PROPERTIES }
  if (objectTypeId === '0-3') return { path: 'deals', properties: DEAL_PROPERTIES }
  return null
}

async function getHubspotPropertyDefinitions(objectTypeId: string): Promise<HubspotPropertyDefinition[]> {
  const data = await hubspotRequest<{ results?: HubspotPropertyDefinition[] }>(
    `/crm/v3/properties/${encodeURIComponent(objectTypeId)}?archived=false`
  )
  return data.results || []
}

async function getRecords(objectTypeId: string, ids: string[], requestedProperties?: string[], archived = false): Promise<HubspotRecord[]> {
  const object = objectPath(objectTypeId)
  if (!object || ids.length === 0) return []

  const records: HubspotRecord[] = []
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100)
    const data = await hubspotRequest<{ results?: HubspotRecord[] }>(
      `/crm/v3/objects/${object.path}/batch/read?archived=${archived ? 'true' : 'false'}`,
      {
        method: 'POST',
        body: JSON.stringify({
          inputs: chunk.map((id) => ({ id })),
          properties: requestedProperties?.length ? requestedProperties : object.properties,
        }),
      }
    )
    records.push(...(data.results || []))
  }
  return records
}

async function getRecordsWithAllProperties(
  objectTypeId: string,
  ids: string[],
  definitions: HubspotPropertyDefinition[],
  archived = false
): Promise<HubspotRecord[]> {
  if (objectTypeId !== '0-1') return getRecords(objectTypeId, ids)

  const propertyNames = definitions.map((property) => property.name)
  const records = await getRecords(objectTypeId, ids, propertyNames, archived)
  return records.map((record) => ({
    ...record,
    properties: Object.fromEntries(
      Object.entries(record.properties || {}).filter(([, value]) => value != null && String(value).trim() !== '')
    ),
  }))
}

export async function syncHubspotContactProperties(hubspotId: string) {
  const definitions = await getHubspotPropertyDefinitions('0-1')
  let records = await getRecordsWithAllProperties('0-1', [hubspotId], definitions)
  if (records.length === 0) records = await getRecordsWithAllProperties('0-1', [hubspotId], definitions, true)
  const record = records[0]
  if (!record) throw new Error('HubSpot no ha devuelto la ficha del contacto.')
  const properties = record.properties || {}

  const existing = await prisma.crmRegistroHubspot.findUnique({
    where: { objectTypeId_hubspotId: { objectTypeId: '0-1', hubspotId } },
    select: { id: true, email: true },
  })
  if (!existing) throw new Error('El contacto todavía no existe en el CRM local.')
  const now = new Date()

  await prisma.$transaction([
    prisma.crmPropiedadHubspot.deleteMany({ where: { objectTypeId: '0-1' } }),
    prisma.crmPropiedadHubspot.createMany({
      data: definitions.map((property) => ({
        objectTypeId: '0-1',
        nombre: property.name,
        etiqueta: property.label || property.name,
        grupoNombre: property.groupName || null,
        tipo: property.type || null,
        tipoCampo: property.fieldType || null,
        descripcion: property.description || null,
        opciones: property.options || [],
        soloLectura: Boolean(property.modificationMetadata?.readOnlyValue),
        oculta: Boolean(property.hidden),
        calculada: Boolean(property.calculated),
        ordenVisual: typeof property.displayOrder === 'number' ? property.displayOrder : null,
        hubspotCreadaAt: toDate(property.createdAt),
        hubspotActualizadaAt: toDate(property.updatedAt),
        sincronizadoAt: now,
      })),
      skipDuplicates: true,
    }),
    prisma.crmRegistroHubspot.update({
      where: { id: existing.id },
      data: {
        propiedades: properties,
        propiedadesCompletasAt: now,
        propiedadesCompletasError: null,
        hubspotCreadoAt: toDate(record.createdAt),
        hubspotActualizadoAt: toDate(record.updatedAt),
        sincronizadoAt: now,
      },
    }),
  ])
  await recomputeEffectiveContactFields([existing.id])
  const refreshed = await prisma.crmRegistroHubspot.findUnique({ where: { id: existing.id }, select: { email: true } })
  await reconciliarContactosCrmConClientes([existing.email || '', refreshed?.email || ''])

  return { properties: Object.keys(properties).length, definitions: definitions.length, syncedAt: now }
}

export async function syncHubspotContactPropertyBatch(limit = 500) {
  const batchSize = Math.min(Math.max(limit, 1), 500)
  const contacts = await prisma.crmRegistroHubspot.findMany({
    where: {
      objectTypeId: '0-1',
      propiedadesCompletasAt: null,
      propiedadesCompletasError: null,
      OR: [
        { listas: { some: { activo: true, lista: { activo: true } } } },
        { negocios: { some: { negocio: { activo: true } } } },
      ],
    },
    select: { id: true, hubspotId: true, email: true },
    orderBy: { id: 'asc' },
    take: batchSize,
  })
  if (contacts.length === 0) return { processed: 0, remaining: 0, definitions: 0 }

  const cachedDefinitions = await prisma.crmPropiedadHubspot.findMany({ where: { objectTypeId: '0-1' } })
  const definitions: HubspotPropertyDefinition[] = cachedDefinitions.length > 0
    ? cachedDefinitions.map((property) => ({
        name: property.nombre,
        label: property.etiqueta,
        groupName: property.grupoNombre || undefined,
        type: property.tipo || undefined,
        fieldType: property.tipoCampo || undefined,
        description: property.descripcion || undefined,
        options: Array.isArray(property.opciones) ? property.opciones as HubspotPropertyDefinition['options'] : [],
        hidden: property.oculta,
        calculated: property.calculada,
        displayOrder: property.ordenVisual ?? undefined,
        createdAt: property.hubspotCreadaAt?.toISOString(),
        updatedAt: property.hubspotActualizadaAt?.toISOString(),
        modificationMetadata: { readOnlyValue: property.soloLectura },
      }))
    : await getHubspotPropertyDefinitions('0-1')
  const records = await getRecordsWithAllProperties('0-1', contacts.map((contact) => contact.hubspotId), definitions)
  const byHubspotId = new Map(records.map((record) => [record.id, record]))
  const missingIds = contacts.map((contact) => contact.hubspotId).filter((id) => !byHubspotId.has(id))
  if (missingIds.length > 0) {
    const archivedRecords = await getRecordsWithAllProperties('0-1', missingIds, definitions, true)
    archivedRecords.forEach((record) => byHubspotId.set(record.id, record))
  }
  const now = new Date()
  if (cachedDefinitions.length === 0) {
    await prisma.crmPropiedadHubspot.createMany({
      data: definitions.map((property) => ({
        objectTypeId: '0-1',
        nombre: property.name,
        etiqueta: property.label || property.name,
        grupoNombre: property.groupName || null,
        tipo: property.type || null,
        tipoCampo: property.fieldType || null,
        descripcion: property.description || null,
        opciones: property.options || [],
        soloLectura: Boolean(property.modificationMetadata?.readOnlyValue),
        oculta: Boolean(property.hidden),
        calculada: Boolean(property.calculated),
        ordenVisual: typeof property.displayOrder === 'number' ? property.displayOrder : null,
        hubspotCreadaAt: toDate(property.createdAt),
        hubspotActualizadaAt: toDate(property.updatedAt),
        sincronizadoAt: now,
      })),
      skipDuplicates: true,
    })
  }
  const affectedEmails: string[] = []
  const sourceRows = contacts.flatMap((contact) => {
    const record = byHubspotId.get(contact.hubspotId)
    if (!record) return []
    const properties = record.properties || {}
    if (contact.email) affectedEmails.push(contact.email)
    return [{ id: contact.id, properties, createdAt: record.createdAt || null, updatedAt: record.updatedAt || null }]
  })
  if (sourceRows.length > 0) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE crm_registros_hubspot AS contacto
      SET propiedades = datos.propiedades,
          propiedades_completas_at = ${now},
          propiedades_completas_error = NULL,
          hubspot_creado_at = CAST(datos.creado_at AS timestamptz),
          hubspot_actualizado_at = CAST(datos.actualizado_at AS timestamptz),
          sincronizado_at = ${now},
          updated_at = NOW()
      FROM (VALUES ${Prisma.join(sourceRows.map((row) => Prisma.sql`(${row.id}, CAST(${JSON.stringify(row.properties)} AS jsonb), ${row.createdAt}, ${row.updatedAt})`))}) AS datos(id, propiedades, creado_at, actualizado_at)
      WHERE contacto.id = datos.id
    `)
  }
  const unavailableContacts = contacts.filter((contact) => !byHubspotId.has(contact.hubspotId))
  if (unavailableContacts.length > 0) {
    await prisma.crmRegistroHubspot.updateMany({
      where: { id: { in: unavailableContacts.map((contact) => contact.id) } },
      data: { propiedadesCompletasError: 'La ficha ya no está disponible en HubSpot, ni siquiera como contacto archivado', sincronizadoAt: now },
    })
  }
  await recomputeEffectiveContactFields(sourceRows.map((row) => row.id))
  const refreshedContacts = await prisma.crmRegistroHubspot.findMany({ where: { id: { in: contacts.map((contact) => contact.id) } }, select: { email: true } })
  refreshedContacts.forEach((contact) => { if (contact.email) affectedEmails.push(contact.email) })
  await reconciliarContactosCrmConClientes(affectedEmails)
  const remaining = await prisma.crmRegistroHubspot.count({
    where: {
      objectTypeId: '0-1',
      propiedadesCompletasAt: null,
      propiedadesCompletasError: null,
      OR: [
        { listas: { some: { activo: true, lista: { activo: true } } } },
        { negocios: { some: { negocio: { activo: true } } } },
      ],
    },
  })
  return { processed: sourceRows.length, unavailable: unavailableContacts.length, remaining, definitions: definitions.length }
}

function toDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function asStringRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => [
      key,
      fieldValue == null ? null : String(fieldValue),
    ])
  )
}

export async function recomputeEffectiveContactFields(ids: string[]) {
  if (ids.length === 0) return
  for (let index = 0; index < ids.length; index += 1000) {
    const chunk = ids.slice(index, index + 1000)
    await prisma.$executeRaw(Prisma.sql`
    WITH efectivos AS (
      SELECT
        id,
        object_type_id,
        COALESCE(propiedades, '{}'::jsonb) || COALESCE(propiedades_locales, '{}'::jsonb) AS datos
      FROM crm_registros_hubspot
      WHERE id IN (${Prisma.join(chunk)})
    )
    UPDATE crm_registros_hubspot AS contacto
    SET nombre = CASE
          WHEN efectivos.object_type_id = '0-1' THEN COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', efectivos.datos->>'firstname', efectivos.datos->>'lastname')), ''),
            NULLIF(TRIM(efectivos.datos->>'email'), '')
          )
          ELSE COALESCE(NULLIF(TRIM(efectivos.datos->>'name'), ''), NULLIF(TRIM(efectivos.datos->>'dealname'), ''))
        END,
        email = NULLIF(LOWER(TRIM(efectivos.datos->>'email')), ''),
        telefono = COALESCE(NULLIF(TRIM(efectivos.datos->>'phone'), ''), NULLIF(TRIM(efectivos.datos->>'mobilephone'), '')),
        empresa = COALESCE(NULLIF(TRIM(efectivos.datos->>'company'), ''), NULLIF(TRIM(efectivos.datos->>'name'), '')),
        unidades_negocio = CASE
          WHEN efectivos.object_type_id = '0-1' THEN ARRAY(
            SELECT unidad_limpia
            FROM (
              SELECT CASE LOWER(TRIM(unidad))
                       WHEN 'lfdeal' THEN 'LFDeal'
                       WHEN 'lf kapital' THEN 'LF Kapital'
                       WHEN 'lfgd' THEN 'LFGD'
                       WHEN 'farmsplanet' THEN 'FarmsPlanet'
                       WHEN 'mikels' THEN 'Mikels'
                       WHEN 'internet operadores' THEN 'Internet Operadores'
                       ELSE TRIM(unidad)
                     END AS unidad_limpia,
                     MIN(posicion) AS primera_posicion
              FROM regexp_split_to_table(COALESCE(efectivos.datos->>${CRM_BUSINESS_UNIT_PROPERTY}, ''), ';') WITH ORDINALITY AS valor(unidad, posicion)
              WHERE TRIM(unidad) <> ''
              GROUP BY CASE LOWER(TRIM(unidad))
                         WHEN 'lfdeal' THEN 'LFDeal'
                         WHEN 'lf kapital' THEN 'LF Kapital'
                         WHEN 'lfgd' THEN 'LFGD'
                         WHEN 'farmsplanet' THEN 'FarmsPlanet'
                         WHEN 'mikels' THEN 'Mikels'
                         WHEN 'internet operadores' THEN 'Internet Operadores'
                         ELSE TRIM(unidad)
                       END
            ) AS unidades_unicas
            ORDER BY primera_posicion
          )
          ELSE ARRAY[]::text[]
        END,
        updated_at = NOW()
    FROM efectivos
    WHERE contacto.id = efectivos.id
    `)
  }
}

function inferPurpose(name: string) {
  const normalized = name.toLocaleUpperCase('es-ES')
  if (normalized.startsWith('HUBSPOT PARTNER -')) {
    return normalized.includes('INVALID') ? 'SUPRESION' : 'OPERATIVA'
  }
  if (/REBOT|ERROR|SUPRES|EXCLU|BAJA|BOUNCE/.test(normalized)) return 'SUPRESION'
  if (/NEWSLETTER|SUSCRIT/.test(normalized)) return 'NEWSLETTER'
  if (/PARTNER|COLABORADOR|GESTOR/.test(normalized)) return 'PARTNERS'
  if (/LEAD|LLAMAD|OPORTUN|INTERES|COMPRADOR|VENDEDOR|DEMO|CARRITO/.test(normalized)) return 'COMERCIAL'
  if (/FORMULARIO|DESCARG|GUIA|AUDITORIA/.test(normalized)) return 'CAPTACION'
  return 'SIN_CLASIFICAR'
}

export function summarizeFilterBranch(branch: unknown): Array<{
  group: string
  property?: string
  operator?: string
  value?: string
  filterType?: string
}> {
  const rows: Array<{ group: string; property?: string; operator?: string; value?: string; filterType?: string }> = []

  const walk = (node: any, path: string) => {
    if (!node || typeof node !== 'object') return
    const conjunction = node.filterBranchOperator || node.filterBranchType || 'AND'
    const filters = Array.isArray(node.filters) ? node.filters : []
    for (const filter of filters) {
      const operation = filter?.operation || {}
      const value = operation.value ?? operation.values ?? operation.highValue ?? operation.lowerBoundTimePoint
      rows.push({
        group: `${path} (${conjunction})`,
        property: filter.property,
        operator: operation.operator || operation.operationType,
        value: value == null ? undefined : typeof value === 'string' ? value : JSON.stringify(value),
        filterType: filter.filterType,
      })
    }
    const children = Array.isArray(node.filterBranches) ? node.filterBranches : []
    children.forEach((child: unknown, index: number) => walk(child, `${path}.${index + 1}`))
  }

  walk(branch, 'Grupo 1')
  return rows
}

async function mapLocalClientsByEmail() {
  const clients = await prisma.clienteWeb.findMany({
    where: { email: { not: '' } },
    select: { id: true, email: true, segmentoCrm: true },
  })
  const candidatesByEmail = new Map<string, Array<{ id: number; segmentoCrm: 'PARTICULAR' | 'EMPRESA' | 'PARTNER' }>>()
  for (const client of clients) {
    const email = client.email.trim().toLowerCase()
    if (email && !email.endsWith('@placeholder.local')) {
      const candidates = candidatesByEmail.get(email) || []
      candidates.push({ id: client.id, segmentoCrm: client.segmentoCrm })
      candidatesByEmail.set(email, candidates)
    }
  }
  const clientsByEmail = new Map<string, { id: number; segmentoCrm: 'PARTICULAR' | 'EMPRESA' | 'PARTNER' }>()
  for (const [email, candidates] of candidatesByEmail) {
    if (candidates.length === 1) clientsByEmail.set(email, candidates[0])
  }
  return clientsByEmail
}

function hubspotBoolean(value: unknown) {
  return value === true || String(value || '').toLowerCase() === 'true'
}

function decimalOrNull(value: unknown) {
  if (value == null || String(value).trim() === '') return null
  try {
    return new Prisma.Decimal(String(value))
  } catch {
    return null
  }
}

function ownerName(owner?: HubspotOwner) {
  if (!owner) return null
  return [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.email || null
}

function buildSalesDefinitions(snapshot: HubspotSalesSnapshot) {
  const pipelineMap = new Map(snapshot.pipelines.map((pipeline) => [pipeline.id, { ...pipeline, stages: [...(pipeline.stages || [])] }]))

  for (const deal of snapshot.deals) {
    const properties = deal.properties || {}
    const pipelineId = properties.pipeline || '__SIN_PIPELINE__'
    const stageId = properties.dealstage || '__SIN_ETAPA__'
    let pipeline = pipelineMap.get(pipelineId)
    if (!pipeline) {
      pipeline = {
        id: pipelineId,
        label: pipelineId === '__SIN_PIPELINE__' ? 'Sin pipeline informado' : `Pipeline no disponible (${pipelineId})`,
        archived: true,
        stages: [],
      }
      pipelineMap.set(pipelineId, pipeline)
    }
    if (!(pipeline.stages || []).some((stage) => stage.id === stageId)) {
      pipeline.stages = [
        ...(pipeline.stages || []),
        {
          id: stageId,
          label: stageId === '__SIN_ETAPA__' ? 'Sin etapa informada' : `Etapa no disponible (${stageId})`,
          archived: true,
          metadata: {
            isClosed: properties.hs_is_closed || false,
            probability: properties.hs_is_closed_won === 'true' ? '1' : undefined,
          },
        },
      ]
    }
  }

  return [...pipelineMap.values()]
}

async function persistHubspotSalesSnapshot(
  snapshot: HubspotSalesSnapshot,
  contactRecords: HubspotRecord[],
  syncedAt: Date
) {
  const pipelines = buildSalesDefinitions(snapshot)
  const ownersById = new Map(snapshot.owners.map((owner) => [owner.id, owner]))
  const stages = pipelines.flatMap((pipeline) => (pipeline.stages || []).map((stage) => ({ pipeline, stage })))
  const stageKeys = new Set(stages.map(({ pipeline, stage }) => `${pipeline.id}:${stage.id}`))
  const requestedContactIds = [...new Set(snapshot.associations.map((association) => association.contactId))]
  const remoteContacts = new Map(contactRecords.map((contact) => [contact.id, contact]))
  const currentContacts = new Map((await prisma.crmRegistroHubspot.findMany({
    where: { objectTypeId: '0-1', hubspotId: { in: requestedContactIds } },
    select: { id: true, hubspotId: true, propiedades: true, propiedadesLocales: true },
  })).map((contact) => [contact.hubspotId, contact]))

  const contactRows = requestedContactIds.map((hubspotId) => {
    const current = currentContacts.get(hubspotId)
    const record = remoteContacts.get(hubspotId)
    const sourceProperties = { ...asStringRecord(current?.propiedades), ...(record?.properties || {}) }
    if (record && !Object.prototype.hasOwnProperty.call(record.properties || {}, CRM_BUSINESS_UNIT_PROPERTY)) {
      sourceProperties[CRM_BUSINESS_UNIT_PROPERTY] = null
    }
    const localProperties = asStringRecord(current?.propiedadesLocales)
    const effectiveProperties = { ...sourceProperties, ...localProperties }
    const fullName = [effectiveProperties.firstname, effectiveProperties.lastname].filter(Boolean).join(' ').trim()
    return {
      id: current?.id || randomUUID(),
      hubspotId,
      sourceProperties,
      nombre: fullName || effectiveProperties.email || `Contacto HubSpot #${hubspotId}`,
      email: effectiveProperties.email?.trim().toLowerCase() || null,
      telefono: effectiveProperties.phone || effectiveProperties.mobilephone || null,
      empresa: effectiveProperties.company || null,
      unidadesNegocio: parseCrmBusinessUnits(effectiveProperties[CRM_BUSINESS_UNIT_PROPERTY]),
      hubspotCreadoAt: toDate(record?.createdAt),
      hubspotActualizadoAt: toDate(record?.updatedAt),
    }
  })
  const contactRecordMap = new Map(contactRows.map((contact) => [contact.hubspotId, contact.id]))
  const associationRows = snapshot.associations.map((association) => ({
    negocioHubspotId: association.dealId,
    contactoId: contactRecordMap.get(association.contactId)!,
    tiposAsociacion: association.associationTypes as Prisma.InputJsonValue,
    sincronizadoAt: syncedAt,
  }))
  if (associationRows.some((association) => !association.contactoId)) {
    throw new Error('No se han podido materializar todos los contactos asociados. Se conserva el snapshot local anterior.')
  }

  const pipelineRows = pipelines.map((pipeline) => ({
    hubspotId: pipeline.id,
    nombre: pipeline.label || pipeline.id,
    displayOrder: pipeline.displayOrder ?? null,
    activo: !pipeline.archived,
    sincronizadoAt: syncedAt,
  }))
  const stageRows = stages.map(({ pipeline, stage }) => ({
    clave: `${pipeline.id}:${stage.id}`,
    hubspotId: stage.id,
    pipelineHubspotId: pipeline.id,
    nombre: stage.label || stage.id,
    displayOrder: stage.displayOrder ?? null,
    cerrado: hubspotBoolean(stage.metadata?.isClosed),
    probabilidad: decimalOrNull(stage.metadata?.probability),
    propiedadesHubspot: (stage.metadata || {}) as Prisma.InputJsonValue,
    activo: !stage.archived,
    sincronizadoAt: syncedAt,
  }))
  const dealRows = snapshot.deals.map((deal) => {
    const properties = deal.properties || {}
    const pipelineHubspotId = properties.pipeline || '__SIN_PIPELINE__'
    const stageId = properties.dealstage || '__SIN_ETAPA__'
    const etapaClave = `${pipelineHubspotId}:${stageId}`
    if (!stageKeys.has(etapaClave)) throw new Error(`No se pudo resolver la etapa ${stageId} del negocio ${deal.id}.`)
    const stage = pipelines.find((pipeline) => pipeline.id === pipelineHubspotId)?.stages?.find((item) => item.id === stageId)
    const ownerId = properties.hubspot_owner_id || null
    return {
      hubspotId: deal.id,
      nombre: properties.dealname?.trim() || `Negocio #${deal.id}`,
      pipelineHubspotId,
      etapaClave,
      importe: decimalOrNull(properties.amount),
      moneda: properties.hs_currency_code || null,
      fechaCierre: toDate(properties.closedate || undefined),
      cerrado: hubspotBoolean(properties.hs_is_closed) || hubspotBoolean(stage?.metadata?.isClosed),
      ganado: hubspotBoolean(properties.hs_is_closed_won),
      propietarioHubspotId: ownerId,
      propietarioNombre: ownerName(ownerId ? ownersById.get(ownerId) : undefined) || (ownerId ? `HubSpot #${ownerId}` : null),
      propiedades: properties as Prisma.InputJsonValue,
      hubspotCreadoAt: toDate(deal.createdAt),
      hubspotActualizadoAt: toDate(deal.updatedAt),
      sincronizadoAt: syncedAt,
      activo: true,
    }
  })

  await prisma.$transaction(async (tx) => {
    if (contactRows.length > 0) {
      const payload = JSON.stringify(contactRows.map((contact) => ({
        id: contact.id,
        hubspot_id: contact.hubspotId,
        nombre: contact.nombre,
        email: contact.email,
        telefono: contact.telefono,
        empresa: contact.empresa,
        unidades_negocio: contact.unidadesNegocio,
        propiedades: contact.sourceProperties,
        hubspot_creado_at: contact.hubspotCreadoAt?.toISOString() || null,
        hubspot_actualizado_at: contact.hubspotActualizadoAt?.toISOString() || null,
        sincronizado_at: syncedAt.toISOString(),
      })))
      await tx.$executeRaw`
        INSERT INTO crm_registros_hubspot AS existing (
          id, object_type_id, hubspot_id, nombre, email, telefono, empresa,
          unidades_negocio, propiedades, hubspot_creado_at, hubspot_actualizado_at,
          sincronizado_at, created_at, updated_at
        )
        SELECT
          row.id,
          '0-1',
          row.hubspot_id,
          row.nombre,
          row.email,
          row.telefono,
          row.empresa,
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(row.unidades_negocio, '[]'::jsonb))),
          row.propiedades,
          row.hubspot_creado_at,
          row.hubspot_actualizado_at,
          row.sincronizado_at,
          NOW(),
          NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS row(
          id text,
          hubspot_id text,
          nombre text,
          email text,
          telefono text,
          empresa text,
          unidades_negocio jsonb,
          propiedades jsonb,
          hubspot_creado_at timestamptz,
          hubspot_actualizado_at timestamptz,
          sincronizado_at timestamptz
        )
        ON CONFLICT (object_type_id, hubspot_id) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          email = EXCLUDED.email,
          telefono = EXCLUDED.telefono,
          empresa = EXCLUDED.empresa,
          unidades_negocio = EXCLUDED.unidades_negocio,
          propiedades = EXCLUDED.propiedades,
          hubspot_creado_at = COALESCE(EXCLUDED.hubspot_creado_at, existing.hubspot_creado_at),
          hubspot_actualizado_at = COALESCE(EXCLUDED.hubspot_actualizado_at, existing.hubspot_actualizado_at),
          sincronizado_at = EXCLUDED.sincronizado_at,
          updated_at = NOW()
      `
    }

    const localActivityDeals = await tx.crmActividadNegocio.findMany({
      where: { actividad: { origen: 'LOCAL' } },
      select: { actividadId: true, negocioHubspotId: true },
    })
    await tx.crmNegocioContacto.deleteMany()
    await tx.crmNegocioHubspot.deleteMany()
    await tx.crmPipelineEtapaHubspot.deleteMany()
    await tx.crmPipelineHubspot.deleteMany()
    if (pipelineRows.length > 0) await tx.crmPipelineHubspot.createMany({ data: pipelineRows })
    if (stageRows.length > 0) await tx.crmPipelineEtapaHubspot.createMany({ data: stageRows })
    if (dealRows.length > 0) await tx.crmNegocioHubspot.createMany({ data: dealRows })
    for (let index = 0; index < associationRows.length; index += 1000) {
      await tx.crmNegocioContacto.createMany({ data: associationRows.slice(index, index + 1000), skipDuplicates: true })
    }
    const availableDealIds = new Set(dealRows.map((deal) => deal.hubspotId))
    const preservedActivityDeals = localActivityDeals.filter((association) => availableDealIds.has(association.negocioHubspotId))
    if (preservedActivityDeals.length > 0) await tx.crmActividadNegocio.createMany({ data: preservedActivityDeals, skipDuplicates: true })
  }, { maxWait: 10_000, timeout: 60_000 })

  await reconciliarContactosCrmConClientes(contactRows.map((contact) => contact.email || ''))
  return {
    pipelinesDetectados: pipelines.length,
    etapasDetectadas: stages.length,
    negociosDetectados: snapshot.deals.length,
    asociacionesDetectadas: associationRows.length,
    contactosAsociados: contactRows.length,
  }
}

const CALL_DISPOSITIONS: Record<string, string> = {
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'CONTACTADO',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'BUZON_DE_VOZ',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'SIN_RESPUESTA',
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'OCUPADO',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'NUMERO_INCORRECTO',
}

function plainText(value?: string | null, maxLength = 20_000) {
  return String(value || '')
    .replace(/<\/(div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(x?[0-9a-f]+);/gi, (_match, code: string) => {
      const numeric = code.toLowerCase().startsWith('x') ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)
      return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : ''
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function callDirection(value?: string | null) {
  const normalized = String(value || '').toUpperCase()
  if (normalized === 'INBOUND' || normalized === 'ENTRANTE') return 'ENTRANTE'
  if (normalized === 'OUTBOUND' || normalized === 'SALIENTE') return 'SALIENTE'
  return null
}

async function persistHubspotCallSnapshot(snapshot: HubspotCallSnapshot, owners: HubspotOwner[], remoteContactRecords: HubspotRecord[], syncedAt: Date) {
  const ownersById = new Map(snapshot.calls.map((call) => [call.id, call]))
  const ownerNamesById = new Map(owners.map((owner) => [owner.id, ownerName(owner)]))
  const requestedContactIds = [...new Set(snapshot.contactAssociations.map((association) => association.contactId))]
  const remoteContacts = new Map(remoteContactRecords.map((contact) => [contact.id, contact]))
  const persisted = await prisma.$transaction(async (tx) => {
  const currentContacts = new Map((await tx.crmRegistroHubspot.findMany({
    where: { objectTypeId: '0-1', hubspotId: { in: requestedContactIds } },
    select: { id: true, hubspotId: true, propiedades: true, propiedadesLocales: true },
  })).map((contact) => [contact.hubspotId, contact]))

  const contactRows = requestedContactIds.map((hubspotId) => {
    const current = currentContacts.get(hubspotId)
    const record = remoteContacts.get(hubspotId)
    const sourceProperties = { ...asStringRecord(current?.propiedades), ...(record?.properties || {}) }
    const effectiveProperties = { ...sourceProperties, ...asStringRecord(current?.propiedadesLocales) }
    const fullName = [effectiveProperties.firstname, effectiveProperties.lastname].filter(Boolean).join(' ').trim()
    return {
      id: current?.id || randomUUID(), hubspotId, sourceProperties,
      nombre: fullName || effectiveProperties.email || `Contacto HubSpot #${hubspotId}`,
      email: effectiveProperties.email?.trim().toLowerCase() || null,
      telefono: effectiveProperties.phone || effectiveProperties.mobilephone || null,
      empresa: effectiveProperties.company || null,
      unidadesNegocio: parseCrmBusinessUnits(effectiveProperties[CRM_BUSINESS_UNIT_PROPERTY]),
      hubspotCreadoAt: toDate(record?.createdAt), hubspotActualizadoAt: toDate(record?.updatedAt),
    }
  })

  if (contactRows.length > 0) {
    const payload = JSON.stringify(contactRows.map((contact) => ({
      id: contact.id, hubspot_id: contact.hubspotId, nombre: contact.nombre, email: contact.email,
      telefono: contact.telefono, empresa: contact.empresa, unidades_negocio: contact.unidadesNegocio,
      propiedades: contact.sourceProperties, hubspot_creado_at: contact.hubspotCreadoAt?.toISOString() || null,
      hubspot_actualizado_at: contact.hubspotActualizadoAt?.toISOString() || null, sincronizado_at: syncedAt.toISOString(),
    })))
    await tx.$executeRaw`
      INSERT INTO crm_registros_hubspot AS existing (
        id, object_type_id, hubspot_id, nombre, email, telefono, empresa, unidades_negocio,
        propiedades, hubspot_creado_at, hubspot_actualizado_at, sincronizado_at, created_at, updated_at
      )
      SELECT row.id, '0-1', row.hubspot_id, row.nombre, row.email, row.telefono, row.empresa,
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(row.unidades_negocio, '[]'::jsonb))),
        row.propiedades, row.hubspot_creado_at, row.hubspot_actualizado_at, row.sincronizado_at, NOW(), NOW()
      FROM jsonb_to_recordset(${payload}::jsonb) AS row(
        id text, hubspot_id text, nombre text, email text, telefono text, empresa text,
        unidades_negocio jsonb, propiedades jsonb, hubspot_creado_at timestamptz,
        hubspot_actualizado_at timestamptz, sincronizado_at timestamptz
      )
      ON CONFLICT (object_type_id, hubspot_id) DO UPDATE SET
        nombre = EXCLUDED.nombre, email = EXCLUDED.email, telefono = EXCLUDED.telefono,
        empresa = EXCLUDED.empresa, unidades_negocio = EXCLUDED.unidades_negocio,
        propiedades = EXCLUDED.propiedades,
        hubspot_creado_at = COALESCE(EXCLUDED.hubspot_creado_at, existing.hubspot_creado_at),
        hubspot_actualizado_at = COALESCE(EXCLUDED.hubspot_actualizado_at, existing.hubspot_actualizado_at),
        sincronizado_at = EXCLUDED.sincronizado_at, updated_at = NOW()
    `
  }

  const localContacts = new Map((await tx.crmRegistroHubspot.findMany({
    where: { objectTypeId: '0-1', hubspotId: { in: requestedContactIds } }, select: { id: true, hubspotId: true },
  })).map((contact) => [contact.hubspotId, contact.id]))
  const callContactRows = snapshot.contactAssociations.flatMap((association) => {
    const contactoId = localContacts.get(association.contactId)
    return contactoId ? [{ callId: association.callId, contactoId }] : []
  })
  const contactsByCall = new Map<string, string[]>()
  for (const association of callContactRows) {
    contactsByCall.set(association.callId, [...(contactsByCall.get(association.callId) || []), association.contactoId])
  }
  const activityRows = snapshot.calls.flatMap((call) => {
    const contactoId = contactsByCall.get(call.id)?.[0]
    if (!contactoId) return []
    const properties = call.properties || {}
    const direction = callDirection(properties.hs_call_direction)
    const durationMs = Number(properties.hs_call_duration || 0)
    const ownerId = properties.hubspot_owner_id || null
    return [{
      id: randomUUID(), contactoId, hubspotId: call.id,
      titulo: plainText(properties.hs_call_title, 250) || (direction === 'ENTRANTE' ? 'Llamada entrante' : 'Llamada saliente'),
      descripcion: plainText(properties.hs_call_body) || 'Llamada importada sin resumen disponible.',
      fechaActividad: (toDate(properties.hs_timestamp || undefined) || toDate(call.createdAt) || syncedAt).toISOString(),
      direccion: direction,
      resultado: CALL_DISPOSITIONS[properties.hs_call_disposition || ''] || (properties.hs_call_disposition ? 'OTRO' : null),
      duracionSegundos: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : null,
      creadoPorNombre: (ownerId ? ownerNamesById.get(ownerId) : null) || (ownerId ? `HubSpot #${ownerId}` : 'HubSpot'),
    }]
  })

  if (activityRows.length > 0) {
    const payload = JSON.stringify(activityRows.map((activity) => ({
      id: activity.id, contacto_id: activity.contactoId, hubspot_id: activity.hubspotId,
      titulo: activity.titulo, descripcion: activity.descripcion, fecha_actividad: activity.fechaActividad,
      direccion: activity.direccion, resultado: activity.resultado, duracion_segundos: activity.duracionSegundos,
      creado_por_nombre: activity.creadoPorNombre,
    })))
    await tx.$executeRaw`
      INSERT INTO crm_actividades AS existing (
        id, contacto_id, tipo, titulo, descripcion, fecha_actividad, direccion, resultado,
        duracion_segundos, origen, hubspot_id, creado_por_nombre, created_at, updated_at
      )
      SELECT row.id, row.contacto_id, 'LLAMADA', row.titulo, row.descripcion, row.fecha_actividad,
        row.direccion, row.resultado, row.duracion_segundos, 'HUBSPOT', row.hubspot_id,
        row.creado_por_nombre, NOW(), NOW()
      FROM jsonb_to_recordset(${payload}::jsonb) AS row(
        id text, contacto_id text, hubspot_id text, titulo text, descripcion text,
        fecha_actividad timestamptz, direccion text, resultado text, duracion_segundos integer,
        creado_por_nombre text
      )
      ON CONFLICT (hubspot_id) DO UPDATE SET
        contacto_id = EXCLUDED.contacto_id,
        titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion,
        fecha_actividad = EXCLUDED.fecha_actividad, direccion = EXCLUDED.direccion,
        resultado = EXCLUDED.resultado, duracion_segundos = EXCLUDED.duracion_segundos,
        creado_por_nombre = EXCLUDED.creado_por_nombre, updated_at = NOW()
    `
  }

  const importedActivities = await tx.crmActividad.findMany({
    where: { origen: 'HUBSPOT', hubspotId: { in: snapshot.calls.map((call) => call.id) } },
    select: { id: true, hubspotId: true },
  })
  const importedActivityIds = importedActivities.map((activity) => activity.id)
  if (importedActivityIds.length > 0) {
    await tx.crmActividadContacto.deleteMany({ where: { actividadId: { in: importedActivityIds } } })
    await tx.crmActividadNegocio.deleteMany({ where: { actividadId: { in: importedActivityIds } } })
  }
  const activitiesByCall = new Map(importedActivities.flatMap((activity) => activity.hubspotId ? [[activity.hubspotId, activity.id] as const] : []))
  const activityContactRows = callContactRows.flatMap((association) => {
    const actividadId = activitiesByCall.get(association.callId)
    return actividadId ? [{ actividadId, contactoId: association.contactoId }] : []
  })
  if (activityContactRows.length > 0) await tx.crmActividadContacto.createMany({ data: activityContactRows, skipDuplicates: true })
  const availableDeals = new Set((await tx.crmNegocioHubspot.findMany({
    where: { hubspotId: { in: snapshot.dealAssociations.map((association) => association.dealId) } },
    select: { hubspotId: true },
  })).map((deal) => deal.hubspotId))
  const dealRows = snapshot.dealAssociations.flatMap((association) => {
    const actividadId = activitiesByCall.get(association.callId)
    return actividadId && availableDeals.has(association.dealId) ? [{ actividadId, negocioHubspotId: association.dealId }] : []
  })
  if (dealRows.length > 0) await tx.crmActividadNegocio.createMany({ data: dealRows, skipDuplicates: true })

  return {
    llamadasDetectadas: snapshot.calls.length,
    llamadasImportadas: activityRows.length,
    relacionesLlamadaContacto: activityContactRows.length,
    llamadasSinContacto: snapshot.calls.length - new Set(snapshot.contactAssociations.map((association) => association.callId)).size,
    relacionesLlamadaNegocio: dealRows.length,
    emails: contactRows.map((contact) => contact.email || ''),
  }
  }, { maxWait: 10_000, timeout: 60_000 })
  await reconciliarContactosCrmConClientes(persisted.emails)
  const { emails: _emails, ...result } = persisted
  return result
}

export async function previewHubspotLists() {
  const lists = await getAllHubspotLists()
  let active = 0
  let staticLists = 0

  for (const list of lists) {
    if (list.processingType === 'DYNAMIC') active += 1
    else staticLists += 1
  }

  return {
    lists,
    summary: {
      total: lists.length,
      active,
      static: staticLists,
      contacts: lists.filter((list) => list.objectTypeId === '0-1').length,
      companies: lists.filter((list) => list.objectTypeId === '0-2').length,
      deals: lists.filter((list) => list.objectTypeId === '0-3').length,
    },
  }
}

export async function previewHubspotSales() {
  const [snapshot, callSnapshot] = await Promise.all([getHubspotSalesSnapshot(), getHubspotCallSnapshot()])
  const pipelines = buildSalesDefinitions(snapshot)
  if (snapshot.deals.length > 0 && snapshot.pipelines.length === 0) {
    throw new Error('HubSpot ha devuelto negocios pero ningún pipeline. Se conserva el snapshot local anterior.')
  }
  const stageByKey = new Map(pipelines.flatMap((pipeline) => (pipeline.stages || []).map((stage) => [`${pipeline.id}:${stage.id}`, stage] as const)))
  const openDeals = snapshot.deals.filter((deal) => {
    const properties = deal.properties || {}
    const stage = stageByKey.get(`${properties.pipeline || '__SIN_PIPELINE__'}:${properties.dealstage || '__SIN_ETAPA__'}`)
    return !hubspotBoolean(properties.hs_is_closed) && !hubspotBoolean(stage?.metadata?.isClosed)
  }).length

  return {
    pipelines: pipelines.length,
    stages: pipelines.reduce((total, pipeline) => total + (pipeline.stages?.length || 0), 0),
    deals: snapshot.deals.length,
    openDeals,
    associations: snapshot.associations.length,
    contacts: new Set(snapshot.associations.map((association) => association.contactId)).size,
    calls: callSnapshot.calls.length,
    callAssociations: callSnapshot.contactAssociations.length,
  }
}

export async function syncHubspotSales(executedBy: string) {
  await prisma.crmSincronizacionHubspot.updateMany({
    where: { estado: 'EN_PROGRESO', finalizadoAt: null, iniciadoAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
    data: { estado: 'INTERRUMPIDA', bloqueo: null, finalizadoAt: new Date() },
  })
  let sync
  try {
    sync = await prisma.crmSincronizacionHubspot.create({
      data: { modo: 'NEGOCIOS', estado: 'EN_PROGRESO', bloqueo: 'hubspot-crm-write', ejecutadoPor: executedBy },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') throw new Error('Ya hay una sincronización de HubSpot en curso. Espera a que termine antes de iniciar otra.')
    throw error
  }

  try {
    const [snapshot, callSnapshot] = await Promise.all([getHubspotSalesSnapshot(), getHubspotCallSnapshot()])
    const [localDeals, localPipelines, localAssociations, localCalls] = await Promise.all([
      prisma.crmNegocioHubspot.count({ where: { activo: true } }),
      prisma.crmPipelineHubspot.count(),
      prisma.crmNegocioContacto.count(),
      prisma.crmActividad.count({ where: { origen: 'HUBSPOT', tipo: 'LLAMADA' } }),
    ])
    if (snapshot.deals.length === 0 && localDeals > 0) {
      throw new Error('HubSpot ha devuelto cero negocios de forma inesperada. Se conserva el snapshot comercial anterior.')
    }
    if (snapshot.deals.length > 0 && snapshot.pipelines.length === 0) {
      throw new Error('HubSpot ha devuelto negocios pero ningún pipeline. Se conserva el snapshot comercial anterior.')
    }
    if (snapshot.pipelines.length === 0 && localPipelines > 0) {
      throw new Error('HubSpot ha devuelto cero pipelines de forma inesperada. Se conserva el snapshot comercial anterior.')
    }
    if (snapshot.associations.length === 0 && localAssociations > 0 && snapshot.deals.length > 0) {
      throw new Error('HubSpot ha devuelto cero relaciones negocio-contacto de forma inesperada. Se conserva el snapshot comercial anterior.')
    }
    if (callSnapshot.calls.length === 0 && localCalls > 0) {
      throw new Error('HubSpot ha devuelto cero llamadas de forma inesperada. Se conserva la actividad histórica ya importada.')
    }

    const contactIds = [...new Set([
      ...snapshot.associations.map((association) => association.contactId),
      ...callSnapshot.contactAssociations.map((association) => association.contactId),
    ])]
    const activeContacts = await getRecords('0-1', contactIds)
    const activeIds = new Set(activeContacts.map((contact) => contact.id))
    const missingIds = contactIds.filter((id) => !activeIds.has(id))
    const archivedContacts = missingIds.length > 0 ? await getRecords('0-1', missingIds, undefined, true) : []
    const contacts = [...activeContacts, ...archivedContacts]
    const returnedIds = new Set(contacts.map((contact) => contact.id))
    const unavailableContacts = contactIds.filter((id) => !returnedIds.has(id))
    const syncedAt = new Date()
    const result = await persistHubspotSalesSnapshot(snapshot, contacts, syncedAt)
    const callResult = await persistHubspotCallSnapshot(callSnapshot, snapshot.owners, contacts, syncedAt)
    const details = unavailableContacts.length > 0
      ? [{ aviso: `${unavailableContacts.length} contactos asociados ya no están disponibles en HubSpot; se conservan como referencias locales.` }]
      : []
    details.push({ aviso: `${callResult.llamadasImportadas} relaciones de llamada-contacto importadas desde ${callResult.llamadasDetectadas} llamadas.` })

    await prisma.crmSincronizacionHubspot.update({
      where: { id: sync.id },
      data: {
        estado: 'COMPLETADA',
        bloqueo: null,
        finalizadoAt: new Date(),
        pipelinesDetectados: result.pipelinesDetectados,
        etapasDetectadas: result.etapasDetectadas,
        negociosDetectados: result.negociosDetectados,
        asociacionesDetectadas: result.asociacionesDetectadas,
        registrosActualizados: result.contactosAsociados,
        detalle: details,
      },
    })
    return { ...result, ...callResult, contactosNoDisponibles: unavailableContacts.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.crmSincronizacionHubspot.update({
      where: { id: sync.id },
      data: { estado: 'ERROR', bloqueo: null, errores: 1, detalle: [{ error: message }], finalizadoAt: new Date() },
    })
    throw error
  }
}

export async function syncHubspotLists(executedBy: string) {
  await prisma.crmSincronizacionHubspot.updateMany({
    where: { estado: 'EN_PROGRESO', finalizadoAt: null, iniciadoAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
    data: { estado: 'INTERRUMPIDA', bloqueo: null, finalizadoAt: new Date() },
  })
  let sync
  try {
    sync = await prisma.crmSincronizacionHubspot.create({
      data: { modo: 'MANUAL', estado: 'EN_PROGRESO', bloqueo: 'hubspot-crm-write', ejecutadoPor: executedBy },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') throw new Error('Ya hay una sincronización de HubSpot en curso. Espera a que termine antes de iniciar otra.')
    throw error
  }

  const startedAt = new Date()
  let created = 0
  let updated = 0
  let membershipsDetected = 0
  let recordsUpdated = 0
  const errors: Array<{ listId?: string; name?: string; error: string }> = []

  try {
    const catalog = await getAllHubspotLists()
    const localIds = new Set((await prisma.crmLista.findMany({ select: { hubspotId: true } })).map((row) => row.hubspotId))
    if (catalog.length === 0 && localIds.size > 0) {
      throw new Error('HubSpot ha devuelto un inventario vacío de forma inesperada. No se ha modificado ningún dato local.')
    }
    const details = new Map<string, HubspotList>()
    const memberships = new Map<string, Membership[]>()
    const recordIdsByType = new Map<string, Set<string>>()

    for (let index = 0; index < catalog.length; index += 6) {
      const batch = catalog.slice(index, index + 6)
      await Promise.all(batch.map(async (list) => {
        try {
          const [detail, memberData] = await Promise.all([
            getHubspotListDetail(list.listId),
            getHubspotMemberships(list.listId),
          ])
          details.set(list.listId, { ...list, ...detail })
          memberships.set(list.listId, memberData.results)
          membershipsDetected += memberData.total
          const ids = recordIdsByType.get(list.objectTypeId) || new Set<string>()
          memberData.results.forEach((member) => ids.add(member.recordId))
          recordIdsByType.set(list.objectTypeId, ids)
        } catch (error) {
          errors.push({ listId: list.listId, name: list.name, error: error instanceof Error ? error.message : String(error) })
        }
      }))
    }

    const localClients = await mapLocalClientsByEmail()
    const currentRecords = new Map(
      (await prisma.crmRegistroHubspot.findMany({
        select: {
          id: true,
          objectTypeId: true,
          hubspotId: true,
          clienteWebId: true,
          segmentoCrm: true,
          segmentoCrmActualizadoAt: true,
          segmentoCrmActualizadoPor: true,
          vinculoClienteOrigen: true,
          convertidoAt: true,
          propiedades: true,
          propiedadesCompletasAt: true,
          propiedadesLocales: true,
          notasInternas: true,
          historialCambios: true,
          datosActualizadoAt: true,
          datosActualizadoPor: true,
        },
      })).map((record) => [`${record.objectTypeId}:${record.hubspotId}`, record])
    )
    const propertyDefinitionsByType = new Map<string, HubspotPropertyDefinition[]>()
    for (const objectTypeId of recordIdsByType.keys()) {
      try {
        propertyDefinitionsByType.set(objectTypeId, await getHubspotPropertyDefinitions(objectTypeId))
      } catch (error) {
        errors.push({ error: `No se pudo leer el catálogo de propiedades ${objectTypeId}: ${error instanceof Error ? error.message : String(error)}` })
      }
    }
    const recordsByType = new Map<string, Map<string, HubspotRecord>>()
    for (const [objectTypeId, ids] of recordIdsByType) {
      try {
        const records = await getRecords(objectTypeId, [...ids])
        recordsByType.set(objectTypeId, new Map(records.map((record) => [record.id, record])))
      } catch (error) {
        errors.push({ error: `No se pudieron leer registros ${objectTypeId}: ${error instanceof Error ? error.message : String(error)}` })
      }
    }

    if (errors.length > 0) {
      throw new Error(`HubSpot no ha devuelto un snapshot completo (${errors.length} avisos). No se ha modificado ningún contacto ni ninguna membresía local.`)
    }

    const listIds = new Map<string, string>()
    for (const remoteList of catalog) {
      const detail = details.get(remoteList.listId) || remoteList
      const memberRows = memberships.get(remoteList.listId) || []
      const isNew = !localIds.has(remoteList.listId)
      const list = await prisma.crmLista.upsert({
        where: { hubspotId: remoteList.listId },
        create: {
          hubspotId: remoteList.listId,
          nombre: detail.name,
          objectTypeId: detail.objectTypeId,
          processingType: detail.processingType,
          processingStatus: detail.processingStatus,
          listVersion: detail.listVersion,
          criterios: detail.filterBranch as any,
          criteriosResumen: summarizeFilterBranch(detail.filterBranch) as any,
          propiedadesHubspot: detail.additionalProperties as any,
          tamanoHubspot: memberRows.length,
          filtrosActualizadosAt: toDate(detail.filtersUpdatedAt),
          hubspotCreadoAt: toDate(detail.createdAt),
          hubspotActualizadoAt: toDate(detail.updatedAt),
          hubspotCreatedById: detail.createdById,
          hubspotUpdatedById: detail.updatedById,
          sincronizadoAt: startedAt,
          ultimoError: errors.find((item) => item.listId === remoteList.listId)?.error,
          proposito: inferPurpose(detail.name),
          activo: true,
        },
        update: {
          nombre: detail.name,
          objectTypeId: detail.objectTypeId,
          processingType: detail.processingType,
          processingStatus: detail.processingStatus,
          listVersion: detail.listVersion,
          criterios: detail.filterBranch as any,
          criteriosResumen: summarizeFilterBranch(detail.filterBranch) as any,
          propiedadesHubspot: detail.additionalProperties as any,
          tamanoHubspot: memberRows.length,
          filtrosActualizadosAt: toDate(detail.filtersUpdatedAt),
          hubspotCreadoAt: toDate(detail.createdAt),
          hubspotActualizadoAt: toDate(detail.updatedAt),
          hubspotCreatedById: detail.createdById,
          hubspotUpdatedById: detail.updatedById,
          sincronizadoAt: startedAt,
          ultimoError: errors.find((item) => item.listId === remoteList.listId)?.error,
          activo: true,
        },
      })
      listIds.set(remoteList.listId, list.id)
      if (isNew) created += 1
      else updated += 1
    }

    const recordData: Array<{
      id: string
      objectTypeId: string
      hubspotId: string
      nombre: string | null
      email: string | null
      telefono: string | null
      empresa: string | null
      propiedades: Record<string, string | null>
      propiedadesCompletasAt: Date | null
      propiedadesLocales: Record<string, string | null> | null
      notasInternas: string | null
      historialCambios: any
      datosActualizadoAt: Date | null
      datosActualizadoPor: string | null
      clienteWebId: number | null
      segmentoCrm: 'PARTICULAR' | 'EMPRESA' | 'PARTNER' | null
      segmentoCrmActualizadoAt: Date | null
      segmentoCrmActualizadoPor: string | null
      vinculoClienteOrigen: string | null
      convertidoAt: Date | null
      hubspotCreadoAt: Date | null
      hubspotActualizadoAt: Date | null
      sincronizadoAt: Date
    }> = []
    for (const [objectTypeId, ids] of recordIdsByType) {
      const records = recordsByType.get(objectTypeId) || new Map<string, HubspotRecord>()
      for (const hubspotId of ids) {
        const record = records.get(hubspotId)
        const properties = { ...asStringRecord(currentRecords.get(`${objectTypeId}:${hubspotId}`)?.propiedades), ...(record?.properties || {}) }
        if (objectTypeId === '0-1' && record && !Object.prototype.hasOwnProperty.call(record.properties || {}, CRM_BUSINESS_UNIT_PROPERTY)) {
          properties[CRM_BUSINESS_UNIT_PROPERTY] = null
        }
        const current = currentRecords.get(`${objectTypeId}:${hubspotId}`)
        const localProperties = asStringRecord(current?.propiedadesLocales)
        const effectiveProperties = { ...properties, ...localProperties }
        const fullName = [effectiveProperties.firstname, effectiveProperties.lastname].filter(Boolean).join(' ').trim()
        const name = objectTypeId === '0-1'
          ? fullName || effectiveProperties.email || null
          : effectiveProperties.name || effectiveProperties.dealname || null
        const email = effectiveProperties.email?.trim().toLowerCase() || null
        const matchedClient = email ? localClients.get(email) : undefined
        const hasProtectedLink = Boolean(current?.clienteWebId && current.vinculoClienteOrigen !== 'EMAIL_AUTOMATICO')
        const clienteWebId = hasProtectedLink ? current!.clienteWebId : matchedClient?.id || current?.clienteWebId || null
        recordData.push({
          id: current?.id || randomUUID(),
          objectTypeId,
          hubspotId,
          nombre: name,
          email,
          telefono: effectiveProperties.phone || effectiveProperties.mobilephone || null,
          empresa: effectiveProperties.company || effectiveProperties.name || null,
          propiedades: properties,
          propiedadesCompletasAt: current?.propiedadesCompletasAt || null,
          propiedadesLocales: Object.keys(localProperties).length ? localProperties : null,
          notasInternas: current?.notasInternas || null,
          historialCambios: current?.historialCambios || null,
          datosActualizadoAt: current?.datosActualizadoAt || null,
          datosActualizadoPor: current?.datosActualizadoPor || null,
          clienteWebId,
          segmentoCrm: current?.segmentoCrm || matchedClient?.segmentoCrm || null,
          segmentoCrmActualizadoAt: current?.segmentoCrmActualizadoAt || (matchedClient ? startedAt : null),
          segmentoCrmActualizadoPor: current?.segmentoCrmActualizadoPor || (matchedClient ? 'Conversión automática a cliente' : null),
          vinculoClienteOrigen: current?.vinculoClienteOrigen || (matchedClient ? 'EMAIL_AUTOMATICO' : null),
          convertidoAt: clienteWebId ? current?.convertidoAt || startedAt : null,
          hubspotCreadoAt: toDate(record?.createdAt),
          hubspotActualizadoAt: toDate(record?.updatedAt),
          sincronizadoAt: startedAt,
        })
      }
    }
    const recordMap = new Map(recordData.map((row) => [`${row.objectTypeId}:${row.hubspotId}`, row.id]))
    const propertyDefinitionData = (propertyDefinitionsByType.get('0-1') || []).map((property) => ({
      objectTypeId: '0-1',
      nombre: property.name,
      etiqueta: property.label || property.name,
      grupoNombre: property.groupName || null,
      tipo: property.type || null,
      tipoCampo: property.fieldType || null,
      descripcion: property.description || null,
      opciones: property.options || [],
      soloLectura: Boolean(property.modificationMetadata?.readOnlyValue),
      oculta: Boolean(property.hidden),
      calculada: Boolean(property.calculated),
      ordenVisual: typeof property.displayOrder === 'number' ? property.displayOrder : null,
      hubspotCreadaAt: toDate(property.createdAt),
      hubspotActualizadaAt: toDate(property.updatedAt),
      sincronizadoAt: startedAt,
    }))

    const allMemberships: Array<{
      listaId: string
      registroId: string
      incorporadoAt: Date | null
      vistoEnHubspotAt: Date
      activo: boolean
    }> = []
    for (const remoteList of catalog) {
      const detail = details.get(remoteList.listId) || remoteList
      const memberRows = memberships.get(remoteList.listId) || []
      const listaId = listIds.get(remoteList.listId)
      if (!listaId) continue
      allMemberships.push(...memberRows.flatMap((member) => {
        const registroId = recordMap.get(`${detail.objectTypeId}:${member.recordId}`)
        return registroId ? [{
          listaId,
          registroId,
          incorporadoAt: toDate(member.membershipTimestamp),
          vistoEnHubspotAt: startedAt,
          activo: true,
        }] : []
      }))
    }
    for (let index = 0; index < recordData.length; index += 100) {
      const batch = recordData.slice(index, index + 100)
      await prisma.$transaction(batch.map((row) => prisma.crmRegistroHubspot.upsert({
        where: { objectTypeId_hubspotId: { objectTypeId: row.objectTypeId, hubspotId: row.hubspotId } },
        create: row,
        update: {
          propiedades: row.propiedades,
          propiedadesCompletasAt: row.propiedadesCompletasAt,
          hubspotCreadoAt: row.hubspotCreadoAt,
          hubspotActualizadoAt: row.hubspotActualizadoAt,
          sincronizadoAt: row.sincronizadoAt,
        },
      })))
    }
    await recomputeEffectiveContactFields(recordData.map((row) => row.id))

    const snapshotOperations: Prisma.PrismaPromise<unknown>[] = [
      prisma.crmPropiedadHubspot.deleteMany({ where: { objectTypeId: '0-1' } }),
    ]
    for (let index = 0; index < propertyDefinitionData.length; index += 500) {
      snapshotOperations.push(prisma.crmPropiedadHubspot.createMany({ data: propertyDefinitionData.slice(index, index + 500) }))
    }
    snapshotOperations.push(prisma.crmListaMiembro.deleteMany())
    for (let index = 0; index < allMemberships.length; index += 1000) {
      snapshotOperations.push(prisma.crmListaMiembro.createMany({ data: allMemberships.slice(index, index + 1000), skipDuplicates: true }))
    }
    await prisma.$transaction(snapshotOperations)
    recordsUpdated = recordData.length

    const remoteIds = catalog.map((list) => list.listId)
    await prisma.crmLista.updateMany({
      where: { hubspotId: { notIn: remoteIds } },
      data: { activo: false },
    })
    await reconciliarContactosCrmConClientes()

    const result = {
      listasDetectadas: catalog.length,
      listasCreadas: created,
      listasActualizadas: updated,
      miembrosDetectados: membershipsDetected,
      registrosActualizados: recordsUpdated,
      propiedadesDetectadas: propertyDefinitionData.length,
      errores: errors.length,
      detalle: errors,
    }

    await prisma.crmSincronizacionHubspot.update({
      where: { id: sync.id },
      data: { ...result, estado: 'COMPLETADA', bloqueo: null, finalizadoAt: new Date() },
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.crmSincronizacionHubspot.update({
      where: { id: sync.id },
      data: { estado: 'ERROR', bloqueo: null, errores: errors.length + 1, detalle: [...errors, { error: message }], finalizadoAt: new Date() },
    })
    throw error
  }
}
