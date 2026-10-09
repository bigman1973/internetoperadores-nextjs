'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SERVICE_TYPES, SaleService, ServiceType } from '@/lib/finanzas/sale-services';

interface ServicesResponse {
  base: number; componentes: SaleService[]; version: string; clasificado: number; pendiente: number;
  completo: boolean; mixto: boolean; canWrite: boolean; aviso: string;
  referenciaAnterior: { facturaId: string; numFactura: string; componentes: SaleService[] } | null;
}
interface Draft { id?: string; nombre: string; tipo: ServiceType; base: string }
const money = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700';
const toDraft = (items: SaleService[]): Draft[] => items.map(item => ({ ...item, base: String(item.base) }));

export default function VentaServicios({ facturaId, base, canWrite, onChange }: {
  facturaId: string; base: number; canWrite: boolean; onChange?: () => void;
}) {
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setEditing(false); setError('');
    fetch(`/api/admin/finanzas/rentabilidad/servicios?facturaId=${encodeURIComponent(facturaId)}`, { signal: controller.signal })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'No se pudo cargar el desglose.');
        if (!controller.signal.aborted) { setData(value); setDraft(toDraft(value.componentes)); }
      }).catch(err => { if (!controller.signal.aborted) setError(err.message || 'No se pudo cargar el desglose.'); });
    return () => controller.abort();
  }, [facturaId, reload]);
  const amount = draft.reduce((total, item) => total + Math.round(Number(item.base.replace(',', '.')) * 100), 0) / 100;
  const remaining = Math.round(((data?.base ?? base) - amount) * 100) / 100;
  const update = (index: number, value: Partial<Draft>) => setDraft(rows => rows.map((row, idx) => idx === index ? { ...row, ...value } : row));
  async function save() {
    if (!data || saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/finanzas/rentabilidad/servicios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facturaId, version: data.version, componentes: draft.map(item => ({ ...item, base: Number(item.base.replace(',', '.')) })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el desglose.');
      setEditing(false); setReload(value => value + 1); onChange?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el desglose.'); }
    finally { setSaving(false); }
  }
  return (
    <section className="rounded-xl border border-blue-200 bg-white p-4 text-slate-900" aria-label="Desglose de servicios de la venta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h4 className="font-bold text-slate-900">Servicios y packs de esta venta</h4>
          <p className="mt-1 text-xs leading-5 text-slate-700">Un cliente puede tener varios servicios y combinar red propia con intermediación. La clasificación se aplica a cada componente, no al cliente.</p>
        </div>
        {data && canWrite && data.canWrite && !editing && <button type="button" onClick={() => { setDraft(toDraft(data.componentes)); setEditing(true); setError(''); }} className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700">Desglosar servicios</button>}
      </div>
      {error && <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}{!data && <button type="button" onClick={() => setReload(value => value + 1)} className="ml-3 font-bold underline">Reintentar</button>}</div>}
      {!data && !error && <p className="mt-3 text-sm text-slate-700">Cargando desglose…</p>}
      {data && !editing && <>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-800"><span>Venta sin IVA: {money(data.base)}</span><span>Clasificado: {money(data.clasificado)}</span><span className={data.completo ? 'text-emerald-800' : 'text-amber-900'}>Sin desglosar: {money(data.pendiente)}</span>{data.mixto && <span className="rounded bg-blue-50 px-2 text-blue-900">Pack mixto</span>}</div>
        {data.componentes.length ? <ul className="mt-3 divide-y divide-slate-200">{data.componentes.map(item => <li key={item.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-900">{item.nombre}</p><p className="text-xs text-slate-700">{SERVICE_TYPES[item.tipo]}</p></div><strong className="text-sm tabular-nums text-slate-900">{money(item.base)}</strong></li>)}</ul> : <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Todavía no se han identificado los servicios de esta factura. No se deducen por su serie ni por el nombre del cliente.</p>}
        {data.referenciaAnterior && canWrite && data.canWrite && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><p className="font-semibold">Referencia compatible del mes anterior: {data.referenciaAnterior.numFactura}</p><p className="mt-1 text-xs leading-5">Coinciden cliente identificado, serie, concepto, líneas y base. Puedes reutilizar el desglose como borrador; revísalo antes de guardarlo. No copia compras, horas ni costes del mes anterior.</p><button type="button" onClick={() => { setDraft(toDraft(data.referenciaAnterior!.componentes)); setEditing(true); setError(''); }} className="mt-2 rounded-lg border border-emerald-700 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 focus:ring-2 focus:ring-emerald-700">Usar referencia mensual</button></div>}
        <p className="mt-3 text-xs leading-5 text-slate-700">{data.aviso} Los componentes de un pack mixto siguen pendientes de reparto de costes; tampoco se reparte automáticamente el coste común de la red.</p>
        {data.componentes.some(item => item.tipo === 'TELECO_RED_PROPIA') && <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950"><p className="font-semibold">Este servicio utiliza nuestra red: sus costes están en Costes de operadora.</p><p className="mt-1 text-xs leading-5">Identifica los artículos del proveedor directo o de la empresa que nos refactura y su ámbito global o zona/conexión. No elijas un único proveedor por cliente ni vincules íntegramente una factura compartida. El reparto entre servicios queda pendiente.</p><Link href="/admin/finanzas/analitica-costes/costes-operadora" className="mt-2 inline-block font-semibold underline focus:ring-2 focus:ring-indigo-700">Consultar fuentes y artículos de operadora</Link></div>}
      </>}
      {data && editing && <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
        <p className="text-xs leading-5 text-slate-700">Introduce cada servicio y su base sin IVA. Ejemplo: internet por radio/red propia y líneas móviles de intermediación como componentes distintos. El remanente queda pendiente; no hay que inventar su reparto.</p>
        {draft.length === 0 && <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs font-semibold text-blue-950">Si toda la factura corresponde a un único modelo, puedes empezar con su base completa:</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(SERVICE_TYPES).map(([key, label]) => <button key={key} type="button" disabled={saving} onClick={() => setDraft([{ nombre: label, tipo: key as ServiceType, base: String(data.base) }])} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-950 focus:ring-2 focus:ring-blue-700">{label}</button>)}</div><p className="mt-2 text-xs text-slate-700">Para un pack mixto, usa Añadir componente y desglosa cada prestación.</p></div>}
        {draft.map((item, index) => <div key={item.id || `nuevo-${index}`} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1.2fr_120px_auto]">
          <label className="text-xs font-semibold text-slate-900">Servicio<input aria-label={`Servicio ${index + 1}`} value={item.nombre} onChange={event => update(index, { nombre: event.target.value })} required maxLength={160} disabled={saving} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs font-semibold text-slate-900">Modelo<select value={item.tipo} onChange={event => update(index, { tipo: event.target.value as ServiceType })} disabled={saving} style={{ colorScheme: 'light' }} className={`${inputClass} mt-1`}>{Object.entries(SERVICE_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-900">Base sin IVA<input value={item.base} onChange={event => update(index, { base: event.target.value })} required inputMode="decimal" disabled={saving} className={`${inputClass} mt-1 tabular-nums`} /></label>
          <button type="button" aria-label={`Retirar servicio ${index + 1} del desglose`} onClick={() => setDraft(rows => rows.filter((_, idx) => idx !== index))} disabled={saving} className="self-end rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 focus:ring-2 focus:ring-red-700">Retirar</button>
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={saving || draft.length >= 50} onClick={() => setDraft(rows => [...rows, { nombre: '', tipo: 'PROYECTO', base: '' }])} className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus:ring-2 focus:ring-blue-700">Añadir componente</button><p className="text-sm font-semibold text-slate-900">Sin desglosar: {Number.isFinite(remaining) ? money(remaining) : 'Revisa los importes'}</p></div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-700">Cancelar</button><button type="submit" disabled={saving} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus:ring-2 focus:ring-blue-700 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar desglose'}</button></div>
      </form>}
    </section>
  );
}
