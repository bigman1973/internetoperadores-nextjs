/**
 * OneDrive - Subida de Tickets de Gasto
 * 
 * Estructura en SharePoint:
 * IO: Accounting & Finances > Documentos > 2. Contabilidad y finanzas > 10. Tickets de gasto > 
 *   1. Tickets de gasto - Internet Operadores > 2026 >
 *     Trimestre 1 2026/
 *     Trimestre 2 2026/
 *     Trimestre 3 2026/
 *     Trimestre 4 2026/
 */

import { getAccessToken, findSharePointSite, getSiteDrive } from './microsoft-graph';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const TICKETS_BASE_PATH = '2. Contabilidad y finanzas/10. Tickets de gasto/1. Tickets de gasto - Internet Operadores/2026';

/**
 * Determina la carpeta de trimestre según la fecha
 */
function getTrimestreCarpeta(fecha: Date): string {
  const mes = fecha.getMonth() + 1;
  if (mes <= 3) return 'Trimestre 1 2026';
  if (mes <= 6) return 'Trimestre 2 2026';
  if (mes <= 9) return 'Trimestre 3 2026';
  return 'Trimestre 4 2026';
}

/**
 * Crea una carpeta en OneDrive si no existe
 */
async function ensureFolderExists(driveId: string, parentPath: string, folderName: string): Promise<string> {
  const token = await getAccessToken();
  const encodedPath = encodeURIComponent(parentPath).replace(/%2F/g, '/');
  
  // Intentar obtener la carpeta
  try {
    const checkRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(folderName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (checkRes.ok) {
      const folder = await checkRes.json();
      return folder.id;
    }
  } catch (e) {
    // No existe, la creamos
  }

  // Crear la carpeta
  const createRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/children`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });

  if (createRes.ok) {
    const folder = await createRes.json();
    return folder.id;
  }

  // Si falla por conflicto (ya existe), obtenerla
  if (createRes.status === 409) {
    const getRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(folderName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (getRes.ok) {
      const folder = await getRes.json();
      return folder.id;
    }
  }

  throw new Error(`No se pudo crear/obtener la carpeta ${folderName} en ${parentPath}`);
}

/**
 * Asegura que toda la estructura de carpetas existe:
 * 2. Contabilidad y finanzas/10. Tickets de gasto/1. Tickets de gasto - Internet Operadores/2026/Trimestre X 2026
 */
async function ensureTicketFolderStructure(driveId: string, fecha: Date): Promise<string> {
  // Verificar/crear cada nivel de la estructura
  const folders = [
    { parent: '2. Contabilidad y finanzas', name: '10. Tickets de gasto' },
    { parent: '2. Contabilidad y finanzas/10. Tickets de gasto', name: '1. Tickets de gasto - Internet Operadores' },
    { parent: '2. Contabilidad y finanzas/10. Tickets de gasto/1. Tickets de gasto - Internet Operadores', name: '2026' },
    { parent: TICKETS_BASE_PATH, name: getTrimestreCarpeta(fecha) },
  ];

  let folderId = '';
  for (const folder of folders) {
    folderId = await ensureFolderExists(driveId, folder.parent, folder.name);
  }
  
  return folderId; // Retorna el ID de la carpeta del trimestre
}

/**
 * Sube un archivo de ticket a OneDrive en la carpeta del trimestre correspondiente
 * 
 * @param fileBuffer - Buffer del archivo
 * @param fileName - Nombre original del archivo
 * @param mimeType - Tipo MIME del archivo
 * @param fecha - Fecha del ticket (para determinar trimestre)
 * @param empleadoNombre - Nombre del empleado (para el nombre del archivo)
 * @returns URL del archivo en SharePoint y el ID del item
 */
export async function uploadTicketToOneDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  fecha: Date,
  empleadoNombre?: string
): Promise<{ url: string; itemId: string; webUrl: string }> {
  // Obtener site y drive
  const site = await findSharePointSite();
  const driveId = await getSiteDrive(site.siteId);

  // Asegurar que la estructura de carpetas existe
  await ensureTicketFolderStructure(driveId, fecha);

  // Generar nombre de archivo único
  const timestamp = Date.now();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const prefix = empleadoNombre ? empleadoNombre.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) : 'ticket';
  const finalFileName = `${prefix}_${timestamp}_${safeFileName}`;

  // Determinar la ruta completa
  const trimestre = getTrimestreCarpeta(fecha);
  const uploadPath = `${TICKETS_BASE_PATH}/${trimestre}/${finalFileName}`;
  const encodedPath = encodeURIComponent(uploadPath).replace(/%2F/g, '/');

  const token = await getAccessToken();

  // Para archivos < 4MB, usar upload simple
  if (fileBuffer.length < 4 * 1024 * 1024) {
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/content`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
      },
      body: fileBuffer,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Error subiendo archivo a OneDrive: ${res.status} ${error}`);
    }

    const item = await res.json();
    return {
      url: item['@microsoft.graph.downloadUrl'] || item.webUrl,
      itemId: item.id,
      webUrl: item.webUrl || '',
    };
  }

  // Para archivos > 4MB, usar upload session
  const sessionRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/createUploadSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
      },
    }),
  });

  if (!sessionRes.ok) {
    const error = await sessionRes.text();
    throw new Error(`Error creando upload session: ${sessionRes.status} ${error}`);
  }

  const session = await sessionRes.json();
  const uploadUrl = session.uploadUrl;

  // Subir en chunks de 5MB
  const chunkSize = 5 * 1024 * 1024;
  let offset = 0;
  let result: any = null;

  while (offset < fileBuffer.length) {
    const end = Math.min(offset + chunkSize, fileBuffer.length);
    const chunk = fileBuffer.slice(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': chunk.length.toString(),
        'Content-Range': `bytes ${offset}-${end - 1}/${fileBuffer.length}`,
      },
      body: chunk,
    });

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      result = await chunkRes.json();
    } else if (chunkRes.status !== 202) {
      throw new Error(`Error en upload chunk: ${chunkRes.status}`);
    }

    offset = end;
  }

  if (!result) {
    throw new Error('Upload completado pero no se recibió respuesta final');
  }

  return {
    url: result['@microsoft.graph.downloadUrl'] || result.webUrl,
    itemId: result.id,
    webUrl: result.webUrl || '',
  };
}

/**
 * Obtiene la URL de descarga de un archivo de OneDrive por su itemId
 */
export async function getTicketDownloadUrl(itemId: string): Promise<string> {
  const site = await findSharePointSite();
  const driveId = await getSiteDrive(site.siteId);
  const token = await getAccessToken();

  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Error obteniendo archivo de OneDrive: ${res.status}`);
  }

  const item = await res.json();
  return item['@microsoft.graph.downloadUrl'] || item.webUrl;
}
