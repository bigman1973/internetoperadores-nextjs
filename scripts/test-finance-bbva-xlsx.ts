/**
 * Parser del XLSX de BBVA (banca online 2026) y su detección. Sin red ni base de datos.
 * Los datos de la batería son SINTÉTICOS; si el extracto real está en el sandbox, se comprueba además
 * que el hash de cada fila coincide con el de las filas ya cargadas en staging (misma fórmula).
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { detectarFormato, esExtractoBBVAXLSX, ibanExtractoBBVAXLSX, parseBBVAXLSX } from '../lib/finanzas/parsers'

let pasadas = 0
function prueba(nombre: string, fn: () => void) { fn(); pasadas++; console.log(`PASS ${nombre}`) }
const hashLegado = (iso: string, concepto: string, importe: number, saldo: number | null) =>
  crypto.createHash('sha256').update(`bbva|${iso}|${concepto.trim()}|${importe}|${saldo ?? ''}`).digest('hex').substring(0, 32)

const CAB = [null, null, 'F. CONTABLE', 'F. VALOR', 'CÓDIGO', 'CONCEPTO', 'BENEFICIARIO/ORDENANTE', 'OBSERVACIONES', 'IMPORTE', 'SALDO', 'DIVISA', 'OFICINA', 'REMESA']
const filasSinteticas = (): any[][] => [
  [], [], [], [],
  [null, null, 'Movimientos'], [],
  [null, null, 'Titular', null, null, 'EMPRESA DE PRUEBA S.L.'],
  [null, null, 'Cuenta', null, null, 'ES0000000000000000000000'],
  [null, null, 'Banco', null, null, 'BANCO BILBAO VIZCAYA ARGENTARIA S.A. '],
  [],
  CAB,
  [null, null, '20/11/2026', '20/11/2026', '00007', 'TRANSFERÈNCIES', 'CLIENTE SINTETICO SL', 'PEDIDO N. 1', -375.56, 2786.77, 'EUR', '6051', 'REM1'],
  [null, null, '20/11/2026', '20/11/2026', '00379', 'CÀRREC PER AMORTITZACIÓ', null, '-', -448.74, 3162.33, 'EUR', '3401', null],
  [null, null, '18/11/2026', '18/11/2026', '00007', 'TRANSFERÈNCIES', 'OTRO SL', 'ALBARAN 7', 3213.72, 6552.82, 'EUR', '0061', 'REM3'],
  [], [null, null, 'Total'],
]

prueba('reconoce la cabecera y el IBAN del extracto', () => {
  const f = filasSinteticas()
  assert.equal(esExtractoBBVAXLSX(f), true)
  assert.equal(ibanExtractoBBVAXLSX(f), 'ES0000000000000000000000')
})
prueba('lee fechas, importes, saldos y textos; ignora cabeceras y pie', () => {
  const m = parseBBVAXLSX(filasSinteticas())
  assert.equal(m.length, 3)
  assert.equal(m[0].fechaOperacion.getFullYear(), 2026)
  assert.equal(m[0].importe, -375.56)
  assert.equal(m[0].saldo, 2786.77)
  assert.equal(m[0].concepto, 'TRANSFERÈNCIES - PEDIDO N. 1')
  assert.equal(m[0].tercero, 'CLIENTE SINTETICO SL')
  assert.equal(m[0].referencia, 'REM1')
  assert.equal(m[0].codigoOperacion, '00007')
  assert.equal(m[1].concepto, 'CÀRREC PER AMORTITZACIÓ', 'observación «-» no se añade al concepto')
  assert.equal(m[1].tercero, null)
  assert.equal(m[1].referencia, null)
})
prueba('el hash conserva la fórmula de los movimientos ya cargados', () => {
  const m = parseBBVAXLSX(filasSinteticas())
  for (const x of m) assert.equal(x.hashUnico, hashLegado(x.fechaOperacion.toISOString(), x.concepto, x.importe, x.saldo))
})
prueba('localiza columnas por nombre aunque cambie el orden o falte alguna', () => {
  const alterado = [
    ['F. CONTABLE', 'IMPORTE', 'CONCEPTO', 'SALDO'],
    ['01/10/2026', 10.5, 'INGRESO', 100],
    ['02/10/2026', '-1.234,56', 'PAGO', '1.000,00'],
  ]
  const m = parseBBVAXLSX(alterado as any)
  assert.equal(m.length, 2)
  assert.equal(m[1].importe, -1234.56)
  assert.equal(m[1].saldo, 1000)
  assert.equal(m[0].fechaValor.getTime(), m[0].fechaOperacion.getTime())
})
prueba('un importe ilegible no se convierte en 0 (el importador rechaza el fichero)', () => {
  const f = filasSinteticas(); f[11][8] = 'abc'
  const m = parseBBVAXLSX(f)
  assert.ok(Number.isNaN(m[0].importe))
})
prueba('saldo vacío queda en null, no en 0', () => {
  const f = filasSinteticas(); f[11][9] = ''
  assert.equal(parseBBVAXLSX(f)[0].saldo, null)
})
prueba('un Excel que no es de BBVA no se confunde ni devuelve filas', () => {
  const otro = [['Fecha', 'Importe'], ['01/01/2026', 5]]
  assert.equal(esExtractoBBVAXLSX(otro as any), false)
  assert.deepEqual(parseBBVAXLSX(otro as any), [])
  assert.equal(ibanExtractoBBVAXLSX(otro as any), null)
})
prueba('detectarFormato reconoce BBVA por el nombre y por el contenido de la hoja', () => {
  assert.equal(detectarFormato('BBVA_Principal_4225_desde_2026-10-01.xlsx'), 'bbva')
  const texto = filasSinteticas().slice(0, 30).map((f) => f.join(' ')).join('\n')
  assert.equal(detectarFormato('movimientos.xlsx', texto), 'bbva')
  assert.equal(detectarFormato('movimientos.xlsx', 'Fecha Importe Saldo'), 'desconocido')
  // no pisa los reconocimientos anteriores
  assert.equal(detectarFormato('x.csv', 'Data;Valor;Concepte'), 'guissona')
  assert.equal(detectarFormato('x.csv', 'Data Procés,Data Valor'), 'bbva')
})
prueba('un libro XLSX real (generado en memoria) se parsea igual que las filas', () => {
  const ws = XLSX.utils.aoa_to_sheet(filasSinteticas())
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Historico')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const leido = XLSX.read(buf, { type: 'buffer' })
  const filas = XLSX.utils.sheet_to_json(leido.Sheets[leido.SheetNames[0]], { header: 1 }) as any[][]
  assert.equal(esExtractoBBVAXLSX(filas), true)
  assert.equal(parseBBVAXLSX(filas).length, 3)
})
prueba('la ruta usa el parser nuevo para el XLSX de BBVA y conserva el CSV antiguo', () => {
  const ruta = fs.readFileSync('app/api/admin/finanzas/importar-movimientos/route.ts', 'utf-8')
  const bloque = ruta.slice(ruta.indexOf("case 'bbva'"), ruta.indexOf("case 'vivid'"))
  assert.match(bloque, /esExtractoBBVAXLSX\(filas\)\) return \{ formato, movimientos: parseBBVAXLSX\(filas\) \}/)
  assert.match(bloque, /parseBBVACSV\(XLSX\.utils\.sheet_to_csv\(sheet\)\)/, 'el formato antiguo sigue disponible')
  assert.match(ruta, /formato === 'desconocido' && esExcel/, 'Excel sin «bbva» en el nombre se detecta por la cabecera')
  assert.match(ruta, /!bancoManual && formato === 'desconocido'/, 'el banco elegido a mano manda siempre')
})
const REAL = '/home/ubuntu/upload/BBVA_Principal_4225_desde_2026-10-01.xlsx'
if (fs.existsSync(REAL)) {
  prueba('extracto real: 20 movimientos, cadena de saldo y hash idénticos al ya cargado', () => {
    const wb = XLSX.readFile(REAL)
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][]
    assert.equal(esExtractoBBVAXLSX(filas), true)
    const m = parseBBVAXLSX(filas)
    assert.equal(m.length, 20)
    assert.equal(m[0].saldo, 2786.77)
    assert.equal(ibanExtractoBBVAXLSX(filas), 'ES8601822816620201556112')
    for (const x of m) {
      assert.ok(Number.isFinite(x.importe))
      assert.equal(x.hashUnico, hashLegado(x.fechaOperacion.toISOString(), x.concepto, x.importe, x.saldo))
    }
    // cadena: el saldo de cada fila = saldo de la siguiente (más antigua) + importe de la actual
    for (let i = 0; i < m.length - 1; i++) {
      assert.equal(Math.round((m[i + 1].saldo! + m[i].importe) * 100), Math.round(m[i].saldo! * 100), `cadena rota en la fila ${i}`)
    }
  })
} else console.log('SKIP extracto real no disponible en este entorno')
console.log(`OK ${pasadas} pruebas`)
