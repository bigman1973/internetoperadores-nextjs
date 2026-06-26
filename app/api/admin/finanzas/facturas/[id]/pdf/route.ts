import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/finanzas/microsoft-graph';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id: params.id },
      select: { oneDriveItemId: true, archivoOneDrive: true },
    });

    if (!factura || !factura.oneDriveItemId) {
      return NextResponse.json({ error: 'Factura no encontrada o sin archivo' }, { status: 404 });
    }

    const token = await getAccessToken();
    const driveId = process.env.SHAREPOINT_DRIVE_ID!;
    
    // Obtener URL de descarga del archivo
    const metaRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${factura.oneDriveItemId}?$select=@microsoft.graph.downloadUrl`,
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

    // Descargar el archivo
    const fileRes = await fetch(downloadUrl);
    const buffer = await fileRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${factura.archivoOneDrive || 'factura.pdf'}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Error descargando PDF:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
