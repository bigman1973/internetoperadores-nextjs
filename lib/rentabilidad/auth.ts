import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertRentabilidadConfiguration } from './store';

/** This module is deliberately inoperative outside the isolated staging environment. */
export function rentabilidadAvailable() {
  try { assertRentabilidadConfiguration(); return process.env.RENTABILIDAD_ENABLED === '1'; } catch { return false; }
}
export async function requireRentabilidadAdmin(): Promise<{ session: any; userId: number } | { error: NextResponse }> {
  const response = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } }) });
  if (!rentabilidadAvailable()) return response('Rentabilidad no está habilitada en este entorno.', 404);
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== 'admin') return response('Inicia sesión como administrador.', 401);
  if (session.impersonation) return response('Sal de «Actuar como» para acceder a Rentabilidad.', 403);
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return response('No autorizado.', 401);
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { rol: true, roles: true, activo: true } });
  if (!admin?.activo || admin.rol !== 'SUPER_ADMIN') return response('Solo los superadmin pueden acceder a Rentabilidad.', 403);
  return { session, userId };
}
export async function requireRentabilidadPage() {
  const auth = await requireRentabilidadAdmin();
  if ('error' in auth) redirect(auth.error.status === 401 ? '/login' : '/admin');
  return auth;
}
