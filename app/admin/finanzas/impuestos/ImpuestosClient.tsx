'use client';
import { useCallback, useEffect, useState } from 'react';
import { eur } from '../../subida-precios/fmt';

type Aviso = { codigo: string; gravedad: 'ALTA' | 'MEDIA' | 'INFO'; texto: string; n?: number; importe?: number };
type MesImp = { mes: string; repercutido: number; soportado: number; irpf111: number; irpf115: number; estimado: boolean; nota?: string };
type Cuadre = { modelo: '303' | '111' | '115'; calculado: number; presentado: number | null; estado: string | null; fuente: string | null; diferencia: number | null; semaforo: 'OK' | 'REVISAR' | 'SIN_DATO'; explicacion: string };
type Trim = {
  ejercicio: number; trimestre: number; desde: string; hasta: string; fechaLimite: string; diasParaLimite: number; vencido: boolean; enCurso: boolean; cerrado: boolean;
  repercutido: { base: number; cuota: number; n: number }; soportado: { base: number; cuota: number; n: number }; resultado303: number;
  irpf111: { nominas: number; profesionales: number; total: number }; irpf115: { base: number; retenido: number; n: number };
  meses: MesImp[]; previsto: { resultado303: number; irpf111: number; irpf115: number; total: number } | null; cuadre: Cuadre[]; avisos: Aviso[]; calidad: 'ALTA' | 'MEDIA' | 'BAJA';
};
type Resultado = {
  ejercicio: number; hoy: string; trimestreActual: number; trimestres: Trim[]; migracion: boolean; ultimaEmitida: string | null; ultimaRecibida: string | null; avisosGlobales: Aviso[];
  tesoreria: { apartarCadaMes: number; referenciaPresentado: { media303: number; n: number; apartarCadaMes: number } | null; fechaPago: string; porMes: { mes: string; importe: number }[]; deudaPendiente: { modelo: string; ejercicio: number; trimestre: number; importe: number; estado: string }[]; totalDeuda: number } | null;
  permisos: { puedeEditar: boolean; soloLectura: boolean };
};
type Presentado = { id: string; modelo: string; ejercicio: number; trimestre: number; importe: number; estado: string; fechaPresentacion: string | null; referencia: string | null; nota: string | null; autor: string };

const fFecha = (s: string | null) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = (m: string) => `${MES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const inp = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none';
const btn = 'rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50';
const btn2 = 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const GRAV: Record<string, string> = { ALTA: 'border-red-300 bg-red-50 text-red-800', MEDIA: 'border-amber-300 bg-amber-50 text-amber-900', INFO: 'border-gray-200 bg-gray-50 text-gray-700' };
const CAL: Record<string, { t: string; c: string }> = { ALTA: { t: 'Calidad alta', c: 'bg-green-100 text-green-800' }, MEDIA: { t: 'Calidad media', c: 'bg-amber-100 text-amber-800' }, BAJA: { t: 'Calidad baja: no fiable', c: 'bg-red-100 text-red-800' } };
const SEM: Record<string, { t: string; c: string }> = { OK: { t: 'Cuadra', c: 'bg-green-100 text-green-800' }, REVISAR: { t: 'No cuadra', c: 'bg-red-100 text-red-800' }, SIN_DATO: { t: 'Sin dato', c: 'bg-gray-100 text-gray-700' } };

async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j as T;
}

export default function ImpuestosClient({ puedeEditar }: { puedeEditar: boolean }) {
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());
  const [res, setRes] = useState<Resultado | null>(null);
  const [pres, setPres] = useState<Presentado[]>([]);
  const [q, setQ] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<{ modelo: string; trimestre: number; importe: string; estado: string; fecha: string; ref: string; nota: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setErr(null);
    try {
      const [r, p] = await Promise.all([api<Resultado>(`/api/admin/finanzas/impuestos?ejercicio=${ejercicio}`), api<{ items: Presentado[] }>(`/api/admin/finanzas/impuestos/presentados?ejercicio=${ejercicio}`)]);
      setRes(r); setPres(p.items); setQ(prev => prev ?? r.trimestreActual);
    } catch (e: any) { setErr(e.message); } finally { setCargando(false); }
  }, [ejercicio]);
  useEffect(() => { void cargar(); }, [cargar]);

  const t = res?.trimestres.find(x => x.trimestre === (q ?? res.trimestreActual));
  const guardar = async () => {
    if (!form || !t) return;
    try {
      const importe = Number(form.importe.replace(/\./g, '').replace(',', '.'));
      if (!isFinite(importe)) throw new Error('Importe no válido.');
      await api('/api/admin/finanzas/impuestos/presentados', 'POST', { modelo: form.modelo, ejercicio, trimestre: form.trimestre, importe, estado: form.estado, fechaPresentacion: form.fecha || null, referencia: form.ref || null, nota: form.nota || null });
      setForm(null); setMsg('Modelo guardado.'); await cargar();
    } catch (e: any) { setErr(e.message); }
  };
  const anular = async (id: string) => {
    if (!confirm('¿Anular este modelo presentado? Se conserva en el historial.')) return;
    try { await api('/api/admin/finanzas/impuestos/presentados', 'DELETE', { id }); setMsg('Modelo anulado.'); await cargar(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Impuestos</h1><p className="text-sm text-gray-600">Provisión de IVA (303) e IRPF (111 y 115) por trimestre, calculada con las facturas del panel. Es una estimación para provisionar, no el modelo a presentar.</p></div>
        <div className="flex items-center gap-2">
          <select className={inp + ' !w-24'} value={ejercicio} onChange={e => { setQ(null); setEjercicio(Number(e.target.value)); }}>{[0, 1, 2].map(i => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}</select>
          <button className={btn2} onClick={() => void cargar()} disabled={cargando}>{cargando ? 'Calculando…' : 'Actualizar'}</button>
        </div>
      </div>
      {res?.permisos.soloLectura && <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">Vista de consulta: tu perfil de contabilidad puede ver los impuestos pero no modificar los modelos presentados.</div>}
      {err && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{err}</div>}
      {msg && <div className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{msg}</div>}
      {res && !res.migracion && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Falta aplicar la migración de Impuestos y Presupuesto: se puede consultar el cálculo, pero no guardar modelos presentados.</div>}
      {res?.avisosGlobales.map(a => <div key={a.codigo} className={`rounded border p-2 text-sm ${GRAV[a.gravedad]}`}>{a.texto}</div>)}

      {res && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {res.trimestres.map(x => {
              const sel = x.trimestre === t?.trimestre;
              const res303 = x.previsto ? x.previsto.resultado303 : x.resultado303;
              return (
                <button key={x.trimestre} onClick={() => setQ(x.trimestre)} className={`rounded-lg border p-3 text-left ${sel ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between"><span className="font-semibold">{x.trimestre}T {x.ejercicio}</span><span className={`rounded px-1.5 py-0.5 text-xs ${CAL[x.calidad].c}`}>{CAL[x.calidad].t}</span></div>
                  <div className="mt-1 text-xs text-gray-600">{x.enCurso ? 'En curso' : x.cerrado ? 'Cerrado' : 'Futuro'} · límite {fFecha(x.fechaLimite)}{!x.vencido && x.diasParaLimite <= 60 ? ` (${x.diasParaLimite} d)` : ''}</div>
                  <div className={`mt-2 text-lg font-semibold ${x.previsto ? 'text-amber-700' : ''}`}>{eur(res303)}</div>
                  <div className="text-xs text-gray-600">IVA 303 {x.previsto ? 'previsto' : 'calculado'} · IRPF {eur(x.previsto ? x.previsto.irpf111 + x.previsto.irpf115 : x.irpf111.total + x.irpf115.retenido)}</div>
                </button>
              );
            })}
          </div>

          {res.tesoreria && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="font-semibold text-amber-900">Previsión de tesorería · {res.trimestreActual}T {res.ejercicio}</div>
              <p className="mt-1 text-sm text-gray-800">Apartar <b>{eur(res.tesoreria.apartarCadaMes)}</b> cada mes ({res.tesoreria.porMes.map(m => mesCorto(m.mes)).join(', ')}) para pagar el {fFecha(res.tesoreria.fechaPago)} el IVA y el IRPF del trimestre, según el cálculo del panel (estimado, en amarillo).</p>
              {res.tesoreria.referenciaPresentado && <p className="mt-1 text-sm text-gray-800">Con la media de lo realmente presentado en el 303 de los trimestres anteriores ({eur(res.tesoreria.referenciaPresentado.media303)}, {res.tesoreria.referenciaPresentado.n} trimestres) saldría <b>{eur(res.tesoreria.referenciaPresentado.apartarCadaMes)}</b> al mes. La diferencia es la incertidumbre actual del cálculo.</p>}
              {res.tesoreria.totalDeuda > 0 && <p className="mt-1 text-sm text-red-800">Además hay {eur(res.tesoreria.totalDeuda)} de modelos denegados o aplazados pendientes con Hacienda: {res.tesoreria.deudaPendiente.map(d => `${d.modelo} ${d.trimestre}T ${d.ejercicio} (${d.estado.toLowerCase()}, ${eur(d.importe, 2)})`).join('; ')}.</p>}
            </div>
          )}

          {t && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{t.trimestre}T {t.ejercicio} <span className="text-sm font-normal text-gray-600">({fFecha(t.desde)} – {fFecha(t.hasta)})</span></h2>
                <div className="text-sm text-gray-700">Presentación y pago hasta el <b>{fFecha(t.fechaLimite)}</b>{t.vencido ? ' (vencido)' : t.diasParaLimite >= 0 ? ` · quedan ${t.diasParaLimite} días` : ''}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">Concepto</th><th className="text-right">Facturas</th><th className="text-right">Base</th><th className="text-right">Cuota / retención</th></tr></thead>
                  <tbody>
                    <tr className="border-b"><td className="py-1">IVA repercutido (emitidas)</td><td className="text-right">{t.repercutido.n}</td><td className="text-right">{eur(t.repercutido.base)}</td><td className="text-right">{eur(t.repercutido.cuota)}</td></tr>
                    <tr className="border-b"><td className="py-1">IVA soportado deducible (recibidas)</td><td className="text-right">{t.soportado.n}</td><td className="text-right">{eur(t.soportado.base)}</td><td className="text-right">{eur(t.soportado.cuota)}</td></tr>
                    <tr className="border-b font-semibold"><td className="py-1">Modelo 303 · resultado {t.previsto ? 'del trimestre hasta hoy' : ''}</td><td /><td /><td className="text-right">{eur(t.resultado303)}</td></tr>
                    <tr className="border-b"><td className="py-1">Modelo 111 · retenciones de nóminas</td><td /><td /><td className="text-right">{eur(t.irpf111.nominas)}</td></tr>
                    <tr className="border-b"><td className="py-1">Modelo 111 · retenciones a profesionales</td><td /><td /><td className="text-right">{eur(t.irpf111.profesionales)}</td></tr>
                    <tr className="border-b"><td className="py-1">Modelo 115 · retenciones de alquileres</td><td className="text-right">{t.irpf115.n}</td><td className="text-right">{eur(t.irpf115.base)}</td><td className="text-right">{eur(t.irpf115.retenido)}</td></tr>
                    {t.previsto && <tr className="bg-amber-50 font-semibold text-amber-900"><td className="py-1">Resultado previsto del trimestre completo (303 + 111 + 115)</td><td /><td /><td className="text-right">{eur(t.previsto.total)}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">Mes</th><th className="text-right">IVA repercutido</th><th className="text-right">IVA soportado</th><th className="text-right">111</th><th className="text-right">115</th></tr></thead>
                  <tbody>{t.meses.map(m => <tr key={m.mes} className={`border-b ${m.estimado ? 'bg-amber-50 text-amber-900' : ''}`}><td className="py-1">{mesCorto(m.mes)}{m.estimado ? ' (estimado)' : ''}{m.nota ? <span className="ml-1 text-xs text-gray-600">· {m.nota}</span> : null}</td><td className="text-right">{eur(m.repercutido)}</td><td className="text-right">{eur(m.soportado)}</td><td className="text-right">{eur(m.irpf111)}</td><td className="text-right">{eur(m.irpf115)}</td></tr>)}</tbody>
                </table>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between"><h3 className="font-semibold">Cuadre con lo presentado</h3>{puedeEditar && res.migracion && <button className={btn2} onClick={() => setForm({ modelo: '303', trimestre: t.trimestre, importe: '', estado: 'PRESENTADO', fecha: '', ref: '', nota: '' })}>Subir modelo presentado</button>}</div>
                {t.cuadre.length === 0 ? <p className="text-sm text-gray-600">Trimestre aún no cerrado: no hay nada que cuadrar.</p> : (
                  <div className="space-y-1">{t.cuadre.map(c => (
                    <div key={c.modelo} className="rounded border border-gray-200 p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2"><b>Modelo {c.modelo}</b><span className={`rounded px-1.5 py-0.5 text-xs ${SEM[c.semaforo].c}`}>{SEM[c.semaforo].t}</span>
                        <span>Panel {eur(c.calculado, 2)}</span>{c.presentado != null && <span>· Presentado {eur(c.presentado, 2)} ({c.estado?.toLowerCase()}, {c.fuente === 'MANUAL' ? 'subido a mano' : 'AAPP'})</span>}</div>
                      <div className="text-gray-700">{c.explicacion}</div>
                    </div>))}</div>
                )}
              </div>

              <div>
                <h3 className="mb-1 font-semibold">Avisos que afectan al cálculo</h3>
                {t.avisos.length === 0 ? <p className="text-sm text-gray-600">Sin avisos.</p> : <div className="space-y-1">{t.avisos.map((a, i) => <div key={i} className={`rounded border p-2 text-sm ${GRAV[a.gravedad]}`}>{a.texto}{a.importe != null && a.codigo !== 'IRPF_NEGATIVO' ? ` (${eur(a.importe)})` : ''}</div>)}</div>}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-1 font-semibold">Modelos presentados subidos a mano · {ejercicio}</h3>
            {pres.length === 0 ? <p className="text-sm text-gray-600">Ninguno. Si un modelo está cargado en AAPP se usa directamente; aquí puedes sustituirlo o añadir los que falten (el 3T, por ejemplo).</p> : (
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">Modelo</th><th>Trimestre</th><th className="text-right">Importe</th><th>Estado</th><th>Fecha</th><th>Referencia</th><th>Subido por</th><th /></tr></thead>
                <tbody>{pres.map(p => <tr key={p.id} className="border-b"><td className="py-1">{p.modelo}</td><td>{p.trimestre}T</td><td className="text-right">{eur(p.importe, 2)}</td><td>{p.estado.toLowerCase()}</td><td>{fFecha(p.fechaPresentacion)}</td><td>{p.referencia ?? ''}</td><td>{p.autor}</td><td className="text-right">{puedeEditar && <button className="text-xs text-red-700 hover:underline" onClick={() => void anular(p.id)}>Anular</button>}</td></tr>)}</tbody></table>
            )}
          </div>
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md space-y-2 rounded-lg bg-white p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">Subir modelo presentado · {form.trimestre}T {ejercicio}</h3>
            <label className="block text-sm">Modelo<select className={inp} value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })}><option value="303">303 · IVA</option><option value="111">111 · IRPF trabajo y profesionales</option><option value="115">115 · IRPF alquileres</option></select></label>
            <label className="block text-sm">Trimestre<select className={inp} value={form.trimestre} onChange={e => setForm({ ...form, trimestre: Number(e.target.value) })}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}T</option>)}</select></label>
            <label className="block text-sm">Importe a ingresar (negativo si sale a devolver)<input className={inp} inputMode="decimal" value={form.importe} onChange={e => setForm({ ...form, importe: e.target.value })} placeholder="18754,23" /></label>
            <label className="block text-sm">Estado<select className={inp} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}><option value="PRESENTADO">Presentado</option><option value="PAGADO">Pagado</option><option value="APLAZADO">Aplazado</option><option value="DENEGADO">Aplazamiento denegado</option></select></label>
            <label className="block text-sm">Fecha de presentación<input type="date" className={inp} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></label>
            <label className="block text-sm">Referencia (justificante)<input className={inp} maxLength={120} value={form.ref} onChange={e => setForm({ ...form, ref: e.target.value })} /></label>
            <label className="block text-sm">Nota<input className={inp} maxLength={500} value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} /></label>
            <div className="flex justify-end gap-2 pt-1"><button className={btn2} onClick={() => setForm(null)}>Cancelar</button><button className={btn} onClick={() => void guardar()}>Guardar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
