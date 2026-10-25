import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'

type IdentityRow = { database_name: string; database_user: string }
type RuntimeModule = typeof import('../lib/finanzas/prototype-staging')
type QueryResult = () => Promise<IdentityRow[]>
type LoadableModule = Module & {
  filename: string
  paths: string[]
  _compile(content: string, filename: string): void
}

type ModuleInternals = typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown
  _nodeModulePaths(path: string): string[]
}

const sourcePath = join(process.cwd(), 'lib/finanzas/prototype-staging.ts')
const source = readFileSync(sourcePath, 'utf8')

assert.match(source, /import\s+\{\s*cache\s*\}\s+from\s+['"]react['"]/, 'liveIdentity debe usar React.cache')
assert.match(source, /const\s+liveIdentity\s*=\s*cache\(async function liveIdentity/, 'sólo la identidad viva debe quedar memoizada por render')
assert.doesNotMatch(source, /new\s+Map\s*\(/, 'no se admite una caché global manual')
assert.doesNotMatch(source, /unstable_cache|revalidate|cacheLife/, 'no se admite TTL ni caché de datos persistente')

const requestStore = new AsyncLocalStorage<Map<symbol, Promise<unknown>>>()
const queryResultStore = new AsyncLocalStorage<QueryResult>()

// This mirrors the property relevant here: React.cache has a cache boundary per
// server render. Calls made with no render boundary deliberately are not retained.
function renderCache<Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>) {
  const cacheKey = Symbol('react-request-cache')
  return (...args: Args): Promise<Result> => {
    const requestCache = requestStore.getStore()
    if (!requestCache) return fn(...args)
    const current = requestCache.get(cacheKey) as Promise<Result> | undefined
    if (current) return current
    const result = fn(...args)
    requestCache.set(cacheKey, result)
    return result
  }
}

async function inRender<T>(fn: () => Promise<T>): Promise<T> {
  return requestStore.run(new Map(), fn)
}

async function inRequest<T>(queryResult: QueryResult, fn: () => Promise<T>): Promise<T> {
  return queryResultStore.run(queryResult, () => inRender(fn))
}

function loadRuntime(queryResult: QueryResult): RuntimeModule {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  })
  const diagnostics = compiled.diagnostics ?? []
  assert.equal(diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error).length, 0, 'la transpilación aislada debe estar libre de errores')

  const prisma = {
    $queryRaw: async (_strings: TemplateStringsArray): Promise<IdentityRow[]> => queryResult(),
  }
  const internals = Module as ModuleInternals
  const originalLoad = internals._load
  internals._load = function loadStub(request, parent, isMain) {
    if (request === 'react') return { cache: renderCache }
    if (request === '@/lib/prisma') return { __esModule: true, default: prisma }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const loaded = new Module(sourcePath, module) as LoadableModule
    loaded.filename = sourcePath
    loaded.paths = internals._nodeModulePaths(dirname(sourcePath))
    loaded._compile(compiled.outputText, sourcePath)
    return loaded.exports as RuntimeModule
  } finally {
    internals._load = originalLoad
  }
}

function stagingEnvironment() {
  process.env.FINANCE_STAGING_SANDBOX = '1'
  process.env.VERCEL_ENV = 'preview'
  process.env.FINANCE_EASY_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_MODEL_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_AUTOMATIC_LINKS_DISABLED = '0'
  delete process.env.IO_PRODUCTION_READ_ONLY
  process.env.DATABASE_URL = 'postgresql://io_staging_finanzas@example.invalid:5432/io_staging_finanzas'
}

function restoreEnvironment(previous: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key]
  }
  Object.assign(process.env, previous)
}

async function main() {
  const previousEnvironment = { ...process.env }
  try {
    stagingEnvironment()

    let calls = 0
    const runtime = loadRuntime(async () => {
      calls += 1
      return [{ database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }]
    })

    const combined = await inRender(async () => Promise.all([
      runtime.getFinanceEasyProfileRuntime(),
      runtime.getFinanceEasyRuntimeContext(),
      runtime.assertFinanceEasyProfileRuntime(),
    ]))
    assert.deepEqual(combined, ['staging', { runtime: 'staging', stagingOnly: true }, 'staging'])
    assert.equal(calls, 1, 'las tres comprobaciones del mismo render comparten una sola identidad viva')

    await inRender(() => runtime.getFinanceEasyRuntimeContext())
    assert.equal(calls, 2, 'un render nuevo vuelve a validar la identidad; no se comparte entre solicitudes')

    await runtime.getFinanceEasyProfileRuntime()
    await runtime.getFinanceEasyProfileRuntime()
    assert.equal(calls, 4, 'fuera de un render el doble no mantiene una caché entre llamadas')

    let isolatedCalls = 0
    const isolatedRuntime = loadRuntime(async () => {
      isolatedCalls += 1
      const result = queryResultStore.getStore()
      assert.ok(result, 'cada consulta simulada debe conocer su solicitud')
      return result()
    })
    const [acceptedContext, rejectedContext] = await Promise.all([
      inRequest(
        async () => [{ database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }],
        () => isolatedRuntime.getFinanceEasyRuntimeContext(),
      ),
      inRequest(
        async () => [{ database_name: 'another_database', database_user: 'another_user' }],
        () => isolatedRuntime.getFinanceEasyRuntimeContext(),
      ),
    ])
    assert.deepEqual(acceptedContext, { runtime: 'staging', stagingOnly: true }, 'una solicitud válida conserva su contexto')
    assert.equal(rejectedContext, null, 'una solicitud distinta no recibe la identidad de otra')
    assert.equal(isolatedCalls, 2, 'las solicitudes simultáneas no comparten identidades')

    let failedCalls = 0
    const failingRuntime = loadRuntime(async () => {
      failedCalls += 1
      throw new Error('IDENTITY_QUERY_FAILED')
    })
    await inRender(async () => {
      await assert.rejects(() => failingRuntime.getFinanceEasyRuntimeContext(), /IDENTITY_QUERY_FAILED/)
      await assert.rejects(() => failingRuntime.getFinanceEasyProfileRuntime(), /IDENTITY_QUERY_FAILED/)
    })
    assert.equal(failedCalls, 1, 'un error de identidad sólo se comparte dentro del render que lo recibió')
    await assert.rejects(() => inRender(() => failingRuntime.getFinanceEasyRuntimeContext()), /IDENTITY_QUERY_FAILED/)
    assert.equal(failedCalls, 2, 'un error no se conserva para la siguiente solicitud')

    let mismatchCalls = 0
    const mismatchRuntime = loadRuntime(async () => {
      mismatchCalls += 1
      return [{ database_name: 'other_database', database_user: 'other_user' }]
    })
    await inRender(async () => {
      assert.equal(await mismatchRuntime.getFinanceEasyProfileRuntime(), null, 'una identidad distinta conserva el fallo cerrado del perfil')
      assert.equal(await mismatchRuntime.getFinanceEasyRuntimeContext(), null, 'una identidad distinta conserva el fallo cerrado del contexto')
      await assert.rejects(() => mismatchRuntime.assertFinanceEasyRuntime(), error => (
        error instanceof mismatchRuntime.FinanceEasyRuntimeError
      ))
    })
    assert.equal(mismatchCalls, 1, 'los contextos y las aserciones comparten la misma comprobación viva por render')

    process.stdout.write('ok: React.cache mantiene la identidad viva aislada por render, sin Prisma real ni caché global\n')
  } finally {
    restoreEnvironment(previousEnvironment)
  }
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
