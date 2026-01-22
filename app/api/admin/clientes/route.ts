import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/prisma';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { nombre, email, password, ispGestionId, newsletterSuscrito } = body;

    if (!nombre || !email || !password) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const existingUser = await prisma.clienteWeb.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const cliente = await prisma.clienteWeb.create({
      data: {
        nombre,
        email,
        passwordHash,
        ispGestionId: ispGestionId || `WEB_${Date.now()}`,
        newsletterSuscrito: !!newsletterSuscrito,
      },
    });

    return NextResponse.json(cliente);
  } catch (error: any) {
    console.error('Error al crear cliente:', error);
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 });
  }
}
