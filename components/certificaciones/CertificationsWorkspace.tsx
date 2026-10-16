"use client";

import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  LockClosedIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Norma = "ISO27001" | "TISAX";
type ProgramaEstado =
  | "POR_DEFINIR"
  | "IMPLANTACION"
  | "PREPARACION_AUDITORIA"
  | "AUDITORIA"
  | "VIGENTE";
type HitoEstado = "PENDIENTE" | "EN_CURSO" | "COMPLETADO" | "NO_APLICA";
type DocumentoTipo =
  | "BORRADOR"
  | "POLITICA"
  | "PROCEDIMIENTO"
  | "EVIDENCIA"
  | "CERTIFICADO"
  | "RESULTADO_TISAX";
type StatusTone = "slate" | "amber" | "blue" | "green" | "red";

type Hito = {
  id: string;
  clave: string;
  titulo: string;
  descripcion: string | null;
  estado: HitoEstado;
  responsable: string | null;
  fechaObjetivo: string | null;
  evidencia: string | null;
  notas: string | null;
  version: number;
  orden: number;
};

type Documento = {
  id: string;
  titulo: string;
  tipo: DocumentoTipo;
  nombreArchivo: string;
  mime: string;
  createdAt: string;
};

type Programa = {
  id: string;
  norma: Norma;
  estado: ProgramaEstado;
  consultora: string | null;
  responsable: string | null;
  aprobador: string | null;
  alcance: string | null;
  notas: string | null;
  entidad: string | null;
  referencia: string | null;
  fechaEmision: string | null;
  fechaCaducidad: string | null;
  documentoAcreditacionId: string | null;
  version: number;
  hitos: Hito[];
  documentos: Documento[];
  avance: {
    porcentaje: number | null;
    completados: number;
    aplicables: number;
    pendientes: number;
    enCurso: number;
    noAplican: number;
  };
  canWrite: boolean;
};

type ApiResponse = { programas: Programa[]; canWrite?: boolean };
type Props = { norma?: Norma };

const API = "/api/admin/certificaciones";
const inputClass =
  "w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm placeholder:text-slate-500 focus:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";
const labelClass = "mb-1 block text-sm font-bold text-slate-950";

const NORMA_COPY: Record<
  Norma,
  { title: string; route: string; eyebrow: string }
> = {
  ISO27001: {
    title: "ISO 27001",
    route: "/admin/certificaciones/iso-27001",
    eyebrow: "Sistema de gestión de la seguridad de la información",
  },
  TISAX: {
    title: "TISAX",
    route: "/admin/certificaciones/tisax",
    eyebrow: "Evaluación de seguridad de la información para automoción",
  },
};

const estadoPrograma: Record<ProgramaEstado, string> = {
  POR_DEFINIR: "Por definir",
  IMPLANTACION: "En implantación",
  PREPARACION_AUDITORIA: "Preparación de auditoría",
  AUDITORIA: "En auditoría",
  VIGENTE: "Vigente",
};
const estadoHito: Record<HitoEstado, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  NO_APLICA: "No aplica",
};
const tipoDocumento: Record<DocumentoTipo, string> = {
  BORRADOR: "Borrador",
  POLITICA: "Política",
  PROCEDIMIENTO: "Procedimiento",
  EVIDENCIA: "Evidencia",
  CERTIFICADO: "Certificado",
  RESULTADO_TISAX: "Resultado TISAX",
};

function normalizarFecha(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value?: string | null) {
  if (!value) return "No indicado";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return value.slice(0, 10) < localToday;
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function errorMessage(body: unknown, status: number) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  if (status === 409) {
    return "Hay una versión más reciente de este seguimiento. Tus cambios no se han descartado; recarga y revisa la información antes de volver a guardar.";
  }
  return `No se ha podido guardar (error ${status}).`;
}

async function requestJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  return body as T;
}

function estadoVisual(
  programa: Pick<Programa, "estado" | "fechaCaducidad" | "norma">,
): { label: string; tone: StatusTone } {
  if (programa.estado === "VIGENTE" && isExpired(programa.fechaCaducidad)) {
    return { label: "Caducado", tone: "red" };
  }
  if (programa.estado === "VIGENTE" && programa.norma === "TISAX") {
    return { label: "Evaluación vigente", tone: "green" };
  }
  const tone =
    programa.estado === "VIGENTE"
      ? "green"
      : programa.estado === "AUDITORIA"
        ? "blue"
        : programa.estado === "POR_DEFINIR"
          ? "slate"
          : "amber";
  return { label: estadoPrograma[programa.estado], tone };
}

function StatusBadge({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: StatusTone;
}) {
  const classes = {
    slate: "border-slate-400 bg-slate-100 text-slate-950",
    amber: "border-amber-500 bg-amber-50 text-amber-950",
    blue: "border-blue-700 bg-blue-50 text-blue-950",
    green: "border-emerald-700 bg-emerald-50 text-emerald-950",
    red: "border-red-700 bg-red-50 text-red-950",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold ${classes}`}
    >
      {label}
    </span>
  );
}

function HitoBadge({ estado }: { estado: HitoEstado }) {
  const tone =
    estado === "COMPLETADO"
      ? "green"
      : estado === "EN_CURSO"
        ? "blue"
        : estado === "NO_APLICA"
          ? "slate"
          : "amber";
  return <StatusBadge label={estadoHito[estado]} tone={tone} />;
}

function Progress({
  avance,
  norma,
}: {
  avance: Programa["avance"];
  norma: Norma;
}) {
  if (avance.porcentaje === null) {
    return (
      <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
        <p className="text-sm font-extrabold text-slate-950">
          Pendiente de cuantificar
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-700">
          Aún no hay hitos aplicables verificados para calcular el avance del
          plan.
        </p>
      </div>
    );
  }
  const percentage = Math.max(0, Math.min(100, avance.porcentaje));
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <p className="text-sm font-extrabold text-slate-950">
          Avance del plan interno
        </p>
        <p className="text-lg font-black text-slate-950">
          {new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(
            percentage,
          )}
          %
        </p>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-slate-200"
        aria-label={`Avance ${percentage}%`}
      >
        <div
          className="h-full rounded-full bg-blue-800"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-700">
        {avance.completados} completados · {avance.enCurso} en curso ·{" "}
        {avance.pendientes} pendientes · {avance.noAplican} no aplican
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-700">
        El porcentaje pondera por igual los hitos aplicables del plan interno;
        no mide el grado de cumplimiento ni concede una certificación
        {norma === "TISAX" ? " o evaluación" : ""}.
      </p>
    </div>
  );
}

function PrivateContext({
  norma,
  compact = false,
}: {
  norma?: Norma;
  compact?: boolean;
}) {
  return (
    <aside
      className={`rounded-xl border-2 border-indigo-800 bg-indigo-50 ${compact ? "p-3" : "p-4"}`}
      aria-label="Información privada de seguimiento"
    >
      <div className="flex gap-3">
        <LockClosedIcon
          className="mt-0.5 h-5 w-5 shrink-0 text-indigo-950"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-black text-indigo-950">
            Información privada de seguimiento
          </p>
          <p className="mt-1 text-sm leading-6 text-indigo-950">
            Situación interna confirmada el{" "}
            <strong>16 de octubre de 2026</strong>: no consta una certificación
            ISO 27001 ni una evaluación TISAX vigente. ISO 27001 se encuentra en
            implantación con Level4; se ha indicado a{" "}
            <strong>Esteve Busquets</strong> como responsable técnico y a{" "}
            <strong>David Pérez</strong> como aprobador. Los equipos indicados
            son prestados por Draxton. Planta y alcance siguen pendientes de
            definir.
          </p>
          {norma === "TISAX" && (
            <p className="mt-2 border-t border-indigo-300 pt-2 text-sm font-bold leading-6 text-indigo-950">
              Aviso: la entrega documental prevista para Draxton el 21 de
              octubre de 2026 no es una auditoría TISAX de Internet Operadores.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function OverviewCard({
  norma,
  programa,
}: {
  norma: Norma;
  programa?: Programa;
}) {
  const copy = NORMA_COPY[norma];
  const status = programa
    ? estadoVisual(programa)
    : {
        label: norma === "ISO27001" ? "En implantación" : "Por definir",
        tone: norma === "ISO27001" ? ("amber" as const) : ("slate" as const),
      };
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="rounded-xl bg-blue-900 p-2.5 text-white">
            <ShieldCheckIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-blue-900">
              {copy.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {copy.title}
            </h2>
          </div>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>
      <div className="mt-5 min-h-[122px]">
        {programa ? (
          <Progress avance={programa.avance} norma={norma} />
        ) : (
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
            <p className="text-sm font-extrabold text-slate-950">
              Pendiente de cuantificar
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              No se muestran porcentajes sin hitos verificados.
            </p>
          </div>
        )}
      </div>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <Link
          href={copy.route}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-800 focus:ring-offset-2"
        >
          Abrir seguimiento{" "}
          <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-sm font-bold leading-5 text-red-950"
    >
      {children}
    </div>
  );
}

function ProgramEditor({
  programa,
  canWrite,
  onSaved,
}: {
  programa: Programa;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    estado: programa.estado,
    consultora: programa.consultora || "",
    responsable: programa.responsable || "",
    aprobador: programa.aprobador || "",
    alcance: programa.alcance || "",
    notas: programa.notas || "",
    entidad: programa.entidad || "",
    referencia: programa.referencia || "",
    fechaEmision: normalizarFecha(programa.fechaEmision),
    fechaCaducidad: normalizarFecha(programa.fechaCaducidad),
    documentoAcreditacionId: programa.documentoAcreditacionId || "",
  });

  useEffect(() => {
    setForm({
      estado: programa.estado,
      consultora: programa.consultora || "",
      responsable: programa.responsable || "",
      aprobador: programa.aprobador || "",
      alcance: programa.alcance || "",
      notas: programa.notas || "",
      entidad: programa.entidad || "",
      referencia: programa.referencia || "",
      fechaEmision: normalizarFecha(programa.fechaEmision),
      fechaCaducidad: normalizarFecha(programa.fechaCaducidad),
      documentoAcreditacionId: programa.documentoAcreditacionId || "",
    });
  }, [programa]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestJson(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "actualizar_programa",
          norma: programa.norma,
          version: programa.version,
          estado: form.estado,
          consultora: nullable(form.consultora),
          responsable: nullable(form.responsable),
          aprobador: nullable(form.aprobador),
          alcance: nullable(form.alcance),
          notas: nullable(form.notas),
          entidad: nullable(form.entidad),
          referencia: nullable(form.referencia),
          fechaEmision: form.fechaEmision || null,
          fechaCaducidad: form.fechaCaducidad || null,
          documentoAcreditacionId: nullable(form.documentoAcreditacionId),
        }),
      });
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se ha podido guardar el seguimiento.",
      );
    } finally {
      setBusy(false);
    }
  }

  const set = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const entityLabel =
    programa.norma === "TISAX" ? "Organización evaluadora" : "Entidad emisora";
  const referenceLabel =
    programa.norma === "TISAX"
      ? "Referencia de evaluación"
      : "Referencia del certificado";
  return (
    <details
      className="rounded-xl border-2 border-blue-800 bg-blue-50"
      open={false}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-black text-blue-950 marker:content-none">
        <span className="inline-flex items-center gap-2">
          <PencilSquareIcon className="h-5 w-5" aria-hidden="true" />
          Editar seguimiento
        </span>
        <span className="text-xs font-bold">Campos compactos</span>
      </summary>
      <form onSubmit={submit} className="border-t border-blue-200 p-4">
        <p className="mb-4 text-xs leading-5 text-slate-800">
          Guardar actualiza solo el seguimiento interno. Un avance del 100 % no
          concede por sí mismo una certificación ni una evaluación.
        </p>
        {error && (
          <div className="mb-4">
            <ErrorNotice>{error}</ErrorNotice>
          </div>
        )}
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          <label>
            <span className={labelClass}>Estado</span>
            <select
              value={form.estado}
              onChange={(event) => set("estado", event.target.value)}
              className={inputClass}
            >
              {Object.entries(estadoPrograma).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Consultora</span>
            <input
              value={form.consultora}
              onChange={(event) => set("consultora", event.target.value)}
              className={inputClass}
              maxLength={160}
            />
          </label>
          <label>
            <span className={labelClass}>Responsable</span>
            <input
              value={form.responsable}
              onChange={(event) => set("responsable", event.target.value)}
              className={inputClass}
              maxLength={160}
            />
          </label>
          <label>
            <span className={labelClass}>Aprobador</span>
            <input
              value={form.aprobador}
              onChange={(event) => set("aprobador", event.target.value)}
              className={inputClass}
              maxLength={160}
            />
          </label>
          <label>
            <span className={labelClass}>{entityLabel}</span>
            <input
              value={form.entidad}
              onChange={(event) => set("entidad", event.target.value)}
              className={inputClass}
              maxLength={160}
            />
          </label>
          <label>
            <span className={labelClass}>{referenceLabel}</span>
            <input
              value={form.referencia}
              onChange={(event) => set("referencia", event.target.value)}
              className={inputClass}
              maxLength={160}
            />
          </label>
          <label>
            <span className={labelClass}>Fecha de emisión</span>
            <input
              type="date"
              value={form.fechaEmision}
              onChange={(event) => set("fechaEmision", event.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>
              {programa.norma === "TISAX"
                ? "Fecha de caducidad de la evaluación"
                : "Fecha de caducidad"}
            </span>
            <input
              type="date"
              value={form.fechaCaducidad}
              onChange={(event) => set("fechaCaducidad", event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Alcance / planta</span>
            <textarea
              value={form.alcance}
              onChange={(event) => set("alcance", event.target.value)}
              className={inputClass}
              rows={2}
              maxLength={2000}
            />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Notas internas</span>
            <textarea
              value={form.notas}
              onChange={(event) => set("notas", event.target.value)}
              className={inputClass}
              rows={3}
              maxLength={4000}
            />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Documento acreditativo</span>
            <select
              value={form.documentoAcreditacionId}
              onChange={(event) =>
                set("documentoAcreditacionId", event.target.value)
              }
              className={inputClass}
            >
              <option value="">Sin documento acreditativo</option>
              {programa.documentos
                .filter(
                  (doc) =>
                    doc.tipo ===
                    (programa.norma === "ISO27001"
                      ? "CERTIFICADO"
                      : "RESULTADO_TISAX"),
                )
                .map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.titulo}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-800 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {busy ? "Guardando…" : "Guardar seguimiento"}
          </button>
          <span className="text-xs font-semibold text-slate-700">
            Los campos quedan bloqueados mientras se guarda.
          </span>
        </div>
      </form>
    </details>
  );
}

function HitoEditor({
  hito,
  norma,
  canWrite,
  onSaved,
}: {
  hito: Hito;
  norma: Norma;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    estado: hito.estado,
    responsable: hito.responsable || "",
    fechaObjetivo: normalizarFecha(hito.fechaObjetivo),
    evidencia: hito.evidencia || "",
    notas: hito.notas || "",
  });
  useEffect(() => {
    setForm({
      estado: hito.estado,
      responsable: hito.responsable || "",
      fechaObjetivo: normalizarFecha(hito.fechaObjetivo),
      evidencia: hito.evidencia || "",
      notas: hito.notas || "",
    });
  }, [hito]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const evidence = form.evidencia.trim();
    if (
      (form.estado === "COMPLETADO" || form.estado === "NO_APLICA") &&
      evidence.length < 15
    ) {
      setError(
        form.estado === "NO_APLICA"
          ? "Indica un motivo de al menos 15 caracteres para marcar «No aplica»."
          : "Incluye una evidencia de al menos 15 caracteres para completar el hito.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestJson(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "actualizar_hito",
          norma,
          id: hito.id,
          version: hito.version,
          estado: form.estado,
          responsable: nullable(form.responsable),
          fechaObjetivo: form.fechaObjetivo || null,
          evidencia: nullable(form.evidencia),
          notas: nullable(form.notas),
        }),
      });
      setOpen(false);
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se ha podido guardar el hito.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite) return null;
  const set = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-400 bg-white px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-800"
      >
        <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
        {open ? "Cerrar edición" : "Actualizar hito"}
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3"
        >
          <p className="mb-3 text-xs leading-5 text-slate-800">
            Para marcar «Completado» se exige una evidencia de al menos 15
            caracteres. Para «No aplica», describe el motivo en evidencia
            (mínimo 15 caracteres).
          </p>
          {error && (
            <div className="mb-3">
              <ErrorNotice>{error}</ErrorNotice>
            </div>
          )}
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Estado</span>
              <select
                value={form.estado}
                onChange={(event) => set("estado", event.target.value)}
                className={inputClass}
              >
                {Object.entries(estadoHito).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Responsable</span>
              <input
                value={form.responsable}
                onChange={(event) => set("responsable", event.target.value)}
                className={inputClass}
                maxLength={160}
              />
            </label>
            <label>
              <span className={labelClass}>Fecha objetivo</span>
              <input
                type="date"
                value={form.fechaObjetivo}
                onChange={(event) => set("fechaObjetivo", event.target.value)}
                className={inputClass}
              />
            </label>
            <div className="hidden sm:block" />
            <label className="sm:col-span-2">
              <span className={labelClass}>Evidencia o motivo</span>
              <textarea
                value={form.evidencia}
                onChange={(event) => set("evidencia", event.target.value)}
                className={inputClass}
                rows={2}
                maxLength={4000}
              />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClass}>Notas internas</span>
              <textarea
                value={form.notas}
                onChange={(event) => set("notas", event.target.value)}
                className={inputClass}
                rows={2}
                maxLength={4000}
              />
            </label>
          </fieldset>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 rounded-lg bg-blue-900 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-800 disabled:bg-slate-500"
          >
            {busy ? "Guardando…" : "Guardar hito"}
          </button>
        </form>
      )}
    </div>
  );
}

function HitosPanel({
  programa,
  canWrite,
  onSaved,
}: {
  programa: Programa;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<
    "TODOS" | "PENDIENTE" | "EN_CURSO" | "COMPLETADO"
  >("TODOS");
  const hitos = useMemo(
    () =>
      programa.hitos.filter(
        (hito) => filter === "TODOS" || hito.estado === filter,
      ),
    [filter, programa.hitos],
  );
  return (
    <section aria-labelledby="hitos-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="hitos-title" className="text-lg font-black text-slate-950">
            Hitos del plan
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Seguimiento operativo. No equivale a una certificación o evaluación.
          </p>
        </div>
        <label className="block">
          <span className="sr-only">Filtrar hitos</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className={`${inputClass} min-w-[180px]`}
          >
            <option value="TODOS">Todos los hitos</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="EN_CURSO">En curso</option>
            <option value="COMPLETADO">Completados</option>
          </select>
        </label>
      </div>
      <div className="mt-4 space-y-3">
        {hitos.length === 0 ? (
          <p className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-800">
            No hay hitos con este filtro.
          </p>
        ) : (
          hitos.map((hito) => (
            <article
              key={hito.id}
              className="rounded-xl border-2 border-slate-300 bg-white p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-600">
                      {hito.clave}
                    </p>
                    <HitoBadge estado={hito.estado} />
                  </div>
                  <h3 className="mt-1 text-base font-black text-slate-950">
                    {hito.titulo}
                  </h3>
                  {hito.descripcion && (
                    <p className="mt-1 text-sm leading-6 text-slate-800">
                      {hito.descripcion}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-left text-xs leading-5 text-slate-700 sm:text-right">
                  <p>
                    <strong>Responsable:</strong>{" "}
                    {hito.responsable || "No asignado"}
                  </p>
                  <p>
                    <strong>Objetivo:</strong> {formatDate(hito.fechaObjetivo)}
                  </p>
                </div>
              </div>
              {(hito.evidencia || hito.notas) && (
                <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-extrabold text-slate-950">
                      Evidencia / motivo
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">
                      {hito.evidencia || "Sin evidencia registrada"}
                    </p>
                  </div>
                  {hito.notas && (
                    <div>
                      <p className="font-extrabold text-slate-950">Notas</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-800">
                        {hito.notas}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <HitoEditor
                hito={hito}
                norma={programa.norma}
                canWrite={canWrite}
                onSaved={onSaved}
              />
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function DocumentUpload({
  norma,
  onUploaded,
}: {
  norma: Norma;
  onUploaded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Selecciona un archivo PDF o DOCX.");
      return;
    }
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type) || file.size > 4 * 1024 * 1024) {
      setError("El archivo debe ser PDF o DOCX y no superar 4 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      form.set("norma", norma);
      const response = await fetch(`${API}/documentos`, {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, response.status));
      (event.target as HTMLFormElement).reset();
      setSuccess(
        "Documento cargado. No se ha modificado ningún hito automáticamente.",
      );
      await onUploaded();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se ha podido cargar el documento.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="rounded-xl border border-slate-300 bg-slate-50"
      open={open}
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="cursor-pointer list-none p-4 text-sm font-black text-slate-950 marker:content-none">
        <span className="inline-flex items-center gap-2">
          <CloudArrowUpIcon
            className="h-5 w-5 text-blue-900"
            aria-hidden="true"
          />
          Cargar documento
        </span>
      </summary>
      <form onSubmit={submit} className="border-t border-slate-300 p-4">
        <p className="mb-3 text-xs leading-5 text-slate-700">
          PDF o DOCX, máximo 4 MB. La carga solo conserva el documento: no
          actualiza hitos automáticamente.
        </p>
        {error && (
          <div className="mb-3">
            <ErrorNotice>{error}</ErrorNotice>
          </div>
        )}
        {success && (
          <p
            role="status"
            className="mb-3 rounded-lg border border-emerald-700 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"
          >
            {success}
          </p>
        )}
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Título</span>
            <input
              name="titulo"
              required
              maxLength={240}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Tipo</span>
            <select name="tipo" defaultValue="BORRADOR" className={inputClass}>
              {Object.entries(tipoDocumento)
                .filter(([value]) =>
                  norma === "ISO27001"
                    ? value !== "RESULTADO_TISAX"
                    : value !== "CERTIFICADO",
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Archivo</span>
            <input
              name="file"
              type="file"
              required
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
              className={inputClass}
            />
          </label>
        </fieldset>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-lg bg-blue-900 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-800 disabled:bg-slate-500"
        >
          {busy ? "Cargando…" : "Subir documento"}
        </button>
      </form>
    </details>
  );
}

function DocumentsPanel({
  programa,
  canWrite,
  onSaved,
}: {
  programa: Programa;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const documentTypeLabel = (tipo: DocumentoTipo) =>
    programa.norma === "TISAX" && tipo === "CERTIFICADO"
      ? "Acreditación"
      : tipoDocumento[tipo];
  return (
    <section aria-labelledby="documentos-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="documentos-title"
            className="text-lg font-black text-slate-950"
          >
            Documentos
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Metadatos de documentación privada; las descargas requieren
            autorización.
          </p>
        </div>
        {canWrite && (
          <DocumentUpload norma={programa.norma} onUploaded={onSaved} />
        )}
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border-2 border-slate-300 bg-white">
        {programa.documentos.length === 0 ? (
          <p className="p-4 text-sm font-semibold text-slate-800">
            No hay documentos registrados para esta norma.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {programa.documentos.map((documento) => (
              <li
                key={documento.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <DocumentTextIcon
                    className="mt-0.5 h-5 w-5 shrink-0 text-blue-900"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="break-words font-black text-slate-950">
                      {documento.titulo}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-700">
                      {documento.nombreArchivo} ·{" "}
                      {formatDate(documento.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusBadge
                    label={documentTypeLabel(documento.tipo)}
                    tone={documento.tipo === "BORRADOR" ? "amber" : "slate"}
                  />
                  <a
                    href={`${API}/documentos/${encodeURIComponent(documento.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-800 bg-white px-3 py-2 text-xs font-extrabold text-blue-950 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-800"
                  >
                    <DocumentArrowDownIcon
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                    Descargar
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Detail({
  programa,
  canWrite,
  onRefresh,
}: {
  programa?: Programa;
  canWrite: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"HITOS" | "DOCUMENTOS">("HITOS");
  const norma = programa?.norma;
  if (!programa || !norma)
    return (
      <section className="rounded-2xl border-2 border-slate-300 bg-white p-6">
        <h2 className="text-xl font-black text-slate-950">
          Seguimiento pendiente de crear
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-800">
          No hay un programa disponible para esta norma. Esta pantalla no
          inventa hitos, porcentajes ni acreditaciones.
        </p>
      </section>
    );
  const visual = estadoVisual(programa);
  const copy = NORMA_COPY[norma];
  const entityLabel =
    norma === "TISAX" ? "Organización evaluadora" : "Entidad emisora";
  const refLabel =
    norma === "TISAX"
      ? "Referencia de evaluación"
      : "Referencia del certificado";
  return (
    <>
      <section className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/certificaciones"
              className="text-sm font-bold text-blue-900 underline decoration-2 underline-offset-2 hover:text-blue-700"
            >
              Certificaciones
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                {copy.title}
              </h1>
              <StatusBadge label={visual.label} tone={visual.tone} />
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-800">
              {copy.eyebrow}. Seguimiento corporativo de información y
              evidencias.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-slate-400 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-800"
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Progress avance={programa.avance} norma={norma} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
            <div>
              <dt className="font-bold text-slate-700">Responsable</dt>
              <dd className="mt-0.5 font-extrabold text-slate-950">
                {programa.responsable || "No asignado"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Aprobador</dt>
              <dd className="mt-0.5 font-extrabold text-slate-950">
                {programa.aprobador || "No asignado"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">{entityLabel}</dt>
              <dd className="mt-0.5 font-extrabold text-slate-950">
                {programa.entidad || "No indicada"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">{refLabel}</dt>
              <dd className="mt-0.5 break-words font-extrabold text-slate-950">
                {programa.referencia || "No indicada"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Emisión</dt>
              <dd className="mt-0.5 font-extrabold text-slate-950">
                {formatDate(programa.fechaEmision)}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Caducidad</dt>
              <dd className="mt-0.5 font-extrabold text-slate-950">
                {formatDate(programa.fechaCaducidad)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="mt-5 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-black text-slate-950">
              Alcance / planta
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {programa.alcance || "Pendiente de definir"}
            </p>
          </div>
          <div>
            <p className="text-sm font-black text-slate-950">Notas internas</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {programa.notas || "Sin notas registradas"}
            </p>
          </div>
        </div>
        {canWrite ? (
          <div className="mt-5">
            <ProgramEditor
              programa={programa}
              canWrite={canWrite}
              onSaved={onRefresh}
            />
          </div>
        ) : (
          <p className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm font-bold text-slate-800">
            Tienes acceso de lectura. No puedes modificar el seguimiento ni
            cargar documentos.
          </p>
        )}
      </section>
      <section className="mt-5 rounded-2xl border-2 border-slate-300 bg-white p-5">
        <div
          role="tablist"
          aria-label="Contenido de certificación"
          className="flex border-b-2 border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "HITOS"}
            onClick={() => setTab("HITOS")}
            className={`-mb-0.5 border-b-4 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-blue-800 ${tab === "HITOS" ? "border-blue-900 text-blue-950" : "border-transparent text-slate-700 hover:text-slate-950"}`}
          >
            Hitos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "DOCUMENTOS"}
            onClick={() => setTab("DOCUMENTOS")}
            className={`-mb-0.5 border-b-4 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-blue-800 ${tab === "DOCUMENTOS" ? "border-blue-900 text-blue-950" : "border-transparent text-slate-700 hover:text-slate-950"}`}
          >
            Documentos
          </button>
        </div>
        <div className="pt-5">
          {tab === "HITOS" ? (
            <HitosPanel
              programa={programa}
              canWrite={canWrite}
              onSaved={onRefresh}
            />
          ) : (
            <DocumentsPanel
              programa={programa}
              canWrite={canWrite}
              onSaved={onRefresh}
            />
          )}
        </div>
      </section>
    </>
  );
}

export default function CertificationsWorkspace({ norma }: Props) {
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = norma ? `?norma=${encodeURIComponent(norma)}` : "";
      const data = await requestJson<ApiResponse>(`${API}${query}`);
      setProgramas(Array.isArray(data.programas) ? data.programas : []);
      setCanWrite(Boolean(data.canWrite));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se ha podido cargar el seguimiento.",
      );
    } finally {
      setLoading(false);
    }
  }, [norma]);
  useEffect(() => {
    void load();
  }, [load]);

  const program = norma
    ? programas.find((item) => item.norma === norma)
    : undefined;
  const programCanWrite = Boolean(canWrite || program?.canWrite);
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {!norma && (
        <header className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-900">
            Gobierno y cumplimiento
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Certificaciones
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-800">
            Seguimiento interno de ISO 27001 y TISAX. La información de avance
            no equivale a certificación, evaluación ni grado de cumplimiento.
          </p>
        </header>
      )}
      {norma && (
        <div className="mb-5">
          <PrivateContext norma={norma} />
        </div>
      )}
      {!norma && (
        <div className="mb-5">
          <PrivateContext compact />
        </div>
      )}
      <div className="mb-5">
        <Link
          href="/admin/certificaciones/cuestionarios"
          className="inline-flex items-center gap-2 rounded-lg border-2 border-blue-800 bg-white px-4 py-2 text-sm font-bold text-blue-950 hover:bg-blue-50"
        >
          Cuestionarios de seguridad por empresa{" "}
          <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {norma === "ISO27001" && (
        <aside className="mb-5 rounded-xl border border-blue-700 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <strong>Referencia pública:</strong>{" "}
          <a
            href="https://level4.es/serveis/compliance-legal/implantacio-iso-27001/"
            target="_blank"
            rel="noreferrer"
            className="font-black underline decoration-2 underline-offset-2"
          >
            servicio de implantación ISO 27001 de Level4{" "}
            <ArrowTopRightOnSquareIcon
              className="inline h-4 w-4"
              aria-hidden="true"
            />
          </a>
          . Es una referencia del servicio y no una acreditación.
        </aside>
      )}
      {error && (
        <div className="mb-5">
          <ErrorNotice>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-md border border-red-800 bg-white px-3 py-1.5 text-xs font-black hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-800"
              >
                Reintentar
              </button>
            </div>
          </ErrorNotice>
        </div>
      )}
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-2xl border-2 border-slate-300 bg-white">
          <div className="text-center">
            <ArrowPathIcon
              className="mx-auto h-8 w-8 animate-spin text-blue-900"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-bold text-slate-800">
              Cargando seguimiento…
            </p>
          </div>
        </div>
      ) : norma ? (
        <Detail
          programa={program}
          canWrite={programCanWrite}
          onRefresh={load}
        />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {programas.map((item) => (
              <OverviewCard
                key={item.norma}
                norma={item.norma}
                programa={item}
              />
            ))}
          </div>
          <section className="mt-5 rounded-xl border-2 border-slate-300 bg-white p-4">
            <div className="flex gap-3">
              <InformationCircleIcon
                className="mt-0.5 h-5 w-5 shrink-0 text-blue-900"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-black text-slate-950">
                  Cómo se interpreta el avance
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-800">
                  El porcentaje se calcula solo cuando existen hitos aplicables
                  verificados y se basa en su peso uniforme. No es una
                  declaración de cumplimiento, no confirma controles técnicos y
                  no concede una certificación ni una evaluación.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
