import assert from 'node:assert/strict'
import {
  analizarCadenaSaldo,
  detectarSolapesExtracto,
  fechaCorteExtracto,
  type MovimientoCadenaSaldo,
} from '../lib/finanzas/bank-balance-chain'
import {
  detectarComisionEnConcepto,
  evaluarPistaTraspasoPropio,
  presentarCategoriaHistorica,
  presentarTipoMovimientoHistorico,
  validarCategoriaNueva,
  validarTipoMovimientoNuevo,
} from '../lib/finanzas/movement-catalog'

function fecha(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`)
}

function movimiento(
  dia: string,
  importe: number,
  saldo: number | null | undefined,
  ordenBancario?: number,
): MovimientoCadenaSaldo {
  return { fechaOperacion: fecha(dia), importe, saldo, ...(ordenBancario === undefined ? {} : { ordenBancario }) }
}

function main() {
  // Cadena normal, invariantes a que el fichero se entregue ascendente o descendente.
  const cadenaAsc = [
    movimiento('2026-10-01', 100, 100, 1),
    movimiento('2026-10-02', 25, 125, 1),
    movimiento('2026-10-03', -10, 115, 1),
  ]
  const anterior = { fecha: fecha('2026-09-30'), saldo: 0 }
  const normal = analizarCadenaSaldo(cadenaAsc, anterior)
  const normalDesc = analizarCadenaSaldo([...cadenaAsc].reverse(), anterior)
  assert.equal(normal.estado, 'OK')
  assert.equal(normal.puedeActualizarSaldo, true)
  assert.equal(normal.ultimoSaldoConocido, 115)
  assert.equal(normal.fechaUltimoMovimiento?.toISOString(), fecha('2026-10-03').toISOString())
  assert.deepEqual(normalDesc, normal, 'el orden ascendente o descendente por fecha debe ser equivalente')
  assert.equal(fechaCorteExtracto([...cadenaAsc].reverse())?.toISOString(), fecha('2026-10-03').toISOString())

  // Diferencia exacta de céntimos: nunca se absorbe con tolerancia.
  const hueco = analizarCadenaSaldo([
    movimiento('2026-10-01', 100, 100, 1),
    movimiento('2026-10-02', 25, 130, 1),
  ], anterior)
  assert.equal(hueco.estado, 'HUECO')
  assert.equal(hueco.puedeActualizarSaldo, false)
  assert.deepEqual(hueco.avisos.filter(a => a.codigo === 'HUECO_SALDO').map(a => [a.esperado, a.observado, a.diferencia]), [[125, 130, 5]])

  // Ninguna ausencia/NaN se convierte en 0; importes con fracciones de céntimo también se rechazan.
  const sinSaldo = analizarCadenaSaldo([
    movimiento('2026-10-01', 100, null, 1),
    movimiento('2026-10-02', 20, Number.NaN, 1),
    movimiento('2026-10-03', 0.001, 120, 1),
  ], anterior)
  assert.equal(sinSaldo.estado, 'SIN_SALDO')
  assert.equal(sinSaldo.puedeActualizarSaldo, false)
  assert.ok(sinSaldo.avisos.some(a => a.codigo === 'SALDO_AUSENTE'))
  assert.ok(sinSaldo.avisos.some(a => a.codigo === 'SALDO_INVALIDO'))
  assert.ok(sinSaldo.avisos.some(a => a.codigo === 'IMPORTE_NO_ENTERO_CENTIMOS'))

  // Duplicados legítimos del mismo día sobreviven y se evalúan ambos si el banco aporta orden.
  const duplicadosMismoDia = analizarCadenaSaldo([
    { ...movimiento('2026-10-02', -10, 90, 2), concepto: 'CUOTA' },
    { ...movimiento('2026-10-01', 100, 100, 1), concepto: 'APERTURA' },
    { ...movimiento('2026-10-02', -10, 80, 3), concepto: 'CUOTA' },
  ], anterior)
  assert.equal(duplicadosMismoDia.estado, 'OK')
  assert.equal(duplicadosMismoDia.ultimoSaldoConocido, 80)

  // Sin orden fiable dentro del mismo día no se reordena por concepto, id o entrada: no es falso hueco.
  const ambiguoA = analizarCadenaSaldo([
    movimiento('2026-10-01', 100, 100, 1),
    { ...movimiento('2026-10-02', -20, 80), concepto: 'A', id: 'z' },
    { ...movimiento('2026-10-02', 20, 100), concepto: 'B', id: 'a' },
  ], anterior)
  const ambiguoB = analizarCadenaSaldo([
    movimiento('2026-10-01', 100, 100, 1),
    { ...movimiento('2026-10-02', 20, 100), concepto: 'B', id: 'a' },
    { ...movimiento('2026-10-02', -20, 80), concepto: 'A', id: 'z' },
  ], anterior)
  assert.equal(ambiguoA.estado, 'ORDEN_AMBIGUO')
  assert.equal(ambiguoB.estado, 'ORDEN_AMBIGUO')
  assert.equal(ambiguoA.avisos.some(a => a.codigo === 'HUECO_SALDO'), false)
  assert.equal(ambiguoB.avisos.some(a => a.codigo === 'HUECO_SALDO'), false)
  assert.equal(ambiguoA.ultimoSaldoConocido, null, 'un día final ambiguo no declara saldo final fiable')

  // Sin puente se comunica cobertura no verificada, pero no se inventa un saldo inicial ni un hueco.
  const sinPuente = analizarCadenaSaldo(cadenaAsc)
  assert.equal(sinPuente.estado, 'OK')
  assert.equal(sinPuente.puedeActualizarSaldo, false)
  assert.ok(sinPuente.avisos.some(a => a.codigo === 'COBERTURA_NO_VERIFICADA'))

  // Solape se avisa sin colapsar los dos movimientos históricos idénticos.
  const solapes = detectarSolapesExtracto(
    [{ ...movimiento('2026-10-02', -10, 90, 1), concepto: 'CUOTA', referencia: 'R-1' }],
    [
      { ...movimiento('2026-10-02', -10, 90, 1), concepto: 'CUOTA', referencia: 'R-1' },
      { ...movimiento('2026-10-02', -10, 90, 2), concepto: 'CUOTA', referencia: 'R-1' },
    ],
  )
  assert.deepEqual(solapes.map(s => [s.indiceActual, s.indiceHistorico]), [[0, 0], [0, 1]])

  // Los aliases son sólo los expresamente autorizados, y el legado se conserva visible sin DML.
  assert.deepEqual(validarCategoriaNueva('  Oros   Gastos '), { ok: true, valor: 'Otros Gastos', fueAlias: true })
  assert.deepEqual(validarCategoriaNueva('IMPUESTOS'), { ok: true, valor: 'Impuestos', fueAlias: true })
  assert.deepEqual(validarTipoMovimientoNuevo(' Nomina '), { ok: true, valor: 'Nómina', fueAlias: true })
  assert.deepEqual(validarTipoMovimientoNuevo('dEbItO'), { ok: true, valor: 'Débito', fueAlias: true })
  assert.equal(validarCategoriaNueva('Centro de coste inventado').ok, false)
  assert.equal(validarTipoMovimientoNuevo('Cobrado').ok, false)
  assert.deepEqual(presentarCategoriaHistorica('Categoría histórica libre'), {
    valor: 'Categoría histórica libre', valorOriginal: 'Categoría histórica libre', esLegacy: true, fueAlias: false,
  })
  assert.deepEqual(presentarTipoMovimientoHistorico('Nomina'), {
    valor: 'Nómina', valorOriginal: 'Nomina', esLegacy: false, fueAlias: true,
  })

  // La palabra comisión no basta: cero, negativo o ausencia de cifra nunca convierten una compra en comisión.
  assert.deepEqual(detectarComisionEnConcepto('COMPRA MERCADO - COMISION 0,00 EUR'), {
    esComisionPositiva: false, importe: 0, motivo: 'COMISION_CERO_O_NEGATIVA',
  })
  assert.deepEqual(detectarComisionEnConcepto('COMISIÓN -0,00'), {
    esComisionPositiva: false, importe: -0, motivo: 'COMISION_CERO_O_NEGATIVA',
  })
  assert.deepEqual(detectarComisionEnConcepto('COMISION 0.00'), {
    esComisionPositiva: false, importe: 0, motivo: 'COMISION_CERO_O_NEGATIVA',
  })
  assert.deepEqual(detectarComisionEnConcepto('COMISIÓN DE MANTENIMIENTO'), {
    esComisionPositiva: false, importe: null, motivo: 'COMISION_SIN_IMPORTE',
  })
  assert.deepEqual(detectarComisionEnConcepto('COMISION 1,25 EUR'), {
    esComisionPositiva: true, importe: 1.25, motivo: 'COMISION_POSITIVA',
  })

  // TRASSPAS aislado o con tercero externo no es traspaso propio. Con identidad propia es sólo candidato B6.
  const sinIdentidad = evaluarPistaTraspasoPropio({
    concepto: 'TRASSPAS ENTRE CUENTAS', tercero: null, identidadesPropias: [{ tercero: 'Internet Operadores SL' }],
  })
  assert.equal(sinIdentidad.esCandidatoTraspasoPropio, false)
  assert.equal(sinIdentidad.motivo, 'SIN_IDENTIDAD_PROPIA')
  const terceroExterno = evaluarPistaTraspasoPropio({
    concepto: 'TRASSPAS PROVEEDOR', tercero: 'Proveedor externo', identidadesPropias: [{ tercero: 'Internet Operadores SL' }],
  })
  assert.equal(terceroExterno.esCandidatoTraspasoPropio, false)
  const conTerceroPropio = evaluarPistaTraspasoPropio({
    concepto: 'TRASSPAS', tercero: 'INTERNET OPERADORES, S.L.', identidadesPropias: [{ tercero: 'Internet Operadores SL' }],
  })
  assert.equal(conTerceroPropio.esCandidatoTraspasoPropio, true)
  assert.equal(conTerceroPropio.coincidencia, 'TERCERO')
  assert.equal(conTerceroPropio.requiereParejaCompatible, true)
  assert.equal(conTerceroPropio.puedeConciliarAutomaticamente, false)
  assert.equal(conTerceroPropio.puedeClasificarComoCobrado, false)
  const conIbanPropio = evaluarPistaTraspasoPropio({
    concepto: 'TRASSPAS', ibanContraparte: 'ES91 2100 0418 4502 0005 1332', identidadesPropias: [{ iban: 'ES9121000418450200051332' }],
  })
  assert.equal(conIbanPropio.esCandidatoTraspasoPropio, true)
  assert.equal(conIbanPropio.coincidencia, 'IBAN')

  console.log('OK B3 núcleo sintético: cadena exacta, cobertura, huecos, orden ambiguo, solapes, catálogo/legacy, comisión contextual y pistas TRASSPAS; sin BD, red ni escrituras.')
}

main()
