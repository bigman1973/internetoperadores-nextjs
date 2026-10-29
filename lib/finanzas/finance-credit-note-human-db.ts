import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { trustedImpersonationContextResolutionFromRequest } from '@/lib/impersonation-context'
import { creditLinkLedgerAction, creditLinkStateForAction, parseCreditLinkDecision, type CreditLinkEffectiveState } from './finance-credit-note-human-core'

type Tx = Prisma.TransactionClient & Record<string, any>
type DecisionDb = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'> & Record<string, any>
type DocumentSummary = { number: string; date: string; totalCents: number }
type LinkRow = {
  id: string
  exactReference: string
  legacyState: CreditLinkEffectiveState
  effectiveState: CreditLinkEffectiveState
  createdAt: Date
  originalDocumentNumber: string | null
  originalDocumentDate: Date | null
  originalTotalCents: number | null
  creditDocumentNumber: string | null
  creditDocumentDate: Date | null
  creditTotalCents: number | null
}
type DecisionRow = { id: string; creditLinkId: string; action: string; effectiveState: CreditLinkEffectiveState; reason: string | null; actorRealId: number; actorEffectiveId: number; createdAt: Date }

export class CreditLinkHumanError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}
function fail(status: number, code: string, message: string): never { throw new CreditLinkHumanError(status, code, message) }
function db(): Prisma.TransactionClient & Record<string, any> { return prisma as Prisma.TransactionClient & Record<string, any> }
function sha256(value: unknown): string { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex') }
function iso(value: Date): string { return value.toISOString() }
function validState(value: unknown): value is CreditLinkEffectiveState { return value === 'PROPOSED' || value === 'CONFIRMED' || value === 'REJECTED' }
function asId(value: unknown): string { return typeof value === 'string' ? value : '' }
function safeCents(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) ? value : null }
function documentSummary(number: unknown, date: unknown, totalCents: unknown): DocumentSummary | null {
  return typeof number === 'string' && number.trim() !== '' && date instanceof Date && safeCents(totalCents) !== null
    ? { number, date: iso(date), totalCents: safeCents(totalCents)! }
    : null
}
function publicLink(link: LinkRow) {
  return {
    id: link.id,
    exactReference: typeof link.exactReference === 'string' ? link.exactReference : '',
    legacyState: link.legacyState,
    effectiveState: link.effectiveState,
    createdAt: iso(link.createdAt),
    originalDocument: documentSummary(link.originalDocumentNumber, link.originalDocumentDate, link.originalTotalCents),
    creditDocument: documentSummary(link.creditDocumentNumber, link.creditDocumentDate, link.creditTotalCents),
  }
}

export const creditLinkDecisionSql = {
  tableReady: Prisma.sql`SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema='public' AND table_name='document_version_credit_link_decisions' LIMIT 1`,
  visibleLinks: Prisma.sql`
    SELECT cl.id::text AS id, cl.exact_reference AS "exactReference", cl.state::text AS "legacyState",
      COALESCE(last_decision.effective_state::text, cl.state::text) AS "effectiveState", cl.created_at AS "createdAt",
      original_s.document_number AS "originalDocumentNumber", original_s.document_date AS "originalDocumentDate", original_s.total_cents AS "originalTotalCents",
      credit_s.document_number AS "creditDocumentNumber", credit_s.document_date AS "creditDocumentDate", credit_s.total_cents AS "creditTotalCents"
    FROM document_version_credit_links cl
    LEFT JOIN LATERAL (
      SELECT d.effective_state
      FROM document_version_credit_link_decisions d
      WHERE d.credit_link_id=cl.id
      ORDER BY d.decision_sequence DESC LIMIT 1
    ) last_decision ON TRUE
    LEFT JOIN document_version_lifecycle original_l ON original_l.id=cl.original_lifecycle_id
    LEFT JOIN document_version_snapshots original_s ON original_s.lifecycle_id=original_l.id AND original_s.version_number=original_l.current_version
    LEFT JOIN document_version_lifecycle credit_l ON credit_l.id=cl.credit_lifecycle_id
    LEFT JOIN document_version_snapshots credit_s ON credit_s.lifecycle_id=credit_l.id AND credit_s.version_number=credit_l.current_version
    ORDER BY cl.created_at DESC,cl.id DESC
    LIMIT 201
  `,
}

async function tablesReady(database: DecisionDb): Promise<boolean> {
  const rows = await database.$queryRaw<Array<{ tableName: string | null }>>(creditLinkDecisionSql.tableReady)
  return rows.length === 1 && rows[0]?.tableName === 'document_version_credit_link_decisions'
}

function decisionResult(link: LinkRow, decision: DecisionRow, idempotent: boolean) {
  return {
    idempotent,
    link: { ...publicLink(link), state: decision.effectiveState },
    decision: { id: decision.id, action: decision.action, state: decision.effectiveState, reason: decision.reason, actorRealId: decision.actorRealId, actorEffectiveId: decision.actorEffectiveId, createdAt: iso(decision.createdAt) },
  }
}

export async function readCreditLinkHumanDecisions(database: DecisionDb = db()): Promise<{ migrationReady: boolean; links: Array<ReturnType<typeof publicLink>> }> {
  await assertFinanceRuntimeReady(database)
  if (!await tablesReady(database)) return { migrationReady: false, links: [] }
  const rows = await database.$queryRaw<LinkRow[]>(creditLinkDecisionSql.visibleLinks)
  if (rows.length >= 201) fail(409, 'RECTIFICATIVAS_LISTADO_INCOMPLETO', 'Hay más enlaces rectificativos de los que esta revisión acotada puede mostrar; acote o añada paginación antes de decidir.')
  return {
    migrationReady: true,
    links: rows.flatMap((row) => validState(row.legacyState) && validState(row.effectiveState) && row.createdAt instanceof Date && asId(row.id)
      ? [publicLink(row)]
      : []),
  }
}

function auditActors(actorId: number, resolution: Awaited<ReturnType<typeof trustedImpersonationContextResolutionFromRequest>>) {
  if (resolution.status === 'invalid' || (resolution.status === 'valid' && resolution.context.targetId !== actorId)) fail(403, 'CONTEXTO_ACTUACION_RECTIFICATIVA_INVALIDO', 'La identidad efectiva no coincide con el contexto firmado de actuación.')
  return { actorRealId: resolution.status === 'valid' ? resolution.context.actorId : actorId, actorEffectiveId: actorId }
}

const linkForDecisionSql = (creditLinkId: string) => Prisma.sql`
  SELECT cl.id::text AS id,cl.exact_reference AS "exactReference",cl.state::text AS "legacyState",COALESCE(last_decision.effective_state::text,cl.state::text) AS "effectiveState",cl.created_at AS "createdAt",
    original_s.document_number AS "originalDocumentNumber", original_s.document_date AS "originalDocumentDate", original_s.total_cents AS "originalTotalCents",
    credit_s.document_number AS "creditDocumentNumber", credit_s.document_date AS "creditDocumentDate", credit_s.total_cents AS "creditTotalCents"
  FROM document_version_credit_links cl
  LEFT JOIN LATERAL (SELECT effective_state FROM document_version_credit_link_decisions WHERE credit_link_id=cl.id ORDER BY decision_sequence DESC LIMIT 1) last_decision ON TRUE
  LEFT JOIN document_version_lifecycle original_l ON original_l.id=cl.original_lifecycle_id
  LEFT JOIN document_version_snapshots original_s ON original_s.lifecycle_id=original_l.id AND original_s.version_number=original_l.current_version
  LEFT JOIN document_version_lifecycle credit_l ON credit_l.id=cl.credit_lifecycle_id
  LEFT JOIN document_version_snapshots credit_s ON credit_s.lifecycle_id=credit_l.id AND credit_s.version_number=credit_l.current_version
  WHERE cl.id=CAST(${creditLinkId} AS uuid) LIMIT 2 FOR KEY SHARE OF cl
`

export async function decideCreditLinkHuman(actorId: number, raw: unknown, database: DecisionDb = db()) {
  const parsed = parseCreditLinkDecision(raw)
  if (parsed.ok === false) fail(400, 'VALIDATION_ERROR', parsed.message)
  const input = parsed.value
  const actors = auditActors(actorId, await trustedImpersonationContextResolutionFromRequest())
  await assertFinanceRuntimeReady(database)
  return (database as any).$transaction(async (base: Prisma.TransactionClient) => {
    const tx = base as Tx
    const access = await requireB4ActorAccess(actorId, 'escritura', tx)
    if (!access.ok) fail(403, 'PERMISO_REVOCADO', 'Sin permiso de escritura en conciliación.')
    if (!await tablesReady(tx)) fail(409, 'RECTIFICATIVAS_LEDGER_NO_MIGRADO', 'El registro de decisiones de rectificativas aún no está disponible.')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credit-link-decision:${input.creditLinkId}`},0))::text AS locked`)
    const hash = sha256({ schema: 'CREDIT_LINK_HUMAN_DECISION_V1', input, actors })
    const replay = await tx.$queryRaw<Array<DecisionRow & { payloadHash: string }>>(Prisma.sql`
      SELECT id::text AS id,credit_link_id::text AS "creditLinkId",action::text AS action,effective_state::text AS "effectiveState",reason,
        actor_real_id AS "actorRealId",actor_effective_id AS "actorEffectiveId",created_at AS "createdAt",payload_hash AS "payloadHash"
      FROM document_version_credit_link_decisions
      WHERE actor_real_id=${actors.actorRealId} AND idempotency_key=${input.idempotencyKey}
      LIMIT 2 FOR KEY SHARE
    `)
    if (replay.length) {
      const row = replay[0]
      if (replay.length !== 1 || row.payloadHash !== hash || row.creditLinkId !== input.creditLinkId || !validState(row.effectiveState) || !(row.createdAt instanceof Date)) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave ya se usó con otra decisión.')
      const links = await tx.$queryRaw<LinkRow[]>(linkForDecisionSql(input.creditLinkId))
      if (links.length !== 1) fail(404, 'ENLACE_RECTIFICATIVA_NO_ENCONTRADO', 'El enlace rectificativo no existe.')
      return decisionResult(links[0], row, true)
    }
    const links = await tx.$queryRaw<LinkRow[]>(linkForDecisionSql(input.creditLinkId))
    const link = links[0]
    if (links.length !== 1 || !link || !validState(link.effectiveState)) fail(404, 'ENLACE_RECTIFICATIVA_NO_ENCONTRADO', 'El enlace rectificativo no existe o no es válido.')
    if ((input.action === 'confirmar' || input.action === 'rechazar') && link.effectiveState !== 'PROPOSED') fail(409, 'ENLACE_EXIGE_DESHACER', 'El enlace ya tiene una decisión vigente; primero debe deshacerla.')
    if (input.action === 'deshacer' && link.effectiveState === 'PROPOSED') fail(409, 'ENLACE_YA_PROPUESTO', 'El enlace ya está propuesto y no tiene una decisión vigente que deshacer.')
    const state = creditLinkStateForAction(input.action)
    const decision: DecisionRow = { id: randomUUID(), creditLinkId: input.creditLinkId, action: creditLinkLedgerAction(input.action), effectiveState: state, reason: input.reason ?? null, actorRealId: actors.actorRealId, actorEffectiveId: actors.actorEffectiveId, createdAt: new Date() }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO document_version_credit_link_decisions (id,credit_link_id,action,effective_state,reason,actor_real_id,actor_effective_id,idempotency_key,payload_hash,created_at)
      VALUES (CAST(${decision.id} AS uuid),CAST(${decision.creditLinkId} AS uuid),CAST(${decision.action} AS "DocumentVersionCreditLinkDecisionAction"),CAST(${decision.effectiveState} AS "DocumentVersionCreditLinkEffectiveState"),${decision.reason},${decision.actorRealId},${decision.actorEffectiveId},${input.idempotencyKey},${hash},${decision.createdAt})
    `)
    return decisionResult(link, decision, false)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
}
