import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken, findSharePointSite, getSiteDrive } from '@/lib/finanzas/microsoft-graph';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'ID no proporcionado' }, { status: 400 });
    }

    const factura = await prisma.facturaRecibida.findUnique({
      where: { id },
      select: { oneDriveItemId: true, archivoOneDrive: true, archivoUrl: true },
    });

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    // Si tiene URL directa (almacenamiento propio)
    if (factura.archivoUrl) {
      return NextResponse.redirect(factura.archivoUrl);
    }

    const token = await getAccessToken();

    // Opción 1: Tiene oneDriveItemId (acceso directo por ID)
    if (factura.oneDriveItemId) {
      const driveId = process.env.SHAREPOINT_DRIVE_ID;
      
      if (!driveId) {
        const { siteId } = await findSharePointSite();
        const dynamicDriveId = await getSiteDrive(siteId);
        return await fetchAndReturnFile(token, dynamicDriveId, factura.oneDriveItemId, factura.archivoOneDrive);
      }

      return await fetchAndReturnFile(token, driveId, factura.oneDriveItemId, factura.archivoOneDrive);
    }

    // Opción 2: Solo tiene ruta en OneDrive (buscar por path)
    if (factura.archivoOneDrive) {
      const { siteId } = await findSharePointSite();
      const driveId = await getSiteDrive(siteId);

      const encodedPath = factura.archivoOneDrive
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');

      const metaRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!metaRes.ok) {
        const errorText = await metaRes.text();
        console.error('Error obteniendo archivo de OneDrive por ruta:', metaRes.status, errorText);
        return NextResponse.json(
          { error: `No se pudo obtener el archivo de OneDrive (${metaRes.status})` },
          { status: 502 }
        );
      }

      const meta = await metaRes.json();
      
      if (meta.id) {
        await prisma.facturaRecibida.update({
          where: { id },
          data: { oneDriveItemId: meta.id },
        }).catch(() => {});
      }

      const downloadUrl = meta['@microsoft.graph.downloadUrl'];
      if (downloadUrl) {
        const fileRes = await fetch(downloadUrl);
        const buffer = await fileRes.arrayBuffer();
        const fileName = factura.archivoOneDrive.split('/').pop() || 'documento';
        const contentType = getContentType(fileName);

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': contentType === 'application/pdf' 
              ? `inline; filename="${fileName}"` 
              : `attachment; filename="${fileName}"`,
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }

      return NextResponse.json({ error: 'No se pudo obtener URL de descarga' }, { status: 502 });
    }

    return NextResponse.json({ error: 'Esta factura no tiene archivo asociado' }, { status: 404 });
  } catch (error: any) {
    console.error('Error descargando PDF:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Helper: obtiene el archivo por itemId y lo devuelve con el Content-Type correcto
 */
async function fetchAndReturnFile(token: string, driveId: string, itemId: string, fileName: string | null) {
  const metaRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=@microsoft.graph.downloadUrl,name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!metaRes.ok) {
    return NextResponse.json({ error: 'Error al obtener archivo de OneDrive' }, { status: 502 });
  }

  const meta = await metaRes.json();
  const downloadUrl = meta['@microsoft.graph.downloadUrl'];

  if (!downloadUrl) {
    return NextResponse.json({ error: 'No se pudo obtener URL de descarga' }, { status: 502 });
  }

  const fileRes = await fetch(downloadUrl);
  const buffer = await fileRes.arrayBuffer();
  const name = meta.name || fileName?.split('/').pop() || 'documento';
  const contentType = getContentType(name);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentType === 'application/pdf'
        ? `inline; filename="${name}"`
        : `attachment; filename="${name}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

/**
 * Determina el Content-Type según la extensión del archivo
 */
function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}
