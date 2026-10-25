import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { PrismaClient } from '@prisma/client'
import {
  presentarCategoriaHistorica,
  presentarTipoMovimientoHistorico,
  valoresCategoriaFiltro,
} from '../lib/finanzas/movement-catalog'

const BASE_COMMIT = '51f2f46'
const ROUTE_PATH = 'app/api/admin/finanzas/movimientos/route.ts'
const STAGING_DATABASE = 'io_staging_finanzas'
const BASE = 'https://staging.example'

function compileGet(source: string, prisma: unknown) {
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} as { GET?: (request: Request) => Promise<Response> } }
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Request,
    Response,
    URL,
    Map,
    Set,
    Number,
    Promise,
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
      if (name === '@/lib/finanzas/movement-catalog') {
        return { presentarCategoriaHistorica, presentarTipoMovimientoHistorico, valoresCategoriaFiltro }
      }
      throw new Error(`Módulo no permitido en equivalencia: ${name}`)
    },
  })
  if (typeof module.exports.GET !== 'function') throw new Error('GET de movimientos no disponible')
  return module.exports.GET
}

async function run(get: (request: Request) => Promise<Response>, url: string) {
  const start = performance.now()
  const response = await get(new Request(url))
  const elapsedMs = performance.now() - start
  assert.equal(response.status, 200, `La lectura debe responder 200: ${url}`)
  return { body: await response.json(), elapsedMs }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const baseSource = execFileSync('git', ['show', `${BASE_COMMIT}:${ROUTE_PATH}`], { encoding: 'utf8' })
    const currentSource = readFileSync(ROUTE_PATH, 'utf8')

    const results = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      const database = await tx.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
      if (database[0]?.database !== STAGING_DATABASE) throw new Error('BASE_DE_DATOS_NO_AUTORIZADA')
      const baseGet = compileGet(baseSource, tx)
      const currentGet = compileGet(currentSource, tx)
      const pageWithLinkedTransfer = await tx.$queryRaw<Array<{ page: bigint }>>`
        WITH ranked AS (
          SELECT traspaso_relacionado_id,
            row_number() OVER (ORDER BY fecha_operacion DESC)::bigint AS ordinal
          FROM movimientos_bancarios
        )
        SELECT ((ordinal - 1) / 100 + 1)::bigint AS page
        FROM ranked
        WHERE traspaso_relacionado_id IS NOT NULL
        ORDER BY ordinal ASC
        LIMIT 1
      `
      const pages = [...new Set([1, Number(pageWithLinkedTransfer[0]?.page ?? 1)])]
      const runs: Array<{ page: number; baseMs: number; currentMs: number }> = []
      for (const page of pages) {
        const url = `${BASE}/api/admin/finanzas/movimientos?page=${page}&limit=100`
        const original = await run(baseGet, url)
        const current = await run(currentGet, url)
        assert.deepEqual(current.body, original.body, `La respuesta cambió para ${url}`)
        runs.push({ page, baseMs: original.elapsedMs, currentMs: current.elapsedMs })
      }
      return runs
    }, { timeout: 60_000 })

    console.log(JSON.stringify({
      handler: ROUTE_PATH,
      database: STAGING_DATABASE,
      readOnly: true,
      equal: true,
      runs: results.map((result) => ({
        page: result.page,
        base_ms: Number(result.baseMs.toFixed(2)),
        current_ms: Number(result.currentMs.toFixed(2)),
      })),
    }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Fallo de equivalencia')
  process.exitCode = 1
})
