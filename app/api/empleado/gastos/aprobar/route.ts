import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Emails que pueden aprobar (además de SUPER_ADMIN y GERENTE)
const EMAILS_APROBADOR = [
  'jordi@farmsplanet.es',
  'lorena.gimeno@internetoperadores.com',
  'david.perez@internetoperadores.com',
];

const ROLES_APROBADOR = ['SUPER_ADMIN', 'GERENTE'];

function esAprobador(email: string, role: string): boolean {
  return ROLES_APROBADOR.includes(role) || EMAILS_APROBADOR.includes(email.toLowerCase());
}

/**
 * GET /api/empleado/gastos/aprobar
 * Listar tickets pendientes de aprobación (solo para aprobadores)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (!esAprobador(session.user.email, session.user.role || '')) {
      return NextResponse.json({ error: 'No tiene permisos de aprobación' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado') || 'PENDIENTE_APROBACION';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (estado === 'todos') {
      where.estado = { in: ['PENDIENTE_APROBACION', 'APROBADO', 'RECHAZADO'] };
    } else {
      where.estado = estado;
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

    // Resumen
    const pendientes = await prisma.gasto.count({ where: { estado: 'PENDIENTE_APROBACION' } });
    const aprobados = await prisma.gasto.count({ where: { estado: 'APROBADO' } });
    const rechazados = await prisma.gasto.count({ where: { estado: 'RECHAZADO' } });

    return NextResponse.json({
      gastos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      resumen: { pendientes, aprobados, rechazados },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/empleado/gastos/aprobar
 * Aprobar o rechazar un ticket
 * Body: { gastoId, accion: 'aprobar' | 'rechazar', motivo?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (!esAprobador(session.user.email, session.user.role || '')) {
      return NextResponse.json({ error: 'No tiene permisos de aprobación' }, { status: 403 });
    }

    const body = await req.json();
    const { gastoId, accion, motivo } = body;

    if (!gastoId || !accion) {
      return NextResponse.json({ error: 'gastoId y accion son obligatorios' }, { status: 400 });
    }

    if (accion !== 'aprobar' && accion !== 'rechazar') {
      return NextResponse.json({ error: 'accion debe ser "aprobar" o "rechazar"' }, { status: 400 });
    }

    const gasto = await prisma.gasto.findUnique({ where: { id: gastoId } });
    if (!gasto) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    if (gasto.estado !== 'PENDIENTE_APROBACION') {
      return NextResponse.json({ error: 'Este ticket ya ha sido procesado' }, { status: 400 });
    }

    if (accion === 'aprobar') {
      await prisma.gasto.update({
        where: { id: gastoId },
        data: {
          estado: 'APROBADO',
          aprobadoPor: session.user.email,
          fechaAprobacion: new Date(),
        },
      });
    } else {
      if (!motivo) {
        return NextResponse.json({ error: 'Debe indicar un motivo de rechazo' }, { status: 400 });
      }
      await prisma.gasto.update({
        where: { id: gastoId },
        data: {
          estado: 'RECHAZADO',
          motivoRechazo: motivo,
          aprobadoPor: session.user.email,
          fechaAprobacion: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, accion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
