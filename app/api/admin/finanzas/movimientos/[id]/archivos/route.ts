import {bibliotecaFinancieraConfigurada} from '@/lib/finanzas/archivo-fuente-controlada';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import {
  listarArchivosPrivadosMovimiento,
  MovimientoArchivosError,
  resolverArchivoPrivadoMovimiento,
} from '@/lib/finanzas/movimiento-archivos-privados';
import { DescargaPrivadaGraphError, descargarGraphPrivadoAcotado } from '@/lib/finanzas/descarga-privada-graph';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 12 * 1024 * 1024;

function safeFilename(value: string): string {
  const safe = value.replace(/[\r\n"\\/]/g, ' ').trim().slice(0, 180);
  return safe || 'archivo';
}
function errorResponse(error: unknown) {
  if (error instanceof MovimientoArchivosError) return privateJson({ error: error.message, codigo: error.code }, error.status);
  if (error instanceof DescargaPrivadaGraphError) {
    if (error.code === 'ARCHIVO_FUERA_DE_LIMITE') return privateJson({ error: 'El archivo supera el límite privado de 12 MiB.', codigo: error.code }, 413);
    return privateJson({ error: 'No se pudo recuperar el archivo privado.', codigo: error.code }, 502);
  }
  return privateJson({ error: 'No se pudo leer el soporte del movimiento.', codigo: 'LECTURA_ARCHIVO_FALLIDA' }, 500);
}

/**
 * GET /api/admin/finanzas/movimientos/:id/archivos
 * GET /api/admin/finanzas/movimientos/:id/archivos?archivoId=<opaco>
 *
 * Ambos caminos verifican permiso B4 vivo. La descarga no acepta URL/drive/item
 * del navegador y recomputa la pertenencia del archivo al movimiento.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions));
    if ('response' in access) return access.response;
    const { id: movimientoId } = await context.params;
    const archivoId = req.nextUrl.searchParams.get('archivoId');
    if (!archivoId) return privateJson(await listarArchivosPrivadosMovimiento(movimientoId));

    const file = await resolverArchivoPrivadoMovimiento(movimientoId, archivoId);
    let bytes: Buffer;
    if (file.locator.tipo === 'AAPP_BASE64') {
      bytes = Buffer.from(file.locator.contenidoBase64, 'base64');
      if (bytes.length === 0 || bytes.length > MAX_BYTES) return privateJson({ error: 'El archivo AAPP supera el límite privado de 12 MiB.', codigo: 'ARCHIVO_FUERA_DE_LIMITE' }, 413);
    } else if (file.locator.tipo === 'DRIVE_CONFIGURADO') {
      // Nómina y ticket no envían drive al navegador. Sólo se usa el drive
      // configurado en servidor y el mismo descargador con redirect acotado.
      const driveId = bibliotecaFinancieraConfigurada();
      if (!driveId) return privateJson({ error: 'No está configurado el drive privado de Finanzas.', codigo: 'DRIVE_PRIVADO_NO_CONFIGURADO' }, 503);
      bytes = await descargarGraphPrivadoAcotado(driveId, file.locator.itemId, MAX_BYTES);
    } else {
      bytes = await descargarGraphPrivadoAcotado(file.locator.driveId, file.locator.itemId, MAX_BYTES);
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(file.nombre))}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() { return privateJson({ error: 'Método no permitido.' }, 405); }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405); }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405); }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405); }
