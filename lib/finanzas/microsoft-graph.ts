/**
 * Microsoft Graph API client for the received-invoices SharePoint library.
 *
 * B1 safety guarantees:
 * - every Graph collection page is exhausted before an inventory is returned;
 * - Graph continuation links are accepted only for the requested Graph route;
 * - recursive inventory never hides a failed child folder; and
 * - discovered files retain their actual path for a later, explicit move.
 */

function getTenantId() { return process.env.MICROSOFT_GRAPH_TENANT_ID || ''; }
function getClientId() { return process.env.MICROSOFT_GRAPH_CLIENT_ID || ''; }
function getClientSecret() { return process.env.MICROSOFT_GRAPH_CLIENT_SECRET || ''; }

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_ORIGIN = 'https://graph.microsoft.com';
const MAX_GRAPH_PAGES = 10_000;

// Cache del token (dura 1h)
let tokenCache: { token: string; expiresAt: number } | null = null;

export type InvoiceLibrary = {
  siteId: string;
  siteName: string;
  driveId: string;
  driveName: string;
  rootPath: string;
  rootFolderId: string;
};

export type GraphItemWithPath = {
  id: string;
  name: string;
  /** Historical name: actual containing folder path, relative to the drive root. */
  relativeFolderPath: string;
  /** Explicit alias for the containing folder path, relative to the drive root. */
  folderPath: string;
  fullPath: string;
  [key: string]: any;
};

/**
 * Ruta base de las facturas recibidas 2026.
 */
export const FACTURAS_BASE_PATH = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026';

/**
 * Subcarpetas conocidas.
 */
export const CARPETAS = {
  COMPRA_MATERIALES: '1. Compra de materiales 2026',
  PENDIENTE_CONTABILIZAR: '2. Pendiente de contabilizar o revisar 2026',
  CONFIRMING_DRAXTON: '3. Confirming Draxton 2026',
  TRIMESTRE_1: '4. Trimestre 1 2026',
  TRIMESTRE_2: '5. Trimestre 2 2026',
  TRIMESTRE_3: '6. Trimestre 3 2026',
  TRIMESTRE_4: '7. Trimestre 4 2026',
};

function configuredValue(primaryName: string, aliasName?: string): string | null {
  const primary = process.env[primaryName]?.trim();
  const alias = aliasName ? process.env[aliasName]?.trim() : undefined;

  if (primary && alias && primary !== alias) {
    throw new Error(`Configuración de ${primaryName} conflictiva`);
  }

  return primary || alias || null;
}

function getConfiguredSiteId(): string | null {
  return configuredValue('SHAREPOINT_SITE_ID');
}

/**
 * SHAREPOINT_DRIVE_ID es el nombre histórico del proyecto. DRIVE_ID se admite
 * como alias para despliegues que ya lo proporcionen; ambos deben coincidir.
 */
function getConfiguredDriveId(): string | null {
  return configuredValue('SHAREPOINT_DRIVE_ID', 'DRIVE_ID');
}

function requiredConfiguredId(name: string, value: string | null): string {
  if (!value) {
    throw new Error(`Falta la configuración obligatoria ${name} para la biblioteca de facturas`);
  }
  return value;
}

function encodePathComponent(value: string): string {
  return encodeURIComponent(value);
}

function normalizeFolderPath(folderPath: string): string {
  const normalized = folderPath.split('/').filter(Boolean).join('/');
  if (!normalized) throw new Error('La ruta de carpeta de Graph no puede estar vacía');
  return normalized;
}

function encodeGraphPath(folderPath: string): string {
  return normalizeFolderPath(folderPath).split('/').map(encodePathComponent).join('/');
}

function collectionPath(driveId: string, folderPath: string): string {
  return `/drives/${encodePathComponent(driveId)}/root:/${encodeGraphPath(folderPath)}:/children?$top=200`;
}

function itemPath(driveId: string, folderPath: string): string {
  return `/drives/${encodePathComponent(driveId)}/root:/${encodeGraphPath(folderPath)}`;
}

function graphUrlFromPath(path: string): URL {
  if (!path.startsWith('/')) throw new Error('Ruta de Graph inválida');
  return new URL(`${GRAPH_BASE}${path}`);
}

/**
 * Validates before obtaining/attaching a token. In particular, a malicious
 * @odata.nextLink can never receive an Authorization header.
 */
function assertExpectedGraphUrl(url: URL, expectedPathname?: string): void {
  if (
    url.protocol !== 'https:' ||
    url.origin !== GRAPH_ORIGIN ||
    url.hostname !== 'graph.microsoft.com' ||
    url.port !== '' ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith('/v1.0/')
  ) {
    throw new Error('Enlace de paginación de Graph no permitido');
  }

  if (expectedPathname && url.pathname !== expectedPathname) {
    throw new Error('Enlace de paginación de Graph fuera de la ruta esperada');
  }
}

function parseNextLink(nextLink: unknown, expectedPathname: string): URL {
  if (typeof nextLink !== 'string' || !nextLink) {
    throw new Error('Enlace de paginación de Graph inválido');
  }

  let url: URL;
  try {
    url = new URL(nextLink);
  } catch {
    throw new Error('Enlace de paginación de Graph inválido');
  }

  assertExpectedGraphUrl(url, expectedPathname);
  return url;
}

/**
 * Obtiene un access token usando Client Credentials flow.
 */
export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const tenantId = getTenantId();
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Faltan variables de entorno MICROSOFT_GRAPH_*');
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodePathComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'error',
  });

  if (!response.ok) {
    // Never include a provider response here: it can contain sensitive details.
    throw new Error(`Error obteniendo token de Graph API (${response.status})`);
  }

  const data = await response.json();
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('Respuesta de token de Graph API inválida');
  }

  const expiresIn = Number(data.expires_in);
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number.isFinite(expiresIn) ? expiresIn - 60 : 300) * 1000,
  };
  return tokenCache.token;
}

/** Makes a validated request to Graph. Redirects are deliberately an error. */
async function graphFetchUrl(url: URL, expectedPathname?: string, options?: RequestInit): Promise<any> {
  assertExpectedGraphUrl(url, expectedPathname);
  const token = await getAccessToken();
  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
    // Do not follow a redirect with an Authorization header.
    redirect: 'error',
  });

  if (!response.ok) {
    // Do not expose provider bodies (or any request details) in logs/API errors.
    throw new Error(`Graph API error (${response.status})`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function graphFetch(path: string, options?: RequestInit): Promise<any> {
  const url = graphUrlFromPath(path);
  return graphFetchUrl(url, url.pathname, options);
}

/**
 * Fully reads a Graph collection. A malformed, repeated, redirected, or
 * off-route continuation link fails the entire operation rather than returning
 * a partial inventory.
 */
async function graphCollection(path: string): Promise<any[]> {
  let nextUrl = graphUrlFromPath(path);
  const expectedPathname = nextUrl.pathname;
  const visited = new Set<string>();
  const values: any[] = [];

  for (let page = 0; nextUrl; page += 1) {
    if (page >= MAX_GRAPH_PAGES) {
      throw new Error('Límite de páginas de Graph excedido; inventario incompleto rechazado');
    }

    assertExpectedGraphUrl(nextUrl, expectedPathname);
    const visitKey = nextUrl.toString();
    if (visited.has(visitKey)) {
      throw new Error('Bucle de paginación de Graph detectado; inventario incompleto rechazado');
    }
    visited.add(visitKey);

    const result = await graphFetchUrl(nextUrl, expectedPathname);
    if (!Array.isArray(result?.value)) {
      throw new Error('Respuesta de colección de Graph inválida; inventario incompleto rechazado');
    }
    values.push(...result.value);

    const nextLink = result['@odata.nextLink'];
    nextUrl = nextLink === undefined || nextLink === null
      ? null
      : parseNextLink(nextLink, expectedPathname);
  }

  return values;
}

function childFolderPath(parentPath: string, childName: unknown): string {
  if (typeof childName !== 'string' || !childName.trim() || childName.includes('/') || childName.includes('\\')) {
    throw new Error('Nombre de carpeta de Graph inválido; inventario incompleto rechazado');
  }
  return `${normalizeFolderPath(parentPath)}/${childName}`;
}

function attachPathMetadata(item: any, currentFolderPath: string): GraphItemWithPath {
  if (typeof item?.id !== 'string' || !item.id.trim()) {
    throw new Error('Elemento de Graph sin ID válido; inventario incompleto rechazado');
  }
  if (typeof item?.name !== 'string' || !item.name.trim() || item.name.includes('/') || item.name.includes('\\')) {
    throw new Error('Elemento de Graph sin ruta válida; inventario incompleto rechazado');
  }

  const folderPath = normalizeFolderPath(currentFolderPath);
  return {
    ...item,
    relativeFolderPath: folderPath,
    folderPath,
    fullPath: `${folderPath}/${item.name}`,
  };
}

/**
 * Busca el site de SharePoint de Finanzas para usos legacy. If a configured ID
 * exists it is used directly. Discovery never falls back to result.value[0].
 */
export async function findSharePointSite(): Promise<{ siteId: string; siteName: string }> {
  const configuredSiteId = getConfiguredSiteId();
  if (configuredSiteId) {
    const site = await graphFetch(`/sites/${encodePathComponent(configuredSiteId)}`);
    if (!site?.id || String(site.id) !== configuredSiteId) {
      throw new Error('El site configurado de SharePoint no es válido');
    }
    return { siteId: configuredSiteId, siteName: site.displayName || site.name || configuredSiteId };
  }

  const sites = await graphCollection('/sites?search=Accounting');
  const named = sites.filter((site: any) => typeof site?.id === 'string' && typeof (site.displayName || site.name) === 'string');
  const targetName = 'io: accounting & finances';
  const exact = named.filter((site: any) => String(site.displayName || site.name).trim().toLowerCase() === targetName);
  const candidates = exact.length > 0
    ? exact
    : named.filter((site: any) => String(site.displayName || site.name).toLowerCase().includes('accounting'));

  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? 'No se encontró un site de SharePoint de Finanzas inequívoco'
      : 'Se encontraron varios sites de SharePoint de Finanzas; configure SHAREPOINT_SITE_ID');
  }

  const site = candidates[0];
  return { siteId: site.id, siteName: site.displayName || site.name };
}

/**
 * Obtiene el drive de un site para usos legacy. A configured drive is honored;
 * strict site/drive/root validation intentionally lives in resolveInvoiceLibrary.
 */
export async function getSiteDrive(siteId: string): Promise<string> {
  const configuredDriveId = getConfiguredDriveId();
  if (configuredDriveId) return configuredDriveId;

  const drives = await graphCollection(`/sites/${encodePathComponent(siteId)}/drives`);
  const validDrives = drives.filter((drive: any) => typeof drive?.id === 'string');
  if (validDrives.length === 0) throw new Error('No se encontraron drives en el site');
  if (validDrives.length === 1) return validDrives[0].id;

  const recognisedNames = new Set(['documentos', 'documents', 'shared documents']);
  const preferred = validDrives.filter((drive: any) => recognisedNames.has(String(drive.name || '').trim().toLowerCase()));
  if (preferred.length !== 1) {
    throw new Error('No se pudo seleccionar una biblioteca inequívoca; configure SHAREPOINT_DRIVE_ID');
  }
  return preferred[0].id;
}

/**
 * Lists every page in the requested folder and, when recursive, every page in
 * each descendant. For recursive=false it deliberately returns root files and
 * folders only; callers can decide whether/how to enumerate folders.
 *
 * Every returned item receives relativeFolderPath (the actual containing
 * folder relative to the drive root), folderPath (an explicit alias), and
 * fullPath (the actual drive-root-relative file/folder path). Recursive
 * results contain files only, matching the historical contract.
 */
export async function listFolderContents(driveId: string, folderPath: string, recursive = true): Promise<GraphItemWithPath[]> {
  const rootPath = normalizeFolderPath(folderPath);
  const seenItemIds = new Set<string>();

  async function visit(currentFolderPath: string): Promise<GraphItemWithPath[]> {
    const pageItems = await graphCollection(collectionPath(driveId, currentFolderPath));
    const items = pageItems.map((item: any) => {
      const withPath = attachPathMetadata(item, currentFolderPath);
      if (seenItemIds.has(withPath.id)) {
        throw new Error('ID de elemento de Graph repetido; inventario incompleto rechazado');
      }
      seenItemIds.add(withPath.id);
      return withPath;
    });

    if (!recursive) return items;

    const files: GraphItemWithPath[] = [];
    for (const item of items) {
      if (item.folder) {
        // Do not catch child errors: returning the parent files would be a
        // silently partial inventory.
        files.push(...await visit(childFolderPath(currentFolderPath, item.name)));
      } else {
        files.push(item);
      }
    }
    return files;
  }

  return visit(rootPath);
}

/**
 * Strict B1 resolver. New invoice work must use configured IDs and validates
 * that the configured drive is scoped to the configured site and has a 2026
 * invoice root. It intentionally has no discovery or first-result fallback.
 */
export async function resolveInvoiceLibrary(): Promise<InvoiceLibrary> {
  const siteId = requiredConfiguredId('SHAREPOINT_SITE_ID', getConfiguredSiteId());
  const driveId = requiredConfiguredId('SHAREPOINT_DRIVE_ID o DRIVE_ID', getConfiguredDriveId());

  const site = await graphFetch(`/sites/${encodePathComponent(siteId)}`);
  if (!site?.id || String(site.id) !== siteId) {
    throw new Error('El site configurado de SharePoint no es válido');
  }

  // This site-scoped endpoint is the association check; a generic /drives/{id}
  // lookup alone would accept a drive belonging to a different site.
  const drive = await graphFetch(`/sites/${encodePathComponent(siteId)}/drives/${encodePathComponent(driveId)}`);
  if (!drive?.id || String(drive.id) !== driveId) {
    throw new Error('El drive configurado no pertenece al site configurado');
  }
  if (drive.parentReference?.siteId && String(drive.parentReference.siteId) !== siteId) {
    throw new Error('El drive configurado no pertenece al site configurado');
  }

  const root = await graphFetch(itemPath(driveId, FACTURAS_BASE_PATH));
  if (!root?.id || !root?.folder) {
    throw new Error('No existe la carpeta raíz 2026 de facturas en la biblioteca configurada');
  }

  return {
    siteId,
    siteName: site.displayName || site.name || siteId,
    driveId,
    driveName: drive.name || driveId,
    rootPath: FACTURAS_BASE_PATH,
    rootFolderId: root.id,
  };
}

/**
 * Obtiene el contenido (bytes) de un archivo. Graph may redirect to a
 * pre-authorized download URL; that follow-up never receives the bearer token.
 */
export async function downloadFile(driveId: string, itemId: string): Promise<Buffer> {
  const graphUrl = graphUrlFromPath(`/drives/${encodePathComponent(driveId)}/items/${encodePathComponent(itemId)}/content`);
  const token = await getAccessToken();
  const response = await fetch(graphUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  });

  let downloadResponse = response;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirección de descarga de Graph inválida');

    let downloadUrl: URL;
    try {
      downloadUrl = new URL(location, graphUrl);
    } catch {
      throw new Error('Redirección de descarga de Graph inválida');
    }
    if (downloadUrl.protocol !== 'https:' || downloadUrl.username || downloadUrl.password) {
      throw new Error('Redirección de descarga de Graph no permitida');
    }

    // Deliberately no Authorization header outside the original Graph request.
    downloadResponse = await fetch(downloadUrl.toString(), { redirect: 'error' });
  }

  if (!downloadResponse.ok) {
    throw new Error(`Error descargando archivo (${downloadResponse.status})`);
  }

  return Buffer.from(await downloadResponse.arrayBuffer());
}

/** Moves are disabled outright in the staging sandbox to protect real PDFs. */
export async function moveFile(driveId: string, itemId: string, destinationFolderId: string, newName?: string): Promise<any> {
  if (process.env.FINANCE_STAGING_SANDBOX === '1') {
    throw new Error('Los movimientos de archivos están deshabilitados en el sandbox de Finanzas');
  }

  const body: any = { parentReference: { id: destinationFolderId } };
  if (newName) body.name = newName;
  return graphFetch(`/drives/${encodePathComponent(driveId)}/items/${encodePathComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** Obtiene el ID de una carpeta por su path. */
export async function getFolderByPath(driveId: string, folderPath: string): Promise<{ id: string; name: string }> {
  const result = await graphFetch(itemPath(driveId, folderPath));
  return { id: result.id, name: result.name };
}

/** Determina en qué trimestre cae una fecha. */
export function getTrimestreCarpeta(fecha: Date): string {
  const mes = fecha.getMonth() + 1;
  if (mes <= 3) return CARPETAS.TRIMESTRE_1;
  if (mes <= 6) return CARPETAS.TRIMESTRE_2;
  if (mes <= 9) return CARPETAS.TRIMESTRE_3;
  return CARPETAS.TRIMESTRE_4;
}

/**
 * Sincroniza una carpeta: lista archivos PDF/imagen y devuelve los que no están
 * en BD. No realiza ninguna consulta ni escritura de BD por sí misma.
 */
export async function sincronizarCarpeta(
  driveId: string,
  carpeta: string,
  archivosYaImportados: Set<string>,
): Promise<Array<{ id: string; name: string; size: number; lastModified: string; webUrl: string; relativeFolderPath: string; folderPath: string; fullPath: string }>> {
  const fullPath = `${FACTURAS_BASE_PATH}/${carpeta}`;
  const items = await listFolderContents(driveId, fullPath);

  const archivosFactura = items.filter((item: any) => {
    const ext = item.name.toLowerCase().split('.').pop();
    return ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext || '');
  });

  return archivosFactura
    .filter((item: any) => !archivosYaImportados.has(item.id))
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      webUrl: item.webUrl || '',
      relativeFolderPath: item.relativeFolderPath,
      folderPath: item.folderPath,
      fullPath: item.fullPath,
    }));
}
