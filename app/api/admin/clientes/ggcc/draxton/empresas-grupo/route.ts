import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const empresas = await prisma.empresaGrupoDraxton.findMany({
    orderBy: { nombre: 'asc' },
  });

  return NextResponse.json(empresas);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  // Si viene id, es un PUT (actualizar)
  if (id) {
    const empresa = await prisma.empresaGrupoDraxton.update({
      where: { id },
      data: {
        nombre: data.nombre,
        cif: data.cif || null,
        direccion: data.direccion || null,
        poblacion: data.poblacion || null,
        provincia: data.provincia || null,
        contacto: data.contacto || null,
        email: data.email || null,
        telefono: data.telefono || null,
        activa: data.activa ?? true,
        notas: data.notas || null,
        clienteWebId: data.clienteWebId || null,
      },
    });
    return NextResponse.json(empresa);
  }

  // Crear nueva
  const empresa = await prisma.empresaGrupoDraxton.create({
    data: {
      nombre: data.nombre,
      cif: data.cif || null,
      direccion: data.direccion || null,
      poblacion: data.poblacion || null,
      provincia: data.provincia || null,
      contacto: data.contacto || null,
      email: data.email || null,
      telefono: data.telefono || null,
      activa: data.activa ?? true,
      notas: data.notas || null,
      clienteWebId: data.clienteWebId || null,
    },
  });

  return NextResponse.json(empresa, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  await prisma.empresaGrupoDraxton.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
