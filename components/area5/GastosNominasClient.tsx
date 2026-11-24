'use client';
import { useCallback, useEffect, useState } from 'react';

type Tab = 'revisar' | 'cierre' | 'cuadre';
const eur = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const eurC = (c: number | null) => (c === null ? '—' : eur(c / 100));
const fecha = (s: string) => s.slice(0, 10).split('-').reverse().join('/');
const J = { 'Content-Type': 'application/json' };
const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const periodoHumano = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MESES[m]} ${y}`; };
const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const btn = 'min-h-10 rounded-lg px-3 text-sm font-medium disabled:opacity-50';
const inp = 'min-h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';

export default function GastosNominasClient() {
  const [tab, setTab] = useState<Tab>('revisar');
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900">Gastos del personal y nóminas</h1>
      <p className="mt-1 text-sm text-gray-500">Revisión de gastos, cierre mensual para la gestoría y cuadre con las nóminas. Solo David y Víctor.</p>
      <div role="tablist" className="mt-5 flex gap-1 border-b border-gray-200">
        {([['revisar', '1. Por revisar'], ['cierre', '2. Cierre mensual'], ['cuadre', '3. Cuadre con nóminas']] as [Tab, string][]).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-11 border-b-2 px-4 text-sm font-medium ${tab === k ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{t}</button>
        ))}
      </div>
      <div className="mt-5">{tab === 'revisar' ? <Revisar /> : tab === 'cierre' ? <Cierre /> : <Cuadre />}</div>
    </div>
  );
}

/* ------------------------------- 1. Revisión ------------------------------- */
interface G { id: string; empleadoId: string; empleadoNombre: string; tipo: string; fecha: string; concepto: string; comercio: string | null; cliente: string | null; proyecto: string | null; importe: number; tipoIva: number | null; importeIva: number | null; km: number | null; eurKm: number | null; estado: string; motivo: string | null; tieneAdjunto: boolean; cierreId: string | null; ocrEstado: string; propio: boolean }
function Revisar() {
  const [estado, setEstado] = useState('PENDIENTE');
  const [emp, setEmp] = useState('');
  const [d, setD] = useState<{ gastos: G[]; resumen: { estado: string; n: number }[]; empleados: { id: string; nombre: string }[] } | null>(null);
  const [err, setErr] = useState('');
  const [motivo, setMotivo] = useState<{ g: G; accion: 'rechazar' | 'aclaracion' } | null>(null);
  const [texto, setTexto] = useState('');
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/admin/area5-gastos?estado=${estado}${emp ? `&empleadoId=${emp}` : ''}`, { cache: 'no-store' });
    const j = await r.json(); if (!r.ok) { setErr(j.error || 'Error'); return; } setErr(''); setD(j);
  }, [estado, emp]);
  useEffect(() => { cargar(); }, [cargar]);
  async function decidir(g: G, accion: string, m?: string) {
    const r = await fetch(`/api/admin/area5-gastos/${g.id}`, { method: 'POST', headers: J, body: JSON.stringify({ accion, motivo: m }) });
    const j = await r.json(); if (!r.ok) { setErr(j.error || 'No se pudo'); return; }
    setMotivo(null); setTexto(''); cargar();
  }
  const n = (e: string) => d?.resumen.find(x => x.estado === e)?.n ?? 0;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Estado" className={inp} value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="PENDIENTE">Pendientes ({n('PENDIENTE')})</option><option value="ACLARACION">Con aclaración pedida ({n('ACLARACION')})</option>
          <option value="APROBADO">Aprobados ({n('APROBADO')})</option><option value="RECHAZADO">Rechazados ({n('RECHAZADO')})</option><option value="todos">Todos</option>
        </select>
        <select aria-label="Trabajador" className={inp} value={emp} onChange={e => setEmp(e.target.value)}><option value="">Todos los trabajadores</option>{d?.empleados.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      </div>
      {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="mt-4 space-y-2">
        {d?.gastos.length === 0 && <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No hay gastos en esta vista.</p>}
        {d?.gastos.map(g => (
          <article key={g.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{g.empleadoNombre} · {g.concepto}</p>
                <p className="mt-0.5 text-xs text-gray-500">{fecha(g.fecha)} · {g.tipo === 'KILOMETRAJE' ? `${g.km} km × ${g.eurKm} €/km` : [g.comercio, g.tipoIva !== null ? `IVA ${g.tipoIva}% (${eur(g.importeIva)})` : 'sin IVA'].filter(Boolean).join(' · ')}{(g.cliente || g.proyecto) && ` · ${[g.cliente, g.proyecto].filter(Boolean).join(' / ')}`}</p>
                {g.motivo && <p className="mt-1 text-xs text-violet-700">Nota: {g.motivo}</p>}
              </div>
              <div className="text-right"><p className="text-lg font-semibold">{eur(g.importe)}</p>{g.tieneAdjunto && <a className="text-xs font-medium text-orange-700 underline" href={`/api/empleado/mis-gastos/${g.id}/adjunto`} target="_blank" rel="noreferrer">Ver ticket</a>}</div>
            </div>
            {g.estado === 'PENDIENTE' && (g.propio ? <p className="mt-3 text-xs text-gray-500">Es tu propio gasto: lo revisa la otra persona.</p> : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={`${btn} bg-emerald-600 text-white`} onClick={() => decidir(g, 'aprobar')}>Aprobar</button>
                <button className={`${btn} border border-violet-300 text-violet-800`} onClick={() => { setMotivo({ g, accion: 'aclaracion' }); setTexto(''); }}>Pedir aclaración</button>
                <button className={`${btn} border border-red-300 text-red-700`} onClick={() => { setMotivo({ g, accion: 'rechazar' }); setTexto(''); }}>Rechazar</button>
              </div>))}
            {(g.estado === 'APROBADO' || g.estado === 'RECHAZADO') && !g.cierreId && !g.propio && <button className={`${btn} mt-3 text-gray-600 underline`} onClick={() => decidir(g, 'reabrir')}>Reabrir para revisar de nuevo</button>}
            {g.cierreId && <p className="mt-2 text-xs text-gray-500">Incluido en un cierre mensual.</p>}
          </article>
        ))}
      </div>
      {motivo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
          <h2 className="font-bold">{motivo.accion === 'rechazar' ? 'Motivo del rechazo' : 'Qué aclaración necesitas'}</h2>
          <textarea autoFocus rows={4} maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)} className={`${inp} mt-3 w-full py-2`} />
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} border`} onClick={() => setMotivo(null)}>Cancelar</button>
            <button disabled={texto.trim().length < 3} className={`${btn} bg-orange-600 text-white`} onClick={() => decidir(motivo.g, motivo.accion, texto)}>Enviar al trabajador</button></div>
        </section></div>
      )}
    </div>
  );
}

/* ----------------------------- 2. Cierre mensual ----------------------------- */
interface Trab { empleadoId: string; nombre: string; nif: string; n: number; total: number; km?: number; importeKm?: number; tickets?: number }
interface CierreFila { id: string; periodo: string; estado: string; n: number; total: number; creadoAt: string; enviadoAt: string | null }
interface CierreDet { id: string; periodo: string; estado: 'PREPARADO' | 'ENVIADO'; destinatario: string | null; asunto: string | null; cuerpo: string | null; enviadoAt: string | null; enviadoPor: string | null }
function Cierre() {
  const [periodo, setPeriodo] = useState(mesAnterior());
  const [lista, setLista] = useState<CierreFila[]>([]);
  const [prev, setPrev] = useState<{ candidatos: Trab[]; sinResolver: number; cierreId: string | null } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<{ cierre: CierreDet; trabajadores: Trab[] } | null>(null);
  const [b, setB] = useState({ destinatario: '', asunto: '', cuerpo: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const cargarLista = useCallback(async () => {
    const r = await fetch(`/api/admin/area5-gastos/cierres?preview=${periodo}`, { cache: 'no-store' }); const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Error'); return; } setErr(''); setLista(j.cierres); setPrev(j.preview);
  }, [periodo]);
  useEffect(() => { cargarLista(); }, [cargarLista]);
  const abrir = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/area5-gastos/cierres/${id}`, { cache: 'no-store' }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setSel(id); setDet(j); setB({ destinatario: j.cierre.destinatario || '', asunto: j.cierre.asunto || '', cuerpo: j.cierre.cuerpo || '' });
  }, []);
  async function cerrar() {
    if (!confirm(`¿Cerrar ${periodoHumano(periodo)}? Los gastos aprobados quedan congelados en este cierre.`)) return;
    const r = await fetch('/api/admin/area5-gastos/cierres', { method: 'POST', headers: J, body: JSON.stringify({ periodo }) }); const j = await r.json();
    if (!r.ok) { setErr(j.error || 'No se pudo cerrar'); return; } setErr(''); await cargarLista(); abrir(j.id);
  }
  async function patch(body: object, msg: string) {
    if (!sel) return; const r = await fetch(`/api/admin/area5-gastos/cierres/${sel}`, { method: 'PATCH', headers: J, body: JSON.stringify(body) }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setErr(''); setOk(msg); cargarLista(); abrir(sel);
  }
  async function deshacer() {
    if (!sel || !confirm('¿Deshacer este cierre? Los gastos vuelven a quedar como aprobados sin cerrar.')) return;
    const r = await fetch(`/api/admin/area5-gastos/cierres/${sel}`, { method: 'DELETE' }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setSel(null); setDet(null); cargarLista();
  }
  const mailto = `mailto:${encodeURIComponent(b.destinatario)}?subject=${encodeURIComponent(b.asunto)}&body=${encodeURIComponent(b.cuerpo)}`;
  const enviado = det?.cierre.estado === 'ENVIADO';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-gray-700">Mes a cerrar<input type="month" className={`${inp} mt-1 block`} value={periodo} onChange={e => { setPeriodo(e.target.value); setSel(null); setDet(null); setOk(''); }} /></label>
        {prev && !prev.cierreId && <button className={`${btn} bg-orange-600 text-white`} disabled={!prev.candidatos.length} onClick={cerrar}>Cerrar mes y preparar paquete</button>}
        {prev?.cierreId && <button className={`${btn} border`} onClick={() => abrir(prev.cierreId!)}>Ver el cierre de {periodoHumano(periodo)}</button>}
      </div>
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
      {prev && !prev.cierreId && (
        <section>
          <h2 className="font-semibold text-gray-900">Se incluirían ({prev.candidatos.length} {prev.candidatos.length === 1 ? 'trabajador' : 'trabajadores'})</h2>
          {prev.sinResolver > 0 && <p className="mt-1 text-sm text-amber-700">Hay {prev.sinResolver} gasto(s) aún por revisar o aclarar hasta ese mes: quedarían fuera de este cierre.</p>}
          <TablaTrab filas={prev.candidatos} />
        </section>
      )}
      {det && sel && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900">Cierre de {periodoHumano(det.cierre.periodo)} · <span className={enviado ? 'text-emerald-700' : 'text-amber-700'}>{enviado ? `marcado como enviado${det.cierre.enviadoPor ? ' por ' + det.cierre.enviadoPor : ''}` : 'preparado (sin enviar)'}</span></h2>
            <a className={`${btn} border leading-10`} href={`/api/admin/area5-gastos/cierres/${sel}/paquete?formato=excel`}>Excel completo</a>
          </div>
          <TablaTrab filas={det.trabajadores} acciones={t => (<span className="flex gap-3"><a className="text-orange-700 underline" href={`/api/admin/area5-gastos/cierres/${sel}/paquete?formato=excel&empleadoId=${t.empleadoId}`}>Excel</a><a className="text-orange-700 underline" href={`/api/admin/area5-gastos/cierres/${sel}/paquete?formato=pdf&empleadoId=${t.empleadoId}`}>PDF con tickets</a></span>)} />
          <div className="rounded-lg bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Borrador para la gestoría <span className="font-normal text-gray-500">(el panel no envía nada: tú lo envías y adjuntas los ficheros)</span></h3>
            <input aria-label="Correo de la gestoría" placeholder="Correo de la gestoría" disabled={enviado} className={`${inp} mt-3 w-full`} value={b.destinatario} onChange={e => setB({ ...b, destinatario: e.target.value })} />
            <input aria-label="Asunto" disabled={enviado} className={`${inp} mt-2 w-full`} value={b.asunto} onChange={e => setB({ ...b, asunto: e.target.value })} />
            <textarea aria-label="Texto" rows={10} disabled={enviado} className={`${inp} mt-2 w-full py-2`} value={b.cuerpo} onChange={e => setB({ ...b, cuerpo: e.target.value })} />
            {!enviado && (<div className="mt-3 flex flex-wrap gap-2">
              <button className={`${btn} border`} onClick={() => patch({ accion: 'borrador', ...b }, 'Borrador guardado.')}>Guardar borrador</button>
              <button className={`${btn} border`} onClick={() => navigator.clipboard?.writeText(`${b.asunto}\n\n${b.cuerpo}`).then(() => setOk('Texto copiado.'))}>Copiar texto</button>
              <a className={`${btn} border leading-10`} href={mailto}>Abrir en mi correo</a>
              <button className={`${btn} bg-emerald-600 text-white`} onClick={() => confirm('¿Confirmas que YA has enviado este paquete a la gestoría?') && patch({ accion: 'marcar_enviado' }, 'Cierre marcado como enviado.')}>Ya lo he enviado</button>
              <button className={`${btn} ml-auto text-red-600`} onClick={deshacer}>Deshacer cierre</button>
            </div>)}
          </div>
        </section>
      )}
      {lista.length > 0 && (
        <section><h2 className="font-semibold text-gray-900">Cierres anteriores</h2>
          <ul className="mt-2 divide-y rounded-xl border bg-white">{lista.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span>{periodoHumano(c.periodo)} · {c.n} gastos · {eur(c.total)} · {c.estado === 'ENVIADO' ? `enviado ${c.enviadoAt ? fecha(c.enviadoAt) : ''}` : 'sin enviar'}</span>
              <button className="text-orange-700 underline" onClick={() => abrir(c.id)}>Abrir</button></li>))}</ul></section>
      )}
    </div>
  );
}
function TablaTrab({ filas, acciones }: { filas: Trab[]; acciones?: (t: Trab) => React.ReactNode }) {
  const tot = filas.reduce((s, f) => s + Math.round(f.total * 100), 0) / 100;
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Trabajador</th><th className="px-3 py-2 text-right">Gastos</th><th className="px-3 py-2 text-right">Total</th>{acciones && <th className="px-3 py-2">Descargas</th>}</tr></thead>
        <tbody className="divide-y">{filas.map(f => <tr key={f.empleadoId}><td className="px-3 py-2">{f.nombre}</td><td className="px-3 py-2 text-right">{f.n}</td><td className="px-3 py-2 text-right font-medium">{eur(f.total)}</td>{acciones && <td className="px-3 py-2">{acciones(f)}</td>}</tr>)}
          {!filas.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">No hay gastos aprobados pendientes de cerrar.</td></tr>}</tbody>
        {filas.length > 0 && <tfoot className="bg-gray-50 font-semibold"><tr><td className="px-3 py-2">Total</td><td /><td className="px-3 py-2 text-right">{eur(tot)}</td>{acciones && <td />}</tr></tfoot>}</table>
    </div>
  );
}

/* ------------------------------ 3. Cuadre nóminas ------------------------------ */
interface Fila { empleadoId: string; nombre: string; estado: string; aprobadoCents: number; numGastos: number; nominaCents: number | null; diferenciaCents: number | null; kmAprobadoCents: number; kmNominaCents: number | null; mensaje: string; fuente: string; conceptos: { codigo: string; concepto: string; importeCents: number; esGasto: boolean; dudoso: boolean }[] }
const BADGE: Record<string, string> = { CUADRA: 'bg-emerald-100 text-emerald-800', DIFERENCIA: 'bg-red-100 text-red-800', SIN_NOMINA: 'bg-gray-100 text-gray-700', SIN_DESGLOSE: 'bg-amber-100 text-amber-800', REVISAR: 'bg-amber-100 text-amber-800' };
const ETQ: Record<string, string> = { CUADRA: 'Cuadra', DIFERENCIA: 'Diferencia', SIN_NOMINA: 'Sin nómina', SIN_DESGLOSE: 'Sin desglose', REVISAR: 'Revisar' };
function Cuadre() {
  const [periodo, setPeriodo] = useState(mesAnterior());
  const [d, setD] = useState<{ cierre: { estado: string } | null; filas: Fila[]; nominasCargadas: number; resumen: { cuadran: number; diferencias: number; pendientes: number } } | null>(null);
  const [err, setErr] = useState(''); const [imp, setImp] = useState<{ archivo: string; ok: boolean; trabajador?: string; conceptos?: number; dudosos?: number; error?: string }[] | null>(null);
  const [busy, setBusy] = useState(false); const [abierta, setAbierta] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/admin/area5-gastos/nominas?periodo=${periodo}`, { cache: 'no-store' }); const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Error'); return; } setErr(''); setD(j);
  }, [periodo]);
  useEffect(() => { cargar(); }, [cargar]);
  async function importar(files: FileList | null) {
    if (!files?.length) return; setBusy(true); setImp(null);
    const fd = new FormData(); fd.append('periodo', periodo); Array.from(files).forEach(f => fd.append('files', f));
    const r = await fetch('/api/admin/area5-gastos/nominas', { method: 'POST', body: fd }); const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error || 'No se pudo importar'); return; } setImp(j.resultados); cargar();
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-gray-700">Mes de la nómina<input type="month" className={`${inp} mt-1 block`} value={periodo} onChange={e => { setPeriodo(e.target.value); setImp(null); }} /></label>
        <label className={`${btn} cursor-pointer border leading-10`}>{busy ? 'Leyendo…' : 'Subir nóminas individuales (PDF)'}<input type="file" accept="application/pdf" multiple className="hidden" disabled={busy} onChange={e => { importar(e.target.files); e.target.value = ''; }} /></label>
      </div>
      <p className="text-xs text-gray-500">La importación general de nóminas sigue en «Importar Nóminas». Aquí solo se leen los conceptos de gasto de cada nómina individual para cuadrarlos con lo aprobado. Nóminas del mes ya cargadas: {d?.nominasCargadas ?? '…'}.</p>
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {imp && <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">{imp.map((r, i) => <li key={i} className={r.ok ? 'text-emerald-800' : 'text-red-700'}>{r.archivo}: {r.ok ? `${r.trabajador} · ${r.conceptos} concepto(s) de gasto${r.dudosos ? `, ${r.dudosos} dudoso(s)` : ''}` : r.error}</li>)}</ul>}
      {d && !d.cierre && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No hay cierre de {periodoHumano(periodo)}: no hay gastos aprobados con los que cuadrar. Haz antes el cierre mensual.</p>}
      {d && d.filas.length > 0 && (<>
        <p className="text-sm text-gray-700"><strong>{d.resumen.cuadran}</strong> cuadran · <strong className="text-red-700">{d.resumen.diferencias}</strong> con diferencia · <strong>{d.resumen.pendientes}</strong> pendientes de nómina o desglose</p>
        <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Trabajador</th><th className="px-3 py-2 text-right">Aprobado</th><th className="px-3 py-2 text-right">En nómina</th><th className="px-3 py-2 text-right">Diferencia</th><th className="px-3 py-2">Estado</th></tr></thead>
          <tbody className="divide-y">{d.filas.map(f => (<>
            <tr key={f.empleadoId} className="cursor-pointer hover:bg-gray-50" onClick={() => setAbierta(abierta === f.empleadoId ? null : f.empleadoId)}>
              <td className="px-3 py-2">{f.nombre}<span className="ml-2 text-xs text-gray-400">{f.numGastos} gastos</span></td><td className="px-3 py-2 text-right">{eurC(f.aprobadoCents)}</td><td className="px-3 py-2 text-right">{eurC(f.nominaCents)}</td>
              <td className={`px-3 py-2 text-right font-medium ${f.diferenciaCents ? 'text-red-700' : ''}`}>{eurC(f.diferenciaCents)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[f.estado]}`}>{ETQ[f.estado]}</span></td></tr>
            {abierta === f.empleadoId && <tr key={f.empleadoId + 'd'} className="bg-gray-50"><td colSpan={5} className="px-4 py-3 text-xs text-gray-700"><p className="font-medium">{f.mensaje}</p>
              {f.kmNominaCents !== null && <p className="mt-1">Kilometraje: aprobado {eurC(f.kmAprobadoCents)} · en nómina {eurC(f.kmNominaCents)}</p>}
              {f.conceptos.length > 0 && <ul className="mt-1">{f.conceptos.map((c, i) => <li key={i}>{c.codigo} · {c.concepto}: {c.dudoso ? 'importe ambiguo' : eurC(c.importeCents)}</li>)}</ul>}
              {f.fuente === 'TOTAL_NOMINA' && <p className="mt-1 text-gray-500">Comparado con el total de reintegros de la nómina importada (sin desglose por concepto).</p>}</td></tr>}
          </>))}</tbody></table></div></>)}
      {d && d.cierre && d.filas.length === 0 && <p className="text-sm text-gray-500">Sin trabajadores que cuadrar este mes.</p>}
    </div>
  );
}
