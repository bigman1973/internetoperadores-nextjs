import { Prisma, SegmentoCrm } from '@prisma/client'
import prisma from '@/lib/prisma'
import { hubspotRequest } from '@/lib/hubspot-listas'
import { normalizarNif } from '@/lib/crm-empresas'

const CORE_PROPERTIES = ['name', 'domain', 'phone', 'address', 'city', 'state', 'zip', 'country', 'industry', 'description', 'website']
const CANDIDATE_TAX_PROPERTIES = ['nif', 'cif', 'vat_number', 'tax_id', 'hs_tax_id', 'numero_identificacion_fiscal']
const MAX_PAGES_PER_BATCH = 3

type CompanyRecord = { id: string; properties: Record<string, string | null>; updatedAt?: string }
type Page = { results?: CompanyRecord[]; paging?: { next?: { after?: string } } }
type Association = { toObjectId: number | string; associationTypes?: Array<{ category?: string; typeId?: number; label?: string | null }> }
type AssociationResponse = { results?: Array<{ from: { id: string }; to?: Association[]; paging?: { next?: { after?: string } } }> }
type ContactBatchResponse = { results?: Array<{ id: string; properties?: Record<string, string | null> }> }

async function properties() {
  try {
    const data = await hubspotRequest<{ results?: Array<{ name: string }> }>('/crm/v3/properties/companies')
    const present = new Set((data.results || []).map((property) => property.name))
    return [...CORE_PROPERTIES, ...CANDIDATE_TAX_PROPERTIES.filter((name) => present.has(name))]
  } catch {
    return CORE_PROPERTIES // Algunas apps no tienen permiso para leer el catálogo: el traspaso básico sigue.
  }
}

export async function previewCompaniesImport() {
  const cols = await properties()
  const query = new URLSearchParams({ limit: '1', archived: 'false', properties: cols.join(',') })
  const [remote, local, contacts] = await Promise.all([
    hubspotRequest<Page>(`/crm/v3/objects/companies?${query}`),
    prisma.crmEmpresa.count(),
    prisma.crmRegistroHubspot.count({ where: { objectTypeId: '0-1' } }),
  ])
  return { remoteAvailable: Boolean(remote.results?.length), local, contacts, taxProperties: cols.filter((column) => CANDIDATE_TAX_PROPERTIES.includes(column)), note: 'La API paginada de HubSpot no facilita un recuento total sin recorrer todas sus páginas. El lote informará de las cifras comprobadas.' }
}

export async function importCompaniesBatch(actor: string, after?: string) {
  if (after && !/^\d{1,32}$/.test(after)) throw new Error('Cursor de importación no válido.')
  const cols = await properties()
  await prisma.crmSincronizacionHubspot.updateMany({ where: { bloqueo: 'EMPRESAS', iniciadoAt: { lt: new Date(Date.now() - 12 * 60_000) } }, data: { bloqueo: null, estado: 'ERROR', finalizadoAt: new Date() } })
  const run = await prisma.crmSincronizacionHubspot.create({ data: { modo: 'EMPRESAS', estado: 'EJECUTANDO', bloqueo: 'EMPRESAS', ejecutadoPor: actor, detalle: { cursorInicial: after || null } } })
  let cursor: string | undefined = after
  const totals = { companies: 0, associations: 0, missingContacts: 0, taxIdentifiers: 0, pages: 0 }
  try {
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_BATCH; pageIndex++) {
      const query = new URLSearchParams({ limit: '100', archived: 'false', properties: cols.join(',') })
      if (cursor) query.set('after', cursor)
      const page = await hubspotRequest<Page>(`/crm/v3/objects/companies?${query}`)
      const companies = page.results || []
      if (!companies.length) { cursor = undefined; break }
      const associationResponse = await hubspotRequest<AssociationResponse>('/crm/v4/associations/companies/contacts/batch/read', { method: 'POST', body: JSON.stringify({ inputs: companies.map(({ id }) => ({ id })) }) })
      for (const record of associationResponse.results || []) {
        if (!record.paging?.next?.after && (record.to || []).length < 1000) continue
        const all: Association[] = []
        let next: string | undefined
        do {
          const pagination = new URLSearchParams({ limit: '500' })
          if (next) pagination.set('after', next)
          const extended = await hubspotRequest<{ results?: Association[]; paging?: { next?: { after?: string } } }>(`/crm/v4/objects/companies/${encodeURIComponent(record.from.id)}/associations/contacts?${pagination}`)
          all.push(...(extended.results || []))
          next = extended.paging?.next?.after
        } while (next)
        record.to = all
      }
      const companyIds = companies.map((company) => company.id)
      const allContactIds = [...new Set((associationResponse.results || []).flatMap((record) => (record.to || []).map((to) => String(to.toObjectId))))]
      const [existing, localContacts] = await Promise.all([
        prisma.crmEmpresa.findMany({ where: { hubspotId: { in: companyIds } }, select: { id: true, hubspotId: true, version: true } }),
        prisma.crmRegistroHubspot.findMany({ where: { objectTypeId: '0-1', hubspotId: { in: allContactIds } }, select: { id: true, hubspotId: true } }),
      ])
      const existingByHubspot = new Map(existing.map((company) => [company.hubspotId, company]))
      const contactsByHubspot = new Map(localContacts.map((contact) => [contact.hubspotId, contact.id]))
      const now = new Date()
      const missingIds = allContactIds.filter((hubspotId) => !contactsByHubspot.has(hubspotId))
      for (let index = 0; index < missingIds.length; index += 100) {
        const ids = missingIds.slice(index, index + 100)
        let remote: ContactBatchResponse = {}
        try {
          remote = await hubspotRequest<ContactBatchResponse>('/crm/v3/objects/contacts/batch/read', { method: 'POST', body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: ['firstname', 'lastname', 'email', 'phone', 'company'] }) })
        } catch { /* Un contacto archivado o inaccesible se conserva como ficha pendiente de completar. */ }
        const byId = new Map((remote.results || []).map((contact) => [contact.id, contact.properties || {}]))
        const placeholders = ids.filter((id) => !byId.has(id))
        totals.missingContacts += placeholders.length
        await prisma.crmRegistroHubspot.createMany({ data: ids.map((hubspotId) => {
          const p = byId.get(hubspotId) || {}
          const nombre = [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || `Contacto HubSpot #${hubspotId}`
          return { objectTypeId: '0-1', hubspotId, nombre, email: p.email || null, telefono: p.phone || null, empresa: p.company || null,
            propiedades: p as Prisma.InputJsonValue, sincronizadoAt: now,
            ...(byId.has(hubspotId) ? {} : { propiedadesCompletasError: 'Pendiente de completar: no disponible al importar su empresa' }),
          }
        }), skipDuplicates: true })
      }
      if (missingIds.length) {
        const hydrated = await prisma.crmRegistroHubspot.findMany({ where: { objectTypeId: '0-1', hubspotId: { in: missingIds } }, select: { id: true, hubspotId: true } })
        for (const contact of hydrated) contactsByHubspot.set(contact.hubspotId, contact.id)
      }
      const prepared = companies.map((company) => {
        const p = company.properties || {}
        const fiscal = CANDIDATE_TAX_PROPERTIES.map((name) => p[name]?.trim()).find(Boolean) || null
        // Nunca inferimos el autónomo solo por el NIF: la forma jurídica precisa validación humana.
        const fields = {
          nombre: p.name?.trim() || `Empresa HubSpot #${company.id}`, dominio: p.domain?.trim().toLowerCase() || null,
          telefono: p.phone?.trim() || null, web: p.website?.trim() || null, sector: p.industry?.trim() || null,
          direccion: p.address?.trim() || null, localidad: p.city?.trim() || null, provincia: p.state?.trim() || null,
          codigoPostal: p.zip?.trim() || null, pais: p.country?.trim() || null, descripcion: p.description?.trim() || null,
          nif: fiscal, nifNormalizado: normalizarNif(fiscal),
        }
        return { id: company.id, fields, source: p }
      })
      // Se crean solo IDs de origen no existentes. Las cuentas manuales similares NO se fusionan por nombre/dominio.
      await prisma.crmEmpresa.createMany({ data: prepared.filter((item) => !existingByHubspot.has(item.id)).map((item) => ({ hubspotId: item.id, ...item.fields, origen: 'HUBSPOT', segmentoCrm: 'EMPRESA' as SegmentoCrm, tipo: 'SOCIEDAD', propiedadesHubspot: item.source as Prisma.InputJsonValue, sincronizadoAt: now })), skipDuplicates: true })
      const refreshed = await prisma.crmEmpresa.findMany({ where: { hubspotId: { in: companyIds } }, select: { id: true, hubspotId: true, version: true } })
      const companiesByHubspot = new Map(refreshed.map((company) => [company.hubspotId, company]))
      for (const item of prepared) {
        const previous = existingByHubspot.get(item.id)
        if (!previous) continue
        // El snapshot se conserva siempre; los campos comerciales solo si aún no hubo edición local.
        const snapshot = { propiedadesHubspot: item.source as Prisma.InputJsonValue, sincronizadoAt: now }
        const updated = previous.version === 0 ? await prisma.crmEmpresa.updateMany({ where: { id: previous.id, version: 0 }, data: { ...item.fields, ...snapshot } }) : { count: 0 }
        if (!updated.count) await prisma.crmEmpresa.update({ where: { id: previous.id }, data: snapshot })
      }
      const associations: Array<{ empresaId: string; contactoId: string; origen: string; papel: string | null }> = []
      const primaries: Array<{ empresaId: string; contactoId: string }> = []
      for (const item of associationResponse.results || []) {
        const company = companiesByHubspot.get(String(item.from.id))
        if (!company) continue
        for (const to of item.to || []) {
          const contactId = contactsByHubspot.get(String(to.toObjectId))
          if (!contactId) { totals.missingContacts++; continue }
          const types = to.associationTypes || []
          associations.push({ empresaId: company.id, contactoId: contactId, origen: 'HUBSPOT', papel: types.some((label) => label.typeId === 930) ? 'FACTURACION' : null })
          if (types.some((label) => label.category === 'HUBSPOT_DEFINED' && label.typeId === 2)) primaries.push({ empresaId: company.id, contactoId: contactId })
        }
      }
      for (let i = 0; i < associations.length; i += 200) await prisma.crmEmpresaContacto.createMany({ data: associations.slice(i, i + 200), skipDuplicates: true })
      const processedPrimaries = new Set<string>()
      for (const primary of primaries) {
        if (processedPrimaries.has(primary.contactoId)) continue
        await prisma.$transaction(async (tx) => {
          // Mismo lock que usa el alta/edición manual del vínculo.
          await tx.$queryRaw`SELECT id FROM crm_registros_hubspot WHERE id = ${primary.contactoId} FOR UPDATE`
          const hasPrimary = await tx.crmEmpresaContacto.count({ where: { contactoId: primary.contactoId, activo: true, principal: true } })
          if (!hasPrimary) await tx.crmEmpresaContacto.updateMany({ where: { ...primary, activo: true, origen: 'HUBSPOT' }, data: { principal: true } })
        })
        processedPrimaries.add(primary.contactoId)
      }
      totals.companies += companies.length
      totals.associations += associations.length
      totals.taxIdentifiers += prepared.filter((item) => item.fields.nif).length
      totals.pages++
      cursor = page.paging?.next?.after
      await prisma.crmSincronizacionHubspot.update({ where: { id: run.id }, data: { registrosActualizados: totals.companies, asociacionesDetectadas: totals.associations, detalle: { ...totals, nextAfter: cursor || null, propiedades: cols } } })
      if (!cursor) break
    }
    await prisma.crmSincronizacionHubspot.update({ where: { id: run.id }, data: { bloqueo: null, estado: 'COMPLETADO', finalizadoAt: new Date(), registrosActualizados: totals.companies, asociacionesDetectadas: totals.associations, detalle: { ...totals, nextAfter: cursor || null, propiedades: cols } } })
    return { ...totals, nextAfter: cursor || null }
  } catch (error) {
    await prisma.crmSincronizacionHubspot.update({ where: { id: run.id }, data: { bloqueo: null, estado: 'ERROR', errores: 1, finalizadoAt: new Date(), detalle: { ...totals, nextAfter: cursor || null, mensaje: error instanceof Error ? error.message.slice(0, 250) : 'Error desconocido' } } }).catch(() => {})
    throw error
  }
}
