import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Subida de precios: SUPER_ADMIN y GERENTE ven y editan; solo SUPER_ADMIN aprueba. El resto no tiene acceso. */
export type SubidaRol = 'SUPER_ADMIN' | 'GERENTE';
export interface SubidaAuth { userId: number; rol: SubidaRol; nombre: string; puedeAprobar: boolean }

const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: noStore }) });

export async function requireSubidaAuth(opts: { aprobar?: boolean } = {}): Promise<SubidaAuth | { error: NextResponse }> {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== 'admin') return fail('Inicia sesión como administrador.', 401);
  if (session.impersonation) return fail('Sal de «Actuar como» para usar Subida de precios.', 403);
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return fail('No autorizado.', 401);
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { rol: true, activo: true, nombre: true } });
  if (!admin?.activo) return fail('No autorizado.', 403);
  if (admin.rol !== 'SUPER_ADMIN' && admin.rol !== 'GERENTE') return fail('Solo superadmin y gerente pueden usar Subida de precios.', 403);
  if (opts.aprobar && admin.rol !== 'SUPER_ADMIN') return fail('Solo el superadmin puede aprobar una subida.', 403);
  return { userId, rol: admin.rol, nombre: admin.nombre ?? '', puedeAprobar: admin.rol === 'SUPER_ADMIN' };
}

export async function requireSubidaPage(): Promise<SubidaAuth> {
  const auth = await requireSubidaAuth();
  if ('error' in auth) redirect(auth.error.status === 401 ? '/login' : '/admin');
  return auth;
}
