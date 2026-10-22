import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CostCenterPayloadError,
  formatEuroCentimos,
  parseAnaliticaResponse,
  parseCatalogResponse,
  parseLineasResponse,
} from '../components/finanzas/centros-coste/CostCenterWorkspace.parsers'

const uuid = '11111111-1111-4111-8111-111111111111'

function validAnalitica(overrides: Record<string, unknown> = {}) {
  return {
    recurso: 'analitica',
    fechaCorte: '2026-10-22',
    moneda: 'EUR',
    etiquetaMoneda: 'EUR',
    etiquetaImporte: 'importe documental confirmado por centro',
    sinProrrateo: true,
    items: [{
      centroCosteFinanzasId: uuid,
      codigo: 'OPS',
      nombre: 'Operaciones',
      activo: true,
      fechaOperacion: '2026-10-22',
      lineas: 2,
      importeDocumentalConfirmadoPorCentroCentimos: -123456,
    }],
    gaps: [],
    ...overrides,
  }
}

test('analítica convierte exclusivamente number entero seguro a BigInt exacto', () => {
  const parsed = parseAnaliticaResponse(validAnalitica())
  assert.equal(parsed.items[0]!.importeDocumentalConfirmadoPorCentroCentimos, -BigInt(123456))
  assert.equal(formatEuroCentimos(parsed.items[0]!.importeDocumentalConfirmadoPorCentroCentimos), '-1.234,56\u00a0€')
  assert.equal(formatEuroCentimos(BigInt(9007199254740991)), '90.071.992.547.409,91\u00a0€')
})

test('analítica rechaza centimos flotantes o no seguros en vez de mostrar cero', () => {
  assert.throws(
    () => parseAnaliticaResponse(validAnalitica({ items: [{ ...validAnalitica().items[0], importeDocumentalConfirmadoPorCentroCentimos: 1.5 }] })),
    (error: unknown) => error instanceof CostCenterPayloadError && error.path.endsWith('importeDocumentalConfirmadoPorCentroCentimos'),
  )
  assert.throws(
    () => parseAnaliticaResponse(validAnalitica({ items: [{ ...validAnalitica().items[0], importeDocumentalConfirmadoPorCentroCentimos: Number.MAX_SAFE_INTEGER + 2 }] })),
    CostCenterPayloadError,
  )
})

test('analítica exige contrato EUR, fecha de corte, evidencia y gaps completos', () => {
  assert.throws(() => parseAnaliticaResponse(validAnalitica({ moneda: 'USD' })), CostCenterPayloadError)
  assert.throws(() => parseAnaliticaResponse(validAnalitica({ fechaCorte: '2026-02-30' })), CostCenterPayloadError)
  assert.throws(() => parseAnaliticaResponse(validAnalitica({ items: [{ ...validAnalitica().items[0], lineas: 0 }] })), CostCenterPayloadError)
  assert.throws(() => parseAnaliticaResponse(validAnalitica({ gaps: [{ codigo: 'X', lineas: 0, detalle: 'x' }] })), CostCenterPayloadError)
})

test('catálogo exige campos completos y versión de concurrencia segura', () => {
  assert.deepEqual(parseCatalogResponse({ recurso: 'centros', items: [{ id: uuid, codigo: 'OPS', nombre: 'Operaciones', activo: true, version: 7 }] }), [{ id: uuid, codigo: 'OPS', nombre: 'Operaciones', activo: true, version: 7 }])
  assert.throws(() => parseCatalogResponse({ recurso: 'centros', items: [{ id: uuid, codigo: 'OPS', nombre: 'Operaciones', activo: true, version: -1 }] }), CostCenterPayloadError)
})

test('líneas exige paginación inmediata y campos de centro coherentes', () => {
  const line = { id: uuid, movimientoId: 'MOV-1', referencia: 'FAC-1', fechaOperacion: '2026-10-22', centroCosteFinanzasId: null, centroCosteCodigo: null, versionCentroCoste: 0 }
  const response = parseLineasResponse({ recurso: 'lineas-confirmadas', items: [line], paginacion: { pagina: 2, limit: 50, siguientePagina: 3 }, gaps: [] })
  assert.equal(response.paginacion.siguientePagina, 3)
  assert.throws(() => parseLineasResponse({ recurso: 'lineas-confirmadas', items: [line], paginacion: { pagina: 2, limit: 50, siguientePagina: 4 }, gaps: [] }), CostCenterPayloadError)
  assert.throws(() => parseLineasResponse({ recurso: 'lineas-confirmadas', items: [{ ...line, centroCosteCodigo: 'OPS' }], paginacion: { pagina: 1, limit: 50, siguientePagina: null }, gaps: [] }), CostCenterPayloadError)
})
