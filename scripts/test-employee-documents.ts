import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
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
let existingName = name;
let existingContent = contents;
let declaredLength: number | null = null;
let itemSize: number | undefined;
global.fetch = async (target, options) => {
  const url = String(target);
  if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
  if (url.includes(':/children')) return new Response(JSON.stringify({ value: existing ? [{ id: 'test-item', name: existingName, size: itemSize, file: { mimeType: existingName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' } }] : [] }));
  if (url.includes('/items/test-item/content')) return new Response(existingContent, { headers: declaredLength ? { 'Content-Length': String(declaredLength) } : {} });
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
  const letterName = 'CARTA DESPIDO PERSONA.docx';
  const docx = (revision: string, text: string, picture = 'imagen-original', settings = 'sin-proteccion') => Buffer.from(zipSync({
    'word/document.xml': strToU8(`<w:document><w:p>${text}</w:p></w:document>`),
    'word/media/image1.png': strToU8(picture),
    'docProps/core.xml': strToU8(`<created>${revision}</created>`),
    'word/settings.xml': strToU8(settings),
  }));
  const originalLetter = docx('1', 'carta sin datos personales');
  const resavedLetter = docx('2', 'carta sin datos personales');
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, originalLetter, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /No se ha encontrado una carta/);
  existing = true; existingName = 'CARTA DESPIDO PERSONA.docx'; existingContent = resavedLetter;
  const reused = await savePrivateDriveDocument(folder, letterName, originalLetter, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false);
  assert.equal(reused.id, 'test-item', 'reutiliza la copia si solo cambian metadatos DOCX');
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, docx('3', 'texto diferente'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /mismo nombre/);
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, docx('3', 'carta sin datos personales', 'otra imagen'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /mismo nombre/);
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, docx('3', 'carta sin datos personales', 'imagen-original', 'protegido'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /mismo nombre/);
  itemSize = 9 * 1024 * 1024;
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, originalLetter, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /remoto supera/);
  itemSize = undefined; declaredLength = 9 * 1024 * 1024;
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, originalLetter, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /remoto supera/);
  declaredLength = null; existingContent = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, originalLetter, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /remoto supera/);
  existingContent = resavedLetter;
  const manyParts: Record<string, Uint8Array> = { 'word/document.xml': strToU8('<w:document/>') };
  for (let i = 0; i < 305; i++) manyParts[`word/embeddings/part${i}.bin`] = strToU8('x');
  await assert.rejects(() => savePrivateDriveDocument(folder, letterName, Buffer.from(zipSync(manyParts)), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /^CARTA.*PERSONA/i, false), /mismo nombre/);
  assert.equal(uploads, 1, 'no crea una carta en carpeta sin revisar');
  existing = false;
  await assert.rejects(() => savePrivateDriveDocument(folder, name, contents, 'application/pdf', /^LIQUIDACION.*PERSONA/i), /no tiene permiso/);
  console.log('Expediente: subida idempotente, colisiones y permiso Microsoft comprobados sin red.');
} finally { global.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
