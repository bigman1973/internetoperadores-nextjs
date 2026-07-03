import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { uploadTicketToOneDrive } from '@/lib/finanzas/onedrive-tickets';

export const maxDuration = 60;

/**
 * POST /api/admin/finanzas/tickets/upload
 * Subir un ticket (imagen o PDF) y crear el registro de gasto
 * El archivo se sube a OneDrive/SharePoint
 * Acepta FormData con:
 * - file: archivo (imagen/PDF)
 * - empleado: nombre del empleado (opcional)
 * - empleadoId: ID del empleado (opcional)
 * - concepto: descripción breve (opcional, se puede rellenar con OCR)
 * - importe: importe si se conoce (opcional)
 * - fecha: fecha si se conoce (opcional)
 * - tipo: categoría del gasto (opcional)
 * - tarjeta: tarjeta usada (opcional)
 * - clienteNombre: cliente al que pertenece (opcional)
 * - proyecto: proyecto (opcional)
 * - metodoPago: TARJETA_EMPRESA o DINERO_PROPIO (opcional)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado archivo' }, { status: 400 });
    }

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Tipo de archivo no soportado. Use: JPG, PNG, WebP, HEIC o PDF' 
      }, { status: 400 });
    }

    // Convertir archivo a Buffer para subir a OneDrive
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Extraer datos del FormData
    const empleado = formData.get('empleado') as string || null;
    const empleadoId = formData.get('empleadoId') as string || null;
    const concepto = formData.get('concepto') as string || file.name;
    const importe = formData.get('importe') as string;
    const fecha = formData.get('fecha') as string;
    const tipo = formData.get('tipo') as string || 'GASTO_GENERAL';
    const tarjeta = formData.get('tarjeta') as string || null;
    const clienteNombre = formData.get('clienteNombre') as string || null;
    const proyecto = formData.get('proyecto') as string || null;
    const metodoPago = formData.get('metodoPago') as string || 'TARJETA_EMPRESA';

    const fechaTicket = fecha ? new Date(fecha) : new Date();

    // Subir a OneDrive/SharePoint
    let archivoUrl = '';
    let oneDriveItemId = '';

    try {
      const uploadResult = await uploadTicketToOneDrive(
        fileBuffer,
        file.name,
        file.type,
        fechaTicket,
        empleado || 'admin'
      );
      archivoUrl = uploadResult.webUrl || uploadResult.url;
      oneDriveItemId = uploadResult.itemId;
    } catch (uploadError: any) {
      console.error('Error subiendo a OneDrive:', uploadError);
      return NextResponse.json({
        error: `Error subiendo archivo a OneDrive: ${uploadError.message}`
      }, { status: 500 });
    }

    // Crear el registro de gasto
    const gasto = await prisma.gasto.create({
      data: {
        concepto: concepto || 'Ticket pendiente de OCR',
        importe: importe ? parseFloat(importe) : 0,
        fecha: fechaTicket,
        tipo: tipo as any,
        empleado,
        empleadoId,
        tarjeta,
        clienteNombre,
        proyecto,
        metodoPago: metodoPago as any,
        archivoUrl,
        archivoNombre: file.name,
        oneDriveItemId: oneDriveItemId || null,
        ocrCompletado: false,
        deducibleIS: true,
      },
    });

    return NextResponse.json({
      success: true,
      gasto: {
        id: gasto.id,
        archivoUrl,
        archivoNombre: file.name,
        oneDriveItemId,
      },
    });
  } catch (error: any) {
    console.error('Error upload ticket:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
