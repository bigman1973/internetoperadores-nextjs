import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read';
import { OPERATOR_AREA } from './operator-costs';

export const operatorJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function operatorAuth(write: boolean) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (session?.user?.userType !== 'admin' || !Number.isSafeInteger(userId) || userId <= 0) return operatorJson({ error: 'No autorizado' }, 401);
  const active = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } });
  if (!active?.activo) return operatorJson({ error: 'No autorizado' }, 401);
  const denied = await (write ? checkAdminAreaWrite : checkAdminAreaRead)(OPERATOR_AREA, ['CONTABILIDAD'], session);
  if (denied) return operatorJson({ error: write ? 'Sin permiso de escritura' : 'Sin permiso de lectura' }, denied.status);
  return { userId, session, canWrite: write || !(await checkAdminAreaWrite(OPERATOR_AREA, ['CONTABILIDAD'], session)) };
}
