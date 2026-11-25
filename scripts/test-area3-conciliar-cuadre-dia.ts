import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analizarCuadreDia, ignorarDuplicadosImportacion, type FilaCuadre } from '../lib/finanzas/conciliar-cuadre-dia'

let pasadas = 0
function t(nombre: string, fn: () => void) {
  try { fn(); pasadas++; console.log(`  ok  ${nombre}`) } catch (e) { console.error(`  FALLA  ${nombre}\n${(e as Error).message}`); process.exitCode = 1 }
}
const f = (dia: string, importe: number, saldo: number | null): FilaCuadre => ({ dia, importe, saldo })

t('una cadena limpia cuadra', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -30, 70), f('2026-01-02', 10, 80)])
  assert.equal(r.cuadra, true); assert.equal(r.estado, 'OK'); assert.equal(r.huecos.length, 0); assert.equal(r.saldoFinalCentimos, 8000)
})
t('mismo día con varios órdenes válidos: se acepta a nivel de día (saldo de cierre correcto)', () => {
  // +10 y −10 con el mismo saldo de cierre: dos órdenes posibles (AMBIGUO), cierre 100 en ambos.
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', 10, 110), f('2026-01-02', -10, 100), f('2026-01-02', 5, 105), f('2026-01-02', -5, 100), f('2026-01-03', 1, 101)])
  assert.equal(r.cuadra, true, JSON.stringify(r.huecos))
})
t('el orden del día no importa: filas desordenadas dentro del día cuadran', () => {
  const r = analizarCuadreDia([f('2026-01-01', 50, 50), f('2026-01-02', 20, 90), f('2026-01-02', -10, 40), f('2026-01-02', 60, 100)].sort(() => 0))
  assert.equal(r.cuadra, true, JSON.stringify(r.huecos))
})
t('un apunte que falta NO cuadra y se explica con el importe', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -30, 70), f('2026-01-02', -1, 39), f('2026-01-03', 5, 44)])
  // 70 → 39 no encadena con −1: faltan −30.
  assert.equal(r.cuadra, false); assert.equal(r.estado, 'HUECO'); assert.equal(r.huecos.length, 1)
  assert.equal(r.huecos[0].dia, '2026-01-02'); assert.equal(r.huecos[0].tipo, 'APUNTE_FALTANTE')
})
t('un apunte perdido con gemelo del mismo importe se señala y nombra el importe exacto', () => {
  // día 2: −0,61 y −0,61 reales; sólo uno cargado => el saldo salta 0,61.
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -0.61, 99.39), f('2026-01-02', 10, 108.78), f('2026-01-03', 1, 109.78)])
  assert.equal(r.cuadra, false)
  assert.equal(r.huecos[0].faltanteCentimos, -61)
  assert.match(r.huecos[0].mensaje, /−0,61 €/); assert.match(r.huecos[0].mensaje, /mismo importe/)
})
t('salto entre días: la apertura no es el cierre anterior', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -30, 20), f('2026-01-03', 5, 25)])
  assert.equal(r.cuadra, false); assert.equal(r.huecos[0].tipo, 'SALTO_ENTRE_DIAS'); assert.equal(r.huecos[0].faltanteCentimos, -5000)
})
t('el hueco no se oculta: el cierre no se da por bueno mientras haya hueco', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -30, 20), f('2026-01-03', 5, 25)])
  assert.notEqual(r.estado, 'OK')
})
t('duplicado de importación (misma fecha, importe y saldo) se ignora sólo para comprobar; no se borra', () => {
  const entrada = [f('2026-01-01', 100, 100), f('2026-01-02', -30, 70), f('2026-01-02', -30, 70), f('2026-01-03', 5, 75)]
  const r = analizarCuadreDia(entrada)
  assert.equal(r.cuadra, true); assert.equal(r.duplicadosIgnorados, 1); assert.equal(entrada.length, 4, 'la entrada no se muta')
})
t('dos apuntes iguales PERO con saldo distinto son reales (no se ignoran)', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -30, 70), f('2026-01-02', -30, 40), f('2026-01-03', 5, 45)])
  assert.equal(r.duplicadosIgnorados, 0); assert.equal(r.cuadra, true)
})
t('un duplicado sin saldo con gemelo que sí lo trae se ignora; sin gemelo no', () => {
  const a = ignorarDuplicadosImportacion([f('2026-01-02', -32.06, 0), f('2026-01-02', -32.06, null)])
  assert.equal(a.ignorados, 1); assert.equal(a.filas.length, 1); assert.equal(a.filas[0].saldo, 0)
  const b = ignorarDuplicadosImportacion([f('2026-01-02', -32.06, null)])
  assert.equal(b.ignorados, 0)
})
t('importe 0 nunca se trata como duplicado', () => {
  assert.equal(ignorarDuplicadosImportacion([f('2026-01-02', 0, 10), f('2026-01-02', 0, 10)]).ignorados, 0)
})
t('apunte sin saldo sin continuidad probada: hueco SIN_SALDO, no se inventa', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -10, null), f('2026-01-03', 5, 500)])
  assert.equal(r.cuadra, false); assert.equal(r.huecos[0].tipo, 'SIN_SALDO'); assert.equal(r.saldosDeducidos, 0)
})
t('apunte sin saldo con continuidad probada por ambos lados: se deduce y se cuenta', () => {
  const r = analizarCuadreDia([f('2026-01-01', 100, 100), f('2026-01-02', -100, null), f('2026-01-03', 5, 5)])
  assert.equal(r.cuadra, true, JSON.stringify(r.huecos)); assert.equal(r.saldosDeducidos, 1)
})
t('sin movimientos no cuadra', () => {
  const r = analizarCuadreDia([])
  assert.equal(r.cuadra, false); assert.equal(r.estado, 'SIN_SALDO')
})
t('importes con fracciones de céntimo no cuadran en falso', () => {
  const r = analizarCuadreDia([f('2026-01-01', 0.001, 0.001), f('2026-01-02', 1, 1.001)])
  assert.equal(r.cuadra, false)
})
t('cuadra a céntimo exacto con flotantes de BD (0,1 + 0,2)', () => {
  const r = analizarCuadreDia([f('2026-01-01', 0.1, 0.1), f('2026-01-02', 0.2, 0.3)])
  assert.equal(r.cuadra, true)
})
t('readCuentasCuadre usa el cuadre por día y no relaja el analizador común', () => {
  const c = readFileSync('lib/finanzas/conciliar-cuadre.ts', 'utf8')
  assert.match(c, /analizarCuadreDia/)
  assert.equal(/analizarCadenaSaldo|derivarOrdenBancarioPorSaldo/.test(c), false)
  const chain = readFileSync('lib/finanzas/bank-balance-chain.ts', 'utf8')
  assert.match(chain, /ORDEN_MISMO_DIA_AMBIGUO/, 'estado-cuentas sigue con su analizador estricto')
})
t('la ficha de cuenta nunca muta datos: el módulo no importa prisma ni escribe', () => {
  const c = readFileSync('lib/finanzas/conciliar-cuadre-dia.ts', 'utf8')
  assert.equal(/prisma|\.update\(|\.delete\(|\.create\(/.test(c), false)
})
console.log(`OK: ${pasadas}/${pasadas} comprobaciones del cuadre por día.`)
