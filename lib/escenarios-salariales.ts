import prisma from '@/lib/prisma';
import { calculateEffectiveCompanyRate } from '@/lib/simulacion-salarial';

type ScenarioLineLike = {
  incluido: boolean;
  brutoActual: number | { toString(): string };
  brutoPropuesto: number | { toString(): string };
  costeEmpresaActual: number | { toString(): string };
  costeEmpresaPropuesto: number | { toString(): string };
  incrementoBrutoAnual: number | { toString(): string };
  incrementoCosteEmpresaAnual: number | { toString(): string };
};

export type ScenarioAdjustmentType = 'porcentaje' | 'importe';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const percentage = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const numeric = (value: number | { toString(): string }) => Number(value);

export function validateScenarioDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('La fecha efectiva no es válida.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha efectiva no es válida.');
  return date;
}

export function validateGeneralAdjustment(type: unknown, rawValue: unknown) {
  if (type !== 'porcentaje' && type !== 'importe') {
    throw new Error('El criterio general debe ser porcentaje o importe.');
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) throw new Error('El ajuste general no puede ser negativo.');
  if (type === 'porcentaje' && value > 100) throw new Error('El porcentaje general no puede superar el 100 %.');
  if (type === 'importe' && value > 100000) throw new Error('El importe general supera el límite permitido.');
  return { type: type as ScenarioAdjustmentType, value };
}

export function proposedGrossFromGeneral(currentGross: number, type: ScenarioAdjustmentType, value: number) {
  return money(type === 'porcentaje' ? currentGross * (1 + value / 100) : currentGross + value);
}

export function calculateScenarioLine(currentGross: number, proposedGross: number, companyRate: number) {
  if (!Number.isFinite(currentGross) || currentGross <= 0) throw new Error('El salario actual no es válido.');
  if (!Number.isFinite(proposedGross) || proposedGross <= 0) throw new Error('El salario propuesto debe ser superior a cero.');
  const safeRate = Math.min(0.6, Math.max(0, companyRate));
  const currentCompanyCost = money(currentGross * (1 + safeRate));
  const proposedCompanyCost = money(proposedGross * (1 + safeRate));
  const grossIncrease = money(proposedGross - currentGross);
  return {
    brutoActual: money(currentGross),
    brutoPropuesto: money(proposedGross),
    tasaSSEmpresa: percentage(safeRate),
    costeEmpresaActual: currentCompanyCost,
    costeEmpresaPropuesto: proposedCompanyCost,
    porcentajeSubida: percentage((grossIncrease / currentGross) * 100),
    incrementoBrutoAnual: grossIncrease,
    incrementoCosteEmpresaAnual: money(proposedCompanyCost - currentCompanyCost),
  };
}

export function summarizeScenario(lines: ScenarioLineLike[], effectiveDate: Date) {
  const included = lines.filter(line => line.incluido);
  const totals = included.reduce((result, line) => {
    result.brutoActual += numeric(line.brutoActual);
    result.brutoPropuesto += numeric(line.brutoPropuesto);
    result.costeEmpresaActual += numeric(line.costeEmpresaActual);
    result.costeEmpresaPropuesto += numeric(line.costeEmpresaPropuesto);
    result.incrementoBrutoAnual += numeric(line.incrementoBrutoAnual);
    result.incrementoCosteEmpresaAnual += numeric(line.incrementoCosteEmpresaAnual);
    return result;
  }, {
    brutoActual: 0,
    brutoPropuesto: 0,
    costeEmpresaActual: 0,
    costeEmpresaPropuesto: 0,
    incrementoBrutoAnual: 0,
    incrementoCosteEmpresaAnual: 0,
  });
  const months = 12 - effectiveDate.getUTCMonth();
  return {
    empleadosIncluidos: included.length,
    empleadosExcluidos: lines.length - included.length,
    brutoActual: money(totals.brutoActual),
    brutoPropuesto: money(totals.brutoPropuesto),
    incrementoBrutoAnual: money(totals.incrementoBrutoAnual),
    porcentajeMedioPonderado: percentage(totals.brutoActual > 0 ? (totals.incrementoBrutoAnual / totals.brutoActual) * 100 : 0),
    costeEmpresaActual: money(totals.costeEmpresaActual),
    costeEmpresaPropuesto: money(totals.costeEmpresaPropuesto),
    incrementoCosteEmpresaAnual: money(totals.incrementoCosteEmpresaAnual),
    incrementoCosteEmpresaMensual: money(totals.incrementoCosteEmpresaAnual / 12),
    mesesImpactoEjercicio: months,
    impactoCosteEmpresaEjercicio: money((totals.incrementoCosteEmpresaAnual / 12) * months),
  };
}

export async function buildScenarioSnapshot(fechaEfectiva: Date, type: ScenarioAdjustmentType, value: number) {
  const year = fechaEfectiva.getUTCFullYear();
  const month = fechaEfectiva.getUTCMonth() + 1;
  const employees = await prisma.empleado.findMany({
    where: { estado: 'ACTIVO' },
    orderBy: { nombreCompleto: 'asc' },
    select: {
      id: true,
      nombreCompleto: true,
      email: true,
      categoria: true,
      condicionesSalariales: {
        where: { fechaEfectiva: { lte: fechaEfectiva } },
        orderBy: { fechaEfectiva: 'desc' },
        take: 1,
        select: { brutoAnual: true, fechaEfectiva: true },
      },
      nominas: {
        where: {
          OR: [
            { anio: { lt: year } },
            { anio: year, mes: { lte: month } },
          ],
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        take: 6,
        select: {
          anio: true,
          mes: true,
          devengadoTotal: true,
          baseSS: true,
          ssEmpresa: true,
          gastosDesplazamiento: true,
        },
      },
    },
  });

  return employees.map(employee => {
    const condition = employee.condicionesSalariales[0] || null;
    const payroll = employee.nominas[0] || null;
    const currentGross = condition?.brutoAnual || (payroll ? payroll.devengadoTotal * 12 : 0);
    if (!Number.isFinite(currentGross) || currentGross <= 0) {
      throw new Error(`No existe una base salarial válida para ${employee.nombreCompleto}.`);
    }
    const rate = calculateEffectiveCompanyRate(employee.nominas);
    const proposedGross = proposedGrossFromGeneral(currentGross, type, value);
    const calculation = calculateScenarioLine(currentGross, proposedGross, rate.rate);
    return {
      empleadoId: employee.id,
      empleadoNombre: employee.nombreCompleto,
      empleadoEmail: employee.email,
      categoria: employee.categoria,
      incluido: true,
      ...calculation,
      origenSalario: condition ? 'condicion_salarial' : 'ultima_nomina',
      referenciaFecha: condition?.fechaEfectiva || (payroll ? new Date(Date.UTC(payroll.anio, payroll.mes - 1, 1)) : null),
      nominasUtilizadas: rate.samples,
      notas: null,
    };
  });
}

export function serializeScenarioLine<T extends Record<string, unknown>>(line: T) {
  const moneyFields = [
    'brutoActual',
    'brutoPropuesto',
    'tasaSSEmpresa',
    'costeEmpresaActual',
    'costeEmpresaPropuesto',
    'porcentajeSubida',
    'incrementoBrutoAnual',
    'incrementoCosteEmpresaAnual',
  ];
  return Object.fromEntries(Object.entries(line).map(([key, value]) => {
    if (moneyFields.includes(key) && value !== null && value !== undefined) return [key, Number(value)];
    if (value instanceof Date) return [key, value.toISOString()];
    return [key, value];
  }));
}

export function serializeScenario<T extends { lineas: Array<Record<string, unknown>>; fechaEfectiva: Date; snapshotFecha: Date; createdAt: Date; updatedAt: Date; valorAjusteGeneral: unknown }>(scenario: T) {
  const lineas = scenario.lineas.map(serializeScenarioLine);
  return {
    ...scenario,
    fechaEfectiva: scenario.fechaEfectiva.toISOString().slice(0, 10),
    snapshotFecha: scenario.snapshotFecha.toISOString(),
    createdAt: scenario.createdAt.toISOString(),
    updatedAt: scenario.updatedAt.toISOString(),
    valorAjusteGeneral: Number(scenario.valorAjusteGeneral),
    lineas,
    resumen: summarizeScenario(lineas as unknown as ScenarioLineLike[], scenario.fechaEfectiva),
  };
}
