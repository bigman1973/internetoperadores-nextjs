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

    // Sugerencia de cliente por teléfono (para facturas de Telefónica de España)
    if (action === 'sugerencia-telefono') {
      const telefono = searchParams.get('telefono') || '';
      const sufijo = searchParams.get('sufijo') || '';
      
      if (!telefono && !sufijo) {
        return NextResponse.json({ error: 'Se requiere telefono o sufijo' }, { status: 400 });
      }

      // Buscar en contratos_servicio por teléfono exacto o sufijo
      let query = '';
      let queryParams: string[] = [];
      
      if (telefono) {
        // Búsqueda exacta por teléfono completo
        query = `
          SELECT DISTINCT cs.cliente_id, cs.telefonos_contrato, cs.titulo, cw.nombre as cliente_nombre, cw.id as cliente_web_id
          FROM contratos_servicio cs
          JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
          WHERE cs.telefonos_contrato LIKE $1
          AND cs.activo = true
          LIMIT 5
        `;
        queryParams = [`%${telefono}%`];
      } else {
        // Búsqueda por sufijo (últimos 3-4 dígitos) - solo teléfonos fijos (empiezan por 9)
        query = `
          SELECT DISTINCT cs.cliente_id, cs.telefonos_contrato, cs.titulo, cw.nombre as cliente_nombre, cw.id as cliente_web_id
          FROM contratos_servicio cs
          JOIN clientes_web cw ON cw.cliente_id_isp = cs.cliente_id
          WHERE cs.telefonos_contrato ~ ('9[0-9]{' || $2 || '}' || $1 || '$')
          AND cs.activo = true
          LIMIT 10
        `;
        const numDigitosAntes = 9 - sufijo.length - 1; // 9 dígitos total - 1 del '9' inicial - sufijo
        queryParams = [sufijo, String(numDigitosAntes)];
      }

      const resultados: any[] = await prisma.$queryRawUnsafe(query, ...queryParams);
      
      return NextResponse.json({
        sugerencias: resultados.map((r: any) => ({
          clienteId: r.cliente_web_id,
          clienteNombre: r.cliente_nombre,
          clienteIsp: r.cliente_id,
          telefono: r.telefonos_contrato,
          contrato: r.titulo,
        })),
        matchExacto: resultados.length === 1,
      });
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

    // Imputar a ventas: crear registros de coste por cliente
    if (action === 'imputar-a-ventas') {
      const { facturaRecibidaId, imputaciones } = body;
      // imputaciones: [{ clienteId, clienteNombre, importe, concepto, numLineas }]

      if (!facturaRecibidaId || !Array.isArray(imputaciones) || imputaciones.length === 0) {
        return NextResponse.json({ error: 'facturaRecibidaId e imputaciones son requeridos' }, { status: 400 });
      }

      // Verificar que la factura existe y no está ya imputada
      const factura = await prisma.facturaRecibida.findUnique({
        where: { id: facturaRecibidaId },
      });
      if (!factura) {
        return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
      }

      // Borrar imputaciones anteriores si las hay (permite re-imputar)
      await prisma.imputacionCosteCliente.deleteMany({
        where: { facturaId: facturaRecibidaId },
      });

      // Crear nuevas imputaciones
      for (const imp of imputaciones) {
        await prisma.imputacionCosteCliente.create({
          data: {
            facturaId: facturaRecibidaId,
            clienteId: imp.clienteId,
            clienteNombre: imp.clienteNombre,
            importe: imp.importe,
            concepto: imp.concepto || null,
            numLineas: imp.numLineas || 1,
            confirmado: true,
          },
        });
      }

      // Marcar la factura como imputada a ventas
      await prisma.facturaRecibida.update({
        where: { id: facturaRecibidaId },
        data: {
          imputadoAVentas: true,
          fechaImputacion: new Date(),
          imputacion: 'Clientes (por línea)',
        },
      });

      return NextResponse.json({ success: true, numImputaciones: imputaciones.length });
    }

    // Deshacer imputación a ventas
    if (action === 'deshacer-imputacion') {
      const { facturaRecibidaId } = body;

      if (!facturaRecibidaId) {
        return NextResponse.json({ error: 'facturaRecibidaId requerido' }, { status: 400 });
      }

      // Borrar imputaciones
      await prisma.imputacionCosteCliente.deleteMany({
        where: { facturaId: facturaRecibidaId },
      });

      // Desmarcar la factura
      await prisma.facturaRecibida.update({
        where: { id: facturaRecibidaId },
        data: {
          imputadoAVentas: false,
          fechaImputacion: null,
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

    // Buscar facturas similares del mismo proveedor (para replicar analítica)
    if (action === 'buscar-similares') {
      const { facturaRecibidaId } = body;
      if (!facturaRecibidaId) {
        return NextResponse.json({ error: 'facturaRecibidaId requerido' }, { status: 400 });
      }

      const origen = await prisma.facturaRecibida.findUnique({
        where: { id: facturaRecibidaId },
        select: { id: true, proveedor: true, cif: true, lineasDetalle: true, imputadoAVentas: true },
      });
      if (!origen) {
        return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
      }

      const whereCondition: any = {
        id: { not: facturaRecibidaId },
        imputadoAVentas: false,
        estado: { not: 'RECHAZADA' },
      };
      if (origen.cif) {
        whereCondition.cif = origen.cif;
      } else {
        whereCondition.proveedor = { contains: origen.proveedor, mode: 'insensitive' };
      }

      const similares = await prisma.facturaRecibida.findMany({
        where: whereCondition,
        select: {
          id: true,
          proveedor: true,
          numFactura: true,
          fecha: true,
          base: true,
          total: true,
          concepto: true,
          lineasDetalle: true,
          imputacion: true,
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      });

      let lineasOrigen: any[] = [];
      if (origen.lineasDetalle) {
        try { lineasOrigen = JSON.parse(origen.lineasDetalle); } catch {}
      }

      const facturasEnriquecidas = similares.map(f => {
        let similitud = 0;
        let numLineas = 0;
        if (f.lineasDetalle && lineasOrigen.length > 0) {
          try {
            const lineasF = JSON.parse(f.lineasDetalle);
            numLineas = lineasF.length;
            const descsOrigen = lineasOrigen.map((l: any) => (l.descripcion || '').toLowerCase().trim());
            const descsF = lineasF.map((l: any) => (l.descripcion || '').toLowerCase().trim());
            const coincidencias = descsF.filter((d: string) => descsOrigen.some((o: string) => o === d || (o.length > 5 && d.includes(o)) || (d.length > 5 && o.includes(d))));
            similitud = descsF.length > 0 ? Math.round((coincidencias.length / descsF.length) * 100) : 0;
          } catch {}
        } else if (!f.lineasDetalle && lineasOrigen.length === 0) {
          similitud = 50;
        }
        return { ...f, lineasDetalle: undefined, numLineas, similitud };
      });

      facturasEnriquecidas.sort((a, b) => b.similitud - a.similitud);

      return NextResponse.json({
        similares: facturasEnriquecidas,
        totalSimilares: facturasEnriquecidas.length,
        origenLineas: lineasOrigen.length,
      });
    }

    // Aplicar la misma imputación de líneas a facturas similares
    if (action === 'aplicar-similares') {
      const { facturaOrigenId, facturaDestinoIds } = body;
      if (!facturaOrigenId || !Array.isArray(facturaDestinoIds) || facturaDestinoIds.length === 0) {
        return NextResponse.json({ error: 'facturaOrigenId y facturaDestinoIds son requeridos' }, { status: 400 });
      }

      const origen = await prisma.facturaRecibida.findUnique({
        where: { id: facturaOrigenId },
        select: { id: true, lineasDetalle: true, imputadoAVentas: true, imputacion: true, clienteImputado: true, base: true },
      });
      if (!origen) {
        return NextResponse.json({ error: 'Factura origen no encontrada' }, { status: 404 });
      }

      const imputacionesOrigen = await prisma.imputacionCosteCliente.findMany({
        where: { facturaId: facturaOrigenId },
      });

      let aplicadas = 0;

      for (const destinoId of facturaDestinoIds) {
        const destino = await prisma.facturaRecibida.findUnique({
          where: { id: destinoId },
          select: { id: true, base: true, total: true, lineasDetalle: true },
        });
        if (!destino) continue;

        // Copiar lineasDetalle con los clientes asignados del origen
        if (origen.lineasDetalle) {
          try {
            const lineasOrigenParsed = JSON.parse(origen.lineasDetalle);
            let lineasDestino: any[] = [];
            if (destino.lineasDetalle) {
              lineasDestino = JSON.parse(destino.lineasDetalle);
            }

            const lineasActualizadas = lineasDestino.length > 0
              ? lineasDestino.map((ld: any, idx: number) => {
                  const match = lineasOrigenParsed.find((lo: any) =>
                    lo.descripcion && ld.descripcion &&
                    (lo.descripcion.toLowerCase().trim() === ld.descripcion.toLowerCase().trim() ||
                     lo.descripcion.toLowerCase().includes(ld.descripcion.toLowerCase()) ||
                     ld.descripcion.toLowerCase().includes(lo.descripcion.toLowerCase()))
                  ) || lineasOrigenParsed[idx];

                  if (match && (match.cliente || match.clienteNombreBd)) {
                    return {
                      ...ld,
                      cliente: match.cliente || match.clienteNombreBd,
                      clienteNombreBd: match.clienteNombreBd || match.cliente,
                      clienteMatch: true,
                    };
                  }
                  return ld;
                })
              : lineasOrigenParsed;

            await prisma.facturaRecibida.update({
              where: { id: destinoId },
              data: { lineasDetalle: JSON.stringify(lineasActualizadas) },
            });
          } catch {}
        }

        // Si el origen está imputado a ventas, replicar las imputaciones
        if (origen.imputadoAVentas && imputacionesOrigen.length > 0) {
          await prisma.imputacionCosteCliente.deleteMany({
            where: { facturaId: destinoId },
          });

          const baseOrigen = imputacionesOrigen.reduce((sum, i) => sum + i.importe, 0);
          const baseDestino = destino.base || destino.total || baseOrigen;
          const factor = baseOrigen > 0 ? baseDestino / baseOrigen : 1;

          for (const imp of imputacionesOrigen) {
            await prisma.imputacionCosteCliente.create({
              data: {
                facturaId: destinoId,
                clienteId: imp.clienteId,
                clienteNombre: imp.clienteNombre,
                importe: Math.round(imp.importe * factor * 100) / 100,
                concepto: imp.concepto,
                numLineas: imp.numLineas,
                confirmado: true,
              },
            });
          }

          await prisma.facturaRecibida.update({
            where: { id: destinoId },
            data: {
              imputadoAVentas: true,
              fechaImputacion: new Date(),
              imputacion: origen.imputacion || 'Clientes (por línea)',
              clienteImputado: origen.clienteImputado,
            },
          });
        }

        aplicadas++;
      }

      return NextResponse.json({ success: true, aplicadas });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
