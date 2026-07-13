import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Obtener todas las cuentas con sus estadísticas de movimientos
  const cuentas = await prisma.cuentaBancaria.findMany({
    where: { activa: true },
    select: {
      id: true,
      banco: true,
      _count: { select: { movimientos: true } },
    },
  });

  // Para cada cuenta, obtener el primer y último movimiento
  const resultado = await Promise.all(
    cuentas.map(async (cuenta) => {
      const ultimoMov = await prisma.movimientoBancario.findFirst({
        where: { cuentaId: cuenta.id },
        orderBy: { fechaOperacion: 'desc' },
        select: { fechaOperacion: true },
      });

      const primerMov = await prisma.movimientoBancario.findFirst({
        where: { cuentaId: cuenta.id },
        orderBy: { fechaOperacion: 'asc' },
        select: { fechaOperacion: true },
      });

      return {
        banco: cuenta.banco,
        ultimoMovimiento: ultimoMov?.fechaOperacion?.toISOString() || null,
        primerMovimiento: primerMov?.fechaOperacion?.toISOString() || null,
        totalMovimientos: cuenta._count.movimientos,
      };
    })
  );

  // Ordenar por último movimiento (más antiguo primero para que se vea cuál necesita actualización)
  resultado.sort((a, b) => {
    if (!a.ultimoMovimiento) return -1;
    if (!b.ultimoMovimiento) return 1;
    return new Date(a.ultimoMovimiento).getTime() - new Date(b.ultimoMovimiento).getTime();
  });

  return NextResponse.json(resultado);
}
