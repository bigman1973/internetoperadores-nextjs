import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Listar empleados con sus nóminas (para vincular desde conciliación)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const buscar = searchParams.get('buscar') || '';
    const movimientoId = searchParams.get('movimientoId');

    // Obtener empleados activos
    const empleados = await prisma.empleado.findMany({
      where: {
        estado: 'ACTIVO',
        ...(buscar ? {
          OR: [
            { nombreCompleto: { contains: buscar, mode: 'insensitive' } },
            { nif: { contains: buscar, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true,
        nombreCompleto: true,
        nif: true,
        departamento: true,
        nominas: {
          select: {
            id: true,
            mes: true,
            anio: true,
            netoPercibir: true,
            devengadoTotal: true,
            movimientos: { select: { id: true } },
          },
          orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        },
      },
      orderBy: { nombreCompleto: 'asc' },
    });

    // Si hay movimientoId, obtener info del movimiento para sugerir match
    let movimientoInfo = null;
    if (movimientoId) {
      const mov = await prisma.movimientoBancario.findUnique({
        where: { id: movimientoId },
        select: { importe: true, fechaOperacion: true, concepto: true, tercero: true },
      });
      if (mov) {
        movimientoInfo = {
          importe: Math.abs(mov.importe),
          fecha: mov.fechaOperacion,
          concepto: mov.concepto,
          tercero: mov.tercero,
        };
      }
    }

    const resultado = empleados.map(emp => ({
      id: emp.id,
      nombreCompleto: emp.nombreCompleto,
      nif: emp.nif,
      departamento: emp.departamento,
      nominas: emp.nominas.map(n => ({
        id: n.id,
        mes: n.mes,
        anio: n.anio,
        netoPercibir: n.netoPercibir,
        devengadoTotal: n.devengadoTotal,
        vinculada: n.movimientos.length > 0,
        numMovimientos: n.movimientos.length,
      })),
      totalNominas: emp.nominas.length,
      nominasPendientes: emp.nominas.filter(n => n.movimientos.length === 0).length,
    }));

    return NextResponse.json({ empleados: resultado, movimientoInfo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
