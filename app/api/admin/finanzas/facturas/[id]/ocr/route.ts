import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken, downloadFile } from '@/lib/finanzas/microsoft-graph';
import { extraerDatosFactura, pdfToBase64Images } from '@/lib/finanzas/ocr-facturas';

/**
 * POST /api/admin/finanzas/facturas/[id]/ocr
 * Reintentar OCR para una factura individual
 * Descarga el PDF de OneDrive, lo procesa con GPT-4o y actualiza los datos
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Obtener la factura
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id },
    });

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    if (!factura.oneDriveItemId) {
      return NextResponse.json({ error: 'Esta factura no tiene archivo en OneDrive' }, { status: 400 });
    }

    // Descargar el archivo de OneDrive
    const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID;
    if (!DRIVE_ID) {
      return NextResponse.json({ error: 'SHAREPOINT_DRIVE_ID no configurado' }, { status: 500 });
    }

    await getAccessToken(); // Asegurar que tenemos token
    const fileBuffer = await downloadFile(DRIVE_ID, factura.oneDriveItemId);

    // Convertir PDF a imágenes (hasta 5 páginas para facturas con muchas líneas)
    const fileName = factura.archivoOneDrive || '';
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    
    let images: string[];
    let mimeType: string;

    if (isPdf) {
      images = await pdfToBase64Images(fileBuffer, 5);
      mimeType = 'image/png';
    } else {
      images = [fileBuffer.toString('base64')];
      const ext = fileName.split('.').pop()?.toLowerCase();
      mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    }

    if (images.length === 0) {
      return NextResponse.json({ error: 'No se pudo convertir el archivo a imagen' }, { status: 500 });
    }

    // Ejecutar OCR con GPT-4o (todas las páginas)
    const datos = await extraerDatosFactura(images, mimeType, fileName);

    // Buscar coincidencias de clientes en las líneas de detalle
    let lineasConClientes = datos.lineas || [];
    if (lineasConClientes.length > 0) {
      lineasConClientes = await enriquecerLineasConClientes(lineasConClientes);
    }

    // Actualizar la factura en BD
    await prisma.facturaRecibida.update({
      where: { id },
      data: {
        proveedor: datos.proveedor !== 'DESCONOCIDO' ? datos.proveedor : factura.proveedor,
        cif: datos.cif || factura.cif,
        numFactura: datos.numFactura || factura.numFactura,
        fecha: datos.fecha ? new Date(datos.fecha) : factura.fecha,
        base: datos.base || 0,
        tipoIva: datos.tipoIva || 21,
        importeIva: datos.importeIva || 0,
        tipoIrpf: datos.tipoIrpf || 0,
        importeIrpf: datos.importeIrpf || 0,
        total: datos.total || 0,
        concepto: datos.concepto || factura.concepto,
        ocrCompletado: datos.confianza > 0.3,
        ocrConfianza: datos.confianza,
        datosOcrRaw: JSON.stringify(datos),
        lineasDetalle: lineasConClientes.length > 0 ? JSON.stringify(lineasConClientes) : null,
      },
    });

    return NextResponse.json({
      success: true,
      datos: {
        proveedor: datos.proveedor,
        cif: datos.cif,
        numFactura: datos.numFactura,
        fecha: datos.fecha,
        total: datos.total,
        confianza: datos.confianza,
        numLineas: lineasConClientes.length,
        lineas: lineasConClientes,
      },
    });
  } catch (error: any) {
    console.error('Error reintentando OCR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Enriquece las líneas de detalle buscando coincidencias con clientes en la BD
 */
async function enriquecerLineasConClientes(lineas: any[]): Promise<any[]> {
  // Obtener todos los clientes activos para matching
  const clientes = await prisma.clienteWeb.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, nombreComercial: true, codigo: true },
    take: 1000,
  });

  return lineas.map(linea => {
    if (linea.cliente) {
      // Intentar hacer match con un cliente de la BD
      const clienteMatch = clientes.find(c => {
        const nombreLower = (linea.cliente || '').toLowerCase();
        return (
          c.nombre.toLowerCase().includes(nombreLower) ||
          nombreLower.includes(c.nombre.toLowerCase()) ||
          (c.nombreComercial && (
            c.nombreComercial.toLowerCase().includes(nombreLower) ||
            nombreLower.includes(c.nombreComercial.toLowerCase())
          ))
        );
      });

      if (clienteMatch) {
        return {
          ...linea,
          clienteId: clienteMatch.id,
          clienteNombreBd: clienteMatch.nombre,
          clienteMatch: true,
        };
      }
    }
    return { ...linea, clienteMatch: false };
  });
}
