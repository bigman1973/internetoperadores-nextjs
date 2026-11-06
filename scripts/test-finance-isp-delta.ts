import assert from 'node:assert/strict'
import test from 'node:test'
import {filterIspChangedItems,ispLatestResultUnresolved} from '../lib/finanzas/sync-jobs/isp-sync-delta'
import type {SyncSourceItem} from '../lib/finanzas/sync-jobs/types'
const item:SyncSourceItem={key:'isp-factura:17',tipo:'ISP_FACTURA',data:{id:17,serie_factura:'CLL',numero_documento:'CLL26/17',fecha:'2026-11-01',id_cliente:9,codigo_cliente:'9',nombrecompleto:'Prueba',nif_cif:null,documento:'Factura Ventas',base:'100',total_impuesto:'21',total:'121'}}
const fi={id:'fi',origenSistema:'ISPGestion',idExterno:'17',numFactura:'CLL26/17',serie:'CLL',cliente:'Prueba',cif:null,fecha:new Date('2026-11-01'),base:100,importeIva:21,total:121,facturaISPId:10}
const f={id:10,ispGestionId:17,serieFactura:'CLL',numeroDocumento:'CLL26/17',documento:'Factura Ventas',fecha:new Date('2026-11-01'),idCliente:9,codigoCliente:'9',nombreCompleto:'Prueba',nifCif:null,ejercicio:2026,base:100,totalImpuesto:21,total:121,facturaEmitidaB4:fi}
function client(latest:{outcome:string|null;confirmedAt:Date|null}){return {factura:{findMany:async()=>[f]},facturaEmitida:{findMany:async()=>[fi]},$queryRaw:async()=>[{sourceKey:item.key,...latest}] } as never}
test('an old success does not hide a newer apply failure with no confirmation',async()=>{const next=await filterIspChangedItems(client({outcome:null,confirmedAt:null}),[item]);assert.equal(next.length,1)})
test('a newer successful result closes an older error and omits an exact unchanged invoice',async()=>{const next=await filterIspChangedItems(client({outcome:'SIN_CAMBIOS',confirmedAt:new Date()}),[item]);assert.equal(next.length,0)})
test('a terminal ERROR or REVISAR remains unresolved even with confirmed_at',()=>{assert.equal(ispLatestResultUnresolved({outcome:'ERROR',confirmedAt:new Date()}),true);assert.equal(ispLatestResultUnresolved({outcome:'REVISAR',confirmedAt:new Date()}),true);assert.equal(ispLatestResultUnresolved({outcome:'NUEVA',confirmedAt:new Date()}),false)})
