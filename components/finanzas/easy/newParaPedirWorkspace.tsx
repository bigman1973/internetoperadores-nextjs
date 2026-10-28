'use client';

import {
  ArrowDownTrayIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon,
  DocumentMagnifyingGlassIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseParaPedirRead,
  type ParaPedirAgrupacion,
  type ParaPedirEstado,
  type ParaPedirMovimiento,
  type ParaPedirRead,
} from '@/lib/finanzas/para-pedir-contract';
import { makeIdempotencyKey, parseConciliarActionResponse, safeOutcomeMessage } from '@/components/finanzas/conciliar/conciliar-contract';
import { useActuation } from '@/components/impersonation/ActuationProvider';

const API = '/api/admin/finanzas/modo-facil/para-pedir';
const CONCILIAR_API = '/api/admin/finanzas/conciliar';
const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;
type Notice = Readonly<{ tone: 'error' | 'info' | 'success'; text: string }> | null;

function money(value: number): string {
  const sign = value < 0 ? '−' : value > 0 ? '+' : '';
  return `${sign}${(Math.abs(value) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;
}
function displayDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : value;
}
function requestStatusLabel(state: ParaPedirMovimiento['estadoPedido']): string {
  if (state === 'PEDIDO') return 'Pedido registrado';
  if (state === 'PEDIDO_SIN_AUDITORIA') return 'Pedido sin auditoría verificable';
  if (state === 'RECIBIDO') return 'Documento recibido; revisar';
  return 'Sin pedir';
}
function requestStatusClass(state: ParaPedirMovimiento['estadoPedido']): string {
  if (state === 'PEDIDO') return 'bg-amber-100 text-amber-950 ring-amber-300';
  if (state === 'PEDIDO_SIN_AUDITORIA') return 'bg-red-100 text-red-950 ring-red-300';
  if (state === 'RECIBIDO') return 'bg-blue-100 text-blue-950 ring-blue-300';
  return 'bg-slate-100 text-slate-800 ring-slate-300';
}
function friendlyReadError(body: unknown): string {
  const raw = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error.toLowerCase() : '';
  if (/permiso|forbidden|autoriz/.test(raw)) return 'No tienes permiso para ver esta lista.';
  if (/proyecci.n|prepar/.test(raw)) return 'La lista se está preparando. Vuelve a intentarlo en unos instantes.';
  return 'No se ha podido actualizar la lista. Vuelve a intentarlo.';
}
function friendlyAskError(body: unknown): string {
  const raw = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
  if (/permiso|forbidden|autoriz/i.test(raw)) return 'No tienes permiso para registrar la solicitud.';
  if (/cambi|hash|desactualiz|conflict/i.test(raw)) return 'El movimiento cambió. Actualiza la lista y vuelve a revisar antes de pedir el documento.';
  return safeOutcomeMessage(raw, 'No se pudo registrar la solicitud de documento.');
}
function queryFor(input: Readonly<{ estado: ParaPedirEstado; query: string; tercero: string | null; limit: number; offset: number }>): URLSearchParams {
  const params = new URLSearchParams({ estado: input.estado, limit: String(input.limit), offset: String(input.offset) });
  if (input.query.trim()) params.set('q', input.query.trim().slice(0, 120));
  if (input.tercero) params.set('tercero', input.tercero);
  return params;
}
function filenamePart(value: string): string {
  const clean = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return clean || 'tercero';
}

/**
 * Bandeja documental SSR. No invoca Modo Fácil, no calcula sugerencias y no
 * incorpora una subida: la carga manual privada existente conserva su propio
 * permiso y confirmación; el cierre se revisa de nuevo en Conciliar.
 */
export default function NewParaPedirWorkspace({
  environment,
  initialData,
}: {
  environment: 'staging' | 'production';
  initialData: ParaPedirRead;
}) {
  const { active: activeActuation } = useActuation();
  const [data, setData] = useState<ParaPedirRead>(initialData);
  const [estado, setEstado] = useState<ParaPedirEstado>(initialData.filtro.estado);
  const [queryDraft, setQueryDraft] = useState(initialData.filtro.q ?? '');
  const [query, setQuery] = useState(initialData.filtro.q ?? '');
  const [tercero, setTercero] = useState<string | null>(initialData.filtro.tercero);
  const [offset, setOffset] = useState(initialData.offset);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [askingMovementId, setAskingMovementId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const skipInitialRead = useRef(true);

  const load = useCallback(async (silent = false, overrides?: Partial<Readonly<{ estado: ParaPedirEstado; query: string; tercero: string | null; offset: number }>>) => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const current = {
      estado: overrides?.estado ?? estado,
      query: overrides?.query ?? query,
      tercero: overrides?.tercero === undefined ? tercero : overrides.tercero,
      offset: overrides?.offset ?? offset,
    };
    const id = ++sequence.current;
    setRefreshing(true);
    try {
      const response = await fetch(`${API}?${queryFor({ ...current, limit: PAGE_SIZE }).toString()}`, { cache: 'no-store', signal: active.signal });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyReadError(raw));
      const next = parseParaPedirRead(raw);
      if (id !== sequence.current) return;
      setData(next);
      setNotice(silent ? { tone: 'success', text: 'Lista actualizada con la foto disponible.' } : null);
    } catch (error) {
      if (active.signal.aborted || id !== sequence.current) return;
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se ha podido actualizar la lista.' });
    } finally {
      if (id === sequence.current) setRefreshing(false);
      if (controller.current === active) controller.current = null;
    }
  }, [estado, offset, query, tercero]);

  useEffect(() => {
    if (skipInitialRead.current) { skipInitialRead.current = false; return; }
    void load();
  }, [estado, query, tercero, offset, load]);
  useEffect(() => () => controller.current?.abort(), []);

  const applySearch = useCallback(() => {
    const next = queryDraft.trim().slice(0, 120);
    if (next === query && offset === 0) return;
    setQuery(next);
    setOffset(0);
  }, [offset, query, queryDraft]);
  const changeState = useCallback((next: ParaPedirEstado) => { setEstado(next); setOffset(0); }, []);
  const openGroup = useCallback((group: ParaPedirAgrupacion) => { setTercero(group.tercero); setOffset(0); }, []);
  const resetGroup = useCallback(() => { setTercero(null); setOffset(0); }, []);

  const askForDocument = useCallback(async (movement: ParaPedirMovimiento) => {
    const capability = movement.conciliarPedir;
    if (!capability || askingMovementId) return;
    setAskingMovementId(movement.movimientoId);
    setNotice(null);
    try {
      const response = await fetch(CONCILIAR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeActuation ? { 'x-io-acting-session': activeActuation.sessionId } : {}),
        },
        body: JSON.stringify({ action: 'pedir', id: capability.rowId, decisionHash: capability.decisionHash, idempotencyKey: makeIdempotencyKey() }),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyAskError(raw));
      const result = parseConciliarActionResponse(raw);
      const outcome = result.outcomes.find((candidate) => candidate.id === capability.rowId);
      if (!outcome?.ok) throw new Error(safeOutcomeMessage(outcome?.message ?? '', 'No se pudo registrar la solicitud de documento.'));
      await load();
      setNotice({ tone: 'success', text: 'Solicitud registrada. No se ha enviado ningún aviso.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo registrar la solicitud de documento.' });
    } finally {
      setAskingMovementId(null);
    }
  }, [activeActuation, askingMovementId, load]);

  const exportGroup = useCallback(async (group: ParaPedirAgrupacion) => {
    if (exporting) return;
    setExporting(group.tercero);
    setNotice(null);
    try {
      const first = await fetch(`${API}?${queryFor({ estado, query, tercero: group.tercero, limit: EXPORT_PAGE_SIZE, offset: 0 }).toString()}`, { cache: 'no-store' });
      const firstRaw: unknown = await first.json().catch(() => null);
      if (!first.ok) throw new Error(friendlyReadError(firstRaw));
      const firstPage = parseParaPedirRead(firstRaw);
      if (firstPage.total > MAX_EXPORT_ROWS) throw new Error(`La solicitud supera ${MAX_EXPORT_ROWS.toLocaleString('es-ES')} movimientos. Acota la búsqueda antes de exportar.`);
      const rows: ParaPedirMovimiento[] = [...firstPage.movimientos];
      const version = firstPage.proyeccion.version;
      for (let pageOffset = firstPage.limit; pageOffset < firstPage.total; pageOffset += EXPORT_PAGE_SIZE) {
        const response = await fetch(`${API}?${queryFor({ estado, query, tercero: group.tercero, limit: EXPORT_PAGE_SIZE, offset: pageOffset }).toString()}`, { cache: 'no-store' });
        const raw: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(friendlyReadError(raw));
        const page = parseParaPedirRead(raw);
        if (page.proyeccion.version !== version) throw new Error('La lista cambió mientras se preparaba el archivo. Actualiza y vuelve a exportar.');
        rows.push(...page.movimientos);
      }
      const [XLSX, xlsx] = await Promise.all([import('xlsx'), import('./para-pedir-xlsx')]);
      const bytes = await xlsx.createParaPedirXlsx(XLSX, group.tercero, rows);
      xlsx.downloadParaPedirXlsx(bytes, `solicitud-documentacion-${filenamePart(group.tercero)}.xlsx`);
      setNotice({ tone: 'success', text: `Archivo preparado con ${rows.length.toLocaleString('es-ES')} movimiento(s) de ${group.tercero}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo preparar el archivo.' });
    } finally {
      setExporting(null);
    }
  }, [estado, exporting, query]);

  const noticeClass = notice?.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950' : notice?.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-blue-300 bg-blue-50 text-blue-950';
  const isFirstPage = data.offset === 0;
  const canNext = data.offset + data.movimientos.length < data.total;

  return <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-3 py-5 sm:px-6 lg:px-8">
    <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
      <div className="flex gap-3">
        <DocumentMagnifyingGlassIcon className="mt-0.5 h-7 w-7 shrink-0 text-orange-300" aria-hidden="true" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">Finanzas · {environment === 'production' ? 'consulta protegida' : 'staging aislado'}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Para pedir documentación</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Organiza los comprobantes pendientes por proveedor o tercero. Pedir desde Conciliar sólo deja una marca auditada: no envía avisos, no sincroniza y no cierra ninguna revisión.</p>
        </div>
      </div>
    </header>

    <section aria-label="Resumen de documentación pendiente" className="grid gap-3 sm:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Movimientos de la selección</p><p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-950">{data.resumen.movimientos.toLocaleString('es-ES')}</p><p className="mt-1 text-xs text-slate-600">Foto disponible: {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.proyeccion.actualizadaEn))}</p></article>
      <article className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-orange-900">Importe pendiente firmado</p><p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-950">{money(data.resumen.pendienteCentimos)}</p><p className="mt-1 text-xs text-orange-950">{data.proyeccion.pendienteActualizacion ? 'Hay cambios pendientes de actualizar; revisa antes de confirmar.' : 'La foto no informa cambios pendientes.'}</p></article>
    </section>

    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${noticeClass}`}>{notice.text}</p>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Filtros de Para pedir">
      <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)_auto] lg:items-end">
        <label className="text-sm font-bold text-slate-800">Estado de pedido
          <select value={estado} onChange={(event) => changeState(event.target.value as ParaPedirEstado)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="TODOS">Todos</option><option value="SIN_PEDIR">Sin pedir</option><option value="PEDIDO">Pedido</option><option value="PEDIDO_MAS_15_DIAS">Pedido hace más de 15 días</option>
          </select>
        </label>
        <form onSubmit={(event) => { event.preventDefault(); applySearch(); }} className="min-w-0"><label className="text-sm font-bold text-slate-800">Buscar tercero, documento o concepto<input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} maxLength={120} placeholder="Proveedor, referencia o concepto…" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" /></label></form>
        <div className="flex gap-2"><button type="button" onClick={applySearch} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500">Buscar</button><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button></div>
      </div>
      {tercero && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3"><p className="text-sm text-slate-700">Mostrando la solicitud de <strong>{tercero}</strong>.</p><button type="button" onClick={resetGroup} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500">Ver todos los terceros</button></div>}
    </section>

    {!tercero && <section aria-labelledby="para-pedir-groups-title"><div className="mb-3"><h2 id="para-pedir-groups-title" className="text-xl font-extrabold text-slate-950">Solicitudes por tercero</h2><p className="mt-1 text-sm text-slate-600">Cada tarjeta indica cuántos documentos conviene reunir y su importe pendiente. El archivo se prepara sólo para ese tercero.</p></div>{data.agrupaciones.length === 0 ? <Empty /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.agrupaciones.map((group) => <article key={group.tercero} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="break-words text-base font-extrabold text-slate-950">{group.tercero}</h3><dl className="mt-4 grid grid-cols-2 gap-3"><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Pendientes</dt><dd className="mt-1 text-xl font-extrabold tabular-nums text-slate-950">{group.movimientos.toLocaleString('es-ES')}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Importe</dt><dd className="mt-1 text-xl font-extrabold tabular-nums text-slate-950">{money(group.pendienteCentimos)}</dd></div></dl><p className="mt-3 text-xs text-slate-600">Pedidos registrados: {group.pedidos.toLocaleString('es-ES')} · más de 15 días: {group.pedidosMas15Dias.toLocaleString('es-ES')}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => openGroup(group)} className="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500">Ver movimientos</button><button type="button" onClick={() => void exportGroup(group)} disabled={exporting !== null} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-950 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"><ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />{exporting === group.tercero ? 'Preparando…' : 'Excel'}</button></div></article>)}</div>}</section>}

    <section aria-labelledby="para-pedir-list-title"><div className="mb-3"><h2 id="para-pedir-list-title" className="text-xl font-extrabold text-slate-950">{tercero ? `Movimientos de ${tercero}` : 'Movimientos pendientes'}</h2><p className="mt-1 text-sm text-slate-600">La recepción de un archivo no vincula el banco. Vuelve a Conciliar para revisar y confirmar manualmente.</p></div>{data.movimientos.length === 0 ? <Empty /> : <div className="space-y-3">{data.movimientos.map((movement) => <MovementCard key={movement.movimientoId} movement={movement} onAskDocument={askForDocument} asking={askingMovementId === movement.movimientoId} />)}</div>}</section>

    <nav aria-label="Paginación de Para pedir" className="flex items-center justify-between gap-3"><button type="button" disabled={refreshing || isFirstPage} onClick={() => setOffset(Math.max(0, data.offset - data.limit))} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />Anterior</button><span className="text-sm text-slate-700">{data.total.toLocaleString('es-ES')} movimiento(s) · página {Math.floor(data.offset / data.limit) + 1}</span><button type="button" disabled={refreshing || !canNext} onClick={() => setOffset(data.offset + data.limit)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Siguiente<ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></nav>

    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><div className="flex gap-2"><InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><p><strong>Flujo manual y revisable.</strong> Si dispones de un comprobante, usa la carga privada manual ya existente. Guardarlo no concilia ni vincula el banco; después se revisa y confirma en Conciliar. Esta pantalla no envía correos, no sincroniza ni crea enlaces automáticos.</p></div></section>
  </main>;
}

function MovementCard({ movement, onAskDocument, asking }: { movement: ParaPedirMovimiento; onAskDocument: (movement: ParaPedirMovimiento) => void; asking: boolean }) {
  const conciliar = `/admin/finanzas/conciliar?tab=${encodeURIComponent(movement.tab)}&q=${encodeURIComponent(movement.movimientoId)}`;
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-wrap items-start justify-between gap-3 bg-slate-900 px-4 py-4 text-white"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-orange-300">{movement.tercero ?? 'Sin tercero documental'} · {movement.tab === 'PAGOS' ? 'Pago' : 'Cobro'}</p><h3 className="mt-1 break-words text-base font-extrabold">{movement.concepto}</h3><p className="mt-1 text-sm text-slate-200">{displayDate(movement.fecha)} · {movement.banco ?? 'Banco no disponible'}{movement.cuenta ? ` · ${movement.cuenta}` : ''}</p></div><p className="shrink-0 text-lg font-extrabold tabular-nums">{money(movement.pendienteCentimos)}</p></header><div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${requestStatusClass(movement.estadoPedido)}`}>{requestStatusLabel(movement.estadoPedido)}</span>{movement.pedido ? <p className="mt-3 text-sm text-slate-800"><strong>Pedido registrado:</strong> {displayDate(movement.pedido.dia)}{movement.pedido.actorNombre ? ` · ${movement.pedido.actorNombre}` : ' · actor no disponible'} · hace {movement.pedido.diasTranscurridos.toLocaleString('es-ES')} día(s).</p> : movement.estadoPedido === 'PEDIDO_SIN_AUDITORIA' ? <p className="mt-3 text-sm text-red-900">No hay fecha ni persona verificable para este pedido; revisa la auditoría antes de actuar.</p> : null}<dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Documento</dt><dd className="font-semibold text-slate-900">{movement.referenciaDocumento ?? 'Aún no identificado'}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Motivo</dt><dd className="text-slate-800">{movement.motivo}</dd></div></dl></div><div className="flex flex-wrap items-start gap-2">{movement.conciliarPedir && <button type="button" onClick={() => onAskDocument(movement)} disabled={asking} className="inline-flex min-h-10 items-center rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-950 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">{asking ? 'Registrando…' : 'Marcar como pedido'}</button>}<a href={conciliar} className="inline-flex min-h-10 items-center rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500">Ya tengo el papel → revisar en Conciliar</a></div></div></article>;
}
function Empty() { return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-700">No hay movimientos que coincidan con esta selección.</p>; }
