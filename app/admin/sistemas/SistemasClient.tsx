'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { eur } from '../subida-precios/fmt';
import { EvolucionCostes, Leyenda } from './charts';

type Servicio = { id: string; slug: string; nombre: string; proveedor: string; categoria: string; descripcion: string | null; modulos: string[]; entornos: string[]; titular: string | null; responsable: string | null; plan: string | null; estado: string; fechaAlta: string | null; fechaRenovacion: string | null; periodicidad: string; variablesEsperadas: string[]; url: string | null; notas: string | null; estadoManual: string | null; estadoManualAt: string | null; prevision2027Manual: number | null; descartadoAt?: string | null; descartadoMotivo?: string | null; tipoPago?: string; costeEstimadoMensual?: number | null; costeEstimadoNota?: string | null };
type CosteMes = { facturado: number; sinFactura: number; manual: number; estimado?: number; total: number; nFacturas: number; nSinFactura: number };
type CosteSrv = { servicioId: string; slug: string; nombre: string; estado: string; periodicidad: string; meses: Record<string, CosteMes>; totalAnio: number; totalFacturado: number; totalSinFactura: number; totalManual: number; totalEstimado?: number; tipoPago?: string; estimadoMensual?: number | null; runRateMensual: number; anualizado: number; prevision2027: number; previsionOrigen: string; ultimaFactura: string | null; ultimoCargo: string | null; nFacturas: number; nSinFactura: number };
type Costes = { desde: string; hasta: string; mesActual: string; mesesCerrados: string[]; meses: string[]; servicios: CosteSrv[]; totalesMes: Record<string, number>; totalAnio: number; totalAnualizado: number; previsionTotal2027: number; subidaPct: number; pagosUnicos: { id: string; slug: string; nombre: string; fecha: string | null; concepto: string; base: number; iva: number; total: number; estado: string; moneda: string; importeOriginal: number }[]; totalPagosUnicosReales: number; totalPagosUnicosPrevistos: number; cargosSinFactura: { movId: string; fecha: string; importe: number; concepto: string; slug: string; nombre: string; tarjeta: boolean }[]; totalSinFactura: number; avisos: string[]; facturasSinServicio: { proveedor: string; n: number; base: number }[] };
type Conector<T> = { estado: 'ok' | 'no_conectado' | 'error'; motivo?: string; variables?: string[]; datos?: T; leidoAt: string };
type Vivo = { leidoAt: string; entornoActual: string; region: string | null; vercel: Conector<any>; github: Conector<any>; railway: Conector<any>; bd: Conector<any>; variables: { slug: string; nombre: string; variables: { nombre: string; configurada: boolean }[] }[]; pendientes: string[]; envPorEntorno: Record<string, string[]> | null; faltanEnProduccion: { servicio: string; variable: string }[] | null };
type Incidencia = { id: string; fechaHora: string; tipo: 'INCIDENCIA' | 'DECISION'; titulo: string; detalle: string | null; servicio: string | null; slug: string | null; autor: string | null };

const CATEGORIAS: Record<string, string> = { web_infraestructura: 'Web e infraestructura', base_datos: 'Base de datos', desarrollo_ia: 'Desarrollo e IA', marketing: 'Marketing', ofimatica: 'Ofimática', crm: 'CRM', operaciones_isp: 'Operaciones / ISP' };
const ESTADOS: Record<string, { t: string; c: string }> = { activo: { t: 'Activo', c: 'bg-green-100 text-green-800' }, en_prueba: { t: 'En prueba / en pausa', c: 'bg-amber-100 text-amber-800' }, en_baja: { t: 'En baja', c: 'bg-gray-200 text-gray-700' }, por_confirmar: { t: 'Por confirmar', c: 'bg-yellow-100 text-yellow-800' } };
const ENT: Record<string, string> = { produccion: 'Producción', staging: 'Staging' };
const PERIOD: Record<string, string> = { MENSUAL: 'Mensual', ANUAL: 'Anual', VARIABLE: 'Variable' };
const ORIGEN: Record<string, string> = { MANUAL: 'previsión manual', RITMO_3_MESES: 'ritmo de los últimos 3 meses ×12', TOTAL_ANUAL: 'lo pagado en el año', EN_BAJA: 'en baja' };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = (m: string) => `${MES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const fFecha = (s: string | null) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—');
const fFechaHora = (s: string) => fFecha(s.slice(0, 10)) + ' ' + s.slice(11, 16);
const inp = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none';
const btn = 'rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50';
const btn2 = 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50';

async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j as T;
}
const Badge = ({ e, descartado }: { e: string; descartado?: boolean }) => descartado ? <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Descartado</span> : <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ESTADOS[e]?.c ?? 'bg-gray-100'}`}>{ESTADOS[e]?.t ?? e}</span>;

export default function SistemasClient({ migracionLista }: { migracionLista: boolean }) {
  const [tab, setTab] = useState<'inventario' | 'estado' | 'costes' | 'incidencias'>('inventario');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [costes, setCostes] = useState<Costes | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const [desde, setDesde] = useState(`${new Date().getFullYear()}-01`);
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 7));
  const [subida, setSubida] = useState(0);
  const avisa = (t: 'ok' | 'err', s: string) => { setMsg({ t, s }); setTimeout(() => setMsg(null), 6000); };

  const cargarServicios = useCallback(async () => { try { setServicios((await api<{ servicios: Servicio[] }>('/api/admin/sistemas/servicios')).servicios); } catch (e: any) { avisa('err', e.message); } }, []);
  const cargarCostes = useCallback(async () => { try { setCostes(await api<Costes>(`/api/admin/sistemas/costes?desde=${desde}&hasta=${hasta}&subida=${subida}`)); } catch (e: any) { avisa('err', e.message); } }, [desde, hasta, subida]);
  useEffect(() => { if (migracionLista) { cargarServicios(); } }, [migracionLista, cargarServicios]);
  useEffect(() => { if (migracionLista) { const t = setTimeout(cargarCostes, 250); return () => clearTimeout(t); } }, [migracionLista, cargarCostes]);

  if (!migracionLista) return (<div className="p-6"><h1 className="text-2xl font-bold">Sistemas y servicios</h1><div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Falta aplicar la migración <code>20261127_area9_sistemas_servicios</code> en esta base de datos. La pantalla se activa sola cuando exista.</div></div>);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold text-gray-900">Sistemas y servicios</h1><p className="text-sm text-gray-600">Todo el software de Internet Operadores: qué hace, cómo está y cuánto cuesta. Solo superadmin. Aquí no se guardan contraseñas ni tokens.</p></div>
        {costes && <div className="text-right text-sm"><div className="text-gray-500">Coste {desde.slice(0, 4)} hasta {mesCorto(costes.meses[costes.meses.length - 1])}</div><div className="text-xl font-bold">{eur(costes.totalAnio)}</div></div>}
      </div>
      {msg && <div className={`rounded border p-2 text-sm ${msg.t === 'ok' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>{msg.s}</div>}
      <div className="flex gap-1 border-b border-gray-200">
        {([['inventario', 'Inventario'], ['estado', 'Estado técnico'], ['costes', 'Costes'], ['incidencias', 'Incidencias y decisiones']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-orange-600 text-orange-700' : 'text-gray-600 hover:text-gray-900'}`}>{t}</button>))}
      </div>
      {tab === 'inventario' && <Inventario servicios={servicios} costes={costes} recargar={cargarServicios} avisa={avisa} />}
      {tab === 'estado' && <Estado servicios={servicios} recargar={cargarServicios} avisa={avisa} />}
      {tab === 'costes' && <CostesVista servicios={servicios} costes={costes} desde={desde} hasta={hasta} subida={subida} setDesde={setDesde} setHasta={setHasta} setSubida={setSubida} recargar={cargarCostes} avisa={avisa} />}
      {tab === 'incidencias' && <Incidencias servicios={servicios} avisa={avisa} />}
    </div>
  );
}

/* ------------------------------ INVENTARIO ------------------------------ */
function Inventario({ servicios, costes, recargar, avisa }: { servicios: Servicio[]; costes: Costes | null; recargar: () => void; avisa: (t: 'ok' | 'err', s: string) => void }) {
  const [sel, setSel] = useState<Servicio | null>(null);
  const [filtro, setFiltro] = useState('');
  const porSlug = useMemo(() => Object.fromEntries((costes?.servicios ?? []).map(c => [c.slug, c])), [costes]);
  const grupos = useMemo(() => { const g: Record<string, Servicio[]> = {}; for (const s of servicios) if (!filtro || s.estado === filtro) (g[s.categoria] ??= []).push(s); return g; }, [servicios, filtro]);
  const resumen = useMemo(() => Object.keys(ESTADOS).map(k => [k, servicios.filter(s => s.estado === k).length] as const), [servicios]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className={filtro === '' ? btn : btn2} onClick={() => setFiltro('')}>Todos ({servicios.length})</button>
        {resumen.map(([k, n]) => <button key={k} className={filtro === k ? btn : btn2} onClick={() => setFiltro(k)}>{ESTADOS[k].t} ({n})</button>)}
        <span className="text-gray-500">Los servicios «por confirmar» se rellenan desde la ficha: titular, plan y renovación.</span>
      </div>
      {Object.entries(CATEGORIAS).map(([cat, nombre]) => grupos[cat]?.length ? (
        <div key={cat} className="overflow-x-auto rounded border border-gray-200 bg-white">
          <div className="border-b bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700">{nombre}</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-1.5">Servicio</th><th>Para qué se usa</th><th>Entorno</th><th>Estado</th><th>Renovación</th><th className="text-right">Coste año</th><th className="pr-3 text-right">Última factura</th></tr></thead>
            <tbody>{grupos[cat].map(s => { const c = porSlug[s.slug]; return (
              <tr key={s.id} className="cursor-pointer border-t hover:bg-orange-50" onClick={() => setSel(s)}>
                <td className="px-3 py-2 font-medium">{s.nombre}<div className="text-xs font-normal text-gray-500">{s.proveedor}</div></td>
                <td className="max-w-md py-2 pr-2 text-gray-700"><span className="line-clamp-2">{s.descripcion}</span></td>
                <td className="py-2">{s.entornos.map(e => ENT[e]).join(' · ') || '—'}</td>
                <td className="py-2"><Badge e={s.estado} descartado={!!s.descartadoAt} /></td>
                <td className="py-2">{fFecha(s.fechaRenovacion)}</td>
                <td className="py-2 text-right tabular-nums">{c ? (c.totalAnio > 0 ? <span title={c.totalEstimado ? `Incluye ${eur(c.totalEstimado, 2)} estimados (cargo de tarjeta sin factura)` : undefined}>{eur(c.totalAnio)}{c.totalEstimado ? <span className="ml-1 rounded bg-yellow-100 px-1 text-xs text-yellow-900">estimado</span> : null}</span> : s.tipoPago === 'INCLUIDO' ? <span className="text-gray-400">incluido, sin coste propio</span> : s.descartadoAt ? <span className="text-gray-400">descartado</span> : <span className="text-gray-400">sin coste</span>) : '…'}</td>
                <td className="py-2 pr-3 text-right text-gray-600">{s.tipoPago === 'TARJETA_SIN_FACTURA' ? <span className="rounded bg-yellow-100 px-1 text-xs text-yellow-900" title={s.costeEstimadoNota ?? ''}>cargo de tarjeta sin factura</span> : c?.ultimaFactura ? fFecha(c.ultimaFactura) : c?.ultimoCargo ? <span className="text-amber-700">cargo {fFecha(c.ultimoCargo)}</span> : '—'}</td>
              </tr>); })}</tbody>
          </table>
        </div>) : null)}
      {sel && <Ficha s={sel} c={porSlug[sel.slug]} cerrar={() => setSel(null)} guardado={() => { setSel(null); recargar(); }} avisa={avisa} />}
    </div>
  );
}

function Ficha({ s, c, cerrar, guardado, avisa }: { s: Servicio; c?: CosteSrv; cerrar: () => void; guardado: () => void; avisa: (t: 'ok' | 'err', m: string) => void }) {
  const [f, setF] = useState({ titular: s.titular ?? '', responsable: s.responsable ?? '', plan: s.plan ?? '', estado: s.estado, fechaAlta: s.fechaAlta ?? '', fechaRenovacion: s.fechaRenovacion ?? '', periodicidad: s.periodicidad, url: s.url ?? '', notas: s.notas ?? '', prev: s.prevision2027Manual == null ? '' : String(s.prevision2027Manual), tipoPago: s.tipoPago ?? 'FACTURA', estMes: s.costeEstimadoMensual == null ? '' : String(s.costeEstimadoMensual), estNota: s.costeEstimadoNota ?? '', descMotivo: s.descartadoMotivo ?? '' });
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      await api('/api/admin/sistemas/servicios', 'PATCH', { id: s.id, titular: f.titular || null, responsable: f.responsable || null, plan: f.plan || null, estado: f.estado, fechaAlta: f.fechaAlta || null, fechaRenovacion: f.fechaRenovacion || null, periodicidad: f.periodicidad, url: f.url || null, notas: f.notas || null, prevision2027Manual: f.prev === '' ? null : Number(f.prev.replace(',', '.')), tipoPago: f.tipoPago, costeEstimadoMensual: f.estMes === '' ? null : Number(f.estMes.replace(',', '.')), costeEstimadoNota: f.estNota || null });
      avisa('ok', `${s.nombre} guardado.`); guardado();
    } catch (e: any) { avisa('err', e.message); } finally { setGuardando(false); }
  };
  const F = ({ l, children }: { l: string; children: React.ReactNode }) => <label className="block text-xs font-medium text-gray-600">{l}<div className="mt-0.5">{children}</div></label>;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={cerrar}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">{s.nombre}</h2><div className="text-sm text-gray-500">{s.proveedor} · {CATEGORIAS[s.categoria]}</div></div><button className={btn2} onClick={cerrar}>Cerrar</button></div>
        <p className="mt-3 text-sm text-gray-700">{s.descripcion}</p>
        <div className="mt-3 text-sm"><span className="font-medium">Módulos del panel que dependen de él: </span>{s.modulos.length ? s.modulos.join(', ') : 'ninguno'}</div>
        <div className="mt-1 text-sm"><span className="font-medium">Variables de entorno esperadas: </span>{s.variablesEsperadas.length ? s.variablesEsperadas.map(v => <code key={v} className="mr-1 rounded bg-gray-100 px-1">{v}</code>) : 'ninguna'}</div>
        {c && <div className="mt-3 rounded bg-gray-50 p-3 text-sm"><div>Coste del periodo: <b>{eur(c.totalAnio, 2)}</b> ({c.nFacturas} facturas{c.nSinFactura ? `, ${c.nSinFactura} cargos sin factura` : ''}). Previsión 2027: <b>{eur(c.prevision2027)}</b> <span className="text-gray-500">({ORIGEN[c.previsionOrigen]})</span></div></div>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <F l="Titular de la cuenta"><input className={inp} value={f.titular} onChange={e => setF({ ...f, titular: e.target.value })} placeholder="Persona o sociedad" /></F>
          <F l="Responsable de la cuenta"><input className={inp} value={f.responsable} onChange={e => setF({ ...f, responsable: e.target.value })} placeholder="Quién la gestiona" /></F>
          <F l="Plan"><input className={inp} value={f.plan} onChange={e => setF({ ...f, plan: e.target.value })} placeholder="Ej. Pro, 5 usuarios" /></F>
          <F l="Estado"><select className={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></F>
          <F l="Fecha de alta"><input type="date" className={inp} value={f.fechaAlta} onChange={e => setF({ ...f, fechaAlta: e.target.value })} /></F>
          <F l="Próxima renovación"><input type="date" className={inp} value={f.fechaRenovacion} onChange={e => setF({ ...f, fechaRenovacion: e.target.value })} /></F>
          <F l="Periodicidad del pago"><select className={inp} value={f.periodicidad} onChange={e => setF({ ...f, periodicidad: e.target.value })}>{Object.entries(PERIOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
          <F l="Previsión 2027 manual (€, opcional)"><input className={inp} value={f.prev} onChange={e => setF({ ...f, prev: e.target.value })} placeholder="Vacío = automática" /></F>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <F l="Cómo se paga"><select className={inp} value={f.tipoPago} onChange={e => setF({ ...f, tipoPago: e.target.value })}><option value="FACTURA">Con factura en el panel</option><option value="TARJETA_SIN_FACTURA">Cargo de tarjeta sin factura</option><option value="INCLUIDO">Incluido, sin coste propio</option></select></F>
          <F l="Importe estimado al mes (€, sin factura)"><input className={inp} value={f.estMes} onChange={e => setF({ ...f, estMes: e.target.value })} placeholder="Solo si se paga con tarjeta" /></F>
        </div>
        {f.tipoPago === 'TARJETA_SIN_FACTURA' && <div className="mt-2"><F l="De dónde sale el estimado (aviso)"><textarea className={inp} rows={2} value={f.estNota} onChange={e => setF({ ...f, estNota: e.target.value })} /></F><p className="mt-1 rounded bg-yellow-50 p-2 text-xs text-yellow-900">Cada mes cerrado sin factura ni cargo identificado suma este importe en amarillo. En cuanto llegue la factura o se identifique el cargo del banco, deja de usarse el estimado.</p></div>}
        {s.descartadoAt && <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">Descartado el {fFecha(s.descartadoAt)}{s.descartadoMotivo ? `: ${s.descartadoMotivo}` : ''}</div>}
        <div className="mt-3"><F l="Dirección (URL pública del servicio)"><input className={inp} value={f.url} onChange={e => setF({ ...f, url: e.target.value })} /></F></div>
        <div className="mt-3"><F l="Notas (sin contraseñas ni tokens)"><textarea className={inp} rows={3} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></F></div>
        <div className="mt-4 flex justify-end gap-2"><button className={btn2} onClick={cerrar}>Cancelar</button><button className={btn} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
      </div>
    </div>
  );
}

/* ------------------------------ ESTADO TÉCNICO ------------------------------ */
function Tarjeta({ titulo, c, children, slug, servicios, recargar, avisa }: { titulo: string; c: Conector<any> | undefined; children?: React.ReactNode; slug: string; servicios: Servicio[]; recargar: () => void; avisa: (t: 'ok' | 'err', s: string) => void }) {
  const s = servicios.find(x => x.slug === slug); const [txt, setTxt] = useState(s?.estadoManual ?? '');
  useEffect(() => setTxt(s?.estadoManual ?? ''), [s?.estadoManual]);
  const guardar = async () => { if (!s) return; try { await api('/api/admin/sistemas/servicios', 'PATCH', { id: s.id, estadoManual: txt || null }); avisa('ok', 'Estado manual guardado.'); recargar(); } catch (e: any) { avisa('err', e.message); } };
  const color = !c ? 'bg-gray-300' : c.estado === 'ok' ? 'bg-green-500' : c.estado === 'error' ? 'bg-red-500' : 'bg-amber-400';
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><h3 className="font-semibold">{titulo}</h3><span className="text-xs text-gray-500">{!c ? 'leyendo…' : c.estado === 'ok' ? 'conectado' : c.estado === 'error' ? 'error de lectura' : 'no conectado'}</span></div>
      {c?.estado === 'ok' && children}
      {c && c.estado !== 'ok' && (<div className="space-y-2 text-sm">
        <p className={c.estado === 'error' ? 'text-red-700' : 'text-amber-800'}>{c.motivo}</p>
        {c.variables && <p className="text-xs text-gray-500">Variables que faltan en el entorno: {c.variables.map(v => <code key={v} className="mr-1 rounded bg-gray-100 px-1">{v}</code>)}</p>}
        {s && (<div><label className="text-xs font-medium text-gray-600">Estado a mano {s.estadoManualAt ? `(anotado el ${fFechaHora(s.estadoManualAt)})` : ''}</label>
          <textarea className={inp} rows={2} value={txt} onChange={e => setTxt(e.target.value)} placeholder="Ej. Producción en 7cea5911, sin incidencias" /><div className="mt-1 text-right"><button className={btn2} onClick={guardar}>Guardar estado manual</button></div></div>)}
      </div>)}
    </div>
  );
}
function Estado({ servicios, recargar, avisa }: { servicios: Servicio[]; recargar: () => void; avisa: (t: 'ok' | 'err', s: string) => void }) {
  const [v, setV] = useState<Vivo | null>(null); const [cargando, setCargando] = useState(false);
  const leer = useCallback(async () => { setCargando(true); try { setV(await api<Vivo>('/api/admin/sistemas/estado-vivo')); } catch (e: any) { avisa('err', e.message); } finally { setCargando(false); } }, [avisa]);
  useEffect(() => { leer(); }, [leer]);
  const p = { servicios, recargar, avisa };
  const dep = (d: any, t: string) => d ? (<div className="text-sm"><div className="font-medium">{t}</div><div className="text-gray-700"><code>{d.sha}</code> · rama <code>{d.rama}</code> · {d.estado}</div><div className="text-xs text-gray-500">{fFechaHora(d.fecha)} · {d.mensaje}</div></div>) : <div className="text-sm text-gray-500">{t}: sin despliegue listo.</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm"><div className="text-gray-600">Solo lectura. Entorno que sirve esta página: <b>{v?.entornoActual ?? '…'}</b>{v?.region ? ` · región de las funciones: ${v.region}` : ''}. {v && `Leído a las ${fFechaHora(v.leidoAt.replace('Z', ''))} UTC.`}</div><button className={btn2} disabled={cargando} onClick={leer}>{cargando ? 'Leyendo…' : 'Volver a leer'}</button></div>
      {v?.vercel.estado === 'ok' && v.vercel.datos.produccionCoincideConMain === false && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Producción ({v.vercel.datos.produccion?.sha}) no coincide con main ({v.vercel.datos.mainSha}). Hoy se publica desde la rama staging, así que main puede ir por detrás: confirma que es lo esperado.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <Tarjeta titulo="Vercel · despliegues" c={v?.vercel} slug="vercel" {...p}>{v && <div className="space-y-2">{dep(v.vercel.datos.produccion, 'Producción')}{dep(v.vercel.datos.staging, 'Staging')}</div>}</Tarjeta>
        <Tarjeta titulo="GitHub · tareas programadas y workflows" c={v?.github} slug="github" {...p}>{v && (<div className="space-y-2 text-sm"><div>main: <code>{v.github.datos.mainSha}</code> <span className="text-gray-500">{v.github.datos.mainMensaje}</span></div>
          <div className="font-medium">Workflows</div>{v.github.datos.workflows.map((w: any) => <div key={w.nombre} className="flex justify-between text-gray-700"><span>{w.nombre}</span><span className="text-gray-500">{w.resultado ?? 'sin ejecuciones'} {w.ultimaEjecucion ? fFechaHora(w.ultimaEjecucion.slice(0, 16)) : ''}</span></div>)}
          <div className="font-medium">Ramas de área</div><div className="text-gray-600">{v.github.datos.ramasArea.join(' · ')}</div></div>)}</Tarjeta>
        <Tarjeta titulo="Railway · servicios y bases" c={v?.railway} slug="railway" {...p}>{v && v.railway.datos.proyectos.map((pr: any) => (<div key={pr.nombre} className="mb-2 text-sm"><div className="font-medium">{pr.nombre} <span className="font-normal text-gray-500">({pr.entornos.join(', ')})</span></div>{pr.servicios.map((s: any) => <div key={s.nombre} className="flex justify-between text-gray-700"><span>{s.nombre}</span><span className="text-gray-500">{s.ultimoDespliegue ?? '—'}</span></div>)}</div>))}</Tarjeta>
        <Tarjeta titulo="Salud de la base de datos" c={v?.bd} slug="railway" {...p}>{v && (() => { const d = v.bd.datos; return (<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm"><dt className="text-gray-500">Base</dt><dd>{d.baseDatos}</dd><dt className="text-gray-500">Latencia de una consulta</dt><dd className={d.latenciaMs > 300 ? 'font-medium text-amber-700' : ''}>{d.latenciaMs} ms</dd><dt className="text-gray-500">Tamaño</dt><dd>{d.tamanoMb} MB</dd><dt className="text-gray-500">Conexiones</dt><dd className={d.conexiones / d.maxConexiones > 0.8 ? 'font-medium text-red-700' : ''}>{d.conexiones} de {d.maxConexiones}</dd><dt className="text-gray-500">Tablas</dt><dd>{d.tablas}</dd><dt className="text-gray-500">Migraciones aplicadas</dt><dd>{d.migracionesAplicadas}<div className="text-xs text-gray-500">{d.ultimaMigracion}</div></dd><dt className="text-gray-500">PostgreSQL</dt><dd>{d.versionPg}</dd></dl>); })()}</Tarjeta>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <h3 className="mb-2 font-semibold">Tareas programadas (cron de Vercel)</h3>
        <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th>Ruta</th><th>Programación (UTC)</th></tr></thead><tbody>{(v?.github.datos?.crons ?? []).map((c: any) => <tr key={c.ruta} className="border-t"><td className="py-1"><code>{c.ruta}</code></td><td>{c.programacion}</td></tr>)}</tbody></table>
        {v && v.github.estado !== 'ok' && <p className="mt-2 text-xs text-gray-500">La lista de cron se lee de vercel.json con la conexión a GitHub; sin ella no se puede mostrar.</p>}
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <h3 className="mb-1 font-semibold">Variables de entorno de este entorno (solo nombres, nunca valores)</h3>
        {v && v.pendientes.length > 0 ? <ul className="mb-2 list-disc pl-5 text-sm text-red-700">{v.pendientes.map(x => <li key={x}>{x}</li>)}</ul> : <p className="mb-2 text-sm text-green-700">Todas las variables esperadas están configuradas en este entorno.</p>}
        <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">{v?.variables.map(g => (<div key={g.slug} className="text-sm"><div className="font-medium">{g.nombre}</div>{g.variables.map(x => <div key={x.nombre} className="flex items-center gap-2 pl-2"><span className={`h-2 w-2 rounded-full ${x.configurada ? 'bg-green-500' : 'bg-red-500'}`} /><code>{x.nombre}</code><span className="text-xs text-gray-500">{x.configurada ? 'configurada' : 'no configurada'}</span></div>)}</div>))}</div>
        {v?.envPorEntorno && <div className="mt-3 border-t pt-2 text-sm"><div className="font-medium">Según Vercel, faltan en producción:</div>{v.faltanEnProduccion && v.faltanEnProduccion.length ? <div className="text-red-700">{v.faltanEnProduccion.map(x => `${x.variable} (${x.servicio})`).join(', ')}</div> : <div className="text-green-700">ninguna de las esperadas.</div>}</div>}
        {v && !v.envPorEntorno && <p className="mt-2 text-xs text-gray-500">Para ver qué variables tiene cada entorno de Vercel (producción, preview) hace falta conectar Vercel.</p>}
      </div>
    </div>
  );
}

/* ------------------------------ COSTES ------------------------------ */
function CostesVista({ servicios, costes, desde, hasta, subida, setDesde, setHasta, setSubida, recargar, avisa }: { servicios: Servicio[]; costes: Costes | null; desde: string; hasta: string; subida: number; setDesde: (s: string) => void; setHasta: (s: string) => void; setSubida: (n: number) => void; recargar: () => void; avisa: (t: 'ok' | 'err', s: string) => void }) {
  const [vista, setVista] = useState<'tabla' | 'grafico'>('grafico');
  const [nuevo, setNuevo] = useState({ servicioId: '', fecha: '', concepto: '', importe: '', moneda: 'EUR', ivaPct: '21', tipo: 'UNICO', estado: 'REAL' });
  const act = async () => { try { const r = await api<{ guardadas: string[]; error?: string }>('/api/admin/sistemas/tasas', 'POST', {}); r.error ? avisa('err', r.error) : avisa('ok', r.guardadas.length ? `Tasas guardadas: ${r.guardadas.join(', ')}.` : 'Las tasas ya estaban al día.'); recargar(); } catch (e: any) { avisa('err', e.message); } };
  const alta = async () => { try { await api('/api/admin/sistemas/costes', 'POST', { servicioId: nuevo.servicioId, fecha: nuevo.fecha || null, concepto: nuevo.concepto, importe: Number(nuevo.importe.replace(',', '.')), moneda: nuevo.moneda, ivaPct: Number(nuevo.ivaPct), tipo: nuevo.tipo, estado: nuevo.estado }); avisa('ok', 'Coste añadido.'); setNuevo({ ...nuevo, concepto: '', importe: '' }); recargar(); } catch (e: any) { avisa('err', e.message); } };
  const anular = async (id: string) => { try { await api('/api/admin/sistemas/costes', 'DELETE', { id }); avisa('ok', 'Coste anulado.'); recargar(); } catch (e: any) { avisa('err', e.message); } };
  if (!costes) return <div className="text-sm text-gray-500">Calculando costes…</div>;
  const conCoste = costes.servicios.filter(s => s.totalAnio > 0).sort((a, b) => b.totalAnio - a.totalAnio);
  const incluidos = new Set(servicios.filter(s => s.tipoPago === 'INCLUIDO' || s.descartadoAt).map(s => s.slug));
  const sinCoste = costes.servicios.filter(s => s.totalAnio === 0 && s.estado !== 'en_baja' && !incluidos.has(s.slug));
  const serie = conCoste.map(s => ({ nombre: s.nombre, valores: costes.meses.map(m => s.meses[m].total) }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Desde<input type="month" className={inp} value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="month" className={inp} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        <label>Subida prevista de proveedores en 2027 (%)<input type="number" step="0.5" className={inp} value={subida} onChange={e => setSubida(Number(e.target.value) || 0)} /></label>
        <button className={btn2} onClick={act}>Actualizar tasas USD/EUR</button>
        <div className="ml-auto flex gap-1"><button className={vista === 'grafico' ? btn : btn2} onClick={() => setVista('grafico')}>Gráfico</button><button className={vista === 'tabla' ? btn : btn2} onClick={() => setVista('tabla')}>Tabla</button></div>
      </div>
      {costes.avisos.map(a => <div key={a} className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{a}</div>)}
      <div className="grid gap-3 md:grid-cols-4">
        {([['Coste del periodo', eur(costes.totalAnio), 'base de facturas + cargos sin factura'], ['Total anual a ritmo actual', eur(costes.totalAnualizado), 'últimos 3 meses cerrados ×12; anuales, lo pagado'], [`Previsión 2027${costes.subidaPct ? ` (+${costes.subidaPct} %)` : ''}`, eur(costes.previsionTotal2027), 'sin pagos únicos; en baja = 0'], ['Pagos únicos', eur(costes.totalPagosUnicosReales + costes.totalPagosUnicosPrevistos), `${eur(costes.totalPagosUnicosReales)} pagado · ${eur(costes.totalPagosUnicosPrevistos)} previsto (IVA incl.)`]] as const).map(([t, v, s]) => (<div key={t} className="rounded border border-gray-200 bg-white p-3"><div className="text-xs text-gray-500">{t}</div><div className="text-xl font-bold">{v}</div><div className="text-xs text-gray-500">{s}</div></div>))}
      </div>
      {vista === 'grafico' ? (<div className="rounded border border-gray-200 bg-white p-3"><h3 className="mb-1 font-semibold">Evolución mensual por servicio (base imponible; en amarillo del cargo, sin factura, se incluye)</h3><EvolucionCostes meses={costes.meses} series={serie} mesActual={costes.mesActual} /><Leyenda nombres={serie.map(s => s.nombre)} /></div>) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Servicio</th>{costes.meses.map(m => <th key={m} className="px-2 text-right">{mesCorto(m)}</th>)}<th className="px-2 text-right">Total</th><th className="px-3 text-right">2027</th></tr></thead>
          <tbody>{conCoste.map(s => (<tr key={s.slug} className="border-t"><td className="px-3 py-1.5 font-medium">{s.nombre}</td>{costes.meses.map(m => { const c = s.meses[m]; return <td key={m} className={`px-2 text-right tabular-nums ${c.sinFactura > 0 ? 'bg-yellow-100' : ''}`} title={c.sinFactura > 0 ? `${eur(c.sinFactura, 2)} son cargos del banco sin factura` : ''}>{c.total ? eur(c.total) : <span className="text-gray-300">—</span>}</td>; })}<td className="px-2 text-right font-semibold tabular-nums">{eur(s.totalAnio)}</td><td className="px-3 text-right tabular-nums" title={ORIGEN[s.previsionOrigen]}>{eur(s.prevision2027)}</td></tr>))}</tbody>
          <tfoot className="border-t-2 bg-gray-50 font-semibold"><tr><td className="px-3 py-2">Total</td>{costes.meses.map(m => <td key={m} className="px-2 text-right tabular-nums">{eur(costes.totalesMes[m])}</td>)}<td className="px-2 text-right tabular-nums">{eur(costes.totalAnio)}</td><td className="px-3 text-right tabular-nums">{eur(costes.previsionTotal2027)}</td></tr></tfoot></table>
          <p className="p-2 text-xs text-gray-500">Casilla amarilla: el mes incluye cargos del banco que no tienen factura. El mes en curso no entra en el ritmo ni en la previsión.</p></div>)}
      {sinCoste.length > 0 && <div className="rounded border border-gray-200 bg-white p-3 text-sm"><b>Sin ningún coste registrado en el periodo:</b> {sinCoste.map(s => s.nombre).join(', ')}. O todavía no hay factura o se paga con un proveedor que aún no tiene regla. Añade un coste a mano o una regla.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-3"><h3 className="mb-1 font-semibold">Pagos únicos (fuera del coste mensual)</h3>
          <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th>Servicio</th><th>Concepto</th><th className="text-right">Base</th><th className="text-right">IVA</th><th className="text-right">Total</th><th /></tr></thead><tbody>{costes.pagosUnicos.map(p => (<tr key={p.id} className="border-t"><td className="py-1">{p.nombre}</td><td>{p.concepto}{p.moneda === 'USD' && <span className="text-xs text-gray-500"> ({p.importeOriginal} USD)</span>}<div className="text-xs text-gray-500">{p.fecha ? fFecha(p.fecha) : 'sin fecha'} · <span className={p.estado === 'PREVISTO' ? 'rounded bg-yellow-100 px-1 text-yellow-800' : ''}>{p.estado === 'PREVISTO' ? 'previsto' : 'pagado'}</span></div></td><td className="text-right tabular-nums">{eur(p.base, 2)}</td><td className="text-right tabular-nums">{eur(p.iva, 2)}</td><td className="text-right font-medium tabular-nums">{eur(p.total, 2)}</td><td className="pl-2"><button className="text-xs text-red-700 underline" onClick={() => anular(p.id)}>Anular</button></td></tr>))}{!costes.pagosUnicos.length && <tr><td colSpan={6} className="py-2 text-gray-500">Ninguno.</td></tr>}</tbody></table></div>
        <div className="rounded border border-gray-200 bg-white p-3"><h3 className="mb-1 font-semibold">Cargos de tarjeta o banco sin factura ({costes.cargosSinFactura.length} · {eur(costes.totalSinFactura, 2)})</h3>
          <div className="max-h-64 overflow-y-auto"><table className="w-full text-sm"><tbody>{costes.cargosSinFactura.map(c => (<tr key={c.movId} className="border-t"><td className="py-1 pr-2 text-gray-600">{fFecha(c.fecha)}</td><td className="pr-2">{c.nombre}<div className="max-w-xs truncate text-xs text-gray-500" title={c.concepto}>{c.concepto}</div></td><td className="text-right tabular-nums">{eur(c.importe, 2)}</td></tr>))}{!costes.cargosSinFactura.length && <tr><td className="py-2 text-gray-500">Todos los cargos tienen factura o justificante.</td></tr>}</tbody></table></div>
          <p className="mt-1 text-xs text-gray-500">Pide la factura a cada proveedor; en cuanto se vincule en Conciliar dejará de aparecer aquí.</p></div>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3"><h3 className="mb-2 font-semibold">Añadir un coste a mano (pago único, cargo sin factura o previsión)</h3>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-8">
          <select className={`${inp} md:col-span-2`} value={nuevo.servicioId} onChange={e => setNuevo({ ...nuevo, servicioId: e.target.value })}><option value="">Servicio…</option>{servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          <input className={`${inp} md:col-span-2`} placeholder="Concepto" value={nuevo.concepto} onChange={e => setNuevo({ ...nuevo, concepto: e.target.value })} />
          <input type="date" className={inp} value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} />
          <input className={inp} placeholder="Importe" value={nuevo.importe} onChange={e => setNuevo({ ...nuevo, importe: e.target.value })} />
          <select className={inp} value={nuevo.moneda} onChange={e => setNuevo({ ...nuevo, moneda: e.target.value })}><option>EUR</option><option>USD</option></select>
          <input className={inp} placeholder="IVA %" value={nuevo.ivaPct} onChange={e => setNuevo({ ...nuevo, ivaPct: e.target.value })} />
          <select className={inp} value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value })}><option value="UNICO">Pago único</option><option value="RECURRENTE">Recurrente (entra en el mes)</option></select>
          <select className={inp} value={nuevo.estado} onChange={e => setNuevo({ ...nuevo, estado: e.target.value })}><option value="REAL">Pagado</option><option value="PREVISTO">Previsto</option></select>
          <button className={btn} disabled={!nuevo.servicioId || !nuevo.concepto || !nuevo.importe} onClick={alta}>Añadir</button></div></div>
      {costes.facturasSinServicio.length > 0 && <div className="rounded border border-gray-200 bg-white p-3 text-sm"><b>Facturas recibidas que podrían ser software y no tienen servicio:</b> {costes.facturasSinServicio.map(f => `${f.proveedor} (${f.n}, ${eur(f.base)})`).join(' · ')}.</div>}
    </div>
  );
}

/* ------------------------------ INCIDENCIAS ------------------------------ */
function Incidencias({ servicios, avisa }: { servicios: Servicio[]; avisa: (t: 'ok' | 'err', s: string) => void }) {
  const [lista, setLista] = useState<Incidencia[]>([]); const [filtro, setFiltro] = useState<'' | 'INCIDENCIA' | 'DECISION'>('');
  const ahora = new Date(); const hoy = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [n, setN] = useState({ fechaHora: hoy, tipo: 'INCIDENCIA', titulo: '', detalle: '', servicioId: '' });
  const cargar = useCallback(async () => { try { setLista((await api<{ incidencias: Incidencia[] }>('/api/admin/sistemas/incidencias')).incidencias); } catch (e: any) { avisa('err', e.message); } }, [avisa]);
  useEffect(() => { cargar(); }, [cargar]);
  const crear = async () => { try { await api('/api/admin/sistemas/incidencias', 'POST', { fechaHora: n.fechaHora, tipo: n.tipo, titulo: n.titulo, detalle: n.detalle || null, servicioId: n.servicioId || null }); avisa('ok', 'Registrado.'); setN({ ...n, titulo: '', detalle: '' }); cargar(); } catch (e: any) { avisa('err', e.message); } };
  const anular = async (id: string) => { try { await api('/api/admin/sistemas/incidencias', 'DELETE', { id }); cargar(); } catch (e: any) { avisa('err', e.message); } };
  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3"><h3 className="mb-2 font-semibold">Registrar una incidencia o una decisión</h3>
        <div className="grid gap-2 text-sm md:grid-cols-6"><input type="datetime-local" className={inp} value={n.fechaHora} onChange={e => setN({ ...n, fechaHora: e.target.value })} />
          <select className={inp} value={n.tipo} onChange={e => setN({ ...n, tipo: e.target.value })}><option value="INCIDENCIA">Incidencia</option><option value="DECISION">Decisión</option></select>
          <select className={inp} value={n.servicioId} onChange={e => setN({ ...n, servicioId: e.target.value })}><option value="">Sin servicio concreto</option>{servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          <input className={`${inp} md:col-span-3`} placeholder="Título" value={n.titulo} onChange={e => setN({ ...n, titulo: e.target.value })} />
          <textarea className={`${inp} md:col-span-5`} rows={2} placeholder="Detalle (sin contraseñas ni tokens)" value={n.detalle} onChange={e => setN({ ...n, detalle: e.target.value })} /><button className={btn} disabled={!n.titulo} onClick={crear}>Registrar</button></div></div>
      <div className="flex gap-2 text-sm"><button className={filtro === '' ? btn : btn2} onClick={() => setFiltro('')}>Todo</button><button className={filtro === 'INCIDENCIA' ? btn : btn2} onClick={() => setFiltro('INCIDENCIA')}>Incidencias</button><button className={filtro === 'DECISION' ? btn : btn2} onClick={() => setFiltro('DECISION')}>Decisiones</button></div>
      <ol className="space-y-2">{lista.filter(i => !filtro || i.tipo === filtro).map(i => (<li key={i.id} className={`rounded border bg-white p-3 ${i.tipo === 'INCIDENCIA' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500'} border-gray-200`}>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold tabular-nums">{fFechaHora(i.fechaHora)}</span><span className={`rounded px-2 py-0.5 text-xs ${i.tipo === 'INCIDENCIA' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{i.tipo === 'INCIDENCIA' ? 'Incidencia' : 'Decisión'}</span>{i.servicio && <span className="text-xs text-gray-500">{i.servicio}</span>}<span className="ml-auto text-xs text-gray-500">{i.autor}</span><button className="text-xs text-red-700 underline" onClick={() => anular(i.id)}>Anular</button></div>
        <div className="mt-1 font-medium">{i.titulo}</div>{i.detalle && <p className="text-sm text-gray-700">{i.detalle}</p>}</li>))}</ol>
    </div>
  );
}
