import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { B4ServiceError, confirmarB4Tx, deshacerB4Tx } from '@/lib/finanzas/reconciliation-db'
import { canManageEasyAutomationStage } from '@/lib/finanzas/easy-access-profile'
import { appendAutoCounterpartyReceiptTx, undoAutoCounterpartyReceiptTx } from '@/lib/finanzas/easy-counterparty-db'
import {
  EASY_AUTO_DATA_FROM,
  EASY_AUTO_DATA_UNTIL,
  EASY_AUTO_ORIGIN,
  EASY_AUTO_POLICY_KEY,
  type EasyAutoBalanceRow,
  type EasyAutoCandidate,
  type EasyAutoClass,
  type EasyAutoExecuteInput,
  type EasyAutoInput,
  type EasyAutoMovement,
  type EasyAutoUndoInput,
  EasyAutoValidationError,
  centsFromExactSqlText,
  derivedUuidV4,
  normalizeEasyAutoText,
  parseEasyAutoInput,
  proveLocalBalanceNeighborhoods,
  requestHash,
  reviewHash,
  selectBilateralTransfers,
  selectPureBankCommissions,
} from '@/lib/finanzas/easy-auto-core'

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db
const AUTO_SCHEMA_TABLES = [
  'politicas_auto_modo_facil', 'atestaciones_cuenta_auto_modo_facil', 'terceros_banco_auto_modo_facil',
  'ejecuciones_auto_modo_facil', 'recibos_auto_modo_facil', 'patas_recibo_auto_modo_facil',
  'reversiones_auto_modo_facil', 'patas_reversion_auto_modo_facil', 'fallos_auto_modo_facil',
  'decisiones_tercero_modo_facil',
] as const

export class EasyAutoServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
  }
}
function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new EasyAutoServiceError(status, code, message, details)
}
function asTx(tx: Prisma.TransactionClient): Tx { return tx as Tx }
function exactInteger(value: unknown, field: string): number {
  if (typeof value === 'bigint') {
    if (value < BigInt(-2147483648) || value > BigInt(2147483647)) fail(422, 'CENTIMOS_FUERA_RANGO', `${field} está fuera de rango.`)
    return Number(value)
  }
  if (!Number.isSafeInteger(value)) fail(422, 'CENTIMOS_INVALIDOS', `${field} no son céntimos enteros seguros.`)
  return value as number
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function b4Failure(error: unknown): never {
  if (error instanceof EasyAutoServiceError || error instanceof EasyAutoValidationError || error instanceof PrototypeStagingError) throw error
  if (error instanceof B4ServiceError) fail(error.status, error.code, error.message, error.details)
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034' || code === '40001') fail(409, 'CONCURRENT_CONFLICT', 'Conflicto concurrente; relea la previsualización antes de reintentar.')
  throw error
}

export type EasyAutoPolicyView = Readonly<{ id: string; datosDesde: string; datosHasta: string; autorizadaEn: string; referenciaAutorizacion: string }>
type Policy = EasyAutoPolicyView
type AccountAttestation = Readonly<{ accountId: string }>
type AccountLabel = Readonly<{ accountId: string; banco: string; alias: string | null; ibanUltimos4: string }>
type ChainFailure = Readonly<{ accountId: string; code: string }>
type BlockedCandidate = Readonly<{
  fingerprint: string
  clase: 'TRASPASO_PROPIO'
  movimientos: readonly EasyAutoMovement[]
  bloqueos: readonly ['POR_TITULARIDAD_NO_ACREDITADA']
  cuentasPendientes: readonly AccountLabel[]
}>
type CandidateRead = Readonly<{
  candidates: EasyAutoCandidate[]
  blocked: BlockedCandidate[]
  chainFailures: readonly { cuenta: AccountLabel; codigo: string }[]
  examined: number
  excluded: number
}>
type ApplyOperation = Readonly<{ operationId: string; clase: EasyAutoClass; estado: 'APLICADA' | 'REPLAY'; operacionesB4: string[] }>
type ExecutionSummary = Readonly<{ examinados: number; excluidos: number; seleccionados: number }>

async function assertAutoSchema(tx: Tx): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ name: string; found: string | null }>>(Prisma.sql`
    SELECT name,to_regclass(name)::text AS found
    FROM unnest(ARRAY[${Prisma.join(AUTO_SCHEMA_TABLES.map(name => Prisma.sql`${name}`))}]::text[]) AS t(name)
  `)
  if (rows.length !== AUTO_SCHEMA_TABLES.length || rows.some(row => row.found === null)) {
    fail(503, 'AUTOMATIZACION_ESQUEMA_PENDIENTE', 'Las migraciones aditivas P1 y de automatización restringida aún no están aplicadas en staging.')
  }
}

/** The authorization date is stamped with CURRENT_DATE when appended. A valid prior
 * opt-in remains usable tomorrow; the backend never silently demands a new one. */
async function activePolicy(tx: Tx, required: boolean): Promise<Policy | null> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,datos_desde::date::text AS datos_desde,datos_hasta::date::text AS datos_hasta,
      autorizada_en::date::text AS autorizada_en,referencia_autorizacion
    FROM politicas_auto_modo_facil
    WHERE politica_key=${EASY_AUTO_POLICY_KEY} AND entorno='STAGING' AND estado='ACTIVA'
      AND datos_desde=CAST(${EASY_AUTO_DATA_FROM} AS date) AND datos_hasta=CAST(${EASY_AUTO_DATA_UNTIL} AS date)
    ORDER BY autorizada_en DESC,created_at DESC,id DESC LIMIT 1
  `)
  const row = rows[0]
  if (!row) {
    if (required) fail(409, 'POLITICA_AUTOMATICA_NO_ACTIVA', 'No existe una política ACTIVA de staging para la ventana cerrada.')
    return null
  }
  return { id: String(row.id), datosDesde: String(row.datos_desde), datosHasta: String(row.datos_hasta), autorizadaEn: String(row.autorizada_en), referenciaAutorizacion: String(row.referencia_autorizacion) }
}

/** Access is deliberately rechecked at every mutation path, beyond route/session checks. */
async function requireAutoManager(actorId: number): Promise<void> {
  await assertPrototypeStaging()
  if (!Number.isSafeInteger(actorId) || actorId <= 0) fail(401, 'NO_AUTORIZADO', 'Actor no válido.')
  if (!await canManageEasyAutomationStage(actorId)) {
    fail(403, 'AUTOMATIZACION_NO_AUTORIZADA', 'El perfil vivo no puede gestionar automatización restringida en staging.')
  }
  const b4 = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in b4) fail(b4.response.status, 'B4_ACCESS_REVOKED', 'El permiso B4 de escritura ya no está vigente.')
}

async function accountAttestations(tx: Tx, policy: Policy): Promise<AccountAttestation[]> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT a.cuenta_id AS cuenta_id
    FROM atestaciones_cuenta_auto_modo_facil a
    JOIN cuentas_bancarias c ON c.id=a.cuenta_id
    WHERE a.politica_id=CAST(${policy.id} AS uuid) AND c.activa=true
    ORDER BY a.cuenta_id ASC
  `)
  return rows.flatMap((row): AccountAttestation[] => typeof row.cuenta_id === 'string' && row.cuenta_id ? [{ accountId: row.cuenta_id }] : [])
}

/**
 * Candidate source contains no EntityFiscal condition. A legacy EF association is
 * neither a bank identity proof nor a reason to discard a pure bank commission.
 * The P1 active-decision exclusion protects a prior human/P1 decision from being
 * overwritten; no legacy source column is ever modified.
 */
async function candidateMovements(tx: Tx, policy: Policy): Promise<{ movements: EasyAutoMovement[]; examined: number }> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.cuenta_id,m.fecha_operacion::date::text AS fecha,m.importe::text AS importe_text,
      m.concepto,m.referencia,m.info_adicional,m.tercero,c.banco AS banco_cuenta,COALESCE(e.version,1) AS version_b4
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.fecha_operacion::date>=CAST(${policy.datosDesde} AS date) AND m.fecha_operacion::date<=CAST(${policy.datosHasta} AS date)
      AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      -- Un flag/FK de traspaso legacy no prueba ni impide el cuadre nuevo B4.
      -- Se preserva intacto y sólo se admite el par con saldos y propiedad probados.
      AND m.factura_id IS NULL AND m.gasto_id IS NULL AND m.factura_emitida_id IS NULL AND m.nomina_id IS NULL
      AND m.entrega_a_cuenta_empleado_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM patas_recibo_auto_modo_facil p WHERE p.movimiento_id=m.id)
      AND NOT EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id)
      )
    ORDER BY m.fecha_operacion::date ASC,m.id ASC
  `)
  const movements: EasyAutoMovement[] = []
  for (const row of rows) {
    try {
      const cents = centsFromExactSqlText(row.importe_text, `movimiento ${String(row.id)}.importe`)
      const versionB4 = exactInteger(row.version_b4, 'versión B4')
      if (versionB4 < 1) continue
      movements.push({
        id: String(row.id), cuentaId: String(row.cuenta_id), fecha: String(row.fecha), importeCentimos: cents, versionB4,
        concepto: text(row.concepto), referencia: text(row.referencia), infoAdicional: text(row.info_adicional), tercero: text(row.tercero), bancoCuenta: text(row.banco_cuenta),
      })
    } catch { /* non-exact source values stay excluded rather than rounded */ }
  }
  return { movements, examined: rows.length }
}

/** Only transfer candidates call this. It reads the finite policy window and proves
 * the local mathematical neighborhood touching each leg; it never orders by id. */
async function localBalanceEvidence(
  tx: Tx,
  policy: Policy,
  accountIds: readonly string[],
  movementIds: readonly string[],
): Promise<ReadonlyMap<string, { ok: boolean; code: string | null }>> {
  const accounts = [...new Set(accountIds.filter(Boolean))].sort()
  if (!accounts.length) return new Map(movementIds.map(id => [id, { ok: false, code: 'CADENA_SALDO_SIN_VECINDARIO' }]))
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.cuenta_id,m.fecha_operacion::date::text AS fecha,m.importe::text AS importe_text,m.saldo::text AS saldo_text,
      c.fecha_corte_extracto::date::text AS corte_extracto
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
    WHERE m.cuenta_id IN (${Prisma.join(accounts.map(accountId => Prisma.sql`${accountId}`))})
      AND m.fecha_operacion::date>=CAST(${policy.datosDesde} AS date)
      AND m.fecha_operacion::date<=CAST(${policy.datosHasta} AS date)
    ORDER BY m.cuenta_id ASC,m.fecha_operacion::date ASC,m.id ASC
  `)
  const balanceRows: EasyAutoBalanceRow[] = rows.map(row => {
    let importeCentimos: number | null = null
    let saldoCentimos: number | null = null
    try { importeCentimos = centsFromExactSqlText(row.importe_text, `cadena ${String(row.id)}.importe`, true) } catch { /* retained as invalid evidence */ }
    try { saldoCentimos = row.saldo_text === null ? null : centsFromExactSqlText(row.saldo_text, `cadena ${String(row.id)}.saldo`, true) } catch { /* retained as invalid evidence */ }
    return { id: String(row.id), cuentaId: String(row.cuenta_id), fecha: String(row.fecha), importeCentimos, saldoCentimos }
  })
  const evidence = proveLocalBalanceNeighborhoods(balanceRows, movementIds)
  const sourceById = new Map(rows.map(row => [String(row.id), row]))
  const covered = new Map<string, { ok: boolean; code: string | null }>()
  for (const movementId of movementIds) {
    const proof = evidence.get(movementId)
    const source = sourceById.get(movementId)
    const cutoff = source?.corte_extracto === null || source?.corte_extracto === undefined ? null : String(source.corte_extracto)
    // This applies solely to transfer balance evidence: a local successor cannot
    // certify an extract whose declared coverage ended before the transfer leg.
    if (proof?.ok && (!cutoff || cutoff < String(source.fecha))) {
      covered.set(movementId, { ok: false, code: 'COBERTURA_EXTRACTO_INSUFICIENTE' })
    } else {
      covered.set(movementId, proof ?? { ok: false, code: 'CADENA_SALDO_SIN_VECINDARIO' })
    }
  }
  return covered
}

async function accountLabels(tx: Tx, accountIds: readonly string[]): Promise<Map<string, AccountLabel>> {
  const unique = [...new Set(accountIds.filter(Boolean))].sort()
  if (!unique.length) return new Map()
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id,banco,alias,iban FROM cuentas_bancarias
    WHERE id IN (${Prisma.join(unique.map(id => Prisma.sql`${id}`))})
    ORDER BY id ASC
  `)
  return new Map(rows.map(row => {
    const iban = String(row.iban ?? '')
    return [String(row.id), { accountId: String(row.id), banco: String(row.banco ?? ''), alias: row.alias === null ? null : String(row.alias), ibanUltimos4: iban.slice(-4) }]
  }))
}

async function candidatesTx(tx: Tx, policy: Policy): Promise<CandidateRead> {
  const [atts, base] = await Promise.all([accountAttestations(tx, policy), candidateMovements(tx, policy)])
  const transferSeeds = selectBilateralTransfers(base.movements)
  const transferAccountIds = transferSeeds.flatMap(candidate => candidate.movimientos.map(movement => movement.cuentaId))
  const transferMovementIds = transferSeeds.flatMap(candidate => candidate.movimientos.map(movement => movement.id))
  const evidence = await localBalanceEvidence(tx, policy, transferAccountIds, transferMovementIds)
  const chainFailureByAccount = new Map<string, string>()
  const technicallyBalancedTransfers = transferSeeds.filter(candidate => {
    let valid = true
    for (const movement of candidate.movimientos) {
      const proof = evidence.get(movement.id)
      if (!proof?.ok) {
        valid = false
        if (!chainFailureByAccount.has(movement.cuentaId)) chainFailureByAccount.set(movement.cuentaId, proof?.code ?? 'CADENA_SALDO_SIN_VECINDARIO')
      }
    }
    return valid
  })
  const commissions = selectPureBankCommissions(base.movements)
  // Transfers get first claim to a leg once their complete local balance proof has
  // succeeded. Missing ownership leaves the transfer blocked, not reclassified.
  const consumed = new Set(technicallyBalancedTransfers.flatMap(candidate => candidate.movimientos.map(movement => movement.id)))
  const commissionOnly = commissions.filter(candidate => !consumed.has(candidate.movimientos[0].id))
  const ownedAccounts = new Set(atts.map(att => att.accountId))
  const eligibleTransfers = technicallyBalancedTransfers.filter(candidate => candidate.movimientos.every(movement => ownedAccounts.has(movement.cuentaId)))
  const blockedSeeds = technicallyBalancedTransfers
    .filter(candidate => candidate.movimientos.some(movement => !ownedAccounts.has(movement.cuentaId)))
  const labels = await accountLabels(tx, [
    ...blockedSeeds.flatMap(candidate => candidate.movimientos.filter(movement => !ownedAccounts.has(movement.cuentaId)).map(movement => movement.cuentaId)),
    ...chainFailureByAccount.keys(),
  ])
  const blocked: BlockedCandidate[] = blockedSeeds.map(candidate => ({
    fingerprint: candidate.fingerprint, clase: candidate.clase, movimientos: candidate.movimientos,
    bloqueos: ['POR_TITULARIDAD_NO_ACREDITADA'] as const,
    cuentasPendientes: [...new Set(candidate.movimientos.filter(movement => !ownedAccounts.has(movement.cuentaId)).map(movement => movement.cuentaId))]
      .map(accountId => labels.get(accountId)).filter((label): label is AccountLabel => label !== undefined),
  }))
  const chainFailures: Array<{ cuenta: AccountLabel; codigo: string }> = [...chainFailureByAccount.entries()]
    .map(([accountId, codigo]) => ({ cuenta: labels.get(accountId), codigo }))
    .filter((failure): failure is { cuenta: AccountLabel; codigo: string } => failure.cuenta !== undefined)
    .sort((left, right) => left.cuenta.accountId.localeCompare(right.cuenta.accountId))
  const candidates = [...eligibleTransfers, ...commissionOnly].sort((left, right) => Math.max(...right.movimientos.map(m => Math.abs(m.importeCentimos))) - Math.max(...left.movimientos.map(m => Math.abs(m.importeCentimos))) || left.fingerprint.localeCompare(right.fingerprint))
  const used = new Set([...technicallyBalancedTransfers, ...commissionOnly].flatMap(candidate => candidate.movimientos.map(movement => movement.id))).size
  return { candidates, blocked, chainFailures, examined: base.examined, excluded: Math.max(0, base.examined - used) }
}

function candidateDto(candidate: EasyAutoCandidate) {
  return {
    fingerprint: candidate.fingerprint, clase: candidate.clase, origen: candidate.origen,
    movimientos: candidate.movimientos.map(movement => ({ id: movement.id, cuentaId: movement.cuentaId, fecha: movement.fecha, importeCentimos: movement.importeCentimos, versionB4: movement.versionB4 })),
    motivoNoRequiere: candidate.motivoNoRequiere,
    // Retained as a nullable compatibility field for the existing UI. The actual
    // bank identity is derived server-side from CuentaBancaria and never from m.tercero.
    terceroBancoId: null,
    controles: [...candidate.controles],
  }
}

function blockedDto(candidate: BlockedCandidate) {
  return {
    fingerprint: candidate.fingerprint, clase: candidate.clase,
    movimientos: candidate.movimientos.map(movement => ({ id: movement.id, cuentaId: movement.cuentaId, fecha: movement.fecha, importeCentimos: movement.importeCentimos, versionB4: movement.versionB4 })),
    bloqueos: [...candidate.bloqueos],
    cuentasPendientes: candidate.cuentasPendientes.map(account => ({ cuentaId: account.accountId, banco: account.banco, alias: account.alias, ibanUltimos4: account.ibanUltimos4 })),
  }
}

async function recentFailures(tx: Tx, policy: Policy) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,fingerprint,clase,codigo,mensaje,created_at
    FROM fallos_auto_modo_facil WHERE politica_id=CAST(${policy.id} AS uuid)
    ORDER BY created_at DESC,id DESC LIMIT 50
  `)
  return rows.map(row => ({ id: String(row.id), fingerprint: String(row.fingerprint), clase: String(row.clase), codigo: String(row.codigo), mensaje: String(row.mensaje), createdAt: new Date(row.created_at).toISOString() }))
}

async function appliedReceipts(tx: Tx, policy: Policy) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text,r.clase,r.origen,r.created_at,rv.id::text AS reversion_id,
      array_remove(array_agg(p.operacion_b4_id::text ORDER BY p.ordinal),NULL) AS operaciones_b4
    FROM recibos_auto_modo_facil r
    LEFT JOIN patas_recibo_auto_modo_facil p ON p.recibo_id=r.id
    LEFT JOIN reversiones_auto_modo_facil rv ON rv.recibo_id=r.id
    WHERE r.politica_id=CAST(${policy.id} AS uuid)
    GROUP BY r.id,rv.id ORDER BY r.created_at DESC,r.id DESC LIMIT 100
  `)
  return rows.map(row => ({ operationId: String(row.id), clase: String(row.clase), origen: String(row.origen),
    operacionesB4: Array.isArray(row.operaciones_b4) ? row.operaciones_b4.map(String) : [], reversible: row.reversion_id === null, reverted: row.reversion_id !== null,
    createdAt: new Date(row.created_at).toISOString() }))
}

/** GET projection backing. It has no DML and never initializes policy/state. */
export async function readEasyAutomation() {
  await assertPrototypeStaging()
  try {
    return await db().$transaction(async tx => {
      const work = asTx(tx)
      await assertAutoSchema(work)
      const policy = await activePolicy(work, false)
      if (!policy) return { stagingOnly: true as const, automaticas: true as const, policy: null, counts: { examinados: 0, traspasos: 0, comisiones: 0, excluidos: 0, bloqueadosTitularidad: 0, fallosCadena: 0 }, reviewHash: null, candidates: [], bloqueados: [], fallosCadena: [], fallos: [], recibos: [] }
      const read = await candidatesTx(work, policy)
      const selected = read.candidates.slice(0, 100)
      const transfers = selected.filter(candidate => candidate.clase === 'TRASPASO_PROPIO').length
      const commissions = selected.filter(candidate => candidate.clase === 'COMISION_BANCARIA').length
      return {
        stagingOnly: true as const, automaticas: true as const, policy,
        counts: { examinados: read.examined, traspasos: transfers, comisiones: commissions, excluidos: read.excluded, bloqueadosTitularidad: read.blocked.length, fallosCadena: read.chainFailures.length },
        reviewHash: reviewHash(policy.id, selected), candidates: selected.map(candidateDto),
        fallosCadena: read.chainFailures.map(failure => ({ cuenta: { cuentaId: failure.cuenta.accountId, banco: failure.cuenta.banco, alias: failure.cuenta.alias, ibanUltimos4: failure.cuenta.ibanUltimos4 }, codigo: failure.codigo })),
        bloqueados: read.blocked.map(blockedDto), fallos: await recentFailures(work, policy), recibos: await appliedReceipts(work, policy),
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error) { return b4Failure(error) }
}

/** First policy registration is explicit and append-only. It never creates any
 * account ownership claim or third-party mapping. */
async function registerPolicy(actorId: number, referenciaAutorizacion: string) {
  await requireAutoManager(actorId)
  try {
    return await db().$transaction(async tx => {
      const work = asTx(tx)
      await assertAutoSchema(work)
      const existing = await activePolicy(work, false)
      if (existing) {
        if (existing.referenciaAutorizacion !== referenciaAutorizacion) fail(409, 'POLITICA_EXISTENTE_DIFERENTE', 'La política activa ya conserva otra referencia de autorización; no se edita.')
        return { ok: true as const, policy: existing, idempotente: true as const }
      }
      const rows = await work.$queryRaw<Array<any>>(Prisma.sql`
        INSERT INTO politicas_auto_modo_facil (id,politica_key,entorno,estado,datos_desde,datos_hasta,autorizada_en,referencia_autorizacion,creada_por_id,created_at)
        VALUES (gen_random_uuid(),${EASY_AUTO_POLICY_KEY},'STAGING','ACTIVA',CAST(${EASY_AUTO_DATA_FROM} AS date),CAST(${EASY_AUTO_DATA_UNTIL} AS date),CURRENT_DATE,${referenciaAutorizacion},${actorId},CURRENT_TIMESTAMP)
        RETURNING id::text,datos_desde::date::text AS datos_desde,datos_hasta::date::text AS datos_hasta,autorizada_en::date::text AS autorizada_en,referencia_autorizacion
      `)
      const row = rows[0]
      if (!row) fail(409, 'POLITICA_NO_REGISTRADA', 'No se pudo registrar la política de staging.')
      return { ok: true as const, idempotente: false as const, policy: { id: String(row.id), datosDesde: String(row.datos_desde), datosHasta: String(row.datos_hasta), autorizadaEn: String(row.autorizada_en), referenciaAutorizacion: String(row.referencia_autorizacion) } }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error) { return b4Failure(error) }
}

/** One selected account only. It is only for bilateral transfer evidence; pure
 * commissions never prompt it and policy registration never grants it. */
async function attestEasyAutoAccount(actorId: number, input: Extract<EasyAutoInput, { action: 'atestiguar_cuenta' }>) {
  await requireAutoManager(actorId)
  try {
    return await db().$transaction(async tx => {
      const work = asTx(tx)
      await assertAutoSchema(work)
      const policy = await activePolicy(work, true)
      const account = await work.$queryRaw<Array<any>>(Prisma.sql`
        SELECT id FROM cuentas_bancarias WHERE id=${input.cuentaId} AND activa=true FOR KEY SHARE
      `)
      if (account.length !== 1) fail(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta seleccionada no existe o no está activa.')
      const current = await candidatesTx(work, policy)
      if (!current.blocked.some(candidate => candidate.cuentasPendientes.some(item => item.accountId === input.cuentaId))) {
        fail(422, 'ATESTACION_SIN_TRASPASO_BLOQUEADO', 'Sólo se puede atestiguar una cuenta de un traspaso técnicamente válido bloqueado por titularidad.')
      }
      const previous = await work.$queryRaw<Array<any>>(Prisma.sql`
        SELECT titular_declarado,cif_titular,referencia_evidencia
        FROM atestaciones_cuenta_auto_modo_facil
        WHERE politica_id=CAST(${policy.id} AS uuid) AND cuenta_id=${input.cuentaId}
        ORDER BY version DESC LIMIT 1 FOR UPDATE
      `)
      if (previous.length) {
        const same = previous[0].titular_declarado === input.titularDeclarado
          && (previous[0].cif_titular ?? null) === (input.cifTitular ?? null)
          && previous[0].referencia_evidencia === input.referenciaEvidencia
        if (same) return { ok: true as const, idempotente: true as const, cuentaId: input.cuentaId }
        fail(409, 'ATESTACION_EXISTENTE_NO_EDITABLE', 'La atestación de titularidad ya existe y es append-only; no se edita ni sustituye.')
      }
      await work.$executeRaw(Prisma.sql`
        INSERT INTO atestaciones_cuenta_auto_modo_facil
          (id,politica_id,cuenta_id,version,titular_declarado,cif_titular,referencia_evidencia,confirmacion_titularidad_io,actor_id,snapshot,created_at)
        VALUES
          (gen_random_uuid(),CAST(${policy.id} AS uuid),${input.cuentaId},1,${input.titularDeclarado},${input.cifTitular ?? null},${input.referenciaEvidencia},true,${actorId},
           jsonb_build_object('schema','EASY_AUTO_ACCOUNT_ATTESTATION_V1','origen',${EASY_AUTO_ORIGIN},'cuentaId',${input.cuentaId},'confirmacionTitularidadIo',true),CURRENT_TIMESTAMP)
      `)
      return { ok: true as const, idempotente: false as const, cuentaId: input.cuentaId }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error) { return b4Failure(error) }
}

export async function previewEasyAutomation(raw: unknown) {
  const input = parseEasyAutoInput(raw)
  if (input.action !== 'previsualizar') fail(400, 'VALIDATION_ERROR', 'La previsualización exige action=previsualizar.')
  await assertPrototypeStaging()
  try {
    return await db().$transaction(async tx => previewEasyAutomationTx(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error) { return b4Failure(error) }
}

/** Caller-owned read helper for rollback integration tests and private runners. */
export async function previewEasyAutomationTx(tx: Prisma.TransactionClient, input: Extract<EasyAutoInput, { action: 'previsualizar' }>) {
  const work = asTx(tx)
  await assertAutoSchema(work)
  const policy = await activePolicy(work, true)
  const read = await candidatesTx(work, policy)
  const selected = read.candidates.slice(0, input.limite)
  const transfers = selected.filter(candidate => candidate.clase === 'TRASPASO_PROPIO').length
  const commissions = selected.filter(candidate => candidate.clase === 'COMISION_BANCARIA').length
  return {
    stagingOnly: true as const, dryRun: true as const, policy,
    counts: { examinados: read.examined, traspasos: transfers, comisiones: commissions, excluidos: read.excluded, bloqueadosTitularidad: read.blocked.length, fallosCadena: read.chainFailures.length },
    reviewHash: reviewHash(policy.id, selected), candidates: selected.map(candidateDto),
    fallosCadena: read.chainFailures.map(failure => ({ cuenta: { cuentaId: failure.cuenta.accountId, banco: failure.cuenta.banco, alias: failure.cuenta.alias, ibanUltimos4: failure.cuenta.ibanUltimos4 }, codigo: failure.codigo })),
    bloqueados: read.blocked.map(blockedDto),
  }
}

async function lockCandidateAccounts(tx: Tx, candidate: EasyAutoCandidate, policy: Policy): Promise<void> {
  const accountIds = [...new Set(candidate.movimientos.map(movement => movement.cuentaId))].sort()
  for (const accountId of accountIds) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`easy-auto-account:${accountId}`},0))::text AS locked`)
    const account = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM cuentas_bancarias WHERE id=${accountId} AND activa=true FOR KEY SHARE`)
    if (account.length !== 1) fail(409, 'CUENTA_OBSOLETA', 'Una cuenta candidata ya no está activa.')
  }
  // Only a transfer depends on exact balance-edge evidence. Commission eligibility
  // is deliberately unaffected by distant account-chain gaps.
  if (candidate.clase === 'TRASPASO_PROPIO') {
    for (const accountId of accountIds) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM movimientos_bancarios
        WHERE cuenta_id=${accountId}
          AND fecha_operacion::date>=CAST(${policy.datosDesde} AS date)
          AND fecha_operacion::date<=CAST(${policy.datosHasta} AS date)
        FOR SHARE
      `)
    }
  }
  for (const movement of [...candidate.movimientos].sort((left, right) => left.id.localeCompare(right.id))) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movement.id} AS text),0))::text AS locked`)
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id=${movement.id} FOR UPDATE`)
    if (locked.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'Un movimiento candidato ya no existe.')
  }
}

function b4Key(receiptId: string, movementId: string): string {
  return `EASY_AUTO_APPLY:${receiptId.slice(0, 16)}:${movementId.slice(0, 56)}`
}
function b4UndoKey(reversalId: string, originalOperationId: string): string {
  return `EASY_AUTO_UNDO:${reversalId.slice(0, 16)}:${originalOperationId.slice(0, 56)}`
}

async function appendB4OriginEvent(tx: Tx, actorId: number, operationId: string, movementId: string, receiptId: string): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO eventos_justificacion_b4 (id,operacion_id,movimiento_id,accion,actor_id,detalle,created_at)
    VALUES (gen_random_uuid(),CAST(${operationId} AS uuid),${movementId},'APLICACION'::"AccionEventoJustificacionB4",${actorId},
      jsonb_build_object('schema','EASY_AUTO_ORIGIN_V1','origen',${EASY_AUTO_ORIGIN},'reciboAutoId',${receiptId}),CURRENT_TIMESTAMP)
  `)
}

/** The table remains an immutable audit ledger, but its row is derived automatically
 * from CuentaBancaria.banco at apply time. There is no human preregistration path. */
async function derivedBankThirdPartyTx(tx: Tx, actorId: number, policy: Policy, accountId: string, bankName: string): Promise<string> {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO terceros_banco_auto_modo_facil
      (id,politica_id,cuenta_id,nombre_normalizado,referencia_evidencia,activo,actor_id,snapshot,created_at)
    VALUES (gen_random_uuid(),CAST(${policy.id} AS uuid),${accountId},${bankName},
      'DERIVADO_AUTOMATICAMENTE_DE_CUENTAS_BANCARIAS.BANCO',true,${actorId},
      jsonb_build_object('schema','EASY_AUTO_BANK_THIRD_PARTY_V1','origen',${EASY_AUTO_ORIGIN},'cuentaId',${accountId},'derivadoDeCuentaBanco',true),CURRENT_TIMESTAMP)
    ON CONFLICT (politica_id,cuenta_id,nombre_normalizado) DO NOTHING
    RETURNING id::text
  `)
  if (inserted[0]?.id) return String(inserted[0].id)
  const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id::text FROM terceros_banco_auto_modo_facil
    WHERE politica_id=CAST(${policy.id} AS uuid) AND cuenta_id=${accountId} AND nombre_normalizado=${bankName} AND activo=true
    LIMIT 1 FOR KEY SHARE
  `)
  if (!existing[0]?.id) fail(409, 'BANCO_COBRADOR_NO_DERIVABLE', 'No se pudo recuperar el banco cobrador derivado de la cuenta.')
  return String(existing[0].id)
}

async function applyCandidateTx(tx: Tx, actorId: number, policy: Policy, executionId: string, input: EasyAutoExecuteInput, candidate: EasyAutoCandidate): Promise<ApplyOperation> {
  await lockCandidateAccounts(tx, candidate, policy)
  const current = await candidatesTx(tx, policy)
  const live = current.candidates.find(item => item.fingerprint === candidate.fingerprint)
  if (!live) fail(409, 'CANDIDATO_OBSOLETO', 'El candidato dejó de cumplir todas las reglas cerradas al releerlo bajo bloqueo.')
  const receiptId = randomUUID()
  const thirdPartyId = live.clase === 'COMISION_BANCARIA'
    ? await derivedBankThirdPartyTx(tx, actorId, policy, live.movimientos[0].cuentaId, live.bancoCobradorNormalizado)
    : null
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO recibos_auto_modo_facil (id,ejecucion_id,politica_id,actor_id,clase,origen,idempotency_key,request_hash,fingerprint,tercero_banco_id,created_at)
    VALUES (CAST(${receiptId} AS uuid),CAST(${executionId} AS uuid),CAST(${policy.id} AS uuid),${actorId},${live.clase},${EASY_AUTO_ORIGIN},
      CAST(${derivedUuidV4('EASY_AUTO_RECEIPT', `${executionId}:${live.fingerprint}`)} AS uuid),
      ${requestHash(actorId, input)},
      ${live.fingerprint},${thirdPartyId === null ? Prisma.sql`NULL` : Prisma.sql`CAST(${thirdPartyId} AS uuid)`},CURRENT_TIMESTAMP)
  `)
  const operations: Array<{ id: string; movementId: string }> = []
  for (const movement of live.movimientos) {
    const result: any = await confirmarB4Tx(tx, actorId, {
      action: 'confirmar', confirmacion: true, idempotencyKey: b4Key(receiptId, movement.id), version: movement.versionB4,
      borrador: { movimientoId: movement.id, importeMovimientoCentimos: movement.importeCentimos, estado: 'NO_REQUIERE', motivoNoRequiere: live.motivoNoRequiere, lineas: [] },
    })
    if (result.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La clave B4 interna ya existía fuera de este recibo; no se adopta.')
    operations.push({ id: String(result.operacion.id), movementId: movement.id })
  }
  for (let index = 0; index < live.movimientos.length; index += 1) {
    const movement = live.movimientos[index]
    const operation = operations.find(item => item.movementId === movement.id)
    if (!operation) throw new Error('EASY_AUTO_INTERNAL_OPERATION_MAPPING')
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO patas_recibo_auto_modo_facil (recibo_id,ordinal,movimiento_id,operacion_b4_id,motivo_no_requiere)
      VALUES (CAST(${receiptId} AS uuid),${index + 1},${movement.id},CAST(${operation.id} AS uuid),${live.motivoNoRequiere}::"MotivoNoRequiere")
    `)
    await appendB4OriginEvent(tx, actorId, operation.id, movement.id, receiptId)
    if (live.clase === 'COMISION_BANCARIA') {
      await appendAutoCounterpartyReceiptTx(tx, actorId, {
        movimientoId: movement.id, autoReceiptId: receiptId,
      })
    } else {
      await appendAutoCounterpartyReceiptTx(tx, actorId, {
        movimientoId: movement.id, autoReceiptId: receiptId,
      })
    }
  }
  return { operationId: receiptId, clase: live.clase, estado: 'APLICADA', operacionesB4: operations.map(operation => operation.id) }
}

async function executionOperationsTx(tx: Tx, executionId: string, state: 'APLICADA' | 'REPLAY'): Promise<ApplyOperation[]> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text,r.clase,array_remove(array_agg(p.operacion_b4_id::text ORDER BY p.ordinal),NULL) AS operaciones_b4
    FROM recibos_auto_modo_facil r
    LEFT JOIN patas_recibo_auto_modo_facil p ON p.recibo_id=r.id
    WHERE r.ejecucion_id=CAST(${executionId} AS uuid)
    GROUP BY r.id,r.clase ORDER BY r.id ASC
  `)
  return rows.map(row => ({ operationId: String(row.id), clase: String(row.clase) as EasyAutoClass, estado: state, operacionesB4: Array.isArray(row.operaciones_b4) ? row.operaciones_b4.map(String) : [] }))
}

async function executionReplayTx(tx: Tx, actorId: number, input: EasyAutoExecuteInput): Promise<{ operations: ApplyOperation[]; summary: ExecutionSummary } | null> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,request_hash,resumen
    FROM ejecuciones_auto_modo_facil
    WHERE actor_id=${actorId} AND idempotency_key=CAST(${input.idempotencyKey} AS uuid)
    LIMIT 1 FOR UPDATE
  `)
  const row = rows[0]
  if (!row) return null
  if (String(row.request_hash) !== requestHash(actorId, input)) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra ejecución automática.')
  const raw = row.resumen && typeof row.resumen === 'object' ? row.resumen : {}
  const summary: ExecutionSummary = {
    examinados: exactInteger(raw.examinados ?? 0, 'resumen.examinados'),
    excluidos: exactInteger(raw.excluidos ?? 0, 'resumen.excluidos'),
    seleccionados: exactInteger(raw.seleccionados ?? 0, 'resumen.seleccionados'),
  }
  return { operations: await executionOperationsTx(tx, String(row.id), 'REPLAY'), summary }
}

/** Caller-owned execution helper. The wrapper checks live staging/actor access;
 * this variant lets the rollback test prove atomicity using one outer transaction. */
export async function executeEasyAutomationTx(tx: Prisma.TransactionClient, actorId: number, input: EasyAutoExecuteInput) {
  const work = asTx(tx)
  await assertAutoSchema(work)
  await work.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`easy-auto-execution:${actorId}:${input.idempotencyKey}`},0))::text AS locked`)
  // This is deliberately before policy/candidate preview. An uncertain committed
  // response replays exactly the persisted receipts even if today's queue changed.
  const replay = await executionReplayTx(work, actorId, input)
  if (replay) return {
    stagingOnly: true as const, dryRun: false as const,
    counts: { examinados: replay.summary.examinados, aplicados: 0, replays: replay.operations.length, excluidos: replay.summary.excluidos, fallidos: 0 },
    operations: replay.operations,
  }
  const policy = await activePolicy(work, true)
  const read = await candidatesTx(work, policy)
  const candidates = read.candidates.slice(0, input.limite)
  if (reviewHash(policy.id, candidates) !== input.reviewHash) {
    fail(409, 'PREVIEW_OBSOLETA', 'El hash de la previsualización ya no coincide; revise de nuevo antes de ejecutar.')
  }
  const executionId = randomUUID()
  const summary: ExecutionSummary = { examinados: read.examined, excluidos: read.excluded, seleccionados: candidates.length }
  await work.$executeRaw(Prisma.sql`
    INSERT INTO ejecuciones_auto_modo_facil (id,politica_id,actor_id,idempotency_key,request_hash,review_hash,resumen,created_at)
    VALUES (CAST(${executionId} AS uuid),CAST(${policy.id} AS uuid),${actorId},CAST(${input.idempotencyKey} AS uuid),${requestHash(actorId,input)},${input.reviewHash},
      jsonb_build_object('examinados',${summary.examinados},'excluidos',${summary.excluidos},'seleccionados',${summary.seleccionados}),CURRENT_TIMESTAMP)
  `)
  const operations: ApplyOperation[] = []
  for (const candidate of candidates) operations.push(await applyCandidateTx(work, actorId, policy, executionId, input, candidate))
  return {
    stagingOnly: true as const, dryRun: false as const,
    counts: { examinados: summary.examinados, aplicados: operations.length, replays: 0, excluidos: summary.excluidos, fallidos: 0 },
    operations,
  }
}

export async function executeEasyAutomation(actorId: number, raw: unknown) {
  const input = parseEasyAutoInput(raw)
  if (input.action !== 'ejecutar') fail(400, 'VALIDATION_ERROR', 'La ejecución exige action=ejecutar.')
  await requireAutoManager(actorId)
  try {
    return await db().$transaction(tx => executeEasyAutomationTx(tx, actorId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
  } catch (error) { return b4Failure(error) }
}

async function undoReplayTx(tx: Tx, actorId: number, input: EasyAutoUndoInput) {
  const receiptRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,actor_id FROM recibos_auto_modo_facil
    WHERE id=CAST(${input.operationId} AS uuid) LIMIT 1 FOR UPDATE
  `)
  const receipt = receiptRows[0]
  if (!receipt) fail(404, 'RECIBO_AUTO_NO_ENCONTRADO', 'La operación automática no existe.')
  if (exactInteger(receipt.actor_id, 'actor recibo') !== actorId) fail(403, 'RECIBO_AUTO_ACTOR_DISTINTO', 'Sólo el actor que creó el recibo puede revertir también su decisión P1 automática.')
  const reversals = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,request_hash FROM reversiones_auto_modo_facil
    WHERE recibo_id=CAST(${input.operationId} AS uuid) LIMIT 1 FOR UPDATE
  `)
  const reversal = reversals[0]
  if (!reversal) return null
  if (String(reversal.request_hash) !== requestHash(actorId, input)) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra reversión automática.')
  const legs = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT operacion_b4_reversion_id::text AS operacion_b4_reversion_id
    FROM patas_reversion_auto_modo_facil
    WHERE reversion_id=CAST(${String(reversal.id)} AS uuid) ORDER BY ordinal ASC
  `)
  return { ok: true as const, operationId: input.operationId, noop: true as const, operacionesB4Reversion: legs.map(row => String(row.operacion_b4_reversion_id)) }
}

/** Caller-owned atomic undo helper, including P1 reversal for every receipt leg. */
export async function deshacerAutoPairTx(tx: Prisma.TransactionClient, actorId: number, input: EasyAutoUndoInput) {
  const work = asTx(tx)
  await assertAutoSchema(work)
  const replay = await undoReplayTx(work, actorId, input)
  if (replay) return replay
  const rows = await work.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text AS receipt_id,r.actor_id,p.ordinal,p.movimiento_id,p.operacion_b4_id::text AS operacion_b4_id,o.version_resultante
    FROM recibos_auto_modo_facil r
    JOIN patas_recibo_auto_modo_facil p ON p.recibo_id=r.id
    JOIN operaciones_justificacion_b4 o ON o.id=p.operacion_b4_id
    WHERE r.id=CAST(${input.operationId} AS uuid)
    ORDER BY p.ordinal ASC FOR UPDATE OF r,p,o
  `)
  if (!rows.length) fail(404, 'RECIBO_AUTO_NO_ENCONTRADO', 'La operación automática no conserva patas reversibles.')
  if (exactInteger(rows[0].actor_id, 'actor recibo') !== actorId) fail(403, 'RECIBO_AUTO_ACTOR_DISTINTO', 'Sólo el actor que creó el recibo puede revertir también su decisión P1 automática.')
  const movementIds = rows.map(row => String(row.movimiento_id)).sort()
  for (const movementId of movementIds) {
    await work.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movementId} AS text),0))::text AS locked`)
    const locked = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id=${movementId} FOR UPDATE`)
    if (locked.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'Una pata original ya no existe.')
  }
  const reversalId = randomUUID()
  const reversions: Array<{ original: string; reversed: string; ordinal: number; movementId: string }> = []
  // P1 validates every still-active receipt leg. It must be appended while all
  // original B4 operations are current, then the same outer transaction undoes B4.
  await undoAutoCounterpartyReceiptTx(work, actorId, { autoReceiptId: input.operationId })
  for (const row of rows) {
    const result: any = await deshacerB4Tx(work, actorId, {
      action: 'deshacer', confirmacion: true, idempotencyKey: b4UndoKey(reversalId, String(row.operacion_b4_id)),
      version: exactInteger(row.version_resultante, 'versión B4 original'), operacionId: String(row.operacion_b4_id), lineas: [],
    })
    if (result.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La clave B4 de reversión ya existía fuera de este recibo; no se adopta.')
    reversions.push({ original: String(row.operacion_b4_id), reversed: String(result.operacion.id), ordinal: exactInteger(row.ordinal, 'ordinal'), movementId: String(row.movimiento_id) })
  }
  await work.$executeRaw(Prisma.sql`
    INSERT INTO reversiones_auto_modo_facil (id,recibo_id,actor_id,idempotency_key,request_hash,created_at)
    VALUES (CAST(${reversalId} AS uuid),CAST(${input.operationId} AS uuid),${actorId},CAST(${input.idempotencyKey} AS uuid),${requestHash(actorId,input)},CURRENT_TIMESTAMP)
  `)
  for (const reversal of reversions) {
    await work.$executeRaw(Prisma.sql`
      INSERT INTO patas_reversion_auto_modo_facil (reversion_id,ordinal,operacion_b4_original_id,operacion_b4_reversion_id)
      VALUES (CAST(${reversalId} AS uuid),${reversal.ordinal},CAST(${reversal.original} AS uuid),CAST(${reversal.reversed} AS uuid))
    `)
  }
  return { ok: true as const, operationId: input.operationId, noop: false as const, operacionesB4Reversion: reversions.map(item => item.reversed) }
}

/** Atomic two-leg (or one-leg commission) reversal. */
export async function deshacerAutoPair(actorId: number, raw: unknown) {
  const input = parseEasyAutoInput(raw)
  if (input.action !== 'deshacer') fail(400, 'VALIDATION_ERROR', 'La reversión exige action=deshacer.')
  await requireAutoManager(actorId)
  try {
    return await db().$transaction(tx => deshacerAutoPairTx(tx, actorId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
  } catch (error) { return b4Failure(error) }
}

export async function mutateEasyAutomation(actorId: number, raw: unknown) {
  const input = parseEasyAutoInput(raw)
  if (input.action === 'registrar_politica') return registerPolicy(actorId, input.referenciaAutorizacion)
  if (input.action === 'atestiguar_cuenta') return attestEasyAutoAccount(actorId, input)
  if (input.action === 'ejecutar') return executeEasyAutomation(actorId, input)
  if (input.action === 'deshacer') return deshacerAutoPair(actorId, input)
  fail(400, 'VALIDATION_ERROR', 'Use previsualizar en lectura explícita; no es una mutación.')
}

export function easyAutoErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof PrototypeStagingError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof EasyAutoServiceError) return { status: error.status, body: { error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) } }
  if (error instanceof EasyAutoValidationError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034' || code === '40001') return { status: 409, body: { error: 'Conflicto concurrente; relea y reintente con la misma clave.', codigo: 'CONCURRENT_CONFLICT' } }
  return { status: 500, body: { error: 'No se pudo procesar la automatización restringida.' } }
}
