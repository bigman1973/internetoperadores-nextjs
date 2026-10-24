'use client';

import {
  ArrowPathIcon, BanknotesIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon,
  DocumentCheckIcon, ExclamationTriangleIcon, InformationCircleIcon,
  MagnifyingGlassIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import PhotoCaptureForm, { type UploadDraft } from './PhotoCaptureForm';
import {
  buildConfirmInvoicePayload, buildCreateRulePayload, buildDisableRulePayload, buildNoRequirePayload, buildUndoPayload,
  canConfirmSuggestion, cents, displayDate, formatCentsText, lastFour, makeIdempotencyKey,
  noRequireReasonLabel, parseEasyReadResponse, ruleActionLabel, sortQueueByMagnitude, suggestionEvidenceLabel,
  type ConfirmarFacturaPayload, type CrearReglaPayload, type DesactivarReglaPayload, type DeshacerModoFacilPayload,
  type EasyMovement, type EasyReadResponse, type EasyRule, type EasySuggestion, type NoRequierePayload, type SentidoEasy,
} from './easy-contract';
import { mayManageAutomation, mayViewAdvancedEasyWorkspace, parseEasyAccessProfile, type EasyAccessProfile } from './easy-two-step-client';
import EasyHowTo from './EasyHowTo';
import NewAutomaticRulesPanel from './newAutomaticRulesPanel';
import NewThirdPartyWorkspace from './newThirdPartyWorkspace';
import NewTwoStepSummary from './newTwoStepSummary';

/** Extensión coordinada: el hijo la implementa en su entrega independiente. */
const CoordinatedThirdPartyWorkspace = NewThirdPartyWorkspace as ComponentType<{
  enabled: boolean;
  from: string;
  to: string;
  query: string;
  sentido: SentidoEasy;
  card: string;
  simple?: boolean;
  onChanged?: () => void;
}>;

const DEFAULT_FROM = '2026-01-01';
const DEFAULT_TO = '2026-10-08';
const LIMIT = 25;
const CARDS: ReadonlyArray<{ value: '9029' | '6440'; label: string }> = [
  { value: '9029', label: 'Víctor · terminada en 9029' }, { value: '6440', label: 'David · terminada en 6440' },
];
type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;
type ConfirmAction =
  | { kind: 'invoice'; movement: EasyMovement; suggestion: EasySuggestion; payload: ConfirmarFacturaPayload }
  | { kind: 'no-require'; movement: EasyMovement; reason: string; payload: NoRequierePayload }
  | { kind: 'upload'; movement: EasyMovement; draft: UploadDraft }
  | { kind: 'undo'; operationId: string; payload: DeshacerModoFacilPayload }
  | { kind: 'rule'; operationId: string; provider: string; payload: CrearReglaPayload }
  | { kind: 'disable-rule'; rule: EasyRule; payload: DesactivarReglaPayload };
type Retriable = { action: ConfirmAction } | null;
type AuditOperation = { operationId: string; label: string; reversible: boolean };
type FinanceEasyEnvironment = 'staging' | 'production';

class RequestFailure extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

/** No se trasladan textos internos del servidor a la pantalla. */
function friendlyError(body: unknown, fallback: string): string {
  const raw = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
  const normalized = raw.toLowerCase();
  if (/permiso|forbidden|autoriz/.test(normalized)) return 'No tienes permiso para completar esta acción.';
  if (/conflict|concurrent|versi[oó]n|cambi/.test(normalized)) return 'Este movimiento ha cambiado. Actualiza la lista y vuelve a revisarlo.';
  if (/origen|solicitud/.test(normalized)) return 'No se ha podido comprobar esta solicitud. Vuelve a intentarlo desde esta pantalla.';
  return fallback;
}
function friendlyClientError(error: unknown, fallback: string): string {
  if (error instanceof RequestFailure) return error.message;
  if (error instanceof TypeError || (error instanceof Error && /network|red|timeout|fetch/i.test(error.message))) return 'No se ha podido contactar con el servidor. Conservamos tu acción para reintentarla.';
  return fallback;
}
function isUncertain(error: unknown) {
  return error instanceof RequestFailure ? error.uncertain : error instanceof TypeError || (error instanceof Error && /network|red|timeout|fetch/i.test(error.message));
}
function actionLabel(action: ConfirmAction) {
  if (action.kind === 'invoice') return `Confirmar el documento «${action.suggestion.referencia}» para este movimiento`;
  if (action.kind === 'no-require') return `Confirmar que no necesita documento: ${noRequireReasonLabel(action.reason)}`;
  if (action.kind === 'upload') return `Añadir «${action.draft.file.name}» para revisarlo después`;
  if (action.kind === 'undo') return 'Deshacer esta acción';
  if (action.kind === 'rule') return `Guardar esta propuesta para «${action.provider}»`;
  return `Desactivar la propuesta de «${action.rule.contraparte}»`;
}
function endpointFor(action: ConfirmAction) {
  if (action.kind === 'undo') return '/api/admin/finanzas/modo-facil/deshacer';
  return action.kind === 'rule' || action.kind === 'disable-rule' ? '/api/admin/finanzas/modo-facil/reglas' : '/api/admin/finanzas/modo-facil';
}
function firstFocusable(root: HTMLElement | null) {
  return root?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? null;
}
function movementWhoIs(movement: EasyMovement): string {
  if (movement.quienEs?.estado === 'IDENTIFICADO' && movement.quienEs.nombre) return movement.quienEs.nombre;
  if (movement.quienEs?.estado === 'PROPUESTO' && movement.quienEs.nombre) return `${movement.quienEs.nombre} · por confirmar`;
  return 'Pendiente de identificar';
}
function suggestionNote(suggestion: EasySuggestion): string | null {
  if (suggestion.exacta) return null;
  return suggestion.archivoDisponible ? 'Revisa los datos del documento antes de usarlo.' : 'Este documento no está disponible para revisarlo.';
}

function ModalShell({ titleId, children, onClose, busy }: { titleId: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const dialog = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => firstFocusable(dialog.current)?.focus(), 0);
    return () => opener.current?.focus();
  }, []);
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    if (!nodes?.length) { event.preventDefault(); return; }
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 sm:items-center" role="presentation"><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">{children}</section></div>;
}
function Dialog({ action, busy, onCancel, onConfirm }: { action: ConfirmAction; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancel = () => { if (!busy) onCancel(); };
  return <ModalShell titleId="easy-confirm-title" busy={busy} onClose={cancel}>
    <div className="flex items-start gap-3"><ShieldCheckIcon className="mt-0.5 h-6 w-6 shrink-0 text-orange-600" aria-hidden="true" /><div><h2 id="easy-confirm-title" className="text-lg font-extrabold text-slate-950">Confirmación final</h2><p className="mt-2 text-sm leading-6 text-slate-700">{actionLabel(action)}. El cambio se enviará sólo al confirmar ahora.</p>{action.kind === 'upload' && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">El archivo quedará disponible para revisarlo. Aún no confirma el movimiento.</p>}</div></div>
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={cancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Cancelar</button><button type="button" disabled={busy} onClick={onConfirm} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">{busy ? 'Enviando…' : 'Confirmar'}</button></div>
  </ModalShell>;
}

function SourceLink({ suggestion }: { suggestion: EasySuggestion }) {
  if (!suggestion.archivoDisponible || !suggestion.archivoPrivadoHref) return null;
  return <a href={suggestion.archivoPrivadoHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-bold text-orange-800 underline" onClick={(event) => event.stopPropagation()}>Abrir documento</a>;
}
function SuggestionCard({ movement, suggestion, selected, onSelect }: { movement: EasyMovement; suggestion: EasySuggestion; selected: boolean; onSelect: () => void }) {
  const exact = canConfirmSuggestion(movement, suggestion);
  return <label className={`block cursor-pointer rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-orange-500 ${selected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-300' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
    <input type="radio" name={`sugerencia-${movement.id}`} checked={selected} onChange={onSelect} className="sr-only" aria-label={`Seleccionar ${suggestion.referencia}`} />
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-extrabold text-slate-950">{suggestion.referencia}</p><p className="mt-1 text-xs text-slate-600">{suggestion.tercero || 'Proveedor por confirmar'} · {suggestion.tipo.replaceAll('_', ' ').toLocaleLowerCase('es-ES')}</p></div><span className={`rounded-full border px-2 py-1 text-xs font-bold ${exact ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>{suggestionEvidenceLabel(suggestion)}</span></div>
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><dt className="font-semibold uppercase tracking-wide text-slate-500">Fecha</dt><dd className="mt-0.5 font-semibold text-slate-800">{displayDate(suggestion.fecha)}</dd></div><div><dt className="font-semibold uppercase tracking-wide text-slate-500">Vencimiento</dt><dd className="mt-0.5 font-semibold text-slate-800">{displayDate(suggestion.vencimiento)}</dd></div><div><dt className="font-semibold uppercase tracking-wide text-slate-500">Importe</dt><dd className="mt-0.5 font-semibold text-slate-800">{cents(suggestion.importeCentimos)}</dd></div><div><dt className="font-semibold uppercase tracking-wide text-slate-500">Archivo</dt><dd className="mt-0.5 font-semibold text-slate-800">{suggestion.archivoDisponible ? 'Disponible' : 'No disponible'}</dd></div></dl>
    <SourceLink suggestion={suggestion} />
    {suggestionNote(suggestion) && <p className="mt-3 text-xs leading-5 text-slate-600">{suggestionNote(suggestion)}</p>}
  </label>;
}
function MovementCard({ movement, chosenSuggestionId, onSuggestion, onInvoice, onUpload, onNoRequire, busy }: { movement: EasyMovement; chosenSuggestionId: string; onSuggestion: (id: string) => void; onInvoice: () => void; onUpload: () => void; onNoRequire: () => void; busy: boolean }) {
  const selected = movement.sugerencias.find((item) => item.id === chosenSuggestionId) || null;
  const selectable = selected ? canConfirmSuggestion(movement, selected) : false;
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby={`movement-${movement.id}`}>
    <header className="border-b border-slate-200 bg-slate-900 px-4 py-4 text-white"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-orange-300">Pendiente</p><h2 id={`movement-${movement.id}`} className="mt-1 break-words text-base font-extrabold">Quién es: {movementWhoIs(movement)}</h2><p className="mt-1 break-words text-sm text-slate-200">{movement.concepto}</p></div><p className="shrink-0 text-lg font-extrabold tabular-nums text-white">{cents(movement.importeCentimos)}</p></div></header>
    <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-2"><section aria-label="Movimiento bancario" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2"><BanknotesIcon className="h-5 w-5 text-slate-700" aria-hidden="true" /><h3 className="font-bold text-slate-950">Movimiento</h3></div><dl className="mt-3 grid gap-2 text-sm"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</dt><dd className="font-semibold text-slate-900">{displayDate(movement.fecha)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta</dt><dd className="break-words font-semibold text-slate-900">{movement.cuenta.banco}{movement.cuenta.alias ? ` · ${movement.cuenta.alias}` : ''}</dd></div>{movement.tarjeta && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tarjeta</dt><dd className="font-semibold text-slate-900">Terminada en {lastFour(movement.tarjeta)}{movement.responsableTarjeta ? ` · ${movement.responsableTarjeta}` : ''}</dd></div>}<div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Importe</dt><dd className="font-bold text-slate-950">{cents(movement.importeCentimos)}</dd></div></dl></section>
      <section aria-label="Documento propuesto" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><DocumentCheckIcon className="h-5 w-5 text-orange-700" aria-hidden="true" /><h3 className="font-bold text-slate-950">Qué papel lo justifica</h3></div>{movement.sugerencias.length === 0 ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Aún no hay un documento propuesto. Si tienes un ticket o factura, añádelo para revisarlo después.</p> : <div className="mt-3 space-y-2" role="radiogroup" aria-label="Documento propuesto">{movement.sugerencias.map((suggestion) => <SuggestionCard key={suggestion.id} movement={movement} suggestion={suggestion} selected={chosenSuggestionId === suggestion.id} onSelect={() => onSuggestion(suggestion.id)} />)}</div>}</section></div>
    <footer className="border-t border-slate-200 bg-slate-50 p-4">{movement.motivoNoRequierePropuesto && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-950">Se propone: {noRequireReasonLabel(movement.motivoNoRequierePropuesto)}. Revísalo antes de confirmar.</p>}<p className="mb-3 text-xs text-slate-600">Elige el documento que corresponde o indica el caso aplicable. Nada cambia hasta que confirmes.</p><div className="grid gap-2 sm:grid-cols-3"><button type="button" disabled={busy || !selectable} title={!selectable ? 'Selecciona un documento que coincida exactamente. Para un gasto, el archivo debe estar disponible.' : undefined} onClick={onInvoice} className="rounded-lg bg-slate-900 px-3 py-3 text-sm font-extrabold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Es este documento</button><button type="button" disabled={busy || movement.importeCentimos >= 0} onClick={onUpload} className="rounded-lg border border-orange-400 bg-white px-3 py-3 text-sm font-extrabold text-orange-900 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Añadir foto o PDF</button><button type="button" disabled={busy} onClick={onNoRequire} className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-extrabold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">No necesita documento</button></div></footer>
  </article>;
}

export default function EasyReconciliationWorkspace({ environment }: { environment: FinanceEasyEnvironment }) {
  const [data, setData] = useState<EasyReadResponse | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [notice, setNotice] = useState<Notice>(null);
  const [from, setFrom] = useState(DEFAULT_FROM); const [to, setTo] = useState(DEFAULT_TO); const [queryInput, setQueryInput] = useState(''); const [query, setQuery] = useState(''); const [sentido, setSentido] = useState<SentidoEasy>('TODOS'); const [card, setCard] = useState(''); const [offset, setOffset] = useState(0);
  const [queueStep, setQueueStep] = useState<'TODOS' | 'P1_PENDIENTE' | 'P2_PENDIENTE'>('TODOS');
  const [choice, setChoice] = useState<Record<string, string>>({}); const [activeUpload, setActiveUpload] = useState<EasyMovement | null>(null); const [noRequire, setNoRequire] = useState<EasyMovement | null>(null); const [reason, setReason] = useState(''); const [confirming, setConfirming] = useState<ConfirmAction | null>(null); const [submitting, setSubmitting] = useState(false); const [retriable, setRetriable] = useState<Retriable>(null); const [audits, setAudits] = useState<AuditOperation[]>([]); const [ruleOffer, setRuleOffer] = useState<{ operationId: string; provider: string } | null>(null);
  const [profile, setProfile] = useState<EasyAccessProfile | null>(null);
  const requestSequence = useRef(0); const mutationsBlocked = submitting || retriable !== null;
  const canManageAutomation = mayManageAutomation(profile);
  const showAdvanced = mayViewAdvancedEasyWorkspace(profile);

  const load = useCallback(async (silent = false, preserveNotice = false) => {
    const sequence = ++requestSequence.current; if (silent) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ desde: from, hasta: to, limit: String(LIMIT), offset: String(offset), sentido });
      if (query.trim()) params.set('q', query.trim().slice(0, 120)); if (card) params.set('tarjeta', card);
      const response = await fetch(`/api/admin/finanzas/modo-facil?${params}`, { cache: 'no-store' }); const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(raw, 'No se ha podido actualizar la lista.'));
      const parsed = parseEasyReadResponse(raw); if (sequence !== requestSequence.current) return;
      setData(parsed);
      setChoice((current) => { const next = { ...current }; for (const movement of parsed.movimientos) { const exact = movement.sugerencias.filter((item) => canConfirmSuggestion(movement, item)); if (!movement.sugerencias.some((item) => item.id === next[movement.id])) { delete next[movement.id]; if (exact.length === 1) next[movement.id] = exact[0].id; } } return next; });
      if (!preserveNotice) setNotice(null);
    } catch (error) { if (sequence === requestSequence.current) setNotice({ tone: 'error', text: friendlyClientError(error, 'No se ha podido actualizar la lista.') }); }
    finally { if (sequence === requestSequence.current) { setLoading(false); setRefreshing(false); } }
  }, [card, from, offset, query, sentido, to]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/admin/finanzas/modo-facil/perfil', { cache: 'no-store' }); const raw: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(); const next = parseEasyAccessProfile(raw); if (active) setProfile(next);
      } catch { if (active) setProfile(null); }
    })();
    return () => { active = false; };
  }, []);
  const queue = useMemo(() => sortQueueByMagnitude(data?.movimientos || []), [data]);
  const onThirdPartyChanged = useCallback(() => { void load(true, true); }, [load]);


  function requestInvoice(movement: EasyMovement) { if (mutationsBlocked) return; const suggestion = movement.sugerencias.find((item) => item.id === choice[movement.id]); if (!suggestion || !canConfirmSuggestion(movement, suggestion)) { setNotice({ tone: 'error', text: 'Selecciona un documento que coincida exactamente. Para un gasto, el archivo debe estar disponible.' }); return; } setConfirming({ kind: 'invoice', movement, suggestion, payload: buildConfirmInvoicePayload(movement, suggestion, makeIdempotencyKey()) }); }
  function requestNoRequire(movement: EasyMovement) { if (!mutationsBlocked) { setNoRequire(movement); setReason(movement.motivoNoRequierePropuesto ?? ''); } }
  function reviewNoRequire() { if (!noRequire || !reason || mutationsBlocked) return; setConfirming({ kind: 'no-require', movement: noRequire, reason, payload: buildNoRequirePayload(noRequire, reason, makeIdempotencyKey()) }); setNoRequire(null); }
  function reviewUpload(draft: UploadDraft) { if (!activeUpload || mutationsBlocked) return; const movement = activeUpload; setActiveUpload(null); setConfirming({ kind: 'upload', movement, draft }); }
  function requestUndo(audit: AuditOperation) { if (!mutationsBlocked) setConfirming({ kind: 'undo', operationId: audit.operationId, payload: buildUndoPayload(audit.operationId, makeIdempotencyKey()) }); }
  function requestRule(offer: { operationId: string; provider: string }) { if (!mutationsBlocked && canManageAutomation) { setConfirming({ kind: 'rule', operationId: offer.operationId, provider: offer.provider, payload: buildCreateRulePayload(offer.operationId) }); setRuleOffer(null); } }
  function requestDisable(rule: EasyRule) { if (!mutationsBlocked && canManageAutomation) setConfirming({ kind: 'disable-rule', rule, payload: buildDisableRulePayload(rule) }); }

  async function send(action: ConfirmAction) {
    if (submitting) return;
    setSubmitting(true);
    try {
      if ((action.kind === 'rule' || action.kind === 'disable-rule') && !canManageAutomation) throw new Error('La opción no está disponible para este perfil.');
      let response: Response;
      if (action.kind === 'upload') {
        const form = new FormData(); form.set('movimientoId', action.draft.movimientoId); form.set('versionGestion', String(action.draft.versionGestion)); form.set('tipoDocumento', 'TICKET'); form.set('nombreProveedor', action.draft.nombreProveedor); form.set('concepto', action.draft.concepto); form.set('fechaDocumento', action.draft.fechaDocumento); form.set('importeDocumento', action.draft.importeDocumento); form.set('confirmacionDocumento', 'true'); form.set('idempotencyKey', action.draft.idempotencyKey); form.set('archivo', action.draft.file);
        response = await fetch('/api/admin/finanzas/modo-facil/foto', { method: 'POST', body: form });
      } else response = await fetch(endpointFor(action), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new RequestFailure(friendlyError(raw, 'No se ha podido completar la acción.'), response.status >= 500);
      if (!raw || typeof raw !== 'object' || (raw as { ok?: unknown }).ok !== true) throw new RequestFailure('No hemos podido comprobar el resultado. No se iniciará otra acción hasta recuperarlo.', true);
      if (action.kind === 'upload') {
        if (typeof (raw as { idAdjunto?: unknown }).idAdjunto !== 'string') throw new RequestFailure('No hemos podido comprobar que el archivo se haya añadido. No se iniciará otra acción hasta recuperarlo.', true);
        setConfirming(null); setRetriable(null); setNotice({ tone: 'success', text: 'Archivo añadido. Revísalo y confirma el movimiento cuando corresponda.' }); void load(true, true); return;
      }
      if (action.kind === 'invoice' || action.kind === 'no-require') {
        const result = raw as { operacionId?: unknown; reversible?: unknown };
        if (typeof result.operacionId !== 'string' || !result.operacionId.trim()) throw new RequestFailure('No hemos podido comprobar la acción. No se iniciará otra acción hasta recuperarla.', true);
        const operation: AuditOperation = { operationId: result.operacionId, reversible: result.reversible === true, label: action.kind === 'invoice' ? `Documento ${action.suggestion.referencia}` : `No necesita documento: ${noRequireReasonLabel(action.reason)}` };
        setAudits((current) => [operation, ...current.filter((item) => item.operationId !== operation.operationId)]);
        if (canManageAutomation) setRuleOffer({ operationId: operation.operationId, provider: action.movement.contraparte || 'este proveedor' }); else setRuleOffer(null);
        setConfirming(null); setRetriable(null); setNotice({ tone: 'success', text: 'Hecho. Puedes deshacerlo aquí mismo si detectas un error.' }); void load(true, true); return;
      }
      if (action.kind === 'undo') {
        setAudits((current) => current.filter((item) => item.operationId !== action.operationId));
        setConfirming(null); setRetriable(null); setNotice({ tone: 'success', text: 'Acción deshecha.' }); void load(true, true); return;
      }
      setConfirming(null); setRetriable(null);
      setNotice({ tone: 'success', text: action.kind === 'disable-rule' ? 'Propuesta desactivada.' : 'Propuesta guardada para futuras revisiones.' });
      void load(true, true);
    } catch (error) {
      const message = friendlyClientError(error, 'No se ha podido completar la acción.');
      if (isUncertain(error)) { setRetriable({ action }); setNotice({ tone: 'error', text: `Resultado pendiente de comprobar. Reintenta exactamente la misma acción antes de continuar. ${message}` }); }
      else setNotice({ tone: 'error', text: message });
      setConfirming(null);
    } finally { setSubmitting(false); }
  }

  const noticeStyles = notice?.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950' : notice?.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-blue-300 bg-blue-50 text-blue-950';
  return <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-3 py-5 sm:px-6 lg:px-8">
    <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Finanzas · Modo fácil</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">Revisa cada movimiento</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Sólo comisiones y traspasos comprobados pueden seguir las reglas autorizadas. El resto lo revisas tú.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-extrabold text-orange-950"><ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />{environment === 'production' ? 'Producción · revisión manual' : 'Staging · revisión manual'}</span></div><p className="mt-4 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs leading-5 text-slate-100">{environment === 'production' ? 'Los vínculos automáticos están desactivados. Cada cambio exige confirmación final y no se envían comunicaciones ni se ejecutan sincronizaciones.' : 'Entorno aislado de pruebas. Cada cambio exige confirmación final; no se envían comunicaciones ni se ejecutan sincronizaciones.'}</p></header>
    <EasyHowTo mode="modo-facil" />
    {notice && <div role="alert" className={`flex gap-2 rounded-xl border p-4 text-sm ${noticeStyles}`}><InformationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" /><p>{notice.text}</p></div>}
    {retriable && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4"><div className="flex gap-3"><ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-900" aria-hidden="true" /><div><h2 className="font-extrabold text-amber-950">Resultado pendiente de comprobar</h2><p className="mt-1 text-sm text-amber-950">El envío puede haber llegado al servidor. Reintenta esta misma acción antes de hacer otra modificación.</p><button type="button" disabled={submitting} onClick={() => void send(retriable.action)} className="mt-3 rounded-lg bg-amber-800 px-4 py-2 text-sm font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">{submitting ? 'Reintentando…' : 'Reintentar la misma acción'}</button></div></div></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Filtros de la cola"><div className="grid gap-3 lg:grid-cols-6"><label className="text-sm font-bold text-slate-800">Desde<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" /></label><label className="text-sm font-bold text-slate-800">Hasta<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" /></label><label className="text-sm font-bold text-slate-800">Movimiento<select value={sentido} onChange={(event) => { setSentido(event.target.value as SentidoEasy); setOffset(0); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="TODOS">Todos</option><option value="CARGOS">Cargos</option><option value="COBROS">Cobros</option></select></label><label className="text-sm font-bold text-slate-800">Tarjeta<select value={card} onChange={(event) => { setCard(event.target.value); setOffset(0); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="">Todas</option>{CARDS.map((known) => <option key={known.value} value={known.value}>{known.label}</option>)}</select></label><label className="text-sm font-bold text-slate-800 lg:col-span-2">Buscar movimiento o proveedor<div className="mt-1 flex"><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setQuery(queryInput); setOffset(0); } }} placeholder="Concepto, proveedor…" className="min-w-0 flex-1 rounded-l-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" /><button type="button" onClick={() => { setQuery(queryInput); setOffset(0); }} className="rounded-r-lg bg-slate-900 px-3 text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Buscar"><MagnifyingGlassIcon className="h-5 w-5" /></button></div></label></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3"><p className="text-sm text-slate-700">{data ? <><strong className="text-slate-950">{data.total}</strong> pendientes en la consulta</> : 'Cargando lista…'}</p><button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button></div></section>
    {!showAdvanced && data && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Contador de pendientes"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pendientes por revisar</p><p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-950">{data.total.toLocaleString('es-ES')}</p><p className="mt-1 text-sm text-slate-600">Usa los filtros para encontrar el siguiente movimiento.</p></section>}
    {showAdvanced && data && <NewTwoStepSummary pasos={data.pasos} />}
    {audits.length > 0 && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm" aria-labelledby="done-title"><div className="flex gap-2"><CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" /><div><h2 id="done-title" className="text-lg font-extrabold text-slate-950">Hecho</h2><p className="mt-1 text-sm text-slate-700">Puedes deshacer una acción de esta sesión si detectas un error.</p></div></div><ul className="mt-3 space-y-2">{audits.map((audit) => <li key={audit.operationId} className="flex flex-col gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-bold text-slate-950">{audit.label}</p>{audit.reversible ? <button type="button" disabled={mutationsBlocked} onClick={() => requestUndo(audit)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Deshacer</button> : <span className="text-xs font-bold text-slate-600">No se puede deshacer</span>}</li>)}</ul></section>}
    {showAdvanced && <NewAutomaticRulesPanel profile={profile} />}
    {showAdvanced && canManageAutomation && ruleOffer && <section className="rounded-2xl border border-orange-300 bg-orange-50 p-4"><h2 className="font-extrabold text-slate-950">Guardar esta propuesta</h2><p className="mt-1 text-sm leading-6 text-slate-700">Puedes conservar la propuesta para <strong>{ruleOffer.provider}</strong> para revisiones futuras.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={mutationsBlocked} onClick={() => requestRule(ruleOffer)} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Guardar propuesta</button><button type="button" disabled={mutationsBlocked} onClick={() => setRuleOffer(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Ahora no</button></div></section>}
    {showAdvanced && canManageAutomation && data && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="rules-title"><h2 id="rules-title" className="text-lg font-extrabold text-slate-950">Propuestas guardadas</h2>{data.reglas.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">No hay propuestas guardadas en esta consulta.</p> : <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200">{data.reglas.map((rule) => <li key={rule.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-950">{rule.contraparte}</p><p className="mt-1 text-xs text-slate-600">{ruleActionLabel(rule.accion)} · {rule.usosConfirmados} revisiones confirmadas</p></div>{rule.activa ? <button type="button" disabled={mutationsBlocked} onClick={() => requestDisable(rule)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Desactivar</button> : <span className="text-sm font-bold text-slate-600">Desactivada</span>}</li>)}</ul>}</section>}
    <section aria-labelledby="queue-title"><div className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h2 id="queue-title" className="text-xl font-extrabold text-slate-950">Colas de revisión</h2><p className="mt-1 text-sm text-slate-600">{'Primero revisa quién es; después, qué papel lo justifica.'}</p></div><div role="tablist" aria-label="Cola de revisión" className="flex flex-wrap gap-2"><button type="button" role="tab" aria-selected={queueStep === 'TODOS'} onClick={() => setQueueStep('TODOS')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 ${queueStep === 'TODOS' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>Todos</button>{<button type="button" role="tab" aria-selected={queueStep === 'P1_PENDIENTE'} disabled={!data?.pasos} onClick={() => setQueueStep('P1_PENDIENTE')} title={!data?.pasos ? 'Esta cola estará disponible cuando los datos estén listos.' : undefined} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${queueStep === 'P1_PENDIENTE' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-950 hover:bg-blue-100'}`}>Quién es</button>}<button type="button" role="tab" aria-selected={queueStep === 'P2_PENDIENTE'} onClick={() => setQueueStep('P2_PENDIENTE')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 ${queueStep === 'P2_PENDIENTE' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-950 hover:bg-orange-100'}`}>Qué papel lo justifica</button></div></div>
      {(queueStep === 'TODOS' || queueStep === 'P1_PENDIENTE') && <CoordinatedThirdPartyWorkspace enabled={data?.pasos !== undefined} from={from} to={to} query={query} sentido={sentido} card={card} simple={!showAdvanced} onChanged={onThirdPartyChanged} />}
      {(queueStep === 'TODOS' || queueStep === 'P2_PENDIENTE') && <div className={queueStep === 'TODOS' ? 'mt-5' : ''}><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-xl font-extrabold text-slate-950">Qué papel lo justifica</h3><p className="mt-1 text-sm text-slate-600">Revisa el documento sin cambiar la identificación de la persona o empresa.</p></div>{loading && <span className="text-sm font-bold text-slate-600">Cargando…</span>}</div>{!loading && queue.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-700">No hay pendientes con estos filtros.</div> : <div className="space-y-4">{queue.map((movement) => <div key={movement.id} className="min-w-0"><MovementCard movement={movement} chosenSuggestionId={choice[movement.id] || ''} onSuggestion={(id) => { if (!mutationsBlocked) setChoice((current) => ({ ...current, [movement.id]: id })); }} onInvoice={() => requestInvoice(movement)} onUpload={() => { if (!mutationsBlocked) setActiveUpload(movement); }} onNoRequire={() => requestNoRequire(movement)} busy={mutationsBlocked} />{activeUpload?.id === movement.id && <PhotoCaptureForm movement={movement} makeIdempotencyKey={makeIdempotencyKey} onReview={reviewUpload} onCancel={() => setActiveUpload(null)} disabled={mutationsBlocked} />}</div>)}</div>}{data && <nav aria-label="Paginación de la cola" className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={offset <= 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-40"><ChevronLeftIcon className="h-4 w-4" />Anterior</button><span className="text-sm text-slate-700">{data.total ? `${offset + 1}–${Math.min(offset + LIMIT, data.total)} de ${data.total}` : 'Sin resultados'}</span><button type="button" disabled={offset + LIMIT >= data.total || loading} onClick={() => setOffset(offset + LIMIT)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-40">Siguiente<ChevronRightIcon className="h-4 w-4" /></button></nav>}</div>}</section>
    {noRequire && <ModalShell titleId="no-require-title" busy={mutationsBlocked} onClose={() => { if (!mutationsBlocked) setNoRequire(null); }}><h2 id="no-require-title" className="text-lg font-extrabold text-slate-950">Motivo de que no necesita documento</h2><p className="mt-2 text-sm text-slate-700">Selecciona el motivo que corresponda. Aún no se ha guardado nada.</p><select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-4 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="">Selecciona un motivo…</option><option value="COMISION_BANCARIA">Comisión bancaria</option><option value="INTERES_BANCARIO">Interés bancario</option><option value="REDONDEO_BANCARIO">Redondeo bancario</option><option value="TRASPASO_INTERNO_SIN_DOCUMENTO">Traspaso entre cuentas propias</option><option value="MOVIMIENTO_TECNICO_BANCO">Ajuste del banco</option><option value="CORRECCION_BANCARIA">Corrección bancaria</option></select><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={mutationsBlocked} onClick={() => setNoRequire(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50">Cancelar</button><button type="button" disabled={!reason || mutationsBlocked} onClick={reviewNoRequire} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Revisar antes de confirmar</button></div></ModalShell>}
    {confirming && <Dialog action={confirming} busy={submitting} onCancel={() => setConfirming(null)} onConfirm={() => void send(confirming)} />}
  </main>;
}
