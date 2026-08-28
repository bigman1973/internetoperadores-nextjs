export const HORAS_JORNADA_DIARIA = 8;
export const FECHA_INICIO_CONTROL_IMPUTACIONES = '2026-09-01';

export type EstadoBalanceDia =
  | 'COMPLETO'
  | 'PARCIAL'
  | 'SIN_IMPUTAR'
  | 'EN_CURSO'
  | 'EXCESO'
  | 'VACACIONES'
  | 'PERMISO'
  | 'BAJA'
  | 'FUTURO'
  | 'FUERA_CONTROL'
  | 'NO_ACTIVO';

export interface EmpleadoBalanceInput {
  id: string;
  nombreCompleto: string;
  departamento: string | null;
  fechaAlta: Date | null;
  fechaBaja: Date | null;
}

export interface ImputacionBalanceInput {
  empleadoId: string;
  fecha: Date;
  horas: number;
  registros: number;
}

export interface AusenciaBalanceInput {
  empleadoId: string | null;
  empleadoNombre: string;
  tipo: 'VACACIONES' | 'PERMISO' | 'BAJA';
  estado: 'PENDIENTE' | 'APROBADO' | 'DENEGADO' | 'SOLICITADO';
  fechaInicio: Date;
  fechaFin: Date;
  horaInicio: string | null;
  horaFin: string | null;
  tipoPermiso: string | null;
}

export interface BalanceDia {
  fecha: string;
  diaSemana: string;
  numeroDia: number;
  esHoy: boolean;
  horasEsperadas: number;
  horasImputadas: number;
  horasPendientes: number;
  registros: number;
  estado: EstadoBalanceDia;
  ausencia: null | {
    tipo: 'VACACIONES' | 'PERMISO' | 'BAJA';
    estado: 'PENDIENTE' | 'APROBADO' | 'SOLICITADO';
    detalle: string | null;
  };
}

export interface BalanceEmpleado {
  empleadoId: string;
  nombre: string;
  departamento: string | null;
  dias: BalanceDia[];
  resumen: {
    horasEsperadasHastaHoy: number;
    horasImputadasHastaHoy: number;
    horasPendientesVencidas: number;
    horasPendientesHoy: number;
    diasCompletos: number;
    diasPendientesVencidos: number;
    diasAusencia: number;
    coberturaPct: number | null;
  };
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const PRIORIDAD_AUSENCIA: Record<AusenciaBalanceInput['tipo'], number> = {
  BAJA: 3,
  VACACIONES: 2,
  PERMISO: 1,
};

export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function getMadridTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function getWorkWeek(referenceIso: string): { startDate: Date; endDate: Date; days: Date[] } {
  const reference = parseDateOnly(referenceIso);
  const day = reference.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const startDate = new Date(reference);
  startDate.setUTCDate(reference.getUTCDate() + offsetToMonday);
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    return date;
  });
  return { startDate, endDate: days[4], days };
}

function normalizedNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function isEmployeeActiveOn(employee: EmpleadoBalanceInput, dayIso: string): boolean {
  const startIso = employee.fechaAlta ? dateToIso(employee.fechaAlta) : null;
  const endIso = employee.fechaBaja ? dateToIso(employee.fechaBaja) : null;
  if (startIso && dayIso < startIso) return false;
  if (endIso && dayIso > endIso) return false;
  return true;
}

function absenceDetail(absence: AusenciaBalanceInput): string | null {
  if (absence.tipo === 'PERMISO' && absence.tipoPermiso) return absence.tipoPermiso;
  if (absence.horaInicio || absence.horaFin) {
    return [absence.horaInicio, absence.horaFin].filter(Boolean).join('–');
  }
  return null;
}

export function buildDailyTimesheetBalance({
  referenceIso,
  todayIso,
  employees,
  imputations,
  absences,
  controlStartIso = FECHA_INICIO_CONTROL_IMPUTACIONES,
}: {
  referenceIso: string;
  todayIso: string;
  employees: EmpleadoBalanceInput[];
  imputations: ImputacionBalanceInput[];
  absences: AusenciaBalanceInput[];
  controlStartIso?: string;
}) {
  const week = getWorkWeek(referenceIso);
  const hoursByEmployeeDay = new Map<string, { hours: number; records: number }>();
  imputations.forEach((entry) => {
    const key = `${entry.empleadoId}:${dateToIso(entry.fecha)}`;
    const current = hoursByEmployeeDay.get(key) || { hours: 0, records: 0 };
    current.hours += entry.horas;
    current.records += entry.registros;
    hoursByEmployeeDay.set(key, current);
  });

  const employeeByName = new Map(employees.map((employee) => [normalizedNameKey(employee.nombreCompleto), employee.id]));
  const absencesByEmployeeDay = new Map<string, AusenciaBalanceInput>();
  absences.forEach((absence) => {
    const resolvedEmployeeId = absence.empleadoId || employeeByName.get(normalizedNameKey(absence.empleadoNombre));
    if (!resolvedEmployeeId) return;
    const startIso = dateToIso(absence.fechaInicio) > dateToIso(week.startDate) ? dateToIso(absence.fechaInicio) : dateToIso(week.startDate);
    const endIso = dateToIso(absence.fechaFin) < dateToIso(week.endDate) ? dateToIso(absence.fechaFin) : dateToIso(week.endDate);
    for (let cursor = parseDateOnly(startIso); dateToIso(cursor) <= endIso; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const dayIso = dateToIso(cursor);
      const key = `${resolvedEmployeeId}:${dayIso}`;
      const existing = absencesByEmployeeDay.get(key);
      if (!existing || PRIORIDAD_AUSENCIA[absence.tipo] > PRIORIDAD_AUSENCIA[existing.tipo]) {
        absencesByEmployeeDay.set(key, absence);
      }
    }
  });

  const employeeBalances: BalanceEmpleado[] = employees.map((employee) => {
    const days: BalanceDia[] = week.days.map((day) => {
      const dayIso = dateToIso(day);
      const entries = hoursByEmployeeDay.get(`${employee.id}:${dayIso}`) || { hours: 0, records: 0 };
      const hours = Math.round(entries.hours * 100) / 100;
      const absence = absencesByEmployeeDay.get(`${employee.id}:${dayIso}`) || null;
      const isToday = dayIso === todayIso;
      const isFuture = dayIso > todayIso;
      const isActive = isEmployeeActiveOn(employee, dayIso);

      if (!isActive) {
        return {
          fecha: dayIso,
          diaSemana: DIAS_SEMANA[day.getUTCDay()],
          numeroDia: day.getUTCDate(),
          esHoy: isToday,
          horasEsperadas: 0,
          horasImputadas: hours,
          horasPendientes: 0,
          registros: entries.records,
          estado: 'NO_ACTIVO' as const,
          ausencia: null,
        };
      }

      if (absence) {
        return {
          fecha: dayIso,
          diaSemana: DIAS_SEMANA[day.getUTCDay()],
          numeroDia: day.getUTCDate(),
          esHoy: isToday,
          horasEsperadas: 0,
          horasImputadas: hours,
          horasPendientes: 0,
          registros: entries.records,
          estado: absence.tipo,
          ausencia: {
            tipo: absence.tipo,
            estado: absence.estado as 'PENDIENTE' | 'APROBADO' | 'SOLICITADO',
            detalle: absenceDetail(absence),
          },
        };
      }

      if (dayIso < controlStartIso) {
        return {
          fecha: dayIso,
          diaSemana: DIAS_SEMANA[day.getUTCDay()],
          numeroDia: day.getUTCDate(),
          esHoy: isToday,
          horasEsperadas: 0,
          horasImputadas: hours,
          horasPendientes: 0,
          registros: entries.records,
          estado: 'FUERA_CONTROL' as const,
          ausencia: null,
        };
      }

      if (isFuture) {
        return {
          fecha: dayIso,
          diaSemana: DIAS_SEMANA[day.getUTCDay()],
          numeroDia: day.getUTCDate(),
          esHoy: false,
          horasEsperadas: HORAS_JORNADA_DIARIA,
          horasImputadas: hours,
          horasPendientes: 0,
          registros: entries.records,
          estado: 'FUTURO' as const,
          ausencia: null,
        };
      }

      const pending = Math.max(0, HORAS_JORNADA_DIARIA - hours);
      let state: EstadoBalanceDia;
      if (hours > HORAS_JORNADA_DIARIA) state = 'EXCESO';
      else if (hours === HORAS_JORNADA_DIARIA) state = 'COMPLETO';
      else if (isToday) state = 'EN_CURSO';
      else if (hours > 0) state = 'PARCIAL';
      else state = 'SIN_IMPUTAR';

      return {
        fecha: dayIso,
        diaSemana: DIAS_SEMANA[day.getUTCDay()],
        numeroDia: day.getUTCDate(),
        esHoy: isToday,
        horasEsperadas: HORAS_JORNADA_DIARIA,
        horasImputadas: hours,
        horasPendientes: pending,
        registros: entries.records,
        estado: state,
        ausencia: null,
      };
    });

    const elapsedWorkDays = days.filter((day) => day.horasEsperadas > 0 && day.fecha <= todayIso);
    const pastWorkDays = days.filter((day) => day.horasEsperadas > 0 && day.fecha < todayIso);
    const expected = elapsedWorkDays.reduce((sum, day) => sum + day.horasEsperadas, 0);
    const covered = elapsedWorkDays.reduce((sum, day) => sum + Math.min(day.horasEsperadas, day.horasImputadas), 0);

    return {
      empleadoId: employee.id,
      nombre: employee.nombreCompleto,
      departamento: employee.departamento,
      dias: days,
      resumen: {
        horasEsperadasHastaHoy: expected,
        horasImputadasHastaHoy: elapsedWorkDays.reduce((sum, day) => sum + day.horasImputadas, 0),
        horasPendientesVencidas: pastWorkDays.reduce((sum, day) => sum + day.horasPendientes, 0),
        horasPendientesHoy: days.find((day) => day.esHoy)?.horasPendientes || 0,
        diasCompletos: elapsedWorkDays.filter((day) => day.estado === 'COMPLETO' || day.estado === 'EXCESO').length,
        diasPendientesVencidos: pastWorkDays.filter((day) => day.horasPendientes > 0).length,
        diasAusencia: days.filter((day) => ['VACACIONES', 'PERMISO', 'BAJA'].includes(day.estado)).length,
        coberturaPct: expected > 0 ? Math.round((covered / expected) * 1000) / 10 : null,
      },
    };
  });

  const allDays = employeeBalances.flatMap((employee) => employee.dias.map((day) => ({ employeeId: employee.empleadoId, ...day })));
  const elapsedWorkDays = allDays.filter((day) => day.horasEsperadas > 0 && day.fecha <= todayIso);
  const pastWorkDays = allDays.filter((day) => day.horasEsperadas > 0 && day.fecha < todayIso);
  const totalExpected = elapsedWorkDays.reduce((sum, day) => sum + day.horasEsperadas, 0);
  const totalCovered = elapsedWorkDays.reduce((sum, day) => sum + Math.min(day.horasEsperadas, day.horasImputadas), 0);

  return {
    periodo: {
      inicio: dateToIso(week.startDate),
      fin: dateToIso(week.endDate),
      referencia: referenceIso,
      hoy: todayIso,
      horasJornada: HORAS_JORNADA_DIARIA,
      inicioControl: controlStartIso,
    },
    resumen: {
      empleados: employeeBalances.length,
      horasEsperadasHastaHoy: totalExpected,
      horasImputadasHastaHoy: elapsedWorkDays.reduce((sum, day) => sum + day.horasImputadas, 0),
      horasPendientesVencidas: pastWorkDays.reduce((sum, day) => sum + day.horasPendientes, 0),
      horasPendientesHoy: allDays.filter((day) => day.esHoy).reduce((sum, day) => sum + day.horasPendientes, 0),
      empleadosConPendientesVencidos: employeeBalances.filter((employee) => employee.resumen.horasPendientesVencidas > 0).length,
      diasPendientesVencidos: pastWorkDays.filter((day) => day.horasPendientes > 0).length,
      diasAusencia: allDays.filter((day) => ['VACACIONES', 'PERMISO', 'BAJA'].includes(day.estado)).length,
      coberturaPct: totalExpected > 0 ? Math.round((totalCovered / totalExpected) * 1000) / 10 : null,
    },
    empleados: employeeBalances,
  };
}

export interface ResumenPersonalImputaciones {
  semana: BalanceEmpleado;
  periodo: {
    inicioSemana: string;
    finSemana: string;
    hoy: string;
    inicioControl: string;
  };
  acumulado: {
    horasPendientesVencidas: number;
    diasPendientesVencidos: number;
    horasPendientesMas48h: number;
    diasPendientesMas48h: number;
    fechaPendienteMasAntigua: string | null;
  };
  alerta48h: boolean;
}

function elapsedBusinessDaysAfter(fromIso: string, toIso: string) {
  let elapsed = 0;
  const cursor = parseDateOnly(fromIso);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (dateToIso(cursor) < toIso) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) elapsed++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return elapsed;
}

export function buildEmployeeTimesheetSummary({
  todayIso,
  employee,
  imputations,
  absences,
  controlStartIso = FECHA_INICIO_CONTROL_IMPUTACIONES,
}: {
  todayIso: string;
  employee: EmpleadoBalanceInput;
  imputations: ImputacionBalanceInput[];
  absences: AusenciaBalanceInput[];
  controlStartIso?: string;
}): ResumenPersonalImputaciones {
  const employeeStartIso = employee.fechaAlta ? dateToIso(employee.fechaAlta) : controlStartIso;
  const effectiveStartIso = employeeStartIso > controlStartIso ? employeeStartIso : controlStartIso;
  const currentWeek = getWorkWeek(todayIso);
  const currentBalance = buildDailyTimesheetBalance({
    referenceIso: todayIso,
    todayIso,
    employees: [employee],
    imputations,
    absences,
    controlStartIso,
  }).empleados[0];

  const allElapsedDays: BalanceDia[] = [];
  const firstWeek = getWorkWeek(effectiveStartIso);
  for (
    let cursor = new Date(firstWeek.startDate);
    dateToIso(cursor) <= todayIso;
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  ) {
    const referenceIso = dateToIso(cursor);
    const weeklyEmployee = buildDailyTimesheetBalance({
      referenceIso,
      todayIso,
      employees: [employee],
      imputations,
      absences,
      controlStartIso,
    }).empleados[0];
    if (!weeklyEmployee) continue;
    weeklyEmployee.dias.forEach((day) => {
      if (day.fecha >= effectiveStartIso && day.fecha < todayIso && day.horasEsperadas > 0) {
        allElapsedDays.push(day);
      }
    });
  }

  const pendingDays = allElapsedDays.filter((day) => day.horasPendientes > 0);
  const pendingOver48Hours = pendingDays.filter((day) => elapsedBusinessDaysAfter(day.fecha, todayIso) >= 2);

  return {
    semana: currentBalance || {
      empleadoId: employee.id,
      nombre: employee.nombreCompleto,
      departamento: employee.departamento,
      dias: [],
      resumen: {
        horasEsperadasHastaHoy: 0,
        horasImputadasHastaHoy: 0,
        horasPendientesVencidas: 0,
        horasPendientesHoy: 0,
        diasCompletos: 0,
        diasPendientesVencidos: 0,
        diasAusencia: 0,
        coberturaPct: null,
      },
    },
    periodo: {
      inicioSemana: dateToIso(currentWeek.startDate),
      finSemana: dateToIso(currentWeek.endDate),
      hoy: todayIso,
      inicioControl: controlStartIso,
    },
    acumulado: {
      horasPendientesVencidas: Math.round(pendingDays.reduce((sum, day) => sum + day.horasPendientes, 0) * 100) / 100,
      diasPendientesVencidos: pendingDays.length,
      horasPendientesMas48h: Math.round(pendingOver48Hours.reduce((sum, day) => sum + day.horasPendientes, 0) * 100) / 100,
      diasPendientesMas48h: pendingOver48Hours.length,
      fechaPendienteMasAntigua: pendingDays[0]?.fecha || null,
    },
    alerta48h: pendingOver48Hours.length > 0,
  };
}
