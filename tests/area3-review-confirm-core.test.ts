import assert from 'node:assert/strict'
import test from 'node:test'
import {
  area3ReviewSourceHash,
  evaluateArea3ReviewConfirm,
  type Area3ReviewConfirmMaterial,
} from '../lib/finanzas/area3-review-confirm-core'

function material(overrides: Partial<Area3ReviewConfirmMaterial> = {}): Area3ReviewConfirmMaterial {
  return {
    rowId: 'fila-ambar-1',
    rowColor: 'AMBAR',
    rowSelectable: false,
    decisionHash: 'a'.repeat(64),
    projectionSourceHash: 'b'.repeat(64),
    motivoProyeccion: 'SIN_REFERENCIA_DOCUMENTAL',
    movimientoId: 'movimiento-1',
    versionB4: 3,
    importeBancoCentimos: -10_000,
    fechaBanco: '2026-10-30',
    textoBanco: 'TRANSFERENCIA PROVEEDOR',
    referenciaBanco: null,
    proveedorExacto: true,
    tipoProveedor: 'EXACT',
    proveedorDocumental: 'Proveedor sintético, S.L.',
    facturaRecibidaId: 'factura-1',
    referenciaDocumento: 'FAC-2026-42',
    fechaDocumento: '2026-10-29',
    importeObjetivoDocumentoCentimos: -10_000,
    netoActivoPrevioCentimos: 0,
    archivoControladoDisponible: true,
    documentoAccesible: true,
    documentoCanonico: true,
    documentStateSnapshotEligible: true,
    documentStateSnapshotKind: 'PRODUCTIVE_CANONICAL_STATE',
    documentStateSnapshotHash: 'c'.repeat(64),
    ...overrides,
  }
}

function acknowledgement(source: Area3ReviewConfirmMaterial) {
  return {
    schema: 'AREA3_REVIEW_ACK_V2' as const,
    version: '2026-11-01' as const,
    motivo: source.motivoProyeccion!,
    sourceHash: area3ReviewSourceHash(source),
    advertenciaReconocida: true as const,
  }
}

test('el preflight ámbar sólo solicita ACK V2 y la confirmación conserva ámbar', () => {
  const source = material()
  const preview = evaluateArea3ReviewConfirm(source)
  assert.equal(preview.ok, false)
  assert.equal(preview.codigo, 'ACK_REQUERIDO')
  assert.equal(preview.color, 'AMBAR')
  assert.equal(preview.confirmableGreen, false)

  const approved = evaluateArea3ReviewConfirm(source, acknowledgement(source))
  assert.equal(approved.ok, true)
  if (!approved.ok) return
  assert.equal(approved.color, 'AMBAR')
  assert.equal(approved.confirmableGreen, false)
  assert.equal(approved.importeLineaCentimos, -10_000)
  assert.equal(approved.restoMovimientoCentimos, 0)
  assert.equal(approved.documentStateSnapshotKind, 'PRODUCTIVE_CANONICAL_STATE')
})

test('un cambio de snapshot productivo invalida el ACK aunque importe y fila permanezcan iguales', () => {
  const source = material()
  const ack = acknowledgement(source)
  const changed = material({ documentStateSnapshotHash: 'd'.repeat(64) })
  assert.notEqual(area3ReviewSourceHash(source), area3ReviewSourceHash(changed), 'el snapshot se incluye en el sello ACK')
  const rejected = evaluateArea3ReviewConfirm(changed, ack)
  assert.equal(rejected.ok, false)
  assert.equal(rejected.codigo, 'ACK_SOURCE_STALE')
})

test('el snapshot ausente o de una clase ajena bloquea sin reclamar bytes remotos', () => {
  const missing = evaluateArea3ReviewConfirm(material({ documentStateSnapshotEligible: false, documentStateSnapshotKind: null, documentStateSnapshotHash: null }))
  assert.equal(missing.ok, false)
  assert.equal(missing.codigo, 'DOCUMENT_STATE_SNAPSHOT_NO_VIGENTE')

  const malformed = evaluateArea3ReviewConfirm(material({ documentStateSnapshotKind: null }))
  assert.equal(malformed.ok, false)
  assert.equal(malformed.codigo, 'DOCUMENT_STATE_SNAPSHOT_KIND_REQUIRED')

  const noHash = evaluateArea3ReviewConfirm(material({ documentStateSnapshotHash: null }))
  assert.equal(noHash.ok, false)
  assert.equal(noHash.codigo, 'DOCUMENT_STATE_SNAPSHOT_HASH_REQUIRED')
})

test('un importe documental distinto no habilita pagos parciales, diferencias ni ajustes ficticios', () => {
  const decision = evaluateArea3ReviewConfirm(material({ importeObjetivoDocumentoCentimos: -12_000 }))
  assert.equal(decision.ok, false)
  assert.equal(decision.codigo, 'IMPORTE_DOCUMENTAL_NO_EXACTO')
  assert.match(decision.mensaje, /no admite pagos parciales ni diferencias/i)
})

test('un número incompleto sigue siendo revisable, pero una referencia alfanumérica contradictoria bloquea', () => {
  const incomplete = material({
    motivoProyeccion: 'REFERENCIA_NUMERO_INCOMPLETO',
    textoBanco: '',
    referenciaBanco: '1020',
  })
  const preview = evaluateArea3ReviewConfirm(incomplete)
  assert.equal(preview.ok, false)
  assert.equal(preview.codigo, 'ACK_REQUERIDO')

  const contradictory = evaluateArea3ReviewConfirm(material({
    textoBanco: 'PAGO FAC-2026-99',
    referenciaBanco: 'FAC-2026-99',
  }))
  assert.equal(contradictory.ok, false)
  assert.equal(contradictory.codigo, 'REFERENCIA_EXPLICITA_CONTRADICTORIA')
  assert.equal(contradictory.color, 'ROJO')
})

test('el año en el nombre del proveedor no es otra factura; una cita explícita o referencia separada sí bloquean', () => {
  const source = material({
    motivoProyeccion: 'REFERENCIA_NUMERO_INCOMPLETO',
    proveedorExacto: false,
    tipoProveedor: 'DOCUMENTARY',
    proveedorDocumental: 'ACME 2042, S.L.',
    textoBanco: 'ACME 2042, S.L. PAGO FACTURA 100042',
    referenciaDocumento: 'Z100042',
  })
  const preview = evaluateArea3ReviewConfirm(source)
  assert.equal(preview.ok, false)
  assert.equal(preview.codigo, 'ACK_REQUERIDO')
  assert.equal(preview.confirmableGreen, false)
  for (const changed of [
    { textoBanco: 'PAGO FACTURA ACME2042' },
    { textoBanco: `${'Texto previo '.repeat(20)} FACTURA ACME2042` },
    { referenciaBanco: 'ACME2042' },
    { textoBanco: 'ACME 2042, S.L. PAGO FACTURA CC260000009999' },
  ]) {
    const rejected = evaluateArea3ReviewConfirm({ ...source, ...changed })
    assert.equal(rejected.ok, false)
    assert.equal(rejected.codigo, 'REFERENCIA_EXPLICITA_CONTRADICTORIA', JSON.stringify(changed))
    assert.equal(rejected.confirmableGreen, false)
  }
})

test('DOCUMENTARY exige ACK humano sellado, conserva ámbar y nombra el proveedor que debe comprobarse', () => {
  const source = material({
    motivoProyeccion: 'REFERENCIA_NUMERO_INCOMPLETO',
    proveedorExacto: false,
    tipoProveedor: 'DOCUMENTARY',
    proveedorDocumental: 'BUTPO',
    referenciaDocumento: 'F260008',
    textoBanco: 'PAGO FACTURA 260007 BUTPO',
    referenciaBanco: '260007',
  })
  const preview = evaluateArea3ReviewConfirm(source)
  assert.equal(preview.ok, false)
  assert.equal(preview.codigo, 'ACK_REQUERIDO')
  assert.equal(preview.color, 'AMBAR')
  assert.match(preview.mensaje, /BUTPO/)
  assert.match(preview.mensaje, /F260008/)

  const approved = evaluateArea3ReviewConfirm(source, acknowledgement(source))
  assert.equal(approved.ok, true)
  if (!approved.ok) return
  assert.equal(approved.color, 'AMBAR')
  assert.equal(approved.confirmableGreen, false)
})

test('un proveedor documental ajeno no equivale a identidad exacta y se sella en el ACK', () => {
  const documentary = material({ proveedorExacto: false, tipoProveedor: 'DOCUMENTARY', proveedorDocumental: 'HubSpot' })
  const alteredProvider = { ...documentary, proveedorDocumental: 'Otro proveedor' }
  assert.notEqual(area3ReviewSourceHash(documentary), area3ReviewSourceHash(alteredProvider), 'el ACK no sobrevive a otro proveedor documental')

  const malformed = evaluateArea3ReviewConfirm(material({ proveedorExacto: true, tipoProveedor: 'DOCUMENTARY', proveedorDocumental: 'HubSpot' }))
  assert.equal(malformed.ok, false)
  assert.equal(malformed.codigo, 'PROVEEDOR_DOCUMENTAL_DESCONOCIDO')

  const foreignProvider = evaluateArea3ReviewConfirm(material({ proveedorExacto: false, tipoProveedor: 'INCOHERENT' }))
  assert.equal(foreignProvider.ok, false)
  assert.equal(foreignProvider.codigo, 'PROVEEDOR_TIPO_INCOHERENTE')
  assert.equal(foreignProvider.color, 'ROJO')
})

test('una tarjeta etiquetada no es una factura, pero una factura explícita y una referencia separada siguen bloqueadas', () => {
  // Synthetic digits; no real card or financial source is used here.
  const card = `TARJETA${'1'.repeat(16)}`
  const source = material({ textoBanco: `COMPRA ${card} PROVEEDOR`, referenciaDocumento: '100000042' })
  const preview = evaluateArea3ReviewConfirm(source)
  assert.equal(preview.ok, false)
  assert.equal(preview.codigo, 'ACK_REQUERIDO')
  assert.equal(preview.confirmableGreen, false)
  for (const changed of [
    { textoBanco: `PAGO FACTURA ${card}` },
    { referenciaBanco: card },
    { textoBanco: `COMPRA ${card} FACTURA CC260000009999` },
  ]) {
    const rejected = evaluateArea3ReviewConfirm({ ...source, ...changed })
    assert.equal(rejected.ok, false)
    assert.equal(rejected.codigo, 'REFERENCIA_EXPLICITA_CONTRADICTORIA')
  }
})
