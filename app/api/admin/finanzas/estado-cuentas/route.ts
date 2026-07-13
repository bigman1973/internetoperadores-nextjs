import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Obtener TODAS las cuentas (activas e inactivas) con sus estadísticas de movimientos
  const cuentas = await prisma.cuentaBancaria.findMany({
    select: {
      id: true,
      banco: true,
      activa: true,
      _count: { select: { movimientos: true } },
    },
    orderBy: { banco: 'asc' },
  });

  // Para cada cuenta, obtener el primer y último movimiento
  const estadoCuentas = await Promise.all(
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
        activa: cuenta.activa,
        ultimoMovimiento: ultimoMov?.fechaOperacion?.toISOString() || null,
        primerMovimiento: primerMov?.fechaOperacion?.toISOString() || null,
        totalMovimientos: cuenta._count.movimientos,
      };
    })
  );

  // Ordenar: activas primero, luego por último movimiento (más antiguo primero)
  estadoCuentas.sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    if (!a.ultimoMovimiento) return -1;
    if (!b.ultimoMovimiento) return 1;
    return new Date(a.ultimoMovimiento).getTime() - new Date(b.ultimoMovimiento).getTime();
  });

  // Historial de importaciones: primero de la nueva tabla, luego fallback a la consulta legacy
  const importacionesNuevas = await prisma.importacionExtracto.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { cuenta: { select: { banco: true } } },
  });

  let historial;
  if (importacionesNuevas.length > 0) {
    historial = importacionesNuevas.map(h => ({
      id: h.id,
      archivo: h.nombreArchivo,
      banco: h.cuenta.banco,
      totalMovimientos: h.movImportados,
      duplicados: h.movDuplicados,
      fechaPrimerMov: h.fechaPrimerMov?.toISOString() || null,
      fechaUltimoMov: h.fechaUltimoMov?.toISOString() || null,
      fechaImportacion: h.createdAt?.toISOString() || null,
      archivoUrl: h.archivoUrl || null,
    }));
  } else {
    // Fallback: consulta legacy para importaciones antiguas sin registro en la nueva tabla
    const historialLegacy = await prisma.$queryRaw<Array<{
      origen_archivo: string;
      banco: string;
      total_movimientos: bigint;
      fecha_primer_mov: Date;
      fecha_ultimo_mov: Date;
      fecha_importacion: Date;
    }>>`
      SELECT 
        m.origen_archivo,
        c.banco,
        COUNT(*) as total_movimientos,
        MIN(m.fecha_operacion) as fecha_primer_mov,
        MAX(m.fecha_operacion) as fecha_ultimo_mov,
        MAX(m.created_at) as fecha_importacion
      FROM movimientos_bancarios m
      JOIN cuentas_bancarias c ON m.cuenta_id = c.id
      WHERE m.origen_archivo IS NOT NULL AND m.origen_archivo != ''
      GROUP BY m.origen_archivo, c.banco
      ORDER BY MAX(m.created_at) DESC
      LIMIT 20
    `;

    historial = historialLegacy.map(h => ({
      id: null,
      archivo: h.origen_archivo,
      banco: h.banco,
      totalMovimientos: Number(h.total_movimientos),
      duplicados: 0,
      fechaPrimerMov: h.fecha_primer_mov?.toISOString() || null,
      fechaUltimoMov: h.fecha_ultimo_mov?.toISOString() || null,
      fechaImportacion: h.fecha_importacion?.toISOString() || null,
      archivoUrl: null,
    }));
  }

  return NextResponse.json({ estadoCuentas, historial });
}
