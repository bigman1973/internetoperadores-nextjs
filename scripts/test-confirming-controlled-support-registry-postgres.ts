/*
 * Ensayo opt-in del registro humano confirming.
 *
 * Sólo socket privado local/io_staging_finanzas:55440, una TX SERIALIZABLE y
 * ROLLBACK obligatorio. Las filas son sintéticas y no hay Graph, OCR, bytes,
 * descargas, ingesta, trabajos, webhooks, correo ni confirmación de cobros.
 *
 * Ejecutar explícitamente:
 *   FINANCE_CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_ROLLBACK_TEST=1 \
 *   ./node_modules/.bin/tsx scripts/test-confirming-controlled-support-registry-postgres.ts
 */
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'
import type { RegistryDb } from '../lib/finanzas/confirming-controlled-support-registry'

// Equivale al bootstrap CLI local autorizado: no fabrica headers, permisos ni contexto firmado.
const nextGlobal = globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage }
if (!nextGlobal.AsyncLocalStorage) nextGlobal.AsyncLocalStorage = AsyncLocalStorage

const ROOT = process.cwd()
const CONFIG = '/home/ubuntu/conciliar-cierre-20261029/privado/local-admin-db.json'
const PRIVATE_SOCKET_PREFIX = '/home/ubuntu/conciliar-cierre-20261029/privado/'
const MIGRATION = join(ROOT, 'prisma/migrations/20261029_confirming_reading_controlled_support_registry/migration.sql')
const RECEIPT = '/home/ubuntu/conciliar-documentos-20261029/equipos/consumidor-humano/confirming-controlled-support-registry-postgres-receipt.json'
const LOCK_NAME = 'documental-candidate-db-tests'
const ROLLBACK = 'CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_ROLLBACK_ONLY'
const { Client } = createRequire(`${ROOT}/package.json`)('pg') as { Client: new (input: Record<string, unknown>) => any }
const requireCandidate = createRequire(`${ROOT}/package.json`)

const USERS = { real: 2_147_481_101, effective: 2_147_481_102 } as const
const IDS = {
  actingSession: 'c1000000-0000-4000-8000-000000000001',
  permission: 'fixture-confirming-registry-b4-permission',
  bbva: 'fixture-confirming-registry-bbva',
  conflict: 'fixture-confirming-registry-conflict',
  caixaPdf: 'fixture-confirming-registry-caixa-pdf',
  caixaXls: 'fixture-confirming-registry-caixa-xls',
  revoked: 'fixture-confirming-registry-revoked',
  wrongType: 'fixture-confirming-registry-wrong-type',
  activeB4: 'fixture-confirming-registry-active-b4',
  document: 'c1000000-0000-4000-8000-000000000011',
} as const

type DbConfig = Readonly<{ host: string; port: number; database: string; user: string; password: string; ssl: boolean }>
type Fingerprint = Record<string, Readonly<{ count: string; digest: string }>>
type Receipt = Record<string, unknown>
class IntentionalRollback extends Error { constructor() { super(ROLLBACK) } }
let diagnosticPhase = 'bootstrap'

function sha(input: string): string { return createHash('sha256').update(input, 'utf8').digest('hex') }
function literal(input: string): string { return `'${input.replaceAll("'", "''")}'` }
function uuidFromIdempotencyHash(hash: string, index: number): string {
  const hex = sha(`confirming-controlled-support:${hash}:${index}`)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
function config(): DbConfig {
  const value = JSON.parse(readFileSync(CONFIG, 'utf8')) as Partial<DbConfig>
  assert.equal(value.database, 'io_staging_finanzas', 'Sólo se admite io_staging_finanzas')
  assert.equal(value.port, 55440, 'Sólo se admite el puerto local autorizado')
  assert.equal(value.ssl, false, 'El ensayo no admite TLS/remoto')
  assert.ok(typeof value.host === 'string' && value.host.startsWith(PRIVATE_SOCKET_PREFIX), 'Sólo se admite socket privado local')
  assert.ok(typeof value.user === 'string' && value.user.length > 0, 'Falta el rol local')
  assert.equal(typeof value.password, 'string', 'La configuración local debe declarar password')
  return value as DbConfig
}
function socketUrl(value: DbConfig, user: string): string {
  const query = new URLSearchParams({ host: value.host, sslmode: 'disable' })
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(value.password)}@localhost:${value.port}/${value.database}?${query.toString()}`
}
function configureRuntime(value: DbConfig) {
  process.env.DATABASE_URL = socketUrl(value, 'io_staging_finanzas')
  process.env.FINANCE_STAGING_SANDBOX = '1'
  process.env.VERCEL_ENV = 'development'
  process.env.FINANCE_MODEL_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_AUTOMATIC_LINKS_DISABLED = '1'
  process.env.NEXTAUTH_SECRET = 'fixture-only-local-secret-0123456789abcdef'
  delete process.env.IMPERSONATION_ALLOWED_ACTOR_IDS
  delete process.env.IMPERSONATION_PRODUCTION_ENABLED
}
function statements(sql: string): string[] {
  const result: string[] = []
  const stripped = sql.replace(/^--.*$/gm, '')
  let start = 0, quote = false, dollar: string | null = null
  for (let i = 0; i < stripped.length; i += 1) {
    const char = stripped[i]
    if (quote) { if (char === "'" && stripped[i + 1] === "'") { i += 1; continue } if (char === "'") quote = false; continue }
    if (dollar) { if (stripped.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null }; continue }
    if (char === "'") { quote = true; continue }
    if (char === '$') { const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(stripped.slice(i)); if (match) { dollar = match[0]; i += dollar.length - 1; continue } }
    if (char === ';') { const statement = stripped.slice(start, i).trim(); if (statement) result.push(statement); start = i + 1 }
  }
  const trailing = stripped.slice(start).trim()
  if (trailing) result.push(trailing)
  return result
}
async function applyMigration(tx: any) { for (const statement of statements(readFileSync(MIGRATION, 'utf8'))) await tx.$executeRawUnsafe(statement) }

/** La copia restaurada conserva una variante productiva; se alinea sólo dentro del rollback con la guarda staging canónica. */
async function alignActingGuard(tx: any) {
  await tx.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.impersonation_production_append_only_guard()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE source_active boolean;
    BEGIN
      IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION '% is immutable impersonation ledger', TG_TABLE_NAME USING ERRCODE='55000'; END IF;
      IF current_database() <> 'io_staging_finanzas' OR current_user <> 'io_staging_finanzas' THEN RAISE EXCEPTION 'IMPERSONATION_STAGING_ONLY' USING ERRCODE='42501'; END IF;
      IF TG_TABLE_NAME = 'impersonation_sessions' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('impersonation:' || NEW.source_session_hash, 0));
        IF NOT EXISTS (SELECT 1 FROM usuarios_admin u WHERE u.id=NEW.actor_id AND u.activo=true AND u.rol::text='SUPER_ADMIN') THEN RAISE EXCEPTION 'IMPERSONATION_ACTOR_INVALID' USING ERRCODE='42501'; END IF;
        IF NOT EXISTS (SELECT 1 FROM usuarios_admin u WHERE u.id=NEW.target_id AND u.activo=true AND u.rol::text <> 'SUPER_ADMIN' AND NOT ('SUPER_ADMIN'=ANY(COALESCE(u.roles,ARRAY[]::text[])))) THEN RAISE EXCEPTION 'IMPERSONATION_TARGET_INVALID' USING ERRCODE='42501'; END IF;
        SELECT EXISTS(SELECT 1 FROM impersonation_sessions s WHERE s.source_session_hash=NEW.source_session_hash AND s.expires_at>CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM impersonation_session_ends e WHERE e.session_id=s.id)) INTO source_active;
        IF source_active THEN RAISE EXCEPTION 'IMPERSONATION_SOURCE_ALREADY_ACTIVE' USING ERRCODE='23505'; END IF;
      ELSIF TG_TABLE_NAME = 'impersonation_session_ends' THEN
        IF NOT EXISTS (SELECT 1 FROM impersonation_sessions s WHERE s.id=NEW.session_id) THEN RAISE EXCEPTION 'IMPERSONATION_END_WITHOUT_SESSION' USING ERRCODE='23503'; END IF;
      ELSIF TG_TABLE_NAME = 'impersonation_event_log' AND NEW.session_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM impersonation_sessions s WHERE s.id=NEW.session_id) THEN RAISE EXCEPTION 'IMPERSONATION_EVENT_WITHOUT_SESSION' USING ERRCODE='23503'; END IF;
      ELSIF TG_TABLE_NAME = 'impersonation_control_command_receipts' THEN
        IF NEW.command <> 'EXIT' OR NOT EXISTS (SELECT 1 FROM impersonation_sessions s JOIN impersonation_session_ends e ON e.session_id=s.id WHERE s.id=NEW.session_id AND s.actor_id=NEW.actor_id AND e.end_reason='EXITED') THEN RAISE EXCEPTION 'IMPERSONATION_EXIT_RECEIPT_INVALID' USING ERRCODE='23503'; END IF;
      END IF;
      RETURN NEW;
    END $$
  `)
}

const fingerprintTables = [
  'usuarios_admin', 'permiso_usuarios', 'facturas_recibidas', 'cuentas_bancarias', 'movimientos_bancarios',
  'documentos_conciliables', 'operaciones_justificacion_b4', 'estado_justificacion_movimientos', 'vinculos_movimiento_documento',
  'impersonation_sessions', 'impersonation_event_log',
] as const
async function fingerprint(db: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>): Promise<Fingerprint> {
  const value: Fingerprint = {}
  for (const table of fingerprintTables) {
    const rows = await db.$queryRawUnsafe<Array<{ count: string; digest: string }>>(`SELECT count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public.${table} t`)
    assert.equal(rows.length, 1)
    value[table] = rows[0]!
  }
  return value
}
async function userSequence(db: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>) {
  const rows = await db.$queryRawUnsafe<Array<{ lastValue: string; isCalled: boolean }>>('SELECT last_value::text AS "lastValue",is_called AS "isCalled" FROM public.usuarios_admin_id_seq')
  assert.equal(rows.length, 1)
  return rows[0]
}
async function assertFixtureAbsent(db: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>) {
  const rows = await db.$queryRawUnsafe<Array<{ total: string }>>(`
    SELECT (
      (SELECT count(*) FROM usuarios_admin WHERE id IN (${USERS.real},${USERS.effective}))+
      (SELECT count(*) FROM permiso_usuarios WHERE id=${literal(IDS.permission)})+
      (SELECT count(*) FROM facturas_recibidas WHERE id IN (${literal(IDS.bbva)},${literal(IDS.conflict)},${literal(IDS.caixaPdf)},${literal(IDS.caixaXls)},${literal(IDS.revoked)},${literal(IDS.wrongType)},${literal(IDS.activeB4)}))+
      (SELECT count(*) FROM documentos_conciliables WHERE id IN (${literal(IDS.document)}::uuid))+
      (SELECT count(*) FROM impersonation_sessions WHERE id=${literal(IDS.actingSession)}::uuid)
    )::text AS total
  `)
  assert.equal(rows[0]?.total, '0', 'Colisión de fixture; se aborta sin escribir')
}
async function insertOne(tx: any, sql: string) { await tx.$executeRawUnsafe(sql) }
async function seed(tx: Prisma.TransactionClient) {
  diagnosticPhase = 'fixtures-area'
  const area = await tx.$queryRawUnsafe<Array<{ id: string; activo: boolean }>>("SELECT id,activo FROM permiso_areas WHERE codigo='admin.finanzas.conciliacion' LIMIT 2")
  assert.deepEqual(area, [{ id: area[0]?.id, activo: true }], 'Debe existir exactamente el área B4 activa')
  diagnosticPhase = 'fixtures-users'
  await insertOne(tx, `INSERT INTO usuarios_admin (id,email,password_hash,nombre,rol,roles,activo,created_at,updated_at) VALUES (${USERS.real},'fixture-registry-real@invalid.test','fixture','Actor real sintético','SUPER_ADMIN',ARRAY[]::text[],true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),(${USERS.effective},'fixture-registry-effective@invalid.test','fixture','Actor efectivo sintético','VISOR',ARRAY[]::text[],true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
  diagnosticPhase = 'fixtures-permission'
  await insertOne(tx, `INSERT INTO permiso_usuarios (id,usuario_id,area_id,lectura,escritura,created_at,updated_at) VALUES (${literal(IDS.permission)},${USERS.effective},${literal(area[0]!.id)},true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
  const invoice = (id: string, drive: string, item: string, controlled = true) => `
    INSERT INTO facturas_recibidas (id,proveedor,cif,num_factura,fecha,base,tipo_iva,importe_iva,tipo_irpf,importe_irpf,total,estado,ocr_completado,deducible_iva,created_at,updated_at,onedrive_drive_id,onedrive_item_id,archivo_onedrive,carpeta_origen,calidad,conflicto_identidad,duplicado_externo,version_calidad,naturaleza_documento,tipo_soporte_financiero,version_naturaleza_documento)
    VALUES (${literal(id)},'FUENTE SINTÉTICA','F00000000',${literal(id)},TIMESTAMP '2030-01-01 00:00:00',10,0,0,0,0,10,'PENDIENTE_REVISION',false,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${literal(drive)},${literal(item)},'fuente-sintetica','fixture','VALIDA',false,false,1,${controlled ? "'SOPORTE_CONFIRMING_CLIENTE'::\"NaturalezaDocumentoFinanciero\"" : "'FACTURA_RECIBIDA'::\"NaturalezaDocumentoFinanciero\""},${controlled ? "'CONFIRMING_CESION_DRAXTON'::\"TipoSoporteFinanciero\"" : 'NULL'},1)
  `
  diagnosticPhase = 'fixtures-invoice-bbva'
  await insertOne(tx, invoice(IDS.bbva, 'fixture-drive-bbva', 'fixture-item-bbva'))
  diagnosticPhase = 'fixtures-invoice-conflict'
  await insertOne(tx, invoice(IDS.conflict, 'fixture-drive-conflict', 'fixture-item-conflict'))
  diagnosticPhase = 'fixtures-invoice-caixa-pdf'
  await insertOne(tx, invoice(IDS.caixaPdf, 'fixture-drive-caixa', 'fixture-item-caixa-pdf'))
  diagnosticPhase = 'fixtures-invoice-caixa-xls'
  await insertOne(tx, invoice(IDS.caixaXls, 'fixture-drive-caixa', 'fixture-item-caixa-xls'))
  diagnosticPhase = 'fixtures-invoice-revoked'
  await insertOne(tx, invoice(IDS.revoked, 'fixture-drive-revoked', 'fixture-item-revoked'))
  diagnosticPhase = 'fixtures-invoice-wrong-type'
  await insertOne(tx, invoice(IDS.wrongType, 'fixture-drive-wrong', 'fixture-item-wrong', false))
  diagnosticPhase = 'fixtures-invoice-active-link'
  await insertOne(tx, invoice(IDS.activeB4, 'fixture-drive-active', 'fixture-item-active'))
}
async function seedActingSession(tx: any) {
  await insertOne(tx, `INSERT INTO impersonation_sessions (id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at) VALUES (${literal(IDS.actingSession)}::uuid,${USERS.real},${USERS.effective},${literal(sha('registry-acting-source'))},'fixture-registry-act-01','Ensayo reversible',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '30 minutes')`)
}
async function withActingRequest<T>(sign: (input: any) => string, callback: () => Promise<T>): Promise<T> {
  const { workAsyncStorage } = requireCandidate('next/dist/server/app-render/work-async-storage.external')
  const { workUnitAsyncStorage } = requireCandidate('next/dist/server/app-render/work-unit-async-storage.external')
  const header = sign({ v: 'v1', sessionId: IDS.actingSession, actorId: USERS.real, targetId: USERS.effective, reason: 'Ensayo reversible', method: 'POST', path: '/api/admin/finanzas/confirming/fuentes', action: 'declarar', ip: null, ipSource: 'untrusted_proxy' })
  return await workAsyncStorage.run({ route: '/api/admin/finanzas/confirming/fuentes', forceStatic: false, dynamicShouldError: false } as any, () => workUnitAsyncStorage.run({ type: 'request', phase: 'action', headers: new Headers({ 'x-io-impersonation-context': header }) } as any, callback))
}
/** Canonicaliza sólo el pequeño contrato del ensayo, igual que el contrato público. */
function exactDeclaration(fuentes: Array<{ facturaRecibidaId: string; tipo: 'BBVA_PDF' | 'CAIXA_PDF' | 'CAIXA_XLS' }>, parejaCaixaDeclaradaId: string | null) {
  const sorted = [...fuentes].sort((a, b) => `${a.tipo}:${a.facturaRecibidaId}`.localeCompare(`${b.tipo}:${b.facturaRecibidaId}`))
  const canonical = `{"action":"declarar","confirmar":true,"fuentes":[${sorted.map(source => `{"facturaRecibidaId":${JSON.stringify(source.facturaRecibidaId)},"tipo":${JSON.stringify(source.tipo)}}`).join(',')}],"idempotencyKey":null,"parejaCaixaDeclaradaId":${JSON.stringify(parejaCaixaDeclaradaId)}}`
  // The actual hash excludes itself and has alphabetically sorted object keys.
  const hashBody = `{"action":"declarar","confirmar":true,"fuentes":[${sorted.map(source => `{"facturaRecibidaId":${JSON.stringify(source.facturaRecibidaId)},"tipo":${JSON.stringify(source.tipo)}}`).join(',')}],"parejaCaixaDeclaradaId":${JSON.stringify(parejaCaixaDeclaradaId)}}`
  void canonical
  return { action: 'declarar' as const, confirmar: true as const, parejaCaixaDeclaradaId, fuentes: sorted, idempotencyKey: sha(hashBody) }
}
async function expectCode(code: string, work: () => Promise<unknown>) {
  await assert.rejects(work, (error: any) => error?.code === code)
}

async function run() {
  if (process.env.FINANCE_CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_ROLLBACK_TEST !== '1') throw new Error('CONFIRMING_REGISTRY_ROLLBACK_OPT_IN_REQUIRED')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('CONFIRMING_REGISTRY_ROLLBACK_PRODUCTION_BLOCKED')
  const local = config()
  configureRuntime(local)
  const lock = new Client({ host: local.host, port: local.port, database: local.database, user: local.user, password: local.password, ssl: false })
  const admin = new PrismaClient({ datasources: { db: { url: socketUrl(local, local.user) } }, log: [] })
  let receipt: Receipt = { schema: 'CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SQL_RECEIPT_V1', status: 'NOT_RUN', target: 'io_staging_finanzas local private socket', persistentWrites: false, httpPosts: false, externalIntegrations: false, syntheticFixturesOnly: true }
  let locked = false
  try {
    diagnosticPhase = 'connect'
    await lock.connect()
    diagnosticPhase = 'identity-and-lock'
    const identity = await lock.query('SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS server_addr,inet_server_port() AS server_port')
    assert.deepEqual(identity.rows, [{ db: 'io_staging_finanzas', role: local.user, server_addr: null, server_port: null }])
    assert.equal((await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [LOCK_NAME])).rows[0]?.locked, true, 'El lock documental está ocupado')
    locked = true
    const before = await fingerprint(admin)
    const sequenceBefore = await userSequence(admin)
    await assertFixtureAbsent(admin)
    diagnosticPhase = 'pre-registry'
    const pre = await admin.$queryRawUnsafe<Array<{ sources: string | null; revocations: string | null }>>("SELECT to_regclass('public.confirming_reading_support_sources')::text AS sources,to_regclass('public.confirming_reading_support_source_revocations')::text AS revocations")
    assert.deepEqual(pre, [{ sources: null, revocations: null }], 'El ensayo requiere el registro sin aplicar en la copia local')
    const { installImpersonationPrismaGuard, runWithImpersonationMutationAuditScope } = await import('../lib/prisma')
    const { declareConfirmingControlledSupport, readConfirmingControlledSupportCandidates } = await import('../lib/finanzas/confirming-controlled-support-registry')
    const { signTrustedImpersonationContext } = await import('../lib/impersonation-context')
    installImpersonationPrismaGuard(admin as any)
    let reachedRollback = false
    try {
      await admin.$transaction(async (tx: Prisma.TransactionClient) => {
        diagnosticPhase = 'migration'
        await applyMigration(tx)
        diagnosticPhase = 'acting-guard-alignment'
        await alignActingGuard(tx)
        diagnosticPhase = 'fixtures'
        await seed(tx)
        diagnosticPhase = 'temporary-grants'
        // Sólo privilegios temporales que necesita el servicio real y sus FOR KEY SHARE; el rollback los elimina.
        await tx.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO io_staging_finanzas')
        await tx.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE ON usuarios_admin,permiso_areas,permiso_usuarios,facturas_recibidas,documentos_conciliables,vinculos_movimiento_documento,cuentas_bancarias,movimientos_bancarios,operaciones_justificacion_b4,estado_justificacion_movimientos,confirming_reading_support_sources,confirming_reading_support_source_revocations,impersonation_sessions,impersonation_event_log TO io_staging_finanzas')
        await tx.$executeRawUnsafe('SET LOCAL ROLE io_staging_finanzas')
        diagnosticPhase = 'service-role'
        assert.deepEqual(await tx.$queryRaw(Prisma.sql`SELECT current_database() AS db,current_user AS role`), [{ db: 'io_staging_finanzas', role: 'io_staging_finanzas' }])
        await seedActingSession(tx)
        const database: RegistryDb = {
          $queryRaw: async (query) => await tx.$queryRaw(query),
          $executeRaw: async (query) => await tx.$executeRaw(query),
          $transaction: async (callback) => await callback(tx),
        } as RegistryDb
        const act = async <T>(callback: () => Promise<T>) => await runWithImpersonationMutationAuditScope(tx, async () => await withActingRequest(signTrustedImpersonationContext, callback))
        diagnosticPhase = 'effective-get-candidates'
        const readable = await act(() => readConfirmingControlledSupportCandidates(database))
        assert.equal(readable.registryReady, true)
        assert.ok(readable.candidates.some(row => row.facturaRecibidaId === IDS.bbva), 'La identidad efectiva debe poder leer la fuente antes de declararla')
        diagnosticPhase = 'bbva'
        const bbva = exactDeclaration([{ facturaRecibidaId: IDS.bbva, tipo: 'BBVA_PDF' }], null)
        const bbvaCreated = await act(() => declareConfirmingControlledSupport(USERS.effective, bbva, database))
        assert.equal(bbvaCreated.idempotent, false)
        assert.equal(bbvaCreated.actorRealId, USERS.real)
        assert.equal(bbvaCreated.actorEfectivoId, USERS.effective)
        const bbvaReplay = await act(() => declareConfirmingControlledSupport(USERS.effective, bbva, database))
        assert.equal(bbvaReplay.idempotent, true, 'El replay exacto recupera el recibo original antes de una revocación')
        const conflict = exactDeclaration([{ facturaRecibidaId: IDS.conflict, tipo: 'BBVA_PDF' }], null)
        await tx.$executeRawUnsafe(`INSERT INTO confirming_reading_support_sources (id,factura_recibida_id,onedrive_drive_id,onedrive_item_id,tipo_detectado,pareja_caixa_declarada_id,declared_by_id,declared_at) VALUES (${literal(uuidFromIdempotencyHash(conflict.idempotencyKey, 0))}::uuid,${literal(IDS.conflict)},'fixture-drive-conflict','fixture-item-conflict','BBVA_PDF',NULL,${USERS.real},CURRENT_TIMESTAMP)`)
        await expectCode('IDEMPOTENCY_PAYLOAD_MISMATCH', () => act(() => declareConfirmingControlledSupport(USERS.effective, conflict, database)))
        diagnosticPhase = 'caixa-and-audit'
        const caixa = exactDeclaration([{ facturaRecibidaId: IDS.caixaPdf, tipo: 'CAIXA_PDF' }, { facturaRecibidaId: IDS.caixaXls, tipo: 'CAIXA_XLS' }], 'fixture-caixa-pair')
        const caixaCreated = await act(() => declareConfirmingControlledSupport(USERS.effective, caixa, database))
        assert.equal(caixaCreated.idempotent, false)
        assert.equal(caixaCreated.declarations.length, 2)
        const audit = await tx.$queryRawUnsafe<Array<{ real: number; effective: number; count: string }>>(`SELECT actor_id AS real,target_id AS effective,count(*)::text AS count FROM impersonation_event_log WHERE session_id=${literal(IDS.actingSession)}::uuid AND kind='BUSINESS_MUTATION' AND outcome='SUCCESS' GROUP BY actor_id,target_id`)
        assert.deepEqual(audit, [{ real: USERS.real, effective: USERS.effective, count: '3' }], 'La auditoría real debe reflejar las tres inserciones declaradas durante actuación')
        diagnosticPhase = 'revocation'
        const revoked = exactDeclaration([{ facturaRecibidaId: IDS.revoked, tipo: 'BBVA_PDF' }], null)
        const revokedCreated = await act(() => declareConfirmingControlledSupport(USERS.effective, revoked, database))
        assert.equal(revokedCreated.idempotent, false)
        const revokedId = revokedCreated.declarations[0]!.id
        await tx.$executeRawUnsafe(`INSERT INTO confirming_reading_support_source_revocations (id,source_id,revoked_by_id,motivo,idempotency_key,created_at) VALUES ('c1000000-0000-4000-8000-000000000021'::uuid,${literal(revokedId)}::uuid,${USERS.real},'Revocación sintética',${literal(sha('registry-revocation'))},CURRENT_TIMESTAMP)`)
        await expectCode('FUENTE_DECLARACION_REVOCADA', () => act(() => declareConfirmingControlledSupport(USERS.effective, revoked, database)))
        const wrongType = exactDeclaration([{ facturaRecibidaId: IDS.wrongType, tipo: 'BBVA_PDF' }], null)
        await expectCode('FUENTE_CONTROLADA_INVALIDA', () => act(() => declareConfirmingControlledSupport(USERS.effective, wrongType, database)))
        await tx.$executeRawUnsafe('SAVEPOINT source_control_guard')
        await assert.rejects(() => tx.$executeRawUnsafe(`INSERT INTO confirming_reading_support_sources (id,factura_recibida_id,onedrive_drive_id,onedrive_item_id,tipo_detectado,pareja_caixa_declarada_id,declared_by_id,declared_at) VALUES ('c1000000-0000-4000-8000-000000000022'::uuid,${literal(IDS.bbva)},'forged-drive','forged-item','BBVA_PDF',NULL,${USERS.effective},CURRENT_TIMESTAMP)`), (error: any) => error?.code === 'P2010' || error?.meta?.code === '23514')
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT source_control_guard')
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT source_control_guard')
        diagnosticPhase = 'active-link-canonical-guard'
        await tx.$executeRawUnsafe('SAVEPOINT active_b4_canonical_guard')
        await assert.rejects(
          () => tx.$executeRawUnsafe(`INSERT INTO documentos_conciliables (id,tipo,importe_objetivo_centimos,version,activo,created_at,updated_at,factura_recibida_id) VALUES (${literal(IDS.document)}::uuid,'FACTURA_RECIBIDA',1000,1,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${literal(IDS.activeB4)})`),
          (error: any) => error?.code === 'P2010' || error?.meta?.code === '23514',
        )
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT active_b4_canonical_guard')
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT active_b4_canonical_guard')
        diagnosticPhase = 'permission-revoked'
        // Fuera del contexto firmado, la revocación sintética no puede generar un recibo de actuación; dentro de la siguiente llamada se relee el permiso real.
        await tx.permisoUsuario.update({ where: { id: IDS.permission }, data: { escritura: false } })
        const permissionExpired = exactDeclaration([{ facturaRecibidaId: IDS.wrongType, tipo: 'BBVA_PDF' }], null)
        await expectCode('PERMISO_REVOCADO', () => act(() => declareConfirmingControlledSupport(USERS.effective, permissionExpired, database)))
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        diagnosticPhase = 'intentional-rollback'
        reachedRollback = true
        throw new IntentionalRollback()
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 })
      assert.fail('La transacción debía terminar en rollback obligatorio')
    } catch (error) { if (!(error instanceof IntentionalRollback) && (error as Error).message !== ROLLBACK) throw error }
    assert.equal(reachedRollback, true, 'No se alcanzó el rollback obligatorio')
    assert.deepEqual(await fingerprint(admin), before, 'Las huellas públicas deben restaurarse exactamente tras rollback')
    assert.deepEqual(await userSequence(admin), sequenceBefore, 'No se debe consumir una secuencia de usuario')
    await assertFixtureAbsent(admin)
    assert.deepEqual(await admin.$queryRawUnsafe<Array<{ sources: string | null; revocations: string | null }>>("SELECT to_regclass('public.confirming_reading_support_sources')::text AS sources,to_regclass('public.confirming_reading_support_source_revocations')::text AS revocations"), [{ sources: null, revocations: null }], 'El DDL de ensayo no puede persistir')
    receipt = { ...receipt, status: 'PASS_ROLLBACK_ONLY', isolation: 'serializable', publicTablesOnly: true, migrationAppliedInRollbackOnly: true, serviceRoleInsideTransaction: true, registryDbInjection: true, realActingAuditFlushed: true, declarationCases: ['bbva', 'caixa-pdf-xls', 'exact-replay', 'idempotency-conflict', 'revoked-before-idempotency', 'wrong-type', 'trigger-identity-control', 'active-document-link-rejected-by-canonical-c9-trigger', 'effective-b4-revoked'], rollbackVerified: true }
  } finally {
    try { if (locked) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [LOCK_NAME]) } finally { await lock.end(); await admin.$disconnect() }
  }
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 })
  console.log(JSON.stringify(receipt))
}

run().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : 'CONFIRMING_REGISTRY_SQL_TEST_FAILED'
  const raw = error instanceof Error ? error.message : ''
  const message = raw.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, '<uuid>').replace(/\b[0-9]{4,}\b/g, '<n>').slice(0, 180)
  console.error(JSON.stringify({ schema: 'CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_SQL_RECEIPT_V1', status: 'FAIL_CLOSED', phase: diagnosticPhase, code, message }))
  process.exitCode = 1
})
