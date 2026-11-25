'use client';
import { useEffect, useRef, useState } from 'react';
import { eur, monthLabel } from '@/components/io-ui/kit';
import { exportTable } from './export-table';
import type { Column } from './view-model';

export type DesgloseSel = { tipo: 'cliente' | 'producto'; clave: string; nombre: string; vista: 'facturado' | 'coste' | 'contratos' };
type Fila = Record<string, any>;
type Resp = { month: string; nombre?: string; cifraTabla: number | null; sumaDetalle: number | null; diferencia: number | null; cuadra: boolean; filas: Fila[]; notas: string[]; cobertura: Record<string, number> };

const TITULO = { facturado: 'Facturado', coste: 'Coste asignado', contratos: 'Contratos' } as const;
const SD = <span className="muted">sin dato</span>;
const fechaEs = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null);
const dato = (v: unknown) => (v === null || v === undefined || v === '' ? SD : <>{String(v)}</>);
const Dot = () => <span className="dot" title="Importe estimado: todavía no hay factura de proveedor" />;

const COLS: Record<DesgloseSel['vista'], Column[]> = {
  facturado: [
    { key: 'fecha', label: 'Fecha', value: r => fechaEs(r.fecha) }, { key: 'factura', label: 'Nº de factura', value: r => r.factura ?? (r.facturaNota ? r.facturaNota : null) },
    { key: 'concepto', label: 'Concepto' }, { key: 'contrato', label: 'Contrato' }, { key: 'cliente', label: 'Cliente' }, { key: 'periodicidad', label: 'Periodicidad' },
    { key: 'importeFactura', label: 'Importe de la línea', kind: 'money' }, { key: 'importe', label: 'Parte de este mes', kind: 'money' },
  ],
  coste: [
    { key: 'proveedor', label: 'Proveedor' }, { key: 'factura', label: 'Nº de factura' }, { key: 'fechaFactura', label: 'Fecha', value: r => fechaEs(r.fechaFactura) }, { key: 'concepto', label: 'Concepto' },
    { key: 'contrato', label: 'Contrato' }, { key: 'cliente', label: 'Cliente' }, { key: 'totalFactura', label: 'Total de la factura', kind: 'money' }, { key: 'regla', label: 'Regla de reparto' },
    { key: 'importe', label: 'Importe asignado', kind: 'money' }, { key: 'estado', label: 'Estado', value: r => (r.estado === 'REAL' ? 'Real' : r.estado === 'PENDIENTE' ? 'Pendiente' : 'Estimado') }, { key: 'origen', label: 'Origen' },
  ],
  contratos: [
    { key: 'contrato', label: 'Nº de contrato' }, { key: 'cliente', label: 'Cliente' }, { key: 'tarifa', label: 'Tarifa' }, { key: 'producto', label: 'Producto' },
    { key: 'cuota', label: 'Cuota mensual', kind: 'money' }, { key: 'periodicidad', label: 'Periodicidad' }, { key: 'alta', label: 'Alta', value: r => fechaEs(r.alta) }, { key: 'baja', label: 'Baja', value: r => fechaEs(r.baja) },
    { key: 'estadoIsp', label: 'Estado en ISP' }, { key: 'facturadoMes', label: 'Facturado en el mes', kind: 'money' },
  ],
};

export default function Desglose({ month, sel, onClose }: { month: string; sel: DesgloseSel; onClose: () => void }) {
  const [data, setData] = useState<Resp | null>(null); const [err, setErr] = useState(''); const [exp, setExp] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let live = true; setData(null); setErr('');
    const q = new URLSearchParams({ month, detalle: sel.tipo, clave: sel.clave, vista: sel.vista });
    fetch(`/api/admin/rentabilidad?${q}`, { cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('No se ha podido cargar el detalle.'); return r.json(); })
      .then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(e.message || 'No se ha podido cargar el detalle.'); });
    return () => { live = false; };
  }, [month, sel.tipo, sel.clave, sel.vista]);
  useEffect(() => { closeRef.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const vista = sel.vista; const filas = data?.filas ?? [];
  const sinFactura = vista === 'facturado' ? (data?.cobertura?.sinFactura ?? 0) : 0;
  const exportar = async () => { if (!data) return; setExp(true); try { await exportTable(`${TITULO[vista]} ${sel.nombre}`, COLS[vista], filas, month); } finally { setExp(false); } };
  const colsTot = vista === 'facturado' ? (sel.tipo === 'producto' ? 6 : 5) : (sel.tipo === 'cliente' ? 5 : 4);
  return <div className="drawer-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${TITULO[vista]} de ${sel.nombre}`}>
      <header className="dhead"><div><div className="eyebrow">{TITULO[vista]} · {monthLabel(month)}</div><h2>{sel.nombre}</h2></div>
        <div className="row"><button type="button" className="btn small" disabled={!data || !filas.length || exp} onClick={exportar}>{exp ? 'Exportando…' : 'Exportar a Excel'}</button><button type="button" className="btn small" ref={closeRef} onClick={onClose} aria-label="Cerrar">Cerrar ✕</button></div></header>
      {err && <div className="note bad">{err}</div>}
      {!data && !err && <p className="muted">Cargando el detalle…</p>}
      {data && <>
        <div className={`dcheck ${data.cuadra ? 'ok' : 'warn'}`}>
          {vista === 'contratos'
            ? <><b>{filas.length.toLocaleString('es-ES')}</b> contratos{data.cifraTabla != null && <> · la tabla indica {data.cifraTabla.toLocaleString('es-ES')}</>} · {data.cuadra ? '✔ cuadra' : `diferencia de ${data.diferencia ?? 0}`}</>
            : <>Suma del detalle <b>{eur(data.sumaDetalle, 2)}</b> · cifra de la tabla <b>{eur(data.cifraTabla, 2)}</b> · {data.cuadra ? '✔ cuadra' : <b>diferencia {eur(data.diferencia, 2)}</b>}</>}
        </div>
        <div className="tablewrap dtable"><table><thead><tr>
          {vista === 'facturado' && <><th>Fecha</th><th>Nº de factura</th><th>Concepto</th><th>Contrato</th>{sel.tipo === 'producto' && <th className="hide-sm">Cliente</th>}<th className="n">Línea</th><th className="n">Este mes</th></>}
          {vista === 'coste' && <><th>Proveedor</th><th>Nº de factura</th><th>Concepto</th>{sel.tipo === 'cliente' && <th>Contrato</th>}<th className="n hide-sm">Total factura</th><th className="hide-sm">Regla de reparto</th><th className="n">Asignado</th></>}
          {vista === 'contratos' && <><th>Nº</th>{sel.tipo === 'producto' && <th>Cliente</th>}<th>Tarifa</th><th className="n">Cuota</th><th>Alta</th><th>Baja</th><th>Estado ISP</th></>}
        </tr></thead>
          <tbody>
            {!filas.length && <tr><td colSpan={9} className="empty">No hay líneas para esta cifra.</td></tr>}
            {vista === 'facturado' && filas.map((f, i) => <tr key={i} className={f.ajuste ? 'sub' : undefined}><td>{f.ajuste ? '' : dato(fechaEs(f.fecha))}</td>
              <td>{f.factura ? f.factura : f.facturaNota ? <span className="muted small" title={f.facturaNota}>una de varias</span> : f.ajuste ? '' : SD}</td>
              <td className="concepto" title={f.concepto ?? ''}>{f.concepto ? String(f.concepto).slice(0, 90) : SD}</td><td>{f.contrato ?? (f.ajuste ? '' : <span className="muted">serie</span>)}</td>
              {sel.tipo === 'producto' && <td className="hide-sm">{f.cliente ?? ''}</td>}<td className="n">{f.importeFactura == null ? '' : eur(f.importeFactura, 2)}{f.periodicidad && f.periodicidad !== 'Mensual' && <span className="muted small"> · {String(f.periodicidad).toLowerCase()}</span>}</td><td className="n">{eur(f.importe, 2)}</td></tr>)}
            {vista === 'coste' && filas.map((f, i) => <tr key={i}><td>{dato(f.proveedor)}</td><td>{f.factura ? f.factura : f.origen && f.origen !== 'Factura de proveedor' ? <span className="muted small">{f.origen}</span> : SD}</td>
              <td className="concepto" title={f.concepto ?? ''}>{f.concepto ? String(f.concepto).slice(0, 80) : SD}</td>{sel.tipo === 'cliente' && <td>{f.contrato ?? ''}</td>}
              <td className="n hide-sm">{f.totalFactura == null ? <span className="muted">—</span> : eur(f.totalFactura, 2)}</td><td className="hide-sm small">{dato(f.regla)}</td>
              <td className="n">{eur(f.importe, 2)}{f.estado !== 'REAL' && <Dot />}</td></tr>)}
            {vista === 'contratos' && filas.map((f, i) => <tr key={i}><td>{f.contrato}</td>{sel.tipo === 'producto' && <td>{f.cliente ?? ''}</td>}<td>{dato(f.tarifa)}</td><td className="n">{f.cuota == null ? SD : eur(f.cuota, 2)}</td><td>{dato(fechaEs(f.alta))}</td><td>{dato(fechaEs(f.baja))}</td><td>{dato(f.estadoIsp)}</td></tr>)}
            {vista !== 'contratos' && !!filas.length && <tr className="tot"><td colSpan={colsTot}>Total</td><td className="n">{eur(data.sumaDetalle, 2)}</td></tr>}
          </tbody></table></div>
        {vista === 'facturado' && sinFactura > 0 && <p className="small muted">El nº de factura de venta no viene en las líneas de ISP: solo se muestra cuando el cliente tiene una única factura ese día. En {sinFactura.toLocaleString('es-ES')} líneas no se ha encontrado y se indica «sin dato».</p>}
        {!!data.notas?.length && <details className="how" open={data.notas.length <= 2}><summary>Cómo leer este detalle</summary><ul>{data.notas.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
      </>}
    </aside></div>;
}
