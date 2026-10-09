import assert from 'node:assert/strict';
import {mergeCentreTotals, readOperatorCentres} from '../lib/finanzas/operator-centres';
const groups=[{id:'a',nombre:'A',ambito:'GLOBAL_RED_PROPIA',zona:null,conexion:null},{id:'b',nombre:'B',ambito:'ZONA',zona:'Zona prueba',conexion:'Enlace prueba'}];
const row=(grupoId:string,n:number)=>({grupoId,_sum:{importe:n},_count:{_all:2}});
async function main(){
 const r=mergeCentreTotals(groups,[row('a',140.03),row('b',-15)],[row('a',100.01)],[row('a',30.02)]);
 assert.equal(r[0].baseSeleccionada,140.03);assert.equal(r[0].basePropia,100.01);assert.equal(r[0].baseTerceros,40.02);assert.equal(r[0].basePendienteRefacturacion,30.02);
 assert.equal(r[1].baseTerceros,-15);assert.equal(r[1].basePropia,0);
 const calls:any[]=[];await readOperatorCentres({articuloCosteOperadora:{groupBy:async(q:any)=>{calls.push(q);return [];}}},groups,'2026-09');
 assert.equal(calls.length,3);for(const q of calls){assert.equal(q.where.fuente.estado.not,'ARCHIVADO');assert.equal(q.where.fuente.periodo,'2026-09');assert.deepEqual(q.where.grupoId.in,['a','b']);}
 assert.equal(calls[1].where.fuente.origen,'PROPIA');assert.equal(calls[2].where.fuente.origen,'TERCERO');assert.equal(calls[2].where.fuente.documentos.none.rol,'REFACTURA');
 console.log('Centros: céntimos, abonos, total sin doble cómputo, subtotal pendiente, archivo excluido y fecha solo de consulta comprobados sin DB.');
}
main();
