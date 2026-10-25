import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export type AccionPrivacidad = 'PURGA' | 'SUPRESION' | 'REVOCACION'
export type TipoObjetivoPrivacidad = 'RETENCION' | 'CONVERSACION' | 'LEAD' | 'ESCALADO'
type Db = any

type FilaId = { id: string }
type FilaContacto = { referenciaTipo: 'LEAD' | 'ESCALADO'; referenciaId: string; conversacionId: string | null }

type RecuentoPrivacidad = {
  conversaciones: number
  mensajes: number
  valoraciones: number
  leads: number
  escalados: number
  huecos: number
  contactos: number
}

type InstantaneaPrivacidad = {
  accion: AccionPrivacidad
  objetivoTipo: TipoObjetivoPrivacidad
  objetivoId: string | null
  corteAt: string | null
  conversaciones: string[]
  leadsDirectos: string[]
  escaladosDirectos: string[]
  leads: string[]
  escalados: string[]
  contactos: FilaContacto[]
  recuentos: RecuentoPrivacidad
}

type CargaPreview = {
  v: 1
  actorId: number
  accion: AccionPrivacidad
  objetivoTipo: TipoObjetivoPrivacidad
  objetivoId: string | null
  corteAt: string | null
  reviewHash: string
  issuedAt: number
  expiresAt: number
}

export type PrevisualizacionPrivacidad = {
  accion: AccionPrivacidad
  objetivoTipo: TipoObjetivoPrivacidad
  corteAt: string | null
  recuentos: RecuentoPrivacidad
  reviewHash: string
  previewToken: string | null
  expiresAt: string | null
}

export type ResultadoPrivacidad = {
  ok: true
  accion: AccionPrivacidad
  recuentos: RecuentoPrivacidad
  idempotente: boolean
}

export class ErrorPrivacidad extends Error {
  constructor(public readonly codigo: string, public readonly estado = 400, mensaje?: string) {
    super(mensaje || codigo)
  }
}

const PREVIEW_TTL_MS = 15 * 60 * 1_000
const LIMITE_MAXIMO = 100

function secret(): string {
  const valor = process.env.NEXTAUTH_SECRET
  if (!valor || valor.length < 24) throw new ErrorPrivacidad('SECRETO_PREVISUALIZACION_NO_DISPONIBLE', 503)
  return valor
}

function esUuid(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}

function limitar(valor: number | undefined): number {
  if (valor === undefined) return LIMITE_MAXIMO
  if (!Number.isInteger(valor) || valor < 1 || valor > LIMITE_MAXIMO) throw new ErrorPrivacidad('LIMITE_INVALIDO')
  return valor
}

function uniq(valores: string[]): string[] {
  return [...new Set(valores)].sort()
}

function condicionIds(columna: string, ids: string[]): Prisma.Sql {
  return ids.length ? Prisma.sql`${Prisma.raw(columna)} = ANY(${ids}::uuid[])` : Prisma.sql`FALSE`
}

function huella(valor: unknown): string {
  return createHash('sha256').update(JSON.stringify(valor)).digest('hex')
}

function objetivoHash(instantanea: InstantaneaPrivacidad): string {
  return huella({
    v: 1,
    accion: instantanea.accion,
    objetivoTipo: instantanea.objetivoTipo,
    objetivoId: instantanea.objetivoId,
    corteAt: instantanea.corteAt,
  })
}

function reviewHash(instantanea: InstantaneaPrivacidad): string {
  return huella({
    v: 1,
    accion: instantanea.accion,
    objetivoTipo: instantanea.objetivoTipo,
    objetivoId: instantanea.objetivoId,
    corteAt: instantanea.corteAt,
    conversaciones: instantanea.conversaciones,
    leadsDirectos: instantanea.leadsDirectos,
    escaladosDirectos: instantanea.escaladosDirectos,
    leads: instantanea.leads,
    escalados: instantanea.escalados,
    contactos: instantanea.contactos.map(contacto => [contacto.referenciaTipo, contacto.referenciaId, contacto.conversacionId]).sort(),
    recuentos: instantanea.recuentos,
  })
}

function firmar(cuerpo: string): string {
  return createHmac('sha256', secret()).update(`asistente-privacidad-preview:v1:${cuerpo}`).digest('base64url')
}

function crearPreviewToken(carga: CargaPreview): string {
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url')
  return `${cuerpo}.${firmar(cuerpo)}`
}

function leerPreviewToken(token: string, actorId: number, ahora = Date.now()): CargaPreview {
  try {
    if (typeof token !== 'string' || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('formato')
    const [cuerpo, firma] = token.split('.')
    const recibida = Buffer.from(firma, 'base64url')
    const esperada = Buffer.from(firmar(cuerpo), 'base64url')
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) throw new Error('firma')
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as CargaPreview
    if (!carga || carga.v !== 1 || carga.actorId !== actorId || !Number.isSafeInteger(carga.issuedAt) || !Number.isSafeInteger(carga.expiresAt) || carga.issuedAt > ahora || carga.expiresAt < ahora || carga.expiresAt - carga.issuedAt !== PREVIEW_TTL_MS) throw new Error('caducado')
    if (!['PURGA', 'SUPRESION', 'REVOCACION'].includes(carga.accion) || !['RETENCION', 'CONVERSACION', 'LEAD', 'ESCALADO'].includes(carga.objetivoTipo) || !/^[0-9a-f]{64}$/.test(carga.reviewHash)) throw new Error('campos')
    if (carga.objetivoTipo === 'RETENCION' ? (carga.objetivoId !== null || !carga.corteAt) : !esUuid(carga.objetivoId)) throw new Error('objetivo')
    return carga
  } catch {
    throw new ErrorPrivacidad('PREVISUALIZACION_INVALIDA', 409, 'La previsualización no es válida o ha caducado.')
  }
}

async function filasPorCondicion(db: Db, tabla: 'asistente_conversaciones' | 'asistente_leads' | 'asistente_escalados', condicion: Prisma.Sql, limite?: number): Promise<string[]> {
  const limiteSql = limite ? Prisma.sql`LIMIT ${limite}` : Prisma.empty
  const filas = await (db.$queryRaw(Prisma.sql`
    SELECT id::text AS "id"
      FROM ${Prisma.raw(tabla)}
     WHERE ${condicion}
     ORDER BY id ASC
     ${limiteSql}
  `) as Promise<FilaId[]>)
  return uniq(filas.map(fila => fila.id))
}

async function contactosAfectados(db: Db, opciones: { corte: Date | null; conversaciones: string[]; leads: string[]; escalados: string[]; limite: number }): Promise<FilaContacto[]> {
  const clausulas: Prisma.Sql[] = []
  if (opciones.corte) clausulas.push(Prisma.sql`borrar_despues <= ${opciones.corte}`)
  if (opciones.conversaciones.length) clausulas.push(Prisma.sql`conversacion_id = ANY(${opciones.conversaciones}::uuid[])`)
  if (opciones.leads.length) clausulas.push(Prisma.sql`(referencia_tipo = 'LEAD' AND referencia_id = ANY(${opciones.leads}::uuid[]))`)
  if (opciones.escalados.length) clausulas.push(Prisma.sql`(referencia_tipo = 'ESCALADO' AND referencia_id = ANY(${opciones.escalados}::uuid[]))`)
  if (!clausulas.length) return []
  const filas = await (db.$queryRaw(Prisma.sql`
    SELECT referencia_tipo AS "referenciaTipo", referencia_id::text AS "referenciaId", conversacion_id::text AS "conversacionId"
      FROM asistente_contactos_seguros
     WHERE ${Prisma.join(clausulas, ' OR ')}
     ORDER BY referencia_tipo ASC, referencia_id ASC
     LIMIT ${opciones.limite}
  `) as Promise<FilaContacto[]>)
  const unicos = new Map<string, FilaContacto>()
  for (const fila of filas) {
    if ((fila.referenciaTipo === 'LEAD' || fila.referenciaTipo === 'ESCALADO') && esUuid(fila.referenciaId)) unicos.set(`${fila.referenciaTipo}:${fila.referenciaId}`, fila)
  }
  return [...unicos.values()].sort((a, b) => `${a.referenciaTipo}:${a.referenciaId}`.localeCompare(`${b.referenciaTipo}:${b.referenciaId}`))
}

async function contar(db: Db, sentencia: Prisma.Sql): Promise<number> {
  const filas = await (db.$queryRaw(sentencia) as Promise<Array<{ total: bigint | number | string }>>)
  return Number(filas[0]?.total || 0)
}

async function crearInstantanea(db: Db, entrada: { accion: AccionPrivacidad; objetivoTipo: TipoObjetivoPrivacidad; objetivoId?: string | null; corte?: Date | null; limite?: number }): Promise<InstantaneaPrivacidad> {
  const limite = limitar(entrada.limite)
  const objetivoId = entrada.objetivoId || null
  const corte = entrada.corte || null
  if (entrada.objetivoTipo === 'RETENCION') {
    if (entrada.accion !== 'PURGA' || !corte) throw new ErrorPrivacidad('OPERACION_INVALIDA')
  } else if (!esUuid(objetivoId)) {
    throw new ErrorPrivacidad('OBJETIVO_INVALIDO')
  }
  if (entrada.accion === 'REVOCACION' && !['LEAD', 'ESCALADO'].includes(entrada.objetivoTipo)) throw new ErrorPrivacidad('REVOCACION_OBJETIVO_INVALIDO')
  if (entrada.accion === 'SUPRESION' && entrada.objetivoTipo === 'RETENCION') throw new ErrorPrivacidad('SUPRESION_OBJETIVO_INVALIDO')

  let conversaciones: string[] = []
  let leadsDirectos: string[] = []
  let escaladosDirectos: string[] = []

  if (entrada.objetivoTipo === 'RETENCION') {
    conversaciones = await filasPorCondicion(db, 'asistente_conversaciones', Prisma.sql`borrar_despues IS NOT NULL AND borrar_despues <= ${corte!}`, limite)
    leadsDirectos = await filasPorCondicion(db, 'asistente_leads', Prisma.sql`borrar_despues <= ${corte!} AND NOT (${condicionIds('conversacion_id', conversaciones)})`, limite)
  } else if (entrada.objetivoTipo === 'CONVERSACION') {
    conversaciones = await filasPorCondicion(db, 'asistente_conversaciones', Prisma.sql`id = CAST(${objetivoId!} AS uuid)`)
  } else if (entrada.objetivoTipo === 'LEAD') {
    leadsDirectos = await filasPorCondicion(db, 'asistente_leads', entrada.accion === 'REVOCACION'
      ? Prisma.sql`id = CAST(${objetivoId!} AS uuid) AND (nombre <> '[CONTACTO_REVOCADO]' OR email IS NOT NULL OR telefono IS NOT NULL OR empresa IS NOT NULL)`
      : Prisma.sql`id = CAST(${objetivoId!} AS uuid)`)
  } else {
    escaladosDirectos = await filasPorCondicion(db, 'asistente_escalados', entrada.accion === 'REVOCACION'
      ? Prisma.sql`id = CAST(${objetivoId!} AS uuid) AND (contacto_nombre IS NOT NULL OR contacto_telefono IS NOT NULL OR contacto_email IS NOT NULL)`
      : Prisma.sql`id = CAST(${objetivoId!} AS uuid)`)
  }

  const [leadsDeConversaciones, escaladosDeConversaciones] = await Promise.all([
    filasPorCondicion(db, 'asistente_leads', condicionIds('conversacion_id', conversaciones)),
    filasPorCondicion(db, 'asistente_escalados', condicionIds('conversacion_id', conversaciones)),
  ])
  const leads = uniq([...leadsDeConversaciones, ...leadsDirectos])
  const escalados = uniq([...escaladosDeConversaciones, ...escaladosDirectos])
  const contactos = await contactosAfectados(db, { corte, conversaciones, leads, escalados, limite: limite * 4 })

  const [mensajes, valoraciones, huecos] = await Promise.all([
    contar(db, Prisma.sql`SELECT count(*)::int AS total FROM asistente_mensajes WHERE ${condicionIds('conversacion_id', conversaciones)}`),
    contar(db, Prisma.sql`SELECT count(*)::int AS total FROM asistente_valoraciones v JOIN asistente_mensajes m ON m.id = v.mensaje_id WHERE ${condicionIds('m.conversacion_id', conversaciones)}`),
    contar(db, Prisma.sql`SELECT count(*)::int AS total FROM asistente_huecos WHERE ${condicionIds('conversacion_id', conversaciones)}`),
  ])

  return {
    accion: entrada.accion,
    objetivoTipo: entrada.objetivoTipo,
    objetivoId,
    corteAt: corte ? corte.toISOString() : null,
    conversaciones,
    leadsDirectos,
    escaladosDirectos,
    leads,
    escalados,
    contactos,
    recuentos: {
      conversaciones: conversaciones.length,
      mensajes,
      valoraciones,
      leads: leads.length,
      escalados: escalados.length,
      huecos,
      contactos: contactos.length,
    },
  }
}

function salidaPreview(instantanea: InstantaneaPrivacidad, actorId: number | null, ahora = Date.now()): PrevisualizacionPrivacidad {
  const review = reviewHash(instantanea)
  if (actorId === null) return { accion: instantanea.accion, objetivoTipo: instantanea.objetivoTipo, corteAt: instantanea.corteAt, recuentos: instantanea.recuentos, reviewHash: review, previewToken: null, expiresAt: null }
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new ErrorPrivacidad('ACTOR_INVALIDO')
  const carga: CargaPreview = {
    v: 1,
    actorId,
    accion: instantanea.accion,
    objetivoTipo: instantanea.objetivoTipo,
    objetivoId: instantanea.objetivoId,
    corteAt: instantanea.corteAt,
    reviewHash: review,
    issuedAt: ahora,
    expiresAt: ahora + PREVIEW_TTL_MS,
  }
  return {
    accion: instantanea.accion,
    objetivoTipo: instantanea.objetivoTipo,
    corteAt: instantanea.corteAt,
    recuentos: instantanea.recuentos,
    reviewHash: review,
    previewToken: crearPreviewToken(carga),
    expiresAt: new Date(carga.expiresAt).toISOString(),
  }
}

/** Previsualización por defecto: no escribe ni audita y puede usarse desde el cron protegido como ensayo. */
export async function previsualizarPurga(opciones: { actorId: number | null; ahora?: Date; limite?: number } = { actorId: null }): Promise<PrevisualizacionPrivacidad> {
  const corte = opciones.ahora ? new Date(opciones.ahora) : new Date()
  if (Number.isNaN(corte.getTime())) throw new ErrorPrivacidad('FECHA_INVALIDA')
  return salidaPreview(await crearInstantanea(prisma, { accion: 'PURGA', objetivoTipo: 'RETENCION', corte, limite: opciones.limite }), opciones.actorId)
}

export async function previsualizarDerecho(entrada: { actorId: number; accion: Extract<AccionPrivacidad, 'SUPRESION' | 'REVOCACION'>; objetivoTipo: Exclude<TipoObjetivoPrivacidad, 'RETENCION'>; objetivoId: string }): Promise<PrevisualizacionPrivacidad> {
  return salidaPreview(await crearInstantanea(prisma, entrada), entrada.actorId)
}

async function bloquearInstantanea(db: Db, instantanea: InstantaneaPrivacidad): Promise<void> {
  if (instantanea.conversaciones.length) await db.$queryRaw(Prisma.sql`SELECT id FROM asistente_conversaciones WHERE ${condicionIds('id', instantanea.conversaciones)} FOR UPDATE`)
  if (instantanea.leads.length) await db.$queryRaw(Prisma.sql`SELECT id FROM asistente_leads WHERE ${condicionIds('id', instantanea.leads)} FOR UPDATE`)
  if (instantanea.escalados.length) await db.$queryRaw(Prisma.sql`SELECT id FROM asistente_escalados WHERE ${condicionIds('id', instantanea.escalados)} FOR UPDATE`)
}

async function borrarContactosSeleccionados(db: Db, contactos: FilaContacto[]): Promise<number> {
  if (!contactos.length) return 0
  const condiciones = contactos.map(contacto => Prisma.sql`(referencia_tipo = ${contacto.referenciaTipo} AND referencia_id = CAST(${contacto.referenciaId} AS uuid))`)
  return db.$executeRaw(Prisma.sql`DELETE FROM asistente_contactos_seguros WHERE ${Prisma.join(condiciones, ' OR ')}`)
}

function vacio(recuentos: RecuentoPrivacidad): boolean {
  return Object.values(recuentos).every(valor => valor === 0)
}

async function aplicarInstantanea(db: Db, instantanea: InstantaneaPrivacidad): Promise<RecuentoPrivacidad> {
  const contactos = await borrarContactosSeleccionados(db, instantanea.contactos)
  if (instantanea.accion === 'REVOCACION') {
    let leads = 0
    let escalados = 0
    if (instantanea.leadsDirectos.length) leads = await db.$executeRaw(Prisma.sql`
      UPDATE asistente_leads
         SET nombre = '[CONTACTO_REVOCADO]', email = NULL, telefono = NULL, empresa = NULL,
             estado = 'DESCARTADO', updated_at = CURRENT_TIMESTAMP
       WHERE ${condicionIds('id', instantanea.leadsDirectos)}
    `)
    if (instantanea.escaladosDirectos.length) escalados = await db.$executeRaw(Prisma.sql`
      UPDATE asistente_escalados
         SET contacto_nombre = NULL, contacto_telefono = NULL, contacto_email = NULL,
             estado = 'DESCARTADO'
       WHERE ${condicionIds('id', instantanea.escaladosDirectos)}
    `)
    return { conversaciones: 0, mensajes: 0, valoraciones: 0, leads, escalados, huecos: 0, contactos }
  }

  let huecos = 0
  let escalados = 0
  let leads = 0
  let conversaciones = 0
  if (instantanea.conversaciones.length) {
    huecos = await db.$executeRaw(Prisma.sql`DELETE FROM asistente_huecos WHERE ${condicionIds('conversacion_id', instantanea.conversaciones)}`)
    conversaciones = await db.$executeRaw(Prisma.sql`DELETE FROM asistente_conversaciones WHERE ${condicionIds('id', instantanea.conversaciones)}`)
  }
  if (instantanea.escaladosDirectos.length) escalados = await db.$executeRaw(Prisma.sql`DELETE FROM asistente_escalados WHERE ${condicionIds('id', instantanea.escaladosDirectos)}`)
  if (instantanea.leadsDirectos.length) leads = await db.$executeRaw(Prisma.sql`DELETE FROM asistente_leads WHERE ${condicionIds('id', instantanea.leadsDirectos)}`)

  // Los mensajes y valoraciones dependientes los elimina la FK CASCADE de conversaciones.
  return {
    conversaciones,
    mensajes: instantanea.recuentos.mensajes,
    valoraciones: instantanea.recuentos.valoraciones,
    leads: leads + instantanea.leads.filter(id => !instantanea.leadsDirectos.includes(id)).length,
    escalados: escalados + instantanea.escalados.filter(id => !instantanea.escaladosDirectos.includes(id)).length,
    huecos,
    contactos,
  }
}

async function auditar(db: Db, entrada: { instantanea: InstantaneaPrivacidad; actorId: number; ejecutor: string; recuentos: RecuentoPrivacidad; idempotente: boolean }): Promise<void> {
  const resultado = {
    schema: 'ASISTENTE_PRIVACIDAD_V1',
    ensayo: false,
    idempotente: entrada.idempotente,
    recuentos: entrada.recuentos,
  }
  await db.$executeRaw(Prisma.sql`
    INSERT INTO asistente_gestion_privacidad (tipo, objetivo_hash, actor_id, ejecutor, resultado)
    VALUES (${entrada.instantanea.accion}, ${objetivoHash(entrada.instantanea)}, ${entrada.actorId}, ${entrada.ejecutor}, ${JSON.stringify(resultado)}::jsonb)
  `)
}

/**
 * Ejecuta sólo tras una previsualización firmada, confirmación humana y nueva lectura dentro de transacción.
 * No toca tablas de Leads web, CRM ni finanzas.
 */
export async function confirmarPrivacidad(entrada: { actorId: number; previewToken: string; confirmacion: true; idempotencyKey: string; ejecutor?: string }): Promise<ResultadoPrivacidad> {
  if (!Number.isSafeInteger(entrada.actorId) || entrada.actorId <= 0) throw new ErrorPrivacidad('ACTOR_INVALIDO')
  if (entrada.confirmacion !== true) throw new ErrorPrivacidad('CONFIRMACION_REQUERIDA', 422)
  if (!esUuid(entrada.idempotencyKey)) throw new ErrorPrivacidad('IDEMPOTENCIA_INVALIDA')
  const preview = leerPreviewToken(entrada.previewToken, entrada.actorId)
  const corte = preview.corteAt ? new Date(preview.corteAt) : null
  if (corte && Number.isNaN(corte.getTime())) throw new ErrorPrivacidad('PREVISUALIZACION_INVALIDA', 409)

  return prisma.$transaction(async (tx: Db) => {
    const inicial = await crearInstantanea(tx, {
      accion: preview.accion,
      objetivoTipo: preview.objetivoTipo,
      objetivoId: preview.objetivoId,
      corte,
    })
    if (reviewHash(inicial) !== preview.reviewHash) throw new ErrorPrivacidad('PREVISUALIZACION_OBSOLETA', 409, 'Los datos cambiaron; revisa de nuevo antes de confirmar.')
    await bloquearInstantanea(tx, inicial)
    const revalidada = await crearInstantanea(tx, {
      accion: preview.accion,
      objetivoTipo: preview.objetivoTipo,
      objetivoId: preview.objetivoId,
      corte,
    })
    if (reviewHash(revalidada) !== preview.reviewHash) throw new ErrorPrivacidad('PREVISUALIZACION_OBSOLETA', 409, 'Los datos cambiaron; revisa de nuevo antes de confirmar.')
    const idempotente = vacio(revalidada.recuentos)
    const recuentos = idempotente
      ? { conversaciones: 0, mensajes: 0, valoraciones: 0, leads: 0, escalados: 0, huecos: 0, contactos: 0 }
      : await aplicarInstantanea(tx, revalidada)
    await auditar(tx, { instantanea: revalidada, actorId: entrada.actorId, ejecutor: entrada.ejecutor || 'admin', recuentos, idempotente })
    return { ok: true as const, accion: preview.accion, recuentos, idempotente }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 })
}

/** Identificador sólo para los recibos/tests; nunca contiene el objetivo sin hash. */
export function nuevaClaveIdempotenciaPrivacidad(): string {
  return randomUUID()
}
