import { APPROVED_ROLES, approvedCodePermissions } from './approved-roles'
import { AREA4_DASHBOARD_BLOCKS, AREA4_DASHBOARD_KPIS, AREA4_DASHBOARD_LAYOUTS, AREA4_DRAXTON_TECHNICAL_MENU, area4RegisteredSurface, area4SectionByKey, type Area4DashboardReader } from './section-registry'
import type { ApprovedRoleKey } from './users-contract'
import type { Area4Principal } from './policy'
import type { DashboardBlock, DashboardData, DashboardKpi, DashboardModel, DashboardPoint, DashboardRow } from './dashboard-contract'
import type { ResumenCrm } from '../area1-crm-resumen'
export type DashboardContext = { principal: Area4Principal; name: string; profile?: string | null; owner: boolean; acting: boolean; now: Date; canRead: (sectionKey: string, sourcePath: string) => boolean }
export type DashboardFinance = { points: DashboardPoint[]; yearTotal: number | null; monthTotal: number | null; invoiceCount: number | null; monthCount: number | null; confirmed: number | null; pendingReal: number | null; withoutStatement: number | null; revisionCount: number | null; cutoff: string | null }
export type DashboardReaders = { finance: () => Promise<DashboardFinance>; clients: () => Promise<{ total: number; empresas: number; particulares: number }>; contracts: () => Promise<{ total: number; tarifas: number | null }>; crm: () => Promise<ResumenCrm>; rentabilidad: () => Promise<DashboardPoint[]>; decisions?: () => Promise<DashboardRow[]> }
export const dashboardUnavailable = (): DashboardData => ({ state: 'unavailable', message: 'Sin dato. No se ha podido comprobar la fuente.' })
const fmt = (n: number | null | undefined, unit = '') => n == null || !Number.isFinite(n) ? 'sin dato' : n.toLocaleString('es-ES', { maximumFractionDigits: unit === ' %' ? 1 : 0 }) + unit
const soon = (): DashboardData => ({ state: 'soon', message: 'Próximamente. Todavía no hay un lector disponible para este apartado.' })
const empty = (message: string): DashboardData => ({ state: 'empty', message })
export function dashboardRole(context: Pick<DashboardContext, 'principal' | 'profile' | 'owner'>, readableTechnical: boolean): ApprovedRoleKey {
  if (context.owner) return 'superadmin'
  const profile = APPROVED_ROLES.find(r => r.key !== 'superadmin' && r.name === context.profile)
  if (profile) return profile.key
  if (context.principal.rol === 'GERENTE') return 'gerente'
  if (context.principal.rol === 'CONTABILIDAD') return 'contabilidad'
  if (['VENTAS','MARKETING'].includes(context.principal.rol)) return 'comercial'
  return readableTechnical ? 'draxton' : 'empleado'
}
function words(context: DashboardContext) {
  const month = context.now.toLocaleDateString('es-ES', { month: 'long', timeZone: 'Europe/Madrid' })
  const year = context.now.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Europe/Madrid' })
  return { month, year, label: (text: string) => text.replaceAll('{month}', month).replaceAll('{year}', year) }
}
function allowed(context: DashboardContext, definition: { sectionKey: string; sourcePath: string }): boolean {
  const section = area4SectionByKey(definition.sectionKey)
  const surface = area4RegisteredSurface(definition.sourcePath, 'page')
  return Boolean(section && surface && surface.section.areaCode === section.areaCode && context.canRead(definition.sectionKey, definition.sourcePath))
}
/** No globals, no cross-person cache. The reader is never called without its source V. */
export async function loadDashboardModel(context: DashboardContext, readers: DashboardReaders): Promise<DashboardModel> {
  const technical = AREA4_DRAXTON_TECHNICAL_MENU.some(m => context.canRead(m.section, m.href))
  const role = dashboardRole(context, technical)
  const layout = AREA4_DASHBOARD_LAYOUTS[role]
  const blockDefinitions = layout.columns.flatMap(c => c).map(id => AREA4_DASHBOARD_BLOCKS.find(b => b.id === id)!).filter(d => allowed(context, d))
  const kpiDefinitions = layout.kpis.map(id => AREA4_DASHBOARD_KPIS.find(k => k.id === id)!).filter(d => allowed(context, d))
  const definitions = [...blockDefinitions, ...kpiDefinitions]
  const needed = new Set(definitions.map(d => d.reader))
  // Source restrictions are an intersection: a custom Clients/Finance grant cannot
  // make the commercial/technical/employee dashboard disclose global figures.
  if (['comercial','draxton','empleado'].includes(role)) for (const key of ['finance','clients','contracts','rentabilidad'] as const) needed.delete(key)
  if (!context.owner || context.acting) needed.delete('rentabilidad')
  if (!context.owner || context.acting) needed.delete('decisions')
  // CRM summary is broad: only run when both CRM and Leads are readable. It never goes to Graph.
  if (!context.canRead('crm', '/admin/crm') || !context.canRead('leads', '/admin/leads') || !context.canRead('crm.contactos', '/admin/crm/contactos') || !context.canRead('crm', '/admin/crm/pipelines')) needed.delete('crm')
  const data: Partial<{ finance: DashboardFinance; clients: { total: number; empresas: number; particulares: number }; contracts: { total: number; tarifas: number | null }; crm: ResumenCrm; rentabilidad: DashboardPoint[]; decisions: DashboardRow[] }> = {}
  await Promise.all([...needed].filter((key): key is Exclude<Area4DashboardReader,'soon'> => key !== 'soon').map(async key => {
    try { if (readers[key]) { const value = await readers[key](); Object.assign(data, { [key]: value }) } } catch { /* Failure = unknown, never fabricated 0. */ }
  }))
  const w = words(context)
  const financeRows = (): DashboardRow[] => !data.finance ? [] : [
    { badge: fmt(data.finance.pendingReal, ' €'), tone: 'w', title: 'Cobros por confirmar', detail: 'Pendiente real según el corte bancario verificado.', href: '/admin/finanzas/conciliar', action: 'Conciliar' },
    { badge: fmt(data.finance.withoutStatement, ' €'), tone: 'w', title: 'Sin extracto bancario cargado', detail: 'No se sabe si se cobró. No se presenta como deuda.', href: '/admin/finanzas/conciliar', action: 'Ver' },
    { badge: fmt(data.finance.revisionCount), tone: 'w', title: 'Facturas en revisión', detail: 'Cobro no atribuible con certeza.', href: '/admin/facturacion', action: 'Revisar' },
  ]
  const blockData = (id: string): DashboardData => {
    if (id === 'decisiones') return data.decisions?.length ? { state: 'ready', rows: data.decisions } : empty('No hay decisiones pendientes comprobadas en las fuentes disponibles.')
    if (['altas','permanencias','cierre','gastos-equipo','objetivo','draxton-facturas','draxton-documentos','mis-gastos','mis-documentos','comunicados'].includes(id)) return soon()
    if (id === 'facturado') return data.finance ? { state: 'ready', points: data.finance.points } : dashboardUnavailable()
    if (id === 'margen') return data.rentabilidad?.some(p => p.value !== null) ? { state: 'ready', points: data.rentabilidad, message: 'Fuente: último informe preparado de Rentabilidad; no se recalcula ni se confirma nada.' } : dashboardUnavailable()
    if (['avisos','para-hoy'].includes(id)) return data.finance ? { state: 'ready', rows: financeRows() } : dashboardUnavailable()
    if (!data.crm) return dashboardUnavailable()
    if (id === 'mi-dia') {
      const rows: DashboardRow[] = [
        ...data.crm.reunionesHoy.map(r => ({ badge: r.hora, title: r.quien, detail: r.que, href: `/admin/crm/contactos/${encodeURIComponent(r.contactoId)}`, action: 'Abrir' })),
        ...data.crm.tareas.filter(t => t.grupo !== 'SEMANA').map(t => ({ badge: t.grupo === 'VENCIDA' ? 'Vencida' : 'Hoy', tone: t.grupo === 'VENCIDA' ? 'b' as const : 'w' as const, title: t.titulo, detail: t.detalle, href: `/admin/crm/contactos/${encodeURIComponent(t.contactoId)}`, action: 'Abrir' })),
      ]
      return rows.length ? { state: 'ready', rows, message: 'Solo reuniones ya guardadas y tareas de esta persona. No se consulta Outlook.' } : empty('No hay reuniones ni tareas de hoy pendientes para esta persona.')
    }
    if (id === 'negocios') {
      const rows = data.crm.pipelines.filter(p => p.total > 0).map(p => ({ badge: fmt(p.total), tone: 'a' as const, title: p.nombre, detail: p.etapas.filter(e => e.n > 0).map(e => `${e.nombre}: ${e.n}`).join(' · '), href: `/admin/crm/pipelines?pipeline=${encodeURIComponent(p.id)}`, action: 'Abrir' }))
      return rows.length ? { state: 'ready', rows } : empty('No hay negocios abiertos de esta persona.')
    }
    if (id === 'leads-nuevos') return { state: 'ready', rows: [{ badge: fmt(data.crm.kpis.leadsSinContactar), tone: 'w', title: 'Leads nuevos sin contactar', detail: 'Asignados a esta persona, en estado Nuevo desde hace más de 7 días.', href: '/admin/leads', action: 'Ver' }] }
    return soon()
  }
  const columns = layout.columns.map(ids => ids.flatMap(id => {
    const d = blockDefinitions.find(b => b.id === id)
    if (!d) return []
    const b: DashboardBlock = { ...blockData(id), id, sectionKey: d.sectionKey, title: w.label(d.title), help: w.label(d.help), href: d.sourcePath, chart: d.chart }
    // Every drill-down intersects current V; no arbitrary/private URLs from helpers.
    if (b.rows) b.rows = b.rows.filter(row => {
      if (!row.href) return true
      const target = area4RegisteredSurface(row.href, 'page')
      return Boolean(target && context.canRead(target.section.key, row.href))
    })
    return [b]
  }))
  const lastMargin = data.rentabilidad?.filter(p => p.value !== null).at(-1)
  const kpis: DashboardKpi[] = kpiDefinitions.map(d => {
    let value = 'sin dato', sub = d.reader === 'soon' ? 'Próximamente' : 'Fuente no disponible'
    const f = data.finance, c = data.crm
    switch (d.id) {
      case 'facturado-anio': if (f) { value = fmt(f.yearTotal, ' €'); sub = `${fmt(f.invoiceCount)} facturas` } break
      case 'facturado-mes': if (f) { value = fmt(f.monthTotal, ' €'); sub = `${fmt(f.monthCount)} facturas, en curso` } break
      case 'cobro': if (f) { value = fmt(f.confirmed, ' €'); sub = 'Cobro documental confirmado (banco)' } break
      case 'por-confirmar': if (f) { value = fmt(f.pendingReal, ' €'); sub = 'Pendiente real; sin extracto va separado' } break
      case 'extractos': if (f) { value = f.cutoff ? `${f.cutoff.slice(8,10)}/${f.cutoff.slice(5,7)}` : 'sin dato'; sub = 'Último corte verificado de todas las cuentas' } break
      case 'clientes': if (data.clients) { value = fmt(data.clients.total); sub = `${fmt(data.clients.empresas)} empresas · ${fmt(data.clients.particulares)} particulares` } break
      case 'contratos': if (data.contracts) { value = fmt(data.contracts.total); sub = `${fmt(data.contracts.tarifas)} tarifas activas` } break
      case 'margen-ultimo': if (lastMargin) { value = fmt(lastMargin.value, ' %'); sub = `${lastMargin.month}${lastMargin.provisional ? ' · provisional' : ''}${lastMargin.reliability == null ? '' : ` · fiabilidad ${fmt(lastMargin.reliability, ' %')}`}` } break
      case 'leads': case 'mis-leads': if (c) { value = fmt(c.kpis.leadsAbiertos); sub = `${fmt(c.kpis.leadsSinContactar)} sin contactar (más de 7 días)` } break
      case 'reuniones': if (c) { value = fmt(c.kpis.reunionesSemana); sub = 'Reuniones ya guardadas en la ficha' } break
      case 'mis-negocios': if (c) { value = fmt(c.pipelines.reduce((s,p) => s + p.total,0)); sub = 'Solo los negocios de esta persona' } break
      case 'ganado': if (c) { value = fmt(c.kpis.ganadosMes); sub = 'Negocios ganados este mes; sin inventar cuota mensual' } break
    }
    return { id: d.id, sectionKey: d.sectionKey, label: w.label(d.label), value, sub, href: d.sourcePath }
  })
  const hour = Number(context.now.toLocaleTimeString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid' }))
  return { version: 1, role, roleLabel: APPROVED_ROLES.find(r => r.key === role)!.name, userName: context.name, greeting: hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches', dateLabel: context.now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }), month: `${w.year}-${String(context.now.toLocaleDateString('en-GB', { month: '2-digit', timeZone: 'Europe/Madrid' }))}`, owner: context.owner && !context.acting, acting: context.acting, actorId: context.principal.id, kpis, columns, notice: 'Datos de los lectores reales del panel. Sin dato significa que no se ha podido comprobar la fuente; Próximamente, que el lector aún no está disponible.', permissionText: 'Cada bloque sale solo si la persona tiene permiso en Usuarios y permisos. Los permisos de la fuente y el ámbito propio siguen vigentes.' }
}
/** Local role preview is presentation-only, always data-free. No owner figures or second session. */
export function dashboardPreview(model: DashboardModel, role: ApprovedRoleKey): DashboardModel {
  const w = { month: new Date(`${model.month}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', timeZone: 'Europe/Madrid' }), year: model.month.slice(0,4) }
  const label = (s: string) => s.replaceAll('{month}', w.month).replaceAll('{year}', w.year)
  const layout = AREA4_DASHBOARD_LAYOUTS[role]
  const codes = [...new Set([...AREA4_DASHBOARD_BLOCKS,...AREA4_DASHBOARD_KPIS].map(d => area4SectionByKey(d.sectionKey)?.areaCode).filter((s): s is string => Boolean(s)))]
  const grants = approvedCodePermissions(role, {}, codes)
  const permitted = (d: { sectionKey: string; sourcePath: string }) => {
    const m = area4RegisteredSurface(d.sourcePath, 'page')
    return Boolean(m && (role === 'superadmin' || (m.baseline && grants[m.section.areaCode]?.includes('V'))))
  }
  return { ...model, role, roleLabel: APPROVED_ROLES.find(r => r.key === role)!.name, userName: 'Vista del rol', acting: true,
    kpis: layout.kpis.map(id => AREA4_DASHBOARD_KPIS.find(k => k.id === id)!).filter(permitted).map(d => ({ id: d.id, sectionKey: d.sectionKey, label: label(d.label), value: 'sin dato', sub: 'Vista del rol sin datos de una persona' })),
    columns: layout.columns.map(ids => ids.map(id => AREA4_DASHBOARD_BLOCKS.find(b => b.id === id)!).filter(permitted).map(d => ({ id: d.id, sectionKey: d.sectionKey, title: label(d.title), help: label(d.help), chart: d.chart, state: 'unavailable' as const, message: 'Sin dato. Selecciona una persona desde Usuarios y permisos para comprobar su acceso efectivo.' }))), notice: 'Vista de estructura, de solo lectura y sin datos del propietario. No cambia cuentas ni permisos.' }
}
