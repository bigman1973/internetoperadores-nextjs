"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const API = "/api/admin/finanzas/costes-operadora";
const PAGE_SIZE = 25;
const BASE_TOLERANCE = 0.02;

export type OperatorCostGroup = {
  id: string;
  nombre: string;
  ambito: string;
  zona?: string | null;
  conexion?: string | null;
};

export type OperatorCostBatchLine = {
  index: number;
  descripcion: string;
  importe: number | null;
};

export type OperatorCostBatchInvoice = {
  id: string;
  proveedor: string;
  numFactura: string | null;
  fecha: string;
  base: number;
  lineas: OperatorCostBatchLine[];
  detalleInvalido?: boolean;
  version: string;
  reservada: boolean;
  asignadaAVentas?: boolean;
};

type InvoiceResponse = {
  facturas: OperatorCostBatchInvoice[];
  total: number;
  totalPages: number;
};

type SelectionStatus = "idle" | "pending" | "success" | "error";

type InvoiceSelection = {
  invoice: OperatorCostBatchInvoice;
  /** Stable idempotency key. A retry deliberately sends this very same id. */
  requestId: string;
  assignments: Record<number, string>;
  status: SelectionStatus;
  errorMessage?: string;
};

type BatchNotice = {
  saved: number;
  failed: number;
  attempted: number;
};

export type OperatorCostBatchProps = {
  grupos: OperatorCostGroup[];
  initialGroupId?: string;
  onSaved: () => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
};

const euros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 shadow-sm placeholder:text-slate-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";
const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function money(value: number) {
  return euros.format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value || "—"
    : new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function makeRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `coste-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function isFiniteAmount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sameAmount(left: number, right: number) {
  return Math.abs(left - right) <= BASE_TOLERANCE + Number.EPSILON;
}

function groupLabel(group: OperatorCostGroup) {
  if (group.ambito === "GLOBAL_RED_PROPIA") return `${group.nombre} · Global`;
  const detail = [group.zona, group.conexion].filter(Boolean).join(" / ");
  return detail ? `${group.nombre} · ${detail}` : group.nombre;
}

function isInvoiceSelectable(invoice: OperatorCostBatchInvoice) {
  if (invoice.reservada || invoice.asignadaAVentas) return false;
  if (!isFiniteAmount(invoice.base)) return false;
  if (invoice.lineas.length === 0) return !invoice.detalleInvalido;
  return invoice.lineas.some((line) => isFiniteAmount(line.importe));
}

export function createOperatorCostBatchSelection(
  invoice: OperatorCostBatchInvoice,
  requestId = makeRequestId(),
) {
  return {
    invoice,
    requestId,
    assignments: {} as Record<number, string>,
    status: "idle" as SelectionStatus,
  };
}

export function isOperatorCostBatchSelectionFrozen(selection?: {
  status: SelectionStatus;
}) {
  return Boolean(selection && selection.status !== "idle");
}

function assignmentAmount(selection: InvoiceSelection, index: number) {
  if (index === -1) return selection.invoice.base;
  return selection.invoice.lineas.find((line) => line.index === index)?.importe;
}

function assignedTotal(selection: InvoiceSelection) {
  return Object.keys(selection.assignments).reduce((total, key) => {
    const amount = assignmentAmount(selection, Number(key));
    return isFiniteAmount(amount) ? total + amount : total;
  }, 0);
}

export type OperatorCostBatchValidation = {
  valid: boolean;
  code:
    | "ok"
    | "sin_asignaciones"
    | "base_invalida"
    | "importe_invalido"
    | "grupo_invalido"
    | "indice_invalido"
    | "importe_fuera_de_rango";
  total: number;
};

/**
 * Mirrors the API's partial-draft bounds. A positive invoice may use any
 * positive slice up to base + 0.02; a credit invoice may use any negative
 * slice from base - 0.02 to zero. It never changes supplied amounts.
 */
export function validateOperatorCostBatchSelection(
  invoice: OperatorCostBatchInvoice,
  assignments: Record<number, string>,
  validGroupIds: Iterable<string>,
): OperatorCostBatchValidation {
  const groupIds = new Set(validGroupIds);
  const entries = Object.entries(assignments).map(([index, grupoId]) => ({
    indice: Number(index),
    grupoId,
  }));
  if (!entries.length)
    return { valid: false, code: "sin_asignaciones", total: 0 };
  if (!isFiniteAmount(invoice.base))
    return { valid: false, code: "base_invalida", total: 0 };

  let total = 0;
  for (const assignment of entries) {
    if (!assignment.grupoId || !groupIds.has(assignment.grupoId)) {
      return { valid: false, code: "grupo_invalido", total };
    }
    const wholeInvoice = assignment.indice === -1;
    if (
      (wholeInvoice &&
        (invoice.lineas.length > 0 || invoice.detalleInvalido)) ||
      (!wholeInvoice &&
        !invoice.lineas.some((line) => line.index === assignment.indice))
    ) {
      return { valid: false, code: "indice_invalido", total };
    }
    const amount = wholeInvoice
      ? invoice.base
      : invoice.lineas.find((line) => line.index === assignment.indice)
          ?.importe;
    if (!isFiniteAmount(amount))
      return { valid: false, code: "importe_invalido", total };
    total += amount;
  }

  const totalCents = entries.reduce((sum, entry) => {
    const amount =
      entry.indice === -1
        ? invoice.base
        : invoice.lineas.find((line) => line.index === entry.indice)!.importe!;
    return sum + Math.round(amount * 100);
  }, 0);
  const baseCents = Math.round(invoice.base * 100);
  const outOfRange =
    invoice.base >= 0
      ? totalCents < 0 || totalCents > baseCents + 2
      : totalCents < baseCents - 2 || totalCents > 0;
  return {
    valid: !outOfRange,
    code: outOfRange ? "importe_fuera_de_rango" : "ok",
    total,
  };
}

function assignmentsForPayload(selection: InvoiceSelection) {
  return Object.entries(selection.assignments)
    .map(([index, grupoId]) => ({ indice: Number(index), grupoId }))
    .sort((left, right) => left.indice - right.indice);
}

function cloneWithStatus(
  selections: Map<string, InvoiceSelection>,
  invoiceId: string,
  status: SelectionStatus,
  errorMessage?: string,
) {
  const current = selections.get(invoiceId);
  if (!current) return selections;
  const next = new Map(selections);
  next.set(invoiceId, {
    ...current,
    status,
    errorMessage: status === "error" ? errorMessage : undefined,
  });
  return next;
}

function StatusBadge({ status }: { status: SelectionStatus }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-950">
        <CheckCircleIcon className="h-3.5 w-3.5" /> Guardada
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-extrabold text-blue-950">
        Guardando…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="rounded-full border border-red-300 bg-red-50 px-2 py-1 text-xs font-extrabold text-red-950">
        Error: reintento pendiente
      </span>
    );
  }
  return (
    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-extrabold text-slate-800">
      Pendiente de guardar
    </span>
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
      aria-label="Paginación de facturas recibidas"
      className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-slate-700">
        Mostrando {first}–{Math.min(page * PAGE_SIZE, total)} de{" "}
        {total.toLocaleString("es-ES")}
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
        <span className="text-xs font-extrabold text-slate-900">
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

/**
 * Independent batch workspace for creating draft operator costs from existing,
 * received invoices. It intentionally has no period control: the API derives
 * the month from every source document when it persists each draft.
 */
export default function OperatorCostBatch({
  grupos,
  initialGroupId,
  onSaved,
  onClose,
  onBusyChange,
}: OperatorCostBatchProps) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [groupId, setGroupId] = useState(() =>
    initialGroupId && grupos.some((group) => group.id === initialGroupId)
      ? initialGroupId
      : "",
  );
  const [selections, setSelections] = useState<Map<string, InvoiceSelection>>(
    () => new Map(),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [saveBusy, setSaveBusy] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [notice, setNotice] = useState<BatchNotice | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestNumberRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    if (groupId && !grupos.some((group) => group.id === groupId)) {
      setGroupId("");
    }
  }, [groupId, grupos]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const currentRequest = ++requestNumberRef.current;
    abortRef.current = controller;
    const params = new URLSearchParams({
      action: "facturas",
      buscar: search,
      page: String(page),
    });

    setLoading(true);
    setLoadError("");
    fetch(`${API}?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("request failed");
        return (await response.json()) as InvoiceResponse;
      })
      .then((data) => {
        if (
          !controller.signal.aborted &&
          currentRequest === requestNumberRef.current
        ) {
          setResult({
            facturas: Array.isArray(data.facturas) ? data.facturas : [],
            total: Number.isFinite(data.total) ? data.total : 0,
            totalPages: Math.max(1, Number(data.totalPages) || 1),
          });
        }
      })
      .catch(() => {
        if (
          !controller.signal.aborted &&
          currentRequest === requestNumberRef.current
        ) {
          setResult(null);
          setLoadError(
            "No se han podido cargar las facturas. Inténtalo de nuevo.",
          );
        }
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          currentRequest === requestNumberRef.current
        ) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [search, page, reload]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectionValues = useMemo(
    () => Array.from(selections.values()),
    [selections],
  );
  const selectedCount = selectionValues.length;
  const savedCount = selectionValues.filter(
    (item) => item.status === "success",
  ).length;
  const failedCount = selectionValues.filter(
    (item) => item.status === "error",
  ).length;
  const idleCount = selectionValues.filter(
    (item) => item.status === "idle",
  ).length;
  const pendingCount = selectionValues.filter(
    (item) => item.status === "pending",
  ).length;
  const currentRows = result?.facturas || [];
  const displayedEligible = currentRows.filter(isInvoiceSelectable);
  const allDisplayedEligibleSelected =
    displayedEligible.length > 0 &&
    displayedEligible.every((item) => selections.has(item.id));

  function setExpandedState(invoiceId: string, open?: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open === false || (open === undefined && next.has(invoiceId)))
        next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function selectInvoice(invoice: OperatorCostBatchInvoice) {
    if (saveBusy || !isInvoiceSelectable(invoice)) return;
    setSelections((current) => {
      if (current.has(invoice.id)) return current;
      const next = new Map(current);
      next.set(invoice.id, createOperatorCostBatchSelection(invoice));
      return next;
    });
    setExpandedState(invoice.id, true);
    setValidationError("");
    setNotice(null);
  }

  function deselectInvoice(invoiceId: string) {
    if (saveBusy) return;
    setSelections((current) => {
      const existing = current.get(invoiceId);
      if (!existing || existing.status !== "idle") return current;
      const next = new Map(current);
      next.delete(invoiceId);
      return next;
    });
    setExpandedState(invoiceId, false);
    setValidationError("");
    setNotice(null);
  }

  function toggleInvoice(invoice: OperatorCostBatchInvoice, checked: boolean) {
    if (checked) selectInvoice(invoice);
    else deselectInvoice(invoice.id);
  }

  function selectDisplayedInvoices() {
    if (saveBusy) return;
    setSelections((current) => {
      const next = new Map(current);
      displayedEligible.forEach((invoice) => {
        if (!next.has(invoice.id)) {
          next.set(invoice.id, createOperatorCostBatchSelection(invoice));
        }
      });
      return next;
    });
    setExpanded((current) => {
      const next = new Set(current);
      displayedEligible.forEach((invoice) => next.add(invoice.id));
      return next;
    });
    setValidationError("");
    setNotice(null);
  }

  function deselectDisplayedInvoices() {
    if (saveBusy) return;
    const displayedIds = new Set(currentRows.map((invoice) => invoice.id));
    setSelections((current) => {
      const next = new Map(current);
      displayedIds.forEach((invoiceId) => {
        const selection = next.get(invoiceId);
        if (selection?.status === "idle") {
          next.delete(invoiceId);
        }
      });
      return next;
    });
    setExpanded((current) => {
      const next = new Set(current);
      displayedIds.forEach((invoiceId) => next.delete(invoiceId));
      return next;
    });
    setValidationError("");
    setNotice(null);
  }

  function updateSelectedCentre(nextGroupId: string) {
    if (saveBusy) return;
    setGroupId(nextGroupId);
    setSelections((current) => {
      const next = new Map(current);
      current.forEach((selection, invoiceId) => {
        if (selection.status !== "idle") return;
        const updatedAssignments = Object.fromEntries(
          Object.keys(selection.assignments).map((index) => [
            index,
            nextGroupId,
          ]),
        ) as Record<number, string>;
        next.set(invoiceId, {
          ...selection,
          assignments: updatedAssignments,
        });
      });
      return next;
    });
    setValidationError("");
    setNotice(null);
  }

  function setLineIncluded(
    invoiceId: string,
    index: number,
    included: boolean,
  ) {
    if (saveBusy) return;
    setSelections((current) => {
      const selection = current.get(invoiceId);
      if (!selection || selection.status !== "idle") {
        return current;
      }
      const next = new Map(current);
      const assignments = { ...selection.assignments };
      if (included) assignments[index] = groupId;
      else delete assignments[index];
      next.set(invoiceId, { ...selection, assignments });
      return next;
    });
    setValidationError("");
    setNotice(null);
  }

  function includeAllVerifiable(invoiceId: string) {
    if (saveBusy) return;
    setSelections((current) => {
      const selection = current.get(invoiceId);
      if (!selection || selection.status !== "idle") {
        return current;
      }
      const next = new Map(current);
      const assignments = { ...selection.assignments };
      // The whole-invoice fallback (-1) is intentionally never inferred here.
      selection.invoice.lineas.forEach((line) => {
        if (isFiniteAmount(line.importe)) assignments[line.index] = groupId;
      });
      next.set(invoiceId, { ...selection, assignments });
      return next;
    });
    setValidationError("");
    setNotice(null);
  }

  function includeAllSelectedVerifiable() {
    if (saveBusy) return;
    setSelections((current) => {
      const next = new Map(current);
      current.forEach((selection, invoiceId) => {
        if (selection.status !== "idle") return;
        const assignments = { ...selection.assignments };
        // Only real, finite article lines are included. No amount is invented to fit the base.
        selection.invoice.lineas.forEach((line) => {
          if (isFiniteAmount(line.importe)) assignments[line.index] = groupId;
        });
        next.set(invoiceId, { ...selection, assignments });
      });
      return next;
    });
    setValidationError("");
    setNotice(null);
  }

  function validationMessage(selection: InvoiceSelection) {
    const invoiceName = `${selection.invoice.proveedor} · ${selection.invoice.numFactura || "sin número"}`;
    const checked = validateOperatorCostBatchSelection(
      selection.invoice,
      selection.assignments,
      grupos.map((group) => group.id),
    );
    if (checked.code === "sin_asignaciones") {
      return `${invoiceName}: incluye al menos un artículo verificable y asígnalo al centro de coste.`;
    }
    if (checked.code === "base_invalida") {
      return `${invoiceName}: la base de la factura no es verificable.`;
    }
    if (checked.code === "importe_invalido") {
      return `${invoiceName}: contiene un artículo sin importe verificable.`;
    }
    if (checked.code === "grupo_invalido") {
      return `${invoiceName}: el centro de coste seleccionado ya no está disponible.`;
    }
    if (checked.code === "indice_invalido") {
      return `${invoiceName}: la selección de artículos ya no es válida.`;
    }
    if (checked.code === "importe_fuera_de_rango") {
      const bound =
        selection.invoice.base >= 0
          ? `entre 0,00 € y ${money(selection.invoice.base + BASE_TOLERANCE)}`
          : `entre ${money(selection.invoice.base - BASE_TOLERANCE)} y 0,00 €`;
      return `${invoiceName}: los artículos incluidos suman ${money(checked.total)}; para esta factura el importe asignado debe estar ${bound}. No se ajustará ningún importe automáticamente.`;
    }
    return "";
  }

  async function saveSelections(status: "idle" | "error") {
    if (saveBusy) return;
    const candidates = selectionValues.filter(
      (selection) => selection.status === status,
    );
    if (!candidates.length) return;

    const invalid = candidates.map(validationMessage).find(Boolean);
    if (invalid) {
      setValidationError(invalid);
      return;
    }

    setSaveBusy(true);
    onBusyChange?.(true);
    setValidationError("");
    setNotice(null);
    let saved = 0;
    let failed = 0;

    for (const selection of candidates) {
      let safeError = "No se ha podido guardar esta factura.";
      setSelections((current) =>
        cloneWithStatus(current, selection.invoice.id, "pending"),
      );
      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            action: "guardar",
            id: selection.requestId,
            origen: "PROPIA",
            facturaId: selection.invoice.id,
            facturaVersion: selection.invoice.version,
            asignaciones: assignmentsForPayload(selection),
            estado: "BORRADOR",
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          safeError =
            typeof body?.error === "string" && body.error.trim()
              ? body.error
              : safeError;
          throw new Error(safeError);
        }
        saved += 1;
        setSelections((current) =>
          cloneWithStatus(current, selection.invoice.id, "success"),
        );
      } catch {
        failed += 1;
        setSelections((current) =>
          cloneWithStatus(current, selection.invoice.id, "error", safeError),
        );
      }
    }

    setSaveBusy(false);
    onBusyChange?.(false);
    setNotice({ saved, failed, attempted: candidates.length });
    // Refresh surrounding data only when at least one draft was actually persisted.
    if (saved > 0) onSaved();
  }

  const bulkVerifiableCount = selectionValues.filter(
    (selection) =>
      selection.status !== "success" &&
      selection.status !== "pending" &&
      selection.invoice.lineas.some((line) => isFiniteAmount(line.importe)),
  ).length;

  return (
    <section
      className="rounded-xl border border-blue-200 bg-white shadow-sm"
      aria-labelledby="operator-cost-batch-heading"
      aria-busy={saveBusy}
    >
      <header className="flex flex-col gap-3 border-b border-blue-200 bg-blue-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <p className="text-sm font-extrabold text-blue-900">
            Costes de operadora
          </p>
          <h2
            id="operator-cost-batch-heading"
            className="mt-1 text-xl font-extrabold text-slate-950"
          >
            Asignar varias facturas recibidas
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-800">
            Selecciona facturas de cualquier mes y sus artículos para el mismo
            centro de coste. El mes se tomará del documento al guardar, para el
            análisis posterior. No se realiza ningún reparto entre clientes.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saveBusy}
          className={`${actionClass} self-start border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
        >
          <XMarkIcon className="h-4 w-4" /> Cerrar
        </button>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <label
            htmlFor="operator-batch-centre"
            className="block text-sm font-extrabold text-slate-950"
          >
            Centro de coste para las asignaciones pendientes
          </label>
          <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <select
                id="operator-batch-centre"
                value={groupId}
                disabled={saveBusy}
                onChange={(event) => updateSelectedCentre(event.target.value)}
                className={inputClass}
                aria-describedby="operator-batch-centre-help"
              >
                <option value="">Selecciona un centro de coste</option>
                {grupos.map((group) => (
                  <option key={group.id} value={group.id}>
                    {groupLabel(group)}
                  </option>
                ))}
              </select>
              <p
                id="operator-batch-centre-help"
                className="mt-1.5 text-xs leading-5 text-slate-700"
              >
                Cambiar el centro actualiza solo las asignaciones aún
                pendientes; las facturas ya guardadas quedan inmutables.
              </p>
            </div>
            <div className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900">
              <strong>{selectedCount}</strong> facturas seleccionadas ·{" "}
              <strong>{savedCount}</strong> guardadas
            </div>
          </div>
          {!grupos.length && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950"
            >
              No hay centros de coste disponibles. No se puede guardar ninguna
              asignación hasta que exista uno.
            </p>
          )}
        </div>

        {validationError && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
          >
            {validationError}
          </p>
        )}
        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
          >
            <span>{loadError}</span>
            <button
              type="button"
              disabled={saveBusy || loading}
              onClick={() => setReload((value) => value + 1)}
              className="rounded border border-red-400 bg-white px-2.5 py-1.5 text-xs font-extrabold text-red-950 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-700 disabled:opacity-50"
            >
              Reintentar carga
            </button>
          </div>
        )}
        {notice && (
          <div
            role={notice.failed ? "alert" : "status"}
            aria-live="polite"
            className={`rounded-lg border p-3 text-sm ${notice.failed ? "border-amber-400 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}
          >
            <strong>Resultado del último guardado:</strong> {notice.saved} de{" "}
            {notice.attempted} facturas guardadas como borrador.
            {notice.failed > 0
              ? ` ${notice.failed} no se han podido guardar. Puedes reintentar únicamente las fallidas; las correctas no se reenviarán.`
              : " Todas las facturas de este envío se han guardado correctamente."}
          </div>
        )}
        {failedCount > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
          >
            <strong>Facturas pendientes de reintento</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {selectionValues
                .filter((selection) => selection.status === "error")
                .map((selection) => (
                  <li key={selection.invoice.id}>
                    <strong>
                      {selection.invoice.proveedor} ·{" "}
                      {selection.invoice.numFactura || "sin número"}:
                    </strong>{" "}
                    {selection.errorMessage ||
                      "No se ha podido guardar esta factura."}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <section
          aria-labelledby="operator-batch-search-heading"
          className="rounded-lg border border-slate-200"
        >
          <div className="border-b border-slate-200 px-4 py-4">
            <h3
              id="operator-batch-search-heading"
              className="text-base font-extrabold text-slate-950"
            >
              Facturas recibidas · todo el histórico
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              La búsqueda no se limita por período. Las facturas reservadas o ya
              asignadas a ventas se muestran para consulta, pero no se pueden
              incluir en este lote.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-700" />
                <input
                  id="operator-batch-search"
                  value={searchDraft}
                  disabled={saveBusy}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Buscar por proveedor o número de factura"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <button
                type="button"
                disabled={
                  saveBusy ||
                  loading ||
                  displayedEligible.length === 0 ||
                  allDisplayedEligibleSelected
                }
                onClick={selectDisplayedInvoices}
                className={`${actionClass} border-blue-300 bg-white text-blue-950 hover:bg-blue-50`}
              >
                Seleccionar facturas elegibles de esta página
              </button>
              <button
                type="button"
                disabled={
                  saveBusy ||
                  loading ||
                  !currentRows.some((invoice) => {
                    const selection = selections.get(invoice.id);
                    return selection && selection.status !== "success";
                  })
                }
                onClick={deselectDisplayedInvoices}
                className={`${actionClass} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
              >
                Quitar selección de esta página
              </button>
            </div>
            {result && !loading && (
              <p className="mt-2 text-xs font-semibold text-slate-700">
                {result.total.toLocaleString("es-ES")} facturas encontradas. La
                selección se conserva al buscar o cambiar de página.
              </p>
            )}
          </div>

          <div className="divide-y divide-slate-200">
            {loading && !result ? (
              <p className="px-4 py-6 text-center text-sm text-slate-700">
                Cargando facturas…
              </p>
            ) : currentRows.length ? (
              currentRows.map((invoice) => {
                const selection = selections.get(invoice.id);
                const isSelected = Boolean(selection);
                const immutable = isOperatorCostBatchSelectionFrozen(selection);
                const open = expanded.has(invoice.id);
                const selectable = isInvoiceSelectable(invoice);
                const selectedTotal = selection ? assignedTotal(selection) : 0;
                const hasMismatch =
                  selection &&
                  Object.keys(selection.assignments).length > 0 &&
                  isFiniteAmount(invoice.base) &&
                  !sameAmount(selectedTotal, invoice.base);
                const noDetailFallback =
                  invoice.lineas.length === 0 && !invoice.detalleInvalido;

                return (
                  <article
                    key={invoice.id}
                    className={
                      isSelected
                        ? "bg-blue-50/60"
                        : invoice.reservada || invoice.asignadaAVentas
                          ? "bg-slate-50"
                          : "bg-white"
                    }
                  >
                    <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400 text-blue-800 focus:ring-2 focus:ring-blue-700"
                          checked={isSelected}
                          disabled={saveBusy || immutable || !selectable}
                          onChange={(event) =>
                            toggleInvoice(invoice, event.target.checked)
                          }
                          aria-label={`Seleccionar factura ${invoice.numFactura || invoice.proveedor}`}
                        />
                        <span className="min-w-0">
                          <span className="block font-extrabold text-slate-950">
                            {invoice.numFactura || "Factura sin número"}
                          </span>
                          <span className="mt-0.5 block text-sm text-slate-800">
                            {invoice.proveedor}
                          </span>
                          <span className="mt-1 block text-xs text-slate-700">
                            Fecha del documento: {formatDate(invoice.fecha)} ·
                            Base:{" "}
                            {isFiniteAmount(invoice.base)
                              ? money(invoice.base)
                              : "No verificable"}
                          </span>
                          {invoice.reservada && (
                            <span className="mt-1 block text-xs font-bold text-amber-950">
                              Factura reservada: no está disponible para este
                              lote.
                            </span>
                          )}
                          {invoice.asignadaAVentas && (
                            <span className="mt-1 block text-xs font-bold text-amber-950">
                              Factura ya asignada a ventas: no está disponible
                              para este lote.
                            </span>
                          )}
                          {!selectable &&
                            !invoice.reservada &&
                            !invoice.asignadaAVentas && (
                              <span className="mt-1 block text-xs font-bold text-amber-950">
                                No hay un detalle verificable que pueda
                                asignarse.
                              </span>
                            )}
                        </span>
                      </label>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {selection && <StatusBadge status={selection.status} />}
                        {isSelected && (
                          <button
                            type="button"
                            disabled={saveBusy}
                            onClick={() => setExpandedState(invoice.id)}
                            aria-expanded={open}
                            aria-controls={`operator-batch-details-${invoice.id}`}
                            className={`${actionClass} border-blue-300 bg-white text-blue-950 hover:bg-blue-50`}
                          >
                            {open ? "Ocultar artículos" : "Ver artículos"}
                            <ChevronDownIcon
                              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}
                      </div>
                    </div>

                    {isSelected && open && selection && (
                      <div
                        id={`operator-batch-details-${invoice.id}`}
                        className="border-t border-blue-200 bg-white px-4 py-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="font-extrabold text-slate-950">
                              Artículos de la factura
                            </h4>
                            <p className="mt-1 text-sm text-slate-700">
                              Ningún artículo se incluye por el proveedor ni por
                              seleccionar la factura. Marca cada uno de forma
                              explícita.
                            </p>
                          </div>
                          {invoice.lineas.length > 0 && !immutable && (
                            <button
                              type="button"
                              disabled={saveBusy}
                              onClick={() => includeAllVerifiable(invoice.id)}
                              className={`${actionClass} border-blue-300 bg-white text-blue-950 hover:bg-blue-50`}
                            >
                              Incluir todos los artículos verificables
                            </button>
                          )}
                        </div>

                        {invoice.detalleInvalido && (
                          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
                            <ExclamationTriangleIcon className="mr-1 inline h-4 w-4" />
                            El detalle contiene información no verificable. Solo
                            los artículos con importe válido pueden marcarse y
                            nunca se sustituirá por la factura completa.
                          </p>
                        )}

                        {invoice.lineas.length > 0 ? (
                          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                            {invoice.lineas.map((line) => {
                              const valid = isFiniteAmount(line.importe);
                              const included =
                                Object.prototype.hasOwnProperty.call(
                                  selection.assignments,
                                  line.index,
                                );
                              return (
                                <li
                                  key={line.index}
                                  className={
                                    included
                                      ? "bg-blue-50"
                                      : !valid
                                        ? "bg-amber-50"
                                        : ""
                                  }
                                >
                                  <label className="flex cursor-pointer items-start gap-3 px-3 py-3">
                                    <input
                                      type="checkbox"
                                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400 text-blue-800 focus:ring-2 focus:ring-blue-700"
                                      checked={included}
                                      disabled={saveBusy || immutable || !valid}
                                      onChange={(event) =>
                                        setLineIncluded(
                                          invoice.id,
                                          line.index,
                                          event.target.checked,
                                        )
                                      }
                                      aria-label={`Incluir ${line.descripcion || `artículo ${line.index + 1}`}`}
                                    />
                                    <span className="min-w-0 flex-1 text-sm">
                                      <span className="block font-bold text-slate-950">
                                        {line.descripcion ||
                                          `Artículo ${line.index + 1}`}
                                      </span>
                                      {!valid && (
                                        <span className="mt-1 block text-xs font-bold text-amber-950">
                                          Importe no verificable: no se puede
                                          incluir.
                                        </span>
                                      )}
                                      {included &&
                                        !selection.assignments[line.index] && (
                                          <span className="mt-1 block text-xs font-bold text-red-950">
                                            Selecciona un centro de coste antes
                                            de guardar.
                                          </span>
                                        )}
                                    </span>
                                    <span className="whitespace-nowrap text-sm font-extrabold tabular-nums text-slate-950">
                                      {valid
                                        ? money(line.importe)
                                        : "No válido"}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        ) : noDetailFallback ? (
                          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400 text-blue-800 focus:ring-2 focus:ring-blue-700"
                              checked={Object.prototype.hasOwnProperty.call(
                                selection.assignments,
                                -1,
                              )}
                              disabled={saveBusy || immutable}
                              onChange={(event) =>
                                setLineIncluded(
                                  invoice.id,
                                  -1,
                                  event.target.checked,
                                )
                              }
                              aria-label="Incluir factura completa sin detalle"
                            />
                            <span className="min-w-0 flex-1 text-sm">
                              <span className="block font-extrabold text-slate-950">
                                Factura completa sin detalle estructurado
                              </span>
                              <span className="mt-1 block text-slate-700">
                                Esta es una elección explícita. Solo está
                                disponible porque la factura no contiene detalle
                                y no está marcado como inválido.
                              </span>
                              {Object.prototype.hasOwnProperty.call(
                                selection.assignments,
                                -1,
                              ) &&
                                !selection.assignments[-1] && (
                                  <span className="mt-1 block text-xs font-bold text-red-950">
                                    Selecciona un centro de coste antes de
                                    guardar.
                                  </span>
                                )}
                            </span>
                            <span className="whitespace-nowrap text-sm font-extrabold tabular-nums text-slate-950">
                              {money(invoice.base)}
                            </span>
                          </label>
                        ) : (
                          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
                            No hay detalle verificable. La factura completa no
                            se ofrece como alternativa.
                          </p>
                        )}

                        <div
                          className={`mt-3 rounded-md border p-3 text-sm ${hasMismatch ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-300 bg-slate-50 text-slate-900"}`}
                        >
                          <strong>Artículos incluidos:</strong>{" "}
                          {Object.keys(selection.assignments).length} ·{" "}
                          <strong>Total:</strong> {money(selectedTotal)} ·{" "}
                          <strong>Base:</strong>{" "}
                          {isFiniteAmount(invoice.base)
                            ? money(invoice.base)
                            : "No verificable"}
                          {hasMismatch && (
                            <span className="mt-1 block font-bold">
                              Selección parcial: el resto de la factura no se
                              asignará a este centro. No se modifica ni se
                              completa ningún importe automáticamente.
                            </span>
                          )}
                          {immutable && (
                            <span
                              className={`mt-1 block font-bold ${selection.status === "success" ? "text-emerald-950" : "text-amber-950"}`}
                            >
                              {selection.status === "success"
                                ? "Borrador guardado: esta selección permanece solo como trazabilidad y no se puede editar."
                                : "Reintento protegido: se conservarán los mismos artículos, centro de coste e identificador de solicitud."}
                            </span>
                          )}
                          {selection.status === "error" &&
                            selection.errorMessage && (
                              <span className="mt-1 block font-bold text-red-950">
                                Error del guardado: {selection.errorMessage}
                              </span>
                            )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            ) : !loading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-700">
                No hay facturas para esta búsqueda.
              </p>
            ) : null}
          </div>
          <Pager
            page={page}
            total={result?.total || 0}
            totalPages={result?.totalPages || 1}
            disabled={saveBusy || loading}
            onPage={setPage}
          />
        </section>

        <section
          aria-labelledby="operator-batch-save-heading"
          className="rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3
                id="operator-batch-save-heading"
                className="text-base font-extrabold text-slate-950"
              >
                Revisar y guardar borradores
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-700">
                Cada factura se guarda de forma secuencial y exclusivamente como{" "}
                <strong>borrador</strong>. Antes de enviar se comprueba que la
                suma firmada está dentro del rango admitido respecto de la base,
                también para abonos negativos. No se marcará ninguna fuente como
                revisada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {bulkVerifiableCount > 0 && (
                <div className="max-w-md">
                  <button
                    type="button"
                    disabled={saveBusy || !groupId}
                    onClick={includeAllSelectedVerifiable}
                    className={`${actionClass} border-blue-300 bg-white text-blue-950 hover:bg-blue-50`}
                  >
                    Incluir todos los artículos verificables de las facturas
                    seleccionadas
                  </button>
                  <p className="mt-1 text-xs font-semibold leading-4 text-amber-950">
                    Comprueba que cada suma respeta el rango de su base: no se
                    corregirá ningún importe automáticamente.
                  </p>
                </div>
              )}
              {failedCount > 0 && (
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => saveSelections("error")}
                  className={`${actionClass} border-amber-500 bg-white text-amber-950 hover:bg-amber-100`}
                >
                  <ArrowPathIcon className="h-4 w-4" /> Reintentar solo las
                  fallidas ({failedCount})
                </button>
              )}
              {idleCount > 0 && (
                <button
                  type="button"
                  disabled={saveBusy || !groupId || !grupos.length}
                  onClick={() => saveSelections("idle")}
                  className={`${actionClass} border-blue-800 bg-blue-800 text-white hover:bg-blue-900`}
                >
                  {saveBusy
                    ? "Guardando…"
                    : `Guardar ${idleCount} borrador${idleCount === 1 ? "" : "es"}`}
                </button>
              )}
              {!idleCount && !failedCount && savedCount > 0 && (
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={onClose}
                  className={`${actionClass} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>

          <dl className="mt-4 grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-slate-300 bg-white p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Pendientes
              </dt>
              <dd className="mt-1 text-lg font-extrabold tabular-nums text-slate-950">
                {idleCount}
              </dd>
            </div>
            <div className="rounded-md border border-blue-300 bg-white p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                En curso
              </dt>
              <dd className="mt-1 text-lg font-extrabold tabular-nums text-blue-950">
                {pendingCount}
              </dd>
            </div>
            <div className="rounded-md border border-emerald-300 bg-white p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Guardadas
              </dt>
              <dd className="mt-1 text-lg font-extrabold tabular-nums text-emerald-950">
                {savedCount}
              </dd>
            </div>
            <div className="rounded-md border border-red-300 bg-white p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Fallidas
              </dt>
              <dd className="mt-1 text-lg font-extrabold tabular-nums text-red-950">
                {failedCount}
              </dd>
            </div>
          </dl>
          {failedCount > 0 && (
            <p className="mt-3 text-sm font-bold text-amber-950">
              Las facturas ya guardadas no volverán a enviarse. El reintento
              conserva el mismo identificador de solicitud para cada factura
              fallida.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
