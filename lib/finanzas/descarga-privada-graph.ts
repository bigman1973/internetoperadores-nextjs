/* Descarga Graph privada y acotada.
 *
 * Los IDs proceden de una lista ya autorizada en BD. Esta función nunca recibe
 * una URL de navegador, nunca devuelve una URL y no reenvía Authorization tras
 * una redirección de descarga preautorizada.
 */
import { getAccessToken } from '@/lib/finanzas/microsoft-graph';

const ID = /^[A-Za-z0-9!_.~-]{4,220}$/;
const GRAPH_HOST = 'graph.microsoft.com';
const PROVIDER_SUFFIXES = [
  '.sharepoint.com',
  '.1drv.com',
  '.files.1drv.com',
  '.blob.core.windows.net',
  '.microsoft.com',
] as const;

export class DescargaPrivadaGraphError extends Error {
  constructor(public readonly code: string) { super(code); }
}

function graphContentUrl(driveId: string, itemId: string): URL {
  if (!ID.test(driveId) || !ID.test(itemId)) throw new DescargaPrivadaGraphError('IDENTIFICADOR_GRAPH_INVALIDO');
  return new URL(`https://${GRAPH_HOST}/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`);
}

function hostPermitido(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PROVIDER_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

function redireccionProveedorPermitida(url: URL): boolean {
  return url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.hash
    && hostPermitido(url.hostname);
}

async function bytesAcotados(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  const declaredNumber = declared === null ? null : Number(declared);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1
    || (declaredNumber !== null && (!Number.isSafeInteger(declaredNumber) || declaredNumber < 0 || declaredNumber > maxBytes))) {
    await response.body?.cancel();
    throw new DescargaPrivadaGraphError('ARCHIVO_FUERA_DE_LIMITE');
  }
  if (!response.body) throw new DescargaPrivadaGraphError('CUERPO_GRAPH_AUSENTE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new DescargaPrivadaGraphError('ARCHIVO_FUERA_DE_LIMITE');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new DescargaPrivadaGraphError('ARCHIVO_VACIO');
  return Buffer.concat(chunks, size);
}

/** Sólo se permite una redirección, desde Graph fijo a un host de proveedor conocido. */
export async function descargarGraphPrivadoAcotado(driveId: string, itemId: string, maxBytes = 12 * 1024 * 1024): Promise<Buffer> {
  const graph = graphContentUrl(driveId, itemId);
  const first = await fetch(graph, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  let response = first;
  if (first.status >= 300 && first.status < 400) {
    const location = first.headers.get('location');
    if (!location) throw new DescargaPrivadaGraphError('REDIRECT_GRAPH_INVALIDO');
    let redirected: URL;
    try { redirected = new URL(location, graph); } catch { throw new DescargaPrivadaGraphError('REDIRECT_GRAPH_INVALIDO'); }
    if (!redireccionProveedorPermitida(redirected)) throw new DescargaPrivadaGraphError('REDIRECT_GRAPH_NO_PERMITIDO');
    // Ninguna cabecera Authorization acompaña el enlace preautorizado del proveedor.
    response = await fetch(redirected, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  }
  if (!response.ok) throw new DescargaPrivadaGraphError('DESCARGA_GRAPH_FALLIDA');
  return bytesAcotados(response, maxBytes);
}
