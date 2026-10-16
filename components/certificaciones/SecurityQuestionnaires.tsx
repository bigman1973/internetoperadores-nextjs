"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  PlusIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import {
  completedAnswers,
  createEmptySecurityAnswers,
  PROVIDER_PROFILE,
  QUESTION_GROUPS,
  QUESTIONNAIRE_STATES,
  QUESTIONNAIRE_TITLE,
  SECURITY_QUESTIONS,
  type QuestionnaireState,
  type QuestionnaireResponseValue,
  type SecurityAnswer,
} from "@/lib/certificaciones/questionnaires";

type ListItem = {
  id: string;
  empresa: string;
  estado: QuestionnaireState;
  fechaLimite: string | null;
  version: number;
  respuestasCompletadas: number;
};

type Questionnaire = {
  id: string;
  empresa: string;
  titulo: string;
  contacto: string | null;
  emailContacto: string | null;
  fechaLimite: string | null;
  estado: QuestionnaireState;
  respuestas: SecurityAnswer[];
  version: number;
  createdAt?: string;
  updatedAt?: string;
};

const API = "/api/admin/certificaciones/cuestionarios";
const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100";
const labelClass =
  "block text-xs font-extrabold uppercase tracking-wide text-slate-700";

function dateForInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function dateForDisplay(value: string | null | undefined) {
  if (!value) return "Sin fecha límite";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? "Sin fecha límite"
    : new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function normalizeAnswers(value: unknown): SecurityAnswer[] {
  if (!Array.isArray(value)) return createEmptySecurityAnswers();
  const byId = new Map(
    value
      .filter((row): row is SecurityAnswer =>
        Boolean(row && typeof row === "object"),
      )
      .map((row) => [Number(row.id), row]),
  );
  return createEmptySecurityAnswers().map((empty) => {
    const source = byId.get(empty.id);
    return source && ["PENDIENTE", "SI", "NO", "NA"].includes(source.respuesta)
      ? {
          id: empty.id,
          respuesta: source.respuesta,
          evidencia:
            typeof source.evidencia === "string" ? source.evidencia : "",
          observacion:
            typeof source.observacion === "string" ? source.observacion : "",
        }
      : empty;
  });
}

function asQuestionnaire(value: unknown): Questionnaire {
  const row = value as Questionnaire;
  return { ...row, respuestas: normalizeAnswers(row.respuestas) };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "No se pudo completar la operación.",
    );
  return body as T;
}

function stateLabel(state: QuestionnaireState) {
  return state === "VALIDADO"
    ? "Revisado internamente"
    : state === "REVISION"
      ? "En revisión"
      : "Borrador";
}

function StateBadge({ state }: { state: QuestionnaireState }) {
  const color =
    state === "VALIDADO"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : state === "REVISION"
        ? "border-blue-300 bg-blue-50 text-blue-950"
        : "border-amber-300 bg-amber-50 text-amber-950";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-extrabold ${color}`}
    >
      {stateLabel(state)}
    </span>
  );
}

function answerTone(answer: QuestionnaireResponseValue) {
  if (answer === "SI")
    return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (answer === "NO") return "border-red-300 bg-red-50 text-red-950";
  if (answer === "NA") return "border-slate-300 bg-slate-100 text-slate-900";
  return "border-amber-300 bg-amber-50 text-amber-950";
}

function PrintQuestionnaire({
  questionnaire,
}: {
  questionnaire: Questionnaire;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const answerById = new Map(
    questionnaire.respuestas.map((answer) => [answer.id, answer]),
  );
  if (!mounted) return null;
  return createPortal(
    <section className="security-questionnaire-print" aria-hidden="true">
      <header className="print-header">
        <img
          src="/images/logo-internetoperadores.png"
          alt="Internet Operadores"
        />
        <div>
          <p className="print-kicker">
            Internet Operadores · Seguridad de la información
          </p>
          <h1>{questionnaire.titulo || QUESTIONNAIRE_TITLE}</h1>
          <p className="print-company">
            Empresa destinataria: {questionnaire.empresa}
          </p>
        </div>
      </header>
      <div className="print-status">
        {questionnaire.estado === "VALIDADO"
          ? "Revisado internamente; no certificación ni aceptación del cliente."
          : "BORRADOR — NO VALIDADO"}
      </div>
      <dl className="print-meta">
        <div>
          <dt>Contacto</dt>
          <dd>{questionnaire.contacto || "—"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{questionnaire.emailContacto || "—"}</dd>
        </div>
        <div>
          <dt>Fecha límite</dt>
          <dd>{dateForDisplay(questionnaire.fechaLimite)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{stateLabel(questionnaire.estado)}</dd>
        </div>
      </dl>
      <div className="print-provider">
        <strong>Datos del proveedor:</strong> {PROVIDER_PROFILE.proveedor}.{" "}
        {PROVIDER_PROFILE.aprobadorInterno}. {PROVIDER_PROFILE.contactoTecnico}.{" "}
        {PROVIDER_PROFILE.referenciaIso} {PROVIDER_PROFILE.referenciaTisax}
      </div>
      {QUESTION_GROUPS.map((group) => (
        <section key={group} className="print-group">
          <h2>{group}</h2>
          {SECURITY_QUESTIONS.filter(
            (question) => question.grupo === group,
          ).map((question) => {
            const answer =
              answerById.get(question.id) ||
              createEmptySecurityAnswers()[question.id - 1];
            return (
              <article key={question.id} className="print-question">
                <div className="print-question-heading">
                  <strong>{question.id}.</strong>
                  <span>{question.pregunta}</span>
                  <b>{answer.respuesta}</b>
                </div>
                <p>
                  <strong>Evidencia:</strong> {answer.evidencia || "—"}
                </p>
                <p>
                  <strong>Observación:</strong> {answer.observacion || "—"}
                </p>
              </article>
            );
          })}
        </section>
      ))}
      <footer className="print-footer">
        Plantilla de evaluación interna reutilizable. Sin firmas, sellos ni
        validación de la empresa destinataria.
      </footer>
      <style jsx global>{`
        .security-questionnaire-print {
          display: none;
        }
        @media print {
          body > *:not(.security-questionnaire-print) {
            display: none !important;
          }
          html,
          body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
          }
          .security-questionnaire-print {
            display: block !important;
            position: static;
            width: 100%;
            color: #0f172a;
            background: white;
            font-family: Arial, sans-serif;
            font-size: 9.5pt;
            line-height: 1.35;
            padding: 0;
            box-sizing: border-box;
            overflow-wrap: anywhere;
          }
          .security-questionnaire-print .print-header {
            display: flex;
            align-items: center;
            gap: 12mm;
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 4mm;
          }
          .security-questionnaire-print .print-header img {
            width: 45mm;
            height: auto;
            object-fit: contain;
          }
          .security-questionnaire-print .print-kicker {
            margin: 0 0 1mm;
            color: #1d4ed8;
            font-weight: bold;
            font-size: 8.5pt;
            text-transform: uppercase;
          }
          .security-questionnaire-print h1 {
            margin: 0;
            font-size: 16pt;
          }
          .security-questionnaire-print .print-company {
            margin: 1mm 0 0;
            font-size: 11pt;
          }
          .security-questionnaire-print .print-status {
            margin: 4mm 0;
            padding: 2.5mm;
            border: 1px solid #f59e0b;
            background: #fffbeb;
            font-weight: bold;
          }
          .security-questionnaire-print .print-meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2mm 7mm;
            margin: 3mm 0;
          }
          .security-questionnaire-print .print-meta div {
            display: grid;
            grid-template-columns: 28mm 1fr;
            border-bottom: 1px solid #cbd5e1;
            padding: 1mm 0;
          }
          .security-questionnaire-print dt {
            font-weight: bold;
          }
          .security-questionnaire-print dd {
            margin: 0;
          }
          .security-questionnaire-print .print-provider {
            margin: 4mm 0;
            padding: 3mm;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
          }
          .security-questionnaire-print .print-group {
            margin-top: 5mm;
          }
          .security-questionnaire-print h2 {
            margin: 0;
            padding: 2mm 3mm;
            font-size: 11pt;
            background: #e2e8f0;
          }
          .security-questionnaire-print .print-question {
            border: 1px solid #cbd5e1;
            border-top: 0;
            padding: 2.5mm 3mm;
            break-inside: avoid;
          }
          .security-questionnaire-print .print-question-heading {
            display: grid;
            grid-template-columns: 6mm 1fr 20mm;
            gap: 2mm;
            font-weight: bold;
          }
          .security-questionnaire-print .print-question-heading b {
            text-align: right;
          }
          .security-questionnaire-print .print-question p {
            margin: 1.5mm 0 0 8mm;
            white-space: pre-wrap;
          }
          .security-questionnaire-print .print-footer {
            margin-top: 5mm;
            border-top: 1px solid #cbd5e1;
            padding-top: 3mm;
            color: #475569;
            font-size: 8pt;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>
    </section>,
    document.body,
  );
}

function QuestionnaireEditor({
  initial,
  onSaved,
  onClose,
  canWrite,
}: {
  initial: Questionnaire;
  onSaved: (questionnaire: Questionnaire) => void;
  onClose: () => void;
  canWrite: boolean;
}) {
  const [draft, setDraft] = useState<Questionnaire>(() =>
    asQuestionnaire(initial),
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set([QUESTION_GROUPS[0]]),
  );
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(asQuestionnaire(initial));
    setNotice("");
    setError("");
  }, [initial]);

  const totals = useMemo(() => {
    const result = { PENDIENTE: 0, SI: 0, NO: 0, NA: 0 } as Record<
      QuestionnaireResponseValue,
      number
    >;
    draft.respuestas.forEach((answer) => result[answer.respuesta]++);
    return result;
  }, [draft.respuestas]);

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(asQuestionnaire(initial));
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  function setField(
    field: "empresa" | "titulo" | "contacto" | "emailContacto" | "fechaLimite",
    value: string,
  ) {
    const nullable =
      field === "contacto" ||
      field === "emailContacto" ||
      field === "fechaLimite";
    setDraft((current) => ({
      ...current,
      [field]: nullable ? value || null : value,
    }));
  }

  function setAnswer(id: number, patch: Partial<SecurityAnswer>) {
    setDraft((current) => ({
      ...current,
      respuestas: current.respuestas.map((answer) =>
        answer.id === id ? { ...answer, ...patch } : answer,
      ),
    }));
  }

  async function save() {
    if (busy || !canWrite) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = {
        action: "actualizar",
        id: draft.id,
        version: draft.version,
        empresa: draft.empresa.trim(),
        titulo: (draft.titulo || QUESTIONNAIRE_TITLE).trim(),
        contacto: draft.contacto?.trim() || null,
        emailContacto: draft.emailContacto?.trim() || null,
        fechaLimite: dateForInput(draft.fechaLimite) || null,
        estado: draft.estado,
        respuestas: draft.respuestas.map((answer) => ({
          ...answer,
          evidencia: answer.evidencia.trim(),
          observacion: answer.observacion.trim(),
        })),
      };
      const response = await api<{ ok: true; cuestionario: Questionnaire }>(
        API,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const saved = asQuestionnaire(response.cuestionario);
      setDraft(saved);
      onSaved(saved);
      setNotice(
        "Cuestionario guardado. La validación, cuando exista, es únicamente interna.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el cuestionario.",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleGroup(group: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <section
      className="rounded-xl border border-blue-200 bg-white shadow-sm"
      aria-labelledby="security-editor-heading"
    >
      <div className="flex flex-col gap-3 border-b border-blue-200 bg-blue-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-blue-900">
            Cuestionario de seguridad
          </p>
          <h2
            id="security-editor-heading"
            className="mt-1 text-xl font-extrabold text-slate-950"
          >
            {draft.empresa}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">
            Ficha reutilizable por empresa. Una respuesta es un dato declarado;
            no presume controles, certificaciones ni aceptación de la empresa
            destinataria.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <PrinterIcon className="h-4 w-4" />
            Imprimir / exportar PDF
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Hay cambios sin guardar. ¿Quieres descartarlos?",
                )
              )
                onClose();
            }}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            Volver a la lista
          </button>
        </div>
      </div>
      <fieldset disabled={busy} className="space-y-5 p-4 sm:p-5">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"
          >
            {notice}
          </p>
        )}
        <div className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="questionnaire-company">
              Empresa destinataria
            </label>
            <input
              readOnly={!canWrite}
              id="questionnaire-company"
              value={draft.empresa}
              onChange={(event) => setField("empresa", event.target.value)}
              maxLength={160}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="questionnaire-title">
              Título
            </label>
            <input
              readOnly={!canWrite}
              id="questionnaire-title"
              value={draft.titulo}
              onChange={(event) => setField("titulo", event.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="questionnaire-contact">
              Contacto
            </label>
            <input
              readOnly={!canWrite}
              id="questionnaire-contact"
              value={draft.contacto || ""}
              onChange={(event) => setField("contacto", event.target.value)}
              maxLength={160}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="questionnaire-email">
              Email de contacto
            </label>
            <input
              readOnly={!canWrite}
              id="questionnaire-email"
              type="email"
              value={draft.emailContacto || ""}
              onChange={(event) =>
                setField("emailContacto", event.target.value)
              }
              maxLength={320}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="questionnaire-deadline">
              Fecha límite
            </label>
            <input
              readOnly={!canWrite}
              id="questionnaire-deadline"
              type="date"
              value={dateForInput(draft.fechaLimite)}
              onChange={(event) => setField("fechaLimite", event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="questionnaire-state">
              Estado interno
            </label>
            <select
              disabled={!canWrite}
              id="questionnaire-state"
              value={draft.estado}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  estado: event.target.value as QuestionnaireState,
                }))
              }
              className={inputClass}
            >
              {QUESTIONNAIRE_STATES.map((state) => (
                <option key={state} value={state}>
                  {stateLabel(state)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            <strong>Proveedor:</strong> {PROVIDER_PROFILE.proveedor}
            <br />
            <strong>Referentes internos:</strong>{" "}
            {PROVIDER_PROFILE.aprobadorInterno};{" "}
            {PROVIDER_PROFILE.contactoTecnico}
            <br />
            <span className="text-xs">
              {PROVIDER_PROFILE.referenciaIso}{" "}
              {PROVIDER_PROFILE.referenciaTisax} No supone certificación, prueba
              de control, equipo gestionado ni aceptación por cliente.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
            <span className="rounded bg-amber-100 px-2 py-1">
              Pendientes: {totals.PENDIENTE}
            </span>
            <span className="rounded bg-emerald-100 px-2 py-1">
              Sí: {totals.SI}
            </span>
            <span className="rounded bg-red-100 px-2 py-1">
              No: {totals.NO}
            </span>
            <span className="rounded bg-slate-200 px-2 py-1">
              N/A: {totals.NA}
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(event) => setPendingOnly(event.target.checked)}
            />
            Mostrar solo pendientes
          </label>
        </div>

        <div className="space-y-3">
          {QUESTION_GROUPS.map((group) => {
            const questions = SECURITY_QUESTIONS.filter(
              (question) => question.grupo === group,
            ).filter(
              (question) =>
                !pendingOnly ||
                draft.respuestas.find((answer) => answer.id === question.id)
                  ?.respuesta === "PENDIENTE",
            );
            if (!questions.length) return null;
            const isOpen = openGroups.has(group);
            return (
              <section
                key={group}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center justify-between gap-4 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-700"
                >
                  <span className="font-extrabold text-slate-950">
                    {group}
                    <span className="ml-2 text-xs font-semibold text-slate-600">
                      {questions.length} pregunta
                      {questions.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {isOpen ? (
                    <ChevronDownIcon className="h-5 w-5" />
                  ) : (
                    <ChevronRightIcon className="h-5 w-5" />
                  )}
                </button>
                {isOpen && (
                  <div className="divide-y divide-slate-200">
                    {questions.map((question) => {
                      const answer = draft.respuestas.find(
                        (item) => item.id === question.id,
                      )!;
                      return (
                        <article key={question.id} className="p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="max-w-3xl">
                              <h3 className="font-bold text-slate-950">
                                <span className="mr-2 text-blue-800">
                                  {question.id}.
                                </span>
                                {question.pregunta}
                              </h3>
                              <p className="mt-1 text-xs text-slate-600">
                                <strong>Evidencia sugerida:</strong>{" "}
                                {question.evidenciaSugerida}
                              </p>
                              {question.nota && (
                                <p className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-950">
                                  {question.nota}
                                </p>
                              )}
                            </div>
                            <select
                              disabled={!canWrite}
                              aria-label={`Respuesta para pregunta ${question.id}`}
                              value={answer.respuesta}
                              onChange={(event) =>
                                setAnswer(question.id, {
                                  respuesta: event.target
                                    .value as QuestionnaireResponseValue,
                                })
                              }
                              className={`rounded-lg border px-3 py-2 text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-blue-700 ${answerTone(answer.respuesta)}`}
                            >
                              <option value="PENDIENTE">PENDIENTE</option>
                              <option value="SI">SÍ</option>
                              <option value="NO">NO</option>
                              <option value="NA">N/A</option>
                            </select>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <label
                                className={labelClass}
                                htmlFor={`evidence-${question.id}`}
                              >
                                Evidencia
                              </label>
                              <textarea
                                readOnly={!canWrite}
                                id={`evidence-${question.id}`}
                                value={answer.evidencia}
                                onChange={(event) =>
                                  setAnswer(question.id, {
                                    evidencia: event.target.value,
                                  })
                                }
                                maxLength={4000}
                                rows={2}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label
                                className={labelClass}
                                htmlFor={`observation-${question.id}`}
                              >
                                Observación
                              </label>
                              <textarea
                                readOnly={!canWrite}
                                id={`observation-${question.id}`}
                                value={answer.observacion}
                                onChange={(event) =>
                                  setAnswer(question.id, {
                                    observacion: event.target.value,
                                  })
                                }
                                maxLength={4000}
                                rows={2}
                                className={inputClass}
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-xs leading-5 text-slate-600">
            Para pasar a <strong>Validado</strong>, las 23 respuestas deben
            estar completadas; «Sí» requiere evidencia de al menos 15 caracteres
            y «No»/«N/A» una observación o evidencia de al menos 15. «Validado»
            significa revisado internamente, no certificación ni aceptación de
            cliente.
          </p>
          <button
            type="button"
            disabled={busy || !canWrite}
            onClick={save}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-60"
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            {busy ? "Guardando…" : "Guardar ficha"}
          </button>
        </div>
      </fieldset>
      <PrintQuestionnaire
        questionnaire={{ ...draft, estado: dirty ? "BORRADOR" : draft.estado }}
      />
    </section>
  );
}

export default function SecurityQuestionnaires() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"TODOS" | QuestionnaireState>("TODOS");
  const [newForm, setNewForm] = useState({
    empresa: "",
    titulo: QUESTIONNAIRE_TITLE,
    contacto: "",
    emailContacto: "",
    fechaLimite: "",
  });

  const visibleItems = useMemo(
    () => items.filter((item) => filter === "TODOS" || item.estado === filter),
    [items, filter],
  );

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ cuestionarios: ListItem[]; canWrite: boolean }>(
        API,
      );
      setItems(data.cuestionarios);
      setCanWrite(Boolean(data.canWrite));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo cargar la lista.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function open(id: string) {
    setLoadingDetail(true);
    setError("");
    try {
      const data = await api<{ cuestionario: Questionnaire }>(
        `${API}?id=${encodeURIComponent(id)}`,
      );
      setSelected(asQuestionnaire(data.cuestionario));
      setCreating(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo abrir la ficha.",
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  async function create() {
    if (busy) return;
    setError("");
    if (!newForm.empresa.trim())
      return setError("Indica la empresa destinataria para crear la ficha.");
    setBusy(true);
    try {
      const data = await api<{ ok: true; cuestionario: Questionnaire }>(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "crear",
          empresa: newForm.empresa.trim(),
          titulo: newForm.titulo.trim() || undefined,
          contacto: newForm.contacto.trim() || undefined,
          emailContacto: newForm.emailContacto.trim() || undefined,
          fechaLimite: newForm.fechaLimite || undefined,
        }),
      });
      const questionnaire = asQuestionnaire(data.cuestionario);
      setSelected(questionnaire);
      setCreating(false);
      setItems((current) =>
        [
          {
            id: questionnaire.id,
            empresa: questionnaire.empresa,
            estado: questionnaire.estado,
            fechaLimite: questionnaire.fechaLimite,
            version: questionnaire.version,
            respuestasCompletadas: 0,
          },
          ...current,
        ].slice(0, 50),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo crear la ficha.",
      );
    } finally {
      setBusy(false);
    }
  }

  function saved(questionnaire: Questionnaire) {
    setItems((current) => {
      const item: ListItem = {
        id: questionnaire.id,
        empresa: questionnaire.empresa,
        estado: questionnaire.estado,
        fechaLimite: questionnaire.fechaLimite,
        version: questionnaire.version,
        respuestasCompletadas: completedAnswers(questionnaire.respuestas),
      };
      return [
        item,
        ...current.filter((candidate) => candidate.id !== item.id),
      ].slice(0, 50);
    });
    setSelected(questionnaire);
  }

  if (selected)
    return (
      <div className="space-y-4">
        <QuestionnaireEditor
          initial={selected}
          canWrite={canWrite}
          onSaved={saved}
          onClose={() => setSelected(null)}
        />
      </div>
    );

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-blue-900">
            Certificaciones · seguridad
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-950">
            Cuestionarios de seguridad
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Registra y revisa internamente cuestionarios por empresa
            destinataria. La plantilla no usa marca de cliente, no crea firmas
            ni afirma certificaciones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/certificaciones/cuestionarios/original"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            Formulario original de Draxton
          </a>
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => {
              setCreating((open) => !open);
              setError("");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            Nueva ficha
          </button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-950"
        >
          {error}
        </p>
      )}
      {creating && canWrite && (
        <section className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-950">Nueva ficha</h2>
          <p className="mt-1 text-sm text-slate-700">
            Las 23 respuestas se crearán vacías y en estado pendiente; no se
            copian datos de otra empresa.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="new-company">
                Empresa destinataria
              </label>
              <input
                id="new-company"
                value={newForm.empresa}
                onChange={(event) =>
                  setNewForm((current) => ({
                    ...current,
                    empresa: event.target.value,
                  }))
                }
                maxLength={160}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-title">
                Título
              </label>
              <input
                id="new-title"
                value={newForm.titulo}
                onChange={(event) =>
                  setNewForm((current) => ({
                    ...current,
                    titulo: event.target.value,
                  }))
                }
                maxLength={200}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-contact">
                Contacto
              </label>
              <input
                id="new-contact"
                value={newForm.contacto}
                onChange={(event) =>
                  setNewForm((current) => ({
                    ...current,
                    contacto: event.target.value,
                  }))
                }
                maxLength={160}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-email">
                Email de contacto
              </label>
              <input
                id="new-email"
                type="email"
                value={newForm.emailContacto}
                onChange={(event) =>
                  setNewForm((current) => ({
                    ...current,
                    emailContacto: event.target.value,
                  }))
                }
                maxLength={320}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-deadline">
                Fecha límite
              </label>
              <input
                id="new-deadline"
                type="date"
                value={newForm.fechaLimite}
                onChange={(event) =>
                  setNewForm((current) => ({
                    ...current,
                    fechaLimite: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={create}
              className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-900 disabled:opacity-60"
            >
              {busy ? "Creando…" : "Crear y completar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCreating(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap gap-2"
            aria-label="Filtrar cuestionarios"
          >
            {(["TODOS", ...QUESTIONNAIRE_STATES] as const).map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setFilter(state)}
                className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${filter === state ? "border-blue-700 bg-blue-800 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"}`}
              >
                {state === "TODOS" ? "Todos" : stateLabel(state)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Actualizar
          </button>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-slate-700">Cargando cuestionarios…</p>
        ) : visibleItems.length ? (
          <div className="divide-y divide-slate-200">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-extrabold text-slate-950">
                      {item.empresa}
                    </h2>
                    <StateBadge state={item.estado} />
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {item.respuestasCompletadas}/23 respondidas ·{" "}
                    {dateForDisplay(item.fechaLimite)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void open(item.id)}
                  disabled={loadingDetail}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-extrabold text-blue-950 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-60"
                >
                  <EyeIcon className="h-4 w-4" />
                  {loadingDetail ? "Abriendo…" : "Abrir ficha"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <h2 className="font-extrabold text-slate-950">
              No hay cuestionarios en este filtro
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Crea una ficha para una empresa destinataria. Se iniciará con
              todas las respuestas pendientes.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
