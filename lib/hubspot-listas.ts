import prisma from '@/lib/prisma'

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

async function getRecords(objectTypeId: string, ids: string[]): Promise<HubspotRecord[]> {
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
          properties: object.properties,
        }),
      }
    )
    records.push(...(data.results || []))
  }
  return records
}

function toDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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
    select: { id: true, email: true },
  })
  return new Map(clients.map((client) => [client.email.trim().toLowerCase(), client.id]))
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
    where: { estado: 'EN_PROGRESO', finalizadoAt: null },
    data: { estado: 'INTERRUMPIDA', finalizadoAt: new Date() },
  })
  const sync = await prisma.crmSincronizacionHubspot.create({
    data: { modo: 'MANUAL', estado: 'EN_PROGRESO', ejecutadoPor: executedBy },
  })

  const startedAt = new Date()
  let created = 0
  let updated = 0
  let membershipsDetected = 0
  let recordsUpdated = 0
  const errors: Array<{ listId?: string; name?: string; error: string }> = []

  try {
    const catalog = await getAllHubspotLists()
    const localIds = new Set((await prisma.crmLista.findMany({ select: { hubspotId: true } })).map((row) => row.hubspotId))
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
    const recordsByType = new Map<string, Map<string, HubspotRecord>>()
    for (const [objectTypeId, ids] of recordIdsByType) {
      try {
        const records = await getRecords(objectTypeId, [...ids])
        recordsByType.set(objectTypeId, new Map(records.map((record) => [record.id, record])))
      } catch (error) {
        errors.push({ error: `No se pudieron leer registros ${objectTypeId}: ${error instanceof Error ? error.message : String(error)}` })
      }
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
      objectTypeId: string
      hubspotId: string
      nombre: string | null
      email: string | null
      telefono: string | null
      empresa: string | null
      propiedades: Record<string, string | null>
      clienteWebId: number | null
      hubspotCreadoAt: Date | null
      hubspotActualizadoAt: Date | null
      sincronizadoAt: Date
    }> = []
    for (const [objectTypeId, ids] of recordIdsByType) {
      const records = recordsByType.get(objectTypeId) || new Map<string, HubspotRecord>()
      for (const hubspotId of ids) {
        const record = records.get(hubspotId)
        const properties = record?.properties || {}
        const fullName = [properties.firstname, properties.lastname].filter(Boolean).join(' ').trim()
        const name = objectTypeId === '0-1'
          ? fullName || properties.email || null
          : properties.name || properties.dealname || null
        const email = properties.email?.trim().toLowerCase() || null
        recordData.push({
          objectTypeId,
          hubspotId,
          nombre: name,
          email,
          telefono: properties.phone || properties.mobilephone || null,
          empresa: properties.company || properties.name || null,
          propiedades: properties,
          clienteWebId: email ? localClients.get(email) || null : null,
          hubspotCreadoAt: toDate(record?.createdAt),
          hubspotActualizadoAt: toDate(record?.updatedAt),
          sincronizadoAt: startedAt,
        })
      }
    }
    const recordOperations = [prisma.crmRegistroHubspot.deleteMany()]
    for (let index = 0; index < recordData.length; index += 500) {
      recordOperations.push(prisma.crmRegistroHubspot.createMany({ data: recordData.slice(index, index + 500) }))
    }
    await prisma.$transaction(recordOperations)
    recordsUpdated = recordData.length

    const recordRows = await prisma.crmRegistroHubspot.findMany({
      select: { id: true, objectTypeId: true, hubspotId: true },
    })
    const recordMap = new Map(recordRows.map((row) => [`${row.objectTypeId}:${row.hubspotId}`, row.id]))

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
    const membershipOperations = []
    for (let index = 0; index < allMemberships.length; index += 1000) {
      membershipOperations.push(prisma.crmListaMiembro.createMany({ data: allMemberships.slice(index, index + 1000), skipDuplicates: true }))
    }
    if (membershipOperations.length > 0) await prisma.$transaction(membershipOperations)

    const remoteIds = catalog.map((list) => list.listId)
    await prisma.crmLista.updateMany({
      where: { hubspotId: { notIn: remoteIds } },
      data: { activo: false },
    })

    const result = {
      listasDetectadas: catalog.length,
      listasCreadas: created,
      listasActualizadas: updated,
      miembrosDetectados: membershipsDetected,
      registrosActualizados: recordsUpdated,
      errores: errors.length,
      detalle: errors,
    }

    await prisma.crmSincronizacionHubspot.update({
      where: { id: sync.id },
      data: { ...result, estado: errors.length ? 'COMPLETADA_CON_AVISOS' : 'COMPLETADA', finalizadoAt: new Date() },
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.crmSincronizacionHubspot.update({
      where: { id: sync.id },
      data: { estado: 'ERROR', errores: errors.length + 1, detalle: [...errors, { error: message }], finalizadoAt: new Date() },
    })
    throw error
  }
}
