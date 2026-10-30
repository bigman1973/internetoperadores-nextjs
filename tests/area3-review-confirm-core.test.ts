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

test('la procedencia legacy queda sellada en el ACK y una procedencia ausente bloquea aunque haya hash', () => {
  const captured = material({ documentEvidenceKind: 'LIFECYCLE_CAPTURED' })
  const legacy = material({ documentEvidenceKind: 'LEGACY_CONTROLLED_FINGERPRINT' })
  assert.notEqual(area3ReviewSourceHash(captured), area3ReviewSourceHash(legacy), 'el ACK no sobrevive a un cambio entre snapshot y huella legacy')

  const missing = evaluateArea3ReviewConfirm(material({ documentEvidenceKind: null }))
  assert.equal(missing.ok, false)
  assert.equal(missing.codigo, 'DOCUMENT_EVIDENCE_KIND_REQUIRED')
})
