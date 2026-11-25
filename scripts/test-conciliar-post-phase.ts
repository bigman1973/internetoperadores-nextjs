import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const text = readFileSync('app/api/admin/finanzas/conciliar/route.ts', 'utf8')
const source = ts.createSourceFile('route.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const post = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'POST')
assert.ok(post?.body)
function find(node: ts.Node, predicate: (candidate: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(node)) return node
  let found: ts.Node | undefined
  ts.forEachChild(node, child => { if (!found) found = find(child, predicate) })
  return found
}
const phaseVariable = find(post, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'phase') as ts.VariableDeclaration | undefined
assert.ok(phaseVariable?.initializer && ts.isArrowFunction(phaseVariable.initializer))
const phaseArrow = phaseVariable.initializer

test('phase duration stays staging-only and carries only elapsedMs', () => {
  const guard = find(phaseArrow, ts.isIfStatement) as ts.IfStatement | undefined
  assert.ok(guard)
  assert.equal(guard.expression.getText(source), "process.env.FINANCE_STAGING_SANDBOX === '1'")
  const logger = find(guard.thenStatement, node => ts.isCallExpression(node) && node.expression.getText(source) === 'console.info') as ts.CallExpression | undefined
  assert.ok(logger)
  assert.equal(logger.arguments.length, 3)
  assert.equal(logger.arguments[0].getText(source), "'CONCILIAR_POST_PHASE'")
  const serialization = logger.arguments[2]
  assert.ok(ts.isCallExpression(serialization))
  assert.equal(serialization.expression.getText(source), 'JSON.stringify')
  assert.equal(serialization.arguments.length, 1)
  const payload = serialization.arguments[0]
  assert.ok(ts.isObjectLiteralExpression(payload))
  assert.equal(payload.properties.length, 1)
  const field = payload.properties[0]
  assert.ok(ts.isPropertyAssignment(field))
  assert.equal(field.name.getText(source), 'elapsedMs')
  assert.equal(field.initializer.getText(source), 'Date.now() - postStartedAt')
})

test('stream final phase follows the actual awaited action, before returning its result', () => {
  const call = find(post, node => ts.isCallExpression(node) && node.expression.getText(source) === 'streamConciliarConfirmation') as ts.CallExpression | undefined
  assert.ok(call)
  const config = call.arguments[0]
  assert.ok(ts.isObjectLiteralExpression(config))
  const execute = config.properties.find((node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText(source) === 'execute')
  assert.ok(execute && ts.isArrowFunction(execute.initializer) && ts.isBlock(execute.initializer.body))
  const statements = execute.initializer.body.statements
  const action = statements.findIndex(node => !!find(node, item => ts.isAwaitExpression(item) && ts.isCallExpression(item.expression) && item.expression.expression.getText(source) === 'runConciliarAction'))
  const finished = statements.findIndex(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'phase' && node.expression.arguments[0]?.getText(source) === "'action-finished'")
  const returned = statements.findIndex(ts.isReturnStatement)
  assert.ok(action >= 0 && finished > action && returned > finished)
})

test('phase logger cannot expose financial request, actor, session or idempotency values', () => {
  const identifiers: string[] = []
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node)) identifiers.push(node.text)
    ts.forEachChild(node, collect)
  }
  collect(phaseArrow)
  const forbidden = ['request', 'command', 'parsed', 'access', 'actorId', 'actorRealId', 'actorEffectiveId', 'sid', 'idempotencyKey', 'body', 'selection', 'result']
  assert.equal(identifiers.some(value => forbidden.includes(value)), false)
})
