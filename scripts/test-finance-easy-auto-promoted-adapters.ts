import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyFinanceEasyRuntime } from '../lib/finanzas/prototype-staging'

const source = readFileSync(new URL('../lib/finanzas/easy-counterparty-db.ts', import.meta.url), 'utf8')

type HookName = 'appendAutoCounterpartyReceiptTx' | 'undoAutoCounterpartyReceiptTx' | 'reverseAutoCounterpartyReceiptTx'

function hookBody(name: HookName): string {
  const declaration = `export async function ${name}(`
  const start = source.indexOf(declaration)
  assert.ok(start >= 0, `No existe el hook ${name}`)

  let parentheses = 0
  let bodyStart = -1
  for (let index = source.indexOf('(', start); index < source.length; index += 1) {
    if (source[index] === '(') parentheses += 1
    if (source[index] === ')') parentheses -= 1
    if (parentheses === 0) {
      bodyStart = source.indexOf('{', index)
      break
    }
  }
  assert.ok(bodyStart >= 0, `No se encontró el cuerpo de ${name}`)

  let braces = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') braces += 1
    if (source[index] === '}') braces -= 1
    if (braces === 0) return source.slice(bodyStart, index + 1)
  }
  assert.fail(`El cuerpo de ${name} no está balanceado`)
}

function requires(value: string, expression: RegExp, message: string) {
  assert.match(value, expression, message)
}

const promotedProduction = {
  stagingSandbox: '0',
  vercelEnvironment: 'production',
  easyProductionEnabled: '1',
  modelProductionEnabled: '1',
  automaticLinksDisabled: '1',
  databaseUrl: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/railway',
}

// Pure runtime classification: it neither opens a transaction nor issues SQL.
assert.equal(classifyFinanceEasyRuntime(promotedProduction), 'production')
assert.equal(classifyFinanceEasyRuntime({ ...promotedProduction, easyProductionEnabled: '0' }), null)
assert.equal(classifyFinanceEasyRuntime({ ...promotedProduction, automaticLinksDisabled: '0' }), null)

const append = hookBody('appendAutoCounterpartyReceiptTx')
const undo = hookBody('undoAutoCounterpartyReceiptTx')
const reverse = hookBody('reverseAutoCounterpartyReceiptTx')

for (const [name, body] of Object.entries({ append, undo, reverse })) {
  assert.doesNotMatch(body, /assertPrototypeStaging\(\)/, `${name} no puede conservar la guarda exclusiva de staging`)
  requires(body, /const runtime = await assertFinanceEasyRuntime\(\)/, `${name} debe usar el runtime promovido`)
  requires(body, /const work = asTx\(tx\)/, `${name} debe conservar la conexión de la transacción recibida`)
  requires(body, /work\.\$queryRaw[\s\S]*SELECT current_database\(\) AS database_name,current_user AS database_user LIMIT 1/, `${name} debe releer database/user en la misma tx`)
  requires(body, /runtime\.runtime === 'production'/, `${name} debe derivar la identidad esperada del contexto server-side`)
  requires(body, /databaseName: 'railway', databaseUser: 'postgres'/, `${name} debe exigir railway/postgres en producción`)
  requires(body, /databaseName: 'io_staging_finanzas', databaseUser: 'io_staging_finanzas'/, `${name} debe conservar la identidad aislada de staging`)
  requires(body, /throw new FinanceEasyRuntimeError\(\)/, `${name} debe fallar cerrado si la identidad de la tx no coincide`)
  assert.ok(body.indexOf('SELECT current_database()') < body.indexOf('verifiedActiveAutoLegTx'), `${name} debe validar identidad antes de confiar en el recibo automático`)
  requires(body, /verifiedActiveAutoLegTx\(work,/, `${name} debe conservar la comprobación del recibo y sus patas vigentes`)
}

// Append preserves the actor-source binding, type reconstruction and compatibility fields.
requires(append, /leg\.actorId !== actorId/, 'append debe mantener el actor original del recibo')
requires(append, /leg\.clase === 'TRASPASO_PROPIO' \? 'CUENTA_PROPIA' : 'BANCO'/, 'append debe reconstruir el tipo desde la clase vigente')
requires(append, /AUTO_RECEIPT:\$\{input\.autoReceiptId\.toLowerCase\(\)\}:\$\{leg\.movimientoId\}:\$\{leg\.clase\}/, 'append debe conservar la identidad de fuente derivada')
requires(append, /input\.tipoTercero !== undefined && input\.tipoTercero !== tipoTercero/, 'append debe conservar la validación del tipo legado')
requires(append, /'AUTO_RECIBO'::"OrigenTerceroModoFacil"/, 'append debe mantener el origen inmutable AUTO_RECIBO')

// Both reversal routes retain the live-manager privilege boundary and active receipt checks.
for (const [name, body] of Object.entries({ undo, reverse })) {
  requires(body, /canReverseAnotherActorTx\(work, actorId\)/, `${name} debe conservar el privilegio vivo para reversión ajena`)
  requires(body, /'AUTO_RECIBO'::"OrigenTerceroModoFacil"/, `${name} debe conservar el origen AUTO_RECIBO al revertir`)
  requires(body, /d\.snapshot->>'autoReceiptId'/, `${name} debe asociar la reversión con el recibo automático vigente`)
}
requires(undo, /originalActors\.length !== 1/, 'undo debe conservar la defensa frente a actor original ambiguo')
requires(undo, /originalActorId !== actorId && !await canReverseAnotherActorTx\(work, actorId\)/, 'undo debe rechazar reversión ajena sin gestor vivo')
requires(reverse, /leg\.actorId !== actorId && !await canReverseAnotherActorTx\(work, actorId\)/, 'reverse debe rechazar reversión ajena sin gestor vivo')

console.log('Easy Auto promoted adapters: sourceguard y clasificación runtime verificados sin PostgreSQL.')
