/*
 * Compuerta SQL real B: tombstone Delta positivo -> lifecycle -> refresh Conciliar -> cursor.
 *
 * Uso explícito y limitado (desde el árbol integrado):
 *   B_PUBLIC_REAL_ROLLBACK_TEST=1 ./node_modules/.bin/tsx scripts/test-graph-delta-tombstone-postgres.ts
 *
 * Sólo conecta por el socket privado autorizado. Mantiene el lock documental de
 * sesión, abre una única transacción SERIALIZABLE y termina siempre con ROLLBACK.
 * No usa tablas TEMP, no altera triggers y no hace Graph/OCR/red/sync.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { Prisma } from '@prisma/client'
import {
  AesGcmGraphDeltaCursorCipher,
  PrismaGraphDeltaVersionStore,
} from '../lib/finanzas/graph-delta-prisma-store'
import { GRAPH_DELTA_CURSOR_SCHEMA, type GraphDeltaPageCommit } from '../lib/finanzas/graph-delta-adapter'

const ROOT = resolve(__dirname, '..')
const PRIVATE_CONFIG = '/home/ubuntu/conciliar-cierre-20261029/privado/local-admin-db.json'
const RECEIPT_PATH = '/home/ubuntu/conciliar-documentos-20261029/equipos/integracion/b-public-real.json'
const REPORT_PATH = '/home/ubuntu/conciliar-documentos-20261029/equipos/integracion/b-public-real.md'
const PRIVATE_DIAGNOSTIC_PATH = '/tmp/b-public-real-private-diagnostic.json'
const SESSION_LOCK = 'documental-candidate-db-tests'
const SERVICE_ROLE = 'io_staging_finanzas'
const EXPECTED_DATABASE = 'io_staging_finanzas'
const EXPECTED_PORT = 55440
const PRIVATE_SOCKET_PREFIX = '/home/ubuntu/conciliar-cierre-20261029/privado/'
const TAG = `B-PUBLIC-REAL-${randomUUID()}`
const SOURCE_KEY = `source-${randomUUID()}`
const DRIVE_ID = `drive-${randomUUID().replaceAll('-', '')}`
const ITEM_ONE = `item-${randomUUID().replaceAll('-', '')}`
const ITEM_TWO = `item-${randomUUID().replaceAll('-', '')}`
const ITEM_CONTROL = `item-${randomUUID().replaceAll('-', '')}`
const INVOICE_ONE = `invoice-${randomUUID()}`
const INVOICE_TWO = `invoice-${randomUUID()}`
const INVOICE_CONTROL = `invoice-${randomUUID()}`
const PAGE_ONE = sha(`page-one:${TAG}`)
const PAGE_TWO = sha(`page-two:${TAG}`)
const EVENT_ONE = sha(`event-one:${TAG}`)
const EVENT_TWO = sha(`event-two:${TAG}`)
const LEASE = `lease-${randomUUID()}`
const SOURCE_FINGERPRINT = sha(`projection-source:${TAG}`)

const FINGERPRINT_TABLES = [
  'facturas_recibidas', 'facturas_emitidas', 'movimientos_bancarios', 'cuentas_bancarias',
  'document_version_lifecycle', 'document_version_snapshots', 'document_version_artifacts',
  'confirming_reading_attempts', 'finance_sync_jobs_p2', 'finance_sync_items_p2',
  'finance_graph_delta_topology', 'finance_graph_delta_events', 'conciliar_proyecciones',
  'estado_proyeccion_conciliar',
] as const

type PrivateConfig = Readonly<{ host: string; port: number; user: string; database: string; password?: string; ssl?: boolean }>
type Fingerprint = Readonly<{ table: string; count: string; digest: string }>
type ProjectionRow = Readonly<{ id: string; color: string; seleccionable: boolean; lifecycleVersion: string | null; fingerprint: string }>
type ProjectionState = Readonly<{ dirtyAt: Date | null; dirtyReason: string | null; version: bigint | number }>
type PgTx = {
  $queryRaw<T = unknown>(input: unknown, ...values: unknown[]): Promise<T>
  $executeRaw(input: unknown, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(text: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(text: string, ...values: unknown[]): Promise<number>
}

class RollbackScenario extends Error { constructor() { super('B_PUBLIC_REAL_ROLLBACK') } }

function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function invariant(value: unknown, code: string): asserts value { assert.ok(value, code) }
function equal<T>(actual: T, expected: T, code: string): asserts actual is T { assert.equal(actual, expected, code) }
function safeCode(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  return /^[A-Z0-9_]{2,96}$/.test(code) ? code : 'B_PUBLIC_REAL_FAILED'
}
function config(): PrivateConfig {
  const parsed = JSON.parse(readFileSync(PRIVATE_CONFIG, 'utf8')) as Partial<PrivateConfig>
  invariant(typeof parsed.host === 'string' && parsed.host.startsWith(PRIVATE_SOCKET_PREFIX), 'B_PUBLIC_REAL_SOCKET_REJECTED')
  equal(parsed.port, EXPECTED_PORT, 'B_PUBLIC_REAL_PORT_REJECTED')
  equal(parsed.database, EXPECTED_DATABASE, 'B_PUBLIC_REAL_DATABASE_REJECTED')
  invariant(typeof parsed.user === 'string' && parsed.user.length > 0, 'B_PUBLIC_REAL_USER_REJECTED')
  return { host: parsed.host, port: parsed.port, user: parsed.user, database: parsed.database, password: parsed.password ?? '', ssl: false }
}

/** Converts only Prisma tagged SQL into pg calls bound to the outer rollback connection. */
function pgStatement(input: unknown, values: readonly unknown[]): Readonly<{ text: string; values: readonly unknown[] }> {
  const sql = Array.isArray(input) && Object.prototype.hasOwnProperty.call(input, 'raw')
    ? Prisma.sql(input as unknown as TemplateStringsArray, ...values)
    : input
  invariant(!!sql && typeof sql === 'object', 'B_PUBLIC_REAL_SQL_INVALID')
  const candidate = sql as { text?: unknown; values?: unknown }
  invariant(typeof candidate.text === 'string' && Array.isArray(candidate.values), 'B_PUBLIC_REAL_SQL_INVALID')
  return { text: candidate.text, values: candidate.values }
}

/** Nested repository/store transactions become serialized savepoints inside the mandatory outer rollback. */
class RollbackTxClient implements PgTx {
  private savepoint = 0
  private tail: Promise<void> = Promise.resolve()
  constructor(private readonly client: Client) {}
  async $queryRaw<T = unknown>(input: unknown, ...values: unknown[]): Promise<T> {
    const statement = pgStatement(input, values)
    return (await this.client.query(statement.text, [...statement.values])).rows as T
  }
  async $executeRaw(input: unknown, ...values: unknown[]): Promise<number> {
    const statement = pgStatement(input, values)
    return (await this.client.query(statement.text, [...statement.values])).rowCount ?? 0
  }
  async $queryRawUnsafe<T = unknown>(text: string, ...values: unknown[]): Promise<T> {
    return (await this.client.query(text, values as unknown[])).rows as T
  }
  async $executeRawUnsafe(text: string, ...values: unknown[]): Promise<number> {
    return (await this.client.query(text, values as unknown[])).rowCount ?? 0
  }
  $transaction<T>(work: (tx: RollbackTxClient) => Promise<T>, _options?: unknown): Promise<T> {
    const run = async (): Promise<T> => {
      const savepoint = `b_public_real_nested_${++this.savepoint}`
      await this.client.query(`SAVEPOINT ${savepoint}`)
      try {
        const value = await work(this)
        await this.client.query(`RELEASE SAVEPOINT ${savepoint}`)
        return value
      } catch (error) {
        await this.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        await this.client.query(`RELEASE SAVEPOINT ${savepoint}`)
        throw error
      }
    }
    const result = this.tail.then(run, run)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

async function sourceFingerprints(client: Client): Promise<readonly Fingerprint[]> {
  const result: Fingerprint[] = []
  for (const table of FINGERPRINT_TABLES) {
    const row = await client.query(`
      SELECT count(*)::text AS count,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
      FROM public.${table} t
    `)
    result.push({ table, count: String(row.rows[0]?.count ?? ''), digest: String(row.rows[0]?.digest ?? '') })
  }
  return result
}
async function sequenceFingerprint(client: Client): Promise<string> {
  const result = await client.query(`
    SELECT md5(coalesce(string_agg(schemaname || ':' || sequencename || ':' || coalesce(last_value::text, 'null'), '' ORDER BY schemaname,sequencename), '')) AS digest
    FROM pg_sequences WHERE schemaname='public'
  `)
  return String(result.rows[0]?.digest ?? '')
}
function fingerprintDigest(value: readonly Fingerprint[]): string { return sha(JSON.stringify(value)) }
async function triggerState(client: Client): Promise<readonly { name: string; enabled: string; definitionHash: string }[]> {
  const result = await client.query(`
    SELECT t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='facturas_recibidas' AND NOT t.tgisinternal ORDER BY t.tgname
  `)
  return result.rows.map((row) => ({ name: String(row.name), enabled: String(row.enabled), definitionHash: sha(String(row.definition)) }))
}
async function writeReceipt(receipt: Record<string, unknown>): Promise<void> {
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 })
  const status = receipt.ok === true ? 'PASS' : 'BLOCKED'
  const summary = receipt.ok === true
    ? 'La ruta pública real llegó a tombstone, lifecycle, refresco Conciliar y cursor dentro de una única transacción SERIALIZABLE revertida.'
    : 'La ruta pública real quedó bloqueada antes de poder declarar cierre; el detalle técnico se limitó al diagnóstico privado local.'
  const assertions = receipt.ok === true
    ? ['fixture de factura con todas las columnas NOT NULL actuales explícitas', 'rol de servicio efectivo y guard P2 invocado', 'triggers existentes de facturas_recibidas activos y sin cambios', 'tombstone/lifecycle/refresco/cursor e idempotencia', '14 huellas de fuentes y huella de secuencias iguales tras ROLLBACK', 'cero residuos synthetic y cero efectos externos']
    : ['BEGIN SERIALIZABLE, lock de sesión y ROLLBACK obligatorio mantenidos', 'no se afirma cierre de B']
  writeFileSync(REPORT_PATH, `# B — ruta pública SQL real sin TEMP\n\n**Estado:** **${status}**.\n\n${summary}\n\n## Controles\n\n- Socket privado autorizado, base \`${EXPECTED_DATABASE}\`, puerto de conexión \`${EXPECTED_PORT}\`.\n- Lock de sesión \`${SESSION_LOCK}\`; ejecución serializada con los demás ensayos documentales.\n- Sin tablas TEMP, sin DDL persistente, sin cambio de triggers, sin COMMIT, Graph, OCR, correo, red de proveedor o sincronización.\n- Los GRANT de fixture y todos los DML ocurrieron dentro del ROLLBACK obligatorio.\n\n## Evidencia\n\n${assertions.map((item) => `- ${item}`).join('\n')}\n\nEl recibo público sólo contiene agregados y códigos seguros. Ante fallo, los campos PostgreSQL del fixture (incluida columna de 23502 cuando exista) están exclusivamente en \`${PRIVATE_DIAGNOSTIC_PATH}\` con permisos de usuario.\n\n## Artefacto\n\n- [Recibo JSON público](b-public-real.json)\n`, { mode: 0o644 })
}
function privateDiagnostic(stage: string, error: unknown): void {
  const raw = error as { code?: unknown; column?: unknown; table?: unknown; constraint?: unknown }
  const text = (value: unknown, maximum = 128) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value) ? value.slice(0, maximum) : null
  writeFileSync(PRIVATE_DIAGNOSTIC_PATH, `${JSON.stringify({
    stage,
    code: typeof raw?.code === 'string' ? raw.code : 'UNKNOWN',
    column: text(raw?.column),
    table: text(raw?.table),
    constraint: text(raw?.constraint),
  })}\n`, { mode: 0o600 })
}

async function grantServiceForRollbackOnly(client: Client): Promise<void> {
  await client.query(`GRANT USAGE ON SCHEMA public TO ${SERVICE_ROLE}`)
  await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE
    finance_sync_jobs_p2, finance_sync_items_p2,
    finance_graph_delta_pages, finance_graph_delta_events, finance_graph_delta_topology, finance_graph_delta_cursors,
    document_version_lifecycle, document_version_snapshots, document_version_tombstones,
    document_version_deletion_incidents, document_version_deletion_audit,
    conciliar_proyecciones, estado_proyeccion_conciliar
    TO ${SERVICE_ROLE}`)
  await client.query(`GRANT SELECT ON TABLE facturas_recibidas TO ${SERVICE_ROLE}`)
  await client.query(`GRANT USAGE ON TYPE
    "FinanceSyncSourceP2", "FinanceSyncTriggerP2", "FinanceSyncJobStatusP2", "FinanceSyncJobPhaseP2", "FinanceSyncItemTypeP2",
    "DocumentVersionLifecycleState", "DocumentVersionArtifactState"
    TO ${SERVICE_ROLE}`)
  await client.query(`GRANT EXECUTE ON FUNCTION finance_sync_p2_assert_apply_guard(uuid,uuid,text,timestamptz) TO ${SERVICE_ROLE}`)
}

async function insertInvoiceFixture(client: Client, input: Readonly<{ id: string; itemId: string }>): Promise<void> {
  // Explicitly supplies every current NOT NULL facturas_recibidas column, including fields with defaults.
  await client.query(`
    INSERT INTO facturas_recibidas
      (id,proveedor,fecha,base,tipo_iva,importe_iva,tipo_irpf,importe_irpf,total,concepto,estado,ocr_completado,deducible_iva,
       created_at,updated_at,onedrive_item_id,onedrive_drive_id,es_internacional,imputado_a_ventas,calidad,conflicto_identidad,
       duplicado_externo,version_calidad,naturaleza_documento,version_naturaleza_documento)
    VALUES
      ($1,$2,TIMESTAMP '2044-02-03 12:00:00',100,21,21,0,0,121,$2,'PENDIENTE_REVISION'::"EstadoFactura",FALSE,TRUE,
       CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$3,$4,FALSE,FALSE,'VALIDA'::"CalidadFacturaRecibida",FALSE,FALSE,1,
       'FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero",1)
  `, [input.id, TAG, input.itemId, DRIVE_ID])
}
async function insertLifecycleFixture(client: Client, input: Readonly<{ itemId: string }>): Promise<void> {
  const lifecycleId = randomUUID()
  await client.query(`
    INSERT INTO document_version_lifecycle(id,source,source_item_key,state,current_version,created_at,updated_at)
    VALUES ($1::uuid,'ONEDRIVE',$2,'ACTIVE'::"DocumentVersionLifecycleState",1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `, [lifecycleId, `${DRIVE_ID}:${input.itemId}`])
  await client.query(`
    INSERT INTO document_version_snapshots
      (id,lifecycle_id,version_number,artifact_state,metadata_checksum,idempotency_key,captured_at)
    VALUES ($1::uuid,$2::uuid,1,'UNAVAILABLE'::"DocumentVersionArtifactState",$3,$4,CURRENT_TIMESTAMP)
  `, [randomUUID(), lifecycleId, sha(`metadata:${input.itemId}`), sha(`snapshot:${input.itemId}`)])
  await client.query(`
    INSERT INTO finance_graph_delta_topology
      (source_key,drive_id,item_id,parent_item_id,item_name,is_folder,is_deleted,canonical_path,in_registered_scope,needs_location_review,updated_at)
    VALUES ($1,$2,$3,NULL,NULL,FALSE,FALSE,'/synthetic-registered-path',TRUE,FALSE,CURRENT_TIMESTAMP)
  `, [SOURCE_KEY, DRIVE_ID, input.itemId])
}
async function insertProjectionFixture(client: Client, input: Readonly<{ id: string; source: Record<string, unknown> }>): Promise<void> {
  await client.query(`
    INSERT INTO conciliar_proyecciones
      (id,tab,movimiento_id,cuenta_id,fecha,importe_centimos,pendiente_centimos,color,grupo,motivo,concepto,banco,cuenta,
       documento,propuesta,seleccionable,diferencia_centimos,links_movimiento,detail,source,source_fingerprint,updated_at)
    VALUES
      ($1,'PAGOS',NULL,NULL,DATE '2044-02-03',-12100,-12100,'VERDE','FACTURA_RECIBIDA','Fixture documental',$2,NULL,NULL,
       NULL,NULL,TRUE,0,NULL,NULL,$3::jsonb,$4,CURRENT_TIMESTAMP)
  `, [input.id, TAG, JSON.stringify(input.source), SOURCE_FINGERPRINT])
}
async function seedP2GuardFixture(client: Client, actorId: number): Promise<Readonly<{ jobId: string; itemId: string; deadline: Date }>> {
  const jobId = randomUUID()
  const itemId = randomUUID()
  const deadline = new Date(Date.now() + 120_000)
  await client.query(`
    INSERT INTO finance_sync_jobs_p2
      (id,source,trigger,status,phase,scope,checkpoint,requested_by_id,lease_token,lease_until,processed,nuevas,actualizadas,errores,unchanged,cancelled,recoveries,created_at,updated_at)
    VALUES
      ($1::uuid,'ONEDRIVE'::"FinanceSyncSourceP2",'MANUAL'::"FinanceSyncTriggerP2",'RUNNING'::"FinanceSyncJobStatusP2",'INVENTORY'::"FinanceSyncJobPhaseP2",'{}'::jsonb,'{}'::jsonb,$2,$3,clock_timestamp()+INTERVAL '5 minutes',0,0,0,0,0,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `, [jobId, actorId, LEASE])
  await client.query(`
    INSERT INTO finance_sync_items_p2
      (id,job_id,source_key,type,source_data,sequence,status,attempts,lease_token,lease_until,created_at,updated_at)
    VALUES
      ($1::uuid,$2::uuid,$3,'ONEDRIVE_FACTURA'::"FinanceSyncItemTypeP2",'{}'::jsonb,1,'PROCESSING'::"FinanceSyncItemStatusP2",1,$4,clock_timestamp()+INTERVAL '5 minutes',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `, [itemId, jobId, `guard-${TAG}`, LEASE])
  return { jobId, itemId, deadline }
}

async function projectionRows(tx: PgTx, ids: readonly string[]): Promise<readonly ProjectionRow[]> {
  const rows = await tx.$queryRaw<ProjectionRow[]>(Prisma.sql`
    SELECT id,color,seleccionable,source->>'documentLifecycleVersionState' AS "lifecycleVersion",source_fingerprint AS fingerprint
    FROM conciliar_proyecciones WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE
  `)
  equal(rows.length, ids.length, 'B_PUBLIC_REAL_PROJECTIONS_MISSING')
  return rows
}
function assertSealed(rows: readonly ProjectionRow[], ids: readonly string[]): void {
  for (const row of rows.filter((row) => ids.includes(row.id))) {
    equal(row.color, 'AMBAR', 'B_PUBLIC_REAL_PROJECTION_NOT_AMBER')
    equal(row.seleccionable, false, 'B_PUBLIC_REAL_PROJECTION_STILL_ACTIONABLE')
    assert.match(row.lifecycleVersion ?? '', /^[a-f0-9]{64}$/, 'B_PUBLIC_REAL_LIFECYCLE_VERSION_MISSING')
    assert.notEqual(row.fingerprint, SOURCE_FINGERPRINT, 'B_PUBLIC_REAL_PROJECTION_FINGERPRINT_UNCHANGED')
  }
}

async function run(): Promise<Record<string, unknown>> {
  equal(process.env.B_PUBLIC_REAL_ROLLBACK_TEST, '1', 'B_PUBLIC_REAL_EXPLICIT_OPT_IN_REQUIRED')
  invariant(process.env.FINANCE_GRAPH_DELTA_ENABLED !== '1', 'B_PUBLIC_REAL_GRAPH_FLAG_MUST_STAY_OFF')
  invariant(process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production', 'B_PUBLIC_REAL_PRODUCTION_BLOCKED')
  const client = new Client(config())
  let locked = false
  let began = false
  let stage = 'connect'
  try {
    await client.connect()
    stage = 'session-lock'
    await client.query("SELECT pg_advisory_lock(hashtextextended('documental-candidate-db-tests',0))")
    locked = true
    stage = 'identity'
    const identity = await client.query('SELECT current_database() AS database,inet_server_addr() IS NULL AS unix_socket')
    equal(identity.rows[0]?.database, EXPECTED_DATABASE, 'B_PUBLIC_REAL_DATABASE_RUNTIME_REJECTED')
    equal(identity.rows[0]?.unix_socket, true, 'B_PUBLIC_REAL_NON_SOCKET_SERVER_REJECTED')
    const triggersBefore = await triggerState(client)
    invariant(triggersBefore.length > 0 && triggersBefore.every((trigger) => trigger.enabled === 'O'), 'B_PUBLIC_REAL_INVOICE_TRIGGERS_NOT_ENABLED')
    stage = 'begin'
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    began = true
    const before = await sourceFingerprints(client)
    equal(before.length, 14, 'B_PUBLIC_REAL_FINGERPRINT_SCOPE')
    const sequencesBefore = await sequenceFingerprint(client)
    stage = 'actor-reference'
    const actors = await client.query(`SELECT requested_by_id AS actor_id FROM finance_sync_jobs_p2 WHERE requested_by_id IS NOT NULL LIMIT 1`)
    invariant(Number.isSafeInteger(Number(actors.rows[0]?.actor_id)) && Number(actors.rows[0]?.actor_id) > 0, 'B_PUBLIC_REAL_ACTOR_REFERENCE_UNAVAILABLE')
    const actorId = Number(actors.rows[0]?.actor_id)
    stage = 'fixture-grants'
    await grantServiceForRollbackOnly(client)
    stage = 'fixtures-admin'
    await insertInvoiceFixture(client, { id: INVOICE_ONE, itemId: ITEM_ONE })
    await insertInvoiceFixture(client, { id: INVOICE_TWO, itemId: ITEM_TWO })
    await insertInvoiceFixture(client, { id: INVOICE_CONTROL, itemId: ITEM_CONTROL })
    await insertLifecycleFixture(client, { itemId: ITEM_ONE })
    await insertLifecycleFixture(client, { itemId: ITEM_TWO })
    await insertLifecycleFixture(client, { itemId: ITEM_CONTROL })
    const firstIds = [`projection-${randomUUID()}`, `projection-${randomUUID()}`]
    const secondId = `projection-${randomUUID()}`
    const controlId = `projection-${randomUUID()}`
    await insertProjectionFixture(client, { id: firstIds[0]!, source: { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: INVOICE_ONE, movimientoId: `movement-${randomUUID()}`, versionB4: 1 } })
    await insertProjectionFixture(client, { id: firstIds[1]!, source: { kind: 'COBRO_CONFIRMING', confirmingId: INVOICE_ONE, movimientoId: `movement-${randomUUID()}`, versionB4: 1 } })
    await insertProjectionFixture(client, { id: secondId, source: { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: INVOICE_TWO, movimientoId: `movement-${randomUUID()}`, versionB4: 1 } })
    await insertProjectionFixture(client, { id: controlId, source: { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: INVOICE_CONTROL, movimientoId: `movement-${randomUUID()}`, versionB4: 1 } })
    // Factura fixture fires the pre-existing public triggers. Resetting this synthetic state is still inside this rollback.
    await client.query(`UPDATE estado_proyeccion_conciliar SET dirty_at=NULL,dirty_reason=NULL WHERE singleton=true`)
    const guard = await seedP2GuardFixture(client, actorId)
    stage = 'service-role'
    await client.query(`SET LOCAL ROLE ${SERVICE_ROLE}`)
    const service = await client.query('SELECT current_user AS user_name')
    equal(service.rows[0]?.user_name, SERVICE_ROLE, 'B_PUBLIC_REAL_SERVICE_ROLE_NOT_EFFECTIVE')
    const tx = new RollbackTxClient(client)
    const fence = { jobId: guard.jobId, leaseToken: LEASE, actorId }
    const store = new PrismaGraphDeltaVersionStore({
      prisma: tx as unknown as any,
      fence,
      cursorCipher: new AesGcmGraphDeltaCursorCipher(randomBytes(32)),
      assertEffectiveFinanceWriteAccess: async (guardTx, assertedActorId) => {
        if (assertedActorId !== actorId) return false
        // Calls the real P2 guard as io_staging_finanzas; its job/item locks remain in this outer transaction.
        await (guardTx as unknown as PgTx).$executeRaw(Prisma.sql`
          SELECT finance_sync_p2_assert_apply_guard(CAST(${guard.jobId} AS uuid),CAST(${guard.itemId} AS uuid),${LEASE},CAST(${guard.deadline} AS timestamptz))
        `)
        return true
      },
    })
    const page = (pageKey: string, eventKey: string, itemId: string, suffix: string): GraphDeltaPageCommit => ({
      scope: { sourceKey: SOURCE_KEY, driveId: DRIVE_ID, registeredPaths: [{ routeId: 'synthetic-registered-route', path: 'synthetic-registered-path' }] },
      mode: 'DELTA' as const,
      inventorySessionId: null,
      pageKey,
      events: [{ eventKey, sequence: 0, itemId, name: null, parentItemId: null, isFolder: false, kind: 'TOMBSTONE' as const, eTag: null, cTag: null, quickXorHash: null, mimeType: null, lastModifiedDateTime: null, size: null, routeHint: { kind: 'REGISTERED' as const, routeIds: ['synthetic-registered-route'], observedPath: '/synthetic-registered-path' } }],
      cursorAfter: { schema: GRAPH_DELTA_CURSOR_SCHEMA, deltaLink: `https://local.invalid/delta/${suffix}`, pending: null },
      inventoryCompleted: false,
    })
    stage = 'positive-tombstone-first'
    const first = await store.commitPage(page(PAGE_ONE, EVENT_ONE, ITEM_ONE, 'first'))
    assert.deepEqual(first, { projectionInvalidated: true }, 'B_PUBLIC_REAL_FIRST_POSITIVE_RESULT')
    const afterFirst = await projectionRows(tx, [...firstIds, secondId, controlId])
    assertSealed(afterFirst, firstIds)
    for (const row of afterFirst.filter((row) => row.id === secondId || row.id === controlId)) {
      equal(row.color, 'VERDE', 'B_PUBLIC_REAL_UNAFFECTED_PROJECTION_CHANGED')
      equal(row.seleccionable, true, 'B_PUBLIC_REAL_UNAFFECTED_PROJECTION_DISABLED')
      equal(row.fingerprint, SOURCE_FINGERPRINT, 'B_PUBLIC_REAL_UNAFFECTED_FINGERPRINT_CHANGED')
    }
    const firstState = await tx.$queryRaw<ProjectionState[]>(Prisma.sql`
      SELECT dirty_at AS "dirtyAt",dirty_reason AS "dirtyReason",projection_version AS version FROM estado_proyeccion_conciliar WHERE singleton=true FOR UPDATE
    `)
    equal(firstState.length, 1, 'B_PUBLIC_REAL_PROJECTION_STATE_MISSING')
    equal(firstState[0]?.dirtyAt, null, 'B_PUBLIC_REAL_INTERNAL_DIRTY_NOT_CLEARED')
    equal(firstState[0]?.dirtyReason, null, 'B_PUBLIC_REAL_INTERNAL_DIRTY_REASON_NOT_CLEARED')
    stage = 'page-replay'
    const replay = await store.commitPage(page(PAGE_ONE, EVENT_ONE, ITEM_ONE, 'first'))
    assert.deepEqual(replay, {}, 'B_PUBLIC_REAL_PAGE_REPLAY_NOT_IDEMPOTENT')
    stage = 'positive-tombstone-dirty'
    await tx.$executeRaw(Prisma.sql`UPDATE estado_proyeccion_conciliar SET dirty_at=CURRENT_TIMESTAMP,dirty_reason='PREEXISTENTE_SYNTHETIC' WHERE singleton=true`)
    const dirtyBefore = await tx.$queryRaw<ProjectionState[]>(Prisma.sql`SELECT dirty_at AS "dirtyAt",dirty_reason AS "dirtyReason",projection_version AS version FROM estado_proyeccion_conciliar WHERE singleton=true FOR UPDATE`)
    const second = await store.commitPage(page(PAGE_TWO, EVENT_TWO, ITEM_TWO, 'second'))
    assert.deepEqual(second, { projectionInvalidated: true }, 'B_PUBLIC_REAL_SECOND_POSITIVE_RESULT')
    const afterSecond = await projectionRows(tx, [secondId, controlId])
    assertSealed(afterSecond, [secondId])
    const control = afterSecond.find((row) => row.id === controlId)
    invariant(control, 'B_PUBLIC_REAL_CONTROL_PROJECTION_MISSING')
    equal(control.color, 'VERDE', 'B_PUBLIC_REAL_CONTROL_PROJECTION_CHANGED')
    equal(control.seleccionable, true, 'B_PUBLIC_REAL_CONTROL_PROJECTION_DISABLED')
    const dirtyAfter = await tx.$queryRaw<ProjectionState[]>(Prisma.sql`SELECT dirty_at AS "dirtyAt",dirty_reason AS "dirtyReason",projection_version AS version FROM estado_proyeccion_conciliar WHERE singleton=true FOR UPDATE`)
    equal(dirtyAfter[0]?.dirtyReason, 'PREEXISTENTE_SYNTHETIC', 'B_PUBLIC_REAL_PREEXISTING_DIRTY_CHANGED')
    assert.notEqual(dirtyAfter[0]?.dirtyAt, null, 'B_PUBLIC_REAL_PREEXISTING_DIRTY_CLEARED')
    equal(Number(dirtyAfter[0]?.version), Number(dirtyBefore[0]?.version) + 1, 'B_PUBLIC_REAL_SECOND_PROJECTION_VERSION')
    stage = 'route-facts'
    const facts = await tx.$queryRaw<Array<{ pages: string; events: string; tombstones: string; audits: string; cursors: string }>>(Prisma.sql`
      SELECT
        (SELECT count(*)::text FROM finance_graph_delta_pages WHERE source_key=${SOURCE_KEY} AND drive_id=${DRIVE_ID}) AS pages,
        (SELECT count(*)::text FROM finance_graph_delta_events WHERE source_key=${SOURCE_KEY} AND drive_id=${DRIVE_ID}) AS events,
        (SELECT count(*)::text FROM document_version_tombstones t JOIN document_version_lifecycle l ON l.id=t.lifecycle_id WHERE l.source_item_key IN (${`${DRIVE_ID}:${ITEM_ONE}`},${`${DRIVE_ID}:${ITEM_TWO}`})) AS tombstones,
        (SELECT count(*)::text FROM document_version_deletion_audit a JOIN document_version_lifecycle l ON l.id=a.lifecycle_id WHERE l.source_item_key IN (${`${DRIVE_ID}:${ITEM_ONE}`},${`${DRIVE_ID}:${ITEM_TWO}`})) AS audits,
        (SELECT count(*)::text FROM finance_graph_delta_cursors WHERE source_key=${SOURCE_KEY} AND drive_id=${DRIVE_ID}) AS cursors
    `)
    assert.deepEqual(facts, [{ pages: '2', events: '2', tombstones: '2', audits: '2', cursors: '1' }], 'B_PUBLIC_REAL_ROUTE_FACTS')
    stage = 'constraints'
    await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    stage = 'rollback'
    await client.query('ROLLBACK')
    began = false
    stage = 'postflight'
    const after = await sourceFingerprints(client)
    const sequencesAfter = await sequenceFingerprint(client)
    assert.deepEqual(after, before, 'B_PUBLIC_REAL_SOURCE_FINGERPRINTS_NOT_RESTORED')
    equal(sequencesAfter, sequencesBefore, 'B_PUBLIC_REAL_SEQUENCE_FINGERPRINT_NOT_RESTORED')
    const triggersAfter = await triggerState(client)
    assert.deepEqual(triggersAfter, triggersBefore, 'B_PUBLIC_REAL_TRIGGER_DEFINITION_CHANGED')
    const residue = await client.query(`
      SELECT
        (SELECT count(*)::text FROM facturas_recibidas WHERE proveedor=$1) AS invoices,
        (SELECT count(*)::text FROM finance_graph_delta_topology WHERE source_key=$2 AND drive_id=$3) AS topology,
        (SELECT count(*)::text FROM finance_graph_delta_pages WHERE source_key=$2 AND drive_id=$3) AS pages,
        (SELECT count(*)::text FROM document_version_lifecycle WHERE source_item_key LIKE $4) AS lifecycles
    `, [TAG, SOURCE_KEY, DRIVE_ID, `${DRIVE_ID}:%`])
    assert.deepEqual(residue.rows, [{ invoices: '0', topology: '0', pages: '0', lifecycles: '0' }], 'B_PUBLIC_REAL_SYNTHETIC_RESIDUE')
    return {
      format: 'b-public-real-sql-rollback-receipt-v1', ok: true, status: 'PASS',
      target: { transport: 'authorized-private-unix-socket', database: EXPECTED_DATABASE, port: EXPECTED_PORT },
      safety: { session_advisory_lock: SESSION_LOCK, serializable: true, rollback: true, commit_performed: false, temp_tables: false, persistent_ddl: false, persistent_dml: false, external_calls: { graph: 0, ocr: 0, email: 0, provider_network: 0 }, sync_performed: false },
      fixture: { admin_seeded: true, facturas_recibidas_all_current_not_null_columns_explicit: true, grants_transactional: true, set_local_role: SERVICE_ROLE, p2_guard_invoked_as_service: true, invoice_triggers_enabled_and_unchanged: true },
      route: { actual: ['applyPositiveDeltaTombstone', 'lifecycle', 'refreshConciliarProjectionForDocumentTombstoneTx', 'cursor'], first_positive: true, second_positive_with_preexisting_dirty: true, replay_idempotent: true, directed_projection_refresh: true },
      postflight: { source_tables_fingerprinted: 14, source_fingerprint_digest_before: fingerprintDigest(before), source_fingerprint_digest_after: fingerprintDigest(after), source_fingerprints_restored: true, sequence_fingerprint_restored: true, synthetic_residue: false },
    }
  } catch (error) {
    privateDiagnostic(stage, error)
    throw error
  } finally {
    if (began) {
      try { await client.query('ROLLBACK') } catch { /* mandatory best effort after a failed assertion */ }
    }
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended('documental-candidate-db-tests',0))") } catch { /* disconnect also releases */ }
    }
    await client.end().catch(() => undefined)
    const shared = await import('../lib/prisma').then((module) => module.default).catch(() => null)
    await shared?.$disconnect().catch(() => undefined)
  }
}

run().then(async (receipt) => {
  await writeReceipt(receipt)
  console.log('B_PUBLIC_REAL_SQL_ROLLBACK_OK')
}).catch(async (error) => {
  const receipt = { format: 'b-public-real-sql-rollback-receipt-v1', ok: false, status: 'BLOCKED', blocker: { code: safeCode(error), private_diagnostic: PRIVATE_DIAGNOSTIC_PATH }, safety: { rollback_attempted: true, commit_performed: false, temp_tables: false } }
  await writeReceipt(receipt)
  console.error('B_PUBLIC_REAL_SQL_ROLLBACK_BLOCKED')
  process.exitCode = 1
})
