/*
 * Fixtures DECLARADAMENTE SINTÉTICAS. No contienen PDFs, facturas, cuentas,
 * importes ni hashes de clientes reales; los importes sólo prueban semántica.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  extractBBVACesionNominalLines,
  parseBBVALiquidacionTextAndPositions,
  parseCaixaBankPDFText,
  parseCaixaBankXLS,
  type BBVACesionPositionalText,
} from '../lib/finanzas/confirming-parser'

function item(text: string, x: number, y: number, width = 28): BBVACesionPositionalText {
  return { text, x, y, width }
}

function liquidacionPages(values: { nominalA?: string; nominalB?: string; interesA?: string; interesB?: string } = {}): BBVACesionPositionalText[][] {
  const nominalA = values.nominalA ?? '200,00'
  const nominalB = values.nominalB ?? '100,00'
  const interesA = values.interesA ?? '3,00'
  const interesB = values.interesB ?? '1,00'
  return [[
    // Cabeceras con desplazamiento: la columna física "Interès" es nominal y
    // la columna física "Import" es el interés. No depende del orden textual.
    item('Núm.', 40, 656, 27), item('factura', 67, 656, 33),
    item('Referència', 127, 656, 48), item('Data', 194, 656, 24),
    item('Comissió', 292, 656, 42), item('Interès', 385, 656, 32),
    item('Tipus', 429, 656, 25), item('Import', 520, 656, 31),
    item('DRAX26/901', 40, 616, 56), item('01/01/2026', 194, 616, 56),
    item('1,00', 292, 616, 23), item(nominalA, 357, 616, 40), item('2.100', 429, 616, 24), item(interesA, 504, 616, 27),
    item('DRAX26/902', 40, 578, 56), item('01/01/2026', 194, 578, 56),
    item('0,50', 292, 578, 23), item(nominalB, 357, 578, 40), item('2.100', 429, 578, 24), item(interesB, 504, 578, 27),
  ]]
}

function liquidacionText(neto = '294,18'): string {
  return [
    'Liquidació de bestretes',
    "Compte d'abonament de bestreta ES99000000000000000000",
    'Client CLIENTE SINTETICO',
    'Data de liquidació 10/08/2026',
    'Import nominal 300,00 EUR',
    'Import comissió 1,50 EUR',
    'Impostos S/COM (IVA 21%) 0,32 EUR',
    'Import interessos 4,00 EUR',
    'Import a deduir 5,82 EUR',
    `Líquid a favor seu ${neto} EUR`,
    'TAE 2,100 %',
  ].join('\n')
}

test('liquidación BBVA sintética: IVA explícito, columnas desplazadas y cuadre íntegro', () => {
  const parsed = parseBBVALiquidacionTextAndPositions({
    text: liquidacionText(),
    pages: liquidacionPages(),
    sourceHash: 'synthetic-hash',
    sociedad: 'DEA',
  })

  assert.equal(parsed.tipoDocumento, 'LIQUIDACION')
  assert.equal(parsed.procedencia?.documento, 'BBVA_PDF')
  assert.equal(parsed.procedencia?.lineas, 'COORDENADAS_PDF')
  assert.equal(parsed.procedencia?.ivaComision, 'ETIQUETA_PDF')
  assert.equal(parsed.sourceHash, 'synthetic-hash')
  assert.equal(parsed.fechaLiquidacion, '10/08/2026')
  assert.equal(parsed.cuentaAbono, 'ES99000000000000000000')
  assert.equal(parsed.totalRemesa, 300)
  assert.equal(parsed.totalComisiones, 1.5)
  assert.equal(parsed.totalIvaComision, 0.32)
  assert.equal(parsed.totalIntereses, 4)
  assert.equal(parsed.totalDeducir, 5.82)
  assert.equal(parsed.netoBancario, 294.18)
  assert.equal(parsed.totalNeto, 294.18)
  assert.equal(parsed.cuadre?.estado, 'CUADRA')
  assert.equal(parsed.cuadre?.diferenciaCentimos, 0)
  assert.equal(parsed.cuadre?.diferenciaDeducirCentimos, 0)
  assert.equal(parsed.cuadre?.diferenciaNominalLineasCentimos, 0)
  assert.equal(parsed.cuadre?.diferenciaInteresesLineasCentimos, 0)
  assert.equal(parsed.cuadre?.diferenciaComisionesLineasCentimos, 0)
  assert.deepEqual(parsed.lineas.map((line) => [line.importe, line.intereses, line.comision, line.procedencia]), [
    [200, 3, 1, 'COORDENADAS_PDF'],
    [100, 1, 0.5, 'COORDENADAS_PDF'],
  ])
})

test('liquidación BBVA sintética: un céntimo de diferencia no se oculta', () => {
  const parsed = parseBBVALiquidacionTextAndPositions({ text: liquidacionText('294,17'), pages: liquidacionPages() })
  assert.equal(parsed.cuadre?.estado, 'DESCUADRE')
  assert.equal(parsed.cuadre?.diferenciaCentimos, 1)
})

test('aviso BBVA sintético: conserva sólo el nominal y no inventa intereses', () => {
  const lines = extractBBVACesionNominalLines([[
    item('CESIÓN DE CRÉDITOS', 40, 700, 160),
    item('NÚM. FACTURA', 30, 120, 80), item('IMPORTE/(EUR)', 320, 120, 65),
    item('DRAX26/903', 34, 90, 45), item('10-08-2026', 237, 90, 48), item('123,45', 371, 90, 43),
  ]])
  assert.deepEqual(lines, [{ numFactura: 'DRAX26/903', importe: 123.45, fechaFactura: '10-08-2026' }])
})

test('PDF Caixa + XLS sintéticos: el neto XLS sin IVA no se convierte en abono ni en gasto inferido', () => {
  const pdf = parseCaixaBankPDFText([
    'Cliente CLIENTE SINTETICO',
    'Importe factura 1.000,00 €',
    'Intereses 17,00 €',
    'Comisión 2,50 €',
    'IVA 0,50 €',
    'Total a deducir 20,00 €',
    'Importe neto 980,00 €',
  ].join('\n'), { sourceHash: 'synthetic-pdf-hash' })

  const sheet = XLSX.utils.json_to_sheet([{
    'Núm. factura': 'DRAX26/904',
    'Importe factura': '1.000,00',
    'Importe neto': '980,50',
  }])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Synthetic')
  const xls = parseCaixaBankXLS(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }), 'Confirming Caixa 16.04.2026.xlsx')

  assert.equal(pdf.netoBancario, 980)
  assert.equal(pdf.totalIvaComision, 0.5)
  assert.equal(pdf.totalDeducir, 20)
  assert.equal(pdf.procedencia?.netoBancario, 'ETIQUETA_PDF')
  assert.equal(xls.totalNetoXlsSinIva, 980.5)
  assert.equal(xls.netoBancario, undefined)
  assert.equal(xls.totalIvaComision, undefined)
  assert.equal(xls.totalDeducir, undefined)
  assert.equal(xls.totalGastosFinancieros, undefined)
  assert.equal(xls.lineas[0].gastosFinancieros, undefined)
  assert.equal(xls.procedencia?.netoXlsSinIva, 'TABLA_XLS_SIN_IVA_EXPLICITO')
})


test('BBVA sintético: recompone el número sólo en su celda física sin duplicar filas', () => {
  const pages = liquidacionPages()
  pages[0] = pages[0].flatMap(value => value.text === 'DRAX26/901'
    ? [item('DRAX26', 40, value.y, 34), item('/', 77, value.y, 4), item('901', 84, value.y, 18)]
    : [value])
  const parsed = parseBBVALiquidacionTextAndPositions({ text: liquidacionText(), pages })
  assert.equal(parsed.cuadre?.estado, 'CUADRA')
  assert.equal(parsed.lineas.length, 2)
  assert.equal(parsed.lineas[0].numFactura, 'DRAX26/901')
})

test('BBVA sintético: un resumen sin detalle no se declara liquidación íntegra cuadrada', () => {
  const parsed = parseBBVALiquidacionTextAndPositions({ text: liquidacionText(), pages: [] })
  assert.equal(parsed.cuadre?.estado, 'NO_VERIFICABLE')
})

function caixaSynthetic(neto = '980,00'): string {
  return ['Cliente CLIENTE SINTETICO', 'Fecha liquidación', '03 mar 26',
    'Importe factura', '1.000,00 €', 'Intereses', '17,00 €',
    'Comisiones', '2,50 €', 'Importe neto', `${neto} €`,
    'IVA comisiones', '0,50 €'].join('\n')
}

test('Caixa sintético: etiquetas reales plurales, fecha abreviada y neto con IVA explícito', () => {
  const parsed = parseCaixaBankPDFText(caixaSynthetic())
  assert.equal(parsed.tipoDocumento, 'LIQUIDACION')
  assert.equal(parsed.fechaLiquidacion, '03/03/2026')
  assert.equal(parsed.totalComisiones, 2.5)
  assert.equal(parsed.totalIvaComision, 0.5)
  assert.equal(parsed.cuadre?.estado, 'CUADRA')
  assert.equal(parsed.cuadre?.diferenciaCentimos, 0)
  assert.equal(parsed.totalDeducir, undefined)
})

test('Caixa sintético: una diferencia de un céntimo es descuadre, sin tolerancia', () => {
  const parsed = parseCaixaBankPDFText(caixaSynthetic('979,99'))
  assert.equal(parsed.cuadre?.estado, 'DESCUADRE')
  assert.equal(parsed.cuadre?.diferenciaCentimos, 1)
})

test('Caixa sintético: IVA comisiones no rellena una comisión ausente ni por diferencia', () => {
  const parsed = parseCaixaBankPDFText(caixaSynthetic().replace('Comisiones\n2,50 €\n', ''))
  assert.equal(parsed.totalComisiones, undefined)
  assert.equal(parsed.totalIvaComision, 0.5)
  assert.equal(parsed.cuadre?.estado, 'NO_VERIFICABLE')
})

test('Caixa sintético: el porcentaje de IVA no es un importe de IVA', () => {
  const parsed = parseCaixaBankPDFText(caixaSynthetic().replace('IVA comisiones\n0,50 €', 'IVA comisiones 21,00%'))
  assert.equal(parsed.totalIvaComision, undefined)
  assert.equal(parsed.totalComisiones, 2.5)
  assert.equal(parsed.cuadre?.estado, 'NO_VERIFICABLE')
})

test('Caixa sintético: fecha civil inválida no se publica como fecha de liquidación', () => {
  const parsed = parseCaixaBankPDFText(caixaSynthetic().replace('03 mar 26', '31 feb 26'))
  assert.equal(parsed.fechaLiquidacion, undefined)
})

test('Soporte sintético Outlook: detalle de facturas no se convierte en liquidación bancaria', () => {
  const parsed = parseCaixaBankPDFText('Outlook\nDesde EMISOR SINTETICO\nOs paso detalle de las facturas\nDRAX26/905', { fileName: 'Confirming Caixa Sintetico.pdf' })
  assert.equal(parsed.tipoDocumento, 'DETALLE_FACTURAS')
  assert.equal(parsed.netoBancario, undefined)
  assert.equal(parsed.totalComisiones, undefined)
  assert.equal(parsed.cuadre?.estado, 'NO_APLICA')
})

test('Caixa sintético: aviso de cesión sin resumen no acredita un abono', () => {
  const parsed = parseCaixaBankPDFText('CESIÓN DE CRÉDITOS\nDOCUMENTO NO NEGOCIABLE\nEste documento es un aviso')
  assert.equal(parsed.tipoDocumento, 'AVISO_CESION')
  assert.equal(parsed.cuadre?.estado, 'NO_APLICA')
})

test('XLS sintético: normaliza fechas abreviadas de las celdas y no del nombre', () => {
  const sheet = XLSX.utils.json_to_sheet([{ 'Núm. factura': 'DRAX26/906', 'Fecha factura': '15 abr 26', 'Fecha vencimiento': '01 sep 26', 'Importe factura': '100,00', 'Importe neto': '99,00' }])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Synthetic')
  const parsed = parseCaixaBankXLS(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }), 'Confirming Caixa 20.12.2026.xlsx')
  assert.equal(parsed.tipoDocumento, 'DETALLE_FACTURAS')
  assert.equal(parsed.lineas[0].fechaFactura, '15-04-2026')
  assert.equal(parsed.lineas[0].fechaVencimiento, '01-09-2026')
  assert.equal(parsed.netoBancario, undefined)
})
