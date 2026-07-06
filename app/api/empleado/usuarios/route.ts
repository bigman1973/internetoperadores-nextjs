import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const SUPER_ADMIN_EMAIL = 'victor@lfgd.es';
const APROBADORES = [
  'victor@lfgd.es',
  'jordi@farmsplanet.es',
  'lorena.gimeno@internetoperadores.com',
  'david.perez@internetoperadores.com',
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();
    const role = session.user.role || '';
    const esSuperAdmin = email === SUPER_ADMIN_EMAIL || role === 'SUPER_ADMIN';
    const esAprobador = APROBADORES.includes(email) || role === 'GERENTE';

    if (!esSuperAdmin && !esAprobador) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const usuariosAdmin = await prisma.usuarioAdmin.findMany({
      where: { activo: true },
      select: {
        id: true,
        email: true,
        nombre: true,
      },
      orderBy: { nombre: 'asc' },
    });

    // Mapear al formato esperado por el frontend
    const usuarios = usuariosAdmin.map(u => ({
      id: u.id.toString(),
      email: u.email,
      name: u.nombre,
    }));

    return NextResponse.json({ usuarios });
  } catch (error: any) {
    console.error('Error en /api/empleado/usuarios:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
