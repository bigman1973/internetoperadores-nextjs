'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SalesProfitability from '@/components/finanzas/SalesProfitability';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type EstadoAnalitica = '' | 'pendiente' | 'clasificada' | 'sin_asignar' | 'parcial' | 'imputada' | 'incidencia';
type PeriodoTipo = 'anio' | 'mes' | 'trimestre' | 'acumulado' | 'intervalo';
type Pestana = 'costes' | 'pendientes' | 'rentabilidad';
type PendienteTipo = 'clasificacion' | 'destino';
type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

interface NodoCoste {
  key: string;
  label: string;
  costeBase: number;
  asignado: number;
  sinAsignar: number;
  totalFacturas: number;
  sinClasificar: number;
  incidencias: number;
}

interface FacturaAnalitica {
  id: string;
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string;
  base: number;
  concepto: string | null;
  imputacion: string | null;
  asignado: number;
  sinAsignar: number;
  incidencia: boolean;
  numComentarios: number;
  ultimoComentario: string | null;
}

interface KPIs {
  totalFacturas: number;
  costeBase: number;
  clasificado: number;
  sinClasificar: number;
  asignado: number;
  sinAsignar: number;
  coberturaPorImporte: number;
  incidencias: number;
  negativas: number;
}

interface AnaliticaResponse {
  kpis: KPIs;
  nodos: NodoCoste[];
  facturas: FacturaAnalitica[];
  page: number;
  totalPages: number;
  total: number;
  categorias: string[];
  periodo: { desde: string; hasta: string };
  baseTemporal: 'fecha_factura';
}

interface ConsultaActiva {
  desde: string;
  hasta: string;
  buscar: string;
  estadoAnalitica: EstadoAnalitica;
  categoria: string;
  key: string;
}

interface EstadoCarga<T> {
  status: LoadStatus;
  data?: T;
  error?: string;
}

interface FacturasProveedor {
  pages: Record<number, AnaliticaResponse>;
  loadingPage?: number;
  error?: string;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const euroFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatMoney(euros: number | null | undefined) {
  return euroFormatter.format(Number(euros || 0));
}

function formatDate(value: string) {
  if (!value) return '—';
  const safeDate = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(safeDate.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(safeDate);
}

function coveragePercent(value: number) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Number(value || 0))} %`;
}

function noCategoria(node: Pick<NodoCoste, 'key' | 'label'>) {
  return node.key === '__SIN_CATEGORIA__' || node.label.trim().toLocaleLowerCase('es-ES') === 'sin clasificar';
}

function etiquetaCategoria(node: Pick<NodoCoste, 'key' | 'label'>) {
  return noCategoria(node) ? 'Sin clasificar' : node.label;
}

function valorCategoriaNodo(node: Pick<NodoCoste, 'key' | 'label'>) {
  return noCategoria(node) ? '__SIN_CATEGORIA__' : node.label;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'No se han podido cargar los datos.';
}

function makeQueryKey(desde: string, hasta: string, buscar: string, estadoAnalitica: EstadoAnalitica, categoria: string) {
  return [desde, hasta, buscar.trim(), estadoAnalitica, categoria].join('|');
}

async function cargarAnalitica(
  consulta: ConsultaActiva,
  nivel: 'categorias' | 'proveedores' | 'facturas',
  page: number,
  signal: AbortSignal,
  navegacion: { categoria?: string; proveedorKey?: string } = {},
): Promise<AnaliticaResponse> {
  const params = new URLSearchParams({
    desde: consulta.desde,
    hasta: consulta.hasta,
    nivel,
    page: String(page),
    limit: nivel === 'facturas' ? '25' : '100',
  });

  if (consulta.buscar) params.set('buscar', consulta.buscar);
  if (consulta.estadoAnalitica) params.set('estadoAnalitica', consulta.estadoAnalitica);

  const categoria = navegacion.categoria ?? consulta.categoria;
  if (categoria) params.set('categoria', categoria);
  if (navegacion.proveedorKey) params.set('proveedorKey', navegacion.proveedorKey);

  const response = await fetch(`/api/admin/finanzas/analitica-costes?${params.toString()}`, { signal });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? body.error : `Error ${response.status} al cargar la analítica.`;
    throw new Error(detail);
  }

  return body as AnaliticaResponse;
}

function MetricCard({ label, value, detail, tone = 'slate' }: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: 'slate' | 'blue' | 'amber' | 'red' | 'green';
}) {
  const tones = {
    slate: 'text-slate-900',
    blue: 'text-blue-800',
    amber: 'text-amber-800',
    red: 'text-red-800',
    green: 'text-emerald-800',
  };

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{label}</p>
      <p className={`mt-2 truncate text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {detail && <p className="mt-1 text-xs leading-5 text-slate-700">{detail}</p>}
    </div>
  );
}

function EstadoFactura({ factura }: { factura: FacturaAnalitica }) {
  let label = 'Clasificada';
  let classes = 'border-blue-200 bg-blue-50 text-blue-800';
  let Icon = CheckCircleIcon;

  if (factura.incidencia) {
    label = 'Incidencia';
    classes = 'border-red-200 bg-red-50 text-red-800';
    Icon = ExclamationTriangleIcon;
  } else if (!factura.imputacion) {
    label = 'Sin clasificar';
    classes = 'border-amber-200 bg-amber-50 text-amber-800';
    Icon = ClockIcon;
  } else if (Math.abs(factura.sinAsignar) > 0 && Math.abs(factura.asignado) > 0) {
    label = 'Parcial';
    classes = 'border-amber-200 bg-amber-50 text-amber-800';
    Icon = ClockIcon;
  } else if (Math.abs(factura.sinAsignar) > 0) {
    label = 'Sin asignar';
    classes = 'border-amber-200 bg-amber-50 text-amber-800';
    Icon = ClockIcon;
  } else if (Math.abs(factura.asignado) > 0) {
    label = 'Imputada';
    classes = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    Icon = CheckCircleIcon;
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${classes}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export default function AnaliticaCostesPage() {
  const searchParams = useSearchParams();
  const currentYear = new Date().getFullYear();
  const today = localIsoDate(new Date());
  const initialFrom = `${currentYear}-01-01`;
  const initialTo = `${currentYear}-12-31`;

  const ventaIdUrl = searchParams.get('ventaId');
  const facturaIspIdUrl = searchParams.get('facturaIspId');
  const deepLinkWorkspace = Boolean(ventaIdUrl || facturaIspIdUrl);
  const [pestana, setPestana] = useState<Pestana>(deepLinkWorkspace ? 'rentabilidad' : 'costes');
  const [pendienteTipo, setPendienteTipo] = useState<PendienteTipo>('clasificacion');
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('anio');
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [quarter, setQuarter] = useState('1');
  const [fechaDesde, setFechaDesde] = useState(initialFrom);
  const [fechaHasta, setFechaHasta] = useState(initialTo);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState<EstadoAnalitica>('');
  const [categoria, setCategoria] = useState('');
  const [periodError, setPeriodError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const [consulta, setConsulta] = useState<ConsultaActiva>(() => ({
    desde: initialFrom,
    hasta: initialTo,
    buscar: '',
    estadoAnalitica: '',
    categoria: '',
    key: makeQueryKey(initialFrom, initialTo, '', '', ''),
  }));
  const [root, setRoot] = useState<EstadoCarga<AnaliticaResponse>>({ status: 'loading' });
  const [providerBranches, setProviderBranches] = useState<Record<string, EstadoCarga<AnaliticaResponse>>>({});
  const [invoiceBranches, setInvoiceBranches] = useState<Record<string, FacturasProveedor>>({});
  const [invoicePages, setInvoicePages] = useState<Record<string, number>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const controllers = useRef(new Set<AbortController>());
  const activeKey = useRef(consulta.key);

  useEffect(() => {
    if (deepLinkWorkspace) setPestana('rentabilidad');
  }, [deepLinkWorkspace]);

  const years = useMemo(() => {
    const first = currentYear - 5;
    return Array.from({ length: 8 }, (_, index) => String(first + index));
  }, [currentYear]);

  const categoryOptions = useMemo(() => {
    const values = root.data?.categorias || [];
    const normalized = Array.from(new Set(values));
    if (categoria && !normalized.includes(categoria)) normalized.push(categoria);
    return normalized.sort((a, b) => a.localeCompare(b, 'es'));
  }, [root.data?.categorias, categoria]);

  useEffect(() => {
    activeKey.current = consulta.key;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    setProviderBranches({});
    setInvoiceBranches({});
    setInvoicePages({});
    setExpandedCategories(new Set());
    setExpandedProviders(new Set());
  }, [consulta, reloadToken]);

  useEffect(() => {
    if (pestana === 'rentabilidad') return;
    const controller = new AbortController();
    controllers.current.add(controller);

    setRoot((previous) => ({
      status: previous.data ? 'refreshing' : 'loading',
      data: previous.data,
      error: undefined,
    }));

    cargarAnalitica(consulta, 'categorias', 1, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && activeKey.current === consulta.key) setRoot({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeKey.current !== consulta.key) return;
        setRoot((previous) => ({ status: 'error', data: previous.data, error: messageFromError(error) }));
      })
      .finally(() => controllers.current.delete(controller));

    return () => controller.abort();
  }, [consulta, reloadToken, pestana]);

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
  }, []);

  function resolvePeriod() {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
      return { error: 'Selecciona un año válido.' };
    }

    if (periodoTipo === 'intervalo') {
      if (!fechaDesde || !fechaHasta) return { error: 'Indica fecha de inicio y fecha de fin.' };
      if (fechaDesde > fechaHasta) return { error: 'La fecha de inicio no puede ser posterior a la fecha de fin.' };
      return { desde: fechaDesde, hasta: fechaHasta };
    }

    if (periodoTipo === 'mes') {
      const numericMonth = Number(month);
      if (numericMonth < 1 || numericMonth > 12) return { error: 'Selecciona un mes válido.' };
      return {
        desde: `${numericYear}-${pad(numericMonth)}-01`,
        hasta: `${numericYear}-${pad(numericMonth)}-${pad(daysInMonth(numericYear, numericMonth))}`,
      };
    }

    if (periodoTipo === 'trimestre') {
      const numericQuarter = Number(quarter);
      if (numericQuarter < 1 || numericQuarter > 4) return { error: 'Selecciona un trimestre válido.' };
      const firstMonth = ((numericQuarter - 1) * 3) + 1;
      return {
        desde: `${numericYear}-${pad(firstMonth)}-01`,
        hasta: `${numericYear}-${pad(firstMonth + 2)}-${pad(daysInMonth(numericYear, firstMonth + 2))}`,
      };
    }

    if (periodoTipo === 'acumulado') {
      const until = numericYear === currentYear ? today : `${numericYear}-12-31`;
      return { desde: `${numericYear}-01-01`, hasta: until };
    }

    return { desde: `${numericYear}-01-01`, hasta: `${numericYear}-12-31` };
  }

  function applyFilters(overrides: Partial<{ pestana: Pestana; pendienteTipo: PendienteTipo }> = {}) {
    const period = resolvePeriod();
    if ('error' in period) {
      setPeriodError(period.error || 'Revisa el período seleccionado.');
      return;
    }

    const selectedTab = overrides.pestana ?? pestana;
    const selectedPendingType = overrides.pendienteTipo ?? pendienteTipo;
    const selectedEstado: EstadoAnalitica = selectedTab === 'pendientes'
      ? (selectedPendingType === 'clasificacion' ? 'pendiente' : 'sin_asignar')
      : selectedTab === 'rentabilidad' ? '' : estado;
    const term = buscar.trim();

    setPeriodError('');
    setConsulta({
      desde: period.desde || initialFrom,
      hasta: period.hasta || initialTo,
      buscar: term,
      estadoAnalitica: selectedEstado,
      categoria,
      key: makeQueryKey(period.desde || initialFrom, period.hasta || initialTo, term, selectedEstado, categoria),
    });
  }

  function changeTab(nextTab: Pestana) {
    setPestana(nextTab);
    applyFilters({ pestana: nextTab });
  }

  function changePendienteTipo(nextType: PendienteTipo) {
    setPendienteTipo(nextType);
    applyFilters({ pendienteTipo: nextType });
  }

  function loadProviders(categoryNode: NodoCoste) {
    const categoryKey = categoryNode.key;
    const existing = providerBranches[categoryKey];
    if (existing?.status === 'loading' || existing?.status === 'ready') return;

    const controller = new AbortController();
    controllers.current.add(controller);
    setProviderBranches((previous) => ({
      ...previous,
      [categoryKey]: { status: existing?.data ? 'refreshing' : 'loading', data: existing?.data },
    }));

    cargarAnalitica(consulta, 'proveedores', 1, controller.signal, { categoria: valorCategoriaNodo(categoryNode) })
      .then((data) => {
        if (controller.signal.aborted || activeKey.current !== consulta.key) return;
        setProviderBranches((previous) => ({ ...previous, [categoryKey]: { status: 'ready', data } }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeKey.current !== consulta.key) return;
        setProviderBranches((previous) => ({
          ...previous,
          [categoryKey]: { status: 'error', data: previous[categoryKey]?.data, error: messageFromError(error) },
        }));
      })
      .finally(() => controllers.current.delete(controller));
  }

  function loadInvoices(categoryNode: NodoCoste, providerNode: NodoCoste, requestedPage = 1) {
    const branchKey = `${categoryNode.key}::${providerNode.key}`;
    const existing = invoiceBranches[branchKey];
    if (existing?.pages[requestedPage] || existing?.loadingPage === requestedPage) return;

    const controller = new AbortController();
    controllers.current.add(controller);
    setInvoiceBranches((previous) => ({
      ...previous,
      [branchKey]: { pages: previous[branchKey]?.pages || {}, loadingPage: requestedPage },
    }));

    cargarAnalitica(consulta, 'facturas', requestedPage, controller.signal, {
      categoria: valorCategoriaNodo(categoryNode),
      proveedorKey: providerNode.key,
    })
      .then((data) => {
        if (controller.signal.aborted || activeKey.current !== consulta.key) return;
        setInvoiceBranches((previous) => ({
          ...previous,
          [branchKey]: { pages: { ...(previous[branchKey]?.pages || {}), [requestedPage]: data } },
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeKey.current !== consulta.key) return;
        setInvoiceBranches((previous) => ({
          ...previous,
          [branchKey]: { pages: previous[branchKey]?.pages || {}, error: messageFromError(error) },
        }));
      })
      .finally(() => controllers.current.delete(controller));
  }

  function toggleCategory(categoryNode: NodoCoste) {
    const isExpanded = expandedCategories.has(categoryNode.key);
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (isExpanded) next.delete(categoryNode.key);
      else next.add(categoryNode.key);
      return next;
    });
    if (!isExpanded) loadProviders(categoryNode);
  }

  function toggleProvider(categoryNode: NodoCoste, providerNode: NodoCoste) {
    const providerKey = `${categoryNode.key}::${providerNode.key}`;
    const isExpanded = expandedProviders.has(providerKey);
    setExpandedProviders((previous) => {
      const next = new Set(previous);
      if (isExpanded) next.delete(providerKey);
      else next.add(providerKey);
      return next;
    });
    if (!isExpanded) loadInvoices(categoryNode, providerNode);
  }

  const kpis = root.data?.kpis;
  const rootNodes = root.data?.nodos || [];
  const isRefreshing = root.status === 'refreshing';

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10 text-slate-900">
      <header className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">Finanzas · analítica</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Analítica de costes y rentabilidad</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              {pestana === 'rentabilidad'
                ? 'Ventas sin IVA, costes conocidos vinculados y margen provisional. No es beneficio neto.'
                : 'Coste BASE sin IVA por categoría, proveedor y factura. Esta vista no mezcla pagos ni muestra rentabilidad.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={pestana !== 'rentabilidad' && (root.status === 'loading' || isRefreshing)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${pestana !== 'rentabilidad' && isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </header>

      {pestana !== 'rentabilidad' && <section aria-label="Indicadores del filtro aplicado">
        {kpis ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="Facturas" value={kpis.totalFacturas.toLocaleString('es-ES')} detail="En el filtro aplicado" />
            <MetricCard label="Coste base" value={formatMoney(kpis.costeBase)} detail="Sin IVA" tone="blue" />
            <MetricCard label="Clasificado" value={formatMoney(kpis.clasificado)} detail="Con categoría" tone="blue" />
            <MetricCard label="Sin clasificar" value={formatMoney(kpis.sinClasificar)} detail="Pendiente de clasificación" tone="amber" />
            <MetricCard label="Asignado" value={formatMoney(kpis.asignado)} detail="Con destino analítico" tone="green" />
            <MetricCard label="Sin asignar" value={formatMoney(kpis.sinAsignar)} detail="Pendiente de destino" tone="amber" />
            <MetricCard
              label="Cobertura por importe"
              value={kpis.negativas > 0 ? 'No disponible' : coveragePercent(kpis.coberturaPorImporte)}
              detail={kpis.negativas > 0 ? 'Hay facturas negativas; no se calcula un porcentaje engañoso.' : 'Sobre coste base sin IVA'}
              tone={kpis.negativas > 0 ? 'amber' : 'green'}
            />
            <MetricCard label="Incidencias" value={kpis.incidencias.toLocaleString('es-ES')} detail="Facturas, no importe" tone={kpis.incidencias > 0 ? 'red' : 'slate'} />
            <MetricCard label="Facturas negativas" value={kpis.negativas.toLocaleString('es-ES')} detail="Se mantienen con su signo" tone={kpis.negativas > 0 ? 'amber' : 'slate'} />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700" aria-live="polite">
            Cargando indicadores del filtro aplicado…
          </div>
        )}
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="filtros-heading">
        <div className="border-b border-slate-200 px-4 pt-4 sm:px-5">
          <div role="tablist" aria-label="Tipo de revisión" className="flex gap-1">
            <button
              id="tab-costes"
              type="button"
              role="tab"
              aria-selected={pestana === 'costes'}
              aria-controls="panel-filtros"
              onClick={() => changeTab('costes')}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 ${pestana === 'costes' ? 'border-b-2 border-blue-700 bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              Costes
            </button>
            <button
              id="tab-pendientes"
              type="button"
              role="tab"
              aria-selected={pestana === 'pendientes'}
              aria-controls="panel-filtros"
              onClick={() => changeTab('pendientes')}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 ${pestana === 'pendientes' ? 'border-b-2 border-blue-700 bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              Pendientes
            </button>
            <button
              id="tab-rentabilidad"
              type="button"
              role="tab"
              aria-selected={pestana === 'rentabilidad'}
              aria-controls="panel-filtros"
              onClick={() => changeTab('rentabilidad')}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 ${pestana === 'rentabilidad' ? 'border-b-2 border-blue-700 bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              Rentabilidad
            </button>
          </div>
        </div>

        <div id="panel-filtros" role="tabpanel" aria-labelledby={pestana === 'costes' ? 'tab-costes' : pestana === 'pendientes' ? 'tab-pendientes' : 'tab-rentabilidad'} className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 id="filtros-heading" className="text-base font-bold text-slate-900">Filtros de consulta</h2>
                <p className="mt-1 text-sm text-slate-700">
                  {pestana === 'pendientes'
                    ? 'Revisa por separado lo pendiente de clasificar y lo pendiente de asignar a un destino. Pendiente no implica automáticamente que requiera cliente.'
                    : pestana === 'rentabilidad'
                      ? 'Filtra ventas por período y texto. La actividad se selecciona con los valores devueltos por la consulta de rentabilidad.'
                      : 'Aplica período, texto, estado y categoría antes de explorar el árbol.'}
                </p>
              </div>
              {pestana === 'pendientes' && (
                <div className="flex flex-wrap gap-2" aria-label="Tipo de pendiente">
                  <button
                    type="button"
                    onClick={() => changePendienteTipo('clasificacion')}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 ${pendienteTipo === 'clasificacion' ? 'border-amber-700 bg-amber-100 text-amber-900' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
                  >
                    Sin clasificar
                  </button>
                  <button
                    type="button"
                    onClick={() => changePendienteTipo('destino')}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 ${pendienteTipo === 'destino' ? 'border-amber-700 bg-amber-100 text-amber-900' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
                  >
                    Sin asignar
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor="periodo-tipo" className="mb-1.5 block text-sm font-semibold text-slate-900">Período</label>
                <select id="periodo-tipo" value={periodoTipo} onChange={(event) => setPeriodoTipo(event.target.value as PeriodoTipo)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">
                  <option value="anio">Año completo</option>
                  <option value="mes">Mes</option>
                  <option value="trimestre">Trimestre</option>
                  <option value="acumulado">Acumulado anual</option>
                  <option value="intervalo">Intervalo de fechas</option>
                </select>
              </div>

              {periodoTipo !== 'intervalo' && (
                <div>
                  <label htmlFor="periodo-anio" className="mb-1.5 block text-sm font-semibold text-slate-900">Año</label>
                  <select id="periodo-anio" value={year} onChange={(event) => setYear(event.target.value)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">
                    {years.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}
                  </select>
                </div>
              )}

              {periodoTipo === 'mes' && (
                <div>
                  <label htmlFor="periodo-mes" className="mb-1.5 block text-sm font-semibold text-slate-900">Mes</label>
                  <select id="periodo-mes" value={month} onChange={(event) => setMonth(event.target.value)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">
                    {MONTHS.map((label, index) => <option key={label} value={String(index + 1)}>{label}</option>)}
                  </select>
                </div>
              )}

              {periodoTipo === 'trimestre' && (
                <div>
                  <label htmlFor="periodo-trimestre" className="mb-1.5 block text-sm font-semibold text-slate-900">Trimestre</label>
                  <select id="periodo-trimestre" value={quarter} onChange={(event) => setQuarter(event.target.value)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">
                    {[1, 2, 3, 4].map((value) => <option key={value} value={String(value)}>{value}.º trimestre</option>)}
                  </select>
                </div>
              )}

              {periodoTipo === 'intervalo' && (
                <>
                  <div>
                    <label htmlFor="fecha-desde" className="mb-1.5 block text-sm font-semibold text-slate-900">Desde</label>
                    <input id="fecha-desde" type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={(event) => setFechaDesde(event.target.value)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700" />
                  </div>
                  <div>
                    <label htmlFor="fecha-hasta" className="mb-1.5 block text-sm font-semibold text-slate-900">Hasta (incluido)</label>
                    <input id="fecha-hasta" type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={(event) => setFechaHasta(event.target.value)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700" />
                  </div>
                </>
              )}

              {pestana !== 'rentabilidad' && <div>
                <label htmlFor="filtro-categoria" className="mb-1.5 block text-sm font-semibold text-slate-900">Categoría de factura (clasificación actual)</label>
                <select id="filtro-categoria" value={categoria} onChange={(event) => setCategoria(event.target.value)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">
                  <option value="">Todas las categorías</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option === '__SIN_CATEGORIA__' ? 'Sin clasificar' : option}</option>
                  ))}
                </select>
              </div>}

              {pestana === 'costes' && (
                <div>
                  <label htmlFor="filtro-estado" className="mb-1.5 block text-sm font-semibold text-slate-900">Estado analítico</label>
                  <select id="filtro-estado" value={estado} onChange={(event) => setEstado(event.target.value as EstadoAnalitica)} style={{ colorScheme: 'light' }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700">
                    <option value="">Todos los estados</option>
                    <option value="pendiente">Sin clasificar</option>
                    <option value="clasificada">Clasificada</option>
                    <option value="sin_asignar">Sin asignar</option>
                    <option value="parcial">Parcial</option>
                    <option value="imputada">Imputada</option>
                    <option value="incidencia">Incidencia</option>
                  </select>
                </div>
              )}

              <div className={pestana === 'pendientes' || pestana === 'rentabilidad' ? 'md:col-span-2 xl:col-span-2' : ''}>
                <label htmlFor="buscar-costes" className="mb-1.5 block text-sm font-semibold text-slate-900">Buscar</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-700" aria-hidden="true" />
                  <input
                    id="buscar-costes"
                    value={buscar}
                    onChange={(event) => setBuscar(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }}
                    placeholder={pestana === 'rentabilidad' ? 'Venta, cliente, número o concepto' : 'Proveedor, CIF, concepto, número o comentarios'}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-500 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  {buscar && (
                    <button type="button" onClick={() => setBuscar('')} aria-label="Borrar búsqueda" className="absolute right-2 top-2 rounded p-1 text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700">
                      <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {periodError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{periodError}</p>}

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-700">Las fechas se envían como ISO local (YYYY-MM-DD); la fecha final es inclusiva.</p>
              <button type="button" onClick={() => applyFilters()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2">
                <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      </section>

      {pestana !== 'rentabilidad' && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="arbol-heading">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 id="arbol-heading" className="text-lg font-bold text-slate-900">Desglose de costes</h2>
            <p className="mt-1 text-sm text-slate-700">
              Categorías → proveedores → facturas. Fecha de factura: {root.data ? `${formatDate(root.data.periodo.desde)} — ${formatDate(root.data.periodo.hasta)}` : 'cargando período'}.
            </p>
          </div>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700" aria-live="polite">
            {isRefreshing && <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isRefreshing ? 'Actualizando resultados…' : root.data ? `${rootNodes.length} categorías` : 'Cargando…'}
          </p>
        </div>

        {root.error && (
          <div role="alert" className="m-4 flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between">
            <span><strong>No se pudo actualizar la consulta.</strong> {root.error}</span>
            <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="rounded-md border border-red-400 bg-white px-3 py-1.5 font-semibold text-red-900 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-700">Reintentar</button>
          </div>
        )}

        {!root.data && root.status === 'loading' && (
          <p className="px-5 py-10 text-center text-sm font-medium text-slate-700" aria-live="polite">Cargando categorías…</p>
        )}

        {root.data && rootNodes.length === 0 && (
          <div className="px-5 py-12 text-center">
            <FolderIcon className="mx-auto h-9 w-9 text-slate-500" aria-hidden="true" />
            <h3 className="mt-3 text-base font-bold text-slate-900">No hay costes para este filtro</h3>
            <p className="mt-1 text-sm text-slate-700">Modifica el período o elimina alguno de los filtros y vuelve a aplicar.</p>
          </div>
        )}

        {root.data && rootNodes.length > 0 && (
          <ul className="divide-y divide-slate-200" aria-label="Árbol de costes por categoría">
            {rootNodes.map((categoryNode) => {
              const categoryOpen = expandedCategories.has(categoryNode.key);
              const providerBranch = providerBranches[categoryNode.key];
              const categoryId = `categoria-${categoryNode.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

              return (
                <li key={categoryNode.key} className="bg-white">
                  <button
                    type="button"
                    onClick={() => toggleCategory(categoryNode)}
                    disabled={isRefreshing || root.status === 'error'}
                    aria-expanded={categoryOpen}
                    aria-controls={categoryId}
                    className="group grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-700 sm:grid-cols-[auto_minmax(180px,1fr)_minmax(120px,0.65fr)_minmax(110px,0.5fr)_minmax(110px,0.5fr)] sm:items-center sm:px-5"
                  >
                    {categoryOpen ? <ChevronDownIcon className="mt-0.5 h-5 w-5 text-slate-900 sm:mt-0" aria-hidden="true" /> : <ChevronRightIcon className="mt-0.5 h-5 w-5 text-slate-900 sm:mt-0" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <FolderIcon className="h-4 w-4 shrink-0 text-blue-800" aria-hidden="true" />
                        <span className="truncate">{etiquetaCategoria(categoryNode)}</span>
                        {noCategoria(categoryNode) && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">Pendiente</span>}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-slate-700 sm:hidden">
                        {categoryNode.totalFacturas.toLocaleString('es-ES')} facturas · Base {formatMoney(categoryNode.costeBase)}
                      </span>
                    </span>
                    <span className="hidden text-right text-sm font-bold tabular-nums text-slate-900 sm:block"><span className="block text-xs font-normal text-slate-600">Base sin IVA</span>{formatMoney(categoryNode.costeBase)}</span>
                    <span className="hidden text-right text-sm tabular-nums text-slate-900 sm:block"><span className="block text-xs text-slate-600">Asignado</span>{formatMoney(categoryNode.asignado)}<span className="block text-xs text-amber-800">Pendiente {formatMoney(categoryNode.sinAsignar)}</span></span>
                    <span className="hidden text-right text-sm tabular-nums text-slate-900 sm:block">
                      {categoryNode.incidencias > 0 ? `${categoryNode.incidencias} incidencia${categoryNode.incidencias === 1 ? '' : 's'}` : `${categoryNode.totalFacturas} facturas`}
                    </span>
                  </button>

                  {categoryOpen && (
                    <div id={categoryId} className="border-t border-slate-200 bg-slate-50 px-3 py-3 sm:px-5">
                      {providerBranch?.status === 'loading' && !providerBranch.data && (
                        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700" aria-live="polite">Cargando proveedores…</p>
                      )}

                      {providerBranch?.error && (
                        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between">
                          <span><strong>No se pudieron cargar los proveedores.</strong> {providerBranch.error}</span>
                          <button type="button" onClick={() => {
                            setProviderBranches((previous) => { const next = { ...previous }; delete next[categoryNode.key]; return next; });
                            loadProviders(categoryNode);
                          }} className="rounded border border-red-400 bg-white px-3 py-1.5 font-semibold text-red-900 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-700">Reintentar</button>
                        </div>
                      )}

                      {providerBranch?.data?.nodos.length === 0 && (
                        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">No hay proveedores para esta categoría y filtros.</p>
                      )}

                      {providerBranch?.data?.nodos && providerBranch.data.nodos.length > 0 && (
                        <ul className="space-y-2" aria-label={`Proveedores de ${etiquetaCategoria(categoryNode)}`}>
                          {providerBranch.data.nodos.map((providerNode) => {
                            const providerBranchKey = `${categoryNode.key}::${providerNode.key}`;
                            const providerOpen = expandedProviders.has(providerBranchKey);
                            const invoices = invoiceBranches[providerBranchKey];
                            const selectedPage = invoicePages[providerBranchKey] || 1;
                            const invoiceData = invoices?.pages[selectedPage];
                            const providerId = `proveedor-${providerBranchKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                            return (
                              <li key={providerNode.key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() => toggleProvider(categoryNode, providerNode)}
                                  aria-expanded={providerOpen}
                                  aria-controls={providerId}
                                  className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-700 sm:grid-cols-[auto_minmax(180px,1fr)_minmax(120px,0.65fr)_minmax(110px,0.5fr)_minmax(110px,0.5fr)] sm:items-center"
                                >
                                  {providerOpen ? <ChevronDownIcon className="mt-0.5 h-5 w-5 text-slate-900 sm:mt-0" aria-hidden="true" /> : <ChevronRightIcon className="mt-0.5 h-5 w-5 text-slate-900 sm:mt-0" aria-hidden="true" />}
                                  <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                      <BuildingOffice2Icon className="h-4 w-4 shrink-0 text-slate-700" aria-hidden="true" />
                                      <span className="truncate">{providerNode.label}</span>
                                    </span>
                                    <span className="mt-1 block text-xs text-slate-700 sm:hidden">{providerNode.totalFacturas.toLocaleString('es-ES')} facturas · Base {formatMoney(providerNode.costeBase)}</span>
                                  </span>
                                  <span className="hidden text-right text-sm font-semibold tabular-nums text-slate-900 sm:block"><span className="block text-xs font-normal text-slate-600">Base sin IVA</span>{formatMoney(providerNode.costeBase)}</span>
                                  <span className="hidden text-right text-sm tabular-nums text-slate-900 sm:block"><span className="block text-xs text-slate-600">Asignado</span>{formatMoney(providerNode.asignado)}<span className="block text-xs text-amber-800">Pendiente {formatMoney(providerNode.sinAsignar)}</span></span>
                                  <span className="hidden text-right text-sm tabular-nums text-slate-900 sm:block">{providerNode.totalFacturas.toLocaleString('es-ES')} fact.</span>
                                </button>

                                {providerOpen && (
                                  <div id={providerId} className="border-t border-slate-200 bg-white">
                                    {invoices?.loadingPage === selectedPage && !invoiceData && (
                                      <p className="px-4 py-4 text-sm font-medium text-slate-700" aria-live="polite">Cargando facturas…</p>
                                    )}
                                    {invoices?.error && !invoiceData && (
                                      <div role="alert" className="m-3 flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between">
                                        <span><strong>No se pudieron cargar las facturas.</strong> {invoices.error}</span>
                                        <button type="button" onClick={() => loadInvoices(categoryNode, providerNode, selectedPage)} className="rounded border border-red-400 bg-white px-3 py-1.5 font-semibold text-red-900 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-700">Reintentar</button>
                                      </div>
                                    )}
                                    {invoiceData && (
                                      <>
                                        {invoiceData.facturas.length === 0 ? (
                                          <p className="px-4 py-4 text-sm text-slate-700">No hay facturas para este proveedor y filtros.</p>
                                        ) : (
                                          <div className="overflow-x-auto">
                                            <table className="min-w-[860px] w-full divide-y divide-slate-200 text-left">
                                              <caption className="sr-only">Facturas de {providerNode.label}</caption>
                                              <thead className="bg-slate-100">
                                                <tr className="text-xs font-bold uppercase tracking-wide text-slate-800">
                                                  <th scope="col" className="px-4 py-3">Fecha</th>
                                                  <th scope="col" className="px-4 py-3">Factura y concepto</th>
                                                  <th scope="col" className="px-4 py-3">Categoría</th>
                                                  <th scope="col" className="px-4 py-3 text-right">Base sin IVA</th>
                                                  <th scope="col" className="px-4 py-3 text-right">Asignado</th>
                                                  <th scope="col" className="px-4 py-3">Estado</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-200 bg-white">
                                                {invoiceData.facturas.map((factura) => (
                                                  <tr key={factura.id} className={factura.base < 0 ? 'bg-amber-50/70' : ''}>
                                                    <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-slate-900">{formatDate(factura.fecha)}</td>
                                                    <td className="max-w-sm px-4 py-3 align-top">
                                                      <Link href={`/admin/finanzas/facturas/${factura.id}`} className="font-bold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-700">
                                                        {factura.numFactura || 'Factura sin número'}
                                                      </Link>
                                                      <p className="mt-1 text-xs font-semibold text-slate-800">{factura.proveedor}{factura.cif ? ` · ${factura.cif}` : ''}</p>
                                                      {factura.concepto && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-700">{factura.concepto}</p>}
                                                      {factura.numComentarios > 0 && (
                                                        <Link href={`/admin/finanzas/facturas/${factura.id}#comentarios`} className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700">
                                                          <ChatBubbleLeftEllipsisIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                                          {factura.numComentarios} comentario{factura.numComentarios === 1 ? '' : 's'}
                                                        </Link>
                                                      )}
                                                      {factura.ultimoComentario && <p className="mt-1 line-clamp-2 text-xs italic leading-5 text-slate-700">“{factura.ultimoComentario}”</p>}
                                                    </td>
                                                    <td className="px-4 py-3 align-top text-sm text-slate-900">{factura.imputacion || <span className="font-semibold text-amber-900">Sin clasificar</span>}</td>
                                                    <td className={`whitespace-nowrap px-4 py-3 align-top text-right text-sm font-bold tabular-nums ${factura.base < 0 ? 'text-amber-900' : 'text-slate-900'}`}>
                                                      {formatMoney(factura.base)}
                                                      {factura.base < 0 && <span className="mt-1 block text-[11px] font-semibold text-amber-900">Abono / negativo</span>}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 align-top text-right text-sm tabular-nums text-slate-900">
                                                      {formatMoney(factura.asignado)}
                                                      {Math.abs(factura.sinAsignar) > 0 && <span className="mt-1 block text-[11px] font-semibold text-amber-900">Restante {formatMoney(factura.sinAsignar)}</span>}
                                                    </td>
                                                    <td className="px-4 py-3 align-top"><EstadoFactura factura={factura} /></td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                        {invoiceData.totalPages > 1 && (
                                          <nav aria-label={`Paginación de facturas de ${providerNode.label}`} className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-xs text-slate-700">Mostrando {((invoiceData.page - 1) * 25) + 1}–{Math.min(invoiceData.page * 25, invoiceData.total)} de {invoiceData.total} facturas</p>
                                            <div className="flex items-center gap-2">
                                              <button type="button" disabled={invoiceData.page <= 1 || invoices?.loadingPage === invoiceData.page - 1} onClick={() => {
                                                const previousPage = invoiceData.page - 1;
                                                setInvoicePages((previous) => ({ ...previous, [providerBranchKey]: previousPage }));
                                                loadInvoices(categoryNode, providerNode, previousPage);
                                              }} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Anterior</button>
                                              <span className="text-xs font-semibold text-slate-900">Página {invoiceData.page} de {invoiceData.totalPages}</span>
                                              <button type="button" disabled={invoiceData.page >= invoiceData.totalPages || invoices?.loadingPage === invoiceData.page + 1} onClick={() => {
                                                const nextPage = invoiceData.page + 1;
                                                setInvoicePages((previous) => ({ ...previous, [providerBranchKey]: nextPage }));
                                                loadInvoices(categoryNode, providerNode, nextPage);
                                              }} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button>
                                            </div>
                                          </nav>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>}

      {pestana !== 'rentabilidad' && <aside className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-900" aria-label="Nota de alcance">
        <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden="true" />
        <p><strong>Alcance actual:</strong> las categorías se muestran en un único nivel porque el catálogo todavía no dispone de subcategorías. Esta pantalla es de consulta: no modifica categorías ni imputaciones.</p>
      </aside>}

      {pestana === 'rentabilidad' && <SalesProfitability
        desde={consulta.desde}
        hasta={consulta.hasta}
        buscar={consulta.buscar}
        reloadToken={reloadToken}
        ventaId={ventaIdUrl}
        facturaIspId={facturaIspIdUrl}
      />}
    </main>
  );
}
