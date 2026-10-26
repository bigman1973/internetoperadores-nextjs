import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { fechaLocalMadrid, obtenerMetricasAnalitica, rangoEntreFechasLocales, inicioDiaMadrid, type MetricasAnalitica, type RangoAnalitica } from '@/lib/asistente/analitica'
import { redactarPIILocal } from '@/lib/asistente/pii'
import { normalizar, sha256Hex } from '@/lib/asistente/text'
import { fuenteAptaParaPublico } from '@/lib/asistente/public-policy'

export type TipoInformeAsistente = 'DIARIO' | 'SEMANAL' | 'MENSUAL'
export type ActorInforme = number | string | { id: number }
type ClienteInforme = PrismaClient | Prisma.TransactionClient

type PeriodoInforme = { fechaLocal: string; desdeLocal: string; hastaExclusivaLocal: string }
type CandidataInforme = { tipo: string; objeto: string; titulo: string; detalle: string; impacto: number; esfuerzo: number }
type TemaInforme = { preguntaNorm: string; veces: number; ejemploAnonimo: string; canales: string[] }
type FuenteFundamento = { documentoId: string; titulo: string; fragmento: string; url: string | null }
type RespuestaFundada = { pregunta: string; propuesta: string; fuentes: FuenteFundamento[]; requiereRevisionHumana: true }
type ObjecionInforme = { categoria: 'PRECIO' | 'COBERTURA' | 'PERMANENCIA' | 'PLAZO'; total: number; ejemploAnonimo: string }
type EstadoLeadPendiente = { estado: string; total: number }

type DatosInforme = {
  version: 2
  zona: 'Europe/Madrid'
  periodo: MetricasAnalitica
  tendencias: { ultimos7Dias: MetricasAnalitica; ultimos30Dias: MetricasAnalitica }
  temas: TemaInforme[]
  ejemplosAnonimos: string[]
  huecos: RespuestaFundada[]
  serviciosSinOfertaDocumentada: Array<{ solicitud: string; veces: number; aviso: string }>
  objeciones: ObjecionInforme[]
  leadsCalientesPendientes: { total: number; porEstado: EstadoLeadPendiente[] }
  salvaguardas: {
    sinPiiDeLeads: true
    sinContactoConIAExterna: true
    aprobacionHumanaRequerida: true
    nota: string
  }
}

function sumarDias(fechaLocal: string, dias: number): string {
  const [ano, mes, dia] = fechaLocal.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

function primerDiaMesAnterior(fechaLocal: string): string {
  const [ano, mes] = fechaLocal.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10)
}

function primerDiaMes(fechaLocal: string): string { return `${fechaLocal.slice(0, 7)}-01` }

function diaSemanaMadrid(ahora: Date): number {
  return new Date(`${fechaLocalMadrid(ahora)}T12:00:00.000Z`).getUTCDay()
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
    return { fechaLocal: sumarDias(hoy, -7), desdeLocal: sumarDias(hoy, -7), hastaExclusivaLocal }
  }
  if (!forzar && !hoy.endsWith('-01')) return null
  const desdeLocal = primerDiaMesAnterior(hoy)
  return { fechaLocal: desdeLocal, desdeLocal, hastaExclusivaLocal: primerDiaMes(hoy) }
}

function actorTexto(actor: ActorInforme): string {
  return typeof actor === 'object' ? `admin:${actor.id}` : typeof actor === 'number' ? `admin:${actor}` : actor.slice(0, 120)
}

function huella(tipo: string, objeto: string): string { return sha256Hex(normalizar(`${tipo}:${objeto}`)) }
function prioridad(impacto: number, esfuerzo: number): number { return Math.max(1, Math.min(10, impacto * 2 - esfuerzo)) }
function entero(valor: unknown): number { const n = Number(valor); return Number.isFinite(n) ? n : 0 }

function primeraOracion(texto: string): string {
  const limpia = texto.replace(/\s+/g, ' ').trim()
  const candidata = limpia.match(/^[^.!?]+[.!?]+/)?.[0] || limpia
  return candidata.slice(0, 600)
}

/**
 * Recupera exclusivamente fragmentos PUBLICO/PUBLICADO de PostgreSQL.
 * No llama a embeddings, proveedores ni servicios de IA y tampoco mezcla
 * contenido de Cliente o Interno en los informes accesibles por el panel.
 */
async function fundamentosPublicos(pregunta: string, cliente: ClienteInforme = prisma): Promise<FuenteFundamento[]> {
  const consulta = normalizar(pregunta).split(' ').filter(Boolean).slice(0, 12).join(' ')
  if (consulta.length < 2) return []
  const filas = await cliente.$queryRaw<Array<{ documentoId: string; titulo: string; contenido: string; tipo: string; origen: string | null; url: string | null }>>(Prisma.sql`
    WITH lex AS (SELECT tsvector_to_array(to_tsvector('spanish', ${consulta})) AS l),
    q AS (
      SELECT l, cardinality(l) AS n,
             CASE WHEN cardinality(l) = 0 THEN NULL
                  ELSE to_tsquery('simple', array_to_string(ARRAY(SELECT quote_literal(x) FROM unnest(l) x), ' | ')) END AS tsq
        FROM lex
    ), coincidencias AS (
      SELECT f.documento_id::text AS "documentoId", f.titulo, f.contenido, f.url_fuente AS url,
             d.tipo, d.origen,
             ts_rank_cd(f.tsv, q.tsq) AS puntuacion,
             (SELECT count(*) FROM unnest(tsvector_to_array(f.tsv)) t WHERE t = ANY(q.l))::int AS total_coincidencias,
             q.n
        FROM asistente_fragmentos f
        JOIN asistente_documentos d ON d.id = f.documento_id
        JOIN asistente_documento_versiones v ON v.id = f.version_id AND v.documento_id = d.id
        CROSS JOIN q
       WHERE q.tsq IS NOT NULL
         AND f.activo = true
         AND d.estado = 'PUBLICADO'
         AND f.espacio = 'PUBLICO'
         AND d.espacio = 'PUBLICO'
         AND v.version = d.version_actual
         AND f.tenant_cliente_id IS NULL AND d.tenant_cliente_id IS NULL
         AND cardinality(f.roles) = 0 AND cardinality(d.roles) = 0
         AND f.tsv @@ q.tsq
    )
    SELECT "documentoId", titulo, contenido, tipo, origen, url
      FROM coincidencias
     WHERE total_coincidencias >= CASE WHEN n >= 3 THEN 2 ELSE 1 END
     ORDER BY total_coincidencias DESC, puntuacion DESC
     LIMIT 20
  `)
  // La ACL ya se aplica dentro de SQL; esta política adicional nunca amplía
  // permisos y excluye catálogos internos o tarifas históricas no certificadas.
  return filas.filter(fila => fuenteAptaParaPublico(fila) && (fila.tipo !== 'TARIFA' || /^publico:tarifa:[^\s]+$/.test(fila.origen || ''))).slice(0, 2).map(fila => ({
    documentoId: fila.documentoId,
    titulo: redactarPIILocal(fila.titulo, false).slice(0, 240),
    fragmento: redactarPIILocal(primeraOracion(fila.contenido), false),
    url: fila.url && /^\/(?!\/)/.test(fila.url) ? fila.url : null,
  }))
}

async function temasDelPeriodo(rango: RangoAnalitica, cliente: ClienteInforme = prisma): Promise<TemaInforme[]> {
  const filas = await cliente.$queryRaw<Array<{ preguntaNorm: string; ejemplo: string; veces: unknown; canales: string[] }>>(Prisma.sql`
    SELECT pregunta_norm AS "preguntaNorm", min(pregunta_anon) AS ejemplo,
           sum(veces)::int AS veces, array_agg(DISTINCT canal ORDER BY canal) AS canales
      FROM asistente_huecos
     WHERE created_at >= ${rango.desde} AND created_at < ${rango.hasta}
       AND canal IN ('PUBLICO', 'INTERNO')
     GROUP BY pregunta_norm
     ORDER BY sum(veces) DESC, pregunta_norm ASC
     LIMIT 10
  `)
  return filas.map(fila => ({
    preguntaNorm: redactarPIILocal(fila.preguntaNorm, true).slice(0, 300),
    ejemploAnonimo: redactarPIILocal(fila.ejemplo, true).slice(0, 500),
    veces: entero(fila.veces),
    canales: fila.canales.filter(canal => canal === 'PUBLICO' || canal === 'INTERNO'),
  }))
}

async function ejemplosDelPeriodo(rango: RangoAnalitica, cliente: ClienteInforme = prisma): Promise<string[]> {
  const filas = await cliente.$queryRaw<Array<{ texto: string }>>(Prisma.sql`
    SELECT m.texto_anon AS texto
      FROM asistente_mensajes m
      JOIN asistente_conversaciones c ON c.id = m.conversacion_id
     WHERE m.rol = 'usuario'
       AND m.created_at >= ${rango.desde} AND m.created_at < ${rango.hasta}
       AND c.canal IN ('PUBLICO', 'INTERNO')
     ORDER BY m.created_at DESC
     LIMIT 5
  `)
  return filas.map(fila => redactarPIILocal(fila.texto, true).replace(/\s+/g, ' ').trim().slice(0, 500)).filter(Boolean)
}

async function objecionesDelPeriodo(rango: RangoAnalitica, cliente: ClienteInforme = prisma): Promise<ObjecionInforme[]> {
  const reglas: Array<{ categoria: ObjecionInforme['categoria']; patron: string }> = [
    { categoria: 'PRECIO', patron: '%precio%|%caro%|%coste%|%tarifa%' },
    { categoria: 'COBERTURA', patron: '%cobertura%|%fibra%|%zona%' },
    { categoria: 'PERMANENCIA', patron: '%permanencia%|%contrato%' },
    { categoria: 'PLAZO', patron: '%plazo%|%tarda%|%instalación%' },
  ]
  const resultados: ObjecionInforme[] = []
  for (const regla of reglas) {
    const filas = await cliente.$queryRaw<Array<{ total: unknown; ejemplo: string | null }>>(Prisma.sql`
      SELECT count(*)::int AS total, min(m.texto_anon) AS ejemplo
        FROM asistente_mensajes m
        JOIN asistente_conversaciones c ON c.id = m.conversacion_id
       WHERE m.rol = 'usuario'
         AND m.created_at >= ${rango.desde} AND m.created_at < ${rango.hasta}
         AND c.canal IN ('PUBLICO', 'INTERNO')
         AND lower(m.texto_anon) SIMILAR TO ${regla.patron}
    `)
    const fila = filas[0]
    const total = entero(fila?.total)
    if (total) resultados.push({ categoria: regla.categoria, total, ejemploAnonimo: redactarPIILocal(fila?.ejemplo || '', true).slice(0, 500) })
  }
  return resultados
}

/** Sólo agrega puntuación y estado: nunca selecciona nombre, teléfono, correo ni otro PII del lead. */
async function leadsCalientesPendientes(rango: RangoAnalitica, cliente: ClienteInforme = prisma): Promise<{ total: number; porEstado: EstadoLeadPendiente[] }> {
  const filas = await cliente.$queryRaw<Array<{ estado: string; total: unknown }>>(Prisma.sql`
    SELECT estado, count(*)::int AS total
      FROM asistente_leads
     WHERE puntuacion = 'CALIENTE'
       AND estado IN ('NUEVO', 'CONTACTADO')
       AND created_at >= ${rango.desde} AND created_at < ${rango.hasta}
     GROUP BY estado
     ORDER BY total DESC, estado ASC
  `)
  const porEstado = filas.map(fila => ({ estado: fila.estado, total: entero(fila.total) }))
  return { total: porEstado.reduce((suma, fila) => suma + fila.total, 0), porEstado }
}

async function datosCompletos(rango: RangoAnalitica, hastaExclusivaLocal: string, cliente: ClienteInforme = prisma): Promise<DatosInforme> {
  const desde7 = sumarDias(hastaExclusivaLocal, -7)
  const desde30 = sumarDias(hastaExclusivaLocal, -30)
  const [periodo, ultimos7Dias, ultimos30Dias, temas, ejemplosAnonimos, objeciones, leads] = await Promise.all([
    obtenerMetricasAnalitica(rango, cliente),
    obtenerMetricasAnalitica(rangoEntreFechasLocales(desde7, hastaExclusivaLocal), cliente),
    obtenerMetricasAnalitica(rangoEntreFechasLocales(desde30, hastaExclusivaLocal), cliente),
    temasDelPeriodo(rango, cliente),
    ejemplosDelPeriodo(rango, cliente),
    objecionesDelPeriodo(rango, cliente),
    leadsCalientesPendientes(rango, cliente),
  ])
  const conFundamentos = await Promise.all(temas.slice(0, 5).map(async tema => ({ tema, fuentes: await fundamentosPublicos(tema.ejemploAnonimo, cliente) })))
  const huecos: RespuestaFundada[] = conFundamentos.map(({ tema, fuentes }) => ({
    pregunta: tema.ejemploAnonimo,
    propuesta: fuentes.length
      ? fuentes.map(fuente => fuente.fragmento).join(' ').slice(0, 1200)
      : 'No hay una fuente pública aprobada suficiente para proponer una respuesta. Requiere redacción y aprobación humana.',
    fuentes,
    requiereRevisionHumana: true,
  }))
  const serviciosSinOfertaDocumentada = conFundamentos.filter(({ fuentes }) => !fuentes.length).map(({ tema }) => ({
    solicitud: tema.ejemploAnonimo,
    veces: tema.veces,
    aviso: 'No se afirma que el servicio no exista: no hay oferta pública aprobada suficiente en la base de conocimiento.',
  }))
  return {
    version: 2,
    zona: 'Europe/Madrid',
    periodo,
    tendencias: { ultimos7Dias, ultimos30Dias },
    temas,
    ejemplosAnonimos,
    huecos,
    serviciosSinOfertaDocumentada,
    objeciones,
    leadsCalientesPendientes: leads,
    salvaguardas: {
      sinPiiDeLeads: true,
      sinContactoConIAExterna: true,
      aprobacionHumanaRequerida: true,
      nota: 'Las propuestas son borradores basados sólo en fuentes públicas aprobadas; no se publican ni indexan automáticamente.',
    },
  }
}

function candidatas(datos: MetricasAnalitica): CandidataInforme[] {
  const resultado: CandidataInforme[] = []
  for (const tema of datos.temasTendencia.slice(0, 3)) resultado.push({
    tipo: 'HUECO', objeto: tema.preguntaNorm,
    titulo: `Crear contenido para la pregunta: ${tema.preguntaNorm.slice(0, 95)}`,
    detalle: `${tema.veces} consulta${tema.veces === 1 ? '' : 's'} sin respuesta documentada durante el periodo.`,
    impacto: tema.veces >= 5 ? 5 : tema.veces >= 3 ? 4 : 3, esfuerzo: 2,
  })
  for (const documento of datos.documentosConValoracionesNegativas.slice(0, 3)) resultado.push({
    tipo: 'DOCUMENTO_NEGATIVO', objeto: documento.id,
    titulo: `Revisar el documento: ${documento.titulo.slice(0, 110)}`,
    detalle: `${documento.negativas} valoración${documento.negativas === 1 ? '' : 'es'} negativa${documento.negativas === 1 ? '' : 's'} asociada${documento.negativas === 1 ? '' : 's'} a sus citas.`,
    impacto: documento.negativas >= 4 ? 5 : 4, esfuerzo: 3,
  })
  const enfado = datos.escalados.find(escalado => escalado.motivo === 'ENFADO')?.total || 0
  if (enfado > 0) resultado.push({ tipo: 'ESCALADO_ENFADO', objeto: 'ENFADO', titulo: 'Revisar el tono de las respuestas ante incidencias', detalle: `${enfado} escalado${enfado === 1 ? '' : 's'} por enfado en el periodo.`, impacto: enfado >= 3 ? 5 : 4, esfuerzo: 2 })
  if (datos.satisfaccion.total >= 3 && (datos.satisfaccion.porcentajeUtil || 0) < 60) resultado.push({ tipo: 'SATISFACCION', objeto: 'UTILIDAD_BAJA', titulo: 'Revisar las respuestas con baja utilidad', detalle: `La utilidad registrada es del ${datos.satisfaccion.porcentajeUtil || 0} % sobre ${datos.satisfaccion.total} valoraciones.`, impacto: 4, esfuerzo: 3 })
  return resultado
}

async function guardarPropuestas(informeId: string, datos: MetricasAnalitica, cliente: ClienteInforme = prisma): Promise<void> {
  for (const candidata of candidatas(datos)) {
    const marca = huella(candidata.tipo, candidata.objeto)
    const descartada = await cliente.asistenteInformePropuesta.findFirst({ where: { huella: marca, estado: 'DESCARTADA' }, select: { id: true } })
    if (descartada) continue
    await cliente.asistenteInformePropuesta.upsert({
      where: { informeId_huella: { informeId, huella: marca } },
      create: { informeId, huella: marca, titulo: candidata.titulo.slice(0, 500), detalle: candidata.detalle.slice(0, 2000), impacto: candidata.impacto, esfuerzo: candidata.esfuerzo, prioridad: prioridad(candidata.impacto, candidata.esfuerzo) },
      update: {},
    })
  }
}

const seleccionInforme = {
  id: true, tipo: true, fechaLocal: true, periodoInicio: true, periodoFin: true, datos: true, generadoPor: true, createdAt: true,
  propuestas: { orderBy: [{ prioridad: 'desc' as const }, { id: 'asc' as const }], take: 50, select: { id: true, titulo: true, detalle: true, impacto: true, esfuerzo: true, prioridad: true, estado: true, decididoPor: true, decidedAt: true } },
}

/** Genera una vez por tipo/fecha local; la restricción única de base arbitra ejecuciones concurrentes. */
export async function generarInformeSiProcede(tipo: TipoInformeAsistente, ahora: Date, actor: ActorInforme, opciones: { forzar?: boolean; cliente?: ClienteInforme } = {}) {
  const periodo = periodoPara(tipo, ahora, Boolean(opciones.forzar))
  if (!periodo) return { generado: false, motivo: 'AUN_NO_PROCEDE' as const, informe: null }
  const rango = rangoEntreFechasLocales(periodo.desdeLocal, periodo.hastaExclusivaLocal)
  const cliente = opciones.cliente || prisma
  const datos = await datosCompletos(rango, periodo.hastaExclusivaLocal, cliente)
  const idNuevo = randomUUID()
  const insertados = await cliente.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO asistente_informes (id, tipo, fecha_local, periodo_inicio, periodo_fin, datos, generado_por)
    VALUES (CAST(${idNuevo} AS uuid), ${tipo}, CAST(${periodo.fechaLocal} AS date), ${rango.desde}, ${rango.hasta}, ${JSON.stringify(datos)}::jsonb, ${actorTexto(actor)})
    ON CONFLICT (tipo, fecha_local) DO NOTHING
    RETURNING id::text AS id
  `)
  const id = insertados[0]?.id
  if (!id) {
    const existente = await cliente.asistenteInforme.findFirst({ where: { tipo, fechaLocal: inicioDiaMadrid(periodo.fechaLocal) }, select: seleccionInforme })
    return { generado: false, motivo: 'YA_EXISTE' as const, informe: existente || null }
  }
  await guardarPropuestas(id, datos.periodo, cliente)
  const informe = await cliente.asistenteInforme.findUniqueOrThrow({ where: { id }, select: seleccionInforme })
  return { generado: true, motivo: 'GENERADO' as const, informe }
}

/** Punto único para CLI y endpoint protegido: diario, semanal y mensual cuando corresponde en Madrid. */
export async function ejecutarInformesProgramados(ahora: Date, actor: ActorInforme) {
  return prisma.$transaction(async tx => {
    const bloqueo = await tx.$queryRaw<Array<{ adquirido: boolean }>>(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext('asistente:informes:programados:v1')) AS adquirido`)
    if (!bloqueo[0]?.adquirido) return []
    const resultados = []
    for (const tipo of ['DIARIO', 'SEMANAL', 'MENSUAL'] as const) resultados.push({ tipo, ...(await generarInformeSiProcede(tipo, ahora, actor, { cliente: tx })) })
    return resultados
  })
}

/** La primera decisión es terminal y conserva actor/fecha como auditoría mínima sin PII. */
export async function cambiarEstadoPropuestaInforme(id: string, estado: 'ACEPTADA' | 'DESCARTADA' | 'HECHA', actorId: number) {
  const actualizada = await prisma.asistenteInformePropuesta.updateMany({
    where: { id, estado: 'PENDIENTE' },
    data: { estado, decididoPor: actorId, decidedAt: new Date() },
  })
  if (!actualizada.count) throw new Error('PROPUESTA_NO_PENDIENTE')
  return { id, estado }
}
