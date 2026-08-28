import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  buildScenarioSnapshot,
  calculateScenarioLine,
  proposedGrossFromGeneral,
  serializeScenario,
  validateGeneralAdjustment,
  validateScenarioDate,
} from '@/lib/escenarios-salariales';

export const dynamic = 'force-dynamic';

const scenarioInclude = {
  lineas: { orderBy: { empleadoNombre: 'asc' as const } },
};

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new ApiError('No autenticado', 401);
  if (session.user.role !== 'SUPER_ADMIN') throw new ApiError('Los escenarios salariales son exclusivos para SUPER_ADMIN', 403);
  return session.user.email;
}

class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function responseError(error: unknown) {
  console.error('Error en escenarios salariales:', error);
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : 'No se pudo completar la operación';
  return NextResponse.json({ error: message }, { status: 400 });
}

async function loadScenario(id: string) {
  const scenario = await prisma.escenarioSalarial.findUnique({ where: { id }, include: scenarioInclude });
  if (!scenario) throw new ApiError('Escenario no encontrado', 404);
  return scenario;
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const scenario = await loadScenario(id);
      return NextResponse.json({ escenario: serializeScenario(scenario) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const scenarios = await prisma.escenarioSalarial.findMany({
      include: scenarioInclude,
      orderBy: [{ updatedAt: 'desc' }],
    });
    return NextResponse.json({ escenarios: scenarios.map(serializeScenario) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userEmail = await requireSuperAdmin();
    const body = await req.json();

    if (body.action === 'duplicar') {
      const sourceId = typeof body.id === 'string' ? body.id : '';
      if (!sourceId) throw new ApiError('Falta el escenario que se desea duplicar');
      const source = await loadScenario(sourceId);
      const duplicated = await prisma.escenarioSalarial.create({
        data: {
          nombre: typeof body.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : `Copia de ${source.nombre}`,
          fechaEfectiva: source.fechaEfectiva,
          tipoAjusteGeneral: source.tipoAjusteGeneral,
          valorAjusteGeneral: source.valorAjusteGeneral,
          estado: 'borrador',
          notas: source.notas,
          creadoPor: userEmail,
          snapshotFecha: new Date(),
          lineas: {
            create: source.lineas.map(line => ({
              empleadoId: line.empleadoId,
              empleadoNombre: line.empleadoNombre,
              empleadoEmail: line.empleadoEmail,
              categoria: line.categoria,
              incluido: line.incluido,
              brutoActual: line.brutoActual,
              brutoPropuesto: line.brutoPropuesto,
              tasaSSEmpresa: line.tasaSSEmpresa,
              costeEmpresaActual: line.costeEmpresaActual,
              costeEmpresaPropuesto: line.costeEmpresaPropuesto,
              porcentajeSubida: line.porcentajeSubida,
              incrementoBrutoAnual: line.incrementoBrutoAnual,
              incrementoCosteEmpresaAnual: line.incrementoCosteEmpresaAnual,
              origenSalario: line.origenSalario,
              referenciaFecha: line.referenciaFecha,
              nominasUtilizadas: line.nominasUtilizadas,
              notas: line.notas,
            })),
          },
        },
        include: scenarioInclude,
      });
      return NextResponse.json({ escenario: serializeScenario(duplicated) }, { status: 201 });
    }

    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    if (!nombre) throw new ApiError('El nombre del escenario es obligatorio');
    if (nombre.length > 160) throw new ApiError('El nombre del escenario es demasiado largo');
    const fechaEfectiva = validateScenarioDate(body.fechaEfectiva);
    const adjustment = validateGeneralAdjustment(body.tipoAjusteGeneral, body.valorAjusteGeneral);
    const snapshot = await buildScenarioSnapshot(fechaEfectiva, adjustment.type, adjustment.value);
    if (snapshot.length === 0) throw new ApiError('No hay empleados activos para crear el escenario');

    const scenario = await prisma.escenarioSalarial.create({
      data: {
        nombre,
        fechaEfectiva,
        tipoAjusteGeneral: adjustment.type,
        valorAjusteGeneral: adjustment.value,
        estado: 'borrador',
        notas: typeof body.notas === 'string' ? body.notas.trim() || null : null,
        creadoPor: userEmail,
        snapshotFecha: new Date(),
        lineas: { create: snapshot },
      },
      include: scenarioInclude,
    });
    return NextResponse.json({ escenario: serializeScenario(scenario) }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'actualizar_linea') {
      const lineId = typeof body.lineaId === 'string' ? body.lineaId : '';
      if (!lineId) throw new ApiError('Falta la línea salarial');
      const line = await prisma.lineaEscenarioSalarial.findUnique({ where: { id: lineId }, include: { escenario: true } });
      if (!line) throw new ApiError('Línea salarial no encontrada', 404);
      if (line.escenario.estado === 'descartado') throw new ApiError('Un escenario descartado no se puede modificar');
      const proposedGross = Number(body.brutoPropuesto ?? line.brutoPropuesto);
      const calculation = calculateScenarioLine(Number(line.brutoActual), proposedGross, Number(line.tasaSSEmpresa));
      await prisma.lineaEscenarioSalarial.update({
        where: { id: lineId },
        data: {
          ...calculation,
          incluido: typeof body.incluido === 'boolean' ? body.incluido : line.incluido,
          notas: typeof body.notas === 'string' ? body.notas.trim() || null : line.notas,
        },
      });
      const scenario = await loadScenario(line.escenarioId);
      return NextResponse.json({ escenario: serializeScenario(scenario) });
    }

    if (action === 'recalcular_general') {
      const id = typeof body.id === 'string' ? body.id : '';
      const scenario = await loadScenario(id);
      if (scenario.estado === 'descartado') throw new ApiError('Un escenario descartado no se puede recalcular');
      const adjustment = validateGeneralAdjustment(body.tipoAjusteGeneral, body.valorAjusteGeneral);
      await prisma.$transaction([
        prisma.escenarioSalarial.update({
          where: { id },
          data: { tipoAjusteGeneral: adjustment.type, valorAjusteGeneral: adjustment.value },
        }),
        ...scenario.lineas.map(line => {
          const currentGross = Number(line.brutoActual);
          const proposedGross = proposedGrossFromGeneral(currentGross, adjustment.type, adjustment.value);
          return prisma.lineaEscenarioSalarial.update({
            where: { id: line.id },
            data: calculateScenarioLine(currentGross, proposedGross, Number(line.tasaSSEmpresa)),
          });
        }),
      ]);
      return NextResponse.json({ escenario: serializeScenario(await loadScenario(id)) });
    }

    if (action === 'actualizar') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) throw new ApiError('Falta el escenario');
      const current = await loadScenario(id);
      const allowedStates = ['borrador', 'revisado', 'descartado'];
      const state = typeof body.estado === 'string' ? body.estado : current.estado;
      if (!allowedStates.includes(state)) throw new ApiError('El estado del escenario no es válido');
      const name = typeof body.nombre === 'string' ? body.nombre.trim() : current.nombre;
      if (!name) throw new ApiError('El nombre del escenario es obligatorio');
      const updated = await prisma.escenarioSalarial.update({
        where: { id },
        data: {
          nombre: name,
          notas: typeof body.notas === 'string' ? body.notas.trim() || null : current.notas,
          estado: state,
        },
        include: scenarioInclude,
      });
      return NextResponse.json({ escenario: serializeScenario(updated) });
    }

    throw new ApiError('Acción no reconocida');
  } catch (error) {
    return responseError(error);
  }
}
