import prisma from '@/lib/prisma'
import { reconciliarContactosCrmConClientes } from '@/lib/crm-contactos'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'

const HUBSPOT_BASE = 'https://api.hubapi.com'
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company']
const COMPANY_PROPERTIES = ['name', 'domain', 'phone']
const DEAL_PROPERTIES = ['dealname', 'amount', 'dealstage', 'pipeline']

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
  const response = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  if (response.status === 429 && attempt < 3) {
    const retryAfter = Number(response.headers.get('retry-after') || 1)
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000))
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

async function getRecords(objectTypeId: string, ids: string[], requestedProperties?: string[]): Promise<HubspotRecord[]> {
  const object = objectPath(objectTypeId)
  if (!object || ids.length === 0) return []

  const records: HubspotRecord[] = []
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100)
    const data = await hubspotRequest<{ results?: HubspotRecord[] }>(
      `/crm/v3/objects/${object.path}/batch/read?archived=false`,
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
  definitions: HubspotPropertyDefinition[]
): Promise<HubspotRecord[]> {
  if (objectTypeId !== '0-1') return getRecords(objectTypeId, ids)

  const propertyNames = definitions.map((property) => property.name)
  const records = await getRecords(objectTypeId, ids, propertyNames)
  return records.map((record) => ({
    ...record,
    properties: Object.fromEntries(
      Object.entries(record.properties || {}).filter(([, value]) => value != null && String(value).trim() !== '')
    ),
  }))
}

export async function syncHubspotContactProperties(hubspotId: string) {
  const definitions = await getHubspotPropertyDefinitions('0-1')
  const records = await getRecordsWithAllProperties('0-1', [hubspotId], definitions)
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

export async function syncHubspotContactPropertyBatch(limit = 100) {
  const batchSize = Math.min(Math.max(limit, 1), 100)
  const contacts = await prisma.crmRegistroHubspot.findMany({
    where: { objectTypeId: '0-1', propiedadesCompletasAt: null, listas: { some: { activo: true, lista: { activo: true } } } },
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
  if (records.length !== contacts.length) {
    throw new Error(`HubSpot devolvió ${records.length} de ${contacts.length} contactos. No se ha guardado este lote incompleto.`)
  }
  const now = new Date()
  const operations: Prisma.PrismaPromise<unknown>[] = [
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
  ]
  const affectedEmails: string[] = []
  for (const contact of contacts) {
    const record = byHubspotId.get(contact.hubspotId)!
    const properties = record.properties || {}
    if (contact.email) affectedEmails.push(contact.email)
    operations.push(prisma.crmRegistroHubspot.update({
      where: { id: contact.id },
      data: {
        propiedades: properties,
        propiedadesCompletasAt: now,
        hubspotCreadoAt: toDate(record.createdAt),
        hubspotActualizadoAt: toDate(record.updatedAt),
        sincronizadoAt: now,
      },
    }))
  }
  await prisma.$transaction(operations)
  await recomputeEffectiveContactFields(contacts.map((contact) => contact.id))
  const refreshedContacts = await prisma.crmRegistroHubspot.findMany({ where: { id: { in: contacts.map((contact) => contact.id) } }, select: { email: true } })
  refreshedContacts.forEach((contact) => { if (contact.email) affectedEmails.push(contact.email) })
  await reconciliarContactosCrmConClientes(affectedEmails)
  const remaining = await prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1', propiedadesCompletasAt: null, listas: { some: { activo: true, lista: { activo: true } } } } })
  return { processed: contacts.length, remaining, definitions: definitions.length }
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

async function recomputeEffectiveContactFields(ids: string[]) {
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
