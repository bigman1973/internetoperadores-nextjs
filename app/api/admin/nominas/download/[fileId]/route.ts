import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { downloadCostesFile } from '@/lib/microsoft-graph';

const ROLES = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH'];

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (session.user.userType !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const { fileId } = await params;
  if (!/^[A-Za-z0-9!_.~-]{4,220}$/.test(fileId)) return NextResponse.json({ error: 'Archivo no válido' }, { status: 400 });
  const user = await prisma.usuarioAdmin.findUnique({ where: { email: session.user.email }, select: { activo: true, rol: true, roles: true } });
  if (!user?.activo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const privileged = Boolean(user?.activo && [user.rol, ...(user.roles || [])].some(role => ROLES.includes(role)));
  const own = await prisma.empleado.findFirst({ where: { email: { equals: session.user.email, mode: 'insensitive' } }, select: { id: true } });
  const path = `/api/admin/nominas/download/${encodeURIComponent(fileId)}`;
  const document = await prisma.nominaDocumento.findUnique({ where: { driveItemId: fileId }, select: { nomina: { select: { empleadoId: true } } } });
  const legacy = document ? null : await prisma.nomina.findFirst({ where: { archivoUrl: path }, select: { empleadoId: true } });
  const ownerId = document?.nomina.empleadoId || legacy?.empleadoId;
  if (!ownerId || (!privileged && ownerId !== own?.id)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    const pdf = await downloadCostesFile(fileId);
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) {
    console.error('Error descargando nómina', e);
    return NextResponse.json({ error: 'No se ha podido recuperar el PDF' }, { status: 502 });
  }
}
