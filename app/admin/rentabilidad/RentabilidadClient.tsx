'use client';
import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { FilterTable, IoShell, Note, Toast, TopBar, eur, monthLabel, MESES, MESES_LARGO } from '@/components/io-ui/kit';
import { AlertAction, ExternalCostsEditor, RulesEditor, type Mutate } from './Editors';
import { Comparison, SystemState } from './Legacy';
import Desglose, { type DesgloseSel } from './Desglose';
import { Chip, Heat, Rank, Spark, Trend, mg, type HeatRow, type MV, type RankRow } from './charts';
import { TIPO_NOMBRE, clientTipo, compareRows, groupAlerts, monthProducts, monthsOf, productMonthMargin, rowTotals, totalsOf, type AlertGroup } from './io-model';
import { array, financialColumns, numeric, type Mode, type Report, type Row } from './view-model';

const VIEWS = ['resumen', 'productos', 'clientes', 'meses', 'alertas', 'excel'] as const;
const LABELS: Record<(typeof VIEWS)[number], string> = { resumen: 'Resumen', productos: 'Por producto', clientes: 'Por cliente', meses: 'Mes a mes', alertas: 'Alertas', excel: 'Comparar con Excel' };
type View = (typeof VIEWS)[number] | 'reglas' | 'estado';
const shiftMonth = (ym: string, d: number) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + d; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mlong = (ym: string) => `${cap(MESES_LARGO[Number(ym.slice(5, 7)) - 1])} ${ym.slice(0, 4)}`;
const pctF = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v * 100).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %');
const f100 = (v: number | null | undefined) => (v == null ? null : v / 100);
const Dot = () => <span className="dot" title="Incluye coste estimado" />;
type Abrir = (s: DesgloseSel) => void;
const Lnk = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => <button type="button" className="lnk" title={title} onClick={e => { e.stopPropagation(); onClick(); }}>{children}</button>;
type Preset = { prod?: string; flag?: string; n: number };

export default function RentabilidadClient({ initialReport }: { initialReport: Report }) {
  const [report, setReport] = useState(initialReport); const [view, setView] = useState<View>('resumen');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [focusType, setFocusType] = useState<string | null>(null); const [openProd, setOpenProd] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>({ n: 0 }); const [acc, setAcc] = useState('');
  const [desg, setDesg] = useState<DesgloseSel | null>(null);
  const operation = useRef(false);
  const mode: Mode = report.mode === 'contratado' ? 'contratado' : 'real';
  const readOnly = initialReport.readOnly === true || report.readOnly === true;
  const readOnlyMessage = 'Modo solo lectura en producción. Puedes consultar, exportar y ver el desglose. No se guardan cambios ni se recalcula o sincroniza.';
  const period = report.period; const months = useMemo(() => monthsOf(period), [period]); const mi = Number(period.slice(5, 7)) - 1;
  useEffect(() => { if (!message) return; const t = setTimeout(() => setMessage(''), 7000); return () => clearTimeout(t); }, [message]);
  /* Enlaces #resumen, #alertas… como en la maqueta */
  useEffect(() => { const read = () => { const h = window.location.hash.slice(1); if ((VIEWS as readonly string[]).includes(h)) setView(h as View); }; read(); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read); }, []);
  const go = (v: View) => { setView(v); try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${(VIEWS as readonly string[]).includes(v) ? `#${v}` : ''}`); } catch { /* sin historial */ } };

  /* ── Lógica de datos: la misma de antes (mismas APIs, mismas confirmaciones) ── */
  async function request(path: string, body?: Row) {
    if (body && readOnly) throw new Error(readOnlyMessage);
    const res = await fetch(`/api/admin/rentabilidad${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    let json: Row; try { json = await res.json(); } catch { throw new Error('El servidor no ha devuelto un resultado claro. Mira «Estado» antes de repetir la operación.'); }
    if (!res.ok) { if (json.run?.id) setReport(current => ({ ...current, runs: [...array(current.runs).filter(run => run.id !== json.run.id), json.run] })); throw new Error(typeof json.error === 'string' ? json.error : 'No se ha podido completar la operación.'); }
    return json;
  }
  function begin(label: string) { if (operation.current) return false; operation.current = true; setBusy(label); setError(''); setMessage(''); return true; }
  function end() { operation.current = false; setBusy(''); }
  function apply(data: Row) { setReport(current => ({ ...(data as Report), readOnly: initialReport.readOnly === true || current.readOnly === true || data.readOnly === true })); window.history.replaceState(null, '', `/admin/rentabilidad?${new URLSearchParams({ month: data.period, mode: data.mode })}${window.location.hash}`); }
  async function load(nextMonth: string, nextMode: Mode) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(nextMonth)) { setError('Elige un mes válido.'); return; }
    if (!begin(`Cargando ${mlong(nextMonth)}…`)) return;
    try { apply(await request(`?${new URLSearchParams({ month: nextMonth, mode: nextMode })}`)); } catch (failure) { setError((failure as Error).message); } finally { end(); }
  }
  async function recalculate(kind: 'PROYECCION' | 'CIERRE' = 'PROYECCION') {
    if (readOnly) { setError(readOnlyMessage); return; }
    if (kind === 'CIERRE' && !window.confirm(`¿Guardar el cierre de ${mlong(period)}? Lo que aún no tenga factura seguirá marcado como pendiente. No modifica la contabilidad.`)) return;
    if (!begin(kind === 'CIERRE' ? 'Guardando el cierre…' : 'Recalculando…')) return;
    try { apply(await request('/recalculate', { month: period, mode, kind })); setMessage(kind === 'CIERRE' ? 'Cierre guardado. Lo pendiente sigue marcado como provisional.' : 'Recálculo terminado. Los datos están al día.'); }
    catch (failure) { setError((failure as Error).message); } finally { end(); }
  }
  const mutate: Mutate = async (path, body, success) => {
    if (readOnly) { setError(readOnlyMessage); return false; }
    if (!begin('Guardando y recalculando…')) return false; let saved = false;
    try {
      await request(`/${path}`, body); saved = true;
      try { apply(await request('/recalculate', { month: period, mode })); setMessage(success); }
      catch { setMessage(success); setError('Se ha guardado, pero no se ha podido recalcular. Usa «Recalcular el mes» en Acciones; no repitas el guardado.'); }
      return true;
    } catch (failure) { setError((failure as Error).message); return saved; } finally { end(); }
  };
  async function sync() {
    if (readOnly) { setError(readOnlyMessage); return; }
    if (!begin('Comprobando las sincronizaciones…')) return;
    try { await request('/sync', { month: period }); apply(await request(`?${new URLSearchParams({ month: period, mode })}`)); setMessage('Comprobación terminada. El resultado está en «Estado de las sincronizaciones».'); }
    catch (failure) { setError((failure as Error).message); } finally { end(); }
  }
  async function exportXlsx() {
    if (!begin('Preparando el Excel…')) return;
    try { const { exportTable } = await import('./export-table'); await exportTable(`Rentabilidad por producto ${period}`, [{ key: 'product', label: 'Producto' }, ...financialColumns(mode)], array(report.products), period); setMessage('Excel descargado.'); }
    catch { setError('No se pudo generar el Excel. Vuelve a intentarlo.'); } finally { end(); }
  }
  function action(v: string) {
    setAcc('');
    if (v === 'recalc') void recalculate(); else if (v === 'cierre') void recalculate('CIERRE'); else if (v === 'excel') void exportXlsx();
    else if (v === 'sync') void sync(); else if (v === 'reglas') go('reglas'); else if (v === 'estado') go('estado');
  }

  /* ── Datos derivados ── */
  const groups = useMemo(() => groupAlerts(report.alerts), [report.alerts]);
  const pend = array(report.alerts).filter(a => a.type === 'FACTURA_PROVEEDOR_PENDIENTE');
  const pendProviders = new Set(pend.map(a => String(a.provider ?? a.title))).size;
  const cur = useMemo(() => rowTotals(report.summary?.month ?? {}, mode), [report, mode]);
  const ytd = useMemo(() => rowTotals(report.summary?.ytd ?? {}, mode), [report, mode]);
  const prev = useMemo(() => { const p = monthProducts(report, shiftMonth(period, -1)); return p.length ? totalsOf(p, mode) : null; }, [report, period, mode]);
  const mp = f100(cur.marginPct), pp = f100(prev?.marginPct);
  const est = mode === 'real' && cur.estimated; const q = cur.quality;
  const pill = mode === 'contratado' ? { c: 'pill', t: 'Según contrato' } : est || pend.length ? { c: 'pill mod status', t: `Provisional · faltan facturas de ${pendProviders || 1} proveedor${pendProviders > 1 ? 'es' : ''}` } : { c: 'pill ok status', t: 'Cerrado' };
  const showAlerts = (type?: string) => { setFocusType(type ?? null); go('alertas'); };
  const showClients = (p: { prod?: string; flag?: string }) => { setPreset({ ...p, n: preset.n + 1 }); go('clientes'); };

  return <IoShell>
    <TopBar eyebrow="Rentabilidad · margen de contribución"
      controls={<>
        <div className="mnav" aria-label="Mes"><button type="button" aria-label="Mes anterior" disabled={!!busy || period <= '2026-01'} onClick={() => void load(shiftMonth(period, -1), mode)}>◂</button><strong>{mlong(period)}</strong><button type="button" aria-label="Mes siguiente" disabled={!!busy || period >= '2026-12'} onClick={() => void load(shiftMonth(period, 1), mode)}>▸</button></div>
        <div className="seg" role="group" aria-label="Vista">
          <button type="button" aria-pressed={mode === 'real'} disabled={!!busy} onClick={() => mode !== 'real' && void load(period, 'real')} title="Lo que realmente se ha facturado y pagado">Facturado</button>
          <button type="button" aria-pressed={mode === 'contratado'} disabled={!!busy} onClick={() => mode !== 'contratado' && void load(period, 'contratado')} title="Lo que dicen los contratos firmados">Contratado</button></div>
        <button type="button" className={pill.c} onClick={() => showAlerts(pend.length ? 'FACTURA_PROVEEDOR_PENDIENTE' : undefined)}>{pill.t}</button>
        <select className="f" aria-label="Acciones" value={acc} disabled={!!busy} onChange={e => action(e.target.value)}>
          <option value="">Acciones</option>{!readOnly && <><option value="recalc">Recalcular el mes</option><option value="cierre">Guardar cierre del mes</option><option value="sync">Comprobar sincronizaciones</option></>}<option value="excel">Exportar a Excel</option><option value="reglas">Reglas y costes de proveedor</option><option value="estado">Estado de las sincronizaciones</option></select>
      </>}
      tabs={<nav className="tabs" aria-label="Vistas">{VIEWS.map(v => <a key={v} href={`#${v}`} data-v={v} aria-current={view === v ? 'page' : undefined} onClick={e => { e.preventDefault(); go(v); }}>{LABELS[v]}{v === 'alertas' && <> <span className="tag">{groups.length}</span></>}</a>)}</nav>}>
      <div className="kpis">
        {([
          ['Ingreso', eur(cur.income), mode === 'real' ? 'facturado en el mes' : 'cuota contratada'],
          ['Coste', <>{eur(cur.cost)}{est && <Dot />}</>, est ? `${eur(cur.costEst)} estimado` : mode === 'real' ? 'todo con factura' : 'coste de proveedor firmado'],
          ['Margen', eur(cur.margin), prev ? `mes anterior ${eur(prev.margin)}` : ''],
          ['Margen %', pctF(mp), `frente al mes anterior${mp != null && pp != null ? ` · ${mp >= pp ? '▲' : '▼'} ${Math.abs((mp - pp) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} pts` : ''}`],
          ['Margen acumulado', eur(ytd.margin), `enero–${MESES_LARGO[mi]}`],
          ['Fiabilidad del dato', mode === 'real' && q != null ? pctF(q / 100, 0) : '—', mode === 'real' && q != null ? <div className="meter"><i style={{ width: `${Math.round(q)}%`, background: q < 80 ? 'var(--warn)' : 'var(--good)' }} /></div> : 'cuota de contratos'],
        ] as [string, React.ReactNode, React.ReactNode][]).map(([l, v, s]) => <div className="kpi" key={l}><div className="eyebrow">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div>)}
      </div>
    </TopBar>
    <main className="wrap">
      {readOnly && <Note>{readOnlyMessage}</Note>}
      {!report.summary && <Note>{readOnly ? 'Aún no hay una proyección preparada para este mes. En producción no se recalcula.' : 'Aún no hay una proyección preparada para este mes.'}</Note>}
      {busy && <Note>{busy}</Note>}
      {error && <Note tone="bad"><b>No se ha podido completar.</b> {error}</Note>}
      {view === 'resumen' && <Resumen report={report} mode={mode} groups={groups} months={months} mi={mi} showAlerts={showAlerts} showClients={showClients} goProduct={p => { setOpenProd(p); go('productos'); }} />}
      {view === 'productos' && <Productos report={report} mode={mode} months={months} mi={mi} openProd={openProd} setOpenProd={setOpenProd} showClients={showClients} abrir={setDesg} />}
      {view === 'clientes' && <Clientes key={preset.n} report={report} mode={mode} preset={preset} abrir={setDesg} />}
      {desg && <Desglose month={period} sel={desg} onClose={() => setDesg(null)} />}
      {view === 'meses' && <Meses report={report} mode={mode} months={months} mi={mi} />}
      {view === 'alertas' && <Alertas report={report} groups={groups} focusType={focusType} mutate={mutate} busy={!!busy} readOnly={readOnly} showClients={showClients} />}
      {view === 'excel' && <Excel report={report} mode={mode} />}
      {(view === 'reglas' || view === 'estado') && <section className="view">
        <div className="panel"><div className="row" style={{ justifyContent: 'space-between' }}><h2>{view === 'reglas' ? 'Reglas y costes de proveedor' : 'Estado de las sincronizaciones'}</h2><button type="button" className="btn small" onClick={() => go('resumen')}>Volver al resumen</button></div>
          <div className="legacy" style={{ marginTop: 10 }}>{readOnly ? <ReadOnlyRecords report={report} view={view} /> : view === 'reglas'
            ? <><p className="muted">Las reglas dicen a qué producto va cada factura de proveedor; los costes de Vola son los que paga otra sociedad del grupo. Cada cambio crea una versión nueva y se conserva la anterior.</p><RulesEditor report={report} mutate={mutate} busy={!!busy} /><ExternalCostsEditor report={report} mutate={mutate} busy={!!busy} /></>
            : <SystemState report={report} busy={!!busy} sync={sync} />}</div></div></section>}
    </main>
    <Toast text={message} />
  </IoShell>;
}

/** Read-only alternatives never mount editors or the manual-sync control. */
function ReadOnlyRecords({ report, view }: { report: Report; view: 'reglas' | 'estado' }) {
  const tables = view === 'reglas' ? [
    { title: 'Reglas del informe guardado', rows: array(report.rules) },
    { title: 'Costes externos del informe guardado', rows: array(report.externalCosts) },
    { title: 'Historial de reglas', rows: array(report.ruleHistory) },
    { title: 'Historial de costes externos', rows: array(report.externalCostHistory) },
  ] : [
    { title: 'Registro de ejecuciones guardadas', rows: array(report.runs).slice().reverse() },
    { title: 'Informes y cierres guardados', rows: array(report.snapshots) },
  ];
  return <><p className="muted">Consulta de registros guardados. No hay recálculos, cierres, sincronizaciones ISP ni cron habilitados en producción.</p>{tables.map(table => <section key={table.title}><h3>{table.title}</h3><FilterTable rows={table.rows} pageSize={10} rowKey={r => String(r.id ?? `${r.key}:${r.version}`)} ariaLabel={table.title} cols={[
    { key: 'key', label: 'Registro', render: r => String(r.key ?? r.process ?? r.kind ?? '—') },
    { key: 'provider', label: 'Proveedor / mes', render: r => String(r.provider ?? r.proveedor ?? r.proveedorNombre ?? r.month ?? r.mes ?? '—') },
    { key: 'status', label: 'Estado / versión', render: r => String(r.estado ?? r.status ?? r.version ?? '—') },
    { key: 'createdAt', label: 'Fecha', render: r => r.createdAt ? new Date(r.createdAt).toLocaleString('es-ES') : '—' },
  ]} /></section>)}</>;
}

/* ───────────── Alertas (marcado .alert de la maqueta) ───────────── */
function AlertRow({ g, label, onClick, open }: { g: AlertGroup; label: string; onClick: () => void; open?: boolean }) {
  return <div className={`alert ${g.level === 'bad' ? 'bad' : g.level === 'info' ? 'info' : ''}`}><div className="n">{g.count.toLocaleString('es-ES')}</div><div><div className="t">{g.title}</div><div className="w">{g.todo}{g.summary ? ` (${g.summary})` : ''}</div></div><button className="btn small" type="button" aria-expanded={open} onClick={onClick}>{label}</button></div>;
}

/* ───────────── Resumen ───────────── */
function Resumen({ report, mode, groups, months, mi, showAlerts, showClients, goProduct }: { report: Report; mode: Mode; groups: AlertGroup[]; months: string[]; mi: number; showAlerts: (t?: string) => void; showClients: (p: { prod?: string; flag?: string }) => void; goProduct: (p: string) => void }) {
  const period = report.period;
  const data: MV[] = months.map(m => {
    const ps = monthProducts(report, m);
    if (m > period) { const i = ps.reduce((t, p) => t + (numeric(p.forecastIncome ?? p.contractedIncome) ?? 0), 0); const c = ps.reduce((t, p) => t + (numeric(p.rawCost ?? p.cost) ?? 0) + (numeric(p.rawEstimatedCost ?? p.estimatedCost) ?? 0), 0); return { i: ps.length ? i : null, c: ps.length ? c : null, e: 0, forecast: true }; }
    const t = totalsOf(ps, mode); return t.hasData ? { i: t.income, c: t.cost, e: t.costEst, forecast: false } : { i: null, c: null, e: 0, forecast: false };
  });
  const rank: RankRow[] = array(report.products).map(p => { const t = rowTotals(p, mode); return { p: String(p.product), mm: t.margin ?? NaN, mp: f100(t.marginPct), e: t.costEst }; }).filter(r => Number.isFinite(r.mm) && Math.abs(r.mm) > 0.5).sort((a, b) => b.mm - a.mm);
  const top = groups.filter(g => g.level !== 'info').concat(groups.filter(g => g.level === 'info')).slice(0, 5);
  const n = data[mi + 1], d = data[mi + 2]; const baja = groups.find(g => g.type === 'ESTADO_CONTRADICTORIO' || g.type === 'BAJA_FACTURADA');
  const open = (g: AlertGroup) => (g.type === 'MARGEN_NEGATIVO' ? showClients({ flag: 'neg' }) : showAlerts(g.type));
  return <section className="view">
    <div className="grid3">
      <div className="panel"><h2>Últimos 12 meses</h2>
        <div className="legend"><span><i style={{ background: 'var(--before)' }} />Ingreso</span><span><i style={{ background: 'var(--accent)' }} />Coste</span><span><i style={{ background: 'var(--good)' }} />Margen %</span><span><i style={{ background: 'var(--warn)', opacity: .5 }} />Previsión</span></div>
        <Trend data={data} cur={mi} /></div>
      <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        <div className="panel"><h2>Lo que hay que mirar</h2>
          <div className="alerts">{top.map(g => <AlertRow key={g.type} g={g} label={g.type === 'MARGEN_NEGATIVO' ? 'Ver clientes' : report.readOnly ? 'Ver alertas' : 'Ver y resolver'} onClick={() => open(g)} />)}{!top.length && <div className="empty">No hay nada pendiente de revisar.</div>}</div>
          <p className="small muted" style={{ margin: '10px 0 0' }}><a href="#alertas" onClick={e => { e.preventDefault(); showAlerts(); }}>Ver todas las alertas</a></p></div>
        {n && d && n.i != null && <div className="panel"><h2>Previsión {MESES_LARGO[mi + 1]}–{MESES_LARGO[mi + 2]}</h2><p className="help">Con la cuota actual. Puede cambiar.</p>
          <div className="tablewrap" style={{ border: 0 }}><table><thead><tr><th /><th className="n">{cap(MESES[mi + 1])}</th><th className="n">{cap(MESES[mi + 2])}</th></tr></thead><tbody>
            <tr><td>Ingreso</td><td className="n">{eur(n.i)}</td><td className="n">{eur(d.i)}</td></tr><tr><td>Coste</td><td className="n">{eur(n.c)}</td><td className="n">{eur(d.c)}</td></tr>
            <tr><td>Margen</td><td className="n"><Chip m={mg(n.i, n.c)} /></td><td className="n"><Chip m={mg(d.i, d.c)} /></td></tr></tbody></table></div>
          {baja && <p className="small" style={{ margin: '8px 0 0', color: 'var(--bad)' }}>Hay {baja.count} contrato{baja.count > 1 ? 's' : ''} con fecha de baja dudosa: pueden dejar coste sin ingreso. Mira Alertas.</p>}</div>}
      </div>
    </div>
    <div className="panel"><h2>Margen por producto en {MESES_LARGO[mi]}</h2><p className="help">Ordenado por margen en euros. Pulsa un producto para ver sus clientes.</p><Rank rows={rank} onPick={goProduct} /></div>
    <details className="how"><summary>Cómo se calcula</summary><ul className="clean small" style={{ marginTop: 8 }}>
      <li><b>Facturado:</b> lo que se ha facturado de cada servicio en su mes. <b>Contratado:</b> la cuota mensual de los contratos activos.</li>
      <li><b>Coste:</b> facturas de proveedor del mes. Si falta una factura, se estima con la última conocida y se marca con un punto ámbar.</li>
      <li><b>Fiabilidad del dato:</b> qué parte del coste viene de facturas reales.</li>
      <li>Es margen de contribución: no incluye personal, oficina ni estructura.</li></ul></details>
  </section>;
}

/* ───────────── Por producto ───────────── */
function Productos({ report, mode, months, mi, openProd, setOpenProd, showClients, abrir }: { report: Report; mode: Mode; months: string[]; mi: number; openProd: string | null; setOpenProd: (p: string | null) => void; showClients: (p: { prod?: string }) => void; abrir: Abrir }) {
  const period = report.period; const prevM = shiftMonth(period, -1);
  const rows = array(report.products).map(p => ({ p, name: String(p.product), t: rowTotals(p, mode) })).filter(r => (r.t.income ?? 0) !== 0 || (r.t.cost ?? 0) !== 0).sort((a, b) => (b.t.margin ?? -1e12) - (a.t.margin ?? -1e12));
  const tot = totalsOf(rows.map(r => r.p), mode);
  const clientsOf = (name: string) => { const m = new Map<string, { name: string; i: number; c: number; n: number; est: boolean }>(); for (const c of array(report.clients)) for (const k of array(c.contracts)) { if (k.product !== name) continue; const t = rowTotals(k, mode); const x = m.get(String(c.clientCode)) ?? { name: String(c.clientName), i: 0, c: 0, n: 0, est: false }; x.i += t.income ?? 0; x.c += t.cost ?? 0; x.n++; x.est ||= t.estimated; m.set(String(c.clientCode), x); } return Array.from(m.values()).sort((a, b) => b.i - a.i); };
  return <section className="view"><div className="panel"><h2>Por producto · {MESES_LARGO[mi]} {period.slice(0, 4)}</h2><p className="help">Pulsa una fila para ver los clientes de ese producto. Las cifras subrayadas (ingreso, coste y contratos) se pueden pulsar para ver de dónde salen.</p>
    <div className="tablewrap"><table><thead><tr><th>Producto</th><th className="n">Ingreso</th><th className="n">Coste</th><th className="n hide-sm">Contratos</th><th className="n">Margen</th><th className="n">Margen %</th><th className="n hide-sm">vs mes anterior</th><th className="hide-sm">12 meses</th></tr></thead><tbody>
      {rows.map(r => { const mpv = f100(r.t.marginPct); const prevItem = monthProducts(report, prevM).find(x => x.product === r.name); const ppv = prevItem ? f100(rowTotals(prevItem, mode).marginPct) : null; const open = openProd === r.name;
        const spark = months.map(m => f100(productMonthMargin(report, r.name, m, mode).value));
        const cl = open ? clientsOf(r.name) : [];
        return <Fragment key={r.name}>
          <tr className="rowclick" onClick={() => setOpenProd(open ? null : r.name)}><td>{open ? '▾' : '▸'} {r.name}</td><td className="n">{mode === 'real' ? <Lnk title="Ver las líneas de factura que suman este ingreso" onClick={() => abrir({ tipo: 'producto', clave: r.name, nombre: r.name, vista: 'facturado' })}>{eur(r.t.income)}</Lnk> : eur(r.t.income)}</td><td className="n">{mode === 'real' ? <Lnk title="Ver de qué facturas de proveedor sale este coste" onClick={() => abrir({ tipo: 'producto', clave: r.name, nombre: r.name, vista: 'coste' })}>{eur(r.t.cost)}</Lnk> : eur(r.t.cost)}{r.t.estimated && mode === 'real' && <Dot />}</td><td className="n hide-sm">{numeric(r.p.contracts) ? <Lnk title="Ver la lista de contratos" onClick={() => abrir({ tipo: 'producto', clave: r.name, nombre: r.name, vista: 'contratos' })}>{Number(r.p.contracts).toLocaleString('es-ES')}</Lnk> : <span className="muted">0</span>}</td><td className="n">{eur(r.t.margin)}</td><td className="n"><Chip m={mpv} /></td>
            <td className="n hide-sm">{mpv == null || ppv == null ? '—' : <span className={mpv >= ppv ? 'up' : 'down'}>{mpv >= ppv ? '▲' : '▼'} {Math.abs((mpv - ppv) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} pts</span>}</td><td className="hide-sm"><Spark vals={spark} cur={mi} /></td></tr>
          {open && !cl.length && <tr className="sub"><td colSpan={8} className="muted">Sin contratos asociados en el listado (ingreso por serie o comisión).</td></tr>}
          {open && cl.slice(0, 15).map(c => <tr className="sub" key={c.name}><td>{c.name} <span className="muted">· {c.n} contr.</span></td><td className="n">{eur(c.i, 2)}</td><td className="n">{eur(c.c, 2)}{c.est && mode === 'real' && <Dot />}</td><td className="hide-sm" /><td className="n">{eur(c.i - c.c, 2)}</td><td className="n"><Chip m={mg(c.i, c.c)} /></td><td colSpan={3} className="small muted hide-sm">{mode === 'real' ? 'facturado en el mes' : 'cuota contratada'}</td></tr>)}
          {open && cl.length > 15 && <tr className="sub"><td colSpan={8} className="muted">y {cl.length - 15} clientes más · <a href="#clientes" onClick={e => { e.preventDefault(); showClients({ prod: r.name }); }}>ver todos</a></td></tr>}
        </Fragment>; })}
      <tr className="tot"><td>Total</td><td className="n">{eur(tot.income)}</td><td className="n">{eur(tot.cost)}</td><td className="hide-sm" /><td className="n">{eur(tot.margin)}</td><td className="n"><Chip m={f100(tot.marginPct)} /></td><td className="hide-sm" /><td className="hide-sm" /></tr></tbody></table></div></div></section>;
}

/* ───────────── Por cliente ───────────── */
const PS = 40;
function Clientes({ report, mode, preset, abrir }: { report: Report; mode: Mode; preset: Preset; abrir: Abrir }) {
  const [q, setQ] = useState(''); const [tipo, setTipo] = useState(''); const [prod, setProd] = useState(preset.prod ?? ''); const [flag, setFlag] = useState(preset.flag ?? '');
  const [page, setPage] = useState(0); const [sort, setSort] = useState<{ k: string; dir: 'asc' | 'desc' }>({ k: 'i', dir: 'desc' }); const [open, setOpen] = useState<Set<string>>(new Set());
  const all = useMemo(() => array(report.clients).map(c => { const t = rowTotals(c, mode); return { c, code: String(c.clientCode), name: String(c.clientName), tipo: clientTipo(c), n: array(c.contracts).length, i: t.income, co: t.cost, m: t.margin, mp: f100(t.marginPct), est: t.estimated }; }).filter(r => r.n), [report, mode]);
  const names = useMemo(() => Array.from(new Set(array(report.clients).flatMap(c => array(c.contracts).map(k => String(k.product))))).sort((a, b) => a.localeCompare(b, 'es')), [report]);
  const needle = q.trim().toLowerCase();
  let rows = all.filter(r => (!tipo || r.tipo === tipo) && (!prod || array(r.c.contracts).some(k => k.product === prod)) && (!needle || r.name.toLowerCase().includes(needle) || array(r.c.contracts).some(k => String(k.contractCode ?? '').toLowerCase().includes(needle))));
  if (flag === 'neg') rows = rows.filter(r => (r.m ?? 0) < 0);
  if (flag === 'low') rows = rows.filter(r => r.mp != null && r.mp >= 0 && r.mp < 0.2);
  const dir = sort.dir === 'asc' ? 1 : -1; const val = (r: (typeof all)[number]): number | string => sort.k === 'name' ? r.name : sort.k === 'm' ? (r.m ?? -1e12) : sort.k === 'mp' ? (r.mp ?? -9) : sort.k === 'c' ? (r.co ?? -1e12) : (r.i ?? -1e12);
  rows = rows.slice().sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  const pages = Math.max(1, Math.ceil(rows.length / PS)); const pg = Math.min(page, pages - 1);
  const th = (k: string, l: string, n?: boolean) => <th className={`sort ${n ? 'n' : ''}`} data-dir={sort.k === k ? sort.dir : undefined} onClick={() => setSort(s => s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: k === 'name' ? 'asc' : 'desc' })}>{l}</th>;
  const toggle = (code: string) => setOpen(s => { const x = new Set(s); if (x.has(code)) x.delete(code); else x.add(code); return x; });
  return <section className="view"><div className="panel"><h2>Por cliente</h2><p className="help">{mode === 'real' ? 'Ingreso facturado y coste asignado en el mes.' : 'Cuota mensual contratada y coste asignado.'} Pulsa la flecha de un cliente para ver sus contratos, o una cifra subrayada para ver de dónde sale.</p>
    <div className="row" style={{ marginBottom: 10 }}>
      <input className="search" type="search" placeholder="Buscar cliente o contrato" aria-label="Buscar cliente o contrato" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
      <select className="f" aria-label="Tipo de cliente" value={tipo} onChange={e => { setTipo(e.target.value); setPage(0); }}><option value="">Todos los tipos</option><option value="E">Empresas</option><option value="R">Particulares</option><option value="P">Sector público</option></select>
      <select className="f" aria-label="Producto" value={prod} onChange={e => { setProd(e.target.value); setPage(0); }}><option value="">Todos los productos</option>{names.map(n => <option key={n}>{n}</option>)}</select>
      <select className="f" aria-label="Margen" value={flag} onChange={e => { setFlag(e.target.value); setPage(0); }}><option value="">Todos</option><option value="neg">Margen negativo</option><option value="low">Margen bajo 20 %</option></select></div>
    <div className="tablewrap"><table><thead><tr><th />{th('name', 'Cliente')}<th className="hide-sm">Tipo</th><th className="n hide-sm">Contratos</th>{th('i', mode === 'real' ? 'Facturado' : 'Cuota mensual', true)}{th('c', 'Coste asignado', true)}{th('m', 'Margen', true)}{th('mp', 'Margen %', true)}<th /></tr></thead><tbody>
      {rows.slice(pg * PS, pg * PS + PS).map(r => { const o = open.has(r.code); return <Fragment key={r.code}>
        <tr><td><button className="expand" type="button" aria-expanded={o} aria-label="Ver contratos" onClick={() => toggle(r.code)}>{o ? '▾' : '▸'}</button></td><td className="cname" title={r.name}>{r.name}</td><td className="hide-sm"><span className={`tag ${r.tipo}`}>{TIPO_NOMBRE[r.tipo]}</span></td><td className="n hide-sm"><Lnk title="Ver la lista de contratos" onClick={() => abrir({ tipo: 'cliente', clave: r.code, nombre: r.name, vista: 'contratos' })}>{r.n}</Lnk></td><td className="n">{mode === 'real' ? <Lnk title="Ver las líneas de factura que suman este ingreso" onClick={() => abrir({ tipo: 'cliente', clave: r.code, nombre: r.name, vista: 'facturado' })}>{eur(r.i, 2)}</Lnk> : eur(r.i, 2)}</td><td className="n">{mode === 'real' ? <Lnk title="Ver de qué facturas de proveedor sale este coste" onClick={() => abrir({ tipo: 'cliente', clave: r.code, nombre: r.name, vista: 'coste' })}>{eur(r.co, 2)}</Lnk> : eur(r.co, 2)}{r.est && mode === 'real' && <Dot />}</td><td className="n">{eur(r.m, 2)}</td><td className="n"><Chip m={r.mp} /></td>
          <td><a className="btn small" href={`/admin/subida-precios?cliente=${encodeURIComponent(r.name)}`}>Simular subida</a></td></tr>
        {o && array(r.c.contracts).map((k, i) => { const t = rowTotals(k, mode); return <tr className="sub" key={`${k.contractCode}-${i}`}><td /><td colSpan={3}><span className="muted">{k.contractCode ? `Nº ${k.contractCode}` : 'Sin nº'}</span> · {String(k.tariff ?? '—')} <span className="muted">· {String(k.product)}</span></td><td className="n">{eur(t.income, 2)}</td><td className="n">{eur(t.cost, 2)}{t.estimated && mode === 'real' && <Dot />}</td><td className="n">{eur(t.margin, 2)}</td><td className="n"><Chip m={f100(t.marginPct)} /></td><td /></tr>; })}
      </Fragment>; })}
      {!rows.length && <tr><td colSpan={9} className="empty">Ningún cliente cumple el filtro.</td></tr>}</tbody></table></div>
    <div className="pager"><span>Página {pg + 1} de {pages} · {rows.length.toLocaleString('es-ES')} clientes</span><span className="row"><button className="btn" type="button" disabled={pg === 0} onClick={() => setPage(pg - 1)}>Anterior</button><button className="btn" type="button" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Siguiente</button></span></div></div></section>;
}

/* ───────────── Mes a mes ───────────── */
function Meses({ report, mode, months, mi }: { report: Report; mode: Mode; months: string[]; mi: number }) {
  const period = report.period;
  const names = Array.from(new Set([...array(report.products).map(p => String(p.product)), ...array(report.monthly).flatMap(m => array(m.products).map(p => String(p.product)))]));
  const rows: HeatRow[] = names.map(n => ({ name: n, cells: months.map(m => { if (m > period) return { m: null, est: false }; const x = productMonthMargin(report, n, m, mode); return { m: f100(x.value), est: x.estimated }; }) })).filter(r => r.cells.some(c => c.m != null));
  const total = months.map(m => { if (m > period) return null; const t = totalsOf(monthProducts(report, m), mode); return t.hasData ? f100(t.marginPct) : null; });
  return <section className="view"><div className="panel"><h2>Margen % por producto y mes</h2><p className="help">Rojo: pierde dinero. Ámbar: margen bajo. Verde: sano. El punto • indica coste estimado. Los meses posteriores al seleccionado aún no tienen datos.</p>
    <div className="tablewrap"><Heat rows={rows} total={total} cur={mi} months={MESES.map(cap)} /></div></div></section>;
}

/* ───────────── Alertas ───────────── */
function Alertas({ report, groups, focusType, mutate, busy, readOnly, showClients }: { report: Report; groups: AlertGroup[]; focusType: string | null; mutate: Mutate; busy: boolean; readOnly: boolean; showClients: (p: { flag?: string }) => void }) {
  const [open, setOpen] = useState<string | null>(focusType); const resolved = array(report.resolvedExceptions);
  useEffect(() => setOpen(focusType), [focusType]);
  return <section className="view"><div className="panel"><h2>Alertas</h2><p className="help">{readOnly ? 'Consulta de alertas guardadas. En modo solo lectura no se resuelven ni se reabren.' : 'Agrupadas por tipo, con lo que hay que hacer. Al resolver una se guarda como regla y no vuelve a salir.'}</p>
    <div className="alerts">{groups.map(g => <Fragment key={g.type}>
      <AlertRow g={g} open={open === g.type} label={g.type === 'MARGEN_NEGATIVO' ? 'Ver clientes' : open === g.type ? 'Ocultar' : readOnly ? 'Ver alertas' : 'Ver y resolver'} onClick={() => g.type === 'MARGEN_NEGATIVO' ? showClients({ flag: 'neg' }) : setOpen(open === g.type ? null : g.type)} />
      {open === g.type && <div className="tablewrap"><FilterTable rows={g.items} pageSize={10} rowKey={a => String(a.key)} ariaLabel={g.title} searchText={a => `${a.title} ${a.contractCode ?? ''} ${a.product ?? ''}`} search="Buscar…"
        cols={[{ key: 'title', label: 'Qué pasa', render: a => <span style={{ whiteSpace: 'normal' }}>{String(a.title)}</span> }, { key: 'product', label: 'Producto', hideSm: true, render: a => String(a.product ?? a.suggestedProduct ?? '—') }, { key: 'amount', label: 'Importe', n: true, hideSm: true, value: a => numeric(a.amount), render: a => a.amount == null ? '—' : eur(numeric(a.amount), 2) },
          ...(!readOnly ? [{ key: 'act', label: '', noSort: true, render: (a: Row) => <div className="legacy" style={{ minWidth: 150 }}><AlertAction alert={a} report={report} mutate={mutate} busy={busy} /></div> }] : [])]} /></div>}
    </Fragment>)}{!groups.length && <div className="empty">No hay nada pendiente de revisar.</div>}</div></div>
    {!!resolved.length && <details className="how"><summary>Ya resueltas ({resolved.length}){!readOnly && ' · se pueden reabrir'}</summary><div style={{ marginTop: 8 }}>
      <FilterTable rows={resolved} pageSize={10} rowKey={r => String(r.key ?? r.id)} ariaLabel="Alertas resueltas" cols={[{ key: 'title', label: 'Alerta', render: r => <span style={{ whiteSpace: 'normal' }}>{String(r.title)}</span> }, { key: 'createdAt', label: 'Fecha', hideSm: true, render: r => r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES') : '—' },
        ...(!readOnly ? [{ key: 'act', label: '', noSort: true, render: (r: Row) => <button type="button" className="btn small" disabled={busy} onClick={() => void mutate('exceptions', { exceptionKey: String(r.key), action: 'REABRIR' }, 'Alerta reabierta. Queda constancia del cambio y no se borra nada.')}>Reabrir</button> }] : [])]} /></div></details>}
  </section>;
}

/* ───────────── Comparar con Excel ───────────── */
function Excel({ report, mode }: { report: Report; mode: Mode }) {
  const rows = compareRows(report, mode); const ym = monthLabel(report.period).split(' ')[0].toLowerCase();
  const why = (r: (typeof rows)[number]) => {
    if (r.missing) return 'El producto no aparece en el panel este mes.';
    if (r.estimated) return 'Faltan facturas del proveedor: el coste del panel es estimado.';
    const di = r.xIncome && r.pIncome != null ? Math.abs(r.pIncome - r.xIncome) / Math.abs(r.xIncome) : 0; const dc = r.xCost && r.pCost != null ? Math.abs(r.pCost - r.xCost) / Math.abs(r.xCost) : 0;
    const out: string[] = []; if (di > 0.1) out.push('El Excel usa la cuota contratada; el panel, lo facturado en el mes.'); if (dc > 0.1) out.push('El Excel usa el coste medio de enero a octubre; el panel, el del mes.'); return out.join(' ');
  };
  return <section className="view"><div className="panel"><h2>Comparar con el Excel de noviembre</h2><p className="help">El Excel (versión 4) usa la cuota contratada y el coste medio de enero a octubre. El panel usa lo facturado en el mes. Las diferencias grandes tienen explicación en la columna «Por qué».</p>
    <div className="tablewrap"><table><thead><tr><th>Producto</th><th className="n">Excel · ingreso</th><th className="n">Excel · margen</th><th className="n">Panel {ym} · ingreso</th><th className="n">Panel {ym} · margen</th><th className="n">Diferencia de margen</th><th>Por qué</th></tr></thead><tbody>
      {rows.map(r => { const xm = r.xIncome != null ? r.xIncome - (r.xCost ?? 0) : null; const pm = r.pIncome != null && r.pCost != null ? r.pIncome - r.pCost : null; const d = xm != null && pm != null ? pm - xm : null;
        return <tr key={r.key}><td>{r.product}</td><td className="n">{eur(r.xIncome)}</td><td className="n"><Chip m={f100(r.xPct)} /></td><td className="n">{eur(r.pIncome)}</td><td className="n"><Chip m={f100(r.pPct)} />{r.estimated && <Dot />}</td><td className="n">{d == null ? '—' : <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : ''}{eur(d)}</span>}</td><td className="small muted" style={{ minWidth: 300 }}>{why(r)}</td></tr>; })}
      {!rows.length && <tr><td colSpan={7} className="empty">No hay datos del Excel cargados.</td></tr>}</tbody></table></div></div>
    <details className="how"><summary>Contratado frente a real (Draxton y otros)</summary><div className="legacy" style={{ marginTop: 8 }}><Comparison report={report} /></div></details></section>;
}
