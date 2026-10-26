import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { isUuid, parseConciliarActionResponse, parseConciliarUndoResponse, parseConciliarHistoryResponse, safeDocumentHref, escapeSpreadsheet } from '../components/finanzas/conciliar/conciliar-contract'

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
