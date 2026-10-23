import assert from 'node:assert/strict'
import test from 'node:test'
import { signHistoricalBulkPreview,verifyHistoricalBulkPreview } from '../lib/finanzas/historical-bulk-preview'
import type { BulkItem } from '../lib/finanzas/historical-bulk-core'
process.env.NEXTAUTH_SECRET='SYNTHETIC-UNIT-TEST-KEY-NOT-FOR-DEPLOYMENT'
const item:BulkItem={historicoId:'history',movimientoId:'movement',fingerprint:'a'.repeat(64),fechaOperacion:'2026-10-02',concepto:'Prueba',banco:'Prueba',cuentaAlias:null,importeMovimientoCentimos:-10000,version:1,documentos:[]}
test('recibo vincula actor, selección exacta, signo y tiempo',()=>{const token=signHistoricalBulkPreview(3,[item],1000);assert(verifyHistoricalBulkPreview(token,3,[item],1001));assert(!verifyHistoricalBulkPreview(token,4,[item],1001));assert(!verifyHistoricalBulkPreview(token,3,[{...item,fingerprint:'f'.repeat(64)}],1001));assert(!verifyHistoricalBulkPreview(token,3,[item],901001));assert(!verifyHistoricalBulkPreview(token,3,[item],999))})
test('no admite token manipulado, vacío ni selección fuera de la lista',()=>{const token=signHistoricalBulkPreview(3,[item],1000);assert(!verifyHistoricalBulkPreview(token+'x',3,[item],1001));assert(!verifyHistoricalBulkPreview('',3,[item],1001));assert(!verifyHistoricalBulkPreview(token,3,[{...item,movimientoId:'other'}],1001));assert(!verifyHistoricalBulkPreview(token,3,[],1001))})
