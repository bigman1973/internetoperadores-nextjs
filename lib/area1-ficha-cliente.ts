/**
 * Área 1 · Ficha de cliente del CRM (maqueta_crm_ficha_cliente_aprobada.html).
 *
 * Solo lectura: ISP Gestión (contratos, facturas, cobros), Rentabilidad, Subida 2027 y el CRM del panel.
 * Lo que no existe en la BD sale como «sin dato»; nunca se inventan cifras.
 * Visibilidad (en servidor): el comercial no recibe márgenes ni rentabilidad (ni siquiera en el payload).
 * Negocios de HubSpot: solo los cerrados de pipelines de IO, como historial; LFDeal y demás pipelines fuera.
 */
import prisma from './prisma'
import type { NivelResumen } from './area1-crm-resumen-vista'
import { leerSubidaCliente, type SubidaCliente } from './area1-subida-cliente'
import { leerRentabilidadFicha, normalizarCodigoFicha, type RentabilidadFicha, type ProyeccionFichaRentabilidad } from './area1-ficha-rentabilidad'
import { leerIdentidadIspEmpresa, identidadIspNoVerificable, type IdentidadIspEmpresa } from './area1-isp-identidad'

export const SIN_DATO = 'sin dato'
const ZONA = 'Europe/Madrid'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// ---------- Helpers puros (probados en scripts/test-area1-ficha-cliente.ts) ----------
export const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}
export const eur = (v: number, d = 0) => `${v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
export const pct = (v: number, d = 1) => `${v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })} %`
/** Códigos ISP: «006004» = «6004»; «ISP000014» = «14». */
export const normCodigo = normalizarCodigoFicha
export function iniciales(nombre: string | null | undefined): string {
  const limpio = (nombre || '').replace(/[,.]/g, ' ').replace(/\b(S\.?L\.?U?|S\.?A\.?|SLU|SL|SA|SCP|SCCL|CB)\b/gi, ' ').trim()
  const p = limpio.split(/\s+/).filter((x) => /[A-Za-zÀ-ÿ0-9]/.test(x))
  if (!p.length) return '?'
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase()
}
/** YYYY-MM de una fecha en hora de Madrid. */
export function mesDe(d: Date): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' }).formatToParts(d)
  return `${f.find((x) => x.type === 'year')!.value}-${f.find((x) => x.type === 'month')!.value}`
}
export function diaDe(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
/** Los 12 meses que terminan en el mes de `hoy` (incluido), del más antiguo al más reciente. */
export function ultimos12(hoy: Date): string[] {
  const [y, m] = mesDe(hoy).split('-').map(Number)
  const out: string[] = []
  for (let i = 11; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`)
  }
  return out
}
export const etiquetaMes = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] || ym
export const nombreMes = (ym: string) => MESES_LARGOS[Number(ym.slice(5, 7)) - 1] || ym
export const fechaCorta = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, day: '2-digit', month: '2-digit' }).format(d)
export const fechaLarga = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
export const mesAnio = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, month: '2-digit', year: 'numeric' }).format(d)
export function haceDias(d: Date, hoy: Date): string {
  const dias = Math.floor((Date.parse(diaDe(hoy)) - Date.parse(diaDe(d))) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 45) return `hace ${dias} días`
  const meses = Math.round(dias / 30)
  return meses < 12 ? `hace ${meses} meses` : `hace ${Math.floor(dias / 365)} ${Math.floor(dias / 365) === 1 ? 'año' : 'años'}`
}
/** Cuándo, como en la maqueta: «hace N días» en la última semana; si no, dd/mm (y hh:mm en reuniones). */
export function cuando(d: Date, hoy: Date, conHora = false): string {
  const dias = Math.floor((Date.parse(diaDe(hoy)) - Date.parse(diaDe(d))) / 86_400_000)
  if (dias >= 0 && dias < 7 && !conHora) return haceDias(d, hoy)
  const base = mesDe(d).slice(0, 4) === mesDe(hoy).slice(0, 4) ? fechaCorta(d) : fechaLarga(d)
  return conHora ? `${base} ${new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' }).format(d)}` : base
}
export type ContratoFicha = { codigo: string; producto: string; sede: string; cuota: number | null; estado: 'Activo' | 'Baja'; finPermanencia: string; finPermanenciaFecha: string | null; margenPct: number | null; cuentaIsp?: string; estadoOrigen?: string | null; periodicidad?: string | null; presente?: boolean }
/** Cuota mensual = suma existente del importe sin IVA activo. La periodicidad se advierte, no cambia la fórmula. */
export function cuotaMensual(contratos: Array<Pick<ContratoFicha, 'cuota' | 'estado'>>): { total: number | null; activos: number; sinImporte: number } {
  const activos = contratos.filter((c) => c.estado === 'Activo')
  const conImporte = activos.filter((c) => c.cuota != null)
  return { total: conImporte.length ? conImporte.reduce((s, c) => s + (c.cuota as number), 0) : null, activos: activos.length, sinImporte: activos.length - conImporte.length }
}
export type FacturaFicha = { numero: string; fecha: string; fechaIso: string; mes: string; base: number; total: number; pendiente: number; estado: 'Cobrada' | 'Pendiente' | 'Devuelto' }
export function serieMensual(facturas: Array<Pick<FacturaFicha, 'mes' | 'base'>>, meses: string[]): Array<number | null> {
  const m = new Map<string, number>()
  for (const f of facturas) m.set(f.mes, (m.get(f.mes) || 0) + f.base)
  // No consta factura en ese mes: ausencia, no cero. Un cero documentado sí se conserva.
  return meses.map((x) => m.has(x) ? Math.round(m.get(x)! * 100) / 100 : null)
}
export type DueTarea = { cls: '' | 'bad' | 'ok'; txt: string }
export function vencimientoTarea(vence: Date, hoy: Date): DueTarea {
  const a = diaDe(vence), b = diaDe(hoy)
  if (a < b) return { cls: 'bad', txt: 'Vencida' }
  if (a === b) return { cls: '', txt: 'Hoy' }
  const [, mm, dd] = a.split('-')
  return { cls: 'ok', txt: `${Number(dd)}/${Number(mm)}` }
}
export type CatEvento = 'mail' | 'meet' | 'note' | 'isp'
export type FuenteEvento = 'Outlook' | 'Panel' | 'HubSpot' | 'ISP'
export function categoriaActividad(tipo: string): CatEvento {
  if (tipo === 'CORREO') return 'mail'
  if (tipo === 'REUNION') return 'meet'
  return 'note'
}
export function fuenteActividad(origen: string | null | undefined, metadatos: unknown): FuenteEvento {
  if ((origen || '').toUpperCase() === 'HUBSPOT') return 'HubSpot'
  const m = metadatos && typeof metadatos === 'object' && !Array.isArray(metadatos) ? metadatos as Record<string, unknown> : {}
  if (String(m.canal || '').toUpperCase() === 'OUTLOOK' || m.viaOutlook === true || m.outlookEventId || m.buzonCalendario || m.guardadoEnEnviados === true) return 'Outlook'
  return 'Panel'
}
const TIPO_TXT: Record<string, string> = { LLAMADA: 'Llamada', CORREO: 'Correo', REUNION: 'Reunión', NOTA: 'Nota', TAREA: 'Tarea', WHATSAPP: 'WhatsApp', LINKEDIN: 'LinkedIn', SMS: 'SMS', CORREO_POSTAL: 'Correo postal' }
export function tipoTexto(tipo: string, direccion: string | null): string {
  if (tipo === 'CORREO') return direccion === 'ENTRANTE' ? 'Correo recibido' : 'Correo enviado'
  return TIPO_TXT[tipo] || 'Actividad'
}
/** Una tarea no acredita contacto; sí una nota local registrada en EMPRESA, incluso sin persona. */
export function cuentaComoContactoFicha(a: { tipo: string; origen?: string | null; empresaId?: string | null; metadatos?: unknown }): boolean {
  if (['CORREO', 'REUNION', 'LLAMADA', 'WHATSAPP', 'SMS'].includes(a.tipo)) return true
  const m = a.metadatos && typeof a.metadatos === 'object' && !Array.isArray(a.metadatos) ? a.metadatos as Record<string, unknown> : {}
  return a.tipo === 'NOTA' && a.origen === 'LOCAL' && Boolean(a.empresaId) && m.ambito === 'EMPRESA'
}
export const ETIQUETA_RESULTADO_AISLADO: Record<string, string> = {
  CALENDARIO_NO_CREADO_AISLADO: 'Pruebas: no creada en Outlook',
  NO_ENVIADO_AISLADO: 'Pruebas: no enviado',
  DESVIADO_AISLADO: 'Pruebas: desviado a la dirección de prueba',
}
export type AvisoFicha = { nivel: 'warn' | 'bad' | 'info'; titulo: string; texto: string }
export function calcularAvisos(i: {
  margenPct: number | null; mesMargen: string | null; verMargen: boolean
  pendiente: number | null; devueltos: number; devueltoImporte: number
  permanencias: string[]; hoy: Date; subida: SubidaCliente | null
}): AvisoFicha[] {
  const out: AvisoFicha[] = []
  if (i.verMargen && i.margenPct != null && i.margenPct < 20) out.push({ nivel: i.margenPct < 0 ? 'bad' : 'warn', titulo: i.margenPct < 0 ? 'Margen negativo' : 'Margen bajo', texto: `${pct(i.margenPct)} en ${i.mesMargen ? nombreMes(i.mesMargen) : 'el último mes'}.` })
  if (i.devueltos > 0) out.push({ nivel: 'bad', titulo: i.devueltos === 1 ? 'Recibo devuelto' : 'Recibos devueltos', texto: `${i.devueltos} ${i.devueltos === 1 ? 'recibo' : 'recibos'} por ${eur(i.devueltoImporte)}${i.pendiente ? ', pendiente de cobro' : ''}.` })
  else if (i.pendiente && i.pendiente > 0) out.push({ nivel: 'bad', titulo: 'Pendiente de cobro', texto: `${eur(i.pendiente, 2)} en facturas pendientes.` })
  const limite = new Date(i.hoy.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)
  const hoyIso = diaDe(i.hoy)
  const proximas = i.permanencias.filter((f) => f >= hoyIso && f <= limite)
  if (proximas.length) out.push({ nivel: 'info', titulo: 'Permanencia', texto: `${proximas.length} ${proximas.length === 1 ? 'contrato termina' : 'contratos terminan'} la permanencia en los próximos 3 meses.` })
  if (i.subida?.fechaLimiteAviso) out.push({ nivel: 'info', titulo: 'Subida 2027', texto: `Avisar al cliente antes del ${i.subida.fechaLimiteAviso}.` })
  return out
}
/** Contexto para «Lo que hay que saber»: sin costes ni márgenes, sin correos ni teléfonos. */
export type ContextoResumenIa = {
  cliente: string; tipo: string; clienteDesde: string | null
  contratosActivos: number; cuotaMensual: number | null; productos: string[]
  facturado12m: number | null; pendienteCobro: number | null; recibosDevueltos: number
  subida: string | null; permanenciasProximas: number
  ultimasActividades: Array<{ fecha: string; tipo: string; titulo: string; texto: string }>
  tareasPendientes: Array<{ vence: string; titulo: string }>
  negociosAbiertos: Array<{ nombre: string; etapa: string }>
}
const PROHIBIDO_IA = /\b(coste|costes|cost|margen|m[aá]rgenes|margin|rentabilidad)\b/i
export function limpiarContextoIa(ctx: ContextoResumenIa): ContextoResumenIa {
  const t = (s: string, n: number) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]').replace(/\+?\d[\d\s]{7,}\d/g, '[teléfono]').slice(0, n)
  return {
    ...ctx,
    ultimasActividades: ctx.ultimasActividades.filter((a) => !PROHIBIDO_IA.test(`${a.titulo} ${a.texto}`)).slice(0, 10).map((a) => ({ ...a, titulo: t(a.titulo, 140), texto: t(a.texto, 280) })),
    tareasPendientes: ctx.tareasPendientes.slice(0, 6).map((x) => ({ ...x, titulo: t(x.titulo, 140) })),
    negociosAbiertos: ctx.negociosAbiertos.slice(0, 6),
  }
}
export function contextoTieneCostes(ctx: unknown): boolean {
  return /"(coste|costes|cost|margen|margin|marginPct|rentabilidad)"\s*:/i.test(JSON.stringify(ctx))
}
export function interpretarPuntos(texto: string): string[] | null {
  try {
    const j = JSON.parse(texto)
    const p = Array.isArray(j?.puntos) ? j.puntos.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0, 300)) : []
    if (p.length < 1) return null
    return p.filter((x: string) => !PROHIBIDO_IA.test(x)).slice(0, 4)
  } catch { return null }
}

/** Resumen nativo, determinista y sin proveedores. Sólo describe datos que constan en la ficha. */
export function resumirFichaLocal(ctx: ContextoResumenIa): string[] {
  const c = limpiarContextoIa(ctx)
  const productos = c.productos.filter(p => !PROHIBIDO_IA.test(p))
  const puntos: string[] = [c.contratosActivos
    ? `${c.contratosActivos} ${c.contratosActivos === 1 ? 'contrato activo' : 'contratos activos'}${c.cuotaMensual == null ? '; cuota mensual sin dato' : `; cuota mensual ${eur(c.cuotaMensual, 2)}`}${productos.length ? ` (${productos.join(', ')})` : ''}.`
    : 'No constan contratos activos vinculados a la ficha.']
  if (c.facturado12m != null) puntos.push(`Facturado en los últimos 12 meses: ${eur(c.facturado12m, 2)} de base sin IVA.`)
  if (c.pendienteCobro != null) puntos.push(`Pendiente de cobro: ${eur(c.pendienteCobro, 2)}${c.recibosDevueltos ? `; ${c.recibosDevueltos} recibos devueltos pendientes` : ''}.`)
  const a = c.ultimasActividades[0]
  puntos.push(a ? `Última actividad registrada: ${a.tipo} del ${a.fecha}${a.titulo && a.titulo !== a.tipo ? ` · ${a.titulo}` : ''}.` : 'No consta actividad en el resumen local.')
  if (c.tareasPendientes.length) {
    const t = c.tareasPendientes[0]
    puntos.push(`Próxima tarea registrada${PROHIBIDO_IA.test(t.titulo) ? '' : `: ${t.titulo}`} (vence ${t.vence}).`)
  }
  if (c.negociosAbiertos.length) puntos.push(`Constan ${c.negociosAbiertos.length} negocios abiertos en la ficha.`)
  return puntos
}
export type ResumenFicha = { puntos: string[]; origen: 'local' | 'guardado'; generado: string | null }
/** Un resumen guardado no autoriza IA, Graph ni envíos. Rechaza contenido no comercial o mal formado. */
export function puntosResumenGuardado(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.some(x => typeof x !== 'string' || !x.trim() || PROHIBIDO_IA.test(x))) return null
  return value.slice(0, 4).map(x => x.trim().replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]').replace(/\+?\d[\d\s]{7,}\d/g, '[teléfono]').slice(0, 300))
}

// ---------- Tipos de la vista ----------
export type KpiFicha = { etiqueta: string; valor: string; clase?: string; sub: string; go: string }
export type EventoFicha = { id: string; cat: CatEvento; tipo: string; quien: string; titulo: string; texto: string; cuando: string; fechaIso: string; fuente: FuenteEvento; contactoId: string | null; etiqueta: string | null; acciones: Array<'responder' | 'ia'> }
export type PersonaFicha = { id: string; iniciales: string; nombre: string; papel: string; email: string | null; ultimo: string }
export type NegocioFicha = { nombre: string; pipeline: string; etapa: string; etapas: string[]; indice: number; importe: number | null; siguiente: string; resultado: 'ABIERTO' | 'GANADO' | 'PERDIDO'; historial: boolean; fecha: string | null }
export type FichaCliente = {
  hoyIso: string
  nivel: NivelResumen
  verMargen: boolean
  identidadIsp: IdentidadIspEmpresa
  empresa: { id: string; nombre: string; iniciales: string; nif: string | null; tipo: string; tagTipo: 'E' | 'P' | 'R'; codigoIsp: string | null; vinculoIsp: 'vinculado' | 'propuesto' | null; comercial: string | null; clienteDesde: string | null; estado: { txt: string; tono: 'ok' | 'mod' | 'bad' | '' } }
  kpis: KpiFicha[]
  eventos: EventoFicha[]
  tareas: Array<DueTarea & { titulo: string }>
  avisos: AvisoFicha[]
  personas: PersonaFicha[]
  negocios: NegocioFicha[]
  datos: Array<[string, string]>
  comunicaciones: Array<[string, string, string]>
  contratos: ContratoFicha[]
  facturacion: { meses: string[]; serie: Array<number | null>; hayFacturas: boolean; cobrado: number | null; pendiente: number | null; formaPago: string | null; facturas: FacturaFicha[]; anio: string }
  rentabilidad: RentabilidadFicha | null
  subida: SubidaCliente | null
  contextoIa: ContextoResumenIa
  resumen: ResumenFicha
  correoPrincipal: { contactoId: string | null }
}

const tipoEmpresa = (tipo: string | null | undefined): { txt: string; tag: 'E' | 'P' | 'R' } => {
  const t = (tipo || '').toUpperCase()
  if (t === 'PARTNER') return { txt: 'Partner', tag: 'R' }
  if (t === 'PARTICULAR') return { txt: 'Particular', tag: 'P' }
  if (t === 'AUTONOMO') return { txt: 'Autónomo', tag: 'E' }
  return { txt: 'Empresa', tag: 'E' }
}
const papelTxt: Record<string, string> = { TITULAR: 'Titular', EMPLEADO: 'Empleado', ASESOR: 'Asesor', REPRESENTANTE: 'Representante', OTRO: 'Otro' }
const prop = (j: unknown, k: string): string | null => {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const v = (j as Record<string, unknown>)[k]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// ---------- Cargador (solo lectura) ----------
export async function cargarFichaCliente(empresaId: string, nivel: NivelResumen, hoy = new Date()): Promise<FichaCliente | null> {
  const verMargen = nivel !== 'COMERCIAL'
  const empresa = await prisma.crmEmpresa.findUnique({
    where: { id: empresaId },
    include: {
      contactos: { where: { activo: true }, orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }], take: 50, include: { contacto: { select: { id: true, nombre: true, email: true, propiedades: true } } } },
      clientes: { include: { cliente: { select: { id: true, codigo: true, activo: true, formaPago: true } } } },
    },
  })
  if (!empresa) return null
  const contactoIds = empresa.contactos.map((c) => c.contactoId)
  let lecturaIsp: Awaited<ReturnType<typeof leerIdentidadIspEmpresa>>
  try { lecturaIsp = await leerIdentidadIspEmpresa(prisma, empresa.id, { nombre: empresa.nombre, nif: empresa.nif }) }
  catch { lecturaIsp = { identidad: identidadIspNoVerificable({ nombre: empresa.nombre, nif: empresa.nif }), isp: [], clientes: [] } }
  const { identidad: identidadIsp, isp, clientes: clientesIsp } = lecturaIsp
  const nombreFiscal = identidadIsp.nombre
  const codigos = [...new Set([...isp.map((c) => c.codigo), ...clientesIsp.map((c) => c.codigo).filter(Boolean) as string[]])]
  const codigosNorm = [...new Set(codigos.map(normCodigo))]
  const contratosRaw = isp.flatMap((c) => c.contratos)
  const codigosContrato = contratosRaw.map((c) => c.codigoContratoIsp)
  const meses = ultimos12(hoy)
  const desde = new Date(`${meses[0]}-01T00:00:00Z`)

  const [facturas, actividades, tareas, negocios, consent, hsDeals, pipelines] = await Promise.all([
    codigos.length ? prisma.factura.findMany({
      where: { codigoCliente: { in: [...new Set([...codigos, ...codigosNorm, ...codigosNorm.map((c) => c.padStart(6, '0'))])] }, fecha: { gte: desde } },
      select: { id: true, numeroDocumento: true, fecha: true, base: true, total: true, situacion: true, totalPendiente: true },
      orderBy: { fecha: 'desc' }, take: 400,
    }) : Promise.resolve([]),
    prisma.crmActividad.findMany({
      where: { OR: [{ empresaId: empresa.id }, ...(contactoIds.length ? [{ empresaId: null, OR: [{ contactoId: { in: contactoIds } }, { contactos: { some: { contactoId: { in: contactoIds } } } }] }] : [])] },
      select: { id: true, empresaId: true, contactoId: true, tipo: true, titulo: true, descripcion: true, metadatos: true, fechaActividad: true, direccion: true, resultado: true, origen: true, creadoPorNombre: true, contacto: { select: { nombre: true, email: true } } },
      orderBy: { fechaActividad: 'desc' }, take: 120,
    }),
    prisma.crmTarea.findMany({ where: { OR: [{ empresaId: empresa.id }, ...(contactoIds.length ? [{ empresaId: null, contactoId: { in: contactoIds } }] : [])], estado: { notIn: ['COMPLETADA', 'CANCELADA'] } }, orderBy: { venceAt: 'asc' }, take: 8, select: { titulo: true, venceAt: true } }),
    prisma.area1CrmNegocio.findMany({
      where: { activo: true, OR: [{ empresaId: empresa.id }, ...(contactoIds.length ? [{ contactoId: { in: contactoIds } }] : [])] },
      include: { etapa: { select: { nombre: true, orden: true } }, pipeline: { select: { nombre: true, etapas: { where: { activo: true }, orderBy: { orden: 'asc' }, select: { nombre: true, orden: true, resultado: true } } } } },
      orderBy: { updatedAt: 'desc' }, take: 30,
    }),
    contactoIds.length ? prisma.area1CrmConsentimiento.findMany({ where: { contactoId: { in: contactoIds } }, select: { estado: true, rebote: true, canal: true } }) : Promise.resolve([]),
    contactoIds.length ? prisma.crmNegocioContacto.findMany({ where: { contactoId: { in: contactoIds } }, select: { negocio: { select: { hubspotId: true, nombre: true, pipelineHubspotId: true, importe: true, fechaCierre: true, cerrado: true, ganado: true, activo: true } } }, take: 60 }) : Promise.resolve([]),
    prisma.area1CrmPipeline.findMany({ select: { nombre: true, hubspotPipelineIds: true } }),
  ])

  // Devoluciones de las facturas del cliente.
  const devoluciones = facturas.length ? await prisma.devolucionRemesa.findMany({ where: { facturaId: { in: facturas.map((f) => f.id) } }, select: { facturaId: true, importe: true, fechaDevolucion: true, numeroFactura: true } }) : []
  const devueltas = new Set(devoluciones.map((d) => d.facturaId))

  // Rentabilidad (solo gerente y superadmin): PROYECCION/version DESC, 12 meses completos.
  // Cliente y contratos salen de los mismos IDs de foto; nunca fuentes vivas ni recalculado.
  let rent: FichaCliente['rentabilidad'] = null
  let margenContrato = new Map<string, number | null>()
  let margenUltimo: ProyeccionFichaRentabilidad['margenUltimo'] = null
  if (verMargen && codigosNorm.length) {
    const lectura = await leerRentabilidadFicha(prisma, codigosNorm, hoy)
    rent = lectura.rentabilidad
    margenContrato = lectura.margenContrato
    margenUltimo = lectura.margenUltimo
  } else if (verMargen) {
    // SIN_VINCULO explícito y sin consultar fotos de otros clientes.
    const lectura = await leerRentabilidadFicha(prisma, [], hoy)
    rent = lectura.rentabilidad
    margenUltimo = lectura.margenUltimo
  }

  const subida = codigosContrato.length || empresa.nif ? await leerSubidaCliente({ codigosContrato, cif: empresa.nif }) : null

  // Contratos
  const contratos: ContratoFicha[] = contratosRaw.map((c): ContratoFicha => {
    const activo = c.activo && !c.fechaBaja
    const fin = c.permanenciaHasta ? diaDe(c.permanenciaHasta) : null
    const m = margenContrato.get(normCodigo(c.codigoContratoIsp))
    return {
      codigo: c.codigoContratoIsp, producto: c.tarifa || SIN_DATO, sede: c.descripcion || SIN_DATO, cuota: num(c.importeSinIva),
      estado: activo ? 'Activo' : 'Baja', finPermanencia: c.permanenciaHasta ? mesAnio(c.permanenciaHasta) : (c.permanenciaTexto || '—'), finPermanenciaFecha: fin,
      cuentaIsp: isp.find(s => s.contratos.some(k => k.id === c.id))?.codigo, estadoOrigen: c.estado, periodicidad: c.periodicidad, presente: c.presenteEnUltimoFichero,
      margenPct: verMargen && m != null && Number.isFinite(m) ? Math.round(m * 10) / 10 : null,
    }
  }).sort((a, b) => (a.estado === b.estado ? a.codigo.localeCompare(b.codigo) : a.estado === 'Activo' ? -1 : 1))
  const cuota = cuotaMensual(contratos)

  // Facturación
  const facturasF: FacturaFicha[] = facturas.filter((f) => mesDe(f.fecha) <= mesDe(hoy)).map((f) => ({
    numero: f.numeroDocumento, fecha: fechaLarga(f.fecha), fechaIso: f.fecha.toISOString(), mes: mesDe(f.fecha),
    base: Number(f.base), total: Number(f.total), pendiente: Number(f.totalPendiente),
    estado: devueltas.has(f.id) && Number(f.totalPendiente) > 0 ? 'Devuelto' : f.situacion === 'COBRADA' ? 'Cobrada' : 'Pendiente',
  }))
  const serie = serieMensual(facturasF, meses)
  const facturado12 = serie.some(v => v !== null) ? serie.reduce<number>((s, v) => s + (v ?? 0), 0) : null
  const anio = mesDe(hoy).slice(0, 4)
  const cobrado = facturasF.length ? facturasF.filter((f) => f.mes.startsWith(anio)).reduce((s, f) => s + (f.total - f.pendiente), 0) : null
  const pendiente = facturasF.length ? facturasF.reduce((s, f) => s + f.pendiente, 0) : null
  const pendientePorFactura = new Map(facturas.map((f) => [f.id, Number(f.totalPendiente)]))
  const devPend = devoluciones.filter((d) => d.facturaId != null && (pendientePorFactura.get(d.facturaId) || 0) > 0)
  const formaPago = contratosRaw.find((c) => c.formaPago)?.formaPago || clientesIsp.find((c) => c.formaPago)?.formaPago || null

  // Personas
  const ultimoPorContacto = new Map<string, { fecha: Date; tipo: string }>()
  for (const a of actividades) if (a.contactoId && cuentaComoContactoFicha(a) && !ultimoPorContacto.has(a.contactoId)) ultimoPorContacto.set(a.contactoId, { fecha: a.fechaActividad, tipo: a.tipo })
  const personas: PersonaFicha[] = empresa.contactos.map((r) => {
    const nombre = r.contacto.nombre || r.contacto.email || 'Contacto sin nombre'
    const cargo = prop(r.contacto.propiedades, 'jobtitle')
    const papel = [cargo, r.papel ? (papelTxt[r.papel] || r.papel).toLowerCase() : null].filter(Boolean).join(' · ') || SIN_DATO
    const u = ultimoPorContacto.get(r.contactoId)
    return { id: r.contactoId, iniciales: iniciales(nombre), nombre, papel, email: r.contacto.email || null, ultimo: u ? `${TIPO_TXT[u.tipo] || 'Actividad'} ${cuando(u.fecha, hoy)}` : '—' }
  })

  // Actividad unificada: CRM (Outlook, reuniones, notas, llamadas, HubSpot) + ISP (altas, bajas, devoluciones) + negocios de HubSpot cerrados.
  const eventos: EventoFicha[] = actividades.map((a) => {
    const fuente = fuenteActividad(a.origen, a.metadatos)
    const cat = categoriaActividad(a.tipo)
    const persona = a.contacto?.nombre || a.contacto?.email || (a.empresaId ? empresa.nombre : SIN_DATO)
    const autor = a.creadoPorNombre || (fuente === 'HubSpot' ? 'HubSpot' : SIN_DATO)
    const quien = a.tipo === 'CORREO' ? (a.direccion === 'ENTRANTE' ? persona : `${autor} → ${persona}`) : a.tipo === 'REUNION' ? persona : autor
    return {
      id: a.id, cat, tipo: tipoTexto(a.tipo, a.direccion), quien, titulo: a.titulo || tipoTexto(a.tipo, a.direccion), texto: (a.descripcion || '').replace(/\s+/g, ' ').slice(0, 280),
      cuando: cuando(a.fechaActividad, hoy, a.tipo === 'REUNION'), fechaIso: a.fechaActividad.toISOString(), fuente, contactoId: a.contactoId,
      etiqueta: a.resultado ? ETIQUETA_RESULTADO_AISLADO[a.resultado] || null : null,
      acciones: a.tipo === 'CORREO' && a.direccion === 'ENTRANTE' ? ['responder', 'ia'] : [],
    }
  })
  for (const c of contratosRaw) {
    if (c.fechaAlta) eventos.push({ id: `isp-a-${c.id}`, cat: 'isp', tipo: 'Alta de contrato', quien: 'ISP Gestión', titulo: [c.tarifa, c.descripcion].filter(Boolean).join(' · ') || c.codigoContratoIsp, texto: `Contrato ${c.codigoContratoIsp}${num(c.importeSinIva) != null ? `, ${eur(num(c.importeSinIva)!, 2)}/mes` : ''}.`, cuando: cuando(c.fechaAlta, hoy), fechaIso: c.fechaAlta.toISOString(), fuente: 'ISP', contactoId: null, etiqueta: null, acciones: [] })
    if (c.fechaBaja) eventos.push({ id: `isp-b-${c.id}`, cat: 'isp', tipo: 'Baja de contrato', quien: 'ISP Gestión', titulo: [c.tarifa, c.descripcion].filter(Boolean).join(' · ') || c.codigoContratoIsp, texto: `Contrato ${c.codigoContratoIsp} dado de baja.`, cuando: cuando(c.fechaBaja, hoy), fechaIso: c.fechaBaja.toISOString(), fuente: 'ISP', contactoId: null, etiqueta: null, acciones: [] })
  }
  for (const d of devoluciones) eventos.push({ id: `isp-d-${d.facturaId}-${d.fechaDevolucion.toISOString()}`, cat: 'isp', tipo: 'Cambio en ISP Gestión', quien: 'ISP Gestión', titulo: 'Recibo devuelto', texto: `Factura ${d.numeroFactura} por ${eur(Number(d.importe), 2)}, devuelta por el banco.`, cuando: cuando(d.fechaDevolucion, hoy), fechaIso: d.fechaDevolucion.toISOString(), fuente: 'ISP', contactoId: null, etiqueta: null, acciones: [] })
  const pipeIo = new Map<string, string>()
  for (const p of pipelines) for (const h of p.hubspotPipelineIds) pipeIo.set(h, p.nombre)
  const vistos = new Set<string>()
  const historialHs: NegocioFicha[] = []
  for (const { negocio: n } of hsDeals) {
    if (!n || vistos.has(n.hubspotId) || !n.cerrado || !n.activo || !pipeIo.has(n.pipelineHubspotId)) continue // LFDeal y otros pipelines: fuera
    vistos.add(n.hubspotId)
    const res = n.ganado ? 'GANADO' : 'PERDIDO'
    const titulo = `Negocio de HubSpot ${n.ganado ? 'ganado' : 'perdido'}`
    historialHs.push({ nombre: n.nombre, pipeline: pipeIo.get(n.pipelineHubspotId)!, etapa: n.ganado ? 'Ganado' : 'Perdido', etapas: [], indice: 0, importe: num(n.importe), siguiente: 'Historial de HubSpot', resultado: res, historial: true, fecha: n.fechaCierre ? fechaLarga(n.fechaCierre) : null })
    if (n.fechaCierre) eventos.push({ id: `hs-n-${n.hubspotId}`, cat: 'note', tipo: titulo, quien: 'HubSpot', titulo: n.nombre, texto: num(n.importe) != null ? `Importe ${eur(num(n.importe)!, 2)}.` : 'Importe sin dato.', cuando: cuando(n.fechaCierre, hoy), fechaIso: n.fechaCierre.toISOString(), fuente: 'HubSpot', contactoId: null, etiqueta: null, acciones: [] })
  }
  eventos.sort((a, b) => b.fechaIso.localeCompare(a.fechaIso))

  // Negocios del panel (abiertos primero) + historial de HubSpot.
  const negociosF: NegocioFicha[] = negocios.map((n) => {
    const etapas = n.pipeline.etapas.filter((e) => e.resultado === 'ABIERTA').map((e) => e.nombre).concat(['Ganado'])
    const idx = n.resultado === 'GANADO' ? etapas.length : Math.max(1, etapas.indexOf(n.etapa.nombre) + 1)
    return { nombre: n.nombre, pipeline: n.pipeline.nombre, etapa: n.etapa.nombre, etapas, indice: idx, importe: num(n.importe), siguiente: n.notas?.split('\n')[0]?.slice(0, 120) || SIN_DATO, resultado: (n.resultado === 'GANADO' || n.resultado === 'PERDIDO' ? n.resultado : 'ABIERTO') as NegocioFicha['resultado'], historial: false, fecha: n.fechaCierrePrevista ? fechaLarga(n.fechaCierrePrevista) : null }
  })
  const todosNegocios = [...negociosF.filter((n) => n.resultado === 'ABIERTO'), ...negociosF.filter((n) => n.resultado !== 'ABIERTO'), ...historialHs]

  // Cabecera
  const tipo = tipoEmpresa(empresa.tipo)
  const vinculoIsp = identidadIsp.cuentas.length ? 'vinculado' as const : null
  const codigoIsp = identidadIsp.cuentas.map(c => c.codigo).filter(Boolean).join(', ') || null
  const fechasInicio = identidadIsp.cuentas.map(c => c.fechaInicio).filter((f): f is string => Boolean(f)).sort()
  const desdeIsp = fechasInicio[0] ? new Date(fechasInicio[0]) : null
  const comercial = isp.filter(c => c.comercial != null).map(c => `${c.codigo}: cód. ISP ${c.comercial}`).join(' · ') || null
  const activoIsp = isp.length ? isp.some((c) => c.contratos.some((k) => k.activo && !k.fechaBaja)) : clientesIsp.length ? clientesIsp.some(c => c.activo) : null
  const estado = activoIsp == null ? { txt: 'Sin datos de ISP', tono: '' as const } : activoIsp ? { txt: 'Cliente activo', tono: 'ok' as const } : { txt: 'Sin contratos activos', tono: 'mod' as const }

  // Último contacto
  const ultimoContacto = actividades.find(cuentaComoContactoFicha)
  const sedes = new Set(contratosRaw.map((c) => (c.descripcion || '').trim()).filter(Boolean))
  const devImporte = devPend.reduce((s, d) => s + Number(d.importe), 0)
  const costeEstimado = num(margenUltimo?.costeEstimado)

  const kpis: KpiFicha[] = [
    { etiqueta: 'Cuota mensual', valor: cuota.total == null ? SIN_DATO : eur(cuota.total), sub: contratos.length ? `${cuota.activos} ${cuota.activos === 1 ? 'contrato activo' : 'contratos activos'}${cuota.sinImporte ? ` · ${cuota.sinImporte} sin importe` : ''}` : 'sin contratos de ISP Gestión', go: 'contratos' },
    { etiqueta: 'Facturado 12 meses', valor: facturado12 == null ? SIN_DATO : eur(facturado12), sub: facturado12 == null ? 'sin facturas en el panel' : 'base sin IVA · facturas desde enero de 2026', go: 'facturacion' },
    verMargen
      ? { etiqueta: margenUltimo ? `Margen ${nombreMes(margenUltimo.mes)} ${margenUltimo.mes.slice(0, 4)}` : 'Margen último mes', valor: margenUltimo?.pct == null ? SIN_DATO : pct(margenUltimo.pct), clase: margenUltimo?.pct == null ? undefined : margenUltimo.pct < 0 ? 'bad' : margenUltimo.pct < 20 ? 'low' : 'ok', sub: margenUltimo?.hayEstimados && costeEstimado != null ? `incluye ${eur(costeEstimado, Number.isInteger(costeEstimado) ? 0 : 2)} de coste estimado` : margenUltimo?.margen == null ? 'sin dato de Rentabilidad' : '', go: 'rentabilidad' }
      : { etiqueta: 'Margen último mes', valor: 'sin acceso', sub: 'lo ven gerencia y superadmin', go: 'rentabilidad' },
    { etiqueta: 'Subida 2027', valor: subida ? `+${pct(subida.pctMedio)}` : 'sin propuesta', sub: subida ? `+${eur(subida.subidaMes)}/mes${subida.fechaLimiteAviso ? ` · aviso antes del ${subida.fechaLimiteAviso}` : ''}` : 'no hay escenario aprobado', go: 'rentabilidad' },
    { etiqueta: 'Pendiente de cobro', valor: pendiente == null ? SIN_DATO : eur(pendiente), sub: devPend.length ? `${devPend.length} ${devPend.length === 1 ? 'recibo devuelto' : 'recibos devueltos'}` : pendiente == null ? 'sin facturas en el panel' : 'ningún recibo devuelto', go: 'facturacion' },
    { etiqueta: 'Último contacto', valor: ultimoContacto ? haceDias(ultimoContacto.fechaActividad, hoy) : SIN_DATO, sub: ultimoContacto ? `${tipoTexto(ultimoContacto.tipo, ultimoContacto.direccion).toLowerCase()} · ${ultimoContacto.contacto?.nombre || (ultimoContacto.empresaId === empresa.id ? empresa.nombre : SIN_DATO)}` : 'sin actividad registrada', go: 'actividad' },
  ]

  const avisos = calcularAvisos({ margenPct: margenUltimo?.pct ?? null, mesMargen: margenUltimo?.mes || null, verMargen, pendiente, devueltos: devPend.length, devueltoImporte: devImporte, permanencias: contratos.filter((c) => c.estado === 'Activo' && c.finPermanenciaFecha).map((c) => c.finPermanenciaFecha!), hoy, subida })
  for (const texto of identidadIsp.discrepancias) avisos.push({ nivel: 'warn', titulo: texto.startsWith('discrepancia') ? 'discrepancia con ISP' : 'Origen ISP', texto })
  if (isp.some(c => c.presenteEnUltimoFichero === false) || contratosRaw.some(c => c.presenteEnUltimoFichero === false)) avisos.push({ nivel: 'info', titulo: 'Origen ISP histórico', texto: 'Hay datos ausentes del último fichero. Se conserva el snapshot: la ausencia no acredita una baja.' })
  if (contratosRaw.some(c => !/^mensual$/i.test(c.periodicidad || ''))) avisos.push({ nivel: 'info', titulo: 'Periodicidad de ISP', texto: 'La cuota mantiene la suma mensual existente; hay periodicidad distinta de mensual o sin dato. Consulta cada contrato de ISP.' })
  if (new Set([...contratosRaw.map(c => c.formaPago), ...clientesIsp.map(c => c.formaPago)].filter(Boolean)).size > 1) avisos.push({ nivel: 'warn', titulo: 'Formas de pago diferentes', texto: 'Las cuentas ISP tienen formas de pago distintas; el agregado conserva su selección existente, no acredita cobro bancario.' })
  if (facturas.length === 400) avisos.push({ nivel: 'info', titulo: 'Cobertura de facturas limitada', texto: 'Se ha alcanzado el límite de 400 facturas de la lectura; el agregado puede ser parcial.' })
  if (identidadIsp.cuentas.length > 1) avisos.push({ nivel: 'info', titulo: 'Agregados de varias cuentas ISP', texto: 'Cuota, facturas, saldos y rentabilidad conservan el cruce existente de los códigos ligados. Son agregados de varias cuentas, no cifras atribuibles a una identidad fiscal única.' })
  const codigosPorCuenta = identidadIsp.cuentas.map(c => c.codigo).filter((c): c is string => Boolean(c)).map(normCodigo)
  if (new Set(codigosPorCuenta).size < codigosPorCuenta.length) avisos.push({ nivel: 'warn', titulo: 'Código ISP compartido', texto: 'Varias cuentas comparten código: la facturación por código no permite atribuir el agregado a una cuenta individual.' })

  const direccion = [empresa.direccion, empresa.codigoPostal, empresa.localidad, empresa.provincia].filter(Boolean).join(', ')
  const origen = [isp.length ? 'Cliente ISP' : null, empresa.origen === 'HUBSPOT' || empresa.hubspotId ? 'importado de HubSpot' : empresa.origen === 'LOCAL' ? 'creado en el panel' : empresa.origen?.toLowerCase()].filter(Boolean).join(' · ')
  const datos: Array<[string, string]> = [
    [identidadIsp.protegida ? 'Razón social de ISP · solo lectura' : 'Razón social · dato local', nombreFiscal], [identidadIsp.protegida ? 'NIF de ISP · solo lectura' : 'NIF · dato local', identidadIsp.nif || SIN_DATO], ['Sector', empresa.sector || SIN_DATO],
    ['Sedes', sedes.size ? `${sedes.size} (${[...sedes].slice(0, 3).join(', ')}${sedes.size > 3 ? '…' : ''})` : SIN_DATO],
    ['Teléfono', empresa.telefono || SIN_DATO], ['Web', empresa.web || empresa.dominio || SIN_DATO], ['Dirección', direccion || SIN_DATO],
    ['Origen', origen || SIN_DATO], ['Código ISP · solo lectura', codigoIsp ? `${codigoIsp}${vinculoIsp === 'vinculado' ? ' (vinculado)' : ''}` : SIN_DATO],
  ]
  const mk = consent.filter((c) => c.canal === 'EMAIL' || !c.canal)
  const news = mk.some((c) => c.estado === 'CONSENTIMIENTO') ? ['Suscrito', ''] : mk.some((c) => c.estado === 'BAJA') ? ['Baja', 'b'] : mk.length ? ['No suscrito', 'o'] : [SIN_DATO, 'o']
  const rebotes = consent.filter((c) => c.rebote).length
  const comunicaciones: Array<[string, string, string]> = [
    ['Servicios contratados', activoIsp ? 'Se puede escribir' : SIN_DATO, activoIsp ? '' : 'o'],
    ['Newsletter de IO', news[0], news[1]],
    ['Correos rebotados', consent.length ? (rebotes ? `${rebotes}` : 'Ninguno') : SIN_DATO, rebotes ? 'b' : consent.length ? '' : 'o'],
  ]

  const contextoIa: ContextoResumenIa = limpiarContextoIa({
    cliente: nombreFiscal, tipo: tipo.txt, clienteDesde: desdeIsp ? String(desdeIsp.getFullYear()) : null,
    contratosActivos: cuota.activos, cuotaMensual: cuota.total, productos: [...new Set(contratos.filter((c) => c.estado === 'Activo').map((c) => c.producto).filter((p) => p !== SIN_DATO))].slice(0, 8),
    facturado12m: facturado12, pendienteCobro: pendiente, recibosDevueltos: devPend.length,
    subida: subida ? `+${pct(subida.pctMedio)} (+${eur(subida.subidaMes)}/mes), aviso antes del ${subida.fechaLimiteAviso || SIN_DATO}` : null,
    permanenciasProximas: avisos.find((a) => a.titulo === 'Permanencia') ? Number(avisos.find((a) => a.titulo === 'Permanencia')!.texto.split(' ')[0]) : 0,
    ultimasActividades: eventos.slice(0, 12).map((e) => ({ fecha: e.fechaIso.slice(0, 10), tipo: e.tipo, titulo: e.titulo, texto: e.texto })),
    tareasPendientes: tareas.map((t) => ({ vence: diaDe(t.venceAt), titulo: t.titulo })),
    negociosAbiertos: negociosF.filter((n) => n.resultado === 'ABIERTO').map((n) => ({ nombre: n.nombre, etapa: n.etapa })),
  })

  // Lectura opcional de la caché del día desde el cargador ya autorizado: no llama la ruta IA.
  // Si no existe tabla/fila o el contenido no es válido, los datos nativos siguen disponibles.
  let resumen: ResumenFicha = { puntos: resumirFichaLocal(contextoIa), origen: 'local', generado: null }
  try {
    const cache = await prisma.area1CrmFichaIa.findUnique({
      where: { empresaId_dia: { empresaId: empresa.id, dia: new Date(`${diaDe(hoy)}T00:00:00Z`) } },
      select: { puntos: true, createdAt: true },
    })
    const puntos = puntosResumenGuardado(cache?.puntos)
    if (puntos?.length && cache) resumen = { puntos, origen: 'guardado', generado: cache.createdAt.toISOString() }
  } catch { /* Caché no disponible: resumen local, sin generación ni escritura. */ }

  return {
    hoyIso: diaDe(hoy), nivel, verMargen,
    identidadIsp,
    empresa: { id: empresa.id, nombre: nombreFiscal, iniciales: iniciales(nombreFiscal), nif: identidadIsp.nif, tipo: tipo.txt, tagTipo: tipo.tag, codigoIsp, vinculoIsp, comercial, clienteDesde: desdeIsp ? String(desdeIsp.getFullYear()) : null, estado },
    kpis, eventos: eventos.slice(0, 150), tareas: tareas.map((t) => ({ ...vencimientoTarea(t.venceAt, hoy), titulo: t.titulo })), avisos, personas, negocios: todosNegocios, datos, comunicaciones, contratos,
    facturacion: { meses, serie, hayFacturas: facturasF.length > 0, cobrado, pendiente, formaPago, facturas: facturasF.slice(0, 60), anio },
    rentabilidad: rent, subida, contextoIa, resumen,
    correoPrincipal: { contactoId: personas.find((p) => p.email)?.id || null },
  }
}

// ---------- «Lo que hay que saber» con IA (caché diaria en area1_crm_ficha_ia) ----------
type ClienteLlmFicha = { chat: { completions: { create: (args: Record<string, unknown>) => Promise<{ choices: Array<{ message?: { content?: string | null } }> }> } } }
export const MODELO_FICHA_IA = () => process.env.AREA1_CRM_IA_MODEL || 'gpt-4.1-mini'
/**
 * Correos recibidos de Outlook (solo lectura) como eventos de la actividad. No se guardan: se piden al abrir y se muestran.
 * Se enlazan con la persona de la ficha por su email; el extracto es el que da Outlook (bodyPreview), sin el cuerpo completo.
 */
export function eventosDeRecibidos(
  correos: Array<{ id: string; recibido: string | null; de: string | null; deNombre: string | null; asunto: string | null; extracto: string | null }>,
  personas: Array<{ id: string; nombre: string; email: string | null }>,
  hoy: Date,
): EventoFicha[] {
  const porEmail = new Map(personas.filter((p) => p.email).map((p) => [String(p.email).trim().toLowerCase(), p]))
  return correos.filter((c) => c.recibido && !Number.isNaN(Date.parse(c.recibido))).map((c) => {
    const p = c.de ? porEmail.get(c.de) : undefined
    const fecha = new Date(c.recibido as string)
    return {
      id: `outlook-recibido:${c.id}`,
      cat: 'mail' as const,
      tipo: 'Correo recibido',
      quien: p?.nombre || c.deNombre || c.de || SIN_DATO,
      titulo: c.asunto || '(sin asunto)',
      texto: c.extracto || '',
      cuando: cuando(fecha, hoy, true),
      fechaIso: fecha.toISOString(),
      fuente: 'Outlook' as const,
      contactoId: p?.id || null,
      etiqueta: 'Solo lectura',
      acciones: p ? ['responder' as const, 'ia' as const] : [],
    }
  })
}
export function construirPromptFicha(ctx: ContextoResumenIa) {
  return [
    { role: 'system', content: 'Eres el asistente comercial de Internet Operadores (operador de telecomunicaciones y servicios IT). Escribes en español de España, claro y breve. Devuelves SOLO JSON {"puntos":[...]} con exactamente 4 frases (máx. 30 palabras cada una) sobre lo que un comercial debe saber hoy de este cliente. Usa SOLO los datos dados; si falta un dato, no lo inventes ni lo supongas (puedes decir que no consta). Nunca menciones costes, márgenes ni rentabilidad. No incluyas correos ni teléfonos.' },
    { role: 'user', content: `Datos del cliente (JSON):\n${JSON.stringify(ctx)}` },
  ]
}
export async function generarPuntosIa(ctx: ContextoResumenIa, cliente: ClienteLlmFicha): Promise<string[] | null> {
  if (contextoTieneCostes(ctx)) throw new Error('El contexto de IA no puede llevar costes ni márgenes.')
  const r = await cliente.chat.completions.create({ model: MODELO_FICHA_IA(), temperature: 0.2, response_format: { type: 'json_object' }, messages: construirPromptFicha(ctx) })
  return interpretarPuntos(r.choices[0]?.message?.content || '')
}
