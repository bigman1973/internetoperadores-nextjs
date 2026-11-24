'use client';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './io-ui.css';
import { ioFontClasses } from './fonts';

/* ───────── Formato (idéntico al simulador: «−» tipográfico, espacio y €) ───────── */
export const eur = (v: number | null | undefined, d = 0) => v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
/** Porcentaje recibido ya en «puntos» (12,5 = 12,5 %). */
export const pct = (v: number | null | undefined, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
export const num = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
export const signed = (v: number | null | undefined, d = 0) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + eur(v, d);
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthLabel = (ym: string, long = false) => `${(long ? MESES_LARGO : MESES)[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

/* ───────── Estructura ───────── */
export function IoShell({ children }: { children: ReactNode }) { return <div className={`io-ui ${ioFontClasses}`}>{children}</div>; }
export function Wrap({ children, as: Tag = 'div' }: { children: ReactNode; as?: 'div' | 'main' }) { return <Tag className="wrap">{children}</Tag>; }

/** Cabecera fija del simulador: marca + controles, pestañas y franja de KPIs. */
export function TopBar({ eyebrow, controls, tabs, children }: { eyebrow: string; controls: ReactNode; tabs?: ReactNode; children?: ReactNode }) {
  return <header className="top"><div className="wrap"><div className="bar"><div className="brand"><b>internet<i>operadores</i></b><span className="eyebrow">{eyebrow}</span></div><div className="scn">{controls}</div></div>{tabs}</div>{children}</header>;
}
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { key: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return <nav className="tabs" role="tablist" aria-label={label}>{tabs.map(t => <a key={t.key} role="tab" tabIndex={0} aria-selected={value === t.key} aria-current={value === t.key ? 'page' : undefined} onClick={() => onChange(t.key)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(t.key); } }}>{t.label}{!!t.badge && <span className="badge">{t.badge}</span>}</a>)}</nav>;
}
export function Info({ children, label = 'Más información' }: { children: ReactNode; label?: string }) { return <span className="ibtn" tabIndex={0} role="note" aria-label={label}>i<span className="tipbox">{children}</span></span>; }
export function Tip({ children, tip }: { children: ReactNode; tip: ReactNode }) { return <span className="tip" tabIndex={0}>{children}<span className="tipbox">{tip}</span></span>; }
export function Pill({ tone, children, onClick, title }: { tone?: 'ok' | 'mod' | 'bad'; children: ReactNode; onClick?: () => void; title?: string }) {
  return onClick ? <button type="button" className={`pill ${tone ?? ''}`} onClick={onClick} title={title} aria-haspopup="dialog">{children}</button> : <span className={`pill ${tone ?? ''}`} title={title}>{children}</span>;
}
/** Chip de margen del simulador: rojo si es negativo, ámbar por debajo de 20 %, sin color en el resto. */
export function MarginChip({ value, estimated }: { value: number | null | undefined; estimated?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="m na">—</span>;
  return <span className={`m ${value < 0 ? 'bad' : value < 20 ? 'low' : 'ok'}`}>{estimated && <Tip tip="Incluye coste estimado: faltan facturas del proveedor."><span className="dot" style={{ marginRight: 5 }} /></Tip>}{pct(value)}</span>;
}
export function Panel({ title, help, aside, children, className }: { title?: ReactNode; help?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className ?? ''}`}>{(title || aside) && <div className="phead"><div style={{ minWidth: 0 }}>{title && <h2>{title}</h2>}{help && <p className="help">{help}</p>}</div>{aside}</div>}{children}</section>;
}
export function Fold({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) { return <details className="fold" open={open}><summary>{title}</summary><div className="foldbody">{children}</div></details>; }
export function Note({ tone, children }: { tone?: 'bad' | 'good'; children: ReactNode }) { return <div className={`note ${tone ?? ''}`}>{children}</div>; }
export const Tag = ({ cls, children }: { cls?: string; children: ReactNode }) => <span className={`tag ${cls ?? ''}`}>{children}</span>;

export type KpiData = { label: string; value: ReactNode; sub?: ReactNode; negative?: boolean; up?: boolean; estimated?: string; info?: ReactNode; bar?: { pct: number; tone?: 'ok' | 'warn' | 'bad' } };
export function Kpis({ items }: { items: KpiData[] }) {
  return <div className="kpis">{items.map(k => <div className="kpi" key={k.label}>
    <div className="eyebrow">{k.label}{k.info && <Info>{k.info}</Info>}</div>
    <div className={`v ${k.up ? 'up' : ''} ${k.negative ? 'neg' : ''}`}>{k.value}{k.estimated && <Tip tip={k.estimated}><span className="dot" /></Tip>}</div>
    {k.bar && <div className={`barq ${k.bar.tone === 'warn' ? 'warn' : k.bar.tone === 'bad' ? 'bad' : ''}`}><i style={{ width: `${Math.max(0, Math.min(100, k.bar.pct))}%` }} /></div>}
    <div className="s">{k.sub ?? '\u00a0'}</div></div>)}</div>;
}
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, [open, close]);
  return ref;
}
export function Menu({ label, children, disabled }: { label: ReactNode; children: (close: () => void) => ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const close = () => setOpen(false); const ref = useOutside(open, close);
  return <div className="menu" ref={ref}><button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)}>{label} ▾</button>{open && <div className="drop" role="menu">{children(close)}</div>}</div>;
}
export function Popover({ trigger, children }: { trigger: (toggle: () => void, open: boolean) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false); const close = () => setOpen(false); const ref = useOutside(open, close);
  return <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>{trigger(() => setOpen(o => !o), open)}{open && <div className="pop" role="dialog">{children(close)}</div>}</div>;
}
export const Toast = ({ text }: { text: string }) => text ? <div className="toast" role="status">{text}</div> : null;

/* ───────── Gráficos SVG (mismo lenguaje visual que el simulador) ───────── */
const niceMax = (v: number) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

/** 12 meses: barras de ingreso (naranja) y coste (gris), con la línea del margen %. */
export function MonthlyChart({ data, current }: { data: { month: string; income: number | null; cost: number | null; marginPct: number | null; estimated?: boolean; forecast?: boolean }[]; current: string }) {
  const W = 760, H = 250, L = 44, R = 40, T = 16, B = 28, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(1, ...data.map(d => Math.max(d.income ?? 0, d.cost ?? 0))));
  const ps = data.map(d => d.marginPct).filter((v): v is number => v != null);
  const pMin = Math.min(0, ...ps), pMax = Math.max(60, ...ps);
  const slot = iw / data.length, x = (i: number) => L + slot * (i + 0.5), bw = Math.min(18, slot / 2.6);
  const y = (v: number) => T + ih - v / max * ih, yp = (v: number) => T + ih - (v - pMin) / (pMax - pMin || 1) * ih;
  const pts = data.map((d, i) => d.marginPct == null || d.forecast ? null : `${x(i)},${yp(d.marginPct)}`).filter(Boolean);
  return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingreso, coste y margen de los 12 meses">
    {[0, .5, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" /><text x={L - 6} y={y(max * f) + 4} textAnchor="end">{Math.round(max * f / 1000)}k</text></g>)}
    {[pMin, (pMin + pMax) / 2, pMax].map((v, i) => <text key={i} x={W - R + 6} y={yp(v) + 4}>{Math.round(v)} %</text>)}
    {data.map((d, i) => <g key={d.month}>
      {d.month === current && <rect x={x(i) - slot / 2} y={T} width={slot} height={ih} fill="var(--accent-soft)" opacity=".55" />}
      {d.income != null && <rect x={x(i) - bw - 1} y={y(d.income)} width={bw} height={Math.max(0, y(0) - y(d.income))} rx="2" fill="var(--after)" opacity={d.forecast ? .4 : 1}><title>{`${monthLabel(d.month)} · ingreso ${eur(d.income)}${d.forecast ? ' (previsión)' : ''}`}</title></rect>}
      {d.cost != null && <rect x={x(i) + 1} y={y(d.cost)} width={bw} height={Math.max(0, y(0) - y(d.cost))} rx="2" fill="var(--before)" opacity={d.forecast || d.estimated ? .55 : 1}><title>{`${monthLabel(d.month)} · coste ${eur(d.cost)}${d.estimated ? ' (incluye estimado)' : ''}`}</title></rect>}
      <text x={x(i)} y={H - 9} textAnchor="middle" className={d.month === current ? 'lbl' : ''}>{MESES[Number(d.month.slice(5)) - 1]}</text></g>)}
    {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="var(--good)" strokeWidth="2" />}
    {data.map((d, i) => d.marginPct == null || d.forecast ? null : <circle key={d.month} cx={x(i)} cy={yp(d.marginPct)} r="3" fill="var(--surface)" stroke="var(--good)" strokeWidth="2"><title>{`${monthLabel(d.month)} · margen ${pct(d.marginPct)}`}</title></circle>)}
  </svg><div className="legend"><span><i style={{ background: 'var(--after)' }} />Ingreso</span><span><i style={{ background: 'var(--before)' }} />Coste (más claro: incluye estimado)</span><span><i style={{ background: 'var(--good)' }} />Margen %</span></div></div>;
}

/** Ranking en barras horizontales (HTML, para que se lea bien a 400 px). */
export function HBars({ rows, onPick, format = (v: number | null) => pct(v) }: { rows: { label: string; value: number | null; extra?: ReactNode }[]; onPick?: (label: string) => void; format?: (v: number | null) => string }) {
  const vals = rows.map(r => r.value ?? 0); const hi = Math.max(1, ...vals), lo = Math.min(0, ...vals), span = hi - lo || 1, zero = (0 - lo) / span * 100;
  return <div className="hb">{rows.map(r => { const v = r.value ?? 0; const left = v >= 0 ? zero : (v - lo) / span * 100, width = Math.abs(v) / span * 100;
    const col = r.value == null ? 'var(--before)' : v < 0 ? 'var(--bad)' : v < 20 ? 'var(--warn)' : 'var(--after)';
    return <div className="r" key={r.label}><span className="nm" title={r.label} style={onPick ? { cursor: 'pointer' } : undefined} onClick={onPick ? () => onPick(r.label) : undefined}>{r.label}</span><div className="tr"><i style={{ left: `${left}%`, width: `${Math.max(width, .5)}%`, background: col }} /></div><span className="val">{r.extra ?? format(r.value)}</span></div>; })}</div>;
}
/** Minigráfico de barras (12 meses). */
export function Spark({ values, width = 96, height = 22 }: { values: (number | null)[]; width?: number; height?: number }) {
  const ns = values.filter((v): v is number => v != null); if (!ns.length) return <span className="muted">—</span>;
  const mx = Math.max(...ns, 0), mn = Math.min(...ns, 0), span = mx - mn || 1, bw = width / values.length, zero = height - (0 - mn) / span * height;
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Margen de los 12 meses" style={{ verticalAlign: 'middle' }}>{values.map((v, i) => v == null ? <rect key={i} x={i * bw + 1} y={height - 2} width={bw - 2} height={1.5} fill="var(--line)" /> : <rect key={i} x={i * bw + 1} y={v >= 0 ? zero - v / span * height : zero} width={bw - 2} height={Math.max(1.5, Math.abs(v) / span * height)} rx="1" fill={v < 0 ? 'var(--bad)' : v < 20 ? 'var(--warn)' : 'var(--after)'} />)}</svg>;
}
/** Mapa de calor producto × mes (margen %). */
export function Heatmap({ months, rows, current }: { months: string[]; rows: { label: string; cells: ({ value: number | null; estimated?: boolean; forecast?: boolean } | null)[] }[]; current?: string }) {
  const bg = (v: number | null) => v == null ? 'var(--sunken)' : v < 0 ? 'var(--bad-soft)' : v < 20 ? 'var(--warn-soft)' : v < 35 ? 'var(--accent-soft)' : 'var(--good-soft)';
  const fg = (v: number | null) => v == null ? 'var(--muted)' : v < 0 ? 'var(--bad)' : v < 20 ? 'var(--warn)' : v < 35 ? 'var(--accent-fg)' : 'var(--good)';
  return <div><div className="tablewrap" style={{ padding: 6 }}><table className="heat"><thead><tr><th />{months.map(m => <th key={m}>{MESES[Number(m.slice(5)) - 1]}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.label}><td className="pn">{r.label}</td>{r.cells.map((c, i) => <td key={i} className={`${c?.forecast ? 'fc' : ''} ${months[i] === current ? 'cur' : ''}`} style={{ background: bg(c?.value ?? null), color: fg(c?.value ?? null) }} title={c?.value == null ? `${monthLabel(months[i])}: sin dato` : `${monthLabel(months[i])}: ${pct(c.value)}${c.estimated ? ' · incluye coste estimado' : ''}${c.forecast ? ' · previsión' : ''}`}>{c?.value == null ? '·' : `${Math.round(c.value)}${c.estimated ? '*' : ''}`}</td>)}</tr>)}</tbody></table></div>
    <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: 'var(--bad-soft)' }} />Negativo</span><span><i style={{ background: 'var(--warn-soft)' }} />Menos de 20 %</span><span><i style={{ background: 'var(--accent-soft)' }} />20–35 %</span><span><i style={{ background: 'var(--good-soft)' }} />35 % o más</span><span>* incluye coste estimado</span></div></div>;
}

/* ───────── Tabla con filtro, orden, paginación, despliegue y fila de totales ───────── */
export type TCol<R> = { key: string; label: ReactNode; n?: boolean; value?: (r: R) => number | string | null; render?: (r: R) => ReactNode; className?: (r: R) => string; hideSm?: boolean; noSort?: boolean };
export function FilterTable<R extends Record<string, any>>({ rows, cols, rowKey, search, searchText, filters, pageSize = 25, expand, onRowClick, totals, empty = 'No hay resultados para esta selección.', initialSort, ariaLabel, count }: {
  rows: R[]; cols: TCol<R>[]; rowKey: (r: R) => string; search?: string; searchText?: (r: R) => string; filters?: ReactNode; pageSize?: number;
  expand?: (r: R) => ReactNode; onRowClick?: (r: R) => void; totals?: Record<string, ReactNode> | ((all: R[]) => Record<string, ReactNode>); empty?: string; initialSort?: { key: string; dir: 'asc' | 'desc' }; ariaLabel?: string; count?: string;
}) {
  const [q, setQ] = useState(''); const [sort, setSort] = useState(initialSort ?? null); const [page, setPage] = useState(0); const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('es');
    const out = needle && searchText ? rows.filter(r => searchText(r).toLocaleLowerCase('es').includes(needle)) : rows.slice();
    if (sort) { const c = cols.find(c => c.key === sort.key); if (c) { const val = (r: R) => c.value ? c.value(r) : r[c.key]; out.sort((a, b) => { const av = val(a), bv = val(b); if (av == null && bv == null) return 0; if (av == null) return 1; if (bv == null) return -1; const d = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'es'); return sort.dir === 'asc' ? d : -d; }); } }
    return out;
  }, [rows, q, sort, cols, searchText]);
  useEffect(() => setPage(0), [rows.length, q]);
  const pages = Math.max(1, Math.ceil(list.length / pageSize)), cur = Math.min(page, pages - 1), visible = list.slice(cur * pageSize, (cur + 1) * pageSize);
  const tot = typeof totals === 'function' ? totals(list) : totals;
  return <div>
    {(searchText || filters) && <div className="row" style={{ marginBottom: 10 }}>{searchText && <input className="search" type="search" placeholder={search ?? 'Buscar…'} aria-label={search ?? 'Buscar'} value={q} onChange={e => setQ(e.target.value)} />}{filters}</div>}
    <div className="tablewrap"><table aria-label={ariaLabel}><thead><tr>{expand && <th style={{ width: 28 }} />}{cols.map(c => <th key={c.key} className={`${c.noSort ? '' : 'sort'} ${c.n ? 'n' : ''} ${c.hideSm ? 'hide-sm' : ''}`} data-dir={sort?.key === c.key ? sort.dir : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} onClick={c.noSort ? undefined : () => setSort(s => s?.key === c.key ? { key: c.key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: c.key, dir: c.n ? 'desc' : 'asc' })}>{c.label}</th>)}</tr></thead>
      <tbody>{visible.map(r => { const k = rowKey(r), isOpen = open === k; return <Fragment key={k}>
        <tr className={onRowClick || expand ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : expand ? () => setOpen(isOpen ? null : k) : undefined}>{expand && <td><button type="button" className="expand" aria-expanded={isOpen} aria-label="Ver detalle" onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : k); }}>{isOpen ? '▾' : '▸'}</button></td>}
          {cols.map(c => <td key={c.key} className={`${c.n ? 'n' : ''} ${c.hideSm ? 'hide-sm' : ''} ${c.className?.(r) ?? ''}`}>{c.render ? c.render(r) : String((c.value ? c.value(r) : r[c.key]) ?? '—')}</td>)}</tr>
        {isOpen && expand && <tr className="sub"><td colSpan={cols.length + 1} style={{ padding: 10 }}>{expand(r)}</td></tr>}</Fragment>; })}
        {!visible.length && <tr><td colSpan={cols.length + (expand ? 1 : 0)} className="empty">{empty}</td></tr>}
        {tot && !!visible.length && <tr className="tot">{expand && <td />}{cols.map(c => <td key={c.key} className={`${c.n ? 'n' : ''} ${c.hideSm ? 'hide-sm' : ''}`}>{tot[c.key] ?? ''}</td>)}</tr>}</tbody></table></div>
    <div className="pager"><span>{count ?? `${num(list.length)} ${list.length === 1 ? 'resultado' : 'resultados'}`}</span>{pages > 1 && <span className="row"><button type="button" className="btn small" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</button><span>{cur + 1} / {pages}</span><button type="button" className="btn small" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Siguiente</button></span>}</div>
  </div>;
}
