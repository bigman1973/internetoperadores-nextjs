'use client';

import { ArrowPathIcon, CreditCardIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import { cents, displayDate, formatCentsText } from './easy-contract';

const API = '/api/admin/finanzas/modo-facil/tarjetas';
const DEFAULT_FROM = '2026-01-01';
const DEFAULT_TO = '2026-10-08';
const PAGE_SIZE = 50;
const CARDS = ['2390', '8964'] as const;
type CardLastFour = typeof CARDS[number];
type Notice = Readonly<{ tone: 'error' | 'info'; text: string }> | null;
type CardMovement = Readonly<{ fecha: string; banco: string; cuentaAlias: string | null; concepto: string; importeCentimos: number; estadoDocumento: string }>;
type CardRead = Readonly<{ tarjeta: CardLastFour; periodo: { desde: string; hasta: string }; total: number; importeCargosCentimos: string; cuentas: readonly Readonly<{ banco: string; alias: string | null; ibanUltimos4: string | null }>[]; movimientos: readonly CardMovement[]; limit: number; offset: number }>;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`La respuesta de tarjeta no incluye ${field} verificable.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`La respuesta de tarjeta no incluye ${field} verificable.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null { return value === null ? null : text(value, field); }
function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`La respuesta de tarjeta no incluye ${field} verificable.`);
  return value as number;
}
function signedInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`La respuesta de tarjeta no incluye ${field} verificable.`);
  return value as number;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`La respuesta de tarjeta no incluye ${field} verificable.`);
  return value;
}
function centsText(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!/^[+-]?\d+$/.test(parsed)) throw new Error(`La respuesta de tarjeta no incluye ${field} exacto.`);
  return parsed;
}
function isCardLastFour(value: unknown): value is CardLastFour { return value === '2390' || value === '8964'; }
function message(body: unknown, fallback: string): string {
  return body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' && (body as { error: string }).error.trim()
    ? (body as { error: string }).error.trim() : fallback;
}
/** Alias defensivo: ningún alias o concepto puede reflejar accidentalmente un IBAN completo en esta UI. */
export function maskPossibleIban(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\b[A-Z]{2}\d{2}(?:[\s-]*\d){10,30}\b/gi, '[cuenta protegida]');
}
export function parseEasyCardRead(value: unknown): CardRead {
  const raw = record(value, 'respuesta');
  if (raw.stagingOnly !== true || !isCardLastFour(raw.tarjeta)) throw new Error('La respuesta no declara una tarjeta de staging permitida.');
  const period = record(raw.periodo, 'periodo');
  return {
    tarjeta: raw.tarjeta,
    periodo: { desde: text(period.desde, 'periodo.desde'), hasta: text(period.hasta, 'periodo.hasta') },
    total: nonNegativeInteger(raw.total, 'total'), importeCargosCentimos: centsText(raw.importeCargosCentimos, 'importeCargosCentimos'),
    cuentas: array(raw.cuentas, 'cuentas').map((item, index) => { const account = record(item, `cuentas[${index}]`); const lastFour = nullableText(account.ibanUltimos4, `cuentas[${index}].ibanUltimos4`); if (lastFour !== null && !/^\d{4}$/.test(lastFour)) throw new Error(`cuentas[${index}].ibanUltimos4 no es seguro.`); return { banco: text(account.banco, `cuentas[${index}].banco`), alias: nullableText(account.alias, `cuentas[${index}].alias`), ibanUltimos4: lastFour }; }),
    movimientos: array(raw.movimientos, 'movimientos').map((item, index) => { const movement = record(item, `movimientos[${index}]`); return { fecha: text(movement.fecha, `movimientos[${index}].fecha`), banco: text(movement.banco, `movimientos[${index}].banco`), cuentaAlias: nullableText(movement.cuentaAlias, `movimientos[${index}].cuentaAlias`), concepto: text(movement.concepto, `movimientos[${index}].concepto`), importeCentimos: signedInteger(movement.importeCentimos, `movimientos[${index}].importeCentimos`), estadoDocumento: text(movement.estadoDocumento, `movimientos[${index}].estadoDocumento`) }; }),
    limit: nonNegativeInteger(raw.limit, 'limit'), offset: nonNegativeInteger(raw.offset, 'offset'),
  };
}

/** Consulta independiente, privada y sin mutaciones para los cargos de tarjetas autorizadas. */
export default function NewTarjetasReadPanel() {
  const [active, setActive] = useState<CardLastFour | null>(null); const [from, setFrom] = useState(DEFAULT_FROM); const [to, setTo] = useState(DEFAULT_TO);
  const [offset, setOffset] = useState(0); const [data, setData] = useState<CardRead | null>(null); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState<Notice>(null);
  const load = useCallback(async (card: CardLastFour, nextOffset: number, nextFrom = from, nextTo = to) => {
    setLoading(true); setNotice(null);
    try {
      const params = new URLSearchParams({ tarjeta: card, desde: nextFrom, hasta: nextTo, limit: String(PAGE_SIZE), offset: String(nextOffset) });
      const response = await fetch(`${API}?${params}`, { cache: 'no-store' });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(raw, `No se pudieron leer los cargos de la tarjeta (${response.status}).`));
      const parsed = parseEasyCardRead(raw);
      if (parsed.tarjeta !== card) throw new Error('La respuesta no corresponde a la tarjeta solicitada.');
      setData(parsed); setOffset(nextOffset);
    } catch (error) { setData(null); setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudieron leer los cargos de tarjeta.' }); }
    finally { setLoading(false); }
  }, [from, to]);
  function selectCard(card: CardLastFour) { setActive(card); setData(null); setOffset(0); void load(card, 0); }
  const noticeClass = notice?.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950' : 'border-blue-300 bg-blue-50 text-blue-950';
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="card-read-title"><div className="flex gap-3"><CreditCardIcon className="mt-0.5 h-6 w-6 shrink-0 text-slate-700" aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">Consulta privada · staging</p><h2 id="card-read-title" className="mt-1 text-lg font-extrabold text-slate-950">Tarjetas 2390 / 8964</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Cargos bancarios reales de la cohorte de staging. Esta consulta es de sólo lectura, no muestra titular y no modifica documentación ni tercero.</p></div></div><div role="tablist" aria-label="Tarjetas disponibles" className="mt-4 flex flex-wrap gap-2">{CARDS.map((card) => <button key={card} role="tab" aria-selected={active === card} type="button" onClick={() => selectCard(card)} disabled={loading} className={`rounded-lg px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 ${active === card ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>Terminada en {card}</button>)}</div>{active && <fieldset disabled={loading} className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold text-slate-800">Desde<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setData(null); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" /></label><label className="text-sm font-bold text-slate-800">Hasta<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setData(null); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" /></label><div className="flex items-end"><button type="button" onClick={() => void load(active, 0)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"><ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button></div></fieldset>}{notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-lg border p-3 text-sm ${noticeClass}`}><ExclamationTriangleIcon className="mr-2 inline h-5 w-5 align-text-bottom" aria-hidden="true" />{notice.text}</p>}{loading && <p className="mt-4 text-sm font-bold text-slate-600">Leyendo cargos de tarjeta…</p>}{data && <div className="mt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cargos en consulta</p><p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-950">{data.total.toLocaleString('es-ES')}</p><p className="mt-1 text-sm text-slate-600">Ordenados por mayor importe.</p></article><article className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Importe de cargos</p><p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-950">{formatCentsText(data.importeCargosCentimos)}</p><p className="mt-1 text-sm text-slate-600">Signo bancario conservado.</p></article><article className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cuentas incluidas</p><ul className="mt-1 space-y-1 text-sm text-slate-700">{data.cuentas.map((account, index) => <li key={`${account.banco}-${index}`}>{maskPossibleIban(account.banco)}{maskPossibleIban(account.alias) ? ` · ${maskPossibleIban(account.alias)}` : ''}{account.ibanUltimos4 ? ` · terminada en ${account.ibanUltimos4}` : ''}</li>)}</ul></article></div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-600"><tr><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Cuenta</th><th className="px-3 py-3">Concepto bancario</th><th className="px-3 py-3 text-right">Importe</th><th className="px-3 py-3">Documento</th></tr></thead><tbody className="divide-y divide-slate-200 bg-white">{data.movimientos.map((movement, index) => <tr key={`${movement.fecha}-${movement.concepto}-${index}`}><td className="whitespace-nowrap px-3 py-3 text-slate-700">{displayDate(movement.fecha)}</td><td className="px-3 py-3 text-slate-700">{maskPossibleIban(movement.banco)}{maskPossibleIban(movement.cuentaAlias) ? ` · ${maskPossibleIban(movement.cuentaAlias)}` : ''}</td><td className="max-w-md break-words px-3 py-3 text-slate-900">{maskPossibleIban(movement.concepto)}</td><td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-slate-950">{cents(movement.importeCentimos)}</td><td className="px-3 py-3 text-slate-700">{movement.estadoDocumento}</td></tr>)}{data.movimientos.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-600">No hay cargos en este tramo.</td></tr>}</tbody></table></div><nav aria-label="Paginación de cargos de tarjeta" className="flex items-center justify-between gap-3"><button type="button" disabled={loading || offset <= 0} onClick={() => void load(data.tarjeta, Math.max(0, offset - PAGE_SIZE))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Anterior</button><span className="text-sm text-slate-700">{data.total ? `${offset + 1}–${Math.min(offset + data.limit, data.total)} de ${data.total}` : 'Sin resultados'}</span><button type="button" disabled={loading || offset + data.limit >= data.total} onClick={() => void load(data.tarjeta, offset + data.limit)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Siguiente</button></nav></div>}</section>;
}
