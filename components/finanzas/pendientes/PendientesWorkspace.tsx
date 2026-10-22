'use client';

import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent } from 'react';
import {
  ArrowPathIcon, ArrowTopRightOnSquareIcon, BanknotesIcon, CheckCircleIcon,
  ChevronLeftIcon, ChevronRightIcon, DocumentArrowUpIcon, ExclamationTriangleIcon,
  MagnifyingGlassIcon, PencilSquareIcon, ShieldCheckIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { usePermisoArea } from '@/hooks/usePermisoArea';
import {
  VISTAS_B5, esMotivoNoRequiere, leerConfiguracionB5, leerContadoresB5, leerItemsB5,
  type CoberturaB5, type ConfiguracionB5, type ContadorB5, type ConfirmarNoRequiereB4,
  type DocumentoFuturoB5, type EstadoManualB5, type FacturaPendienteB5, type GestionPatchB5,
  type ItemsResponseB5, type MovimientoPendienteB5, type MotivoNoRequiereB4, type VistaB5,
} from './types';

const AREA_B4 = 'admin.finanzas.conciliacion';
const API = '/api/admin/finanzas/pendientes';
const B4_API = '/api/admin/finanzas/conciliacion-v2';
const FUTURE_DOCUMENT_API = '/api/admin/finanzas/pendientes/documento';
const PAGE_SIZE = 50;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const NO_REQUIRE_REASONS: Array<{ value: MotivoNoRequiereB4; label: string }> = [
  { value: 'COMISION_BANCARIA', label: 'Comisión bancaria' },
  { value: 'INTERES_BANCARIO', label: 'Interés bancario' },
  { value: 'REDONDEO_BANCARIO', label: 'Redondeo bancario' },
  { value: 'TRASPASO_INTERNO_SIN_DOCUMENTO', label: 'Traspaso interno sin documento' },
  { value: 'MOVIMIENTO_TECNICO_BANCO', label: 'Movimiento técnico del banco' },
  { value: 'CORRECCION_BANCARIA', label: 'Corrección bancaria' },
];
const TABS: Array<{ id: VistaB5; label: string; description: string }> = [
  { id: 'CARGOS_SIN_DOCUMENTO', label: 'Cargos sin documento', description: 'Cargos bancarios pendientes de soporte.' },
  { id: 'COBROS_SIN_DOCUMENTO', label: 'Cobros sin documento', description: 'Abonos bancarios pendientes de soporte.' },
  { id: 'FACTURAS_RECIBIDAS_SIN_PAGO', label: 'Facturas recibidas sin pago', description: 'Pendiente de pagar según líneas B4 activas.' },
  { id: 'FACTURAS_EMITIDAS_SIN_COBRO', label: 'Facturas emitidas sin cobro', description: 'Pendiente de cobrar según líneas B4 activas.' },
];
type Notice = { kind: 'error' | 'success' | 'info'; text: string } | null;
type CardFilter = 'TODAS' | string;
type NoRequireDialog = { movement: MovimientoPendienteB5; reason: MotivoNoRequiereB4 | ''; payload: ConfirmarNoRequiereB4 | null; retry: boolean } | null;

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
function formatMoney(cents: number | null): string {
  if (cents === null || !Number.isSafeInteger(cents)) return 'Importe desconocido';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'always' }).format(cents / 100);
}
function formatDate(value: string | null): string { return value ? new Intl.DateTimeFormat('es-ES').format(new Date(`${value}T00:00:00`)) : 'Fecha no disponible'; }
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
function labelReason(reason: MotivoNoRequiereB4 | ''): string { return NO_REQUIRE_REASONS.find((item) => item.value === reason)?.label || ''; }
function statusClass(state: string): string {
  if (state === 'VINCULADO') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (state === 'NO_REQUIERE') return 'bg-orange-50 text-orange-900 ring-orange-200';
  if (state === 'RECIBIDO') return 'bg-blue-50 text-blue-800 ring-blue-200';
  if (state === 'PEDIDO') return 'bg-amber-50 text-amber-900 ring-amber-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}
function isAllowedUpload(file: File): boolean {
  return ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) && file.size <= MAX_UPLOAD_BYTES;
}

export default function PendientesWorkspace() {
  const { canRead, canWrite } = usePermisoArea(AREA_B4);
  const [vista, setVista] = useState<VistaB5>('CARGOS_SIN_DOCUMENTO');
  const [mes, setMes] = useState(monthNow);
  const [cuentaId, setCuentaId] = useState('');
  const [cobertura, setCobertura] = useState<CoberturaB5>('TODAS');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [card, setCard] = useState<CardFilter>('TODAS');
  const [offset, setOffset] = useState(0);
  const [itemsData, setItemsData] = useState<ItemsResponseB5 | null>(null);
  const [counters, setCounters] = useState<ContadorB5[] | null>(null);
  const [config, setConfig] = useState<ConfiguracionB5 | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<MovimientoPendienteB5 | null>(null);
  const [noRequire, setNoRequire] = useState<NoRequireDialog>(null);
  const [uploadingFor, setUploadingFor] = useState<MovimientoPendienteB5 | null>(null);
  const [viewingAttachments,setViewingAttachments]=useState<MovimientoPendienteB5|null>(null);

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
  const load = useCallback(async (silent = false) => {
    if (!canRead || !dates) return;
    if (silent) setRefreshing(true); else { setLoading(true); setItemsData(null); setCounters(null); }
    try {
      const [itemsResponse, countersResponse] = await Promise.all([
        fetch(`${API}?${buildParams('items').toString()}`, { cache: 'no-store' }),
        fetch(`${API}?${buildParams('contadores').toString()}`, { cache: 'no-store' }),
      ]);
      const [itemsJson, countersJson] = await Promise.all([itemsResponse.json().catch(() => null), countersResponse.json().catch(() => null)]);
      if (!itemsResponse.ok) throw new Error(message(itemsJson, 'No se pudo leer la bandeja de pendientes.'));
      if (!countersResponse.ok) throw new Error(message(countersJson, 'No se pudieron leer los contadores B5.'));
      // Both response parsers reject malformed data; an error never becomes an empty/zero financial state.
      setItemsData(leerItemsB5(itemsJson));
      setCounters(leerContadoresB5(countersJson).contadores);
      if (!silent) setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo leer Pendientes B5.' });
    } finally { setLoading(false); setRefreshing(false); }
  }, [buildParams, canRead, dates]);

  useEffect(() => { if (canRead) void loadConfig(); }, [canRead, loadConfig]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOffset(0); setCard('TODAS'); }, [vista, mes, cuentaId, cobertura, query]);

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
  const openNoRequire = (movement: MovimientoPendienteB5) => {
    if (movement.importeCentimos === null) { setNotice({ kind: 'error', text: 'El importe bancario es desconocido: B4 no puede confirmar No requiere.' }); return; }
    setNoRequire({ movement, reason: '', payload: null, retry: false });
  };
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

  return <section className="mx-auto max-w-[1600px] min-w-0 space-y-5 text-slate-900" data-testid="b5-workspace">
    <header className="flex flex-col gap-4 border-b border-orange-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-700"><ShieldCheckIcon className="h-4 w-4" aria-hidden="true" /> B5 · bandeja operativa</p><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Pendientes de conciliación</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">El banco y B4 determinan pago, cobro, vínculo y No requiere. Esta bandeja sólo gestiona responsable, estado humano y nota.</p></div>
      <button type="button" data-testid="b5-refresh" onClick={() => { void load(true); void loadConfig(); }} disabled={loading || refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar</button>
    </header>

    {!canWrite && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Modo consulta.</strong> Su permiso B4 permite leer, no editar la gestión ni confirmar acciones.</div>}
    {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : notice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{notice.text}</div>}
    {configError && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Metadatos aún no disponibles.</strong> {configError} La asignación de responsable permanece deshabilitada; no se infiere por nombre ni tarjeta.</div>}

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div role="tablist" aria-label="Vistas de pendientes" className="flex max-w-full gap-2 overflow-x-auto pb-1">{TABS.map((tab) => <button key={tab.id} role="tab" id={`b5-tab-${tab.id}`} aria-controls={`b5-panel-${tab.id}`} aria-selected={vista === tab.id} data-testid={`b5-tab-${tab.id}`} onClick={() => setVista(tab.id)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 ${vista === tab.id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-orange-50'}`}>{tab.label}</button>)}</div><p className="mt-3 text-xs text-slate-600">{TABS.find((tab) => tab.id === vista)?.description}</p></div>

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><form onSubmit={(event) => { event.preventDefault(); setQuery(searchDraft.trim().slice(0, 120)); }} className="grid gap-3 lg:grid-cols-[minmax(190px,1fr)_220px_230px_200px_auto] lg:items-end">
      <label className="block text-sm font-semibold text-slate-800">Buscar<span className="relative mt-1 block"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input data-testid="b5-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value.slice(0, 120))} maxLength={120} placeholder="Concepto, referencia, tercero…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100" /></span></label>
      <label className="block text-sm font-semibold text-slate-800">Mes<input data-testid="b5-month" type="month" value={mes} onChange={(event) => setMes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100" /></label>
      <label className="block text-sm font-semibold text-slate-800">Cuenta<select data-testid="b5-account" value={cuentaId} onChange={(event) => setCuentaId(event.target.value)} disabled={accountDisabled} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100"> <option value="">Todas las cuentas</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labelAccount(account)}</option>)}</select>{accountDisabled && <span className="mt-1 block text-xs font-normal text-slate-500">Las facturas no tienen una cuenta bancaria autoritativa; este filtro no aplica.</span>}</label>
      <fieldset><legend className="text-sm font-semibold text-slate-800">Cobertura B3</legend><div className="mt-1 flex rounded-lg border border-slate-300 p-1"><button type="button" aria-pressed={cobertura === 'TODAS'} onClick={() => setCobertura('TODAS')} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${cobertura === 'TODAS' ? 'bg-orange-600 text-white' : 'text-slate-700'}`}>Todas</button><button type="button" aria-pressed={cobertura === 'CUBIERTA'} onClick={() => setCobertura('CUBIERTA')} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${cobertura === 'CUBIERTA' ? 'bg-orange-600 text-white' : 'text-slate-700'}`}>Cubierta</button></div></fieldset>
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" /> Buscar</button>
    </form>{dates && <p className="mt-3 text-xs text-slate-500">Rango exacto del mes: {dates.desde} a {dates.hasta}, ambos inclusivos.</p>}</div>

    {cobertura === 'TODAS' && <div role="status" data-testid="b5-coverage-warning" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Histórico visible.</strong> {coverageUnknown > 0 ? `${coverageUnknown} cuenta(s) sin fecha de corte B3 verificable.` : 'La respuesta no informa cuentas sin corte B3 verificable.'} Esto no afirma cobertura del mes ni convierte pendientes en cero.</div>}
    {cobertura === 'CUBIERTA' && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">Filtro conservador: sólo operaciones hasta el corte B3 verificable de cada cuenta. No se completa una fecha de corte ausente.</div>}
    {isBankView(vista) && ticketCount > 0 && <div role="status" data-testid="b5-card-ticket-alert" className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950"><strong>En esta página: {ticketCount} tickets pendientes de tarjeta.</strong> Aviso interno: no envía correo ni notificación. Sólo se basa en metadata de tarjeta devuelta por la API.</div>}

    <Counters counters={counters} loading={loading} />
    {isBankView(vista) && <CardFilterBar selected={card} onChange={(value)=>{setOffset(0);setCard(value)}} options={cardOptions} />}

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

function Counters({ counters, loading }: { counters: ContadorB5[] | null; loading: boolean }) {
  if (loading) return <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />)}</div>;
  if (!counters) return null;
  return <section aria-label="Contadores por mes y cuenta" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{counters.length === 0 ? <p className="text-sm text-slate-600">No hay contadores devueltos para este alcance; no se interpreta como completitud cero.</p> : counters.map((counter) => {
    const known = counter.porcentajeJustificadoBps !== null;
    const percent = known ? `${(counter.porcentajeJustificadoBps! / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%` : 'No calculable';
    return <article key={`${counter.mes}-${counter.cuenta.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{counter.mes?.slice(0,7) || 'Mes no disponible'} · {labelAccount(counter.cuenta)}</p><p className="mt-2 text-2xl font-bold text-slate-950">{percent}</p><p className="mt-1 text-xs text-slate-600">Con documento: {formatMoney(Number(counter.importeJustificadoCentimos))} / evaluable: {formatMoney(Number(counter.importeEvaluableCentimos))}</p>{counter.parcial ? <p className="mt-2 text-xs font-bold text-amber-800">Parcial: {counter.movimientosImporteNoExacto > 0 ? `${counter.movimientosImporteNoExacto} importe(s) no exacto(s).` : 'El porcentaje no representa una completitud total.'}</p> : <p className="mt-2 text-xs text-emerald-700">Calculado sobre los movimientos disponibles, sin traspasos.</p>}</article>;
  })}</section>;
}
function CardFilterBar({ selected, onChange, options }: { selected: CardFilter; onChange: (value: CardFilter) => void; options: Array<{ last4: string; titular: string }> }) {
  return <section aria-label="Pendientes por titular de tarjeta" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><BanknotesIcon className="h-5 w-5 text-orange-700" aria-hidden="true" /><div className="min-w-0"><h2 className="font-bold text-slate-950">Tarjetas</h2><p className="text-xs text-slate-600">Filtro sólo por <code>tarjeta.terminacion</code> devuelta por la API; no se extrae de concepto o referencia.</p></div><select data-testid="b5-card-filter" value={selected} onChange={(event) => onChange(event.target.value)} className="sm:ml-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100"><option value="TODAS">Todas las tarjetas</option>{options.map((item) => <option key={item.last4} value={item.last4}>*{item.last4} · {item.titular}</option>)}</select></div></section>;
}
function BankTable({ groups, canWrite, onEdit, onNoRequire, onUpload, onAttachments }: { groups: Array<{ tercero: string; rows: MovimientoPendienteB5[] }>; canWrite: boolean; onEdit: (item: MovimientoPendienteB5) => void; onNoRequire: (item: MovimientoPendienteB5) => void; onUpload: (item: MovimientoPendienteB5) => void; onAttachments:(item:MovimientoPendienteB5)=>void }) {
  if (groups.length === 0) return <Empty title="No hay movimientos pendientes" text="No se asume saldo ni pendiente cero: ajuste filtros o revise la lectura." />;
  return <div className="max-w-full overflow-x-auto" data-testid="b5-bank-table-scroll"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Tercero / fecha</th><th className="px-4 py-3">Cuenta / concepto</th><th className="px-4 py-3">Referencia / pista B6</th><th className="px-4 py-3 text-right">Importe firmado</th><th className="px-4 py-3">Responsable / estado</th><th className="px-4 py-3">Nota</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{groups.map((group) => <GroupRows key={group.tercero} group={group} canWrite={canWrite} onEdit={onEdit} onNoRequire={onNoRequire} onUpload={onUpload} onAttachments={onAttachments} />)}</tbody></table></div>;
}
function GroupRows({ group, canWrite, onEdit, onNoRequire, onUpload, onAttachments }: { group: { tercero: string; rows: MovimientoPendienteB5[] }; canWrite: boolean; onEdit: (item: MovimientoPendienteB5) => void; onNoRequire: (item: MovimientoPendienteB5) => void; onUpload: (item: MovimientoPendienteB5) => void; onAttachments:(item:MovimientoPendienteB5)=>void }) {
  return <>{group.rows.map((item, index) => <tr key={item.id} data-testid="b5-bank-row" className="border-t border-slate-100 align-top hover:bg-orange-50/40"><td className="px-4 py-3">{index === 0 && <p className="font-bold text-slate-950">{group.tercero==='SIN_TERCERO_BANCO'?'Sin tercero identificado':group.tercero}</p>}<p className="mt-1 whitespace-nowrap text-xs text-slate-600">{formatDate(item.fechaOperacion)}</p>{item.tarjeta && <p className="mt-1 text-xs font-semibold text-orange-800">*{item.tarjeta.terminacion} · {item.tarjeta.titular}</p>}</td><td className="px-4 py-3"><p className="font-semibold text-slate-950">{labelAccount(item.cuenta)}</p><p className="mt-1 max-w-xs whitespace-normal text-xs text-slate-700">{item.concepto || 'Sin concepto'}</p></td><td className="px-4 py-3"><p className="max-w-xs break-words text-xs text-slate-700">{item.referencia || 'Sin referencia'}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{item.pistaB6.mensaje}</p>{item.pistaB6.referenciaFactura && <p className="mt-1 font-mono text-xs font-bold text-orange-800">{item.pistaB6.referenciaFactura}</p>}</td><td className="px-4 py-3 text-right font-mono font-bold text-slate-950">{formatMoney(item.importeCentimos)}</td><td className="px-4 py-3"><p className="text-xs text-slate-700">{item.gestion.responsable?.nombre || 'Sin asignar'}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusClass(item.gestion.estadoEfectivo)}`}>{({PENDIENTE:'Pendiente',PEDIDO:'Pedido',RECIBIDO:'Recibido',VINCULADO:'Vinculado',NO_REQUIERE:'No requiere'} as Record<string,string>)[item.gestion.estadoEfectivo]}</span></td><td className="px-4 py-3"><p className="max-w-[180px] whitespace-normal text-xs text-slate-600">{item.gestion.nota || 'Sin nota'}</p></td><td className="px-4 py-3"><div className="flex min-w-[165px] flex-wrap justify-end gap-2"><a data-testid="b5-reconcile-link" href={`/admin/finanzas/conciliacion-v2?movimientoId=${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" /> Conciliar</a><button type="button" onClick={() => onEdit(item)} disabled={!canWrite || item.gestion.estadoEfectivo === 'VINCULADO' || item.gestion.estadoEfectivo === 'NO_REQUIERE'} className="rounded-md border border-orange-300 px-2 py-1.5 text-xs font-bold text-orange-900 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">Editar</button><button type="button" data-testid="b5-attachments" onClick={()=>onAttachments(item)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50">Documentos</button><button type="button" onClick={() => onUpload(item)} disabled={!canWrite} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">Subir documento</button><button type="button" onClick={() => onNoRequire(item)} disabled={!canWrite || item.importeCentimos === null} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">No requiere</button></div></td></tr>)}</>;
}
function InvoiceTable({ items }: { items: FacturaPendienteB5[] }) {
  if (items.length === 0) return <Empty title="No hay facturas pendientes" text="No se sustituye una respuesta incompleta por un importe cero." />;
  return <div className="max-w-full overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Factura / tercero</th><th className="px-4 py-3">Fecha / vencimiento</th><th className="px-4 py-3 text-right">Objetivo firmado</th><th className="px-4 py-3 text-right">Asignado B4</th><th className="px-4 py-3 text-right">Pendiente en banco</th></tr></thead><tbody>{items.map((item) => { const days = ageInCivilDays(item.fecha); return <tr key={item.id} data-testid="b5-invoice-row" className="border-t border-slate-100 align-top"><td className="px-4 py-3"><p className="font-bold text-slate-950">{item.referencia || 'Sin referencia'}</p><p className="mt-1 text-xs text-slate-700">{item.cliente || item.tercero}{item.cif ? ` · ${item.cif}` : ''}</p><p className="mt-1 max-w-sm text-xs text-slate-500">{item.concepto || 'Sin concepto'}</p></td><td className="px-4 py-3"><p>{formatDate(item.fecha)}</p><p className="mt-1 text-xs text-slate-600">Vencimiento: {item.fechaVencimiento ? formatDate(item.fechaVencimiento) : 'No informado'}</p><p className="mt-1 text-xs font-semibold text-orange-800">Antigüedad: {days === null ? 'No calculable' : `${days} días civiles`}</p></td><td className="px-4 py-3 text-right font-mono">{formatMoney(item.importeObjetivoCentimos)}</td><td className="px-4 py-3 text-right font-mono">{formatMoney(item.importeAsignadoActivoCentimos)}</td><td className="px-4 py-3 text-right font-mono font-bold text-slate-950">{formatMoney(item.importePendienteCentimos)}</td></tr>; })}</tbody></table></div>;
}
function EditDialog({ movement, responsables, canWrite, onClose, onSave }: { movement: MovimientoPendienteB5; responsables: ConfiguracionB5['responsables']; canWrite: boolean; onClose: () => void; onSave: (payload: GestionPatchB5) => Promise<void> }) {
  const [responsable, setResponsable] = useState(String(movement.gestion.responsable?.id || ''));
  const [estado, setEstado] = useState<EstadoManualB5>(movement.gestion.estadoManual);
  const [nota, setNota] = useState(movement.gestion.nota || '');
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave({ movimientoId: movement.id, version: movement.gestion.version, responsableAdminId: responsable ? Number(responsable) : null, estado, nota: nota.trim() || null }); };
  return <Modal title="Editar gestión humana" onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{movement.concepto || 'Sin concepto'} · <strong>{formatMoney(movement.importeCentimos)}</strong>. Esta edición no vincula documentos ni cambia B4.</p><label className="block text-sm font-semibold">Responsable<select data-testid="b5-responsible" value={responsable} onChange={(event) => setResponsable(event.target.value)} disabled={!canWrite || responsables.length === 0} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Sin asignar</option>{responsables.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>{responsables.length === 0 && <span className="mt-1 block text-xs font-normal text-amber-800">El selector requiere la metadata activa del recurso configuracion.</span>}</label><label className="block text-sm font-semibold">Estado<select data-testid="b5-manual-state" value={estado} onChange={(event) => setEstado(event.target.value as EstadoManualB5)} disabled={!canWrite} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="PENDIENTE">Pendiente</option><option value="PEDIDO">Pedido</option><option value="RECIBIDO">Recibido</option></select></label><label className="block text-sm font-semibold">Nota<textarea data-testid="b5-note" value={nota} maxLength={2000} onChange={(event) => setNota(event.target.value)} rows={4} disabled={!canWrite} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancelar</button><button data-testid="b5-save-management" type="submit" disabled={!canWrite} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Guardar y releer</button></div></form></Modal>;
}
function NoRequireDialog({ state, onClose, onReason, onReview, onConfirm }: { state: Exclude<NoRequireDialog, null>; onClose: () => void; onReason: (reason: MotivoNoRequiereB4 | '') => void; onReview: () => void; onConfirm: () => void }) {
  const final = Boolean(state.payload);
  return <Modal title={final ? 'Confirmar No requiere en B4' : 'Marcar No requiere'} onClose={onClose}><div className="space-y-4"><div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950"><strong>Valor bancario real:</strong> {formatMoney(state.movement.importeCentimos)}. Un importe de 0,00 € técnico puede confirmarse, pero un importe desconocido no.</div>{final ? <><p className="text-sm text-slate-700">Revise la acción definitiva. B4 creará una operación auditable con líneas vacías; esta pantalla no hace PATCH ni altera estados de cobro/pago.</p><p className="text-sm"><strong>Motivo cerrado:</strong> {labelReason(state.payload!.borrador.motivoNoRequiere)}</p>{state.retry && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Se reintentará exactamente el mismo payload y la misma clave de idempotencia.</p>}<Actions cancel={onClose} confirm={onConfirm} label={state.retry ? 'Reintentar confirmación' : 'Confirmar definitivamente'} testId="b5-confirm-no-require" /></> : <><label className="block text-sm font-semibold">Motivo cerrado<select data-testid="b5-no-require-reason" value={state.reason} onChange={(event) => onReason(event.target.value as MotivoNoRequiereB4 | '')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Seleccione un motivo</option>{NO_REQUIRE_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label><p className="text-xs text-slate-600">No existe “Otro” ni texto libre; no se envían líneas documentales.</p><Actions cancel={onClose} confirm={onReview} disabled={!state.reason} label="Revisar acción" testId="b5-review-no-require" /></>}</div></Modal>;
}
function AttachmentsDialog({movement,onClose}:{movement:MovimientoPendienteB5;onClose:()=>void}){
  const [rows,setRows]=useState<Array<{id:string;tipoDocumento:string;estado:string;nombreTercero:string|null;concepto:string|null;fechaDocumento:string|null;importeDocumentoCentimos:number|null;storageName:string;authenticatedWebUrl:string|null}>|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController()
    void fetch(`${API}?recurso=adjuntos&movimientoId=${encodeURIComponent(movement.id)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const json=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(message(json,'No se pudieron leer los adjuntos.'))
      if(!Array.isArray(json?.adjuntos)||json.adjuntos.some((row:any)=>typeof row?.id!=='string'||typeof row.storageName!=='string'||!['TICKET','SOPORTE'].includes(row.tipoDocumento)||!['RESERVADO','UPLOAD_COMPLETO'].includes(row.estado)))throw new Error('Lectura documental incompleta; no se interpreta como ausencia de archivos.')
      if(!controller.signal.aborted)setRows(json.adjuntos)
    }).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'No se pudo leer.')})
    return()=>controller.abort()
  },[movement.id])
  const safeUrl=(value:string|null)=>{try{const url=new URL(value||'');return url.protocol==='https:'&&url.hostname.endsWith('.sharepoint.com')&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:null}catch{return null}}
  return <Modal title="Archivos del movimiento" onClose={onClose}><div className="space-y-3">
    <p className="text-sm text-slate-700">{movement.concepto}. Guardar un soporte no implica factura canónica ni pago conciliado.</p>
    {error?<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{error}</p>:rows===null?<p role="status" className="text-sm text-slate-600">Leyendo adjuntos…</p>:rows.length===0?<p className="text-sm text-slate-600">No constan adjuntos guardados en esta bandeja para el movimiento.</p>:<ul className="space-y-3">{rows.map(row=>{const url=safeUrl(row.authenticatedWebUrl);return <li key={row.id} className="rounded-lg border border-slate-200 p-3"><p className="font-semibold text-slate-950">{row.concepto||'Documento guardado'}</p><p className="mt-1 text-xs text-slate-700">{row.tipoDocumento==='TICKET'?'Ticket validado':'Soporte'} · {row.nombreTercero||'Tercero no informado'} · {row.fechaDocumento?formatDate(row.fechaDocumento):'Fecha desconocida'} · {formatMoney(row.importeDocumentoCentimos)}</p>{row.estado==='RESERVADO'?<p className="mt-2 text-xs font-semibold text-amber-900">Subida no completada. Se conserva la reserva para revisión; no se sobrescriben archivos.</p>:url?<a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-md border border-orange-300 px-3 py-2 text-sm font-bold text-orange-900">Abrir en SharePoint</a>:<p className="mt-2 text-xs text-amber-900">Enlace no verificable; requiere revisión.</p>}</li>})}</ul>}
    <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cerrar</button>
  </div></Modal>
}

function UploadDialog({ movement, onClose, onSaved }: { movement: MovimientoPendienteB5; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file,setFile]=useState<File|null>(null)
  const [tipo,setTipo]=useState<'SOPORTE'|'TICKET'>('SOPORTE')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const requestRef=useRef<{fingerprint:string;key:string}|null>(null)
  const submit=async (event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    if(busy)return
    const form=new FormData(event.currentTarget)
    if(!file||!isAllowedUpload(file)){setError('Seleccione PDF, JPEG o PNG, no vacío y de hasta 3 MiB.');return}
    if(form.get('confirmacionDocumento')!=='on'){setError('Revise y confirme los datos antes de subir.');return}
    const fields={movimientoId:movement.id,versionGestion:String(movement.gestion.version),tipoDocumento:tipo,fechaDocumento:String(form.get('fechaDocumento')||''),importeDocumento:String(form.get('importeDocumento')||'').trim().replace(',','.'),nombreProveedor:String(form.get('nombreProveedor')||'').trim(),concepto:String(form.get('concepto')||'').trim(),confirmacionDocumento:'true'}
    if(!fields.nombreProveedor||!fields.concepto){setError('Informe tercero y descripción del documento.');return}
    if(tipo==='TICKET'&&(!fields.fechaDocumento||!fields.importeDocumento)){setError('Un ticket requiere fecha e importe positivo expresamente revisados.');return}
    setBusy(true);setError('')
    try{
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join('')
      const fingerprint=JSON.stringify({...fields,digest,mime:file.type})
      if(!requestRef.current||requestRef.current.fingerprint!==fingerprint)requestRef.current={fingerprint,key:crypto.randomUUID()}
      const payload=new FormData()
      Object.entries(fields).forEach(([name,value])=>payload.set(name,value))
      payload.set('idempotencyKey',requestRef.current.key)
      payload.set('archivo',file)
      const response=await fetch(FUTURE_DOCUMENT_API,{method:'POST',body:payload})
      const json=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(message(json,'No se pudo guardar el documento. El mismo contenido conserva su clave para un reintento explícito.'))
      if(json?.ok!==true||!['SOPORTE','TICKET'].includes(json.tipoDocumento)||typeof json.idAdjunto!=='string')throw new Error('Respuesta documental incompleta; actualice antes de volver a subir.')
      await onSaved()
    }catch(error){setError(error instanceof Error?error.message:'No se pudo guardar el documento.')}
    finally{setBusy(false)}
  }
  return <Modal title="Subir documento" onClose={()=>{if(!busy)onClose()}}><form onSubmit={event=>void submit(event)} className="space-y-4">
    <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Sólo guarda el archivo en la carpeta de staging, fuera del circuito de gestoría. No vincula el banco ni ejecuta OCR. La fecha y el importe nunca se copian del movimiento.</p>
    <label className="block text-sm font-semibold">Tipo de documento<select data-testid="b5-document-type" value={tipo} onChange={event=>setTipo(event.target.value as 'SOPORTE'|'TICKET')} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="SOPORTE">Factura u otro soporte — no crea compra ni venta</option>{movement.importeCentimos!==null&&movement.importeCentimos<0&&<option value="TICKET">Nuevo ticket de gasto validado</option>}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Fecha del documento<input data-testid="b5-document-date" type="date" name="fechaDocumento" required={tipo==='TICKET'} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label><label className="block text-sm font-semibold">Importe del documento (€)<input data-testid="b5-document-amount" name="importeDocumento" inputMode="decimal" placeholder="123,45 — sin separador de miles" required={tipo==='TICKET'} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label></div>
    {tipo==='SOPORTE'&&<p className="text-xs text-slate-600">Si no conoce la fecha o el importe, déjelos vacíos: se conservan como desconocidos, no como cero.</p>}
    <label className="block text-sm font-semibold">Tercero del documento<input data-testid="b5-document-party" name="nombreProveedor" required maxLength={300} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
    <label className="block text-sm font-semibold">Descripción<input data-testid="b5-document-concept" name="concepto" required maxLength={1000} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
    <label className="block text-sm font-semibold">Archivo<input data-testid="b5-document-file" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} onChange={event=>setFile(event.target.files?.[0]||null)} className="mt-1 block w-full text-sm"/></label>
    <label className="flex gap-2 text-sm"><input data-testid="b5-document-confirm" type="checkbox" name="confirmacionDocumento" required disabled={busy}/><span>He revisado el archivo y sus datos. {tipo==='TICKET'?'Confirmo este gasto como ticket validado.':'Lo guardo sólo como soporte; no se convierte en factura ni gasto.'} No se concilia automáticamente.</span></label>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{error}</p>}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Cancelar</button><button data-testid="b5-upload-document" type="submit" disabled={busy} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'Guardando…':'Guardar documento revisado'}</button></div>
  </form></Modal>
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="b5-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><h2 id="b5-dialog-title" className="font-bold text-slate-950">{title}</h2><button type="button" aria-label="Cerrar diálogo" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button></header><div className="p-5">{children}</div></section></div>; }
function Actions({ cancel, confirm, disabled, label, testId }: { cancel: () => void; confirm?: () => void; disabled?: boolean; label: string; testId: string }) { return <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={cancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800">Cancelar</button><button data-testid={testId} type={confirm ? 'button' : 'submit'} onClick={confirm} disabled={disabled} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{label}</button></div>; }
function Pagination({ offset, total, onPage }: { offset: number; total: number; onPage: (next: number) => void }) { if (total <= PAGE_SIZE) return null; const from = offset + 1; const to = Math.min(offset + PAGE_SIZE, total); return <nav aria-label="Paginación de pendientes" className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-slate-600">Mostrando {from}–{to} de {total}</p><div className="flex gap-2"><button type="button" onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" /> Anterior</button><button type="button" onClick={() => onPage(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-50">Siguiente <ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></div></nav>; }
function LoadingRows() { return <div aria-busy="true" className="animate-pulse divide-y divide-slate-100">{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-4 gap-4 px-5 py-4"><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /></div>)}</div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="px-5 py-12 text-center"><ExclamationTriangleIcon className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" /><h3 className="mt-2 font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-600">{text}</p></div>; }
