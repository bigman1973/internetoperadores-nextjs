import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { BREVO_LISTAS_IO_POR_DEFECTO } from '@/lib/brevo-listas-io'
import { etiquetaOrigen, nombreDeAviso, vencimiento, type VistaResumen } from '@/lib/area1-crm-resumen-vista'

/**
 * Área 1 · Datos del Resumen del CRM. Solo lecturas. Todo filtrado en servidor según la vista:
 * en «Mío» solo lo del usuario (o el de «Ver como»); los bloques que su nivel no permite ni se consultan.
 * Cuando no hay dato, se devuelve null para que la página muestre un estado vacío, nunca una cifra inventada.
 */

const LEAD_CERRADO = ['CERRADO_GANADO', 'CERRADO_PERDIDO', 'DESCARTADO'] as const
const PARTNER_CERRADO = ['APROBADO', 'RECHAZADO', 'DESCARTADO'] as const
const TIPOS_REUNION = ['REUNION', 'MEETING']

/** Inicio del día en Madrid (sin dependencias): desplazamiento real de la zona en esa fecha. */
/** Grupo de una tarea pendiente en «Mi día» según su vencimiento (hora de Madrid). */
export function grupoTarea(vence: Date | null, hoy0: Date, finSemana: Date): 'VENCIDA' | 'HOY' | 'SEMANA' | null {
  if (!vence) return null
  const t = vence.getTime()
  if (t < hoy0.getTime()) return 'VENCIDA'
  if (t < hoy0.getTime() + 86400000) return 'HOY'
  if (t < finSemana.getTime()) return 'SEMANA'
  return null
}
export function inicioDiaMadrid(fecha: Date): Date {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(fecha)
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  const comoUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
  const offset = comoUtc - Math.floor(fecha.getTime() / 60000) * 60000
  return new Date(Date.UTC(g('year'), g('month') - 1, g('day')) - offset)
}

export type ResumenCrm = Awaited<ReturnType<typeof cargarResumenCrm>>

export async function cargarResumenCrm(vista: VistaResumen, ahora = new Date()) {
  const uid = vista.usuarioId
  const mio = vista.alcance === 'MIO'
  const hoy = inicioDiaMadrid(ahora)
  const manana = new Date(hoy.getTime() + 86400000)
  const diaSemana = (new Date(hoy.getTime() + 12 * 3600000).getUTCDay() + 6) % 7
  const lunes = new Date(hoy.getTime() - diaSemana * 86400000)
  const domingoFin = new Date(lunes.getTime() + 7 * 86400000)
  const hace7 = new Date(ahora.getTime() - 7 * 86400000)
  const hace30 = new Date(ahora.getTime() - 30 * 86400000)
  const inicioMes = inicioDiaMadrid(new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 12)))

  const filtroTareas: Prisma.CrmTareaWhereInput = mio ? { OR: [{ asignadoAId: uid }, { asignadoAId: null, creadoPorId: uid }] } : {}
  const filtroReuniones: Prisma.CrmActividadWhereInput = { tipo: { in: TIPOS_REUNION }, ...(mio ? { creadoPorId: uid } : {}) }
  const filtroNegocios: Prisma.Area1CrmNegocioWhereInput = { activo: true, ...(mio ? { propietarioId: uid } : {}) }
  const asignado = mio ? { asignadoA: uid } : {}
  const contactoVisible = {
    objectTypeId: '0-1',
    OR: [
      { hubspotId: { startsWith: 'local:' } },
      { empresasCrm: { some: { activo: true } } },
      { listas: { some: { activo: true, lista: { activo: true } } } },
      { negocios: { some: { negocio: { activo: true } } } },
    ],
  }
  const ispActivo: Prisma.IspClienteArea1WhereInput = { presenteEnUltimoFichero: true, OR: [{ fechaFin: null }, { fechaFin: { gt: ahora } }] }

  const [
    nContactos, nEmpresas, nListas, nPipelines, clientesSegmento, nIspTotal, nIspActivos, nIspConFicha,
    leadsMig, leadsSol, leadsPar, leadsAsis, leadsMigViejos, leadsSolViejos, leadsParViejos,
    reunionesHoy, reunionesSemana, tareas, tareasVencidas, pipelines, negociosAbiertos, ganadosMes, vinculosPendientes,
  ] = await Promise.all([
    prisma.crmRegistroHubspot.count({ where: contactoVisible }),
    prisma.crmEmpresa.count({ where: { activo: true } }),
    prisma.crmLista.count({ where: { activo: true } }),
    prisma.area1CrmPipeline.count({ where: { activo: true } }),
    prisma.clienteWeb.groupBy({ by: ['segmentoCrm'], where: { activo: true }, _count: { _all: true } }),
    prisma.ispClienteArea1.count(),
    prisma.ispClienteArea1.count({ where: ispActivo }),
    prisma.ispClienteArea1.count({ where: { ...ispActivo, AND: [{ OR: [{ crmContactoId: { not: null } }, { crmEmpresaId: { not: null } }, { clienteWebId: { not: null } }] }] } }),
    prisma.leadMigracionWeb.count({ where: { ...asignado, estado: { notIn: [...LEAD_CERRADO] } } }),
    prisma.leadSolucion.count({ where: { ...asignado, estado: { notIn: [...LEAD_CERRADO] } } }),
    prisma.leadPartner.count({ where: { ...asignado, estado: { notIn: [...PARTNER_CERRADO] } } }),
    mio ? Promise.resolve(0) : prisma.asistenteLead.count({ where: { estado: 'NUEVO' } }),
    prisma.leadMigracionWeb.count({ where: { ...asignado, estado: 'NUEVO', createdAt: { lt: hace7 } } }),
    prisma.leadSolucion.count({ where: { ...asignado, estado: 'NUEVO', createdAt: { lt: hace7 } } }),
    prisma.leadPartner.count({ where: { ...asignado, estado: 'NUEVO', createdAt: { lt: hace7 } } }),
    prisma.crmActividad.findMany({
      where: { ...filtroReuniones, fechaActividad: { gte: hoy, lt: manana } },
      orderBy: { fechaActividad: 'asc' }, take: 8,
      select: { id: true, titulo: true, descripcion: true, fechaActividad: true, contactoId: true, contacto: { select: { nombre: true, empresa: true } } },
    }),
    prisma.crmActividad.count({ where: { ...filtroReuniones, fechaActividad: { gte: lunes, lt: domingoFin } } }),
    prisma.crmTarea.findMany({
      // Mi día: tareas y seguimientos vencidos, de hoy y del resto de la semana (hasta el domingo).
      where: { ...filtroTareas, estado: 'PENDIENTE', venceAt: { lt: domingoFin } },
      orderBy: { venceAt: 'asc' }, take: 15,
      select: { id: true, titulo: true, descripcion: true, venceAt: true, contactoId: true, asignadoANombre: true, contacto: { select: { nombre: true, empresa: true } } },
    }),
    prisma.crmTarea.count({ where: { ...filtroTareas, estado: 'PENDIENTE', venceAt: { lt: hoy } } }),
    prisma.area1CrmPipeline.findMany({
      where: { activo: true }, orderBy: { orden: 'asc' },
      select: { id: true, nombre: true, etapas: { where: { activo: true }, orderBy: { orden: 'asc' }, select: { id: true, nombre: true, orden: true, probabilidad: true, resultado: true } } },
    }),
    prisma.area1CrmNegocio.findMany({
      where: { ...filtroNegocios, resultado: 'ABIERTO' },
      select: { pipelineId: true, etapaId: true, importe: true, propietarioId: true, propietarioNombre: true, etapa: { select: { probabilidad: true } } },
    }),
    prisma.area1CrmNegocio.findMany({
      where: { ...filtroNegocios, resultado: 'GANADO', cerradoAt: { gte: inicioMes } },
      select: { pipelineId: true, importe: true },
    }),
    vista.puede.limpieza || vista.puede.vinculosIsp ? prisma.ispVinculoArea1.count({ where: { estado: 'PENDIENTE' } }) : Promise.resolve(null),
  ])

  const seg = new Map(clientesSegmento.map((s) => [String(s.segmentoCrm), s._count._all]))
  const num = (d: Prisma.Decimal | null) => (d == null ? 0 : Number(d))

  // Pipelines: barra por etapa abierta (+ ganados del mes) y valor en negociación.
  const porPipeline = pipelines.map((p) => {
    const abiertas = p.etapas.filter((e) => e.resultado === 'ABIERTA')
    const negP = negociosAbiertos.filter((n) => n.pipelineId === p.id)
    const ganados = ganadosMes.filter((n) => n.pipelineId === p.id).length
    return {
      id: p.id,
      nombre: p.nombre,
      etapas: abiertas.map((e) => ({ nombre: e.nombre, n: negP.filter((n) => n.etapaId === e.id).length })),
      ganados,
      total: negP.length,
      valor: negP.reduce((a, n) => a + num(n.importe), 0),
    }
  })
  const ponderado = negociosAbiertos.reduce((a, n) => a + num(n.importe) * (n.etapa?.probabilidad ?? 0) / 100, 0)
  const porComercial = vista.puede.pipelinesPorComercial
    ? [...negociosAbiertos.reduce((m, n) => {
        const k = n.propietarioId == null ? 'sin' : String(n.propietarioId)
        const r = m.get(k) || { nombre: n.propietarioNombre || (n.propietarioId == null ? 'Sin propietario' : `Usuario ${n.propietarioId}`), n: 0, valor: 0, ponderado: 0 }
        r.n += 1; r.valor += num(n.importe); r.ponderado += num(n.importe) * (n.etapa?.probabilidad ?? 0) / 100
        m.set(k, r); return m
      }, new Map<string, { nombre: string; n: number; valor: number; ponderado: number }>()).values()].sort((a, b) => b.valor - a.valor)
    : null

  // Leads por origen (30 días). Equipo: captaciones de la web (todas las fuentes).
  // Mío: los leads asignados al usuario, por tipo.
  let origenes: Array<{ etiqueta: string; n: number }>
  if (mio) {
    const [m, s, pa] = await Promise.all([
      prisma.leadMigracionWeb.count({ where: { asignadoA: uid, createdAt: { gte: hace30 } } }),
      prisma.leadSolucion.count({ where: { asignadoA: uid, createdAt: { gte: hace30 } } }),
      prisma.leadPartner.count({ where: { asignadoA: uid, createdAt: { gte: hace30 } } }),
    ])
    origenes = [{ etiqueta: 'Contratación web', n: s }, { etiqueta: 'Migración web', n: m }, { etiqueta: 'Partner / gestoría', n: pa }]
  } else {
    const filas = await prisma.crmCaptacionWeb.groupBy({ by: ['formulario'], where: { fechaEnvio: { gte: hace30 } }, _count: { _all: true } })
    const agr = new Map<string, number>()
    for (const f of filas) agr.set(etiquetaOrigen(f.formulario), (agr.get(etiquetaOrigen(f.formulario)) || 0) + f._count._all)
    const asis = await prisma.asistenteLead.count({ where: { createdAt: { gte: hace30 } } })
    if (asis) agr.set('Asistente IA', asis)
    origenes = [...agr.entries()].map(([etiqueta, n]) => ({ etiqueta, n }))
  }
  origenes = origenes.filter((o) => o.n > 0).sort((a, b) => b.n - a.n)

  // Clientes a cuidar: avisos del último cálculo de Rentabilidad (solo gerente y superadmin).
  let cuidar: null | { mes: string; items: Array<{ nivel: 'bad' | 'warn'; nombre: string; texto: string; importe: number | null; clientCode: string | null }> } = null
  if (vista.puede.avisosMargen) {
    const filas = await prisma.$queryRaw<Array<{ month: string; type: string; title: string; amount: number | null; client_code: string | null }>>`
      WITH s AS (
        SELECT month, payload FROM rentabilidad_snapshots
        ORDER BY (month = to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM')) DESC, created_at DESC LIMIT 1
      )
      SELECT s.month, a->>'type' AS type, a->>'title' AS title, (a->>'amount')::float8 AS amount, a->>'clientCode' AS client_code
      FROM s, jsonb_array_elements(COALESCE(s.payload->'alerts', '[]'::jsonb)) a
      WHERE a->>'type' IN ('MARGEN_NEGATIVO', 'VIGENCIA_CONTRATO_VS_BAJA', 'ESTADO_CONTRADICTORIO')
      ORDER BY (a->>'type' = 'MARGEN_NEGATIVO') DESC, (a->>'amount')::float8 ASC NULLS LAST
      LIMIT 6`
    const mesRow = filas[0]?.month ?? (await prisma.rentabilidadSnapshot.findFirst({ orderBy: { createdAt: 'desc' }, select: { month: true } }))?.month ?? null
    if (mesRow) {
      cuidar = {
        mes: mesRow,
        items: filas.map((f) => f.type === 'MARGEN_NEGATIVO'
          ? { nivel: 'bad' as const, nombre: nombreDeAviso(f.title), texto: vista.puede.importesMargen ? `Margen conocido negativo: ${fmtEur(f.amount ?? 0)} este mes.` : 'Margen negativo este mes.', importe: vista.puede.importesMargen ? f.amount : null, clientCode: f.client_code }
          : { nivel: 'warn' as const, nombre: nombreDeAviso(f.title), texto: f.title.slice(nombreDeAviso(f.title).length + 1).trim() || f.title, importe: null, clientCode: f.client_code }),
      }
    }
  }

  // Newsletter y consentimiento (gerente y superadmin).
  let consentimiento: null | { total: number; consentimiento: number; sinBase: number; rebote: number; baja: number } = null
  if (vista.puede.consentimiento) {
    const [total, grupos, rebote] = await Promise.all([
      prisma.area1CrmConsentimiento.count(),
      prisma.area1CrmConsentimiento.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.area1CrmConsentimiento.count({ where: { rebote: true } }),
    ])
    const g = new Map(grupos.map((x) => [x.estado, x._count._all]))
    consentimiento = { total, consentimiento: g.get('CONSENTIMIENTO') || 0, sinBase: g.get('SIN_BASE_LEGAL') || 0, rebote, baja: g.get('BAJA') || 0 }
  }

  // Limpieza de datos (gerente y superadmin).
  let limpieza: null | { vinculos: number | null; sinEmail: number | null } = null
  if (vista.puede.limpieza) {
    const sinEmail = nIspTotal === 0 ? null : await prisma.ispClienteArea1.count({ where: { ...ispActivo, AND: [{ OR: [{ email: null }, { email: '' }] }, { emails: { isEmpty: true } }] } })
    limpieza = { vinculos: nIspTotal === 0 ? null : vinculosPendientes, sinEmail }
  }

  return {
    fecha: ahora,
    subnav: { contactos: nContactos, empresas: nEmpresas, clientes: nIspTotal === 0 ? null : nIspActivos, leads: leadsMig + leadsSol + leadsPar + leadsAsis, pipelines: nPipelines, listas: nListas, partners: seg.get('PARTNER') || 0 },
    kpis: {
      clientesActivos: nIspTotal === 0 ? null : nIspActivos,
      clientesConFicha: nIspConFicha,
      leadsAbiertos: leadsMig + leadsSol + leadsPar + leadsAsis,
      leadsSinContactar: leadsMigViejos + leadsSolViejos + leadsParViejos,
      ponderado,
      ganadosMes: ganadosMes.length,
      ganadosImporte: ganadosMes.reduce((a, n) => a + num(n.importe), 0),
      reunionesSemana,
      vinculosPendientes: vista.puede.vinculosIsp ? (nIspTotal === 0 ? null : vinculosPendientes) : undefined,
      tareasVencidas,
    },
    reunionesHoy: reunionesHoy.map((r) => ({
      id: r.id,
      hora: r.fechaActividad.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
      quien: r.contacto?.empresa || r.contacto?.nombre || 'Ficha sin nombre',
      que: r.titulo || r.descripcion.slice(0, 90),
      contactoId: r.contactoId,
    })),
    tareas: tareas.map((t) => ({
      id: t.id,
      grupo: grupoTarea(t.venceAt, hoy, domingoFin) || 'SEMANA',
      ...vencimiento(t.venceAt, ahora),
      titulo: t.titulo,
      detalle: [t.contacto?.empresa || t.contacto?.nombre, mio ? null : t.asignadoANombre].filter(Boolean).join(' · ') || (t.descripcion || '').slice(0, 90),
      contactoId: t.contactoId,
    })),
    origenes,
    pipelines: porPipeline,
    porComercial,
    base: { particulares: seg.get('PARTICULAR') || 0, empresas: seg.get('EMPRESA') || 0, partners: seg.get('PARTNER') || 0 },
    cuidar,
    consentimiento,
    clientesActuales: nIspTotal === 0 ? null : nIspActivos,
    limpieza,
    brevoListasIO: BREVO_LISTAS_IO_POR_DEFECTO.length,
  }
}

export function fmtEur(v: number): string {
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}
