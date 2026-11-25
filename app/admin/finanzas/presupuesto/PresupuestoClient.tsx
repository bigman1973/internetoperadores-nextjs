'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { eur } from '../../subida-precios/fmt';

type Aviso = { codigo: string; gravedad: 'ALTA' | 'MEDIA' | 'INFO'; texto: string };
type Version = { id: string; numero: number; nombre: string; estado: 'BORRADOR' | 'APROBADO' | 'REEMPLAZADO'; subidaProveedoresPct: number; mesesReal: number; aprobadoAt: string | null; aprobador: string | null; autor: string; actualizadaAt: string; ingresos: number; gastos: number };
type Linea = { id: string; tipo: 'INGRESO' | 'GASTO'; naturaleza: 'CORRIENTE' | 'INVERSION'; centro: string; cuenta: string; fuente: string; realAnual: number; subidaPct: number | null; importeAuto: number; importe: number; origen: 'AUTO' | 'MANUAL'; nota: string | null };
type Tot = { ingresos: { real: number; presupuesto: number }; gastoCorriente: { real: number; presupuesto: number }; inversion: { real: number; presupuesto: number }; resultado: { real: number; presupuesto: number }; margenPct: { real: number | null; presupuesto: number | null } };
type Detalle = { version: { id: string; ejercicio: number; numero: number; nombre: string; notas: string | null; estado: string; subidaProveedoresPct: number; mesesReal: number; aprobadoAt: string | null; aprobador: string | null; autor: string; avisos: Aviso[] }; lineas: Linea[]; totales: Tot; permisos: { puedeEditar: boolean; puedeAprobar: boolean } };
type Lista = { migracion: boolean; versiones: Version[]; escenarioSubida: { id: string; nombre: string; extraAnual: number; fechaEfecto: string | null } | null; escenarioSalarial: { nombre: string; estado: string } | null };
type Seg = { mesesCerrados: number; filas: { tipo: 'INGRESO' | 'GASTO'; centro: string; presupuestoAnual: number; presupuestoAcum: number; realAcum: number; diferencia: number; porMes: { mes: string; presupuesto: number; real: number }[] }[] };

const EJERCICIO = 2027;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const inp = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none';
const btn = 'rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50';
const btn2 = 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const GRAV: Record<string, string> = { ALTA: 'border-red-300 bg-red-50 text-red-800', MEDIA: 'border-amber-300 bg-amber-50 text-amber-900', INFO: 'border-gray-200 bg-gray-50 text-gray-700' };
const EST: Record<string, string> = { BORRADOR: 'bg-amber-100 text-amber-800', APROBADO: 'bg-green-100 text-green-800', REEMPLAZADO: 'bg-gray-100 text-gray-600' };
const fFecha = (s: string | null) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—');
const dif = (v: number, ingreso: boolean) => (Math.abs(v) < 0.5 ? 'text-gray-600' : (v > 0) === ingreso ? 'text-green-700' : 'text-red-700');
async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j as T;
}
const aNum = (s: string) => Number(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));

export default function PresupuestoClient({ puedeEditar, puedeAprobar }: { puedeEditar: boolean; puedeAprobar: boolean }) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<Detalle | null>(null);
  const [seg, setSeg] = useState<Seg | null>(null);
  const [vista, setVista] = useState<'presupuesto' | 'seguimiento'>('presupuesto');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nueva, setNueva] = useState<{ nombre: string; pct: string; meses: string; copiar: string } | null>(null);
  const [alta, setAlta] = useState<{ tipo: 'INGRESO' | 'GASTO'; naturaleza: 'CORRIENTE' | 'INVERSION'; centro: string; cuenta: string; importe: string } | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const cargarLista = useCallback(async () => {
    try { const l = await api<Lista>(`/api/admin/finanzas/presupuesto/versiones?ejercicio=${EJERCICIO}`); setLista(l); setSel(prev => prev ?? l.versiones.find(v => v.estado === 'APROBADO')?.id ?? l.versiones[0]?.id ?? null); } catch (e: any) { setErr(e.message); }
  }, []);
  const cargarDet = useCallback(async (id: string) => {
    try { setDet(await api<Detalle>(`/api/admin/finanzas/presupuesto/versiones/${id}`)); setSeg(null); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { void cargarLista(); }, [cargarLista]);
  useEffect(() => { if (sel) void cargarDet(sel); else setDet(null); }, [sel, cargarDet]);
  useEffect(() => { if (vista === 'seguimiento' && sel && !seg) api<Seg>(`/api/admin/finanzas/presupuesto/versiones/${sel}/seguimiento`).then(setSeg).catch((e: any) => setErr(e.message)); }, [vista, sel, seg]);

  const editable = !!det && det.version.estado === 'BORRADOR' && det.permisos.puedeEditar;
  const run = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); setErr(null); setMsg(null); try { await fn(); if (ok) setMsg(ok); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const refrescar = async () => { await cargarLista(); if (sel) await cargarDet(sel); };

  const crear = () => run(async () => {
    if (!nueva) return;
    const body: any = { ejercicio: EJERCICIO, nombre: nueva.nombre, subidaProveedoresPct: aNum(nueva.pct), mesesReal: Number(nueva.meses) };
    if (nueva.copiar) body.copiarDe = nueva.copiar;
    const r = await api<{ id: string }>('/api/admin/finanzas/presupuesto/versiones', 'POST', body);
    setNueva(null); setSel(r.id); await cargarLista(); await cargarDet(r.id);
  }, 'Versión creada en borrador.');
  const editar = (l: Linea, texto: string) => run(async () => {
    const v = aNum(texto); if (!isFinite(v)) throw new Error('Importe no válido.');
    if (Math.abs(v - l.importe) < 0.005) return;
    await api(`/api/admin/finanzas/presupuesto/versiones/${sel}/lineas`, 'PATCH', { lineaId: l.id, importe: v }); await cargarDet(sel!);
  });
  const restaurar = (l: Linea) => run(async () => { await api(`/api/admin/finanzas/presupuesto/versiones/${sel}/lineas`, 'PATCH', { lineaId: l.id, restaurar: true }); await cargarDet(sel!); });
  const naturaleza = (l: Linea, n: 'CORRIENTE' | 'INVERSION') => run(async () => { await api(`/api/admin/finanzas/presupuesto/versiones/${sel}/lineas`, 'PATCH', { lineaId: l.id, naturaleza: n }); await cargarDet(sel!); });
  const borrar = (l: Linea) => run(async () => { if (!confirm(`¿Borrar la línea «${l.cuenta}»?`)) return; await api(`/api/admin/finanzas/presupuesto/versiones/${sel}/lineas`, 'DELETE', { lineaId: l.id }); await cargarDet(sel!); });
  const añadir = () => run(async () => {
    if (!alta) return; const v = aNum(alta.importe); if (!isFinite(v)) throw new Error('Importe no válido.');
    await api(`/api/admin/finanzas/presupuesto/versiones/${sel}/lineas`, 'POST', { tipo: alta.tipo, naturaleza: alta.naturaleza, centro: alta.centro, cuenta: alta.cuenta, importe: v }); setAlta(null); await cargarDet(sel!);
  }, 'Línea añadida.');
  const aprobar = () => run(async () => {
    if (!confirm('¿Aprobar esta versión como presupuesto 2027? La versión aprobada anterior pasará a «reemplazada». Después no se podrá editar: habrá que crear una versión nueva.')) return;
    await api(`/api/admin/finanzas/presupuesto/versiones/${sel}/aprobar`, 'POST', { confirmo: true }); await refrescar();
  }, 'Presupuesto aprobado.');

  const grupos = useMemo(() => {
    if (!det) return [];
    const out: { clave: string; tipo: 'INGRESO' | 'GASTO'; centro: string; lineas: Linea[]; real: number; pres: number }[] = [];
    for (const l of det.lineas) {
      const clave = `${l.tipo}|${l.centro}`; let g = out.find(x => x.clave === clave);
      if (!g) { g = { clave, tipo: l.tipo, centro: l.centro, lineas: [], real: 0, pres: 0 }; out.push(g); }
      g.lineas.push(l); g.real += l.realAnual; g.pres += l.importe;
    }
    return out;
  }, [det]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Presupuesto {EJERCICIO}</h1><p className="text-sm text-gray-600">Parte del real de {EJERCICIO - 1} (enero–octubre anualizado) por centro de coste. El presupuesto es editable; el real se calcula solo con las facturas y nóminas del panel.</p></div>
        <div className="flex items-center gap-2">
          <select className={inp + ' !w-72'} value={sel ?? ''} onChange={e => { setSel(e.target.value || null); setSeg(null); }}>
            {!lista?.versiones.length && <option value="">Sin versiones</option>}
            {lista?.versiones.map(v => <option key={v.id} value={v.id}>v{v.numero} · {v.nombre} · {v.estado.toLowerCase()}</option>)}
          </select>
          {puedeEditar && lista?.migracion && <button className={btn} disabled={busy} onClick={() => setNueva({ nombre: `Borrador ${new Date().toLocaleDateString('es-ES')}`, pct: '3', meses: '10', copiar: '' })}>Nueva versión</button>}
        </div>
      </div>
      {err && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{err}</div>}
      {msg && <div className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{msg}</div>}
      {lista && !lista.migracion && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Falta aplicar la migración de Impuestos y Presupuesto en esta base de datos.</div>}
      {lista && <div className="grid gap-2 text-sm md:grid-cols-2">
        <div className={`rounded border p-2 ${lista.escenarioSubida ? 'border-green-300 bg-green-50 text-green-900' : GRAV.MEDIA}`}>{lista.escenarioSubida ? `Subida de precios aprobada: «${lista.escenarioSubida.nombre}», ${eur(lista.escenarioSubida.extraAnual)} al año, efecto ${fFecha(lista.escenarioSubida.fechaEfecto)}.` : 'No hay ningún escenario aprobado en Subida de precios: los ingresos 2027 no incluyen subida.'}</div>
        <div className={`rounded border p-2 ${lista.escenarioSalarial?.estado === 'aprobado' ? 'border-green-300 bg-green-50 text-green-900' : GRAV.MEDIA}`}>{lista.escenarioSalarial ? `Escenario salarial: «${lista.escenarioSalarial.nombre}» (${lista.escenarioSalarial.estado}).` : 'No hay escenario salarial: el personal usa el real anualizado.'}</div>
      </div>}

      {det && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${EST[det.version.estado]}`}>{det.version.estado === 'BORRADOR' ? 'Borrador' : det.version.estado === 'APROBADO' ? 'Aprobado' : 'Reemplazado'}</span>
            <b>v{det.version.numero} · {det.version.nombre}</b>
            <span className="text-sm text-gray-600">Subida de proveedores {det.version.subidaProveedoresPct} % · real {det.version.mesesReal} meses · creada por {det.version.autor}</span>
            {det.version.aprobadoAt && <span className="text-sm text-green-800">Aprobada por {det.version.aprobador} el {fFecha(det.version.aprobadoAt.slice(0, 10))}</span>}
            <div className="ml-auto flex gap-2">
              <button className={vista === 'presupuesto' ? btn : btn2} onClick={() => setVista('presupuesto')}>Presupuesto</button>
              <button className={vista === 'seguimiento' ? btn : btn2} onClick={() => setVista('seguimiento')}>Seguimiento mensual</button>
              {puedeAprobar && det.version.estado === 'BORRADOR' && <button className={btn} disabled={busy} onClick={() => void aprobar()}>Aprobar presupuesto</button>}
            </div>
          </div>
          {det.version.estado === 'BORRADOR' && !puedeAprobar && <div className="text-sm text-gray-600">La aprobación del presupuesto la hace solo el superadmin.</div>}

          {vista === 'presupuesto' && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                {([['Ingresos', det.totales.ingresos, true], ['Gasto corriente', det.totales.gastoCorriente, false], ['Inversión', det.totales.inversion, false], ['Resultado', det.totales.resultado, true]] as const).map(([t, v, ing]) => (
                  <div key={t} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs text-gray-600">{t}</div>
                    <div className="text-lg font-semibold">{eur(v.presupuesto)}</div>
                    <div className="text-xs text-gray-600">Real {EJERCICIO - 1}: {eur(v.real)} · <span className={dif(v.presupuesto - v.real, ing)}>{v.presupuesto - v.real >= 0 ? '+' : ''}{eur(v.presupuesto - v.real)}</span></div>
                  </div>))}
              </div>
              <div className="text-sm text-gray-700">Margen: real {EJERCICIO - 1} {det.totales.margenPct.real ?? '—'} % → presupuesto {det.totales.margenPct.presupuesto ?? '—'} %.</div>
              {det.version.avisos.map((a, i) => <div key={i} className={`rounded border p-2 text-sm ${GRAV[a.gravedad]}`}>{a.texto}</div>)}

              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-600"><th className="p-2">Centro de coste / cuenta</th><th>Tipo</th><th className="text-right">Real {EJERCICIO - 1}</th><th className="text-right">Presupuesto {EJERCICIO}</th><th className="text-right">Diferencia</th><th className="text-right p-2">%</th></tr></thead>
                  <tbody>
                    {(['INGRESO', 'GASTO'] as const).map(tipo => (
                      <Fragment key={tipo}>
                        <tr className="bg-gray-100 font-semibold"><td className="p-2" colSpan={6}>{tipo === 'INGRESO' ? 'Ingresos' : 'Gastos'}</td></tr>
                        {grupos.filter(g => g.tipo === tipo).map(g => (
                          <Fragment key={g.clave}>
                            <tr className="cursor-pointer border-b font-medium hover:bg-gray-50" onClick={() => setAbiertos(a => ({ ...a, [g.clave]: !a[g.clave] }))}>
                              <td className="p-2">{abiertos[g.clave] ? '▾' : '▸'} {g.centro} <span className="text-xs font-normal text-gray-500">({g.lineas.length})</span></td><td />
                              <td className="text-right">{eur(g.real)}</td><td className="text-right">{eur(g.pres)}</td><td className={`text-right ${dif(g.pres - g.real, tipo === 'INGRESO')}`}>{g.pres - g.real >= 0 ? '+' : ''}{eur(g.pres - g.real)}</td><td className="p-2 text-right">{g.real ? `${(((g.pres - g.real) / g.real) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : '—'}</td>
                            </tr>
                            {abiertos[g.clave] && g.lineas.map(l => (
                              <tr key={l.id} className={`border-b ${l.origen === 'MANUAL' ? 'bg-amber-50' : ''}`}>
                                <td className="py-1 pl-8 pr-2" title={l.nota ?? ''}>{l.cuenta}{l.fuente === 'MANUAL' ? <span className="ml-1 text-xs text-amber-800">(manual)</span> : null}</td>
                                <td className="text-xs">{tipo === 'GASTO' ? (editable ? <select className="rounded border border-gray-200 text-xs" value={l.naturaleza} onChange={e => void naturaleza(l, e.target.value as any)}><option value="CORRIENTE">Corriente</option><option value="INVERSION">Inversión</option></select> : l.naturaleza === 'INVERSION' ? 'Inversión' : 'Corriente') : ''}</td>
                                <td className="text-right">{eur(l.realAnual)}</td>
                                <td className="text-right">{editable ? <input key={l.id + l.importe} className="w-28 rounded border border-gray-300 px-1 py-0.5 text-right text-sm" defaultValue={l.importe.toLocaleString('es-ES', { maximumFractionDigits: 2, useGrouping: false })} onBlur={e => void editar(l, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /> : eur(l.importe)}</td>
                                <td className={`text-right ${dif(l.importe - l.realAnual, tipo === 'INGRESO')}`}>{l.importe - l.realAnual >= 0 ? '+' : ''}{eur(l.importe - l.realAnual)}</td>
                                <td className="p-2 text-right text-xs">{editable && l.origen === 'MANUAL' && l.fuente !== 'MANUAL' && <button className="text-orange-700 hover:underline" onClick={() => void restaurar(l)}>Restaurar</button>}{editable && l.fuente === 'MANUAL' && <button className="text-red-700 hover:underline" onClick={() => void borrar(l)}>Borrar</button>}</td>
                              </tr>))}
                          </Fragment>))}
                      </Fragment>))}
                  </tbody>
                </table>
              </div>
              {editable && <div><button className={btn2} onClick={() => setAlta({ tipo: 'GASTO', naturaleza: 'INVERSION', centro: '', cuenta: '', importe: '' })}>Añadir línea (inversión o gasto nuevo)</button></div>}
            </>
          )}

          {vista === 'seguimiento' && (
            <div className="space-y-2">
              {!seg ? <p className="text-sm text-gray-600">Calculando…</p> : (
                <>
                  <p className="text-sm text-gray-700">Real de {EJERCICIO} frente a presupuesto repartido en 12 partes iguales, con los {seg.mesesCerrados} meses cerrados. {seg.mesesCerrados === 0 && 'El ejercicio aún no ha empezado: el seguimiento se llenará a medida que haya facturas de 2027.'}</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-600"><th className="p-2">Centro</th><th className="text-right">Presupuesto anual</th><th className="text-right">Presupuesto acum.</th><th className="text-right">Real acum.</th><th className="text-right">Diferencia</th>{MES.map(m => <th key={m} className="text-right">{m}</th>)}</tr></thead>
                      <tbody>{seg.filas.map(f => (
                        <tr key={f.tipo + f.centro} className="border-b">
                          <td className="p-2">{f.centro} <span className="text-xs text-gray-500">{f.tipo === 'INGRESO' ? 'ingreso' : 'gasto'}</span></td>
                          <td className="text-right">{eur(f.presupuestoAnual)}</td><td className="text-right">{eur(f.presupuestoAcum)}</td><td className="text-right">{eur(f.realAcum)}</td>
                          <td className={`text-right ${dif(f.diferencia, f.tipo === 'INGRESO')}`}>{f.diferencia >= 0 ? '+' : ''}{eur(f.diferencia)}</td>
                          {f.porMes.map(m => <td key={m.mes} className="text-right text-xs text-gray-600">{m.real ? eur(m.real) : '·'}</td>)}
                        </tr>))}</tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
      {lista && lista.migracion && lista.versiones.length === 0 && !det && <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-700">Todavía no hay ninguna versión del presupuesto {EJERCICIO}. {puedeEditar ? 'Pulsa «Nueva versión» para generar un borrador desde el real.' : ''}</div>}

      {nueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNueva(null)}>
          <div className="w-full max-w-md space-y-2 rounded-lg bg-white p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">Nueva versión del presupuesto {EJERCICIO}</h3>
            <label className="block text-sm">Nombre<input className={inp} maxLength={120} value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} /></label>
            <label className="block text-sm">Copiar de una versión existente (opcional)<select className={inp} value={nueva.copiar} onChange={e => setNueva({ ...nueva, copiar: e.target.value })}><option value="">No: generar desde el real</option>{lista?.versiones.map(v => <option key={v.id} value={v.id}>v{v.numero} · {v.nombre}</option>)}</select></label>
            {!nueva.copiar && <>
              <label className="block text-sm">Subida prevista de proveedores (%)<input className={inp} value={nueva.pct} onChange={e => setNueva({ ...nueva, pct: e.target.value })} /></label>
              <label className="block text-sm">Meses de real a anualizar (10 = enero–octubre)<input className={inp} type="number" min={1} max={12} value={nueva.meses} onChange={e => setNueva({ ...nueva, meses: e.target.value })} /></label>
            </>}
            <div className="flex justify-end gap-2 pt-1"><button className={btn2} onClick={() => setNueva(null)}>Cancelar</button><button className={btn} disabled={busy || !nueva.nombre.trim()} onClick={() => void crear()}>{busy ? 'Generando…' : 'Crear borrador'}</button></div>
          </div>
        </div>
      )}
      {alta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAlta(null)}>
          <div className="w-full max-w-md space-y-2 rounded-lg bg-white p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">Añadir línea</h3>
            <label className="block text-sm">Tipo<select className={inp} value={alta.tipo} onChange={e => setAlta({ ...alta, tipo: e.target.value as any })}><option value="GASTO">Gasto</option><option value="INGRESO">Ingreso</option></select></label>
            {alta.tipo === 'GASTO' && <label className="block text-sm">Naturaleza<select className={inp} value={alta.naturaleza} onChange={e => setAlta({ ...alta, naturaleza: e.target.value as any })}><option value="INVERSION">Inversión</option><option value="CORRIENTE">Gasto corriente</option></select></label>}
            <label className="block text-sm">Centro de coste<input className={inp} maxLength={120} value={alta.centro} onChange={e => setAlta({ ...alta, centro: e.target.value })} placeholder="Estructura" /></label>
            <label className="block text-sm">Cuenta o concepto<input className={inp} maxLength={200} value={alta.cuenta} onChange={e => setAlta({ ...alta, cuenta: e.target.value })} placeholder="Renovación de servidores" /></label>
            <label className="block text-sm">Importe anual<input className={inp} inputMode="decimal" value={alta.importe} onChange={e => setAlta({ ...alta, importe: e.target.value })} /></label>
            <div className="flex justify-end gap-2 pt-1"><button className={btn2} onClick={() => setAlta(null)}>Cancelar</button><button className={btn} disabled={busy || !alta.centro.trim() || !alta.cuenta.trim()} onClick={() => void añadir()}>Añadir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
