import assert from 'node:assert/strict'
import {
  aCentimosExactos,
  claveCanonicaFactura,
  elegirCanonicaDeterminista,
  esFechaDocumentoIso,
  esImporteCentimosFinito,
  normalizarCif,
  normalizarNumeroFactura,
  totalCuadraEnCentimos,
  validarResultadoOcrNuevo,
} from '../lib/finanzas/invoice-quality'
import { planDeduplicacion } from '../lib/finanzas/invoice-quality-db'

const valida = {
  proveedor: 'Proveedor sintético, S.L.', cif: 'B-12.345.678', numFactura: 'A / 2026- 001',
  fecha: '2026-02-28', fechaProvenancia: 'DOCUMENTO', base: 100.01, tipoIva: 21,
  importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121.01, confianza: 0.99,
  lineas: [{ importeNeto: 100.01 }],
}

function row(id: string, createdAt: string, enlaces = 0, total = 121.01) {
  return {
    id, createdAt: new Date(createdAt), proveedor: 'Proveedor sintético, S.L.', fecha: new Date('2026-02-28T12:00:00Z'),
    base: 100.01, importeIva: 21, importeIrpf: 0, total, calidad: 'VALIDA' as const, copiaDeId: null,
    canonKey: null, conflictoIdentidad: false, duplicadoExterno: false, versionCalidad: 1,
    movimientos: Array.from({ length: enlaces }, (_, index) => ({ id: `${id}-link-${index}` })),
    confirmingLineas: [], documentosOperadora: [],
  }
}

function main() {
  // CIF: sus separadores son puramente tipográficos. Número: /.-_ son semánticos.
  assert.equal(normalizarCif(' b-12.345 678 '), 'B12345678')
  assert.equal(normalizarCif('B_12/345.678'), 'B12345678')
  assert.equal(normalizarNumeroFactura(' A / 2026- 001 '), 'A/2026-001')
  assert.notEqual(normalizarNumeroFactura('A/1'), normalizarNumeroFactura('A-1'))
  assert.notEqual(normalizarNumeroFactura('A.1'), normalizarNumeroFactura('A_1'))
  assert.equal(claveCanonicaFactura('B-12.345.678', 'A / 2026- 001'), 'CIF:B12345678|NUM:A/2026-001')
  assert.equal(claveCanonicaFactura('B12345678', 'A/2026-001'), 'CIF:B12345678|NUM:A/2026-001')
  assert.equal(claveCanonicaFactura('B12345678', 'A/2026001'), 'CIF:B12345678|NUM:A/2026001')
  assert.equal(claveCanonicaFactura('B\u000012345678', 'A-1'), null)

  // Ningún redondeo implícito: los importes pueden ser negativos, pero son céntimos exactos.
  assert.equal(esImporteCentimosFinito(-1.23), true)
  assert.equal(esImporteCentimosFinito(0.001), false)
  assert.throws(() => aCentimosExactos(12.345), /IMPORTE_NO_ENTERO_CENTIMOS/)
  assert.equal(totalCuadraEnCentimos(-100, -21, 0, -121), true)
  assert.equal(totalCuadraEnCentimos(100.01, 21, 0, 121.01), true)
  assert.equal(totalCuadraEnCentimos(100, 21, 0, 121.01), false)
  assert.equal(esFechaDocumentoIso('2026-02-29'), false)
  assert.equal(esFechaDocumentoIso('2024-02-29'), true)

  const ok = validarResultadoOcrNuevo(valida)
  assert.deepEqual(ok, { ok: true, identidad: 'CIF:B12345678|NUM:A/2026-001' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, proveedor: 'DESCONOCIDO' }), { ok: false, motivo: 'PROVEEDOR_NO_LEIDO' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, proveedor: 'ERROR_OCR' }), { ok: false, motivo: 'PROVEEDOR_NO_LEIDO' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, fechaProvenancia: 'NOMBRE_ARCHIVO' }), { ok: false, motivo: 'FECHA_NO_DOCUMENTAL' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, fecha: '2026-02-29' }), { ok: false, motivo: 'FECHA_INVALIDA' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, total: 121.02 }), { ok: false, motivo: 'TOTAL_NO_CUADRA' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, base: 100.001, total: 121.001, lineas: [{ importeNeto: 100.001 }] }), { ok: false, motivo: 'IMPORTES_NO_LEIDOS' })
  assert.deepEqual(validarResultadoOcrNuevo({ ...valida, lineas: [] }), { ok: false, motivo: 'LINEAS_NO_LEIDAS' })

  // El plan conserva una única canónica ya vinculada y permanece estable si se recalcula.
  const older = row('00000000-0000-4000-8000-000000000001', '2026-01-01T12:00:00Z')
  const linked = row('00000000-0000-4000-8000-000000000002', '2026-02-01T12:00:00Z', 1)
  const linkedPlan = planDeduplicacion([older, linked])
  assert.equal(linkedPlan.canonica?.id, linked.id, 'una única factura ya enlazada es canónica')
  assert.deepEqual(linkedPlan.copias.map(item => item.id), [older.id])
  assert.equal(planDeduplicacion([older, linked]).canonica?.id, linked.id, 'el plan no depende del orden de reintento')

  // Varios enlaces y datos económicos incompatibles son ambiguos: el plan los marca
  // como conflicto y el endpoint debe rechazar la resolución, nunca fundir importes.
  const linkedA = row('00000000-0000-4000-8000-000000000003', '2026-01-01T12:00:00Z', 1, 121.01)
  const linkedB = row('00000000-0000-4000-8000-000000000004', '2026-01-02T12:00:00Z', 1, 199.99)
  const ambiguous = planDeduplicacion([linkedB, linkedA])
  assert.equal(ambiguous.conflicto, true, 'enlaces ambiguos con importes distintos se señalan')
  assert.equal(ambiguous.canonica?.id, linkedA.id, 'el desempate es determinista y no cambia vínculos')
  assert.equal(elegirCanonicaDeterminista([{ ...linkedA, calidad: 'REVISAR_LECTURA' }]), null, 'cuarentena nunca se vuelve canónica')

  console.log('OK B2 núcleo sintético: CIF/número semántico, céntimos firmados, cuarentena, fecha, proveedor y plan canónico/conflicto determinista; sin BD, Graph ni escrituras.')
}
main()
