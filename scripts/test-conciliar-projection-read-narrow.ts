/* Regresión estática pura: no importa Prisma, handlers, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'lib/finanzas/conciliar-projection-read.ts'), 'utf8')
const reader = source.slice(source.indexOf('async function readProjectionBundle'), source.indexOf('async function projectionResponse'))

function cte(name: string, next: string): string {
  const start = reader.indexOf(`), ${name} AS (`)
  const end = reader.indexOf(`), ${next} AS (`, start)
  assert.ok(start >= 0 && end > start, `no se encontró la CTE ${name}`)
  return reader.slice(start, end)
}

const effective = cte('effective_projection', 'filtered')
const pageIds = cte('page_ids', 'page')
const page = cte('page', 'document_requests')

const narrowColumns = [
  'p.id', 'p.tab', 'p.movimiento_id', 'p.cuenta_id', 'p.fecha', 'p.concepto', 'p.banco', 'p.cuenta',
  'p.importe_centimos', 'p.pendiente_centimos', 'p.grupo', 'p.documento', 'p.propuesta',
]
for (const column of narrowColumns) assert.match(effective, new RegExp(`\\b${column.replace('.', '\\.') }\\b`), `effective_projection conserva ${column} para filtro, orden o resumen`)
for (const wideColumn of ['p.motivo', 'p.seleccionable', 'p.diferencia_centimos', 'p.links_movimiento', 'p.detail', 'p.source_fingerprint', 'p.updated_at', 'p.read_metadata']) {
  assert.doesNotMatch(effective, new RegExp(`\\b${wideColumn.replace('.', '\\.') }\\b`), `effective_projection no arrastra ${wideColumn}`)
}
assert.doesNotMatch(effective, /\bp\.source\b(?!->>'g7Precheck')/, 'la fuente completa no se materializa antes de paginar')
assert.match(effective, /CASE WHEN p\.needs_g7_review THEN 'AMBAR' ELSE p\.color END AS color/)
assert.match(effective, /CASE WHEN p\.color='VERDE' AND \(NOT \(p\.source->>'g7Precheck' IS NOT DISTINCT FROM \$\{CONCILIAR_GREEN_PRECHECK_STAMP\}\) OR EXISTS\(SELECT 1 FROM projection_state WHERE dirty_at IS NOT NULL\)\) THEN true ELSE false END AS needs_g7_review/)
assert.equal((effective.match(/AS needs_g7_review/g) ?? []).length, 1, 'la bandera G7 se deriva una vez en la capa estrecha')
assert.equal((effective.match(/g7Precheck/g) ?? []).length, 1, 'la fuente G7 sólo se consulta para la bandera derivada')
assert.match(pageIds, /SELECT p\.id FROM effective_projection p JOIN scoped scope ON scope\.id=p\.id/)
assert.match(pageIds, /ORDER BY \$\{sort\}\s+LIMIT \$\{input\.limit\} OFFSET \$\{input\.offset\}/)
assert.doesNotMatch(pageIds, /SELECT p\.\*/, 'la CTE de IDs no materializa filas completas')

const pageColumns = [
  'id', 'tab', 'movimiento_id', 'cuenta_id', 'fecha', 'concepto', 'banco', 'cuenta',
  'importe_centimos', 'pendiente_centimos', 'color', 'grupo', 'motivo', 'documento', 'propuesta',
  'seleccionable', 'diferencia_centimos', 'links_movimiento', 'detail', 'source', 'source_fingerprint',
  'updated_at', 'read_metadata',
]
for (const column of pageColumns) {
  const qualifier = column === 'color' ? 'g7' : 'p'
  assert.match(page, new RegExp(`\\b${qualifier}\\.${column}\\b`), `page recupera la columna original ${column}`)
}
assert.equal(pageColumns.length, 23, 'la página conserva las 23 columnas originales')
assert.match(page, /FROM conciliar_proyecciones p\s+JOIN page_ids selected ON selected\.id=p\.id\s+JOIN effective_projection g7 ON g7\.id=p\.id/)
assert.match(page, /CASE WHEN g7\.needs_g7_review THEN \$\{CONCILIAR_GREEN_PENDING_REASON\} ELSE p\.motivo END AS motivo/)
assert.match(page, /CASE WHEN g7\.needs_g7_review THEN false ELSE p\.seleccionable END AS seleccionable/)
assert.doesNotMatch(page, /needs_g7_review\s*(?:,|\))/,'la bandera auxiliar no entra en el JSON de filas')
assert.match(reader, /json_agg\(row_to_json\(p\) ORDER BY \$\{sort\}\) FROM page p/)

console.log(JSON.stringify({
  test: 'conciliar-projection-read-narrow', databaseQueries: 0, networkCalls: 0,
  verified: ['narrow-effective-columns', 'page-ids-before-wide-fetch', 'g7-single-derived-flag', 'original-page-23-columns', 'stable-json-order'],
}))
