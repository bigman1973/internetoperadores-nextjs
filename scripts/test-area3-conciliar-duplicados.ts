import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { additiveSqlCheck, migrationNameValid } from './areas/check-migrations.mjs'
import { analizarCuadreDia, type FilaCuadre } from '../lib/finanzas/conciliar-cuadre-dia'

/**
 * Área 3 · Marca aditiva duplicado_de_id (Encargo J, Préstamo 4012). Sin BD: comprueba el contrato de la migración,
 * que cada lectura de población de Conciliar excluye los apuntes marcados y que el cuadre no cambia al retirarlos.
 */
let ok = 0
function t(nombre: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ok  ${nombre}`) } catch (e) { console.error(`  FALLA  ${nombre}\n${(e as Error).message}`); process.exitCode = 1 }
}
const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const MIG = 'prisma/migrations/20261203_area3_movimientos_duplicado_de'

t('la migración es aditiva, con prefijo de área y tiene down', () => {
  assert.equal(migrationNameValid('20261203_area3_movimientos_duplicado_de'), true)
  const sql = leer(`${MIG}/migration.sql`)
  assert.equal(additiveSqlCheck(sql), true)
  assert.ok(existsSync(new URL(`../${MIG}/down.sql`, import.meta.url)))
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "duplicado_de_id" TEXT;/)
  assert.doesNotMatch(sql, /ADD COLUMN[^;]*duplicado_de_id[^;]*NOT NULL/, 'la columna es nullable')
})
t('la migración no marca nada: el marcado es un paso aparte', () => {
  const sql = leer(`${MIG}/migration.sql`).replace(/--[^\n]*/g, '')
  assert.doesNotMatch(sql, /SET\s+"?duplicado_de_id"?\s*=/i)
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+"?area3_movimientos_duplicados_auditoria/i)
})
t('la auditoría de marcas es append-only y el CHECK impide marcar un apunte como su propio duplicado', () => {
  const sql = leer(`${MIG}/migration.sql`)
  assert.match(sql, /AREA3_DUPLICADOS_AUDITORIA_SOLO_INSERTAR/)
  assert.match(sql, /DELETE ON "area3_movimientos_duplicados_auditoria"/)
  assert.match(sql, /"duplicado_de_id" <> "id"/)
})
t('schema.prisma mapea duplicadoDeId a duplicado_de_id', () => {
  assert.match(leer('prisma/schema.prisma'), /duplicadoDeId\s+String\?\s+@map\("duplicado_de_id"\)/)
})
const LECTURAS: ReadonlyArray<readonly [string, string, number]> = [
  ['lib/finanzas/conciliar-db.ts', 'm.duplicado_de_id IS NULL', 4],
  ['lib/finanzas/conciliar-human-own-transfer.ts', 'm.duplicado_de_id IS NULL', 2],
  ['lib/finanzas/easy-auto-db.ts', 'm.duplicado_de_id IS NULL', 1],
  ['lib/finanzas/easy-counterparty-db.ts', 'm.duplicado_de_id IS NULL', 1],
  ['lib/finanzas/conciliar-confirming.ts', 'm.duplicado_de_id IS NULL', 2],
  ['lib/finanzas/confirming-liquidation-runtime.ts', 'm.duplicado_de_id IS NULL', 1],
  ['lib/finanzas/conciliar-cuadre.ts', 'duplicado_de_id IS NULL', 1],
]
for (const [archivo, patron, minimo] of LECTURAS) {
  t(`${archivo.split('/').pop()} excluye los marcados (${minimo})`, () => {
    const n = leer(archivo).split(patron).length - 1
    assert.ok(n >= minimo, `${archivo}: ${n} < ${minimo}`)
  })
}
t('readCuentasCuadre filtra por duplicadoDeId: null y cuenta los marcados aparte', () => {
  const s = leer('lib/finanzas/conciliar-cuadre.ts')
  assert.match(s, /duplicadoDeId: null/)
  assert.match(s, /duplicadoDeId: \{ not: null \}/)
  assert.match(s, /duplicadosMarcados/)
})
t('población de la proyección: unresolvedMovements, tamaño y semillas excluyen los marcados', () => {
  const s = leer('lib/finanzas/conciliar-db.ts')
  assert.match(s, /b4_importe_bancario_centimos\(m\.importe\) IS NOT NULL\s+AND m\.duplicado_de_id IS NULL/)
  assert.match(s, /AND m\.duplicado_de_id IS NULL\) AS movements/)
})
t('las lecturas por id (bloquear/ver/confirmar un apunte concreto) no se filtran: un marcado sigue siendo visible por id', () => {
  const s = leer('lib/finanzas/easy-counterparty-db.ts')
  assert.doesNotMatch(s, /WHERE m\.id=\$\{movimientoId\}[^`]*duplicado_de_id/)
})
t('la tarjeta de cuenta informa de los marcados', () => {
  assert.match(leer('components/finanzas/conciliar-unificado/ConciliarUnificado.tsx'), /marcado\$\{c\.duplicadosMarcados === 1/)
})
// Cuadre: retirar copias idénticas (misma fecha, importe y saldo) no cambia el cierre ni los huecos.
const f = (dia: string, importe: number, saldo: number | null): FilaCuadre => ({ dia, importe, saldo })
t('retirar la copia repetida deja la cadena igual de cuadrada (saldo de cierre idéntico)', () => {
  const conCopia = [f('2026-03-01', 100, 100), f('2026-03-02', -30, 70), f('2026-03-02', -30, 70), f('2026-03-03', 5, 75)]
  const sinCopia = [f('2026-03-01', 100, 100), f('2026-03-02', -30, 70), f('2026-03-03', 5, 75)]
  const a = analizarCuadreDia(sinCopia)
  const b = analizarCuadreDia(conCopia)
  assert.equal(a.cuadra, true); assert.equal(a.huecos.length, 0); assert.equal(a.duplicadosIgnorados, 0)
  assert.equal(b.cuadra, true); assert.equal(b.duplicadosIgnorados, 1)
  assert.equal(a.saldoFinalCentimos, b.saldoFinalCentimos)
})
console.log(`${ok} pruebas`)
if (process.exitCode) process.exit(process.exitCode)
