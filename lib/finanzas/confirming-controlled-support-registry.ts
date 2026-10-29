import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { trustedImpersonationContextResolutionFromRequest } from '@/lib/impersonation-context'

const MAX_CANDIDATES = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const PAIR = /^[A-Za-z0-9_.:-]{1,160}$/
export const CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SCHEMA = 'CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_V1' as const

export type RegistryDb = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
  $executeRaw(query: Prisma.Sql): Promise<unknown>
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: unknown): Promise<T>
}>
type RegistryTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw' | 'usuarioAdmin' | 'permisoUsuario' | 'permisoArea'>
type SourceType = 'BBVA_PDF' | 'CAIXA_PDF' | 'CAIXA_XLS'
type SourceInput = Readonly<{ facturaRecibidaId: string; tipo: SourceType }>
type DeclarationInput = Readonly<{ action: 'declarar'; confirmar: true; idempotencyKey: string; parejaCaixaDeclaradaId: string | null; fuentes: readonly SourceInput[] }>
type CandidateRow = Readonly<{ facturaRecibidaId: unknown; nombre: unknown; driveId: unknown; itemId: unknown; versionDocumento: unknown }>
type ExistingRow = Readonly<{ id: unknown; facturaRecibidaId: unknown; driveId: unknown; itemId: unknown; tipo: unknown; pareja: unknown; declaredById: unknown }>

export class ConfirmingControlledSupportRegistryError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'ConfirmingControlledSupportRegistryError'
  }
}
function fail(status: number, code: string, message: string): never { throw new ConfirmingControlledSupportRegistryError(status, code, message) }
function sha256(value: unknown): string { return createHash('sha256').update(canonical(value), 'utf8').digest('hex') }
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
  }
  throw new Error('CONFIRMING_REGISTRY_CANONICAL_VALUE_INVALID')
}
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}
function uuidFromHash(hash: string): string {
  const hex = createHash('sha256').update(`confirming-controlled-support:${hash}`, 'utf8').digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
function sourceType(value: unknown): SourceType | null { return value === 'BBVA_PDF' || value === 'CAIXA_PDF' || value === 'CAIXA_XLS' ? value : null }
function sourceInput(value: unknown): SourceInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const keys = Object.keys(row)
  if (keys.length !== 2 || !keys.includes('facturaRecibidaId') || !keys.includes('tipo')) return null
  const facturaRecibidaId = text(row.facturaRecibidaId, 160)
  const tipo = sourceType(row.tipo)
  return facturaRecibidaId && tipo ? { facturaRecibidaId, tipo } : null
}
function pairsExactly(sources: readonly SourceInput[], pair: string | null): boolean {
  const types = sources.map(source => source.tipo).sort()
  const bbva = types.length === 1 && types[0] === 'BBVA_PDF' && pair === null
  const caixa = types.length === 2 && types[0] === 'CAIXA_PDF' && types[1] === 'CAIXA_XLS' && pair !== null
  return bbva || caixa
}

/** Pure HTTP contract: source identity is deliberately not accepted from the client. */
export function parseConfirmingControlledSupportDeclaration(raw: unknown): DeclarationInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const body = raw as Record<string, unknown>
  const allowed = ['action', 'confirmar', 'idempotencyKey', 'parejaCaixaDeclaradaId', 'fuentes']
  if (Object.keys(body).length !== allowed.length || allowed.some(key => !Object.prototype.hasOwnProperty.call(body, key)) || Object.keys(body).some(key => !allowed.includes(key))) {
    fail(400, 'VALIDATION_ERROR', 'La declaración usa exactamente action, confirmar, idempotencyKey, parejaCaixaDeclaradaId y fuentes.')
  }
  if (body.action !== 'declarar' || body.confirmar !== true) fail(400, 'CONFIRMACION_HUMANA_REQUERIDA', 'Debe confirmar expresamente la fuente antes de registrarla.')
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : ''
  if (!HASH.test(idempotencyKey)) fail(400, 'IDEMPOTENCY_KEY_INVALIDA', 'La clave idempotente debe ser una huella SHA-256 hexadecimal.')
  const parejaCaixaDeclaradaId = body.parejaCaixaDeclaradaId === null ? null : text(body.parejaCaixaDeclaradaId, 160)
  if (body.parejaCaixaDeclaradaId !== null && (!parejaCaixaDeclaradaId || !PAIR.test(parejaCaixaDeclaradaId))) fail(400, 'PAREJA_CAIXA_INVALIDA', 'La referencia de pareja Caixa no es válida.')
  if (!Array.isArray(body.fuentes) || body.fuentes.length < 1 || body.fuentes.length > 2) fail(400, 'FUENTES_INVALIDAS', 'Seleccione una fuente BBVA o exactamente una pareja PDF/XLS de Caixa.')
  const fuentes = body.fuentes.map(sourceInput)
  if (fuentes.some((source): source is null => source === null)) fail(400, 'FUENTES_INVALIDAS', 'Cada fuente debe tener una factura recibida y un tipo permitido.')
  const normalized = (fuentes as SourceInput[]).sort((left, right) => `${left.tipo}:${left.facturaRecibidaId}`.localeCompare(`${right.tipo}:${right.facturaRecibidaId}`))
  if (new Set(normalized.map(source => source.facturaRecibidaId)).size !== normalized.length || new Set(normalized.map(source => source.tipo)).size !== normalized.length || !pairsExactly(normalized, parejaCaixaDeclaradaId)) {
    fail(400, 'PAREJA_CAIXA_INVALIDA', 'BBVA exige una sola fuente; Caixa exige una selección humana de un PDF y un XLS distintos con la misma pareja declarada.')
  }
  if (idempotencyKey !== sha256({ action: 'declarar', confirmar: true, parejaCaixaDeclaradaId, fuentes: normalized })) {
    fail(400, 'IDEMPOTENCY_KEY_INVALIDA', 'La clave idempotente no corresponde a la declaración revisada.')
  }
  return { action: 'declarar', confirmar: true, idempotencyKey, parejaCaixaDeclaradaId, fuentes: normalized }
}

function rowCandidate(row: CandidateRow) {
  const facturaRecibidaId = text(row.facturaRecibidaId, 160)
  const nombre = text(row.nombre, 240)
  const driveId = text(row.driveId, 300)
  const itemId = text(row.itemId, 300)
  const versionDocumento = typeof row.versionDocumento === 'number' && Number.isInteger(row.versionDocumento) && row.versionDocumento >= 1 ? row.versionDocumento : null
  return facturaRecibidaId && nombre && driveId && itemId && versionDocumento !== null
    ? { facturaRecibidaId, nombre, identidadControlada: { driveId, itemId }, versionDocumento }
    : null
}

const readySql = Prisma.sql`SELECT to_regclass('public.confirming_reading_support_sources')::text AS registry, to_regclass('public.confirming_reading_support_source_revocations')::text AS revocations LIMIT 1`
async function tablesReady(db: Pick<RegistryDb, '$queryRaw'>): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ registry: string | null; revocations: string | null }>>(readySql)
  return rows.length === 1 && rows[0]?.registry === 'confirming_reading_support_sources' && rows[0]?.revocations === 'confirming_reading_support_source_revocations'
}

/** GET has no Graph/OCR/PDF capability: it lists only existing C9 rows and their DB identities. */
export async function readConfirmingControlledSupportCandidates(database: RegistryDb = prisma as unknown as RegistryDb) {
  await assertFinanceRuntimeReady(database as never)
  if (!await tablesReady(database)) return { schema: CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SCHEMA, registryReady: false, candidates: [] as const }
  const rows = await database.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT f.id AS "facturaRecibidaId",COALESCE(NULLIF(regexp_replace(COALESCE(f.archivo_onedrive,f.onedrive_ruta_actual,''),'^.*[\\\\/]',''),'') ,'Documento confirming') AS nombre,
      f.onedrive_drive_id AS "driveId",f.onedrive_item_id AS "itemId",f.version_naturaleza_documento AS "versionDocumento"
    FROM facturas_recibidas f
    WHERE f.naturaleza_documento='SOPORTE_CONFIRMING_CLIENTE'::"NaturalezaDocumentoFinanciero"
      AND f.tipo_soporte_financiero='CONFIRMING_CESION_DRAXTON'::"TipoSoporteFinanciero"
      AND f.onedrive_drive_id IS NOT NULL AND f.onedrive_item_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM documentos_conciliables d JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true WHERE d.factura_recibida_id=f.id)
      AND NOT EXISTS (SELECT 1 FROM confirming_reading_support_sources s WHERE s.factura_recibida_id=f.id)
    ORDER BY f.created_at DESC,f.id DESC
    LIMIT ${MAX_CANDIDATES + 1}
  `)
  if (rows.length > MAX_CANDIDATES) fail(409, 'FUENTES_LISTADO_INCOMPLETO', 'Hay más fuentes de las que esta declaración acotada puede mostrar; acote antes de declarar.')
  const candidates = rows.map(rowCandidate)
  if (candidates.some(candidate => candidate === null)) fail(409, 'FUENTE_CONTROLADA_INVALIDA', 'Una fuente confirming no tiene identidad Drive/Item controlada válida.')
  return { schema: CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SCHEMA, registryReady: true, candidates: candidates as Array<NonNullable<ReturnType<typeof rowCandidate>>> }
}

type LockedSource = Readonly<{ facturaRecibidaId: string; driveId: string; itemId: string; versionDocumento: number }>
async function lockControlledSource(tx: RegistryTx, facturaRecibidaId: string): Promise<LockedSource> {
  const rows = await tx.$queryRaw<Array<CandidateRow & { naturaleza: unknown; tipoSoporte: unknown }>>(Prisma.sql`
    SELECT f.id AS "facturaRecibidaId",f.onedrive_drive_id AS "driveId",f.onedrive_item_id AS "itemId",f.version_naturaleza_documento AS "versionDocumento",
      f.naturaleza_documento::text AS naturaleza,f.tipo_soporte_financiero::text AS "tipoSoporte",COALESCE(f.archivo_onedrive,'Documento confirming') AS nombre
    FROM facturas_recibidas f WHERE f.id=${facturaRecibidaId} LIMIT 2 FOR KEY SHARE
  `)
  const source = rows[0] ? rowCandidate(rows[0]) : null
  if (rows.length !== 1 || !source || rows[0]?.naturaleza !== 'SOPORTE_CONFIRMING_CLIENTE' || rows[0]?.tipoSoporte !== 'CONFIRMING_CESION_DRAXTON') {
    fail(409, 'FUENTE_CONTROLADA_INVALIDA', 'La fuente ya no es un soporte confirming controlado.')
  }
  const links = await tx.$queryRaw<Array<{ linked: number }>>(Prisma.sql`
    SELECT count(*)::int AS linked FROM documentos_conciliables d JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true
    WHERE d.factura_recibida_id=${source.facturaRecibidaId} LIMIT 1
  `)
  if (Number(links[0]?.linked ?? 0) !== 0) fail(409, 'VINCULO_FINANCIERO_ACTIVO', 'La fuente tiene un vínculo documental activo y no puede declararse.')
  return { facturaRecibidaId: source.facturaRecibidaId, driveId: source.identidadControlada.driveId, itemId: source.identidadControlada.itemId, versionDocumento: source.versionDocumento }
}
function auditActors(actorId: number, resolution: Awaited<ReturnType<typeof trustedImpersonationContextResolutionFromRequest>>) {
  if (resolution.status === 'invalid' || (resolution.status === 'valid' && resolution.context.targetId !== actorId)) {
    fail(403, 'CONTEXTO_ACTUACION_CONFIRMING_INVALIDO', 'La identidad efectiva no coincide con la sesión firmada de actuación.')
  }
  return { actorRealId: resolution.status === 'valid' ? resolution.context.actorId : actorId, actorEfectivoId: actorId }
}
function sameExisting(row: ExistingRow, expected: Readonly<{ id: string; source: LockedSource; tipo: SourceType; pareja: string | null; actorEfectivoId: number }>): boolean {
  return row.id === expected.id && row.facturaRecibidaId === expected.source.facturaRecibidaId && row.driveId === expected.source.driveId && row.itemId === expected.source.itemId
    && row.tipo === expected.tipo && row.pareja === expected.pareja && row.declaredById === expected.actorEfectivoId
}

/**
 * Inserts only immutable registry rows. It never classifies an invoice, downloads
 * a document, creates a document version, runs a parser, or writes B4/cash data.
 * The deterministic source UUID derives from the canonical payload hash, making
 * exact retry recovery possible without adding a new receipt table.
 */
export async function declareConfirmingControlledSupport(actorId: number, raw: unknown, database: RegistryDb = prisma as unknown as RegistryDb) {
  const input = parseConfirmingControlledSupportDeclaration(raw)
  const actors = auditActors(actorId, await trustedImpersonationContextResolutionFromRequest())
  await assertFinanceRuntimeReady(database as never)
  return database.$transaction(async (txBase: Prisma.TransactionClient) => {
    const tx = txBase as unknown as RegistryTx
    const access = await requireB4ActorAccess(actorId, 'escritura', tx as never)
    if (!access.ok) fail(403, 'PERMISO_REVOCADO', 'Sin permiso de escritura en conciliación.')
    if (!await tablesReady(tx as unknown as RegistryDb)) fail(409, 'REGISTRO_CONTROLADO_NO_MIGRADO', 'El registro controlado de fuentes aún no está disponible.')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${'confirming-controlled-support:' + input.idempotencyKey} AS text),0))::text AS locked`)
    const sources = await Promise.all(input.fuentes.map(source => lockControlledSource(tx, source.facturaRecibidaId)))
    const payloadHash = sha256({ schema: CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SCHEMA, input, actors, sources: sources.map(source => ({ facturaRecibidaId: source.facturaRecibidaId, driveId: source.driveId, itemId: source.itemId, versionDocumento: source.versionDocumento })) })
    const expected = sources.map((source, index) => ({ id: uuidFromHash(`${input.idempotencyKey}:${index}`), source, tipo: input.fuentes[index]!.tipo, pareja: input.parejaCaixaDeclaradaId, actorEfectivoId: actors.actorEfectivoId }))
    const ids = expected.map(item => item.id)
    // La revocación es evidencia append-only: aun un replay con el mismo hash
    // debe fallar cerrado. Se bloquean ambas filas en esta misma SERIALIZABLE
    // antes de mirar el recibo idempotente, por lo que nunca restaura una fuente.
    const revoked = await tx.$queryRaw<Array<{ id: unknown }>>(Prisma.sql`
      SELECT r.id::text AS id
      FROM confirming_reading_support_sources r
      JOIN confirming_reading_support_source_revocations rv ON rv.source_id=r.id
      WHERE r.id IN (${Prisma.join(ids.map(id => Prisma.sql`CAST(${id} AS uuid)`) )})
      LIMIT ${ids.length + 1} FOR KEY SHARE OF r,rv
    `)
    if (revoked.length > 0) fail(409, 'FUENTE_DECLARACION_REVOCADA', 'Una fuente de esta declaración fue revocada y no puede reactivarse.')
    const prior = await tx.$queryRaw<ExistingRow[]>(Prisma.sql`
      SELECT id::text AS id,factura_recibida_id AS "facturaRecibidaId",onedrive_drive_id AS "driveId",onedrive_item_id AS "itemId",tipo_detectado AS tipo,pareja_caixa_declarada_id AS pareja,declared_by_id AS "declaredById"
      FROM confirming_reading_support_sources WHERE id IN (${Prisma.join(ids.map(id => Prisma.sql`CAST(${id} AS uuid)`))}) FOR KEY SHARE
    `)
    if (prior.length > 0) {
      if (prior.length !== expected.length || !expected.every(item => prior.some(row => sameExisting(row, item)))) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave idempotente ya se utilizó con otra declaración.')
      return { schema: CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SCHEMA, idempotent: true, payloadHash, actorRealId: actors.actorRealId, actorEfectivoId: actors.actorEfectivoId, declarations: expected.map(item => ({ id: item.id, facturaRecibidaId: item.source.facturaRecibidaId, tipo: item.tipo, parejaCaixaDeclaradaId: item.pareja })) }
    }
    const conflicts = await tx.$queryRaw<Array<{ facturaRecibidaId: unknown }>>(Prisma.sql`
      SELECT factura_recibida_id AS "facturaRecibidaId" FROM confirming_reading_support_sources
      WHERE factura_recibida_id IN (${Prisma.join(sources.map(source => source.facturaRecibidaId))})
         OR (onedrive_drive_id,onedrive_item_id) IN (${Prisma.join(sources.map(source => Prisma.sql`(${source.driveId},${source.itemId})`))})
      LIMIT ${sources.length + 1} FOR KEY SHARE
    `)
    if (conflicts.length) fail(409, 'FUENTE_YA_DECLARADA', 'Una de las fuentes ya fue declarada; no se reescribe, reactiva ni sustituye.')
    for (const item of expected) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO confirming_reading_support_sources
          (id,factura_recibida_id,onedrive_drive_id,onedrive_item_id,tipo_detectado,pareja_caixa_declarada_id,declared_by_id,declared_at)
        VALUES (CAST(${item.id} AS uuid),${item.source.facturaRecibidaId},${item.source.driveId},${item.source.itemId},${item.tipo},${item.pareja},${actors.actorEfectivoId},CURRENT_TIMESTAMP)
      `)
    }
    return { schema: CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SCHEMA, idempotent: false, payloadHash, actorRealId: actors.actorRealId, actorEfectivoId: actors.actorEfectivoId, declarations: expected.map(item => ({ id: item.id, facturaRecibidaId: item.source.facturaRecibidaId, tipo: item.tipo, parejaCaixaDeclaradaId: item.pareja })) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
}
