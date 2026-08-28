import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildSalarySimulationContext } from '@/lib/simulacion-salarial-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'La simulación salarial es exclusiva para SUPER_ADMIN' }, { status: 403 });
    }

    const body = await req.json();
    const empleadoId = typeof body.empleadoId === 'string' ? body.empleadoId : '';
    const fechaEfectiva = typeof body.fechaEfectiva === 'string' ? body.fechaEfectiva : '';
    const brutoAnualPropuesto = Number(body.brutoAnualPropuesto);

    if (!empleadoId || !fechaEfectiva || !Number.isFinite(brutoAnualPropuesto) || brutoAnualPropuesto <= 0) {
      return NextResponse.json({ error: 'Empleado, fecha efectiva y bruto anual propuesto son obligatorios' }, { status: 400 });
    }

    const resultado = await buildSalarySimulationContext({ empleadoId, fechaEfectiva, brutoAnualPropuesto });

    return NextResponse.json({
      ...resultado,
      generadoEn: new Date().toISOString(),
      generadoPor: session.user.email,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Error en simulación salarial:', error);
    const message = error instanceof Error ? error.message : 'No se pudo calcular la simulación';
    const status = message === 'Empleado no encontrado' ? 404 : message.startsWith('No hay condición') ? 422 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
