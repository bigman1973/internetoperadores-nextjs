import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseConciliarHistoryResponse } from '../components/finanzas/conciliar/conciliar-contract'
const operation={operationId:'00000000-0000-4000-8000-000000000001',confirmedAt:'2026-11-03T11:11:00.000Z',revertedAt:null,state:'APLICADA',reversible:true,scope:'batch',count:2,detailsAvailable:false,actorEffectiveDisplay:null,actorRealDisplay:null,actorRealStatus:'NO_DISPONIBLE_HISTORICO',legs:[]}
const wrap=(patch:object)=>({view:'hoy',total:1,limit:20,offset:0,operations:[{...operation,...patch}]})
assert.deepEqual(parseConciliarHistoryResponse(wrap({targetRowIds:['MOVIMIENTO:A','MOVIMIENTO:B']})).operations[0].targetRowIds,['MOVIMIENTO:A','MOVIMIENTO:B'])
assert.deepEqual(parseConciliarHistoryResponse(wrap({})).operations[0].targetRowIds,[])
assert.throws(()=>parseConciliarHistoryResponse(wrap({targetRowIds:['MOVIMIENTO:A']})))
assert.throws(()=>parseConciliarHistoryResponse(wrap({targetRowIds:['MOVIMIENTO:A','MOVIMIENTO:A']})))
assert.throws(()=>parseConciliarHistoryResponse(wrap({targetRowIds:['','MOVIMIENTO:B']})))
const backend=readFileSync('lib/finanzas/conciliar-projection-read.ts','utf8')
assert.ok(backend.includes("'rowId',l.fila_id"));assert.ok(backend.includes("WHERE actor_id=${actorId} AND accion='CONFIRMAR'"))
const workspace=readFileSync('components/finanzas/conciliar/ConciliarWorkspace.tsx','utf8')
assert.ok(!workspace.includes('const undoViewUnknown ='))
assert.match(workspace,/const mutationContextBlocked = identityBlocked \|\| refreshing \|\| retry !== null/)
assert.match(workspace,/const rowMutationsBlocked = useCallback\(\(rowId: string\) => mutationContextBlocked \|\| conciliarUiRowBlocked\(pendingOperations, rowId\)/)
console.log(JSON.stringify({test:'history-targets',passed:10,databaseConnections:0,financialWrites:0}))
