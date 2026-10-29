'use client';
// B7 candidato; SHA-256 base (root actual leído): 5675d6a1518cee2b3f28cf1ae2a65c0f06a881e03ba0f56b69436e97afc6e59f

import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ArrowPathIcon, ArrowTopRightOnSquareIcon, BanknotesIcon, ChevronLeftIcon,
  ChevronRightIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { usePermisoArea } from '@/hooks/usePermisoArea';
import ManualCoverageOverlay from '@/components/finanzas/ManualCoverageOverlay';
import {
  VISTAS_B5, esMotivoNoRequiere, formatCents, leerConfiguracionB5, leerContadoresB5, leerItemsB5,
  type CoberturaB5, type ConfiguracionB5, type ContadorB5, type ConfirmarNoRequiereB4,
  type FacturaPendienteB5, type GestionPatchB5,
  type ItemsResponseB5, type MovimientoPendienteB5, type MotivoNoRequiereB4, type VistaB5,
} from './types';

const AREA_B4 = 'admin.finanzas.conciliacion';
const API = '/api/admin/finanzas/pendientes';
const B4_API = '/api/admin/finanzas/conciliacion-v2';
const PAGE_SIZE = 50;
const B7_REVIEW_REASON_LABELS: Record<string, string> = {
  FUENTE_B2_NO_ECONOMICA: 'La fuente FacturaEmitida no está acreditada como económica.',
  IMPORTE_FUENTE_INEXACTO_O_AUSENTE: 'El total de la fuente no es exacto o falta.',
  TOTAL_CERO_SIN_COBRO_EXIGIBLE: 'Total cero: no existe cobro exigible.',
  TOTAL_CERO_NOCobro: 'Total cero: no existe cobro exigible.',
  FECHA_FUENTE_DESCONOCIDA: 'La fecha de FacturaEmitida no está disponible.',
  ENVOLTORIO_FI_NO_COINCIDE_CON_FUENTE: 'El documento bancario no coincide exactamente con la fuente FacturaEmitida.',
  EVIDENCIA_B4_DIRECTA_NO_VIGENTE: 'La evidencia B4 directa no está vigente o no cumple el cierre documental.',
  SOLAPAMIENTO_FI_DIRECTA_Y_REMESA: 'Hay evidencia directa y de remesa solapadas; requiere revisión.',
  REMESA_FUENTE_O_MAPA_FI_INEXACTO: 'La remesa o su mapa explícito con FacturaEmitida no es exacto.',
  REMESA_EVIDENCIA_B4_NO_VIGENTE: 'La evidencia bancaria B4 de la remesa no está vigente.',
  REMESA_SUMA_NO_SEGURA: 'La suma documental de la remesa no es segura.',
  REMESA_DEVOLUCION_SIN_ATRIBUCION_B6_EXACTA: 'Existe devolución de remesa sin atribución B6 exacta confirmada.',
  REMESA_DEVOLUCION_FUERA_DE_RANGO: 'La devolución de remesa queda fuera del rango firmado de la factura.',
  SUMA_NO_SEGURA_O_FUENTE_INEXACTA: 'No se pudo verificar una suma o una fuente exacta.',
  COBRO_DOCUMENTAL_FUERA_DE_RANGO_FIRMADO: 'El cobro documental queda fuera del rango firmado permitido.',
};
const TABS: Array<{ id: VistaB5; label: string; description: string }> = [
  { id: 'CARGOS_SIN_DOCUMENTO', label: 'Cargos sin documento', description: 'Cargos bancarios pendientes de soporte.' },
  { id: 'COBROS_SIN_DOCUMENTO', label: 'Cobros sin documento', description: 'Abonos bancarios pendientes de soporte.' },
  { id: 'FACTURAS_RECIBIDAS_SIN_PAGO', label: 'Facturas recibidas sin pago', description: 'Pendiente de pagar según líneas B4 activas.' },
  { id: 'FACTURAS_EMITIDAS_SIN_COBRO', label: 'Facturas emitidas sin cobro', description: 'Pendiente de cobrar según líneas B4 activas.' },
];
const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES');
const EditDialog = dynamic(() => import('./PendientesDialogs').then((module) => module.EditDialog), { ssr: false });
const NoRequireDialog = dynamic(() => import('./PendientesDialogs').then((module) => module.NoRequireDialog), { ssr: false });
const AttachmentsDialog = dynamic(() => import('./PendientesDialogs').then((module) => module.AttachmentsDialog), { ssr: false });
const UploadDialog = dynamic(() => import('./PendientesDialogs').then((module) => module.UploadDialog), { ssr: false });
const RectificativasHumanasPanel = dynamic(() => import('@/components/finanzas/rectificativas/RectificativasHumanasPanel'), { ssr: false });
type Notice = { kind: 'error' | 'success' | 'info'; text: string } | null;
type CardFilter = 'TODAS' | string;
type NoRequireDialogState = { movement: MovimientoPendienteB5; reason: MotivoNoRequiereB4 | ''; payload: ConfirmarNoRequiereB4 | null; retry: boolean } | null;

function monthNow(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function monthRange(month: string): { desde: string; hasta: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return { desde: first.toISOString().slice(0, 10), hasta: last.toISOString().slice(0, 10) };
}
function message(value: unknown, fallback: string): string {
  return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error : fallback;
}
function key(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `b5-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function isBankView(view: VistaB5): boolean { return view === 'CARGOS_SIN_DOCUMENTO' || view === 'COBROS_SIN_DOCUMENTO'; }
function formatMoney(cents: number | null): string { return formatCents(cents); }
function formatCentsText(cents: string): string {
  if (!/^-?\d+$/.test(cents)) return 'Importe no verificable';
  const integer = BigInt(cents);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(-Number.MAX_SAFE_INTEGER)) return 'Importe no verificable';
  return formatCents(Number(integer));
}
function formatDate(value: string | null): string { return value ? DATE_FORMATTER.format(new Date(`${value}T00:00:00`)) : 'Fecha no disponible'; }
function ageInCivilDays(value: string | null): number | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = new Date(); // Always evaluate the operator's current civil date; never a build-time date.
  const from = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - from) / 86_400_000);
}
function labelAccount(account: { banco: string; alias: string | null }): string { return `${account.banco}${account.alias ? ` · ${account.alias}` : ''}`; }
function labelB7ReviewReason(reason: string): string { return B7_REVIEW_REASON_LABELS[reason] || reason; }
function labelB7Source(source: 'B4_DIRECTO' | 'B4_REMESA'): string { return source === 'B4_DIRECTO' ? 'Cobro documental confirmado · B4 directo' : 'Cobro documental confirmado · B6 remesa'; }
function labelB7Client(item: FacturaPendienteB5): string {
  const client = item.cliente || (item.tercero === 'SIN_CLIENTE_FUENTE' ? null : item.tercero);
  return client || 'Cliente sin dato verificable';
}
function statusClass(state: string): string {
  if (state === 'VINCULADO') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (state === 'NO_REQUIERE') return 'bg-orange-50 text-orange-900 ring-orange-200';
  if (state === 'RECIBIDO') return 'bg-blue-50 text-blue-800 ring-blue-200';
  if (state === 'PEDIDO') return 'bg-amber-50 text-amber-900 ring-amber-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}
export default function PendientesWorkspace() {
  const { canRead, canWrite } = usePermisoArea(AREA_B4);
  const [vista, setVista] = useState<VistaB5>('CARGOS_SIN_DOCUMENTO');
  const [mes, setMes] = useState(monthNow);
  const [cuentaId, setCuentaId] = useState('');
  const [cobertura, setCobertura] = useState<CoberturaB5>('TODAS');
  const [query, setQuery] = useState('');
  const [card, setCard] = useState<CardFilter>('TODAS');
  const [offset, setOffset] = useState(0);
  const [itemsData, setItemsData] = useState<ItemsResponseB5 | null>(null);
  const [counters, setCounters] = useState<ContadorB5[] | null>(null);
  const [config, setConfig] = useState<ConfiguracionB5 | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  // Keep the initial placeholders in the first paint. Otherwise the counters
  // and the table are inserted together after their read and move the page.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<MovimientoPendienteB5 | null>(null);
  const [noRequire, setNoRequire] = useState<NoRequireDialogState>(null);
  const [uploadingFor, setUploadingFor] = useState<MovimientoPendienteB5 | null>(null);
  const [viewingAttachments,setViewingAttachments]=useState<MovimientoPendienteB5|null>(null);
  const readSequence = useRef(0);
  const pendingRead = useRef<{ key: string; promise: Promise<void>; controller: AbortController } | null>(null);
  const activeRead = useRef<AbortController | null>(null);

  const dates = useMemo(() => monthRange(mes), [mes]);
  const accountDisabled = !isBankView(vista);
  const accounts = config?.cuentas || itemsData?.coberturaCuentas.cuentas || [];
  const buildParams = useCallback((resource: 'items' | 'contadores') => {
    const params = new URLSearchParams({ recurso: resource, cobertura, desde: dates?.desde || '', hasta: dates?.hasta || '' });
    if (query) params.set('q', query);
    if (card !== 'TODAS' && isBankView(vista)) params.set('tarjeta',card);
    if (resource === 'items') { params.set('vista', vista); params.set('limit', String(PAGE_SIZE)); params.set('offset', String(offset)); }
    if (cuentaId && (resource === 'contadores' || isBankView(vista))) params.set('cuentaId', cuentaId);
    return params;
  }, [cobertura, cuentaId, dates?.desde, dates?.hasta, offset, query, vista, card]);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API}?recurso=configuracion`, { cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(json, 'No se pudo cargar la configuración activa.'));
      setConfig(leerConfiguracionB5(json));
      setConfigError(null);
    } catch (error) {
      // The planned metadata resource is intentionally not guessed from names or card text.
      setConfig(null);
      setConfigError(error instanceof Error ? error.message : 'Configuración de responsables no disponible.');
    }
  }, []);
  const load = useCallback((silent = false): Promise<void> => {
    if (!canRead || !dates) return Promise.resolve();
    const itemsQuery = buildParams('items').toString();
    const countersQuery = buildParams('contadores').toString();
    const requestKey = `${itemsQuery}|${countersQuery}`;
    // Effects can be replayed while permissions settle. Reuse the same read
    // when its complete parameter set is identical instead of issuing it twice.
    if (pendingRead.current?.key === requestKey && !pendingRead.current.controller.signal.aborted) return pendingRead.current.promise;
    // A changed filter supersedes the previous response. Abort it before its
    // JSON parsing and validation can compete with the next user interaction.
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    const sequence = ++readSequence.current;
    if (silent) setRefreshing(true); else { setLoading(true); setItemsData(null); setCounters(null); }
    const promise = (async () => {
      try {
        const [itemsResponse, countersResponse] = await Promise.all([
          fetch(`${API}?${itemsQuery}`, { cache: 'no-store', signal: controller.signal }),
          fetch(`${API}?${countersQuery}`, { cache: 'no-store', signal: controller.signal }),
        ]);
        const [itemsJson, countersJson] = await Promise.all([itemsResponse.json().catch(() => null), countersResponse.json().catch(() => null)]);
        if (!itemsResponse.ok) throw new Error(message(itemsJson, 'No se pudo leer la bandeja de pendientes.'));
        if (!countersResponse.ok) throw new Error(message(countersJson, 'No se pudieron leer los contadores B5.'));
        if (sequence !== readSequence.current) return;
        // Both response parsers reject malformed data; an error never becomes an empty/zero financial state.
        setItemsData(leerItemsB5(itemsJson));
        setCounters(leerContadoresB5(countersJson).contadores);
        if (!silent) setNotice(null);
      } catch (error) {
        if (sequence === readSequence.current) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo leer Pendientes B5.' });
      } finally {
        if (sequence === readSequence.current) { setLoading(false); setRefreshing(false); }
        if (activeRead.current === controller) activeRead.current = null;
      }
    })();
    pendingRead.current = { key: requestKey, promise, controller };
    void promise.finally(() => {
      if (pendingRead.current?.promise === promise) pendingRead.current = null;
    });
    return promise;
  }, [buildParams, canRead, dates]);

  useEffect(() => { if (canRead) void loadConfig(); }, [canRead, loadConfig]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    readSequence.current += 1;
    activeRead.current?.abort();
  }, []);

  const resetPaginationAndCard = useCallback(() => { setOffset(0); setCard('TODAS'); }, []);
  const changeVista = useCallback((value: VistaB5) => { setVista(value); resetPaginationAndCard(); }, [resetPaginationAndCard]);
  const changeMes = useCallback((value: string) => { setMes(value); resetPaginationAndCard(); }, [resetPaginationAndCard]);
  const changeCuenta = useCallback((value: string) => { setCuentaId(value); resetPaginationAndCard(); }, [resetPaginationAndCard]);
  const changeCobertura = useCallback((value: CoberturaB5) => { setCobertura(value); resetPaginationAndCard(); }, [resetPaginationAndCard]);
  const changeQuery = useCallback((value: string) => {
    if (value === query) return;
    setQuery(value);
    resetPaginationAndCard();
  }, [query, resetPaginationAndCard]);
  const changeCard = useCallback((value: CardFilter) => { setOffset(0); setCard(value); }, []);

  const bankItems = useMemo(() => (itemsData?.items || []).filter((item): item is MovimientoPendienteB5 => item.tipo === 'MOVIMIENTO'), [itemsData]);
  const invoiceItems = useMemo(() => (itemsData?.items || []).filter((item): item is FacturaPendienteB5 => item.tipo !== 'MOVIMIENTO'), [itemsData]);
  const cardOptions = useMemo(() => {
    const configured = config?.tarjetas || [];
    return configured.filter((item, index, all) => all.findIndex((current) => current.last4 === item.last4) === index);
  }, [config]);
  const displayedMovements = useMemo(() => card === 'TODAS' ? bankItems : bankItems.filter((item) => item.tarjeta?.terminacion === card), [bankItems, card]);
  const ticketCount = useMemo(() => bankItems.filter((item) => item.tarjeta && item.b4.estado === 'SIN_DOCUMENTO').length, [bankItems]);
  const groupedMovements = useMemo(() => {
    const groups: Array<{ tercero: string; rows: MovimientoPendienteB5[] }> = [];
    const byTercero = new Map<string, { tercero: string; rows: MovimientoPendienteB5[] }>();
    // API order is authoritative (absolute amount, date, id). First occurrence
    // determines group order and every row keeps its server order within it.
    displayedMovements.forEach((item) => {
      const group = byTercero.get(item.grupoTercero) || { tercero: item.grupoTercero, rows: [] };
      if (!byTercero.has(item.grupoTercero)) { byTercero.set(item.grupoTercero, group); groups.push(group); }
      group.rows.push(item);
    });
    return groups;
  }, [displayedMovements]);
  const coverageUnknown = itemsData?.coberturaCuentas.sinCoberturaVerificableCount || 0;

  const updateGestion = async (payload: GestionPatchB5) => {
    try {
      const response = await fetch(API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(json, 'No se pudo guardar la gestión humana.'));
      setEditing(null);
      setNotice({ kind: 'success', text: 'Gestión humana registrada. Se han vuelto a leer los datos del servidor.' });
      await load(true); // Server response remains authority; no optimistic financial or state change.
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la gestión.' }); }
  };
  const openNoRequire = useCallback((movement: MovimientoPendienteB5) => {
    if (movement.importeCentimos === null) { setNotice({ kind: 'error', text: 'El importe bancario es desconocido: B4 no puede confirmar No requiere.' }); return; }
    setNoRequire({ movement, reason: '', payload: null, retry: false });
  }, []);
  const reviewNoRequire = () => {
    if (!noRequire || !esMotivoNoRequiere(noRequire.reason) || noRequire.movement.importeCentimos === null) return;
    const payload: ConfirmarNoRequiereB4 = {
      action: 'confirmar', confirmacion: true, idempotencyKey: key(), version: noRequire.movement.b4.version,
      borrador: { movimientoId: noRequire.movement.id, importeMovimientoCentimos: noRequire.movement.importeCentimos, estado: 'NO_REQUIERE', motivoNoRequiere: noRequire.reason, lineas: [] },
    };
    setNoRequire({ ...noRequire, payload });
  };
  const confirmNoRequire = async () => {
    if (!noRequire?.payload) return;
    try {
      const response = await fetch(B4_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(noRequire.payload) });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(json, 'B4 no pudo confirmar No requiere.'));
      setNoRequire(null);
      setNotice({ kind: 'success', text: json?.idempotente ? 'La confirmación B4 ya estaba registrada.' : 'No requiere confirmado en B4 y auditado.' });
      await load(true);
    } catch (error) {
      setNoRequire({ ...noRequire, retry: true });
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo confirmar en B4; puede reintentar la misma confirmación.' });
    }
  };

  if (!canRead) return <section className="mx-auto max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-slate-900"><h1 className="text-xl font-bold">Pendientes B5</h1><p className="mt-2 text-sm text-amber-950">No dispone del permiso de lectura de Conciliación B4. No se han solicitado datos financieros.</p></section>;

  return <section className="mx-auto w-full max-w-[1600px] min-w-0 overflow-x-hidden space-y-5 text-slate-900" data-testid="b5-workspace">
    <header className="flex flex-col gap-4 border-b border-orange-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-700"><ShieldCheckIcon className="h-4 w-4" aria-hidden="true" /> B5 · bandeja operativa</p><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Pendientes de conciliación</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">El banco y B4 determinan pago, cobro, vínculo y No requiere. Esta bandeja sólo gestiona responsable, estado humano y nota.</p></div>
      <button type="button" data-testid="b5-refresh" onClick={() => { void load(true); void loadConfig(); }} disabled={loading || refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar</button>
    </header>

    {!canWrite && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Modo consulta.</strong> Su permiso B4 permite leer, no editar la gestión ni confirmar acciones.</div>}
    <ManualCoverageOverlay consumer="B5" />
    <RectificativasHumanasPanel />
    {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : notice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{notice.text}</div>}
    {configError && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Metadatos aún no disponibles.</strong> {configError} La asignación de responsable permanece deshabilitada; no se infiere por nombre ni tarjeta.</div>}

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div role="tablist" aria-label="Vistas de pendientes" className="grid min-w-0 max-w-full grid-cols-1 gap-2 pb-1 sm:flex sm:flex-wrap">{TABS.map((tab) => <button key={tab.id} role="tab" id={`b5-tab-${tab.id}`} aria-controls={`b5-panel-${tab.id}`} aria-selected={vista === tab.id} data-testid={`b5-tab-${tab.id}`} onClick={() => changeVista(tab.id)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 ${vista === tab.id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-orange-50'}`}>{tab.label}</button>)}</div><p className="mt-3 text-xs text-slate-600">{TABS.find((tab) => tab.id === vista)?.description}</p></div>

    <Filters mes={mes} cuentaId={cuentaId} cobertura={cobertura} accounts={accounts} accountDisabled={accountDisabled} dates={dates} onSearch={changeQuery} onMesChange={changeMes} onCuentaChange={changeCuenta} onCoberturaChange={changeCobertura} />

    {cobertura === 'TODAS' && <div role="status" data-testid="b5-coverage-warning" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Histórico visible.</strong> {coverageUnknown > 0 ? `${coverageUnknown} cuenta(s) sin fecha de corte B3 verificable.` : 'La respuesta no informa cuentas sin corte B3 verificable.'} Esto no afirma cobertura del mes ni convierte pendientes en cero.</div>}
    {cobertura === 'CUBIERTA' && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">Filtro conservador: sólo operaciones hasta el corte B3 verificable de cada cuenta. No se completa una fecha de corte ausente.</div>}
    {isBankView(vista) && ticketCount > 0 && <div role="status" data-testid="b5-card-ticket-alert" className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950"><strong>En esta página: {ticketCount} tickets pendientes de tarjeta.</strong> Aviso interno: no envía correo ni notificación. Sólo se basa en metadata de tarjeta devuelta por la API.</div>}

    <Counters counters={counters} loading={loading} />
    {isBankView(vista) && <CardFilterBar selected={card} onChange={changeCard} options={cardOptions} />}

    <div role="tabpanel" id={`b5-panel-${vista}`} aria-labelledby={`b5-tab-${vista}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="font-bold text-slate-950">{TABS.find((tab) => tab.id === vista)?.label}</h2><p className="text-xs text-slate-500">{itemsData ? `${itemsData.total} resultado(s) según consulta del servidor.` : 'La tabla se mostrará sólo tras validar la respuesta.'}</p></div><span className="text-xs text-slate-500">{itemsData?.criterioBanco}</span></div>
      {loading ? <LoadingRows /> : !itemsData ? <Empty title="No hay datos validados" text="Corrija el error de lectura y actualice; no se sustituyen por valores cero." /> : isBankView(vista) ? <BankTable groups={groupedMovements} canWrite={canWrite} onEdit={setEditing} onNoRequire={openNoRequire} onUpload={setUploadingFor} onAttachments={setViewingAttachments} /> : <InvoiceTable items={invoiceItems} />}
      {itemsData && <Pagination offset={itemsData.offset} total={itemsData.total} onPage={setOffset} />}
    </div>
    <p className="px-1 text-xs text-slate-500">Fuente: proyecciones B4/B5. El corte B3 es metadato de extracto y puede estar desactualizado; esta interfaz no afirma que el mes actual esté cubierto.</p>

    {viewingAttachments && <AttachmentsDialog movement={viewingAttachments} onClose={()=>setViewingAttachments(null)}/>}
    {editing && <EditDialog movement={editing} responsables={config?.responsables || []} canWrite={canWrite} onClose={() => setEditing(null)} onSave={updateGestion} />}
    {noRequire && <NoRequireDialog state={noRequire} onClose={() => setNoRequire(null)} onReason={(reason) => setNoRequire({ ...noRequire, reason, payload: null, retry: false })} onReview={reviewNoRequire} onConfirm={() => void confirmNoRequire()} />}
    {uploadingFor && <UploadDialog movement={uploadingFor} onClose={() => setUploadingFor(null)} onSaved={async()=>{setUploadingFor(null);setNotice({kind:'success',text:'Documento recibido. No se ha vinculado el banco; revise y confirme en Conciliación.'});await load(true)}} />}
  </section>;
}

const Filters = memo(function Filters({ mes, cuentaId, cobertura, accounts, accountDisabled, dates, onSearch, onMesChange, onCuentaChange, onCoberturaChange }: { mes: string; cuentaId: string; cobertura: CoberturaB5; accounts: Array<{ id: string; banco: string; alias: string | null }>; accountDisabled: boolean; dates: { desde: string; hasta: string } | null; onSearch: (value: string) => void; onMesChange: (value: string) => void; onCuentaChange: (value: string) => void; onCoberturaChange: (value: CoberturaB5) => void }) {
  const [searchDraft, setSearchDraft] = useState('');
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><form onSubmit={(event) => { event.preventDefault(); onSearch(searchDraft.trim().slice(0, 120)); }} className="grid gap-3 lg:grid-cols-[minmax(190px,1fr)_220px_230px_200px_auto] lg:items-end">
    <label className="block text-sm font-semibold text-slate-800">Buscar<span className="relative mt-1 block"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input data-testid="b5-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value.slice(0, 120))} maxLength={120} placeholder="Concepto, referencia, tercero…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100" /></span></label>
    <label className="block text-sm font-semibold text-slate-800">Mes<input data-testid="b5-month" type="month" value={mes} onChange={(event) => onMesChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100" /></label>
    <label className="block text-sm font-semibold text-slate-800">Cuenta<select data-testid="b5-account" value={cuentaId} onChange={(event) => onCuentaChange(event.target.value)} disabled={accountDisabled} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100"> <option value="">Todas las cuentas</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labelAccount(account)}</option>)}</select>{accountDisabled && <span className="mt-1 block text-xs font-normal text-slate-500">Las facturas no tienen una cuenta bancaria autoritativa; este filtro no aplica.</span>}</label>
    <fieldset><legend className="text-sm font-semibold text-slate-800">Cobertura B3</legend><div className="mt-1 flex rounded-lg border border-slate-300 p-1"><button type="button" aria-pressed={cobertura === 'TODAS'} onClick={() => onCoberturaChange('TODAS')} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${cobertura === 'TODAS' ? 'bg-orange-600 text-white' : 'text-slate-700'}`}>Todas</button><button type="button" aria-pressed={cobertura === 'CUBIERTA'} onClick={() => onCoberturaChange('CUBIERTA')} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${cobertura === 'CUBIERTA' ? 'bg-orange-600 text-white' : 'text-slate-700'}`}>Cubierta</button></div></fieldset>
    <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" /> Buscar</button>
  </form>{dates && <p className="mt-3 text-xs text-slate-500">Rango exacto del mes: {dates.desde} a {dates.hasta}, ambos inclusivos.</p>}</div>;
});

const Counters = memo(function Counters({ counters, loading }: { counters: ContadorB5[] | null; loading: boolean }) {
  if (loading) return <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />)}</div>;
  if (!counters) return null;
  return <section aria-label="Contadores por mes y cuenta" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{counters.length === 0 ? <p className="text-sm text-slate-600">No hay contadores devueltos para este alcance; no se interpreta como completitud cero.</p> : counters.map((counter) => {
    const known = counter.porcentajeJustificadoBps !== null;
    const percent = known ? `${(counter.porcentajeJustificadoBps! / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%` : 'No calculable';
    return <article key={`${counter.mes}-${counter.cuenta.id}`} className="min-h-40 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{counter.mes?.slice(0,7) || 'Mes no disponible'} · {labelAccount(counter.cuenta)}</p><p className="mt-2 text-2xl font-bold text-slate-950">{percent}</p><p className="mt-1 text-xs text-slate-600">Con documento: {formatCentsText(counter.importeJustificadoCentimos)} / evaluable: {formatCentsText(counter.importeEvaluableCentimos)}</p>{counter.parcial ? <p className="mt-2 text-xs font-bold text-amber-800">Parcial: {counter.movimientosImporteNoExacto > 0 ? `${counter.movimientosImporteNoExacto} importe(s) no exacto(s).` : 'El porcentaje no representa una completitud total.'}</p> : <p className="mt-2 text-xs text-emerald-700">Calculado sobre los movimientos disponibles, sin traspasos.</p>}</article>;
  })}</section>;
});
const CardFilterBar = memo(function CardFilterBar({ selected, onChange, options }: { selected: CardFilter; onChange: (value: CardFilter) => void; options: Array<{ last4: string; titular: string }> }) {
  return <section aria-label="Pendientes por titular de tarjeta" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><BanknotesIcon className="h-5 w-5 text-orange-700" aria-hidden="true" /><div className="min-w-0"><h2 className="font-bold text-slate-950">Tarjetas</h2><p className="text-xs text-slate-600">Filtro sólo por <code>tarjeta.terminacion</code> devuelta por la API; no se extrae de concepto o referencia.</p></div><select data-testid="b5-card-filter" value={selected} onChange={(event) => onChange(event.target.value)} className="sm:ml-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100"><option value="TODAS">Todas las tarjetas</option>{options.map((item) => <option key={item.last4} value={item.last4}>*{item.last4} · {item.titular}</option>)}</select></div></section>;
});
const BankTable = memo(function BankTable({ groups, canWrite, onEdit, onNoRequire, onUpload, onAttachments }: { groups: Array<{ tercero: string; rows: MovimientoPendienteB5[] }>; canWrite: boolean; onEdit: (item: MovimientoPendienteB5) => void; onNoRequire: (item: MovimientoPendienteB5) => void; onUpload: (item: MovimientoPendienteB5) => void; onAttachments:(item:MovimientoPendienteB5)=>void }) {
  if (groups.length === 0) return <Empty title="No hay movimientos pendientes" text="No se asume saldo ni pendiente cero: ajuste filtros o revise la lectura." />;
  return <div className="relative min-w-0 max-w-full overflow-x-auto" data-testid="b5-bank-table-scroll"><table style={{display:'table'}} className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Tercero / fecha</th><th className="px-4 py-3">Cuenta / concepto</th><th className="px-4 py-3">Referencia / pista B6</th><th className="px-4 py-3 text-right">Importe firmado</th><th className="px-4 py-3">Responsable / estado</th><th className="px-4 py-3">Nota</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{groups.map((group) => <GroupRows key={group.tercero} group={group} canWrite={canWrite} onEdit={onEdit} onNoRequire={onNoRequire} onUpload={onUpload} onAttachments={onAttachments} />)}</tbody></table></div>;
});
function GroupRows({ group, canWrite, onEdit, onNoRequire, onUpload, onAttachments }: { group: { tercero: string; rows: MovimientoPendienteB5[] }; canWrite: boolean; onEdit: (item: MovimientoPendienteB5) => void; onNoRequire: (item: MovimientoPendienteB5) => void; onUpload: (item: MovimientoPendienteB5) => void; onAttachments:(item:MovimientoPendienteB5)=>void }) {
  return <>{group.rows.map((item, index) => <tr key={item.id} data-testid="b5-bank-row" className="border-t border-slate-100 align-top hover:bg-orange-50/40"><td className="px-4 py-3">{index === 0 && <p className="font-bold text-slate-950">{group.tercero==='SIN_TERCERO_BANCO'?'Sin tercero identificado':group.tercero}</p>}<p className="mt-1 whitespace-nowrap text-xs text-slate-600">{formatDate(item.fechaOperacion)}</p>{item.tarjeta && <p className="mt-1 text-xs font-semibold text-orange-800">*{item.tarjeta.terminacion} · {item.tarjeta.titular}</p>}</td><td className="px-4 py-3"><p className="font-semibold text-slate-950">{labelAccount(item.cuenta)}</p><p className="mt-1 max-w-xs whitespace-normal text-xs text-slate-700">{item.concepto || 'Sin concepto'}</p></td><td className="px-4 py-3"><p className="max-w-xs break-words text-xs text-slate-700">{item.referencia || 'Sin referencia'}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{item.pistaB6.mensaje}</p>{item.pistaB6.referenciaFactura && <p className="mt-1 font-mono text-xs font-bold text-orange-800">{item.pistaB6.referenciaFactura}</p>}</td><td className="px-4 py-3 text-right font-mono font-bold text-slate-950">{formatMoney(item.importeCentimos)}</td><td className="px-4 py-3"><p className="text-xs text-slate-700">{item.gestion.responsable?.nombre || 'Sin asignar'}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusClass(item.gestion.estadoEfectivo)}`}>{({PENDIENTE:'Pendiente',PEDIDO:'Pedido',RECIBIDO:'Recibido',VINCULADO:'Vinculado',NO_REQUIERE:'No requiere'} as Record<string,string>)[item.gestion.estadoEfectivo]}</span></td><td className="px-4 py-3"><p className="max-w-[180px] whitespace-normal text-xs text-slate-600">{item.gestion.nota || 'Sin nota'}</p></td><td className="px-4 py-3"><div className="flex min-w-[165px] flex-wrap justify-end gap-2"><a data-testid="b5-reconcile-link" href={`/admin/finanzas/conciliacion-v2?movimientoId=${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" /> Conciliar</a><button type="button" onClick={() => onEdit(item)} disabled={!canWrite || item.gestion.estadoEfectivo === 'VINCULADO' || item.gestion.estadoEfectivo === 'NO_REQUIERE'} className="rounded-md border border-orange-300 px-2 py-1.5 text-xs font-bold text-orange-900 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">Editar</button><button type="button" data-testid="b5-attachments" onClick={()=>onAttachments(item)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50">Documentos</button><button type="button" onClick={() => onUpload(item)} disabled={!canWrite} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">Subir documento</button><button type="button" onClick={() => onNoRequire(item)} disabled={!canWrite || item.importeCentimos === null} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">No requiere</button></div></td></tr>)}</>;
}
const InvoiceTable = memo(function InvoiceTable({ items }: { items: FacturaPendienteB5[] }) {
  if (items.length === 0) return <Empty title="No hay facturas pendientes" text="No se sustituye una respuesta incompleta por un importe cero." />;
  return <div className="relative min-w-0 max-w-full overflow-x-auto"><table style={{display:'table'}} className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Factura / tercero</th><th className="px-4 py-3">Fecha / vencimiento</th><th className="px-4 py-3 text-right">Objetivo firmado</th><th className="px-4 py-3 text-right">Asignado B4</th><th className="px-4 py-3 text-right">Pendiente en banco (bruto)</th><th className="px-4 py-3 text-right">Neto tras rectificativa</th></tr></thead><tbody>{items.map((item) => {
    const days = ageInCivilDays(item.fecha);
    const b7 = item.estadoCobroBanco !== undefined;
    const genericReconciliationUrl = item.referencia ? `/admin/finanzas/conciliacion-v2?q=${encodeURIComponent(item.referencia)}` : null;
    return <tr key={item.id} data-testid="b5-invoice-row" className="border-t border-slate-100 align-top"><td className="px-4 py-3"><p className="font-bold text-slate-950">{item.referencia || 'Sin referencia'}</p><p className="mt-1 text-xs text-slate-700">{b7 ? labelB7Client(item) : (item.cliente || item.tercero)}{item.cif ? ` · ${item.cif}` : ''}</p><p className="mt-1 max-w-sm text-xs text-slate-500">{item.concepto || 'Sin concepto'}</p>{b7 && <div className="mt-2 space-y-1 text-xs"><p className="font-semibold text-slate-800">{item.estadoCobroBancoEtiqueta}</p>{item.fuentesCobroBanco?.map((source) => <p key={source} className="text-emerald-800">{labelB7Source(source)}</p>)}{item.motivosRevisionBanco?.map((reason) => <p key={reason} className="text-amber-900">{labelB7ReviewReason(reason)}</p>)}{item.documentoConciliableId === null && <p className="text-slate-500">Sin envoltorio conciliable inferido.</p>}{genericReconciliationUrl && <a href={genericReconciliationUrl} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" /> Buscar referencia en conciliación</a>}</div>}</td><td className="px-4 py-3"><p>{formatDate(item.fecha)}</p><p className="mt-1 text-xs text-slate-600">Vencimiento: {item.fechaVencimiento ? formatDate(item.fechaVencimiento) : 'No informado'}</p><p className="mt-1 text-xs font-semibold text-orange-800">Antigüedad: {days === null ? 'No calculable' : `${days} días civiles`}</p></td><td className="px-4 py-3 text-right font-mono">{formatMoney(item.importeObjetivoCentimos)}</td><td className="px-4 py-3 text-right font-mono">{formatMoney(item.importeAsignadoActivoCentimos)}</td><td className="px-4 py-3 text-right font-mono font-bold text-slate-950">{formatMoney(item.importePendienteCentimos)}</td><td className="px-4 py-3 text-right font-mono">{item.creditNoteState === undefined ? 'Sin proyección documental' : item.creditNoteState === 'REVISION' ? 'Revisión documental' : formatMoney(item.importePendienteTrasRectificativasCentimos ?? null)}{item.creditNoteState !== undefined && <p className="mt-1 text-xs text-slate-500">Rectificación: {formatMoney(item.rectificationCents ?? null)}</p>}</td></tr>;
  })}</tbody></table></div>;
});
function Pagination({ offset, total, onPage }: { offset: number; total: number; onPage: (next: number) => void }) { if (total <= PAGE_SIZE) return null; const from = offset + 1; const to = Math.min(offset + PAGE_SIZE, total); return <nav aria-label="Paginación de pendientes" className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-slate-600">Mostrando {from}–{to} de {total}</p><div className="flex gap-2"><button type="button" onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" /> Anterior</button><button type="button" onClick={() => onPage(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-50">Siguiente <ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></div></nav>; }
function LoadingRows() { return <div aria-busy="true" className="animate-pulse divide-y divide-slate-100">{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-4 gap-4 px-5 py-4"><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /></div>)}</div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="px-5 py-12 text-center"><ExclamationTriangleIcon className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" /><h3 className="mt-2 font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-600">{text}</p></div>; }
