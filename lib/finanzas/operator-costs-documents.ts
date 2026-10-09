import { createHash } from 'node:crypto';
import { getAccessToken, findSharePointSite, getSiteDrive } from './microsoft-graph';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX = 4 * 1024 * 1024;
const BASE = '2. Contabilidad y finanzas';
async function credentials() {
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID || await getSiteDrive((await findSharePointSite()).siteId);
  return { token, drive };
}
const pathUrl = (drive: string, path: string) => `${GRAPH}/drives/${encodeURIComponent(drive)}/root:/${path.split('/').map(encodeURIComponent).join('/')}`;
async function ensureFolder(drive: string, token: string, parent: string, name: string) {
  const url = pathUrl(drive, `${parent}/${name}`);
  const exists = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (exists.ok) { if (!(await exists.json()).folder) throw new Error('La ruta documental no es una carpeta'); return; }
  if (exists.status !== 404) throw new Error('No se pudo verificar la carpeta privada');
  const create = await fetch(pathUrl(drive, parent) + ':/children', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }), signal: AbortSignal.timeout(20000) });
  if (!create.ok && create.status !== 409) throw new Error('No se pudo crear la carpeta privada');
}
async function readBytes(drive: string, item: string, token: string) {
  if (!/^[A-Za-z0-9!_.~-]{4,220}$/.test(item)) throw new Error('Archivo no válido');
  const response = await fetch(`${GRAPH}/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}/content`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX) throw new Error('No se pudo recuperar el PDF privado');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > MAX) { await reader.cancel(); throw new Error('PDF demasiado grande'); } chunks.push(r.value); } } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export async function uploadOperatorPdf(sourceId: string, periodo: string, bytes: Buffer) {
  const { token, drive } = await credentials();
  const hash = createHash('sha256').update(bytes).digest('hex');
  await ensureFolder(drive, token, BASE, 'Costes de operadora');
  await ensureFolder(drive, token, `${BASE}/Costes de operadora`, periodo);
  const name = `original-${sourceId}-${hash.slice(0, 16)}.pdf`;
  const url = pathUrl(drive, `${BASE}/Costes de operadora/${periodo}/${name}`);
  const existing = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (existing.ok) {
    const item = await existing.json();
    const stored = await readBytes(drive, item.id, token);
    if (createHash('sha256').update(stored).digest('hex') !== hash) throw new Error('Archivo distinto con el mismo nombre; no se ha sobrescrito');
    return { drive, item: item.id as string, name, hash };
  }
  if (existing.status !== 404) throw new Error('No se pudo verificar el archivo original');
  const response = await fetch(url + ':/content', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf', 'If-None-Match': '*' }, body: new Uint8Array(bytes), cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('No se pudo guardar el PDF privado; revisa permisos de OneDrive');
  const saved = await response.json();
  if (typeof saved.id !== 'string' || !saved.id) throw new Error('OneDrive no confirmó el documento');
  return { drive, item: saved.id as string, name, hash };
}
export async function downloadOperatorPdf(drive: string, item: string) {
  const bytes = await readBytes(drive, item, await getAccessToken());
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('El documento no es un PDF');
  return bytes;
}
