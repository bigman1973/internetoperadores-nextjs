'use client';

import { ArrowPathIcon, CheckCircleIcon, IdentificationIcon, MagnifyingGlassIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cents, displayDate, formatCentsText, makeIdempotencyKey, type EstadoPaso1, type EstadoPaso2, type OrigenPaso1, type Paso1Contadores, type SentidoEasy, type TipoTerceroPaso1 } from './easy-contract';

const API = '/api/admin/finanzas/modo-facil/terceros';
const LIMIT = 25;
const MAX_SEARCH = 120;
type Filter = 'TODOS' | 'P1_PENDIENTE';
type Notice = Readonly<{ tone: 'error' | 'success' | 'info'; text: string }> | null;
type Candidate = Readonly<{ id: string; tipoTercero: TipoTerceroPaso1; etiqueta: string; origenPaso1: Exclude<OrigenPaso1, 'MANUAL' | 'AUTO_RECIBO'> }>;
type StepOne = Readonly<{ estadoPaso1: EstadoPaso1; tipoTercero: TipoTerceroPaso1 | null; etiqueta: string | null; origenPaso1: OrigenPaso1 | null; decisionId: string | null; version: number; propuestaTexto: string | null; candidatos: readonly Candidate[] }>;
type P1Movement = Readonly<{ id: string; fecha: string; concepto: string; importeCentimos: number; cuenta: { banco: string; alias: string | null }; paso1: StepOne; paso2: { estadoPaso2: EstadoPaso2 } }>;
type ThirdPartyRead = Readonly<{ periodo: { desde: string; hasta: string }; contador: Paso1Contadores; total: number; limit: number; offset: number; movimientos: readonly P1Movement[] }>;
type ConfirmPayload = Readonly<{ action: 'confirmar'; movimientoId: string; version: number; sugerenciaId: string; idempotencyKey: string; confirmacion: true }>;
type RevertPayload = Readonly<{ action: 'revertir'; decisionId: string; version: number; idempotencyKey: string; confirmacion: true }>;
type Pending = Readonly<{ kind: 'confirm'; movement: P1Movement; candidate: Candidate; payload: ConfirmPayload } | { kind: 'revert'; movement: P1Movement; payload: RevertPayload }>;

const THIRD_TYPES: readonly TipoTerceroPaso1[] = ['CLIENTE', 'PROVEEDOR', 'BANCO', 'CUENTA_PROPIA', 'EMPLEADO'];
const STEP_ONE_STATES: readonly EstadoPaso1[] = ['IDENTIFICADO', 'PROPUESTO', 'SIN_IDENTIFICAR'];
const STEP_TWO_STATES: readonly EstadoPaso2[] = ['SIN_DOCUMENTO', 'JUSTIFICADO', 'NO_REQUIERE'];
const ORIGINS: readonly OrigenPaso1[] = ['ENTIDAD_FISCAL', 'EMPLEADO', 'NOMINA_EMPLEADO', 'FACTURA_RECIBIDA', 'FACTURA_EMITIDA', 'CLIENTE_CONTRATO_ACTUAL', 'CUENTA_PROPIA_ACTUAL', 'MANUAL', 'AUTO_RECIBO'];

class ThirdPartyRequestFailure extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

function record(value: unknown, field: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`La respuesta de Paso 1 no incluye ${field} verificable.`); return value as Record<string, unknown>; }
function text(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`La respuesta de Paso 1 no incluye ${field} verificable.`); return value; }
function nullableText(value: unknown, field: string): string | null { return value === null ? null : text(value, field); }
function integer(value: unknown, field: string): number { if (!Number.isSafeInteger(value)) throw new Error(`La respuesta de Paso 1 no incluye ${field} verificable.`); return value as number; }
function nonNegative(value: unknown, field: string): number { const parsed = integer(value, field); if (parsed < 0) throw new Error(`La respuesta de Paso 1 no incluye ${field} válido.`); return parsed; }
function array(value: unknown, field: string): unknown[] { if (!Array.isArray(value)) throw new Error(`La respuesta de Paso 1 no incluye ${field} verificable.`); return value; }
function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T { if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T; throw new Error(`La respuesta de Paso 1 no incluye ${field} válido.`); }
function centsText(value: unknown, field: string): string { const parsed = text(value, field); if (!/^[+-]?\d+$/.test(parsed)) throw new Error(`La respuesta de Paso 1 no incluye ${field} exacto.`); return parsed; }
function candidate(value: unknown, field: string): Candidate {
  const raw = record(value, field);
  const id = text(raw.id, `${field}.id`);
  if (!/^p1_[A-Za-z0-9_-]+$/.test(id)) throw new Error(`${field}.id no es opaco.`);
  const origin = enumValue(raw.origenPaso1, ORIGINS, `${field}.origenPaso1`);
  if (origin === 'MANUAL' || origin === 'AUTO_RECIBO') throw new Error(`${field} no es una evidencia actual.`);
  return { id, tipoTercero: enumValue(raw.tipoTercero, THIRD_TYPES, `${field}.tipoTercero`), etiqueta: text(raw.etiqueta, `${field}.etiqueta`), origenPaso1: origin };
}
function mergeCandidates(...groups: readonly (readonly Candidate[])[]): readonly Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const group of groups) for (const item of group) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()];
}
function parseCounter(value: unknown): Paso1Contadores {
  const raw = record(value, 'contador'); if (raw.cohorte !== 'TODOS_MOVIMIENTOS_VENTANA') throw new Error('La cohorte de terceros no es válida.');
  const side = (input: unknown, field: string) => { const item = record(input, field); return { movimientos: nonNegative(item.movimientos, `${field}.movimientos`), importeCentimos: centsText(item.importeCentimos, `${field}.importeCentimos`), identificados: nonNegative(item.identificados, `${field}.identificados`) }; };
  return { cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: nonNegative(raw.totalMovimientos, 'contador.totalMovimientos'), cargos: side(raw.cargos, 'contador.cargos'), cobros: side(raw.cobros, 'contador.cobros'), identificados: nonNegative(raw.identificados, 'contador.identificados'), propuestosTexto: nonNegative(raw.propuestosTexto, 'contador.propuestosTexto'), sinIdentificar: nonNegative(raw.sinIdentificar, 'contador.sinIdentificar') };
}

/** Valida que toda opción, también la buscada, procede de un identificador P1 opaco del servidor. */
export function parseThirdPartySearchCandidates(value: unknown): readonly Candidate[] {
  const values = Array.isArray(value) ? value : array(record(value, 'búsqueda de terceros').candidatos, 'candidatos');
  return values.map((item, index) => candidate(item, `candidatos[${index}]`));
}

export function parseThirdPartyRead(value: unknown): ThirdPartyRead {
  const raw = record(value, 'respuesta');
  if (raw.stagingOnly !== true || raw.automaticas !== false) throw new Error('La respuesta de Paso 1 no declara staging sin automatismos.');
  const period = record(raw.periodo, 'periodo');
  const movimientos = array(raw.movimientos, 'movimientos').map((item, index): P1Movement => {
    const movement = record(item, `movimientos[${index}]`);
    const account = record(movement.cuenta, `movimientos[${index}].cuenta`);
    const p1 = record(movement.paso1, `movimientos[${index}].paso1`);
    const p2 = record(movement.paso2, `movimientos[${index}].paso2`);
    const candidates = array(p1.candidatos, `movimientos[${index}].paso1.candidatos`).map((itemCandidate, candidateIndex) => candidate(itemCandidate, `movimientos[${index}].paso1.candidatos[${candidateIndex}]`));
    return {
      id: text(movement.id, `movimientos[${index}].id`), fecha: text(movement.fecha, `movimientos[${index}].fecha`), concepto: text(movement.concepto, `movimientos[${index}].concepto`), importeCentimos: integer(movement.importeCentimos, `movimientos[${index}].importeCentimos`),
      cuenta: { banco: text(account.banco, `movimientos[${index}].cuenta.banco`), alias: nullableText(account.alias, `movimientos[${index}].cuenta.alias`) },
      paso1: { estadoPaso1: enumValue(p1.estadoPaso1, STEP_ONE_STATES, `movimientos[${index}].paso1.estadoPaso1`), tipoTercero: p1.tipoTercero === null ? null : enumValue(p1.tipoTercero, THIRD_TYPES, `movimientos[${index}].paso1.tipoTercero`), etiqueta: nullableText(p1.etiqueta, `movimientos[${index}].paso1.etiqueta`), origenPaso1: p1.origenPaso1 === null ? null : enumValue(p1.origenPaso1, ORIGINS, `movimientos[${index}].paso1.origenPaso1`), decisionId: nullableText(p1.decisionId, `movimientos[${index}].paso1.decisionId`), version: nonNegative(p1.version, `movimientos[${index}].paso1.version`), propuestaTexto: nullableText(p1.propuestaTexto, `movimientos[${index}].paso1.propuestaTexto`), candidatos: candidates },
      paso2: { estadoPaso2: enumValue(p2.estadoPaso2, STEP_TWO_STATES, `movimientos[${index}].paso2.estadoPaso2`) },
    };
  });
  return { periodo: { desde: text(period.desde, 'periodo.desde'), hasta: text(period.hasta, 'periodo.hasta') }, contador: parseCounter(raw.contador), total: nonNegative(raw.total, 'total'), limit: nonNegative(raw.limit, 'limit'), offset: nonNegative(raw.offset, 'offset'), movimientos };
}

function errorMessage(body: unknown, fallback: string): string { return body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' && (body as { error: string }).error.trim() ? (body as { error: string }).error.trim() : fallback; }
function isUncertain(error: unknown): boolean { return error instanceof ThirdPartyRequestFailure ? error.uncertain : error instanceof TypeError || (error instanceof Error && /network|red|timeout|fetch/i.test(error.message)); }
function originLabel(origin: OrigenPaso1 | null): string { const labels: Partial<Record<OrigenPaso1, string>> = { ENTIDAD_FISCAL: 'Entidad fiscal', EMPLEADO: 'Empleado', NOMINA_EMPLEADO: 'Nómina de empleado', FACTURA_RECIBIDA: 'Factura recibida', FACTURA_EMITIDA: 'Factura emitida', CLIENTE_CONTRATO_ACTUAL: 'Contrato actual de cliente', CUENTA_PROPIA_ACTUAL: 'Cuenta propia actual', MANUAL: 'Recibo manual', AUTO_RECIBO: 'Recibo automático' }; return origin ? labels[origin] || origin : 'Sin fuente'; }
function stateClass(state: EstadoPaso1): string { return state === 'IDENTIFICADO' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : state === 'PROPUESTO' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-300 bg-slate-100 text-slate-800'; }

export default function NewThirdPartyWorkspace({ enabled, from, to, query, sentido, card }: Readonly<{ enabled: boolean; from: string; to: string; query: string; sentido: SentidoEasy; card: string }>) {
  const [filter, setFilter] = useState<Filter>('TODOS'); const [offset, setOffset] = useState(0); const [data, setData] = useState<ThirdPartyRead | null>(null); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState<Notice>(null);
  const [searchDraft, setSearchDraft] = useState<Record<string, string>>({}); const [searchedCandidates, setSearchedCandidates] = useState<Record<string, readonly Candidate[]>>({}); const [searchingMovement, setSearchingMovement] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({}); const [confirming, setConfirming] = useState<Pending | null>(null); const [pending, setPending] = useState<Pending | null>(null); const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false, preserveNotice = false) => {
    if (!enabled) return;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ desde: from, hasta: to, limit: String(LIMIT), offset: String(offset), sentido });
      if (query.trim()) params.set('q', query.trim().slice(0, MAX_SEARCH));
      if (card) params.set('tarjeta', card);
      if (filter === 'P1_PENDIENTE') params.set('pendientes', 'SI');
      const response = await fetch(`${API}?${params}`, { cache: 'no-store' });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(raw, `No se pudo leer la cola de terceros (${response.status}).`));
      const parsed = parseThirdPartyRead(raw);
      setData(parsed);
      // Una propuesta de texto y un candidato único jamás seleccionan ni vinculan nada automáticamente.
      setSelected(current => Object.fromEntries(Object.entries(current).filter(([movementId]) => parsed.movimientos.some(movement => movement.id === movementId))));
      if (!preserveNotice) setNotice(null);
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo leer la cola de terceros.' }); }
    finally { setLoading(false); }
  }, [card, enabled, filter, from, offset, query, sentido, to]);

  useEffect(() => { setOffset(0); }, [from, to, query, sentido, card, filter]);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => [...(data?.movimientos || [])].sort((left, right) => Math.abs(right.importeCentimos) - Math.abs(left.importeCentimos) || left.fecha.localeCompare(right.fecha) || left.id.localeCompare(right.id)), [data, filter]);

  async function searchSystemCandidates(movement: P1Movement) {
    if (pending || submitting || searchingMovement) return;
    const buscar = (searchDraft[movement.id] || '').trim().slice(0, MAX_SEARCH);
    if (!buscar) { setNotice({ tone: 'error', text: 'Escribe un nombre, tipo o referencia antes de buscar en el sistema.' }); return; }
    setSearchingMovement(movement.id);
    try {
      const params = new URLSearchParams({ recurso: 'buscar', movimientoId: movement.id, buscar });
      const response = await fetch(`${API}?${params}`, { cache: 'no-store' });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(raw, `No se pudo buscar terceros (${response.status}).`));
      const found = parseThirdPartySearchCandidates(raw);
      setSearchedCandidates(current => ({ ...current, [movement.id]: mergeCandidates(current[movement.id] || [], found) }));
      setNotice({ tone: 'info', text: found.length ? `${found.length} candidato(s) verificados por el servidor se han añadido a esta selección.` : 'La búsqueda no devolvió candidatos verificables.' });
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo buscar terceros en el sistema.' }); }
    finally { setSearchingMovement(null); }
  }

  function openConfirm(movement: P1Movement, candidates: readonly Candidate[]) {
    if (pending || submitting) return;
    const chosen = candidates.find(item => item.id === selected[movement.id]);
    if (!chosen) { setNotice({ tone: 'error', text: 'Elige una evidencia estable devuelta por el servidor antes de guardar.' }); return; }
    setConfirming({ kind: 'confirm', movement, candidate: chosen, payload: { action: 'confirmar', movimientoId: movement.id, version: movement.paso1.version, sugerenciaId: chosen.id, idempotencyKey: makeIdempotencyKey(), confirmacion: true } });
  }
  function openRevert(movement: P1Movement) { if (pending || submitting || !movement.paso1.decisionId) return; setConfirming({ kind: 'revert', movement, payload: { action: 'revertir', decisionId: movement.paso1.decisionId, version: movement.paso1.version, idempotencyKey: makeIdempotencyKey(), confirmacion: true } }); }

  async function send(action: Pending) {
    if (submitting) return;
    setSubmitting(true); setPending(action);
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) });
      const raw: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setConfirming(null); setPending(null);
        setNotice({ tone: 'info', text: 'La evidencia o versión cambió en el servidor. Se recargará la cola sin repetir la acción.' });
        await load(true, true);
        return;
      }
      if (!response.ok) throw new ThirdPartyRequestFailure(errorMessage(raw, `No se pudo guardar el Paso 1 (${response.status}).`), response.status >= 500);
      if (!raw || typeof raw !== 'object' || (raw as { ok?: unknown }).ok !== true) throw new ThirdPartyRequestFailure('El servidor no devolvió un recibo P1 verificable. No se enviará otra acción hasta recuperar este resultado.', true);
      setConfirming(null); setPending(null);
      setNotice({ tone: 'success', text: action.kind === 'confirm' ? 'Tercero identificado con su tipo y fuente estable. Paso 2 documental no ha cambiado.' : 'La identificación P1 se ha revertido mediante recibo auditado. Paso 2 documental no ha cambiado.' });
      await load(true, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la identificación.';
      if (isUncertain(error)) setNotice({ tone: 'error', text: `Resultado incierto: no cambies de acción. Reintenta exactamente este recibo P1. ${message}` });
      else { setPending(null); setConfirming(null); setNotice({ tone: 'error', text: message }); }
    } finally { setSubmitting(false); }
  }

  if (!enabled) return null;
  const busy = loading || submitting || pending !== null;
  const noticeClass = notice?.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950' : notice?.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-blue-300 bg-blue-50 text-blue-950';

  return <section className="space-y-4" aria-labelledby="p1-queue-title">
    <header className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><IdentificationIcon className="mt-0.5 h-7 w-7 shrink-0 text-blue-800" aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Paso 1 · evidencia estable</p><h2 id="p1-queue-title" className="mt-1 text-xl font-extrabold text-slate-950">Identificar tercero</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Confirma sólo un tercero tipado y con fuente actual del servidor. Un nombre o concepto bancario no constituye identificación y esta acción no cierra el documento B4.</p></div></div><button type="button" onClick={() => void load(true, true)} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-950 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button></header>
    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${noticeClass}`}>{notice.text}</p>}
    {pending && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert"><h3 className="font-extrabold text-amber-950">Resultado P1 sin confirmar</h3><p className="mt-1 text-sm text-amber-950">No se permiten otras identificaciones hasta recuperar este recibo. La clave de idempotencia y el mismo payload se conservan.</p><button type="button" disabled={submitting} onClick={() => void send(pending)} className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-sm font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-blue-600">Reintentar la misma acción</button></section>}
    <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div role="tablist" aria-label="Filtro de Paso 1" className="flex flex-wrap gap-2"><button type="button" role="tab" aria-selected={filter === 'TODOS'} onClick={() => setFilter('TODOS')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 ${filter === 'TODOS' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-800 hover:bg-blue-50'}`}>Todos</button><button type="button" role="tab" aria-selected={filter === 'P1_PENDIENTE'} onClick={() => setFilter('P1_PENDIENTE')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 ${filter === 'P1_PENDIENTE' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-950 hover:bg-blue-100'}`}>P1 pendiente</button></div>{data && <p className="text-sm text-slate-700"><strong>{data.contador.totalMovimientos.toLocaleString('es-ES')}</strong> movimientos · cargos {formatCentsText(data.contador.cargos.importeCentimos)} · cobros {formatCentsText(data.contador.cobros.importeCentimos)}</p>}</div><p className="mt-2 text-xs leading-5 text-slate-600">El filtro de pendientes se aplica a toda la cola antes de paginar. Los movimientos aparecen siempre de mayor a menor importe.</p></div>
    {!loading && rows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-700">No hay movimientos de Paso 1 con estos filtros.</p> : <div className="space-y-4">{rows.map((movement) => {
      const availableCandidates = mergeCandidates(movement.paso1.candidatos, searchedCandidates[movement.id] || []);
      const selectedCandidate = availableCandidates.find(item => item.id === selected[movement.id]);
      const draft = searchDraft[movement.id] || '';
      const searching = searchingMovement === movement.id;
      return <article key={movement.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="bg-slate-900 p-4 text-white"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-blue-300">Movimiento bancario · Paso 1</p><h3 className="mt-1 break-words text-base font-extrabold">{movement.paso1.etiqueta || 'Tercero sin identificar'}</h3><p className="mt-1 break-words text-sm text-slate-200">{movement.concepto}</p></div><p className="shrink-0 text-lg font-extrabold tabular-nums">{cents(movement.importeCentimos)}</p></div></header><div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="font-bold text-slate-950">Banco</h4><dl className="mt-3 grid gap-2 text-sm"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</dt><dd className="font-semibold text-slate-900">{displayDate(movement.fecha)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta</dt><dd className="font-semibold text-slate-900">{movement.cuenta.banco}{movement.cuenta.alias ? ` · ${movement.cuenta.alias}` : ''}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paso 2 documental</dt><dd className="font-semibold text-slate-900">{movement.paso2.estadoPaso2.replaceAll('_', ' ').toLocaleLowerCase('es-ES')}</dd></div></dl></section><section className="rounded-xl border border-blue-200 bg-blue-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold text-slate-950">Tercero y fuente</h4><p className="mt-1 text-sm text-slate-700">Estado actual: <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${stateClass(movement.paso1.estadoPaso1)}`}>{movement.paso1.estadoPaso1.replaceAll('_', ' ').toLocaleLowerCase('es-ES')}</span></p></div>{movement.paso1.tipoTercero && <p className="rounded-full border border-blue-300 bg-white px-2 py-1 text-xs font-bold text-blue-950">{movement.paso1.tipoTercero.replaceAll('_', ' ').toLocaleLowerCase('es-ES')} · {originLabel(movement.paso1.origenPaso1)}</p>}</div>{movement.paso1.propuestaTexto && movement.paso1.estadoPaso1 !== 'IDENTIFICADO' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950"><strong>Texto bancario propuesto:</strong> {movement.paso1.propuestaTexto}. No confirma identidad ni preselecciona ningún tercero.</p>}{movement.paso1.estadoPaso1 === 'IDENTIFICADO' ? <div className="mt-3 rounded-lg bg-white p-3"><p className="font-bold text-slate-950">{movement.paso1.etiqueta}</p><p className="mt-1 text-xs text-slate-600">Fuente: {originLabel(movement.paso1.origenPaso1)}. La decisión documental sigue siendo {movement.paso2.estadoPaso2.replaceAll('_', ' ').toLocaleLowerCase('es-ES')}.</p>{movement.paso1.decisionId && <button type="button" disabled={busy} onClick={() => openRevert(movement)} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50">Revertir identificación</button>}</div> : <div className="mt-3"><label className="text-sm font-bold text-slate-800">Buscar tercero en el sistema<div className="mt-1 flex"><input value={draft} maxLength={MAX_SEARCH} onChange={(event) => setSearchDraft(current => ({ ...current, [movement.id]: event.target.value.slice(0, MAX_SEARCH) }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchSystemCandidates(movement); } }} placeholder="Nombre, tipo o referencia…" className="min-w-0 flex-1 rounded-l-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div></label><button type="button" disabled={busy || searching || !draft.trim()} onClick={() => void searchSystemCandidates(movement)} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-950 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />{searching ? 'Buscando…' : 'Buscar tercero en el sistema'}</button><div className="mt-3 space-y-2" role="radiogroup" aria-label="Evidencias de tercero"><p className="text-xs text-slate-600">Sólo se muestran registros con identificador P1 opaco devueltos por el backend. No se puede escribir ni convertir texto bancario en un tercero.</p>{availableCandidates.map((item) => <label key={item.id} className={`block cursor-pointer rounded-lg border p-3 ${selectedCandidate?.id === item.id ? 'border-blue-500 bg-white ring-1 ring-blue-300' : 'border-blue-100 bg-white/75 hover:border-blue-300'}`}><input type="radio" name={`p1-${movement.id}`} checked={selectedCandidate?.id === item.id} onChange={() => setSelected(current => ({ ...current, [movement.id]: item.id }))} className="sr-only" /><span className="block font-bold text-slate-950">{item.etiqueta}</span><span className="mt-1 block text-xs text-slate-600">{item.tipoTercero.replaceAll('_', ' ').toLocaleLowerCase('es-ES')} · fuente {originLabel(item.origenPaso1)}</span></label>)}{availableCandidates.length === 0 && <p className="rounded-lg bg-white p-3 text-sm text-slate-700">No hay evidencia estable disponible todavía. Usa la búsqueda del sistema; el texto bancario no puede sustituirla.</p>}</div><button type="button" disabled={busy || !selectedCandidate} onClick={() => openConfirm(movement, availableCandidates)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"><ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />Guardar identificación</button></div>}</section></div></article>;
    })}</div>}
    {data && <nav aria-label="Paginación de terceros" className="flex items-center justify-between gap-3"><button type="button" disabled={busy || offset <= 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Anterior</button><span className="text-sm text-slate-700">{data.total ? `${offset + 1}–${Math.min(offset + data.limit, data.total)} de ${data.total}` : 'Sin resultados'}</span><button type="button" disabled={busy || offset + data.limit >= data.total} onClick={() => setOffset(offset + LIMIT)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Siguiente</button></nav>}
    {confirming && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 sm:items-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="p1-confirm-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex gap-3"><CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" aria-hidden="true" /><div><h2 id="p1-confirm-title" className="text-lg font-extrabold text-slate-950">Confirmación final de Paso 1</h2><p className="mt-2 text-sm leading-6 text-slate-700">{confirming.kind === 'confirm' ? <>Identificarás este movimiento como <strong>{confirming.candidate.etiqueta}</strong>, tipo <strong>{confirming.candidate.tipoTercero.replaceAll('_', ' ').toLocaleLowerCase('es-ES')}</strong>, con fuente <strong>{originLabel(confirming.candidate.origenPaso1)}</strong>. Esto no modifica la decisión documental B4.</> : <>Revertirás el recibo de identificación. No modifica entidades, texto bancario ni la decisión documental B4.</>}</p></div></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={submitting || pending !== null} onClick={() => setConfirming(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800">Cancelar</button><button type="button" disabled={submitting || pending !== null} onClick={() => void send(confirming)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600">{submitting ? 'Enviando…' : 'Guardar definitivamente'}</button></div></section></div>}
  </section>;
}
