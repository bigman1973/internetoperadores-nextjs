import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { put } from '@vercel/blob';

export const maxDuration = 30;

/**
 * POST /api/admin/finanzas/tickets/upload
 * Subir un ticket (imagen o PDF) y crear el registro de gasto
 * Acepta FormData con:
 * - file: archivo (imagen/PDF)
 * - empleado: nombre del empleado (opcional)
 * - empleadoId: ID del empleado (opcional)
 * - concepto: descripción breve (opcional, se puede rellenar con OCR)
 * - importe: importe si se conoce (opcional)
 * - fecha: fecha si se conoce (opcional)
 * - tipo: categoría del gasto (opcional)
 * - tarjeta: tarjeta usada (opcional)
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

    // Subir a Vercel Blob
    const timestamp = Date.now();
    const fileName = `tickets/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    const blob = await put(fileName, file, {
      access: 'public',
      addRandomSuffix: false,
    });

    // Extraer datos del FormData
    const empleado = formData.get('empleado') as string || null;
    const empleadoId = formData.get('empleadoId') as string || null;
    const concepto = formData.get('concepto') as string || file.name;
    const importe = formData.get('importe') as string;
    const fecha = formData.get('fecha') as string;
    const tipo = formData.get('tipo') as string || 'GASTO_GENERAL';
    const tarjeta = formData.get('tarjeta') as string || null;

    // Crear el registro de gasto
    const gasto = await prisma.gasto.create({
      data: {
        concepto: concepto || 'Ticket pendiente de OCR',
        importe: importe ? parseFloat(importe) : 0,
        fecha: fecha ? new Date(fecha) : new Date(),
        tipo: tipo as any,
        empleado,
        empleadoId,
        tarjeta,
        archivoUrl: blob.url,
        archivoNombre: file.name,
        ocrCompletado: false,
        deducibleIS: true,
      },
    });

    return NextResponse.json({
      success: true,
      gasto: {
        id: gasto.id,
        archivoUrl: blob.url,
        archivoNombre: file.name,
      },
    });
  } catch (error: any) {
    console.error('Error upload ticket:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
