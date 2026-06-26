import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: Obtener categorías de imputación, buscar clientes, o facturas emitidas de un cliente
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    // Listar categorías de imputación
    if (action === 'categorias') {
      const categorias = await prisma.categoriaImputacion.findMany({
        where: { activa: true },
        orderBy: { orden: 'asc' },
      });
      return NextResponse.json({ categorias });
    }

    // Buscar clientes (de facturas emitidas, únicos)
    if (action === 'buscar-clientes') {
      const q = searchParams.get('q') || '';
      const clientes = await prisma.facturaEmitida.findMany({
        where: q ? { cliente: { contains: q, mode: 'insensitive' } } : {},
        select: { cliente: true, cif: true },
        distinct: ['cliente'],
        orderBy: { cliente: 'asc' },
        take: 20,
      });
      return NextResponse.json({ clientes });
    }

    // Obtener facturas emitidas de un cliente concreto
    if (action === 'facturas-cliente') {
      const cliente = searchParams.get('cliente') || '';
      if (!cliente) {
        return NextResponse.json({ error: 'Cliente requerido' }, { status: 400 });
      }
      const facturas = await prisma.facturaEmitida.findMany({
        where: { cliente: { contains: cliente, mode: 'insensitive' } },
        select: {
          id: true,
          numFactura: true,
          fecha: true,
          concepto: true,
          lineas: true,
          base: true,
          total: true,
          serie: true,
        },
        orderBy: { fecha: 'desc' },
        take: 50,
      });
      return NextResponse.json({ facturas });
    }

    // Obtener vinculaciones de una factura recibida
    if (action === 'vinculaciones') {
      const facturaRecibidaId = searchParams.get('facturaRecibidaId') || '';
      const vinculaciones = await prisma.vinculacionFactura.findMany({
        where: { facturaRecibidaId },
      });
      // Obtener datos de las facturas emitidas vinculadas
      const facturasEmitidas = await Promise.all(
        vinculaciones.map(async (v) => {
          const fe = await prisma.facturaEmitida.findUnique({
            where: { id: v.facturaEmitidaId },
            select: { id: true, numFactura: true, cliente: true, concepto: true, total: true, fecha: true },
          });
          return { ...v, facturaEmitida: fe };
        })
      );
      return NextResponse.json({ vinculaciones: facturasEmitidas });
    }

    // Obtener regla de imputación sugerida para un proveedor
    if (action === 'sugerencia') {
      const proveedor = searchParams.get('proveedor') || '';
      const cif = searchParams.get('cif') || '';
      
      let regla = null;
      if (cif) {
        regla = await prisma.reglaImputacionProveedor.findUnique({
          where: { proveedorCif: cif },
        });
      }
      if (!regla && proveedor) {
        regla = await prisma.reglaImputacionProveedor.findFirst({
          where: { proveedorNombre: { contains: proveedor, mode: 'insensitive' }, activa: true },
        });
      }
      return NextResponse.json({ regla });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Imputar factura, crear vinculación, o crear categoría nueva
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // Imputar una factura recibida (actualizar categoría + crear regla automática)
    if (action === 'imputar') {
      const { facturaRecibidaId, categoria, clienteNombre, facturaEmitidaIds } = body;

      // Actualizar la factura recibida
      await prisma.facturaRecibida.update({
        where: { id: facturaRecibidaId },
        data: {
          imputacion: categoria,
          clienteImputado: clienteNombre || null,
        },
      });

      // Si hay facturas emitidas vinculadas, crear vinculaciones
      if (facturaEmitidaIds && facturaEmitidaIds.length > 0) {
        // Borrar vinculaciones anteriores
        await prisma.vinculacionFactura.deleteMany({
          where: { facturaRecibidaId },
        });
        // Crear nuevas
        const porcentaje = 100 / facturaEmitidaIds.length;
        for (const feId of facturaEmitidaIds) {
          await prisma.vinculacionFactura.create({
            data: {
              facturaRecibidaId,
              facturaEmitidaId: feId,
              porcentaje,
            },
          });
        }
      }

      // Crear/actualizar regla de imputación automática por proveedor
      const factura = await prisma.facturaRecibida.findUnique({
        where: { id: facturaRecibidaId },
        select: { proveedor: true, cif: true },
      });

      if (factura) {
        const categoriaObj = await prisma.categoriaImputacion.findUnique({
          where: { nombre: categoria },
        });

        if (factura.cif) {
          await prisma.reglaImputacionProveedor.upsert({
            where: { proveedorCif: factura.cif },
            update: {
              categoria,
              categoriaId: categoriaObj?.id || '',
              clienteNombre: clienteNombre || null,
              vecesAplicada: { increment: 1 },
            },
            create: {
              proveedorCif: factura.cif,
              proveedorNombre: factura.proveedor,
              categoria,
              categoriaId: categoriaObj?.id || '',
              clienteNombre: clienteNombre || null,
            },
          });
        } else {
          // Sin CIF, buscar por nombre
          const existing = await prisma.reglaImputacionProveedor.findFirst({
            where: { proveedorNombre: factura.proveedor },
          });
          if (existing) {
            await prisma.reglaImputacionProveedor.update({
              where: { id: existing.id },
              data: { categoria, categoriaId: categoriaObj?.id || '', clienteNombre: clienteNombre || null, vecesAplicada: { increment: 1 } },
            });
          } else {
            await prisma.reglaImputacionProveedor.create({
              data: {
                proveedorNombre: factura.proveedor,
                categoria,
                categoriaId: categoriaObj?.id || '',
                clienteNombre: clienteNombre || null,
              },
            });
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    // Imputar todas las facturas de un proveedor de golpe
    if (action === 'imputar-todas-proveedor') {
      const { proveedor, cif, categoria, clienteNombre } = body;

      // Buscar todas las facturas del proveedor sin imputar (o con imputación diferente)
      const whereCondition: any = {
        imputacion: null,
      };
      if (cif) {
        whereCondition.cif = cif;
      } else {
        whereCondition.proveedor = { contains: proveedor, mode: 'insensitive' };
      }

      const result = await prisma.facturaRecibida.updateMany({
        where: whereCondition,
        data: {
          imputacion: categoria,
          clienteImputado: clienteNombre || null,
        },
      });

      // Crear/actualizar regla automática
      const categoriaObj = await prisma.categoriaImputacion.findUnique({
        where: { nombre: categoria },
      });

      if (cif) {
        await prisma.reglaImputacionProveedor.upsert({
          where: { proveedorCif: cif },
          update: {
            categoria,
            categoriaId: categoriaObj?.id || '',
            clienteNombre: clienteNombre || null,
            vecesAplicada: { increment: result.count },
          },
          create: {
            proveedorCif: cif,
            proveedorNombre: proveedor,
            categoria,
            categoriaId: categoriaObj?.id || '',
            clienteNombre: clienteNombre || null,
            vecesAplicada: result.count,
          },
        });
      } else {
        const existing = await prisma.reglaImputacionProveedor.findFirst({
          where: { proveedorNombre: { contains: proveedor, mode: 'insensitive' } },
        });
        if (existing) {
          await prisma.reglaImputacionProveedor.update({
            where: { id: existing.id },
            data: { categoria, categoriaId: categoriaObj?.id || '', clienteNombre: clienteNombre || null, vecesAplicada: { increment: result.count } },
          });
        } else {
          await prisma.reglaImputacionProveedor.create({
            data: {
              proveedorNombre: proveedor,
              categoria,
              categoriaId: categoriaObj?.id || '',
              clienteNombre: clienteNombre || null,
              vecesAplicada: result.count,
            },
          });
        }
      }

      return NextResponse.json({ success: true, actualizadas: result.count });
    }

    // Guardar imputación de clientes por línea (actualizar lineasDetalle con clientes asignados)
    if (action === 'guardar-lineas') {
      const { facturaRecibidaId, lineas } = body;

      if (!facturaRecibidaId || !Array.isArray(lineas)) {
        return NextResponse.json({ error: 'facturaRecibidaId y lineas son requeridos' }, { status: 400 });
      }

      // Actualizar las líneas de detalle con los clientes asignados
      await prisma.facturaRecibida.update({
        where: { id: facturaRecibidaId },
        data: {
          lineasDetalle: JSON.stringify(lineas),
        },
      });

      return NextResponse.json({ success: true });
    }

    // Crear nueva categoría de imputación
    if (action === 'crear-categoria') {
      const { nombre, descripcion, tipo } = body;
      const maxOrden = await prisma.categoriaImputacion.aggregate({ _max: { orden: true } });
      const categoria = await prisma.categoriaImputacion.create({
        data: {
          nombre,
          descripcion: descripcion || null,
          tipo: tipo || 'gasto',
          orden: (maxOrden._max.orden || 0) + 1,
        },
      });
      return NextResponse.json({ categoria });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
