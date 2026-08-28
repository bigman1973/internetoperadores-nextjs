'use client';

import { ChartBarIcon } from '@heroicons/react/24/outline';
import { InfoTip } from '@/components/imputaciones/CommercialContextFields';
import type { BalanceEmpleado } from '@/lib/imputaciones-diarias';

interface Props {
  employees: BalanceEmpleado[];
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

export default function WeeklyEmployeeEfficiencyChart({ employees }: Props) {
  const rows = [...employees]
    .map(employee => ({
      ...employee,
      records: employee.dias.reduce((sum, day) => sum + day.registros, 0),
      hours: employee.resumen.horasImputadasHastaHoy,
      expected: employee.resumen.horasEsperadasHastaHoy,
    }))
    .sort((a, b) => b.hours - a.hours || a.nombre.localeCompare(b.nombre, 'es'));
  const maxHours = Math.max(8, ...rows.map(row => Math.max(row.hours, row.expected)));

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Eficiencia y volumen por empleado</h3>
            <InfoTip text="La cobertura compara las horas imputadas con las horas esperadas hasta hoy, con un máximo de 8 horas cubiertas por jornada. Vacaciones, permisos y bajas reducen el objetivo; las horas adicionales se muestran como volumen, pero no elevan artificialmente la eficiencia." />
          </div>
          <p className="mt-1 text-xs text-slate-600">Lectura contextual de esta semana: horas registradas, objetivo ajustado y número de imputaciones.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />Horas imputadas</span>
          <span><i className="mr-1 inline-block h-3 w-0.5 bg-slate-700 align-middle" />Objetivo hasta hoy</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-sm text-slate-500">No hay empleados para representar.</div>
      ) : (
        <div className="mt-5 space-y-4">
          {rows.map(row => {
            const volumeWidth = Math.min(100, (row.hours / maxHours) * 100);
            const targetPosition = Math.min(100, (row.expected / maxHours) * 100);
            const coverage = row.resumen.coberturaPct;
            return (
              <div key={row.empleadoId} className="grid grid-cols-1 gap-2 lg:grid-cols-[220px_minmax(0,1fr)_155px] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900" title={row.nombre}>{row.nombre}</p>
                  <p className="truncate text-[11px] text-slate-500">{row.departamento || 'Sin departamento'}</p>
                </div>
                <div>
                  <div className="relative h-3 rounded-full bg-white ring-1 ring-slate-200">
                    <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" style={{ width: `${volumeWidth}%` }} />
                    {row.expected > 0 && <span className="absolute -top-1 h-5 w-0.5 bg-slate-800" style={{ left: `${targetPosition}%` }} aria-label={`Objetivo ${row.expected} horas`} />}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-slate-500">
                    <span>{formatHours(row.hours)} h imputadas</span>
                    <span>{row.records} registro{row.records === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <span className="text-[11px] text-slate-500">Objetivo {formatHours(row.expected)} h</span>
                  <span className={`min-w-16 rounded-full px-2.5 py-1 text-center text-xs font-bold ${coverage === null ? 'bg-slate-200 text-slate-600' : coverage >= 100 ? 'bg-emerald-100 text-emerald-700' : coverage >= 75 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>
                    {coverage === null ? '—' : `${coverage}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
