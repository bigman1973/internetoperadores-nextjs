'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type Dataset, type Estado, type TipoCliente, type Resultado,
  PRESETS, TIPO_LABEL, calcular, estadoBase, fechaLimiteAviso, histograma, kpis, porcentajeContrato,
} from '@/lib/subida-precios/calc';
import type { DatasetMeta } from '@/lib/subida-precios/data';
import { Waterfall, BeforeAfter, Histo } from './charts';
import { eur, pct, pts, num } from './fmt';

type Vista = 'resumen' | 'productos' | 'clientes' | 'escenarios' | 'criterios';
type DS = Dataset & { meta: DatasetMeta };
interface Escenario { id: string; nombre: string; nota: string | null; desde: string; hasta: string; resumen: any; estadoAprobacion: 'BORRADOR' | 'APROBADO'; fechaEfecto: string | null; aprobadoAt: string | null; createdAt: string; autor: string; aprobadoPor: string | null }

const MESES = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
const MES_LABEL = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const card = 'rounded-lg bg-white border border-gray-200 shadow-sm';
const inp = 'rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[#FF5300] focus:outline-none focus:ring-1 focus:ring-[#FF5300]';
const btn = 'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const btnP = 'rounded-md bg-[#FF5300] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#e04a00] disabled:opacity-50';

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export default function SubidaClient({ puedeAprobar, rol, migracionLista }: { puedeAprobar: boolean; rol: string; migracionLista: boolean }) {
  const [vista, setVista] = useState<Vista>('resumen');
  const [periodo, setPeriodo] = useState({ desde: '2026-01', hasta: '2026-10' });
  const [ds, setDs] = useState<DS | null>(null);
  const [st, setSt] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardado, setGuardado] = useState('');

  const cargar = useCallback(async (p = periodo, conservar = true) => {
    setCargando(true); setError('');
    try {
      const d = await api<DS>(`/api/admin/subida-precios/dataset?desde=${p.desde}&hasta=${p.hasta}`);
      setDs(d); setSt(prev => (conservar && prev ? prev : estadoBase(d)));
      setGuardado(prev => prev || JSON.stringify(estadoBase(d)));
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }, [periodo]);
  useEffect(() => { void cargar(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 4000); return () => clearTimeout(t); }, [aviso]);

  const res = useMemo(() => (ds && st ? calcular(ds, st) : null), [ds, st]);
  const base = useMemo(() => (ds ? calcular(ds, { ...estadoBase(ds), ing: {}, cost: {} }) : null), [ds]);
  const k = useMemo(() => (ds && res ? kpis(ds, res) : null), [ds, res]);
  const sucio = !!st && JSON.stringify(st) !== guardado;
  const set = (patch: Partial<Estado>) => setSt(s => (s ? { ...s, ...patch } : s));

  if (error && !ds) return (
    <div className={`${card} p-8`}><h1 className="text-xl font-bold text-gray-900">Subida de precios</h1>
      <p className="mt-3 text-sm text-red-700">{error}</p><button className={`${btn} mt-4`} onClick={() => cargar()}>Reintentar</button></div>
  );
  if (!ds || !st || !res || !k || !base) return <div className={`${card} p-8 text-sm text-gray-500`}>Cargando contratos y costes del panel…</div>;

  const tabs: [Vista, string][] = [['resumen', 'Resumen'], ['productos', 'Por producto'], ['clientes', 'Por cliente'], ['escenarios', 'Escenarios'], ['criterios', 'Criterios']];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SUBIDA DE PRECIOS</h1>
          <p className="mt-1 text-sm text-gray-500">Simulador con los contratos activos y los costes del panel. Decisión del comité antes del 30/11. No escribe en ISP ni envía correos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-gray-500">Costes de</label>
          <select className={inp} value={periodo.desde} onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value }))}>{MESES.map(m => <option key={m} value={m}>{MES_LABEL(m)}</option>)}</select>
          <label className="text-gray-500">a</label>
          <select className={inp} value={periodo.hasta} onChange={e => setPeriodo(p => ({ ...p, hasta: e.target.value }))}>{MESES.map(m => <option key={m} value={m}>{MES_LABEL(m)}</option>)}</select>
          <button className={btn} disabled={cargando} onClick={() => cargar(periodo, true)}>{cargando ? 'Calculando…' : 'Aplicar periodo'}</button>
        </div>
      </div>

      {!migracionLista && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Falta aplicar la migración de Subida de precios en esta base de datos: se puede simular, pero no guardar escenarios.</div>}
      {ds.meta.avisos.map(a => <div key={a} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{a}</div>)}
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {aviso && <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">{aviso}</div>}

      <Controles ds={ds} st={st} set={set} sucio={sucio} onPreset={id => { const p = PRESETS.find(x => x.id === id)!; setSt(p.build(ds)); }} />

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(([id, l]) => (
          <button key={id} onClick={() => setVista(id)} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${vista === id ? 'border-[#FF5300] text-[#FF5300]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{l}</button>
        ))}
      </div>

      {vista === 'resumen' && <Resumen ds={ds} res={res} k={k} />}
      {vista === 'productos' && <Productos ds={ds} st={st} set={set} res={res} base={base} />}
      {vista === 'clientes' && <Clientes ds={ds} st={st} set={set} res={res} setDs={setDs} onMsg={setAviso} onError={setError} />}
      {vista === 'escenarios' && <Escenarios ds={ds} st={st} periodo={periodo} k={k} migracionLista={migracionLista} puedeAprobar={puedeAprobar} rol={rol}
        onOpen={(e, p) => { setSt(e); setPeriodo(p); setGuardado(JSON.stringify(e)); void cargar(p, true); setVista('resumen'); }} onSaved={s => { setGuardado(JSON.stringify(s)); }} onMsg={setAviso} onError={setError} />}
      {vista === 'criterios' && <Criterios ds={ds} />}
    </div>
  );
}

/* ---------------- Controles ---------------- */
function Num({ v, on, step = 1, min = 0, max = 300, w = 'w-20' }: { v: number; on: (n: number) => void; step?: number; min?: number; max?: number; w?: string }) {
  return <input type="number" className={`${inp} ${w} text-right`} value={Number.isFinite(v) ? v : 0} step={step} min={min} max={max} onChange={e => on(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} />;
}
function Controles({ ds, st, set, sucio, onPreset }: { ds: DS; st: Estado; set: (p: Partial<Estado>) => void; sucio: boolean; onPreset: (id: string) => void }) {
  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Escenario base</span>
        {PRESETS.map(p => <button key={p.id} className={btn} onClick={() => onPreset(p.id)}>{p.nombre}</button>)}
        <span className="ml-auto text-sm text-gray-600">{st.nombre}{sucio && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">sin guardar</span>}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <label className="flex items-center justify-between gap-2" title="Máximo que se sube a un cliente del sector público (solo con cláusula de revisión IPC)">Sector público, tope % <Num v={st.pub} on={v => set({ pub: v })} step={0.5} /></label>
        <label className="flex items-center justify-between gap-2" title="Los particulares nunca suben más de este %">Tope particulares % <Num v={st.capR} on={v => set({ capR: v })} step={0.5} /></label>
        <label className="flex items-center justify-between gap-2" title="Redondea el nuevo importe hacia arriba a múltiplos de este paso (€). 0 = céntimos">Redondeo € <Num v={st.rounding} on={v => set({ rounding: v })} step={0.05} max={100} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={st.inclAnual} onChange={e => set({ inclAnual: e.target.checked })} /> Incluir contratos anuales y trimestrales</label>
        <label className="flex items-center justify-between gap-2" title="% de empresas que se dan de baja si suben: se pierde su ingreso y su coste de operador (la red propia es coste fijo)">Bajas empresas % <Num v={st.churnE} on={v => set({ churnE: v })} step={0.5} max={100} /></label>
        <label className="flex items-center justify-between gap-2">Bajas particulares % <Num v={st.churnR} on={v => set({ churnR: v })} step={0.5} max={100} /></label>
        <label className="flex items-center justify-between gap-2">Efecto desde <input type="date" className={inp} value={st.fechaEfecto} onChange={e => e.target.value && set({ fechaEfecto: e.target.value })} /></label>
        <label className="flex items-center justify-between gap-2" title="Meses de antelación del aviso">Aviso (meses) E/R/P
          <span className="flex gap-1">{(['E', 'R', 'P'] as TipoCliente[]).map(t => <Num key={t} v={st.aviso[t]} on={v => set({ aviso: { ...st.aviso, [t]: Math.round(v) } })} w="w-12" max={12} />)}</span></label>
      </div>
    </div>
  );
}

/* ---------------- Resumen ---------------- */
function Kpi({ l, v, s, c }: { l: string; v: string; s: string; c?: string }) {
  return <div className={`${card} p-4`}><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{l}</div><div className={`mt-1 text-2xl font-bold ${c ?? 'text-gray-900'}`}>{v}</div><div className="mt-1 text-xs text-gray-500">{s}</div></div>;
}
function Resumen({ ds, res, k }: { ds: DS; res: Resultado; k: ReturnType<typeof kpis> }) {
  const t = res.tot;
  const top = res.cli.map((c, i) => ({ i, c })).filter(x => x.c.dI > 0.005).sort((a, b) => b.c.dI - a.c.dI).slice(0, 12);
  const neg = res.cli.map((c, i) => ({ i, c })).filter(x => x.c.n && x.c.i1 - x.c.c1 < -0.005 && ds.contratos.some(q => q.cliente === x.i && !q.sinContrato)).sort((a, b) => (a.c.i1 - a.c.c1) - (b.c.i1 - b.c.c1));
  const hist = histograma(ds, res);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi l="Ingreso mensual" v={eur(k.ingresoNuevo)} s={`hoy ${eur(k.ingresoHoy)}`} />
        <Kpi l="Ingreso extra al año" v={`${k.extraAnual >= 0 ? '+' : ''}${eur(k.extraAnual)}`} s={`${pct(k.ingresoHoy ? (k.ingresoNuevo - k.ingresoHoy) / k.ingresoHoy : null)} sobre hoy`} c="text-green-700" />
        <Kpi l="Margen mensual" v={eur(k.margenNuevo)} s={`hoy ${eur(k.margenHoy)}`} />
        <Kpi l="Margen %" v={pct(k.margenPctNuevo)} s={`hoy ${pct(k.margenPctHoy)} · ${pts(k.margenPctNuevo, k.margenPctHoy)}`} />
        <Kpi l="Clientes con subida" v={num(k.clientesConSubida)} s={`de ${num(k.clientes)} · ${num(k.contratosConSubida)} contratos`} />
        <Kpi l="Particulares con subida" v={num(k.particularesConSubida)} s="aviso con 1 mes de antelación" />
      </div>
      <div className={`${card} p-4`}><h3 className="mb-2 text-sm font-semibold text-gray-900">Cascada del margen mensual</h3>
        <Waterfall m0={t.i0 - t.c0} subida={t.dI} masCoste={-t.dC} bajas={-t.lost} m1={t.i1 - t.c1} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} p-4`}><h3 className="mb-2 text-sm font-semibold text-gray-900">Impacto por tipo de cliente</h3>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-1">Tipo</th><th className="text-right">Clientes</th><th className="text-right">Ingreso hoy</th><th className="text-right">Subida €/mes</th><th className="text-right">Margen %</th></tr></thead>
            <tbody>{(['E', 'R', 'P'] as TipoCliente[]).map(tp => { const a = res.byT[tp]; return (
              <tr key={tp} className="border-t border-gray-100"><td className="py-1.5">{TIPO_LABEL[tp]}</td><td className="text-right">{num(a.nC)}</td><td className="text-right">{eur(a.i0)}</td><td className="text-right text-green-700">+{eur(a.dI)}</td>
                <td className="text-right">{pct(a.i0 ? (a.i0 - a.c0) / a.i0 : null)} → {pct(a.i1 ? (a.i1 - a.c1) / a.i1 : null)}</td></tr>); })}</tbody></table></div>
        <div className={`${card} p-4`}><h3 className="mb-2 text-sm font-semibold text-gray-900">Clientes por tramo de subida</h3><Histo data={hist} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} p-4`}><h3 className="mb-2 text-sm font-semibold text-gray-900">Los 12 clientes que más aportan</h3>
          <table className="w-full text-sm"><tbody>{top.map(({ i, c }) => (
            <tr key={i} className="border-t border-gray-100"><td className="py-1.5 pr-2">{ds.clientes[i].nombre}<span className="ml-2 text-xs text-gray-400">{TIPO_LABEL[ds.clientes[i].tipo]}</span></td><td className="text-right text-green-700">+{eur(c.dI, 2)}/mes</td></tr>))}</tbody></table></div>
        <div className={`${card} p-4`}><h3 className="mb-2 text-sm font-semibold text-gray-900">Clientes en negativo después de la subida ({neg.length})</h3>
          <div className="max-h-72 overflow-auto"><table className="w-full text-sm"><tbody>{neg.length === 0 && <tr><td className="py-2 text-gray-500">Ninguno.</td></tr>}{neg.slice(0, 60).map(({ i, c }) => (
            <tr key={i} className="border-t border-gray-100"><td className="py-1.5 pr-2">{ds.clientes[i].nombre}</td><td className="text-right text-red-700">{eur(c.i1 - c.c1, 2)}/mes</td></tr>))}</tbody></table></div></div>
      </div>
    </div>
  );
}

/* ---------------- Por producto ---------------- */
function Productos({ ds, st, set, res, base }: { ds: DS; st: Estado; set: (p: Partial<Estado>) => void; res: Resultado; base: Resultado }) {
  const filas = ds.grupos.map(g => ({ g, a: res.byG[g.nombre], b: base.byG[g.nombre] })).filter(x => x.b.n).sort((a, b) => b.b.i0 - a.b.i0);
  const cal = ds.meta.calidadCoste;
  const totCoste = filas.reduce((s, x) => s + x.b.c0, 0);
  return (
    <div className="space-y-4">
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>
            <th className="px-3 py-2 text-left">Producto</th><th className="px-2 text-right">Contratos</th><th className="px-2 text-right">Ingreso hoy</th><th className="px-2 text-right">Coste</th><th className="px-2 text-right">Margen hoy</th>
            <th className="px-2 text-right">Subida precio %</th><th className="px-2 text-right">Subida coste %</th><th className="px-2 text-right">Ingreso nuevo</th><th className="px-2 text-right">Margen nuevo</th></tr></thead>
          <tbody>{filas.map(({ g, a, b }) => {
            const q = cal[g.nombre]; const estimado = q && q.estimado > 0.5;
            return (
              <tr key={g.nombre} className="border-t border-gray-100">
                <td className="px-3 py-1.5">{g.nombre}{g.fijoCoste && <span className="ml-1 text-xs text-gray-400" title="Coste fijo: no baja si hay bajas">·fijo</span>}</td>
                <td className="px-2 text-right">{num(b.n)}</td><td className="px-2 text-right">{eur(b.i0)}</td>
                <td className={`px-2 text-right ${estimado ? 'bg-yellow-50 text-yellow-900' : ''}`} title={estimado ? `Incluye estimado: ${eur(q.estimado)} de ${eur(q.real + q.estimado)}` : 'Coste real'}>{eur(b.c0)}</td>
                <td className="px-2 text-right">{pct(b.i0 ? (b.i0 - b.c0) / b.i0 : null)}</td>
                <td className="px-2 text-right"><NumD v={st.ing[g.nombre] ?? 0} on={v => set({ ing: { ...st.ing, [g.nombre]: v } })} step={0.5} min={-100} disabled={g.sinPrecio} /></td>
                <td className="px-2 text-right"><Num v={st.cost[g.nombre] ?? 0} on={v => set({ cost: { ...st.cost, [g.nombre]: v } })} step={0.5} min={-100} /></td>
                <td className="px-2 text-right">{eur(a.i1)}</td>
                <td className="px-2 text-right">{pct(a.i1 ? (a.i1 - a.c1) / a.i1 : null)}</td></tr>);
          })}</tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold"><tr><td className="px-3 py-2">Total</td><td className="px-2 text-right">{num(base.tot.n)}</td><td className="px-2 text-right">{eur(base.tot.i0)}</td><td className="px-2 text-right">{eur(totCoste)}</td>
            <td className="px-2 text-right">{pct(base.tot.i0 ? (base.tot.i0 - base.tot.c0) / base.tot.i0 : null)}</td><td /><td /><td className="px-2 text-right">{eur(res.tot.i1)}</td><td className="px-2 text-right">{pct(res.tot.i1 ? (res.tot.i1 - res.tot.c1) / res.tot.i1 : null)}</td></tr></tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-500"><span className="rounded bg-yellow-50 px-1 text-yellow-900">Amarillo</span>: el coste del producto incluye parte estimada por falta de facturas del periodo (mismo criterio que Rentabilidad). El coste es la media mensual del periodo elegido.</p>
      {ds.meta.tendencias?.length ? <Tendencias ds={ds} /> : null}
      <div className={`${card} p-4`}><h3 className="mb-2 text-sm font-semibold text-gray-900">Margen por producto: antes y después</h3>
        <BeforeAfter rows={filas.map(({ g, a, b }) => ({ name: g.nombre, m0: b.i0 - b.c0, m1: a.i1 - a.c1 }))} /></div>
    </div>
  );
}
function Tendencias({ ds }: { ds: DS }) {
  const ts = ds.meta.tendencias;
  const meses = Array.from(new Set(ts.flatMap(t => t.meses.map(m => m.mes)))).sort();
  const lab = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' });
  return (
    <div className={`${card} p-4`}>
      <h3 className="text-sm font-semibold text-gray-900">Tendencia del coste por operador (€/mes)</h3>
      <p className="mb-2 text-xs text-gray-500">El coste que usa el simulador para cada operador es la media de los 3 últimos meses (recuadro naranja), no la media del año. <span className="rounded bg-yellow-50 px-1 text-yellow-900">Amarillo</span>: factura pendiente, el mes lleva estimado.</p>
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead className="text-gray-500"><tr><th className="px-2 py-1 text-left">Operador</th>{meses.map(m => <th key={m} className="px-1.5 text-right capitalize">{lab(m)}</th>)}<th className="px-2 text-right">Antes</th><th className="px-2 text-right">Últ. 3 m</th><th className="px-2 text-right">Variación</th></tr></thead>
        <tbody>{ts.map(t => {
          const by = new Map(t.meses.map(m => [m.mes, m]));
          const sube = (t.variacionPct ?? 0) > 0.05; const baja = (t.variacionPct ?? 0) < -0.05;
          return (
            <tr key={t.producto} className="border-t border-gray-100">
              <td className="px-2 py-1 font-medium">{t.producto}</td>
              {meses.map(m => { const x = by.get(m); const ult = t.ultimos.includes(m);
                return <td key={m} className={`px-1.5 text-right ${x?.pendiente ? 'bg-yellow-50 text-yellow-900' : ''} ${ult ? 'outline outline-1 outline-[#FF5300]/60' : ''}`} title={x?.pendiente ? 'Factura pendiente: coste estimado' : undefined}>{x ? eur(x.total) : '—'}</td>; })}
              <td className="px-2 text-right">{t.previo != null ? eur(t.previo) : '—'}</td><td className="px-2 text-right">{t.actual != null ? eur(t.actual) : '—'}</td>
              <td className={`px-2 text-right font-semibold ${sube ? 'text-red-700' : baja ? 'text-green-700' : 'text-gray-600'}`}>{t.variacionPct != null ? `${t.variacionPct > 0 ? '+' : ''}${(t.variacionPct * 100).toFixed(1).replace('.', ',')} %` : '—'}</td></tr>);
        })}</tbody></table></div>
    </div>
  );
}
function NumD(props: Parameters<typeof Num>[0] & { disabled?: boolean }) { return props.disabled ? <span className="text-gray-400">—</span> : <Num {...props} />; }

/* ---------------- Por cliente ---------------- */
function Clientes({ ds, st, set, res, setDs, onMsg, onError }: { ds: DS; st: Estado; set: (p: Partial<Estado>) => void; res: Resultado; setDs: (d: DS) => void; onMsg: (m: string) => void; onError: (m: string) => void }) {
  const [q, setQ] = useState(''); const [tipo, setTipo] = useState(''); const [prod, setProd] = useState(''); const [flag, setFlag] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'i0', dir: -1 }); const [page, setPage] = useState(0); const [open, setOpen] = useState<Set<number>>(new Set());
  const porCli = useMemo(() => { const m = new Map<number, number[]>(); ds.contratos.forEach((c, i) => { const a = m.get(c.cliente) ?? []; a.push(i); m.set(c.cliente, a); }); return m; }, [ds]);
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    let a = ds.clientes.map((c, i) => ({ c, i, r: res.cli[i], ks: porCli.get(i) ?? [] })).filter(x => x.ks.length);
    if (t) a = a.filter(x => x.c.nombre.toLowerCase().includes(t) || (x.c.cif ?? '').toLowerCase().includes(t) || x.ks.some(k => ds.contratos[k].codigo.includes(t)));
    if (tipo) a = a.filter(x => x.c.tipo === tipo);
    if (prod) a = a.filter(x => x.ks.some(k => ds.grupos[ds.contratos[k].grupo].nombre === prod));
    if (flag === 'sube') a = a.filter(x => x.r.dI > 0.005);
    if (flag === 'neg') a = a.filter(x => x.r.i1 - x.r.c1 < 0);
    if (flag === 'propio') a = a.filter(x => st.cli[x.c.id] != null || x.ks.some(k => st.con[ds.contratos[k].clave] != null));
    const val = (x: (typeof a)[number]) => sort.k === 'nombre' ? x.c.nombre.toLowerCase() : sort.k === 'dI' ? x.r.dI : sort.k === 'i1' ? x.r.i1 : sort.k === 'm0' ? x.r.i0 - x.r.c0 : sort.k === 'm1' ? x.r.i1 - x.r.c1 : x.r.i0;
    return a.sort((x, y) => { const vx = val(x), vy = val(y); return (vx < vy ? -1 : vx > vy ? 1 : 0) * sort.dir; });
  }, [ds, res, st, q, tipo, prod, flag, sort, porCli]);
  const PS = 50; const pages = Math.max(1, Math.ceil(filas.length / PS)); const pg = Math.min(page, pages - 1);
  const head = (k: string, l: string, right = true) => <th className={`px-2 py-2 cursor-pointer select-none ${right ? 'text-right' : 'text-left'}`} onClick={() => setSort(s => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))}>{l}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>;
  const setPropio = (kind: 'cli' | 'con', key: string, v: string) => { const n = { ...st[kind] }; if (v === '') delete n[key]; else n[key] = Math.max(-100, Math.min(300, Number(v) || 0)); set({ [kind]: n } as Partial<Estado>); };
  async function cambiarTipo(i: number, t: TipoCliente | null) {
    const c = ds.clientes[i];
    try {
      await api('/api/admin/subida-precios/tipo-cliente', { method: 'PUT', body: JSON.stringify({ clave: c.id, nombre: c.nombre, tipo: t }) });
      const clientes = ds.clientes.map((x, j) => (j === i ? { ...x, tipo: t ?? x.tipo, tipoOrigen: t ? 'MANUAL' as const : x.tipoOrigen } : x));
      setDs({ ...ds, clientes }); onMsg(t ? `Tipo de «${c.nombre}» guardado: ${TIPO_LABEL[t]}.` : 'Corrección eliminada; recarga para ver la detección automática.');
    } catch (e: any) { onError(e.message); }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inp} w-64`} placeholder="Buscar cliente, CIF o nº de contrato" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
        <select className={inp} value={tipo} onChange={e => { setTipo(e.target.value); setPage(0); }}><option value="">Todos los tipos</option>{(['E', 'R', 'P'] as TipoCliente[]).map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select>
        <select className={inp} value={prod} onChange={e => { setProd(e.target.value); setPage(0); }}><option value="">Todos los productos</option>{ds.grupos.map(g => <option key={g.nombre}>{g.nombre}</option>)}</select>
        <select className={inp} value={flag} onChange={e => { setFlag(e.target.value); setPage(0); }}><option value="">Sin filtro</option><option value="sube">Con subida</option><option value="neg">Margen negativo</option><option value="propio">Con % propio</option></select>
        <span className="text-sm text-gray-500">{num(filas.length)} clientes</span>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{head('nombre', 'Cliente', false)}<th className="px-2 text-left">Tipo</th>{head('i0', 'Ingreso hoy')}{head('dI', 'Subida €/mes')}{head('i1', 'Ingreso nuevo')}{head('m0', 'Margen hoy')}{head('m1', 'Margen nuevo')}<th className="px-2 text-right">% propio</th></tr></thead>
          <tbody>{filas.slice(pg * PS, pg * PS + PS).map(({ c, i, r, ks }) => (
            <>
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1.5"><button className="mr-1 text-gray-400" onClick={() => setOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}>{open.has(i) ? '▾' : '▸'}</button>{c.nombre}<span className="ml-2 text-xs text-gray-400">{ks.length} contr.</span></td>
                <td className="px-2"><select className="rounded border border-gray-200 bg-white px-1 text-xs" title={`Origen: ${c.tipoOrigen}`} value={c.tipo} onChange={e => cambiarTipo(i, e.target.value as TipoCliente)}>{(['E', 'R', 'P'] as TipoCliente[]).map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select>{c.tipoOrigen === 'MANUAL' && <button className="ml-1 text-xs text-gray-400 underline" onClick={() => cambiarTipo(i, null)}>auto</button>}</td>
                <td className="px-2 text-right">{eur(r.i0, 2)}</td><td className="px-2 text-right text-green-700">{r.dI > 0.005 ? `+${eur(r.dI, 2)}` : '—'}</td><td className="px-2 text-right">{eur(r.i1, 2)}</td>
                <td className="px-2 text-right">{eur(r.i0 - r.c0, 2)}</td><td className={`px-2 text-right ${r.i1 - r.c1 < 0 ? 'text-red-700' : ''}`}>{eur(r.i1 - r.c1, 2)}</td>
                <td className="px-2 text-right"><input type="number" className="w-16 rounded border border-gray-200 px-1 text-right text-xs" placeholder="auto" value={st.cli[c.id] ?? ''} onChange={e => setPropio('cli', c.id, e.target.value)} /></td></tr>
              {open.has(i) && ks.map(ki => { const k = ds.contratos[ki]; const cr = res.con[ki]; const g = ds.grupos[k.grupo]; return (
                <tr key={k.clave} className="bg-gray-50 text-xs text-gray-700"><td className="py-1 pl-8">{k.codigo} · {g.nombre}<span className="ml-2 text-gray-400">{k.tarifa}{k.periodicidad !== 'M' ? ` · ${k.periodicidad === 'A' ? 'anual' : k.periodicidad === 'T' ? 'trimestral' : 'semestral'}` : ''}</span></td><td />
                  <td className="px-2 text-right">{eur(k.ingreso, 2)}</td><td className="px-2 text-right">{cr.dI > 0.005 ? `+${eur(cr.dI, 2)} (${cr.p.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %)` : '—'}</td><td className="px-2 text-right">{eur(cr.i1, 2)}</td>
                  <td className="px-2 text-right">{eur(k.ingreso - k.coste, 2)}</td><td className="px-2 text-right">{eur(cr.i1 - cr.c1, 2)}</td>
                  <td className="px-2 text-right"><input type="number" className="w-16 rounded border border-gray-200 px-1 text-right" placeholder={String(Math.round(porcentajeContrato(st, g, c, k).p * 10) / 10)} value={st.con[k.clave] ?? ''} onChange={e => setPropio('con', k.clave, e.target.value)} /></td></tr>); })}
            </>))}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Página {pg + 1} de {pages}</span>
        <span className="flex gap-2"><button className={btn} disabled={pg === 0} onClick={() => setPage(pg - 1)}>Anterior</button><button className={btn} disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Siguiente</button></span>
      </div>
    </div>
  );
}

/* ---------------- Escenarios ---------------- */
function Escenarios({ ds, st, periodo, k, migracionLista, puedeAprobar, rol, onOpen, onSaved, onMsg, onError }: {
  ds: DS; st: Estado; periodo: { desde: string; hasta: string }; k: ReturnType<typeof kpis>; migracionLista: boolean; puedeAprobar: boolean; rol: string;
  onOpen: (e: Estado, p: { desde: string; hasta: string }) => void; onSaved: (s: Estado) => void; onMsg: (m: string) => void; onError: (m: string) => void;
}) {
  const [lista, setLista] = useState<Escenario[]>([]); const [nombre, setNombre] = useState(st.nombre); const [nota, setNota] = useState(st.nota);
  const [cmp, setCmp] = useState<string[]>([]); const [cmpData, setCmpData] = useState<{ n: string; k: ReturnType<typeof kpis> }[]>([]); const [busy, setBusy] = useState(false);
  const recargar = useCallback(async () => { try { setLista((await api('/api/admin/subida-precios/escenarios')).escenarios); } catch (e: any) { if (migracionLista) onError(e.message); } }, [migracionLista, onError]);
  useEffect(() => { if (migracionLista) void recargar(); }, [migracionLista, recargar]);
  const guardar = async () => {
    if (!nombre.trim()) return onError('Pon un nombre al escenario.'); setBusy(true);
    try { const s = { ...st, nombre: nombre.trim(), nota }; await api('/api/admin/subida-precios/escenarios', { method: 'POST', body: JSON.stringify({ estado: s, periodo, resumen: k }) }); onSaved(s); onMsg(`Escenario guardado: ${s.nombre}`); await recargar(); } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };
  const abrir = async (id: string) => { try { const e = await api(`/api/admin/subida-precios/escenarios/${id}`); onOpen({ ...estadoBase(ds), ...e.estado }, { desde: e.desde, hasta: e.hasta }); } catch (er: any) { onError(er.message); } };
  const borrar = async (e: Escenario) => {
    if (!confirm(`¿Borrar el escenario «${e.nombre}»?`)) return; if (!confirm('Confirma otra vez: el borrado no se puede deshacer.')) return;
    try { await api(`/api/admin/subida-precios/escenarios/${e.id}`, { method: 'DELETE' }); onMsg('Escenario borrado.'); await recargar(); } catch (er: any) { onError(er.message); }
  };
  const aprobar = async (e: Escenario) => {
    if (!confirm(`Aprobar «${e.nombre}»: se congelará el cálculo con los datos de hoy y se generarán la lista de nuevos precios y la de clientes a avisar. No se escribe en ISP ni se envía ningún correo. ¿Continuar?`)) return;
    setBusy(true);
    try { const r = await api(`/api/admin/subida-precios/escenarios/${e.id}/aprobar`, { method: 'POST', body: JSON.stringify({ confirmo: true }) }); onMsg(`Aprobado: ${r.contratos} contratos y ${r.clientes} clientes a avisar.`); await recargar(); } catch (er: any) { onError(er.message); } finally { setBusy(false); }
  };
  const comparar = async () => {
    try {
      const out = [] as { n: string; k: ReturnType<typeof kpis> }[];
      for (const id of cmp) { const e = await api(`/api/admin/subida-precios/escenarios/${id}`); const s = { ...estadoBase(ds), ...e.estado } as Estado; out.push({ n: e.nombre, k: kpis(ds, calcular(ds, s)) }); }
      setCmpData(out);
    } catch (er: any) { onError(er.message); }
  };
  return (
    <div className="space-y-4">
      <div className={`${card} p-4 space-y-2`}>
        <h3 className="text-sm font-semibold text-gray-900">Guardar el escenario actual</h3>
        <div className="flex flex-wrap gap-2"><input className={`${inp} w-64`} placeholder="Nombre" value={nombre} maxLength={120} onChange={e => setNombre(e.target.value)} /><input className={`${inp} min-w-[18rem] flex-1`} placeholder="Nota (opcional)" value={nota} maxLength={2000} onChange={e => setNota(e.target.value)} />
          <button className={btnP} disabled={busy || !migracionLista} onClick={guardar}>Guardar escenario</button></div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2" /><th className="text-left">Escenario</th><th className="text-left">Autor</th><th className="text-left">Fecha</th><th className="text-right">Extra año</th><th className="text-right">Margen %</th><th className="text-left px-3">Estado</th><th /></tr></thead>
          <tbody>{lista.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-gray-500">Todavía no hay escenarios guardados.</td></tr>}{lista.map(e => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="px-3"><input type="checkbox" checked={cmp.includes(e.id)} onChange={ev => setCmp(c => ev.target.checked ? [...c, e.id].slice(-3) : c.filter(x => x !== e.id))} title="Comparar (máx. 3)" /></td>
              <td className="py-1.5">{e.nombre}{e.nota && <div className="text-xs text-gray-500">{e.nota}</div>}</td><td>{e.autor}</td><td>{new Date(e.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td className="text-right">{e.resumen?.extraAnual != null ? eur(e.resumen.extraAnual) : '—'}</td><td className="text-right">{e.resumen?.margenPctNuevo != null ? pct(e.resumen.margenPctNuevo) : '—'}</td>
              <td className="px-3">{e.estadoAprobacion === 'APROBADO' ? <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800" title={`${e.aprobadoPor ?? ''} ${e.aprobadoAt ?? ''}`}>Aprobado por {e.aprobadoPor}</span> : <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">Borrador</span>}</td>
              <td className="space-x-1 px-2 text-right whitespace-nowrap">
                <button className={btn} onClick={() => abrir(e.id)}>Abrir</button>
                {e.estadoAprobacion === 'BORRADOR' && puedeAprobar && <button className={btnP} disabled={busy} onClick={() => aprobar(e)}>Aprobar</button>}
                {e.estadoAprobacion === 'APROBADO' && <><a className={btn} href={`/api/admin/subida-precios/escenarios/${e.id}/export?tipo=xlsx`}>Excel</a><a className={btn} href={`/api/admin/subida-precios/escenarios/${e.id}/export?tipo=precios`}>CSV precios (ISP)</a><a className={btn} href={`/api/admin/subida-precios/escenarios/${e.id}/export?tipo=avisos`}>CSV avisos</a></>}
                {e.estadoAprobacion === 'BORRADOR' && <button className={`${btn} text-red-700`} onClick={() => borrar(e)}>Borrar</button>}</td></tr>))}</tbody></table>
      </div>
      {!puedeAprobar && <p className="text-xs text-gray-500">Tu rol ({rol}) puede crear y comparar escenarios. Solo el superadmin aprueba y genera las listas.</p>}
      <div className="flex items-center gap-2"><button className={btn} disabled={cmp.length < 2} onClick={comparar}>Comparar seleccionados ({cmp.length})</button><span className="text-xs text-gray-500">Se recalculan con los datos actuales del periodo elegido.</span></div>
      {cmpData.length > 0 && <div className={`${card} overflow-x-auto`}><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Escenario</th><th className="text-right">Ingreso mensual</th><th className="text-right">Extra año</th><th className="text-right">Margen mensual</th><th className="text-right">Margen %</th><th className="text-right">Clientes</th><th className="text-right">Contratos</th></tr></thead>
        <tbody>{cmpData.map(c => <tr key={c.n} className="border-t border-gray-100"><td className="px-3 py-1.5">{c.n}</td><td className="text-right">{eur(c.k.ingresoNuevo)}</td><td className="text-right">{eur(c.k.extraAnual)}</td><td className="text-right">{eur(c.k.margenNuevo)}</td><td className="text-right">{pct(c.k.margenPctNuevo)}</td><td className="text-right">{num(c.k.clientesConSubida)}</td><td className="text-right">{num(c.k.contratosConSubida)}</td></tr>)}</tbody></table></div>}
      <div className={`${card} p-4 text-sm text-gray-700`}><h3 className="mb-1 font-semibold text-gray-900">Qué genera la aprobación</h3>
        <p>Una fila por contrato con subida (precio actual, % y precio nuevo, para cargar en ISP a mano) y una fila por cliente a avisar con la fecha límite según su tipo (particulares: {st.aviso.R} mes antes del {st.fechaEfecto.split('-').reverse().join('/')}, es decir, antes del {fechaLimiteAviso(st.fechaEfecto, st.aviso.R).split('-').reverse().join('/')}), más un borrador de carta por tipo de cliente. Nada se envía.</p></div>
    </div>
  );
}

/* ---------------- Criterios ---------------- */
function Criterios({ ds }: { ds: DS }) {
  const m = ds.meta;
  return (
    <div className="space-y-3">
      <div className={`${card} p-5 text-sm text-gray-700 space-y-3`}>
        <h3 className="text-base font-semibold text-gray-900">Cómo se calcula</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Ingreso:</b> contratos activos del panel (carga de contratos de ISP), importe menos descuento pasado a mes: anual entre 12, trimestral entre 3, semestral entre 6.</li>
          <li><b>Coste:</b> media mensual del periodo {m.desde} a {m.hasta} del coste de Rentabilidad (facturas recibidas más costes externos; lo que falta va estimado y se marca en amarillo). Se reparte por contrato: operadores por peso del ingreso dentro del proveedor, red propia por Mb de bajada, Draxton por sede según su coste real. Cuando la API de ISP dé el coste por línea, sustituirá este reparto.</li>
          {m.reglasCoste?.map(r => <li key={r.producto}><b>Coste de {r.producto}:</b> {r.regla}</li>)}
          {m.sinImporte?.contratos ? <li><b>Contratos sin importe:</b> {m.sinImporte.contratos} contratos activos de ISP no tienen importe en el panel (no se pueden subir ni llevan coste) y quedan fuera: {Object.entries(m.sinImporte.productos).map(([k, v]) => `${k} ${v}`).join(', ')}.</li> : null}
          <li><b>Porcentaje de un contrato:</b> el propio del contrato; si no, el del cliente; si no, el del producto. En el producto, el sector público no supera el tope público, los particulares no superan el tope de particulares y los anuales o trimestrales solo suben si se incluyen.</li>
          <li><b>Redondeo:</b> el nuevo importe del periodo se redondea hacia arriba al paso elegido.</li>
          <li><b>Bajas:</b> si el cliente sube, un % de ellos se da de baja: se pierde su ingreso y su coste de operador; la red propia es coste fijo.</li>
          <li><b>Margen:</b> de contribución (ingreso menos coste directo). No incluye personal, oficina ni estructura.</li>
          <li><b>Tipo de cliente:</b> el que dice el CRM (persona física, órgano gestor); si no, el NIF o el nombre (ayuntamiento, consell, institut, consorci). Se puede corregir en la pestaña «Por cliente»; la corrección queda guardada.</li>
        </ul>
        <h3 className="pt-2 text-base font-semibold text-gray-900">Criterios de negocio</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Particulares: aviso con un mes de antelación; para subir el 1/1 hay que avisar antes del 1/12.</li>
          <li>Draxton: contrato firmado hasta 2028, sin subida salvo pacto.</li>
          <li>Sector público: solo si el contrato tiene cláusula de revisión por IPC.</li>
          <li>Comisiones de Aire y Xfera y hotspot no son precios a clientes: no suben.</li>
          <li>Empresas: revisar la cláusula de actualización de cada contrato antes de avisar.</li>
        </ul>
      </div>
      <div className={`${card} p-5 text-sm text-gray-700 space-y-2`}>
        <h3 className="text-base font-semibold text-gray-900">Datos de esta simulación</h3>
        <p>Foto de Rentabilidad de {m.mesReferencia} (versión {m.snapshotVersion}), generada {new Date(m.generadoAt).toLocaleString('es-ES')}. {num(ds.contratos.length)} contratos y {num(ds.clientes.length)} clientes. Fuente del coste: {m.fuenteCoste === 'ISP_LINEA' ? 'coste por línea de ISP' : 'reparto de Rentabilidad'}.</p>
        {m.excluidos.map(e => <p key={e.producto} className="rounded bg-gray-50 p-2">Excluido: <b>{e.producto}</b> ({e.contratos} contratos, {eur(e.ingreso)}/mes). {e.motivo}</p>)}
      </div>
    </div>
  );
}
