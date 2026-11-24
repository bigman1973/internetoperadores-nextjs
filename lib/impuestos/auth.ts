import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Impuestos: SUPER_ADMIN y GERENTE ven y editan; CONTABILIDAD (rol principal o en roles[]) solo ve.
 *  Presupuesto: SUPER_ADMIN y GERENTE editan; solo SUPER_ADMIN aprueba. El resto no tiene acceso. */
export interface FinAuth { userId: number; rol: string; nombre: string; puedeEditar: boolean; puedeAprobar: boolean; soloLectura: boolean }
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: noStore }) });

export { permisosFin, type Modulo } from './auth-permisos';
import { permisosFin, type Modulo } from './auth-permisos';

export async function requireFinAuth(modulo: Modulo, opts: { editar?: boolean; aprobar?: boolean } = {}): Promise<FinAuth | { error: NextResponse }> {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== 'admin') return fail('Inicia sesión como administrador.', 401);
  if (session.impersonation) return fail('Sal de «Actuar como» para usar Impuestos y Presupuesto.', 403);
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return fail('No autorizado.', 401);
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { rol: true, roles: true, activo: true, nombre: true } });
  if (!admin?.activo) return fail('No autorizado.', 403);
  const p = permisosFin(modulo, String(admin.rol), admin.roles as any);
  if (!p.acceso) return fail(modulo === 'impuestos' ? 'Solo superadmin, gerente y contabilidad pueden ver Impuestos.' : 'Solo superadmin y gerente pueden usar el Presupuesto.', 403);
  if (opts.editar && !p.puedeEditar) return fail('Tu perfil solo puede consultar.', 403);
  if (opts.aprobar && !p.puedeAprobar) return fail('Solo el superadmin puede aprobar el presupuesto.', 403);
  return { userId, rol: String(admin.rol), nombre: admin.nombre ?? '', ...p };
}
export async function requireFinPage(modulo: Modulo): Promise<FinAuth> {
  const auth = await requireFinAuth(modulo);
  if ('error' in auth) redirect(auth.error.status === 401 ? '/login' : '/admin');
  return auth;
}
