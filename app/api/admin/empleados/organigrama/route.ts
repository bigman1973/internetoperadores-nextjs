import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { downloadCostesFile } from '@/lib/microsoft-graph';
import { parsePayrollProfessionalCategory } from '@/lib/nominas-parser';
import {
  EMPRESAS_GRUPO,
  activePositionWhere,
  endOfPreviousDay,
  normalizeOrganizationText,
  parseOrganizationDate,
} from '@/lib/organigrama';

export const maxDuration = 120;

const VIEW_ROLES = ['SUPER_ADMIN', 'GERENTE', 'RRHH'];

function serializePosition(position: any) {
  return {
    id: position.id,
    empleadoId: position.empleadoId,
    nombreCompleto: position.empleado.nombreCompleto,
    email: position.empleado.email,
    estadoEmpleado: position.empleado.estado,
    fechaAltaEmpleado: position.empleado.fechaAlta,
    empresaGrupo: position.empresaGrupo,
    departamento: position.departamento,
    cargo: position.cargo,
    categoria: position.categoriaNomina || position.empleado.categoria || 'Sin categoría',
    categoriaOrigen: position.categoriaOrigen,
    categoriaNominaMes: position.categoriaNominaMes,
    categoriaNominaAnio: position.categoriaNominaAnio,
    superiorId: position.superiorId,
    superiorNombre: position.superior?.nombreCompleto || null,
    dependenciaFuncionalId: position.dependenciaFuncionalId,
    dependenciaFuncionalNombre: position.dependenciaFuncional?.nombreCompleto || null,
    fechaInicio: position.fechaInicio,
    fechaFin: position.fechaFin,
    funciones: position.funciones,
    notas: position.notas,
    ordenOrganigrama: position.ordenOrganigrama,
    mostrarEnOrganigrama: position.mostrarEnOrganigrama,
  };
}

async function requireAccess(write = false) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  const role = session.user.role || '';
  if (write) {
    if (role !== 'SUPER_ADMIN') return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) };
    return { session };
  }
  if (!VIEW_ROLES.includes(role)) {
    const usuario = await prisma.usuarioAdmin.findUnique({
      where: { email: session.user.email },
      select: { perfilAsignado: true, permisos: true },
    });
    const hasGranularAccess = Boolean(usuario?.perfilAsignado) || (Array.isArray(usuario?.permisos) && (usuario.permisos as any[]).length > 0);
    if (!hasGranularAccess) return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) };
  }
  return { session };
}

async function validateHierarchy({
  empleadoId,
  superiorId,
  dependenciaFuncionalId,
  referenceDate,
}: {
  empleadoId: string;
  superiorId: string | null;
  dependenciaFuncionalId: string | null;
  referenceDate: Date;
}) {
  if (superiorId === empleadoId || dependenciaFuncionalId === empleadoId) {
    throw new Error('Una persona no puede depender de sí misma');
  }

  const positions = await prisma.puestoOrganizativo.findMany({
    where: activePositionWhere(referenceDate),
    select: { empleadoId: true, superiorId: true, dependenciaFuncionalId: true },
  });

  const ensureNoCycle = (candidateId: string | null, relation: 'superiorId' | 'dependenciaFuncionalId') => {
    if (!candidateId) return;
    const relationMap = new Map(positions.map(position => [position.empleadoId, position[relation]]));
    relationMap.set(empleadoId, candidateId);
    let cursor: string | null | undefined = candidateId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === empleadoId) throw new Error('La relación seleccionada produciría un ciclo en el organigrama');
      if (visited.has(cursor)) throw new Error('La jerarquía existente contiene un ciclo y debe revisarse');
      visited.add(cursor);
      cursor = relationMap.get(cursor);
    }
  };

  ensureNoCycle(superiorId, 'superiorId');
  ensureNoCycle(dependenciaFuncionalId, 'dependenciaFuncionalId');
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireAccess(false);
    if (access.error) return access.error;

    const { searchParams } = new URL(req.url);
    const fechaTexto = searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
    const fecha = parseOrganizationDate(fechaTexto, 'La fecha de consulta');
    const includeHistory = searchParams.get('historial') === '1';

    const [positions, employees, history] = await Promise.all([
      prisma.puestoOrganizativo.findMany({
        where: activePositionWhere(fecha),
        include: {
          empleado: { select: { id: true, nombreCompleto: true, email: true, categoria: true, estado: true, fechaAlta: true } },
          superior: { select: { id: true, nombreCompleto: true } },
          dependenciaFuncional: { select: { id: true, nombreCompleto: true } },
        },
        orderBy: [{ ordenOrganigrama: 'asc' }, { empleado: { nombreCompleto: 'asc' } }],
      }),
      prisma.empleado.findMany({
        where: { estado: 'ACTIVO' },
        select: { id: true, nombreCompleto: true, email: true, categoria: true, departamento: true },
        orderBy: { nombreCompleto: 'asc' },
      }),
      includeHistory
        ? prisma.puestoOrganizativo.findMany({
            include: {
              empleado: { select: { nombreCompleto: true, email: true, categoria: true, estado: true, fechaAlta: true } },
              superior: { select: { nombreCompleto: true } },
              dependenciaFuncional: { select: { nombreCompleto: true } },
            },
            orderBy: [{ empleado: { nombreCompleto: 'asc' } }, { fechaInicio: 'desc' }],
          })
        : Promise.resolve([]),
    ]);

    const serialized = positions.map(serializePosition);
    const assignedIds = new Set(serialized.map(position => position.empleadoId));

    return NextResponse.json({
      fecha: fechaTexto,
      puestos: serialized,
      historial: history.map(serializePosition),
      empleados: employees,
      empleadosSinPuesto: employees.filter(employee => !assignedIds.has(employee.id)),
      empresasGrupo: EMPRESAS_GRUPO,
      resumen: {
        empleados: serialized.length,
        empresas: new Set(serialized.map(position => position.empresaGrupo)).size,
        departamentos: new Set(serialized.map(position => position.departamento)).size,
        categoriasDesdeNomina: serialized.filter(position => position.categoriaOrigen === 'nomina').length,
        sinSuperior: serialized.filter(position => !position.superiorId).length,
        ocultos: serialized.filter(position => !position.mostrarEnOrganigrama).length,
      },
    });
  } catch (error: any) {
    console.error('Error en GET /api/admin/empleados/organigrama:', error);
    return NextResponse.json({ error: error.message || 'Error al cargar el organigrama' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireAccess(true);
    if (access.error) return access.error;
    const session = access.session!;
    const body = await req.json();
    const action = body.action || 'guardar';

    if (action === 'refrescar_categorias') {
      const employees = await prisma.empleado.findMany({
        where: { estado: 'ACTIVO' },
        select: {
          id: true,
          nombreCompleto: true,
          nominas: {
            where: { archivoUrl: { not: null } },
            orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
            take: 1,
            select: { id: true, anio: true, mes: true, archivoUrl: true, categoriaProfesional: true },
          },
        },
      });
      const resultados: Array<{ empleadoId: string; nombre: string; categoria: string | null; error?: string }> = [];
      for (const employee of employees) {
        const payroll = employee.nominas[0];
        if (!payroll?.archivoUrl) {
          resultados.push({ empleadoId: employee.id, nombre: employee.nombreCompleto, categoria: null, error: 'Sin PDF de nómina' });
          continue;
        }
        try {
          let category = payroll.categoriaProfesional;
          if (!category) {
            const fileId = payroll.archivoUrl.match(/\/api\/admin\/nominas\/download\/([^/?#]+)/)?.[1];
            if (!fileId) throw new Error('Referencia del PDF no válida');
            const pdfBuffer = await downloadCostesFile(fileId);
            category = await parsePayrollProfessionalCategory(Buffer.from(pdfBuffer));
          }
          if (!category) throw new Error('No se pudo identificar la categoría');
          await prisma.$transaction([
            prisma.nomina.update({
              where: { id: payroll.id },
              data: { categoriaProfesional: category, categoriaExtraidaAt: new Date() },
            }),
            prisma.puestoOrganizativo.updateMany({
              where: { empleadoId: employee.id, fechaFin: null },
              data: {
                categoriaNomina: category,
                categoriaNominaMes: payroll.mes,
                categoriaNominaAnio: payroll.anio,
                categoriaOrigen: 'nomina',
              },
            }),
          ]);
          resultados.push({ empleadoId: employee.id, nombre: employee.nombreCompleto, categoria: category });
        } catch (error: any) {
          resultados.push({ empleadoId: employee.id, nombre: employee.nombreCompleto, categoria: null, error: error.message });
        }
      }
      return NextResponse.json({
        success: true,
        actualizadas: resultados.filter(result => result.categoria).length,
        errores: resultados.filter(result => result.error).length,
        resultados,
      });
    }

    const empleadoId = normalizeOrganizationText(body.empleadoId, 80);
    const empresaGrupo = normalizeOrganizationText(body.empresaGrupo, 80);
    const departamento = normalizeOrganizationText(body.departamento, 120);
    const cargo = normalizeOrganizationText(body.cargo, 160);
    const superiorId = normalizeOrganizationText(body.superiorId, 80) || null;
    const dependenciaFuncionalId = normalizeOrganizationText(body.dependenciaFuncionalId, 80) || null;
    const fechaInicio = parseOrganizationDate(body.fechaInicio, 'La fecha de inicio');
    const funciones = normalizeOrganizationText(body.funciones, 3000) || null;
    const notas = normalizeOrganizationText(body.notas, 3000) || null;
    const preservarHistorico = body.preservarHistorico !== false;

    if (!empleadoId || !empresaGrupo || !departamento || !cargo) {
      return NextResponse.json({ error: 'Empleado, empresa, departamento y cargo son obligatorios' }, { status: 400 });
    }
    if (!EMPRESAS_GRUPO.includes(empresaGrupo as any)) {
      return NextResponse.json({ error: 'La empresa del grupo no es válida' }, { status: 400 });
    }

    const employee = await prisma.empleado.findUnique({
      where: { id: empleadoId },
      include: { nominas: { orderBy: [{ anio: 'desc' }, { mes: 'desc' }], take: 1 } },
    });
    if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    await validateHierarchy({ empleadoId, superiorId, dependenciaFuncionalId, referenceDate: fechaInicio });

    const current = await prisma.puestoOrganizativo.findFirst({
      where: { empleadoId, fechaFin: null },
      orderBy: { fechaInicio: 'desc' },
    });
    const latestPayroll = employee.nominas[0];
    const categoryData = {
      categoriaNomina: latestPayroll?.categoriaProfesional || current?.categoriaNomina || employee.categoria,
      categoriaNominaMes: latestPayroll?.categoriaProfesional ? latestPayroll.mes : current?.categoriaNominaMes,
      categoriaNominaAnio: latestPayroll?.categoriaProfesional ? latestPayroll.anio : current?.categoriaNominaAnio,
      categoriaOrigen: latestPayroll?.categoriaProfesional ? 'nomina' : (current?.categoriaOrigen || 'ficha_empleado'),
    };
    const commonData = {
      empresaGrupo,
      departamento,
      cargo,
      superiorId,
      dependenciaFuncionalId,
      funciones,
      notas,
      mostrarEnOrganigrama: body.mostrarEnOrganigrama !== false,
      ordenOrganigrama: Number.isFinite(Number(body.ordenOrganigrama)) ? Number(body.ordenOrganigrama) : (current?.ordenOrganigrama || 0),
      ...categoryData,
    };

    let saved;
    if (!current) {
      saved = await prisma.puestoOrganizativo.create({
        data: { empleadoId, fechaInicio, creadoPor: session.user.email, ...commonData },
      });
    } else if (preservarHistorico && fechaInicio.getTime() > current.fechaInicio.getTime()) {
      saved = await prisma.$transaction(async tx => {
        await tx.puestoOrganizativo.update({
          where: { id: current.id },
          data: { fechaFin: endOfPreviousDay(fechaInicio) },
        });
        return tx.puestoOrganizativo.create({
          data: { empleadoId, fechaInicio, creadoPor: session.user.email, ...commonData },
        });
      });
    } else {
      saved = await prisma.puestoOrganizativo.update({
        where: { id: current.id },
        data: { fechaInicio, ...commonData },
      });
    }

    return NextResponse.json({ success: true, puesto: saved });
  } catch (error: any) {
    console.error('Error en POST /api/admin/empleados/organigrama:', error);
    const status = /ciclo|sí misma|no es válida|obligatorios/.test(error.message || '') ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Error al guardar el organigrama' }, { status });
  }
}
