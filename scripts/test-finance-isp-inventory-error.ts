import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createIspIssuedInvoiceProvider,
  IspInvoiceSyncError,
} from '../lib/finanzas/sync-jobs/providers/isp/isp-issued-invoice-provider'
import { syncFailureDetail, type SyncFailureDetail } from '../lib/finanzas/sync-jobs/isp-sync-errors'
import { safeError, type FinanceSyncRepository } from '../lib/finanzas/sync-jobs/repository'
import { PrismaFinanceSyncRepository } from '../lib/finanzas/sync-jobs/prisma-repository'
import { FinanceSyncWorker } from '../lib/finanzas/sync-jobs/worker'
import type { SyncJobRecord } from '../lib/finanzas/sync-jobs/types'

/** Run with ./node_modules/.bin/tsx scripts/test-finance-isp-inventory-error.ts; only fakes, no DB/network. */
const fakeUrl = 'https://usuario-ficticio:clave-ficticia@example.invalid/facturacion'
const fakeSecret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const licenseCause = 'Esta función requiere la API avanzada de ISP Gestión, que no está contratada en esta instancia. Contacta con soporte para contratarla.'

function axiosFailure(status?: number, data: Record<string, unknown> = {}, code = 'ERR_BAD_REQUEST') {
  return Object.assign(new Error(`Petición fallida ${fakeUrl} Bearer ${fakeSecret}`), {
    code,
    ...(status === undefined ? {} : { response: { status, data, headers: { Authorization: `Bearer ${fakeSecret}` } } }),
    config: { url: fakeUrl, headers: { Authorization: `Bearer ${fakeSecret}` }, auth: { username: 'usuario-ficticio', password: 'clave-ficticia' } },
  })
}

function assertSafeText(text: string) {
  for (const forbidden of [fakeUrl, fakeSecret, 'usuario-ficticio', 'clave-ficticia', 'example.invalid']) {
    assert(!text.includes(forbidden), 'Se ha filtrado un dato privado simulado')
  }
  assert.doesNotMatch(text, /[\r\n<>]|https?:|bearer|token|@/i)
}

async function assertInventoryFailure(original: unknown, expectedCode: string): Promise<IspInvoiceSyncError> {
  const provider = createIspIssuedInvoiceProvider({ request: async () => { throw original } })
  let captured: IspInvoiceSyncError | undefined
  await assert.rejects(() => provider.inventory(null), (error: unknown) => {
    assert(error instanceof IspInvoiceSyncError)
    captured = error
    assert.equal(error.code, expectedCode)
    assert.match(error.code, /^[A-Z0-9_]{2,64}$/)
    assert.equal(safeError(error), expectedCode)
    const diagnostic = syncFailureDetail(error)
    assert(diagnostic, 'El diagnóstico de inventario debe pasar la validación')
    assert.deepEqual(diagnostic, {
      code: expectedCode, name: 'Error', operation: 'ISP.inventory',
      sqlState: null, constraint: null, message: error.message,
    })
    assert(diagnostic.message.length > 0 && diagnostic.message.length <= 500)
    assertSafeText(JSON.stringify({ last_error: safeError(error), last_error_detail: diagnostic, message: error.message }))
    assert.equal('config' in error, false)
    assert.equal('response' in error, false)
    assert.equal('cause' in error, false)
    return true
  })
  return captured!
}

const cases: Array<{ name: string; error: unknown; code: string; status?: number }> = [
  { name: '403 licencia en details', error: axiosFailure(403, { success: false, error: 'Acceso denegado', status: 403, statusText: 'Forbidden', details: licenseCause }), code: 'ISP_API_LICENCIA_NO_CONTRATADA', status: 403 },
  { name: '403 API avanzada en error', error: axiosFailure(403, { error: 'Se requiere la API avanzada' }), code: 'ISP_API_LICENCIA_NO_CONTRATADA', status: 403 },
  { name: '403 no contratada sin tilde', error: axiosFailure(403, { details: 'La función no esta contratada' }), code: 'ISP_API_LICENCIA_NO_CONTRATADA', status: 403 },
  { name: '403 licencia genérica', error: axiosFailure(403, { error: 'Licencia insuficiente' }), code: 'ISP_API_LICENCIA_NO_CONTRATADA', status: 403 },
  { name: '403 sin licencia', error: axiosFailure(403, { details: 'El acceso está prohibido.' }), code: 'ISP_HTTP_403', status: 403 },
  { name: '401', error: axiosFailure(401, { error: 'La petición no está autorizada.' }), code: 'ISP_HTTP_401', status: 401 },
  { name: '500', error: axiosFailure(500, { details: 'El servicio no está disponible.' }), code: 'ISP_HTTP_500', status: 500 },
  { name: 'otro HTTP tiene prioridad sobre timeout', error: axiosFailure(429, {}, 'ETIMEDOUT'), code: 'ISP_HTTP_429', status: 429 },
  ...['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].map(code => ({ name: code, error: axiosFailure(undefined, {}, code), code: 'ISP_RED_O_TIMEOUT' })),
  { name: 'error sin response', error: axiosFailure(), code: 'ISP_ERROR_INVENTARIO' },
  { name: 'error desconocido', error: null, code: 'ISP_ERROR_INVENTARIO' },
]

for (const scenario of cases) {
  test(`inventory: ${scenario.name} guarda código y diagnóstico saneados`, async () => {
    const error = await assertInventoryFailure(scenario.error, scenario.code)
    if (scenario.status) assert.match(error.message, new RegExp(`ISP respondió ${scenario.status}:`))
    if (scenario.code === 'ISP_API_LICENCIA_NO_CONTRATADA') assert.match(error.message, /API avanzada no está contratada/)
  })
}

test('inventory: sanea también URLs, correos, credenciales y cadenas largas dentro de la causa', async () => {
  const details = `El servicio no está disponible.\n<${fakeUrl}> contacto@example.invalid Authorization: Bearer ${fakeSecret} TOKEN=${fakeSecret} ${fakeSecret} Authorization: Bearer CORTO-FICTICIO token=OTRO-FICTICIO`
  const error = await assertInventoryFailure(axiosFailure(500, { details }), 'ISP_HTTP_500')
  assert.match(error.message, /El servicio no está disponible/)
  assert.doesNotMatch(error.message, /[A-Za-z0-9]{24,}/)
  assert.doesNotMatch(error.message, /CORTO-FICTICIO|OTRO-FICTICIO/)
})

test('inventory: trunca la causa a 500 caracteres sin invalidar el diagnóstico', async () => {
  const error = await assertInventoryFailure(axiosFailure(500, { details: 'Fallo temporal del servicio. '.repeat(40) }), 'ISP_HTTP_500')
  assert.equal(error.message.length, 500)
})

test('inventory: la respuesta correcta y los errores posteriores a request no cambian', async () => {
  const calls: unknown[] = []
  const provider = createIspIssuedInvoiceProvider({ request: async (...args) => { calls.push(args); return [] } })
  const result = await provider.inventory(null)
  assert.equal(result.complete, true)
  assert.deepEqual(result.items, [])
  assert.deepEqual(calls, [['facturacion', 'GET', null, { mostrar: 5000 }]])
  const invalid = createIspIssuedInvoiceProvider({ request: async () => ({ success: true }) })
  await assert.rejects(() => invalid.inventory(null), (error: unknown) => {
    assert(error instanceof IspInvoiceSyncError)
    assert.equal(error.code, 'RESPUESTA_FACTURACION_INVALIDA')
    assert.equal(syncFailureDetail(error), null)
    return true
  })
  const laterError = new Error('Fallo posterior a la petición')
  const filtered = createIspIssuedInvoiceProvider({ request: async () => [], filterChanged: async () => { throw laterError } })
  await assert.rejects(() => filtered.inventory(null), (error: unknown) => error === laterError)
})

test('worker y repositorio guardan last_error y last_error_detail sin datos de axios', async () => {
  const now = new Date('2026-11-24T00:00:00.000Z')
  const job: SyncJobRecord = {
    id: '11111111-1111-4111-8111-111111111111', source: 'ISP', status: 'RUNNING', phase: 'INVENTORY', trigger: 'MANUAL',
    idempotencyKey: 'inventory-error-fixture', requestHash: '', scope: {}, checkpoint: {}, actorId: 7,
    attempts: 0, recoveries: 0, cancelRequestedAt: null, leaseToken: null, leaseUntil: null, lastError: null,
    total: 0, processed: 0, nuevas: 0, actualizadas: 0, errores: 0, unchanged: 0, cancelled: 0,
    createdAt: now, startedAt: now, finishedAt: null,
  }
  const writes: Array<{ statement: string; values: unknown[] }> = []
  const tx = {
    $executeRaw: async (statement: TemplateStringsArray, ...values: unknown[]) => {
      writes.push({ statement: statement.join('?'), values })
      return 1
    },
  }
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
  const persistence = new PrismaFinanceSyncRepository(prisma as never)
  let failure: { safeError: string; detail?: SyncFailureDetail | null } | undefined
  let released = false
  const repository: Partial<FinanceSyncRepository> = {
    claimNextJob: async ({ token }) => ({ job, token }),
    recordWorkerFailure: async (input) => { failure = input; await persistence.recordWorkerFailure(input) },
    releaseJob: async () => { released = true },
    persistInventory: async () => { assert.fail('No se debe persistir un inventario fallido') },
  }
  const worker = new FinanceSyncWorker({
    repository: repository as FinanceSyncRepository,
    providerFactory: () => createIspIssuedInvoiceProvider({ request: async () => { throw axiosFailure(403, { details: licenseCause }) } }),
    clock: { now: () => now },
  })
  await assert.rejects(() => worker.run({ budgetMs: 10_000, itemLimit: 1, maxRecoveries: 1 }), (error: unknown) => {
    assert(error instanceof IspInvoiceSyncError)
    assert.equal(error.code, 'ISP_API_LICENCIA_NO_CONTRATADA')
    return true
  })
  assert(released)
  assert.equal(failure?.safeError, 'ISP_API_LICENCIA_NO_CONTRATADA')
  assert(failure?.detail)
  const jobWrite = writes.find(write => write.statement.includes('UPDATE finance_sync_jobs_p2 SET'))
  assert(jobWrite)
  assert.match(jobWrite.statement, /last_error=\?,last_error_detail=\?::jsonb/)
  assert(jobWrite.values.includes('ISP_API_LICENCIA_NO_CONTRATADA'))
  assert(jobWrite.values.includes(JSON.stringify(failure.detail)), 'Debe guardarse el diagnóstico JSON, no null')
  assert.match(jobWrite.statement, /THEN 'FAILED'/)
  assertSafeText(JSON.stringify(writes.map(write => write.values)))
})
