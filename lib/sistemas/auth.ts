import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Sistemas y servicios: SOLO el SUPER_ADMIN real, sin «Actuar como» y sin permisos granulares. */
export interface SistemasAuth { userId: number; nombre: string }
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: noStore }) });

export async function requireSistemasAuth(): Promise<SistemasAuth | { error: NextResponse }> {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== 'admin') return fail('Inicia sesión como administrador.', 401);
  if (session.impersonation) return fail('Sal de «Actuar como» para usar Sistemas y servicios.', 403);
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return fail('No autorizado.', 401);
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { rol: true, activo: true, nombre: true } });
  if (!admin?.activo) return fail('No autorizado.', 403);
  if (admin.rol !== 'SUPER_ADMIN') return fail('Solo el superadmin puede ver Sistemas y servicios.', 403);
  return { userId, nombre: admin.nombre ?? '' };
}

export async function requireSistemasPage(): Promise<SistemasAuth> {
  const auth = await requireSistemasAuth();
  if ('error' in auth) redirect(auth.error.status === 401 ? '/login' : '/admin');
  return auth;
}
