import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST - Poblar entidades fiscales desde facturas recibidas y empleados
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { fuente = 'todo' } = body; // 'proveedores', 'personal', 'aapp', 'todo'
    // Obtener proveedores únicos de facturas recibidas
    const proveedoresFacturas = await prisma.facturaRecibida.groupBy({
      by: ['proveedor', 'cif', 'domicilioProveedor'],
      _count: true,
      _sum: { total: true },
    });

    let creados = 0;
    let existentes = 0;

    for (const prov of proveedoresFacturas) {
      if (!prov.proveedor) continue;

      // Verificar si ya existe por NIF o por razón social
      const existe = await prisma.entidadFiscal.findFirst({
        where: {
          OR: [
            ...(prov.cif ? [{ nifCif: prov.cif }] : []),
            { razonSocial: { equals: prov.proveedor, mode: 'insensitive' as const } },
          ],
        },
      });

      if (existe) {
        existentes++;
        continue;
      }

      // Determinar categoría interna basada en la imputación más común
      const imputacion = await prisma.facturaRecibida.findFirst({
        where: { proveedor: prov.proveedor, imputacion: { not: null } },
        select: { imputacion: true },
        orderBy: { fecha: 'desc' },
      });

      // Determinar forma de pago más común
      const formaPago = await prisma.facturaRecibida.findFirst({
        where: { proveedor: prov.proveedor, formaPago: { not: null } },
        select: { formaPago: true },
        orderBy: { fecha: 'desc' },
      });

      await prisma.entidadFiscal.create({
        data: {
          tipo: 'PROVEEDOR',
          razonSocial: prov.proveedor,
          nifCif: prov.cif || null,
          direccionFiscal: prov.domicilioProveedor || null,
          categoriaInterna: imputacion?.imputacion || null,
          formaPago: formaPago?.formaPago || null,
        },
      });
      creados++;
    }

    // También crear AAPP conocidas si no existen
    const aapp = [
      { razonSocial: 'Agencia Estatal de Administración Tributaria (AEAT)', nifCif: 'Q2826000H', categoriaInterna: 'IMPUESTOS' },
      { razonSocial: 'Tesorería General de la Seguridad Social (TGSS)', nifCif: 'Q2827002C', categoriaInterna: 'Sueldos y Salarios' },
    ];

    let aappCreadas = 0;
    for (const entidad of aapp) {
      const existe = await prisma.entidadFiscal.findFirst({
        where: { nifCif: entidad.nifCif },
      });
      if (!existe) {
        await prisma.entidadFiscal.create({
          data: {
            tipo: 'AAPP',
            razonSocial: entidad.razonSocial,
            nifCif: entidad.nifCif,
            categoriaInterna: entidad.categoriaInterna,
            pais: 'ES',
          },
        });
        aappCreadas++;
      }
    }

    // Poblar PERSONAL desde tabla Empleados
    let personalCreados = 0;
    let personalExistentes = 0;

    if (fuente === 'personal' || fuente === 'todo') {
      const empleados = await prisma.empleado.findMany({
        select: { id: true, nombreCompleto: true, nif: true, email: true, departamento: true, estado: true },
      });

      for (const emp of empleados) {
        // Verificar si ya existe por NIF
        const existe = await prisma.entidadFiscal.findFirst({
          where: {
            OR: [
              { nifCif: emp.nif },
              { razonSocial: { equals: emp.nombreCompleto, mode: 'insensitive' as const } },
            ],
            tipo: 'PERSONAL',
          },
        });

        if (existe) {
          personalExistentes++;
          continue;
        }

        await prisma.entidadFiscal.create({
          data: {
            tipo: 'PERSONAL',
            razonSocial: emp.nombreCompleto,
            nifCif: emp.nif,
            emailGeneral: emp.email || null,
            categoriaInterna: emp.departamento || 'Empleado',
            activo: emp.estado === 'ACTIVO',
          },
        });
        personalCreados++;
      }
    }

    // Poblar CLIENTES desde tabla ClienteWeb
    let clientesCreados = 0;
    let clientesExistentes = 0;

    if (fuente === 'clientes' || fuente === 'todo') {
      const clientes = await prisma.clienteWeb.findMany({
        where: { activo: true },
        select: {
          id: true,
          nombre: true,
          nombreComercial: true,
          nif: true,
          cif: true,
          domicilio: true,
          municipio: true,
          codigoPostal: true,
          provincia: true,
          pais: true,
          email: true,
          telefono: true,
          cuentaCargo: true,
          cuentaContable: true,
          formaPago: true,
          personaFisica: true,
        },
      });

      for (const cli of clientes) {
        if (!cli.nombre) continue;

        const nifCif = cli.cif || cli.nif || null;

        const existe = await prisma.entidadFiscal.findFirst({
          where: {
            OR: [
              ...(nifCif ? [{ nifCif }] : []),
              { razonSocial: { equals: cli.nombre, mode: 'insensitive' as const } },
            ],
            tipo: 'CLIENTE',
          },
        });

        if (existe) {
          clientesExistentes++;
          continue;
        }

        await prisma.entidadFiscal.create({
          data: {
            tipo: 'CLIENTE',
            razonSocial: cli.nombre,
            nombreComercial: cli.nombreComercial || null,
            nifCif,
            direccionFiscal: cli.domicilio || null,
            codigoPostal: cli.codigoPostal || null,
            poblacion: cli.municipio || null,
            provincia: cli.provincia || null,
            pais: cli.pais || 'ES',
            emailGeneral: cli.email || null,
            telefono: cli.telefono || null,
            iban: cli.cuentaCargo || null,
            cuentaContableA3: cli.cuentaContable || null,
            formaPago: cli.formaPago || null,
            categoriaInterna: cli.personaFisica ? 'Particular' : 'Empresa',
          },
        });
        clientesCreados++;
      }
    }

    return NextResponse.json({
      message: `Poblamiento completado`,
      proveedoresCreados: creados,
      proveedoresExistentes: existentes,
      clientesCreados,
      clientesExistentes,
      personalCreados,
      personalExistentes,
      aappCreadas,
      totalProveedoresFacturas: proveedoresFacturas.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
