"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentArrowDownIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

const API = "/api/admin/finanzas/costes-operadora/pendientes";
const PAGE_SIZE = 25;

type PendingStatus =
  | "DETECTADO"
  | "ANALIZANDO"
  | "LISTO"
  | "REVISION"
  | "CAMBIADO"
  | "ERROR";

type PendingLine = {
  descripcion: string | null;
  importe: number | null;
};

type PendingResult = {
  proveedor?: string | null;
  destinatario?: string | null;
  numFactura?: string | null;
  fecha?: string | null;
  base?: number | null;
  iva?: number | null;
  total?: number | null;
  confianza?: number | null;
  concepto?: string | null;
  lineas: PendingLine[];
};

/** Documento del archivo de otra empresa que todavía no es una factura recibida de IO. */
export type PendingDocument = {
  id: string;
  nombre: string;
  ruta: string;
  mime?: string | null;
  size?: number | null;
  estado: PendingStatus;
  version: number;
  resultado?: PendingResult | null;
  incidencia?: string | null;
  /** Una fuente ya creada conserva este vínculo; nunca se modifica desde aquí. */
  fuenteId?: string | null;
};

type PendingSummary = {
  detectados: number;
  analizados: number;
  listos: number;
  revision: number;
  asignados: number;
  basePendiente: number;
  totalPendiente: number;
};

type PendingResponse = {
  documentos: PendingDocument[];
  total: number;
  totalPages: number;
  resumen: PendingSummary;
  canWrite: boolean;
};

type DiscoveryResponse = {
  detectados: number;
  actualizados: number;
  omitidos: number;
  incompleto: boolean;
};

type QueueStatus = "idle" | "pending" | "success" | "error";
type QueueItem = {
  document: PendingDocument;
  status: QueueStatus;
  error?: string;
};

type Notice = { tone: "success" | "warning"; text: string } | null;

export type PendingRefactoringDocumentsProps = {
  canWrite: boolean;
  onUseDocument: (document: PendingDocument) => void;
  onRefresh?: () => void;
  onBusyChange?: (busy: boolean) => void;
  refreshToken?: number;
};

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("es-ES");
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 shadow-sm placeholder:text-slate-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";
const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function isFiniteAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(value: number | null | undefined) {
  return isFiniteAmount(value) ? euro.format(value) : "No verificable";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formatBytes(value?: number | null) {
  if (!isFiniteAmount(value) || value < 0) return null;
  if (value < 1024) return `${integer.format(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function serverMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string" &&
    (body as { error: string }).error.trim()
  )
    return (body as { error: string }).error.trim();
  return fallback;
}

async function requestJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(serverMessage(body, `Error ${response.status}.`));
  return body as T;
}

function statusLabel(status: PendingStatus) {
  const labels: Record<PendingStatus, string> = {
    DETECTADO: "Detectado",
    ANALIZANDO: "Analizando",
    LISTO: "Listo",
    REVISION: "Revisión",
    CAMBIADO: "Documento cambiado",
    ERROR: "Error",
  };
  return labels[status];
}

function StatusBadge({ status }: { status: PendingStatus }) {
  const colours: Record<PendingStatus, string> = {
    DETECTADO: "border-slate-300 bg-slate-100 text-slate-900",
    ANALIZANDO: "border-blue-300 bg-blue-50 text-blue-950",
    LISTO: "border-emerald-300 bg-emerald-50 text-emerald-950",
    REVISION: "border-amber-400 bg-amber-50 text-amber-950",
    CAMBIADO: "border-violet-300 bg-violet-50 text-violet-950",
    ERROR: "border-red-300 bg-red-50 text-red-950",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-extrabold ${colours[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function QueueBadge({ item }: { item?: QueueItem }) {
  if (!item || item.status === "idle") return null;
  const content =
    item.status === "pending"
      ? "Analizando…"
      : item.status === "success"
        ? "Analizado en esta sesión"
        : "Error de análisis";
  const colours =
    item.status === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : item.status === "error"
        ? "border-red-300 bg-red-50 text-red-950"
        : "border-blue-300 bg-blue-50 text-blue-950";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-extrabold ${colours}`}
    >
      {content}
    </span>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "slate" | "blue" | "amber" | "green";
}) {
  const colours = {
    slate: "text-slate-950",
    blue: "text-blue-950",
    amber: "text-amber-950",
    green: "text-emerald-950",
  };
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-extrabold tabular-nums ${colours[tone]}`}
      >
        {value}
      </p>
    </div>
  );
}

function Pager({
  page,
  total,
  totalPages,
  disabled,
  onPage,
}: {
  page: number;
  total: number;
  totalPages: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  return (
    <nav
      aria-label="Paginación de documentos pendientes"
      className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-slate-700">
        Mostrando {first}–{Math.min(page * PAGE_SIZE, total)} de{" "}
        {integer.format(total)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPage(page - 1)}
          className={`${actionClass} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
        >
          Anterior
        </button>
        <span className="text-xs font-extrabold text-slate-950">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={() => onPage(page + 1)}
          className={`${actionClass} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

function DocumentDetails({ document }: { document: PendingDocument }) {
  const result = document.resultado;
  if (!result) {
    return (
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <p className="text-sm text-slate-800">
          Aún no hay datos extraídos. Analiza el documento para revisar
          proveedor, factura, importes y artículos.
        </p>
      </div>
    );
  }
  const lines = Array.isArray(result.lineas) ? result.lineas : [];
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Datos extraídos">
          <h4 className="text-sm font-extrabold text-slate-950">
            Datos extraídos
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-300 bg-white p-3 text-sm">
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Proveedor
              </dt>
              <dd className="font-bold text-slate-950">
                {result.proveedor || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Destinatario
              </dt>
              <dd className="font-bold text-slate-950">
                {result.destinatario || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Número / fecha
              </dt>
              <dd className="font-bold text-slate-950">
                {result.numFactura || "Sin número"} · {formatDate(result.fecha)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Confianza OCR
              </dt>
              <dd className="font-bold tabular-nums text-slate-950">
                {isFiniteAmount(result.confianza)
                  ? `${Math.round(result.confianza * (result.confianza <= 1 ? 100 : 1))} %`
                  : "No disponible"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Base
              </dt>
              <dd className="font-bold tabular-nums text-slate-950">
                {money(result.base)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                IVA
              </dt>
              <dd className="font-bold tabular-nums text-slate-950">
                {money(result.iva)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Total documento
              </dt>
              <dd className="font-bold tabular-nums text-slate-950">
                {money(result.total)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                Concepto
              </dt>
              <dd className="text-slate-950">{result.concepto || "—"}</dd>
            </div>
          </dl>
        </section>
        <section aria-label="Artículos extraídos">
          <h4 className="text-sm font-extrabold text-slate-950">
            Artículos extraídos
          </h4>
          {lines.length ? (
            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-300 bg-white">
              {lines.map((line, index) => (
                <li
                  key={`${line.descripcion}-${index}`}
                  className="flex justify-between gap-4 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 text-slate-950">
                    {line.descripcion || `Artículo ${index + 1}`}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-950">
                    {money(line.importe)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800">
              El análisis no ha devuelto artículos verificables.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Archivo de originales que otra empresa recibió y que podría refacturar a IO.
 * El panel solo descubre y analiza: nunca crea fuentes, reparte artículos ni
 * aplica cambios contables por sí mismo.
 */
export default function PendingRefactoringDocuments({
  canWrite,
  onUseDocument,
  onRefresh,
  onBusyChange,
  refreshToken,
}: PendingRefactoringDocumentsProps) {
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState<"" | PendingStatus>("");
  const [data, setData] = useState<PendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [discovering, setDiscovering] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Map<string, QueueItem>>(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const actionAbortRef = useRef<AbortController | null>(null);
  const requestNumberRef = useRef(0);

  const busy = discovering || queueBusy;
  const documents = data?.documentos || [];
  const selected = useMemo(() => Array.from(queue.values()), [queue]);
  const selectedCount = selected.length;
  const successfulCount = selected.filter(
    (item) => item.status === "success",
  ).length;
  const failedItems = selected.filter((item) => item.status === "error");
  const waitingCount = selected.filter(
    (item) => item.status === "idle" || item.status === "error",
  ).length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchDraft.trim();
      setBuscar(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    const requestNumber = ++requestNumberRef.current;
    loadAbortRef.current = controller;
    const params = new URLSearchParams({ page: String(page) });
    if (buscar) params.set("buscar", buscar);
    if (estado) params.set("estado", estado);

    setLoading(true);
    setLoadError("");
    requestJson<PendingResponse>(`${API}?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (
          controller.signal.aborted ||
          requestNumber !== requestNumberRef.current
        )
          return;
        setData({
          documentos: Array.isArray(response.documentos)
            ? response.documentos
            : [],
          total: isFiniteAmount(response.total) ? response.total : 0,
          totalPages: Math.max(
            1,
            isFiniteAmount(response.totalPages) ? response.totalPages : 1,
          ),
          resumen: {
            detectados: isFiniteAmount(response.resumen?.detectados)
              ? response.resumen.detectados
              : 0,
            analizados: isFiniteAmount(response.resumen?.analizados)
              ? response.resumen.analizados
              : 0,
            listos: isFiniteAmount(response.resumen?.listos)
              ? response.resumen.listos
              : 0,
            revision: isFiniteAmount(response.resumen?.revision)
              ? response.resumen.revision
              : 0,
            asignados: isFiniteAmount(response.resumen?.asignados)
              ? response.resumen.asignados
              : 0,
            basePendiente: isFiniteAmount(response.resumen?.basePendiente)
              ? response.resumen.basePendiente
              : 0,
            totalPendiente: isFiniteAmount(response.resumen?.totalPendiente)
              ? response.resumen.totalPendiente
              : 0,
          },
          canWrite: Boolean(response.canWrite),
        });
      })
      .catch((cause: unknown) => {
        if (
          controller.signal.aborted ||
          requestNumber !== requestNumberRef.current
        )
          return;
        setData(null);
        setLoadError(
          cause instanceof Error && cause.message
            ? cause.message
            : "No se han podido cargar los documentos pendientes.",
        );
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          requestNumber === requestNumberRef.current
        )
          setLoading(false);
      });

    return () => controller.abort();
  }, [page, buscar, estado, reload, refreshToken]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(
    () => () => {
      loadAbortRef.current?.abort();
      actionAbortRef.current?.abort();
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  function updateDocument(next: PendingDocument) {
    setData((current) =>
      current
        ? {
            ...current,
            documentos: current.documentos.map((document) =>
              document.id === next.id ? next : document,
            ),
          }
        : current,
    );
    setQueue((current) => {
      const item = current.get(next.id);
      if (!item) return current;
      const updated = new Map(current);
      updated.set(next.id, { ...item, document: next });
      return updated;
    });
  }

  function setQueueItem(
    document: PendingDocument,
    status: QueueStatus,
    error?: string,
  ) {
    setQueue((current) => {
      const next = new Map(current);
      next.set(document.id, { document, status, error });
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(document: PendingDocument, checked: boolean) {
    if (busy || document.fuenteId) return;
    setQueue((current) => {
      const next = new Map(current);
      if (checked) next.set(document.id, { document, status: "idle" });
      else next.delete(document.id);
      return next;
    });
    setNotice(null);
  }

  async function analyseDocuments(candidates: PendingDocument[]) {
    const allowed = candidates.filter((document) => !document.fuenteId);
    if (!allowed.length || busy || !canWrite) return;

    const controller = new AbortController();
    actionAbortRef.current = controller;
    setQueueBusy(true);
    setNotice(null);
    let succeeded = 0;
    let failed = 0;

    for (const document of allowed) {
      if (controller.signal.aborted) break;
      setActiveId(document.id);
      setQueueItem(document, "pending");
      try {
        const response = await requestJson<{ documento: PendingDocument }>(
          API,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({
              action: "analizar",
              id: document.id,
              version: document.version,
            }),
          },
        );
        if (controller.signal.aborted) break;
        if (!response?.documento?.id)
          throw new Error("El servidor no ha devuelto el documento analizado.");
        updateDocument(response.documento);
        setQueueItem(response.documento, "success");
        succeeded += 1;
      } catch (cause) {
        if (controller.signal.aborted) break;
        const error =
          cause instanceof Error && cause.message
            ? cause.message
            : "No se ha podido analizar este documento.";
        setQueueItem(document, "error", error);
        failed += 1;
      }
    }

    if (!controller.signal.aborted) {
      setActiveId(null);
      if (succeeded || failed) {
        setNotice({
          tone: failed ? "warning" : "success",
          text: failed
            ? `${succeeded} de ${succeeded + failed} documentos se han analizado. ${failed} quedan con error y solo se reintentarán si lo solicitas.`
            : `${succeeded} documento${succeeded === 1 ? "" : "s"} analizado${succeeded === 1 ? "" : "s"} correctamente.`,
        });
      }
      if (succeeded) {
        setReload((value) => value + 1);
        onRefresh?.();
      }
    }
    if (actionAbortRef.current === controller) actionAbortRef.current = null;
    setQueueBusy(false);
  }

  function analyseSelected() {
    const candidates = Array.from(queue.values())
      .filter((item) => item.status === "idle" || item.status === "error")
      .map((item) => item.document);
    if (!candidates.length) {
      setNotice({
        tone: "warning",
        text: "Selecciona al menos un documento pendiente de análisis. Los ya correctos no se reenvían automáticamente.",
      });
      return;
    }
    void analyseDocuments(candidates);
  }

  function analyseOne(document: PendingDocument) {
    if (busy || document.fuenteId || !canWrite) return;
    void analyseDocuments([document]);
  }

  async function discover() {
    if (busy || !canWrite) return;
    const controller = new AbortController();
    actionAbortRef.current = controller;
    setDiscovering(true);
    setNotice(null);
    try {
      const result = await requestJson<DiscoveryResponse>(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ action: "descubrir" }),
      });
      if (controller.signal.aborted) return;
      setNotice({
        tone: result.incompleto ? "warning" : "success",
        text: `Carpeta revisada: ${integer.format(result.detectados || 0)} detectados, ${integer.format(result.actualizados || 0)} actualizados y ${integer.format(result.omitidos || 0)} omitidos.${result.incompleto ? " La revisión está incompleta; vuelve a cargar antes de tomar decisiones." : ""}`,
      });
      setReload((value) => value + 1);
      onRefresh?.();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setNotice({
          tone: "warning",
          text:
            cause instanceof Error && cause.message
              ? cause.message
              : "No se ha podido revisar la carpeta Vola/2026.",
        });
      }
    } finally {
      if (actionAbortRef.current === controller) actionAbortRef.current = null;
      if (!controller.signal.aborted) setDiscovering(false);
    }
  }

  const summary = data?.resumen;
  const effectiveCanWrite = canWrite && (data ? data.canWrite : true);

  return (
    <section
      className="rounded-xl border border-blue-200 bg-white shadow-sm"
      aria-labelledby="pending-refactoring-heading"
      aria-busy={busy || loading}
    >
      <header className="flex flex-col gap-4 border-b border-blue-200 bg-blue-50 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-sm font-extrabold text-blue-950">
            Costes de operadora · originales de terceros
          </p>
          <h2
            id="pending-refactoring-heading"
            className="mt-1 text-xl font-extrabold text-slate-950"
          >
            Pendientes de recibir por refacturación
          </h2>
          <p className="mt-2 text-sm leading-5 text-slate-800">
            Son originales recibidos por otra empresa por servicios que usa
            Internet Operadores. No son todavía una factura recibida de IO:
            analizarlos aquí no registra IVA, pagos ni modifica el margen de una
            venta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void discover()}
          disabled={!effectiveCanWrite || busy}
          className={`${actionClass} self-start border-blue-700 bg-blue-800 text-white hover:bg-blue-900`}
        >
          <FolderOpenIcon className="h-4 w-4" />
          {discovering ? "Revisando Vola/2026…" : "Buscar en Vola/2026"}
        </button>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {!canWrite && (
          <p
            role="status"
            className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm font-bold text-slate-900"
          >
            Consulta disponible en modo lectura. No puedes descubrir ni analizar
            documentos.
          </p>
        )}
        {data && !data.canWrite && canWrite && (
          <p
            role="alert"
            className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-950"
          >
            El servidor ha denegado la escritura para este archivo. Los
            documentos se muestran solo para consulta.
          </p>
        )}

        <section aria-label="Resumen anual verificado del archivo">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-950">
                Resumen anual verificado
              </h3>
              <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-700">
                Los importes de estos documentos permanecen separados de las
                fuentes ya asignadas. El acumulado incluye solo documentos
                verificados aún sin asignar a centros. No incluye los documentos
                pendientes de revisión ni añade otra vez costes ya asignados. La
                base sin IVA se usa como referencia económica; el total
                documental no es una previsión de pago.
              </p>
            </div>
            {data && (
              <p className="text-xs font-semibold text-slate-700">
                {integer.format(data.total)} documentos encontrados
              </p>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Detectados"
              value={integer.format(summary?.detectados || 0)}
            />
            <Metric
              label="Analizados"
              value={integer.format(summary?.analizados || 0)}
              tone="blue"
            />
            <Metric
              label="Listos"
              value={integer.format(summary?.listos || 0)}
              tone="green"
            />
            <Metric
              label="Para revisión"
              value={integer.format(summary?.revision || 0)}
              tone="amber"
            />
            <Metric
              label="Ya en una fuente"
              value={integer.format(summary?.asignados || 0)}
            />
            <Metric
              label="Base pendiente"
              value={money(summary?.basePendiente)}
              tone="amber"
            />
            <Metric
              label="Total documental pendiente"
              value={money(summary?.totalPendiente)}
              tone="amber"
            />
          </div>
        </section>

        {notice && (
          <p
            role={notice.tone === "warning" ? "alert" : "status"}
            aria-live="polite"
            className={`rounded-lg border p-3 text-sm font-semibold ${notice.tone === "warning" ? "border-amber-400 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}
          >
            {notice.tone === "warning" ? (
              <ExclamationTriangleIcon className="mr-1 inline h-4 w-4" />
            ) : (
              <CheckCircleIcon className="mr-1 inline h-4 w-4" />
            )}
            {notice.text}
          </p>
        )}

        {failedItems.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
          >
            <strong>Errores pendientes de revisión</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {failedItems.map((item) => (
                <li key={item.document.id}>
                  <strong>{item.document.nombre}:</strong>{" "}
                  {item.error || "No se ha podido analizar."}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-semibold">
              Los correctos no se reintentan. Si procede, pulsa de nuevo
              analizar para reintentar únicamente los que siguen seleccionados.
            </p>
          </div>
        )}

        <section
          className="rounded-lg border border-slate-200"
          aria-labelledby="pending-search-heading"
        >
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <h3
                  id="pending-search-heading"
                  className="text-base font-extrabold text-slate-950"
                >
                  Localizar originales y revisar rentabilidad
                </h3>
                <p className="mt-1 text-sm text-slate-700">
                  Busca por proveedor, número de factura o artículo extraído. El
                  análisis no crea fuentes ni asigna artículos a un centro.
                </p>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
                <strong>{selectedCount}</strong> seleccionados ·{" "}
                <strong>{successfulCount}</strong> analizados en esta sesión
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-700" />
                <input
                  id="pending-refactoring-search"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  disabled={busy}
                  placeholder="Proveedor, número o artículo"
                  className={`${inputClass} pl-9`}
                  aria-label="Buscar por proveedor, número de factura o artículo"
                />
              </div>
              <select
                value={estado}
                disabled={busy}
                onChange={(event) => {
                  setEstado(event.target.value as "" | PendingStatus);
                  setPage(1);
                }}
                className={inputClass}
                aria-label="Filtrar por estado"
              >
                <option value="">Todos los estados</option>
                <option value="DETECTADO">Detectado</option>
                <option value="ANALIZANDO">Analizando</option>
                <option value="LISTO">Listo</option>
                <option value="REVISION">Revisión</option>
                <option value="CAMBIADO">Documento cambiado</option>
                <option value="ERROR">Error</option>
              </select>
              <button
                type="button"
                onClick={analyseSelected}
                disabled={!effectiveCanWrite || busy || waitingCount === 0}
                className={`${actionClass} border-blue-700 bg-blue-800 text-white hover:bg-blue-900`}
              >
                <DocumentMagnifyingGlassIcon className="h-4 w-4" />
                {queueBusy
                  ? "Analizando…"
                  : "Analizar documentos seleccionados"}
              </button>
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => setReload((value) => value + 1)}
                disabled={loading || busy}
                className={`${actionClass} border-red-400 bg-white text-red-950 hover:bg-red-100`}
              >
                <ArrowPathIcon className="h-4 w-4" /> Reintentar carga
              </button>
            </div>
          )}

          <div className="divide-y divide-slate-200">
            {loading && !data ? (
              <p className="px-4 py-7 text-center text-sm text-slate-700">
                Cargando documentos pendientes…
              </p>
            ) : documents.length ? (
              documents.map((document) => {
                const item = queue.get(document.id);
                const open = expanded.has(document.id);
                const assigned = Boolean(document.fuenteId);
                const isBusy =
                  busy ||
                  activeId === document.id ||
                  document.estado === "ANALIZANDO";
                const canUse =
                  effectiveCanWrite &&
                  document.estado === "LISTO" &&
                  !assigned &&
                  !busy;
                const size = formatBytes(document.size);
                return (
                  <article
                    key={document.id}
                    className={assigned ? "bg-slate-50" : "bg-white"}
                  >
                    <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
                      <label
                        className={`flex min-w-0 flex-1 items-start gap-3 ${assigned || busy ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400 text-blue-800 focus:ring-2 focus:ring-blue-700"
                          checked={Boolean(item)}
                          disabled={assigned || busy || !effectiveCanWrite}
                          onChange={(event) =>
                            toggleSelected(document, event.target.checked)
                          }
                          aria-label={`Seleccionar ${document.nombre} para analizar`}
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-extrabold text-slate-950">
                              {document.nombre}
                            </span>
                            <StatusBadge status={document.estado} />
                            <QueueBadge item={item} />
                          </span>
                          <span className="mt-1 block break-all text-sm text-slate-800">
                            {document.ruta}
                          </span>
                          <span className="mt-1 block text-xs text-slate-700">
                            {[document.mime, size]
                              .filter(Boolean)
                              .join(" · ") || "Tipo o tamaño no disponible"}
                            {document.resultado?.proveedor
                              ? ` · ${document.resultado.proveedor}`
                              : ""}
                            {document.resultado?.numFactura
                              ? ` · ${document.resultado.numFactura}`
                              : ""}
                          </span>
                          {document.incidencia && (
                            <span className="mt-2 block rounded-md border border-amber-400 bg-amber-50 p-2 text-xs font-bold text-amber-950">
                              <ExclamationTriangleIcon className="mr-1 inline h-4 w-4" />
                              {document.incidencia}
                            </span>
                          )}
                          {assigned && (
                            <span className="mt-2 block text-xs font-bold text-slate-800">
                              Ya incorporado a una fuente de coste. El vínculo
                              es inmutable y no se puede volver a analizar ni
                              asignar desde esta lista.
                            </span>
                          )}
                        </span>
                      </label>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                        <a
                          href={`${API}/${encodeURIComponent(document.id)}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className={`${actionClass} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
                        >
                          <DocumentArrowDownIcon className="h-4 w-4" /> PDF
                          protegido
                        </a>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(document.id)}
                          aria-expanded={open}
                          aria-controls={`pending-document-detail-${document.id}`}
                          className={`${actionClass} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
                        >
                          {open ? "Ocultar detalle" : "Ver detalle"}
                          {open ? (
                            <ChevronDownIcon className="h-4 w-4" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => analyseOne(document)}
                          disabled={!effectiveCanWrite || assigned || isBusy}
                          className={`${actionClass} border-blue-300 bg-white text-blue-950 hover:bg-blue-50`}
                        >
                          <DocumentMagnifyingGlassIcon className="h-4 w-4" />
                          {activeId === document.id
                            ? "Analizando…"
                            : "Analizar"}
                        </button>
                        {document.estado === "LISTO" && !assigned && (
                          <button
                            type="button"
                            onClick={() => onUseDocument(document)}
                            disabled={!canUse}
                            className={`${actionClass} border-emerald-700 bg-emerald-800 text-white hover:bg-emerald-900`}
                          >
                            <PlusIcon className="h-4 w-4" /> Asignar a un centro
                          </button>
                        )}
                      </div>
                    </div>
                    {open && (
                      <div id={`pending-document-detail-${document.id}`}>
                        <DocumentDetails document={document} />
                      </div>
                    )}
                  </article>
                );
              })
            ) : loading ? (
              <p className="px-4 py-7 text-center text-sm text-slate-700">
                Actualizando documentos…
              </p>
            ) : (
              <div className="px-4 py-8 text-center">
                <InformationCircleIcon className="mx-auto h-6 w-6 text-slate-600" />
                <p className="mt-2 text-sm font-bold text-slate-950">
                  No hay documentos que coincidan con la búsqueda.
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Revisa el filtro o busca en la carpeta Vola/2026.
                </p>
              </div>
            )}
          </div>
          <Pager
            page={page}
            total={data?.total || 0}
            totalPages={data?.totalPages || 1}
            disabled={loading || busy}
            onPage={setPage}
          />
        </section>

        <aside
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"
          aria-label="Límites de este proceso"
        >
          <InformationCircleIcon className="mr-1 inline h-4 w-4" />
          <strong>Antes de asignar:</strong> comprueba destinatario, importes y
          artículos. «Asignar a un centro» abre el editor con el documento
          listo; no guarda una fuente, no reparte costes y no cambia ningún
          asiento hasta que una persona lo confirme.
        </aside>
      </div>
    </section>
  );
}
