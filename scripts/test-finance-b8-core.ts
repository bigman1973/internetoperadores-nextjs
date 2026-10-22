/* Pure B8 tests: no Prisma client, DATABASE_URL, HTTP, filesystem fixtures or network. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  B8_NOT_SELECTED,
  actorPuedeAdministrarCatalogo,
  canonicalizarEleccionesCentro,
  comprobarReplayEleccion,
  comprobarVersionLinea,
  decodificarAlcanceConfirmacionB4,
  eleccionesDesdeLineasB4,
  evaluarReplayIdempotente,
  hashSolicitudAsignacion,
  metadataHashEleccionesCentro,
  parseAsignacionCentroCoste,
  sumarImporteDocumentalConfirmadoPorCentro,
  todasEleccionesNoSeleccionadas,
  validarCentroSeleccionable,
  validarPruebaActualB8,
  validarTrazaAsignable,
  type TrazaLineaB8,
} from '../lib/finanzas/centros-coste-core'

const LINEA = '11111111-1111-4111-8111-111111111111'
const DOC_A = '22222222-2222-4222-8222-222222222222'
const DOC_B = '33333333-3333-4333-8333-333333333333'
const CENTRO_A = '44444444-4444-4444-8444-444444444444'
const CENTRO_B = '55555555-5555-4555-8555-555555555555'
const KEY = '66666666-6666-4666-8666-666666666666'

function value<T>(result: { ok: true; value: T } | { ok: false; errors: readonly { codigo: string }[] }): T {
  assert.equal(result.ok, true, `Se esperaba ok: ${result.ok === true ? '' : result.errors.map((error) => error.codigo).join(',')}`)
  return (result as { ok: true; value: T }).value
}
function codes(result: { ok: true; value: unknown } | { ok: false; errors: readonly { codigo: string }[] }) { return result.ok === true ? [] : result.errors.map((error) => error.codigo) }
function fails(result: { ok: true; value: unknown } | { ok: false; errors: readonly { codigo: string }[] }, code: string) {
  assert.equal(result.ok, false); assert.ok(codes(result).includes(code), `Códigos: ${codes(result).join(',')}`)
}
function traza(overrides: Partial<TrazaLineaB8> = {}): TrazaLineaB8 {
  return {
    vinculoMovimientoDocumentoId: LINEA, movimientoId: 'movimiento-opaco-1', documentoConciliableId: DOC_A,
    tipoLinea: 'DOCUMENTO', vinculoActivo: true, estadoMovimientoB4: 'JUSTIFICADO',
    operacionCreacionEstado: 'APLICADA', operacionCreacionRevertida: false, todasOperacionesActivasAplicadas: true,
    importeBancoCentimos: -12_500, cierreActualCentimos: -12_500, lineasDocumentoActuales: 1,
    versionCentroCosteActual: 0, centroCosteFinanzasIdActual: null, payloadHashOperacionB4: 'a'.repeat(64), ...overrides,
  }
}

// Original preparation coverage (8)
test('1 catálogo: sólo SUPER_ADMIN activo administra', () => {
  assert.equal(actorPuedeAdministrarCatalogo({ id: 1, activo: true, rol: 'SUPER_ADMIN' }), true)
  assert.equal(actorPuedeAdministrarCatalogo({ id: 1, activo: false, rol: 'SUPER_ADMIN' }), false)
  assert.equal(actorPuedeAdministrarCatalogo({ id: 1, activo: true, rol: 'CONTABILIDAD' }), false)
})
test('2 PATCH: contrato explícito y null sólo para desasignar', () => {
  const assign = value(parseAsignacionCentroCoste({ mode: 'asignar', vinculoMovimientoDocumentoId: LINEA, centroCosteFinanzasId: CENTRO_A, versionCentroCoste: 0, idempotencyKey: KEY }))
  assert.equal(assign.centroCosteFinanzasId, CENTRO_A)
  fails(parseAsignacionCentroCoste({ mode: 'asignar', vinculoMovimientoDocumentoId: LINEA, centroCosteFinanzasId: null, versionCentroCoste: 0, idempotencyKey: KEY }), 'CENTRO_REQUERIDO')
  assert.equal(value(parseAsignacionCentroCoste({ mode: 'desasignar', vinculoMovimientoDocumentoId: LINEA, centroCosteFinanzasId: null, versionCentroCoste: 1, idempotencyKey: KEY })).centroCosteFinanzasId, null)
})
test('3 centro inactivo conserva historia pero no admite nueva imputación', () => {
  fails(validarCentroSeleccionable({ id: CENTRO_A, activo: false }), 'CENTRO_INACTIVO')
  assert.equal(validarCentroSeleccionable({ id: CENTRO_A, activo: true }).ok, true)
})
test('4 traza actual exige DOCUMENTO, B4 vigente, operaciones activas y cierre conocido exacto', () => {
  assert.equal(validarTrazaAsignable(traza()).ok, true)
  fails(validarTrazaAsignable(traza({ tipoLinea: 'DIFERENCIA' })), 'LINEA_NO_DOCUMENTAL')
  fails(validarTrazaAsignable(traza({ operacionCreacionRevertida: true })), 'OPERACION_B4_NO_VIGENTE')
  fails(validarTrazaAsignable(traza({ todasOperacionesActivasAplicadas: false })), 'OPERACION_B4_NO_VIGENTE')
  fails(validarTrazaAsignable(traza({ importeBancoCentimos: null })), 'IMPORTE_BANCO_DESCONOCIDO')
})
test('5 versión física B8 bloquea un escritor stale', () => {
  assert.equal(comprobarVersionLinea(0, 0).ok, true)
  fails(comprobarVersionLinea(1, 0), 'VERSION_CONFLICT')
})
test('6 idempotencia humana distingue payloads para la misma clave', () => {
  const first = value(parseAsignacionCentroCoste({ mode: 'asignar', vinculoMovimientoDocumentoId: LINEA, centroCosteFinanzasId: CENTRO_A, versionCentroCoste: 0, idempotencyKey: KEY }))
  const hash = hashSolicitudAsignacion(first)
  assert.equal(value(evaluarReplayIdempotente({ payloadHash: hash, snapshotResultado: { committed: true } }, hash)).idempotente, true)
  fails(evaluarReplayIdempotente({ payloadHash: hash, snapshotResultado: {} }, hash + 'x'), 'IDEMPOTENCY_PAYLOAD_MISMATCH')
})
test('7 analítica conserva signo y rechaza banco desconocido sin cero inventado', () => {
  assert.equal(value(sumarImporteDocumentalConfirmadoPorCentro([
    { importeBancoCentimos: -10_000, cierreActualCentimos: -10_000, importeDocumentalCentimos: -7_000 },
    { importeBancoCentimos: -10_000, cierreActualCentimos: -10_000, importeDocumentalCentimos: -3_000 },
    { importeBancoCentimos: 2_000, cierreActualCentimos: 2_000, importeDocumentalCentimos: 2_000 },
  ])), -8_000)
  fails(sumarImporteDocumentalConfirmadoPorCentro([{ importeBancoCentimos: null, cierreActualCentimos: null, importeDocumentalCentimos: 0 }]), 'IMPORTE_BANCO_DESCONOCIDO')
})
test('8 deshacer queda excluido aunque el FK histórico sobreviva', () => {
  fails(validarTrazaAsignable(traza({ vinculoActivo: false, operacionCreacionRevertida: true })), 'VINCULO_INACTIVO')
})

// Six integration additions
// 9
test('9 omitido y null canonicalizan exactamente a notselected', () => {
  const omitted = value(canonicalizarEleccionesCentro([{ indiceLinea: 0, documentoConciliableId: DOC_A }]))
  const explicitNull = value(canonicalizarEleccionesCentro([{ indiceLinea: 0, documentoConciliableId: DOC_A, centroCosteFinanzasId: null }]))
  assert.equal(omitted[0]?.centroCosteFinanzasId, B8_NOT_SELECTED)
  assert.deepEqual(omitted, explicitNull)
  assert.equal(metadataHashEleccionesCentro(omitted), metadataHashEleccionesCentro(explicitNull))
})
// 10
test('10 mapping receipt tiene orden estable por documento e índice', () => {
  const a = value(canonicalizarEleccionesCentro([{ indiceLinea: 9, documentoConciliableId: DOC_B, centroCosteFinanzasId: CENTRO_B }, { indiceLinea: 2, documentoConciliableId: DOC_A, centroCosteFinanzasId: CENTRO_A }]))
  const b = value(canonicalizarEleccionesCentro([{ indiceLinea: 2, documentoConciliableId: DOC_A, centroCosteFinanzasId: CENTRO_A }, { indiceLinea: 9, documentoConciliableId: DOC_B, centroCosteFinanzasId: CENTRO_B }]))
  assert.deepEqual(a, b); assert.equal(metadataHashEleccionesCentro(a), metadataHashEleccionesCentro(b))
})
// 11
test('11 replay B4 con selección cambiada colisiona; nunca autoasigna', () => {
  const original = value(canonicalizarEleccionesCentro([{ indiceLinea: 0, documentoConciliableId: DOC_A }]))
  const changed = value(canonicalizarEleccionesCentro([{ indiceLinea: 0, documentoConciliableId: DOC_A, centroCosteFinanzasId: CENTRO_A }]))
  fails(comprobarReplayEleccion({ metadataHash: metadataHashEleccionesCentro(original), snapshotResultado: { immutable: true } }, metadataHashEleccionesCentro(changed)), 'B8_PAYLOAD_COLLISION')
})
// 12
test('12 recibo replay exacto devuelve sólo resultado inmutable', () => {
  const choice = value(canonicalizarEleccionesCentro([{ indiceLinea: 0, documentoConciliableId: DOC_A, centroCosteFinanzasId: CENTRO_A }]))
  const replay = value(comprobarReplayEleccion({ metadataHash: metadataHashEleccionesCentro(choice), snapshotResultado: { receiptId: 'immutable' } }, metadataHashEleccionesCentro(choice)))
  assert.equal(replay.replay, true); assert.deepEqual(replay.snapshotResultado, { receiptId: 'immutable' })
})
// 13
test('13 fuente actual, bool-and activo y crédito firmado son requisitos explícitos', () => {
  const good = { operacionAplicadaNoRevertida: true, estadoJustificado: true, lineasDocumentoActivas: 1, todasOperacionesActivasAplicadas: true, importeBancoCentimos: -1250, cierreActualCentimos: -1250, actualDocumentSourceGoal: true }
  assert.equal(validarPruebaActualB8(good).ok, true)
  fails(validarPruebaActualB8({ ...good, todasOperacionesActivasAplicadas: false }), 'B8_ACTIVE_OPERATION_NOT_APPLIED')
  fails(validarPruebaActualB8({ ...good, actualDocumentSourceGoal: false }), 'B8_DOCUMENT_SOURCE_STALE')
})
// 14
test('14 financial key B4 se decodifica sin centro y NO_REQUIERE conserva recibo vacío lógico', () => {
  assert.deepEqual(value(decodificarAlcanceConfirmacionB4({ action: 'confirmar', borrador: { estado: 'NO_REQUIERE', lineas: [] } })), { estadoBorrador: 'NO_REQUIERE' })
  assert.equal(todasEleccionesNoSeleccionadas(value(canonicalizarEleccionesCentro([{ indiceLinea: 0, documentoConciliableId: DOC_A }]))), true)
  fails(eleccionesDesdeLineasB4([{ tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: 1, centroCosteFinanzasId: CENTRO_A }]), 'CENTRO_EN_DIFERENCIA')
})
