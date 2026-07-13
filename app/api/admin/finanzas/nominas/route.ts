import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Obtener nóminas de un empleado (por entidadFiscalId o empleadoId)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entidadFiscalId = searchParams.get('entidadFiscalId');
    const empleadoId = searchParams.get('empleadoId');

    let targetEmpleadoId: string | null = null;

    if (empleadoId) {
      targetEmpleadoId = empleadoId;
    } else if (entidadFiscalId) {
      // Buscar el empleado por NIF de la entidad fiscal
      const entidad = await prisma.entidadFiscal.findUnique({ where: { id: entidadFiscalId }, select: { nifCif: true } });
      if (entidad?.nifCif) {
        const empleado = await prisma.empleado.findFirst({ where: { nif: entidad.nifCif }, select: { id: true } });
        if (empleado) targetEmpleadoId = empleado.id;
      }
    }

    if (!targetEmpleadoId) {
      return NextResponse.json({ nominas: [] });
    }

    const nominas = await prisma.nomina.findMany({
      where: { empleadoId: targetEmpleadoId },
      include: {
        empleado: { select: { nombreCompleto: true } },
        movimientos: { select: { id: true, importe: true, fechaOperacion: true, concepto: true } },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    return NextResponse.json({
      nominas: nominas.map(n => {
        const importeVinculado = n.movimientos.reduce((sum, m) => sum + Math.abs(m.importe), 0);
        return {
          id: n.id,
          empleadoNombre: n.empleado.nombreCompleto,
          mes: n.mes,
          anio: n.anio,
          netoPercibir: n.netoPercibir,
          devengadoTotal: n.devengadoTotal,
          costeTotalEmpresa: n.costeTotalEmpresa,
          movimientosVinculados: n.movimientos.map(m => ({
            id: m.id,
            importe: m.importe,
            fecha: m.fechaOperacion,
            concepto: m.concepto,
          })),
          importeVinculado,
          numMovimientos: n.movimientos.length,
          cubierto: n.netoPercibir > 0 ? Math.round((importeVinculado / n.netoPercibir) * 100) : 0,
        };
      }),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
