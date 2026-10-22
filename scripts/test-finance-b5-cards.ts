import assert from 'node:assert/strict'
import test from 'node:test'
import {cardFromBankText} from '../lib/finanzas/card-holders'
test('Sólo una identificación de tarjeta explícita activa el titular',()=>{
 assert.equal(cardFromBankText('Factura 9029'),null)
 assert.equal(cardFromBankText('Referencia 6440'),null)
 assert.equal(cardFromBankText('tarjeta *9029')?.titular,'Víctor')
 assert.equal(cardFromBankText('XX6440')?.titular,'David')
 assert.equal(cardFromBankText('*2390')?.titular,'Sin asignar')
 assert.equal(cardFromBankText('*9029 y *6440'),null)
 assert.equal(cardFromBankText('90291234'),null)
})
