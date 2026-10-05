import assert from 'node:assert/strict';
import { savePrivateDriveDocument } from '../lib/microsoft-graph';

process.env.SHAREPOINT_DRIVE_ID = 'test-drive';
process.env.MICROSOFT_GRAPH_TENANT_ID = 'test-tenant';
process.env.MICROSOFT_GRAPH_CLIENT_ID = 'test-client';
process.env.MICROSOFT_GRAPH_CLIENT_SECRET = 'test-secret';

const folder = '4. Recursos Humanos/3. Nóminas/2026/SEPTIEMBRE 2026';
const name = 'LIQUIDACION INTERNET OPERADORES SEPTIEMBRE 2026_PERSONA PRUEBA.pdf';
const contents = Buffer.from('%PDF-documento de prueba');
const original = global.fetch;
let existing = false;
let canWrite = true;
let uploads = 0;
global.fetch = async (target, options) => {
  const url = String(target);
  if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
  if (url.includes(':/children')) return new Response(JSON.stringify({ value: existing ? [{ id: 'test-item', name, file: { mimeType: 'application/pdf' } }] : [] }));
  if (url.includes('/items/test-item/content')) return new Response(contents);
  if (options?.method === 'PUT') {
    assert.equal((options.headers as Record<string,string>)['If-None-Match'], '*');
    uploads++;
    return canWrite ? new Response(JSON.stringify({ id: 'test-item', name }), { status: 201 }) : new Response('', { status: 403 });
  }
  throw new Error(`Ruta inesperada ${url}`);
};
async function main() {
try {
  const first = await savePrivateDriveDocument(folder, name, contents, 'application/pdf', /^LIQUIDACION.*PERSONA/i);
  assert.equal(first.id, 'test-item');
  existing = true;
  const second = await savePrivateDriveDocument(folder, name, contents, 'application/pdf', /^LIQUIDACION.*PERSONA/i);
  assert.deepEqual(second, first);
  assert.equal(uploads, 1, 'no duplica el archivo de SharePoint');
  await assert.rejects(() => savePrivateDriveDocument(folder, name, Buffer.from('%PDF-otro'), 'application/pdf', /^LIQUIDACION.*PERSONA/i), /mismo nombre/);
  existing = false; canWrite = false;
  await assert.rejects(() => savePrivateDriveDocument(folder, 'CARTA DESPIDO PERSONA.docx', Buffer.from('PK-documento'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /no coincide con ningún archivo/);
  assert.equal(uploads, 1, 'no crea una carta en carpeta sin revisar');
  await assert.rejects(() => savePrivateDriveDocument(folder, name, contents, 'application/pdf', /^LIQUIDACION.*PERSONA/i), /no tiene permiso/);
  console.log('Expediente: subida idempotente, colisiones y permiso Microsoft comprobados sin red.');
} finally { global.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
