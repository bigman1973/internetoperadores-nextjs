'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  PlusIcon,
  ScaleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type ScenarioStatus = 'borrador' | 'revisado' | 'descartado';
type AdjustmentType = 'porcentaje' | 'importe';

interface ScenarioLine {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  empleadoEmail: string | null;
  categoria: string | null;
  incluido: boolean;
  brutoActual: number;
  brutoPropuesto: number;
  tasaSSEmpresa: number;
  costeEmpresaActual: number;
  costeEmpresaPropuesto: number;
  porcentajeSubida: number;
  incrementoBrutoAnual: number;
  incrementoCosteEmpresaAnual: number;
  origenSalario: string;
  referenciaFecha: string | null;
  nominasUtilizadas: number;
  notas: string | null;
}

interface ScenarioSummary {
  empleadosIncluidos: number;
  empleadosExcluidos: number;
  brutoActual: number;
  brutoPropuesto: number;
  incrementoBrutoAnual: number;
  porcentajeMedioPonderado: number;
  costeEmpresaActual: number;
  costeEmpresaPropuesto: number;
  incrementoCosteEmpresaAnual: number;
  incrementoCosteEmpresaMensual: number;
  mesesImpactoEjercicio: number;
  impactoCosteEmpresaEjercicio: number;
}

interface SalaryScenario {
  id: string;
  nombre: string;
  fechaEfectiva: string;
  tipoAjusteGeneral: AdjustmentType;
  valorAjusteGeneral: number;
  estado: ScenarioStatus;
  notas: string | null;
  creadoPor: string | null;
  snapshotFecha: string;
  createdAt: string;
  updatedAt: string;
  lineas: ScenarioLine[];
  resumen: ScenarioSummary;
}

const euro = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (value: number) => `${value >= 0 ? '+' : ''}${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES');

const statusStyles: Record<ScenarioStatus, string> = {
  borrador: 'bg-amber-50 text-amber-700 ring-amber-200',
  revisado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  descartado: 'bg-gray-100 text-gray-600 ring-gray-200',
};

function nextYearStart() {
  return `${new Date().getFullYear() + 1}-01-01`;
}

export default function SalaryScenariosPanel() {
  const [scenarios, setScenarios] = useState<SalaryScenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    nombre: `Revisión salarial ${new Date().getFullYear() + 1} — propuesta inicial`,
    fechaEfectiva: nextYearStart(),
    tipoAjusteGeneral: 'porcentaje' as AdjustmentType,
    valorAjusteGeneral: '3',
    notas: '',
  });
  const [generalForm, setGeneralForm] = useState({ tipo: 'porcentaje' as AdjustmentType, valor: '0' });
  const [metaForm, setMetaForm] = useState({ nombre: '', notas: '' });
  const [grossDrafts, setGrossDrafts] = useState<Record<string, string>>({});

  const selected = useMemo(() => scenarios.find(scenario => scenario.id === selectedId) || null, [scenarios, selectedId]);
  const compared = useMemo(() => scenarios.filter(scenario => compareIds.includes(scenario.id)), [scenarios, compareIds]);

  useEffect(() => { void loadScenarios(); }, []);

  useEffect(() => {
    if (!selected) return;
    setGeneralForm({ tipo: selected.tipoAjusteGeneral, valor: String(selected.valorAjusteGeneral) });
    setMetaForm({ nombre: selected.nombre, notas: selected.notas || '' });
    setGrossDrafts(Object.fromEntries(selected.lineas.map(line => [line.id, String(line.brutoPropuesto)])));
  }, [selected]);

  async function loadScenarios(preferredId?: string) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/escenarios-salariales', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los escenarios');
      const list = (data.escenarios || []) as SalaryScenario[];
      setScenarios(list);
      setSelectedId(current => preferredId || (current && list.some(item => item.id === current) ? current : list.find(item => item.estado !== 'descartado')?.id || list[0]?.id || null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los escenarios');
    } finally {
      setLoading(false);
    }
  }

  function replaceScenario(updated: SalaryScenario) {
    setScenarios(current => current.map(item => item.id === updated.id ? updated : item));
    setSelectedId(updated.id);
  }

  async function createScenario(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/escenarios-salariales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm, valorAjusteGeneral: Number(createForm.valorAjusteGeneral) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el escenario');
      setScenarios(current => [data.escenario, ...current]);
      setSelectedId(data.escenario.id);
      setShowCreate(false);
      setNotice('Escenario guardado. La fotografía salarial queda fijada y no modifica el histórico real.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el escenario');
    } finally {
      setSaving(false);
    }
  }

  async function updateMetadata(state?: ScenarioStatus) {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/escenarios-salariales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'actualizar', id: selected.id, nombre: metaForm.nombre, notas: metaForm.notas, estado: state || selected.estado }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el escenario');
      replaceScenario(data.escenario);
      setNotice(state === 'descartado' ? 'Escenario archivado como descartado.' : state === 'revisado' ? 'Escenario marcado como revisado.' : 'Datos generales guardados.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el escenario');
    } finally {
      setSaving(false);
    }
  }

  async function recalculateGeneral() {
    if (!selected) return;
    if (!confirm('¿Recalcular todas las propuestas? Se sustituirán los ajustes individuales actuales de este escenario.')) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/escenarios-salariales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalcular_general', id: selected.id, tipoAjusteGeneral: generalForm.tipo, valorAjusteGeneral: Number(generalForm.valor) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo recalcular el escenario');
      replaceScenario(data.escenario);
      setNotice('Criterio general aplicado a todas las líneas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo recalcular el escenario');
    } finally {
      setSaving(false);
    }
  }

  async function updateLine(line: ScenarioLine, changes: Partial<{ brutoPropuesto: number; incluido: boolean; notas: string }>) {
    setSavingLine(line.id);
    setError('');
    try {
      const response = await fetch('/api/admin/empleados/escenarios-salariales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'actualizar_linea',
          lineaId: line.id,
          brutoPropuesto: changes.brutoPropuesto ?? Number(grossDrafts[line.id] || line.brutoPropuesto),
          incluido: changes.incluido ?? line.incluido,
          notas: changes.notas ?? line.notas ?? '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la persona');
      replaceScenario(data.escenario);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la persona');
    } finally {
      setSavingLine(null);
    }
  }

  async function duplicateScenario() {
    if (!selected) return;
    const name = prompt('Nombre de la copia', `Copia de ${selected.nombre}`)?.trim();
    if (!name) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/empleados/escenarios-salariales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicar', id: selected.id, nombre: name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo duplicar el escenario');
      setScenarios(current => [data.escenario, ...current]);
      setSelectedId(data.escenario.id);
      setNotice('Copia creada como borrador independiente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo duplicar el escenario');
    } finally {
      setSaving(false);
    }
  }

  function toggleCompare(id: string) {
    setCompareIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  if (loading) return <div className="rounded-2xl border bg-white p-10 text-center text-gray-500">Cargando escenarios salariales...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
        <div className="flex items-start gap-3">
          <ScaleIcon className="mt-0.5 h-6 w-6 shrink-0 text-indigo-600" />
          <div>
            <p className="font-semibold">Planificación privada · Solo SUPER_ADMIN</p>
            <p className="mt-1 text-sm leading-6">Cada escenario conserva una fotografía de salarios y costes. Editar, comparar o imprimir nunca registra condiciones salariales reales.</p>
          </div>
        </div>
      </div>

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Escenarios guardados</h2>
          <p className="text-sm text-gray-500">Compara hasta tres alternativas de revisión anual.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          <PlusIcon className="h-5 w-5" /> Nuevo escenario
        </button>
      </div>

      {scenarios.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white px-6 py-14 text-center">
          <AdjustmentsHorizontalIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-semibold text-gray-800">Todavía no hay escenarios</p>
          <p className="mt-1 text-sm text-gray-500">Crea la primera propuesta para fijar la situación de partida y valorar su impacto.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scenarios.map(scenario => (
              <div key={scenario.id} className={`rounded-2xl border bg-white p-4 transition ${selectedId === scenario.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'hover:border-gray-300'} ${scenario.estado === 'descartado' ? 'opacity-70' : ''}`}>
                <button onClick={() => setSelectedId(scenario.id)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900">{scenario.nombre}</p>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${statusStyles[scenario.estado]}`}>{scenario.estado}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">Desde {dateLabel(scenario.fechaEfectiva)} · {scenario.resumen.empleadosIncluidos} personas</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div><p className="text-xs text-gray-400">Impacto anual empresa</p><p className="font-bold text-indigo-700">{euro(scenario.resumen.incrementoCosteEmpresaAnual)}</p></div>
                    <p className={`text-sm font-semibold ${scenario.resumen.porcentajeMedioPonderado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{pct(scenario.resumen.porcentajeMedioPonderado)}</p>
                  </div>
                </button>
                <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2 border-t pt-3 text-xs text-gray-600">
                  <input type="checkbox" checked={compareIds.includes(scenario.id)} onChange={() => toggleCompare(scenario.id)} disabled={!compareIds.includes(scenario.id) && compareIds.length >= 3} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                  Incluir en comparación
                </label>
              </div>
            ))}
          </div>

          {compared.length >= 2 && (
            <div className="rounded-2xl border bg-white p-5">
              <div className="mb-4 flex items-center gap-2"><ScaleIcon className="h-5 w-5 text-indigo-600" /><h3 className="font-bold text-gray-900">Comparación de escenarios</h3></div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-500"><th className="p-3">Escenario</th><th className="p-3 text-right">Personas</th><th className="p-3 text-right">Subida media</th><th className="p-3 text-right">Masa propuesta</th><th className="p-3 text-right">Impacto anual</th><th className="p-3 text-right">Impacto ejercicio</th></tr></thead>
                  <tbody>{compared.map(scenario => <tr key={scenario.id} className="border-b last:border-0"><td className="p-3 font-medium text-gray-900">{scenario.nombre}</td><td className="p-3 text-right">{scenario.resumen.empleadosIncluidos}</td><td className="p-3 text-right font-semibold text-emerald-700">{pct(scenario.resumen.porcentajeMedioPonderado)}</td><td className="p-3 text-right">{euro(scenario.resumen.brutoPropuesto)}</td><td className="p-3 text-right font-semibold text-indigo-700">{euro(scenario.resumen.incrementoCosteEmpresaAnual)}</td><td className="p-3 text-right">{euro(scenario.resumen.impactoCosteEmpresaEjercicio)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="space-y-5 rounded-2xl border bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <input value={metaForm.nombre} onChange={event => setMetaForm(current => ({ ...current, nombre: event.target.value }))} disabled={selected.estado === 'descartado'} className="w-full rounded-lg border-0 p-0 text-xl font-bold text-gray-900 focus:ring-0 disabled:bg-transparent" />
              <p className="mt-1 text-xs text-gray-500">Fotografía: {new Date(selected.snapshotFecha).toLocaleString('es-ES')} · Fecha efectiva: {dateLabel(selected.fechaEfectiva)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void duplicateScenario()} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><DocumentDuplicateIcon className="h-4 w-4" /> Duplicar</button>
              <button onClick={() => window.open(`/api/admin/empleados/escenarios-salariales/informe?id=${selected.id}`, '_blank', 'noopener,noreferrer')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"><DocumentTextIcon className="h-4 w-4" /> Imprimir</button>
              {selected.estado !== 'revisado' && selected.estado !== 'descartado' && <button onClick={() => void updateMetadata('revisado')} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><CheckCircleIcon className="h-4 w-4" /> Marcar revisado</button>}
              {selected.estado !== 'descartado' && <button onClick={() => confirm('¿Archivar este escenario como descartado? Seguirá disponible como histórico.') && void updateMetadata('descartado')} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">Descartar</button>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Masa salarial propuesta" value={euro(selected.resumen.brutoPropuesto)} detail={`${euro(selected.resumen.incrementoBrutoAnual)} · ${pct(selected.resumen.porcentajeMedioPonderado)}`} tone="indigo" />
            <Kpi label="Nuevo coste empresa" value={euro(selected.resumen.costeEmpresaPropuesto)} detail={`Antes ${euro(selected.resumen.costeEmpresaActual)}`} tone="blue" />
            <Kpi label="Sobrecoste mensual" value={euro(selected.resumen.incrementoCosteEmpresaMensual)} detail={`${euro(selected.resumen.incrementoCosteEmpresaAnual)} anual`} tone="amber" />
            <Kpi label={`Impacto ${new Date(`${selected.fechaEfectiva}T12:00:00`).getFullYear()}`} value={euro(selected.resumen.impactoCosteEmpresaEjercicio)} detail={`${selected.resumen.mesesImpactoEjercicio} meses computados`} tone="emerald" />
          </div>

          {selected.estado !== 'descartado' && (
            <div className="grid gap-4 rounded-xl bg-gray-50 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <label className="text-sm font-medium text-gray-700">Criterio general
                <select value={generalForm.tipo} onChange={event => setGeneralForm(current => ({ ...current, tipo: event.target.value as AdjustmentType }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900">
                  <option value="porcentaje">Porcentaje para todas las personas</option><option value="importe">Importe anual fijo por persona</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">{generalForm.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Importe anual (€)'}
                <input type="number" min="0" step={generalForm.tipo === 'porcentaje' ? '0.1' : '100'} value={generalForm.valor} onChange={event => setGeneralForm(current => ({ ...current, valor: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900" />
              </label>
              <button onClick={() => void recalculateGeneral()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"><ArrowPathIcon className="h-4 w-4" /> Recalcular todos</button>
              <p className="text-xs leading-5 text-gray-500 lg:col-span-3">Recalcular sustituye los ajustes individuales. La fotografía salarial actual y las tasas empresariales permanecen intactas.</p>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="text-sm font-medium text-gray-700">Notas generales
              <textarea rows={2} value={metaForm.notas} onChange={event => setMetaForm(current => ({ ...current, notas: event.target.value }))} disabled={selected.estado === 'descartado'} placeholder="Criterios, límites presupuestarios o acuerdos de revisión" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 disabled:bg-gray-50" />
            </label>
            {selected.estado !== 'descartado' && <button onClick={() => void updateMetadata()} disabled={saving} className="min-h-11 rounded-lg border border-indigo-200 px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Guardar datos generales</button>}
          </div>

          <div>
            <div className="mb-3">
              <h3 className="font-bold text-gray-900">Detalle por empleado</h3>
              <p className="text-sm text-gray-500">El bruto actual y la tasa empresarial son la fotografía original. Solo puedes editar la propuesta o excluir a la persona.</p>
            </div>
            <div className="space-y-3 lg:hidden">
              {selected.lineas.map(line => <EmployeeCard key={line.id} line={line} draft={grossDrafts[line.id] ?? String(line.brutoPropuesto)} setDraft={value => setGrossDrafts(current => ({ ...current, [line.id]: value }))} save={() => void updateLine(line, { brutoPropuesto: Number(grossDrafts[line.id] || line.brutoPropuesto) })} toggle={() => void updateLine(line, { incluido: !line.incluido })} disabled={selected.estado === 'descartado'} saving={savingLine === line.id} />)}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1050px] w-full text-sm">
                <thead><tr className="border-y bg-gray-50 text-left text-xs text-gray-500"><th className="p-3">Incl.</th><th className="p-3">Empleado</th><th className="p-3 text-right">Bruto actual</th><th className="p-3 text-right">Nuevo bruto</th><th className="p-3 text-right">Subida</th><th className="p-3 text-right">Coste empresa</th><th className="p-3 text-right">Impacto anual</th><th className="p-3"></th></tr></thead>
                <tbody>{selected.lineas.map(line => <tr key={line.id} className={`border-b ${line.incluido ? '' : 'bg-gray-50 opacity-60'}`}><td className="p-3"><input type="checkbox" checked={line.incluido} disabled={selected.estado === 'descartado' || savingLine === line.id} onChange={() => void updateLine(line, { incluido: !line.incluido })} className="h-4 w-4 rounded border-gray-300 text-indigo-600" /></td><td className="p-3"><p className="font-medium text-gray-900">{line.empleadoNombre}</p><p className="text-xs text-gray-400">{line.categoria || 'Sin categoría'} · {line.origenSalario === 'condicion_salarial' ? 'condición pactada' : 'nómina'} · SS {line.nominasUtilizadas} nóminas</p></td><td className="p-3 text-right">{euro(line.brutoActual)}</td><td className="p-3 text-right"><input type="number" min="1" step="100" value={grossDrafts[line.id] ?? line.brutoPropuesto} onChange={event => setGrossDrafts(current => ({ ...current, [line.id]: event.target.value }))} disabled={selected.estado === 'descartado'} className="min-h-10 w-32 rounded-lg border border-gray-300 px-2 text-right font-semibold text-gray-900 disabled:bg-gray-50" /></td><td className={`p-3 text-right font-semibold ${line.porcentajeSubida >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{euro(line.incrementoBrutoAnual)}<br/><span className="text-xs">{pct(line.porcentajeSubida)}</span></td><td className="p-3 text-right">{euro(line.costeEmpresaPropuesto)}</td><td className="p-3 text-right font-semibold text-indigo-700">{euro(line.incrementoCosteEmpresaAnual)}</td><td className="p-3 text-right">{selected.estado !== 'descartado' && <button onClick={() => void updateLine(line, { brutoPropuesto: Number(grossDrafts[line.id] || line.brutoPropuesto) })} disabled={savingLine === line.id} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{savingLine === line.id ? 'Guardando...' : 'Guardar'}</button>}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => setShowCreate(false)}>
          <form onSubmit={createScenario} onClick={event => event.stopPropagation()} className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-bold text-gray-900">Nuevo escenario salarial</h3><p className="mt-1 text-sm text-gray-500">Se guardará una fotografía independiente de los empleados activos.</p></div><button type="button" onClick={() => setShowCreate(false)} className="min-h-10 min-w-10 rounded-lg text-gray-400 hover:bg-gray-100"><XMarkIcon className="mx-auto h-5 w-5" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 sm:col-span-2">Nombre<input required maxLength={160} value={createForm.nombre} onChange={event => setCreateForm(current => ({ ...current, nombre: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-gray-900" /></label>
              <label className="text-sm font-medium text-gray-700">Fecha efectiva<input required type="date" value={createForm.fechaEfectiva} onChange={event => setCreateForm(current => ({ ...current, fechaEfectiva: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-gray-900" /></label>
              <label className="text-sm font-medium text-gray-700">Criterio<select value={createForm.tipoAjusteGeneral} onChange={event => setCreateForm(current => ({ ...current, tipoAjusteGeneral: event.target.value as AdjustmentType }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900"><option value="porcentaje">Porcentaje general</option><option value="importe">Importe fijo anual por persona</option></select></label>
              <label className="text-sm font-medium text-gray-700">{createForm.tipoAjusteGeneral === 'porcentaje' ? 'Porcentaje (%)' : 'Importe anual (€)'}<input required type="number" min="0" step={createForm.tipoAjusteGeneral === 'porcentaje' ? '0.1' : '100'} value={createForm.valorAjusteGeneral} onChange={event => setCreateForm(current => ({ ...current, valorAjusteGeneral: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-gray-900" /></label>
              <label className="text-sm font-medium text-gray-700 sm:col-span-2">Notas<textarea rows={3} value={createForm.notas} onChange={event => setCreateForm(current => ({ ...current, notas: event.target.value }))} placeholder="Criterios iniciales o límite presupuestario" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label>
            </div>
            <div className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">La fecha efectiva fija la condición salarial vigente y las nóminas utilizadas. Después podrás duplicar el escenario si deseas probar otra fecha.</div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-lg border px-4 text-sm font-medium text-gray-700">Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Creando fotografía...' : 'Crear y guardar escenario'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'indigo' | 'blue' | 'amber' | 'emerald' }) {
  const colors = { indigo: 'text-indigo-700 bg-indigo-50', blue: 'text-blue-700 bg-blue-50', amber: 'text-amber-700 bg-amber-50', emerald: 'text-emerald-700 bg-emerald-50' };
  return <div className="rounded-xl border p-4"><p className="text-xs font-medium text-gray-500">{label}</p><p className={`mt-2 inline-block rounded-lg px-2 py-1 text-xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-xs text-gray-500">{detail}</p></div>;
}

function EmployeeCard({ line, draft, setDraft, save, toggle, disabled, saving }: { line: ScenarioLine; draft: string; setDraft: (value: string) => void; save: () => void; toggle: () => void; disabled: boolean; saving: boolean }) {
  return <div className={`rounded-xl border p-4 ${line.incluido ? 'bg-white' : 'bg-gray-50 opacity-65'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-gray-900">{line.empleadoNombre}</p><p className="text-xs text-gray-500">{line.categoria || 'Sin categoría'}</p></div><label className="flex min-h-10 items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={line.incluido} disabled={disabled || saving} onChange={toggle} className="h-4 w-4 rounded border-gray-300 text-indigo-600" /> Incluir</label></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-gray-400">Bruto actual</p><p className="font-semibold">{euro(line.brutoActual)}</p></div><div><p className="text-xs text-gray-400">Subida calculada</p><p className={line.porcentajeSubida >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{pct(line.porcentajeSubida)}</p></div><label className="col-span-2 text-xs font-medium text-gray-600">Nuevo bruto anual<input type="number" min="1" step="100" value={draft} onChange={event => setDraft(event.target.value)} disabled={disabled} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-gray-900 disabled:bg-gray-100" /></label><div><p className="text-xs text-gray-400">Nuevo coste empresa</p><p className="font-semibold">{euro(line.costeEmpresaPropuesto)}</p></div><div><p className="text-xs text-gray-400">Impacto anual</p><p className="font-semibold text-indigo-700">{euro(line.incrementoCosteEmpresaAnual)}</p></div></div>{!disabled && <button onClick={save} disabled={saving} className="mt-4 min-h-11 w-full rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">{saving ? 'Guardando...' : 'Guardar ajuste'}</button>}</div>;
}
