"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type VentaProveedorReferencia = {
  id: string;
  nombre: string;
  proveedorKey: string;
};

type SupplierOption = {
  nombre: string;
  proveedorKey: string;
  facturas: number;
};

type SupplierResponse = {
  referencias: VentaProveedorReferencia[];
  version: string;
  canWrite: boolean;
  proveedores: SupplierOption[];
  total: number;
  totalPages: number;
  page: number;
};

type LoadState =
  | { status: "loading"; facturaId: string; data?: SupplierResponse }
  | { status: "ready"; facturaId: string; data: SupplierResponse }
  | { status: "error"; facturaId: string; data?: SupplierResponse; error: string };

const MAX_REFERENCES = 10;
const MAX_NAME_LENGTH = 160;

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se han podido cargar los proveedores.";
}

function normaliseName(value: string) {
  // The API key is LOWER(BTRIM(nombre)): interior whitespace is meaningful.
  return value.trim();
}

function sameName(left: string, right: string) {
  return normaliseName(left).toLowerCase() === normaliseName(right).toLowerCase();
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
  const first = total === 0 ? 0 : (page - 1) * 25 + 1;
  return (
    <nav
      aria-label="Paginación del catálogo de proveedores"
      className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 text-xs text-slate-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        Mostrando {first}–{Math.min(page * 25, total)} de {total}
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="font-bold text-slate-900">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </span>
    </nav>
  );
}

/**
 * Records supplier references for a sale. These are discovery hints only: this
 * component never creates a purchase allocation or a cost relationship.
 */
export default function VentaProveedores({
  facturaId,
  canWrite = true,
  autoSelectFirst = true,
  onSelectSupplier,
  onSaved,
}: {
  facturaId: string;
  canWrite?: boolean;
  autoSelectFirst?: boolean;
  /** Opens the already-visible purchase catalogue filtered by this exact key. */
  onSelectSupplier?: (proveedorKey: string) => void;
  onSaved?: () => void;
}) {
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>(() => ({ status: "loading", facturaId }));
  const [draftNames, setDraftNames] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const activeInvoiceRef = useRef(facturaId);
  const loadedReferencesRef = useRef("");
  activeInvoiceRef.current = facturaId;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(normaliseName(queryDraft));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);

  useEffect(() => {
    requestRef.current?.abort();
    saveAbortRef.current?.abort();
    setQueryDraft("");
    setQuery("");
    setPage(1);
    setDraftNames([]);
    setManualName("");
    setSaveError("");
    setSaveMessage("");
    setSaving(false);
    loadedReferencesRef.current = "";
    setState({ status: "loading", facturaId });
  }, [facturaId]);

  useEffect(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState(previous => ({
      status: "loading",
      facturaId,
      data: previous.facturaId === facturaId ? previous.data : undefined,
    }));
    const params = new URLSearchParams({ facturaId, buscar: query, page: String(page) });
    fetch(`/api/admin/finanzas/rentabilidad/proveedores?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "No se pudo cargar el catálogo de proveedores.",
          );
        }
        return body as SupplierResponse;
      })
      .then(data => {
        if (controller.signal.aborted || activeInvoiceRef.current !== facturaId) return;
        setState({ status: "ready", facturaId, data });
      })
      .catch(error => {
        if (controller.signal.aborted || activeInvoiceRef.current !== facturaId) return;
        setState(previous => ({
          status: "error",
          facturaId,
          data: previous.facturaId === facturaId ? previous.data : undefined,
          error: errorMessage(error),
        }));
      });
    return () => controller.abort();
  }, [facturaId, query, page, retry]);

  const data = state.facturaId === facturaId ? state.data : undefined;
  const responseCanWrite = Boolean(canWrite && data?.canWrite);

  useEffect(() => {
    if (!data) return;
    const signature = `${facturaId}\u0000${data.version}\u0000${data.referencias
      .map(reference => `${reference.id}:${reference.nombre}:${reference.proveedorKey}`)
      .join("|")}`;
    // Catalogue pages carry the same saved references. Do not discard an unsaved
    // pack merely because the user typed another autocomplete query.
    if (signature === loadedReferencesRef.current) return;
    loadedReferencesRef.current = signature;
    setDraftNames(data.referencias.map(reference => reference.nombre));
    // A persisted reference is only a proposed first catalogue filter. It does
    // not select a purchase, create a link, or infer any amount.
    if (autoSelectFirst && data.referencias[0]) onSelectSupplier?.(data.referencias[0].proveedorKey);
  }, [data, facturaId, onSelectSupplier, autoSelectFirst]);

  const visibleOptions = useMemo(() => {
    if (!data || !query.trim()) return [];
    return data.proveedores.filter(option =>
      !draftNames.some(name => sameName(name, option.nombre)),
    );
  }, [data, draftNames, query]);
  const savedReferencesInDraft = useMemo(
    () => (data?.referencias || []).filter(reference =>
      draftNames.some(name => sameName(name, reference.nombre)),
    ),
    [data, draftNames],
  );
  const newDraftNames = useMemo(
    () => draftNames.filter(name =>
      !(data?.referencias || []).some(reference => sameName(name, reference.nombre)),
    ),
    [data, draftNames],
  );

  function addName(rawName: string) {
    const nombre = normaliseName(rawName);
    setSaveError("");
    setSaveMessage("");
    if (!nombre) {
      setSaveError("Escribe un proveedor antes de añadirlo.");
      return;
    }
    if (nombre.length > MAX_NAME_LENGTH) {
      setSaveError("El nombre del proveedor no puede superar 160 caracteres.");
      return;
    }
    if (draftNames.some(item => sameName(item, nombre))) {
      setSaveError("Ese proveedor ya está en la lista.");
      return;
    }
    if (draftNames.length >= MAX_REFERENCES) {
      setSaveError("Un pack puede tener como máximo 10 proveedores de referencia.");
      return;
    }
    setDraftNames(names => [...names, nombre]);
    setManualName("");
    setQueryDraft("");
    setQuery("");
    setPage(1);
  }

  function removeName(name: string) {
    if (saving) return;
    setDraftNames(names => names.filter(item => !sameName(item, name)));
    setSaveError("");
    setSaveMessage("");
  }

  async function saveReferences() {
    if (saving || !responseCanWrite || state.status !== "ready" || state.facturaId !== facturaId) {
      if (!saving && state.status !== "ready") setSaveError("Actualiza los proveedores antes de guardar los cambios.");
      return;
    }
    const version = state.data.version;
    const saveFacturaId = facturaId;
    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const response = await fetch("/api/admin/finanzas/rentabilidad/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          facturaId: saveFacturaId,
          version,
          nombres: draftNames,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "No se pudieron guardar los proveedores de referencia.",
        );
      }
      if (controller.signal.aborted || activeInvoiceRef.current !== saveFacturaId) return;
      setSaveMessage("Proveedores de referencia guardados. No se ha asignado ningún coste.");
      setRetry(value => value + 1);
      onSaved?.();
    } catch (error) {
      if (!controller.signal.aborted && activeInvoiceRef.current === saveFacturaId) {
        setSaveError(errorMessage(error));
      }
    } finally {
      if (activeInvoiceRef.current === saveFacturaId) setSaving(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-violet-200 bg-violet-50/50 p-4"
      aria-labelledby={`proveedores-venta-${facturaId}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
            Paso 1 · proveedor del servicio
          </p>
          <h3 id={`proveedores-venta-${facturaId}`} className="mt-1 text-base font-bold text-slate-950">
            Identifica primero el proveedor, antes de buscar facturas
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700">
            Revisión sugerida: empieza por <strong>octubre</strong>. Esta referencia orienta la búsqueda; no crea costes, compras ni repartos automáticos.
          </p>
        </div>
        <span className="w-fit rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-bold text-violet-950">
          {data?.referencias.length ? "Proveedor identificado" : "Coste pendiente"}
        </span>
      </div>

      {state.status === "error" && (
        <div role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950">
          <strong>No se pudieron cargar los proveedores.</strong> {state.error}
          <button
            type="button"
            onClick={() => setRetry(value => value + 1)}
            className="ml-3 font-bold underline focus:outline-none focus:ring-2 focus:ring-red-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {state.status === "loading" && !data ? (
        <p className="mt-3 text-sm text-slate-700" aria-live="polite">
          Cargando proveedores de referencia…
        </p>
      ) : data && (
        <>
          {savedReferencesInDraft.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Proveedores guardados">
              {savedReferencesInDraft.map(reference => (
                <div
                  key={`${reference.id}-${reference.proveedorKey}`}
                  className="flex flex-wrap items-center gap-2 rounded-full border border-violet-300 bg-white py-1 pl-3 pr-1 text-sm text-slate-950"
                >
                  <span className="font-semibold">{reference.nombre}</span>
                  <button
                    type="button"
                    onClick={() => onSelectSupplier?.(reference.proveedorKey)}
                    className="rounded-full border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-950 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    Ver sus facturas
                  </button>
                  {responseCanWrite && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => removeName(reference.nombre)}
                      className="rounded-full px-1.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
                      aria-label={`Quitar ${reference.nombre} de los proveedores`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <strong>Proveedor sin informar.</strong> Red propia/material propio puede no tener proveedor externo.
            </p>
          )}

          {responseCanWrite ? (
            <form
              className="mt-4 border-t border-violet-200 pt-4"
              onSubmit={event => {
                event.preventDefault();
                addName(manualName);
              }}
            >
              <label htmlFor={`buscar-proveedor-${facturaId}`} className="mb-1 block text-xs font-bold text-slate-900">
                Buscar o añadir proveedor de referencia
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={`buscar-proveedor-${facturaId}`}
                  value={manualName}
                  maxLength={MAX_NAME_LENGTH}
                  disabled={saving || draftNames.length >= MAX_REFERENCES}
                  onChange={event => {
                    const value = event.target.value;
                    setManualName(value);
                    setQueryDraft(value);
                    setSaveError("");
                  }}
                  placeholder="Proveedor del servicio"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={saving || !manualName.trim() || draftNames.length >= MAX_REFERENCES}
                  className="rounded-md border border-violet-700 bg-white px-3 py-2 text-sm font-bold text-violet-950 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Añadir nombre
                </button>
              </div>
              {query.trim() && (
                <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
                  {state.status === "loading" ? (
                    <p className="px-3 py-2 text-sm text-slate-700">Buscando proveedores…</p>
                  ) : visibleOptions.length ? (
                    <ul aria-label="Coincidencias de proveedores" className="divide-y divide-slate-200">
                      {visibleOptions.map(option => (
                        <li key={option.proveedorKey} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 text-sm text-slate-900">
                            <strong className="block truncate">{option.nombre}</strong>
                            <span className="text-xs text-slate-700">{option.facturas} factura{option.facturas === 1 ? "" : "s"} en catálogo</span>
                          </span>
                          <button
                            type="button"
                            disabled={saving || draftNames.length >= MAX_REFERENCES}
                            onClick={() => addName(option.nombre)}
                            className="shrink-0 rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
                          >
                            Usar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-700">Sin coincidencias; puedes guardar el nombre escrito.</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-700">
                  Hasta {MAX_REFERENCES} referencias para packs. Guardar solo conserva estos nombres; la selección de una compra y su porcentaje se hace después.
                </p>
                <button
                  type="button"
                  onClick={saveReferences}
                  disabled={saving}
                  className="shrink-0 rounded-md bg-violet-800 px-3 py-2 text-sm font-bold text-white hover:bg-violet-900 focus:outline-none focus:ring-2 focus:ring-violet-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Guardando…" : "Guardar proveedores"}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-xs text-slate-700">
              No tienes permiso para editar proveedores de referencia.
            </p>
          )}

          {newDraftNames.length > 0 && responseCanWrite && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Borrador de proveedores">
              {newDraftNames.map(name => (
                <span key={name} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-900">
                  {name}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeName(name)}
                    className="rounded-full px-1.5 py-0.5 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
                    aria-label={`Quitar ${name} del borrador`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {saveError && <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">{saveError}</p>}
          {saveMessage && <p role="status" aria-live="polite" className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">{saveMessage}</p>}
          <Pager
            page={data.page}
            total={data.total}
            totalPages={data.totalPages}
            disabled={saving || state.status === "loading"}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
