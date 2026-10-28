import assert from 'node:assert/strict';
import test from 'node:test';
import {safeConciliarDocumentHref} from '../lib/finanzas/conciliar-file-href';
import {safeDocumentHref} from '../components/finanzas/conciliar/conciliar-contract';
import {document,projectionRow} from '../lib/finanzas/conciliar-projection-read';

const valid='/api/admin/finanzas/movimientos/movement-fixture/archivos?archivoId=ADJUNTO_B5%3Aattachment-fixture';
test('server and client accept only the same original private PDF or exact B5 reader',()=>{
 const pdf='/api/admin/finanzas/conciliar/archivo/opaque-row';
 for(const href of [pdf,valid]){assert.equal(safeConciliarDocumentHref(href),href);assert.equal(safeDocumentHref(href),href);assert.equal(document({referencia:'Ticket revisable',importeCentimos:-1234,fecha:'2026-01-01',href})?.href,href)}
 assert.equal(safeDocumentHref(valid.replace('%3A',':')),valid);
});
test('private attachment links reject external origins, traversal, extra/duplicate fields and unapproved document types',()=>{
 const bad=['https://external.invalid'+valid,'//external.invalid'+valid,valid+'&driveId=x',valid+'&archivoId=ADJUNTO_B5%3Aother',valid.replace('ADJUNTO_B5','NOMINA'),valid+'#fragment',valid.replace('/archivos?','/../archivos?'),valid.replace('/movement-fixture/','/movement%2ffixture/'),valid.replace('/archivos?','\\archivos?'),valid.replace('ADJUNTO_B5%3Aattachment-fixture','ADJUNTO_B5%3A')];
 for(const href of bad){assert.equal(safeConciliarDocumentHref(href),null);assert.equal(safeDocumentHref(href),null)}
});
test('B5 stored source requires all server-sealed identities and positive B4 version',()=>{
 const source={kind:'PAGO_TICKET_B5',movimientoId:'movement-fixture',adjuntoB5Id:'attachment-fixture',gastoId:'expense-fixture',documentoConciliableId:'document-fixture',versionB4:1};
 const row={id:'opaque-fixture',movimiento_id:'movement-fixture',tab:'PAGOS',fecha:'2026-01-01',concepto:'Documento de prueba sintética',banco:null,cuenta:null,importe_centimos:-1234,pendiente_centimos:-1234,color:'VERDE',grupo:'Tarjeta',motivo:'Sólo mediante confirmación humana',documento:null,propuesta:null,seleccionable:true,diferencia_centimos:0,links_movimiento:[],detail:null,source,source_fingerprint:'a'.repeat(64),updated_at:'2026-01-01T00:00:00.000Z'};
 const parsed=projectionRow(row as never);assert.equal(parsed.source.kind,'PAGO_TICKET_B5');assert.equal(parsed.source.adjuntoB5Id,source.adjuntoB5Id);
 for(const key of ['movimientoId','adjuntoB5Id','gastoId','documentoConciliableId','versionB4']){const invalid:Record<string,unknown>={...source};delete invalid[key];assert.throws(()=>projectionRow({...row,source:invalid}as never))}
 assert.throws(()=>projectionRow({...row,source:{...source,versionB4:0}}as never));
});
