import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const proyectoId = searchParams.get('id');

    if (!proyectoId) {
      return NextResponse.json({ error: 'ID no proporcionado' }, { status: 400 });
    }

    const proyecto = await prisma.exagridProyecto.findUnique({
      where: { id: proyectoId },
      select: { archivoFactura: true, nombreProyecto: true },
    });

    if (!proyecto || !proyecto.archivoFactura) {
      return NextResponse.json({ error: 'PDF no encontrado' }, { status: 404 });
    }

    // Extraer el base64 del data URL
    const base64Match = proyecto.archivoFactura.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
      return NextResponse.json({ error: 'Formato de archivo invalido' }, { status: 500 });
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const filename = `Factura_${proyecto.nombreProyecto?.replace(/[^a-zA-Z0-9]/g, '_') || 'exagrid'}.pdf`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error sirviendo PDF Exagrid:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
