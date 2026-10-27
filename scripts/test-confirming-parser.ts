/* Confirming parser: fixtures sintéticas y PDFs locales; nunca imprime PII, facturas ni importes. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  extractBBVACesionNominalLines,
  parseBBVACesionCreditos,
  type BBVACesionPositionalText,
} from '../lib/finanzas/confirming-parser'

const PRIVATE_SAMPLES = [
  '/home/ubuntu/conciliar-20261026/privado/confirming-muestra-1.pdf',
  '/home/ubuntu/conciliar-20261026/privado/confirming-muestra-2.pdf',
] as const

function item(text: string, x: number, y: number, width = 30): BBVACesionPositionalText {
  return { text, x, y, width }
}

test('cesión BBVA: fixture sintética extrae sólo nominal bajo cabecera inequívoca', () => {
  const pages = [[
    item('CESIÓN DE CRÉDITOS', 40, 700, 160),
    item('NÚM. FACTURA', 30, 120, 80),
    item('IMPORTE/(EUR)', 320, 120, 65),
    item('DRAX26/101', 34, 90, 45),
    item('15-07-2026', 237, 90, 48),
    item('1.234,56', 371, 90, 43),
    // Este valor parece financiero pero se ubica fuera de la columna nominal:
    // no puede entrar en la extracción de cesión.
    item('9,99', 500, 90, 24),
  ]]

  const parsed = extractBBVACesionNominalLines(pages)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].importe, 1234.56)
  assert.equal(parsed[0].fechaFactura, '15-07-2026')
  assert.equal(parsed[0].intereses, undefined)
  assert.equal(parsed[0].comision, undefined)
  assert.equal(parsed[0].gastosFinancieros, undefined)
})

test('cesión BBVA: sin título documental no se infiere el significado de una tabla', () => {
  const parsed = extractBBVACesionNominalLines([[
    item('NÚM. FACTURA', 30, 120, 80),
    item('IMPORTE/(EUR)', 320, 120, 65),
    item('DRAX26/101', 34, 90, 45),
    item('1.234,56', 371, 90, 43),
  ]])
  assert.deepEqual(parsed, [])
})

test('muestras reales de cesión: nominales recuperados; interés/comisión/gastos siguen ausentes', async () => {
  const expectedLineCounts = [5, 1]
  const results = await Promise.all(PRIVATE_SAMPLES.map(async (path, index) => {
    const parsed = await parseBBVACesionCreditos(await readFile(path), `DPC_Confirming BBVA_0${index + 1}.pdf`)
    return {
      lineCount: parsed.lineas.length,
      allPositiveNominal: parsed.lineas.every((line) => Number.isFinite(line.importe) && line.importe > 0),
      noInterest: parsed.lineas.every((line) => line.intereses === undefined),
      noCommission: parsed.lineas.every((line) => line.comision === undefined),
      noExpenses: parsed.lineas.every((line) => line.gastosFinancieros === undefined),
    }
  }))

  assert.deepEqual(results.map((result) => result.lineCount), expectedLineCounts)
  assert.equal(results.every((result) => result.allPositiveNominal), true)
  assert.equal(results.every((result) => result.noInterest && result.noCommission && result.noExpenses), true)
})
