import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { fechaLocalMadrid, obtenerMetricasAnalitica, rangoEntreFechasLocales, inicioDiaMadrid, type MetricasAnalitica } from '@/lib/asistente/analitica'
import { normalizar, sha256Hex } from '@/lib/asistente/text'

export type TipoInformeAsistente = 'DIARIO' | 'SEMANAL' | 'MENSUAL'
export type ActorInforme = number | string | { id: number }

type PeriodoInforme = { fechaLocal: string; desdeLocal: string; hastaExclusivaLocal: string }
type CandidataInforme = { tipo: string; objeto: string; titulo: string; detalle: string; impacto: number; esfuerzo: number }

function sumarDias(fechaLocal: string, dias: number): string {
  const [ano, mes, dia] = fechaLocal.split('-').map(Number)
  const fecha = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return fecha.toISOString().slice(0, 10)
}

function primerDiaMesAnterior(fechaLocal: string): string {
  const [ano, mes] = fechaLocal.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10)
}

function primerDiaMes(fechaLocal: string): string {
  return `${fechaLocal.slice(0, 7)}-01`
}

function diaSemanaMadrid(ahora: Date): number {
  const fecha = fechaLocalMadrid(ahora)
  return new Date(`${fecha}T12:00:00.000Z`).getUTCDay()
}

function horaMadrid(ahora: Date): number {
  const parte = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).formatToParts(ahora).find(valor => valor.type === 'hour')?.value
  return Number(parte || 0)
}

function horaDiariaConfigurada(): number {
  const valor = Number(process.env.ASSISTANT_DAILY_REPORT_HOUR || '8')
  return Number.isInteger(valor) && valor >= 0 && valor <= 23 ? valor : 8
}

function periodoPara(tipo: TipoInformeAsistente, ahora: Date, forzar: boolean): PeriodoInforme | null {
  const hoy = fechaLocalMadrid(ahora)
  if (tipo === 'DIARIO') {
    if (!forzar && horaMadrid(ahora) < horaDiariaConfigurada()) return null
    const fechaLocal = sumarDias(hoy, -1)
    return { fechaLocal, desdeLocal: fechaLocal, hastaExclusivaLocal: hoy }
  }
  if (tipo === 'SEMANAL') {
    if (!forzar && diaSemanaMadrid(ahora) !== 1) return null
    const hastaExclusivaLocal = hoy
    const desdeLocal = sumarDias(hoy, -7)
    return { fechaLocal: desdeLocal, desdeLocal, hastaExclusivaLocal }
  }
  if (!forzar && !hoy.endsWith('-01')) return null
  const desdeLocal = primerDiaMesAnterior(hoy)
  return { fechaLocal: desdeLocal, desdeLocal, hastaExclusivaLocal: primerDiaMes(hoy) }
}

function actorTexto(actor: ActorInforme): string {
  return typeof actor === 'object' ? `admin:${actor.id}` : typeof actor === 'number' ? `admin:${actor}` : actor.slice(0, 120)
}

function huella(tipo: string, objeto: string): string {
  return sha256Hex(normalizar(`${tipo}:${objeto}`))
}

function prioridad(impacto: number, esfuerzo: number): number {
  return Math.max(1, Math.min(10, impacto * 2 - esfuerzo))
}

function candidatas(datos: MetricasAnalitica): CandidataInforme[] {
  const resultado: CandidataInforme[] = []
  for (const tema of datos.temasTendencia.slice(0, 3)) {
    resultado.push({
      tipo: 'HUECO',
      objeto: tema.preguntaNorm,
      titulo: `Crear contenido para la pregunta: ${tema.preguntaNorm.slice(0, 95)}`,
      detalle: `${tema.veces} consulta${tema.veces === 1 ? '' : 's'} sin respuesta documentada durante el periodo.`,
      impacto: tema.veces >= 5 ? 5 : tema.veces >= 3 ? 4 : 3,
      esfuerzo: 2,
    })
  }
  for (const documento of datos.documentosConValoracionesNegativas.slice(0, 3)) {
    resultado.push({
      tipo: 'DOCUMENTO_NEGATIVO',
      objeto: documento.id,
      titulo: `Revisar el documento: ${documento.titulo.slice(0, 110)}`,
      detalle: `${documento.negativas} valoración${documento.negativas === 1 ? '' : 'es'} negativa${documento.negativas === 1 ? '' : 's'} asociada${documento.negativas === 1 ? '' : 's'} a sus citas.`,
      impacto: documento.negativas >= 4 ? 5 : 4,
      esfuerzo: 3,
    })
  }
  const enfado = datos.escalados.find(escalado => escalado.motivo === 'ENFADO')?.total || 0
  if (enfado > 0) {
    resultado.push({
      tipo: 'ESCALADO_ENFADO',
      objeto: 'ENFADO',
      titulo: 'Revisar el tono de las respuestas ante incidencias',
      detalle: `${enfado} escalado${enfado === 1 ? '' : 's'} por enfado en el periodo.`,
      impacto: enfado >= 3 ? 5 : 4,
      esfuerzo: 2,
    })
  }
  if (datos.satisfaccion.total >= 3 && (datos.satisfaccion.porcentajeUtil || 0) < 60) {
    resultado.push({
      tipo: 'SATISFACCION',
      objeto: 'UTILIDAD_BAJA',
      titulo: 'Revisar las respuestas con baja utilidad',
      detalle: `La utilidad registrada es del ${datos.satisfaccion.porcentajeUtil || 0} % sobre ${datos.satisfaccion.total} valoraciones.`,
      impacto: 4,
      esfuerzo: 3,
    })
  }
  return resultado
}

async function guardarPropuestas(informeId: string, datos: MetricasAnalitica): Promise<void> {
  for (const candidata of candidatas(datos)) {
    const marca = huella(candidata.tipo, candidata.objeto)
    const descartada = await prisma.asistenteInformePropuesta.findFirst({
      where: { huella: marca, estado: 'DESCARTADA' },
      select: { id: true },
    })
    if (descartada) continue
    await prisma.asistenteInformePropuesta.upsert({
      where: { informeId_huella: { informeId, huella: marca } },
      create: {
        informeId,
        huella: marca,
        titulo: candidata.titulo.slice(0, 500),
        detalle: candidata.detalle.slice(0, 2000),
        impacto: candidata.impacto,
        esfuerzo: candidata.esfuerzo,
        prioridad: prioridad(candidata.impacto, candidata.esfuerzo),
      },
      update: {},
    })
  }
}

/**
 * Genera una sola vez cada informe por tipo y fecha local. El INSERT con
 * ON CONFLICT es el bloqueo de base de datos: sólo quien recibe el id calcula
 * y guarda propuestas; los demás devuelven el informe ya existente.
 */
export async function generarInformeSiProcede(tipo: TipoInformeAsistente, ahora: Date, actor: ActorInforme, opciones: { forzar?: boolean } = {}) {
  const periodo = periodoPara(tipo, ahora, Boolean(opciones.forzar))
  if (!periodo) return { generado: false, motivo: 'AUN_NO_PROCEDE' as const, informe: null }
  const rango = rangoEntreFechasLocales(periodo.desdeLocal, periodo.hastaExclusivaLocal)
  const datos = await obtenerMetricasAnalitica(rango)
  const insertados = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO asistente_informes (tipo, fecha_local, periodo_inicio, periodo_fin, datos, generado_por)
    VALUES (${tipo}, CAST(${periodo.fechaLocal} AS date), ${rango.desde}, ${rango.hasta}, ${JSON.stringify(datos)}::jsonb, ${actorTexto(actor)})
    ON CONFLICT (tipo, fecha_local) DO NOTHING
    RETURNING id::text AS id
  `)
  const id = insertados[0]?.id
  if (!id) {
    const existente = await prisma.asistenteInforme.findFirst({
      where: { tipo, fechaLocal: inicioDiaMadrid(periodo.fechaLocal) },
      select: { id: true, tipo: true, fechaLocal: true, periodoInicio: true, periodoFin: true, datos: true, generadoPor: true, createdAt: true, propuestas: { orderBy: [{ prioridad: 'desc' }, { id: 'asc' }], take: 50, select: { id: true, titulo: true, detalle: true, impacto: true, esfuerzo: true, prioridad: true, estado: true, decidedAt: true } } },
    })
    return { generado: false, motivo: 'YA_EXISTE' as const, informe: existente || null }
  }
  await guardarPropuestas(id, datos)
  const informe = await prisma.asistenteInforme.findUniqueOrThrow({
    where: { id },
    select: { id: true, tipo: true, fechaLocal: true, periodoInicio: true, periodoFin: true, datos: true, generadoPor: true, createdAt: true, propuestas: { orderBy: [{ prioridad: 'desc' }, { id: 'asc' }], take: 50, select: { id: true, titulo: true, detalle: true, impacto: true, esfuerzo: true, prioridad: true, estado: true, decidedAt: true } } },
  })
  return { generado: true, motivo: 'GENERADO' as const, informe }
}

export async function cambiarEstadoPropuestaInforme(id: string, estado: 'ACEPTADA' | 'DESCARTADA' | 'HECHA', actorId: number) {
  const actualizada = await prisma.asistenteInformePropuesta.updateMany({
    where: { id },
    data: { estado, decididoPor: actorId, decidedAt: new Date() },
  })
  if (!actualizada.count) throw new Error('PROPUESTA_NO_ENCONTRADA')
  return { id, estado }
}
