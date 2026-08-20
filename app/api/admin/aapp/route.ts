import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'documentos';
  const organismo = searchParams.get('organismo') || 'cnmc';
  const ejercicio = searchParams.get('ejercicio');
  const estado = searchParams.get('estado');
  const categoria = searchParams.get('categoria');

  try {
    if (action === 'documentos') {
      const where: any = { organismo };
      if (ejercicio) where.ejercicio = parseInt(ejercicio);
      if (estado) where.estado = estado;
      if (categoria) where.categoria = categoria;

      const documentos = await prisma.documentoAAPP.findMany({
        where,
        orderBy: { fechaDocumento: 'desc' },
        select: {
          id: true, organismo: true, categoria: true, titulo: true,
          descripcion: true, expediente: true, fechaDocumento: true,
          fechaNotificacion: true, fechaLimite: true, importe: true,
          estado: true, ejercicio: true, nombreArchivo: true, notas: true,
          grupoExpediente: true, ordenEnGrupo: true, createdAt: true
        }
      });
      return NextResponse.json({ documentos });
    }

    if (action === 'grupos') {
      // Devuelve documentos agrupados por grupoExpediente
      const docs = await prisma.documentoAAPP.findMany({
        where: { organismo, grupoExpediente: { not: null } },
        orderBy: [{ grupoExpediente: 'asc' }, { ordenEnGrupo: 'asc' }],
        select: {
          id: true, titulo: true, categoria: true, estado: true,
          fechaDocumento: true, importe: true, grupoExpediente: true,
          ordenEnGrupo: true, nombreArchivo: true
        }
      });
      // Agrupar por grupoExpediente
      const grupos: Record<string, any[]> = {};
      docs.forEach(d => {
        const g = d.grupoExpediente!;
        if (!grupos[g]) grupos[g] = [];
        grupos[g].push(d);
      });
      return NextResponse.json({ grupos });
    }

    if (action === 'pagos') {
      const pagos = await prisma.pagoFraccionado.findMany({
        where: { documento: { organismo } },
        include: { documento: { select: { id: true, titulo: true, grupoExpediente: true } } },
        orderBy: { fechaVencimiento: 'asc' }
      });
      // KPIs
      const totalPendiente = pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + Number(p.importe), 0);
      const totalPagado = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + Number(p.importe), 0);
      const proximoPago = pagos.find(p => p.estado === 'pendiente');
      return NextResponse.json({ pagos, totalPendiente, totalPagado, proximoPago });
    }

    if (action === 'obligaciones') {
      const obligaciones = await prisma.obligacionAAPP.findMany({
        where: { organismo, activa: true },
        orderBy: { mesVencimiento: 'asc' }
      });
      return NextResponse.json({ obligaciones });
    }

    if (action === 'resumen') {
      const [totalDocs, pendientes, pagados, vencidos] = await Promise.all([
        prisma.documentoAAPP.count({ where: { organismo } }),
        prisma.documentoAAPP.count({ where: { organismo, estado: 'pendiente' } }),
        prisma.documentoAAPP.count({ where: { organismo, estado: 'pagado' } }),
        prisma.documentoAAPP.count({ where: { organismo, estado: 'vencido' } }),
      ]);
      const importePendiente = await prisma.documentoAAPP.aggregate({
        where: { organismo, estado: 'pendiente', importe: { not: null } },
        _sum: { importe: true }
      });
      // Pagos fraccionados pendientes
      const pagosPendientes = await prisma.pagoFraccionado.aggregate({
        where: { estado: 'pendiente', documento: { organismo } },
        _sum: { importe: true },
        _count: true
      });
      return NextResponse.json({
        totalDocs, pendientes, pagados, vencidos,
        importePendiente: Number(importePendiente._sum.importe || 0),
        pagosPendientesImporte: Number(pagosPendientes._sum.importe || 0),
        pagosPendientesCount: pagosPendientes._count || 0
      });
    }

    if (action === 'pdf') {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
      const doc = await prisma.documentoAAPP.findUnique({
        where: { id: parseInt(id) },
        select: { archivoPdf: true, nombreArchivo: true }
      });
      if (!doc?.archivoPdf) return NextResponse.json({ error: 'PDF no encontrado' }, { status: 404 });
      const base64Data = doc.archivoPdf.replace(/^data:application\/pdf;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${doc.nombreArchivo || 'documento.pdf'}"`,
          'Content-Length': buffer.length.toString()
        }
      });
    }

    return NextResponse.json({ error: 'Accion no valida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'crear_documento') {
      const doc = await prisma.documentoAAPP.create({
        data: {
          organismo: body.organismo || 'cnmc',
          categoria: body.categoria || 'otro',
          titulo: body.titulo,
          descripcion: body.descripcion || null,
          expediente: body.expediente || null,
          fechaDocumento: new Date(body.fechaDocumento),
          fechaNotificacion: body.fechaNotificacion ? new Date(body.fechaNotificacion) : null,
          fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
          importe: body.importe ? parseFloat(body.importe) : null,
          estado: body.estado || 'pendiente',
          ejercicio: body.ejercicio ? parseInt(body.ejercicio) : null,
          archivoPdf: body.archivoPdf || null,
          nombreArchivo: body.nombreArchivo || null,
          notas: body.notas || null,
          grupoExpediente: body.grupoExpediente || null,
          ordenEnGrupo: body.ordenEnGrupo ? parseInt(body.ordenEnGrupo) : null
        }
      });
      return NextResponse.json({ ok: true, doc });
    }

    if (action === 'actualizar_documento') {
      const data: any = {};
      if (body.titulo !== undefined) data.titulo = body.titulo;
      if (body.descripcion !== undefined) data.descripcion = body.descripcion;
      if (body.expediente !== undefined) data.expediente = body.expediente;
      if (body.fechaDocumento !== undefined) data.fechaDocumento = new Date(body.fechaDocumento);
      if (body.fechaNotificacion !== undefined) data.fechaNotificacion = body.fechaNotificacion ? new Date(body.fechaNotificacion) : null;
      if (body.fechaLimite !== undefined) data.fechaLimite = body.fechaLimite ? new Date(body.fechaLimite) : null;
      if (body.importe !== undefined) data.importe = body.importe ? parseFloat(body.importe) : null;
      if (body.estado !== undefined) data.estado = body.estado;
      if (body.ejercicio !== undefined) data.ejercicio = body.ejercicio ? parseInt(body.ejercicio) : null;
      if (body.categoria !== undefined) data.categoria = body.categoria;
      if (body.archivoPdf !== undefined) data.archivoPdf = body.archivoPdf;
      if (body.nombreArchivo !== undefined) data.nombreArchivo = body.nombreArchivo;
      if (body.notas !== undefined) data.notas = body.notas;
      if (body.grupoExpediente !== undefined) data.grupoExpediente = body.grupoExpediente || null;
      if (body.ordenEnGrupo !== undefined) data.ordenEnGrupo = body.ordenEnGrupo ? parseInt(body.ordenEnGrupo) : null;

      const doc = await prisma.documentoAAPP.update({
        where: { id: body.id },
        data
      });
      return NextResponse.json({ ok: true, doc });
    }

    if (action === 'eliminar_documento') {
      await prisma.documentoAAPP.delete({ where: { id: body.id } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'crear_pago') {
      const pago = await prisma.pagoFraccionado.create({
        data: {
          documentoId: parseInt(body.documentoId),
          numeroCuota: parseInt(body.numeroCuota),
          totalCuotas: parseInt(body.totalCuotas),
          importe: parseFloat(body.importe),
          fechaVencimiento: new Date(body.fechaVencimiento),
          estado: body.estado || 'pendiente',
          fechaPago: body.fechaPago ? new Date(body.fechaPago) : null,
          referencia: body.referencia || null,
          notas: body.notas || null
        }
      });
      return NextResponse.json({ ok: true, pago });
    }

    if (action === 'actualizar_pago') {
      const data: any = {};
      if (body.estado !== undefined) data.estado = body.estado;
      if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null;
      if (body.referencia !== undefined) data.referencia = body.referencia;
      if (body.notas !== undefined) data.notas = body.notas;
      if (body.importe !== undefined) data.importe = parseFloat(body.importe);
      if (body.fechaVencimiento !== undefined) data.fechaVencimiento = new Date(body.fechaVencimiento);

      const pago = await prisma.pagoFraccionado.update({
        where: { id: body.id },
        data
      });
      return NextResponse.json({ ok: true, pago });
    }

    if (action === 'eliminar_pago') {
      await prisma.pagoFraccionado.delete({ where: { id: body.id } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'crear_obligacion') {
      const obl = await prisma.obligacionAAPP.create({
        data: {
          organismo: body.organismo || 'cnmc',
          nombre: body.nombre,
          descripcion: body.descripcion || null,
          periodicidad: body.periodicidad || 'anual',
          mesVencimiento: body.mesVencimiento ? parseInt(body.mesVencimiento) : null,
          diaVencimiento: body.diaVencimiento ? parseInt(body.diaVencimiento) : null,
          ejercicioActual: body.ejercicioActual ? parseInt(body.ejercicioActual) : null,
          estadoActual: body.estadoActual || 'pendiente',
          importeEstimado: body.importeEstimado ? parseFloat(body.importeEstimado) : null,
          notas: body.notas || null
        }
      });
      return NextResponse.json({ ok: true, obl });
    }

    if (action === 'actualizar_obligacion') {
      const data: any = {};
      if (body.nombre !== undefined) data.nombre = body.nombre;
      if (body.descripcion !== undefined) data.descripcion = body.descripcion;
      if (body.periodicidad !== undefined) data.periodicidad = body.periodicidad;
      if (body.mesVencimiento !== undefined) data.mesVencimiento = body.mesVencimiento ? parseInt(body.mesVencimiento) : null;
      if (body.diaVencimiento !== undefined) data.diaVencimiento = body.diaVencimiento ? parseInt(body.diaVencimiento) : null;
      if (body.ejercicioActual !== undefined) data.ejercicioActual = body.ejercicioActual ? parseInt(body.ejercicioActual) : null;
      if (body.estadoActual !== undefined) data.estadoActual = body.estadoActual;
      if (body.importeEstimado !== undefined) data.importeEstimado = body.importeEstimado ? parseFloat(body.importeEstimado) : null;
      if (body.notas !== undefined) data.notas = body.notas;
      if (body.activa !== undefined) data.activa = body.activa;

      const obl = await prisma.obligacionAAPP.update({
        where: { id: body.id },
        data
      });
      return NextResponse.json({ ok: true, obl });
    }

    return NextResponse.json({ error: 'Accion no valida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
