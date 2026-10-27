import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { isUuid, parseConciliarActionResponse, parseConciliarUndoResponse, parseConciliarHistoryResponse, parseConciliarReadResponse, safeDocumentHref, escapeSpreadsheet } from '../components/finanzas/conciliar/conciliar-contract'

// Identificadores sintéticos: ninguna prueba consulta ni modifica una BD.
const operationId='00000000-0000-4000-8000-000000000001'
const rowId='00000000-0000-4000-8000-000000000002'
const at='2026-10-26T12:00:00.000Z'

test('los UUID canónicos reales no se rechazan por agrupar tres dígitos',()=>{
  assert.equal(isUuid(operationId),true)
  assert.equal(isUuid('00000000-0000-400-800-000000000001'),false)
})
test('un recibo de confirmación conserva su operación reversible',()=>{
  const parsed=parseConciliarActionResponse({operationId,outcomes:[{id:rowId,ok:true,code:'HECHO',message:'Hecho',operationId}],refreshedAt:at})
  assert.equal(parsed.operationId,operationId);assert.equal(parsed.outcomes[0].ok,true)
})
test('el deshacer apunta a la confirmación original, no a otro recibo',()=>{
  const parsed=parseConciliarUndoResponse({operationId,undone:true,message:'Deshecho',refreshedAt:at})
  assert.equal(parsed.operationId,operationId);assert.equal(parsed.undone,true)
})
test('una respuesta 2xx incompleta no se transforma en éxito',()=>{
  assert.throws(()=>parseConciliarActionResponse({operationId,ok:true,refreshedAt:at}))
  assert.throws(()=>parseConciliarActionResponse({operationId,outcomes:[{id:rowId,ok:true}],refreshedAt:at}))
})
test('sólo las confirmaciones aplicadas del historial permiten deshacer',()=>{
  const parsed=parseConciliarHistoryResponse({operations:[
    {id:operationId,action:'CONFIRMAR',state:'APLICADA',reversible:true,result:{outcomes:[{id:rowId}]},createdAt:at},
    {id:rowId,action:'PEDIR',state:'APLICADA',reversible:false,result:{outcomes:[]},createdAt:at},
  ]})
  assert.equal(parsed.length,1);assert.equal(parsed[0].reversible,true)
})
test('archivo opaco interno sí; URLs externas y archivos genéricos no',()=>{
  assert.equal(safeDocumentHref('/api/admin/finanzas/conciliar/archivo/'+rowId),'/api/admin/finanzas/conciliar/archivo/'+rowId)
  assert.equal(safeDocumentHref('https://ejemplo.invalid/documento.pdf'),null)
  assert.equal(safeDocumentHref('/api/admin/personal/nominas/archivo'),null)
  assert.equal(safeDocumentHref('/api/admin/finanzas/conciliar/archivo/'+rowId+'?drive=otro'),null)
})
test('la exportación no convierte textos bancarios en fórmulas de Excel',()=>{
  assert.equal(escapeSpreadsheet('=1+1'),"'=1+1")
  assert.equal(escapeSpreadsheet('Proveedor de prueba'),'Proveedor de prueba')
})

function readFixture(emitidasGroups: unknown) {
  return {
    tabs: ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'].map(tab => ({
      tab, count: 0, amountCentimos: 0,
      colors: { VERDE: { count: 0, amountCentimos: 0 }, AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 } },
    })),
    rows: [], total: 0, limit: 50, offset: 0, updatedAt: at, cuentas: [], stale: false, staleReason: null,
    cutoffDate: '2026-01-01', historicSummary: { count: 0, amountCentimos: 0 }, emitidasGroups,
  }
}

test('el resumen de Emitidas acepta los tres bloques, incluido ámbar con importe cero',()=>{
  const parsed=parseConciliarReadResponse(readFixture([
    {group:'CON_PROPUESTA',count:2,amountCentimos:12000},
    {group:'PARA_REVISAR',count:1,amountCentimos:0},
    {group:'SIN_PROPUESTA',count:3,amountCentimos:-500},
  ]))
  assert.deepEqual(parsed.emitidasGroups.map(item=>item.group),['CON_PROPUESTA','PARA_REVISAR','SIN_PROPUESTA'])
  assert.equal(parsed.emitidasGroups[1].amountCentimos,0)
})

test('el resumen Emitidas incompleto, duplicado o inseguro se rechaza sin inventar ceros',()=>{
  assert.throws(()=>parseConciliarReadResponse(readFixture(undefined)))
  assert.throws(()=>parseConciliarReadResponse(readFixture([{group:'CON_PROPUESTA',count:1,amountCentimos:1},{group:'PARA_REVISAR',count:0,amountCentimos:0}])))
  assert.throws(()=>parseConciliarReadResponse(readFixture([{group:'CON_PROPUESTA',count:1,amountCentimos:1},{group:'CON_PROPUESTA',count:0,amountCentimos:0},{group:'SIN_PROPUESTA',count:0,amountCentimos:0}])))
  assert.throws(()=>parseConciliarReadResponse(readFixture([{group:'AJENO',count:1,amountCentimos:1},{group:'PARA_REVISAR',count:0,amountCentimos:0},{group:'SIN_PROPUESTA',count:0,amountCentimos:0}])))
  assert.throws(()=>parseConciliarReadResponse(readFixture([{group:'CON_PROPUESTA',count:-1,amountCentimos:1},{group:'PARA_REVISAR',count:0,amountCentimos:0},{group:'SIN_PROPUESTA',count:0,amountCentimos:0}])))
  assert.throws(()=>parseConciliarReadResponse(readFixture([{group:'CON_PROPUESTA',count:1.5,amountCentimos:1},{group:'PARA_REVISAR',count:0,amountCentimos:0},{group:'SIN_PROPUESTA',count:0,amountCentimos:0}])))
})
