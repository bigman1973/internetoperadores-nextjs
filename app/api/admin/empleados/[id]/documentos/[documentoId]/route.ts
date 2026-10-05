import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { downloadFileById } from '@/lib/microsoft-graph';

export const runtime = 'nodejs';
type Props = { params: Promise<{ id: string; documentoId: string }> };

export async function GET(_request: NextRequest, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.userType === 'cliente') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  const user = await prisma.usuarioAdmin.findUnique({ where: { email: session.user.email }, select: { rol: true, activo: true } });
  if (!user?.activo || user.rol !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  const { id, documentoId } = await params;
  const record = await prisma.documentoEmpleado.findFirst({ where: { id: documentoId, empleadoId: id }, select: { driveItemId: true, nombre: true, tipo: true } });
  if (!record) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  try {
    const bytes = await downloadFileById(record.driveItemId);
    const isPdf = record.tipo === 'LIQUIDACION';
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `${isPdf ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(record.nombre)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo recuperar el documento privado' }, { status: 502 });
  }
}
