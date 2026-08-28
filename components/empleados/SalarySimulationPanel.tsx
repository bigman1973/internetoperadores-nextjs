'use client';

import { useState } from 'react';
import {
  ArrowTrendingUpIcon,
  CalculatorIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import type { ResultadoSimulacionSalarial } from '@/lib/simulacion-salarial';

interface SalaryCondition {
  id: string;
  fechaEfectiva: string;
  brutoAnual: number;
  motivo: string | null;
  notas: string | null;
}

interface SalaryEmployee {
  id: string;
  nombreCompleto: string;
  condicionesSalariales: SalaryCondition[];
}

interface SimulationResponse {
  simulacion: ResultadoSimulacionSalarial;
  referenciaActual: {
    origen: 'condicion_salarial' | 'ultima_nomina';
    fecha: string | null;
    motivo: string | null;
  };
}

interface Props {
  employee: SalaryEmployee;
  motivos: { value: string; label: string }[];
  onRegistered: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

const initialForm = { fechaEfectiva: '', brutoAnual: '', motivo: 'subida_anual', notas: '' };

function formatEur(value: number) {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatPct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default function SalarySimulationPanel({ employee, motivos, onRegistered, onDelete }: Props) {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setResult(null);
    setError('');
  }

  async function requestSimulation() {
    if (!form.fechaEfectiva || !form.brutoAnual) return;
    setCalculating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/simulacion-salarial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleadoId: employee.id,
          fechaEfectiva: form.fechaEfectiva,
          brutoAnualPropuesto: Number(form.brutoAnual),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo calcular la simulación');
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo calcular la simulación');
    } finally {
      setCalculating(false);
    }
  }

  async function printSimulation() {
    if (!result) return;
    setPrinting(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/simulacion-salarial/informe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleadoId: employee.id,
          fechaEfectiva: form.fechaEfectiva,
          brutoAnualPropuesto: Number(form.brutoAnual),
          motivo: form.motivo,
          notas: form.notas || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'No se pudo generar el informe');
      }
      const html = await response.text();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const reportWindow = window.open(url, '_blank');
      if (!reportWindow) throw new Error('El navegador ha bloqueado la ventana del informe. Permite las ventanas emergentes e inténtalo de nuevo.');
      reportWindow.opener = null;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo generar el informe');
    } finally {
      setPrinting(false);
    }
  }

  async function registerCondition() {
    if (!result) return;
    const accepted = window.confirm(
      `Vas a registrar una condición salarial real de ${formatEur(Number(form.brutoAnual))} anuales desde el ${new Date(`${form.fechaEfectiva}T00:00:00`).toLocaleDateString('es-ES')}. ¿Confirmas el registro?`
    );
    if (!accepted) return;

    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/condiciones-salariales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleadoId: employee.id,
          fechaEfectiva: form.fechaEfectiva,
          brutoAnual: Number(form.brutoAnual),
          motivo: form.motivo,
          notas: form.notas || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar la condición');
      setForm(initialForm);
      setResult(null);
      await onRegistered();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo registrar la condición');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="border-b bg-slate-50 p-4 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <ShieldCheckIcon className="mt-0.5 h-5 w-5 flex-none text-indigo-600" />
          <div>
            <p className="font-bold">Simulación privada · Solo SUPER_ADMIN</p>
            <p className="mt-1 text-xs leading-relaxed text-indigo-700">Puedes calcular e imprimir una propuesta para revisarla presencialmente. Simular o imprimir no modifica el salario ni el histórico.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-600">Fecha efectiva propuesta</label>
            <input type="date" value={form.fechaEfectiva} onChange={event => updateForm('fechaEfectiva', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Nuevo bruto anual (€)</label>
            <input type="number" min="1" step="100" value={form.brutoAnual} onChange={event => updateForm('brutoAnual', event.target.value)} placeholder="Ej. 32.000" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Motivo</label>
            <select value={form.motivo} onChange={event => updateForm('motivo', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900">
              {motivos.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Notas para la revisión</label>
            <input type="text" value={form.notas} onChange={event => updateForm('notas', event.target.value)} placeholder="Argumentos, alcance o condiciones" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900" />
          </div>
        </div>

        {error && <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-none" />{error}</div>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={requestSimulation} disabled={calculating || !form.fechaEfectiva || !form.brutoAnual} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            <CalculatorIcon className="h-4 w-4" />{calculating ? 'Calculando...' : result ? 'Recalcular simulación' : 'Calcular simulación'}
          </button>
          <button type="button" onClick={printSimulation} disabled={!result || printing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
            <PrinterIcon className="h-4 w-4" />{printing ? 'Preparando...' : 'Imprimir simulación'}
          </button>
          <button type="button" onClick={registerCondition} disabled={!result || saving} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40 sm:ml-auto">
            {saving ? 'Registrando...' : 'Confirmar y registrar condición'}
          </button>
        </div>

        {result && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Bruto actual</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatEur(result.simulacion.actual.brutoAnual)}</p>
                <p className="text-xs text-slate-500">{formatEur(result.simulacion.actual.brutoMensual)}/mes</p>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-indigo-600">Bruto propuesto</p>
                <p className="mt-1 text-lg font-bold text-indigo-950">{formatEur(result.simulacion.propuesta.brutoAnual)}</p>
                <p className="text-xs text-indigo-700">{formatEur(result.simulacion.propuesta.brutoMensual)}/mes</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-emerald-700">Subida propuesta</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <p className="text-lg font-bold text-emerald-950">{formatEur(result.simulacion.incremento.brutoAnual)}</p>
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">{formatPct(result.simulacion.incremento.porcentaje)}</span>
                </div>
                <p className="text-xs text-emerald-700">{formatEur(result.simulacion.incremento.brutoMensual)}/mes</p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-violet-700">Incremento coste empresa</p>
                <p className="mt-1 text-lg font-bold text-violet-950">{formatEur(result.simulacion.incremento.costeEmpresaAnual)}</p>
                <p className="text-xs text-violet-700">{formatEur(result.simulacion.incremento.costeEmpresaMensual)}/mes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">Coste empresa actual estimado</p><p className="font-bold text-slate-900">{formatEur(result.simulacion.actual.costeEmpresaAnual)}/año</p></div>
              <div><p className="text-xs text-slate-500">Coste empresa propuesto estimado</p><p className="font-bold text-slate-900">{formatEur(result.simulacion.propuesta.costeEmpresaAnual)}/año</p></div>
              <div><p className="text-xs text-slate-500">Impacto en {result.simulacion.impactoEjercicio.anio}</p><p className="font-bold text-orange-700">{formatEur(result.simulacion.impactoEjercicio.incrementoCosteEmpresa)}</p><p className="text-[11px] text-slate-500">{result.simulacion.impactoEjercicio.mesesComputados} meses, desde el mes efectivo</p></div>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">{result.simulacion.baseCalculo.advertencia} Tasa efectiva utilizada: {result.simulacion.baseCalculo.tasaSSEmpresaPct.toLocaleString('es-ES')}% con {result.simulacion.baseCalculo.nominasUtilizadas} nómina{result.simulacion.baseCalculo.nominasUtilizadas === 1 ? '' : 's'}. Estimación orientativa; la nómina real puede variar por bases máximas, bonificaciones, IRPF y conceptos variables.</p>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">Historial de condiciones</h4>
        {employee.condicionesSalariales.length === 0 ? (
          <p className="py-4 text-sm text-gray-400">Sin condiciones registradas</p>
        ) : (
          <div className="space-y-2">
            {employee.condicionesSalariales.map((condition, index) => {
              const previous = employee.condicionesSalariales[index + 1];
              const increase = previous ? condition.brutoAnual - previous.brutoAnual : null;
              const percentage = previous && previous.brutoAnual > 0 ? (increase! / previous.brutoAnual) * 100 : null;
              return (
                <div key={condition.id} className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${index === 0 ? 'border-orange-200 bg-orange-50' : 'bg-white'}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{formatEur(condition.brutoAnual)}/año</span>
                      {percentage !== null && increase !== null && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${increase >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{formatEur(increase)} · {formatPct(percentage)}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">Desde {new Date(condition.fechaEfectiva).toLocaleDateString('es-ES')}{condition.motivo && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{motivos.find(item => item.value === condition.motivo)?.label || condition.motivo}</span>}</div>
                    {condition.notas && <div className="mt-0.5 text-xs text-gray-500">{condition.notas}</div>}
                  </div>
                  <button type="button" onClick={() => onDelete(condition.id)} className="min-h-10 self-start rounded-lg px-3 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-700 sm:self-auto">Eliminar</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
