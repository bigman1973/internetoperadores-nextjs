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
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const email = session.user.email.toLowerCase();
  const esSuperAdmin = email === SUPER_ADMIN_EMAIL;
  const esAprobador = APROBADORES.includes(email);

  if (!esSuperAdmin && !esAprobador) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const usuarios = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ usuarios });
}
