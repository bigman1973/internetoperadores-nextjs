import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertRentabilidadConfiguration, assertRentabilidadReadConfiguration, assertRentabilidadReadIdentity } from './store';

/** Staging retains its strict guard; production admits only explicit prepared reads. */
export function rentabilidadAvailable() {
  try { assertRentabilidadReadConfiguration(); return process.env.RENTABILIDAD_ENABLED === '1'; } catch { return false; }
}
export async function requireRentabilidadAdmin(options: { write?: boolean } = {}): Promise<{ session: any; userId: number; readOnly: boolean } | { error: NextResponse }> {
  const response = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } }) });
  if (!rentabilidadAvailable()) return response('Rentabilidad no está habilitada en este entorno.', 404);
  // Deny POST before parsing a body, contacting a provider or recording a run.
  if (options.write) {
    try { assertRentabilidadConfiguration(); } catch { return response('Rentabilidad está en modo solo lectura. No se pueden guardar cambios, recalcular ni sincronizar.', 403); }
  }
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== 'admin') return response('Inicia sesión como administrador.', 401);
  if (session.impersonation) return response('Sal de «Actuar como» para acceder a Rentabilidad.', 403);
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return response('No autorizado.', 401);
  let mode: ReturnType<typeof assertRentabilidadReadConfiguration>;
  try { mode = await assertRentabilidadReadIdentity(prisma); } catch { return response('Rentabilidad no está habilitada para esta conexión.', 404); }
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { rol: true, roles: true, activo: true } });
  if (!admin?.activo || admin.rol !== 'SUPER_ADMIN') return response('Solo los superadmin pueden acceder a Rentabilidad.', 403);
  return { session, userId, readOnly: mode === 'production-read-only' };
}
export async function requireRentabilidadPage() {
  const auth = await requireRentabilidadAdmin();
  if ('error' in auth) redirect(auth.error.status === 401 ? '/login' : '/admin');
  return auth;
}
