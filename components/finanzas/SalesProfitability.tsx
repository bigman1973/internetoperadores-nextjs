"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import VentaServicios from "@/components/finanzas/VentaServicios";
import InvoiceCostWorkspace, { CostEditor } from "@/components/finanzas/InvoiceCostWorkspace";
import VentaProveedores from "@/components/finanzas/VentaProveedores";
import type {
  ProfitCandidates,
  ProfitClient,
  ProfitDetail,
  ProfitInvoice,
  ProfitMetrics,
  ProfitPurchaseLink,
  ProfitResponse,
  ProfitService,
  ProfitStaffLink,
  PurchaseCandidate,
  StaffCandidate,
} from "@/lib/finanzas/profitability-types";

type LoadState<T> = {
  status: "idle" | "loading" | "refreshing" | "ready" | "error";
  data?: T;
  error?: string;
};
type EditorTab = "compras" | "personal";

type SalesProfitabilityProps = {
  desde: string;
  hasta: string;
  buscar: string;
  actividad?: string;
  reloadToken: number;
  ventaId?: string | null;
  facturaIspId?: string | number | null;
};

type SaleSelectionResponse = {
  facturas: Array<Pick<ProfitInvoice, "id" | "numFactura" | "cliente" | "fecha" | "concepto" | "ventas"> & { proveedores: string[] }>;
  total: number;
  page: number;
  totalPages: number;
  canWrite: boolean;
};

const euros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("es-ES");

function money(value: number | null | undefined) {
  return euros.format(Number(value ?? 0));
}

function date(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function percent(value: number | null, quality?: string) {
  if (value === null || quality === "sin_costes") return "Pendiente";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)} %`;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se han podido cargar los datos.";
}

async function getProfit<T>(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `/api/admin/finanzas/rentabilidad?${params.toString()}`,
    { signal, cache: "no-store" },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Error ${response.status} al cargar la rentabilidad.`,
    );
  return body as T;
}

function baseParams({
  nivel,
  desde,
  hasta,
  buscar,
  actividad,
  page = 1,
  servicioKey,
  clienteKey,
  facturaId,
}: {
  nivel:
    "servicios" | "clientes" | "facturas" | "detalle" | "compras" | "personal" | "seleccionar";
  desde: string;
  hasta: string;
  buscar?: string;
  actividad?: string;
  page?: number;
  servicioKey?: string;
  clienteKey?: string;
  facturaId?: string;
}) {
  const params = new URLSearchParams({
    nivel,
    desde,
    hasta,
    page: String(page),
    limit: "25",
  });
  if (buscar?.trim()) params.set("buscar", buscar.trim());
  if (actividad) params.set("actividad", actividad);
  if (servicioKey) params.set("servicioKey", servicioKey);
  if (clienteKey) params.set("clienteKey", clienteKey);
  if (facturaId) params.set("facturaId", facturaId);
  return params;
}

function Metric({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: "slate" | "blue" | "green" | "amber" | "red";
}) {
  const tones = {
    slate: "text-slate-950",
    blue: "text-blue-900",
    green: "text-emerald-900",
    amber: "text-amber-900",
    red: "text-red-900",
  };
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
        {label}
      </p>
      <p
        className={`mt-2 truncate text-xl font-bold tabular-nums ${tones[tone]}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-700">{detail}</p>
    </div>
  );
}

function Quality({
  quality,
  incidences = 0,
}: {
  quality: ProfitInvoice["calidad"];
  incidences?: number;
}) {
  const content =
    quality === "incidencia" || incidences > 0
      ? ["Incidencia", "border-red-300 bg-red-50 text-red-900"]
      : quality === "sin_costes"
        ? ["Sin costes directos", "border-amber-300 bg-amber-50 text-amber-900"]
        : ["Provisional", "border-blue-200 bg-blue-50 text-blue-900"];
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${content[1]}`}
    >
      {content[0]}
    </span>
  );
}

function Pager({
  page,
  total,
  totalPages,
  onPage,
  loading,
  label,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  loading: boolean;
  label: string;
}) {
  if (totalPages <= 1) return null;
  const first = total === 0 ? 0 : (page - 1) * 25 + 1;
  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-slate-700">
        Mostrando {first}–{Math.min(page * 25, total)} de{" "}
        {integer.format(total)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="text-xs font-bold text-slate-900">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages || loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

function AssignedPurchases({
  items,
  onEdit,
  onRemove,
}: {
  items: ProfitPurchaseLink[];
  onEdit?: (item: ProfitPurchaseLink) => void;
  onRemove?: (item: ProfitPurchaseLink) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left">
        <caption className="sr-only">Compras asignadas a la venta</caption>
        <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-800">
          <tr>
            <th className="px-3 py-2.5">Factura y proveedor</th>
            <th className="px-3 py-2.5">Fecha</th>
            <th className="px-3 py-2.5 text-right">Base sin IVA</th>
            <th className="px-3 py-2.5 text-right">Asignado</th>
            <th className="px-3 py-2.5 text-right">Coste imputado</th>
            {onEdit && <th className="px-3 py-2.5">Acción</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {items.map((item) => (
            <tr key={item.id} className={item.incidencia ? "bg-red-50" : ""}>
              <td className="px-3 py-3 text-sm text-slate-900">
                <p className="font-bold">
                  {item.numFactura || "Compra sin número"}
                </p>
                <p className="mt-0.5 text-xs text-slate-700">
                  {item.proveedor}
                </p>
                <a href={`/admin/finanzas/facturas/${encodeURIComponent(item.fuenteId)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-700">Abrir factura de compra</a>
                {item.notas && (
                  <p className="mt-1 max-w-md text-xs text-slate-700">
                    {item.notas}
                  </p>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-900">
                {date(item.fecha)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                {money(item.base)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                {item.porcentaje.toLocaleString("es-ES", {
                  maximumFractionDigits: 2,
                })}{" "}
                %
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">
                {money(item.coste)}
                {item.incidencia && (
                  <span className="mt-1 block text-[11px] font-bold text-red-900">
                    Incidencia
                  </span>
                )}
              </td>
              {onEdit && (
                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="rounded border border-slate-300 bg-white p-1.5 text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                      aria-label={`Editar compra ${item.numFactura || item.proveedor}`}
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove?.(item)}
                      className="rounded border border-red-300 bg-white p-1.5 text-red-900 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700"
                      aria-label={`Desvincular compra ${item.numFactura || item.proveedor}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignedStaff({
  items,
  onEdit,
  onRemove,
}: {
  items: ProfitStaffLink[];
  onEdit?: (item: ProfitStaffLink) => void;
  onRemove?: (item: ProfitStaffLink) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] text-left">
        <caption className="sr-only">Personal asignado a la venta</caption>
        <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-800">
          <tr>
            <th className="px-3 py-2.5">Persona</th>
            <th className="px-3 py-2.5">Fecha</th>
            <th className="px-3 py-2.5 text-right">Horas</th>
            <th className="px-3 py-2.5 text-right">Asignado</th>
            <th className="px-3 py-2.5 text-right">Coste imputado</th>
            {onEdit && <th className="px-3 py-2.5">Acción</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {items.map((item) => (
            <tr key={item.id} className={item.incidencia ? "bg-red-50" : ""}>
              <td className="px-3 py-3 text-sm text-slate-900">
                <p className="font-bold">{item.empleado}</p>
                {item.notas && (
                  <p className="mt-1 max-w-md text-xs text-slate-700">
                    {item.notas}
                  </p>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-900">
                {date(item.fecha)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                {item.horas.toLocaleString("es-ES", {
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                {item.porcentaje.toLocaleString("es-ES", {
                  maximumFractionDigits: 2,
                })}{" "}
                %
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">
                {item.coste === null ? "Pendiente" : money(item.coste)}
                {item.incidencia && (
                  <span className="mt-1 block text-[11px] font-bold text-red-900">
                    Incidencia
                  </span>
                )}
              </td>
              {onEdit && (
                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="rounded border border-slate-300 bg-white p-1.5 text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                      aria-label={`Editar personal ${item.empleado}`}
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove?.(item)}
                      className="rounded border border-red-300 bg-white p-1.5 text-red-900 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700"
                      aria-label={`Desvincular personal ${item.empleado}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


const serviceGuidance: Record<
  string,
  { title: string; description: string; tone: string }
> = {
  PROYECTO: {
    title: "Proyectos",
    description: "Material y horas por proyecto.",
    tone: "border-violet-200 bg-violet-50",
  },
  TELECO_INTERMEDIACION: {
    title: "Telecom · intermediación",
    description: "Servicios comercializados mediante intermediación.",
    tone: "border-sky-200 bg-sky-50",
  },
  TELECO_RED_PROPIA: {
    title: "Telecom · red propia",
    description: "Radio / WiMax y otros servicios de red propia.",
    tone: "border-emerald-200 bg-emerald-50",
  },
  __SIN_DESGLOSE__: {
    title: "Sin desglose",
    description: "Costes pendientes de reparto o venta sin clasificar.",
    tone: "border-amber-200 bg-amber-50",
  },
};

function serviceScopeKey(serviceKey: string, clientKey: string) {
  return `${encodeURIComponent(serviceKey)}::${encodeURIComponent(clientKey)}`;
}

function invoiceScopeKey(
  serviceKey: string,
  clientKey: string,
  invoiceId: string,
) {
  return `${serviceScopeKey(serviceKey, clientKey)}::${encodeURIComponent(invoiceId)}`;
}

export default function SalesProfitability({
  desde,
  hasta,
  buscar,
  actividad,
  reloadToken,
  ventaId,
  facturaIspId,
}: SalesProfitabilityProps) {
  const [activityDraft, setActivityDraft] = useState(actividad || "");
  const [activityApplied, setActivityApplied] = useState(actividad || "");
  const [retry, setRetry] = useState(0);
  const [root, setRoot] = useState<LoadState<ProfitResponse>>({
    status: "loading",
  });
  const [expandedServices, setExpandedServices] = useState<Set<string>>(
    new Set(),
  );
  const [serviceData, setServiceData] = useState<
    Record<string, LoadState<ProfitResponse>>
  >({});
  const [servicePages, setServicePages] = useState<Record<string, number>>({});
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set(),
  );
  const [clientData, setClientData] = useState<
    Record<string, LoadState<ProfitResponse>>
  >({});
  const [clientPages, setClientPages] = useState<Record<string, number>>({});
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(
    new Set(),
  );
  const [details, setDetails] = useState<
    Record<string, LoadState<ProfitDetail>>
  >({});
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(ventaId || null);
  const [saleSearchDraft, setSaleSearchDraft] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [salePage, setSalePage] = useState(1);
  const [saleRetry, setSaleRetry] = useState(0);
  const [workspaceDismissed, setWorkspaceDismissed] = useState(false);
  const [saleAllDates, setSaleAllDates] = useState(false);
  const [preferredSupplier, setPreferredSupplier] = useState<{ facturaId: string; key: string } | null>(null);
  const [supplierSaleId, setSupplierSaleId] = useState<string | null>(null);
  const [saleSelector, setSaleSelector] = useState<LoadState<SaleSelectionResponse>>({ status: "loading" });
  const saleAborter = useRef<AbortController | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const generation = useRef(0);
  const priorFilterKey = useRef("");

  const filterKey = useMemo(
    () => [desde, hasta, buscar.trim(), activityApplied].join("|"),
    [desde, hasta, buscar, activityApplied],
  );
  const isRefreshing = root.status === "refreshing";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaleSearch(saleSearchDraft);
      setSupplierSaleId(null);
      setSalePage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [saleSearchDraft]);

  useEffect(() => {
    if (ventaId) setSelectedSaleId(ventaId);
  }, [ventaId]);

  useEffect(() => {
    setWorkspaceDismissed(false);
  }, [ventaId, facturaIspId]);

  useEffect(() => { setSalePage(1); setSupplierSaleId(null); }, [desde, hasta, saleAllDates]);

  useEffect(() => {
    saleAborter.current?.abort();
    const controller = new AbortController();
    saleAborter.current = controller;
    setSaleSelector({ status: "loading" });
    const selectorParams = baseParams({ nivel: "seleccionar", desde, hasta, buscar: saleSearch, page: salePage });
    if (saleAllDates) selectorParams.set("todasFechas", "1");
    getProfit<SaleSelectionResponse>(
      selectorParams,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setSaleSelector({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSaleSelector((previous) => ({ status: "error", data: previous.data, error: errorMessage(error) }));
      });
    return () => controller.abort();
  }, [desde, hasta, saleSearch, salePage, reloadToken, saleRetry, saleAllDates]);

  const addController = useCallback(() => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller;
  }, []);
  const removeController = useCallback(
    (controller: AbortController) => controllers.current.delete(controller),
    [],
  );

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
    },
    [],
  );

  useEffect(() => {
    const queryChanged = priorFilterKey.current !== filterKey;
    priorFilterKey.current = filterKey;
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    // Cambiar de período/búsqueda reinicia el árbol; guardar conserva el contexto abierto.
    if (queryChanged) {
      setExpandedServices(new Set());
      setServiceData({});
      setServicePages({});
      setExpandedClients(new Set());
      setClientData({});
      setClientPages({});
      setExpandedInvoices(new Set());
      setDetails({});
      setEditingInvoice(null);
    }
    setRoot((previous) =>
      queryChanged || !previous.data
        ? { status: "loading" }
        : { status: "refreshing", data: previous.data },
    );
    const controller = addController();
    getProfit<ProfitResponse>(
      baseParams({
        nivel: "servicios",
        desde,
        hasta,
        buscar,
        actividad: activityApplied,
      }),
      controller.signal,
    )
      .then((data) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        ) {
          setRoot({ status: "ready", data });
          if (!queryChanged) {
            for (const service of data.servicios) {
              if (expandedServices.has(service.key)) loadServiceClients(service, servicePages[service.key] || 1, true);
              for (const client of serviceData[service.key]?.data?.clientes || []) {
                const scope = serviceScopeKey(service.key, client.key);
                if (expandedClients.has(scope)) loadClientInvoices(service, client, clientPages[scope] || 1, true);
              }
            }
            for (const scope of expandedInvoices) {
              const parts = scope.split("::");
              if (parts.length === 3) loadDetail(decodeURIComponent(parts[2]), scope, true);
            }
          }
        }
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setRoot((previous) => ({
            status: "error",
            data: previous.data,
            error: errorMessage(error),
          }));
      })
      .finally(() => removeController(controller));
    return () => controller.abort();
  }, [
    filterKey,
    retry,
    reloadToken,
    desde,
    hasta,
    buscar,
    activityApplied,
    addController,
    removeController,
  ]);

  useEffect(() => {
    setActivityDraft(actividad || "");
    setActivityApplied(actividad || "");
  }, [actividad]);

  function applyActivity() {
    setActivityApplied(activityDraft);
  }
  function retryRoot() {
    setRetry((value) => value + 1);
  }

  function loadServiceClients(
    service: ProfitService,
    nextPage = 1,
    force = false,
  ) {
    const existing = serviceData[service.key];
    if (!force && existing?.status === "loading") return;
    const currentGeneration = generation.current;
    const controller = addController();
    setServiceData((previous) => ({
      ...previous,
      [service.key]: {
        status: existing?.data ? "refreshing" : "loading",
        data: force ? undefined : existing?.data,
      },
    }));
    getProfit<ProfitResponse>(
      baseParams({
        nivel: "clientes",
        desde,
        hasta,
        buscar,
        actividad: activityApplied,
        servicioKey: service.key,
        page: nextPage,
      }),
      controller.signal,
    )
      .then((data) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setServiceData((previous) => ({
            ...previous,
            [service.key]: { status: "ready", data },
          }));
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setServiceData((previous) => ({
            ...previous,
            [service.key]: {
              status: "error",
              data: previous[service.key]?.data,
              error: errorMessage(error),
            },
          }));
      })
      .finally(() => removeController(controller));
  }

  function toggleService(service: ProfitService) {
    const opening = !expandedServices.has(service.key);
    setExpandedServices((previous) => {
      const next = new Set(previous);
      opening ? next.add(service.key) : next.delete(service.key);
      return next;
    });
    if (opening) loadServiceClients(service, servicePages[service.key] || 1);
  }

  function loadClientInvoices(
    service: ProfitService,
    client: ProfitClient,
    nextPage = 1,
    force = false,
  ) {
    const scope = serviceScopeKey(service.key, client.key);
    const existing = clientData[scope];
    if (!force && existing?.status === "loading") return;
    const currentGeneration = generation.current;
    const controller = addController();
    setClientData((previous) => ({
      ...previous,
      [scope]: {
        status: existing?.data ? "refreshing" : "loading",
        data: force ? undefined : existing?.data,
      },
    }));
    getProfit<ProfitResponse>(
      baseParams({
        nivel: "facturas",
        desde,
        hasta,
        buscar,
        actividad: activityApplied,
        servicioKey: service.key,
        clienteKey: client.key,
        page: nextPage,
      }),
      controller.signal,
    )
      .then((data) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setClientData((previous) => ({
            ...previous,
            [scope]: { status: "ready", data },
          }));
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setClientData((previous) => ({
            ...previous,
            [scope]: {
              status: "error",
              data: previous[scope]?.data,
              error: errorMessage(error),
            },
          }));
      })
      .finally(() => removeController(controller));
  }

  function toggleClient(service: ProfitService, client: ProfitClient) {
    const scope = serviceScopeKey(service.key, client.key);
    const opening = !expandedClients.has(scope);
    setExpandedClients((previous) => {
      const next = new Set(previous);
      opening ? next.add(scope) : next.delete(scope);
      return next;
    });
    if (opening) loadClientInvoices(service, client, clientPages[scope] || 1);
  }

  function loadDetail(invoiceId: string, scope: string, force = false) {
    const existing = details[scope];
    if (
      !force &&
      (existing?.status === "loading" || existing?.status === "ready")
    )
      return;
    const currentGeneration = generation.current;
    const controller = addController();
    setDetails((previous) => ({
      ...previous,
      [scope]: {
        status: existing?.data && !force ? "refreshing" : "loading",
        data: force ? undefined : existing?.data,
      },
    }));
    // El detalle se mantiene a nivel de factura y devuelve el total completo de la venta.
    getProfit<ProfitDetail>(
      baseParams({ nivel: "detalle", desde, hasta, facturaId: invoiceId }),
      controller.signal,
    )
      .then((data) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setDetails((previous) => ({
            ...previous,
            [scope]: { status: "ready", data },
          }));
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          generation.current === currentGeneration
        )
          setDetails((previous) => ({
            ...previous,
            [scope]: {
              status: "error",
              data: previous[scope]?.data,
              error: errorMessage(error),
            },
          }));
      })
      .finally(() => removeController(controller));
  }

  function toggleInvoice(
    service: ProfitService,
    client: ProfitClient,
    invoice: ProfitInvoice,
  ) {
    const scope = invoiceScopeKey(service.key, client.key, invoice.id);
    const opening = !expandedInvoices.has(scope);
    setExpandedInvoices((previous) => {
      const next = new Set(previous);
      opening ? next.add(scope) : next.delete(scope);
      return next;
    });
    if (opening) loadDetail(invoice.id, scope);
    if (!opening && editingInvoice === scope) setEditingInvoice(null);
  }

  function afterMutation(invoiceId: string, scope: string) {
    // El refresco de raíz vuelve a consultar también las ramas abiertas.
    retryRoot();
  }

  const metrics: ProfitMetrics | undefined = root.data?.kpis;
  const activities = root.data?.actividades || [];
  const notices = Array.from(
    new Set([
      "Los ingresos y los costes no se prorratean automáticamente: un pack mixto o parcial queda sin repartir hasta que se desglose.",
      "Exagrid y Draxton: los costes manuales o estimados no se añaden al margen hasta su consolidación en la fuente analítica.",
      ...(root.data?.avisos || []),
    ]),
  );

  return (
    <div className="space-y-5" aria-label="Rentabilidad de ventas">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Rentabilidad de ventas
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
              Ventas sin IVA menos costes conocidos vinculados. Es una lectura{" "}
              <strong>provisional</strong>, no beneficio neto ni liquidación de
              nómina.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label
                htmlFor="actividad-rentabilidad"
                className="mb-1 block text-xs font-bold text-slate-900"
              >
                Categoría de factura (clasificación actual)
              </label>
              <select
                id="actividad-rentabilidad"
                value={activityDraft}
                onChange={(event) => setActivityDraft(event.target.value)}
                style={{ colorScheme: 'light' }}
                className="min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="">Todas las categorías de factura</option>
                {activities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={applyActivity}
              className="rounded-lg border border-blue-800 bg-white px-3 py-2 text-sm font-bold text-blue-900 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              Aplicar categoría
            </button>
            <button
              type="button"
              onClick={retryRoot}
              disabled={root.status === "loading" || isRefreshing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Actualizar
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-700">
          Filtro de venta: {desde} — {hasta}
          {buscar ? ` · “${buscar}”` : ""}
          {activityApplied ? ` · ${activityApplied}` : ""}. La categoría de
          compras no se aplica a esta pestaña.
        </p>
      </section>

      {metrics ? (
        <section
          aria-label="Indicadores globales del filtro aplicado"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        >
          <Metric
            label="Ventas"
            value={money(metrics.ventas)}
            detail={`${integer.format(metrics.totalFacturas)} ventas distintas · todo el filtro`}
            tone="blue"
          />
          <Metric
            label="Compras directas"
            value={money(metrics.comprasDirectas)}
            detail="Vinculadas a facturas"
          />
          <Metric
            label="Compras cliente"
            value={money(metrics.comprasCliente)}
            detail="Bolsa cliente, no repartida"
            tone="amber"
          />
          <Metric
            label="Personal directo"
            value={money(metrics.personalDirecto)}
            detail="Coste imputado provisional"
          />
          <Metric
            label="Personal cliente"
            value={money(metrics.personalCliente)}
            detail="Bolsa cliente provisional"
            tone="amber"
          />
          <Metric
            label="Margen conocido"
            value={money(metrics.margenConocido)}
            detail={`Margen ${percent(metrics.margenPct)} · no es beneficio neto`}
            tone={metrics.incidencias ? "amber" : "green"}
          />
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-700">
          Cargando indicadores de rentabilidad…
        </section>
      )}

      {!workspaceDismissed && (selectedSaleId || facturaIspId !== null && facturaIspId !== undefined) && <div id="gestor-venta-directo" tabIndex={-1} className="scroll-mt-24 focus:outline-none"><InvoiceCostWorkspace initialSupplierKey={preferredSupplier?.facturaId === selectedSaleId ? preferredSupplier.key : undefined} ventaId={selectedSaleId} facturaIspId={selectedSaleId ? undefined : facturaIspId} onClose={() => { setWorkspaceDismissed(true); setSelectedSaleId(null); }} /></div>}

      <section className="overflow-hidden rounded-xl border-2 border-blue-300 bg-white shadow-sm" aria-labelledby="relacionar-compras-heading">
        <div className="flex flex-col gap-3 border-b border-blue-200 bg-blue-50 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-900">Acceso directo</p>
            <h3 id="relacionar-compras-heading" className="mt-1 text-lg font-bold text-slate-950">1. Identificar proveedor · 2. Asignar facturas de compra</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Marca el proveedor directamente en cada fila. Después verás solo sus compras para concretar el coste. Identificar proveedor no imputa ningún importe.</p>
          </div>
          <p className="text-xs font-semibold text-slate-700">{saleAllDates ? "Búsqueda: todos los períodos" : `Período: ${date(desde)} — ${date(hasta)}`}</p>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="max-w-2xl">
            <label htmlFor="buscar-venta-relacionar" className="mb-1 block text-sm font-bold text-slate-900">Buscar venta</label>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-700" aria-hidden="true" />
              <input id="buscar-venta-relacionar" value={saleSearchDraft} onChange={(event) => setSaleSearchDraft(event.target.value)} placeholder="Cliente, número de factura o concepto" className="w-full rounded-md border border-slate-400 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-950 placeholder:text-slate-500 focus:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700" />
            </div>
            <p className="mt-1 text-xs text-slate-700">Todas las ventas del alcance elegido están disponibles por páginas; las anuladas y borradores no participan en rentabilidad.</p>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={saleAllDates} onChange={event => setSaleAllDates(event.target.checked)} /> Buscar ventas en todos los períodos (los indicadores conservan su período)</label>
          {saleSelector.error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"><span><strong>No se pudieron cargar las ventas.</strong> {saleSelector.error}</span><button type="button" onClick={() => setSaleRetry((value) => value + 1)} className="rounded border border-red-400 bg-white px-3 py-1.5 text-xs font-bold text-red-900 focus:outline-none focus:ring-2 focus:ring-red-700">Reintentar</button></div>}
          <div className="overflow-x-auto rounded-md border border-slate-300">
            <table className="min-w-[760px] w-full text-left">
              <caption className="sr-only">Ventas disponibles para relacionar compras</caption>
              <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-800">
                <tr><th className="px-3 py-2.5">Venta</th><th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Concepto</th><th className="px-3 py-2.5 text-right">Ingreso sin IVA</th><th className="px-3 py-2.5">Proveedor del servicio</th><th className="px-3 py-2.5">Compras</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {saleSelector.status === "loading" && !saleSelector.data ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-700" aria-live="polite">Cargando ventas del período…</td></tr>
                ) : (saleSelector.data?.facturas || []).length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-700">No hay ventas que coincidan con esta búsqueda y período.</td></tr>
                ) : saleSelector.data?.facturas.map((sale) => (
                  <React.Fragment key={sale.id}><tr className={selectedSaleId === sale.id ? "bg-blue-50" : ""}>
                    <td className="px-3 py-3 text-sm text-slate-950"><strong>{sale.numFactura || "Venta sin número"}</strong><span className="mt-1 block text-xs text-slate-700">{date(sale.fecha)}</span></td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-900">{sale.cliente}</td>
                    <td className="max-w-xs px-3 py-3 text-sm text-slate-700">{sale.concepto || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">{money(sale.ventas)}</td>
                    <td className="px-3 py-3"><p className="mb-1 max-w-xs text-xs font-semibold text-slate-800">{sale.proveedores?.join(" · ") || "Sin informar"}</p><button type="button" onClick={() => setSupplierSaleId(supplierSaleId === sale.id ? null : sale.id)} aria-expanded={supplierSaleId === sale.id} className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 hover:bg-blue-100">{sale.proveedores?.length ? "Editar proveedor" : "Asignar proveedor"}</button></td>
                    <td className="px-3 py-3"><button type="button" onClick={() => { setWorkspaceDismissed(false); setSelectedSaleId(sale.id); window.setTimeout(() => { const panel=document.getElementById("gestor-venta-directo"); panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true }); }, 0); }} className="rounded-md bg-blue-800 px-3 py-2 text-xs font-bold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2" title={!saleSelector.data?.canWrite ? "Se abrirá en modo consulta: no tienes permiso para modificar vinculaciones" : undefined}>{saleSelector.data?.canWrite ? "Relacionar compras" : "Ver vínculos"}</button></td>
                  </tr>{supplierSaleId === sale.id && <tr><td colSpan={6} className="bg-blue-50 p-3"><VentaProveedores facturaId={sale.id} autoSelectFirst={false} onSaved={() => setSaleRetry(value => value + 1)} onSelectSupplier={key => { setPreferredSupplier({ facturaId: sale.id, key }); setSelectedSaleId(sale.id); setWorkspaceDismissed(false); setSupplierSaleId(null); window.setTimeout(() => document.getElementById("gestor-venta-directo")?.scrollIntoView({ block: "start" }), 0); }} /></td></tr>}</React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {saleSelector.data && <Pager page={saleSelector.data.page} total={saleSelector.data.total} totalPages={saleSelector.data.totalPages} loading={saleSelector.status === "loading" || saleSelector.status === "refreshing"} onPage={setSalePage} label="Paginación de ventas para relacionar compras" />}
        </div>
      </section>


      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex gap-3">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p>
              <strong>Lectura por servicio:</strong> primero selecciona el
              servicio, después el cliente y finalmente la factura. Los KPIs de
              arriba son globales y cuentan las facturas una sola vez; una
              factura de pack mixto puede aparecer en más de un servicio, por lo
              que los contadores de las tarjetas no se suman.
            </p>
            <p className="mt-1">
              Los costes de una factura con desglose completo y homogéneo pueden
              mostrarse en su servicio. Packs mixtos, desglose parcial y costes
              solo de cliente permanecen <strong>sin repartir</strong>; no se
              reparte proporcionalmente el ingreso ni el coste.
            </p>
            {metrics && (
              <p className="mt-1 text-xs">
                {integer.format(metrics.sinCosteDirecto)} ventas sin coste
                directo · {integer.format(metrics.incidencias)} incidencias en
                el filtro.
              </p>
            )}
          </div>
        </div>
      </section>

      {notices.length > 0 && (
        <section aria-label="Avisos de calidad" className="space-y-2">
          {notices.map((notice, index) => (
            <p
              key={`${notice}-${index}`}
              className="flex gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-800"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
              {notice}
            </p>
          ))}
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-950">
              Servicios, clientes y ventas
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              Explora la rentabilidad por modelo de servicio. Cada rama de
              clientes y facturas se pagina de forma independiente.
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {isRefreshing
              ? "Actualizando…"
              : root.data
                ? `${integer.format(root.data.servicios.length)} modelos`
                : "Cargando…"}
          </p>
        </div>
        {root.error && (
          <div
            role="alert"
            className="m-4 flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              <strong>No se pudo actualizar la rentabilidad.</strong>{" "}
              {root.error}
            </span>
            <button
              type="button"
              onClick={retryRoot}
              className="rounded-md border border-red-400 bg-white px-3 py-1.5 font-bold text-red-900 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-700"
            >
              Reintentar
            </button>
          </div>
        )}
        {!root.data && root.status === "loading" && (
          <p
            className="px-5 py-10 text-center text-sm font-medium text-slate-700"
            aria-live="polite"
          >
            Cargando servicios…
          </p>
        )}
        {root.data && root.data.servicios.length === 0 && (
          <div className="px-5 py-12 text-center">
            <h4 className="text-base font-bold text-slate-950">
              No hay ventas con este filtro
            </h4>
            <p className="mt-1 text-sm text-slate-700">
              Revisa el período, la actividad o el texto de venta, cliente,
              número o concepto.
            </p>
          </div>
        )}
        {root.data && root.data.servicios.length > 0 && (
          <ul
            className="grid gap-3 p-3 lg:grid-cols-2"
            aria-label="Rentabilidad por servicio"
          >
            {root.data.servicios.map((service) => {
              const guidance = serviceGuidance[service.key] || {
                title: service.label,
                description: "Servicio clasificado en la venta.",
                tone: "border-slate-200 bg-slate-50",
              };
              const open = expandedServices.has(service.key);
              const branch = serviceData[service.key];
              const branchPage = servicePages[service.key] || 1;
              const serviceId = `servicio-profit-${service.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              return (
                <li
                  key={service.key}
                  className={`overflow-hidden rounded-xl border ${guidance.tone}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleService(service)}
                    aria-expanded={open}
                    aria-controls={serviceId}
                    className="w-full p-4 text-left hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                          {guidance.title}
                        </p>
                        <h4 className="mt-1 text-base font-bold text-slate-950">
                          {service.label}
                        </h4>
                        <p className="mt-1 text-xs leading-5 text-slate-700">
                          {guidance.description}
                        </p>
                      </div>
                      <span className="mt-1 shrink-0 text-slate-800">
                        {open ? (
                          <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5" />
                        )}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-900/10 pt-3 text-sm">
                      <span className="text-slate-700">
                        Ventas{" "}
                        <strong className="float-right tabular-nums text-slate-950">
                          {money(service.ventas)}
                        </strong>
                      </span>
                      <span className="text-slate-700">
                        Margen{" "}
                        <strong className="float-right tabular-nums text-slate-950">
                          {money(service.margenConocido)}
                        </strong>
                      </span>
                      <span className="text-slate-700">
                        Compras{" "}
                        <strong className="float-right tabular-nums text-slate-950">
                          {money(service.comprasDirectas)}
                        </strong>
                      </span>
                      <span className="text-slate-700">
                        Personal{" "}
                        <strong className="float-right tabular-nums text-slate-950">
                          {money(service.personalDirecto)}
                        </strong>
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800">
                        {integer.format(service.totalFacturas)} facturas en este
                        servicio · {percent(service.margenPct)}
                      </span>
                      {service.pendienteReparto && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-950">
                          Pendiente de reparto
                        </span>
                      )}
                    </div>
                  </button>
                  {open && (
                    <div
                      id={serviceId}
                      className="border-t border-slate-200 bg-white p-3 sm:p-4"
                    >
                      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                        <strong>Alcance del servicio:</strong> importes y
                        facturas de esta tarjeta no se suman entre modelos. La
                        parte sin desglose, los packs mixtos y las bolsas de
                        cliente permanecen sin reparto automático.
                      </div>
                      {branch?.error && (
                        <div
                          role="alert"
                          className="mb-3 flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span>{branch.error}</span>
                          <button
                            type="button"
                            onClick={() =>
                              loadServiceClients(service, branchPage, true)
                            }
                            className="rounded border border-red-400 bg-white px-3 py-1.5 text-xs font-bold text-red-900"
                          >
                            Reintentar
                          </button>
                        </div>
                      )}
                      {branch?.status === "loading" && !branch.data && (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-700">
                          Cargando clientes de este servicio…
                        </p>
                      )}
                      {branch?.data && (
                        <>
                          {branch.data.clientes.length === 0 ? (
                            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-700">
                              No hay clientes para este servicio con el filtro
                              actual.
                            </p>
                          ) : (
                            <ul
                              className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200"
                              aria-label={`Clientes de ${service.label}`}
                            >
                              {branch.data.clientes.map((client) => {
                                const clientScope = serviceScopeKey(
                                  service.key,
                                  client.key,
                                );
                                const clientOpen =
                                  expandedClients.has(clientScope);
                                const invoices = clientData[clientScope];
                                const clientPage =
                                  clientPages[clientScope] || 1;
                                const clientId = `cliente-profit-${clientScope.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                                return (
                                  <li key={clientScope}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleClient(service, client)
                                      }
                                      aria-expanded={clientOpen}
                                      aria-controls={clientId}
                                      className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-700 lg:grid-cols-[auto_minmax(180px,1.4fr)_minmax(100px,.7fr)_minmax(100px,.7fr)_minmax(120px,.7fr)] lg:items-center"
                                    >
                                      <span className="pt-0.5">
                                        {clientOpen ? (
                                          <ChevronDownIcon className="h-5 w-5" />
                                        ) : (
                                          <ChevronRightIcon className="h-5 w-5" />
                                        )}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-bold text-slate-950">
                                          {client.label}
                                        </span>
                                        <span className="mt-1 block text-xs text-slate-700 lg:hidden">
                                          {integer.format(client.totalFacturas)}{" "}
                                          ventas · {money(client.ventas)} ·
                                          margen {money(client.margenConocido)}
                                        </span>
                                      </span>
                                      <span className="hidden text-right text-sm tabular-nums text-slate-950 lg:block">
                                        <span className="block text-xs text-slate-600">
                                          Venta del servicio
                                        </span>
                                        {money(client.ventas)}
                                      </span>
                                      <span className="hidden text-right text-sm tabular-nums text-slate-950 lg:block">
                                        <span className="block text-xs text-slate-600">
                                          Costes directos
                                        </span>
                                        {money(
                                          client.comprasDirectas +
                                            client.personalDirecto,
                                        )}
                                      </span>
                                      <span className="hidden text-right text-sm font-bold tabular-nums text-slate-950 lg:block">
                                        <span className="block text-xs font-normal text-slate-600">
                                          Margen parcial
                                        </span>
                                        {money(client.margenConocido)}
                                        <span className="block text-xs font-normal text-amber-800">
                                          {percent(client.margenPct)}
                                        </span>
                                      </span>
                                    </button>
                                    {clientOpen && (
                                      <div
                                        id={clientId}
                                        className="border-t border-slate-200 bg-slate-50 p-3"
                                      >
                                        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                                          <strong>
                                            Cliente en {service.label}:
                                          </strong>{" "}
                                          venta {money(client.ventas)}. Compras
                                          y personal solo de cliente no se
                                          asignan proporcionalmente a estas
                                          facturas.
                                        </div>
                                        {invoices?.error && (
                                          <div
                                            role="alert"
                                            className="mb-3 flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
                                          >
                                            <span>{invoices.error}</span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                loadClientInvoices(
                                                  service,
                                                  client,
                                                  clientPage,
                                                  true,
                                                )
                                              }
                                              className="rounded border border-red-400 bg-white px-3 py-1.5 text-xs font-bold text-red-900"
                                            >
                                              Reintentar
                                            </button>
                                          </div>
                                        )}
                                        {invoices?.status === "loading" &&
                                          !invoices.data && (
                                            <p className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-700">
                                              Cargando facturas de venta…
                                            </p>
                                          )}
                                        {invoices?.data && (
                                          <>
                                            {invoices.data.facturas.length ===
                                            0 ? (
                                              <p className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-700">
                                                No hay facturas en esta página.
                                              </p>
                                            ) : (
                                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                                <table className="min-w-[920px] w-full text-left">
                                                  <caption className="sr-only">
                                                    Ventas de {client.label}{" "}
                                                    para {service.label}
                                                  </caption>
                                                  <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-800">
                                                    <tr>
                                                      <th className="px-3 py-3">
                                                        Venta
                                                      </th>
                                                      <th className="px-3 py-3">
                                                        Actividad
                                                      </th>
                                                      <th className="px-3 py-3 text-right">
                                                        Venta del servicio
                                                      </th>
                                                      <th className="px-3 py-3 text-right">
                                                        Compras directas
                                                      </th>
                                                      <th className="px-3 py-3 text-right">
                                                        Personal directo
                                                      </th>
                                                      <th className="px-3 py-3 text-right">
                                                        Margen parcial
                                                      </th>
                                                      <th className="px-3 py-3">
                                                        Calidad
                                                      </th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-slate-200">
                                                    {invoices.data.facturas.map(
                                                      (invoice) => {
                                                        const invoiceScope =
                                                          invoiceScopeKey(
                                                            service.key,
                                                            client.key,
                                                            invoice.id,
                                                          );
                                                        const invoiceOpen =
                                                          expandedInvoices.has(
                                                            invoiceScope,
                                                          );
                                                        const detail =
                                                          details[invoiceScope];
                                                        const invoiceId = `factura-profit-${invoiceScope.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                                                        return (
                                                          <React.Fragment
                                                            key={invoiceScope}
                                                          >
                                                            <tr
                                                              className={
                                                                invoiceOpen
                                                                  ? "bg-blue-50/50"
                                                                  : "bg-white"
                                                              }
                                                            >
                                                              <td className="px-3 py-3 align-top">
                                                                <button
                                                                  type="button"
                                                                  onClick={() =>
                                                                    toggleInvoice(
                                                                      service,
                                                                      client,
                                                                      invoice,
                                                                    )
                                                                  }
                                                                  aria-expanded={
                                                                    invoiceOpen
                                                                  }
                                                                  aria-controls={
                                                                    invoiceId
                                                                  }
                                                                  className="flex max-w-sm items-start gap-2 text-left text-sm text-slate-950 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                                                >
                                                                  <span className="mt-0.5">
                                                                    {invoiceOpen ? (
                                                                      <ChevronDownIcon className="h-4 w-4" />
                                                                    ) : (
                                                                      <ChevronRightIcon className="h-4 w-4" />
                                                                    )}
                                                                  </span>
                                                                  <span>
                                                                    <span className="font-bold">
                                                                      {invoice.numFactura ||
                                                                        "Venta sin número"}
                                                                    </span>
                                                                    <span className="mt-1 block text-xs font-normal text-slate-700">
                                                                      {date(
                                                                        invoice.fecha,
                                                                      )}
                                                                      {invoice.concepto
                                                                        ? ` · ${invoice.concepto}`
                                                                        : ""}
                                                                    </span>
                                                                  </span>
                                                                </button>
                                                              </td>
                                                              <td className="px-3 py-3 align-top text-sm text-slate-900">
                                                                {invoice.actividad ||
                                                                  "—"}
                                                              </td>
                                                              <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">
                                                                {money(
                                                                  invoice.ventas,
                                                                )}
                                                              </td>
                                                              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                                                                {money(
                                                                  invoice.comprasDirectas,
                                                                )}
                                                                <span className="mt-1 block text-[11px] text-slate-600">
                                                                  {
                                                                    invoice.numCompras
                                                                  }{" "}
                                                                  asign.
                                                                </span>
                                                              </td>
                                                              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                                                                {money(
                                                                  invoice.personalDirecto,
                                                                )}
                                                                <span className="mt-1 block text-[11px] text-slate-600">
                                                                  {invoice.numHoras.toLocaleString(
                                                                    "es-ES",
                                                                    {
                                                                      maximumFractionDigits: 2,
                                                                    },
                                                                  )}{" "}
                                                                  h
                                                                </span>
                                                              </td>
                                                              <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">
                                                                {money(
                                                                  invoice.margenConocido,
                                                                )}
                                                                <span className="mt-1 block text-[11px] font-normal text-amber-800">
                                                                  {percent(
                                                                    invoice.margenPct,
                                                                    invoice.calidad,
                                                                  )}
                                                                </span>
                                                              </td>
                                                              <td className="px-3 py-3 align-top">
                                                                <Quality
                                                                  quality={
                                                                    invoice.calidad
                                                                  }
                                                                />
                                                              </td>
                                                            </tr>
                                                            {invoiceOpen && (
                                                              <tr
                                                                id={invoiceId}
                                                              >
                                                                <td
                                                                  colSpan={7}
                                                                  className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4"
                                                                >
                                                                  {detail?.status ===
                                                                    "loading" &&
                                                                    !detail.data && (
                                                                      <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
                                                                        Cargando
                                                                        detalle
                                                                        de
                                                                        costes…
                                                                      </p>
                                                                    )}
                                                                  {detail?.error && (
                                                                    <div
                                                                      role="alert"
                                                                      className="flex flex-col gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
                                                                    >
                                                                      <span>
                                                                        {
                                                                          detail.error
                                                                        }
                                                                      </span>
                                                                      <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                          loadDetail(
                                                                            invoice.id,
                                                                            invoiceScope,
                                                                            true,
                                                                          )
                                                                        }
                                                                        className="rounded border border-red-400 bg-white px-3 py-1.5 text-xs font-bold text-red-900"
                                                                      >
                                                                        Reintentar
                                                                      </button>
                                                                    </div>
                                                                  )}
                                                                  {detail?.data && (
                                                                    <div className="space-y-4">
                                                                      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">
                                                                        <strong>
                                                                          Dos
                                                                          alcances:
                                                                        </strong>{" "}
                                                                        la fila
                                                                        muestra{" "}
                                                                        {money(
                                                                          invoice.ventas,
                                                                        )}{" "}
                                                                        correspondiente
                                                                        a{" "}
                                                                        <strong>
                                                                          {
                                                                            service.label
                                                                          }
                                                                        </strong>
                                                                        . Este
                                                                        detalle
                                                                        es la
                                                                        factura
                                                                        completa:
                                                                        venta
                                                                        sin IVA{" "}
                                                                        {money(
                                                                          detail
                                                                            .data
                                                                            .factura
                                                                            .ventas,
                                                                        )}
                                                                        .
                                                                      </div>
                                                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                        <div>
                                                                          <h5 className="font-bold text-slate-950">
                                                                            Costes
                                                                            asignados
                                                                            a
                                                                            esta
                                                                            venta
                                                                          </h5>
                                                                          <p className="mt-1 text-xs leading-5 text-slate-700">
                                                                            Margen
                                                                            parcial:
                                                                            no
                                                                            descuenta
                                                                            las
                                                                            bolsas
                                                                            de
                                                                            cliente.
                                                                            El
                                                                            personal
                                                                            usa
                                                                            el
                                                                            snapshot
                                                                            de{" "}
                                                                            <strong>
                                                                              coste
                                                                              imputado
                                                                            </strong>
                                                                            ; no
                                                                            es
                                                                            nómina,
                                                                            coste
                                                                            anual
                                                                            ni
                                                                            proyección
                                                                            y
                                                                            puede
                                                                            no
                                                                            reconciliar
                                                                            con
                                                                            payroll.
                                                                          </p>
                                                                        </div>
                                                                        {detail
                                                                          .data
                                                                          .canWrite && (
                                                                          <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                              setEditingInvoice(
                                                                                editingInvoice ===
                                                                                  invoiceScope
                                                                                  ? null
                                                                                  : invoiceScope,
                                                                              )
                                                                            }
                                                                            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-blue-800 px-3 py-2 text-sm font-bold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                                                          >
                                                                            <PencilSquareIcon className="h-4 w-4" />
                                                                            {editingInvoice ===
                                                                            invoiceScope
                                                                              ? "Cerrar editor"
                                                                              : "Relacionar compras y personal"}
                                                                          </button>
                                                                        )}
                                                                      </div>
                                                                      <VentaServicios
                                                                        facturaId={
                                                                          detail
                                                                            .data
                                                                            .factura
                                                                            .id
                                                                        }
                                                                        base={
                                                                          detail
                                                                            .data
                                                                            .factura
                                                                            .ventas
                                                                        }
                                                                        canWrite={
                                                                          detail
                                                                            .data
                                                                            .canWrite
                                                                        }
                                                                        onChange={() =>
                                                                          afterMutation(
                                                                            invoice.id,
                                                                            invoiceScope,
                                                                          )
                                                                        }
                                                                      />
                                                                      {detail.data.avisos.map(
                                                                        (
                                                                          notice,
                                                                          index,
                                                                        ) => (
                                                                          <p
                                                                            key={`${notice}-${index}`}
                                                                            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                                                                          >
                                                                            {
                                                                              notice
                                                                            }
                                                                          </p>
                                                                        ),
                                                                      )}
                                                                      <div className="rounded-md border border-slate-200 bg-white">
                                                                        <div className="border-b border-slate-200 px-3 py-2">
                                                                          <h6 className="text-sm font-bold text-slate-950">
                                                                            Compras
                                                                            asignadas
                                                                          </h6>
                                                                        </div>
                                                                        {detail
                                                                          .data
                                                                          .compras
                                                                          .length ? (
                                                                          <AssignedPurchases
                                                                            items={
                                                                              detail
                                                                                .data
                                                                                .compras
                                                                            }
                                                                          />
                                                                        ) : (
                                                                          <p className="px-3 py-4 text-sm text-slate-700">
                                                                            No
                                                                            hay
                                                                            compras
                                                                            asignadas
                                                                            a
                                                                            esta
                                                                            venta.
                                                                          </p>
                                                                        )}
                                                                      </div>
                                                                      <div className="rounded-md border border-slate-200 bg-white">
                                                                        <div className="border-b border-slate-200 px-3 py-2">
                                                                          <h6 className="text-sm font-bold text-slate-950">
                                                                            Personal
                                                                            asignado
                                                                          </h6>
                                                                        </div>
                                                                        {detail
                                                                          .data
                                                                          .personal
                                                                          .length ? (
                                                                          <AssignedStaff
                                                                            items={
                                                                              detail
                                                                                .data
                                                                                .personal
                                                                            }
                                                                          />
                                                                        ) : (
                                                                          <p className="px-3 py-4 text-sm text-slate-700">
                                                                            No
                                                                            hay
                                                                            personal
                                                                            asignado
                                                                            a
                                                                            esta
                                                                            venta.
                                                                          </p>
                                                                        )}
                                                                      </div>
                                                                      {editingInvoice ===
                                                                        invoiceScope &&
                                                                        detail
                                                                          .data
                                                                          .canWrite && (
                                                                          <CostEditor
                                                                            facturaId={
                                                                              invoice.id
                                                                            }
                                                                            desde={
                                                                              desde
                                                                            }
                                                                            hasta={
                                                                              hasta
                                                                            }
                                                                            compras={
                                                                              detail
                                                                                .data
                                                                                .compras
                                                                            }
                                                                            personal={
                                                                              detail
                                                                                .data
                                                                                .personal
                                                                            }
                                                                            onChanged={() =>
                                                                              afterMutation(
                                                                                invoice.id,
                                                                                invoiceScope,
                                                                              )
                                                                            }
                                                                          />
                                                                        )}
                                                                    </div>
                                                                  )}
                                                                </td>
                                                              </tr>
                                                            )}
                                                          </React.Fragment>
                                                        );
                                                      },
                                                    )}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}
                                            <Pager
                                              page={invoices.data.page}
                                              total={invoices.data.total}
                                              totalPages={
                                                invoices.data.totalPages
                                              }
                                              loading={
                                                invoices.status === "loading" ||
                                                invoices.status === "refreshing"
                                              }
                                              label={`Paginación de ventas de ${client.label} en ${service.label}`}
                                              onPage={(nextPage) => {
                                                setClientPages((previous) => ({
                                                  ...previous,
                                                  [clientScope]: nextPage,
                                                }));
                                                loadClientInvoices(
                                                  service,
                                                  client,
                                                  nextPage,
                                                );
                                              }}
                                            />
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <Pager
                            page={branch.data.page}
                            total={branch.data.total}
                            totalPages={branch.data.totalPages}
                            loading={
                              branch.status === "loading" ||
                              branch.status === "refreshing"
                            }
                            label={`Paginación de clientes de ${service.label}`}
                            onPage={(nextPage) => {
                              setServicePages((previous) => ({
                                ...previous,
                                [service.key]: nextPage,
                              }));
                              loadServiceClients(service, nextPage);
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {root.data && (
        <aside className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          <p>
            <strong>Pendientes de consolidación:</strong>{" "}
            {integer.format(root.data.pendientes.comprasSinVenta)} compras sin
            venta, {integer.format(root.data.pendientes.personalSinVenta)}{" "}
            personal sin venta,{" "}
            {integer.format(root.data.pendientes.horasSinCoste)} horas sin coste
            y {integer.format(root.data.pendientes.conflictos)} conflictos.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            No se muestran documentos individuales de salario ni nómina en esta
            vista financiera.
          </p>
        </aside>
      )}
    </div>
  );
}
