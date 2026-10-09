"use client";

import Link from "next/link";
import OperatorCostBatch from "./OperatorCostBatch";
import PendingRefactoringDocuments, {
  type PendingDocument,
} from "./PendingRefactoringDocuments";
import {
  OPERATOR_INVOICE_ALL_HISTORY_DEFAULT,
  operatorInvoiceParams,
} from "@/lib/finanzas/operator-invoice-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArchiveBoxIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FolderPlusIcon,
  InformationCircleIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type Origen = "PROPIA" | "TERCERO";
type Estado = "BORRADOR" | "REVISADO" | "ARCHIVADO";
type GrupoAmbito = "GLOBAL_RED_PROPIA" | "ZONA";
type Linea = { index: number; descripcion: string; importe: number | null };
type Factura = {
  id: string;
  proveedor: string;
  numFactura: string | null;
  fecha: string;
  base: number;
  concepto?: string | null;
  lineas: Linea[];
  detalleInvalido?: boolean;
  version: string;
  reservada: boolean;
};
type Grupo = {
  id: string;
  nombre: string;
  ambito: GrupoAmbito;
  zona?: string | null;
  conexion?: string | null;
};
type Documento = {
  facturaId: string;
  rol: "ORIGINAL" | "REFACTURA";
  factura: Pick<Factura, "id" | "proveedor" | "numFactura">;
};
type Asignacion = {
  indice: number;
  descripcion: string;
  importe: number | null;
  grupoId: string;
  grupo: Grupo;
};
type Snapshot = {
  proveedor: string;
  numFactura: string | null;
  fecha: string;
  base: number;
  concepto?: string | null;
  lineas: Linea[];
  detalleInvalido?: boolean;
  version?: string;
};
type Fuente = {
  id: string;
  origen: Origen;
  empresaPagadora: string;
  periodo: string;
  estado: Estado;
  notas?: string | null;
  version?: number;
  snapshot: Snapshot;
  documentos: Documento[];
  asignaciones: Asignacion[];
  documentoNombre?: string | null;
  tienePdf: boolean;
  documentoCambiado: boolean;
  situacionRefacturacion?:
    | "PENDIENTE_REFACTURACION"
    | "REFACTURA_RECIBIDA"
    | "NO_APLICA";
  documentoPendiente?: { id: string; version: number } | null;
};
type ListResponse = {
  fuentes: Fuente[];
  grupos: Grupo[];
  total: number;
  totalPages: number;
  resumen: {
    baseSeleccionada: number;
    basePendienteRefacturacion?: number;
    basePropia?: number;
    propias: number;
    terceros: number;
    borradores: number;
    revisadas: number;
  };
  canWrite: boolean;
};
type FacturasResponse = {
  facturas: Factura[];
  total: number;
  totalPages: number;
};
type DetailResponse = { fuente: Fuente; grupos: Grupo[]; canWrite: boolean };
type ManualLine = { key: string; descripcion: string; importe: string };

const API = "/api/admin/finanzas/costes-operadora";
const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("es-ES");
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 placeholder:text-slate-500 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";
const labelClass = "mb-1.5 block text-sm font-bold text-slate-900";
const nowPeriod = () => new Date().toISOString().slice(0, 7);

function money(value: number | null | undefined) {
  return euro.format(Number(value || 0));
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
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se ha podido completar la operación.";
}
function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `coste-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
function parseAmount(value: string) {
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return Number.NaN;
  // A single dot is a decimal separator too (e.g. String(100.5)); only strip
  // thousands grouping when both separators are present or grouping is unambiguous.
  let normalized = raw;
  if (raw.includes(",") && raw.includes(".")) {
    normalized =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (raw.includes(",")) normalized = raw.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw))
    normalized = raw.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}
async function json<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Error ${response.status}.`,
    );
  return body as T;
}
function badge(estado: Estado) {
  const cls =
    estado === "REVISADO"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : estado === "ARCHIVADO"
        ? "border-slate-300 bg-slate-100 text-slate-800"
        : "border-amber-300 bg-amber-50 text-amber-950";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${cls}`}
    >
      {estado === "REVISADO"
        ? "Revisado"
        : estado === "ARCHIVADO"
          ? "Archivado"
          : "Borrador"}
    </span>
  );
}
function Pager({
  page,
  total,
  totalPages,
  busy,
  onPage,
  label,
}: {
  page: number;
  total: number;
  totalPages: number;
  busy: boolean;
  onPage: (n: number) => void;
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-slate-700">
        Mostrando {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} de{" "}
        {integer.format(total)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || busy}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="text-xs font-bold text-slate-900">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages || busy}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </nav>
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
  const colors = {
    slate: "text-slate-950",
    blue: "text-blue-900",
    amber: "text-amber-950",
    green: "text-emerald-950",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
        {label}
      </p>
      <p className={`mt-2 text-xl font-extrabold tabular-nums ${colors[tone]}`}>
        {value}
      </p>
    </div>
  );
}
function original(source: Fuente) {
  return source.documentos.find((document) => document.rol === "ORIGINAL");
}
function refactura(source: Fuente) {
  return source.documentos.find((document) => document.rol === "REFACTURA");
}
function GroupPanel({
  grupos,
  canWrite,
  onCreated,
}: {
  grupos: Grupo[];
  canWrite: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ambito, setAmbito] = useState<GrupoAmbito>("GLOBAL_RED_PROPIA");
  const [zona, setZona] = useState("");
  const [conexion, setConexion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  async function create() {
    if (!nombre.trim()) return setError("Indica el nombre del grupo.");
    if (ambito === "ZONA" && (!zona.trim() || !conexion.trim()))
      return setError("Para un grupo de zona indica tanto zona como conexión.");
    setBusy(true);
    setError("");
    setOk("");
    try {
      await json(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grupo",
          solicitudId: newId(),
          nombre: nombre.trim(),
          ambito,
          zona: ambito === "ZONA" ? zona.trim() : undefined,
          conexion: ambito === "ZONA" ? conexion.trim() : undefined,
        }),
      });
      setNombre("");
      setZona("");
      setConexion("");
      setOk(
        "Grupo creado. Su ámbito queda fijado para no reclasificar costes silenciosamente.",
      );
      onCreated();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
      aria-labelledby="grupos-heading"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2
            id="grupos-heading"
            className="text-lg font-extrabold text-slate-950"
          >
            Centros de coste
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            El centro reúne artículos de facturas de cualquier mes. Su ámbito
            global o por zona define a qué red corresponde, sin aplicar
            repartos.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-950 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <FolderPlusIcon className="h-4 w-4" />
            {open ? "Cerrar formulario" : "Crear centro de coste"}
          </button>
        )}
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {grupos.length ? (
            grupos.map((group) => (
              <span
                key={group.id}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900"
              >
                {group.nombre}{" "}
                <span className="font-normal text-slate-700">
                  ·{" "}
                  {group.ambito === "GLOBAL_RED_PROPIA"
                    ? "Global red propia"
                    : `${group.zona} / ${group.conexion}`}
                </span>
              </span>
            ))
          ) : (
            <p className="text-sm text-slate-700">
              Todavía no hay grupos disponibles.
            </p>
          )}
        </div>
        {open && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="rounded-md border border-blue-200 bg-white p-3 text-xs leading-5 text-slate-800">
              <InformationCircleIcon className="mr-1 inline h-4 w-4 text-blue-800" />
              <strong>Recomendación, no alta automática:</strong> usa un grupo
              global de red propia para Cogent o Templus cuando corresponda;
              para XOC, crea un grupo de zona con su zona y conexión concretas.
            </div>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
              >
                {error}
              </p>
            )}
            {ok && (
              <p
                role="status"
                className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"
              >
                {ok}
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="grupo-nombre">
                  Nombre
                </label>
                <input
                  id="grupo-nombre"
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                  className={inputClass}
                  maxLength={160}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="grupo-ambito">
                  Ámbito
                </label>
                <select
                  id="grupo-ambito"
                  value={ambito}
                  onChange={(event) =>
                    setAmbito(event.target.value as GrupoAmbito)
                  }
                  className={inputClass}
                >
                  <option value="GLOBAL_RED_PROPIA">Global red propia</option>
                  <option value="ZONA">Zona y conexión</option>
                </select>
              </div>
              {ambito === "ZONA" && (
                <>
                  <div>
                    <label className={labelClass} htmlFor="grupo-zona">
                      Zona
                    </label>
                    <input
                      id="grupo-zona"
                      value={zona}
                      onChange={(event) => setZona(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="grupo-conexion">
                      Conexión
                    </label>
                    <input
                      id="grupo-conexion"
                      value={conexion}
                      onChange={(event) => setConexion(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={create}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-60"
            >
              <PlusIcon className="h-4 w-4" />
              {busy ? "Creando…" : "Crear centro de coste"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CostEditor({
  source,
  pendingDocument,
  initialGroups,
  canWrite,
  onClose,
  onSaved,
}: {
  source?: Fuente | null;
  pendingDocument?: PendingDocument;
  initialGroups: Grupo[];
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(source);
  const [id] = useState(() => source?.id || newId());
  const [origin, setOrigin] = useState<Origen>(
    source?.origen || (pendingDocument ? "TERCERO" : "PROPIA"),
  );
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [allHistory, setAllHistory] = useState(
    OPERATOR_INVOICE_ALL_HISTORY_DEFAULT,
  );
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoices, setInvoices] = useState<FacturasResponse | null>(null);
  const [invoicesBusy, setInvoicesBusy] = useState(true);
  const [invoiceError, setInvoiceError] = useState("");
  const request = useRef<AbortController | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Factura | null>(null);
  const [refacturaInvoice, setRefacturaInvoice] = useState<Factura | null>(
    () => {
      const current = source ? refactura(source) : undefined;
      return current
        ? {
            id: current.facturaId,
            proveedor: current.factura.proveedor,
            numFactura: current.factura.numFactura,
            fecha: "",
            base: 0,
            lineas: [],
            version: "",
            reservada: false,
          }
        : null;
    },
  );
  const [third, setThird] = useState({
    empresaPagadora:
      source?.empresaPagadora || pendingDocument?.resultado?.destinatario || "",
    proveedor:
      source?.snapshot.proveedor || pendingDocument?.resultado?.proveedor || "",
    numFactura:
      source?.snapshot.numFactura ||
      pendingDocument?.resultado?.numFactura ||
      "",
    fecha:
      source?.snapshot.fecha?.slice(0, 10) ||
      pendingDocument?.resultado?.fecha ||
      "",
    base: source
      ? String(source.snapshot.base)
      : pendingDocument?.resultado?.base !== null &&
          pendingDocument?.resultado?.base !== undefined
        ? String(pendingDocument.resultado.base)
        : "",
    concepto:
      source?.snapshot.concepto || pendingDocument?.resultado?.concepto || "",
  });
  const [manualLines, setManualLines] = useState<ManualLine[]>(
    () =>
      source?.snapshot.lineas.map((line) => ({
        key: String(line.index),
        descripcion: line.descripcion,
        importe: line.importe === null ? "" : String(line.importe),
      })) ||
      pendingDocument?.resultado?.lineas?.map((line, index) => ({
        key: String(index),
        descripcion: line.descripcion || "",
        importe: line.importe === null ? "" : String(line.importe),
      })) ||
      [],
  );
  const [assigned, setAssigned] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (source?.asignaciones || []).map((item) => [item.indice, item.grupoId]),
    ),
  );
  const [included, setIncluded] = useState<Set<number>>(
    () => new Set((source?.asignaciones || []).map((item) => item.indice)),
  );
  const [refacturaTouched, setRefacturaTouched] = useState(false);
  const [notes, setNotes] = useState(source?.notas || "");
  const [state, setState] = useState<Estado>(source?.estado || "BORRADOR");
  const [file, setFile] = useState<File | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [partial, setPartial] = useState("");
  const groups = initialGroups;
  const immutableSnapshot = source?.snapshot;
  const articles = useMemo<Linea[]>(
    () =>
      editing
        ? immutableSnapshot?.lineas || []
        : origin === "PROPIA"
          ? selectedInvoice?.lineas || []
          : manualLines.map((line, index) => ({
              index,
              descripcion: line.descripcion,
              importe: parseAmount(line.importe),
            })),
    [
      editing,
      immutableSnapshot?.lineas,
      origin,
      selectedInvoice?.lineas,
      manualLines,
    ],
  );
  const base = editing
    ? immutableSnapshot?.base || 0
    : origin === "PROPIA"
      ? selectedInvoice?.base || 0
      : parseAmount(third.base);
  const detalleInvalido = Boolean(
    (editing ? immutableSnapshot : selectedInvoice)?.detalleInvalido,
  );
  const invalidArticles =
    detalleInvalido ||
    articles.some(
      (line) => line.importe === null || !Number.isFinite(line.importe),
    );
  useEffect(() => {
    request.current?.abort();
    setInvoicesBusy(true);
    setInvoices(null);
    setInvoiceError("");
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      request.current = controller;
      const params = operatorInvoiceParams({
        buscar: invoiceSearch,
        page: invoicePage,
        allHistory,
        periodo: invoiceMonth,
      });
      setInvoicesBusy(true);
      setInvoiceError("");
      json<FacturasResponse>(`${API}?${params}`, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setInvoices(data);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setInvoiceError(message(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setInvoicesBusy(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [invoiceSearch, invoicePage, allHistory, invoiceMonth]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!editing) {
      setSelectedInvoice(null);
      setAssigned({});
      setIncluded(new Set());
    }
  }, [origin, editing]);
  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceSearch, allHistory, invoiceMonth, editing]);
  function chooseInvoice(invoice: Factura, role: "original" | "refactura") {
    if (role === "original") {
      setSelectedInvoice(invoice);
      setAssigned({});
      setIncluded(new Set());
    } else {
      setRefacturaInvoice(invoice);
      setRefacturaTouched(true);
    }
    setError("");
  }
  function changeLine(
    key: string,
    field: "descripcion" | "importe",
    value: string,
  ) {
    setManualLines((items) =>
      items.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  }
  function selectFile(next: File | null) {
    setError("");
    if (!next) return setFile(null);
    if (
      next.type !== "application/pdf" &&
      !next.name.toLowerCase().endsWith(".pdf")
    )
      return setError("Solo se admiten archivos PDF.");
    if (next.size > 4 * 1024 * 1024)
      return setError("El PDF no puede superar 4 MB.");
    setFile(next);
    setPdfPending(false);
  }
  async function uploadPdf(sourceId: string, candidate: File) {
    const data = new FormData();
    data.append("file", candidate);
    const response = await fetch(`${API}/${encodeURIComponent(sourceId)}/pdf`, {
      method: "POST",
      body: data,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : "No se ha podido subir el PDF.",
      );
  }
  function assignmentsPayload() {
    return Array.from(included)
      .filter((index) => assigned[index])
      .map((index) => ({ indice: index, grupoId: assigned[index] }));
  }
  async function save() {
    if (!canWrite || saveBusy) return;
    setError("");
    setSuccess("");
    setPartial("");
    if (state === "ARCHIVADO" && !editing)
      return setError(
        "Una nueva fuente debe guardarse como borrador o revisada; el archivado se realiza al editar.",
      );
    if (!editing && origin === "PROPIA" && !selectedInvoice)
      return setError("Selecciona una factura de Internet Operadores.");
    if (!editing && origin === "TERCERO" && !pendingDocument) {
      if (
        !third.empresaPagadora.trim() ||
        !third.proveedor.trim() ||
        !third.numFactura.trim() ||
        !third.fecha ||
        !Number.isFinite(base)
      )
        return setError(
          "Completa empresa pagadora, proveedor, número, fecha y base de la factura de otra empresa.",
        );
      if (!articles.length)
        return setError(
          "Añade al menos un artículo real para la factura de otra empresa.",
        );
      if (invalidArticles)
        return setError(
          "Corrige o elimina los artículos con un importe no válido.",
        );
    }
    if (!articles.length && detalleInvalido)
      return setError(
        "El detalle de la factura no es verificable. No se puede asignar la factura completa.",
      );
    if (articles.some((line) => !line.descripcion.trim()))
      return setError("Cada artículo debe incluir una descripción.");
    const assignments = assignmentsPayload();
    if (included.size !== assignments.length)
      return setError("Selecciona un grupo para cada artículo incluido.");
    if (state === "REVISADO" && !assignments.length)
      return setError(
        "Selecciona al menos un artículo y su grupo antes de marcar revisado.",
      );
    setSaveBusy(true);
    let uploadFailed = false;
    try {
      const originalId = source ? original(source)?.facturaId : undefined;
      const payload: Record<string, unknown> = editing
        ? {
            action: "guardar",
            id,
            version: source?.version,
            origen: source!.origen,
            empresaPagadora: source!.empresaPagadora,
            periodo: source!.periodo,
            facturaId: source!.origen === "PROPIA" ? originalId : undefined,
            asignaciones: assignments,
            notas: notes.trim() || undefined,
            estado: state,
            refacturaId: refacturaTouched
              ? refacturaInvoice?.id || null
              : undefined,
            refacturaVersion:
              refacturaTouched && refacturaInvoice
                ? refacturaInvoice.version || undefined
                : undefined,
          }
        : {
            action: "guardar",
            id,
            origen: origin,
            empresaPagadora:
              origin === "PROPIA"
                ? "Internet Operadores"
                : third.empresaPagadora.trim(),
            facturaId: origin === "PROPIA" ? selectedInvoice?.id : undefined,
            facturaVersion:
              origin === "PROPIA" ? selectedInvoice?.version : undefined,
            tercero:
              origin === "TERCERO" && !pendingDocument
                ? {
                    proveedor: third.proveedor.trim(),
                    numFactura: third.numFactura.trim(),
                    fecha: third.fecha,
                    base,
                    concepto: third.concepto.trim() || undefined,
                    lineas: articles.map((line) => ({
                      descripcion: line.descripcion.trim(),
                      importe: line.importe,
                    })),
                  }
                : undefined,
            documentoPendienteId: pendingDocument?.id,
            documentoPendienteVersion: pendingDocument?.version,
            refacturaId: refacturaInvoice?.id || null,
            refacturaVersion: refacturaInvoice?.version || undefined,
            asignaciones: assignments,
            estado: state,
            notas: notes.trim() || undefined,
          };
      await json(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if ((editing ? source?.origen : origin) === "TERCERO" && file) {
        try {
          await uploadPdf(id, file);
          setFile(null);
          setPdfPending(false);
          setSuccess("Fuente guardada y PDF adjuntado correctamente.");
        } catch (cause) {
          uploadFailed = true;
          setPdfPending(true);
          setPartial(
            `La fuente se ha guardado, pero el PDF no se ha podido subir: ${message(cause)} Puedes reintentarlo sin volver a guardar.`,
          );
        }
      } else
        setSuccess(
          editing
            ? "Cambios guardados. La identidad y la copia de la factura se mantienen inmutables."
            : "Fuente guardada correctamente.",
        );
      onSaved();
      if (!uploadFailed) onClose();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaveBusy(false);
    }
  }
  async function retryPdf() {
    if (!file) return;
    setSaveBusy(true);
    setPartial("");
    try {
      await uploadPdf(id, file);
      setFile(null);
      setPdfPending(false);
      setSuccess("PDF adjuntado correctamente.");
      onSaved();
    } catch (cause) {
      setPartial(`El PDF sigue pendiente: ${message(cause)}`);
    } finally {
      setSaveBusy(false);
    }
  }
  const candidateRows = invoices?.facturas || [];
  return (
    <section
      className="rounded-xl border border-blue-200 bg-white shadow-sm"
      aria-labelledby="editor-heading"
    >
      <div className="flex flex-col gap-3 border-b border-blue-200 bg-blue-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <p className="text-sm font-bold text-blue-900">Costes de operadora</p>
          <h2
            id="editor-heading"
            className="mt-1 text-xl font-extrabold text-slate-950"
          >
            {editing ? "Editar fuente" : "Nueva fuente de coste"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-700">
            {editing
              ? "La identidad, empresa pagadora y copia de la factura se conservan. Solo puedes ajustar artículos, notas, estado y refactura."
              : "Selecciona o registra la factura y asigna cada artículo a un grupo. No se infieren clientes ni se aplica ninguna distribución futura."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
        >
          <XMarkIcon className="h-4 w-4" />
          Cerrar
        </button>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"
          >
            {success}
          </p>
        )}
        {partial && (
          <div
            role="alert"
            className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
          >
            <strong>Guardado parcial.</strong> {partial}
            {file && (
              <button
                type="button"
                onClick={retryPdf}
                disabled={saveBusy}
                className="ml-3 rounded border border-amber-500 bg-white px-3 py-1.5 text-xs font-extrabold hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700 disabled:opacity-60"
              >
                Reintentar PDF
              </button>
            )}
          </div>
        )}
        <fieldset
          disabled={editing || !canWrite || Boolean(pendingDocument)}
          className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2"
        >
          <legend className="px-1 text-sm font-extrabold text-slate-950">
            1. Origen e identidad
          </legend>
          <div>
            <span className={labelClass}>Origen</span>
            <div className="flex gap-2">
              <label
                className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold ${origin === "PROPIA" ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-300 bg-white text-slate-900"}`}
              >
                <input
                  type="radio"
                  checked={origin === "PROPIA"}
                  disabled={Boolean(pendingDocument)}
                  onChange={() => setOrigin("PROPIA")}
                />
                Factura de Internet Operadores
              </label>
              <label
                className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold ${origin === "TERCERO" ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-300 bg-white text-slate-900"}`}
              >
                <input
                  type="radio"
                  checked={origin === "TERCERO"}
                  onChange={() => setOrigin("TERCERO")}
                />
                Factura de otra empresa
              </label>
            </div>
          </div>
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            Asigna los artículos a un centro de coste, no a un mes. La fecha de
            cada factura se conserva para consultar su evolución; no se reparte
            ningún coste entre clientes.
          </p>
          {editing && (
            <p className="md:col-span-2 text-xs font-semibold text-slate-700">
              Datos bloqueados para preservar el snapshot original de esta
              fuente.
            </p>
          )}
        </fieldset>
        {!editing && origin === "PROPIA" && (
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-extrabold text-slate-950">
              2. Seleccionar factura de Internet Operadores
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              Busca entre las facturas de proveedores ya recibidas por Internet
              Operadores, de cualquier mes. Por ejemplo, escribe Cogent. El
              centro de coste puede reunir facturas de meses distintos.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-700" />
                <input
                  value={invoiceSearch}
                  onChange={(event) => {
                    setInvoicePage(1);
                    setInvoiceSearch(event.target.value);
                  }}
                  id="operator-invoice-search"
                  aria-label="Buscar factura recibida por proveedor, número o concepto"
                  placeholder="Buscar proveedor: Cogent, Templus, XOC…"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900">
                <input
                  type="checkbox"
                  checked={allHistory}
                  onChange={(event) => setAllHistory(event.target.checked)}
                />
                Buscar en todo el histórico
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-700">
              {allHistory
                ? "Buscando en todo el histórico. Cada factura conserva su fecha y puede pertenecer al mismo centro de coste."
                : `Filtro de fecha de factura activo: ${invoiceMonth || "todos los meses"}. No cambia la asignación al centro de coste.`}
              {invoices && !invoicesBusy && (
                <strong className="ml-2">
                  {integer.format(invoices.total)} facturas encontradas.
                </strong>
              )}
            </p>
            {invoiceError && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
              >
                {invoiceError}
              </p>
            )}
            {!allHistory && (
              <div className="mt-3">
                <label htmlFor="invoice-month" className={labelClass}>
                  Filtrar fecha de factura (opcional)
                </label>
                <input
                  id="invoice-month"
                  type="month"
                  value={invoiceMonth}
                  onChange={(e) => setInvoiceMonth(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            <CandidateTable
              rows={candidateRows}
              busy={invoicesBusy}
              selected={selectedInvoice?.id}
              refactura={refacturaInvoice?.id}
              onSelect={chooseInvoice}
            />
            <Pager
              page={invoicePage}
              total={invoices?.total || 0}
              totalPages={invoices?.totalPages || 1}
              busy={invoicesBusy}
              onPage={setInvoicePage}
              label="Paginación de facturas candidatas"
            />
            {selectedInvoice && (
              <p className="mt-3 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm font-bold text-blue-950">
                Factura original seleccionada: {selectedInvoice.proveedor} ·{" "}
                {selectedInvoice.numFactura || "Sin número"} ·{" "}
                {money(selectedInvoice.base)}
              </p>
            )}
          </div>
        )}
        {!editing && origin === "TERCERO" && !pendingDocument && (
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-extrabold text-slate-950">
              2. Registrar factura de otra empresa
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              Conserva su identidad y artículos como snapshot. El PDF es
              opcional y se sube después de guardar la fuente.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="third-payer">
                  Empresa destinataria del original
                </label>
                <input
                  id="third-payer"
                  value={third.empresaPagadora}
                  onChange={(event) =>
                    setThird({ ...third, empresaPagadora: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="third-provider">
                  Proveedor de la factura
                </label>
                <input
                  id="third-provider"
                  value={third.proveedor}
                  onChange={(event) =>
                    setThird({ ...third, proveedor: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="third-number">
                  Número de factura
                </label>
                <input
                  id="third-number"
                  value={third.numFactura}
                  onChange={(event) =>
                    setThird({ ...third, numFactura: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="third-date">
                  Fecha
                </label>
                <input
                  id="third-date"
                  type="date"
                  value={third.fecha}
                  onChange={(event) =>
                    setThird({ ...third, fecha: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="third-base">
                  Base sin IVA
                </label>
                <input
                  id="third-base"
                  inputMode="decimal"
                  value={third.base}
                  onChange={(event) =>
                    setThird({ ...third, base: event.target.value })
                  }
                  placeholder="0,00"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass} htmlFor="third-concept">
                  Concepto
                </label>
                <input
                  id="third-concept"
                  value={third.concepto}
                  onChange={(event) =>
                    setThird({ ...third, concepto: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass} htmlFor="third-pdf">
                  PDF original (opcional, máximo 4 MB)
                </label>
                <input
                  id="third-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) =>
                    selectFile(event.target.files?.[0] || null)
                  }
                  className={inputClass}
                />
                {file && (
                  <p className="mt-1 text-xs font-bold text-slate-800">
                    Pendiente de subir tras guardar: {file.name} (
                    {Math.ceil(file.size / 1024)} KB)
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-md border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <h4 className="text-sm font-extrabold text-slate-950">
                  Artículos de la factura
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setManualLines((lines) => [
                      ...lines,
                      { key: newId(), descripcion: "", importe: "" },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-bold text-blue-950 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Añadir artículo
                </button>
              </div>
              {manualLines.length ? (
                <div className="space-y-2 p-3">
                  {manualLines.map((line, index) => (
                    <div
                      key={line.key}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
                    >
                      <input
                        aria-label={`Descripción artículo ${index + 1}`}
                        value={line.descripcion}
                        onChange={(event) =>
                          changeLine(
                            line.key,
                            "descripcion",
                            event.target.value,
                          )
                        }
                        placeholder="Descripción"
                        className={inputClass}
                      />
                      <input
                        aria-label={`Importe artículo ${index + 1}`}
                        inputMode="decimal"
                        value={line.importe}
                        onChange={(event) =>
                          changeLine(line.key, "importe", event.target.value)
                        }
                        placeholder="0,00"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setManualLines((lines) =>
                            lines.filter((item) => item.key !== line.key),
                          );
                          setIncluded(new Set());
                          setAssigned({});
                        }}
                        className="rounded border border-red-300 bg-white px-2 text-sm font-bold text-red-900 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-3 text-sm text-slate-700">
                  Añade al menos un artículo verificable; las facturas de
                  terceros no pueden guardarse sin detalle.
                </p>
              )}
            </div>
          </div>
        )}
        <section
          className="rounded-lg border border-slate-200 p-4"
          aria-labelledby="assignment-heading"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3
                id="assignment-heading"
                className="text-base font-extrabold text-slate-950"
              >
                3. Asignar artículos a centros de coste
              </h3>
              <p className="mt-1 text-sm text-slate-700">
                Cada artículo se selecciona de forma explícita. La factura
                completa solo se permite si no hay detalle y este es
                verificable.
              </p>
            </div>
            <p className="text-sm font-extrabold tabular-nums text-blue-950">
              Base: {Number.isFinite(base) ? money(base) : "Pendiente"}
            </p>
          </div>
          {invalidArticles && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
              <ExclamationTriangleIcon className="mr-1 inline h-4 w-4" />
              El detalle no es verificable o contiene importes no válidos (por
              ejemplo, OCR no válido). No se ofrece la factura completa como
              alternativa.
            </p>
          )}
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[680px] w-full text-left">
              <thead className="bg-slate-100 text-xs font-extrabold uppercase tracking-wide text-slate-800">
                <tr>
                  <th className="w-16 px-3 py-2.5">Incluir</th>
                  <th className="px-3 py-2.5">Artículo</th>
                  <th className="px-3 py-2.5 text-right">Importe</th>
                  <th className="w-72 px-3 py-2.5">Grupo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {articles.length ? (
                  articles.map((line) => {
                    const disabled =
                      line.importe === null || !Number.isFinite(line.importe);
                    const selected = included.has(line.index);
                    return (
                      <tr
                        key={line.index}
                        className={
                          disabled
                            ? "bg-amber-50 text-slate-600"
                            : selected
                              ? "bg-blue-50"
                              : ""
                        }
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Incluir ${line.descripcion || `artículo ${line.index + 1}`}`}
                            disabled={disabled || !canWrite}
                            checked={selected}
                            onChange={(event) => {
                              setIncluded((current) => {
                                const nextIncluded = new Set(current);
                                if (event.target.checked)
                                  nextIncluded.add(line.index);
                                else {
                                  nextIncluded.delete(line.index);
                                  setAssigned((currentAssigned) => {
                                    const nextAssigned = { ...currentAssigned };
                                    delete nextAssigned[line.index];
                                    return nextAssigned;
                                  });
                                }
                                return nextIncluded;
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 text-sm">
                          <p className="font-bold text-slate-950">
                            {line.descripcion || `Artículo ${line.index + 1}`}
                          </p>
                          {disabled && (
                            <p className="mt-1 text-xs font-bold text-amber-950">
                              Importe no disponible: no se puede asignar.
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">
                          {line.importe === null ||
                          !Number.isFinite(line.importe)
                            ? "No válido"
                            : money(line.importe)}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            aria-label={`Grupo para ${line.descripcion || `artículo ${line.index + 1}`}`}
                            value={assigned[line.index] || ""}
                            disabled={!selected || disabled || !canWrite}
                            onChange={(event) =>
                              setAssigned((values) => ({
                                ...values,
                                [line.index]: event.target.value,
                              }))
                            }
                            className={inputClass}
                          >
                            <option value="">Selecciona grupo</option>
                            {groups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.nombre} ·{" "}
                                {group.ambito === "GLOBAL_RED_PROPIA"
                                  ? "global"
                                  : `${group.zona} / ${group.conexion}`}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                ) : !detalleInvalido && origin !== "TERCERO" ? (
                  <tr>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Incluir factura completa"
                        disabled={!canWrite}
                        checked={included.has(-1)}
                        onChange={(event) =>
                          setIncluded((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(-1);
                            else {
                              next.delete(-1);
                              setAssigned((currentAssigned) => {
                                const nextAssigned = { ...currentAssigned };
                                delete nextAssigned[-1];
                                return nextAssigned;
                              });
                            }
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <p className="font-bold text-slate-950">
                        Factura completa
                      </p>
                      <p className="text-xs text-slate-700">
                        No dispone de artículos estructurados.
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-950">
                      {Number.isFinite(base) ? money(base) : "Pendiente"}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label="Grupo para factura completa"
                        value={assigned[-1] || ""}
                        disabled={!included.has(-1) || !canWrite}
                        onChange={(event) =>
                          setAssigned((values) => ({
                            ...values,
                            [-1]: event.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Selecciona grupo</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-sm font-bold text-amber-950"
                    >
                      No hay detalle verificable para asignar. Corrige el
                      detalle en la fuente antes de continuar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!groups.length && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
              Crea al menos un grupo antes de guardar una asignación.
            </p>
          )}
        </section>
        {pendingDocument && (
          <p className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm font-bold text-violet-950">
            Original analizado en OneDrive, a nombre de{" "}
            {pendingDocument.resultado?.destinatario}. Se conservan los datos
            del documento: selecciona los artículos y su centro de coste. No se
            registra como factura recibida propia.
          </p>
        )}
        <section className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-base font-extrabold text-slate-950">
            4. Refactura recibida de la otra empresa (cuando exista)
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            Mientras la otra empresa no os facture, deja este campo vacío: el
            coste queda pendiente de recibir por refacturación. Cuando llegue la
            factura a Internet Operadores, vincúlala aquí. No se sumará el coste
            dos veces.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-700" />
              <input
                value={invoiceSearch}
                onChange={(event) => setInvoiceSearch(event.target.value)}
                placeholder="Buscar factura para refactura"
                className={`${inputClass} pl-9`}
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900">
              <input
                type="checkbox"
                checked={allHistory}
                onChange={(event) => setAllHistory(event.target.checked)}
              />
              Todo el histórico
            </label>
          </div>
          <CandidateTable
            rows={candidateRows}
            busy={invoicesBusy}
            selected={
              selectedInvoice?.id ||
              (editing ? original(source!)?.facturaId : undefined)
            }
            refactura={refacturaInvoice?.id}
            onSelect={chooseInvoice}
            onlyRefactura
          />
          <Pager
            page={invoicePage}
            total={invoices?.total || 0}
            totalPages={invoices?.totalPages || 1}
            busy={invoicesBusy}
            onPage={setInvoicePage}
            label="Paginación de facturas para refactura"
          />
          {refacturaInvoice && (
            <p className="mt-3 rounded-md border border-violet-300 bg-violet-50 p-3 text-sm font-bold text-violet-950">
              Refactura vinculada: {refacturaInvoice.proveedor} ·{" "}
              {refacturaInvoice.numFactura || "Sin número"}{" "}
              <button
                type="button"
                onClick={() => {
                  setRefacturaInvoice(null);
                  setRefacturaTouched(true);
                }}
                className="ml-2 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                Quitar
              </button>
            </p>
          )}
        </section>
        {editing && <Snapshot source={source!} />}
        {editing && source?.origen === "TERCERO" && !source.tienePdf && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h3 className="text-base font-extrabold text-amber-950">
              PDF original pendiente
            </h3>
            <p className="mt-1 text-sm text-amber-950">
              Puedes adjuntar el PDF ahora (máximo 4 MB); no cambia el snapshot
              ni la distribución.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className={labelClass} htmlFor="edit-third-pdf">
                  PDF original
                </label>
                <input
                  id="edit-third-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) =>
                    selectFile(event.target.files?.[0] || null)
                  }
                  className={inputClass}
                />
              </div>
              {file && (
                <button
                  type="button"
                  onClick={retryPdf}
                  disabled={saveBusy}
                  className="rounded-lg border border-amber-500 bg-white px-4 py-2.5 text-sm font-extrabold text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700 disabled:opacity-60"
                >
                  Subir PDF
                </button>
              )}
            </div>
          </section>
        )}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className={labelClass} htmlFor="cost-notes">
                Notas
              </label>
              <textarea
                id="cost-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={2000}
                rows={3}
                disabled={!canWrite}
                placeholder="Opcionales, máximo 2.000 caracteres"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cost-state">
                Estado de guardado
              </label>
              <select
                id="cost-state"
                value={state}
                onChange={(event) => setState(event.target.value as Estado)}
                disabled={!canWrite}
                className={inputClass}
              >
                <option value="BORRADOR">Guardar como borrador</option>
                <option value="REVISADO">Marcar revisado</option>
                {editing && <option value="ARCHIVADO">Archivar fuente</option>}
              </select>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800">
            <InformationCircleIcon className="mr-1 inline h-4 w-4 text-slate-800" />
            <strong>Distribución futura pendiente.</strong> Guardar esta fuente
            no crea ni aplica reglas a futuro; tampoco fija mapeos de zona/base
            ni deduce clientes.
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-700">
              {editing
                ? "No se puede reemplazar la factura ni su snapshot."
                : "El mismo identificador se reutiliza si la petición necesita reintentarse."}
            </p>
            <button
              type="button"
              onClick={save}
              disabled={!canWrite || saveBusy || Boolean(partial)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveBusy ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircleIcon className="h-4 w-4" />
              )}
              {saveBusy
                ? "Guardando…"
                : state === "REVISADO"
                  ? "Guardar y revisar"
                  : state === "ARCHIVADO"
                    ? "Archivar fuente"
                    : "Guardar borrador"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
function CandidateTable({
  rows,
  busy,
  selected,
  refactura,
  onSelect,
  onlyRefactura = false,
}: {
  rows: Factura[];
  busy: boolean;
  selected?: string;
  refactura?: string;
  onSelect: (invoice: Factura, role: "original" | "refactura") => void;
  onlyRefactura?: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[760px] w-full text-left">
        <thead className="bg-slate-100 text-xs font-extrabold uppercase tracking-wide text-slate-800">
          <tr>
            <th className="px-3 py-2.5">Factura / proveedor</th>
            <th className="px-3 py-2.5">Fecha</th>
            <th className="px-3 py-2.5 text-right">Base</th>
            <th className="px-3 py-2.5">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {busy && !rows.length ? (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-5 text-center text-sm text-slate-700"
              >
                Cargando facturas…
              </td>
            </tr>
          ) : rows.length ? (
            rows.map((invoice) => (
              <tr
                key={invoice.id}
                className={
                  invoice.id === selected || invoice.id === refactura
                    ? "bg-blue-50"
                    : invoice.reservada
                      ? "bg-slate-50"
                      : ""
                }
              >
                <td className="px-3 py-3 text-sm">
                  <p className="font-extrabold text-slate-950">
                    {invoice.numFactura || "Factura sin número"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-700">
                    {invoice.proveedor}
                  </p>
                  {invoice.concepto && (
                    <p className="mt-1 max-w-md truncate text-xs text-slate-700">
                      {invoice.concepto}
                    </p>
                  )}
                  <Link
                    href={`/admin/finanzas/facturas/${encodeURIComponent(invoice.id)}`}
                    target="_blank"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-blue-900 underline hover:text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    Abrir factura
                  </Link>
                  {invoice.reservada && (
                    <p className="mt-1 text-xs font-bold text-amber-950">
                      Factura reservada; revísala antes de vincularla.
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-900">
                  {formatDate(invoice.fecha)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-extrabold tabular-nums text-slate-950">
                  {money(invoice.base)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {!onlyRefactura && (
                      <button
                        type="button"
                        disabled={invoice.reservada}
                        onClick={() => onSelect(invoice, "original")}
                        className="rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-blue-950 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {invoice.id === selected
                          ? "Original elegida"
                          : "Usar como factura propia"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={invoice.reservada}
                      onClick={() => onSelect(invoice, "refactura")}
                      className="rounded border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-violet-950 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {invoice.id === refactura
                        ? "Refactura elegida"
                        : "Vincular refactura recibida"}
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-5 text-center text-sm text-slate-700"
              >
                No hay facturas para esta búsqueda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Snapshot({ source }: { source: Fuente }) {
  const originalDoc = original(source);
  const refacturaDoc = refactura(source);
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-extrabold text-slate-950">
            Snapshot inmutable de la fuente
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            {source.origen === "PROPIA"
              ? "Factura de Internet Operadores"
              : `Factura de otra empresa: ${source.empresaPagadora}`}{" "}
            · Mes de referencia {source.periodo}
          </p>
        </div>
        {source.documentoCambiado && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-extrabold text-amber-950">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            La factura ha cambiado desde el snapshot
          </span>
        )}
      </div>
      {source.origen === "TERCERO" && (
        <p className="mt-2 rounded-md border border-violet-300 bg-violet-50 p-2 text-sm font-bold text-violet-950">
          {refacturaDoc
            ? "Refactura recibida y vinculada · coste no duplicado"
            : "Pendiente de recibir por refacturación · coste económico, no factura recibida de Internet Operadores"}
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="font-extrabold text-slate-950">
            {source.snapshot.proveedor}
          </p>
          <p className="text-sm text-slate-800">
            {source.snapshot.numFactura || "Sin número"} ·{" "}
            {formatDate(source.snapshot.fecha)}
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-slate-950">
            Base {money(source.snapshot.base)}
          </p>
          {source.snapshot.concepto && (
            <p className="mt-1 text-xs text-slate-700">
              {source.snapshot.concepto}
            </p>
          )}
        </div>
        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="text-sm font-extrabold text-slate-950">
            Documentos vinculados
          </p>
          {originalDoc && (
            <a
              href={`/api/admin/finanzas/facturas/${encodeURIComponent(originalDoc.facturaId)}/pdf`}
              target="_blank"
              className="mt-2 flex items-center gap-1 text-sm font-bold text-blue-900 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              Original:{" "}
              {originalDoc.factura.numFactura || originalDoc.factura.proveedor}
            </a>
          )}
          {source.tienePdf && (
            <a
              href={
                source.documentoPendiente
                  ? `${API}/pendientes/${encodeURIComponent(source.documentoPendiente.id)}/pdf`
                  : `${API}/${encodeURIComponent(source.id)}/pdf`
              }
              target="_blank"
              className="mt-2 flex items-center gap-1 text-sm font-bold text-blue-900 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              PDF aportado
              {source.documentoNombre ? `: ${source.documentoNombre}` : ""}
            </a>
          )}
          {refacturaDoc && (
            <Link
              href={`/admin/finanzas/facturas/${encodeURIComponent(refacturaDoc.facturaId)}`}
              className="mt-2 flex items-center gap-1 text-sm font-bold text-violet-950 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <LinkIcon className="h-4 w-4" />
              Refactura:{" "}
              {refacturaDoc.factura.numFactura ||
                refacturaDoc.factura.proveedor}
            </Link>
          )}
          {!originalDoc && !source.tienePdf && !refacturaDoc && (
            <p className="mt-2 text-sm text-slate-700">
              Sin documento enlazado.
            </p>
          )}
        </div>
      </div>
      {source.snapshot.lineas.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-300 bg-white">
          {source.snapshot.lineas.map((line) => (
            <li
              key={line.index}
              className="flex justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="text-slate-900">
                {line.descripcion || `Artículo ${line.index + 1}`}
              </span>
              <span className="font-bold tabular-nums text-slate-950">
                {line.importe === null ? "No válido" : money(line.importe)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function SourceDetail({ source }: { source: Fuente }) {
  const originalDoc = original(source);
  const refacturaDoc = refactura(source);
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
      {source.estado === "ARCHIVADO" && (
        <p className="mb-4 rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900">
          <ArchiveBoxIcon className="mr-1 inline h-4 w-4" />
          <strong>Fuente archivada e inmutable.</strong> La reserva de
          documentos y sus asignaciones se conservan para trazabilidad; no se
          puede editar ni reactivar desde esta vista.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-extrabold text-slate-950">
            Snapshot de factura
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Proveedor
              </dt>
              <dd className="font-bold text-slate-950">
                {source.snapshot.proveedor}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Número / fecha
              </dt>
              <dd className="font-bold text-slate-950">
                {source.snapshot.numFactura || "Sin número"} ·{" "}
                {formatDate(source.snapshot.fecha)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Base sin IVA
              </dt>
              <dd className="font-bold tabular-nums text-slate-950">
                {money(source.snapshot.base)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Concepto
              </dt>
              <dd className="text-slate-900">
                {source.snapshot.concepto || "—"}
              </dd>
            </div>
          </dl>
          {source.documentoCambiado && (
            <p className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs font-extrabold text-amber-950">
              <ExclamationTriangleIcon className="mr-1 inline h-4 w-4" />
              La factura de origen ha cambiado desde esta copia; la distribución
              conserva el snapshot guardado.
            </p>
          )}
        </div>
        <div>
          <h4 className="text-sm font-extrabold text-slate-950">
            Documentos y asignaciones
          </h4>
          <div className="mt-2 rounded-lg border border-slate-300 bg-white p-3 text-sm">
            {originalDoc && (
              <a
                href={`/api/admin/finanzas/facturas/${encodeURIComponent(originalDoc.facturaId)}/pdf`}
                target="_blank"
                className="flex items-center gap-1 font-bold text-blue-900 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <DocumentArrowDownIcon className="h-4 w-4" />
                Original:{" "}
                {originalDoc.factura.numFactura ||
                  originalDoc.factura.proveedor}
              </a>
            )}
            {source.tienePdf && (
              <a
                href={
                  source.documentoPendiente
                    ? `${API}/pendientes/${encodeURIComponent(source.documentoPendiente.id)}/pdf`
                    : `${API}/${encodeURIComponent(source.id)}/pdf`
                }
                target="_blank"
                className="mt-2 flex items-center gap-1 font-bold text-blue-900 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <DocumentArrowDownIcon className="h-4 w-4" />
                PDF aportado
                {source.documentoNombre ? `: ${source.documentoNombre}` : ""}
              </a>
            )}
            {refacturaDoc && (
              <Link
                href={`/admin/finanzas/facturas/${encodeURIComponent(refacturaDoc.facturaId)}`}
                className="mt-2 flex items-center gap-1 font-bold text-violet-950 underline focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <LinkIcon className="h-4 w-4" />
                Refactura:{" "}
                {refacturaDoc.factura.numFactura ||
                  refacturaDoc.factura.proveedor}
              </Link>
            )}
            {!originalDoc && !source.tienePdf && !refacturaDoc && (
              <p className="text-slate-700">No hay documento disponible.</p>
            )}
            <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3">
              {source.asignaciones.length ? (
                source.asignaciones.map((item) => (
                  <li
                    key={`${item.indice}-${item.grupoId}`}
                    className="flex justify-between gap-3 text-xs"
                  >
                    <span className="text-slate-800">
                      {item.indice === -1
                        ? "Factura completa"
                        : item.descripcion ||
                          `Artículo ${item.indice + 1}`}{" "}
                      <strong>→ {item.grupo.nombre}</strong>
                    </span>
                    <span className="font-bold tabular-nums text-slate-950">
                      {item.importe === null ? "—" : money(item.importe)}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-slate-700">Sin asignaciones.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
      {source.snapshot.lineas.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-300 bg-white">
          <table className="min-w-[520px] w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs font-extrabold uppercase tracking-wide text-slate-800">
              <tr>
                <th className="px-3 py-2">Artículo</th>
                <th className="px-3 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {source.snapshot.lineas.map((line) => (
                <tr key={line.index}>
                  <td className="px-3 py-2 text-slate-900">
                    {line.descripcion || `Artículo ${line.index + 1}`}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-950">
                    {line.importe === null ? "No válido" : money(line.importe)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function SourceRow({
  source,
  canWrite,
  open,
  loadingDetail,
  onToggle,
  onEdit,
}: {
  source: Fuente;
  canWrite: boolean;
  open: boolean;
  loadingDetail: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="bg-white">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-700"
        >
          <span className="mt-0.5 rounded p-0.5 text-slate-700">
            {open ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronRightIcon className="h-5 w-5" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-slate-950">
                {source.snapshot.numFactura || "Factura sin número"}
              </span>
              {badge(source.estado)}
              {source.documentoCambiado && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-950">
                  Snapshot editado
                </span>
              )}
            </span>
            <span className="mt-1 block text-sm text-slate-800">
              {source.snapshot.proveedor} · {formatDate(source.snapshot.fecha)}{" "}
              · {source.periodo}
            </span>
            <span className="mt-1 block truncate text-xs text-slate-700">
              {source.snapshot.concepto || "Sin concepto"} ·{" "}
              {source.asignaciones.length} asignación
              {source.asignaciones.length === 1 ? "" : "es"}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <span className="text-base font-extrabold tabular-nums text-slate-950">
            {money(source.snapshot.base)}
          </span>
          {canWrite && source.estado !== "ARCHIVADO" && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-extrabold text-blue-950 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Editar
            </button>
          )}
        </div>
      </div>
      {open &&
        (loadingDetail ? (
          <p className="border-t border-slate-200 px-5 py-4 text-sm text-slate-700">
            Cargando detalle…
          </p>
        ) : (
          <SourceDetail source={source} />
        ))}
    </li>
  );
}

export default function OperatorCosts() {
  const [periodo, setPeriodo] = useState("");
  const [filterByMonth, setFilterByMonth] = useState(false);
  const [batch, setBatch] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchGroupId, setBatchGroupId] = useState("");
  const [buscar, setBuscar] = useState("");
  const [origen, setOrigen] = useState<"" | Origen>("");
  const [estado, setEstado] = useState<"" | Estado>("");
  const [grupoId, setGrupoId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [editor, setEditor] = useState<Fuente | null | "new">(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [pendingDocument, setPendingDocument] = useState<
    PendingDocument | undefined
  >();
  const [pendingBusy, setPendingBusy] = useState(false);
  const active = useRef("");
  const controller = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const key = [
    periodo,
    buscar.trim(),
    origen,
    estado,
    grupoId,
    page,
    refresh,
  ].join("|");
  useEffect(() => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    active.current = key;
    const params = new URLSearchParams({
      page: String(page),
      buscar: buscar.trim(),
    });
    if (periodo) params.set("periodo", periodo);
    if (origen) params.set("origen", origen);
    if (estado) params.set("estado", estado);
    if (grupoId) params.set("grupoId", grupoId);
    setLoading((value) => !data || value);
    setError("");
    json<ListResponse>(`${API}?${params}`, { signal: next.signal })
      .then((result) => {
        if (!next.signal.aborted && active.current === key) setData(result);
      })
      .catch((cause) => {
        if (!next.signal.aborted && active.current === key)
          setError(message(cause));
      })
      .finally(() => {
        if (!next.signal.aborted && active.current === key) setLoading(false);
      });
    return () => next.abort();
  }, [key]);
  useEffect(
    () => () => {
      controller.current?.abort();
      detailController.current?.abort();
    },
    [],
  );
  function apply() {
    setPage(1);
    setRefresh((value) => value + 1);
  }
  async function toggle(source: Fuente) {
    const isOpen = expanded.has(source.id);
    setExpanded((items) => {
      const next = new Set(items);
      if (isOpen) next.delete(source.id);
      else next.add(source.id);
      return next;
    });
    if (isOpen) return;
    detailController.current?.abort();
    const currentRequest = new AbortController();
    detailController.current = currentRequest;
    setDetailLoading(source.id);
    try {
      const detail = await json<DetailResponse>(
        `${API}?action=detalle&id=${encodeURIComponent(source.id)}`,
        { signal: currentRequest.signal },
      );
      if (currentRequest.signal.aborted) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              grupos: detail.grupos,
              canWrite: detail.canWrite,
              fuentes: previous.fuentes.map((item) =>
                item.id === source.id ? detail.fuente : item,
              ),
            }
          : previous,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      if (!currentRequest.signal.aborted) setDetailLoading(null);
    }
  }
  async function edit(source: Fuente) {
    if (batchBusy || pendingBusy) return;
    detailController.current?.abort();
    const currentRequest = new AbortController();
    detailController.current = currentRequest;
    setDetailLoading(source.id);
    try {
      const detail = await json<DetailResponse>(
        `${API}?action=detalle&id=${encodeURIComponent(source.id)}`,
        { signal: currentRequest.signal },
      );
      if (currentRequest.signal.aborted) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              grupos: detail.grupos,
              canWrite: detail.canWrite,
              fuentes: previous.fuentes.map((item) =>
                item.id === source.id ? detail.fuente : item,
              ),
            }
          : previous,
      );
      setPendingDocument(undefined);
      setEditor(detail.fuente);
    } catch (cause) {
      setError(message(cause));
    } finally {
      if (!currentRequest.signal.aborted) setDetailLoading(null);
    }
  }
  function openReceivedInvoicePicker() {
    if (batchBusy || pendingBusy) return;
    setBatch(false);
    setPendingDocument(undefined);
    setEditorRevision((value) => value + 1);
    setEditor("new");
    window.requestAnimationFrame(() => {
      document
        .getElementById("editor-heading")
        ?.scrollIntoView({ block: "start", behavior: "auto" });
      document
        .getElementById("operator-invoice-search")
        ?.focus({ preventScroll: true });
    });
  }
  const own =
    data?.fuentes.filter((source) => source.origen === "PROPIA") || [];
  const third =
    data?.fuentes.filter((source) => source.origen === "TERCERO") || [];
  const canWrite = Boolean(data?.canWrite);
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10 text-slate-900">
      <header className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-extrabold text-blue-900">
              <Link
                href="/admin/finanzas/analitica-costes"
                className="hover:underline"
              >
                Finanzas · Analítica de costes
              </Link>{" "}
              · Operadora
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
              Costes de operadora
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              Organiza las facturas y sus artículos por centro de coste,
              independientemente del mes. Un mismo centro puede reunir todas las
              facturas que selecciones. Las fechas solo sirven para consultar su
              evolución; las refacturas no duplican el coste.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <button
                type="button"
                disabled={batchBusy || pendingBusy}
                onClick={() => {
                  if (batchBusy || pendingBusy) return;
                  setEditor(null);
                  setPendingDocument(undefined);
                  setBatchGroupId(grupoId);
                  setBatch(true);
                }}
                className="rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 focus:ring-2 focus:ring-blue-700"
              >
                Asignar varias facturas a un centro
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={openReceivedInvoicePicker}
                disabled={batchBusy || pendingBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
              >
                <PlusIcon className="h-4 w-4" />
                Añadir una factura
              </button>
            )}
            <button
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-950 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-60"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar
            </button>
          </div>
        </div>
        {data && !canWrite && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
            Tienes acceso de consulta. No puedes crear, editar ni archivar
            fuentes.
          </p>
        )}
      </header>
      {data?.resumen ? (
        <section
          aria-label="Resumen de centros de coste"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <Metric
            label="Base seleccionada"
            value={money(data.resumen.baseSeleccionada)}
            tone="blue"
          />
          <Metric
            label="Coste propio seleccionado"
            value={money(data.resumen.basePropia)}
          />
          <Metric
            label="Coste pendiente de refactura"
            value={money(data.resumen.basePendienteRefacturacion)}
            tone="amber"
          />
          <Metric
            label="Internet Operadores"
            value={integer.format(data.resumen.propias)}
          />
          <Metric
            label="Otras empresas"
            value={integer.format(data.resumen.terceros)}
          />
          <Metric
            label="Borradores"
            value={integer.format(data.resumen.borradores)}
            tone="amber"
          />
          <Metric
            label="Revisadas"
            value={integer.format(data.resumen.revisadas)}
            tone="green"
          />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
            />
          ))}
        </section>
      )}
      <section
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        aria-labelledby="filters-heading"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="filters-heading"
              className="text-lg font-extrabold text-slate-950"
            >
              Filtros
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Estos filtros buscan solo costes ya registrados en este apartado.
              Para localizar una factura recibida existente, pulsa «Seleccionar
              factura recibida».
            </p>
          </div>
          {data && (
            <p className="text-sm font-bold text-slate-800">
              {integer.format(data.total)} fuente{data.total === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className={labelClass}>Fechas de consulta</label>
            <select
              id="filter-date-mode"
              aria-label="Fechas de consulta"
              value={filterByMonth ? "month" : "all"}
              onChange={(e) => {
                const limited = e.target.value === "month";
                setFilterByMonth(limited);
                setPeriodo(limited ? nowPeriod() : "");
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="all">Todo el histórico</option>
              <option value="month">Consultar un mes</option>
            </select>
            {filterByMonth && (
              <input
                id="filter-period"
                aria-label="Mes de consulta"
                type="month"
                value={periodo}
                onChange={(e) => {
                  setPeriodo(e.target.value);
                  setPage(1);
                }}
                className={`${inputClass} mt-2`}
              />
            )}
            <p className="mt-1 text-xs text-slate-700">
              Solo filtra lo que ves. No asigna ni mueve facturas.
            </p>
          </div>
          <div>
            <label htmlFor="filter-origin" className={labelClass}>
              Origen
            </label>
            <select
              id="filter-origin"
              value={origen}
              onChange={(event) => {
                setOrigen(event.target.value as "" | Origen);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos los orígenes</option>
              <option value="PROPIA">Internet Operadores</option>
              <option value="TERCERO">Otra empresa</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-state" className={labelClass}>
              Estado
            </label>
            <select
              id="filter-state"
              value={estado}
              onChange={(event) => {
                setEstado(event.target.value as "" | Estado);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="REVISADO">Revisado</option>
              <option value="ARCHIVADO">Archivado</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-group" className={labelClass}>
              Centro de coste
            </label>
            <select
              id="filter-group"
              value={grupoId}
              onChange={(event) => {
                setGrupoId(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos los centros</option>
              {(data?.grupos || []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-search" className={labelClass}>
              Buscar costes registrados
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-700" />
              <input
                id="filter-search"
                value={buscar}
                onChange={(event) => {
                  setBuscar(event.target.value);
                  setPage(1);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") apply();
                }}
                placeholder="Proveedor, número o concepto"
                className={`${inputClass} pl-9 pr-9`}
              />
              {buscar && (
                <button
                  type="button"
                  onClick={() => setBuscar("")}
                  className="absolute right-2 top-2 rounded p-1 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  aria-label="Borrar búsqueda"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={apply}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
            Aplicar filtros
          </button>
        </div>
      </section>
      {error && (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            <strong>No se ha podido cargar la información.</strong> {error}
          </span>
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className="rounded-lg border border-red-400 bg-white px-3 py-2 text-sm font-extrabold text-red-950 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-700"
          >
            Reintentar
          </button>
        </section>
      )}
      <PendingRefactoringDocuments
        refreshToken={refresh}
        canWrite={canWrite && !batchBusy}
        onBusyChange={setPendingBusy}
        onRefresh={() => setRefresh((v) => v + 1)}
        onUseDocument={(doc) => {
          if (batchBusy || pendingBusy) return;
          setPendingDocument(doc);
          setBatch(false);
          setEditorRevision((v) => v + 1);
          setEditor("new");
          window.requestAnimationFrame(() =>
            document
              .getElementById("editor-heading")
              ?.scrollIntoView({ block: "start" }),
          );
        }}
      />
      {batch && (
        <OperatorCostBatch
          grupos={data?.grupos || []}
          initialGroupId={batchGroupId}
          onBusyChange={setBatchBusy}
          onSaved={() => setRefresh((v) => v + 1)}
          onClose={() => setBatch(false)}
        />
      )}
      {editor && (
        <CostEditor
          key={editor === "new" ? `new-${editorRevision}` : editor.id}
          source={editor === "new" ? undefined : editor}
          pendingDocument={editor === "new" ? pendingDocument : undefined}
          initialGroups={data?.grupos || []}
          canWrite={canWrite}
          onClose={() => setEditor(null)}
          onSaved={() => setRefresh((value) => value + 1)}
        />
      )}
      <GroupPanel
        grupos={data?.grupos || []}
        canWrite={canWrite}
        onCreated={() => setRefresh((value) => value + 1)}
      />
      <section
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="own-heading"
      >
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2
              id="own-heading"
              className="text-lg font-extrabold text-slate-950"
            >
              Facturas de Internet Operadores
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Aquí aparecen las facturas que hayas añadido como coste de
              operadora, no todas las recibidas. El selector consulta las
              facturas existentes de proveedores en todo el histórico.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-slate-800">
              {own.length} registradas en esta página
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={openReceivedInvoicePicker}
                disabled={batchBusy || pendingBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                Seleccionar factura recibida
              </button>
            )}
          </div>
        </div>
        {loading && !data ? (
          <p className="px-5 py-10 text-center text-sm font-bold text-slate-700">
            Cargando fuentes…
          </p>
        ) : own.length ? (
          <ul className="divide-y divide-slate-200">
            {own.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                canWrite={canWrite && !batchBusy}
                open={expanded.has(source.id)}
                loadingDetail={detailLoading === source.id}
                onToggle={() => toggle(source)}
                onEdit={() => edit(source)}
              />
            ))}
          </ul>
        ) : (
          <EmptySection
            label="No hay facturas añadidas como coste de operadora para estos filtros."
            hint="Esto no significa que falten facturas recibidas. Usa «Seleccionar factura recibida» para buscar Cogent u otro proveedor, elegir la factura y revisar sus artículos."
          />
        )}
      </section>
      <section
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="third-heading"
      >
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2
              id="third-heading"
              className="text-lg font-extrabold text-slate-950"
            >
              Costes de terceros · pendientes de recibir por refacturación
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Servicios utilizados por Internet Operadores con documentos a
              nombre de otra empresa. No son facturas recibidas propias ni pagos
              pendientes. Su coste se conserva para el análisis económico; la
              futura refactura no lo duplica.
            </p>
          </div>
          <span className="text-sm font-bold text-slate-800">
            {third.length} en esta página
          </span>
        </div>
        {third.length ? (
          <ul className="divide-y divide-slate-200">
            {third.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                canWrite={canWrite && !batchBusy}
                open={expanded.has(source.id)}
                loadingDetail={detailLoading === source.id}
                onToggle={() => toggle(source)}
                onEdit={() => edit(source)}
              />
            ))}
          </ul>
        ) : (
          <EmptySection label="No hay facturas de otras empresas ni refacturas para estos filtros." />
        )}
        {data && (
          <Pager
            page={page}
            total={data.total}
            totalPages={data.totalPages}
            busy={loading}
            onPage={(next) => {
              setPage(next);
              setRefresh((value) => value + 1);
            }}
            label="Paginación de fuentes de coste"
          />
        )}
      </section>
    </div>
  );
}
function EmptySection({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <DocumentTextIcon className="mx-auto h-9 w-9 text-slate-500" />
      <p className="mt-3 text-sm font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-700">
        {hint ||
          "Cambia los filtros o registra una nueva fuente cuando corresponda."}
      </p>
    </div>
  );
}
