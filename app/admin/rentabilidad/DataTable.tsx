'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { array, display, numeric, type Column, type Row } from './view-model';
export function Status({ value }: { value: unknown }) {
  const text = display(value); const pending = /PENDIENTE|BLOQUEADO|REVISION|SIN /i.test(text); const estimated = /ESTIMADO|REFERENCIA/i.test(text);
  return <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${pending ? 'bg-slate-100 text-slate-700' : estimated ? 'bg-amber-100 text-amber-900' : /ERROR|FALLIDO/.test(text) ? 'bg-red-100 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{text}</span>;
}
export default function DataTable({ title, rows, columns, period, detail, actions, description }: {
  title: string; rows: Row[]; columns: Column[]; period: string;
  detail?: (row: Row) => ReactNode; actions?: (row: Row) => ReactNode; description?: string;
}) {
  const [search, setSearch] = useState(''); const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(null);
  const [page, setPage] = useState(0); const [open, setOpen] = useState<string | null>(null); const [exporting, setExporting] = useState(false); const [error, setError] = useState('');
  const cell = (column: Column, row: Row) => column.value ? column.value(row) : row[column.key];
  const filtered = useMemo(() => {
    const needle = search.toLocaleLowerCase('es').trim();
    const list = array(rows).filter(row => !needle || columns.some(column => display(cell(column, row)).toLocaleLowerCase('es').includes(needle)));
    if (sort) { const col = columns.find(column => column.key === sort.key)!; list.sort((a, b) => {
      const av = cell(col, a), bv = cell(col, b); if (av == null) return 1; if (bv == null) return -1;
      const result = col.kind && col.kind !== 'status' ? (numeric(av) ?? 0) - (numeric(bv) ?? 0) : String(av).localeCompare(String(bv), 'es');
      return sort.descending ? -result : result;
    }); }
    return list;
  }, [rows, columns, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 50)); const currentPage = Math.min(page, pages - 1);
  async function download() { setExporting(true); setError(''); try { const { exportTable } = await import('./export-table'); await exportTable(title, columns, filtered, period); } catch { setError('No se pudo generar el Excel. Vuelve a intentarlo.'); } finally { setExporting(false); } }
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white panel-dark:border-slate-700 panel-dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 panel-dark:border-slate-700"><div><h2 className="font-semibold text-slate-900 panel-dark:text-slate-100">{title}</h2>{description && <p className="mt-1 max-w-3xl text-xs text-slate-500 panel-dark:text-slate-400">{description}</p>}</div><div className="flex flex-wrap items-center gap-2"><input aria-label={`Buscar en ${title}`} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar…" className="w-40 rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm panel-dark:border-slate-700" /><button type="button" onClick={download} disabled={exporting} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 panel-dark:border-slate-700 panel-dark:hover:bg-slate-800">{exporting ? 'Exportando…' : 'Exportar Excel'}</button></div></div>
    {error && <p role="alert" className="px-4 py-2 text-sm text-red-700">{error}</p>}
    <div className="max-h-[640px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-600 panel-dark:bg-slate-800 panel-dark:text-slate-300"><tr>{detail && <th className="px-3 py-3"><span className="sr-only">Detalle</span></th>}{columns.map(column => <th key={column.key} aria-sort={sort?.key === column.key ? sort.descending ? 'descending' : 'ascending' : 'none'} className={`whitespace-nowrap px-4 py-3 ${column.kind && column.kind !== 'status' ? 'text-right' : ''}`}><button type="button" onClick={() => { setSort({ key: column.key, descending: sort?.key === column.key ? !sort.descending : false }); setPage(0); }} className="font-semibold">{column.label}{sort?.key === column.key ? sort.descending ? ' ↓' : ' ↑' : ''}</button></th>)}{actions && <th className="px-4 py-3">Acciones</th>}</tr></thead><tbody className="divide-y divide-slate-100 panel-dark:divide-slate-800">{filtered.slice(currentPage * 50, (currentPage + 1) * 50).map((row, index) => {
      const key = String(row.key ?? row.contractCode ?? row.clientCode ?? row.id ?? row._id ?? currentPage * 50 + index);
      return <TableRows key={`${key}:${index}`} rowKey={key} row={row} columns={columns} cell={cell} open={open === key} toggle={() => setOpen(open === key ? null : key)} detail={detail} actions={actions} />;
    })}{!filtered.length && <tr><td colSpan={columns.length + Number(Boolean(detail)) + Number(Boolean(actions))} className="p-8 text-center text-slate-500">No hay registros para esta selección.</td></tr>}</tbody></table></div>
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 panel-dark:border-slate-700"><span>{filtered.length.toLocaleString('es-ES')} registros · El Excel incluye todas las filas filtradas</span><div className="flex items-center gap-3"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="disabled:opacity-30">Anterior</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)} className="disabled:opacity-30">Siguiente</button></div></div>
  </section>;
}
function TableRows({ rowKey, row, columns, cell, open, toggle, detail, actions }: {
  rowKey: string; row: Row; columns: Column[]; cell: (column: Column, row: Row) => unknown; open: boolean; toggle: () => void; detail?: (row: Row) => ReactNode; actions?: (row: Row) => ReactNode;
}) {
  return <><tr className="hover:bg-slate-50 panel-dark:hover:bg-slate-800/50">{detail && <td className="px-3 py-3"><button type="button" aria-expanded={open} aria-label={`Ver contratos de ${row.clientName ?? rowKey}`} onClick={toggle} className="rounded border border-slate-200 px-2 py-1 panel-dark:border-slate-600">{open ? '−' : '+'}</button></td>}{columns.map(column => {
    const value = cell(column, row); const negative = column.kind && column.kind !== 'status' && numeric(value) !== null && numeric(value)! < 0; const estimated = column.estimated?.(row);
    return <td key={column.key} className={`px-4 py-3 align-top ${column.kind && column.kind !== 'status' ? 'whitespace-nowrap text-right tabular-nums' : 'min-w-[120px] max-w-[360px]'} ${estimated && value != null ? 'bg-amber-50 text-amber-900 panel-dark:bg-amber-950/40 panel-dark:text-amber-200' : ''} ${negative ? 'font-semibold text-red-700 panel-dark:text-red-400' : ''}`}>{column.kind === 'status' ? <Status value={value} /> : display(value, column.kind)}</td>;
  })}{actions && <td className="min-w-[180px] px-4 py-3 align-top">{actions(row)}</td>}</tr>{open && detail && <tr><td colSpan={columns.length + 1 + Number(Boolean(actions))} className="bg-slate-50 p-4 panel-dark:bg-slate-950">{detail(row)}</td></tr>}</>;
}
