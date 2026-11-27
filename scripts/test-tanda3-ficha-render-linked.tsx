/**
 * Regresión ISP vinculada: loader + singleton/$use reales + React SSR real.
 * Único doble: el transporte posterior a $use reproduce SELECTs capturados en staging.
 * No importa .env, ni abre conexión, ni crea sesión, ni ejecuta SQL/HTTP/Graph.
 * Ejecutar desde repo: env -i PATH="$PATH" HOME=/home/ubuntu node_modules/.bin/tsx scripts/test-tanda3-ficha-render-linked.tsx
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { AsyncLocalStorage } from 'node:async_hooks'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const local = createRequire(resolve(root, 'package.json'))
const { transformSync } = createRequire(local.resolve('tsx/package.json'))('esbuild')
const { Prisma, PrismaClient } = local('@prisma/client')
const React = local('react')
const { renderToStaticMarkup } = local('react-dom/server')
const dataset = JSON.parse(readFileSync(resolve(root, 'scripts/fixtures/tanda3-ficha-linked-staging.json'), 'utf8'))
const cases: any[] = dataset.cases ?? [dataset]
let forbidden = 0, passed = 0
const deny = () => { forbidden++; throw new Error('TRANSPORTE_EFECTO_PROHIBIDO') }

function encode(v: any): any {
  if (v instanceof Date) return { $date: v.toISOString() }
  if (typeof v === 'bigint') return { $bigint: String(v) }
  // El enmascarador usó DOC-FIXTURE también para parámetros CIF normalizados.
  // normCif real produce DOCFIXTURE; la equivalencia sólo afecta este marcador.
  if (v === 'DOC-FIXTURE') return 'DOCFIXTURE'
  if (Array.isArray(v)) return v.map(encode)
  if (v && typeof v === 'object') {
    if (typeof v.toFixed === 'function') return v.toString()
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, encode(v[k])]))
  }
  return v
}
function revive(v: any): any {
  if (Array.isArray(v)) return v.map(revive)
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && typeof v.$date === 'string') return new Date(v.$date)
    if (Object.keys(v).length === 1 && typeof v.$bigint === 'string') return BigInt(v.$bigint)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
  }
  return v
}
function rawArgs(args: any): any {
  if (!Array.isArray(args)) return { strings: args?.strings, values: args?.values }
  if (Array.isArray(args[0])) return { strings: args[0], values: args.slice(1) }
  if (args.length === 1 && args[0]?.strings) return { strings: args[0].strings, values: args[0].values }
  return args
}
// La anonimización de la captura también elimina estas claves de los SELECT.
// Sólo se omiten proyecciones: ningún WHERE, parámetro, límite ni SQL se relaja.
const privateProjectionFields = new Set(['email', 'telefono', 'movil', 'direccion', 'localidad', 'provincia', 'codigoPostal', 'dominio', 'web'])
function comparisonArgs(v: any, projection = false): any {
  if (Array.isArray(v)) return v.map(x => comparisonArgs(x, projection))
  if (!v || typeof v !== 'object' || v instanceof Date) return v
  return Object.fromEntries(Object.entries(v)
    .filter(([k]) => !projection || !privateProjectionFields.has(k))
    .map(([k, x]) => [k, comparisonArgs(x, k === 'select')]))
}
const key = (p: any) => JSON.stringify(encode({ model: p.model ?? null, action: p.action, args: p.model ? comparisonArgs(p.args) : rawArgs(p.args) }))
const sourceFiles = new Set([
  'lib/prisma.ts', 'lib/isp-origen-server.ts', 'lib/isp-origen-policy.ts',
  'lib/impersonation-policy.ts', 'lib/finanzas/conciliar-runtime.ts',
  'lib/finanzas/finance-environment.ts', 'lib/finanzas/conciliar-recovery-lock-sql.ts',
  'lib/area1-ficha-cliente.ts', 'lib/area1-ficha-rentabilidad.ts', 'lib/area1-isp-identidad.ts',
  'lib/area1-subida-cliente.ts', 'lib/m365-legacy-policy.ts', 'lib/subida-precios/calc.ts',
  'app/admin/rentabilidad/io-model.ts', 'app/admin/rentabilidad/view-model.ts',
  'components/admin/FichaCliente.tsx',
])

function harness(fixture: any) {
  const cache = new Map<string, any>()
  const pool = (fixture.traces ?? fixture.calls).map((p: any) => ({ ...p, used: false }))
  assert.ok(pool.length, 'El fixture debe contener consultas realmente capturadas, no una ficha construida a mano')
  let engineHits = 0
  const seenRaw: any[] = []
  const clients: any[] = []
  // PrismaClient y su pipeline son los generados reales. El motor queda bloqueado
  // y sólo su etapa _executeRequest (después de todos los $use) se sustituye.
  const OfflinePrismaClient = new Proxy(PrismaClient, { construct(target, args) {
    const client: any = Reflect.construct(target, args)
    const engineDeny = () => { engineHits++; return deny() }
    for (const method of ['request', 'requestBatch', 'start']) client._engine[method] = engineDeny
    client.$connect = engineDeny
    client._executeRequest = async (p: any) => {
      assert.ok(p.model ? ['findMany', 'findUnique', 'findFirst'].includes(p.action) : p.action === 'queryRaw', 'Sólo se permite leer')
      const candidate = pool.find((entry: any) => !entry.used && key(entry) === key(p))
      assert.ok(candidate, `Consulta sin captura autorizada: ${p.model ?? 'RAW'}.${p.action}`)
      candidate.used = true
      return revive(candidate.result)
    }
    clients.push(client)
    return client
  } })
  const globalScope: Record<string, any> = {}
  const mocks: Record<string, any> = {
    '@prisma/client': { Prisma, PrismaClient: OfflinePrismaClient },
    'node:async_hooks': { AsyncLocalStorage },
    // No hay petición/sesión en un replay offline; el guard ISP sigue siendo real.
    '@/lib/impersonation-context': { trustedImpersonationContextResolutionFromRequest: async () => ({ status: 'absent' }) },
    react: React, 'react/jsx-runtime': local('react/jsx-runtime'),
  }
  function load(relative: string): any {
    assert.ok(sourceFiles.has(relative), `Fuente no autorizada: ${relative}`)
    if (cache.has(relative)) return cache.get(relative)
    const filename = resolve(root, relative)
    const module = { exports: {} as any }
    cache.set(relative, module.exports)
    const code = transformSync(readFileSync(filename, 'utf8'), {
      loader: relative.endsWith('.tsx') ? 'tsx' : 'ts', jsx: 'automatic', format: 'cjs', target: 'es2022', platform: 'node',
    }).code
    runInNewContext(code, {
      module, exports: module.exports, Date, Intl, URL, URLSearchParams, AbortController, console,
      globalThis: globalScope, process: { env: {} }, fetch: deny, setTimeout: deny, clearTimeout: deny,
      require(id: string) {
        if (Object.hasOwn(mocks, id)) return mocks[id]
        const target = id.startsWith('@/') ? resolve(root, id.slice(2)) : id.startsWith('.') ? resolve(dirname(filename), id) : ''
        assert.ok(target.startsWith(`${root}/`), `Import no autorizado: ${id}`)
        const suffix = target.endsWith('.ts') || target.endsWith('.tsx') ? '' : '.ts'
        return load((target + suffix).slice(root.length + 1))
      },
    }, { filename: `${relative}:offline-replay`, timeout: 5000 })
    cache.set(relative, module.exports)
    return module.exports
  }
  const singleton = load('lib/prisma.ts')
  const client = singleton.prisma
  assert.equal(clients.length, 1)
  // Observación posterior al guard instalado: nunca sustituye su decisión.
  client.$use(async (p: any, next: any) => {
    if (!p.model) seenRaw.push({ args: p.args, kind: singleton.classifyPrisma5RawSqlStatement(p.args) })
    return next(p)
  })
  return { load, singleton, client, pool, seenRaw, engineHits: () => engineHits }
}

async function main() {
  assert.ok(cases.length)
  for (const fixture of cases) {
    const h = harness(fixture)
    const reader = h.load('lib/area1-ficha-cliente.ts')
    const component = h.load('components/admin/FichaCliente.tsx').default
    const id = fixture.empresaId ?? fixture.id
    const now = new Date(fixture.at ?? dataset.at)
    assert.ok(id && Number.isFinite(now.getTime()))
    const ficha = await reader.cargarFichaCliente(id, fixture.nivel ?? 'SUPERADMIN', now)
    assert.ok(ficha)
    assert.equal(ficha.identidadIsp.estadoLectura, 'ISP', 'No aceptar fallback LOCAL/ORIGEN_NO_VERIFICABLE para ocultar la regresión')
    assert.equal(ficha.identidadIsp.protegida, true)
    assert.equal(ficha.empresa.vinculoIsp, 'vinculado')
    assert.ok(ficha.identidadIsp.cuentas.length > 0)
    assert.equal(ficha.contratos.length, 75, 'Los 75 contratos capturados deben conservarse, no un mock vacío')
    assert.equal(ficha.facturacion.facturas.length, 60, 'La vista conserva su límite real de 60 facturas')
    assert.equal(h.pool.find((p: any) => p.model === 'Factura')?.result.length, 121)
    assert.equal(ficha.rentabilidad.mes, '2026-10')
    assert.equal(ficha.rentabilidad.snapshot.kind, 'PROYECCION')
    assert.equal(ficha.rentabilidad.snapshot.version, 11)
    assert.ok(ficha.kpis.some((k: any) => k.etiqueta === 'Margen octubre 2026' && k.valor !== 'sin dato'))
    const html = renderToStaticMarkup(React.createElement(component, {
      ficha, puedeEscribir: false, puedeEscribirContactos: false,
      m365: { aviso: null, corporativo: '', connectUrl: '', conexion: { enabled: false, connected: false, email: null, mail: false, m365: false, envios: false } },
    }))
    assert.ok(html.includes('Identidad de ISP') || html.includes('Varias identidades ISP'))
    assert.ok(html.includes('Snapshot Área 1'))
    assert.ok(html.includes('id="tC"'))
    assert.ok(html.includes(ficha.contratos[0].codigo))
    assert.ok(html.includes('Lo que hay que saber') && html.includes('resumen local'))
    assert.doesNotMatch(html, /data-open="(?:mail|ai)"|Preparando el resumen|Conectar mi Outlook/)
    assert.ok(html.includes('id="rbars"'))
    assert.ok(h.pool.every((p: any) => p.used), 'Consumir todas las consultas capturadas, incluido detalle SQL de rentabilidad')
    const detail = h.seenRaw.find((p: any) => rawArgs(p.args).strings?.join('?').includes('WITH selected AS'))
    assert.ok(detail, 'El detalle SQL del vínculo debe cruzar el singleton real')
    const detailSql = rawArgs(detail.args)
    assert.equal(detailSql.strings.join('?').includes('\\'), false, 'No backreference literal incompatible con tokenizador')
    // Oráculo causal: el mismo callshape + query original debe fallar EN EL GUARD,
    // antes del transporte; no se fabrican excepciones ni se cambia el clasificador.
    const repaired = "'^ISP(?=[0-9]+$)', '', 'i'"
    const original = "'^ISP([0-9]+)$', '\\1', 'i'"
    assert.ok(detailSql.strings.some((s: string) => s.includes(repaired)))
    const oldSql = Prisma.sql(detailSql.strings.map((s: string) => s.replace(repaired, original)), ...detailSql.values)
    const consumed = h.pool.filter((p: any) => p.used).length
    await assert.rejects(() => h.client.$queryRaw(oldSql), (e: any) => e.name === 'IspOrigenNoEditableError' && e.code === 'ISP_ORIGEN_NO_EDITABLE')
    await assert.rejects(() => h.client.ispClienteArea1.updateMany({ where: { crmEmpresaId: id }, data: { nombre: 'NO_APLICAR' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE')
    await assert.rejects(() => h.client.$executeRaw(Prisma.sql`UPDATE area1_isp_clientes SET nombre=${'NO_APLICAR'} WHERE crm_empresa_id=${id}`), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE')
    assert.equal(h.pool.filter((p: any) => p.used).length, consumed)
    assert.equal(h.engineHits(), 0)
    passed++
    console.log(`PASS linked replay ${passed}: loader + singleton Prisma real + React SSR; original SQL rechazado antes del transporte`)
  }
  assert.equal(forbidden, 0)
  console.log(`PASS ${passed} · BD/SQL real/red/Graph/escrituras: 0`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
