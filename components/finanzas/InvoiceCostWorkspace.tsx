"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type {
  ProfitCandidates,
  ProfitDetail,
  ProfitPurchaseLink,
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

const euros = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("es-ES");

function money(value: number | null | undefined) { return euros.format(Number(value ?? 0)); }
function date(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "No se han podido cargar los datos."; }
async function getProfit<T>(params: URLSearchParams, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/admin/finanzas/rentabilidad?${params.toString()}`, { signal, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Error ${response.status} al cargar la rentabilidad.`);
  return body as T;
}
function candidateParams({ nivel, buscar, page, facturaId, desde, hasta }: { nivel: EditorTab; buscar: string; page: number; facturaId: string; desde: string; hasta: string }) {
  const params = new URLSearchParams({ nivel, buscar, page: String(page), limit: "25", facturaId, desde, hasta });
  return params;
}
type PurchaseCandidateWithConcept = PurchaseCandidate & { concepto?: string | null };

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
export function AssignedPurchases({
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
export function AssignedStaff({
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
export function CostEditor({
  facturaId,
  desde,
  hasta,
  compras,
  personal,
  onChanged,
}: {
  facturaId: string;
  desde: string;
  hasta: string;
  compras: ProfitPurchaseLink[];
  personal: ProfitStaffLink[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>("compras");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<LoadState<ProfitCandidates>>({
    status: "loading",
  });
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [mutating, setMutating] = useState(false);
  const [removeSource, setRemoveSource] = useState<string | null>(null);
  const aborter = useRef<AbortController | null>(null);
  const [candidateRetry, setCandidateRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    aborter.current?.abort();
    const controller = new AbortController();
    aborter.current = controller;
    setCandidates({ status: "loading" });
    getProfit<ProfitCandidates>(
      candidateParams({ nivel: tab, desde, hasta, buscar: search, page, facturaId }),
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setCandidates({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setCandidates((previous) => ({
            status: "error",
            data: previous.data,
            error: errorMessage(error),
          }));
      });
    return () => controller.abort();
  }, [tab, desde, hasta, search, page, facturaId, candidateRetry]);

  function switchTab(next: EditorTab) {
    setTab(next);
    setPage(1);
    setSearchDraft("");
    setSearch("");
    setSourceId("");
    setAmount("");
    setNotes("");
    setMutationError("");
    setSuccessMessage("");
    setRemoveSource(null);
  }

  function editPurchase(item: ProfitPurchaseLink) {
    if (tab !== "compras") switchTab("compras");
    setSourceId(item.fuenteId);
    setAmount(String(item.porcentaje));
    setNotes(item.notas || "");
    setMutationError("");
    setSuccessMessage("");
  }
  function editStaff(item: ProfitStaffLink) {
    if (tab !== "personal") switchTab("personal");
    setSourceId(item.fuenteId);
    setAmount(String(item.porcentaje));
    setNotes(item.notas || "");
    setMutationError("");
    setSuccessMessage("");
  }

  async function saveLink() {
    if (mutating) return;
    const parsed = Number(amount.replace(",", "."));
    if (!sourceId)
      return setMutationError(
        "Selecciona una fuente antes de vincular el coste.",
      );
    if (
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      parsed > 100 ||
      !/^\d{1,3}([.,]\d{1,2})?$/.test(amount.trim())
    )
      return setMutationError(
        "El porcentaje debe estar entre 0,01 y 100 y tener un máximo de dos decimales.",
      );
    if (notes.length > 2000)
      return setMutationError("Las notas no pueden superar 2.000 caracteres.");
    setMutating(true);
    setMutationError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/admin/finanzas/rentabilidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: tab === "compras" ? "vincular_compra" : "vincular_personal",
          facturaId,
          fuenteId: sourceId,
          porcentaje: parsed,
          notas: notes.trim(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "No se ha podido guardar la vinculación.",
        );
      setSourceId("");
      setAmount("");
      setNotes("");
      setSuccessMessage(body?.duplicado
        ? "La vinculación ya estaba guardada; se ha comprobado sin crear otra relación."
        : "Vinculación guardada. Se ha actualizado el coste y el margen provisional.");
      setCandidateRetry(value => value + 1);
      onChanged();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setMutating(false);
    }
  }

  async function removeLink() {
    if (!removeSource || mutating) return;
    setMutating(true);
    setMutationError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/admin/finanzas/rentabilidad", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: tab === "compras" ? "quitar_compra" : "quitar_personal",
          facturaId,
          fuenteId: removeSource,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "No se ha podido desvincular el coste.",
        );
      setRemoveSource(null);
      if (sourceId === removeSource) {
        setSourceId("");
        setAmount("");
        setNotes("");
      }
      setSuccessMessage("Vinculación eliminada. Se ha actualizado el coste y el margen provisional.");
      setCandidateRetry(value => value + 1);
      onChanged();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setMutating(false);
    }
  }

  const items =
    tab === "compras"
      ? candidates.data?.compras || []
      : candidates.data?.personal || [];
  const selectedExisting =
    tab === "compras"
      ? compras.find((item) => item.fuenteId === sourceId)
      : personal.find((item) => item.fuenteId === sourceId);
  const selectedPurchase = (candidates.data?.compras || []).find(
    (item) => item.id === sourceId,
  ) as PurchaseCandidateWithConcept | undefined;
  const previewBase = selectedPurchase?.base ?? (tab === "compras" ? (selectedExisting as ProfitPurchaseLink | undefined)?.base : undefined);
  const parsedPercentage = Number(amount.replace(",", "."));
  const purchasePreview = useMemo(
    () => tab === "compras" && previewBase !== undefined && Number.isFinite(parsedPercentage)
      && parsedPercentage > 0 && parsedPercentage <= 100 && /^\d{1,3}([.,]\d{1,2})?$/.test(amount.trim())
      ? Math.round(Math.round(previewBase * 100) * Math.round(parsedPercentage * 100) / 10000) / 100
      : null,
    [tab, previewBase, parsedPercentage, amount],
  );

  return (
    <section
      className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50"
      aria-label="Editor de costes asignados"
    >
      <div className="flex flex-col gap-3 border-b border-blue-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="font-bold text-slate-950">
            Paso 2 · seleccionar la compra o el personal
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            Revisa la fuente y ábrela si lo necesitas antes de seleccionarla. Solo se crea o actualiza una relación al guardar; no se modifica la fuente original.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-1">
          <button
            type="button"
            onClick={() => switchTab("compras")}
            className={`rounded px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-700 ${tab === "compras" ? "bg-blue-800 text-white" : "text-slate-800 hover:bg-slate-100"}`}
          >
            Compra
          </button>
          <button
            type="button"
            onClick={() => switchTab("personal")}
            className={`rounded px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-700 ${tab === "personal" ? "bg-blue-800 text-white" : "text-slate-800 hover:bg-slate-100"}`}
          >
            Personal
          </button>
        </div>
      </div>
      <div className="space-y-4 p-4">
        {mutationError && (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-950"
          >
            {mutationError}
          </p>
        )}
        {successMessage && (
          <p role="status" aria-live="polite" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
            {successMessage}
          </p>
        )}
        {removeSource && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong>¿Desvincular coste?</strong> No elimina la fuente.
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={removeLink}
                disabled={mutating}
                className="rounded bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-60"
              >
                Desvincular
              </button>
              <button
                type="button"
                onClick={() => setRemoveSource(null)}
                disabled={mutating}
                className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
              >
                Cancelar
              </button>
            </span>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
          <div>
            <label
              htmlFor={`candidate-search-${facturaId}`}
              className="mb-1 block text-xs font-bold text-slate-900"
            >
              Buscar fuente
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-600" />
              <input
                id={`candidate-search-${facturaId}`}
                value={searchDraft}
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                }}
                placeholder={
                  tab === "compras"
                    ? "Factura, proveedor o concepto"
                    : "Nombre de personal"
                }
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-950 placeholder:text-slate-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>
          <p className="self-end pb-2 text-xs leading-4 text-slate-700">
            Las fuentes se consultan completas; el período de venta no limita su
            fecha.
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-[690px] w-full text-left">
            <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-800">
              <tr>
                <th className="px-3 py-2.5">
                  {tab === "compras" ? "Factura / proveedor" : "Persona"}
                </th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5 text-right">
                  {tab === "compras" ? "Base sin IVA" : "Horas"}
                </th>
                <th className="px-3 py-2.5 text-right">
                  {tab === "compras" ? "Disponible" : "Coste registrado"}
                </th>
                <th className="px-3 py-2.5 text-right">Seleccionar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {candidates.status === "loading" && !candidates.data ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-5 text-center text-sm text-slate-700"
                  >
                    Cargando fuentes…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-5 text-center text-sm text-slate-700"
                  >
                    No hay fuentes disponibles con esta búsqueda.
                  </td>
                </tr>
              ) : tab === "compras" ? (
                (items as PurchaseCandidateWithConcept[]).map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.bloqueado
                        ? "bg-slate-50 text-slate-600"
                        : sourceId === item.id
                          ? "bg-blue-50"
                          : ""
                    }
                  >
                    <td className="px-3 py-3 text-sm">
                      <p className="font-bold text-slate-950">
                        {item.numFactura || "Compra sin número"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-700">
                        {item.proveedor}
                      </p>
                      {item.concepto && <p className="mt-1 text-xs text-slate-700">{item.concepto}</p>}
                      <a href={`/admin/finanzas/facturas/${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-700">
                        Abrir compra antes de seleccionar
                      </a>
                      {item.bloqueado && (
                        <p className="mt-1 text-xs font-semibold text-red-900">
                          {item.motivo || "Fuente no disponible para asignar."}
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
                      {item.porcentajeDisponible.toLocaleString("es-ES", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      %
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        disabled={item.bloqueado || item.porcentajeDisponible <= 0 || mutating || candidates.status !== "ready"}
                        onClick={() => {
                          setSourceId(item.id);
                          setAmount(
                            String(Math.min(100, item.porcentajeDisponible)),
                          );
                          setMutationError("");
                        }}
                        className="rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sourceId === item.id ? "Seleccionada" : "Seleccionar"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                (items as StaffCandidate[]).map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.bloqueado
                        ? "bg-slate-50 text-slate-600"
                        : sourceId === item.id
                          ? "bg-blue-50"
                          : ""
                    }
                  >
                    <td className="px-3 py-3 text-sm">
                      <p className="font-bold text-slate-950">
                        {item.empleado}
                      </p>
                      {item.bloqueado && (
                        <p className="mt-1 text-xs font-semibold text-red-900">
                          {item.motivo || "Fuente no disponible para asignar."}
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
                      {item.coste === null ? "Pendiente" : money(item.coste)}
                      <span className="ml-1 text-xs">
                        ·{" "}
                        {item.porcentajeDisponible.toLocaleString("es-ES", {
                          maximumFractionDigits: 2,
                        })}{" "}
                        % disp.
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        disabled={item.bloqueado || item.porcentajeDisponible <= 0 || mutating || candidates.status !== "ready"}
                        onClick={() => {
                          setSourceId(item.id);
                          setAmount(
                            String(Math.min(100, item.porcentajeDisponible)),
                          );
                          setMutationError("");
                        }}
                        className="rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sourceId === item.id ? "Seleccionada" : "Seleccionar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {candidates.error && (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950"
          >
            <strong>No se pudieron cargar las fuentes.</strong>{" "}
            {candidates.error}
            <button type="button" onClick={() => setCandidateRetry(value => value + 1)} className="ml-3 font-bold underline">Reintentar</button>
          </p>
        )}
        {candidates.data && (
          <Pager
            page={candidates.data.page}
            total={candidates.data.total}
            totalPages={candidates.data.totalPages}
            loading={
              candidates.status === "loading" ||
              candidates.status === "refreshing"
            }
            onPage={setPage}
            label="Paginación de fuentes candidatas"
          />
        )}
        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[170px_minmax(0,1fr)_auto]">
          <div>
            <label
              htmlFor={`pct-${facturaId}`}
              className="mb-1 block text-xs font-bold text-slate-900"
            >
              Paso 3 · porcentaje
            </label>
            <input
              id={`pct-${facturaId}`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              aria-describedby={`pct-help-${facturaId}`}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
            <p
              id={`pct-help-${facturaId}`}
              className="mt-1 text-[11px] text-slate-700"
            >
              0,01–100; máximo 2 decimales.
            </p>
            {purchasePreview !== null && (
              <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-950" aria-live="polite">
                Previsualización a céntimos: {money(previewBase)} × {parsedPercentage.toLocaleString("es-ES", { maximumFractionDigits: 2 })} % = {money(purchasePreview)} de coste imputado.
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor={`notes-${facturaId}`}
              className="mb-1 block text-xs font-bold text-slate-900"
            >
              Notas de la vinculación
            </label>
            <textarea
              id={`notes-${facturaId}`}
              value={notes}
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Opcional, máximo 2.000 caracteres"
              className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 placeholder:text-slate-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>
          <button
            type="button"
            onClick={saveLink}
            disabled={!sourceId || !amount || mutating}
            className="self-end inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-800 px-3 py-2 text-sm font-bold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {selectedExisting ? "Guardar actualización" : "Guardar vinculación"}
          </button>
        </div>
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2">
            <h5 className="text-sm font-bold text-slate-950">
              {tab === "compras" ? "Compras asignadas" : "Personal asignado"}
            </h5>
          </div>
          {tab === "compras" ? (
            compras.length ? (
              <AssignedPurchases
                items={compras}
                onEdit={editPurchase}
                onRemove={(item) => {
                  setRemoveSource(item.fuenteId);
                  setMutationError("");
                }}
              />
            ) : (
              <p className="px-3 py-4 text-sm text-slate-700">
                Aún no hay compras asignadas.
              </p>
            )
          ) : personal.length ? (
            <AssignedStaff
              items={personal}
              onEdit={editStaff}
              onRemove={(item) => {
                setRemoveSource(item.fuenteId);
                setMutationError("");
              }}
            />
          ) : (
            <p className="px-3 py-4 text-sm text-slate-700">
              Aún no hay personal asignado.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

type InvoiceCostWorkspaceProps = {
  ventaId?: string | null;
  facturaIspId?: string | number | null;
  onClose?: () => void;
};

/**
 * Direct workspace used from the selector and from deep links. It deliberately
 * reads one unambiguous sale, rather than deriving a sale from a tree branch.
 */
export default function InvoiceCostWorkspace({
  ventaId,
  facturaIspId,
  onClose,
}: InvoiceCostWorkspaceProps) {
  const [detail, setDetail] = useState<LoadState<ProfitDetail>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const loadedIdentity = useRef("");
  const identity = ventaId ? `venta:${ventaId}` : `isp:${facturaIspId ?? ""}`;

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = new URLSearchParams();
    if (ventaId) params.set("ventaId", ventaId);
    else if (facturaIspId !== null && facturaIspId !== undefined && String(facturaIspId).trim()) params.set("facturaIspId", String(facturaIspId));
    else {
      setDetail({ status: "error", error: "Falta la identificación de la venta." });
      return () => controller.abort();
    }
    const sameSale = loadedIdentity.current === identity;
    loadedIdentity.current = identity;
    setDetail((previous) => ({ status: sameSale && previous.data ? "refreshing" : "loading", data: sameSale ? previous.data : undefined }));
    getProfit<ProfitDetail>(params, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDetail((previous) => ({ status: "error", data: previous.data, error: errorMessage(error) }));
      });
    return () => controller.abort();
  }, [ventaId, facturaIspId, reload, identity]);

  const visibleDetail = loadedIdentity.current === identity ? detail.data : undefined;
  const invoice = visibleDetail?.factura;
  const purchaseCost = (detail.data?.compras || []).reduce((total, item) => total + Number(item.coste || 0), 0);
  const staffCost = (detail.data?.personal || []).reduce((total, item) => total + Number(item.coste || 0), 0);
  const linkedCost = purchaseCost + staffCost;

  return (
    <section key={identity} className="overflow-hidden rounded-xl border-2 border-blue-300 bg-white shadow-sm" aria-labelledby="workspace-costes-title">
      <header className="border-b border-blue-200 bg-blue-50 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-900">Relacionar una venta con sus compras</p>
            <h2 id="workspace-costes-title" className="mt-1 text-lg font-bold text-slate-950">
              {invoice ? `${invoice.numFactura || "Venta sin número"} · ${invoice.cliente}` : "Cargando venta…"}
            </h2>
            {invoice?.concepto && <p className="mt-1 text-sm text-slate-700">{invoice.concepto}</p>}
          </div>
          {onClose && <button type="button" onClick={onClose} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700">Cerrar gestor</button>}
        </div>
        {invoice && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Resumen provisional de la venta">
            <p className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800"><span className="block text-xs font-bold uppercase tracking-wide text-slate-700">1 · Venta sin IVA</span><strong className="tabular-nums text-slate-950">{money(invoice.ventas)}</strong></p>
            <p className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800"><span className="block text-xs font-bold uppercase tracking-wide text-slate-700">Compras vinculadas</span><strong className="tabular-nums text-slate-950">{detail.data?.compras.length || 0} · {money(purchaseCost)}</strong></p>
            <p className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800"><span className="block text-xs font-bold uppercase tracking-wide text-slate-700">Margen provisional</span><strong className="tabular-nums text-slate-950">{money(invoice.margenConocido)}</strong></p>
          </div>
        )}
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {detail.status === "loading" && !detail.data && <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-700" aria-live="polite">Cargando la venta y sus vínculos…</p>}
        {detail.error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"><span><strong>No se pudo abrir el gestor.</strong> {detail.error}</span><button type="button" onClick={() => setReload((value) => value + 1)} className="rounded border border-red-400 bg-white px-3 py-1.5 text-xs font-bold text-red-900 focus:outline-none focus:ring-2 focus:ring-red-700">Reintentar</button></div>}
        {visibleDetail && invoice && (
          <>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800">
              Coste actualmente vinculado: <strong>{money(linkedCost)}</strong> ({money(purchaseCost)} compras y {money(staffCost)} personal). El margen es provisional y no clasifica ni crea relaciones automáticas.
            </p>
            {detail.data.avisos.map((notice, index) => <p key={`${notice}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{notice}</p>)}
            {detail.data.canWrite && detail.status !== "error" ? (
              <CostEditor
                key={invoice.id}
                facturaId={invoice.id}
                desde={invoice.fecha}
                hasta={invoice.fecha}
                compras={detail.data.compras}
                personal={detail.data.personal}
                onChanged={() => setReload((value) => value + 1)}
              />
            ) : (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950">{detail.status === "error" ? "Edición bloqueada hasta volver a cargar la venta correctamente." : "No tienes permiso para modificar vínculos. Puedes consultar las compras y el personal asignados."}</p>
            )}
            {!detail.data.canWrite && detail.data.compras.length > 0 && <AssignedPurchases items={detail.data.compras} />}
          </>
        )}
      </div>
    </section>
  );
}
