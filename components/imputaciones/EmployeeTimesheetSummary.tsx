'use client';

import Link from 'next/link';
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { ResumenPersonalImputaciones } from '@/lib/imputaciones-diarias';

interface Props {
  summary: ResumenPersonalImputaciones;
}

const stateStyles: Record<string, string> = {
  COMPLETO: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  EXCESO: 'border-sky-200 bg-sky-50 text-sky-800',
  PARCIAL: 'border-amber-200 bg-amber-50 text-amber-900',
  SIN_IMPUTAR: 'border-rose-200 bg-rose-50 text-rose-900',
  EN_CURSO: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  VACACIONES: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  PERMISO: 'border-violet-200 bg-violet-50 text-violet-900',
  BAJA: 'border-slate-200 bg-slate-100 text-slate-700',
  FUTURO: 'border-dashed border-gray-200 bg-gray-50 text-gray-500',
  FUERA_CONTROL: 'border-dashed border-gray-200 bg-white text-gray-500',
  NO_ACTIVO: 'border-dashed border-gray-200 bg-gray-50 text-gray-500',
};

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function dayText(day: ResumenPersonalImputaciones['semana']['dias'][number]) {
  if (day.estado === 'VACACIONES') return 'Vacaciones';
  if (day.estado === 'PERMISO') return 'Permiso';
  if (day.estado === 'BAJA') return 'Baja';
  if (day.estado === 'FUTURO') return 'Próximo día';
  if (day.estado === 'FUERA_CONTROL') return day.horasImputadas > 0 ? `${formatHours(day.horasImputadas)} h registradas` : 'Fuera del control';
  if (day.estado === 'NO_ACTIVO') return 'No activo';
  if (day.estado === 'COMPLETO') return 'Jornada completa';
  if (day.estado === 'EXCESO') return `${formatHours(day.horasImputadas)} h registradas`;
  if (day.estado === 'EN_CURSO') return day.horasPendientes > 0 ? `Hoy faltan ${formatHours(day.horasPendientes)} h` : 'Hoy completado';
  return `Faltan ${formatHours(day.horasPendientes)} h`;
}

export default function EmployeeTimesheetSummary({ summary }: Props) {
  const beforeControl = summary.periodo.hoy < summary.periodo.inicioControl;
  const week = summary.semana;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="h-5 w-5 text-indigo-300" />
              <h2 className="font-bold">Tu semana de imputaciones</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Jornada de referencia: 8 horas. Vacaciones, permisos y bajas de Personal se descuentan automáticamente.
            </p>
          </div>
          <Link href="/empleado/imputaciones" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-400">
            Revisar o imputar horas
          </Link>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {beforeControl ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">El control diario comienza el 1 de septiembre de 2026</p>
            <p className="mt-1 text-xs text-amber-700">Hasta entonces puedes consultar tus registros, pero no se generan horas pendientes.</p>
          </div>
        ) : summary.alerta48h ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
            <div>
              <p className="font-bold text-rose-900">Hay jornadas pendientes desde hace más de 48 horas</p>
              <p className="mt-1 text-sm text-rose-700">
                Quedan {formatHours(summary.acumulado.horasPendientesMas48h)} h en {summary.acumulado.diasPendientesMas48h} jornada{summary.acumulado.diasPendientesMas48h === 1 ? '' : 's'}. No se contabilizan fines de semana ni ausencias registradas.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-indigo-50 p-3 ring-1 ring-indigo-100">
            <ClockIcon className="h-5 w-5 text-indigo-600" />
            <p className="mt-2 text-xl font-bold text-indigo-900">{formatHours(week.resumen.horasImputadasHastaHoy)} h</p>
            <p className="text-xs font-medium text-indigo-700">Imputadas esta semana</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <CalendarDaysIcon className="h-5 w-5 text-slate-600" />
            <p className="mt-2 text-xl font-bold text-slate-900">{formatHours(week.resumen.horasEsperadasHastaHoy)} h</p>
            <p className="text-xs font-medium text-slate-600">Esperadas hasta hoy</p>
          </div>
          <div className={`rounded-xl p-3 ring-1 ${summary.acumulado.horasPendientesVencidas > 0 ? 'bg-rose-50 ring-rose-100' : 'bg-emerald-50 ring-emerald-100'}`}>
            {summary.acumulado.horasPendientesVencidas > 0 ? <ExclamationTriangleIcon className="h-5 w-5 text-rose-600" /> : <CheckCircleIcon className="h-5 w-5 text-emerald-600" />}
            <p className={`mt-2 text-xl font-bold ${summary.acumulado.horasPendientesVencidas > 0 ? 'text-rose-900' : 'text-emerald-900'}`}>{formatHours(summary.acumulado.horasPendientesVencidas)} h</p>
            <p className={`text-xs font-medium ${summary.acumulado.horasPendientesVencidas > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>Pendientes vencidas</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
            <p className="mt-2 text-xl font-bold text-emerald-900">{week.resumen.coberturaPct === null ? '—' : `${week.resumen.coberturaPct}%`}</p>
            <p className="text-xs font-medium text-emerald-700">Semana cubierta</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {week.dias.map(day => (
            <div key={day.fecha} className={`rounded-xl border p-3 ${stateStyles[day.estado] || stateStyles.FUTURO} ${day.esHoy ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{day.diaSemana} {day.numeroDia}</span>
                {day.esHoy && <span className="text-[10px] font-bold uppercase">Hoy</span>}
              </div>
              <p className="mt-2 text-base font-bold">{formatHours(day.horasImputadas)} h</p>
              <p className="mt-0.5 text-[11px] font-medium leading-tight">{dayText(day)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
