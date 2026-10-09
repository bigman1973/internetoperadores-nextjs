import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { z } from 'zod';
import { getAccessToken, getSiteDrive } from './microsoft-graph';

/** This scope is deliberately fixed: callers can never supply a SharePoint path. */
export const PENDING_REFACTORING_SCOPE = '2. Contabilidad y finanzas/2. Facturas recibidas/2. Facturas recibidas- Vola/2026';
const SCOPE_SEGMENTS = PENDING_REFACTORING_SCOPE.split('/');
const GRAPH_ORIGIN = 'https://graph.microsoft.com';
const GRAPH_BASE = `${GRAPH_ORIGIN}/v1.0`;
export const DISCOVERY_LIMIT = 2000;
export const DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
const STALE_ANALYSIS_MS = 15 * 60 * 1000;

export const PENDING_STATES = ['DETECTADO', 'ANALIZANDO', 'CAMBIADO', 'REVISION', 'LISTO', 'ERROR'] as const;
export type PendingState = typeof PENDING_STATES[number];

export class PendingRefactoringError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** Only whitespace, hyphen glyphs and case are relaxed while resolving each fixed folder name. */
export function normalizeScopeFolderName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-ES');
}

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const money = z.number().finite().refine(
  value => Math.abs(value) < 1_000_000_000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  'Cantidad no válida o con más de dos decimales.',
).nullable();
const exactDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Fecha no válida.').nullable();

/**
 * This intentionally uses an independent raw extractor. It keeps source values raw:
 * no recipient assumption, amount defaults, date defaults, or line rebalancing are permitted.
 */
export const pendingInvoiceResultSchema = z.object({
  proveedor: nullableText(160),
  destinatario: nullableText(160),
  numFactura: nullableText(100),
  fecha: exactDate,
  base: money,
  iva: money,
  total: money,
  moneda: z.string().regex(/^[A-Z]{3}$/).nullable(),
  confianza: z.number().finite().min(0).max(1).nullable(),
  concepto: nullableText(2000),
  lineas: z.array(z.object({
    descripcion: nullableText(2000),
    importe: money,
  }).strict()).max(200),
}).strict();
export type PendingInvoiceResult = z.infer<typeof pendingInvoiceResultSchema>;

const extractionPrompt = `Eres un extractor literal y prudente de documentos contables. Determina si el documento es una factura recibida; si no lo es, no inventes datos y usa null donde no sea legible.

Responde SOLO JSON, sin markdown y exactamente con esta estructura:
{
  "proveedor": "nombre completo real del emisor o null",
  "destinatario": "nombre completo real de la empresa destinataria exactamente como figura o null",
  "numFactura": "número exacto de factura o null",
  "fecha": "YYYY-MM-DD o null",
  "base": número con hasta dos decimales o null,
  "iva": número con hasta dos decimales o null,
  "total": número con hasta dos decimales o null,
  "moneda": "código ISO 4217 de tres mayúsculas, por ejemplo EUR, o null",
  "confianza": número entre 0 y 1 o null,
  "concepto": "concepto literal breve o null",
  "lineas": [{"descripcion":"texto literal o null","importe":número con hasta dos decimales o null}]
}

Reglas estrictas:
- proveedor es el emisor, destinatario es quien recibe la factura. Nunca supongas que el destinatario es Vola, Internet Operadores ni ninguna empresa concreta.
- destinatario debe ser la razón social completa visible, no una abreviatura inventada.
- fecha debe ser la fecha de emisión completa y exacta, nunca vencimiento; si no se lee, null.
- Los números deben leerse literalmente. No uses 0, la fecha actual ni cálculos como sustitutos de un dato ilegible.
- No reequilibres ni cambies importes de líneas. Incluye solamente líneas que aparezcan en el documento; si su importe no se lee, usa null.
- Si el documento no es factura o no puedes determinarlo, deja los campos no legibles en null y confianza baja o null.`;

function cleanJson(content: string) {
  return content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

export function parsePendingInvoiceResult(content: string): PendingInvoiceResult {
  let json: unknown;
  try { json = JSON.parse(cleanJson(content)); } catch { throw new PendingRefactoringError('La extracción no devolvió JSON válido.', 502); }
  const parsed = pendingInvoiceResultSchema.safeParse(json);
  if (!parsed.success) throw new PendingRefactoringError('La extracción no cumple el contrato documental.', 502);
  return parsed.data;
}

const cents = (value: number) => Math.round(value * 100);
export function assessPendingInvoice(result: PendingInvoiceResult): { estado: 'LISTO' | 'REVISION'; incidencia: string | null } {
  const complete = result.proveedor !== null && result.destinatario !== null && result.numFactura !== null && result.fecha !== null
    && result.base !== null && result.iva !== null && result.total !== null && result.moneda !== null && result.confianza !== null && result.concepto !== null;
  if (!complete) return { estado: 'REVISION', incidencia: 'Documento no verificable como factura; requiere revisión.' };
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(result.fecha)) return { estado: 'REVISION', incidencia: 'La fecha no es compatible con el período de revisión.' };
  const recipient = result.destinatario.normalize('NFKC').toLocaleLowerCase('es-ES').replace(/\s+/g, ' ').trim();
  if (recipient.includes('internet operadores')) return { estado: 'REVISION', incidencia: 'El destinatario es Internet Operadores: utiliza sus facturas recibidas, no un original de terceros.' };
  if (result.moneda !== 'EUR') return { estado: 'REVISION', incidencia: 'La moneda no es EUR; requiere revisión sin conversión.' };
  if (result.confianza === null || result.confianza < 0.85) return { estado: 'REVISION', incidencia: 'Confianza de extracción insuficiente; requiere revisión.' };
  if (!result.lineas.length || result.lineas.some(line => line.descripcion === null || line.importe === null)) return { estado: 'REVISION', incidencia: 'Detalle de líneas incompleto; requiere revisión.' };
  const lineTotal = result.lineas.reduce((total, line) => total + cents(line.importe!), 0);
  if (Math.abs(lineTotal - cents(result.base)) > 2) return { estado: 'REVISION', incidencia: 'Las líneas no cuadran con la base; requiere revisión.' };
  if (Math.abs(cents(result.base) + cents(result.iva) - cents(result.total)) > 2) return { estado: 'REVISION', incidencia: 'Base, IVA y total no cuadran; requiere revisión.' };
  return { estado: 'LISTO', incidencia: null };
}

/** Never return an invalid or untrusted Json field to an API consumer. */
export function sanitizePendingResult(value: unknown): PendingInvoiceResult | null {
  const parsed = pendingInvoiceResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Flat normalized search material; no OCR value is transformed or used for accounting. */
export function pendingSearchText(result: PendingInvoiceResult) {
  return [result.proveedor, result.destinatario, result.numFactura, result.concepto, ...result.lineas.map(line => line.descripcion)]
    .filter((value): value is string => value !== null)
    .join(' ')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000);
}

type GraphItem = {
  id?: unknown;
  name?: unknown;
  folder?: unknown;
  file?: { mimeType?: unknown } | null;
  size?: unknown;
  eTag?: unknown;
  lastModifiedDateTime?: unknown;
};

type GraphChildren = { value?: unknown; '@odata.nextLink'?: unknown };
type DiscoveredDocument = { drive: string; item: string; ruta: string; nombre: string; mime: string | null; etag: string | null; size: number; modificadoAt: Date | null };

function graphUrl(path: string) { return `${GRAPH_BASE}${path}`; }
function graphItemUrl(drive: string, item: string) { return graphUrl(`/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}`); }

function ensureGraphNextLink(value: unknown) {
  if (typeof value !== 'string') throw new PendingRefactoringError('Paginación documental no válida.', 502);
  let url: URL;
  try { url = new URL(value); } catch { throw new PendingRefactoringError('Paginación documental no válida.', 502); }
  if (url.origin !== GRAPH_ORIGIN || !url.pathname.startsWith('/v1.0/')) throw new PendingRefactoringError('Paginación documental no autorizada.', 502);
  return url.toString();
}

async function graphJson(token: string, url: string): Promise<GraphChildren> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new PendingRefactoringError('No se pudo consultar el repositorio documental privado.', 502);
  const body = await response.json();
  if (!body || typeof body !== 'object') throw new PendingRefactoringError('Respuesta documental no válida.', 502);
  return body as GraphChildren;
}

async function graphChildren(token: string, initial: string): Promise<GraphItem[]> {
  const items: GraphItem[] = [];
  let next: string | null = initial;
  let pages = 0;
  while (next) {
    if (++pages > 20) throw new PendingRefactoringError('El listado documental excede el límite seguro.', 502);
    const page = await graphJson(token, next);
    if (!Array.isArray(page.value)) throw new PendingRefactoringError('Respuesta documental no válida.', 502);
    items.push(...page.value as GraphItem[]);
    next = page['@odata.nextLink'] === undefined ? null : ensureGraphNextLink(page['@odata.nextLink']);
  }
  return items;
}

function itemId(item: GraphItem) { return typeof item.id === 'string' && /^[A-Za-z0-9!_.~-]{4,220}$/.test(item.id) ? item.id : null; }
function itemName(item: GraphItem) { return typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 240 ? item.name : null; }
function hasFolder(item: GraphItem) { return Boolean(item.folder && typeof item.folder === 'object'); }
function nullableShort(value: unknown, max: number) { return typeof value === 'string' && value.length <= max ? value : null; }
function modifiedAt(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function supportedMime(name: string, mime: string | null) {
  const extension = name.split('.').pop()?.toLocaleLowerCase('en-US') || '';
  const known = new Set(['pdf', 'jpg', 'jpeg', 'png']);
  if (!known.has(extension)) return null;
  if (extension === 'pdf') return 'application/pdf';
  if (mime && /^image\/(jpeg|png)$/i.test(mime)) return mime.toLocaleLowerCase('en-US');
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as Record<string, string>)[extension] || null;
}

async function resolveScopeFolder(token: string, drive: string) {
  let parent: string | null = null;
  for (const expected of SCOPE_SEGMENTS) {
    const initial = parent
      ? `${graphItemUrl(drive, parent)}/children?$select=id,name,folder&$top=200`
      : graphUrl(`/drives/${encodeURIComponent(drive)}/root/children?$select=id,name,folder&$top=200`);
    const matches = (await graphChildren(token, initial)).filter(item => hasFolder(item) && itemName(item) !== null && normalizeScopeFolderName(itemName(item)!) === normalizeScopeFolderName(expected));
    if (matches.length !== 1 || !itemId(matches[0])) throw new PendingRefactoringError('No se pudo resolver el ámbito documental configurado.', 502);
    parent = itemId(matches[0]);
  }
  return parent!;
}

/** SharePoint may return a technical name rather than the title shown in the library. */
export function accountingSiteNameMatches(value: unknown) {
  if (typeof value !== 'string') return false;
  const key = value.normalize('NFKC').replace(/&amp;/gi, '&').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['ioaccountingfinances', 'ioaccountingfinance', 'accountingfinances', 'accountingfinance'].includes(key);
}
async function graphCredentials() {
  const token = await getAccessToken();
  const result = await graphJson(token, graphUrl('/sites?search=Accounting'));
  if (!Array.isArray(result.value)) throw new PendingRefactoringError('No se pudo resolver el sitio documental configurado.', 502);
  const sites = (result.value as any[]).filter(site => accountingSiteNameMatches(site.displayName) || accountingSiteNameMatches(site.name));
  if (sites.length !== 1 || typeof sites[0].id !== 'string') throw new PendingRefactoringError('No se pudo identificar de forma única el sitio de contabilidad.', 502);
  const drive = process.env.SHAREPOINT_DRIVE_ID || await getSiteDrive(sites[0].id);
  if (!drive) throw new PendingRefactoringError('No se pudo resolver el repositorio documental privado.', 502);
  return { token, drive };
}

export async function discoverScopeDocuments(): Promise<{ documents: DiscoveredDocument[]; skippedUnsupported: number; incomplete: boolean }> {
  const { token, drive } = await graphCredentials();
  const scopeId = await resolveScopeFolder(token, drive);
  const queue: Array<{ id: string; ruta: string; depth: number }> = [{ id: scopeId, ruta: PENDING_REFACTORING_SCOPE, depth: 0 }];
  const visited = new Set<string>([scopeId]);
  const documents: DiscoveredDocument[] = [];
  let skippedUnsupported = 0;
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const children = await graphChildren(token, `${graphItemUrl(drive, current.id)}/children?$select=id,name,folder,file,size,eTag,lastModifiedDateTime&$top=200`);
    for (const child of children) {
      const id = itemId(child); const name = itemName(child);
      if (!id || !name) { skippedUnsupported++; continue; }
      const ruta = `${current.ruta}/${name}`;
      if (hasFolder(child)) {
        if (current.depth >= 20 || queue.length >= 500 || visited.has(id)) { skippedUnsupported++; continue; }
        visited.add(id); queue.push({ id, ruta, depth: current.depth + 1 }); continue;
      }
      const detectedMime = supportedMime(name, nullableShort(child.file?.mimeType, 100));
      const size = typeof child.size === 'number' && Number.isSafeInteger(child.size) && child.size >= 0 && child.size <= 2_147_483_647 ? child.size : null;
      if (!detectedMime || size === null) { skippedUnsupported++; continue; }
      if (documents.length >= DISCOVERY_LIMIT) return { documents, skippedUnsupported, incomplete: true };
      documents.push({ drive, item: id, ruta, nombre: name, mime: detectedMime, etag: nullableShort(child.eTag, 1000), size, modificadoAt: modifiedAt(child.lastModifiedDateTime) });
    }
  }
  return { documents, skippedUnsupported, incomplete: false };
}

function sameMetadata(previous: any, item: DiscoveredDocument) {
  return previous.ruta === item.ruta && previous.nombre === item.nombre && previous.mime === item.mime && previous.etag === item.etag
    && previous.size === item.size && Number(previous.modificadoAt || 0) === Number(item.modificadoAt || 0);
}

/** Per-item serializable transaction: a changed analysed document retains its raw result but must be rescanned. */
export async function persistDiscoveredDocument(prisma: any, item: DiscoveredDocument) {
  return prisma.$transaction(async (tx: any) => {
    const previous = await tx.documentoRefacturacionPendiente.findFirst({ where: { drive: item.drive, item: item.item } });
    if (!previous) return tx.documentoRefacturacionPendiente.create({ data: item });
    if (sameMetadata(previous, item)) return previous;
    const analyzed = previous.estado !== 'DETECTADO';
    return tx.documentoRefacturacionPendiente.update({ where: { id: previous.id }, data: {
      ...item,
      estado: analyzed ? 'CAMBIADO' : 'DETECTADO',
      incidencia: analyzed ? 'El archivo cambió en el repositorio; requiere nuevo análisis.' : null,
      version: { increment: 1 },
    } });
  }, { isolationLevel: 'Serializable' });
}

export async function discoverPendingDocuments(prisma: any) {
  const scan = await discoverScopeDocuments();
  let detectados = 0; let actualizados = 0;
  for (const item of scan.documents) {
    const before = await prisma.documentoRefacturacionPendiente.findFirst({ where: { drive: item.drive, item: item.item }, select: { ruta: true, nombre: true, mime: true, etag: true, size: true, modificadoAt: true } });
    await persistDiscoveredDocument(prisma, item);
    if (!before) detectados++; else if (!sameMetadata(before, item)) actualizados++;
  }
  return { detectados, actualizados, omitidos: scan.skippedUnsupported, incompleto: scan.incomplete, limite: DISCOVERY_LIMIT };
}

async function downloadPendingDocument(row: { drive: string; item: string }) {
  const token = await getAccessToken();
  const response = await fetch(`${graphItemUrl(row.drive, row.item)}/content`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > DOCUMENT_MAX_BYTES) throw new PendingRefactoringError('No se pudo recuperar el documento privado.', 502);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > DOCUMENT_MAX_BYTES) { await reader.cancel(); throw new PendingRefactoringError('El documento supera el límite de análisis.', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

function isExpectedFile(bytes: Buffer, mime: string | null, name: string) {
  const extension = name.split('.').pop()?.toLocaleLowerCase('en-US');
  if (mime === 'application/pdf' || extension === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return false;
}

async function extractRawInvoice(bytes: Buffer, row: { mime: string | null; nombre: string }) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const mime = row.mime || (row.nombre.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const base64 = bytes.toString('base64');
  const document: any = mime === 'application/pdf'
    ? { type: 'file', file: { filename: row.nombre, file_data: `data:application/pdf;base64,${base64}` } }
    : { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } };
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 16_000,
    messages: [
      { role: 'system', content: extractionPrompt },
      { role: 'user', content: [{ type: 'text', text: 'Extrae este documento sin completar ni corregir ningún valor.' }, document] },
    ],
  });
  if (response.choices[0]?.finish_reason === 'length') throw new PendingRefactoringError('La extracción superó el límite seguro; requiere revisión manual.', 502);
  const content = response.choices[0]?.message?.content;
  if (!content) throw new PendingRefactoringError('La extracción no devolvió resultado.', 502);
  return parsePendingInvoiceResult(content);
}

async function releaseFailedAnalysis(prisma: any, id: string, version: number, message: string) {
  try {
    await prisma.documentoRefacturacionPendiente.updateMany({ where: { id, version, estado: 'ANALIZANDO' }, data: { estado: 'ERROR', incidencia: message, version: { increment: 1 } } });
  } catch { /* A competing update must not expose analysis details or strand a claim. */ }
}

export async function analyzePendingDocument(prisma: any, input: { id: string; version: number }) {
  let claim: any;
  try {
    claim = await prisma.$transaction(async (tx: any) => {
      const row = await tx.documentoRefacturacionPendiente.findUnique({ where: { id: input.id } });
      if (!row) throw new PendingRefactoringError('Documento pendiente no encontrado.', 404);
      if (row.version !== input.version) throw new PendingRefactoringError('El documento cambió. Recarga antes de analizar.', 409);
      if (row.fuenteId) throw new PendingRefactoringError('El documento ya está vinculado a una fuente y no se puede volver a analizar.', 409);
      const stale = row.estado === 'ANALIZANDO' && new Date(row.updatedAt).getTime() <= Date.now() - STALE_ANALYSIS_MS;
      if (row.estado === 'ANALIZANDO' && !stale) throw new PendingRefactoringError('El documento ya se está analizando.', 409);
      const updated = await tx.documentoRefacturacionPendiente.updateMany({ where: { id: row.id, version: input.version }, data: { estado: 'ANALIZANDO', incidencia: null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new PendingRefactoringError('El documento cambió. Recarga antes de analizar.', 409);
      return { ...row, version: input.version + 1 };
    }, { isolationLevel: 'Serializable' });
  } catch (error) { throw error; }

  try {
    const bytes = await downloadPendingDocument(claim);
    if (!isExpectedFile(bytes, claim.mime, claim.nombre)) throw new PendingRefactoringError('El documento recuperado no coincide con su formato.', 409);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (claim.hash && claim.hash !== hash) {
      const changed = await prisma.documentoRefacturacionPendiente.updateMany({ where: { id: claim.id, version: claim.version, estado: 'ANALIZANDO' }, data: { estado: 'CAMBIADO', hash: null, incidencia: 'El archivo cambió en el repositorio; requiere nuevo análisis.', version: { increment: 1 } } });
      if (!changed.count) throw new PendingRefactoringError('El documento cambió. Recarga antes de analizar.', 409);
      throw new PendingRefactoringError('El archivo cambió en el repositorio; vuelve a descubrirlo antes de analizar.', 409);
    }
    const duplicate = await prisma.documentoRefacturacionPendiente.findUnique({ where: { hash }, select: { id: true } });
    if (duplicate && duplicate.id !== claim.id) {
      await releaseFailedAnalysis(prisma, claim.id, claim.version, 'El contenido ya pertenece a otro documento pendiente; puedes revisarlo sin sobrescribirlo.');
      throw new PendingRefactoringError('El contenido ya pertenece a otro documento pendiente.', 409);
    }
    const result = await extractRawInvoice(bytes, claim);
    const assessment = assessPendingInvoice(result);
    const saved = await prisma.documentoRefacturacionPendiente.updateMany({ where: { id: claim.id, version: claim.version, estado: 'ANALIZANDO', fuenteId: null }, data: {
      estado: assessment.estado,
      resultado: result,
      textoBusqueda: pendingSearchText(result),
      incidencia: assessment.incidencia,
      hash,
      version: { increment: 1 },
    } });
    if (!saved.count) throw new PendingRefactoringError('El documento cambió durante el análisis.', 409);
    return {
      id: claim.id, nombre: claim.nombre, ruta: claim.ruta, mime: claim.mime, size: claim.size,
      estado: assessment.estado, resultado: result, incidencia: assessment.incidencia, fuenteId: null, version: claim.version + 1,
    };
  } catch (error) {
    // CAS, source-content and duplicate-content conflicts must retain their exact state/message.
    if (error instanceof PendingRefactoringError && error.status === 409) throw error;
    await releaseFailedAnalysis(prisma, claim.id, claim.version, 'No se pudo analizar el documento; puedes reintentarlo.');
    if (error instanceof PendingRefactoringError && error.status === 413) throw error;
    throw new PendingRefactoringError('No se pudo analizar el documento privado; puedes reintentarlo.', 502);
  }
}

export async function downloadPendingDocumentForProxy(row: { drive: string; item: string; hash: string | null; mime: string | null; nombre: string }) {
  const bytes = await downloadPendingDocument(row);
  if (!isExpectedFile(bytes, row.mime, row.nombre)) throw new PendingRefactoringError('El documento recuperado no coincide con su formato.', 409);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (row.hash && row.hash !== hash) throw new PendingRefactoringError('El archivo cambió en el repositorio; revisión documental necesaria.', 409);
  return bytes;
}
