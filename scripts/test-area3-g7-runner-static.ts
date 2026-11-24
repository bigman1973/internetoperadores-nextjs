/* Área 3 / G7: contrato estático del runner. Sin BD, red, build ni mutaciones. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const runner = readFileSync('scripts/areas/conciliar/g7-readonly.ts', 'utf8')
const actions = readFileSync('lib/finanzas/conciliar-actions.ts', 'utf8')
const reader = readFileSync('lib/finanzas/conciliar-projection-read.ts', 'utf8')
const auditSql = readFileSync('scripts/areas/conciliar/g7-staging-readonly-audit.sql', 'utf8')

function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length)
  assert.ok(start >= 0 && end > start, `no se encontró ${from}`)
  return source.slice(start, end)
}

test('runner G7 exige captura privada completa, actor Lorena y una foto DB READ ONLY repetible', () => {
  for (const token of ['--snapshot-file', '--actor-file', '--env-file', '--draft-file', "actorAlias !== 'LORENA'", "requireB4ActorAccess(actorInput.actorId, 'escritura', tx)", 'AREA3_G7_LORENA_IDENTITY_REJECTED', 'SET TRANSACTION READ ONLY', 'RepeatableRead']) {
    assert.match(runner, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(runner, /current_database\([\s\S]*current_user[\s\S]*transaction_read_only[\s\S]*transaction_isolation/)
  assert.match(runner, /'io_staging_finanzas'/)
  assert.match(runner, /'io_staging_finanzas'/)
})

test('runner G7 compara toda la API paginada con la proyección y usa los núcleos de servidor', () => {
  for (const token of ['pagedProjectionRows', 'evaluateConciliarStagingApiSnapshot', 'allRowsRead: true', 'readCurrentArea3RemittanceMapPreflightsTx', 'preflightArea3ReviewConfirmTx', 'readArea3ReviewPreflightCandidatesTx', 'G7_REMITTANCE', 'G7_REVIEW']) {
    assert.match(runner, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(runner, /if \(!api \|\| api\.decisionHash !== row\.decisionHash/)
  assert.match(runner, /const remittanceRows = rows\.filter/)
  assert.match(runner, /row\.color !== 'AMBAR' \|\| row\.seleccionable !== false/)
  assert.match(runner, /Falta enlazar \$\{preflight\.missingReceiptCount\} recibos\./)
})

test('preflight de revisión no bloquea fila ni ejecuta confirmación; el borrador exige ACK humano', () => {
  const preview = between(actions, 'async function previewArea3Review', '/** REVIEW_CONFIRM')
  assert.match(preview, /readConciliarRowForReviewPreflight/)
  assert.doesNotMatch(preview, /readConciliarRowForAction/)
  const reviewReader = between(reader, 'export async function readConciliarRowForReviewPreflight', '/** Server-only G7 sweep')
  assert.doesNotMatch(reviewReader, /FOR UPDATE/)
  assert.match(actions, /SET TRANSACTION READ ONLY/)
  assert.match(runner, /executable: false/)
  assert.match(runner, /advertenciaReconocida: false/)
  assert.doesNotMatch(runner, /runConciliarAction|confirmArea3ReviewTx|fetch\(/)
})

test('runner G7 exige población y verde real, pero informa familias ausentes sin fabricar datos', () => {
  const coverage = readFileSync('lib/finanzas/conciliar-g7-coverage.ts', 'utf8')
  assert.match(coverage, /const totalPopulation=values\.reduce/)
  assert.match(coverage, /ok:totalPopulation>0 && totalGreen>0 && noGreensSkipped/)
  assert.match(coverage, /classesWithoutPopulation/)
  assert.doesNotMatch(runner, /G7_FAMILIAS_AUSENTES/)
  assert.match(runner, /let apiGreen = 0/)
  assert.match(runner, /apiGreen !== universal\.totalGreen/)
  assert.match(runner, /familiasAusentes: output\.universal\.classesWithoutPopulation/)
})

test('SQL preparado para staging sólo audita dentro de READ ONLY y termina en rollback', () => {
  const sql = auditSql.replace(/--[^\n]*/g, '')
  assert.match(sql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/)
  assert.match(sql, /ROLLBACK;/)
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|UPSERT|ALTER|CREATE|DROP|TRUNCATE|CALL|DO)\b/i)
  assert.match(sql, /confirmacion_unica_id/)
  assert.match(sql, /confirmacion_lote20_id/)
  assert.match(sql, /patas=20/)
})

console.log('OK: runner G7 read-only, API paginada, Lorena, hash sellado y auditoría local estática verificados.')
