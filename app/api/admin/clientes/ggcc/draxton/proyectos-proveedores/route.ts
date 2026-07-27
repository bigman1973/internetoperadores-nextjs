import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Obtener proveedores de un proyecto
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const proyectoId = searchParams.get('proyectoId');

  if (!proyectoId) {
    return NextResponse.json({ error: 'proyectoId es obligatorio' }, { status: 400 });
  }

  const proveedores = await prisma.proveedorProyectoDraxton.findMany({
    where: { proyectoId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(proveedores);
}

// POST - Crear proveedor
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { proyectoId, proveedor, concepto, importe, estado, documentoUrl, documentoNombre, notas } = body;

  if (!proyectoId || !proveedor) {
    return NextResponse.json({ error: 'proyectoId y proveedor son obligatorios' }, { status: 400 });
  }

  const nuevo = await prisma.proveedorProyectoDraxton.create({
    data: {
      proyectoId,
      proveedor,
      concepto: concepto || null,
      importe: importe ? parseFloat(importe) : null,
      estado: estado || 'pendiente',
      documentoUrl: documentoUrl || null,
      documentoNombre: documentoNombre || null,
      notas: notas || null,
    },
  });

  // Recalcular coste proveedores del proyecto
  await recalcularCosteProyecto(proyectoId);

  return NextResponse.json(nuevo, { status: 201 });
}

// PUT - Actualizar proveedor
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  const updateData: any = {};
  if (data.proveedor !== undefined) updateData.proveedor = data.proveedor;
  if (data.concepto !== undefined) updateData.concepto = data.concepto || null;
  if (data.importe !== undefined) updateData.importe = data.importe ? parseFloat(data.importe) : null;
  if (data.estado !== undefined) updateData.estado = data.estado;
  if (data.documentoUrl !== undefined) updateData.documentoUrl = data.documentoUrl || null;
  if (data.documentoNombre !== undefined) updateData.documentoNombre = data.documentoNombre || null;
  if (data.notas !== undefined) updateData.notas = data.notas || null;

  const updated = await prisma.proveedorProyectoDraxton.update({
    where: { id },
    data: updateData,
  });

  // Recalcular coste proveedores del proyecto
  await recalcularCosteProyecto(updated.proyectoId);

  return NextResponse.json(updated);
}

// DELETE - Eliminar proveedor
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  const prov = await prisma.proveedorProyectoDraxton.findUnique({ where: { id } });
  if (!prov) {
    return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
  }

  await prisma.proveedorProyectoDraxton.delete({ where: { id } });

  // Recalcular coste proveedores del proyecto
  await recalcularCosteProyecto(prov.proyectoId);

  return NextResponse.json({ success: true });
}

// Función auxiliar para recalcular coste total de proveedores
async function recalcularCosteProyecto(proyectoId: string) {
  const proveedores = await prisma.proveedorProyectoDraxton.findMany({
    where: { proyectoId },
  });

  const costeTotal = proveedores.reduce((sum, p) => sum + (p.importe ? Number(p.importe) : 0), 0);

  const proyecto = await prisma.proyectoContratoDraxton.findUnique({ where: { id: proyectoId } });
  const importeVenta = proyecto?.importeVenta ? Number(proyecto.importeVenta) : 0;
  const margen = importeVenta > 0 ? importeVenta - costeTotal : null;

  await prisma.proyectoContratoDraxton.update({
    where: { id: proyectoId },
    data: {
      costeProveedores: costeTotal > 0 ? costeTotal : null,
      margenEstimado: margen,
    },
  });
}
