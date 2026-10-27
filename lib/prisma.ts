import { AsyncLocalStorage } from 'node:async_hooks'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  trustedImpersonationContextResolutionFromRequest,
  type SignedImpersonationContextResolution,
  type TrustedImpersonationContext,
} from '@/lib/impersonation-context'
import { impersonationActorListed, impersonationEnabled, impersonationRequestAllowed } from '@/lib/impersonation-policy'

// La copia de Finanzas nunca debe reconectar a producción por un override ausente.
if (process.env.FINANCE_STAGING_SANDBOX === '1') {
  let isolated = false
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    isolated = url.pathname === '/io_staging_finanzas' && url.username === 'io_staging_finanzas'
  } catch { /* fail closed, sin imprimir credenciales */ }
  if (!isolated) throw new Error('Staging Finanzas bloqueado: conexión no aislada')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  // Los errores SQL pueden incluir la fila completa, incluso durante un rollback.
  // En el sandbox financiero sólo se exponen los códigos minimizados del servicio.
  log: process.env.FINANCE_STAGING_SANDBOX === '1' ? [] : process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})
// Next server chunks can evaluate this module independently in production.
// Persisting the client prevents a global "installed" marker from accidentally
// referring to another PrismaClient that never received the guard.
globalForPrisma.prisma = prisma

const PRISMA_IMPERSONATION_GUARD_STATE = Symbol.for('internetoperadores.impersonation.prisma.guard-state.v1')
type PrismaGuardState = { transactionWrapperInstalled: boolean; middlewareInstalled: boolean }
type InstrumentablePrismaClient = PrismaClient & { [PRISMA_IMPERSONATION_GUARD_STATE]?: PrismaGuardState }

function guardStateFor(client: PrismaClient): PrismaGuardState {
  const instrumentable = client as InstrumentablePrismaClient
  const current = instrumentable[PRISMA_IMPERSONATION_GUARD_STATE]
  if (current) return current
  const state: PrismaGuardState = { transactionWrapperInstalled: false, middlewareInstalled: false }
  Object.defineProperty(instrumentable, PRISMA_IMPERSONATION_GUARD_STATE, {
    value: state,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return state
}

/** Internal ledger queries must never recursively invoke the delegated guard. */
const auditScope = new AsyncLocalStorage<boolean>()
/** The callback wrapper below makes this client available to Prisma $use. */
const transactionScope = new AsyncLocalStorage<Prisma.TransactionClient>()

export function currentImpersonationTransactionClient(): Prisma.TransactionClient | null {
  return transactionScope.getStore() ?? null
}

/**
 * Scope only a transaction client, never a request identity. Exported so the
 * nested-transaction behaviour can be unit-tested without a request override
 * or a database connection.
 */
export function runWithImpersonationTransactionClient<T>(
  tx: Prisma.TransactionClient,
  callback: () => T,
): T {
  return transactionScope.run(tx, callback)
}

/**
 * Prisma middleware does not itself expose the interactive transaction client.
 * Wrap callback transactions once so a business receipt written after next()
 * uses the exact same PostgreSQL transaction and rolls back with the mutation.
 */
function installImpersonationTransactionWrapper(client: PrismaClient): void {
  const state = guardStateFor(client)
  if (state.transactionWrapperInstalled) return
  const baseTransaction = client.$transaction.bind(client)
  ;(client as unknown as {
    $transaction: PrismaClient['$transaction']
  }).$transaction = ((input: unknown, ...rest: unknown[]) => {
    if (typeof input !== 'function') return (baseTransaction as any)(input, ...rest)
    const callback = input as (tx: Prisma.TransactionClient) => unknown
    return (baseTransaction as any)(
      (tx: Prisma.TransactionClient) => runWithImpersonationTransactionClient(tx, () => callback(tx)),
      ...rest,
    )
  }) as PrismaClient['$transaction']
  state.transactionWrapperInstalled = true
}

const MODEL_MUTATIONS = new Set([
  'create', 'createOne', 'createMany', 'createManyAndReturn', 'update',
  'updateOne', 'updateMany', 'upsert', 'upsertOne', 'delete', 'deleteOne',
  'deleteMany',
])
const RAW_ACTIONS = new Set([
  // Prisma 5 $use emits executeRaw/queryRaw. Retain aliases for pure callers.
  'executeRaw', 'executeRawUnsafe', 'queryRaw', 'queryRawUnsafe',
  '$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe',
])

export type RawSqlClassification = 'mutating' | 'read_only' | 'unknown'

/**
 * Finer classification used by the delegated guard:
 *   read_only             plain SELECT/WITH-SELECT using only reviewed pure functions
 *   row_lock              the same grammar plus FOR UPDATE/SHARE row locks
 *   advisory_lock         the exact reviewed transaction-scoped advisory lock form
 *   transaction_read_only the exact zero-parameter `SET TRANSACTION READ ONLY`
 *   mutating              INSERT/UPDATE/DELETE/MERGE (directly or in a CTE)
 *   unknown               everything else, including DDL and session commands
 */
export type RawSqlStatementKind =
  | 'read_only'
  | 'row_lock'
  | 'advisory_lock'
  | 'transaction_read_only'
  | 'mutating'
  | 'unknown'

/**
 * Prisma 5 gives $use one of these exact raw shapes:
 *
 *   tagged raw template             -> [string[], ...values]
 *   $queryRaw(Prisma.sql`...`)      -> [Prisma.Sql]
 *   $queryRawUnsafe(sql, ...values) -> [sql, ...values]
 *
 * Values are parameters, not SQL. In particular, never concatenate or inspect
 * them when deciding whether the statement writes. Any other shape is unknown.
 */
function prisma5RawSqlTemplate(args: unknown): string | null {
  if (!Array.isArray(args) || args.length < 1) return null
  const [statement] = args
  if (typeof statement === 'string') return statement
  if (Array.isArray(statement) && statement.every(part => typeof part === 'string')) return statement.join('?')
  // Prisma 5 preserves Prisma.Sql as the sole middleware argument for its
  // `prisma.$queryRaw(Prisma.sql`...`)` overload. Accept only this bounded
  // shape and its string parts; `values` are intentionally never examined.
  if (args.length === 1 && statement && typeof statement === 'object') {
    const sql = statement as { strings?: unknown }
    if (Array.isArray(sql.strings) && sql.strings.every(part => typeof part === 'string')) return sql.strings.join('?')
  }
  return null
}

/** Compatibility extractor for pure callers only; middleware always uses the exact Prisma 5 extractor above. */
function standaloneRawSqlTemplate(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    if (Array.isArray(value[0]) && value[0].every(part => typeof part === 'string')) return value[0].join('?')
    if (value.every(part => typeof part === 'string')) return value.join('?')
    return null
  }
  if (!value || typeof value !== 'object') return null
  const candidate = value as { strings?: unknown; query?: unknown; sql?: unknown }
  if (Array.isArray(candidate.strings) && candidate.strings.every(part => typeof part === 'string')) return candidate.strings.join('?')
  if (typeof candidate.query === 'string') return candidate.query
  if (typeof candidate.sql === 'string') return candidate.sql
  return null
}

type SqlToken = Readonly<{ kind: 'ident' | 'quoted' | 'string' | 'number' | 'param' | 'op' | 'punct'; value: string }>

/**
 * Lexes only the developer-authored SQL template (bound values never enter).
 * Anything outside a small, unambiguous lexical subset returns null and is
 * therefore unknown: comments, `;`, dollar quoting, backslashes outside
 * literals, prefixed literals (E'', U&'', B'', X'') and typed literals glued to
 * an identifier. standard_conforming_strings keeps backslashes literal inside
 * ordinary '...' strings, so those strings are safely skipped as data.
 */
function tokenizeReviewedSql(source: string): SqlToken[] | null {
  const tokens: SqlToken[] = []
  const length = source.length
  let index = 0
  while (index < length) {
    const char = source[index]
    if (/\s/.test(char)) { index += 1; continue }
    if (char === ';' || char === '\\') return null
    if ((char === '-' && source[index + 1] === '-') || (char === '/' && source[index + 1] === '*')) return null
    if (char === "'" || char === '"') {
      const previous = index > 0 ? source[index - 1] : ''
      if (/[A-Za-z0-9_&$]/.test(previous)) return null
      let end = index + 1
      for (;;) {
        if (end >= length) return null
        // No reviewed template needs a backslash. Rejecting it avoids relying on
        // the server's standard_conforming_strings setting for literal bounds.
        if (source[end] === '\\') return null
        if (source[end] === char) {
          if (source[end + 1] === char) { end += 2; continue }
          break
        }
        end += 1
      }
      tokens.push(char === "'" ? { kind: 'string', value: "''" } : { kind: 'quoted', value: source.slice(index, end + 1) })
      index = end + 1
      continue
    }
    if (char === '$') {
      const positional = /^\$[0-9]+/.exec(source.slice(index))
      if (!positional) return null
      tokens.push({ kind: 'param', value: '?' })
      index += positional[0].length
      continue
    }
    if (char === '?') { tokens.push({ kind: 'param', value: '?' }); index += 1; continue }
    if (/[A-Za-z_]/.test(char)) {
      const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(source.slice(index))![0]
      tokens.push({ kind: 'ident', value: word.toLowerCase() })
      index += word.length
      continue
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] ?? ''))) {
      const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(source.slice(index))![0]
      tokens.push({ kind: 'number', value: number })
      index += number.length
      continue
    }
    if ('(),[].'.includes(char)) { tokens.push({ kind: 'punct', value: char }); index += 1; continue }
    if (char === ':' && source[index + 1] === ':') { tokens.push({ kind: 'op', value: '::' }); index += 2; continue }
    const operator = /^[+\-*/<>=~!@#%^&|`:]+/.exec(source.slice(index))
    if (!operator || operator[0].includes('--') || operator[0].includes('/*')) return null
    tokens.push({ kind: 'op', value: operator[0] })
    index += operator[0].length
  }
  return tokens
}

const BUSINESS_DML = new Set(['insert', 'update', 'delete', 'merge'])
/** DDL, privilege, session, transaction-control and side-channel commands are never delegated. */
const FORBIDDEN_SQL_WORDS = new Set([
  'alter', 'create', 'drop', 'truncate', 'reindex', 'vacuum', 'analyze', 'grant', 'revoke', 'comment',
  'call', 'do', 'copy', 'listen', 'notify', 'unlisten', 'lock', 'set', 'reset', 'discard', 'prepare',
  'execute', 'deallocate', 'begin', 'commit', 'rollback', 'savepoint', 'release', 'into', 'refresh',
  'cluster', 'checkpoint', 'load', 'import', 'explain', 'security',
])
/** SQL syntax that is followed by `(` but is not a function invocation. */
const NON_CALL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'exists', 'any', 'all', 'some', 'on', 'using',
  'join', 'lateral', 'as', 'materialized', 'filter', 'over', 'within', 'group', 'by', 'having', 'limit',
  'offset', 'union', 'intersect', 'except', 'when', 'then', 'else', 'case', 'like', 'ilike', 'between',
  'distinct', 'values', 'array', 'row', 'is',
])
/**
 * Functions observed in the reviewed Modo fácil / Para pedir SQL. Each was
 * verified in staging pg_proc on 24/10/2026: pg_catalog, not SECURITY DEFINER,
 * IMMUTABLE/STABLE (no writes). public.b4_importe_bancario_centimos is LANGUAGE
 * sql IMMUTABLE STRICT with a CASE/numeric-cast body only. coalesce, nullif,
 * greatest, least, cast, extract and trim are SQL syntax, not catalog lookups.
 * Volatile, lock, configuration and I/O functions are deliberately absent.
 */
const REVIEWED_READ_FUNCTIONS = new Set([
  'abs', 'array_agg', 'array_remove', 'b4_importe_bancario_centimos', 'bool_and', 'btrim', 'concat_ws',
  'count', 'current_database', 'date_trunc', 'hashtextextended', 'json_agg', 'jsonb_build_object',
  // pg_catalog IMMUTABLE, no SECURITY DEFINER: verificado en staging el 26/10.
  'jsonb_array_elements', 'jsonb_typeof',
  'length', 'lower', 'max', 'min', 'regexp_replace', 'right', 'row_to_json', 'sum', 'to_regclass',
  'unnest', 'upper', 'coalesce', 'nullif', 'greatest', 'least', 'cast', 'extract', 'trim',
])
/** Only type modifiers such as numeric(12,2) may follow `::` with parentheses. */
const TYPE_MODIFIER_TYPES = new Set(['numeric', 'decimal', 'varchar', 'char', 'character', 'bit', 'varbit', 'timestamp', 'timestamptz', 'time', 'timetz', 'interval'])
/** The exact transaction-scoped advisory lock emitted by the reviewed helpers. */
const REVIEWED_ADVISORY_LOCK = /^select pg_advisory_xact_lock \( hashtextextended \( (?:cast \( \? as text \)|\?) , 0 \) \) :: text as locked$/

function canonicalTokens(tokens: readonly SqlToken[]): string {
  return tokens.map(token => token.kind === 'string' ? "''" : token.value).join(' ')
}

/**
 * `AS t(a, b)` alias columns and `numeric(12,2)` type modifiers are the only
 * parenthesised forms after AS/:: that are not function calls. The contents
 * are checked exactly: identifiers/commas for aliases, integers for modifiers.
 */
function parenthesisedListIs(tokens: readonly SqlToken[], open: number, accepts: (token: SqlToken) => boolean): boolean {
  let index = open + 1
  let sawItem = false
  for (; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.kind === 'punct' && token.value === ')') return sawItem
    if (token.kind === 'punct' && token.value === ',') continue
    if (!accepts(token)) return false
    sawItem = true
  }
  return false
}

/** Removes `FOR UPDATE|NO KEY UPDATE|SHARE|KEY SHARE [OF a, b] [NOWAIT|SKIP LOCKED]`. */
function withoutRowLockClauses(tokens: readonly SqlToken[]): { body: SqlToken[]; locked: boolean } | null {
  const body: SqlToken[] = []
  let locked = false
  const word = (offset: number) => tokens[offset]?.kind === 'ident' ? tokens[offset].value : null
  for (let index = 0; index < tokens.length; index += 1) {
    if (word(index) !== 'for') { body.push(tokens[index]); continue }
    let cursor = index + 1
    if (word(cursor) === 'update' || word(cursor) === 'share') cursor += 1
    else if (word(cursor) === 'no' && word(cursor + 1) === 'key' && word(cursor + 2) === 'update') cursor += 3
    else if (word(cursor) === 'key' && word(cursor + 1) === 'share') cursor += 2
    else return null
    if (word(cursor) === 'of') {
      cursor += 1
      for (;;) {
        if (tokens[cursor]?.kind !== 'ident' && tokens[cursor]?.kind !== 'quoted') return null
        cursor += 1
        if (tokens[cursor]?.kind === 'punct' && tokens[cursor].value === ',') { cursor += 1; continue }
        break
      }
    }
    if (word(cursor) === 'nowait') cursor += 1
    else if (word(cursor) === 'skip' && word(cursor + 1) === 'locked') cursor += 2
    locked = true
    index = cursor - 1
  }
  return { body, locked }
}

function classifySqlStatement(template: string | null): RawSqlStatementKind {
  if (!template) return 'unknown'
  const tokens = tokenizeReviewedSql(template)
  if (!tokens || tokens.length === 0) return 'unknown'
  // Sólo este literal de control de snapshot: no habilita current_setting con
  // parámetros, nombres diferentes, expresiones adicionales ni varias órdenes.
  if (/^\s*SELECT\s+lower\s*\(\s*current_setting\s*\(\s*'transaction_isolation'\s*\)\s*\)\s+AS\s+isolation\s*$/i.test(template)) return 'read_only'
  const canonical = canonicalTokens(tokens)
  if (canonical === 'set transaction read only') return 'transaction_read_only'
  if (REVIEWED_ADVISORY_LOCK.test(canonical)) return 'advisory_lock'
  const first = tokens[0]
  if (first.kind === 'ident' && BUSINESS_DML.has(first.value)) return 'mutating'
  const startsAsQuery = (first.kind === 'ident' && (first.value === 'select' || first.value === 'with'))
    || (first.kind === 'punct' && first.value === '(')
  if (!startsAsQuery) return 'unknown'
  const stripped = withoutRowLockClauses(tokens)
  if (!stripped) return 'unknown'
  const { body, locked } = stripped
  const isReference = (offset: number) => body[offset - 1]?.kind === 'punct' && body[offset - 1].value === '.'
  if (first.kind === 'ident' && first.value === 'with'
    && body.some((token, offset) => token.kind === 'ident' && BUSINESS_DML.has(token.value) && !isReference(offset))) {
    // A data-modifying CTE is a write and keeps the audited write path.
    return 'mutating'
  }
  for (let offset = 0; offset < body.length; offset += 1) {
    const token = body[offset]
    const next = body[offset + 1]
    const callsNext = next?.kind === 'punct' && next.value === '('
    if (token.kind === 'quoted') {
      if (callsNext) return 'unknown'
      continue
    }
    if (token.kind !== 'ident') continue
    if (isReference(offset)) {
      // Column reference (alias.column). A schema-qualified call is never reviewed.
      if (callsNext) return 'unknown'
      continue
    }
    if (BUSINESS_DML.has(token.value) || FORBIDDEN_SQL_WORDS.has(token.value)) return 'unknown'
    if (!callsNext) continue
    const previous = body[offset - 1]
    if (previous?.kind === 'op' && previous.value === '::') {
      if (!TYPE_MODIFIER_TYPES.has(token.value) || !parenthesisedListIs(body, offset + 1, item => item.kind === 'number' && /^[0-9]+$/.test(item.value))) return 'unknown'
      continue
    }
    // After AS only an alias column list or a CAST target type can follow.
    if (previous?.kind === 'ident' && previous.value === 'as') {
      const exact = TYPE_MODIFIER_TYPES.has(token.value)
        ? parenthesisedListIs(body, offset + 1, item => item.kind === 'number' && /^[0-9]+$/.test(item.value))
        : parenthesisedListIs(body, offset + 1, item => item.kind === 'quoted' || (item.kind === 'ident' && !FORBIDDEN_SQL_WORDS.has(item.value) && !BUSINESS_DML.has(item.value)))
      if (!exact) return 'unknown'
      continue
    }
    if (NON_CALL_KEYWORDS.has(token.value) || REVIEWED_READ_FUNCTIONS.has(token.value)) continue
    return 'unknown'
  }
  return locked ? 'row_lock' : 'read_only'
}

function classifySqlTemplate(template: string | null): RawSqlClassification {
  const kind = classifySqlStatement(template)
  // Locks and transaction settings are neither plain reads nor business writes.
  return kind === 'read_only' || kind === 'mutating' ? kind : 'unknown'
}

/** Detailed classification of the real Prisma 5 $use raw argument array. */
export function classifyPrisma5RawSqlStatement(args: unknown): RawSqlStatementKind {
  return classifySqlStatement(prisma5RawSqlTemplate(args))
}

/** Classify the real Prisma 5 $use raw argument array, including bound parameters. */
export function classifyPrisma5RawSqlArgs(args: unknown): RawSqlClassification {
  return classifySqlTemplate(prisma5RawSqlTemplate(args))
}

/**
 * Legacy pure predicate retained for existing static callers. It is not used as
 * the impersonation middleware policy, because arbitrary values are not a
 * trustworthy representation of Prisma middleware arguments.
 */
export function rawSqlLooksMutating(value: unknown): boolean {
  return classifySqlTemplate(standaloneRawSqlTemplate(value)) === 'mutating'
}

export function impersonationPrismaMutation(action: string, args: unknown): boolean {
  if (MODEL_MUTATIONS.has(action)) return true
  return RAW_ACTIONS.has(action) && rawSqlLooksMutating(args)
}

/** Delegated writes need the reviewed environment, its switch and a listed real actor. */
function delegatedWritesEnabledFor(actorId: number): boolean {
  return impersonationEnabled(process.env) && impersonationActorListed(actorId, process.env)
}

type LiveContext = TrustedImpersonationContext

type PrismaMutationParams = Readonly<{
  action: string
  args: unknown
  model?: string | null
}>

type LiveContextVerifier = (context: LiveContext, tx: Prisma.TransactionClient) => Promise<boolean>
type MutationSuccessAppender = (
  tx: Prisma.TransactionClient,
  context: LiveContext,
  model: string | undefined,
  action: string,
) => Promise<void>

/**
 * Server-side live check used immediately before a delegated write. A parsed
 * MAC is intentionally insufficient: this checks staging scope, the reviewed
 * request matrix, expiry/exit, and the current actor/target records in the
 * caller's already-open transaction.
 */
export async function verifyLiveImpersonationContext(
  context: LiveContext,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  if (!delegatedWritesEnabledFor(context.actorId) || !impersonationRequestAllowed(context.path, context.method, new URLSearchParams(), context.targetId, context.action)) return false
  try {
    // FOR SHARE prevents a concurrent explicit exit (FOR UPDATE OF s) from
    // closing this effective session between the final ledger check and the
    // business mutation. It is released only with that mutation's transaction.
    // PrismaPromise is lazy: it must be awaited before leaving auditScope,
    // otherwise its middleware sees the outer scope and recursively checks itself.
    const rows = await auditScope.run(true, async () => await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT s.id::text
        FROM impersonation_sessions s
        JOIN usuarios_admin actor ON actor.id=s.actor_id
        JOIN usuarios_admin target ON target.id=s.target_id
       WHERE s.id=${context.sessionId}::uuid AND s.actor_id=${context.actorId} AND s.target_id=${context.targetId}
         AND s.expires_at>CURRENT_TIMESTAMP AND NOT EXISTS (SELECT 1 FROM impersonation_session_ends e WHERE e.session_id=s.id)
         AND actor.activo=true AND actor.rol::text='SUPER_ADMIN'
         AND target.activo=true AND target.rol::text<>'SUPER_ADMIN'
         AND NOT ('SUPER_ADMIN'=ANY(COALESCE(target.roles,ARRAY[]::text[])))
       LIMIT 1 FOR SHARE OF s
    `))
    return rows.length === 1
  } catch { return false }
}

async function appendMutationSuccess(
  tx: Prisma.TransactionClient,
  context: LiveContext,
  model: string | undefined,
  action: string,
): Promise<void> {
  // This receipt is deliberately after next() but before the interactive
  // transaction commits. Thus it is never emitted for a failed mutation and is
  // rolled back if the callback later fails or the transaction cannot commit.
  await auditScope.run(true, async () => await tx.$executeRaw(Prisma.sql`
    INSERT INTO impersonation_event_log
      (id,session_id,actor_id,target_id,kind,outcome,method,path,ip,reason,model,operation,detail,created_at)
    VALUES
      (gen_random_uuid(),${context.sessionId}::uuid,${context.actorId},${context.targetId},'BUSINESS_MUTATION','SUCCESS',
       ${context.method},${context.path},${context.ip},${context.reason},${model?.slice(0, 120) ?? 'RAW'},${action.slice(0, 80)},
       ${JSON.stringify({ source: 'prisma-middleware', action: context.action, ipSource: context.ipSource })}::jsonb,CURRENT_TIMESTAMP)
  `))
}

export type PrismaImpersonationGuardOptions = Readonly<{
  /** Resolution of the actual signed request header; this is never client input. */
  requestContext: SignedImpersonationContextResolution
  /** Interactive transaction located through the callback transaction ALS scope. */
  transaction: Prisma.TransactionClient | null
  /** Test seam only: production uses verifyLiveImpersonationContext. */
  verifyLiveContext?: LiveContextVerifier
  /** Test seam only: production writes the transactional SUCCESS receipt. */
  appendSuccess?: MutationSuccessAppender
}>

/**
 * The policy core used by the installed Prisma middleware. It accepts an
 * already-resolved server context instead of exposing any request-context
 * override. Tests can therefore exercise exactly this control flow with a pure
 * transaction-client/logger mock, while production always supplies the signed
 * header resolution and the live ledger verifier below.
 */
export async function guardPrismaImpersonationMutation<T>(
  params: PrismaMutationParams,
  next: () => Promise<T>,
  options: PrismaImpersonationGuardOptions,
): Promise<T> {
  const isModelMutation = MODEL_MUTATIONS.has(params.action)
  const isRawAction = RAW_ACTIONS.has(params.action)
  if (!isModelMutation && !isRawAction) return next()

  const rawKind = isRawAction ? classifyPrisma5RawSqlStatement(params.args) : null
  if (options.requestContext.status === 'invalid') {
    // A same-name header is meaningful only when an acting request should have
    // been forwarded. Never turn a failed MAC/parser result into normal traffic.
    throw new Error('IMPERSONATION_WRITE_CONTEXT_INVALID')
  }
  if (options.requestContext.status === 'absent') return next()

  const context = options.requestContext.context
  const tx = options.transaction
  if (isRawAction) {
    if (rawKind === 'read_only') return next()
    if (rawKind === 'transaction_read_only') {
      // Only ever restricts the current transaction. It must be its first
      // statement, so the FOR SHARE live verifier deliberately does not run.
      if (!tx) throw new Error('IMPERSONATION_WRITE_TRANSACTION_REQUIRED')
      return next()
    }
    if (rawKind === 'row_lock' || rawKind === 'advisory_lock') {
      // Locks precede a reviewed write. They need the live ledger check in the
      // same transaction but are not business mutations: no SUCCESS receipt.
      if (!tx) throw new Error('IMPERSONATION_WRITE_TRANSACTION_REQUIRED')
      const verifyLock = options.verifyLiveContext ?? verifyLiveImpersonationContext
      if (!await verifyLock(context, tx)) throw new Error('IMPERSONATION_WRITE_DENIED')
      return next()
    }
    if (rawKind !== 'mutating') {
      // Unknown includes unreviewed functions, DDL, session commands, comments,
      // multi-statements and malformed Prisma raw args.
      throw new Error('IMPERSONATION_RAW_SQL_UNREVIEWED')
    }
  }

  if (!tx) throw new Error('IMPERSONATION_WRITE_TRANSACTION_REQUIRED')
  const verify = options.verifyLiveContext ?? verifyLiveImpersonationContext
  if (!await verify(context, tx)) throw new Error('IMPERSONATION_WRITE_DENIED')

  const result = await next()
  const append = options.appendSuccess ?? appendMutationSuccess
  await append(tx, context, params.model ?? undefined, params.action)
  return result
}

type PrismaMiddlewareInstallTarget = Pick<PrismaClient, '$use'>

/**
 * Install only on the supplied PrismaClient instance. The client-attached state
 * means that a second Next chunk cannot inherit a true global flag while using
 * an uninstrumented client. It deliberately has no request-context override:
 * production always resolves the signed server header below.
 */
export function installImpersonationPrismaGuard(
  client: PrismaMiddlewareInstallTarget & PrismaClient,
): void {
  const state = guardStateFor(client)
  installImpersonationTransactionWrapper(client)
  if (state.middlewareInstalled) return
  client.$use(async (params, next) => {
    if (auditScope.getStore()) return next(params)
    const isRelevant = MODEL_MUTATIONS.has(params.action) || RAW_ACTIONS.has(params.action)
    if (!isRelevant) return next(params)
    return guardPrismaImpersonationMutation(
      { action: params.action, args: params.args, model: params.model },
      () => next(params),
      {
        requestContext: await trustedImpersonationContextResolutionFromRequest(),
        transaction: currentImpersonationTransactionClient(),
      },
    )
  })
  state.middlewareInstalled = true
}

/**
 * The guard runs before every generated model mutation and every raw statement.
 * Delegated writes require an interactive transaction. Raw SQL that cannot be
 * classified as a small reviewed read grammar is denied rather than treated as
 * ordinary traffic; normal requests with no acting header retain their existing
 * Prisma behaviour.
 */
installImpersonationPrismaGuard(prisma)

export default prisma
