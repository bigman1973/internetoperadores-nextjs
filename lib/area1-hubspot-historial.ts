/**
 * Área 1 · Historial de HubSpot → ficha única del panel.
 *
 * - Notas, correos, reuniones y tareas de HubSpot de las fichas de Internet Operadores pasan a crm_actividades
 *   (y las tareas también a crm_tareas), con fecha, autor y origen «HubSpot». Las llamadas ya las importa la
 *   sincronización de ventas existente y no se tocan aquí.
 * - Sin duplicar: crm_actividades.hubspot_id es único (ON CONFLICT DO NOTHING) y crm_tareas.actividad_origen_id también.
 *   Nunca se pisan cambios hechos en el panel.
 * - Se excluye todo lo asociado a negocios del pipeline LFDeal «Operaciones de Traspaso».
 * - Consentimientos: se derivan de las propiedades de HubSpot YA guardadas en el panel (no llama a HubSpot).
 * - HubSpot SOLO lectura: únicamente peticiones GET.
 */
import { randomUUID } from 'node:crypto'
import { ErrorAuditoriaImportacion, ErrorImportacionNoAuditada, ORIGEN_RECIBO_HUBSPOT, reciboHubspot, registrarReciboImportacion, type DespuesRecibo } from './area1-import-recibo'
import prisma from '@/lib/prisma'
import { hubspotRequest } from '@/lib/hubspot-listas'

export const AREA1_IO_UNIDAD = 'Internet Operadores'
/** LFDeal «Operaciones de Traspaso»: excluido por decisión de Víctor (24/11). */
export const AREA1_PIPELINES_EXCLUIDOS = ['3711728841']

export type ObjetoHistorial = 'notes' | 'emails' | 'meetings' | 'tasks'
export const OBJETOS_HISTORIAL: Record<ObjetoHistorial, { tipo: 'NOTA' | 'CORREO' | 'REUNION' | 'TAREA'; etiqueta: string; propiedades: string[] }> = {
  notes: { tipo: 'NOTA', etiqueta: 'Notas', propiedades: ['hs_timestamp', 'hs_note_body', 'hubspot_owner_id', 'hs_createdate'] },
  emails: { tipo: 'CORREO', etiqueta: 'Correos', propiedades: ['hs_timestamp', 'hs_email_subject', 'hs_email_text', 'hs_email_html', 'hs_email_direction', 'hs_email_status', 'hubspot_owner_id'] },
  meetings: { tipo: 'REUNION', etiqueta: 'Reuniones', propiedades: ['hs_timestamp', 'hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_meeting_outcome', 'hs_meeting_location', 'hubspot_owner_id'] },
  tasks: { tipo: 'TAREA', etiqueta: 'Tareas', propiedades: ['hs_timestamp', 'hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_priority', 'hs_task_type', 'hs_task_completion_date', 'hubspot_owner_id'] },
}

export type EngagementHubspot = {
  id: string
  objeto: ObjetoHistorial
  properties: Record<string, string | null | undefined>
  createdAt?: string
  contactos: string[]
  negocios: string[]
}

type Request = <T>(path: string) => Promise<T>
type Pagina = { results?: Array<{ id: string; properties?: Record<string, string | null>; createdAt?: string; associations?: Record<string, { results?: Array<{ id: string }>; paging?: { next?: { after?: string } } }> }>; paging?: { next?: { after?: string } } }

/** Lee todos los objetos de un tipo con sus asociaciones a contactos y negocios. Solo GET. */
export async function leerEngagements(objeto: ObjetoHistorial, request: Request = hubspotRequest): Promise<EngagementHubspot[]> {
  const out = new Map<string, EngagementHubspot>()
  let after: string | undefined
  do {
    const q = new URLSearchParams({ limit: '100', archived: 'false', properties: OBJETOS_HISTORIAL[objeto].propiedades.join(','), associations: 'contacts,deals' })
    if (after) q.set('after', after)
    const page = await request<Pagina>(`/crm/v3/objects/${objeto}?${q}`)
    for (const r of page.results || []) {
      const asociados = async (tipo: 'contacts' | 'deals') => {
        const inc = r.associations?.[tipo]
        const ids = (inc?.results || []).map((a) => String(a.id))
        let next = inc?.paging?.next?.after
        while (next) {
          const p = await request<{ results?: Array<{ id: string }>; paging?: { next?: { after?: string } } }>(`/crm/v3/objects/${objeto}/${encodeURIComponent(r.id)}/associations/${tipo}?${new URLSearchParams({ limit: '500', after: next })}`)
          ids.push(...(p.results || []).map((a) => String(a.id)))
          next = p.paging?.next?.after
        }
        return [...new Set(ids)]
      }
      out.set(String(r.id), { id: String(r.id), objeto, properties: r.properties || {}, createdAt: r.createdAt, contactos: await asociados('contacts'), negocios: await asociados('deals') })
    }
    after = page.paging?.next?.after
  } while (after)
  return [...out.values()]
}

export async function leerPropietarios(request: Request = hubspotRequest): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  let after: string | undefined
  do {
    const q = new URLSearchParams({ limit: '500', archived: 'false' })
    if (after) q.set('after', after)
    const page = await request<{ results?: Array<{ id: string; firstName?: string; lastName?: string; email?: string }>; paging?: { next?: { after?: string } } }>(`/crm/v3/owners?${q}`)
    for (const o of page.results || []) nombres.set(String(o.id), [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || `HubSpot #${o.id}`)
    after = page.paging?.next?.after
  } while (after)
  return nombres
}

export function textoPlano(value?: string | null, max = 20_000): string {
  return String(value || '')
    .replace(/<\/(div|li|h[1-6]|tr|blockquote|p)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
}

function fecha(v?: string | null): string | null {
  if (!v) return null
  const d = /^\d+$/.test(v) ? new Date(Number(v)) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type ContextoPlan = {
  /** hubspotId de contacto → ficha local y si es de Internet Operadores */
  contactos: Map<string, { id: string; esIO: boolean }>
  negociosExcluidos: Set<string>
  yaImportados: Set<string>
  propietarios: Map<string, string>
  ahora?: Date
}

export type FilaActividad = {
  id: string; hubspotId: string; objeto: ObjetoHistorial; tipo: string; contactoId: string; contactosExtra: string[]
  titulo: string; descripcion: string; fechaActividad: string; direccion: string | null; resultado: string | null
  creadoPorNombre: string; metadatos: Record<string, unknown>
  tarea: null | { titulo: string; descripcion: string | null; venceAt: string; estado: 'PENDIENTE' | 'COMPLETADA'; prioridad: 'ALTA' | 'MEDIA' | 'BAJA'; asignadoANombre: string | null; completadoAt: string | null }
}

export type ResumenObjeto = { detectados: number; importables: number; nuevos: number; yaImportados: number; excluidosLFDeal: number; sinFichaLocal: number; noIO: number }

export function resumenVacio(): ResumenObjeto { return { detectados: 0, importables: 0, nuevos: 0, yaImportados: 0, excluidosLFDeal: 0, sinFichaLocal: 0, noIO: 0 } }

/** Decide, sin efectos, qué se importa y cómo. */
export function planificarHistorial(engagements: EngagementHubspot[], ctx: ContextoPlan): { filas: FilaActividad[]; resumen: Record<ObjetoHistorial, ResumenObjeto> } {
  const resumen = { notes: resumenVacio(), emails: resumenVacio(), meetings: resumenVacio(), tasks: resumenVacio() } as Record<ObjetoHistorial, ResumenObjeto>
  const filas: FilaActividad[] = []
  const ahora = (ctx.ahora || new Date()).toISOString()
  for (const e of engagements) {
    const r = resumen[e.objeto]
    r.detectados++
    if (e.negocios.some((n) => ctx.negociosExcluidos.has(n))) { r.excluidosLFDeal++; continue }
    const locales = e.contactos.map((c) => ctx.contactos.get(c)).filter((c): c is { id: string; esIO: boolean } => Boolean(c))
    if (locales.length === 0) { r.sinFichaLocal++; continue }
    const io = [...new Set(locales.filter((c) => c.esIO).map((c) => c.id))]
    if (io.length === 0) { r.noIO++; continue }
    r.importables++
    if (ctx.yaImportados.has(e.id)) { r.yaImportados++; continue }
    r.nuevos++
    const p = e.properties
    const owner = p.hubspot_owner_id ? ctx.propietarios.get(String(p.hubspot_owner_id)) || `HubSpot #${p.hubspot_owner_id}` : null
    const cuando = fecha(p.hs_timestamp) || fecha(e.createdAt) || ahora
    const def = OBJETOS_HISTORIAL[e.objeto]
    let titulo = '', descripcion = '', direccion: string | null = null, resultado: string | null = null
    let tarea: FilaActividad['tarea'] = null
    if (e.objeto === 'notes') {
      descripcion = textoPlano(p.hs_note_body) || 'Nota importada de HubSpot sin texto.'
      titulo = descripcion.split('\n')[0].slice(0, 120) || 'Nota de HubSpot'
      resultado = 'REGISTRADA'
    } else if (e.objeto === 'emails') {
      titulo = textoPlano(p.hs_email_subject, 250) || 'Correo de HubSpot'
      descripcion = textoPlano(p.hs_email_text) || textoPlano(p.hs_email_html) || 'Correo importado de HubSpot sin cuerpo disponible.'
      const d = String(p.hs_email_direction || '').toUpperCase()
      direccion = d === 'INCOMING_EMAIL' ? 'ENTRANTE' : d ? 'SALIENTE' : null
      resultado = p.hs_email_status ? String(p.hs_email_status).toUpperCase() : 'REGISTRADA'
    } else if (e.objeto === 'meetings') {
      titulo = textoPlano(p.hs_meeting_title, 250) || 'Reunión de HubSpot'
      descripcion = [textoPlano(p.hs_meeting_body), p.hs_meeting_location ? `Lugar: ${textoPlano(p.hs_meeting_location, 250)}` : ''].filter(Boolean).join('\n\n') || 'Reunión importada de HubSpot sin descripción.'
      resultado = p.hs_meeting_outcome ? String(p.hs_meeting_outcome).toUpperCase() : 'REGISTRADA'
    } else {
      titulo = textoPlano(p.hs_task_subject, 250) || 'Tarea de HubSpot'
      descripcion = textoPlano(p.hs_task_body) || 'Tarea importada de HubSpot sin descripción.'
      const completada = String(p.hs_task_status || '').toUpperCase() === 'COMPLETED'
      const pr = String(p.hs_task_priority || '').toUpperCase()
      resultado = completada ? 'COMPLETADA' : 'PENDIENTE'
      tarea = {
        titulo, descripcion: textoPlano(p.hs_task_body) || null, venceAt: cuando, estado: completada ? 'COMPLETADA' : 'PENDIENTE',
        prioridad: pr === 'HIGH' ? 'ALTA' : pr === 'LOW' ? 'BAJA' : 'MEDIA', asignadoANombre: owner,
        completadoAt: completada ? fecha(p.hs_task_completion_date) || cuando : null,
      }
    }
    filas.push({
      id: randomUUID(), hubspotId: e.id, objeto: e.objeto, tipo: def.tipo, contactoId: io[0], contactosExtra: io.slice(1),
      titulo, descripcion, fechaActividad: cuando, direccion, resultado, creadoPorNombre: owner || 'HubSpot',
      metadatos: { origen: 'HubSpot', objetoHubspot: e.objeto, hubspotId: e.id, propietarioHubspotId: p.hubspot_owner_id || null, negociosHubspot: e.negocios, importadoAt: ahora },
      tarea,
    })
  }
  return { filas, resumen }
}

// ---------- Consentimientos (desde propiedades ya guardadas en el panel) ----------

export type Consentimiento = {
  contactoId: string; estado: 'BAJA' | 'CONSENTIMIENTO' | 'INTERES_LEGITIMO' | 'CONTRATO' | 'SIN_BASE_LEGAL'
  baseLegal: string | null; bajasTipos: string[]; rebote: boolean; marketing: boolean | null; fechaOrigen: string | null
}

export function consentimientoDesdePropiedades(contactoId: string, p: Record<string, unknown>, etiquetasBaja: Map<string, string> = new Map()): Consentimiento {
  const s = (k: string) => (p[k] == null ? '' : String(p[k]).trim())
  const base = s('hs_legal_basis') || null
  const bajasTipos = Object.keys(p).filter((k) => /^hs_email_optout_\d+$/.test(k) && s(k) === 'true').map((k) => etiquetasBaja.get(k) || k).sort()
  const bajaGlobal = s('hs_email_optout') === 'true'
  const b = (base || '').toLowerCase()
  const estado: Consentimiento['estado'] = bajaGlobal ? 'BAJA'
    : b.includes('consent') ? 'CONSENTIMIENTO'
    : b.includes('legitimate interest') ? 'INTERES_LEGITIMO'
    : b.includes('performance of a contract') ? 'CONTRATO'
    : 'SIN_BASE_LEGAL'
  const m = s('hs_marketable_status')
  return {
    contactoId, estado, baseLegal: base, bajasTipos,
    rebote: Boolean(s('hs_email_hard_bounce_reason_enum')) || Number(s('hs_email_bounce') || 0) > 0,
    marketing: m === 'true' ? true : m === 'false' ? false : null,
    fechaOrigen: fecha(s('hs_v2_date_entered_subscriber') || null),
  }
}

// ---------- Ejecución ----------

export type ResultadoHistorial = {
  modo: 'simular' | 'importar'
  resumen: Record<ObjetoHistorial, ResumenObjeto>
  errores: Partial<Record<ObjetoHistorial, string>>
  consentimientos: { contactosIO: number; porEstado: Record<string, number>; conBajaPorTipo: number; conRebote: number; guardados: number }
  importados: { actividades: number; tareas: number; relacionesContacto: number }
}

async function cargarContexto() {
  const contactos = new Map<string, { id: string; esIO: boolean }>()
  const filas = await prisma.$queryRaw<Array<{ id: string; hubspot_id: string; es_io: boolean }>>`
    SELECT id, hubspot_id, (${AREA1_IO_UNIDAD} = ANY(unidades_negocio)) AS es_io FROM crm_registros_hubspot WHERE object_type_id = '0-1'`
  for (const f of filas) contactos.set(f.hubspot_id, { id: f.id, esIO: Boolean(f.es_io) })
  const excl = await prisma.$queryRaw<Array<{ hubspot_id: string }>>`SELECT hubspot_id FROM crm_negocios_hubspot WHERE pipeline_hubspot_id = ANY(${AREA1_PIPELINES_EXCLUIDOS}::text[])`
  const ya = await prisma.$queryRaw<Array<{ hubspot_id: string }>>`SELECT hubspot_id FROM crm_actividades WHERE hubspot_id IS NOT NULL`
  return { contactos, negociosExcluidos: new Set(excl.map((x) => x.hubspot_id)), yaImportados: new Set(ya.map((x) => x.hubspot_id)) }
}

async function planConsentimientos() {
  const etiquetas = new Map((await prisma.$queryRaw<Array<{ nombre: string; etiqueta: string }>>`
    SELECT nombre, etiqueta FROM crm_propiedades_hubspot WHERE nombre ~ '^hs_email_optout_[0-9]+$'`).map((x) => [x.nombre, x.etiqueta.replace(/^Opted out of email:\s*/i, '')]))
  const filas = await prisma.$queryRaw<Array<{ id: string; p: Record<string, unknown> }>>`
    SELECT id, jsonb_strip_nulls(jsonb_build_object(
      'hs_legal_basis', propiedades->'hs_legal_basis', 'hs_email_optout', propiedades->'hs_email_optout',
      'hs_marketable_status', propiedades->'hs_marketable_status', 'hs_email_hard_bounce_reason_enum', propiedades->'hs_email_hard_bounce_reason_enum',
      'hs_email_bounce', propiedades->'hs_email_bounce', 'hs_v2_date_entered_subscriber', propiedades->'hs_v2_date_entered_subscriber'
    ) || COALESCE((SELECT jsonb_object_agg(k, v) FROM jsonb_each(propiedades) AS e(k, v) WHERE k ~ '^hs_email_optout_[0-9]+$'), '{}'::jsonb)) AS p
    FROM crm_registros_hubspot WHERE object_type_id = '0-1' AND ${AREA1_IO_UNIDAD} = ANY(unidades_negocio)`
  return filas.map((f) => consentimientoDesdePropiedades(f.id, f.p || {}, etiquetas))
}

function resumirConsentimientos(lista: Consentimiento[]) {
  const porEstado: Record<string, number> = {}
  for (const c of lista) porEstado[c.estado] = (porEstado[c.estado] || 0) + 1
  return { contactosIO: lista.length, porEstado, conBajaPorTipo: lista.filter((c) => c.bajasTipos.length > 0).length, conRebote: lista.filter((c) => c.rebote).length, guardados: 0 }
}

function trozos<T>(xs: T[], n: number): T[][] { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out }

export type AuditoriaHistorial = {
  actorId: number
  registrar?: typeof registrarReciboImportacion
  db?: Parameters<typeof registrarReciboImportacion>[0]
  reloj?: () => number
}
export async function ejecutarHistorialHubspot(modo: 'simular' | 'importar', ejecutadoPor: string, request: Request = hubspotRequest, auditoria?: AuditoriaHistorial): Promise<ResultadoHistorial & { recibo?: DespuesRecibo }> {
  const reloj = auditoria?.reloj || Date.now
  const t0 = reloj()
  const ctxBase = await cargarContexto()
  const errores: ResultadoHistorial['errores'] = {}
  const propietarios = await leerPropietarios(request).catch(() => new Map<string, string>())
  const engagements: EngagementHubspot[] = []
  for (const objeto of Object.keys(OBJETOS_HISTORIAL) as ObjetoHistorial[]) {
    try { engagements.push(...await leerEngagements(objeto, request)) } catch (e) { errores[objeto] = e instanceof Error ? e.message.slice(0, 200) : 'error' }
  }
  const { filas, resumen } = planificarHistorial(engagements, { ...ctxBase, propietarios })
  const consent = await planConsentimientos()
  const resultado: ResultadoHistorial = { modo, resumen, errores, consentimientos: resumirConsentimientos(consent), importados: { actividades: 0, tareas: 0, relacionesContacto: 0 } }
  if (modo === 'simular') return resultado

  const sync = await prisma.crmSincronizacionHubspot.create({ data: { modo: 'AREA1_HISTORIAL', estado: 'EN_PROGRESO', bloqueo: 'hubspot-crm-write', ejecutadoPor } })
  try {
    for (const lote of trozos(filas, 500)) {
      await prisma.$transaction(async (tx) => {
        const payload = JSON.stringify(lote.map((f) => ({ id: f.id, contacto_id: f.contactoId, tipo: f.tipo, titulo: f.titulo, descripcion: f.descripcion, fecha_actividad: f.fechaActividad, direccion: f.direccion, resultado: f.resultado, hubspot_id: f.hubspotId, creado_por_nombre: f.creadoPorNombre, metadatos: f.metadatos })))
        const insertadas = await tx.$queryRaw<Array<{ id: string; hubspot_id: string }>>`
          INSERT INTO crm_actividades (id, contacto_id, tipo, titulo, descripcion, metadatos, fecha_actividad, direccion, resultado, origen, hubspot_id, creado_por_nombre, created_at, updated_at)
          SELECT r.id, r.contacto_id, r.tipo, r.titulo, r.descripcion, r.metadatos, r.fecha_actividad, r.direccion, r.resultado, 'HUBSPOT', r.hubspot_id, r.creado_por_nombre, NOW(), NOW()
          FROM jsonb_to_recordset(${payload}::jsonb) AS r(id text, contacto_id text, tipo text, titulo text, descripcion text, fecha_actividad timestamptz, direccion text, resultado text, hubspot_id text, creado_por_nombre text, metadatos jsonb)
          ON CONFLICT (hubspot_id) DO NOTHING
          RETURNING id, hubspot_id`
        const nuevas = new Set(insertadas.map((x) => x.id))
        resultado.importados.actividades += insertadas.length
        const rel = lote.filter((f) => nuevas.has(f.id)).flatMap((f) => [f.contactoId, ...f.contactosExtra].map((contactoId) => ({ actividadId: f.id, contactoId })))
        if (rel.length) resultado.importados.relacionesContacto += (await tx.crmActividadContacto.createMany({ data: rel, skipDuplicates: true })).count
        const tareas = lote.filter((f) => f.tarea && nuevas.has(f.id)).map((f) => ({
          id: randomUUID(), contactoId: f.contactoId, actividadOrigenId: f.id, titulo: f.tarea!.titulo, descripcion: f.tarea!.descripcion,
          venceAt: new Date(f.tarea!.venceAt), estado: f.tarea!.estado, prioridad: f.tarea!.prioridad, asignadoANombre: f.tarea!.asignadoANombre,
          creadoPorNombre: `${f.creadoPorNombre} (HubSpot)`, completadoAt: f.tarea!.completadoAt ? new Date(f.tarea!.completadoAt) : null,
        }))
        if (tareas.length) resultado.importados.tareas += (await tx.crmTarea.createMany({ data: tareas, skipDuplicates: true })).count
      }, { maxWait: 10_000, timeout: 60_000 })
    }
    for (const lote of trozos(consent, 2000)) {
      const payload = JSON.stringify(lote.map((c) => ({ id: randomUUID(), contacto_id: c.contactoId, estado: c.estado, base_legal: c.baseLegal, bajas_tipos: c.bajasTipos, rebote: c.rebote, marketing: c.marketing, fecha_origen: c.fechaOrigen })))
      resultado.consentimientos.guardados += Number(await prisma.$executeRaw`
        INSERT INTO area1_crm_consentimientos AS x (id, contacto_id, canal, fuente, estado, base_legal, bajas_tipos, rebote, marketing, fecha_origen, created_at, updated_at)
        SELECT r.id, r.contacto_id, 'EMAIL', 'HUBSPOT', r.estado, r.base_legal, ARRAY(SELECT jsonb_array_elements_text(COALESCE(r.bajas_tipos, '[]'::jsonb))), r.rebote, r.marketing, r.fecha_origen, NOW(), NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS r(id text, contacto_id text, estado text, base_legal text, bajas_tipos jsonb, rebote boolean, marketing boolean, fecha_origen timestamptz)
        ON CONFLICT (contacto_id, canal, fuente) DO UPDATE SET estado = EXCLUDED.estado, base_legal = EXCLUDED.base_legal, bajas_tipos = EXCLUDED.bajas_tipos,
          rebote = EXCLUDED.rebote, marketing = EXCLUDED.marketing, fecha_origen = EXCLUDED.fecha_origen, updated_at = NOW()`)
    }
    await prisma.crmSincronizacionHubspot.update({ where: { id: sync.id }, data: { estado: 'COMPLETADA', bloqueo: null, finalizadoAt: new Date(), registrosActualizados: resultado.importados.actividades, errores: Object.keys(errores).length, detalle: JSON.parse(JSON.stringify({ resumen, errores, importados: resultado.importados, consentimientos: resultado.consentimientos })) } })
  } catch (e) {
    await prisma.crmSincronizacionHubspot.update({ where: { id: sync.id }, data: { estado: 'ERROR', bloqueo: null, errores: 1, finalizadoAt: new Date(), detalle: [{ error: e instanceof Error ? e.message.slice(0, 300) : 'error' }] } })
    // Recibo con lo comprometido de verdad por los lotes ya cerrados (PARCIAL) o nada (ERROR).
    try { await auditarHistorial(auditoria, sync.id, resultado, errores, e, reloj() - t0) } catch { throw new ErrorImportacionNoAuditada(e) }
    throw e
  }
  // Sincronización ya cerrada (sin bloqueo). Si el recibo falla, ErrorAuditoriaImportacion: no se silencia.
  const recibo = await auditarHistorial(auditoria, sync.id, resultado, errores, undefined, reloj() - t0)
  return recibo ? { ...resultado, recibo } : resultado
}

async function auditarHistorial(a: AuditoriaHistorial | undefined, journalId: string, r: ResultadoHistorial, errores: ResultadoHistorial['errores'], fallo: unknown, duracionMs: number): Promise<DespuesRecibo | undefined> {
  if (!a) return undefined
  const despues = reciboHubspot({ journalId, importados: r.importados, consentimientosGuardados: r.consentimientos.guardados, erroresLectura: errores, fallo, duracionMs })
  try {
    await (a.registrar || registrarReciboImportacion)(a.db || prisma, { actorId: a.actorId, origen: ORIGEN_RECIBO_HUBSPOT, despues })
  } catch {
    throw new ErrorAuditoriaImportacion()
  }
  return despues
}
