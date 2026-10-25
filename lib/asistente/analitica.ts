import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'

const ZONA = 'Europe/Madrid'
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/

type ClienteConsulta = Pick<PrismaClient, '$queryRaw'>

export type RangoAnalitica = {
  desde: Date
  hasta: Date
  desdeLocal: string
  hastaLocal: string
}

export type MetricasAnalitica = {
  periodo: { desde: string; hasta: string; desdeLocal: string; hastaLocal: string }
  volumen: Array<{ dia: string; canal: string; conversaciones: number; mensajes: number }>
  resueltasSinHumano: { conversaciones: number; resueltas: number; porcentaje: number }
  escalados: Array<{ motivo: string; total: number }>
  huecosNuevos: number
  satisfaccion: { utiles: number; noUtiles: number; total: number; porcentajeUtil: number | null }
  conversionLead: { conversaciones: number; conLead: number; porcentaje: number }
  temasTendencia: Array<{ preguntaNorm: string; veces: number }>
  documentosCitados: Array<{ id: string; titulo: string; espacio: string; usos: number }>
  documentosConValoracionesNegativas: Array<{ id: string; titulo: string; negativas: number }>
}

function partesFecha(fecha: Date): { ano: number; mes: number; dia: number; hora: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  const valor = (tipo: string) => Number(partes.find(parte => parte.type === tipo)?.value || 0)
  return { ano: valor('year'), mes: valor('month'), dia: valor('day'), hora: valor('hour') }
}

export function fechaLocalMadrid(fecha: Date): string {
  const valor = partesFecha(fecha)
  return `${valor.ano}-${String(valor.mes).padStart(2, '0')}-${String(valor.dia).padStart(2, '0')}`
}

function sumarDias(fechaLocal: string, dias: number): string {
  const [ano, mes, dia] = fechaLocal.split('-').map(Number)
  const fecha = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return fecha.toISOString().slice(0, 10)
}

/** Convierte medianoche de Madrid a UTC sin depender de la zona del proceso. */
export function inicioDiaMadrid(fechaLocal: string): Date {
  if (!FORMATO_DIA.test(fechaLocal)) throw new Error('FECHA_LOCAL_INVALIDA')
  const [ano, mes, dia] = fechaLocal.split('-').map(Number)
  const estimacion = Date.UTC(ano, mes - 1, dia)
  const localEnEstimacion = partesFecha(new Date(estimacion))
  const comoUtc = Date.UTC(localEnEstimacion.ano, localEnEstimacion.mes - 1, localEnEstimacion.dia, localEnEstimacion.hora)
  return new Date(estimacion - (comoUtc - estimacion))
}

function entero(valor: unknown): number {
  const numero = typeof valor === 'bigint' ? Number(valor) : Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0
}

export function rangoAnalitica(desde?: string | null, hasta?: string | null, ahora = new Date()): RangoAnalitica {
  const hastaLocal = hasta || fechaLocalMadrid(ahora)
  if (!FORMATO_DIA.test(hastaLocal)) throw new Error('FECHA_HASTA_INVALIDA')
  const desdeLocal = desde || sumarDias(hastaLocal, -29)
  if (!FORMATO_DIA.test(desdeLocal)) throw new Error('FECHA_DESDE_INVALIDA')
  const dias = Math.round((Date.parse(`${hastaLocal}T00:00:00.000Z`) - Date.parse(`${desdeLocal}T00:00:00.000Z`)) / 86_400_000) + 1
  if (dias < 1 || dias > 90) throw new Error('RANGO_NO_VALIDO')
  return {
    desde: inicioDiaMadrid(desdeLocal),
    hasta: inicioDiaMadrid(sumarDias(hastaLocal, 1)),
    desdeLocal,
    hastaLocal,
  }
}

export function rangoEntreFechasLocales(desdeLocal: string, hastaExclusivaLocal: string): RangoAnalitica {
  if (!FORMATO_DIA.test(desdeLocal) || !FORMATO_DIA.test(hastaExclusivaLocal)) throw new Error('FECHA_LOCAL_INVALIDA')
  if (Date.parse(`${hastaExclusivaLocal}T00:00:00.000Z`) <= Date.parse(`${desdeLocal}T00:00:00.000Z`)) throw new Error('RANGO_NO_VALIDO')
  return {
    desde: inicioDiaMadrid(desdeLocal),
    hasta: inicioDiaMadrid(hastaExclusivaLocal),
    desdeLocal,
    hastaLocal: sumarDias(hastaExclusivaLocal, -1),
  }
}

/**
 * Métricas agregadas en PostgreSQL. Nunca se carga el historial de mensajes o
 * conversaciones en memoria de la aplicación.
 */
export async function obtenerMetricasAnalitica(rango: RangoAnalitica, cliente: ClienteConsulta = prisma): Promise<MetricasAnalitica> {
  const [volumenFilas, resolucionFilas, escaladosFilas, huecosFilas, satisfaccionFilas, conversionFilas, temasFilas, documentosFilas, negativasFilas] = await Promise.all([
    cliente.$queryRaw<Array<{ dia: string; canal: string; conversaciones: unknown; mensajes: unknown }>>(Prisma.sql`
      WITH conversaciones AS (
        SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date::text AS dia, canal, count(*)::int AS conversaciones
          FROM asistente_conversaciones
         WHERE created_at >= ${rango.desde} AND created_at < ${rango.hasta}
         GROUP BY 1, 2
      ), mensajes AS (
        SELECT (m.created_at AT TIME ZONE 'Europe/Madrid')::date::text AS dia, c.canal, count(*)::int AS mensajes
          FROM asistente_mensajes m
          JOIN asistente_conversaciones c ON c.id = m.conversacion_id
         WHERE m.created_at >= ${rango.desde} AND m.created_at < ${rango.hasta}
         GROUP BY 1, 2
      )
      SELECT coalesce(c.dia, m.dia) AS dia, coalesce(c.canal, m.canal) AS canal,
             coalesce(c.conversaciones, 0)::int AS conversaciones, coalesce(m.mensajes, 0)::int AS mensajes
        FROM conversaciones c
        FULL OUTER JOIN mensajes m ON m.dia = c.dia AND m.canal = c.canal
       ORDER BY dia ASC, canal ASC
    `),
    cliente.$queryRaw<Array<{ conversaciones: unknown; resueltas: unknown }>>(Prisma.sql`
      SELECT count(*)::int AS conversaciones,
             sum(CASE WHEN NOT EXISTS (
               SELECT 1 FROM asistente_escalados e WHERE e.conversacion_id = c.id
             ) THEN 1 ELSE 0 END)::int AS resueltas
        FROM asistente_conversaciones c
       WHERE c.created_at >= ${rango.desde} AND c.created_at < ${rango.hasta}
    `),
    cliente.$queryRaw<Array<{ motivo: string; total: unknown }>>(Prisma.sql`
      SELECT motivo, count(*)::int AS total
        FROM asistente_escalados
       WHERE created_at >= ${rango.desde} AND created_at < ${rango.hasta}
       GROUP BY motivo
       ORDER BY total DESC, motivo ASC
       LIMIT 10
    `),
    cliente.$queryRaw<Array<{ total: unknown }>>(Prisma.sql`
      SELECT count(*)::int AS total
        FROM asistente_huecos
       WHERE created_at >= ${rango.desde} AND created_at < ${rango.hasta}
    `),
    cliente.$queryRaw<Array<{ utiles: unknown; noUtiles: unknown }>>(Prisma.sql`
      SELECT sum(CASE WHEN util THEN 1 ELSE 0 END)::int AS utiles,
             sum(CASE WHEN NOT util THEN 1 ELSE 0 END)::int AS "noUtiles"
        FROM asistente_valoraciones
       WHERE created_at >= ${rango.desde} AND created_at < ${rango.hasta}
    `),
    cliente.$queryRaw<Array<{ conversaciones: unknown; conLead: unknown }>>(Prisma.sql`
      SELECT count(*)::int AS conversaciones,
             sum(CASE WHEN EXISTS (
               SELECT 1 FROM asistente_leads l WHERE l.conversacion_id = c.id
             ) THEN 1 ELSE 0 END)::int AS "conLead"
        FROM asistente_conversaciones c
       WHERE c.created_at >= ${rango.desde} AND c.created_at < ${rango.hasta}
    `),
    cliente.$queryRaw<Array<{ preguntaNorm: string; veces: unknown }>>(Prisma.sql`
      SELECT pregunta_norm AS "preguntaNorm", sum(veces)::int AS veces
        FROM asistente_huecos
       WHERE created_at >= ${rango.desde} AND created_at < ${rango.hasta}
       GROUP BY pregunta_norm
       ORDER BY veces DESC, pregunta_norm ASC
       LIMIT 10
    `),
    cliente.$queryRaw<Array<{ id: string; titulo: string; espacio: string; usos: unknown }>>(Prisma.sql`
      SELECT id::text AS id, titulo, espacio, usos::int AS usos
        FROM asistente_documentos
       WHERE estado = 'PUBLICADO'
       ORDER BY usos DESC, updated_at DESC
       LIMIT 10
    `),
    cliente.$queryRaw<Array<{ id: string; titulo: string; negativas: unknown }>>(Prisma.sql`
      SELECT d.id::text AS id, d.titulo, count(*)::int AS negativas
        FROM asistente_valoraciones v
        JOIN asistente_mensajes m ON m.id = v.mensaje_id
        JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.fuentes) = 'array' THEN m.fuentes ELSE '[]'::jsonb END) fuente ON true
        JOIN asistente_documentos d ON d.id::text = coalesce(fuente->>'documentoId', fuente->>'document_id')
       WHERE v.util = false AND v.created_at >= ${rango.desde} AND v.created_at < ${rango.hasta}
       GROUP BY d.id, d.titulo
       ORDER BY negativas DESC, d.titulo ASC
       LIMIT 10
    `),
  ])

  const resolucion = resolucionFilas[0] || { conversaciones: 0, resueltas: 0 }
  const conversaciones = entero(resolucion.conversaciones)
  const resueltas = entero(resolucion.resueltas)
  const satisfaccion = satisfaccionFilas[0] || { utiles: 0, noUtiles: 0 }
  const utiles = entero(satisfaccion.utiles)
  const noUtiles = entero(satisfaccion.noUtiles)
  const totalValoraciones = utiles + noUtiles
  const conversion = conversionFilas[0] || { conversaciones: 0, conLead: 0 }
  const conversacionesLead = entero(conversion.conversaciones)
  const conLead = entero(conversion.conLead)

  return {
    periodo: {
      desde: rango.desde.toISOString(),
      hasta: rango.hasta.toISOString(),
      desdeLocal: rango.desdeLocal,
      hastaLocal: rango.hastaLocal,
    },
    volumen: volumenFilas.map(fila => ({ dia: fila.dia, canal: fila.canal, conversaciones: entero(fila.conversaciones), mensajes: entero(fila.mensajes) })),
    resueltasSinHumano: { conversaciones, resueltas, porcentaje: porcentaje(resueltas, conversaciones) },
    escalados: escaladosFilas.map(fila => ({ motivo: fila.motivo, total: entero(fila.total) })),
    huecosNuevos: entero(huecosFilas[0]?.total),
    satisfaccion: { utiles, noUtiles, total: totalValoraciones, porcentajeUtil: totalValoraciones ? porcentaje(utiles, totalValoraciones) : null },
    conversionLead: { conversaciones: conversacionesLead, conLead, porcentaje: porcentaje(conLead, conversacionesLead) },
    temasTendencia: temasFilas.map(fila => ({ preguntaNorm: fila.preguntaNorm, veces: entero(fila.veces) })),
    documentosCitados: documentosFilas.map(fila => ({ id: fila.id, titulo: fila.titulo, espacio: fila.espacio, usos: entero(fila.usos) })),
    documentosConValoracionesNegativas: negativasFilas.map(fila => ({ id: fila.id, titulo: fila.titulo, negativas: entero(fila.negativas) })),
  }
}
