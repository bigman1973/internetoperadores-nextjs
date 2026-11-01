/* Contrato estático de la acción humana: sin BD, red, DML, build ni tsc. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const actions = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-actions.ts'), 'utf8')
const engine = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-human-own-transfer.ts'), 'utf8')
const contract = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-contract.ts'), 'utf8')
const projection = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-projection-read.ts'), 'utf8')
const impersonation = readFileSync(resolve(__dirname, '../lib/impersonation-policy.ts'), 'utf8')

assert.match(contract, /action: 'confirmar_traspasos_propios_manual'/)
assert.match(contract, /parseConfirmItems\(value\.items, 20\)/)
assert.match(actions, /async function confirmHumanOwnTransfers/)
assert.match(actions, /PAREJA_REPETIDA/)
assert.match(actions, /humanOwnTransferActionForProjection/)
assert.match(actions, /confirmConciliarHumanOwnTransferTx/)
assert.match(actions, /row\.movimientoId !== source\.movimientoId/)
assert.match(actions, /deleteConciliarBatchProjectionRowsTx\(tx, \[\.\.\.movementIds\]\)/)
assert.match(actions, /undoConciliarHumanOwnTransferTx/)
assert.match(actions, /lockConciliarHumanOwnTransferUndoTx/)
assert.match(actions, /command\.action === 'confirmar_traspasos_propios_manual'/)
assert.match(engine, /readManualOwnAccountProofTx/)
assert.match(engine, /classifyConciliarOwnTransferReviews/)
assert.match(engine, /FOR UPDATE OF m/)
assert.match(engine, /lockConciliarHumanOwnTransferUndoTx/)
assert.match(engine, /TRASPASO_INTERNO_SIN_DOCUMENTO/)
assert.doesNotMatch(engine, /import\s*\{[^}]*readStrictOwnTransfers/)
assert.doesNotMatch(engine, /await\s+readStrictOwnTransfers\s*\(/)
assert.doesNotMatch(engine, /independent strict historical proof/i)
assert.match(projection, /humanOwnTransferActionForProjection/)
assert.match(projection, /accionHumana/)
assert.match(impersonation, /'\/api\/admin\/finanzas\/conciliar': \['confirmar', 'confirmar_traspasos_propios_manual', 'deshacer', 'pedir'\]/)
console.log('OK: acción humana por pareja, límite veinte, preflight común, dos patas atómicas y undo completo verificados estáticamente.')
