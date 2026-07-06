import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { uploadTicketToOneDrive } from '@/lib/finanzas/onedrive-tickets';

export const maxDuration = 60;

// Roles y emails que pueden ver todos los tickets
const ROLES_SUPERVISOR = ['SUPER_ADMIN', 'GERENTE'];
const EMAILS_APROBADOR = [
  'victor@lfgd.es',
  'jordi@farmsplanet.es',
  'lorena.gimeno@internetoperadores.com',
  'david.perez@internetoperadores.com',
];

function esSupervisor(email: string, role: string): boolean {
  return ROLES_SUPERVISOR.includes(role) || EMAILS_APROBADOR.includes(email.toLowerCase());
}

/**
 * GET /api/empleado/gastos
 * Listar gastos: SUPER_ADMIN/aprobadores ven todos, empleados solo los suyos
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
    const filtroEmpleado = searchParams.get('empleado') || '';

    const verTodos = esSupervisor(session.user.email, session.user.role || '');

    // Si es supervisor, ve todos (o filtra por empleado). Si no, solo los suyos.
    const where: any = {};
    if (!verTodos) {
      where.empleadoId = session.user.email;
    } else if (filtroEmpleado) {
      where.empleadoId = filtroEmpleado;
    }

    const [gastos, total] = await Promise.all([
      prisma.gasto.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.gasto.count({ where }),
    ]);

    return NextResponse.json({ gastos, total, page, totalPages: Math.ceil(total / limit), verTodos });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/empleado/gastos
 * Subir un nuevo ticket de gasto (FormData)
 * Campos: file, clienteNombre, proyecto, metodoPago, concepto (opcional)
 * El archivo se sube a OneDrive/SharePoint en la carpeta del trimestre correspondiente
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

    // Convertir archivo a Buffer para subir a OneDrive
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const fecha = new Date();

    // Subir a OneDrive/SharePoint (carpeta del trimestre correspondiente)
    let archivoUrl = '';
    let oneDriveItemId = '';

    try {
      const uploadResult = await uploadTicketToOneDrive(
        fileBuffer,
        file.name,
        file.type,
        fecha,
        session.user.name || session.user.email.split('@')[0]
      );
      archivoUrl = uploadResult.webUrl || uploadResult.url;
      oneDriveItemId = uploadResult.itemId;
    } catch (uploadError: any) {
      console.error('Error subiendo a OneDrive:', uploadError);
      return NextResponse.json({
        error: `Error subiendo archivo a OneDrive: ${uploadError.message}. Verifique la configuración de Microsoft Graph.`
      }, { status: 500 });
    }

    // Crear el registro de gasto con estado PENDIENTE_APROBACION
    const gasto = await prisma.gasto.create({
      data: {
        concepto: concepto || file.name,
        importe: 0, // Se rellenará con OCR
        fecha,
        tipo: 'GASTO_GENERAL',
        empleado: session.user.name || session.user.email,
        empleadoId: session.user.email,
        clienteNombre,
        proyecto: proyecto || null,
        metodoPago: metodoPago as any,
        archivoUrl,
        archivoNombre: file.name,
        ocrCompletado: false,
        estado: 'PENDIENTE_APROBACION',
        deducibleIS: true,
        oneDriveItemId: oneDriveItemId || null,
      },
    });

    // Lanzar OCR automáticamente (necesita la URL del archivo para descargar)
    let ocrResult = null;
    if (archivoUrl) {
      try {
        const ocrRes = await fetch(`${process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'}/api/admin/finanzas/tickets/${gasto.id}/ocr`, {
          method: 'POST',
        });
        ocrResult = await ocrRes.json();
      } catch (e) {
        // OCR puede fallar, no bloquea la subida
        console.error('OCR error (no bloqueante):', e);
      }
    }

    return NextResponse.json({
      success: true,
      gasto: {
        id: gasto.id,
        archivoUrl,
        estado: 'PENDIENTE_APROBACION',
        oneDriveItemId,
      },
      ocr: ocrResult,
    });
  } catch (error: any) {
    console.error('Error subiendo ticket empleado:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
