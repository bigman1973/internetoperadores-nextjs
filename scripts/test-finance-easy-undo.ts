/* Parser-only proof: no Prisma query, HTTP server or external provider is used. */
import assert from 'node:assert/strict'
import { parseEasyUndoInput } from '../lib/finanzas/easy-reconciliation-undo'

const operacionId = '80c5cf3d-733b-488b-9a93-3e0ab108e3bf'
const idempotencyKey = 'e5b50360-4f7b-4941-8a64-61aaf7d2d3c8'

assert.deepEqual(
  parseEasyUndoInput({ action: 'deshacer', confirmacion: true, operacionId, idempotencyKey }),
  { action: 'deshacer', confirmacion: true, operacionId, idempotencyKey },
  'El contrato acepta exactamente las cuatro claves cerradas.',
)

assert.throws(
  () => parseEasyUndoInput({ action: 'deshacer', confirmacion: true, operacionId, idempotencyKey, version: 2 }),
  /claves fuera del contrato/,
  'El cliente no puede aportar versión B4.',
)
assert.throws(
  () => parseEasyUndoInput({ action: 'deshacer', confirmacion: true, operacionId, idempotencyKey, lineas: [] }),
  /claves fuera del contrato/,
  'El cliente no puede aportar líneas B4.',
)
assert.throws(
  () => parseEasyUndoInput({ action: 'deshacer', operacionId, idempotencyKey }),
  /claves fuera del contrato/,
  'La confirmación explícita es obligatoria.',
)
assert.throws(
  () => parseEasyUndoInput({ action: 'deshacer', confirmacion: false, operacionId, idempotencyKey }),
  /confirmacion:true/,
)
assert.throws(
  () => parseEasyUndoInput({ action: 'deshacer', confirmacion: true, operacionId, idempotencyKey: '80c5cf3d-733b-133b-9a93-3e0ab108e3bf' }),
  /UUID válido v4/,
  'La clave de idempotencia debe ser UUID v4.',
)

console.log('test-finance-easy-undo: OK')
