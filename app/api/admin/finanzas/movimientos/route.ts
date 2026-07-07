import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const cuentaId = searchParams.get('cuentaId');
    const categoria = searchParams.get('categoria');
    const conciliado = searchParams.get('conciliado');
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    const where: any = {};
    if (cuentaId) where.cuentaId = cuentaId;
    
    // Subcategorías virtuales de "Sueldos y Salarios"
    if (categoria === 'Transferencias Nóminas') {
      where.categoria = 'Sueldos y Salarios';
      where.NOT = { concepto: { contains: 'TGSS', mode: 'insensitive' } };
      // Excluir también cotizaciones y aplazamientos
      where.AND = [
        { NOT: { concepto: { contains: 'TGSS', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'COTIZACION', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'AUTONOMOS', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'APLAZAM', mode: 'insensitive' } } },
      ];
      delete where.NOT;
    } else if (categoria === 'Cotizaciones SS') {
      where.categoria = 'Sueldos y Salarios';
      where.OR = [
        { concepto: { contains: 'TGSS', mode: 'insensitive' } },
        { concepto: { contains: 'COTIZACION', mode: 'insensitive' } },
        { concepto: { contains: 'AUTONOMOS', mode: 'insensitive' } },
        { concepto: { contains: 'APLAZAM', mode: 'insensitive' } },
      ];
    } else if (categoria) {
      where.categoria = categoria;
    }
    
    if (conciliado === 'true') where.conciliado = true;
    if (conciliado === 'false') where.conciliado = false;
    if (desde) where.fechaOperacion = { ...where.fechaOperacion, gte: new Date(desde) };
    if (hasta) where.fechaOperacion = { ...where.fechaOperacion, lte: new Date(hasta) };

    const [movimientos, total] = await Promise.all([
      prisma.movimientoBancario.findMany({
        where,
        orderBy: { fechaOperacion: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { cuenta: { select: { banco: true, alias: true } } },
      }),
      prisma.movimientoBancario.count({ where }),
    ]);

    return NextResponse.json({ movimientos, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
