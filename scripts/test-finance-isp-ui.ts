import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import {
  canReadAnnualIsp,
  currentMadridYear,
  ispAnnualConfirmation,
  parseSyncJobMutation,
  parseSyncJobsState,
  syncJobCreateRequest,
  syncJobIntentKey,
} from '../components/finanzas/sync-jobs/sync-job-types'

/**
 * Pure browser contracts + static JSX/handler wiring. No component harness,
 * app imports, environment, DB, API, provider, ports, build or typecheck.
 * Run: ./node_modules/.bin/tsx scripts/test-finance-isp-ui.ts
 */
const now = new Date('2026-11-06T14:00:00Z')
const legacyJob = {
  id: 'ui-test-job', source: 'ISP', status: 'COMPLETED', phase: 'FINALIZING',
  total: 4, processed: 4, nuevas: 1, actualizadas: 1, unchanged: 2, errores: 0,
  createdAt: '2026-11-06T10:00:00Z', startedAt: '2026-11-06T10:01:00Z',
  finishedAt: '2026-11-06T10:02:00Z', lastError: null,
}
const legacyState = { enabled: true, canWrite: true, activeJob: null, lastJob: legacyJob }
const annualScope = {
  version: 1, mode: 'YEAR', year: 2025,
  fromInclusive: '2025-01-01', toExclusive: '2026-01-01', zone: 'Europe/Madrid',
}
const recentScope = {
  version: 1, mode: 'RECENT_3_MONTHS',
  fromInclusive: '2026-09-01', toExclusive: '2026-12-01', zone: 'Europe/Madrid',
}
const diagnostic = {
  code: 'P2003', name: 'PrismaClientKnownRequestError', operation: 'Factura.create',
  sqlState: '23503', constraint: 'Factura_reference_fkey', message: 'La referencia no es válida.',
}

function parsedState(body: unknown) {
  const parsed = parseSyncJobsState(body)
  assert.equal(parsed.ok, true, parsed.ok === false ? parsed.error : '')
  return parsed.value
}

function testOptionalDtoAndAuthorization() {
  const legacy = parsedState(legacyState)
  assert.equal(legacy.canAnnual, false)
  assert.equal(legacy.lastJob?.scope, null)
  assert.equal(legacy.lastJob?.requestedById, null)
  assert.equal(legacy.lastJob?.lastErrorDetail, null)
  assert.equal(canReadAnnualIsp('ISP', legacy), false)
  assert.equal(canReadAnnualIsp('ISP', null), false)
  assert.equal(canReadAnnualIsp('ISP', { ...legacy, canAnnual: true }), true)
  assert.equal(canReadAnnualIsp('ONEDRIVE', { ...legacy, canAnnual: true }), false)
  assert.equal(canReadAnnualIsp('ISP', { ...legacy, canAnnual: 'true' } as never), false)
  for (const malformed of ['true', 1, null]) {
    assert.equal(parseSyncJobsState({ ...legacyState, canAnnual: malformed }).ok, false)
  }

  const extended = parsedState({
    ...legacyState, canAnnual: true,
    lastJob: { ...legacyJob, scope: annualScope, requestedById: 17, lastErrorDetail: diagnostic },
  })
  assert.deepEqual(extended.lastJob?.scope, annualScope)
  assert.equal(extended.lastJob?.requestedById, 17)
  assert.deepEqual(extended.lastJob?.lastErrorDetail, diagnostic)
  const recent = parsedState({ ...legacyState, lastJob: { ...legacyJob, scope: recentScope } })
  assert.deepEqual(recent.lastJob?.scope, recentScope)
  assert.equal(parsedState({ ...legacyState, lastJob: { ...legacyJob, scope: {} } }).lastJob?.scope, null)
  assert.equal(parseSyncJobMutation({ job: legacyJob }).ok, true)
  assert.equal(parseSyncJobMutation({ job: { ...legacyJob, scope: annualScope, requestedById: 17, lastErrorDetail: diagnostic } }).ok, true)

  const oneDrive = parsedState({
    ...legacyState, lastJob: { ...legacyJob, source: 'ONEDRIVE', scope: { unrelatedOneDriveScope: true } },
  })
  assert.equal(oneDrive.lastJob?.source, 'ONEDRIVE')
  assert.equal(oneDrive.lastJob?.scope, null)
  assert.equal(oneDrive.canWrite, true)
  for (const badId of [0, -1, 1.5, '17', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseSyncJobMutation({ job: { ...legacyJob, requestedById: badId } }).ok, false)
  }
  for (const badScope of [
    { ...annualScope, year: '2025' }, { ...annualScope, zone: 'UTC' },
    { ...annualScope, toExclusive: '2025-12-01' }, { ...annualScope, fromInclusive: '2025-13-01' },
    { ...recentScope, toExclusive: '2026-11-01' }, { ...recentScope, year: 2026 },
  ]) {
    assert.equal(parseSyncJobMutation({ job: { ...legacyJob, scope: badScope } }).ok, false)
  }
  assert.equal(parseSyncJobMutation({ job: { ...legacyJob, processed: undefined } }).ok, false, 'Los contadores obligatorios no se inventan')
  assert.equal(parseSyncJobMutation({ job: { ...legacyJob, processed: 5 } }).ok, false)
}

function testClosedIntentsAndMadridYear() {
  assert.equal(currentMadridYear(now), 2026)
  assert.equal(currentMadridYear(new Date('2026-12-31T23:30:00Z')), 2027, 'Medianoche de Madrid, no año UTC')
  assert.equal(currentMadridYear(new Date('2026-12-31T22:30:00Z')), 2026)
  const normal = syncJobCreateRequest('ISP', 'normal-key', { scope: { actorId: 999, mode: 'YEAR' } }, now)
  assert.deepEqual(normal, { source: 'ISP', idempotencyKey: 'normal-key' })
  const annual = syncJobCreateRequest('ISP', 'annual-key', { year: 2025, scope: { actorId: 999 } }, now)
  assert.deepEqual(annual, { source: 'ISP', idempotencyKey: 'annual-key', mode: 'YEAR', year: 2025, confirmed: true })
  assert.deepEqual(Object.keys(annual).sort(), ['confirmed', 'idempotencyKey', 'mode', 'source', 'year'])
  assert.equal('scope' in annual, false)
  assert.equal('requestedById' in annual, false)
  assert.equal('actorId' in annual, false)
  for (const year of [2009, 2027, 2025.5, NaN, '2025' as never]) {
    assert.throws(() => syncJobCreateRequest('ISP', 'key', { year }, now))
  }
  for (const year of [2010, 2026]) {
    assert.equal(syncJobCreateRequest('ISP', 'key', { year }, now).year, year)
  }
  assert.throws(() => syncJobCreateRequest('ONEDRIVE', 'key', { year: 2025 }, now))
  const oldScope = { folder: 'old-folder' }
  assert.deepEqual(syncJobCreateRequest('ONEDRIVE', 'old-key', { scope: oldScope }, now), {
    source: 'ONEDRIVE', idempotencyKey: 'old-key', scope: oldScope,
  })
  assert.deepEqual(syncJobCreateRequest('ONEDRIVE', 'old-key', {}, now), { source: 'ONEDRIVE', idempotencyKey: 'old-key' })
  const prefixes = [syncJobIntentKey('ISP'), syncJobIntentKey('ISP', 2024), syncJobIntentKey('ISP', 2025), syncJobIntentKey('ONEDRIVE')]
  assert.equal(new Set(prefixes).size, 4)
  assert.equal(prefixes[0], 'ISP:RECENT_3_MONTHS')
  assert.equal(prefixes[2], 'ISP:YEAR:2025')
  assert.throws(() => syncJobIntentKey('ONEDRIVE', 2025))
  const confirmation = ispAnnualConfirmation(2025)
  assert.match(confirmation, /año completo 2025/)
  assert.match(confirmation, /todo el año 2025/)
  assert.match(confirmation, /no modifica los cobros financieros/)
}

function testDiagnosticBoundary() {
  const parsed = parseSyncJobMutation({ job: {
    ...legacyJob, lastErrorDetail: { ...diagnostic, rawSql: 'PRIVATE', payload: { private: true }, stack: 'PRIVATE' },
  } })
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.deepEqual(parsed.value.job.lastErrorDetail, diagnostic)
  for (const badDetail of [
    { ...diagnostic, message: '' }, { ...diagnostic, operation: {} },
    { ...diagnostic, message: 'bad\u0000control' }, { ...diagnostic, message: 'x'.repeat(1001) },
  ]) {
    assert.equal(parseSyncJobMutation({ job: { ...legacyJob, lastErrorDetail: badDetail } }).ok, false)
  }
}

function testUiWiringWithoutHarness() {
  const file = readFileSync(new URL('../components/finanzas/sync-jobs/SyncJobPanel.tsx', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('SyncJobPanel.tsx', file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal((ast as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length, 0, 'Sintaxis TSX válida; no es un typecheck')
  const arrow = (name: string) => {
    let found: ts.ArrowFunction | undefined
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer && ts.isArrowFunction(node.initializer)) found = node.initializer
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert(found, `Handler ${name} encontrado`)
    return found.getText(ast)
  }
  const start = arrow('startJob')
  assert.match(start, /if \(!annualVisible/)
  assert.match(start, /if \(!window\.confirm\(ispAnnualConfirmation\(year\)\)\) return/)
  assert(start.indexOf('window.confirm') < start.indexOf('idempotencyKeysRef.current.set'), 'Cancelar no asigna clave')
  assert(start.indexOf('window.confirm') < start.indexOf('fetch(ENDPOINT'), 'Cancelar no hace POST')
  assert.match(start, /syncJobCreateRequest\(source, idempotencyKey, \{ scope, year \}\)/)
  assert.match(start, /syncJobIntentKey\(source, year\)/)
  assert.match(start, /idempotencyKeysRef\.current\.get\(intent\)\s+\?\?/)
  assert.match(start, /`\$\{intent\}:\$\{createIdempotencyKey\(\)\}`/)
  assert.match(start, /source === 'ISP' \? `\$\{intent\}:\$\{createIdempotencyKey\(\)\}` : createIdempotencyKey\(\)/, 'Formato anterior de clave OneDrive conservado')
  assert.doesNotMatch(start, /idempotencyKeysRef\.current\.(?:delete|clear)/, 'Un POST fallido conserva la clave de su intención')
  assert.match(file, /const intent = acceptedIntentsRef\.current\.get\(displayedJob\.id\)\s+if \(intent !== undefined\)/, 'Un terminal ajeno no elimina la clave fallida')
  assert.match(file, /idempotencyKeysRef\.current\.delete\(intent\)/, 'Finalizar retira sólo su intención')
  assert.doesNotMatch(file, /idempotencyKeysRef\.current\.clear/)
  assert.match(file, /canReadAnnualIsp\(source, state\)/)
  assert.match(file, /\{annualVisible && <div/)
  assert.match(file, /onClick=\{\(\) => void startJob\(annualYear\)\}/)
  assert.match(file, /onClick=\{\(\) => void startJob\(\)\}/)
  assert.match(file, /Number\(event\.target\.value\)/)
  assert.match(file, /2010 \+ index/)
  assert.match(file, /Sincronizar últimos 3 meses/)
  assert.match(file, /Leer año completo/)
  assert.match(file, /selecciona localmente/)
  assert.match(file, /Solicitado por usuario \{displayedJob\.requestedById\}/)
  assert.doesNotMatch(file, /dangerouslySetInnerHTML|innerHTML|outerHTML/)
  for (const field of ['message', 'operation', 'code', 'sqlState', 'constraint']) {
    assert(file.includes(`{displayedJob.lastErrorDetail.${field}}`), `Diagnóstico ${field} interpolado como texto JSX`)
  }
  assert.doesNotMatch(file, /lastErrorDetail\.(?:rawSql|stack|payload)/)
  assert.match(file, /source === 'ISP' \? 'Sincronizar últimos 3 meses' : 'Iniciar sincronización'/, 'Botón OneDrive conservado')
}

testOptionalDtoAndAuthorization()
testClosedIntentsAndMadridYear()
testDiagnosticBoundary()
testUiWiringWithoutHarness()
console.log('Finance ISP UI: DTO legado/opcional, autorización anual, Madrid, intención cerrada, claves por modo/año, confirmación y diagnóstico JSX verificados sin BD/red/harness/puertos.')
