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

    const buscar = searchParams.get('buscar');

    const where: any = {};
    if (cuentaId) where.cuentaId = cuentaId;
    if (buscar) {
      where.OR = [
        { concepto: { contains: buscar, mode: 'insensitive' } },
        { entidadFiscal: { razonSocial: { contains: buscar, mode: 'insensitive' } } },
        { entidadFiscal: { nifCif: { contains: buscar, mode: 'insensitive' } } },
        { entregaACuentaEmpleado: { nombreCompleto: { contains: buscar, mode: 'insensitive' } } },
      ];
    }
    
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
    } else if (categoria === 'Retenciones') {
      where.categoria = 'IMPUESTOS';
      where.OR = [
        { concepto: { contains: 'RET', mode: 'insensitive' } },
        { concepto: { contains: 'INGRESO A CUENTA', mode: 'insensitive' } },
      ];
    } else if (categoria === 'Sociedades Pago a Cuenta') {
      where.categoria = 'IMPUESTOS';
      where.OR = [
        { concepto: { contains: 'SOCIEDADES', mode: 'insensitive' } },
      ];
    } else if (categoria === 'Aplazamientos AEAT') {
      where.categoria = 'IMPUESTOS';
      where.AND = [
        { NOT: { concepto: { contains: 'RET', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'INGRESO A CUENTA', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'SOCIEDADES', mode: 'insensitive' } } },
      ];
    } else if (categoria) {
      where.categoria = categoria;
    }
    
    if (conciliado === 'true') where.conciliado = true;
    if (conciliado === 'false') where.conciliado = false;
    if (desde) where.fechaOperacion = { ...where.fechaOperacion, gte: new Date(desde) };
    if (hasta) where.fechaOperacion = { ...where.fechaOperacion, lte: new Date(hasta) };

    // Filtros especiales
    const pendienteFactura = searchParams.get('pendienteFactura');
    if (pendienteFactura === 'true') where.pendienteFactura = true;
    const pagoACuentaVola = searchParams.get('pagoACuentaVola');
    if (pagoACuentaVola === 'true') where.pagoACuentaVola = true;
    const tipoDocumento = searchParams.get('tipoDocumento');
    if (tipoDocumento === 'null') {
      where.tipoDocumento = null;
    } else if (tipoDocumento) {
      where.tipoDocumento = tipoDocumento;
    }
    const documentoRecibido = searchParams.get('documentoRecibido');
    if (documentoRecibido === 'true') where.documentoRecibido = true;
    if (documentoRecibido === 'false') where.documentoRecibido = false;
    const sinDocumento = searchParams.get('sinDocumento');
    if (sinDocumento === 'true') {
      where.tipoDocumento = 'factura';
      where.documentoRecibido = false;
    }
    const entregaACuenta = searchParams.get('entregaACuenta');
    if (entregaACuenta === 'true') where.entregaACuentaEmpleadoId = { not: null };
    const tipo = searchParams.get('tipo');
    if (tipo === 'ingresos') where.importe = { gt: 0 };
    if (tipo === 'cargos') where.importe = { lt: 0 };

    // Filtros de niveles de conciliación
    const conProveedor = searchParams.get('conProveedor');
    if (conProveedor === 'true') where.entidadFiscalId = { not: null };
    const conFacturaRecibida = searchParams.get('conFacturaRecibida');
    if (conFacturaRecibida === 'true') where.facturaId = { not: null };
    const conFacturaEmitida = searchParams.get('conFacturaEmitida');
    if (conFacturaEmitida === 'true') where.facturaEmitidaId = { not: null };
    const sinProveedor = searchParams.get('sinProveedor');
    if (sinProveedor === 'true') {
      where.entidadFiscalId = null;
      where.importe = { lt: 0 };
    }

    const [movimientos, total] = await Promise.all([
      prisma.movimientoBancario.findMany({
        where,
        orderBy: { fechaOperacion: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          cuenta: { select: { banco: true, alias: true } },
          factura: { select: { id: true, proveedor: true, numFactura: true, total: true } },
          facturaEmitida: { select: { id: true, cliente: true, numFactura: true, total: true } },
          entregaACuentaEmpleado: { select: { id: true, nombreCompleto: true } },
          entidadFiscal: { select: { id: true, razonSocial: true, tipo: true, nifCif: true, cuentaContableA3: true } },
          nomina: { select: { id: true, mes: true, anio: true, netoPercibir: true, empleado: { select: { nombreCompleto: true } }, movimientos: { select: { id: true, importe: true } } } },
        },
      }),
      prisma.movimientoBancario.count({ where }),
    ]);

    return NextResponse.json({ movimientos, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
