import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { PrismaClient } from '@prisma/client'
import { analizarCadenaSaldo } from '../lib/finanzas/bank-balance-chain'

const BASE_COMMIT = '51f2f46'
const ROUTE_PATH = 'app/api/admin/finanzas/estado-cuentas/route.ts'
const STAGING_DATABASE = 'io_staging_finanzas'

function compileGet(source: string, prisma: unknown) {
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} as { GET?: () => Promise<Response> } }
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Response,
    Date,
    Number,
    Promise,
    Map,
    console,
    require(name: string) {
      if (name === 'next/server') {
        return {
          NextResponse: {
            json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
              ...init,
              headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
            }),
          },
        }
      }
      if (name === 'next-auth') return { getServerSession: async () => ({ user: { id: '1', userType: 'admin' } }) }
      if (name === '@/lib/auth') return { authOptions: {} }
      if (name === '@/lib/prisma') return { prisma }
      if (name === '@/lib/api-admin-area-read') return { checkAdminAreaRead: async () => null }
      if (name === '@/lib/finanzas/bank-balance-chain') return { analizarCadenaSaldo }
      throw new Error(`Módulo no permitido en equivalencia: ${name}`)
    },
  })
  if (typeof module.exports.GET !== 'function') throw new Error('GET de estado de cuentas no disponible')
  return module.exports.GET
}

async function run(get: () => Promise<Response>) {
  const start = performance.now()
  const response = await get()
  const elapsedMs = performance.now() - start
  assert.equal(response.status, 200, 'La lectura de estado de cuentas debe responder 200')
  return { body: await response.json(), elapsedMs }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const baseSource = execFileSync('git', ['show', `${BASE_COMMIT}:${ROUTE_PATH}`], { encoding: 'utf8' })
    const currentSource = readFileSync(ROUTE_PATH, 'utf8')
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      const database = await tx.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
      if (database[0]?.database !== STAGING_DATABASE) throw new Error('BASE_DE_DATOS_NO_AUTORIZADA')
      const baseGet = compileGet(baseSource, tx)
      const currentGet = compileGet(currentSource, tx)
      const original = await run(baseGet)
      const current = await run(currentGet)
      assert.deepEqual(current.body, original.body, 'La respuesta de estado de cuentas cambió')
      return { baseMs: original.elapsedMs, currentMs: current.elapsedMs }
    }, { timeout: 60_000 })

    console.log(JSON.stringify({
      handler: ROUTE_PATH,
      database: STAGING_DATABASE,
      readOnly: true,
      equal: true,
      base_ms: Number(result.baseMs.toFixed(2)),
      current_ms: Number(result.currentMs.toFixed(2)),
    }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Fallo de equivalencia')
  process.exitCode = 1
})
