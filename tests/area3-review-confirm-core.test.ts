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
    documentLifecycleEligible: true,
    documentEvidenceKind: 'LIFECYCLE_CAPTURED',
    documentVersionHash: 'c'.repeat(64),
    ...overrides,
  }
}

test('el preflight ámbar sólo solicita ACK y la confirmación exige su hash versionado', () => {
  const source = material()
  const preview = evaluateArea3ReviewConfirm(source)
  assert.equal(preview.ok, false)
  assert.equal(preview.codigo, 'ACK_REQUERIDO')
  assert.equal(preview.color, 'AMBAR')
  assert.equal(preview.confirmableGreen, false)

  const acknowledgement = {
    schema: 'AREA3_REVIEW_ACK_V1' as const,
    version: '2026-10-30' as const,
    motivo: 'SIN_REFERENCIA_DOCUMENTAL' as const,
    sourceHash: area3ReviewSourceHash(source),
    advertenciaReconocida: true as const,
  }
  const approved = evaluateArea3ReviewConfirm(source, acknowledgement)
  assert.equal(approved.ok, true)
  if (!approved.ok) return
  assert.equal(approved.color, 'AMBAR')
  assert.equal(approved.confirmableGreen, false)
  assert.equal(approved.importeLineaCentimos, -10_000)
  assert.equal(approved.restoMovimientoCentimos, 0)
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

  const acknowledgement = {
    schema: 'AREA3_REVIEW_ACK_V1' as const,
    version: '2026-10-30' as const,
    motivo: 'REFERENCIA_NUMERO_INCOMPLETO' as const,
    sourceHash: area3ReviewSourceHash(source),
    advertenciaReconocida: true as const,
  }
  const approved = evaluateArea3ReviewConfirm(source, acknowledgement)
  assert.equal(approved.ok, true)
  if (!approved.ok) return
  assert.equal(approved.color, 'AMBAR')
  assert.equal(approved.confirmableGreen, false)
})

test('DOCUMENTARY no equivale a EXACT, se sella con su proveedor y estados ajenos siguen bloqueados', () => {
  const documentary = material({ proveedorExacto: false, tipoProveedor: 'DOCUMENTARY', proveedorDocumental: 'HubSpot' })
  const alteredProvider = { ...documentary, proveedorDocumental: 'Otro proveedor' }
  assert.notEqual(area3ReviewSourceHash(documentary), area3ReviewSourceHash(alteredProvider), 'el ACK no sobrevive a otro proveedor documental')

  const malformed = evaluateArea3ReviewConfirm(material({ proveedorExacto: true, tipoProveedor: 'DOCUMENTARY', proveedorDocumental: 'HubSpot' }))
  assert.equal(malformed.ok, false)
  assert.equal(malformed.codigo, 'PROVEEDOR_DOCUMENTAL_DESCONOCIDO')

  const incoherent = evaluateArea3ReviewConfirm(material({ proveedorExacto: false, tipoProveedor: 'INCOHERENT' }))
  assert.equal(incoherent.ok, false)
  assert.equal(incoherent.codigo, 'PROVEEDOR_TIPO_INCOHERENTE')
  assert.equal(incoherent.color, 'ROJO')
})

test('la procedencia legacy queda sellada en el ACK y una procedencia ausente bloquea aunque haya hash', () => {
  const captured = material({ documentEvidenceKind: 'LIFECYCLE_CAPTURED' })
  const legacy = material({ documentEvidenceKind: 'LEGACY_CONTROLLED_FINGERPRINT' })
  assert.notEqual(area3ReviewSourceHash(captured), area3ReviewSourceHash(legacy), 'el ACK no sobrevive a un cambio entre snapshot y huella legacy')

  const missing = evaluateArea3ReviewConfirm(material({ documentEvidenceKind: null }))
  assert.equal(missing.ok, false)
  assert.equal(missing.codigo, 'DOCUMENT_EVIDENCE_KIND_REQUIRED')
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
