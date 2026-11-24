import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { Prisma } from '@prisma/client'
import * as core from '../lib/finanzas/conciliar-preparation-core'
import type { RebuildRow } from '../lib/finanzas/conciliar-db'
import { parsePreparationCli, saveConciliarPreparationArtifact, validatePreparationEnvironment } from './prepare-conciliar-view'

const product = readFileSync('lib/finanzas/conciliar-preparation.ts', 'utf8')
const dbSource = readFileSync('lib/finanzas/conciliar-db.ts', 'utf8')
const row = (id: string, movement: string | null, invoice?: string, links: string[] = []): RebuildRow => ({
  tab: movement ? 'PAGOS' : 'RECIBIDAS', cuentaId: movement ? 'account' : null,
  source: { kind: 'PAGO_FACTURA_RECIBIDA', ...(movement ? { movimientoId: movement, versionB4: 1 } : {}), ...(invoice ? { facturaRecibidaId: invoice } : {}) },
  sourceFingerprint: 'a'.repeat(64), row: { id, movimientoId: movement, fecha: '2026-11-03', concepto: 'Factura exacta', banco: null, cuenta: null,
    importeCentimos: -100, pendienteCentimos: -100, color: 'VERDE', grupo: 'FACTURA_RECIBIDA', motivo: 'Exacta', documento: null,
    propuesta: null, seleccionable: !!movement, diferenciaCentimos: 0, detail: null, linksMovimiento: links.map(id => ({ id, href: '/', etiqueta: 'Movimiento' })) },
})
let passed = 0
async function test(name: string, callback: () => unknown) { await callback(); passed++; console.log(`ok ${passed} ${name}`) }
function fixture(config: { rows?: RebuildRow[]; prior?: core.PreparationPrior[]; denied?: boolean; production?: boolean; role?: string; planFails?: boolean; guardAmber?: string; badCoverage?: boolean } = {}) {
  const rows = config.rows ?? [row('newA', 'm1', 'i1'), row('mirror', null, 'i1', ['newA']), row('newB', 'm2', 'i2')]
  let state = { stateXmin: '10', projectionVersion: '1', dirtyAt: '2026-11-03 19:26:00+01' as string | null, dirtyReason: 'INITIAL' as string | null }
  let queue = [{ kind: 'MOVEMENT', sourceId: 'm1', xmin: '9', changedAt: '2026-11-03 19:26:00+01' }]
  let epoch = 'b'.repeat(64), generationId = 'gen1', txId = 10, financial = new Map<string, RebuildRow>(), metadata = new Set<string>()
  const prior = config.prior ?? [{ id: 'oldA', movementId: 'm1', keys: ['RECEIVED:i1'], links: [] }]
  for (const old of prior) financial.set(old.id, row(old.id, old.movementId, old.keys[0]?.slice('RECEIVED:'.length)))
  const calls: string[] = [], transactions: Array<{ readonly: boolean; statements: string[]; options: any }> = []
  let active: any, inTransaction = false
  const sql = (statement: any) => statement.strings.join('?').replace(/\s+/g, ' ').trim()
  const tx = {
    $executeRaw: async (statement: any) => {
      const text = sql(statement); active.statements.push(text); calls.push(text)
      if (text === 'SET TRANSACTION READ ONLY') { active.readonly = true; return 0 }
      if (text === 'SET TRANSACTION READ WRITE') { active.readonly = false; return 0 }
      assert.equal(active.readonly, false, 'No DML in read-only phase')
      if (text.startsWith('DELETE FROM conciliar_proyecciones WHERE id IN')) { for (const id of statement.values) { financial.delete(id); metadata.delete(id) }; return statement.values.length }
      if (text.startsWith('INSERT INTO area3_conciliar_projection_changes')) {
        queue = queue.filter(q => q.kind !== core.PREPARATION_QUEUE_KIND)
        queue.push({ kind: core.PREPARATION_QUEUE_KIND, sourceId: core.PREPARATION_QUEUE_ID, xmin: String(txId), changedAt: 'now' }); return 1
      }
      if (text.startsWith('DELETE FROM area3_conciliar_projection_changes q USING')) {
        const old = JSON.parse(statement.values[0]); queue = queue.filter(q => !old.some((p: any) => p.kind === q.kind && p.sourceId === q.sourceId && p.xmin === q.xmin)); return 1
      }
      if (text.startsWith('DELETE FROM area3_conciliar_projection_changes WHERE kind=')) { queue = queue.filter(q => q.kind !== core.PREPARATION_QUEUE_KIND); return 1 }
      if (text.startsWith('UPDATE estado_proyeccion_conciliar SET read_accounts')) return 1
      if (text.startsWith('UPDATE estado_proyeccion_conciliar SET dirty_at')) {
        const reason = statement.values.find((v: any) => typeof v === 'string' && v.startsWith('AREA3_PREP'))
        state = { ...state, stateXmin: String(txId), projectionVersion: String(BigInt(state.projectionVersion) + BigInt(1)), dirtyReason: reason,
          dirtyAt: text.includes('dirty_at=NULL') ? null : state.dirtyAt ?? 'now' }; return 1
      }
      throw new Error(`Unexpected mock DML ${text}`)
    },
    $queryRaw: async (statement: any) => {
      const text = sql(statement); active.statements.push(text); calls.push(text)
      if (text.includes('FOR UPDATE')) assert.equal(active.readonly, false, 'No locks in plan/G7')
      if (text.startsWith('SELECT xmin::text')) return [structuredClone(state)]
      if (text.startsWith('SELECT kind,source_id')) return structuredClone(queue).sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
      if (text.startsWith('SELECT id::text AS id FROM modo_facil_generaciones')) return [{ id: generationId }]
      if (text.startsWith('SELECT current_database() AS database')) return [{ database: config.production ? 'railway' : 'io_staging_finanzas', role: config.production ? 'postgres' : 'io_staging_finanzas' }]
      if (text.startsWith('SELECT rebuilt_at IS NOT NULL')) return [{ ready: true }]
      if (text.startsWith('SELECT id,banco,alias FROM cuentas_bancarias')) return [{ id: 'account', banco: 'Banco', alias: 'Cuenta' }]
      if (text.startsWith('SELECT id,source_fingerprint AS fingerprint')) return [...financial.values()].sort((a, b) => a.row.id < b.row.id ? -1 : 1).map(p => ({ id: p.row.id, fingerprint: p.sourceFingerprint, color: p.row.color, selectable: p.row.seleccionable, metadataReady: !config.badCoverage && metadata.has(p.row.id) }))
      if (text.startsWith('SELECT p.id,p.movimiento_id')) return prior.map(p => ({ id: p.id, movementId: p.movementId,
        source: { facturaRecibidaId: p.keys.find(k => k.startsWith('RECEIVED:'))?.slice('RECEIVED:'.length) }, links: p.links.map(id => ({ id })), issuedIds: [] }))
      throw new Error(`Unexpected mock read ${text}`)
    },
  }
  const client = { $transaction: async (callback: any, options: any) => {
    assert.equal(inTransaction, false, 'No nested/global rebuild transaction')
    assert.ok([25_000, 10_000].includes(options.timeout)); assert.equal(options.maxWait, 2_000)
    txId++; inTransaction = true
    const before = { state: structuredClone(state), financial: structuredClone(financial), metadata: structuredClone(metadata), queue: structuredClone(queue) }
    active = { readonly: false, statements: [], options }; transactions.push(active)
    try { return await callback(tx) } catch (error) { state = before.state; financial = before.financial; metadata = before.metadata; queue = before.queue; throw error }
    finally { inTransaction = false; active = null }
  } }
  const dependencies = {
    '@prisma/client': { Prisma }, './conciliar-preparation-core': core,
    './conciliar-preparation-epoch': { readConciliarPreparationSourceEpochTx: async () => { calls.push('epoch'); assert.ok(!active.statements.some((s: string) => s.includes('FOR UPDATE')), 'Source hash precedes lock'); return epoch } },
    './conciliar-runtime': { assertConciliarRuntime: async (base: any) => { assert.equal(base, tx); calls.push('runtime'); return { runtime: config.production ? 'production' : 'staging' } } },
    './conciliar-live-access': { assertConciliarLiveAccessTx: async (base: any, actor: number) => { assert.equal(base, tx); calls.push('acl'); return config.denied ? { response: {} } : { actor: { id: actor, rol: config.role ?? 'SUPER_ADMIN' } } } },
    './conciliar-db': {
      readConciliarProjectionPlanSourcesTx: async (base: any) => { assert.equal(base, tx); assert.equal(active.readonly, true); calls.push('raw-global'); if (config.planFails) throw new Error('UNKNOWN_PLAN_ERROR'); return { rows } },
      calculateConciliarProjectionPlan: (sources: any) => {
        assert.equal(inTransaction, false, 'Calculation MUST run after source transaction closes'); calls.push('calculate-global')
        return { rows: sources.rows, emitted: 0, reservationKeys: rows.map(p => ({ rowId: p.row.id, keys: p.source.facturaRecibidaId ? [`RECEIVED:${p.source.facturaRecibidaId}`] : [] })) }
      },
      applyConciliarDocumentSourceGuardToRebuildRowsTx: async (base: any, page: RebuildRow[]) => {
        assert.equal(base, tx); assert.equal(active.readonly, true); calls.push(`document-guard:${page.length}`)
        return page.map(p => ({ ...structuredClone(p), source: { ...p.source, documentLifecycleVersionState: 'guarded-current' }, row: config.guardAmber === p.row.id ? { ...p.row, color: 'AMBAR', seleccionable: false } : p.row }))
      },
      sealConciliarProjectionRowsTx: async (base: any, page: RebuildRow[], context: RebuildRow[]) => {
        assert.equal(base, tx); assert.equal(active.readonly, false); assert.equal(context.length, rows.length)
        assert.ok(active.statements.includes('SET TRANSACTION READ WRITE'))
        assert.ok(!active.statements.some((s: string) => s.includes('FOR UPDATE NOWAIT')))
        assert.ok(context.every(p => p.source.documentLifecycleVersionState === 'guarded-current'), 'Full guarded context, not raw/old pages')
        calls.push(`seal:${page.length}`)
        return page.map(p => ({ ...structuredClone(p), source: { ...p.source, ...(p.row.color === 'VERDE' ? { g7Precheck: 'live-display-only' } : {}) } }))
      },
      insertProjectionBatches: async (base: any, page: RebuildRow[]) => {
        assert.equal(base, tx); assert.equal(active.readonly, false); assert.ok(page.length <= 500); calls.push(`insert:${page.length}`)
        for (const p of page) { if (p.row.color === 'VERDE') assert.equal(p.source.g7Precheck, 'live-display-only'); assert.equal(financial.has(p.row.id), false); financial.set(p.row.id, structuredClone(p)) }
        const claims = [...financial.values()].filter(p => p.row.movimientoId && p.source.facturaRecibidaId).map(p => p.source.facturaRecibidaId)
        assert.equal(claims.length, new Set(claims).size, 'No duplicate reservation across old/new batches')
      },
      materializeConciliarReadMetadataTx: async (base: any, ids: string[]) => { assert.equal(base, tx); assert.equal(active.readonly, false); calls.push(`metadata:${ids.length}`); ids.forEach(id => metadata.add(id)) },
    },
  }
  const compiled = ts.transpileModule(product, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  const exports: any = {}
  vm.runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name] }, BigInt, Map, Set, JSON, Number, Error, Promise, Array, Math })
  let saved: core.PreparationCheckpoint | undefined
  const save = async (c: core.PreparationCheckpoint) => { saved = structuredClone(c) }
  return { run: (overrides: any = {}) => exports.prepareConciliarProjection({ client, actorId: 7, mode: 'projection', batchSize: 4, save, ...overrides }),
    plan: (overrides: any = {}) => exports.createConciliarPreparationPlan({ client, actorId: 7, mode: 'projection', batchSize: 4, save, ...overrides }),
    get checkpoint() { return saved }, get financial() { return financial }, get metadata() { return metadata }, get state() { return state }, get queue() { return queue },
    calls, transactions, save,
    change: (kind = 'queue') => {
      if (kind === 'generation') generationId = 'gen2'
      else if (kind === 'policy' || kind === 'payroll-file') epoch = 'c'.repeat(64)
      else if (kind === 'old-ec') { state.stateXmin = '900'; state.dirtyReason = 'facturas' }
      else { queue[0].xmin = '900'; state.stateXmin = '900'; state.dirtyReason = 'AREA3_AFFECTED_CHANGE' }
    },
  }
}
async function main() {
  await test('atomic closure old/new swaps, disappeared IDs and mirrors; oversize cohort not split', () => {
    const rows = [row('new1', 'm1', 'i2'), row('new2', 'm2', 'i1'), row('mirror1', null, 'i1', ['new2'])]
    const prior = [{ id: 'old1', movementId: 'm1', keys: ['RECEIVED:i1'], links: [] }, { id: 'old2', movementId: 'm2', keys: ['RECEIVED:i2'], links: [] }]
    const batches = core.preparationReplacementBatches(prior, rows, rows.map(p => ({ rowId: p.row.id, keys: [`RECEIVED:${p.source.facturaRecibidaId}`] })), 4)
    assert.equal(batches.length, 1); assert.equal(batches[0].deleteIds.length, 2); assert.equal(batches[0].rowIds.length, 3)
    const mass = Array.from({ length: 501 }, (_, i) => row(`r${i}`, null, 'same'))
    assert.throws(() => core.preparationReplacementBatches([], mass, [], 20), /COMPONENT_TOO_LARGE/)
  })
  await test('167 issued mirrors + remittance publishes one bounded atomic cohort, seals in 20-row pages', async () => {
    const mass = [row('remittance', 'remittanceMovement'), ...Array.from({ length: 167 }, (_, i) => row(`mirror${i}`, null, undefined, ['remittance']))]
    const f = fixture({ rows: mass, prior: [] }); const result = await f.run({ batchSize: 20 })
    assert.equal(result.prepared, true); assert.equal(result.batches, 1); assert.ok(f.calls.includes('insert:168'))
    assert.equal(f.calls.filter(c => c.startsWith('seal:')).length, 9); assert.equal(f.state.dirtyAt, null)
  })
  await test('raw global picture closes before calculation; complete guard precedes G7; short apply no G7', async () => {
    const f = fixture(); const result = await f.run()
    assert.equal(result.projectionSynchronized, true); assert.equal(result.stale, false); assert.equal(result.queueConsumed, 1)
    assert.equal(f.calls.filter(x => x === 'calculate-global').length, 1); assert.equal(f.financial.has('oldA'), false); assert.equal(f.financial.size, 3)
    assert.equal(f.queue.length, 0); assert.equal(f.state.dirtyAt, null); assert.match(f.state.dirtyReason!, /^AREA3_PREP_DONE:/)
    assert.ok([...f.financial.values()].every(r => r.row.color === 'VERDE'), 'Not permanent all-amber')
    assert.ok(f.transactions.filter(t => t.readonly).every(t => !t.statements.some(s => /FOR UPDATE|DELETE|INSERT/.test(s))))
    assert.ok(f.transactions.filter(t => t.statements.some(s => s.includes('FOR UPDATE NOWAIT'))).every(t => t.options.timeout === 10_000))
    assert.ok(f.transactions.filter(t => t.statements.includes('SET TRANSACTION READ WRITE')).every(t => t.options.timeout === 25_000 && !t.statements.some(s => /DELETE|INSERT|UPDATE estado_/.test(s))))
  })
  await test('real guard amber retained and full guarded context supplied to all seal pages', async () => {
    const f = fixture({ guardAmber: 'newA' }); await f.run({ batchSize: 1 }); assert.equal(f.financial.get('newA')!.row.color, 'AMBAR')
    assert.equal(f.financial.get('newB')!.row.color, 'VERDE'); assert.equal(f.state.dirtyAt, null)
  })
  await test('metadata is never full prepared, does not change financial rows and retains sentinel/dirty', async () => {
    const f = fixture(); const before = structuredClone([...f.financial]); const result = await f.run({ mode: 'metadata' })
    assert.equal(result.prepared, false); assert.equal(result.projectionSynchronized, false); assert.deepEqual([...f.financial], before)
    assert.equal(f.queue.some(q => q.kind === core.PREPARATION_QUEUE_KIND), true); assert.ok(f.state.dirtyAt)
    assert.equal(f.calls.some(x => /calculate-global|seal:|insert:/.test(x)), false)
  })
  await test('sentinel committed before guard/seal; artifact loss cannot imply clean', async () => {
    const f = fixture(); await assert.rejects(f.run({ save: async (c: any) => { if (c.activated) throw new Error('DISK_CRASH') } }), /DISK_CRASH/)
    assert.equal(f.queue.some(q => q.kind === core.PREPARATION_QUEUE_KIND), true); assert.ok(f.state.dirtyAt)
    assert.equal(f.calls.some(x => x.startsWith('insert:')), false)
  })
  await test('activation commit-before-rename recovers exact job receipt without duplicate activation', async () => {
    const f = fixture(); let durable: any
    await assert.rejects(f.run({ save: async (c: any) => { if (c.activated) throw new Error('DISK_CRASH'); durable = structuredClone(c) } }), /DISK_CRASH/)
    await f.run({ checkpoint: durable }); assert.equal(f.calls.filter(c => c.startsWith('INSERT INTO area3')).length, 1)
  })
  await test('resume after seal crash skips completed raw plan, guard and seals', async () => {
    const f = fixture(); let durable: any
    await assert.rejects(f.run({ save: async (c: any) => { durable = structuredClone(c); if (c.sealCursor > 0 && !c.applyCursor) throw new Error('STOP') } }), /STOP/)
    await f.run({ checkpoint: durable }); assert.equal(f.calls.filter(x => x === 'raw-global').length, 1); assert.equal(f.calls.filter(x => x.startsWith('seal:')).length, 1)
  })
  await test('apply and completion commit-before-checkpoint recover without repeating DML', async () => {
    for (const completion of [false, true]) {
      const f = fixture(); let durable: any
      await assert.rejects(f.run({ save: async (c: any) => { if (completion ? c.completed : c.applyCursor > 0) throw new Error('DISK_CRASH'); durable = structuredClone(c) } }), /DISK_CRASH/)
      const inserts = f.calls.filter(x => x.startsWith('insert:')).length
      await f.run({ checkpoint: durable }); assert.equal(f.calls.filter(x => x.startsWith('insert:')).length, inserts)
    }
  })
  await test('same-source xmin, latest generation, policy/payroll document and old EC state invalidate resume', async () => {
    for (const kind of ['queue', 'generation', 'policy', 'payroll-file', 'old-ec']) {
      const f = fixture(); let durable: any
      await assert.rejects(f.run({ save: async (c: any) => { durable = structuredClone(c); if (c.sealCursor) throw new Error('STOP') } }), /STOP/)
      f.change(kind); await assert.rejects(f.run({ checkpoint: durable }), /SOURCE_CHANGED_REPLAN_REQUIRED/)
      assert.equal(f.financial.has('oldA'), true); assert.equal(f.calls.some(x => x.startsWith('insert:')), false)
      assert.equal(f.queue.some(q => q.kind === core.PREPARATION_QUEUE_KIND), true)
    }
  })
  await test('concurrent source change between seal and apply never resurrects rows', async () => {
    const f = fixture(); await assert.rejects(f.run({ save: async (c: any) => { if (c.sealCursor && !c.applyCursor) f.change('policy') } }), /SOURCE_CHANGED_REPLAN_REQUIRED/)
    assert.equal(f.financial.has('oldA'), true); assert.ok(f.state.dirtyAt)
  })
  await test('completion checks coverage and fails closed; final cleanup rollback retains sentinel', async () => {
    const f = fixture({ badCoverage: true }); await assert.rejects(f.run(), /COMPLETION_COVERAGE_FAILED/)
    assert.ok(f.state.dirtyAt); assert.equal(f.queue.some(q => q.kind === core.PREPARATION_QUEUE_KIND), true)
  })
  await test('runtime ACL planner error fail closed; production only explicit actor 3 live SUPER_ADMIN', async () => {
    for (const config of [{ denied: true }, { production: true }, { planFails: true }]) {
      const f = fixture(config); await assert.rejects(f.run()); assert.equal(f.calls.some(x => /FOR UPDATE|insert:|metadata:/.test(x)), false)
    }
    const f = fixture({ production: true }); await f.run({ actorId: 3, productionPredeploy: true }); assert.equal(f.state.dirtyAt, null)
    await assert.rejects(fixture({ production: true, role: 'GERENTE' }).run({ actorId: 3, productionPredeploy: true }), /PRODUCTION_COMMAND_REQUIRED/)
    await assert.rejects(fixture().run({ actorId: null }), /ACTOR_REQUIRED/)
  })
  await test('private artifact corruption, schema and full coverage rejected; CLI strict production target/gates', async () => {
    const c = await fixture().plan(); assert.equal(core.validatePreparationCheckpoint(c).planHash, c.planHash)
    const bad = structuredClone(c); bad.sealCursor = 1; assert.throws(() => core.validatePreparationCheckpoint(bad), /CHECKPOINT_INVALID/)
    const omitted = structuredClone(c); omitted.plan = { ...omitted.plan, batches: [] }; omitted.planHash = core.preparationHash(omitted.plan)
    assert.throws(() => core.validatePreparationCheckpoint(core.signPreparationCheckpoint(omitted)), /COVERAGE_INVALID/)
    assert.throws(() => parsePreparationCli(['--env-file', '/tmp/x', '--checkpoint', '/tmp/c', '--actor-id', '7', '--batch-size', '101']), /ARGUMENT_INVALID/)
    assert.throws(() => parsePreparationCli(['--env-file', '/tmp/x', '--checkpoint', '/tmp/c', '--actor-id', '7', '--production-predeploy']), /ARGUMENT_INVALID/)
    assert.throws(() => parsePreparationCli(['--env-file', '/tmp/x', '--checkpoint', '/tmp/c', '--actor-id', '3', '--jwt', 'patched']), /ARGUMENT_INVALID/)
    const production = { DATABASE_URL: 'postgresql://postgres:example@yamanote.proxy.rlwy.net:34880/railway', VERCEL_ENV: 'production', FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_MODEL_PRODUCTION_ENABLED: '1', FINANCE_AUTOMATIC_LINKS_DISABLED: '1', FINANCE_CONCILIAR_PRODUCTION_ENABLED: '1', NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED: '1' }
    validatePreparationEnvironment(production, true)
    assert.throws(() => validatePreparationEnvironment({ ...production, DATABASE_URL: 'postgresql://postgres:example@arbitrary:5432/railway' }, true), /PRODUCTION_TARGET_REQUIRED/)
    assert.throws(() => validatePreparationEnvironment({ ...production, FINANCE_CONCILIAR_PRODUCTION_ENABLED: '0' }, true), /PRODUCTION_TARGET_REQUIRED/)
    assert.throws(() => validatePreparationEnvironment(production, false), /STAGING_TARGET_REQUIRED/)
    const dir = mkdtempSync(join(tmpdir(), 'conciliar-preparation-')); chmodSync(dir, 0o700)
    try { const file = join(dir, 'checkpoint.json'); await saveConciliarPreparationArtifact(file, c); assert.equal(core.validatePreparationCheckpoint(JSON.parse(readFileSync(file, 'utf8'))).planHash, c.planHash); chmodSync(file, 0o644); await assert.rejects(saveConciliarPreparationArtifact(file, c), /PRIVATE_FILE_REQUIRED/) } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  await test('source constraints: no full delete, no action edits/cache bypass; SQL hash all public sources before lock', () => {
    assert.doesNotMatch(product, /DELETE FROM conciliar_proyecciones(?:`|\s*\))/)
    assert.doesNotMatch(product, /rebuildConciliarProjectionTx|runWith.*Authorization|AsyncLocalStorage|JWT|pendingProjection/)
    const calculation = dbSource.slice(dbSource.indexOf('export function calculateConciliarProjectionPlan'), dbSource.indexOf('export async function planConciliarProjectionRowsTx'))
    assert.doesNotMatch(calculation, /\$queryRaw|\$executeRaw|\bawait\b|FOR UPDATE/)
    const provider = calculation.slice(calculation.indexOf('const providerPayments:'), calculation.indexOf('const providerAssignments ='))
    assert.ok(provider.includes('if (selectedMovementIds && !selectedMovementIds.has(String(movement.id))) continue'))
    assert.match(product, /readConciliarProjectionPlanSourcesTx\(tx, undefined, true\)/)
    const epoch = readFileSync('lib/finanzas/conciliar-preparation-epoch.ts', 'utf8')
    assert.match(epoch, /n\.nspname='public'/); assert.match(epoch, /to_jsonb\(s\)::text\|\|':'\|\|s\.xmin::text/); assert.doesNotMatch(epoch, /FOR UPDATE|FOR SHARE/)
    const consumer = readFileSync('lib/finanzas/conciliar-affected-refresh.ts', 'utf8')
    assert.ok(consumer.indexOf('INCOMPLETE_FULL_PREPARATION_REQUIRED') < consumer.indexOf('if (!changes.length)'))
  })
  console.log(JSON.stringify({ test: 'conciliar-preparation', passed, databaseQueries: 0, financialWrites: 0 }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
