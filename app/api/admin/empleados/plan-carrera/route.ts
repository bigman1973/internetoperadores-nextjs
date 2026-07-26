import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET: Obtener plan de carrera completo de un empleado
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get('empleadoId');

  if (!empleadoId) {
    return NextResponse.json({ error: 'empleadoId es obligatorio' }, { status: 400 });
  }

  const [objetivos, evaluaciones, formaciones, condiciones] = await Promise.all([
    prisma.objetivoEmpleado.findMany({
      where: { empleadoId },
      orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.evaluacionDesempeno.findMany({
      where: { empleadoId },
      orderBy: [{ fecha: 'desc' }],
    }),
    prisma.formacionEmpleado.findMany({
      where: { empleadoId },
      orderBy: [{ fechaInicio: 'desc' }],
    }),
    prisma.condicionSalarial.findMany({
      where: { empleadoId },
      orderBy: [{ fechaEfectiva: 'desc' }],
    }),
  ]);

  return NextResponse.json({ objetivos, evaluaciones, formaciones, condiciones });
}

// POST: Crear objetivo, evaluación o formación
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { tipo, ...data } = body;

  if (!tipo || !data.empleadoId) {
    return NextResponse.json({ error: 'tipo y empleadoId son obligatorios' }, { status: 400 });
  }

  let result;

  switch (tipo) {
    case 'objetivo':
      result = await prisma.objetivoEmpleado.create({
        data: {
          empleadoId: data.empleadoId,
          titulo: data.titulo,
          descripcion: data.descripcion || null,
          categoria: data.categoria || 'rendimiento',
          periodo: data.periodo || null,
          fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null,
          fechaLimite: data.fechaLimite ? new Date(data.fechaLimite) : null,
          estado: data.estado || 'pendiente',
          progreso: data.progreso || 0,
          peso: data.peso || 1,
          resultado: data.resultado || null,
          creadoPor: session.user?.email || null,
        },
      });
      break;

    case 'evaluacion':
      result = await prisma.evaluacionDesempeno.create({
        data: {
          empleadoId: data.empleadoId,
          periodo: data.periodo,
          fecha: new Date(data.fecha),
          evaluador: data.evaluador || session.user?.email || null,
          puntuacion: data.puntuacion ? parseInt(data.puntuacion) : null,
          fortalezas: data.fortalezas || null,
          areasMetjora: data.areasMejora || null,
          comentarios: data.comentarios || null,
          accionesAcordadas: data.accionesAcordadas || null,
          proximaRevision: data.proximaRevision ? new Date(data.proximaRevision) : null,
        },
      });
      break;

    case 'formacion':
      result = await prisma.formacionEmpleado.create({
        data: {
          empleadoId: data.empleadoId,
          titulo: data.titulo,
          tipo: data.tipoFormacion || 'curso',
          proveedor: data.proveedor || null,
          estado: data.estado || 'planificado',
          fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null,
          fechaFin: data.fechaFin ? new Date(data.fechaFin) : null,
          horas: data.horas ? parseInt(data.horas) : null,
          coste: data.coste ? parseFloat(data.coste) : null,
          certificado: data.certificado || false,
          urlCertificado: data.urlCertificado || null,
          notas: data.notas || null,
        },
      });
      break;

    default:
      return NextResponse.json({ error: 'tipo debe ser objetivo, evaluacion o formacion' }, { status: 400 });
  }

  return NextResponse.json(result, { status: 201 });
}

// PUT: Actualizar objetivo, evaluación o formación
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { tipo, id, ...data } = body;

  if (!tipo || !id) {
    return NextResponse.json({ error: 'tipo e id son obligatorios' }, { status: 400 });
  }

  let result;

  switch (tipo) {
    case 'objetivo':
      result = await prisma.objetivoEmpleado.update({
        where: { id },
        data: {
          ...(data.titulo !== undefined && { titulo: data.titulo }),
          ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
          ...(data.categoria !== undefined && { categoria: data.categoria }),
          ...(data.periodo !== undefined && { periodo: data.periodo }),
          ...(data.fechaInicio !== undefined && { fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null }),
          ...(data.fechaLimite !== undefined && { fechaLimite: data.fechaLimite ? new Date(data.fechaLimite) : null }),
          ...(data.estado !== undefined && { estado: data.estado }),
          ...(data.progreso !== undefined && { progreso: parseInt(data.progreso) }),
          ...(data.peso !== undefined && { peso: parseInt(data.peso) }),
          ...(data.resultado !== undefined && { resultado: data.resultado }),
        },
      });
      break;

    case 'evaluacion':
      result = await prisma.evaluacionDesempeno.update({
        where: { id },
        data: {
          ...(data.periodo !== undefined && { periodo: data.periodo }),
          ...(data.fecha !== undefined && { fecha: new Date(data.fecha) }),
          ...(data.evaluador !== undefined && { evaluador: data.evaluador }),
          ...(data.puntuacion !== undefined && { puntuacion: data.puntuacion ? parseInt(data.puntuacion) : null }),
          ...(data.fortalezas !== undefined && { fortalezas: data.fortalezas }),
          ...(data.areasMejora !== undefined && { areasMetjora: data.areasMejora }),
          ...(data.comentarios !== undefined && { comentarios: data.comentarios }),
          ...(data.accionesAcordadas !== undefined && { accionesAcordadas: data.accionesAcordadas }),
          ...(data.proximaRevision !== undefined && { proximaRevision: data.proximaRevision ? new Date(data.proximaRevision) : null }),
        },
      });
      break;

    case 'formacion':
      result = await prisma.formacionEmpleado.update({
        where: { id },
        data: {
          ...(data.titulo !== undefined && { titulo: data.titulo }),
          ...(data.tipoFormacion !== undefined && { tipo: data.tipoFormacion }),
          ...(data.proveedor !== undefined && { proveedor: data.proveedor }),
          ...(data.estado !== undefined && { estado: data.estado }),
          ...(data.fechaInicio !== undefined && { fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null }),
          ...(data.fechaFin !== undefined && { fechaFin: data.fechaFin ? new Date(data.fechaFin) : null }),
          ...(data.horas !== undefined && { horas: data.horas ? parseInt(data.horas) : null }),
          ...(data.coste !== undefined && { coste: data.coste ? parseFloat(data.coste) : null }),
          ...(data.certificado !== undefined && { certificado: data.certificado }),
          ...(data.urlCertificado !== undefined && { urlCertificado: data.urlCertificado }),
          ...(data.notas !== undefined && { notas: data.notas }),
        },
      });
      break;

    default:
      return NextResponse.json({ error: 'tipo debe ser objetivo, evaluacion o formacion' }, { status: 400 });
  }

  return NextResponse.json(result);
}

// DELETE: Eliminar objetivo, evaluación o formación
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo');
  const id = searchParams.get('id');

  if (!tipo || !id) {
    return NextResponse.json({ error: 'tipo e id son obligatorios' }, { status: 400 });
  }

  switch (tipo) {
    case 'objetivo':
      await prisma.objetivoEmpleado.delete({ where: { id } });
      break;
    case 'evaluacion':
      await prisma.evaluacionDesempeno.delete({ where: { id } });
      break;
    case 'formacion':
      await prisma.formacionEmpleado.delete({ where: { id } });
      break;
    default:
      return NextResponse.json({ error: 'tipo debe ser objetivo, evaluacion o formacion' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
