import { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { B4_CONCILIACION_AREA } from '@/lib/finanzas/reconciliation-auth'
import { verificarPermisoServer } from '@/lib/permisos'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import {
  counterpartyCandidateHash,
  counterpartySha256,
  counterpartySuggestionId,
  type CounterpartyCandidateSeed,
} from '@/lib/finanzas/easy-counterparty-core'
import {
  readEasyCounterpartyBulkMaterialByIdsTx,
  readEasyCounterpartyBulkMaterialTx,
  type EasyCounterpartyBulkMovementMaterial,
} from '@/lib/finanzas/easy-counterparty-db'
import {
  EASY_COUNTERPARTY_BULK_MAX_ITEMS,
  EasyCounterpartyBulkValidationError,
  easyCounterpartyBulkHash,
  easyCounterpartyBulkRequestHash,
  logicalEasyBulkRecords,
  matchEasyBulkText,
  parseEasyCounterpartyBulkCommand,
  signEasyCounterpartyBulkPreview,
  verifyEasyCounterpartyBulkPreview,
  type EasyBulkCommand,
  type EasyBulkConfirmCommand,
  type EasyBulkExistingRecord,
  type EasyBulkLogicalRecord,
  type EasyBulkPreviewInput,
  type EasyBulkPreviewItem,
  type EasyBulkPreviewSelection,
  type EasyBulkUndoCommand,
} from '@/lib/finanzas/easy-counterparty-bulk-core'

type Db = PrismaClient & Record<string, any>
type Tx = Prisma.TransactionClient & Record<string, any>
type QueryDb = (PrismaClient | Prisma.TransactionClient) & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx
const MAX_MOVEMENT_SCAN = 5_000
const MAX_EXISTING_RECORDS = 10_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class EasyCounterpartyBulkServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}
const fail = (status: number, code: string, message: string): never => { throw new EasyCounterpartyBulkServiceError(status, code, message) }
function clean(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function exactInteger(value: unknown, field: string): number {
  if (typeof value === 'bigint') return Number(value)
  if (!Number.isSafeInteger(value)) fail(422, 'DATOS_NO_VALIDOS', `${field} no es válido.`)
  return value as number
}
function json(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function uuidFromHash(hash: string): string {
  const bytes = Buffer.from(hash.slice(0, 32), 'hex')
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
async function tableReady(tx: QueryDb, table: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ready`)
  return rows[0]?.ready === true
}
async function p1Ready(tx: QueryDb): Promise<boolean> { return tableReady(tx, 'decisiones_tercero_modo_facil') }
async function bulkReady(tx: QueryDb): Promise<boolean> {
  const expected = [
    'lotes_tercero_modo_facil', 'patas_lote_tercero_modo_facil',
    'reversiones_lote_tercero_modo_facil', 'patas_reversion_lote_tercero_modo_facil',
  ]
  return (await Promise.all(expected.map(name => tableReady(tx, name)))).every(Boolean)
}
function requireBulkSchema(ready: boolean): void {
  if (!ready) fail(503, 'LOTE_TERCEROS_MIGRACION_PENDIENTE', 'La aceptación de varios movimientos aún no está disponible.')
}

/** Same live permission policy as the individual Modo Fácil flow, but evaluated
 * against the transaction snapshot and locked once for the entire package. */
async function requireLiveWriterTx(tx: Tx, actorId: number): Promise<void> {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) fail(403, 'SIN_PERMISO_ACTUAL', 'No tienes permiso para aceptar esta selección.')
  const actorRows = await tx.$queryRaw<Array<{ id: number; activo: boolean; rol: string; roles: unknown }>>(Prisma.sql`
    SELECT id,activo,rol,roles FROM usuarios_admin WHERE id=${actorId} LIMIT 1 FOR SHARE
  `)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM permiso_usuarios WHERE usuario_id=${actorId} FOR SHARE`)
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM permiso_areas
    WHERE codigo IN ('admin','admin.finanzas','admin.finanzas.conciliacion')
    FOR SHARE
  `)
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM perfiles_acceso_modo_facil WHERE usuario_id=${actorId} FOR SHARE
  `)
  const actor = actorRows[0]
  if (!actor?.activo) fail(403, 'SIN_PERMISO_ACTUAL', 'No tienes permiso para aceptar esta selección.')
  const roles = Array.isArray(actor.roles) ? actor.roles.filter((role): role is string => typeof role === 'string') : []
  const permission = await verificarPermisoServer(actor.id, B4_CONCILIACION_AREA, actor.rol, tx)
  if (permission.escritura) return
  const assigned = await tx.permisoUsuario.count({ where: { usuarioId: actor.id, OR: [{ lectura: true }, { escritura: true }] } })
  if (assigned === 0 && [actor.rol, ...roles].includes('CONTABILIDAD')) return
  fail(403, 'SIN_PERMISO_ACTUAL', 'No tienes permiso para aceptar esta selección.')
}
async function mayUndoOtherActorTx(tx: Tx, actorId: number): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM usuarios_admin u
      WHERE u.id=${actorId} AND u.activo=true AND u.rol::text IN ('SUPER_ADMIN','GERENTE')
        AND COALESCE((SELECT p.perfil FROM perfiles_acceso_modo_facil p WHERE p.usuario_id=u.id ORDER BY p.version DESC LIMIT 1),'RESTABLECIDO') <> 'MODO_FACIL_ONLY'
    ) AS allowed
  `)
  return rows[0]?.allowed === true
}

async function loadExistingRecordsTx(tx: QueryDb): Promise<readonly EasyBulkLogicalRecord[]> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    WITH fiscal AS (
      SELECT
        ('EF:' || ef.id::text) AS source_identity,
        ('EF:' || ef.id::text) AS logical_proof,
        CASE WHEN ef.tipo='AAPP'::"TipoEntidadFiscal"
          AND upper(COALESCE(ef.razon_social,'') || ' ' || COALESCE(ef.nombre_comercial,'')) ~ '(^|[^A-Z])(SANTANDER|BBVA|CAIXABANK|VIVID)($|[^A-Z])'
          THEN 'BANCO'::text ELSE ef.tipo::text END AS tipo,
        ef.razon_social AS nombre,
        ef.nombre_comercial AS alias,
        ef.nif_cif AS nif_cif,
        'ENTIDAD_FISCAL'::text AS origen
      FROM entidades_fiscales ef
      WHERE ef.activo=true AND ef.tipo IN ('CLIENTE'::"TipoEntidadFiscal",'PROVEEDOR'::"TipoEntidadFiscal",'AAPP'::"TipoEntidadFiscal")
    ), clientes AS (
      SELECT DISTINCT ON (cw.id)
        ('CLIENTE_WEB_CONTRATO:' || cw.id::text || ':' || cs.id::text || ':' || cs.cliente_id || ':' || COALESCE(NULLIF(btrim(cw.cliente_id_isp),''),NULLIF(btrim(cw.isp_gestion_id),''))) AS source_identity,
        ('CW:' || cw.id::text) AS logical_proof,
        'CLIENTE'::text AS tipo,
        cw.nombre AS nombre,
        cw.nombre_comercial AS alias,
        COALESCE(NULLIF(btrim(cw.cif),''),NULLIF(btrim(cw.nif),'')) AS nif_cif,
        'CLIENTE_CONTRATO_ACTUAL'::text AS origen
      FROM clientes_web cw
      JOIN contratos_servicio cs ON cs.activo=true AND NULLIF(btrim(cw.cliente_id_isp),'') IS NOT NULL AND cs.cliente_id=cw.cliente_id_isp
      WHERE COALESCE(cw.activo,true)=true
      ORDER BY cw.id,cs.id
    )
    SELECT source_identity,logical_proof,tipo,nombre,alias,nif_cif,origen FROM (
      SELECT * FROM fiscal UNION ALL SELECT * FROM clientes
    ) records
    ORDER BY tipo,source_identity
    LIMIT ${MAX_EXISTING_RECORDS + 1}
  `)
  if (rows.length > MAX_EXISTING_RECORDS) fail(409, 'FICHAS_DEMASIADO_AMPLIAS', 'Hay demasiadas fichas para revisar con seguridad. Acota la lista antes de continuar.')
  const records: EasyBulkExistingRecord[] = []
  for (const row of rows) {
    const tipo = String(row.tipo)
    const origen = String(row.origen)
    if ((tipo !== 'CLIENTE' && tipo !== 'PROVEEDOR' && tipo !== 'BANCO') || (origen !== 'ENTIDAD_FISCAL' && origen !== 'CLIENTE_CONTRATO_ACTUAL')) continue
    const sourceIdentity = clean(row.source_identity)
    const logicalProof = clean(row.logical_proof)
    const nombre = clean(row.nombre)
    if (!sourceIdentity || !logicalProof || !nombre) continue
    // `logicalProof` is an accredited internal ID. It groups only the source
    // records that declare the same identity; it is neither an alias nor a
    // browser-visible value.
    records.push({ sourceIdentity, identityProof: logicalProof, tipoTercero: tipo as 'CLIENTE' | 'PROVEEDOR' | 'BANCO', origen: origen as 'ENTIDAD_FISCAL' | 'CLIENTE_CONTRATO_ACTUAL', nombre, nifCif: clean(row.nif_cif), aliases: [clean(row.alias)].filter((value): value is string => value !== null) })
  }
  return logicalEasyBulkRecords(records)
}

type Candidate = Readonly<{ item: EasyBulkPreviewItem; sourceIdentity: string; origin: 'ENTIDAD_FISCAL' | 'CLIENTE_CONTRATO_ACTUAL'; candidateHash: string; sourceHash: string }>
type ReviewContext = Readonly<{ concepto: string; banco: string; alias: string | null }>
function isCandidate(value: Candidate | null | 'AMBIGUO'): value is Candidate { return value !== null && value !== 'AMBIGUO' }
function typeLabel(type: 'CLIENTE' | 'PROVEEDOR' | 'BANCO'): string {
  return type === 'CLIENTE' ? 'Cliente registrado' : type === 'PROVEEDOR' ? 'Proveedor registrado' : 'Banco registrado'
}
async function loadReviewContextsTx(tx: QueryDb, movementIds: readonly string[], lockAccounts = false): Promise<ReadonlyMap<string, ReviewContext>> {
  const ids = [...new Set(movementIds)]
  if (!ids.length) return new Map()
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.concepto,c.banco,c.alias
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    WHERE m.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})
    ${lockAccounts ? Prisma.sql`FOR SHARE OF c` : Prisma.sql``}
  `)
  const contexts = new Map<string, ReviewContext>()
  for (const row of rows) {
    const id = clean(row.id)
    const banco = clean(row.banco)
    if (!id || !banco) continue
    contexts.set(id, { concepto: String(row.concepto ?? ''), banco, alias: clean(row.alias) })
  }
  return contexts
}
function candidateForMaterial(material: EasyCounterpartyBulkMovementMaterial, catalog: readonly EasyBulkLogicalRecord[], context: ReviewContext | undefined): Candidate | null | 'AMBIGUO' {
  if (material.estado !== 'PROPUESTO' || !material.propuestaTexto) return null
  // A row without its account metadata cannot be safely reviewed in this surface.
  if (!context) return null
  const match = matchEasyBulkText(material.propuestaTexto, catalog)
  if (match.kind === 'AMBIGUO') return 'AMBIGUO'
  if (match.kind !== 'UNICO') return null
  const record = match.record
  // BANCO comes only from the same pre-existing fiscal AAPP identity used by P1.
  // A bank-account row is review context, never proof of account ownership.
  const seed: CounterpartyCandidateSeed = {
    movimientoId: material.id,
    tipoTercero: record.tipoTercero,
    origen: record.origen,
    sourceIdentity: record.sourceIdentity,
  }
  const sugerenciaId = counterpartySuggestionId(seed)
  const candidateHash = counterpartyCandidateHash(seed)
  const sourceHash = counterpartySha256({ schema: 'EASY_COUNTERPARTY_SOURCE_V1', sourceIdentity: record.sourceIdentity })
  const label = `${record.nombre} · ${typeLabel(record.tipoTercero)}`
  const fingerprint = easyCounterpartyBulkHash({
    schema: 'EASY_COUNTERPARTY_BULK_ITEM_V1', movimientoId: material.id, version: material.version,
    propuestaTexto: material.propuestaTexto, fecha: material.fecha, importeCentimos: material.importeCentimos,
    sugerenciaId, candidateHash, sourceHash, concepto: context.concepto, banco: context.banco, alias: context.alias,
  })
  return { sourceIdentity: record.sourceIdentity, origin: record.origen, candidateHash, sourceHash, item: {
    movimientoId: material.id, version: material.version, sugerenciaId, fingerprint, fecha: material.fecha,
    importeCentimos: material.importeCentimos, tipoTercero: record.tipoTercero, etiqueta: label,
    concepto: context.concepto, banco: context.banco, alias: context.alias,
  } }
}
function totals(items: readonly EasyBulkPreviewItem[]) {
  let charges = BigInt(0), receipts = BigInt(0)
  for (const item of items) {
    if (item.importeCentimos < 0) charges += BigInt(item.importeCentimos)
    if (item.importeCentimos > 0) receipts += BigInt(item.importeCentimos)
  }
  return {
    cargos: { movimientos: items.filter(item => item.importeCentimos < 0).length, importeCentimos: charges.toString() },
    cobros: { movimientos: items.filter(item => item.importeCentimos > 0).length, importeCentimos: receipts.toString() },
  }
}
function sort(items: readonly EasyBulkPreviewItem[]) {
  return [...items].sort((left, right) => Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos) || right.fecha.localeCompare(left.fecha) || left.movimientoId.localeCompare(right.movimientoId))
}

/** Reads exactly one bounded movement set plus the relevant existing-record
 * catalogue. It never creates a record or promotes bank text without a unique
 * current identity. Caller-owned use is for rollback-only staging tests. */
export async function readEasyCounterpartyBulkPreviewTx(tx: Prisma.TransactionClient, input: EasyBulkPreviewInput, actorId: number) {
  await assertPrototypeStaging()
  try {
    const work = asTx(tx)
    const [materials, catalog] = await Promise.all([
      readEasyCounterpartyBulkMaterialTx(work, { ...input, pendientes: true }, MAX_MOVEMENT_SCAN),
      loadExistingRecordsTx(work),
    ])
    if (materials.length === MAX_MOVEMENT_SCAN) fail(409, 'MOVIMIENTOS_DEMASIADOS', 'Hay demasiados movimientos pendientes para revisar con seguridad. Acota el periodo o la búsqueda.')
    const contexts = await loadReviewContextsTx(work, materials.map(material => material.id))
    const eligible: Candidate[] = []
    let ambiguous = 0
    let unmatched = 0
    let proposed = 0
    for (const material of materials) {
      if (material.estado !== 'PROPUESTO') continue
      proposed += 1
      const candidate = candidateForMaterial(material, catalog, contexts.get(material.id))
      if (candidate === 'AMBIGUO') { ambiguous += 1; continue }
      if (!candidate) { unmatched += 1; continue }
      eligible.push(candidate)
    }
    const ordered = sort(eligible.map(candidate => candidate.item))
    const page = ordered.slice(input.offset, input.offset + input.limit)
    const token = page.length ? signEasyCounterpartyBulkPreview(actorId, page) : null
    return {
      stagingOnly: true as const,
      automaticas: false as const,
      periodo: { desde: input.desde, hasta: input.hasta },
      totalPropuestosTexto: proposed,
      totalElegibles: ordered.length,
      totalAmbiguos: ambiguous,
      totalSinCoincidencia: unmatched,
      total: ordered.length,
      limit: input.limit,
      offset: input.offset,
      maxBloque: EASY_COUNTERPARTY_BULK_MAX_ITEMS,
      totalesElegibles: totals(ordered),
      items: page,
      previewToken: token,
      criterio: 'Sólo aparecen coincidencias exactas y únicas con una ficha existente. Los textos sin coincidencia o con más de una ficha siguen pendientes.',
    }
  } catch (error) { throwKnown(error) }
}

/** Read-only public scan. GET runs in its own READ ONLY transaction. */
export async function readEasyCounterpartyBulkPreview(input: EasyBulkPreviewInput, actorId: number) {
  await assertPrototypeStaging()
  try {
    return await db().$transaction(async base => {
      await base.$executeRaw`SET TRANSACTION READ ONLY`
      return readEasyCounterpartyBulkPreviewTx(base, input, actorId)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 20_000 })
  } catch (error) { throwKnown(error) }
}

async function replayAcceptanceTx(tx: Tx, actorId: number, command: EasyBulkCommand) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,request_hash,resumen FROM lotes_tercero_modo_facil
    WHERE actor_id=${actorId} AND idempotency_key=CAST(${command.idempotencyKey} AS uuid)
    LIMIT 1 FOR UPDATE
  `)
  const row = rows[0]
  if (!row) return null
  const hash = easyCounterpartyBulkRequestHash(actorId, command)
  if (String(row.request_hash) !== hash) fail(409, 'IDEMPOTENCIA_NO_COINCIDE', 'Esta solicitud ya se usó para otra selección.')
  const summary = json(row.resumen)
  return { ok: true as const, idempotente: true as const, loteId: String(row.id), aceptados: Number(summary.aceptados ?? 0), ...(summary.totales && typeof summary.totales === 'object' ? { totales: summary.totales } : {}) }
}
async function replayUndoTx(tx: Tx, actorId: number, command: EasyBulkCommand) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text,r.lote_id::text,r.request_hash,r.resumen
    FROM reversiones_lote_tercero_modo_facil r
    WHERE r.actor_id=${actorId} AND r.idempotency_key=CAST(${command.idempotencyKey} AS uuid)
    LIMIT 1 FOR UPDATE
  `)
  const row = rows[0]
  if (!row) return null
  const hash = easyCounterpartyBulkRequestHash(actorId, command)
  if (String(row.request_hash) !== hash) fail(409, 'IDEMPOTENCIA_NO_COINCIDE', 'Esta solicitud ya se usó para otra reversión.')
  const summary = json(row.resumen)
  return { ok: true as const, idempotente: true as const, loteId: String(row.lote_id), revertidos: Number(summary.revertidos ?? 0) }
}
async function lockPackage(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text AS locked`)
}

async function confirmBulkTx(base: Prisma.TransactionClient, actorId: number, command: EasyBulkConfirmCommand) {
  const tx = asTx(base)
  await lockPackage(tx, `easy-counterparty-bulk:accept:${actorId}:${command.idempotencyKey}`)
  // A stale idempotency key never bypasses a revoked actor. This lock protects the
  // live actor/permission metadata until the serializable transaction completes.
  await requireLiveWriterTx(tx, actorId)
  const replay = await replayAcceptanceTx(tx, actorId, command)
  if (replay) return replay
  if (!verifyEasyCounterpartyBulkPreview(command.previewToken, actorId, command.items)) fail(409, 'SELECCION_CAMBIADA', 'La selección cambió. Actualiza la lista.')

  const materials = await readEasyCounterpartyBulkMaterialByIdsTx(tx, command.items.map(item => item.movimientoId))
  const catalog = await loadExistingRecordsTx(tx)
  const contexts = await loadReviewContextsTx(tx, materials.map(material => material.id), true)
  const byId = new Map(materials.map(material => [material.id, material]))
  const selected: Candidate[] = []
  for (const selection of command.items) {
    const material = byId.get(selection.movimientoId)
    if (!material || material.version !== selection.version) fail(409, 'SELECCION_CAMBIADA', 'La selección cambió. Actualiza la lista.')
    const candidate = candidateForMaterial(material, catalog, contexts.get(material.id))
    const selectedCandidate: Candidate = isCandidate(candidate)
      ? candidate
      : fail(409, 'SELECCION_CAMBIADA', 'La selección cambió. Actualiza la lista.')
    if (selectedCandidate.item.sugerenciaId !== selection.sugerenciaId || selectedCandidate.item.fingerprint !== selection.fingerprint) fail(409, 'SELECCION_CAMBIADA', 'La selección cambió. Actualiza la lista.')
    selected.push(selectedCandidate)
  }
  selected.sort((left, right) => left.item.movimientoId.localeCompare(right.item.movimientoId))

  // The first permission check holds actor/permission rows.  Re-check immediately
  // before writes as a clear transaction boundary without a per-movement lookup.
  await requireLiveWriterTx(tx, actorId)
  const selectedItems = selected.map(candidate => candidate.item)
  const packageTotals = totals(selectedItems)
  const packageHash = easyCounterpartyBulkRequestHash(actorId, command)
  const lotRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO lotes_tercero_modo_facil (id,actor_id,idempotency_key,request_hash,preview_hash,resumen,created_at)
    VALUES (gen_random_uuid(),${actorId},CAST(${command.idempotencyKey} AS uuid),${packageHash},${easyCounterpartyBulkHash(command.previewToken)},
      jsonb_build_object(
        CAST('schema' AS text),CAST('EASY_COUNTERPARTY_BULK_RECEIPT_V1' AS text),
        CAST('aceptados' AS text),${selected.length},
        CAST('totales' AS text),jsonb_build_object(
          CAST('cargos' AS text),jsonb_build_object(CAST('movimientos' AS text),${packageTotals.cargos.movimientos},CAST('importeCentimos' AS text),CAST(${packageTotals.cargos.importeCentimos} AS text)),
          CAST('cobros' AS text),jsonb_build_object(CAST('movimientos' AS text),${packageTotals.cobros.movimientos},CAST('importeCentimos' AS text),CAST(${packageTotals.cobros.importeCentimos} AS text))
        )
      ),CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
  const loteId = lotRows[0]?.id
  if (!loteId) fail(500, 'LOTE_NO_GUARDADO', 'No se pudo guardar la selección.')
  const decisionIds: string[] = []
  for (let ordinal = 0; ordinal < selected.length; ordinal += 1) {
    const candidate = selected[ordinal]
    const item = candidate.item
    const idempotencyKey = uuidFromHash(easyCounterpartyBulkHash({ schema: 'EASY_COUNTERPARTY_BULK_P1_KEY_V1', loteId, movimientoId: item.movimientoId }))
    const receiptHash = easyCounterpartyBulkHash({ schema: 'EASY_COUNTERPARTY_BULK_P1_RECEIPT_V1', actorId, loteId, movimientoId: item.movimientoId, version: item.version, sugerenciaId: item.sugerenciaId, fingerprint: item.fingerprint })
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
      VALUES (gen_random_uuid(),${item.movimientoId},${actorId},'CONFIRMADA'::"EstadoDecisionTerceroModoFacil",${item.tipoTercero}::"TipoTerceroModoFacil",${candidate.origin}::"OrigenTerceroModoFacil",${candidate.candidateHash},CAST(${idempotencyKey} AS uuid),${receiptHash},NULL,
        jsonb_build_object(CAST('schema' AS text),CAST('EASY_COUNTERPARTY_RECEIPT_V1' AS text),CAST('candidateHash' AS text),CAST(${candidate.candidateHash} AS text),CAST('sourceHash' AS text),CAST(${candidate.sourceHash} AS text),CAST('origin' AS text),CAST(${candidate.origin} AS text),CAST('label' AS text),CAST(${item.etiqueta} AS text),CAST('bulkId' AS text),CAST(${loteId} AS text)),CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    const decisionId = rows[0]?.id
    if (!decisionId) fail(500, 'RECIBO_NO_GUARDADO', 'No se pudo guardar la selección.')
    decisionIds.push(decisionId)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO patas_lote_tercero_modo_facil (lote_id,ordinal,movimiento_id,decision_confirmada_id,fingerprint)
      VALUES (CAST(${loteId} AS uuid),${ordinal + 1},${item.movimientoId},CAST(${decisionId} AS uuid),${item.fingerprint})
    `)
  }
  return { ok: true as const, idempotente: false as const, loteId, aceptados: selected.length, totales: packageTotals, decisiones: decisionIds }
}

async function undoBulkTx(base: Prisma.TransactionClient, actorId: number, command: EasyBulkUndoCommand) {
  const tx = asTx(base)
  await lockPackage(tx, `easy-counterparty-bulk:undo:${actorId}:${command.idempotencyKey}`)
  // Replay is intentionally subject to the same present-tense authorization as a
  // first undo. A receipt does not grant a perpetual capability.
  await requireLiveWriterTx(tx, actorId)
  const replay = await replayUndoTx(tx, actorId, command)
  if (replay) return replay
  const lotRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,actor_id FROM lotes_tercero_modo_facil WHERE id=CAST(${command.loteId} AS uuid) LIMIT 1 FOR UPDATE
  `)
  const lot = lotRows[0]
  if (!lot) fail(404, 'LOTE_NO_ENCONTRADO', 'No se encontró esta selección para deshacer.')
  const originalActor = exactInteger(lot.actor_id, 'actor del lote')
  if (originalActor !== actorId && !await mayUndoOtherActorTx(tx, actorId)) fail(403, 'REVISION_NO_AUTORIZADA', 'No tienes permiso para deshacer esta selección.')
  const legs = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT p.ordinal,p.movimiento_id,p.decision_confirmada_id::text,d.actor_id,d.tipo_tercero::text AS tipo_tercero,d.origen::text AS origen,d.candidato_hash
    FROM patas_lote_tercero_modo_facil p
    JOIN decisiones_tercero_modo_facil d ON d.id=p.decision_confirmada_id
    WHERE p.lote_id=CAST(${command.loteId} AS uuid)
      AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    ORDER BY p.ordinal ASC
    FOR UPDATE OF p,d
  `)
  if (!legs.length || legs.length > EASY_COUNTERPARTY_BULK_MAX_ITEMS) fail(409, 'LOTE_CAMBIADO', 'Esta selección ya cambió y no se puede deshacer completa.')
  for (const leg of legs) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${String(leg.movimiento_id)} AS text),0))::text AS locked`)
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id=${String(leg.movimiento_id)} FOR UPDATE`)
    if (locked.length !== 1) fail(409, 'LOTE_CAMBIADO', 'Esta selección ya cambió y no se puede deshacer completa.')
  }
  await requireLiveWriterTx(tx, actorId)
  const requestHash = easyCounterpartyBulkRequestHash(actorId, command)
  const undoRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO reversiones_lote_tercero_modo_facil (id,lote_id,actor_id,idempotency_key,request_hash,resumen,created_at)
    VALUES (gen_random_uuid(),CAST(${command.loteId} AS uuid),${actorId},CAST(${command.idempotencyKey} AS uuid),${requestHash},
      jsonb_build_object(CAST('schema' AS text),CAST('EASY_COUNTERPARTY_BULK_UNDO_V1' AS text),CAST('revertidos' AS text),${legs.length}),CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
  const reversionId = undoRows[0]?.id
  if (!reversionId) fail(500, 'REVISION_NO_GUARDADA', 'No se pudo deshacer la selección.')
  for (const leg of legs) {
    const movementId = String(leg.movimiento_id), confirmedId = String(leg.decision_confirmada_id)
    const key = uuidFromHash(easyCounterpartyBulkHash({ schema: 'EASY_COUNTERPARTY_BULK_P1_UNDO_KEY_V1', reversionId, confirmedId }))
    const receiptHash = easyCounterpartyBulkHash({ schema: 'EASY_COUNTERPARTY_BULK_P1_UNDO_RECEIPT_V1', actorId, reversionId, confirmedId })
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
      VALUES (gen_random_uuid(),${movementId},${actorId},'REVERTIDA'::"EstadoDecisionTerceroModoFacil",${String(leg.tipo_tercero)}::"TipoTerceroModoFacil",${String(leg.origen)}::"OrigenTerceroModoFacil",${String(leg.candidato_hash)},CAST(${key} AS uuid),${receiptHash},CAST(${confirmedId} AS uuid),
        jsonb_build_object(CAST('schema' AS text),CAST('EASY_COUNTERPARTY_RECEIPT_V1' AS text),CAST('candidateHash' AS text),CAST(${String(leg.candidato_hash)} AS text),CAST('origin' AS text),CAST(${String(leg.origen)} AS text),CAST('bulkId' AS text),CAST(${command.loteId} AS text),CAST('bulkUndoId' AS text),CAST(${reversionId} AS text),CAST('revertedOriginalActorId' AS text),${originalActor},CAST('revertedByActorId' AS text),${actorId}),CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    const decisionId = rows[0]?.id
    if (!decisionId) fail(500, 'REVISION_NO_GUARDADA', 'No se pudo deshacer la selección.')
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO patas_reversion_lote_tercero_modo_facil (reversion_id,ordinal,decision_confirmada_id,decision_reversion_id)
      VALUES (CAST(${reversionId} AS uuid),${exactInteger(leg.ordinal, 'orden')},CAST(${confirmedId} AS uuid),CAST(${decisionId} AS uuid))
    `)
  }
  return { ok: true as const, idempotente: false as const, loteId: command.loteId, revertidos: legs.length }
}

export async function runEasyCounterpartyBulk(actorId: number, raw: unknown) {
  const command = parseEasyCounterpartyBulkCommand(raw)
  await assertPrototypeStaging()
  try {
    if (!await p1Ready(db()) || !await bulkReady(db())) requireBulkSchema(false)
    const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 35_000 }
    if (command.action === 'aceptar_seleccionados') return await db().$transaction(base => confirmBulkTx(base, actorId, command), options)
    return await db().$transaction(base => undoBulkTx(base, actorId, command), options)
  } catch (error) { throwKnown(error) }
}

/** Caller-owned integration-test variant.  It deliberately does not bypass the
 * staging gate, P1/bulk schema readiness, actor check, locks or revalidation.
 * Test callers must use a SERIALIZABLE transaction and always roll it back. */
export async function runEasyCounterpartyBulkTx(tx: Prisma.TransactionClient, actorId: number, raw: unknown) {
  const command = parseEasyCounterpartyBulkCommand(raw)
  await assertPrototypeStaging()
  try {
    const work = asTx(tx)
    if (!await p1Ready(work) || !await bulkReady(work)) requireBulkSchema(false)
    if (command.action === 'aceptar_seleccionados') return confirmBulkTx(tx, actorId, command)
    return undoBulkTx(tx, actorId, command)
  } catch (error) { throwKnown(error) }
}

function throwKnown(error: unknown): never {
  if (error instanceof EasyCounterpartyBulkServiceError || error instanceof EasyCounterpartyBulkValidationError || error instanceof PrototypeStagingError) throw error
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  if (['P2002', 'P2034', '40001', '40P01', '55P03'].includes(code)) fail(409, 'SELECCION_CAMBIADA', 'La selección cambió. Actualiza la lista.')
  throw error
}
export function easyCounterpartyBulkErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof PrototypeStagingError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof EasyCounterpartyBulkServiceError || error instanceof EasyCounterpartyBulkValidationError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  return { status: 500, body: { error: 'No se pudo completar la selección. Comprueba la lista antes de reintentar.', codigo: 'LOTE_TERCEROS_ERROR' } }
}
