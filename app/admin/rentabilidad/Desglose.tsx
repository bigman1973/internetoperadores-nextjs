'use client';
import { useEffect, useRef, useState } from 'react';
import { eur, monthLabel } from '@/components/io-ui/kit';
import type { Column } from './view-model';
import './desglose.css';

export type DesgloseSel = { tipo: 'cliente' | 'producto'; clave: string; nombre: string; vista: 'facturado' | 'coste' | 'contratos'; cifraTabla?: number | null };
type Fila = Record<string, any>;
type Resp = { month: string; nombre?: string; cifraTabla: number | null; sumaDetalle: number | null; diferencia: number | null; cuadra: boolean; filas: Fila[]; notas: string[]; cobertura: Record<string, number>; snapshot?: { id: string; version: number; kind: string; sourceHash?: string; createdAt?: string } };
const TITULO = { facturado: 'Facturado', coste: 'Coste asignado', contratos: 'Contratos' } as const;
const SD = <span className="muted">sin dato</span>;
const fechaEs = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null);
const dato = (v: unknown) => (v === null || v === undefined || v === '' ? SD : <>{String(v)}</>);
const dinero = (v?: number | null) => v == null ? SD : eur(v, 2);
const Dot = () => <span className="dot" title="Importe estimado: todavía no hay factura de proveedor" />;
export const DESGLOSE_COLUMNAS: Record<DesgloseSel['vista'], Column[]> = {
  facturado: [
    { key: 'fecha', label: 'Fecha', value: r => fechaEs(r.fecha) }, { key: 'factura', label: 'Nº de factura', value: r => r.factura ?? r.facturaNota ?? null },
    { key: 'concepto', label: 'Concepto' }, { key: 'contrato', label: 'Contrato' }, { key: 'cliente', label: 'Cliente' }, { key: 'periodicidad', label: 'Periodicidad' },
    { key: 'importeFactura', label: 'Importe de la línea', kind: 'money' }, { key: 'importe', label: 'Parte de este mes', kind: 'money' },
  ],
  coste: [
    { key: 'proveedor', label: 'Proveedor' }, { key: 'factura', label: 'Nº de factura' }, { key: 'fechaFactura', label: 'Fecha', value: r => fechaEs(r.fechaFactura) }, { key: 'concepto', label: 'Concepto' },
    { key: 'contrato', label: 'Contrato' }, { key: 'cliente', label: 'Cliente' }, { key: 'totalFactura', label: 'Total de la factura', kind: 'money' }, { key: 'regla', label: 'Regla de reparto' },
    { key: 'importe', label: 'Importe asignado', kind: 'money' }, { key: 'estado', label: 'Estado', value: r => r.estado === 'REAL' ? 'Real' : r.estado === 'PENDIENTE' ? 'Pendiente' : r.estado === 'ESTIMADO' ? 'Estimado' : null }, { key: 'origen', label: 'Origen' },
  ],
  contratos: [
    { key: 'contrato', label: 'Nº de contrato' }, { key: 'cliente', label: 'Cliente' }, { key: 'tarifa', label: 'Tarifa' }, { key: 'producto', label: 'Producto' },
    { key: 'cuota', label: 'Cuota mensual', kind: 'money' }, { key: 'periodicidad', label: 'Periodicidad' }, { key: 'alta', label: 'Alta', value: r => fechaEs(r.alta) }, { key: 'baja', label: 'Baja', value: r => fechaEs(r.baja) },
    { key: 'estadoIsp', label: 'Estado en ISP' }, { key: 'facturadoMes', label: 'Facturado en el mes', kind: 'money' },
  ],
};

export default function Desglose({ month, sel, snapshotId, onClose }: { month: string; sel: DesgloseSel; snapshotId?: string; onClose: () => void }) {
  const [data, setData] = useState<Resp | null>(null); const [err, setErr] = useState(''); const [exportErr, setExportErr] = useState(''); const [exp, setExp] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null); const panelRef = useRef<HTMLElement>(null); const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    const controller = new AbortController(); setData(null); setErr(''); setExportErr('');
    if (!snapshotId) { setErr('No hay una foto guardada para esta tabla. Vuelve a cargar el mes; no se ha recalculado nada.'); return; }
    const q = new URLSearchParams({ month, detalle: sel.tipo, clave: sel.clave, vista: sel.vista, snapshot: snapshotId });
    fetch(`/api/admin/rentabilidad?${q}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }).then(async r => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'No se ha podido cargar el detalle.');
      if (d.snapshot?.id !== snapshotId) throw new Error('El detalle no corresponde a la foto de la tabla. Vuelve a cargar el mes.');
      return d;
    }).then(d => { if (!controller.signal.aborted) setData(d); }).catch(e => { if (!controller.signal.aborted) setErr(e.message || 'No se ha podido cargar el detalle.'); });
    return () => controller.abort();
  }, [month, snapshotId, sel.tipo, sel.clave, sel.vista]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"],details > summary') ?? []).filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes.at(-1); if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = previousOverflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  const vista = sel.vista; const filas = data?.filas ?? []; const tabla = sel.cifraTabla === undefined ? data?.cifraTabla ?? null : sel.cifraTabla;
  const cuadra = !!data?.cuadra && tabla !== null && data.cifraTabla !== null && Math.abs(tabla - data.cifraTabla) < 0.01;
  const sinFactura = vista === 'facturado' ? data?.cobertura?.sinFactura ?? 0 : 0;
  const exportar = async () => {
    if (!data || exp) return; setExp(true); setExportErr('');
    try {
      const { exportTable } = await import('./export-table');
      await exportTable(`${TITULO[vista]} ${sel.nombre}`, DESGLOSE_COLUMNAS[vista], filas, month, {
        missingText: 'sin dato',
        source: `Rentabilidad ${month}; foto ${data.snapshot?.id}; versión ${data.snapshot?.version}; ${vista}; ${sel.tipo} ${sel.clave}`,
        metadata: [{ label: 'Foto', value: data.snapshot?.id ?? 'sin dato' }, { label: 'Versión', value: data.snapshot?.version ?? 'sin dato' }, { label: 'Tipo de foto', value: data.snapshot?.kind ?? 'sin dato' }, { label: 'Mes', value: month }, { label: 'Vista', value: TITULO[vista] }, { label: 'Ámbito', value: sel.nombre }, { label: 'Cifra de la tabla', value: tabla ?? 'sin dato' }, { label: 'Suma del detalle', value: data.sumaDetalle ?? 'sin dato' }, { label: 'Cuadra con la tabla', value: cuadra ? 'Sí' : 'No / sin dato' }, ...data.notas.map(value => ({ label: 'Nota', value }))],
      });
    } catch { setExportErr('No se ha podido generar el Excel. Puedes volver a intentarlo; no se ha cambiado ningún dato.'); }
    finally { setExp(false); }
  };
  return <div className="drawer-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer rentab-desglose" ref={panelRef} role="dialog" aria-modal="true" aria-label={`${TITULO[vista]} de ${sel.nombre}`} aria-busy={!data && !err}>
      <header className="dhead"><div><div className="eyebrow">{TITULO[vista]} · {monthLabel(month)}</div><h2>{sel.nombre}</h2></div>
        <div className="row"><button type="button" className="btn small" disabled={!data || exp} onClick={() => void exportar()}>{exp ? 'Exportando…' : 'Exportar a Excel'}</button><button type="button" className="btn small" ref={closeRef} onClick={onClose} aria-label="Cerrar">Cerrar ×</button></div></header>
      {err && <div className="note bad" role="alert">{err}</div>}
      {exportErr && <div className="note bad" role="alert">{exportErr}</div>}
      {!data && !err && <p className="muted" role="status">Cargando el detalle…</p>}
      {data && <>
        <p className="small muted rentab-foto">Foto v{data.snapshot?.version ?? 'sin dato'} · {data.snapshot?.kind ?? 'sin dato'} · sólo lectura. No recalcula el mes.</p>
        <div className={`dcheck ${cuadra ? 'ok' : 'warn'}`} role="status">
          {vista === 'contratos' ? <><b>{filas.length.toLocaleString('es-ES')}</b> contratos · la tabla indica {dato(tabla)}</> : <>Suma del detalle <b>{dinero(data.sumaDetalle)}</b> · cifra de la tabla <b>{dinero(tabla)}</b></>}
          {' · '}{cuadra ? 'Cuadra' : tabla == null ? 'Sin cifra disponible' : data.sumaDetalle == null ? 'Sin detalle disponible' : <>Diferencia {vista === 'contratos' ? dato(tabla - data.sumaDetalle) : dinero(tabla - data.sumaDetalle)}</>}
        </div>
        {!cuadra && tabla != null && <p className="small muted">No se fuerza el cuadre. Revisa las fuentes o vuelve a cargar la pantalla si los datos se han actualizado.</p>}
        <div className="tablewrap dtable" tabIndex={0} role="region" aria-label="Líneas del desglose; desplazar horizontalmente para ver todas las columnas"><table><thead><tr>
          {vista === 'facturado' && <><th>Fecha</th><th>Nº de factura</th><th>Concepto</th><th>Contrato</th>{sel.tipo === 'producto' && <th>Cliente</th>}<th className="n">Línea</th><th className="n">Este mes</th></>}
          {vista === 'coste' && <><th>Proveedor</th><th>Nº de factura</th><th>Fecha</th><th>Concepto</th>{sel.tipo === 'cliente' && <th>Contrato</th>}<th className="n">Total factura</th><th>Regla de reparto</th><th>Estado</th><th className="n">Asignado</th></>}
          {vista === 'contratos' && <><th>Nº</th>{sel.tipo === 'producto' && <th>Cliente</th>}<th>Tarifa</th><th className="n">Cuota</th><th>Periodicidad</th><th>Alta</th><th>Baja</th><th>Estado ISP</th><th className="n">Facturado</th></>}
        </tr></thead><tbody>
          {!filas.length && <tr><td colSpan={10} className="empty">No hay líneas para esta cifra. Sin dato documental; no se ha inventado ningún importe.</td></tr>}
          {vista === 'facturado' && filas.map((f, i) => <tr key={i} className={f.ajuste ? 'sub' : undefined}><td>{f.ajuste ? '' : dato(fechaEs(f.fecha))}</td><td>{f.factura ? dato(f.factura) : f.facturaNota ? <span className="muted small" title={f.facturaNota}>sin dato único</span> : f.ajuste ? '' : SD}</td><td className="concepto" title={f.concepto ?? ''}>{dato(f.concepto)}</td><td>{dato(f.contrato)}</td>{sel.tipo === 'producto' && <td>{dato(f.cliente)}</td>}<td className="n">{dinero(f.importeFactura)}{f.periodicidad && f.periodicidad !== 'Mensual' && <span className="muted small"> · {String(f.periodicidad).toLowerCase()}</span>}</td><td className="n">{dinero(f.importe)}</td></tr>)}
          {vista === 'coste' && filas.map((f, i) => <tr key={i}><td>{dato(f.proveedor)}</td><td>{dato(f.factura)}{!f.factura && f.origen && f.origen !== 'Factura de proveedor' && <span className="muted small rentab-origen">{f.origen}</span>}</td><td>{dato(fechaEs(f.fechaFactura))}</td><td className="concepto" title={f.concepto ?? ''}>{dato(f.concepto)}</td>{sel.tipo === 'cliente' && <td>{dato(f.contrato)}</td>}<td className="n">{dinero(f.totalFactura)}</td><td className="small">{dato(f.regla)}</td><td>{dato(DESGLOSE_COLUMNAS.coste.find(c => c.key === 'estado')?.value?.(f))}</td><td className="n">{dinero(f.importe)}{f.estado === 'ESTIMADO' && <Dot />}</td></tr>)}
          {vista === 'contratos' && filas.map((f, i) => <tr key={i}><td>{dato(f.contrato)}</td>{sel.tipo === 'producto' && <td>{dato(f.cliente)}</td>}<td>{dato(f.tarifa)}</td><td className="n">{dinero(f.cuota)}</td><td>{dato(f.periodicidad)}</td><td>{dato(fechaEs(f.alta))}</td><td>{dato(fechaEs(f.baja))}</td><td>{dato(f.estadoIsp)}</td><td className="n">{dinero(f.facturadoMes)}</td></tr>)}
          {vista === 'facturado' && !!filas.length && <tr className="tot"><td colSpan={sel.tipo === 'producto' ? 6 : 5}>Total</td><td className="n">{dinero(data.sumaDetalle)}</td></tr>}
          {vista === 'coste' && !!filas.length && <tr className="tot"><td colSpan={sel.tipo === 'cliente' ? 8 : 7}>Total</td><td className="n">{dinero(data.sumaDetalle)}</td></tr>}
        </tbody></table></div>
        <p className="small muted">Todas las columnas se conservan en Excel. En pantallas pequeñas, desliza la tabla para verlas.</p>
        {vista === 'facturado' && sinFactura > 0 && <p className="small muted">El nº de factura de venta no viene en las líneas de ISP: sólo se muestra cuando el cliente tiene una única factura ese día. En {sinFactura.toLocaleString('es-ES')} líneas no se ha encontrado y se indica «sin dato».</p>}
        {!!data.notas?.length && <details className="how" open={data.notas.length <= 2}><summary>Cómo leer este detalle</summary><ul>{data.notas.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
      </>}
    </aside></div>;
}
