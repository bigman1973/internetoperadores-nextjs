'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  evaluarSeleccionNominas,
  periodosPermitidosPorFechaBanco,
  type CandidataNomina,
  type PeriodoNomina,
} from '@/lib/finanzas/nominas-propuestas-core';
import type { BorradorPreparadoB6, DocumentoVistaB6 } from './b6-proposal-view';

type WrapperB4 = Readonly<{
  documentoConciliableId: string;
  activo: boolean;
  importeObjetivoCentimos: number | null;
  asignadoCentimos: number | null;
}>;
type CandidateDTO = CandidataNomina;
type CandidateWire = Readonly<{
  sourceNominaId: string;
  empleadoId: string;
  empleadoNombreCompleto: string;
  periodo: string;
  anio: number;
  mes: number;
  netoPercibirCentimos: number;
  archivo: { archivoId: string; downloadHref: string; nombre: string; tipo: 'NOMINA' | 'LIQUIDACION' | 'RESUMEN_MENSUAL_LEGADO' } | null;
  wrapperB4: WrapperB4 | null;
}>;
type ResponseWire = Readonly<{
  movimiento: { id: string; fechaBanco: string; importeCentimos: number; periodosPermitidos: string[] };
  periodoElegido: string;
  candidatasNetoExacto: CandidateWire[];
  candidatasPeriodoParaGrupo: CandidateWire[];
  advertencias: string[];
  noEscrituras: true;
  requiereConfirmacionHumana: true;
}>;

export type PayrollCandidatesPanelProps = Readonly<{
  movimientoId: string;
  fechaOperacion: string;
  importeMovimientoCentimos: number | null;
  estadoB4: string;
  versionMovimiento: number;
  canWrite: boolean;
  disabled?: boolean;
  /** Sólo recibe un borrador local; el padre muestra la revisión y confirma B4. */
  onPrepararBorrador: (draft: BorradorPreparadoB6) => void;
}>;

type ViewState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

function cents(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return 'Importe no disponible';
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  const digits = String(Math.abs(value)).padStart(3, '0');
  return `${sign}${digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${digits.slice(-2)} €`;
}
function dateCivil(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}
function validCandidate(value: unknown): value is CandidateWire {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const file = row.archivo;
  const wrapper = row.wrapperB4;
  const fileOK = file === null || (typeof file === 'object' && file !== null
    && typeof (file as any).archivoId === 'string' && typeof (file as any).downloadHref === 'string'
    && (file as any).downloadHref.startsWith('/api/') && typeof (file as any).nombre === 'string');
  const wrapperOK = wrapper === null || (typeof wrapper === 'object' && wrapper !== null
    && typeof (wrapper as any).documentoConciliableId === 'string' && typeof (wrapper as any).activo === 'boolean'
    && ((wrapper as any).importeObjetivoCentimos === null || Number.isSafeInteger((wrapper as any).importeObjetivoCentimos))
    && ((wrapper as any).asignadoCentimos === null || Number.isSafeInteger((wrapper as any).asignadoCentimos)));
  return typeof row.sourceNominaId === 'string' && typeof row.empleadoId === 'string'
    && typeof row.empleadoNombreCompleto === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(row.periodo))
    && Number.isInteger(row.anio) && Number.isInteger(row.mes) && Number.isSafeInteger(row.netoPercibirCentimos)
    && typeof row.netoPercibirCentimos === 'number' && row.netoPercibirCentimos > 0 && fileOK && wrapperOK;
}
function parseResponse(raw: unknown, movementId: string, centsBank: number, period: string): ResponseWire | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as any;
  if (!body.movimiento || body.movimiento.id !== movementId || body.movimiento.importeCentimos !== centsBank || body.periodoElegido !== period
    || body.noEscrituras !== true || body.requiereConfirmacionHumana !== true
    || !Array.isArray(body.candidatasNetoExacto) || !Array.isArray(body.candidatasPeriodoParaGrupo) || !Array.isArray(body.advertencias)
    || body.candidatasNetoExacto.some((item: unknown) => !validCandidate(item)) || body.candidatasPeriodoParaGrupo.some((item: unknown) => !validCandidate(item))) return null;
  return body as ResponseWire;
}
function toCore(candidate: CandidateWire): CandidateDTO {
  return {
    sourceNominaId: candidate.sourceNominaId,
    empleadoId: candidate.empleadoId,
    empleadoNombreCompleto: candidate.empleadoNombreCompleto,
    periodo: { anio: candidate.anio, mes: candidate.mes },
    netoPercibirCentimos: candidate.netoPercibirCentimos as any,
    archivo: candidate.archivo,
    wrapperB4: candidate.wrapperB4,
  };
}
function readyWrapper(candidate: CandidateWire): string | null {
  const wrapper = candidate.wrapperB4;
  if (!wrapper) return null;
  if (!wrapper.activo || wrapper.importeObjetivoCentimos !== -candidate.netoPercibirCentimos || wrapper.asignadoCentimos !== 0) return 'INCOHERENTE';
  return wrapper.documentoConciliableId;
}
function errorText(raw: unknown, fallback: string): string {
  const message = raw && typeof raw === 'object' ? (raw as any).error : null;
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 360) : fallback;
}

/**
 * Propuesta humana de nóminas: carga explícita, selección explícita y afirmación
 * explícita. Un click «Preparar» puede crear wrappers B4 por la acción existente
 * `documento`; no confirma ni crea el vínculo. Para grupos no prueba subsets.
 */
export default function PayrollCandidatesPanel(props: PayrollCandidatesPanelProps) {
  const civil = dateCivil(props.fechaOperacion);
  const initialPeriods = useMemo(() => civil ? periodosPermitidosPorFechaBanco(civil) : [], [civil]);
  const initialPeriod = initialPeriods[0] ? `${initialPeriods[0].anio}-${String(initialPeriods[0].mes).padStart(2, '0')}` : '';
  const [periodo, setPeriodo] = useState(initialPeriod);
  const [state, setState] = useState<ViewState>('IDLE');
  const [data, setData] = useState<ResponseWire | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [affirmed, setAffirmed] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [preparing, setPreparing] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    request.current += 1;
    setPeriodo(initialPeriod);
    setState('IDLE'); setData(null); setSelected([]); setAffirmed(false); setNotice(''); setPreparing(false);
  }, [props.movimientoId, props.versionMovimiento, props.estadoB4, props.importeMovimientoCentimos, initialPeriod]);

  const canRead = props.estadoB4 === 'SIN_DOCUMENTO' && props.importeMovimientoCentimos !== null && props.importeMovimientoCentimos < 0 && !!periodo;
  const load = useCallback(async () => {
    if (!canRead || props.importeMovimientoCentimos === null) return;
    const token = ++request.current;
    setState('LOADING'); setData(null); setSelected([]); setAffirmed(false); setNotice('');
    try {
      const response = await fetch(`/api/admin/finanzas/nominas-propuestas?movimientoId=${encodeURIComponent(props.movimientoId)}&periodo=${encodeURIComponent(periodo)}`, { cache: 'no-store' });
      const raw: unknown = await response.json().catch(() => null);
      if (token !== request.current) return;
      if (!response.ok) throw new Error(errorText(raw, 'No se pudieron leer candidatas de nómina.'));
      const parsed = parseResponse(raw, props.movimientoId, props.importeMovimientoCentimos, periodo);
      if (!parsed) throw new Error('La lectura de candidatas es incompleta o no corresponde al movimiento abierto.');
      setData(parsed); setState('READY');
    } catch (error) {
      if (token !== request.current) return;
      setState('ERROR'); setNotice(error instanceof Error ? error.message : 'No se pudieron leer candidatas de nómina.');
    }
  }, [canRead, periodo, props.importeMovimientoCentimos, props.movimientoId]);

  const allCandidates = data?.candidatasPeriodoParaGrupo ?? [];
  const selectedCandidates = useMemo(() => {
    const byId = new Map(allCandidates.map((candidate) => [candidate.sourceNominaId, candidate] as const));
    return selected.map((id) => byId.get(id)).filter((candidate): candidate is CandidateWire => Boolean(candidate));
  }, [allCandidates, selected]);
  const selectionPreview = useMemo(() => {
    if (!data || props.importeMovimientoCentimos === null) return null;
    const selectedPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) ? { anio: Number(periodo.slice(0, 4)), mes: Number(periodo.slice(5, 7)) } as PeriodoNomina : null;
    if (!selectedPeriod) return null;
    return evaluarSeleccionNominas({
      importeMovimientoCentimos: props.importeMovimientoCentimos,
      periodo: selectedPeriod,
      candidatas: allCandidates.map(toCore),
      sourceNominaIds: selected,
      afirmacion: { netoVerificado: affirmed, periodoVerificado: affirmed, evidenciaHumanaDisponible: affirmed },
    });
  }, [affirmed, allCandidates, data, periodo, props.importeMovimientoCentimos, selected]);

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setNotice('');
  };

  const prepare = async () => {
    if (!data || !selectionPreview || selectionPreview.estado !== 'LISTA_PARA_PREPARAR_B4' || !props.canWrite || props.disabled || preparing || props.importeMovimientoCentimos === null) return;
    setPreparing(true); setNotice('');
    try {
      const wrapperIds = new Map<string, string>();
      for (const candidate of selectedCandidates) {
        const existing = readyWrapper(candidate);
        if (existing === 'INCOHERENTE') throw new Error(`El wrapper B4 existente de ${candidate.empleadoNombreCompleto} no tiene objetivo -NETO o ya está consumido. Revíselo; no se reemplaza.`);
        if (existing) { wrapperIds.set(candidate.sourceNominaId, existing); continue; }
        // Único punto que puede pedir wrapper: gesto humano «Preparar».
        const response = await fetch('/api/admin/finanzas/conciliacion-v2', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'documento', tipoDocumento: 'NOMINA', sourceId: candidate.sourceNominaId }),
        });
        const raw: unknown = await response.json().catch(() => null);
        if (!response.ok || !raw || typeof raw !== 'object' || typeof (raw as any).documento?.id !== 'string') {
          throw new Error(errorText(raw, `No se pudo preparar el wrapper B4 de ${candidate.empleadoNombreCompleto}.`));
        }
        wrapperIds.set(candidate.sourceNominaId, (raw as any).documento.id);
      }
      const lineas = selectionPreview.lineas.map((line) => {
        const documentoConciliableId = wrapperIds.get(line.sourceNominaId);
        if (!documentoConciliableId) throw new Error('Falta un wrapper B4 preparado; no se puede construir un borrador parcial.');
        return { tipo: 'DOCUMENTO' as const, documentoConciliableId, importeCentimos: line.importeCentimos };
      });
      const documents: DocumentoVistaB6[] = selectedCandidates.map((candidate) => ({
        id: wrapperIds.get(candidate.sourceNominaId)!, tipo: 'NOMINA', referencia: `${candidate.empleadoNombreCompleto} · NETO · ${candidate.periodo}`,
        tercero: null, fecha: null, objetivoCentimos: -candidate.netoPercibirCentimos, asignadoCentimos: 0, stale: false,
      }));
      props.onPrepararBorrador({ movimientoId: props.movimientoId, version: props.versionMovimiento, importeCentimos: props.importeMovimientoCentimos, lineas, documentos: documents });
      setNotice('Borrador B4 preparado. Revise las líneas y confirme de forma independiente; todavía no existe ningún vínculo.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo preparar el borrador B4.');
    } finally { setPreparing(false); }
  };

  return <section aria-labelledby="payroll-candidates-title" className="min-w-0 rounded-xl border border-violet-200 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b border-violet-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">Nóminas · propuesta humana</p><h3 id="payroll-candidates-title" className="mt-1 text-base font-bold text-slate-950">Empleado, NETO y mes</h3><p className="mt-1 max-w-2xl text-sm text-slate-600">Muestra nóminas reales con archivo y NETO exacto. No busca por similitud, no crea evidencia persistida ni vincula el movimiento.</p></div>
      <button type="button" onClick={() => { void load(); }} disabled={!canRead || state === 'LOADING' || props.disabled} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-900 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{state === 'LOADING' ? 'Leyendo nóminas…' : 'Buscar candidatas'}</button>
    </header>
    <div className="space-y-4 px-4 py-4 sm:px-5">
      {!canRead && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Disponible sólo para un cargo negativo B4 abierto y con período civil verificable. No se sustituye un importe desconocido por cero.</p>}
      {initialPeriods.length > 0 && <label className="block max-w-xs text-sm font-semibold text-slate-900">Período a revisar<select value={periodo} onChange={(event) => { setPeriodo(event.target.value); setState('IDLE'); setData(null); setSelected([]); setAffirmed(false); setNotice(''); }} disabled={state === 'LOADING' || props.disabled} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100">{initialPeriods.map((item) => { const value = `${item.anio}-${String(item.mes).padStart(2, '0')}`; return <option key={value} value={value}>{value}{value === initialPeriod ? ' · mes bancario' : ' · mes previo'}</option>; })}</select></label>}
      {notice && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">{notice}</p>}
      {state === 'ERROR' && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{notice}</p>}
      {data && <>
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"><dl className="grid grid-cols-2 gap-x-3 gap-y-1"><dt>Banco</dt><dd className="text-right font-mono font-bold">{cents(data.movimiento.importeCentimos)}</dd><dt>Períodos permitidos</dt><dd className="text-right font-mono">{data.movimiento.periodosPermitidos.join(' · ')}</dd></dl><p className="mt-2 text-xs text-slate-600">El filtro individual usa NETO exacto; el grupo sólo suma los IDs que seleccione la persona, sin búsqueda de subconjuntos.</p></section>
        <CandidateTable candidates={allCandidates} exactIds={new Set(data.candidatasNetoExacto.map((candidate) => candidate.sourceNominaId))} selected={selected} disabled={props.disabled || preparing || !props.canWrite} onToggle={toggle} />
        {data.advertencias.length > 0 && <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{data.advertencias.map((warning) => <li key={warning}>• {warning.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>}
        <label className="flex gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"><input type="checkbox" checked={affirmed} disabled={props.disabled || preparing || !props.canWrite} onChange={(event) => setAffirmed(event.target.checked)} /><span>He comprobado en el soporte descargable el <strong>NETO</strong>, el <strong>período</strong> y la evidencia humana de los {selected.length === 1 ? 'datos seleccionados' : 'datos seleccionados para esta transferencia agrupada'}.</span></label>
        {selectionPreview && <section className={`rounded-lg border p-3 text-sm ${selectionPreview.estado === 'LISTA_PARA_PREPARAR_B4' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}><p className="font-bold">{selectionPreview.estado === 'LISTA_PARA_PREPARAR_B4' ? 'Selección lista para preparar B4' : 'Revisión humana pendiente'}</p><p className="mt-1">Total seleccionado: <span className="font-mono font-bold">{cents(selectionPreview.totalCentimos)}</span>{selectionPreview.diferenciaPendienteCentimos !== null ? <> · Diferencia: <span className="font-mono font-bold">{cents(selectionPreview.diferenciaPendienteCentimos)}</span></> : null}</p><ul className="mt-2 text-xs">{selectionPreview.razones.map((reason) => <li key={reason}>• {reason.replace(/_/g, ' ').toLowerCase()}</li>)}</ul></section>}
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600">«Preparar» puede crear sólo el wrapper B4 de una Nómina fuente existente. Nunca crea nóminas ni vínculos; la confirmación final sigue siendo el paso B4 separado.</p><button type="button" onClick={() => { void prepare(); }} disabled={!props.canWrite || props.disabled || preparing || selectionPreview?.estado !== 'LISTA_PARA_PREPARAR_B4'} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{preparing ? 'Preparando B4…' : 'Preparar borrador B4'}</button></div>
      </>}
    </div>
  </section>;
}

function CandidateTable({ candidates, exactIds, selected, disabled, onToggle }: Readonly<{ candidates: readonly CandidateWire[]; exactIds: ReadonlySet<string>; selected: readonly string[]; disabled: boolean; onToggle: (id: string) => void; }>) {
  if (candidates.length === 0) return <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">No hay candidatas reales en este período. La ausencia no se transforma en una propuesta.</p>;
  return <section className="overflow-hidden rounded-lg border border-slate-200"><div className="border-b border-slate-200 px-3 py-3"><h4 className="text-sm font-bold text-slate-950">Nóminas reales del período</h4><p className="mt-1 text-xs text-slate-600">Marque una nómina individual o varias para una transferencia agrupada explícita.</p></div><ul className="divide-y divide-slate-100">{candidates.map((candidate) => {
    const checked = selected.includes(candidate.sourceNominaId);
    const wrapper = readyWrapper(candidate);
    return <li key={candidate.sourceNominaId} className={`p-3 ${checked ? 'bg-violet-50/60' : 'bg-white'}`}><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={checked} disabled={disabled || candidate.archivo === null || wrapper === 'INCOHERENTE'} onChange={() => onToggle(candidate.sourceNominaId)} className="mt-1"/><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm text-slate-950">{candidate.empleadoNombreCompleto}</strong>{exactIds.has(candidate.sourceNominaId) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">NETO individual exacto</span>}</span><span className="mt-1 block text-xs text-slate-600">Periodo {candidate.periodo} · NETO <strong className="font-mono text-slate-900">{cents(-candidate.netoPercibirCentimos).replace('-', '')}</strong></span><span className="mt-1 block text-xs text-slate-600">{candidate.archivo ? <a href={candidate.archivo.downloadHref} className="font-semibold text-violet-800 underline" onClick={(event) => event.stopPropagation()}>Descargar {candidate.archivo.nombre}</a> : <strong className="text-red-800">Sin archivo descargable</strong>}{wrapper === 'INCOHERENTE' && <strong className="ml-2 text-red-800">Wrapper B4 incoherente o consumido</strong>}</span></span></label></li>;
  })}</ul></section>;
}
