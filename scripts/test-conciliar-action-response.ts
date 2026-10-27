import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const route = readFileSync(resolve(__dirname, '../app/api/admin/finanzas/conciliar/route.ts'), 'utf8')
const functionSource = route.match(/function actionResponse\([\s\S]*?\n}\n/)?.[0]
assert(functionSource, 'the real route response normalizer must exist')
let projectionReads = 0
const actionResponse = vm.runInNewContext(ts.transpileModule(functionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText + '\nactionResponse;', {
  operationId: (value: unknown) => typeof value === 'string' ? value : undefined,
  readResponse: (value: unknown) => {
    projectionReads += 1
    assert(value && typeof value === 'object', 'provided projection must be valid')
    return value
  },
  normalizeOutcome: (value: unknown) => value,
  text: (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback,
  refreshedAt: () => '2026-01-01T00:00:00.000Z',
}) as (command: Record<string, unknown>, raw: Record<string, unknown>) => Record<string, unknown>

const command = { action: 'confirmar', responseView: { tab: 'COBROS' } }
const receipt = { operationId: '11111111-1111-4111-8111-111111111111', outcomes: [{ ok: true }], projectionSynchronized: true }
const projection = { updatedAt: '2026-01-01T00:00:00.000Z', rows: [] }
const fresh = actionResponse(command, { ...receipt, projection })
assert.equal(fresh.projection, projection)
assert.equal(projectionReads, 1)
const replay = actionResponse(command, { ...receipt, idempotent: true })
assert.equal(replay.operationId, receipt.operationId)
assert.equal(replay.projection, undefined)
assert.equal(projectionReads, 1, 'a replay must not parse an absent transient snapshot')
const undo = actionResponse({ action: 'deshacer', operationId: receipt.operationId, responseView: { tab: 'COBROS' } }, {
  operationId: '22222222-2222-4222-8222-222222222222', ok: true, projectionSynchronized: true, idempotent: true,
})
assert.equal(undo.operationId, receipt.operationId)
assert.equal(undo.undone, true)
assert.equal(undo.projection, undefined)
assert.throws(() => actionResponse(command, { ...receipt, projection: null }), /provided projection must be valid/)
console.log('OK: fresh/replay/undo route responses; malformed supplied snapshots still fail closed')
