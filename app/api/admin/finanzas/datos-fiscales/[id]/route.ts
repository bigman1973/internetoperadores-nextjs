import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Obtener una entidad fiscal con sus movimientos
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const entidad = await prisma.entidadFiscal.findUnique({
      where: { id },
      include: {
        movimientos: {
          orderBy: { fechaOperacion: 'desc' },
          take: 20,
          select: {
            id: true,
            fechaOperacion: true,
            concepto: true,
            importe: true,
            categoria: true,
            conciliado: true,
          },
        },
        _count: { select: { movimientos: true } },
      },
    });

    if (!entidad) {
      return NextResponse.json({ error: 'Entidad no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ entidad });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Actualizar entidad fiscal
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const data: any = {};
    const campos = [
      'razonSocial', 'nombreComercial', 'nifCif', 'direccionFiscal',
      'codigoPostal', 'poblacion', 'provincia', 'pais', 'emailFacturacion',
      'emailGeneral', 'telefono', 'personaContacto', 'cuentaContableA3',
      'categoriaInterna', 'subcategoria', 'formaPago', 'diaPago',
      'plazoVencimiento', 'iban', 'patronesBancarios', 'notas', 'activo', 'tipo',
    ];

    for (const campo of campos) {
      if (body[campo] !== undefined) {
        if (campo === 'diaPago' || campo === 'plazoVencimiento') {
          data[campo] = body[campo] ? parseInt(body[campo]) : null;
        } else {
          data[campo] = body[campo];
        }
      }
    }

    const entidad = await prisma.entidadFiscal.update({
      where: { id },
      data,
    });

    return NextResponse.json({ entidad });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Eliminar entidad fiscal
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    // Verificar si tiene movimientos vinculados
    const count = await prisma.movimientoBancario.count({
      where: { entidadFiscalId: id },
    });

    if (count > 0) {
      // No eliminar, solo desactivar
      await prisma.entidadFiscal.update({
        where: { id },
        data: { activo: false },
      });
      return NextResponse.json({ message: 'Entidad desactivada (tiene movimientos vinculados)', desactivada: true });
    }

    await prisma.entidadFiscal.delete({ where: { id } });
    return NextResponse.json({ message: 'Entidad eliminada' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
