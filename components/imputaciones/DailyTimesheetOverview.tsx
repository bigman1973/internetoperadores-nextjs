'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { InfoTip } from '@/components/imputaciones/CommercialContextFields';
import type { BalanceDia, BalanceEmpleado } from '@/lib/imputaciones-diarias';
import WeeklyEmployeeEfficiencyChart from '@/components/imputaciones/WeeklyEmployeeEfficiencyChart';

interface DailyBalanceResponse {
  periodo: {
    inicio: string;
    fin: string;
    referencia: string;
    hoy: string;
    horasJornada: number;
    inicioControl: string;
  };
  resumen: {
    empleados: number;
    horasEsperadasHastaHoy: number;
    horasImputadasHastaHoy: number;
    horasPendientesVencidas: number;
    horasPendientesHoy: number;
    empleadosConPendientesVencidos: number;
    diasPendientesVencidos: number;
    diasAusencia: number;
    coberturaPct: number | null;
  };
  empleados: BalanceEmpleado[];
}

interface Props {
  referenceDate: string;
  employeeId: string;
  onReferenceDateChange: (date: string) => void;
}

const STATE_STYLES: Record<BalanceDia['estado'], string> = {
  COMPLETO: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PARCIAL: 'border-amber-200 bg-amber-50 text-amber-900',
  SIN_IMPUTAR: 'border-rose-200 bg-rose-50 text-rose-900',
  EN_CURSO: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  EXCESO: 'border-sky-200 bg-sky-50 text-sky-900',
  VACACIONES: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  PERMISO: 'border-violet-200 bg-violet-50 text-violet-900',
  BAJA: 'border-slate-200 bg-slate-100 text-slate-700',
  FUTURO: 'border-dashed border-gray-200 bg-gray-50 text-gray-500',
  FUERA_CONTROL: 'border-dashed border-gray-200 bg-white text-gray-400',
  NO_ACTIVO: 'border-dashed border-gray-200 bg-gray-50 text-gray-400',
};

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

function shiftDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(day: BalanceDia) {
  switch (day.estado) {
    case 'COMPLETO': return 'Jornada completa';
    case 'EXCESO': return `${formatHours(day.horasImputadas - day.horasEsperadas)} h adicionales`;
    case 'PARCIAL': return `Faltan ${formatHours(day.horasPendientes)} h`;
    case 'SIN_IMPUTAR': return `Faltan ${formatHours(day.horasPendientes)} h`;
    case 'EN_CURSO': return day.horasPendientes > 0 ? `Hoy · faltan ${formatHours(day.horasPendientes)} h` : 'Hoy · jornada completa';
    case 'VACACIONES': return 'Vacaciones';
    case 'PERMISO': return day.ausencia?.detalle ? `Permiso · ${day.ausencia.detalle}` : 'Permiso';
    case 'BAJA': return 'Baja';
    case 'FUTURO': return `${formatHours(day.horasEsperadas)} h previstas`;
    case 'FUERA_CONTROL': return 'Fuera del control';
    case 'NO_ACTIVO': return 'No activo';
  }
}

function DayCell({ day, compact = false }: { day: BalanceDia; compact?: boolean }) {
  const absenceWithHours = day.ausencia && day.horasImputadas > 0;
  return (
    <div
      className={`rounded-xl border ${compact ? 'px-3 py-2.5' : 'min-h-[86px] p-3'} ${STATE_STYLES[day.estado]} ${day.esHoy ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
      title={`${formatLongDate(day.fecha)}. ${dayLabel(day)}. ${formatHours(day.horasImputadas)} horas imputadas en ${day.registros} registros.`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{formatHours(day.horasImputadas)} h</p>
          <p className="mt-0.5 text-[11px] font-medium leading-tight">{dayLabel(day)}</p>
        </div>
        {day.registros > 0 && <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold">{day.registros}</span>}
      </div>
      {absenceWithHours && <p className="mt-1 text-[10px] font-semibold text-rose-700">Revisar: hay horas durante la ausencia</p>}
    </div>
  );
}

export default function DailyTimesheetOverview({ referenceDate, employeeId, onReferenceDateChange }: Props) {
  const [data, setData] = useState<DailyBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: 'balance_diario', fecha: referenceDate });
      if (employeeId) params.set('empleadoId', employeeId);
      const response = await fetch(`/api/admin/imputaciones?${params.toString()}`, { cache: 'no-store' });
      if (response.status === 403) {
        setAllowed(false);
        setData(null);
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se ha podido cargar el balance diario');
      setAllowed(true);
      setData(payload.balanceDiario);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se ha podido cargar el balance diario');
    } finally {
      setLoading(false);
    }
  }, [employeeId, referenceDate]);

  useEffect(() => { load(); }, [load]);

  const visibleEmployees = useMemo(() => {
    if (!data) return [];
    return [...data.empleados]
      .filter(employee => !onlyPending || employee.resumen.horasPendientesVencidas > 0)
      .sort((a, b) => b.resumen.horasPendientesVencidas - a.resumen.horasPendientesVencidas || a.nombre.localeCompare(b.nombre, 'es'));
  }, [data, onlyPending]);

  if (!allowed) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="h-5 w-5 text-indigo-300" />
              <h2 className="text-base font-bold">Control diario de imputaciones</h2>
              <InfoTip text="Cada jornada laborable equivale a 8 horas. Vacaciones, permisos y bajas del apartado Personal no generan horas pendientes. El día actual se muestra en curso y no se considera vencido." />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">Vista exclusiva de superadministración · semana laboral · todas las categorías</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onReferenceDateChange(shiftDays(referenceDate, -7))} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20" aria-label="Semana anterior">
              <ChevronLeftIcon className="h-4 w-4" /> Anterior
            </button>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-semibold">
              {data ? `${formatShortDate(data.periodo.inicio)} — ${formatShortDate(data.periodo.fin)}` : 'Cargando semana…'}
            </div>
            <button type="button" onClick={() => onReferenceDateChange(shiftDays(referenceDate, 7))} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20" aria-label="Semana siguiente">
              Siguiente <ChevronRightIcon className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onReferenceDateChange(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }))} className="min-h-10 rounded-lg bg-indigo-500 px-3 text-xs font-bold text-white hover:bg-indigo-400">Hoy</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-gray-500"><ArrowPathIcon className="h-5 w-5 animate-spin" /> Calculando jornadas y ausencias…</div>
      ) : error ? (
        <div className="m-4 flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={load} className="rounded-lg bg-white px-3 py-2 text-xs font-bold ring-1 ring-rose-200">Reintentar</button>
        </div>
      ) : data ? (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button type="button" aria-pressed={onlyPending} onClick={() => setOnlyPending(value => !value)} className={`rounded-xl p-4 text-left ring-1 transition ${onlyPending ? 'bg-rose-100 ring-rose-300' : 'bg-rose-50 ring-rose-100 hover:bg-rose-100'}`}>
              <div className="flex items-center justify-between gap-2"><ExclamationTriangleIcon className="h-5 w-5 text-rose-600" /><span className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Filtrar</span></div>
              <p className="mt-2 text-2xl font-bold text-rose-800">{formatHours(data.resumen.horasPendientesVencidas)} h</p>
              <p className="text-xs font-medium text-rose-700">Pendientes vencidas</p>
              <p className="mt-1 text-[11px] text-rose-600">{data.resumen.empleadosConPendientesVencidos} empleados · {data.resumen.diasPendientesVencidos} jornadas</p>
            </button>
            <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
              <p className="mt-2 text-2xl font-bold text-emerald-800">{data.resumen.coberturaPct === null ? '—' : `${data.resumen.coberturaPct}%`}</p>
              <p className="text-xs font-medium text-emerald-700">Cobertura hasta hoy</p>
              <p className="mt-1 text-[11px] text-emerald-600">Máximo 8 h cubiertas por jornada</p>
            </div>
            <div className="rounded-xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
              <ClockIcon className="h-5 w-5 text-indigo-600" />
              <p className="mt-2 text-2xl font-bold text-indigo-800">{formatHours(data.resumen.horasPendientesHoy)} h</p>
              <p className="text-xs font-medium text-indigo-700">Pendientes de hoy</p>
              <p className="mt-1 text-[11px] text-indigo-600">Informativo: el día sigue en curso</p>
            </div>
            <div className="rounded-xl bg-cyan-50 p-4 ring-1 ring-cyan-100">
              <UserGroupIcon className="h-5 w-5 text-cyan-600" />
              <p className="mt-2 text-2xl font-bold text-cyan-800">{data.resumen.diasAusencia}</p>
              <p className="text-xs font-medium text-cyan-700">Jornadas de ausencia</p>
              <p className="mt-1 text-[11px] text-cyan-600">Vacaciones, permisos o bajas</p>
            </div>
          </div>

          <WeeklyEmployeeEfficiencyChart employees={visibleEmployees} />

          {data.periodo.fin < data.periodo.inicioControl && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-bold">El control comienza el 1 de septiembre de 2026</p><p className="mt-0.5 text-xs text-amber-700">Esta semana se conserva como histórico y no genera horas pendientes.</p></div>
              <button type="button" onClick={() => onReferenceDateChange(data.periodo.inicioControl)} className="min-h-10 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700">Ver primera semana de control</button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
            <span className="font-semibold text-gray-700">Leyenda:</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />8 h completas</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />Parcial</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />Sin imputar</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />Ausencia en Personal</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />Futuro o fuera de control</span>
          </div>

          {onlyPending && (
            <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <span>Mostrando únicamente empleados con horas vencidas.</span>
              <button type="button" onClick={() => setOnlyPending(false)} className="font-bold underline">Ver todos</button>
            </div>
          )}

          {visibleEmployees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No hay empleados que coincidan con el filtro.</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="w-56 px-3 py-2 font-semibold">Empleado</th>
                      {visibleEmployees[0]?.dias.map(day => <th key={day.fecha} className="min-w-32 px-1 py-2 text-center font-semibold">{day.diaSemana} {day.numeroDia}{day.esHoy && <span className="ml-1 text-indigo-600">· Hoy</span>}</th>)}
                      <th className="w-40 px-3 py-2 font-semibold">Resumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmployees.map(employee => (
                      <tr key={employee.empleadoId}>
                        <td className="rounded-l-xl bg-gray-50 px-3 py-3 align-top">
                          <p className="text-sm font-bold text-gray-900">{employee.nombre}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{employee.departamento || 'Sin departamento'}</p>
                        </td>
                        {employee.dias.map(day => <td key={day.fecha} className="px-1 align-top"><DayCell day={day} /></td>)}
                        <td className="rounded-r-xl bg-gray-50 px-3 py-3 align-top text-xs">
                          <p className="font-bold text-gray-900">{formatHours(employee.resumen.horasImputadasHastaHoy)} / {formatHours(employee.resumen.horasEsperadasHastaHoy)} h</p>
                          <p className={employee.resumen.horasPendientesVencidas > 0 ? 'mt-1 font-semibold text-rose-600' : 'mt-1 font-semibold text-emerald-600'}>{employee.resumen.horasPendientesVencidas > 0 ? `${formatHours(employee.resumen.horasPendientesVencidas)} h vencidas` : 'Al día'}</p>
                          <p className="mt-1 text-gray-500">{employee.resumen.coberturaPct === null ? 'Sin jornada esperada' : `${employee.resumen.coberturaPct}% cubierto`}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4 lg:hidden">
                {visibleEmployees.map(employee => (
                  <article key={employee.empleadoId} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="text-sm font-bold text-gray-900">{employee.nombre}</h3><p className="text-xs text-gray-500">{employee.departamento || 'Sin departamento'}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${employee.resumen.horasPendientesVencidas > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{employee.resumen.horasPendientesVencidas > 0 ? `${formatHours(employee.resumen.horasPendientesVencidas)} h pendientes` : 'Al día'}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {employee.dias.map(day => (
                        <div key={day.fecha}>
                          <p className="mb-1 text-[11px] font-semibold text-gray-500">{day.diaSemana} {day.numeroDia}{day.esHoy ? ' · Hoy' : ''}</p>
                          <DayCell day={day} compact />
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
