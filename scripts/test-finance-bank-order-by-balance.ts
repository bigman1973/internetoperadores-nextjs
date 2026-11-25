import assert from 'node:assert/strict'
import {
  aCentimosExactos,
  asignarOrdenDia,
  cierreDiaPorSaldo,
  derivarOrdenBancarioPorSaldo,
  ordenarDiaPorSaldo,
  recorrerCadenaPorDias,
} from '../lib/finanzas/bank-order-by-balance'
import { analizarCadenaSaldo } from '../lib/finanzas/bank-balance-chain'
import { diagnoseBankChainGaps } from '../lib/finanzas/bank-chain-gaps-core'

let n = 0
const t = (nombre: string, f: () => void) => { f(); n++; console.log('ok', nombre) }
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

// Cadena única desordenada: 100 -> -30 (70) -> +50 (120) -> -20 (100)
t('cadena única desordenada', () => {
  const filas = [{ importe: 50, saldo: 120 }, { importe: -20, saldo: 100.0 }, { importe: -30, saldo: 70 }]
  const r = ordenarDiaPorSaldo(filas, 10000)
  assert.ok(r.ok && r.estado === 'UNICO')
  assert.deepEqual(r.ok && r.orden, [2, 0, 1])
  assert.equal(r.ok && r.saldoFinal, 10000)
  assert.deepEqual(asignarOrdenDia(filas, 10000)?.orden, [2, 3, 1].map((_, i) => [2, 3, 1][i]))
})
t('sin saldo anterior prueba todas las aperturas', () => {
  const r = ordenarDiaPorSaldo([{ importe: 50, saldo: 120 }, { importe: -30, saldo: 70 }], null)
  assert.ok(r.ok && r.estado === 'UNICO' && r.saldoInicial === 10000)
})
t('ciclo A->B->A (retorno al saldo inicial) no se rechaza', () => {
  const r = ordenarDiaPorSaldo([{ importe: -10, saldo: 90 }, { importe: 10, saldo: 100 }], 10000)
  assert.ok(r.ok && r.estado === 'UNICO')
  assert.deepEqual(r.ok && r.orden, [0, 1])
})
t('dos órdenes válidos => AMBIGUO y no se asigna orden', () => {
  // +10 y -10 entre saldos distintos: A: 100->110->100 ; B: 100->90->100 con filas distintas
  const filas = [{ importe: 10, saldo: 110 }, { importe: -10, saldo: 100 }, { importe: -10, saldo: 90 }, { importe: 10, saldo: 100 }]
  const r = ordenarDiaPorSaldo(filas, 10000)
  assert.ok(r.ok && r.estado === 'AMBIGUO')
  assert.equal(asignarOrdenDia(filas, 10000), null)
})
t('filas idénticas no son alternativa', () => {
  const r = ordenarDiaPorSaldo([{ importe: -10, saldo: 90 }, { importe: -10, saldo: 90 }], 10000)
  assert.ok(!r.ok || true)
  const r2 = ordenarDiaPorSaldo([{ importe: -10, saldo: 90 }, { importe: -10, saldo: 80 }], 10000)
  assert.ok(r2.ok && r2.estado === 'UNICO')
  const r3 = ordenarDiaPorSaldo([{ importe: -10, saldo: 90 }, { importe: -10, saldo: 90 }], 10000)
  assert.equal(r3.ok, false) // dos filas idénticas no encadenan entre sí
})
t('imposible con saldo anterior que no encaja', () => {
  const r = ordenarDiaPorSaldo([{ importe: 50, saldo: 120 }], 20000)
  assert.ok(!r.ok && r.estado === 'IMPOSIBLE')
})
t('agotamiento del presupuesto => INCONCLUSO', () => {
  const filas = Array.from({ length: 10 }, (_, i) => ({ importe: i % 2 ? 1 : -1, saldo: 100 + (i % 2 ? 0 : -1) }))
  const r = ordenarDiaPorSaldo(filas, 10000, 5)
  assert.ok(!r.ok && r.estado === 'INCONCLUSO')
})
t('importes inválidos', () => {
  assert.equal(aCentimosExactos(0.001), null)
  assert.equal(aCentimosExactos(NaN), null)
  assert.equal(aCentimosExactos(2e9), null)
  assert.equal(aCentimosExactos(10.1), 1010)
  const a = ordenarDiaPorSaldo([{ importe: 1.005, saldo: 10 }], null)
  assert.ok(!a.ok && a.estado === 'DATO_INVALIDO')
  const b = ordenarDiaPorSaldo([{ importe: 1, saldo: null }], null)
  assert.ok(!b.ok && b.estado === 'DATO_INVALIDO')
})
t('un día roto no arrastra saldos al siguiente', () => {
  const r = recorrerCadenaPorDias([
    { dia: '2026-01-01', importe: 10, saldo: 110 },
    { dia: '2026-01-02', importe: 5, saldo: 999 }, // no encadena con 110
    { dia: '2026-01-03', importe: 1, saldo: 1000 },
  ], 10000)
  assert.equal(r.dias[0].estado, 'UNICO')
  assert.equal(r.dias[1].estado, 'SALTO_ENTRE_DIAS')
  assert.equal(r.dias[2].estado, 'UNICO')
})
t('derivarOrdenBancarioPorSaldo alinea con la entrada y respeta B3', () => {
  const movs = [
    { fechaOperacion: d('2026-02-01'), importe: 50, saldo: 120 },
    { fechaOperacion: d('2026-02-01'), importe: -30, saldo: 70 },
    { fechaOperacion: d('2026-02-02'), importe: -5, saldo: 115 },
  ]
  const orden = derivarOrdenBancarioPorSaldo(movs, 100)
  assert.deepEqual(orden, [2, 1, null])
  const sin = analizarCadenaSaldo(movs.map(m => ({ ...m })), null)
  assert.equal(sin.estado, 'ORDEN_AMBIGUO')
  const con = analizarCadenaSaldo(movs.map((m, i) => ({ ...m, ordenBancario: orden[i] })), null)
  assert.equal(con.estado, 'OK')
  assert.equal(con.ultimoSaldoConocido, 115)
})
t('día ambiguo no recibe orden y B3 sigue avisando', () => {
  const movs = [
    { fechaOperacion: d('2026-03-01'), importe: 10, saldo: 110 },
    { fechaOperacion: d('2026-03-01'), importe: -10, saldo: 100 },
    { fechaOperacion: d('2026-03-01'), importe: -10, saldo: 90 },
    { fechaOperacion: d('2026-03-01'), importe: 10, saldo: 100 },
  ]
  const orden = derivarOrdenBancarioPorSaldo(movs, 100)
  assert.deepEqual(orden, [null, null, null, null])
  assert.equal(analizarCadenaSaldo(movs.map((m, i) => ({ ...m, ordenBancario: orden[i] })), null).estado, 'ORDEN_AMBIGUO')
})
t('un salto real sigue siendo HUECO', () => {
  const movs = [
    { fechaOperacion: d('2026-04-01'), importe: 10, saldo: 110 },
    { fechaOperacion: d('2026-04-02'), importe: 5, saldo: 500 },
  ]
  const orden = derivarOrdenBancarioPorSaldo(movs, null)
  assert.equal(analizarCadenaSaldo(movs.map((m, i) => ({ ...m, ordenBancario: orden[i] })), null).estado, 'HUECO')
})
t('cierreDiaPorSaldo', () => {
  assert.equal(cierreDiaPorSaldo([{ fechaOperacion: d('2026-01-01'), importe: 50, saldo: 120 }, { fechaOperacion: d('2026-01-01'), importe: -30, saldo: 70 }]), 120)
  assert.equal(cierreDiaPorSaldo([]), null)
})
t('diagnóstico de huecos: día con varios apuntes de orden único ya no es ambiguo', () => {
  const row = (id: string, fecha: string, imp: number, saldo: number) => ({ id, cuentaId: 'c', fecha, importeCentimos: imp, saldoCentimos: saldo })
  const dg = diagnoseBankChainGaps([
    row('a', '2026-05-01', 5000, 12000), row('b', '2026-05-01', -3000, 7000),
    row('c', '2026-05-02', -500, 11500),
  ])
  assert.equal(dg.fallos.filter(x => x.codigo === 'ORDEN_O_DUPLICADO_AMBIGUO').length, 0)
  assert.equal(dg.fallos.filter(x => x.codigo === 'SALTO_DE_SALDO').length, 0)
  const dg2 = diagnoseBankChainGaps([
    row('a', '2026-05-01', 5000, 12000), row('b', '2026-05-01', -3000, 7000),
    row('c', '2026-05-02', -500, 9999),
  ])
  assert.equal(dg2.fallos.filter(x => x.codigo === 'SALTO_DE_SALDO').length, 1)
  const amb = diagnoseBankChainGaps([
    row('a', '2026-06-01', 1000, 11000), row('b', '2026-06-01', -1000, 10000),
    row('c', '2026-06-01', -1000, 9000), row('d', '2026-06-01', 1000, 10000),
  ])
  assert.equal(amb.fallos.filter(x => x.codigo === 'ORDEN_O_DUPLICADO_AMBIGUO').length, 1)
})
console.log(`bank-order-by-balance: ${n} pruebas OK`)
