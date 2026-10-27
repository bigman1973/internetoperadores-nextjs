/* Prueba estática pura: no importa Prisma, handlers, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'lib/finanzas/conciliar-projection-read.ts'), 'utf8')
const reader = source.slice(source.indexOf('async function readProjectionBundle'), source.indexOf('export async function readConciliarProjection'))

assert.equal((reader.match(/db\(\)\.\$queryRaw/g) ?? []).length, 1, 'la portada debe resolver página, total, resumen, cuentas y estado en un solo viaje SQL')
assert.match(reader, /WITH filtered AS \(/)
assert.match(reader, /active AS \(/)
assert.match(reader, /scoped AS \(/)
assert.doesNotMatch(reader, /\bMATERIALIZED\b/, 'la plantilla se limita a la gramática SQL ya revisada por el guardia')
assert.match(reader, /historic_summary AS/)
assert.match(reader, /p\.tab<>'EMITIDAS' OR p\.fecha>=CAST\(\$\{cutoff\} AS date\)/)
assert.match(reader, /p\.tab='EMITIDAS' AND p\.fecha<CAST\(\$\{cutoff\} AS date\)/)
assert.match(reader, /FROM active GROUP BY tab,color/)
assert.match(reader, /FROM filtered p WHERE p\.tab='EMITIDAS'/)
assert.match(reader, /SELECT COUNT\(\*\)::text FROM scoped/)
assert.doesNotMatch(reader, /\b(?:INSERT|UPDATE|DELETE|rebuildConciliarProjection|fetch)\b/i, 'la lectura inicial no debe reconstruir, escribir ni llamar proveedores')

const response = source.slice(source.indexOf('export async function readConciliarProjection'), source.indexOf('export async function readConciliarRow'))
assert.match(response, /cutoffDate: cutoff/)
assert.match(response, /historicSummary/)
assert.match(response, /stale: !!state\?\.dirtyAt/)

console.log(JSON.stringify({ test: 'conciliar-projection-read-performance', databaseQueries: 0, networkCalls: 0, verified: ['single-read-roundtrip', 'active-historic-cutoff', 'no-get-rebuild'] }))
