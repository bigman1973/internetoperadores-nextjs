'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isoDay } from '@/lib/finanzas/bank-cutoffs-core';
import { makeIdempotencyKey } from '@/components/finanzas/conciliar/conciliar-contract';
import { ErrorServidor, ResultadoIncierto, getJson, postJson } from './api';

const API = '/api/admin/finanzas/cortes-cobertura';
type Account = {
  id: string; activa: boolean; banco: string; alias: string | null;
  importedCutoffDate: string | null; effectiveCutoffDate: string | null;
  noMovementsSourceVersion: string | null; latestManual: { version: number } | null;
};
type Draft = { account: Account; date: string; note: string; checked: boolean; key: string };

/** Fail-closed presentation. The API rechecks registry ACL/B3 inside the write TX. */
export default function ComprobacionSinMovimientos(p: Readonly<{
  cuentaId: string; eligible: boolean; hoy: string; acting: boolean; onSaved: () => void;
}>) {
  const viewingAs = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verComo');
  const [account, setAccount] = useState<Account | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<Record<string, unknown> | null>(null);
  const load = useCallback(async () => {
    setAllowed(false);
    if (p.acting || viewingAs || !p.eligible) return;
    try {
      const raw = await getJson(API) as { access?: { canWriteNoMovements?: boolean }; accounts?: Account[] };
      const row = raw.accounts?.find(a => a.id === p.cuentaId);
      if (raw.access?.canWriteNoMovements === true && row?.activa && row.noMovementsSourceVersion && row.effectiveCutoffDate) {
        setAccount(row); setAllowed(true);
      }
    } catch { setAccount(null); } // Denial is hidden, never a client role fallback.
  }, [p.acting, viewingAs, p.eligible, p.cuentaId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (draft) dialog.current?.showModal(); }, [draft !== null]);
  const send = async () => {
    if (!draft || busy || !allowed || p.acting || viewingAs) return;
    const body = pending.current ?? {
      action: 'comprobar_sin_movimientos', cuentaId: draft.account.id, fechaCorte: draft.date,
      nota: draft.note, confirmacion: true, idempotencyKey: draft.key,
      sourceVersion: draft.account.noMovementsSourceVersion, expectedVersion: draft.account.latestManual?.version ?? 0,
    };
    pending.current = body; setBusy(true); setMessage('');
    try {
      const result = await postJson(API, body, null) as { ok?: boolean; cutoff?: { comprobacionSinMovimientos?: boolean } };
      if (result?.ok !== true || result.cutoff?.comprobacionSinMovimientos !== true) throw new ResultadoIncierto('Respuesta sin comprobar.');
      pending.current = null; setUncertain(false); setDraft(null);
      setMessage('Comprobación humana auditada. No se han cambiado saldos, apuntes ni conciliaciones.');
      await load(); p.onSaved();
    } catch (error) {
      if (error instanceof ResultadoIncierto) {
        setUncertain(true); setMessage('Resultado sin comprobar. Reintenta la misma solicitud; no cambies fecha ni nota.');
      } else {
        pending.current = null; setUncertain(false);
        setMessage(error instanceof Error ? error.message : 'No se pudo comprobar.');
        if (error instanceof ErrorServidor && [401, 403, 404].includes(error.status)) { setAllowed(false); setDraft(null); }
        if (error instanceof ErrorServidor && error.status === 409) { setDraft(null); await load(); p.onSaved(); }
      }
    } finally { setBusy(false); }
  };
  const valid = draft && isoDay(draft.date) && draft.date <= p.hoy
    && draft.date > (draft.account.effectiveCutoffDate ?? '') && draft.note.trim().length >= 8 && draft.checked;
  if (p.acting || viewingAs || !p.eligible) return null;
  return <>
    {allowed && account && <button className="btn small" type="button" onClick={() => {
      pending.current = null; setUncertain(false); setMessage('');
      setDraft({ account, date: '', note: '', checked: false, key: makeIdempotencyKey() });
    }}>Comprobar sin movimientos hasta…</button>}
    {message && <p className="small muted" role="status">{message}</p>}
    {draft && allowed && <dialog ref={dialog} aria-labelledby={`no-mov-title-${p.cuentaId}`}
      onCancel={e => { e.preventDefault(); if (!busy && !uncertain) setDraft(null); }}
      style={{ maxWidth: 560, width: 'calc(100% - 2rem)', borderRadius: 12, padding: 24 }}>
      <form onSubmit={e => { e.preventDefault(); if (valid || uncertain) void send(); }}>
        <h2 id={`no-mov-title-${p.cuentaId}`}>Comprobar {draft.account.alias || draft.account.banco} sin movimientos</h2>
        <p className="help">Corte actual: {draft.account.effectiveCutoffDate}. La fecha importada no se cambia. Revisa personalmente en el banco que no hubo actividad hasta la fecha elegida.</p>
        <p className="small muted">El servidor valida la cadena y deriva el saldo actual exacto; no se introduce ningún importe. Esta declaración humana no importa apuntes, no cuadra saldos ni confirma cobros.</p>
        <fieldset disabled={busy || uncertain} style={{ border: 0, padding: 0 }}>
          <label>Comprobada hasta <input required type="date" max={p.hoy} value={draft.date}
            onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
          <label style={{ display: 'block', marginTop: 12 }}>Nota de revisión
            <textarea required rows={3} minLength={8} maxLength={2000} value={draft.note}
              onChange={e => setDraft({ ...draft, note: e.target.value })} style={{ display: 'block', width: '100%' }} />
          </label>
          <label style={{ display: 'flex', gap: 8, marginTop: 12 }}><input type="checkbox" checked={draft.checked} style={{ width: 18, height: 18, flex: '0 0 18px', padding: 0, marginTop: 2 }}
            onChange={e => setDraft({ ...draft, checked: e.target.checked })} />
            Confirmo que he revisado personalmente esta cuenta en el banco y no tiene movimientos nuevos desde el corte actual hasta la fecha indicada. Comprendo que sólo registro cobertura humana auditada.</label>
        </fieldset>
        {message && <p role="alert">{message}</p>}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" disabled={busy || uncertain} onClick={() => setDraft(null)}>Cancelar</button>
          <button className="btn primary" type="submit" disabled={busy || (!valid && !uncertain)}>
            {busy ? 'Registrando…' : uncertain ? 'Reintentar misma comprobación' : 'Confirmar comprobación'}
          </button>
        </div>
      </form>
    </dialog>}
  </>;
}
