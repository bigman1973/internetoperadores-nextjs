'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Dataset, type Estado, type TipoCliente, type Resultado,
  PRESETS, TIPO_LABEL, calcular, estadoBase, fechaLimiteAviso, histograma, kpis, porcentajeContrato,
} from '@/lib/subida-precios/calc';
import type { DatasetMeta } from '@/lib/subida-precios/data';
import { Fold, IoShell, Kpis, MarginChip, Note, Pill, Tabs, Toast, TopBar, eur, num, pct } from '@/components/io-ui/kit';
import { Histo, ProdChart, Waterfall } from './charts';

type Vista = 'resumen' | 'productos' | 'clientes' | 'escenarios' | 'criterios';
type DS = Dataset & { meta: DatasetMeta };
interface Escenario { id: string; nombre: string; nota: string | null; desde: string; hasta: string; resumen: any; estadoAprobacion: 'BORRADOR' | 'APROBADO'; fechaEfecto: string | null; aprobadoAt: string | null; createdAt: string; autor: string; aprobadoPor: string | null }

const MESES = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
const MES_LABEL = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const TIPOS: TipoCliente[] = ['E', 'R', 'P'];
const PER_LABEL = { M: 'Mensual', T: 'Trimestral', S: 'Semestral', A: 'Anual' } as const;
const PS = 50;
const mg = (a: number, b: number) => (a ? (a - b) / a : null);
/** Porcentaje a partir de una fracción (el simulador trabaja con fracciones; el kit con puntos). */
const P = (v: number | null | undefined, d = 1) => pct(v == null ? null : v * 100, d);
const mTag = (m: number | null) => <MarginChip value={m == null ? null : m * 100} />;
const f1 = (v: number) => v.toLocaleString('es-ES') + ' %';
const fecha = (iso: string) => iso.split('-').reverse().join('/');

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

/** Campo de % del simulador: se confirma al salir o con Intro; vacío = volver a la regla. */
function PctIn({ value, placeholder, onCommit, min = -100, max = 300, label, disabled }: { value: number | null; placeholder?: string; onCommit: (n: number | null) => void; min?: number; max?: number; label: string; disabled?: boolean }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(value == null ? '' : String(value)); }, [value, focus]);
  const commit = () => {
    setFocus(false);
    const s = txt.trim().replace(',', '.');
    if (s === '') { onCommit(null); return; }
    const n = Number(s);
    if (!Number.isFinite(n)) { setTxt(value == null ? '' : String(value)); return; }
    const c = Math.max(min, Math.min(max, n)); setTxt(String(c)); if (c !== value) onCommit(c);
  };
  return <input className={`pctin ${value != null && placeholder != null ? 'set' : ''}`} type="text" inputMode="decimal" value={txt} placeholder={placeholder} aria-label={label} disabled={disabled}
    onFocus={() => setFocus(true)} onChange={e => setTxt(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function Slider({ id, label, out, min, max, step, value, onChange, hint }: { id: string; label: string; out: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; hint?: string }) {
  return <div className="ctl"><label htmlFor={id}>{label} <output>{out}</output></label>
    <input type="range" id={id} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />{hint && <span className="hint">{hint}</span>}</div>;
}

export default function SubidaClient({ puedeAprobar, rol, migracionLista, clienteInicial = '' }: { puedeAprobar: boolean; rol: string; migracionLista: boolean; clienteInicial?: string }) {
  const [vista, setVista] = useState<Vista>(clienteInicial ? 'clientes' : 'resumen');
  const [periodo, setPeriodo] = useState({ desde: '2026-01', hasta: '2026-10' });
  const [periodoSel, setPeriodoSel] = useState({ desde: '2026-01', hasta: '2026-10' });
  const [ds, setDs] = useState<DS | null>(null);
  const [st, setSt] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardado, setGuardado] = useState('');
  const [gAll, setGAll] = useState(5);
  const [lista, setLista] = useState<Escenario[]>([]);
  const [listaOk, setListaOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const [sName, setSName] = useState(''); const [sNote, setSNote] = useState('');
  const [q, setQ] = useState(clienteInicial);

  const cargar = useCallback(async (p = periodo, conservar = true) => {
    setCargando(true); setError('');
    try {
      const d = await api<DS>(`/api/admin/subida-precios/dataset?desde=${p.desde}&hasta=${p.hasta}`);
      setDs(d); setSt(prev => (conservar && prev ? prev : estadoBase(d)));
      setGuardado(prev => prev || JSON.stringify(estadoBase(d)));
      setPeriodo(p); setPeriodoSel(p);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }, [periodo]);
  useEffect(() => { void cargar(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 2600); return () => clearTimeout(t); }, [aviso]);

  const recargarLista = useCallback(async () => {
    try { setLista((await api('/api/admin/subida-precios/escenarios')).escenarios); setListaOk(true); } catch (e: any) { setListaOk(true); if (migracionLista) setError(e.message); }
  }, [migracionLista]);
  useEffect(() => { if (migracionLista) void recargarLista(); else setListaOk(true); }, [migracionLista, recargarLista]);

  const res = useMemo(() => (ds && st ? calcular(ds, st) : null), [ds, st]);
  const k = useMemo(() => (ds && res ? kpis(ds, res) : null), [ds, res]);
  const porCli = useMemo(() => { const m = new Map<number, number[]>(); ds?.contratos.forEach((c, i) => { const a = m.get(c.cliente) ?? []; a.push(i); m.set(c.cliente, a); }); return m; }, [ds]);
  const sucio = !!st && JSON.stringify(st) !== guardado;
  const set = (patch: Partial<Estado>) => setSt(s => (s ? { ...s, ...patch } : s));

  if (error && !ds) return <IoShell><main className="wrap"><section className="panel"><h2>Subida de precios</h2><Note tone="bad">{error}</Note><div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => cargar()}>Reintentar</button></div></section></main></IoShell>;
  if (!ds || !st || !res || !k) return <IoShell><main className="wrap"><section className="panel"><p className="help">Cargando contratos y costes del panel…</p></section></main></IoShell>;

  /* ───── acciones de la barra ───── */
  const abrirGuardar = () => { setSName(st.nombre === 'Propuesta inicial' ? '' : st.nombre); setSNote(st.nota ?? ''); dlg.current?.showModal(); };
  const guardar = async () => {
    const nombre = sName.trim(); if (!nombre) return; setBusy(true);
    try {
      const s = { ...st, nombre, nota: sNote.trim() };
      await api('/api/admin/subida-precios/escenarios', { method: 'POST', body: JSON.stringify({ estado: s, periodo, resumen: k }) });
      setSt(s); setGuardado(JSON.stringify(s)); dlg.current?.close(); setAviso(`Escenario guardado: ${nombre}`); await recargarLista();
    } catch (e: any) { setAviso(''); setError(e.message); dlg.current?.close(); } finally { setBusy(false); }
  };
  const exportCsv = () => {
    const sep = ';', qt = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`, n = (v: number) => v.toFixed(2).replace('.', ',');
    const lines = [['Cliente', 'Tipo', 'Nº contrato', 'Tarifa', 'Producto', 'Periodicidad', 'Precio mensual hoy', 'Subida %', 'Precio mensual nuevo', 'Subida €/mes', 'Coste mensual asignado', 'Margen % hoy', 'Margen % nuevo'].map(qt).join(sep)];
    ds.contratos.forEach((c, i) => {
      const x = res.con[i]; const m0 = mg(c.ingreso, c.coste), m1 = mg(x.i1, x.c1);
      lines.push([qt(ds.clientes[c.cliente].nombre), qt(TIPO_LABEL[ds.clientes[c.cliente].tipo]), qt(c.codigo), qt(c.tarifa), qt(ds.grupos[c.grupo].nombre), qt(PER_LABEL[c.periodicidad]),
        n(c.ingreso), n(x.p), n(x.i1), n(x.dI), n(c.coste), c.ingreso && m0 != null ? n(m0 * 100) : '', x.i1 && m1 != null ? n(m1 * 100) : ''].join(sep));
    });
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const fn = 'Subida_2027_' + st.nombre.replace(/[^\wÀ-ÿ]+/g, '_').slice(0, 40) + '.csv';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setAviso('CSV listo: ' + fn);
  };

  const nAvisos = ds.meta.avisos.length;
  return (
    <IoShell>
      <TopBar eyebrow="Subida de precios · enero 2027"
        controls={<>
          <span className="eyebrow">Escenario</span><strong>{st.nombre}</strong>
          <Pill tone={sucio ? 'mod' : 'ok'}>{sucio ? 'Con cambios sin guardar' : 'Sin cambios'}</Pill>
          <button className="btn" type="button" onClick={abrirGuardar} disabled={!migracionLista} title={migracionLista ? undefined : 'Falta aplicar la migración de Subida de precios en esta base de datos'}>Guardar escenario</button>
          <button className="btn" type="button" onClick={exportCsv}>Descargar CSV</button>
        </>}
        tabs={<Tabs<Vista> label="Vistas" value={vista} onChange={setVista} tabs={[{ key: 'resumen', label: 'Resumen' }, { key: 'productos', label: 'Por producto' }, { key: 'clientes', label: 'Por cliente' }, { key: 'escenarios', label: 'Escenarios guardados' }, { key: 'criterios', label: 'Criterios' }]} />}>
        <Kpis items={[
          { label: 'Ingreso mensual', value: eur(k.ingresoNuevo), sub: `hoy ${eur(k.ingresoHoy)}` },
          { label: 'Ingreso extra al año', value: `${k.extraAnual >= 0 ? '+' : ''}${eur(k.extraAnual)}`, up: true, sub: `${P(k.ingresoHoy ? (k.ingresoNuevo - k.ingresoHoy) / k.ingresoHoy : null)} sobre hoy` },
          { label: 'Margen mensual', value: eur(k.margenNuevo), sub: `hoy ${eur(k.margenHoy)}` },
          { label: 'Margen %', value: P(k.margenPctNuevo), sub: `hoy ${P(k.margenPctHoy)}${k.margenPctNuevo != null && k.margenPctHoy != null ? ` · ${k.margenPctNuevo >= k.margenPctHoy ? '+' : ''}${((k.margenPctNuevo - k.margenPctHoy) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} pts` : ''}` },
          { label: 'Clientes con subida', value: num(k.clientesConSubida), sub: `de ${num(k.clientes)} · ${num(k.contratosConSubida)} contratos` },
          { label: 'Particulares con subida', value: num(k.particularesConSubida), sub: `aviso con ${st.aviso.R} ${st.aviso.R === 1 ? 'mes' : 'meses'} de antelación` },
        ]} />
      </TopBar>

      <main className="wrap">
        {(!migracionLista || error || nAvisos > 0 || ds.meta.tendencias?.length > 0) && <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          {!migracionLista && <Note>Falta aplicar la migración de Subida de precios en esta base de datos: se puede simular, pero no guardar escenarios.</Note>}
          {error && <Note tone="bad">{error}</Note>}
          {(nAvisos > 0 || ds.meta.tendencias?.length > 0) && <Fold title={<>Avisos del cálculo <span className="tag">{nAvisos}</span><span className="muted small"> · facturas pendientes y tendencia del coste</span></>}>
            {nAvisos > 0 && <ul className="clean">{ds.meta.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
            {ds.meta.tendencias?.length > 0 && <Tendencias ds={ds} />}
          </Fold>}
        </div>}

        {vista === 'resumen' && <Resumen ds={ds} res={res} st={st} set={set} gAll={gAll} setGAll={setGAll} porCli={porCli}
          onPreset={id => { const p = PRESETS.find(x => x.id === id)!; setSt(p.build(ds)); setAviso(`Escenario base: ${p.nombre}`); }}
          onGAll={() => { const ing = { ...st.ing }; for (const g of ds.grupos) if (!g.sinPrecio && !g.nombre.startsWith('Draxton')) ing[g.nombre] = gAll; set({ ing }); setAviso(`${f1(gAll)} aplicado a todos los productos (sin Draxton, comisiones ni hotspot)`); }}
          periodo={periodoSel} setPeriodo={setPeriodoSel} cargando={cargando} onPeriodo={() => cargar(periodoSel, true)}
          onVer={n => { setQ(n); setVista('clientes'); }} />}
        {vista === 'productos' && <Productos ds={ds} st={st} set={set} res={res} />}
        {vista === 'clientes' && <Clientes ds={ds} st={st} set={set} res={res} porCli={porCli} q={q} setQ={setQ} setDs={setDs} onMsg={setAviso} onError={setError} />}
        {vista === 'escenarios' && <Escenarios ds={ds} st={st} k={k} res={res} lista={lista} listaOk={listaOk} busy={busy} setBusy={setBusy} puedeAprobar={puedeAprobar} rol={rol} recargar={recargarLista}
          onOpen={(e, p) => { setSt(e); setPeriodo(p); setGuardado(JSON.stringify(e)); void cargar(p, true); setVista('resumen'); setAviso(`Escenario abierto: ${e.nombre}`); }} onMsg={setAviso} onError={setError} />}
        {vista === 'criterios' && <Criterios ds={ds} />}
      </main>

      <dialog ref={dlg}>
        <form onSubmit={e => { e.preventDefault(); void guardar(); }}>
          <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--f-display)' }}>Guardar escenario</h2>
          <div className="ctl"><label htmlFor="sName">Nombre</label><input id="sName" required maxLength={120} placeholder="Por ejemplo: IPC + Telefónica 7 %" value={sName} onChange={e => setSName(e.target.value)} /></div>
          <div className="ctl"><label htmlFor="sNote">Nota para el comité (opcional)</label><textarea id="sNote" rows={3} maxLength={2000} value={sNote} onChange={e => setSNote(e.target.value)} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={() => dlg.current?.close()}>Cancelar</button><button className="btn primary" type="submit" disabled={busy}>Guardar</button></div>
        </form>
      </dialog>
      <Toast text={aviso} />
    </IoShell>
  );
}

/* ───────────────────────── RESUMEN ───────────────────────── */
function Resumen({ ds, res, st, set, gAll, setGAll, onPreset, onGAll, periodo, setPeriodo, cargando, onPeriodo, onVer, porCli }: {
  ds: DS; res: Resultado; st: Estado; set: (p: Partial<Estado>) => void; gAll: number; setGAll: (v: number) => void; onPreset: (id: string) => void; onGAll: () => void;
  periodo: { desde: string; hasta: string }; setPeriodo: (p: { desde: string; hasta: string }) => void; cargando: boolean; onPeriodo: () => void; onVer: (nombre: string) => void; porCli: Map<number, number[]>;
}) {
  const t = res.tot;
  const top = res.cli.map((c, i) => ({ i, c })).filter(x => x.c.dI > 0).sort((a, b) => b.c.dI - a.c.dI).slice(0, 12);
  const neg = res.cli.map((c, i) => ({ i, c })).filter(x => x.c.n && x.c.i1 - x.c.c1 < -0.005 && (porCli.get(x.i) ?? []).some(ki => !ds.contratos[ki].sinContrato)).sort((a, b) => (a.c.i1 - a.c.c1) - (b.c.i1 - b.c.c1));
  const hist = histograma(ds, res);
  const grupoNombres = (i: number) => Array.from(new Set((porCli.get(i) ?? []).map(ki => ds.grupos[ds.contratos[ki].grupo].nombre))).join(', ');
  const roundOpts = [0, 0.05, 0.1, 0.5, 1]; if (!roundOpts.includes(st.rounding)) roundOpts.push(st.rounding);
  const roundLabel = (v: number) => v === 0 ? 'Sin redondeo (al céntimo)' : v === 1 ? 'Al alza al euro' : `Al alza a ${v.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;
  return (
    <div className="grid2">
      <div className="panel">
        <h2>Palancas generales</h2>
        <p className="help">Empieza con un escenario base y ajústalo. Cada producto y cada cliente se pueden afinar en sus pestañas.</p>
        <h3>Escenarios base</h3>
        <div className="presets">{PRESETS.map(p => <button key={p.id} className="btn" type="button" onClick={() => onPreset(p.id)}>{p.nombre}</button>)}</div>
        <h3>Subida general</h3>
        <div className="ctl">
          <label htmlFor="gAll">Aplicar el mismo % a todos los productos <output>{f1(gAll)}</output></label>
          <input type="range" id="gAll" min={0} max={15} step={0.5} value={gAll} onChange={e => setGAll(Number(e.target.value))} />
          <div className="row"><button className="btn" type="button" onClick={onGAll}>Aplicar a todos los productos</button><span className="hint">IPC octubre 2026: 4,9 % (INE)</span></div>
        </div>
        <h3>Reglas</h3>
        <Slider id="pubPct" label="Sector público" out={f1(st.pub)} min={0} max={10} step={0.5} value={st.pub} onChange={v => set({ pub: v })} hint="Ayuntamientos, consells, institutos. Su precio lo fija el contrato o la licitación." />
        <Slider id="capR" label="Tope de subida para particulares" out={st.capR >= 15 ? 'sin tope' : f1(st.capR)} min={0} max={15} step={0.5} value={st.capR} onChange={v => set({ capR: v })} hint="Máximo % que se aplica a un particular, sea cual sea el producto. 15 % = sin tope." />
        <label className="chk"><input type="checkbox" checked={st.inclAnual} onChange={e => set({ inclAnual: e.target.checked })} /> <span>Incluir los contratos anuales y trimestrales en el impacto de 2027 (se aplica en su renovación)</span></label>
        <div className="ctl"><label htmlFor="rounding">Redondeo del nuevo precio</label>
          <select id="rounding" className="f" value={String(st.rounding)} onChange={e => set({ rounding: Number(e.target.value) })}>{roundOpts.map(v => <option key={v} value={String(v)}>{roundLabel(v)}</option>)}</select></div>
        <h3>Riesgo de bajas por la subida</h3>
        <Slider id="churnE" label="Empresas que se van" out={f1(st.churnE)} min={0} max={15} step={0.5} value={st.churnE} onChange={v => set({ churnE: v })} />
        <Slider id="churnR" label="Particulares que se van" out={f1(st.churnR)} min={0} max={20} step={0.5} value={st.churnR} onChange={v => set({ churnR: v })} hint="Se aplica solo a los contratos que suben. Se pierde su ingreso y el coste del operador; el coste de la red propia se mantiene." />
        <h3>Aviso a los clientes</h3>
        <div className="ctl"><label htmlFor="fechaEfecto">Fecha en la que entra la subida</label>
          <input id="fechaEfecto" type="date" className="f" value={st.fechaEfecto} onChange={e => e.target.value && set({ fechaEfecto: e.target.value })} />
          <span className="hint">Meses de antelación del aviso (empresas · particulares · sector público):</span>
          <div className="row">{TIPOS.map(tp => <label key={tp} className="row small" style={{ gap: 4 }}>{TIPO_LABEL[tp]}
            <input className="pctin" style={{ width: 52 }} type="number" min={0} max={12} step={1} value={st.aviso[tp]} aria-label={`Meses de aviso, ${TIPO_LABEL[tp]}`}
              onChange={e => set({ aviso: { ...st.aviso, [tp]: Math.max(0, Math.min(12, Math.round(Number(e.target.value) || 0))) } })} /></label>)}</div></div>
        <h3>Periodo de costes</h3>
        <div className="ctl">
          <div className="row">
            <select className="f" aria-label="Costes desde" value={periodo.desde} onChange={e => setPeriodo({ ...periodo, desde: e.target.value })}>{MESES.map(m => <option key={m} value={m}>{MES_LABEL(m)}</option>)}</select>
            <span className="hint">a</span>
            <select className="f" aria-label="Costes hasta" value={periodo.hasta} onChange={e => setPeriodo({ ...periodo, hasta: e.target.value })}>{MESES.map(m => <option key={m} value={m}>{MES_LABEL(m)}</option>)}</select>
            <button className="btn" type="button" disabled={cargando} onClick={onPeriodo}>{cargando ? 'Calculando…' : 'Aplicar periodo'}</button>
          </div>
          <span className="hint">Coste medio mensual de las facturas recibidas del periodo.</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        <div className="panel">
          <h2>De dónde sale el margen nuevo</h2>
          <p className="help">Margen de contribución mensual (ingreso menos coste directo, sin estructura).</p>
          <Waterfall m0={t.i0 - t.c0} subida={t.dI} masCoste={-t.dC} bajas={-t.lost} m1={t.i1 - t.c1} />
        </div>
        <div className="cards2">
          <div className="panel">
            <h2>Por tipo de cliente</h2>
            <div className="tablewrap" style={{ border: 0 }}><table>
              <thead><tr><th>Tipo</th><th className="n">Clientes</th><th className="n">Ingreso hoy</th><th className="n">Subida €/mes</th><th className="n">Subida %</th><th className="n">Margen</th></tr></thead>
              <tbody>{TIPOS.map(tp => { const a = res.byT[tp]; return <tr key={tp}><td><span className={`tag ${tp}`}>{TIPO_LABEL[tp]}</span></td><td className="n">{a.nC}</td><td className="n">{eur(a.i0)}</td><td className="n">{eur(a.dI || 0)}</td><td className="n">{P(a.i0 ? (a.dI || 0) / a.i0 : null)}</td><td className="n">{mTag(mg(a.i0, a.c0))}<span className="arrow">→</span>{mTag(mg(a.i1, a.c1))}</td></tr>; })}</tbody>
            </table></div>
          </div>
          <div className="panel">
            <h2>Cuánto sube cada cliente</h2>
            <p className="help">Clientes según la subida que reciben en su factura mensual.</p>
            <Histo data={hist} />
          </div>
        </div>
        <div className="panel">
          <h2>Los 12 clientes que más aportan con la subida</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Cliente</th><th>Tipo</th><th className="n">Ingreso hoy</th><th className="n">Subida €/mes</th><th className="n">Subida %</th><th className="n">Extra al año</th><th className="n">Margen</th></tr></thead>
            <tbody>{top.map(({ i, c }) => <tr key={i}><td className="cname" title={ds.clientes[i].nombre}>{ds.clientes[i].nombre}</td><td><span className={`tag ${ds.clientes[i].tipo}`}>{TIPO_LABEL[ds.clientes[i].tipo]}</span></td><td className="n">{eur(c.i0)}</td><td className="n">{eur(c.dI, 2)}</td><td className="n">{P(c.i0 ? c.dI / c.i0 : null)}</td><td className="n">{eur(c.dI * 12)}</td><td className="n">{mTag(mg(c.i0, c.c0))}<span className="arrow">→</span>{mTag(mg(c.i1, c.c1))}</td></tr>)}
              {!top.length && <tr><td colSpan={7} className="empty">Con este escenario ningún cliente sube.</td></tr>}</tbody>
          </table></div>
        </div>
        <div className="panel" id="alertsPanel">
          <h2>Clientes que siguen con margen negativo</h2>
          <p className="help">Con este escenario. Muchos son negativos por el reparto del coste del operador por ingreso; se confirmará al cruzar factura a factura.</p>
          <div className="tablewrap scroll"><table>
            <thead><tr><th>Cliente</th><th>Productos</th><th className="n">Ingreso</th><th className="n">Coste asignado</th><th className="n">Margen €/mes</th><th></th></tr></thead>
            <tbody>{neg.map(({ i, c }) => <tr key={i}><td className="cname" title={ds.clientes[i].nombre}>{ds.clientes[i].nombre}</td><td className="small muted">{grupoNombres(i)}</td><td className="n">{eur(c.i1)}</td><td className="n">{eur(c.c1)}</td><td className="n"><span className="m bad">{eur(c.i1 - c.c1)}</span></td><td><button className="btn ghost small" type="button" onClick={() => onVer(ds.clientes[i].nombre)}>Ver</button></td></tr>)}
              {!neg.length && <tr><td colSpan={6} className="empty">Ningún cliente con margen negativo.</td></tr>}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

function Tendencias({ ds }: { ds: DS }) {
  const ts = ds.meta.tendencias;
  const meses = Array.from(new Set(ts.flatMap(t => t.meses.map(m => m.mes)))).sort();
  const lab = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' });
  return (
    <div style={{ marginTop: 10 }}>
      <p className="help">Tendencia del coste por operador (€/mes). El simulador usa la media de los 3 últimos meses (recuadro naranja), no la del año. En amarillo, los meses con factura pendiente: llevan coste estimado.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Operador</th>{meses.map(m => <th key={m} className="n">{lab(m)}</th>)}<th className="n">Antes</th><th className="n">Últ. 3 m</th><th className="n">Variación</th></tr></thead>
        <tbody>{ts.map(t => {
          const by = new Map(t.meses.map(m => [m.mes, m]));
          const sube = (t.variacionPct ?? 0) > 0.05, baja = (t.variacionPct ?? 0) < -0.05;
          return <tr key={t.producto}><td>{t.producto}</td>
            {meses.map(m => { const x = by.get(m); const ult = t.ultimos.includes(m);
              return <td key={m} className="n" title={x?.pendiente ? 'Factura pendiente: coste estimado' : undefined} style={{ background: x?.pendiente ? 'var(--warn-soft)' : undefined, outline: ult ? '1px solid var(--accent)' : undefined, outlineOffset: -1 }}>{x ? eur(x.total) : '—'}</td>; })}
            <td className="n">{t.previo != null ? eur(t.previo) : '—'}</td><td className="n">{t.actual != null ? eur(t.actual) : '—'}</td>
            <td className="n"><span className={`m ${sube ? 'bad' : baja ? 'ok' : ''}`}>{t.variacionPct != null ? `${t.variacionPct > 0 ? '+' : ''}${(t.variacionPct * 100).toFixed(1).replace('.', ',')} %` : '—'}</span></td></tr>;
        })}</tbody>
      </table></div>
    </div>
  );
}

/* ───────────────────────── POR PRODUCTO ───────────────────────── */
function Productos({ ds, st, set, res }: { ds: DS; st: Estado; set: (p: Partial<Estado>) => void; res: Resultado }) {
  const filas = ds.grupos.map(g => ({ g, a: res.byG[g.nombre] })).filter(x => x.a && x.a.n);
  const cal = ds.meta.calidadCoste; const t = res.tot;
  const grafico = filas.filter(x => x.a.i0 > 0).map(({ g, a }) => ({ name: g.nombre, m0: mg(a.i0, a.c0), m1: mg(a.i1, a.c1) }));
  return (
    <>
      <div className="panel">
        <h2>Subida por producto</h2>
        <p className="help">Edita el % de subida de precio y, si quieres, el % que prevés que suba el coste del proveedor en 2027. Todo se recalcula al momento. En amarillo, el coste que incluye parte estimada por falta de facturas.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Producto</th><th className="n">Contratos</th><th className="n">Ingreso hoy</th><th className="n">Coste hoy</th><th className="n">Margen hoy</th><th className="n">Subida precio</th><th className="n">Subida coste 2027</th><th className="n">Ingreso nuevo</th><th className="n">Margen nuevo</th><th className="n">Extra al año</th></tr></thead>
          <tbody>{filas.map(({ g, a }) => {
            const q = cal[g.nombre]; const estimado = !!q && q.estimado > 0.5;
            return <tr key={g.nombre}><td>{g.nombre}{g.fijoCoste && <span className="muted small" title="Coste fijo: no baja si hay bajas"> · coste fijo</span>}</td>
              <td className="n">{num(a.n)}</td><td className="n">{eur(a.i0)}</td>
              <td className="n" style={estimado ? { background: 'var(--warn-soft)' } : undefined} title={estimado ? `Incluye estimado: ${eur(q.estimado)} de ${eur(q.real + q.estimado)}` : 'Coste con factura'}>{estimado && <span className="dot" style={{ marginRight: 5 }} />}{eur(a.c0)}</td>
              <td className="n">{mTag(mg(a.i0, a.c0))}</td>
              <td className="n">{g.sinPrecio ? <span className="muted">—</span> : <><PctIn value={st.ing[g.nombre] ?? 0} onCommit={v => set({ ing: { ...st.ing, [g.nombre]: v ?? 0 } })} min={-100} max={50} label={`Subida de precio ${g.nombre}`} /> %</>}</td>
              <td className="n"><PctIn value={st.cost[g.nombre] ?? 0} onCommit={v => set({ cost: { ...st.cost, [g.nombre]: v ?? 0 } })} min={-50} max={50} label={`Subida de coste ${g.nombre}`} /> %</td>
              <td className="n">{eur(a.i1)}</td><td className="n">{mTag(mg(a.i1, a.c1))}</td><td className="n">{eur((a.i1 - a.i0) * 12)}</td></tr>;
          })}
            <tr className="tot"><td>Total</td><td className="n">{num(t.n)}</td><td className="n">{eur(t.i0)}</td><td className="n">{eur(t.c0)}</td><td className="n">{mTag(mg(t.i0, t.c0))}</td><td className="n">{P(t.i0 ? t.dI / t.i0 : null)}</td><td className="n">{P(t.c0 ? t.dC / t.c0 : null)}</td><td className="n">{eur(t.i1)}</td><td className="n">{mTag(mg(t.i1, t.c1))}</td><td className="n">{eur((t.i1 - t.i0) * 12)}</td></tr></tbody>
        </table></div>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Margen por producto: hoy y con el escenario</h2>
        <div className="legend"><span><i style={{ background: 'var(--before)' }} />Hoy</span><span><i style={{ background: 'var(--after)' }} />Con el escenario</span></div>
        <ProdChart rows={grafico} />
      </div>
    </>
  );
}

/* ───────────────────────── POR CLIENTE ───────────────────────── */
function Clientes({ ds, st, set, res, porCli, q, setQ, setDs, onMsg, onError }: {
  ds: DS; st: Estado; set: (p: Partial<Estado>) => void; res: Resultado; porCli: Map<number, number[]>; q: string; setQ: (v: string) => void; setDs: (d: DS) => void; onMsg: (m: string) => void; onError: (m: string) => void;
}) {
  const [qLive, setQLive] = useState(q);
  const [tipo, setTipo] = useState(''); const [prod, setProd] = useState(''); const [flag, setFlag] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 'asc' | 'desc' }>({ k: 'i0', dir: 'desc' });
  const [page, setPage] = useState(0); const [open, setOpen] = useState<Set<number>>(new Set());
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { setQLive(q); setPage(0); }, [q]);
  useEffect(() => { const t = setTimeout(() => { if (qLive !== q) { setQ(qLive); setPage(0); } }, 150); return () => clearTimeout(t); }, [qLive, q, setQ]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    let a = ds.clientes.map((c, i) => ({ c, i, r: res.cli[i], ks: porCli.get(i) ?? [] })).filter(x => x.ks.length);
    if (t) a = a.filter(x => x.c.nombre.toLowerCase().includes(t) || (x.c.cif ?? '').toLowerCase().includes(t) || x.ks.some(k => ds.contratos[k].codigo.toLowerCase().includes(t) || (ds.contratos[k].tarifa ?? '').toLowerCase().includes(t)));
    if (tipo) a = a.filter(x => x.c.tipo === tipo);
    if (prod) a = a.filter(x => x.ks.some(k => ds.grupos[ds.contratos[k].grupo].nombre === prod));
    if (flag === 'neg') a = a.filter(x => x.r.i0 - x.r.c0 < 0);
    if (flag === 'low') a = a.filter(x => { const m = mg(x.r.i0, x.r.c0); return m != null && m >= 0 && m < 0.2; });
    if (flag === 'negAfter') a = a.filter(x => x.r.i1 - x.r.c1 < 0);
    if (flag === 'ovr') a = a.filter(x => st.cli[x.c.id] != null || x.ks.some(k => st.con[ds.contratos[k].clave] != null));
    if (flag === 'zero') a = a.filter(x => !(x.r.dI > 0.005));
    const s = sort.dir === 'asc' ? 1 : -1;
    const val = (x: (typeof a)[number]): number | string => sort.k === 'name' ? x.c.nombre.toLowerCase() : sort.k === 'm0' ? (mg(x.r.i0, x.r.c0) ?? -9) : sort.k === 'm1' ? (mg(x.r.i1, x.r.c1) ?? -9) : sort.k === 'd' ? x.r.dI : sort.k === 'dp' ? (x.r.i0 ? x.r.dI / x.r.i0 : 0) : x.r.i0;
    return a.sort((x, y) => { const vx = val(x), vy = val(y); return (vx < vy ? -1 : vx > vy ? 1 : 0) * s; });
  }, [ds, res, st, q, tipo, prod, flag, sort, porCli]);

  const pages = Math.max(1, Math.ceil(filas.length / PS)); const pg = Math.min(page, pages - 1);
  const tot = filas.reduce((s, x) => ({ i0: s.i0 + x.r.i0, c0: s.c0 + x.r.c0, i1: s.i1 + x.r.i1, c1: s.c1 + x.r.c1, d: s.d + x.r.dI }), { i0: 0, c0: 0, i1: 0, c1: 0, d: 0 });
  const th = (key: string, label: string, n = false) => <th className={`sort ${n ? 'n' : ''}`} data-dir={sort.k === key ? sort.dir : undefined} onClick={() => setSort(s => s.k === key ? { k: key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k: key, dir: key === 'name' ? 'asc' : 'desc' })}>{label}</th>;
  const setPropio = (kind: 'cli' | 'con', key: string, v: number | null) => { const n = { ...st[kind] }; if (v == null) delete n[key]; else n[key] = v; set({ [kind]: n } as Partial<Estado>); };
  const quitar = () => { const n = Object.keys(st.cli).length + Object.keys(st.con).length; set({ cli: {}, con: {} }); onMsg(n ? `${n} ajustes quitados` : 'No había ajustes por cliente'); };
  async function cambiarTipo(i: number, t: TipoCliente | null) {
    const c = ds.clientes[i];
    try {
      await api('/api/admin/subida-precios/tipo-cliente', { method: 'PUT', body: JSON.stringify({ clave: c.id, nombre: c.nombre, tipo: t }) });
      const clientes = ds.clientes.map((x, j) => (j === i ? { ...x, tipo: t ?? x.tipo, tipoOrigen: t ? 'MANUAL' as const : x.tipoOrigen } : x));
      setDs({ ...ds, clientes }); onMsg(t ? `Tipo de «${c.nombre}» guardado: ${TIPO_LABEL[t]}` : 'Corrección eliminada; recarga para ver la detección automática');
    } catch (e: any) { onError(e.message); }
  }
  return (
    <div className="panel" ref={top}>
      <h2>Simulación por cliente</h2>
      <p className="help">Pon un % en «Subida propia» para tratar un cliente aparte. Despliega un cliente para ver y ajustar cada contrato. Deja la casilla vacía para volver a la regla del producto. El tipo de cliente también se puede corregir aquí.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="search" type="search" placeholder="Buscar cliente, CIF, contrato o tarifa" value={qLive} onChange={e => setQLive(e.target.value)} />
        <select className="f" aria-label="Tipo" value={tipo} onChange={e => { setTipo(e.target.value); setPage(0); }}><option value="">Todos los tipos</option><option value="E">Empresas</option><option value="R">Particulares</option><option value="P">Sector público</option></select>
        <select className="f" aria-label="Producto" value={prod} onChange={e => { setProd(e.target.value); setPage(0); }}><option value="">Todos los productos</option>{ds.grupos.map(g => <option key={g.nombre} value={g.nombre}>{g.nombre}</option>)}</select>
        <select className="f" aria-label="Filtro" value={flag} onChange={e => { setFlag(e.target.value); setPage(0); }}>
          <option value="">Todos</option><option value="neg">Margen negativo hoy</option><option value="low">Margen bajo 20 % hoy</option><option value="negAfter">Sigue negativo con el escenario</option><option value="ovr">Con ajuste propio</option><option value="zero">Sin subida</option></select>
        <button className="btn ghost" type="button" onClick={quitar}>Quitar todos los ajustes por cliente</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th></th>{th('name', 'Cliente')}<th>Tipo</th><th className="n">Contratos</th>{th('i0', 'Ingreso hoy', true)}{th('m0', 'Margen hoy', true)}<th className="n">Subida propia</th>{th('dp', 'Subida %', true)}{th('d', 'Subida €/mes', true)}<th className="n">Ingreso nuevo</th>{th('m1', 'Margen nuevo', true)}</tr></thead>
        <tbody>
          {filas.slice(pg * PS, pg * PS + PS).map(({ c, i, r, ks }) => {
            const ov = st.cli[c.id] ?? null; const isOpen = open.has(i);
            return <Fragment key={c.id + i}>
              <tr>
                <td><button className="expand" type="button" aria-expanded={isOpen} aria-label="Ver contratos" onClick={() => setOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}>{isOpen ? '▾' : '▸'}</button></td>
                <td className="cname" title={c.nombre}>{c.nombre}</td>
                <td style={{ whiteSpace: 'nowrap' }}><select className={`f tsel tag ${c.tipo}`} aria-label={`Tipo de ${c.nombre}`} title={`Origen del tipo: ${c.tipoOrigen === 'MANUAL' ? 'corregido a mano' : c.tipoOrigen === 'CRM' ? 'CRM' : 'detectado por NIF o nombre'}`} value={c.tipo} onChange={e => cambiarTipo(i, e.target.value as TipoCliente)}>{TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select>{c.tipoOrigen === 'MANUAL' && <button className="btn ghost small" type="button" style={{ marginLeft: 4 }} onClick={() => cambiarTipo(i, null)} title="Volver a la detección automática">auto</button>}</td>
                <td className="n">{ks.length}</td>
                <td className="n">{eur(r.i0, 2)}</td><td className="n">{mTag(mg(r.i0, r.c0))}</td>
                <td className="n"><PctIn value={ov} placeholder="regla" onCommit={v => setPropio('cli', c.id, v)} label={`Subida propia ${c.nombre}`} /> %</td>
                <td className="n">{P(r.i0 ? r.dI / r.i0 : 0)}</td><td className="n">{eur(r.dI, 2)}</td><td className="n">{eur(r.i1, 2)}</td><td className="n">{mTag(mg(r.i1, r.c1))}</td></tr>
              {isOpen && ks.map(ki => { const kk = ds.contratos[ki]; const x = res.con[ki]; const co = st.con[kk.clave] ?? null; const g = ds.grupos[kk.grupo];
                return <tr className="sub" key={kk.clave + ki}><td></td>
                  <td colSpan={3}><span className="muted">{kk.sinContrato || !kk.codigo ? 'Partida sin contrato' : `Nº ${kk.codigo}`}</span> · {kk.tarifa || '—'} <span className="muted">· {g.nombre}{kk.periodicidad !== 'M' ? ` · ${PER_LABEL[kk.periodicidad].toLowerCase()}` : ''}</span></td>
                  <td className="n">{eur(kk.ingreso, 2)}</td><td className="n">{mTag(mg(kk.ingreso, kk.coste))}</td>
                  <td className="n"><PctIn value={co} placeholder={String(Math.round(porcentajeContrato(st, g, c, kk).p * 10) / 10).replace('.', ',')} onCommit={v => setPropio('con', kk.clave, v)} label={`Subida contrato ${kk.codigo}`} /> %</td>
                  <td className="n">{P(kk.ingreso ? x.dI / kk.ingreso : 0)}</td><td className="n">{eur(x.dI, 2)}</td><td className="n">{eur(x.i1, 2)}</td><td className="n">{mTag(mg(x.i1, x.c1))}</td></tr>; })}
            </Fragment>;
          })}
          {!filas.length ? <tr><td colSpan={11} className="empty">Ningún cliente cumple el filtro.</td></tr>
            : <tr className="tot"><td></td><td colSpan={3}>{num(filas.length)} clientes filtrados</td><td className="n">{eur(tot.i0)}</td><td className="n">{mTag(mg(tot.i0, tot.c0))}</td><td></td><td className="n">{P(tot.i0 ? tot.d / tot.i0 : null)}</td><td className="n">{eur(tot.d)}</td><td className="n">{eur(tot.i1)}</td><td className="n">{mTag(mg(tot.i1, tot.c1))}</td></tr>}
        </tbody>
      </table></div>
      <div className="pager"><span>Página {pg + 1} de {pages} · {num(filas.length)} clientes</span>
        <span className="row"><button className="btn" type="button" disabled={pg === 0} onClick={() => { setPage(pg - 1); top.current?.scrollIntoView({ block: 'start' }); }}>Anterior</button><button className="btn" type="button" disabled={pg >= pages - 1} onClick={() => { setPage(pg + 1); top.current?.scrollIntoView({ block: 'start' }); }}>Siguiente</button></span></div>
    </div>
  );
}

/* ───────────────────────── ESCENARIOS ───────────────────────── */
function Escenarios({ ds, st, k, res, lista, listaOk, busy, setBusy, puedeAprobar, rol, recargar, onOpen, onMsg, onError }: {
  ds: DS; st: Estado; k: ReturnType<typeof kpis>; res: Resultado; lista: Escenario[]; listaOk: boolean; busy: boolean; setBusy: (b: boolean) => void; puedeAprobar: boolean; rol: string; recargar: () => Promise<void>;
  onOpen: (e: Estado, p: { desde: string; hasta: string }) => void; onMsg: (m: string) => void; onError: (m: string) => void;
}) {
  const [cmp, setCmp] = useState<string[]>([]); const [cmpData, setCmpData] = useState<{ n: string; k: ReturnType<typeof kpis> }[]>([]);
  const abrir = async (id: string) => { try { const e = await api(`/api/admin/subida-precios/escenarios/${id}`); onOpen({ ...estadoBase(ds), ...e.estado }, { desde: e.desde, hasta: e.hasta }); } catch (er: any) { onError(er.message); } };
  const borrar = async (e: Escenario) => {
    if (!confirm(`¿Borrar el escenario «${e.nombre}»?`)) return; if (!confirm('Confirma otra vez: el borrado no se puede deshacer.')) return;
    try { await api(`/api/admin/subida-precios/escenarios/${e.id}`, { method: 'DELETE' }); onMsg('Escenario borrado'); await recargar(); } catch (er: any) { onError(er.message); }
  };
  const aprobar = async (e: Escenario) => {
    if (!confirm(`Aprobar «${e.nombre}»: se congelará el cálculo con los datos de hoy y se generarán la lista de nuevos precios y la de clientes a avisar. No se escribe en ISP ni se envía ningún correo. ¿Continuar?`)) return;
    setBusy(true);
    try { const r = await api(`/api/admin/subida-precios/escenarios/${e.id}/aprobar`, { method: 'POST', body: JSON.stringify({ confirmo: true }) }); onMsg(`Aprobado: ${r.contratos} contratos y ${r.clientes} clientes a avisar`); await recargar(); } catch (er: any) { onError(er.message); } finally { setBusy(false); }
  };
  const comparar = async () => {
    try {
      const out = [] as { n: string; k: ReturnType<typeof kpis> }[];
      for (const id of cmp) { const e = await api(`/api/admin/subida-precios/escenarios/${id}`); const s = { ...estadoBase(ds), ...e.estado } as Estado; out.push({ n: e.nombre, k: kpis(ds, calcular(ds, s)) }); }
      setCmpData(out);
    } catch (er: any) { onError(er.message); }
  };
  const best = Math.max(...lista.map(e => e.resumen?.margenNuevo ?? -1e9));
  const bestC = Math.max(...cmpData.map(c => c.k.margenNuevo));
  return (
    <>
      <div className="panel">
        <h2>Escenarios guardados</h2>
        <p className="help">Guarda el escenario actual para compararlo con otros en el comité. Todos los que abren esta página ven los escenarios guardados. Marca hasta 3 para compararlos.</p>
        <div className="tablewrap"><table className="cmp">
          {!listaOk ? <tbody><tr><td className="empty">Cargando escenarios…</td></tr></tbody> : <>
            <thead><tr><th></th><th>Escenario</th><th>Autor</th><th className="n">Ingreso extra al año</th><th className="n">Margen €/mes</th><th className="n">Margen %</th><th className="n">Clientes con subida</th><th>Estado</th><th>Guardado</th><th></th></tr></thead>
            <tbody>
              <tr className="tot"><td></td><td>Actual en pantalla: {st.nombre}</td><td></td><td className="n">{eur(k.extraAnual)}</td><td className="n">{eur(k.margenNuevo)}</td><td className="n">{P(k.margenPctNuevo)}</td><td className="n">{num(k.clientesConSubida)}</td><td></td><td></td><td></td></tr>
              {!lista.length && <tr><td colSpan={10} className="empty">Todavía no hay escenarios guardados. Ajusta las palancas y pulsa «Guardar escenario» para tener el primero.</td></tr>}
              {lista.map(e => <tr key={e.id}>
                <td><input type="checkbox" checked={cmp.includes(e.id)} aria-label={`Comparar ${e.nombre}`} title="Comparar (máx. 3)" onChange={ev => setCmp(c => ev.target.checked ? [...c, e.id].slice(-3) : c.filter(x => x !== e.id))} /></td>
                <td><b>{e.nombre}</b>{e.nota && <div className="small muted">{e.nota}</div>}</td><td className="small">{e.autor}</td>
                <td className="n">{e.resumen?.extraAnual != null ? eur(e.resumen.extraAnual) : '—'}</td>
                <td className={`n ${e.resumen?.margenNuevo === best ? 'best' : ''}`}>{e.resumen?.margenNuevo != null ? eur(e.resumen.margenNuevo) : '—'}</td>
                <td className="n">{e.resumen?.margenPctNuevo != null ? P(e.resumen.margenPctNuevo) : '—'}</td><td className="n">{e.resumen?.clientesConSubida ?? '—'}</td>
                <td>{e.estadoAprobacion === 'APROBADO' ? <span className="tag R" title={`${e.aprobadoPor ?? ''} ${e.aprobadoAt ?? ''}`}>Aprobado por {e.aprobadoPor}</span> : <span className="tag">Borrador</span>}</td>
                <td className="small muted">{new Date(e.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn" type="button" onClick={() => abrir(e.id)}>Abrir</button>
                  {e.estadoAprobacion === 'BORRADOR' && puedeAprobar && <button className="btn primary" type="button" disabled={busy} onClick={() => aprobar(e)}>Aprobar</button>}
                  {e.estadoAprobacion === 'APROBADO' && <><a className="btn" href={`/api/admin/subida-precios/escenarios/${e.id}/export?tipo=xlsx`}>Excel</a><a className="btn" href={`/api/admin/subida-precios/escenarios/${e.id}/export?tipo=precios`}>CSV precios (ISP)</a><a className="btn" href={`/api/admin/subida-precios/escenarios/${e.id}/export?tipo=avisos`}>CSV avisos</a></>}
                  {e.estadoAprobacion === 'BORRADOR' && <button className="btn ghost" type="button" onClick={() => borrar(e)}>Borrar</button>}</div></td></tr>)}
            </tbody></>}
        </table></div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn" type="button" disabled={cmp.length < 2} onClick={comparar}>Comparar seleccionados ({cmp.length})</button><span className="hint small muted">Se recalculan con los datos actuales del periodo elegido.</span></div>
        {!puedeAprobar && <p className="help" style={{ marginTop: 8 }}>Tu rol ({rol}) puede crear y comparar escenarios. Solo el superadmin aprueba y genera las listas.</p>}
      </div>
      {cmpData.length > 0 && <div className="panel" style={{ marginTop: 18 }}><h2>Comparación</h2><div className="tablewrap"><table className="cmp">
        <thead><tr><th>Escenario</th><th className="n">Ingreso mensual</th><th className="n">Extra al año</th><th className="n">Margen mensual</th><th className="n">Margen %</th><th className="n">Clientes</th><th className="n">Contratos</th></tr></thead>
        <tbody>{cmpData.map(c => <tr key={c.n}><td>{c.n}</td><td className="n">{eur(c.k.ingresoNuevo)}</td><td className="n">{eur(c.k.extraAnual)}</td><td className={`n ${c.k.margenNuevo === bestC ? 'best' : ''}`}>{eur(c.k.margenNuevo)}</td><td className="n">{P(c.k.margenPctNuevo)}</td><td className="n">{num(c.k.clientesConSubida)}</td><td className="n">{num(c.k.contratosConSubida)}</td></tr>)}</tbody></table></div></div>}
      <div className="panel" style={{ marginTop: 18 }}><h2>Qué genera la aprobación</h2>
        <p className="help">Una fila por contrato con subida (precio actual, % y precio nuevo, para cargar en ISP a mano) y una fila por cliente a avisar con la fecha límite según su tipo (particulares: {st.aviso.R} {st.aviso.R === 1 ? 'mes' : 'meses'} antes del {fecha(st.fechaEfecto)}, es decir, antes del {fecha(fechaLimiteAviso(st.fechaEfecto, st.aviso.R))}), más un borrador de carta por tipo de cliente. Nada se envía ni se escribe en ISP.</p></div>
    </>
  );
}

/* ───────────────────────── CRITERIOS ───────────────────────── */
function Criterios({ ds }: { ds: DS }) {
  const m = ds.meta;
  const mesRef = m.mesReferencia ? new Date(`${m.mesReferencia}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';
  return (
    <div className="cards">
      <div className="panel">
        <h2>De dónde salen los datos</h2>
        <ul className="clean">
          <li><b>Ingresos:</b> contratos activos del panel (carga de contratos de ISP), con el importe menos el descuento pasado a mes: anual entre 12, trimestral entre 3, semestral entre 6.</li>
          <li><b>Costes:</b> media mensual del periodo {m.desde} a {m.hasta} del coste de Rentabilidad (facturas recibidas más costes externos). Lo que falta va estimado y se marca en amarillo.</li>
          <li><b>Coste por contrato:</b> en los operadores, el coste del proveedor se reparte según el peso del contrato en el ingreso de ese proveedor; la red propia, por Mb de bajada; Draxton, por sede según su coste real. Cuando la API de ISP dé el coste por línea, sustituirá este reparto.</li>
          {m.reglasCoste?.map(r => <li key={r.producto}><b>Coste de {r.producto}:</b> {r.regla}</li>)}
          {m.sinImporte?.contratos ? <li><b>Contratos sin importe:</b> {m.sinImporte.contratos} contratos activos de ISP no tienen importe en el panel (no se pueden subir ni llevan coste) y quedan fuera: {Object.entries(m.sinImporte.productos).map(([k, v]) => `${k} ${v}`).join(', ')}.</li> : null}
          <li><b>Comisiones y hotspot</b> son ingresos de Aire y Xfera, no precios a clientes: por defecto no suben.</li>
          <li>Es <b>margen de contribución</b>: no incluye personal, oficina ni estructura.</li>
        </ul>
      </div>
      <div className="panel">
        <h2>Cómo se aplica la subida</h2>
        <ul className="clean">
          <li><b>% de un contrato:</b> el propio del contrato; si no, el del cliente; si no, el del producto. En el producto, el sector público no supera su tope, los particulares no superan el suyo y los anuales o trimestrales solo suben si se incluyen.</li>
          <li><b>Redondeo:</b> el nuevo importe se redondea hacia arriba al paso elegido.</li>
          <li><b>Bajas:</b> si el cliente sube, un % de ellos se da de baja: se pierde su ingreso y su coste de operador; la red propia es coste fijo.</li>
          <li><b>Tipo de cliente:</b> el que dice el CRM (persona física, órgano gestor); si no, el NIF o el nombre (ayuntamiento, consell, institut, consorci). Se puede corregir en «Por cliente» y queda guardado.</li>
          <li><b>Particulares:</b> aviso con al menos un mes de antelación y derecho a darse de baja sin penalización. Para subir el 1/1, el aviso sale antes del 1/12.</li>
          <li><b>Empresas:</b> revisar la cláusula de revisión de precios de cada contrato antes de avisar.</li>
          <li><b>Sector público:</b> solo si el contrato o el pliego prevé revisión por IPC.</li>
          <li><b>Draxton:</b> contrato firmado hasta 2028, sin subida salvo pacto.</li>
          <li><b>Anuales y trimestrales:</b> la subida se aplica en la renovación.</li>
        </ul>
      </div>
      <div className="panel">
        <h2>Datos de esta simulación</h2>
        <ul className="clean">
          <li>Cálculo de Rentabilidad de {mesRef}{m.snapshotVersion != null ? ` (versión ${m.snapshotVersion})` : ''}, generado el {new Date(m.generadoAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.</li>
          <li>{num(ds.contratos.length)} contratos y {num(ds.clientes.length)} clientes.</li>
          <li>Fuente del coste: {m.fuenteCoste === 'ISP_LINEA' ? 'coste por línea de ISP' : 'reparto de Rentabilidad'}.</li>
          {m.excluidos.map(e => <li key={e.producto}>Excluido: <b>{e.producto}</b> ({e.contratos} contratos, {eur(e.ingreso)}/mes). {e.motivo}</li>)}
        </ul>
      </div>
    </div>
  );
}
