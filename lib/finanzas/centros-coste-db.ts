/*
 * Finanzas B8 — adaptador Prisma consolidado.
 *
 * No importa B4: el puente de fuente actual se inyecta por parámetro. Así B4
 * puede llamar applyChoicesB8 dentro de su propia transacción sin un ciclo
 * reconciliation-db <-> centros-coste-db. Todas las decisiones de escritura y
 * toda lectura sensible se autorizan de nuevo dentro de su transacción.
 */
import { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { assertFinanceStagingIsolated } from '@/lib/finanzas/staging-safety'
import {
  B8_AREA_FINANZAS,
  B8_AUDIT_SCHEMA_VERSION,
  B8_NOT_SELECTED,
  B8_RECEIPT_SCHEMA,
  B8_SOURCE_NOTE_RULE,
  actorPuedeAdministrarCatalogo,
  canonicalizarEleccionesCentro,
  comprobarReplayEleccion,
  comprobarVersionLinea,
  decodificarAlcanceConfirmacionB4,
  evaluarReplayIdempotente,
  hashSolicitudAsignacion,
  hashValorAsignacion,
  mappingAuditable,
  metadataHashEleccionesCentro,
  parseAsignacionCentroCoste,
  parseCrearCentroCoste,
  parseDesactivarCentroCoste,
  parseEditarCentroCoste,
  relatedSourceHashP2,
  sha256Canonical,
  todasEleccionesNoSeleccionadas,
  validarCambioAsignacion,
  validarCentroSeleccionable,
  validarPruebaActualB8,
  validarTrazaAsignable,
  type ActorFinanzas,
  type ChoiceCanonical,
  type ChoiceInput,
  type TrazaLineaB8,
} from './centros-coste-core'

export { B8_AREA_FINANZAS } from './centros-coste-core'

type Tx = Prisma.TransactionClient & Record<string, any>
const b8 = (tx: Tx) => tx as any
const MAX_CENTROS = 500
const MAX_LINEAS = 100

export class B8CentroCosteServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'B8CentroCosteServiceError'
  }
}
function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new B8CentroCosteServiceError(status, code, message, details)
}
function fromPure<T>(result: { ok: true; value: T } | { ok: false; errors: readonly { codigo: string; mensaje: string }[] }, status = 400): T {
  if (result.ok === false) fail(status, result.errors[0]?.codigo ?? 'VALIDATION_ERROR', result.errors[0]?.mensaje ?? 'La solicitud B8 no es válida.', result.errors)
  return result.value
}
function asSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'bigint'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? BigInt(value)
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? BigInt(value)
        : null
  if (parsed === null || parsed < BigInt(Number.MIN_SAFE_INTEGER) || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(422, 'SUMA_FUERA_DE_RANGO', `${label} no cabe exactamente en un entero seguro.`)
  }
  return Number(parsed)
}
function isoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'FECHA_INVALIDA', `${field} debe ser YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'FECHA_INVALIDA', `${field} no es una fecha de calendario válida.`)
  return value
}
function nextCalendarDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
function dateToIso(value: unknown, label: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10)
  fail(422, 'FECHA_FUENTE_INVALIDA', `${label} no contiene una fecha bancaria canónica.`)
}
function boundedLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return MAX_LINEAS
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(400, 'PAGINACION_INVALIDA', 'limit debe ser un entero positivo.')
  return Math.min(value as number, MAX_LINEAS)
}
function boundedPage(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 1
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100_000) fail(400, 'PAGINACION_INVALIDA', 'pagina debe ser un entero 1..100000.')
  return value as number
}

function centroView(centro: any) {
  return {
    id: centro.id,
    codigo: centro.codigo,
    nombre: centro.nombre,
    activo: centro.activo,
    version: centro.version,
    createdAt: centro.createdAt instanceof Date ? centro.createdAt.toISOString() : centro.createdAt,
    updatedAt: centro.updatedAt instanceof Date ? centro.updatedAt.toISOString() : centro.updatedAt,
  }
}
function catalogoSnapshot(centro: any) {
  return { id: centro.id, codigo: centro.codigo, nombre: centro.nombre, activo: centro.activo, version: centro.version }
}
function b8Result(action: string, values: Record<string, unknown>) {
  return { version: B8_AUDIT_SCHEMA_VERSION, action, sourceNoteRule: B8_SOURCE_NOTE_RULE, ...values }
}

/**
 * Exact B4 policy adapter. Its implementation belongs to B4 and must lock/read
 * the current DocumentoConciliable through B4's evidenceForWrapper policy; it
 * must not compare a copied target, category, operator group, status label or a
 * payment guess. `referencia` is returned only from B4's real source projection.
 */
export type CurrentSourceValidatorB8 = Readonly<{
  /** Read-only batching; inputs have already passed current B4 active-ledger checks. */
  inspectCurrentB4DocumentSourcesTx?(
    tx: Tx,
    inputs: readonly Readonly<{movimientoId:string;documentoConciliableId:string}>[],
  ): Promise<Map<string,{referencia:string}|null>>
  assertCurrentB4DocumentSourceTx(
    tx: Tx,
    input: Readonly<{ movimientoId: string; documentoConciliableId: string }>,
  ): Promise<Readonly<{ referencia: string }>>
}>

/** All route/B4 callers must inject the same live B4 source validator. */
function requireSourceValidator(value: CurrentSourceValidatorB8 | undefined): CurrentSourceValidatorB8 {
  if (!value || typeof value.assertCurrentB4DocumentSourceTx !== 'function') {
    fail(503, 'B8_SOURCE_VALIDATOR_REQUIRED', 'Falta el validador B4 de fuente documental actual; B8 falla cerrado.')
  }
  return value
}
async function assertCurrentSource(
  validator: CurrentSourceValidatorB8,
  tx: Tx,
  movimientoId: string,
  documentoConciliableId: string | null,
): Promise<Readonly<{ referencia: string }>> {
  if (!documentoConciliableId) fail(409, 'B8_DOCUMENT_SOURCE_STALE', 'La línea DOCUMENTO no conserva una fuente documental actual.')
  try {
    const source = await validator.assertCurrentB4DocumentSourceTx(tx, { movimientoId, documentoConciliableId })
    if (!source || typeof source.referencia !== 'string' || source.referencia.trim().length === 0) {
      fail(409, 'B8_DOCUMENT_SOURCE_STALE', 'La fuente B4 actual no expone una referencia documental válida.')
    }
    return { referencia: source.referencia }
  } catch (error) {
    if (error instanceof B8CentroCosteServiceError) throw error
    const code = (error as { code?: unknown } | null)?.code
    throw new B8CentroCosteServiceError(409, 'B8_DOCUMENT_SOURCE_STALE', 'La fuente documental actual no acredita la política B4.', code === undefined ? undefined : { sourceCode: code })
  }
}

/** Authoritative actor check: row locks + verificarPermisoServer(..., tx), never session role. */
export async function requireActualActorPermissionB8Tx(tx: Tx, actorId: number, required: 'lectura' | 'escritura'): Promise<ActorFinanzas> {
  if (!Number.isSafeInteger(actorId) || actorId < 1) fail(403, 'ACTOR_NO_AUTORIZADO', 'Actor financiero no autorizado.')
  await tx.$queryRaw(Prisma.sql`SELECT id FROM usuarios_admin WHERE id = ${actorId} FOR SHARE`)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM permiso_usuarios WHERE usuario_id = ${actorId} FOR SHARE`)
  const actor = await tx.usuarioAdmin.findUnique({ where: { id: actorId }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!actor?.activo) fail(403, 'ACTOR_NO_AUTORIZADO', 'Actor financiero no autorizado.')
  const policy = await verificarPermisoServer(actor.id, B8_AREA_FINANZAS, actor.rol, tx)
  if (policy[required]) return { id: actor.id, activo: actor.activo, rol: actor.rol }
  const granular = await tx.permisoUsuario.count({ where: { usuarioId: actor.id, OR: [{ lectura: true }, { escritura: true }] } })
  if (required === 'escritura' && granular === 0 && [actor.rol, ...(actor.roles ?? [])].includes('CONTABILIDAD')) {
    return { id: actor.id, activo: actor.activo, rol: actor.rol }
  }
  fail(403, required === 'escritura' ? 'FINANCE_CONC_WRITE_REQUIRED' : 'FINANCE_CONC_READ_REQUIRED', 'Permiso financiero actual insuficiente.')
}
/** Catalog mutations deliberately exclude CONTABILIDAD and require an exact live root role. */
async function requireLiveSuperAdmin(tx: Tx, actorId: number): Promise<ActorFinanzas> {
  if (!Number.isSafeInteger(actorId) || actorId < 1) fail(403, 'ACTOR_NO_AUTORIZADO', 'Actor no autorizado.')
  const rows = await tx.$queryRaw<Array<{ id: number; activo: boolean; rol: string }>>(Prisma.sql`
    SELECT id, activo, rol::text AS rol FROM usuarios_admin WHERE id = ${actorId} FOR UPDATE
  `)
  const actor = rows[0]
  if (!actor || !actorPuedeAdministrarCatalogo(actor)) fail(403, 'SOLO_SUPER_ADMIN', 'Sólo un SUPER_ADMIN activo puede modificar el catálogo.')
  return actor
}

async function advisoryAndBankLock(tx: Tx, movimientoId: string): Promise<void> {
  // B4 lock ordering: advisory opaque movement ID before the physical bank row,
  // then B8 line. It never takes a reverse cash/line lock.
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text), 0))::text AS locked`)
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM movimientos_bancarios WHERE id = CAST(${movimientoId} AS text) FOR UPDATE
  `)
  if (rows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
}
async function probeMovimientoDeVinculo(tx: Tx, vinculoId: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ movimientoId: string }>>(Prisma.sql`
    SELECT movimiento_id AS "movimientoId" FROM vinculos_movimiento_documento WHERE id = CAST(${vinculoId} AS uuid)
  `)
  if (rows.length !== 1) fail(404, 'VINCULO_NO_ENCONTRADO', 'El vínculo B4 no existe.')
  return rows[0].movimientoId
}

type TrazaBloqueadaRow = {
  vinculoMovimientoDocumentoId: string
  movimientoId: string
  documentoConciliableId: string | null
  tipoLinea: string
  vinculoActivo: boolean
  estadoMovimientoB4: string | null
  operacionCreacionEstado: string | null
  operacionCreacionRevertida: boolean
  todasOperacionesActivasAplicadas: boolean | null
  importeBancoCentimos: number | null
  cierreActualCentimos: bigint | number | string | null
  lineasDocumentoActuales: bigint | number | string
  versionCentroCosteActual: number
  centroCosteFinanzasIdActual: string | null
  payloadHashOperacionB4: string | null
  importeDocumentalCentimos: number
}
async function lockTrazaLinea(tx: Tx, vinculoId: string, expectedMovimientoId: string): Promise<TrazaBloqueadaRow> {
  const rows = await tx.$queryRaw<TrazaBloqueadaRow[]>(Prisma.sql`
    SELECT
      v.id::text AS "vinculoMovimientoDocumentoId", v.movimiento_id AS "movimientoId",
      v.documento_conciliable_id::text AS "documentoConciliableId", v.tipo_linea::text AS "tipoLinea", v.activo AS "vinculoActivo",
      e.estado::text AS "estadoMovimientoB4", o.estado::text AS "operacionCreacionEstado",
      (o.revertida_at IS NOT NULL) AS "operacionCreacionRevertida",
      (
        SELECT COALESCE(bool_and(COALESCE(xo.estado = 'APLICADA'::"EstadoOperacionB4" AND xo.revertida_at IS NULL, false))
          FILTER (WHERE x.activo), false)
        FROM vinculos_movimiento_documento x
        LEFT JOIN operaciones_justificacion_b4 xo ON xo.id = x.operacion_creacion_id
        WHERE x.movimiento_id = v.movimiento_id
      ) AS "todasOperacionesActivasAplicadas",
      b4_importe_bancario_centimos(m.importe) AS "importeBancoCentimos",
      (SELECT COALESCE(SUM(x.importe_centimos) FILTER (WHERE x.activo), 0)::bigint FROM vinculos_movimiento_documento x WHERE x.movimiento_id = v.movimiento_id) AS "cierreActualCentimos",
      (SELECT COUNT(*) FILTER (WHERE x.activo AND x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::bigint FROM vinculos_movimiento_documento x WHERE x.movimiento_id = v.movimiento_id) AS "lineasDocumentoActuales",
      v.version_centro_coste AS "versionCentroCosteActual", v.centro_coste_finanzas_id::text AS "centroCosteFinanzasIdActual",
      o.payload_hash AS "payloadHashOperacionB4", v.importe_centimos AS "importeDocumentalCentimos"
    FROM vinculos_movimiento_documento v
    JOIN movimientos_bancarios m ON m.id = v.movimiento_id
    JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
    JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
    WHERE v.id = CAST(${vinculoId} AS uuid) AND v.movimiento_id = CAST(${expectedMovimientoId} AS text)
    FOR UPDATE OF v, e, o
  `)
  if (rows.length !== 1) fail(409, 'VINCULO_CAMBIADO', 'El vínculo cambió antes de bloquearse; relea y reintente.')
  return rows[0]
}
function trazaDe(row: TrazaBloqueadaRow): TrazaLineaB8 {
  return {
    vinculoMovimientoDocumentoId: row.vinculoMovimientoDocumentoId,
    movimientoId: row.movimientoId,
    documentoConciliableId: row.documentoConciliableId,
    tipoLinea: row.tipoLinea,
    vinculoActivo: row.vinculoActivo,
    estadoMovimientoB4: row.estadoMovimientoB4,
    operacionCreacionEstado: row.operacionCreacionEstado,
    operacionCreacionRevertida: row.operacionCreacionRevertida,
    todasOperacionesActivasAplicadas: row.todasOperacionesActivasAplicadas === true,
    importeBancoCentimos: row.importeBancoCentimos,
    cierreActualCentimos: row.cierreActualCentimos === null ? null : asSafeInteger(row.cierreActualCentimos, 'El cierre B4'),
    lineasDocumentoActuales: asSafeInteger(row.lineasDocumentoActuales, 'El número de líneas DOCUMENTO B4'),
    versionCentroCosteActual: row.versionCentroCosteActual,
    centroCosteFinanzasIdActual: row.centroCosteFinanzasIdActual,
    payloadHashOperacionB4: row.payloadHashOperacionB4,
  }
}
async function lockCentro(tx: Tx, centroId: string): Promise<any | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id::text AS id FROM centros_coste_finanzas WHERE id = CAST(${centroId} AS uuid) FOR UPDATE`)
  if (rows.length !== 1) return null
  return b8(tx).centroCosteFinanzas.findUnique({ where: { id: centroId } })
}
async function priorAudit(tx: Tx, actorId: number, idempotencyKey: string): Promise<any | null> {
  return b8(tx).auditoriaCentroCosteFinanzasB8.findUnique({ where: { actorId_idempotencyKey: { actorId, idempotencyKey } } })
}
async function insertAudit(tx: Tx, value: {
  centroCosteFinanzasId: string | null
  vinculoMovimientoDocumentoId: string | null
  actorId: number
  accion: string
  idempotencyKey?: string | null
  payloadHash: string
  valueHash: string
  snapshotSolicitud: unknown
  snapshotResultado: unknown
}) {
  return b8(tx).auditoriaCentroCosteFinanzasB8.create({ data: { ...value, sourceNoteRule: B8_SOURCE_NOTE_RULE } })
}

export async function readCentrosCosteFinanzas(options: Readonly<{ actorId: number; incluirInactivos?: boolean }>) {
  await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    await requireActualActorPermissionB8Tx(tx, options.actorId, 'lectura')
    const centros = await b8(tx).centroCosteFinanzas.findMany({
      where: options.incluirInactivos ? undefined : { activo: true },
      orderBy: [{ activo: 'desc' }, { codigo: 'asc' }], take: MAX_CENTROS,
    })
    return { recurso: 'centros' as const, items: centros.map(centroView) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
export async function crearCentroCosteFinanzas(actorId: number, raw: unknown) {
  const input = fromPure(parseCrearCentroCoste(raw)); await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx; await requireLiveSuperAdmin(tx, actorId)
    const centro = await b8(tx).centroCosteFinanzas.create({ data: { codigo: input.codigo, nombre: input.nombre, creadoPorId: actorId, actualizadoPorId: actorId } })
    const result = b8Result('crear', { centro: catalogoSnapshot(centro) })
    await insertAudit(tx, { centroCosteFinanzasId: centro.id, vinculoMovimientoDocumentoId: null, actorId, accion: 'CATALOGO_CREADO', idempotencyKey: null, payloadHash: sha256Canonical({ origen: 'B8_CATALOGO', action: 'crear', input }), valueHash: sha256Canonical(catalogoSnapshot(centro)), snapshotSolicitud: { origen: 'B8_CATALOGO', action: 'crear', input }, snapshotResultado: result })
    return { centro: centroView(centro) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
export async function editarCentroCosteFinanzas(actorId: number, raw: unknown) {
  const input = fromPure(parseEditarCentroCoste(raw)); await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx; await requireLiveSuperAdmin(tx, actorId)
    const centro = await lockCentro(tx, input.id)
    if (!centro) fail(404, 'CENTRO_NO_ENCONTRADO', 'El centro de coste no existe.')
    if (centro.version !== input.version) fail(409, 'VERSION_CONFLICT', 'El catálogo cambió; relea y reintente.')
    if (centro.codigo === input.codigo && centro.nombre === input.nombre) fail(409, 'CATALOGO_SIN_CAMBIO', 'No hay cambios de código o nombre que auditar.')
    const before = catalogoSnapshot(centro)
    const updated = await b8(tx).centroCosteFinanzas.update({ where: { id: centro.id }, data: { codigo: input.codigo, nombre: input.nombre, version: { increment: 1 }, actualizadoPorId: actorId } })
    const result = b8Result('editar', { anterior: before, centro: catalogoSnapshot(updated) })
    await insertAudit(tx, { centroCosteFinanzasId: updated.id, vinculoMovimientoDocumentoId: null, actorId, accion: 'CATALOGO_EDITADO', idempotencyKey: null, payloadHash: sha256Canonical({ origen: 'B8_CATALOGO', action: 'editar', input }), valueHash: sha256Canonical({ anterior: before, resultante: catalogoSnapshot(updated) }), snapshotSolicitud: { origen: 'B8_CATALOGO', action: 'editar', input }, snapshotResultado: result })
    return { centro: centroView(updated) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
export async function desactivarCentroCosteFinanzas(actorId: number, raw: unknown) {
  const input = fromPure(parseDesactivarCentroCoste(raw)); await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx; await requireLiveSuperAdmin(tx, actorId)
    const centro = await lockCentro(tx, input.id)
    if (!centro) fail(404, 'CENTRO_NO_ENCONTRADO', 'El centro de coste no existe.')
    if (centro.version !== input.version) fail(409, 'VERSION_CONFLICT', 'El catálogo cambió; relea y reintente.')
    if (!centro.activo) fail(409, 'CENTRO_YA_INACTIVO', 'El centro ya está desactivado.')
    const before = catalogoSnapshot(centro)
    const updated = await b8(tx).centroCosteFinanzas.update({ where: { id: centro.id }, data: { activo: false, version: { increment: 1 }, actualizadoPorId: actorId } })
    const result = b8Result('desactivar', { anterior: before, centro: catalogoSnapshot(updated) })
    await insertAudit(tx, { centroCosteFinanzasId: updated.id, vinculoMovimientoDocumentoId: null, actorId, accion: 'CATALOGO_DESACTIVADO', idempotencyKey: null, payloadHash: sha256Canonical({ origen: 'B8_CATALOGO', action: 'desactivar', input }), valueHash: sha256Canonical({ anterior: before, resultante: catalogoSnapshot(updated) }), snapshotSolicitud: { origen: 'B8_CATALOGO', action: 'desactivar', input }, snapshotResultado: result })
    return { centro: centroView(updated) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** Explicit PATCH: immutable replay is checked after B4's advisory/bank lock but before fresh source/version work. */
export async function asignarCentroCosteFinanzas(actorId: number, raw: unknown, currentSourceValidator: CurrentSourceValidatorB8) {
  const input = fromPure(parseAsignacionCentroCoste(raw)); const requestHash = hashSolicitudAsignacion(input); const validator = requireSourceValidator(currentSourceValidator)
  await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    await requireActualActorPermissionB8Tx(tx, actorId, 'escritura')
    const movimientoId = await probeMovimientoDeVinculo(tx, input.vinculoMovimientoDocumentoId)
    await advisoryAndBankLock(tx, movimientoId)
    const prior = await priorAudit(tx, actorId, input.idempotencyKey)
    const replay = fromPure(evaluarReplayIdempotente(prior, requestHash), 409)
    if (replay.idempotente) return { idempotente: true, auditoriaId: prior!.id, resultado: replay.resultado }

    const locked = await lockTrazaLinea(tx, input.vinculoMovimientoDocumentoId, movimientoId)
    const traza = trazaDe(locked)
    fromPure(validarTrazaAsignable(traza), 409)
    fromPure(comprobarVersionLinea(traza.versionCentroCosteActual, input.versionCentroCoste), 409)
    fromPure(validarCambioAsignacion(traza.centroCosteFinanzasIdActual, input.centroCosteFinanzasId), 409)
    // This is the same current signed/capacity policy as B4, not a stored target or stub.
    await assertCurrentSource(validator, tx, traza.movimientoId, traza.documentoConciliableId ?? null)

    let centroDestino: any | null = null
    if (input.mode === 'asignar') { centroDestino = await lockCentro(tx, input.centroCosteFinanzasId!); fromPure(validarCentroSeleccionable(centroDestino), 409) }
    const centroAuditoriaId = input.mode === 'asignar' ? centroDestino!.id : traza.centroCosteFinanzasIdActual
    if (!centroAuditoriaId) fail(409, 'ASIGNACION_SIN_CAMBIO', 'No existe centro previo que desasignar.')
    const newVersion = traza.versionCentroCosteActual + 1
    const changed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE vinculos_movimiento_documento SET centro_coste_finanzas_id = CAST(${input.centroCosteFinanzasId} AS uuid), version_centro_coste = ${newVersion}
      WHERE id = CAST(${input.vinculoMovimientoDocumentoId} AS uuid) AND version_centro_coste = ${input.versionCentroCoste}
      RETURNING id::text AS id
    `)
    if (changed.length !== 1) fail(409, 'VERSION_CONFLICT', 'La imputación cambió concurrentemente; relea y reintente.')
    const value = { vinculoMovimientoDocumentoId: traza.vinculoMovimientoDocumentoId, movimientoId: traza.movimientoId, centroCosteFinanzasIdAnterior: traza.centroCosteFinanzasIdActual, centroCosteFinanzasIdResultante: input.centroCosteFinanzasId, versionCentroCosteAnterior: traza.versionCentroCosteActual, versionCentroCosteResultante: newVersion, importeBancoCentimos: traza.importeBancoCentimos! }
    const result = b8Result(input.mode, { ...value, importeDocumentalCentimos: locked.importeDocumentalCentimos, payloadHashOperacionB4: traza.payloadHashOperacionB4 })
    const audit = await insertAudit(tx, { centroCosteFinanzasId: centroAuditoriaId, vinculoMovimientoDocumentoId: traza.vinculoMovimientoDocumentoId, actorId, accion: input.mode === 'asignar' ? 'ASIGNACION' : 'DESASIGNACION', idempotencyKey: input.idempotencyKey, payloadHash: requestHash, valueHash: hashValorAsignacion(value), snapshotSolicitud: { origen: 'B8_ASIGNAR', input, payloadHashOperacionB4: traza.payloadHashOperacionB4 }, snapshotResultado: result })
    return { idempotente: false, auditoriaId: audit.id, resultado: result }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export type B8CreatedDocumentLine = Readonly<{ indiceLinea: number; vinculoMovimientoDocumentoId: string; documentoConciliableId: string }>
export type ApplyChoicesB8Input = Readonly<{
  actorId: number
  operacionB4Id: string
  idempotencyKey: string
  elecciones: readonly ChoiceInput[]
  lineasDocumentoCreadas: readonly B8CreatedDocumentLine[]
  requiredCurrentSourceValidator: CurrentSourceValidatorB8
}>
type B4Proof = Readonly<{
  movimientoId: string; solicitadaPorId: number; idempotencyKey: string; estadoOperacion: string; revertida: boolean; estadoActual: string | null
  snapshotSolicitud: unknown; importeBancoCentimos: number | null; cierreActualCentimos: bigint | number | string | null; documentosActuales: bigint | number | string; operacionesActivasAplicadas: boolean | null
}>
async function lockB4CurrentProof(tx: Tx, operacionB4Id: string): Promise<B4Proof> {
  const rows = await tx.$queryRaw<B4Proof[]>(Prisma.sql`
    SELECT o.movimiento_id AS "movimientoId", o.solicitada_por_id AS "solicitadaPorId", o.idempotency_key AS "idempotencyKey", o.estado::text AS "estadoOperacion", (o.revertida_at IS NOT NULL) AS revertida,
      e.estado::text AS "estadoActual", o.snapshot_solicitud AS "snapshotSolicitud", b4_importe_bancario_centimos(m.importe) AS "importeBancoCentimos",
      (SELECT COALESCE(SUM(v.importe_centimos) FILTER (WHERE v.activo), 0)::bigint FROM vinculos_movimiento_documento v WHERE v.movimiento_id = o.movimiento_id) AS "cierreActualCentimos",
      (SELECT COUNT(*) FILTER (WHERE v.activo AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::bigint FROM vinculos_movimiento_documento v WHERE v.movimiento_id = o.movimiento_id) AS "documentosActuales",
      (SELECT COALESCE(bool_and(COALESCE(c.estado = 'APLICADA'::"EstadoOperacionB4" AND c.revertida_at IS NULL, false)) FILTER (WHERE v.activo), false)
        FROM vinculos_movimiento_documento v LEFT JOIN operaciones_justificacion_b4 c ON c.id = v.operacion_creacion_id WHERE v.movimiento_id = o.movimiento_id) AS "operacionesActivasAplicadas"
    FROM operaciones_justificacion_b4 o
    JOIN movimientos_bancarios m ON m.id = o.movimiento_id
    JOIN estado_justificacion_movimientos e ON e.movimiento_id = o.movimiento_id
    WHERE o.id = CAST(${operacionB4Id} AS uuid)
    FOR UPDATE OF o, m, e
  `)
  if (rows.length !== 1) fail(409, 'B8_B4_OPERATION_NOT_CURRENT', 'No existe una operación B4 actual bloqueable.')
  return rows[0]
}
function assertCurrentClosure(proof: B4Proof): void {
  const result = validarPruebaActualB8({
    operacionAplicadaNoRevertida: proof.estadoOperacion === 'APLICADA' && !proof.revertida,
    estadoJustificado: proof.estadoActual === 'JUSTIFICADO',
    lineasDocumentoActivas: asSafeInteger(proof.documentosActuales, 'El número de documentos B4'),
    todasOperacionesActivasAplicadas: proof.operacionesActivasAplicadas === true,
    importeBancoCentimos: proof.importeBancoCentimos,
    cierreActualCentimos: proof.cierreActualCentimos === null ? null : asSafeInteger(proof.cierreActualCentimos, 'El cierre B4 actual'),
    actualDocumentSourceGoal: true,
  })
  if (result.ok === false) fail(409, result.errors[0]!.codigo, result.errors[0]!.mensaje, result.errors)
}
function canonicalLines(input: ApplyChoicesB8Input, choices: readonly ChoiceCanonical[]) {
  const byIndex = new Map(input.lineasDocumentoCreadas.map((line) => [line.indiceLinea, line] as const))
  if (byIndex.size !== input.lineasDocumentoCreadas.length || byIndex.size !== choices.length) fail(409, 'B8_DOCUMENT_MAPPING_INVALID', 'Las líneas DOCUMENTO creadas no corresponden uno a uno con la selección B8.')
  return choices.map((choice) => {
    const line = byIndex.get(choice.indiceLinea)
    if (!line || line.documentoConciliableId.toLowerCase() !== choice.documentoConciliableId) fail(409, 'B8_DOCUMENT_MAPPING_INVALID', 'El índice B8 no coincide con la línea DOCUMENTO creada.')
    return { indiceLinea: choice.indiceLinea, documentoConciliableId: choice.documentoConciliableId, vinculoMovimientoDocumentoId: line.vinculoMovimientoDocumentoId, centroCosteFinanzasId: choice.centroCosteFinanzasId === B8_NOT_SELECTED ? null : choice.centroCosteFinanzasId }
  }).sort((a, b) => a.documentoConciliableId.localeCompare(b.documentoConciliableId) || a.indiceLinea - b.indiceLinea)
}

/**
 * Replay gate called by B4 before returning its own economic replay. Missing
 * receipt is accepted only for demonstrably historical no-centre confirmations:
 * all requested choices notselected, B4 immutable confirmation shape, and every
 * original physical row has nullable FK/version=0. It performs no retroactive
 * INSERT because B4 snapshots/source history are immutable.
 */
export async function assertB8ChoiceReceiptReplayTx(tx: Tx, input: Readonly<{ operacionB4Id: string; actorId: number; idempotencyKey: string; metadataHash: string; elecciones: readonly ChoiceCanonical[] }>): Promise<Readonly<{ legacyWithoutReceipt: boolean }>> {
  const proof = await lockB4CurrentProof(tx, input.operacionB4Id)
  if (proof.solicitadaPorId !== input.actorId || proof.idempotencyKey !== input.idempotencyKey) fail(409, 'B8_RECEIPT_OPERATION_MISMATCH', 'El actor o clave no coincide con la operación B4.')
  const scope = fromPure(decodificarAlcanceConfirmacionB4(proof.snapshotSolicitud))
  const receipt = await b8(tx).reciboEleccionCentroB8.findUnique({ where: { operacionB4Id: input.operacionB4Id } })
  if (receipt) {
    const replay = comprobarReplayEleccion({ metadataHash: receipt.metadataHash, snapshotResultado: receipt.snapshotResultado }, input.metadataHash)
    if (replay.ok === false) fail(409, replay.errors[0]!.codigo, replay.errors[0]!.mensaje, replay.errors)
    return { legacyWithoutReceipt: false }
  }
  if (!todasEleccionesNoSeleccionadas(input.elecciones)) fail(409, 'B8_RECEIPT_MISSING', 'La operación histórica carece de recibo B8; no se puede añadir ni alterar un centro durante replay.')
  const rows = await tx.$queryRaw<Array<{ lines: bigint | number | string; allNoCenterVersionZero: boolean | null }>>(Prisma.sql`
    WITH original AS (
      SELECT v.centro_coste_finanzas_id, v.version_centro_coste
      FROM vinculos_movimiento_documento v
      WHERE v.operacion_creacion_id = CAST(${input.operacionB4Id} AS uuid)
      FOR SHARE
    )
    SELECT COUNT(*)::bigint AS lines,
      COALESCE(bool_and(original.centro_coste_finanzas_id IS NULL AND original.version_centro_coste = 0), true) AS "allNoCenterVersionZero"
    FROM original
  `)
  const historical = rows[0]
  const expectedNoDocuments = scope.estadoBorrador === 'NO_REQUIERE'
  const lineCount = asSafeInteger(historical?.lines ?? 0, 'Las líneas históricas B4')
  if (!historical || historical.allNoCenterVersionZero !== true || (expectedNoDocuments && lineCount !== 0)) {
    fail(409, 'B8_RECEIPT_MISSING', 'La ausencia de recibo no acredita una confirmación histórica B4 sin centro.')
  }
  return { legacyWithoutReceipt: true }
}

/**
 * Called by B4 only after operation/lines/state already exist in its outer
 * SERIALIZABLE transaction. A JUSTIFICADO receipt is mandatory even when every
 * choice is notselected. A NO_REQUIERE confirmation with zero docs also writes
 * the immutable empty receipt, but performs no B8 assignment or source check.
 */
export async function applyChoicesB8(tx: Tx, input: ApplyChoicesB8Input): Promise<Readonly<{ metadataHash: string; receiptId: string }>> {
  await requireActualActorPermissionB8Tx(tx, input.actorId, 'escritura')
  const choices = fromPure<readonly ChoiceCanonical[]>(canonicalizarEleccionesCentro(input.elecciones))
  const metadataHash = metadataHashEleccionesCentro(choices)
  const proof = await lockB4CurrentProof(tx, input.operacionB4Id)
  if (proof.solicitadaPorId !== input.actorId || proof.idempotencyKey !== input.idempotencyKey) fail(409, 'B8_OPERATION_ACTOR_KEY_MISMATCH', 'Actor o clave no coinciden con la operación B4 bloqueada.')
  const scope = fromPure(decodificarAlcanceConfirmacionB4(proof.snapshotSolicitud))
  const existing = await b8(tx).reciboEleccionCentroB8.findUnique({ where: { operacionB4Id: input.operacionB4Id } })
  if (existing) {
    const replay = comprobarReplayEleccion({ metadataHash: existing.metadataHash, snapshotResultado: existing.snapshotResultado }, metadataHash)
    if (replay.ok === false) fail(409, replay.errors[0]!.codigo, replay.errors[0]!.mensaje, replay.errors)
    return { metadataHash, receiptId: existing.id }
  }

  if (scope.estadoBorrador === 'NO_REQUIERE') {
    if (choices.length !== 0 || input.lineasDocumentoCreadas.length !== 0) fail(409, 'B8_NO_REQUIERE_WITH_DOCUMENTOS', 'NO_REQUIERE sólo admite un recibo B8 con mapeo vacío.')
  } else {
    const validator = requireSourceValidator(input.requiredCurrentSourceValidator)
    assertCurrentClosure(proof)
    const mappings = canonicalLines(input, choices)
    // One B4 source proof per physical current DOCUMENTO, using B4's exact
    // signed/cap policy. No source predicate is evaluated for NO_REQUIERE.
    for (const mapping of mappings) await assertCurrentSource(validator, tx, proof.movimientoId, mapping.documentoConciliableId)
    for (const mapping of mappings) {
      if (mapping.centroCosteFinanzasId === null) continue
      const centro = await lockCentro(tx, mapping.centroCosteFinanzasId)
      fromPure(validarCentroSeleccionable(centro), 409)
      const changed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE vinculos_movimiento_documento
           SET centro_coste_finanzas_id = CAST(${mapping.centroCosteFinanzasId} AS uuid),
               version_centro_coste = version_centro_coste + 1
         WHERE id = CAST(${mapping.vinculoMovimientoDocumentoId} AS uuid)
           AND centro_coste_finanzas_id IS NULL
           AND version_centro_coste = 0
         RETURNING id::text AS id
      `)
      if (changed.length !== 1) fail(409, 'B8_LINE_ALREADY_CHANGED', 'La línea B4 no estaba en estado B8 inicial; no se sobrescribe.')
      const auditResult = b8Result('asignar_en_confirmacion_b4', {
        operacionB4Id: input.operacionB4Id, vinculoMovimientoDocumentoId: mapping.vinculoMovimientoDocumentoId,
        centroCosteFinanzasId: mapping.centroCosteFinanzasId, versionCentroCosteAnterior: 0, versionCentroCosteResultante: 1,
      })
      await insertAudit(tx, {
        centroCosteFinanzasId: mapping.centroCosteFinanzasId, vinculoMovimientoDocumentoId: mapping.vinculoMovimientoDocumentoId,
        actorId: input.actorId, accion: 'ASIGNACION_EN_CONFIRMACION_B4',
        idempotencyKey: `B4_CONFIRM:${input.operacionB4Id}:${mapping.vinculoMovimientoDocumentoId}`,
        payloadHash: sha256Canonical({ origen: 'B4_CONFIRMACION', operacionB4Id: input.operacionB4Id, mapping }),
        valueHash: sha256Canonical(auditResult),
        snapshotSolicitud: { origen: 'B4_CONFIRMACION', mapping, payloadHashOperacionB4: null }, snapshotResultado: auditResult,
      })
    }
  }
  const mappings = scope.estadoBorrador === 'NO_REQUIERE' ? [] : canonicalLines(input, choices)
  const snapshotResultado = {
    schema: B8_RECEIPT_SCHEMA, accion: 'CONFIRMACION_B4_ELECCIONES', sourceNoteRule: B8_SOURCE_NOTE_RULE,
    metadataHash, relatedSourceHashP2: relatedSourceHashP2(choices), mapping: mappings,
  }
  const receipt = await b8(tx).reciboEleccionCentroB8.create({
    data: {
      operacionB4Id: input.operacionB4Id, actorId: input.actorId, idempotencyKey: input.idempotencyKey,
      metadataHash, relatedSourceHashP2: relatedSourceHashP2(choices), sourceNoteRule: B8_SOURCE_NOTE_RULE,
      snapshotSolicitud: { schema: B8_RECEIPT_SCHEMA, sourceNoteRule: B8_SOURCE_NOTE_RULE, mapping: mappingAuditable(choices) },
      snapshotResultado,
    },
  })
  return { metadataHash, receiptId: receipt.id }
}

/** Raw B4 candidate rows only; no external request and no source amount coercion. */
type CurrentCandidate = Readonly<{
  vinculoMovimientoDocumentoId: string; movimientoId: string; documentoConciliableId: string | null; fechaOperacion: unknown
  centroCosteFinanzasId: string | null; centroCosteCodigo: string | null; centroCosteNombre: string | null; centroActivo: boolean | null
  versionCentroCoste: number; importeDocumentalCentimos: bigint | number | string
  vinculoActivo: boolean; estadoActual: string | null; importeBancoCentimos: number | null
  cierreActualCentimos: bigint | number | string | null; documentosActuales: bigint | number | string; operacionesActivasAplicadas: boolean | null
}>
async function currentCandidates(tx: Tx, cutoffExclusive?: string, limit?: number, offset?: number): Promise<CurrentCandidate[]> {
  const datePredicate = cutoffExclusive === undefined
    ? Prisma.empty
    : Prisma.sql`AND m.fecha_operacion < CAST(${cutoffExclusive} AS date)`
  const takePredicate = limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`
  const skipPredicate = offset === undefined || offset === 0 ? Prisma.empty : Prisma.sql`OFFSET ${offset}`
  return tx.$queryRaw<CurrentCandidate[]>(Prisma.sql`
    SELECT
      v.id::text AS "vinculoMovimientoDocumentoId", v.movimiento_id AS "movimientoId", v.documento_conciliable_id::text AS "documentoConciliableId",
      m.fecha_operacion AS "fechaOperacion", v.centro_coste_finanzas_id::text AS "centroCosteFinanzasId",
      c.codigo AS "centroCosteCodigo", c.nombre AS "centroCosteNombre", c.activo AS "centroActivo", v.version_centro_coste AS "versionCentroCoste",
      v.importe_centimos AS "importeDocumentalCentimos", v.activo AS "vinculoActivo", e.estado::text AS "estadoActual",
      b4_importe_bancario_centimos(m.importe) AS "importeBancoCentimos",
      (SELECT COALESCE(SUM(x.importe_centimos) FILTER (WHERE x.activo), 0)::bigint FROM vinculos_movimiento_documento x WHERE x.movimiento_id = v.movimiento_id) AS "cierreActualCentimos",
      (SELECT COUNT(*) FILTER (WHERE x.activo AND x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::bigint FROM vinculos_movimiento_documento x WHERE x.movimiento_id = v.movimiento_id) AS "documentosActuales",
      (SELECT COALESCE(bool_and(COALESCE(o.estado = 'APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL, false)) FILTER (WHERE x.activo), false)
         FROM vinculos_movimiento_documento x LEFT JOIN operaciones_justificacion_b4 o ON o.id = x.operacion_creacion_id WHERE x.movimiento_id = v.movimiento_id) AS "operacionesActivasAplicadas"
    FROM vinculos_movimiento_documento v
    JOIN movimientos_bancarios m ON m.id = v.movimiento_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
    LEFT JOIN centros_coste_finanzas c ON c.id = v.centro_coste_finanzas_id
    WHERE v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
    ${datePredicate}
    ORDER BY m.fecha_operacion ASC, v.id ASC
    ${takePredicate}
    ${skipPredicate}
  `)
}
function candidateGap(candidate: CurrentCandidate): { codigo: string; detalle: string } | null {
  if (!candidate.vinculoActivo) return { codigo: 'VINCULO_INACTIVO', detalle: 'La línea B4 ya no está activa.' }
  if (candidate.estadoActual !== 'JUSTIFICADO') return { codigo: 'MOVIMIENTO_NO_JUSTIFICADO', detalle: 'El movimiento B4 no está actualmente JUSTIFICADO.' }
  if (candidate.operacionesActivasAplicadas !== true) return { codigo: 'OPERACION_B4_NO_VIGENTE', detalle: 'Existe una operación creadora activa no APLICADA o revertida.' }
  if (!Number.isSafeInteger(candidate.importeBancoCentimos)) return { codigo: 'IMPORTE_BANCO_DESCONOCIDO', detalle: 'El importe bancario actual no es verificable; no se usa cero.' }
  const cierre = candidate.cierreActualCentimos === null ? null : asSafeInteger(candidate.cierreActualCentimos, 'El cierre B4 actual')
  if (cierre === null || cierre !== candidate.importeBancoCentimos) return { codigo: 'CIERRE_B4_NO_EXACTO', detalle: 'Las líneas B4 activas no cierran exactamente contra la fuente bancaria.' }
  if (asSafeInteger(candidate.documentosActuales, 'Las líneas DOCUMENTO B4') < 1) return { codigo: 'SIN_DOCUMENTO_ACTUAL', detalle: 'No hay una línea DOCUMENTO B4 activa actual.' }
  return null
}
function mergeGaps(entries: readonly { codigo: string; detalle: string }[]): Array<{ codigo: string; lineas: number; detalle: string }> {
  const aggregate = new Map<string, { lineas: number; detalle: string }>()
  for (const entry of entries) {
    const existing = aggregate.get(entry.codigo)
    if (existing) existing.lineas += 1
    else aggregate.set(entry.codigo, { lineas: 1, detalle: entry.detalle })
  }
  return [...aggregate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([codigo, value]) => ({ codigo, ...value }))
}
async function filterCurrentSource(
  tx: Tx, rows: readonly CurrentCandidate[], validator: CurrentSourceValidatorB8,
): Promise<Readonly<{ valid: Array<CurrentCandidate & { referencia: string }>; gaps: Array<{ codigo: string; detalle: string }> }>> {
  const valid: Array<CurrentCandidate & { referencia: string }> = []; const gaps: Array<{ codigo: string; detalle: string }> = []
  const structuralValid = rows.filter(row => !candidateGap(row) && row.documentoConciliableId !== null)
  const batch = validator.inspectCurrentB4DocumentSourcesTx
    ? await validator.inspectCurrentB4DocumentSourcesTx(tx, structuralValid.map(row=>({movimientoId:row.movimientoId,documentoConciliableId:row.documentoConciliableId!})))
    : null
  for (const row of rows) {
    const structural = candidateGap(row)
    if (structural) { gaps.push(structural); continue }
    try {
      const source = batch ? batch.get(row.documentoConciliableId!) : await assertCurrentSource(validator, tx, row.movimientoId, row.documentoConciliableId)
      if (!source || typeof source.referencia !== 'string' || !source.referencia.trim()) fail(409,'B8_DOCUMENT_SOURCE_STALE','La fuente documental actual no acredita la política B4.')
      valid.push({ ...row, referencia: source.referencia })
    } catch (error) {
      if (error instanceof B8CentroCosteServiceError) gaps.push({ codigo: error.code === 'B8_DOCUMENT_SOURCE_STALE' ? 'DOCUMENT_SOURCE_STALE' : error.code, detalle: error.message })
      else throw error
    }
  }
  return { valid, gaps }
}

/**
 * Per-period analytical read: dateCorte includes the entire bank calendar day by
 * comparing `fecha_operacion < nextCalendarDate`, not an accidental UTC EOD.
 * Unknown/stale rows are gaps and never aggregation zeroes. All sums stay signed.
 */
export async function leerAnaliticaCentrosCoste(input: Readonly<{ actorId: number; fechaCorte?: string | null; requiredCurrentSourceValidator: CurrentSourceValidatorB8 }>) {
  const corte = input.fechaCorte === undefined || input.fechaCorte === null ? null : isoDate(input.fechaCorte, 'fechaCorte'); const validator = requireSourceValidator(input.requiredCurrentSourceValidator)
  await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx; await requireActualActorPermissionB8Tx(tx, input.actorId, 'lectura')
    const filtered = await filterCurrentSource(tx, await currentCandidates(tx, corte === null ? undefined : nextCalendarDate(corte)), validator)
    const grouped = new Map<string, { centroCosteFinanzasId: string | null; codigo: string | null; nombre: string | null; activo: boolean | null; fechaOperacion: string; lineas: number; importe: bigint }>()
    for (const row of filtered.valid) {
      const key = row.centroCosteFinanzasId ?? '__SIN_CENTRO__'
      const existing = grouped.get(key) ?? { centroCosteFinanzasId: row.centroCosteFinanzasId, codigo: row.centroCosteFinanzasId === null ? null : row.centroCosteCodigo, nombre: row.centroCosteFinanzasId === null ? null : row.centroCosteNombre, activo: row.centroCosteFinanzasId === null ? null : row.centroActivo, fechaOperacion: dateToIso(row.fechaOperacion, 'fecha_operacion'), lineas: 0, importe: BigInt(0) }
      existing.lineas += 1; existing.importe += BigInt(asSafeInteger(row.importeDocumentalCentimos, 'El importe documental B4'))
      if (dateToIso(row.fechaOperacion, 'fecha_operacion') > existing.fechaOperacion) existing.fechaOperacion = dateToIso(row.fechaOperacion, 'fecha_operacion')
      grouped.set(key, existing)
    }
    const items = [...grouped.values()].map((value) => ({
      centroCosteFinanzasId: value.centroCosteFinanzasId, codigo: value.codigo, nombre: value.nombre, activo: value.activo,
      fechaOperacion: value.fechaOperacion, lineas: value.lineas,
      importeDocumentalConfirmadoPorCentroCentimos: asSafeInteger(value.importe, 'El importe documental confirmado por centro'),
    })).sort((a, b) => (a.centroCosteFinanzasId === null ? 1 : b.centroCosteFinanzasId === null ? -1 : (a.codigo ?? '').localeCompare(b.codigo ?? '')))
    return { recurso: 'analitica' as const, fechaCorte: corte, moneda: 'EUR' as const, etiquetaMoneda: 'EUR' as const, etiquetaImporte: 'importe documental confirmado por centro' as const, sinProrrateo: true, items, gaps: mergeGaps(filtered.gaps) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** Bounded work-list for explicit PATCH. No amount field and no inferred status/source. */
export async function leerLineasConfirmadasCentroCoste(input: Readonly<{ actorId: number; limit?: unknown; pagina?: unknown; requiredCurrentSourceValidator: CurrentSourceValidatorB8 }>) {
  const limit = boundedLimit(input.limit); const pagina = boundedPage(input.pagina); const validator = requireSourceValidator(input.requiredCurrentSourceValidator)
  await assertFinanceStagingIsolated()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx; await requireActualActorPermissionB8Tx(tx, input.actorId, 'lectura')
    const candidates = await currentCandidates(tx, undefined, limit + 1, (pagina - 1) * limit)
    const hasMore = candidates.length > limit
    const filtered = await filterCurrentSource(tx, candidates.slice(0, limit), validator)
    return {
      recurso: 'lineas-confirmadas' as const,
      items: filtered.valid.map((row) => ({
        id: row.vinculoMovimientoDocumentoId, movimientoId: row.movimientoId, referencia: row.referencia,
        fechaOperacion: dateToIso(row.fechaOperacion, 'fecha_operacion'), centroCosteFinanzasId: row.centroCosteFinanzasId,
        centroCosteCodigo: row.centroCosteCodigo, versionCentroCoste: row.versionCentroCoste,
      })),
      paginacion: { pagina, limit, siguientePagina: hasMore ? pagina + 1 : null },
      gaps: mergeGaps(filtered.gaps),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** Metadata-only helper for B4 before replay; it never participates in B4 financial hash. */
export function b8MetadataHashFromDraftLines(lines: unknown): string {
  const choices = fromPure<readonly ChoiceCanonical[]>(canonicalizarEleccionesCentro(
    Array.isArray(lines) ? lines.flatMap((line, indiceLinea): ChoiceInput[] => {
      if (!line || typeof line !== 'object' || Array.isArray(line) || (line as Record<string, unknown>).tipo !== 'DOCUMENTO') return []
      const record = line as Record<string, unknown>
      return [{ indiceLinea, documentoConciliableId: String(record.documentoConciliableId ?? ''), ...(Object.prototype.hasOwnProperty.call(record, 'centroCosteFinanzasId') ? { centroCosteFinanzasId: record.centroCosteFinanzasId as string | null } : {}) }]
    }) : [],
  ))
  return metadataHashEleccionesCentro(choices)
}
