import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAccessToken, downloadFile } from '@/lib/finanzas/microsoft-graph';
import { extraerDatosFactura } from '@/lib/finanzas/ocr-facturas';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/test-ocr
 * Endpoint de diagnóstico para verificar OCR completo
 * Ejecuta exactamente el mismo flujo que la ruta de OCR individual
 * ELIMINAR después de resolver el problema
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    steps: [] as string[],
  };

  try {
    // Use the Wildix March invoice specifically
    const facturaId = '226a5b7a-7897-4977-b10d-f8a0f0001242';
    
    diagnostics.steps.push('1. Finding invoice in DB...');
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id: facturaId },
    });
    
    if (!factura) {
      diagnostics.error = 'Invoice not found';
      return NextResponse.json(diagnostics);
    }
    
    diagnostics.archivoOneDrive = factura.archivoOneDrive;
    diagnostics.oneDriveItemId = factura.oneDriveItemId;
    diagnostics.steps.push(`2. Found: ${factura.archivoOneDrive}`);

    // Step 2: Download from OneDrive
    const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;
    diagnostics.steps.push('3. Getting access token...');
    await getAccessToken();
    diagnostics.steps.push('4. Downloading file from OneDrive...');
    
    const fileBuffer = await downloadFile(DRIVE_ID, factura.oneDriveItemId!);
    diagnostics.fileSize = fileBuffer.length;
    diagnostics.fileSizeKB = Math.round(fileBuffer.length / 1024);
    diagnostics.steps.push(`5. Downloaded: ${diagnostics.fileSizeKB} KB`);
    
    // Verify it's a valid PDF
    const header = fileBuffer.slice(0, 5).toString('utf8');
    diagnostics.isPdf = header === '%PDF-';
    diagnostics.steps.push(`6. File header: "${header}", isPdf: ${diagnostics.isPdf}`);

    // Step 3: Determine mime type (same logic as OCR route)
    const fileName = factura.archivoOneDrive || '';
    const ext = fileName.split('.').pop()?.toLowerCase();
    diagnostics.fileName = fileName;
    diagnostics.ext = ext;
    
    let fileBase64: string;
    let mimeType: string;

    if (ext === 'pdf') {
      fileBase64 = fileBuffer.toString('base64');
      mimeType = 'application/pdf';
    } else {
      fileBase64 = fileBuffer.toString('base64');
      mimeType = 'application/pdf';
    }
    
    diagnostics.mimeType = mimeType;
    diagnostics.base64Length = fileBase64.length;
    diagnostics.steps.push(`7. MIME: ${mimeType}, base64 length: ${fileBase64.length}`);

    // Step 4: Call extraerDatosFactura (same as OCR route)
    diagnostics.steps.push('8. Calling extraerDatosFactura...');
    const datos = await extraerDatosFactura(fileBase64, mimeType, fileName);
    
    diagnostics.steps.push('9. OCR completed!');
    diagnostics.ocrResult = {
      proveedor: datos.proveedor,
      cif: datos.cif,
      domicilioProveedor: datos.domicilioProveedor,
      numFactura: datos.numFactura,
      fecha: datos.fecha,
      base: datos.base,
      total: datos.total,
      confianza: datos.confianza,
      esInternacional: datos.esInternacional,
      paisOrigen: datos.paisOrigen,
      numLineas: datos.lineas?.length || 0,
      primerasLineas: datos.lineas?.slice(0, 3),
    };
    diagnostics.success = true;
    
  } catch (error: any) {
    diagnostics.error = error.message;
    diagnostics.errorName = error.name;
    diagnostics.errorStack = error.stack?.split('\n').slice(0, 8);
    diagnostics.success = false;
  }

  return NextResponse.json(diagnostics);
}
