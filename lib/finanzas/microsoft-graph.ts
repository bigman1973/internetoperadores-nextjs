/**
 * Microsoft Graph API Client
 * Accede a OneDrive/SharePoint para sincronizar facturas recibidas
 * 
 * Ruta en SharePoint:
 * IO: Accounting & Finances > Documentos > 2. Contabilidad y finanzas > 2. Facturas recibidas > 1. Facturas recibidas- Internet Operadores > 2026
 * 
 * Subcarpetas:
 * - 1. Compra de materiales 2026
 * - 2. Pendiente de contabilizar o revisar 2026
 * - 3. Trimestre 1 2026
 * - 4. Trimestre 2 2026
 * - 5. Trimestre 3 2026
 * - 6. Trimestre 4 2026
 */

function getTenantId() { return process.env.MICROSOFT_GRAPH_TENANT_ID || ''; }
function getClientId() { return process.env.MICROSOFT_GRAPH_CLIENT_ID || ''; }
function getClientSecret() { return process.env.MICROSOFT_GRAPH_CLIENT_SECRET || ''; }

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Cache del token (dura 1h)
let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Obtiene un access token usando Client Credentials flow
 */
export async function getAccessToken(): Promise<string> {
  // Usar cache si no ha expirado
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const TENANT_ID = getTenantId();
  const CLIENT_ID = getClientId();
  const CLIENT_SECRET = getClientSecret();

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Faltan variables de entorno MICROSOFT_GRAPH_*');
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error obteniendo token de Graph API: ${res.status} ${error}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 60s de margen
  };

  return data.access_token;
}

/**
 * Hace una petición autenticada a Graph API
 */
async function graphFetch(path: string, options?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Graph API error ${res.status}: ${error}`);
  }

  // Algunos endpoints devuelven 204 sin body
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Busca el site de SharePoint "IO: Accounting & Finances"
 */
export async function findSharePointSite(): Promise<{ siteId: string; siteName: string }> {
  // Buscar el site por nombre
  const result = await graphFetch('/sites?search=Accounting');
  
  if (!result.value || result.value.length === 0) {
    throw new Error('No se encontró el site "IO: Accounting & Finances" en SharePoint');
  }

  // Buscar el site correcto
  const site = result.value.find((s: any) => 
    s.displayName?.includes('Accounting') || s.name?.includes('Accounting')
  ) || result.value[0];

  return { siteId: site.id, siteName: site.displayName || site.name };
}

/**
 * Obtiene el drive (biblioteca de documentos) del site
 */
export async function getSiteDrive(siteId: string): Promise<string> {
  const result = await graphFetch(`/sites/${siteId}/drives`);
  
  if (!result.value || result.value.length === 0) {
    throw new Error('No se encontraron drives en el site');
  }

  // Buscar "Documentos" o el drive principal
  const drive = result.value.find((d: any) => 
    d.name === 'Documentos' || d.name === 'Documents' || d.name === 'Shared Documents'
  ) || result.value[0];

  return drive.id;
}

/**
 * Lista archivos en una carpeta del drive
 */
export async function listFolderContents(driveId: string, folderPath: string): Promise<any[]> {
  const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
  const result = await graphFetch(`/drives/${driveId}/root:/${encodedPath}:/children?$top=200`);
  return result.value || [];
}

/**
 * Obtiene el contenido (bytes) de un archivo
 */
export async function downloadFile(driveId: string, itemId: string): Promise<Buffer> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Error descargando archivo: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Mueve un archivo de una carpeta a otra
 */
export async function moveFile(driveId: string, itemId: string, destinationFolderId: string, newName?: string): Promise<any> {
  const body: any = {
    parentReference: { id: destinationFolderId },
  };
  if (newName) body.name = newName;

  return graphFetch(`/drives/${driveId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * Obtiene el ID de una carpeta por su path
 */
export async function getFolderByPath(driveId: string, folderPath: string): Promise<{ id: string; name: string }> {
  const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
  const result = await graphFetch(`/drives/${driveId}/root:/${encodedPath}`);
  return { id: result.id, name: result.name };
}

/**
 * Ruta base de las facturas recibidas 2026
 */
export const FACTURAS_BASE_PATH = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026';

/**
 * Subcarpetas conocidas
 */
export const CARPETAS = {
  COMPRA_MATERIALES: '1. Compra de materiales 2026',
  PENDIENTE_CONTABILIZAR: '2. Pendiente de contabilizar o revisar 2026',
  TRIMESTRE_1: '3. Trimestre 1 2026',
  TRIMESTRE_2: '4. Trimestre 2 2026',
  TRIMESTRE_3: '5. Trimestre 3 2026',
  TRIMESTRE_4: '6. Trimestre 4 2026',
};

/**
 * Determina en qué trimestre cae una fecha
 */
export function getTrimestreCarpeta(fecha: Date): string {
  const mes = fecha.getMonth() + 1;
  if (mes <= 3) return CARPETAS.TRIMESTRE_1;
  if (mes <= 6) return CARPETAS.TRIMESTRE_2;
  if (mes <= 9) return CARPETAS.TRIMESTRE_3;
  return CARPETAS.TRIMESTRE_4;
}

/**
 * Sincroniza una carpeta: lista archivos PDF/imagen y devuelve los que no están en BD
 */
export async function sincronizarCarpeta(
  driveId: string,
  carpeta: string,
  archivosYaImportados: Set<string>
): Promise<Array<{ id: string; name: string; size: number; lastModified: string; webUrl: string }>> {
  const fullPath = `${FACTURAS_BASE_PATH}/${carpeta}`;
  const items = await listFolderContents(driveId, fullPath);

  // Filtrar solo PDFs e imágenes (facturas)
  const archivosFactura = items.filter((item: any) => {
    if (item.folder) return false; // Ignorar subcarpetas
    const ext = item.name.toLowerCase().split('.').pop();
    return ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext || '');
  });

  // Filtrar los que ya están importados
  const nuevos = archivosFactura.filter((item: any) => !archivosYaImportados.has(item.id));

  return nuevos.map((item: any) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    lastModified: item.lastModifiedDateTime,
    webUrl: item.webUrl || '',
  }));
}
