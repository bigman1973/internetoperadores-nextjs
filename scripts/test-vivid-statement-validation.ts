import assert from 'node:assert/strict'
import { validateVividStatement } from '../lib/finanzas/vivid-statement-validation'
import { parseVividCSV } from '../lib/finanzas/parsers'

const merchant = 'Fecha/Hora;Nombre de la tienda;Tipo de transacción;Referencia;Cantidad Total;Moneda Total;Fuente'
const bankHeader = 'Completed date;Counterparty name;Account;IBAN;Type;Reference;Currency;Other;Payment amount;Other;Other;Other;Other;Running balance amount'
const code = (content: string) => {
  const result = validateVividStatement(content)
  assert.equal(result.ok, false)
  return result.ok ? undefined : result.code
}
assert.equal(code(merchant + '\n'), 'VIVID_MERCHANT_EMPTY')
assert.equal(code('\uFEFF' + merchant + '\r\n;;;;;;\r\n'), 'VIVID_MERCHANT_EMPTY')
assert.equal(code(merchant + '\n01/09/2026;Tienda ficticia;Cobro;TEST;10,00;EUR;Web'), 'VIVID_MERCHANT_REPORT')
assert.equal(code('Date/Time;Store name;Transaction type;Reference;Total amount;Total currency;Source'), 'VIVID_MERCHANT_EMPTY')
assert.equal(code(''), 'VIVID_EMPTY_FILE')
assert.equal(code(bankHeader), 'VIVID_NO_TRANSACTIONS')
assert.equal(code(bankHeader + '\r\n;;;;;;;;;;;;;\r\n'), 'VIVID_NO_TRANSACTIONS')
const bank = bankHeader + '\n01-09-2026;Entidad ficticia;;;Transfer;REF-TEST;;;-12,34;;;;;987,66\n'
assert.deepEqual(validateVividStatement(bank), { ok: true })
const parsed = parseVividCSV(bank)
assert.equal(parsed.length, 1)
assert.equal(parsed[0].importe, -12.34)
assert.equal(parsed[0].saldo, 987.66)
assert.equal(parsed[0].fechaOperacion.toISOString().slice(0, 10), '2026-09-01')
assert.deepEqual(parseVividCSV(bank), parsed)
assert.equal(parseVividCSV(merchant).length, 0)
console.log('Vivid: informes merchant y vacíos identificados; extracto bancario legado e idempotencia preservados.')
