"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  A3ClientContractError,
  a3ApiErrorMessage,
  parseA3ConfigResponse,
  parseA3PreviewResponse,
  stableA3Json,
  type A3ConfigResponse,
  type A3Preview,
  type A3Status,
  type AccountField,
  type A3Scope,
  type ReviewSource,
} from "./a3-parallel-response-parser";

type Mappings = {
  gastoById: Record<string, { cuentaGasto: string | null; cuentaContrapartida: string | null }>;
  movimientoById: Record<string, { cuentaContrapartida: string | null; contraparteHumana: string | null }>;
  nominaById: Record<string, { fechaNominaISO: string | null }>;
};
type ReviewPage = { source: ReviewSource | null; offset: number; linesOffset: number };
type ReviewedPreview = { preview: A3Preview; payloadKey: string };

const API = "/api/admin/finanzas/exportar-a3";
const accountLabels: Record<AccountField, string> = {
  clientes: "Clientes", proveedores: "Proveedores", ventasServicios: "Ventas de servicios", comprasServicios: "Compras / servicios",
  ivaRepercutido21: "IVA repercutido 21%", ivaRepercutido10: "IVA repercutido 10%", ivaRepercutido4: "IVA repercutido 4%",
  ivaSoportado21: "IVA soportado 21%", ivaSoportado10: "IVA soportado 10%", ivaSoportado4: "IVA soportado 4%",
  irpfRetenido: "IRPF retenido emitidas", retencionProveedor: "Retención de proveedor (elegir Contabilidad)",
  sueldosSalarios: "Sueldos y salarios", ssEmpresa: "Seguridad Social empresa", irpfNominas: "IRPF nóminas", ssTrabajador: "Seguridad Social trabajador", ssEmpresaPagar: "Seguridad Social empresa a pagar", remuneracionesPendientes: "Remuneraciones pendientes",
};
const scopes: { value: A3Scope; label: string }[] = [
  { value: "fi", label: "Facturas emitidas" }, { value: "fr", label: "Facturas recibidas" }, { value: "gastos", label: "Gastos" }, { value: "nominas", label: "Nóminas" }, { value: "bank", label: "Banco" }, { value: "todo", label: "Todo" },
];
const sourceLabels: Record<ReviewSource, string> = { fi: "Emitidas", fr: "Recibidas", gastos: "Gastos", nominas: "Nóminas", bank: "Banco" };
const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";
const cardClass = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

function currentMonth(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function stringCents(value: string | null | undefined): string {
  if (value === null || value === undefined || !/^-?\d+$/.test(value)) return "—";
  const cents = BigInt(value); const negative = cents < BigInt(0); const magnitude = negative ? -cents : cents;
  return `${negative ? "−" : ""}${(magnitude / BigInt(100)).toString()},${(magnitude % BigInt(100)).toString().padStart(2, "0")} €`;
}
function valueOrDash(value: string | null | undefined): string { return value && value.trim() ? value : "—"; }
/** Preserve a blank as null for the server validator; never manufacture a ledger value. */
function reviewAccountInput(value: string): string | null { const trimmed = value.trim(); return trimmed === "" ? null : trimmed; }
function parseSourceFilter(value: string): ReviewSource | null { return value === "fi" || value === "fr" || value === "gastos" || value === "nominas" || value === "bank" ? value : null; }
function isAbort(reason: unknown): boolean { return reason instanceof DOMException && reason.name === "AbortError"; }

/**
 * Review-only surface. It does not persist choices or assert A3 compatibility.
 * A preview can only authorize a download while the exact review input is unchanged.
 */
export default function A3ParallelWorkspace() {
  const [status, setStatus] = useState<A3Status>("idle");
  const [configStatus, setConfigStatus] = useState<A3Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<A3ConfigResponse | null>(null);
  const [mes, setMes] = useState(currentMonth());
  const [scope, setScope] = useState<A3Scope>("todo");
  const [selection, setSelection] = useState<"profile" | "manual">("profile");
  const [profileId, setProfileId] = useState("");
  const [explicitlySelected, setExplicitlySelected] = useState(false);
  const [accounts, setAccounts] = useState<Partial<Record<AccountField, string | null>>>({});
  const [bankAccounts, setBankAccounts] = useState<Record<string, string | null>>({});
  const [mappings, setMappings] = useState<Mappings>({ gastoById: {}, movimientoById: {}, nominaById: {} });
  const [review, setReview] = useState<ReviewedPreview | null>(null);
  const [sourceFilter, setSourceFilter] = useState<ReviewSource | null>(null);
  const [sourceOffset, setSourceOffset] = useState(0);
  const [linesOffset, setLinesOffset] = useState(0);
  const [downloadStep, setDownloadStep] = useState<"idle" | "confirm">("idle");

  const configRequest = useRef(0);
  const reviewVersion = useRef(0);
  const configAbort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const downloadAbort = useRef<AbortController | null>(null);

  const payload = useMemo(() => ({
    mes,
    scope,
    config: { selection, profileId: profileId || null, explicitlySelected, accounts, bankAccountByCuentaId: bankAccounts },
    mappings,
  }), [mes, scope, selection, profileId, explicitlySelected, accounts, bankAccounts, mappings]);
  const payloadKey = useMemo(() => stableA3Json(payload), [payload]);
  const preview = review?.preview ?? null;

  function abortReviewRequests(): void {
    previewAbort.current?.abort(); previewAbort.current = null;
    downloadAbort.current?.abort(); downloadAbort.current = null;
  }
  /** Invalidates every confirmed preview before a mutable review input can change. */
  function invalidateReview(resetPages = false): void {
    reviewVersion.current += 1;
    abortReviewRequests();
    setReview(null); setDownloadStep("idle"); setStatus("idle"); setError(null);
    if (resetPages) { setSourceOffset(0); setLinesOffset(0); }
  }
  function failReview(message: string): void {
    reviewVersion.current += 1;
    abortReviewRequests();
    setReview(null); setDownloadStep("idle"); setStatus("error"); setError(message);
  }

  useEffect(() => {
    void loadConfig();
    return () => { configAbort.current?.abort(); abortReviewRequests(); reviewVersion.current += 1; };
    // Initial metadata load only. Retry uses the explicit button below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConfig(): Promise<void> {
    invalidateReview();
    const requestId = ++configRequest.current;
    configAbort.current?.abort();
    const controller = new AbortController(); configAbort.current = controller;
    setConfig(null); setConfigStatus("loading"); setError(null);
    try {
      const response = await fetch(API, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => {
        throw new A3ClientContractError("La configuración A3 respondió sin JSON válido; no se puede continuar con una configuración incompleta.");
      });
      if (!response.ok) throw new Error(a3ApiErrorMessage(body, "No se pudo cargar la configuración de revisión."));
      const parsed = parseA3ConfigResponse(body);
      if (requestId !== configRequest.current || controller.signal.aborted) return;
      setConfig(parsed); setConfigStatus("ready");
    } catch (reason) {
      if (controller.signal.aborted || isAbort(reason) || requestId !== configRequest.current) return;
      setConfig(null); setConfigStatus("error"); setError(reason instanceof Error ? reason.message : "Error al cargar la configuración A3.");
    } finally {
      if (requestId === configRequest.current) configAbort.current = null;
    }
  }

  function chooseProfile(id: string): void {
    const profile = config?.profiles.find((item) => item.id === id);
    invalidateReview();
    setProfileId(id); setExplicitlySelected(Boolean(id)); setSelection("profile");
    setAccounts(profile ? { ...profile.accounts } : {});
  }
  function startManual(): void {
    invalidateReview();
    setSelection("manual"); setProfileId(""); setExplicitlySelected(true); setAccounts({});
  }
  function setAccount(field: AccountField, value: string): void {
    invalidateReview();
    setAccounts((previous) => ({ ...previous, [field]: reviewAccountInput(value) }));
  }
  function setBankAccount(id: string, value: string): void {
    invalidateReview();
    setBankAccounts((previous) => ({ ...previous, [id]: reviewAccountInput(value) }));
  }
  function setGasto(id: string, key: "cuentaGasto" | "cuentaContrapartida", value: string): void {
    invalidateReview();
    setMappings((previous) => ({ ...previous, gastoById: { ...previous.gastoById, [id]: { cuentaGasto: previous.gastoById[id]?.cuentaGasto ?? null, cuentaContrapartida: previous.gastoById[id]?.cuentaContrapartida ?? null, [key]: reviewAccountInput(value) } } }));
  }
  function setMovimiento(id: string, key: "cuentaContrapartida" | "contraparteHumana", value: string): void {
    invalidateReview();
    setMappings((previous) => ({ ...previous, movimientoById: { ...previous.movimientoById, [id]: { cuentaContrapartida: previous.movimientoById[id]?.cuentaContrapartida ?? null, contraparteHumana: previous.movimientoById[id]?.contraparteHumana ?? null, [key]: key === "cuentaContrapartida" ? reviewAccountInput(value) : (value.trim() || null) } } }));
  }
  function setNomina(id: string, value: string): void {
    invalidateReview();
    setMappings((previous) => ({ ...previous, nominaById: { ...previous.nominaById, [id]: { fechaNominaISO: value || null } } }));
  }

  async function requestPreview(page: ReviewPage): Promise<void> {
    const version = reviewVersion.current + 1;
    reviewVersion.current = version;
    abortReviewRequests();
    const controller = new AbortController(); previewAbort.current = controller;
    const requestPayload = payload;
    const requestPayloadKey = payloadKey;
    setReview(null); setDownloadStep("idle"); setStatus("loading"); setError(null);
    setSourceFilter(page.source); setSourceOffset(page.offset); setLinesOffset(page.linesOffset);
    try {
      const response = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ action: "preview", ...requestPayload, page }),
      });
      const body = await response.json().catch(() => {
        throw new A3ClientContractError("La vista previa A3 respondió sin JSON válido; no se habilitará ninguna descarga.");
      });
      if (!response.ok) throw new Error(a3ApiErrorMessage(body, "No se pudo preparar la vista previa."));
      const parsed = parseA3PreviewResponse(body, { mes: requestPayload.mes, scope: requestPayload.scope, page });
      if (controller.signal.aborted || version !== reviewVersion.current) return;
      setReview({ preview: parsed, payloadKey: requestPayloadKey }); setStatus("ready");
    } catch (reason) {
      if (controller.signal.aborted || isAbort(reason) || version !== reviewVersion.current) return;
      failReview(reason instanceof Error ? reason.message : "Respuesta no identificada en la vista previa A3.");
    } finally {
      if (previewAbort.current === controller) previewAbort.current = null;
    }
  }

  async function download(): Promise<void> {
    const reviewed = review;
    if (!reviewed || reviewed.payloadKey !== payloadKey || reviewed.preview.readiness !== "listo para prueba externa") {
      failReview("La vista previa ya no coincide exactamente con el formulario actual. Genere y revise una nueva vista previa antes de descargar.");
      return;
    }
    if (downloadStep === "idle") { setDownloadStep("confirm"); return; }

    const version = reviewVersion.current;
    const controller = new AbortController(); downloadAbort.current = controller;
    setStatus("loading"); setError(null);
    try {
      const response = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ action: "download", ...payload, expectedHash: reviewed.preview.dataHash, confirmacion: true, page: { source: sourceFilter, offset: sourceOffset, linesOffset } }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(a3ApiErrorMessage(body, "No se pudo descargar el borrador."));
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("text/csv")) throw new A3ClientContractError("La descarga A3 respondió 200 con un formato no CSV.");
      if (response.headers.get("x-a3-review-hash") !== reviewed.preview.dataHash) throw new A3ClientContractError("La descarga A3 respondió con un hash distinto de la revisión confirmada.");
      const blob = await response.blob();
      if (controller.signal.aborted || version !== reviewVersion.current || payloadKey !== reviewed.payloadKey) return;
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      const disposition = response.headers.get("content-disposition") ?? ""; const matched = /filename="([^"]+)"/.exec(disposition);
      link.href = url; link.download = matched?.[1] ?? `A3_BORRADOR_PARALELO_${mes}.csv`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setDownloadStep("idle"); setStatus("ready");
    } catch (reason) {
      if (controller.signal.aborted || isAbort(reason) || version !== reviewVersion.current) return;
      failReview(reason instanceof Error ? reason.message : "No se pudo descargar el borrador A3.");
    } finally {
      if (downloadAbort.current === controller) downloadAbort.current = null;
    }
  }

  const readyForDownload = Boolean(preview && review?.payloadKey === payloadKey && preview.readiness === "listo para prueba externa");
  return <section aria-labelledby="a3-paralelo-title" className="min-w-0 space-y-5 border-t-4 border-slate-800 pt-6">
    <style>{`.a3-local-table-scroll{max-width:100% !important;overflow-x:auto !important;-webkit-overflow-scrolling:touch}.a3-local-table-scroll>table{width:max-content;min-width:100%}`}</style>
    <header className="rounded-xl bg-slate-900 px-5 py-5 text-white shadow-sm sm:px-7">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">Revisión financiera · entorno aislado</p>
      <h2 id="a3-paralelo-title" className="mt-1 text-xl font-bold sm:text-2xl">Borrador paralelo para prueba externa</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Lectura de fuentes actuales sin persistir selecciones ni marcar exportaciones. No está verificado para A3, no envía datos y no presenta ninguna cuenta como validada contablemente.</p>
    </header>

    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"><strong>Error:</strong> {error}</div>}
    {configStatus === "loading" && <div className={cardClass}>Cargando configuración de revisión…</div>}
    {configStatus === "error" && <button type="button" onClick={() => void loadConfig()} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Reintentar configuración</button>}

    {config && <>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <div className={cardClass}><label className="text-sm font-semibold text-slate-800">Mes de fuente</label><input type="month" value={mes} onChange={(event) => { invalidateReview(true); setMes(event.target.value); }} className={inputClass} required /><p className="mt-2 text-xs text-slate-500">FI/FR/gastos usan su fecha; banco usa fecha de operación. Nóminas usan año/mes de nómina.</p></div>
        <div className={cardClass}><label className="text-sm font-semibold text-slate-800">Fuente</label><select value={scope} onChange={(event) => { invalidateReview(true); setScope(event.target.value as A3Scope); }} className={inputClass}>{scopes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><p className="mt-2 text-xs text-slate-500">La lectura es completa por fuente o falla con límite: nunca se considera completa parcialmente.</p></div>
        <div className={cardClass}><p className="text-sm font-semibold text-slate-800">Estado de revisión</p><p className="mt-2 text-sm"><span className={`inline-block max-w-full break-words rounded-full px-2 py-1 font-semibold ${status === "error" ? "bg-red-100 text-red-800" : status === "loading" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{status === "loading" ? "Consultando" : status === "error" ? "Error" : preview ? preview.readiness : "Sin vista previa"}</span></p><p className="mt-3 text-xs text-slate-500">Los campos vacíos se muestran como —, no como 0.</p></div>
      </div>

      <div className={cardClass}>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="min-w-0"><h3 className="font-bold text-slate-900">Perfil o configuración manual</h3><p className="mt-1 text-sm text-amber-800">{config.warning}</p></div><button type="button" onClick={startManual} className={`shrink-0 rounded-md border px-3 py-2 text-sm font-semibold ${selection === "manual" ? "border-blue-700 bg-blue-50 text-blue-900" : "border-slate-300 text-slate-700"}`}>Usar configuración manual</button></div>
        {selection === "profile" ? <label className="mt-4 block text-sm font-medium text-slate-700">Perfil existente (elección explícita)<select value={profileId} onChange={(event) => chooseProfile(event.target.value)} className={inputClass}><option value="">— Seleccione un perfil para revisión —</option>{config.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label> : <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">Configuración manual: rellene sólo las cuentas que Contabilidad haya seleccionado para esta revisión. No se inventa un plan contable.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(accountLabels) as AccountField[]).map((field) => <label key={field} className="min-w-0 text-xs font-medium text-slate-700">{accountLabels[field]}<input inputMode="numeric" aria-label={accountLabels[field]} value={accounts[field] ?? ""} onChange={(event) => setAccount(field, event.target.value)} placeholder="Cuenta manual" className={inputClass} /></label>)}</div>
        <p className="mt-3 text-xs text-slate-600">La cuenta de <strong>retención de proveedor</strong> permanece vacía salvo elección explícita de Contabilidad. No se reutiliza ni se declara verificada una cuenta histórica.</p>
      </div>

      <div className={cardClass}><h3 className="font-bold text-slate-900">Subcuenta por cuenta bancaria</h3><p className="mt-1 text-sm text-slate-600">Mapeo manual por ID de cuenta. No se muestran IBAN completos ni se asigna una 572 por defecto.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{config.bankAccounts.map((item) => <label className="min-w-0 text-xs font-medium text-slate-700" key={item.id}>{item.label} {!item.active && <span className="text-amber-700">(inactiva)</span>}<input inputMode="numeric" value={bankAccounts[item.id] ?? ""} onChange={(event) => setBankAccount(item.id, event.target.value)} placeholder="Subcuenta elegida" className={inputClass} /></label>)}</div></div>

      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-blue-950">Primero generar vista previa</p><p className="text-sm text-blue-900">La vista previa calcula incidencias y hash de datos/configuración. No crea ningún asiento, exportación ni registro.</p></div><button type="button" disabled={status === "loading" || !mes} onClick={() => void requestPreview({ source: sourceFilter, offset: 0, linesOffset: 0 })} className="shrink-0 rounded-md bg-blue-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{status === "loading" ? "Preparando…" : "Generar vista previa"}</button></div>
    </>}

    {preview && <>
      <div className={`${cardClass} ${preview.readiness === "incomplete" ? "border-red-300" : "border-emerald-300"}`}><div className="flex flex-col justify-between gap-3 md:flex-row"><div className="min-w-0"><h3 className="font-bold text-slate-900">Resultado de revisión</h3><p className="mt-1 text-sm text-slate-700">{preview.assertion}</p><p className="mt-2 break-all text-xs text-slate-500">Hash de revisión: {preview.dataHash} · versión config.: {valueOrDash(preview.configVersionSHA)}</p></div><span className={`h-fit shrink-0 rounded-full px-3 py-1 text-sm font-bold ${readyForDownload ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>{preview.readiness}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Líneas", String(preview.counts.lines)], ["Asientos", String(preview.counts.seats)], ["Debe", stringCents(preview.counts.debeCentimos)], ["Haber", stringCents(preview.counts.haberCentimos)], ["Incidencias", String(preview.counts.incidences)]].map(([label, value]) => <div className="min-w-0 rounded-lg bg-slate-50 p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-bold text-slate-900">{value}</p></div>)}</div></div>

      <div className={cardClass}><h3 className="font-bold text-slate-900">Incidencias y exclusiones</h3><div className="mt-3 flex flex-wrap gap-2">{Object.entries(preview.incidenceSummary).map(([key, item]) => <span key={key} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-800">{key}: {item.bloqueantes} bloqueantes · {item.revision} revisión</span>)}</div><ul className="mt-4 divide-y divide-slate-100">{preview.incidences.length ? preview.incidences.map((item, index) => <li key={`${item.sourceId}-${item.code}-${index}`} className="py-3 text-sm"><span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${item.severity === "BLOQUEANTE" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{item.severity}</span><strong>{item.code}</strong><p className="mt-1 text-slate-700">{item.message}</p></li>) : <li className="py-3 text-sm text-slate-600">Sin incidencias en esta primera página.</li>}</ul></div>

      <div className={cardClass}><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h3 className="font-bold text-slate-900">Selecciones manuales por fuente</h3><p className="mt-1 text-sm text-slate-600">Página de hasta 100 fuentes. Las decisiones se incluyen sólo en la solicitud de revisión y no se guardan.</p></div><label className="shrink-0 text-sm font-medium text-slate-700">Fuente<select value={sourceFilter ?? ""} onChange={(event) => { const next = parseSourceFilter(event.target.value); void requestPreview({ source: next, offset: 0, linesOffset: 0 }); }} className={inputClass}><option value="">Todas</option>{(Object.keys(sourceLabels) as ReviewSource[]).map((key) => <option value={key} key={key}>{sourceLabels[key]}</option>)}</select></label></div><div className="a3-local-table-scroll mt-4" style={{ overflowX: "auto" }}><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2">Selección humana</th></tr></thead><tbody>{preview.sourcePage.items.map((item) => <MappingRow key={item.id} item={item} mappings={mappings} onGasto={setGasto} onMovimiento={setMovimiento} onNomina={setNomina} />)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">{preview.sourcePage.total ? `${preview.sourcePage.offset + 1}–${Math.min(preview.sourcePage.offset + 100, preview.sourcePage.total)} de ${preview.sourcePage.total}` : "No hay fuentes para este filtro."}</p><div className="flex gap-2"><button type="button" disabled={status === "loading" || preview.sourcePage.offset === 0} onClick={() => void requestPreview({ source: sourceFilter, offset: Math.max(0, preview.sourcePage.offset - 100), linesOffset })} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Anterior</button><button type="button" disabled={status === "loading" || preview.sourcePage.nextOffset === null} onClick={() => preview.sourcePage.nextOffset !== null && void requestPreview({ source: sourceFilter, offset: preview.sourcePage.nextOffset, linesOffset })} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Siguiente</button></div></div></div>

      <div className={cardClass}><h3 className="font-bold text-slate-900">Líneas del borrador</h3><div className="a3-local-table-scroll mt-3" style={{ overflowX: "auto" }}><table className="min-w-[850px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr>{["Asiento", "Apunte", "Fecha", "Cuenta", "Concepto", "Debe", "Haber", "Documento", "Diario"].map((heading) => <th className="px-2 py-2" key={heading}>{heading}</th>)}</tr></thead><tbody>{preview.lines.length ? preview.lines.map((line) => <tr key={`${line.asiento}-${line.apunte}`} className="border-t border-slate-100"><td className="px-2 py-2">{line.asiento}</td><td className="px-2 py-2">{line.apunte}</td><td className="px-2 py-2">{line.fecha}</td><td className="px-2 py-2">{line.cuenta}</td><td className="max-w-xs truncate px-2 py-2" title={line.concepto}>{line.concepto}</td><td className="px-2 py-2">{stringCents(line.debeCentimos)}</td><td className="px-2 py-2">{stringCents(line.haberCentimos)}</td><td className="px-2 py-2">{valueOrDash(line.documento)}</td><td className="px-2 py-2">{line.diario}</td></tr>) : <tr><td colSpan={9} className="px-2 py-4 text-slate-500">No hay líneas generables en esta página.</td></tr>}</tbody></table></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">{preview.counts.lines ? `${preview.linesOffset + 1}–${Math.min(preview.linesOffset + 100, preview.counts.lines)} de ${preview.counts.lines}` : "Sin líneas generables."}</p><div className="flex gap-2"><button type="button" disabled={status === "loading" || preview.linesOffset === 0} onClick={() => void requestPreview({ source: sourceFilter, offset: sourceOffset, linesOffset: Math.max(0, preview.linesOffset - 100) })} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Anterior</button><button type="button" disabled={status === "loading" || preview.linesNextOffset === null} onClick={() => preview.linesNextOffset !== null && void requestPreview({ source: sourceFilter, offset: sourceOffset, linesOffset: preview.linesNextOffset })} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Siguiente</button></div></div></div>

      <div className="min-w-0 rounded-xl border border-slate-300 bg-slate-50 p-4"><h3 className="font-bold text-slate-900">Descarga controlada</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{downloadStep === "confirm" && <p className="mt-3 rounded-md bg-amber-100 p-3 text-sm text-amber-950"><strong>Segunda confirmación requerida:</strong> al confirmar se releerán fuentes y configuración; si cambia el hash, la descarga se bloqueará para una nueva revisión.</p>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={!readyForDownload || status === "loading"} onClick={() => void download()} className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{downloadStep === "confirm" ? "Confirmar descarga del borrador" : "Solicitar descarga del borrador"}</button>{downloadStep === "confirm" && <button type="button" onClick={() => setDownloadStep("idle")} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>}</div></div>
    </>}
  </section>;
}

function MappingRow({ item, mappings, onGasto, onMovimiento, onNomina }: { item: A3Preview["sourcePage"]["items"][number]; mappings: Mappings; onGasto: (id: string, key: "cuentaGasto" | "cuentaContrapartida", value: string) => void; onMovimiento: (id: string, key: "cuentaContrapartida" | "contraparteHumana", value: string) => void; onNomina: (id: string, value: string) => void }) {
  return <tr className="border-t border-slate-100 align-top"><td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.fecha}</td><td className="px-3 py-3"><p className="font-semibold text-slate-900">{sourceLabels[item.source]}</p><p className="max-w-sm break-words text-xs text-slate-600">{item.label}</p></td><td className="min-w-80 px-3 py-3">{item.source === "gastos" ? <div className="grid gap-2 sm:grid-cols-2"><input inputMode="numeric" value={mappings.gastoById[item.id]?.cuentaGasto ?? ""} onChange={(event) => onGasto(item.id, "cuentaGasto", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5" placeholder="Cuenta gasto" /><input inputMode="numeric" value={mappings.gastoById[item.id]?.cuentaContrapartida ?? ""} onChange={(event) => onGasto(item.id, "cuentaContrapartida", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5" placeholder="Contrapartida" /></div> : item.source === "bank" ? <div className="grid gap-2 sm:grid-cols-2"><input value={mappings.movimientoById[item.id]?.contraparteHumana ?? ""} onChange={(event) => onMovimiento(item.id, "contraparteHumana", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5" placeholder="Contraparte humana" /><input inputMode="numeric" value={mappings.movimientoById[item.id]?.cuentaContrapartida ?? ""} onChange={(event) => onMovimiento(item.id, "cuentaContrapartida", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5" placeholder="Cuenta contrapartida" /></div> : item.source === "nominas" ? <input type="date" value={mappings.nominaById[item.id]?.fechaNominaISO ?? ""} onChange={(event) => onNomina(item.id, event.target.value)} className="rounded border border-slate-300 px-2 py-1.5" aria-label="Fecha de nómina revisada" /> : <span className="text-xs text-slate-500">No requiere mapeo por línea aquí.</span>}</td></tr>;
}
