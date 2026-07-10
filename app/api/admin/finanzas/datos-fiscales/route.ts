import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Listar entidades fiscales con filtros
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo'); // PROVEEDOR, PERSONAL, AAPP
    const buscar = searchParams.get('buscar');
    const categoria = searchParams.get('categoria');
    const activo = searchParams.get('activo');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (tipo) where.tipo = tipo;
    if (categoria) where.categoriaInterna = categoria;
    if (activo === 'true') where.activo = true;
    if (activo === 'false') where.activo = false;
    if (buscar) {
      where.OR = [
        { razonSocial: { contains: buscar, mode: 'insensitive' } },
        { nombreComercial: { contains: buscar, mode: 'insensitive' } },
        { nifCif: { contains: buscar, mode: 'insensitive' } },
        { cuentaContableA3: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const [entidades, total] = await Promise.all([
      prisma.entidadFiscal.findMany({
        where,
        orderBy: { razonSocial: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { movimientos: true } },
        },
      }),
      prisma.entidadFiscal.count({ where }),
    ]);

    // Obtener categorías únicas para filtros
    const categorias = await prisma.entidadFiscal.findMany({
      where: tipo ? { tipo: tipo as any } : {},
      select: { categoriaInterna: true },
      distinct: ['categoriaInterna'],
    });

    return NextResponse.json({
      entidades,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      categorias: categorias.map(c => c.categoriaInterna).filter(Boolean),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Crear nueva entidad fiscal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tipo, razonSocial, nombreComercial, nifCif, direccionFiscal,
      codigoPostal, poblacion, provincia, pais, emailFacturacion,
      emailGeneral, telefono, personaContacto, cuentaContableA3,
      categoriaInterna, subcategoria, formaPago, diaPago,
      plazoVencimiento, iban, patronesBancarios, notas,
    } = body;

    if (!tipo || !razonSocial) {
      return NextResponse.json({ error: 'Tipo y razón social son obligatorios' }, { status: 400 });
    }

    const entidad = await prisma.entidadFiscal.create({
      data: {
        tipo,
        razonSocial,
        nombreComercial,
        nifCif,
        direccionFiscal,
        codigoPostal,
        poblacion,
        provincia,
        pais: pais || 'ES',
        emailFacturacion,
        emailGeneral,
        telefono,
        personaContacto,
        cuentaContableA3,
        categoriaInterna,
        subcategoria,
        formaPago,
        diaPago: diaPago ? parseInt(diaPago) : null,
        plazoVencimiento: plazoVencimiento ? parseInt(plazoVencimiento) : null,
        iban,
        patronesBancarios,
        notas,
      },
    });

    return NextResponse.json({ entidad }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
