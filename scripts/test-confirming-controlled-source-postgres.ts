/*
 * Ensayo real y reversible del registro controlado P2/C11.
 *
 * Requisitos deliberados:
 * - sólo socket local privado + io_staging_finanzas:55440;
 * - una única TX SERIALIZABLE, DDL/DML dentro y ROLLBACK obligatorio;
 * - lock de sesión documental-candidate-db-tests;
 * - fixtures completamente sintéticas, IDs explícitos y sin nextval;
 * - ningún Graph, OCR, correo, webhook, cobro ni B4 aplicado.
 *
 * Ejecutar explícitamente:
 *   FINANCE_CONFIRMING_CONTROLLED_SOURCE_ROLLBACK_TEST=1 \
 *     npx tsx scripts/test-confirming-controlled-source-postgres.ts
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { Prisma } from '@prisma/client'

import { prepareFinanceConfirmingReadingP2, type FinanceConfirmingReadingP2Tx } from '../lib/finanzas/finance-confirming-reading-p2'
import { applyOneDriveConfirmingReadingAfterLifecycleTx } from '../lib/finanzas/sync-jobs/providers/onedrive/confirming-reading'
import { createPrismaOneDriveDomain } from '../lib/finanzas/sync-jobs/providers/onedrive/prisma-domain'
import type { RegisteredConfirmingSupport } from '../lib/finanzas/sync-jobs/providers/onedrive/provider'
import type { ConfirmingParseResult } from '../lib/finanzas/confirming-parser'

const PRIVATE_CONFIG = '/home/ubuntu/conciliar-cierre-20261029/privado/local-admin-db.json'
const PRIVATE_SOCKET_PREFIX = '/home/ubuntu/conciliar-cierre-20261029/privado/'
const LOCK_LABEL = 'documental-candidate-db-tests'
const MIGRATION = join(process.cwd(), 'prisma/migrations/20261029_confirming_reading_controlled_support_registry/migration.sql')
const ROLLBACK = new Error('CONFIRMING_CONTROLLED_SOURCE_ROLLBACK')
let diagnosticPhase = 'bootstrap'

type PrivateConfig = Readonly<{ host: string; port: number; database: string; user: string; password: string; ssl: boolean }>
type Fingerprint = Readonly<{ count: string; digest: string }>
type TxSql = FinanceConfirmingReadingP2Tx

function sha256(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex') }
function sqlTx(client: Client): TxSql {
  return {
    async $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> {
      return (await client.query(query.text, query.values)).rows as T
    },
  }
}
function requireConfig(): PrivateConfig {
  const raw = JSON.parse(readFileSync(PRIVATE_CONFIG, 'utf8')) as Partial<PrivateConfig>
  if (raw.database !== 'io_staging_finanzas' || raw.port !== 55440 || typeof raw.host !== 'string' || !raw.host.startsWith(PRIVATE_SOCKET_PREFIX)
    || typeof raw.user !== 'string' || typeof raw.password !== 'string' || raw.ssl !== false) {
    throw new Error('CONFIRMING_TEST_PRIVATE_ENDPOINT_REJECTED')
  }
  return raw as PrivateConfig
}
function expectCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code)
}
async function rejected(client: Client, label: string, code: string, work: () => Promise<unknown>): Promise<void> {
  const savepoint = `fixture_${label.replace(/[^a-z0-9_]/gi, '_')}`
  await client.query(`SAVEPOINT ${savepoint}`)
  try {
    await work()
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
    assert.equal(expectCode(error, code), true, `${label} debe devolver ${code}`)
    return
  }
  await client.query(`RELEASE SAVEPOINT ${savepoint}`)
  assert.fail(`${label} debía fallar con ${code}`)
}

const FINGERPRINT_TABLES = [
  'facturas_recibidas', 'facturas_emitidas', 'movimientos_bancarios', 'cuentas_bancarias',
  'documentos_conciliables', 'document_version_lifecycle', 'document_version_snapshots',
  'document_version_artifacts', 'confirming_reading_attempts', 'finance_sync_jobs_p2',
  'finance_sync_items_p2', 'liquidaciones_confirming_documentales',
  'documentos_liquidacion_confirming', 'lineas_liquidacion_confirming',
] as const

async function aggregates(client: Client): Promise<Record<string, Fingerprint>> {
  const result: Record<string, Fingerprint> = {}
  for (const table of FINGERPRINT_TABLES) {
    const rows = await client.query(`
      SELECT count(*)::text AS count,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
      FROM public.${table} t
    `)
    result[table] = { count: String(rows.rows[0]?.count ?? ''), digest: String(rows.rows[0]?.digest ?? '') }
  }
  return result
}
async function sequenceAggregate(client: Client): Promise<string> {
  const rows = await client.query(`
    SELECT md5(coalesce(string_agg(schemaname || '.' || sequencename || ':' || coalesce(last_value::text, 'NULL'), ',' ORDER BY schemaname,sequencename), '')) AS digest
    FROM pg_sequences WHERE schemaname='public'
  `)
  return String(rows.rows[0]?.digest ?? '')
}
async function queryOne(client: Client, sql: string, values: readonly unknown[] = []) {
  const result = await client.query(sql, [...values])
  assert.equal(result.rowCount, 1, 'La fixture sintética debía afectar exactamente una fila')
}

function parser(sourceHash: string): { parseBBVA: () => Promise<ConfirmingParseResult> } {
  return {
    async parseBBVA() {
      return {
        banco: 'BBVA', tipoDocumento: 'LIQUIDACION', sourceHash,
        fechaLiquidacion: '10/01/2030', cuentaAbono: 'ES9121000418450200051332',
        totalRemesa: 100, totalIntereses: 1, totalComisiones: 0.2, totalIvaComision: 0.04,
        totalDeducir: 1.24, netoBancario: 98.76, cuadre: { estado: 'CUADRA' },
        lineas: [{ numFactura: 'FIX-INV-1', importe: 100, intereses: 1, comision: 0.2, fechaFactura: '01/01/2030', fechaPago: '10/01/2030' }],
      }
    },
  }
}

async function insertSupportInvoice(client: Client, input: Readonly<{ id: string; drive: string; item: string }>): Promise<void> {
  await queryOne(client, `
    INSERT INTO facturas_recibidas
      (id,proveedor,fecha,base,tipo_iva,importe_iva,tipo_irpf,importe_irpf,total,estado,ocr_completado,deducible_iva,
       created_at,updated_at,onedrive_drive_id,onedrive_item_id,archivo_onedrive,carpeta_origen,
       calidad,conflicto_identidad,duplicado_externo,version_calidad,naturaleza_documento,tipo_soporte_financiero,version_naturaleza_documento)
    VALUES
      ($1,'FIXTURE_REGISTRY',TIMESTAMP '2030-01-10 00:00:00',100,0,0,0,0,100,'PENDIENTE_REVISION'::"EstadoFactura",false,true,
       CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$2,$3,'fixture-controlled.pdf','fixture-controlled',
       'VALIDA'::"CalidadFacturaRecibida",false,false,1,'SOPORTE_CONFIRMING_CLIENTE'::"NaturalezaDocumentoFinanciero",'CONFIRMING_CESION_DRAXTON'::"TipoSoporteFinanciero",1)
  `, [input.id, input.drive, input.item])
}

async function insertControlledVersionFixture(client: Client, input: Readonly<{
  lifecycleId: string; snapshotId: string; artifactId: string; sourceHash: string; actorId: number; drive: string; item: string
}>): Promise<void> {
  const bytes = Buffer.from('%PDF-1.7\nfixture-controlled\n', 'utf8')
  assert.equal(sha256(bytes), input.sourceHash)
  await queryOne(client, `
    INSERT INTO document_version_lifecycle (id,source,source_item_key,state,current_version,created_at,updated_at)
    VALUES ($1,'ONEDRIVE','${input.drive}:${input.item}','ACTIVE'::"DocumentVersionLifecycleState",1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `, [input.lifecycleId])
  await queryOne(client, `
    INSERT INTO document_version_artifacts (id,sha256,byte_length,format,content_bytes,created_by_id,created_at)
    VALUES ($1,$2,$3,'PDF'::"DocumentVersionOriginalFormat",$4,$5,CURRENT_TIMESTAMP)
  `, [input.artifactId, input.sourceHash, bytes.byteLength, bytes, input.actorId])
  await queryOne(client, `
    INSERT INTO document_version_snapshots
      (id,lifecycle_id,version_number,content_sha256,byte_length,original_format,artifact_state,private_storage_handle,metadata_checksum,idempotency_key,captured_at)
    VALUES ($1,$2,1,$3,$4,'PDF'::"DocumentVersionOriginalFormat",'CAPTURED'::"DocumentVersionArtifactState",$5,$6,$7,CURRENT_TIMESTAMP)
  `, [input.snapshotId, input.lifecycleId, input.sourceHash, bytes.byteLength, input.artifactId, sha256(`metadata:${input.snapshotId}`), sha256(`snapshot:${input.snapshotId}`)])
}

async function main(): Promise<void> {
  if (process.env.FINANCE_CONFIRMING_CONTROLLED_SOURCE_ROLLBACK_TEST !== '1') throw new Error('CONFIRMING_ROLLBACK_OPT_IN_REQUIRED')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('CONFIRMING_ROLLBACK_PRODUCTION_BLOCKED')
  const config = requireConfig()
  const client = new Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password, ssl: false })
  let locked = false
  let rolledBack = false
  const result = {
    schema: 'CONFIRMING_CONTROLLED_SOURCE_SQL_RECEIPT_V1', ok: false,
    localSocketValidated: false, serializableRollback: false, migrationAppliedInRollbackOnly: false,
    serviceRoleExercised: false, leaseGuardExercised: false, registryVersion: false,
    revocationBlocked: false, caixaPairUnique: false, parserHashBreakReview: false,
    humanProposalOnly: false, b4Writes: 0, sourceFingerprintsRestored: false, sequenceFingerprintsRestored: false,
  }
  let before: Record<string, Fingerprint> | null = null
  let beforeSequences = ''
  diagnosticPhase = 'connect'
  try {
    await client.connect()
    diagnosticPhase = 'identity'
    const identity = await client.query(`SELECT current_database() AS db,current_user AS role,COALESCE(inet_server_addr()::text,'local-socket') AS server`)
    assert.deepEqual(identity.rows[0], { db: 'io_staging_finanzas', role: config.user, server: 'local-socket' })
    result.localSocketValidated = true
    before = await aggregates(client)
    beforeSequences = await sequenceAggregate(client)
    diagnosticPhase = 'session-lock'
    const acquired = await client.query(`SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked`, [LOCK_LABEL])
    assert.equal(acquired.rows[0]?.locked, true, 'El lock de sesión de ensayos está ocupado')
    locked = true

    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    diagnosticPhase = 'migration'
    await client.query(`SET LOCAL lock_timeout='5s'`)
    await client.query(`SET LOCAL statement_timeout='60s'`)
    assert.equal((await client.query(`SELECT to_regclass('public.confirming_reading_support_sources') AS registry`)).rows[0]?.registry, null)
    await client.query(readFileSync(MIGRATION, 'utf8'))
    // La copia restaurada de producción conserva su identidad de C11. Reusar
    // literalmente la función aprobada de staging, sólo dentro de este rollback.
    const c11StagingSql = readFileSync(join(process.cwd(),'prisma/migrations/20261027_c11_confirming_liquidation_documental/migration.sql'),'utf8')
    const c11Guard = c11StagingSql.match(/CREATE FUNCTION c11_assert_liquidacion_cargada[\s\S]*?END \$\$;/)?.[0]
    assert.ok(c11Guard,'La guarda C11 de staging debe existir en su DDL aprobado')
    await client.query(c11Guard.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'))

    result.migrationAppliedInRollbackOnly = true
    diagnosticPhase = 'fixtures-admin'

    const tag = randomUUID().replaceAll('-', '')
    const actorId = 2_000_000_000 - Math.floor(Math.random() * 100_000)
    const drive = `fixture-drive-${tag.slice(0, 12)}`
    const mainItem = `fixture-item-${tag.slice(12, 24)}`
    const mainInvoice = `fixture-fr-${tag.slice(0, 20)}`
    const mainRegistry = randomUUID()
    const mainLifecycle = randomUUID()
    const mainSnapshot = randomUUID()
    const mainArtifact = randomUUID()
    const pdfHash = sha256(Buffer.from('%PDF-1.7\nfixture-controlled\n', 'utf8'))

    // IDs are all explicit: no existing sequence is consumed by this fixture.
    await queryOne(client, `
      INSERT INTO usuarios_admin (id,email,password_hash,nombre,rol,roles,activo,created_at,updated_at)
      VALUES ($1,$2,'FIXTURE_NO_LOGIN','Fixture rollback','CONTABILIDAD'::"RolAdmin",ARRAY[]::text[],true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [actorId, `fixture-${tag}@example.invalid`])
    // La definición del área P2 es preexistente y sólo se lee para vincular el
    // actor de fixture en esta TX; no se recrea ni se cambia su configuración.
    await queryOne(client, `
      INSERT INTO permiso_usuarios (id,usuario_id,area_id,lectura,escritura,created_at,updated_at)
      SELECT $1,$2,pa.id,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM permiso_areas pa
      WHERE pa.codigo='admin.finanzas.facturas' AND pa.activo=true
      LIMIT 1
    `, [`fixture-perm-${tag}`, actorId])

    await insertSupportInvoice(client, { id: mainInvoice, drive, item: mainItem })
    await insertControlledVersionFixture(client, { lifecycleId: mainLifecycle, snapshotId: mainSnapshot, artifactId: mainArtifact, sourceHash: pdfHash, actorId, drive, item: mainItem })

    const revInvoice = `fixture-rev-${tag.slice(0, 18)}`
    const revDrive = `${drive}-rev`
    const revItem = `${mainItem}-rev`
    const revRegistry = randomUUID()
    const revLifecycle = randomUUID()
    const revSnapshot = randomUUID()
    const revArtifact = randomUUID()
    await insertSupportInvoice(client, { id: revInvoice, drive: revDrive, item: revItem })
    await insertControlledVersionFixture(client, { lifecycleId: revLifecycle, snapshotId: revSnapshot, artifactId: revArtifact, sourceHash: pdfHash, actorId, drive: revDrive, item: revItem })

    const pair = `fixture-caixa-${tag.slice(0, 16)}`
    const pairPdfInvoice = `fixture-pdf-${tag.slice(0, 18)}`
    const pairXlsInvoice = `fixture-xls-${tag.slice(0, 18)}`
    const pairDuplicateInvoice = `fixture-dup-${tag.slice(0, 18)}`
    await insertSupportInvoice(client, { id: pairPdfInvoice, drive: `${drive}-caixa`, item: `${mainItem}-pdf` })
    await insertSupportInvoice(client, { id: pairXlsInvoice, drive: `${drive}-caixa`, item: `${mainItem}-xls` })
    await insertSupportInvoice(client, { id: pairDuplicateInvoice, drive: `${drive}-caixa`, item: `${mainItem}-pdf-duplicate` })

    const accountId = `fixture-account-${tag.slice(0, 16)}`
    const emittedId = `fixture-issued-${tag.slice(0, 16)}`
    const wrapperId = randomUUID()
    const movementId = `fixture-move-${tag.slice(0, 16)}`
    await queryOne(client, `INSERT INTO cuentas_bancarias (id,banco,iban,alias,activa,created_at,updated_at) VALUES ($1,'FIXTURE','ES9121000418450200051332','fixture',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [accountId])
    await queryOne(client, `
      INSERT INTO declaraciones_titularidad_modo_facil (id,cuenta_id,version,estado,titular_declarado,fecha_declaracion,confirmacion_declarada,actor_id,referencia_evidencia,snapshot,created_at)
      VALUES ($1,$2,1,'DECLARADA','Fixture Holder',CURRENT_DATE,true,$3,'fixture-evidence-reference',jsonb_build_object('schema','EASY_ACCOUNT_OWNERSHIP_DECLARATION_V1'),CURRENT_TIMESTAMP)
    `, [randomUUID(), accountId, actorId])
    await queryOne(client, `
      INSERT INTO facturas_emitidas (id,cliente,num_factura,fecha,base,tipo_iva,importe_iva,tipo_irpf,importe_irpf,total,estado,imputacion,importe_cobrado,created_at,updated_at)
      VALUES ($1,'FIXTURE','FIX-INV-1',TIMESTAMP '2030-01-01 00:00:00',100,0,0,0,0,100,'EMITIDA'::"EstadoFacturaEmitida",'DRAXTON',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [emittedId])
    // Sólo wrapper documental pendiente: sin operación, vínculo ni aplicación B4.
    await queryOne(client, `
      INSERT INTO documentos_conciliables (id,tipo,importe_objetivo_centimos,version,activo,created_at,updated_at,factura_emitida_id)
      VALUES ($1,'FACTURA_EMITIDA'::"TipoDocumentoConciliable",10000,1,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$2)
    `, [wrapperId, emittedId])
    await queryOne(client, `
      INSERT INTO movimientos_bancarios (id,cuenta_id,fecha_operacion,fecha_valor,concepto,importe,hash_unico,es_recurrente,conciliado,created_at)
      VALUES ($1,$2,TIMESTAMP '2030-01-10 00:00:00',TIMESTAMP '2030-01-10 00:00:00','FIXTURE',98.76,$3,false,false,CURRENT_TIMESTAMP)
    `, [movementId, accountId, `fixture-hash-${tag}`])

    // Real lease function: job and item are fixtures only and remain uncommitted.
    const jobId = randomUUID(), jobItemId = randomUUID(), leaseToken = `fixture-lease-${tag}`
    await queryOne(client, `
      INSERT INTO finance_sync_jobs_p2 (id,source,trigger,status,phase,scope,checkpoint,total,requested_by_id,lease_token,lease_until,updated_at)
      VALUES ($1,'ONEDRIVE'::"FinanceSyncSourceP2",'MANUAL'::"FinanceSyncTriggerP2",'RUNNING'::"FinanceSyncJobStatusP2",'PROCESSING'::"FinanceSyncJobPhaseP2",'{}'::jsonb,'{}'::jsonb,1,$2,$3,clock_timestamp()+interval '5 minutes',CURRENT_TIMESTAMP)
    `, [jobId, actorId, leaseToken])
    await queryOne(client, `
      INSERT INTO finance_sync_items_p2 (id,job_id,source_key,type,source_data,sequence,status,attempts,lease_token,lease_until,created_at,updated_at)
      VALUES ($1,$2,'fixture-controlled','ONEDRIVE_CONFIRMING_SOPORTE'::"FinanceSyncItemTypeP2",'{}'::jsonb,0,'PROCESSING'::"FinanceSyncItemStatusP2",1,$3,clock_timestamp()+interval '5 minutes',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [jobItemId, jobId, leaseToken])

    // Temporary grants are intentionally in this same transaction and disappear on ROLLBACK.
    await client.query(`GRANT USAGE ON SCHEMA public TO io_staging_finanzas`)
    diagnosticPhase = 'temporary-grants'
    await client.query(`GRANT SELECT ON auditorias_liquidacion_confirming,soportes_liquidacion_confirming,operaciones_justificacion_b4,usuarios_admin,permiso_areas,permiso_usuarios,facturas_recibidas,documentos_conciliables,vinculos_movimiento_documento,document_version_lifecycle,document_version_snapshots,document_version_artifacts,confirming_reading_support_sources,confirming_reading_support_source_revocations,confirming_reading_support_versions,confirming_reading_attempts,cuentas_bancarias,declaraciones_titularidad_modo_facil,facturas_emitidas,movimientos_bancarios,estado_justificacion_movimientos,liquidaciones_confirming_documentales,documentos_liquidacion_confirming,lineas_liquidacion_confirming,auditorias_liquidacion_confirming,finance_sync_jobs_p2,finance_sync_items_p2 TO io_staging_finanzas`)
    await client.query(`GRANT INSERT ON confirming_reading_support_sources,confirming_reading_support_source_revocations,confirming_reading_support_versions,confirming_reading_attempts,liquidaciones_confirming_documentales,documentos_liquidacion_confirming,lineas_liquidacion_confirming,auditorias_liquidacion_confirming TO io_staging_finanzas`)
    // FOR KEY SHARE/FOR UPDATE in the production guards require UPDATE as well as
    // SELECT. Every grant is transaction-local because the outer TX rolls back.
    await client.query(`GRANT UPDATE ON auditorias_liquidacion_confirming,liquidaciones_confirming_documentales,documentos_liquidacion_confirming,lineas_liquidacion_confirming,cuentas_bancarias,declaraciones_titularidad_modo_facil,movimientos_bancarios,facturas_emitidas,documentos_conciliables,estado_justificacion_movimientos,vinculos_movimiento_documento,confirming_reading_support_source_revocations,finance_sync_jobs_p2,finance_sync_items_p2,facturas_recibidas,document_version_lifecycle,document_version_snapshots,confirming_reading_support_sources,confirming_reading_support_versions,confirming_reading_attempts TO io_staging_finanzas`)
    await client.query(`SET LOCAL ROLE io_staging_finanzas`)
    diagnosticPhase = 'service-role-identity'
    assert.equal((await client.query(`SELECT current_user AS role`)).rows[0]?.role, 'io_staging_finanzas')
    diagnosticPhase = 'service-role-access'
    result.serviceRoleExercised = true

    const hasLiveWriteAccess = async (_tx: TxSql, currentActorId: number): Promise<boolean> => {
      const rows = await client.query(`
        SELECT ua.activo,ua.rol::text AS rol,
          EXISTS(
            SELECT 1 FROM permiso_usuarios pu JOIN permiso_areas pa ON pa.id=pu.area_id
            WHERE pu.usuario_id=ua.id AND pu.escritura=true AND pa.activo=true
              AND pa.codigo IN ('admin','admin.finanzas','admin.finanzas.facturas')
          ) AS allowed
        FROM usuarios_admin ua WHERE ua.id=$1 LIMIT 2
      `, [currentActorId])
      return rows.rowCount === 1 && rows.rows[0]?.activo === true && rows.rows[0]?.rol !== 'SUPER_ADMIN' && rows.rows[0]?.rol !== 'GERENTE' && rows.rows[0]?.allowed === true
    }
    const tx = sqlTx(client)
    assert.equal(await hasLiveWriteAccess(tx, actorId), true, 'La aserción normal de permiso P2 debe permitir al actor sintético')
    diagnosticPhase = 'lease-guard'
    await client.query(`SELECT finance_sync_p2_assert_apply_guard($1::uuid,$2::uuid,$3,clock_timestamp()+interval '1 minute')`, [jobId, jobItemId, leaseToken])
    result.leaseGuardExercised = true

    const mainSupport: RegisteredConfirmingSupport = {
      registroSoporteId: mainRegistry, facturaRecibidaId: mainInvoice, oneDriveDriveId: drive, oneDriveItemId: mainItem,
      tipoDetectado: 'BBVA_PDF', parejaCaixaDeclaradaId: null, hashProcesadoAnterior: null,
    }
    const revSupport: RegisteredConfirmingSupport = {
      registroSoporteId: revRegistry, facturaRecibidaId: revInvoice, oneDriveDriveId: revDrive, oneDriveItemId: revItem,
      tipoDetectado: 'BBVA_PDF', parejaCaixaDeclaradaId: null, hashProcesadoAnterior: null,
    }
    for (const source of [mainSupport, revSupport]) {
      diagnosticPhase = 'registry-source'
      await queryOne(client, `
        INSERT INTO confirming_reading_support_sources (id,factura_recibida_id,onedrive_drive_id,onedrive_item_id,tipo_detectado,pareja_caixa_declarada_id,declared_by_id,declared_at)
        VALUES ($1,$2,$3,$4,$5,NULL,$6,CURRENT_TIMESTAMP)
      `, [source.registroSoporteId, source.facturaRecibidaId, source.oneDriveDriveId, source.oneDriveItemId, source.tipoDetectado, actorId])
    }
    for (const [invoice, item, kind] of [[pairPdfInvoice, `${mainItem}-pdf`, 'CAIXA_PDF'], [pairXlsInvoice, `${mainItem}-xls`, 'CAIXA_XLS']] as const) {
      diagnosticPhase = 'caixa-pair'
      await queryOne(client, `
        INSERT INTO confirming_reading_support_sources (id,factura_recibida_id,onedrive_drive_id,onedrive_item_id,tipo_detectado,pareja_caixa_declarada_id,declared_by_id,declared_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
      `, [randomUUID(), invoice, `${drive}-caixa`, item, kind, pair, actorId])
    }
    await rejected(client, 'pair-role-unique', '23505', () => client.query(`
      INSERT INTO confirming_reading_support_sources (id,factura_recibida_id,onedrive_drive_id,onedrive_item_id,tipo_detectado,pareja_caixa_declarada_id,declared_by_id,declared_at)
      VALUES ($1,$2,$3,$4,'CAIXA_PDF',$5,$6,CURRENT_TIMESTAMP)
    `, [randomUUID(), pairDuplicateInvoice, `${drive}-caixa`, `${mainItem}-pdf-duplicate`, pair, actorId]))
    result.caixaPairUnique = true

    const domain = createPrismaOneDriveDomain({} as never)
    diagnosticPhase = 'registry-version'
    assert.equal(await domain.registerConfirmingSupportVersion(tx as never, mainSupport, {
      lifecycleId: mainLifecycle, snapshotId: mainSnapshot, versionDocumento: 1, archivoControladoId: mainArtifact, sourceHash: pdfHash,
    }, actorId), true)
    assert.equal(await domain.registerConfirmingSupportVersion(tx as never, revSupport, {
      lifecycleId: revLifecycle, snapshotId: revSnapshot, versionDocumento: 1, archivoControladoId: revArtifact, sourceHash: pdfHash,
    }, actorId), true)
    result.registryVersion = true

    await queryOne(client, `
      INSERT INTO confirming_reading_support_source_revocations (id,source_id,revoked_by_id,motivo,idempotency_key,created_at)
      VALUES ($1,$2,$3,'fixture rollback revocation',$4,CURRENT_TIMESTAMP)
    `, [randomUUID(), revRegistry, actorId, sha256(`revocation:${tag}`)])
    await rejected(client, 'revoked-version', '23514', () => client.query(`
      INSERT INTO confirming_reading_support_versions (id,source_id,lifecycle_id,snapshot_id,version_documento,archivo_controlado_id,source_hash,recorded_by_id,created_at)
      VALUES ($1,$2,$3,$4,1,$5,$6,$7,CURRENT_TIMESTAMP)
    `, [randomUUID(), revRegistry, revLifecycle, revSnapshot, revArtifact, pdfHash, actorId]))
    await rejected(client, 'revocation-append-only', '55000', () => client.query(`
      UPDATE confirming_reading_support_source_revocations SET motivo='rewrite forbidden' WHERE source_id=$1
    `, [revRegistry]))
    result.revocationBlocked = true

    const snapshot = { lifecycleId: mainLifecycle, snapshotId: mainSnapshot, versionDocumento: 1 }
    diagnosticPhase = 'revocation'
    const registeredSource = {
      registroSoporteId: mainRegistry, facturaRecibidaId: mainInvoice, archivoControladoId: mainArtifact,
      oneDriveDriveId: drive, oneDriveItemId: mainItem, tipoDetectado: 'BBVA_PDF' as const, parejaCaixaDeclaradaId: null,
    }
    const source = { archivoPrivadoId: mainArtifact, versionContenido: mainSnapshot, hashBinario: pdfHash, tipoDetectado: 'BBVA_PDF' as const, hashProcesadoAnterior: null, parejaCaixaDeclaradaId: null }
    const bytes = new Uint8Array(Buffer.from('%PDF-1.7\nfixture-controlled\n', 'utf8'))

    const hashBroken = await prepareFinanceConfirmingReadingP2({
      source, contenidoControlado: bytes, nombreOriginal: 'fixture.pdf', parserPort: parser('0'.repeat(64)),
    })
    assert.equal(hashBroken.kind, 'PERSISTIR_REVISION')
    diagnosticPhase = 'parser-hash-review'
    const amber = await applyOneDriveConfirmingReadingAfterLifecycleTx({ tx, actorId, snapshot, prepared: hashBroken, registeredSource, assertLiveFinanceWriteAccess: hasLiveWriteAccess })
    assert.equal(amber.outcome, 'REVISAR')
    result.parserHashBreakReview = true

    const exact = await prepareFinanceConfirmingReadingP2({ source, contenidoControlado: bytes, nombreOriginal: 'fixture.pdf', parserPort: parser(pdfHash) })
    assert.equal(exact.kind, 'PERSISTIR_PROPUESTA')
    diagnosticPhase = 'c11-proposal'
    const proposed = await applyOneDriveConfirmingReadingAfterLifecycleTx({ tx, actorId, snapshot, prepared: exact, registeredSource, assertLiveFinanceWriteAccess: hasLiveWriteAccess })
    assert.equal(proposed.outcome, 'PROPUESTA_CONFIRMACION_HUMANA')
    assert.equal(proposed.confirmarB4Automaticamente, false)
    assert.equal(proposed.noEscriturasB4, true)
    const b4 = await client.query(`
      SELECT
        (SELECT count(*)::int FROM operaciones_justificacion_b4 WHERE movimiento_id=$1) AS operations,
        (SELECT count(*)::int FROM vinculos_movimiento_documento WHERE movimiento_id=$1) AS links,
        (SELECT count(*)::int FROM soportes_liquidacion_confirming WHERE movimiento_id=$1) AS supports
    `, [movementId])
    const b4Rows = b4.rows[0] ?? {}
    assert.deepEqual({ operations: Number(b4Rows.operations), links: Number(b4Rows.links), supports: Number(b4Rows.supports) }, { operations: 0, links: 0, supports: 0 })
    result.b4Writes = 0
    result.humanProposalOnly = true

    await client.query(`SELECT finance_sync_p2_assert_apply_guard($1::uuid,$2::uuid,$3,clock_timestamp()+interval '1 minute')`, [jobId, jobItemId, leaseToken])
    await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    throw ROLLBACK
  } catch (error) {
    if (error !== ROLLBACK) throw error
  } finally {
    try {
      if (client) {
        await client.query('ROLLBACK')
        rolledBack = true
      }
    } finally {
      if (locked) await client.query(`SELECT pg_advisory_unlock(hashtextextended($1,0))`, [LOCK_LABEL])
      if (before) {
        const after = await aggregates(client)
        result.sourceFingerprintsRestored = JSON.stringify(before) === JSON.stringify(after)
        result.sequenceFingerprintsRestored = beforeSequences === await sequenceAggregate(client)
        assert.equal(result.sourceFingerprintsRestored, true, 'Las huellas agregadas de fuentes no se restauraron tras ROLLBACK')
        assert.equal(result.sequenceFingerprintsRestored, true, 'Las secuencias no se restauraron tras ROLLBACK')
        assert.equal((await client.query(`SELECT to_regclass('public.confirming_reading_support_sources') AS registry`)).rows[0]?.registry, null)
      }
      await client.end()
    }
  }
  result.serializableRollback = rolledBack
  result.ok = result.localSocketValidated && result.serializableRollback && result.migrationAppliedInRollbackOnly
    && result.serviceRoleExercised && result.leaseGuardExercised && result.registryVersion && result.revocationBlocked
    && result.caixaPairUnique && result.parserHashBreakReview && result.humanProposalOnly
    && result.b4Writes === 0 && result.sourceFingerprintsRestored && result.sequenceFingerprintsRestored
  assert.equal(result.ok, true)
  console.log(JSON.stringify(result))
}

main().catch((error: unknown) => {
  // No IDs, SQL, paths, source rows, credentials or financial data leave this runner.
  console.error(JSON.stringify({ schema: 'CONFIRMING_CONTROLLED_SOURCE_SQL_RECEIPT_V1', ok: false, phase: diagnosticPhase, code: error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : 'CONFIRMING_SQL_TEST_FAILED' }))
  process.exitCode = 1
})
