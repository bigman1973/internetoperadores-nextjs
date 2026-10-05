/** Acceso a SharePoint/OneDrive del área de nóminas (también reutilizado por finanzas). */
const BASE_PATH = '4. Recursos Humanos/3. Nóminas';
const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

interface DriveItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
}

export interface PayrollDriveFile {
  name: string;
  id: string;
  month: string;
  monthNum: number;
  tipo: 'costes_io' | 'nomina_individual' | 'liquidacion';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function driveId() {
  const id = process.env.SHAREPOINT_DRIVE_ID;
  if (!id) throw new Error('Falta la configuración SHAREPOINT_DRIVE_ID');
  return encodeURIComponent(id);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.token;
  const tenant = process.env.MICROSOFT_GRAPH_TENANT_ID;
  const client = process.env.MICROSOFT_GRAPH_CLIENT_ID;
  const secret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
  if (!tenant || !client || !secret) throw new Error('Falta la configuración MICROSOFT_GRAPH_*');
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Microsoft Graph: error de autenticación (${response.status})`);
  const data = await response.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function graphGet(url: string): Promise<Response> {
  if (!url.startsWith('https://graph.microsoft.com/v1.0/')) throw new Error('URL de paginación Graph no válida');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await getAccessToken()}` },
      signal: AbortSignal.timeout(30000), cache: 'no-store', redirect: 'follow',
    });
    if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
      const retrySeconds = Math.min(5, Number(response.headers.get('Retry-After')) || 1);
      await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Microsoft Graph: error al consultar OneDrive (${response.status})`);
    return response;
  }
  throw new Error('Microsoft Graph no respondió tras los reintentos');
}

/** Devuelve todas las páginas. Nunca interpreta una página parcial como una carpeta completa. */
export async function listFolderByPath(path: string): Promise<DriveItem[]> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  let url: string | undefined = `https://graph.microsoft.com/v1.0/drives/${driveId()}/root:/${encoded}:/children?$top=200`;
  const files: DriveItem[] = [];
  while (url) {
    const response = await graphGet(url);
    const page = await response.json();
    files.push(...(page.value || []));
    url = page['@odata.nextLink'];
  }
  return files;
}

export async function downloadFileById(itemId: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9!_.~-]{4,220}$/.test(itemId)) throw new Error('Identificador de archivo no válido');
  const response = await graphGet(`https://graph.microsoft.com/v1.0/drives/${driveId()}/items/${encodeURIComponent(itemId)}/content`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('El archivo supera el límite de 50 MB');
  return Buffer.from(bytes);
}

export function payrollMonthFromFolder(folderName: string): number {
  const upper = folderName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const named = MONTHS.findIndex(month => new RegExp(`\\b${month}\\b`).test(upper));
  if (named >= 0) return named + 1;
  const numbered = upper.match(/^(?:MES\s*)?0?([1-9]|1[0-2])(?:\s|[._-]|$)/);
  return numbered ? Number(numbered[1]) : 0;
}

export function classifyPayrollFile(name: string): PayrollDriveFile['tipo'] | null {
  const upper = name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  if (!upper.endsWith('.PDF') || /\bSOTIC\b/.test(upper)) return null;
  if (/^COSTES\s+(?:INTERNET\s+OPERADORES|IO)\b/.test(upper)) return 'costes_io';
  if (/^(?:LIQUIDACION|FINIQUITO)(?:\s+|[-_])/.test(upper)) return 'liquidacion';
  if (/^NOMINA\s+(?:INTERNET\s+OPERADORES|IO)\b/.test(upper)) {
    return /\b(?:LIQUIDACION|FINIQUITO)\b/.test(upper) ? 'liquidacion' : 'nomina_individual';
  }
  return null;
}

export async function getAvailableMonths(year: number): Promise<{ name: string; id: string }[]> {
  const months = await listFolderByPath(`${BASE_PATH}/${year}`);
  return months.filter(item => item.folder && payrollMonthFromFolder(item.name) > 0)
    .map(item => ({ name: item.name, id: item.id }))
    .sort((a, b) => payrollMonthFromFolder(a.name) - payrollMonthFromFolder(b.name));
}

async function collectMonthlyFiles(path: string, monthNum: number, maxDepth = 2): Promise<PayrollDriveFile[]> {
  const found: PayrollDriveFile[] = [];
  const pending = [{ path, depth: 0 }];
  while (pending.length) {
    if (pending.length > 50 || found.length > 500) throw new Error('Demasiados archivos en la carpeta de nóminas; revisión necesaria');
    const current = pending.shift()!;
    for (const item of await listFolderByPath(current.path)) {
      if (item.folder && current.depth < maxDepth) pending.push({ path: `${current.path}/${item.name}`, depth: current.depth + 1 });
      if (!item.file) continue;
      const tipo = classifyPayrollFile(item.name);
      if (!tipo) continue;
      found.push({ name: item.name, id: item.id, month: MONTHS[monthNum - 1], monthNum, tipo });
    }
  }
  return found;
}

/** Busca nóminas de IO en carpetas mensuales; no importa costes ni nóminas de SOTIC XXI. */
export async function findCostesFiles(year: number, selectedMonths?: number[]): Promise<PayrollDriveFile[]> {
  if (!Number.isInteger(year) || year < 2024 || year > 2100) throw new Error('Año de nóminas no válido');
  const allFolders = await listFolderByPath(`${BASE_PATH}/${year}`);
  const folders = allFolders.filter(f => f.folder && payrollMonthFromFolder(f.name) > 0 && (!selectedMonths || selectedMonths.includes(payrollMonthFromFolder(f.name))));
  const found: PayrollDriveFile[] = [];
  for (const folder of folders) {
    const monthNum = payrollMonthFromFolder(folder.name);
    found.push(...await collectMonthlyFiles(`${BASE_PATH}/${year}/${folder.name}`, monthNum));
  }
  // Gestorías pueden archivar los finiquitos en una carpeta hermana de los meses.
  for (const extra of allFolders.filter(f => f.folder && /\b(?:LIQUIDACIONES|FINIQUITOS|COMPLEMENTARIAS)\b/i.test(f.name))) {
    const subfolders = [{ path: `${BASE_PATH}/${year}/${extra.name}`, depth: 0 }];
    while (subfolders.length) {
      if (subfolders.length > 40) throw new Error('Demasiadas carpetas de liquidaciones para revisar automáticamente');
      const current = subfolders.shift()!;
      for (const item of await listFolderByPath(current.path)) {
        if (item.folder && current.depth < 1) subfolders.push({ path: `${current.path}/${item.name}`, depth: 1 });
        if (!item.file) continue;
        const monthNum = payrollMonthFromFolder(item.name);
        const tipo = classifyPayrollFile(item.name);
        if (tipo === 'liquidacion' && monthNum && (!selectedMonths || selectedMonths.includes(monthNum))) {
          found.push({ name: item.name, id: item.id, month: MONTHS[monthNum - 1], monthNum, tipo });
        }
      }
    }
  }
  const order = { costes_io: 0, nomina_individual: 1, liquidacion: 2 };
  return [...new Map(found.map(file => [`${file.id}:${file.monthNum}`, file])).values()]
    .sort((a, b) => a.monthNum - b.monthNum || order[a.tipo] - order[b.tipo] || a.name.localeCompare(b.name, 'es'));
}

export const downloadCostesFile = downloadFileById;
