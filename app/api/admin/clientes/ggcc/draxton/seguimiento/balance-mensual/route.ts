import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Días laborables por mes (sin festivos, solo L-V)
function diasLaborablesMes(anio: number, mes: number): number {
  let count = 0;
  const diasEnMes = new Date(anio, mes, 0).getDate(); // mes es 1-indexed aquí
  for (let d = 1; d <= diasEnMes; d++) {
    const day = new Date(anio, mes - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// Días laborables que una persona estuvo activa en un mes dado
function diasLaborablesActivos(
  anio: number,
  mes: number,
  fechaInicioAsignacion: Date | null,
  fechaFinAsignacion: Date | null
): number {
  const primerDiaMes = new Date(anio, mes - 1, 1);
  const ultimoDiaMes = new Date(anio, mes, 0);

  // Determinar rango efectivo
  let inicio = primerDiaMes;
  let fin = ultimoDiaMes;

  if (fechaInicioAsignacion && fechaInicioAsignacion > primerDiaMes) {
    inicio = fechaInicioAsignacion;
  }
  if (fechaFinAsignacion && fechaFinAsignacion < ultimoDiaMes) {
    fin = fechaFinAsignacion;
  }

  // Si el rango no es válido (fin antes de inicio), 0 días
  if (fin < inicio) return 0;

  let count = 0;
  const current = new Date(inicio);
  while (current <= fin) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

interface BalanceMes {
  mes: number;
  mesNombre: string;
  anio: number;
  horasComprometidas: number;
  horasCubiertas: number;
  horasEquivalentes: number;
  saldoMes: number;
  saldoAcumulado: number;
  diasLaborables: number;
  detalle: {
    nombre: string;
    dedicacion: number;
    nivel: number;
    diasActivos: number;
    diasTotales: number;
    horasBase: number;
    horasEquiv: number;
    activo: boolean;
  }[];
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));
  const contratoId = searchParams.get('contratoId');

  try {
    // Obtener contratos de modalidad "horas" (o todos si no se especifica uno)
    const whereContrato: any = {
      estado: 'Activo',
      modalidadContrato: 'horas',
      horasContratadas: { not: null },
    };
    if (contratoId) {
      whereContrato.id = contratoId;
    }

    const contratos = await prisma.contratoDraxton.findMany({
      where: whereContrato,
      select: {
        id: true,
        titulo: true,
        horasContratadas: true,
        nivelContratado: true,
        importeMensual: true,
        fechaInicio: true,
        personalAsignado: {
          include: {
            empleado: { select: { nombreCompleto: true, estado: true, fechaBaja: true } },
          },
        },
      },
    });

    // También incluir contratos inactivos que tengan el ID solicitado
    if (contratoId && contratos.length === 0) {
      const contratoInactivo = await prisma.contratoDraxton.findUnique({
        where: { id: contratoId },
        select: {
          id: true,
          titulo: true,
          horasContratadas: true,
          nivelContratado: true,
          importeMensual: true,
          fechaInicio: true,
          personalAsignado: {
            include: {
              empleado: { select: { nombreCompleto: true, estado: true, fechaBaja: true } },
            },
          },
        },
      });
      if (contratoInactivo) contratos.push(contratoInactivo);
    }

    const resultado: {
      contrato: { id: string; titulo: string; horasContratadas: number; nivelContratado: number; importeMensual: number };
      meses: BalanceMes[];
      totalComprometidas: number;
      totalCubiertas: number;
      totalEquivalentes: number;
      saldoFinal: number;
    }[] = [];

    const mesActual = new Date().getMonth() + 1; // 1-12
    const anioActual = new Date().getFullYear();
    const mesLimite = anio === anioActual ? mesActual : 12;

    for (const contrato of contratos) {
      const horasContratadas = contrato.horasContratadas || 0;
      const nivelContratado = contrato.nivelContratado || 1;
      const personal = contrato.personalAsignado;

      const meses: BalanceMes[] = [];
      let saldoAcumulado = 0;
      let totalComprometidas = 0;
      let totalCubiertas = 0;
      let totalEquivalentes = 0;

      for (let m = 1; m <= mesLimite; m++) {
        const diasLab = diasLaborablesMes(anio, m);
        const HORAS_NETAS_MES = 128.67; // 1544h/año ÷ 12

        const detalle: BalanceMes['detalle'] = [];
        let horasCubiertasMes = 0;
        let horasEquivMes = 0;

        for (const p of personal) {
          const fechaInicioAsig = p.fechaInicio ? new Date(p.fechaInicio) : null;
          const fechaFinAsig = p.fechaFin ? new Date(p.fechaFin) : null;

          const diasActivos = diasLaborablesActivos(anio, m, fechaInicioAsig, fechaFinAsig);
          const proporcion = diasLab > 0 ? diasActivos / diasLab : 0;

          const horasBase = HORAS_NETAS_MES * (p.porcentajeDedicacion / 100) * proporcion;
          const multiplicador = (p.nivelTecnico || 1) / nivelContratado;
          const horasEquiv = horasBase * multiplicador;

          horasCubiertasMes += horasBase;
          horasEquivMes += horasEquiv;

          // Solo incluir en detalle si tuvo algún día activo o la asignación cubre este periodo
          const asignacionCubreMes = (
            (!fechaInicioAsig || fechaInicioAsig <= new Date(anio, m - 1, diasLab)) &&
            (!fechaFinAsig || fechaFinAsig >= new Date(anio, m - 1, 1))
          );

          if (asignacionCubreMes || diasActivos > 0) {
            detalle.push({
              nombre: p.empleado.nombreCompleto,
              dedicacion: p.porcentajeDedicacion,
              nivel: p.nivelTecnico || 1,
              diasActivos,
              diasTotales: diasLab,
              horasBase: Math.round(horasBase * 10) / 10,
              horasEquiv: Math.round(horasEquiv * 10) / 10,
              activo: diasActivos === diasLab,
            });
          }
        }

        const saldoMes = horasEquivMes - horasContratadas;
        saldoAcumulado += saldoMes;
        totalComprometidas += horasContratadas;
        totalCubiertas += horasCubiertasMes;
        totalEquivalentes += horasEquivMes;

        meses.push({
          mes: m,
          mesNombre: MESES[m - 1],
          anio,
          horasComprometidas: horasContratadas,
          horasCubiertas: Math.round(horasCubiertasMes * 10) / 10,
          horasEquivalentes: Math.round(horasEquivMes * 10) / 10,
          saldoMes: Math.round(saldoMes * 10) / 10,
          saldoAcumulado: Math.round(saldoAcumulado * 10) / 10,
          diasLaborables: diasLab,
          detalle,
        });
      }

      resultado.push({
        contrato: {
          id: contrato.id,
          titulo: contrato.titulo,
          horasContratadas,
          nivelContratado,
          importeMensual: Number(contrato.importeMensual) || 0,
        },
        meses,
        totalComprometidas,
        totalCubiertas: Math.round(totalCubiertas * 10) / 10,
        totalEquivalentes: Math.round(totalEquivalentes * 10) / 10,
        saldoFinal: Math.round(saldoAcumulado * 10) / 10,
      });
    }

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error('Error en balance mensual:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
