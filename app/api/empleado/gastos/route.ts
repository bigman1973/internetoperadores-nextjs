import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { put } from '@vercel/blob';

export const maxDuration = 30;

/**
 * GET /api/empleado/gastos
 * Listar los gastos del empleado autenticado
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const [gastos, total] = await Promise.all([
      prisma.gasto.findMany({
        where: { empleadoId: session.user.email },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.gasto.count({
        where: { empleadoId: session.user.email },
      }),
    ]);

    return NextResponse.json({ gastos, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/empleado/gastos
 * Subir un nuevo ticket de gasto (FormData)
 * Campos: file, clienteNombre, proyecto, metodoPago, concepto (opcional)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clienteNombre = formData.get('clienteNombre') as string || null;
    const proyecto = formData.get('proyecto') as string || null;
    const metodoPago = formData.get('metodoPago') as string || 'TARJETA_EMPRESA';
    const concepto = formData.get('concepto') as string || '';

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

    if (!clienteNombre) {
      return NextResponse.json({ error: 'Debe seleccionar un cliente' }, { status: 400 });
    }

    // Subir a Vercel Blob
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const blobPath = `tickets-empleados/${session.user.email}/${timestamp}-${safeFileName}`;

    const blob = await put(blobPath, file, {
      access: 'public',
      addRandomSuffix: false,
    });

    // Crear el registro de gasto con estado PENDIENTE_APROBACION
    const gasto = await prisma.gasto.create({
      data: {
        concepto: concepto || file.name,
        importe: 0, // Se rellenará con OCR
        fecha: new Date(),
        tipo: 'GASTO_GENERAL',
        empleado: session.user.name || session.user.email,
        empleadoId: session.user.email,
        clienteNombre,
        proyecto: proyecto || null,
        metodoPago: metodoPago as any,
        archivoUrl: blob.url,
        archivoNombre: file.name,
        ocrCompletado: false,
        estado: 'PENDIENTE_APROBACION',
        deducibleIS: true,
      },
    });

    // Lanzar OCR automáticamente
    let ocrResult = null;
    try {
      const ocrRes = await fetch(`${process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'}/api/admin/finanzas/tickets/${gasto.id}/ocr`, {
        method: 'POST',
      });
      ocrResult = await ocrRes.json();
    } catch (e) {
      // OCR puede fallar, no bloquea la subida
      console.error('OCR error (no bloqueante):', e);
    }

    return NextResponse.json({
      success: true,
      gasto: {
        id: gasto.id,
        archivoUrl: blob.url,
        estado: 'PENDIENTE_APROBACION',
      },
      ocr: ocrResult,
    });
  } catch (error: any) {
    console.error('Error subiendo ticket empleado:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
