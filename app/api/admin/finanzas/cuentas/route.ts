import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const cuentas = await prisma.cuentaBancaria.findMany({
      orderBy: [{ activa: 'desc' }, { banco: 'asc' }],
      include: {
        _count: { select: { movimientos: true } },
      },
    });

    return NextResponse.json({ cuentas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { banco, iban, alias, activa } = body;

    if (!banco || !iban) {
      return NextResponse.json({ error: 'Banco e IBAN son obligatorios' }, { status: 400 });
    }

    const cuenta = await prisma.cuentaBancaria.create({
      data: { banco, iban, alias, activa: activa ?? true },
    });

    return NextResponse.json({ cuenta });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una cuenta con ese IBAN' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
