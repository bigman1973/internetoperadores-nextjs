import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Roles que pueden impersonar a otros empleados
const ROLES_ADMIN = ['SUPER_ADMIN', 'GERENTE'];
const EMAILS_ADMIN = [
  'victor@lfgd.es',
  'jordi@farmsplanet.es',
  'lorena.gimeno@internetoperadores.com',
  'david.perez@internetoperadores.com',
];

/**
 * Determina si el usuario actual puede impersonar a otros empleados
 */
export function canImpersonate(email: string, role: string): boolean {
  return ROLES_ADMIN.includes(role) || EMAILS_ADMIN.includes(email.toLowerCase());
}

/**
 * Resuelve el empleado efectivo: si el usuario es admin y pasa ?as=email,
 * devuelve ese empleado. Si no, devuelve el empleado del usuario autenticado.
 * 
 * Returns: { empleado, isImpersonating, error? }
 */
export async function resolveEmpleado(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { empleado: null, isImpersonating: false, error: 'No autenticado', status: 401 };
  }

  const { searchParams } = new URL(req.url);
  const asEmail = searchParams.get('as');

  const userEmail = session.user.email.toLowerCase();
  const userRole = session.user.role || '';
  const isAdmin = canImpersonate(userEmail, userRole);

  let targetEmail = userEmail;
  let isImpersonating = false;

  if (asEmail && isAdmin) {
    targetEmail = asEmail.toLowerCase();
    isImpersonating = targetEmail !== userEmail;
  }

  const empleado = await prisma.empleado.findFirst({
    where: { email: targetEmail },
  });

  if (!empleado) {
    return {
      empleado: null,
      isImpersonating,
      error: isImpersonating
        ? `No se encontró el empleado con email ${targetEmail}`
        : 'No se encontró tu perfil de empleado. Contacta con administración.',
      status: 404,
    };
  }

  return { empleado, isImpersonating, isAdmin, error: null, status: 200 };
}
