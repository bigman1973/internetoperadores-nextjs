'use client'
/**
 * Área 1 · Ficha de cliente del CRM. Marcado, clases y textos copiados de maqueta_crm_ficha_cliente_aprobada.html;
 * los datos de ejemplo se sustituyen por los reales (FichaCliente, lib/area1-ficha-cliente.ts) y lo que falta sale «sin dato».
 * Correo, IA y reunión reutilizan las rutas de contacto (a59b2880/2df60a2d): POST /actividades y GET /m365/borrador.
 * La IA solo propone: el envío lo hace siempre la persona con «Enviar».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventoFicha, FichaCliente as Ficha } from '@/lib/area1-ficha-cliente'

type Conexion = { enabled: boolean; connected: boolean; email: string | null; mail?: boolean }
type M365 = { aviso: string | null; conexion: Conexion; corporativo: string; connectUrl: string }
type Vista = 'resumen' | 'actividad' | 'contratos' | 'facturacion' | 'negocios' | 'personas' | 'rentabilidad'
const VISTAS: Vista[] = ['resumen', 'actividad', 'contratos', 'facturacion', 'negocios', 'personas', 'rentabilidad']
type Cajon = null | { kind: 'mail' | 'ai' | 'meet'; para?: string | null; asunto?: string; objetivo?: string }
const eur = (v: number, d = 0) => `${v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
const ICON: Record<string, string> = { mail: '@', meet: '▣', isp: 'ISP', note: 'N' }
const FIL: Array<[string, string]> = [['all', 'Todo'], ['mail', 'Correos'], ['meet', 'Reuniones'], ['note', 'Notas y llamadas'], ['isp', 'ISP Gestión']]
const reqId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ficha-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const pctTxt = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`

function Bars({ meses, a, b }: { meses: string[]; a: number[]; b?: number[] }) {
  const max = Math.max(...a, ...(b || [])) * 1.1
  if (!(max > 0)) return <p className="small muted" style={{ margin: 0 }}>sin dato</p>
  const W = 820, H = 200, pl = 40, pb = 24, bw = (W - pl) / a.length
  const MES = meses.map((m) => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m.slice(5, 7)) - 1])
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico por mes">
    {[0, 0.5, 1].map((t) => { const y = H - pb - (H - pb - 10) * t; return <g key={t}><line x1={pl} x2={W} y1={y} y2={y} stroke="var(--line)" /><text x={pl - 6} y={y + 4} textAnchor="end">{Math.round(max * t / 1000)}k</text></g> })}
    {a.map((v, i) => {
      const x = pl + i * bw + bw * 0.15, w = b ? bw * 0.33 : bw * 0.7, h = (H - pb - 10) * v / max
      const h2 = b ? (H - pb - 10) * b[i] / max : 0
      return <g key={i}>
        <rect x={x} y={H - pb - h} width={w} height={h} rx="2" fill="var(--before)"><title>{`${MES[i]}: ${eur(v)}`}</title></rect>
        {b && <rect x={x + w + 2} y={H - pb - h2} width={w} height={h2} rx="2" fill="var(--accent)"><title>{`Coste ${MES[i]}: ${eur(b[i])}`}</title></rect>}
        <text x={pl + i * bw + bw / 2} y={H - 6} textAnchor="middle">{MES[i]}</text>
      </g>
    })}
  </svg>
}

function Timeline({ eventos, onOpen }: { eventos: EventoFicha[]; onOpen: (c: Cajon) => void }) {
  const [filter, setFilter] = useState('all')
  const lista = eventos.filter((e) => filter === 'all' || e.cat === filter)
  return <>
    <div className="chipsf">{FIL.map((f) => <button key={f[0]} type="button" data-f={f[0]} aria-pressed={f[0] === filter} onClick={() => setFilter(f[0])}>{f[1]}</button>)}</div>
    <div className="tl">
      {lista.length === 0 && <p className="small muted" style={{ margin: '8px 0 0' }}>sin dato: no hay actividad registrada{filter === 'all' ? '' : ' de este tipo'}.</p>}
      {lista.map((e) => <div className="ev" key={e.id}><span className={`ic ${e.cat}`}>{ICON[e.cat]}</span><div>
        <div className="h"><b>{e.titulo}</b><span className={`src ${e.fuente === 'Outlook' ? 'o' : ''}`}>{e.fuente}</span>{e.etiqueta && <span className="src">{e.etiqueta}</span>}<span className="when">{e.cuando}</span></div>
        <div className="x">{e.tipo} · {e.quien}</div>
        {e.texto && <div className="x" style={{ color: 'var(--fg)' }}>{e.texto}</div>}
        {e.acciones.length > 0 && <div className="acts">
          <button className="btn small" type="button" onClick={() => onOpen({ kind: 'mail', para: e.contactoId, asunto: `Re: ${e.titulo}` })}>Responder</button>
          <button className="btn small" type="button" data-open="ai" onClick={() => onOpen({ kind: 'ai', para: e.contactoId, asunto: `Re: ${e.titulo}`, objetivo: 'Responder a su último correo' })}>Responder con IA</button>
        </div>}
      </div></div>)}
    </div>
  </>
}

export default function FichaCliente({ ficha, m365, puedeEscribir }: { ficha: Ficha; m365: M365; puedeEscribir: boolean }) {
  const [vista, setVista] = useState<Vista>('resumen')
  const [cajon, setCajon] = useState<Cajon>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useCallback((m: string) => { setToastMsg(m); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 2600) }, [])
  const show = useCallback((v: string) => { const x = (VISTAS.includes(v as Vista) ? v : 'resumen') as Vista; setVista(x); history.replaceState(null, '', `#${x}`) }, [])
  useEffect(() => { const h = location.hash.slice(1); if (VISTAS.includes(h as Vista)) setVista(h as Vista) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCajon(null) }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [])

  // «Lo que hay que saber» (IA, caché diaria)
  const [ai, setAi] = useState<{ puntos: string[] | null; error: string | null }>({ puntos: null, error: null })
  useEffect(() => {
    let vivo = true
    fetch(`/api/admin/crm/empresas/${encodeURIComponent(ficha.empresa.id)}/resumen-ia`, { cache: 'no-store' })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!vivo) return; if (!r.ok || !Array.isArray(d.puntos)) setAi({ puntos: null, error: d.error || 'Resumen con IA no disponible.' }); else setAi({ puntos: d.puntos, error: null }) })
      .catch(() => vivo && setAi({ puntos: null, error: 'Resumen con IA no disponible.' }))
    return () => { vivo = false }
  }, [ficha.empresa.id])

  // Compositor
  const tipos = ['Nota', 'Llamada', 'Correo', 'Reunión', 'Tarea'] as const
  const [tipoComp, setTipoComp] = useState<(typeof tipos)[number]>('Nota')
  const [textoComp, setTextoComp] = useState('')
  const [guardando, setGuardando] = useState(false)
  const principal = ficha.personas[0]?.id || null
  async function guardarComp() {
    if (tipoComp === 'Correo') return setCajon({ kind: 'mail' })
    if (tipoComp === 'Reunión') return setCajon({ kind: 'meet' })
    if (!principal) return toast('Añade antes una persona a la ficha para registrar actividad.')
    if (!puedeEscribir) return toast('No tienes permiso para registrar actividad.')
    if (textoComp.trim().length < 2) return toast('Escribe el texto antes de guardar.')
    setGuardando(true)
    try {
      const manana = new Date(Date.now() + 86_400_000)
      const body = tipoComp === 'Nota' ? { type: 'NOTA', description: textoComp.trim() }
        : tipoComp === 'Llamada' ? { type: 'LLAMADA', direction: 'SALIENTE', result: 'CONTACTADO', description: textoComp.trim() }
          : { type: 'TAREA', title: textoComp.trim().slice(0, 250), description: textoComp.trim(), activityDate: new Date().toISOString(), followUp: { dueAt: manana.toISOString(), title: textoComp.trim().slice(0, 250), priority: 'MEDIA' } }
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(principal)}/actividades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientRequestId: reqId(), ...body }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo guardar.')
      setTextoComp(''); toast('Guardado en la ficha.'); setTimeout(() => location.reload(), 600)
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setGuardando(false) }
  }

  // Contratos
  const [qc, setQc] = useState(''); const [fc, setFc] = useState('')
  const contratos = useMemo(() => ficha.contratos.filter((c) => (!fc || c.estado === fc) && (!qc || [c.codigo, c.producto, c.sede, c.estado].join(' ').toLowerCase().includes(qc.toLowerCase()))), [ficha.contratos, qc, fc])

  function mas(v: string) {
    if (v === 'Nuevo negocio') location.href = '/admin/crm/pipelines'
    else if (v === 'Nueva tarea') { setTipoComp('Tarea'); show('resumen') }
    else if (v === 'Registrar llamada') { setTipoComp('Llamada'); show('resumen') }
    else if (v === 'Añadir persona' || v === 'Editar datos') location.href = `/admin/crm/empresas/${encodeURIComponent(ficha.empresa.id)}?editar=1`
    else if (v === 'Exportar ficha') window.print()
  }
  const e = ficha.empresa
  const abiertos = ficha.negocios.filter((n) => n.resultado === 'ABIERTO')

  return <>
    <header className="top">
      <div className="wrap">
        <div className="crumb"><a href="/admin/crm">CRM</a> › <a href="/admin/crm/empresas">Empresas y autónomos</a> › ficha</div>
        <div className="bar">
          <div className="idrow">
            <div className="logo" aria-hidden="true">{e.iniciales}</div>
            <div style={{ minWidth: 0 }}>
              <h1>{e.nombre}</h1>
              <div className="meta"><span>NIF <b>{e.nif || 'sin dato'}</b></span><span><span className={`tag ${e.tagTipo}`}>{e.tipo}</span></span><span>Cliente ISP <b>{e.codigoIsp ? `#${e.codigoIsp}` : 'sin dato'}</b>{e.vinculoIsp === 'propuesto' ? ' (propuesto)' : ''}</span><span>Comercial <b>{e.comercial || 'sin dato'}</b></span><span>Cliente desde <b>{e.clienteDesde || 'sin dato'}</b></span></div>
            </div>
          </div>
          <div className="scn">
            <span className={`pill ${e.estado.tono}`}>{e.estado.txt}</span>
            <button className="btn primary" type="button" data-open="mail" onClick={() => setCajon({ kind: 'mail' })}>Escribir correo</button>
            <button className="btn" type="button" data-open="meet" onClick={() => setCajon({ kind: 'meet' })}>Nueva reunión</button>
            <button className="btn" type="button" data-open="ai" onClick={() => setCajon({ kind: 'ai' })}>Redactar con IA</button>
            <select className="f" aria-label="Más acciones" value="Más" onChange={(ev) => mas(ev.target.value)}><option>Más</option><option>Nuevo negocio</option><option>Nueva tarea</option><option>Registrar llamada</option><option>Añadir persona</option><option>Editar datos</option><option>Exportar ficha</option></select>
          </div>
        </div>
        <nav className="tabs" aria-label="Secciones de la ficha">
          {([['resumen', 'Resumen', null], ['actividad', 'Actividad', ficha.eventos.length], ['contratos', 'Contratos y servicios', ficha.contratos.length], ['facturacion', 'Facturación', null], ['negocios', 'Negocios', ficha.negocios.length], ['personas', 'Personas', ficha.personas.length], ['rentabilidad', 'Rentabilidad y subida', null]] as Array<[Vista, string, number | null]>).map(([v, t, n]) =>
            <a key={v} href={`#${v}`} data-v={v} aria-current={vista === v ? 'page' : 'false'} onClick={(ev) => { ev.preventDefault(); show(v) }}>{t}{n != null && <> <span className="tag">{n}</span></>}</a>)}
        </nav>
      </div>
      <div className="kpis" id="kpis">
        {ficha.kpis.map((k) => <div key={k.etiqueta} className="kpi click" data-go={k.go} title="Ver detalle" role="button" tabIndex={0} onClick={() => { show(k.go); window.scrollTo({ top: 0 }) }} onKeyDown={(ev) => { if (ev.key === 'Enter') show(k.go) }}>
          <div className="eyebrow">{k.etiqueta}</div><div className="v">{k.clase ? <span className={`m ${k.clase}`}>{k.valor}</span> : k.valor}</div><div className="s">{k.sub}</div>
        </div>)}
      </div>
    </header>

    <main className="wrap">
      <p className="small muted" style={{ margin: 0 }}>Los datos de ISP Gestión (contratos, facturas, cobros) se leen, no se editan aquí. Pulsa una cifra de arriba para ver qué incluye.</p>

      <section className="view" id="v-resumen" hidden={vista !== 'resumen'}>
        <div className="lay">
          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <div className="panel ai">
              <h2>Lo que hay que saber <span className="small muted" style={{ fontWeight: 400, fontFamily: 'var(--f-body)' }}>· resumen con IA, actualizado hoy</span></h2>
              <ul id="aiSum">
                {ai.puntos ? ai.puntos.map((x, i) => <li key={i}>{x}</li>) : <li>{ai.error || 'Preparando el resumen…'}</li>}
              </ul>
              <div className="row"><button className="btn small primary" type="button" data-open="ai" onClick={() => setCajon({ kind: 'ai', objetivo: 'Correo de seguimiento' })}>Proponer correo de seguimiento</button><button className="btn small" type="button" onClick={() => setCajon({ kind: 'meet' })}>Preparar la próxima reunión</button><span className="small muted">La IA propone; tú revisas y envías.</span></div>
            </div>
            <div className="panel">
              <h2>Actividad</h2>
              <div className="composer">
                <div className="seg" role="group" aria-label="Tipo">{tipos.map((t) => <button key={t} type="button" aria-pressed={tipoComp === t} onClick={() => setTipoComp(t)}>{t}</button>)}</div>
                <textarea placeholder={tipoComp === 'Tarea' ? 'Escribe la tarea (vence mañana).' : tipoComp === 'Llamada' ? 'Resume la llamada.' : tipoComp === 'Correo' || tipoComp === 'Reunión' ? `Pulsa Guardar para abrir el panel de ${tipoComp === 'Correo' ? 'correo' : 'reunión'}.` : 'Escribe una nota. Usa @ para mencionar a un compañero.'} value={textoComp} onChange={(ev) => setTextoComp(ev.target.value)} />
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn small primary" type="button" disabled={guardando} onClick={guardarComp}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
              </div>
              <Timeline eventos={ficha.eventos} onOpen={setCajon} />
            </div>
          </div>
          <aside className="side">
            <div className="panel">
              <h2>Próximos pasos</h2>
              <div id="tasks">
                {ficha.tareas.length ? ficha.tareas.map((t, i) => <div className="task" key={i}><span className={`due ${t.cls}`}>{t.txt}</span><span>{t.titulo}</span></div>) : <p className="small muted" style={{ margin: 0 }}>sin dato: no hay tareas pendientes.</p>}
                <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={() => setTipoComp('Tarea')}>+ Tarea</button>
              </div>
            </div>
            <div className="panel">
              <h2>Avisos</h2>
              <div id="alerts">{ficha.avisos.length ? ficha.avisos.map((a, i) => <div key={i} className={`alert ${a.nivel === 'bad' ? 'bad' : a.nivel === 'info' ? 'info' : ''}`}><b>{a.titulo}</b><span>{a.texto}</span></div>) : <p className="small muted" style={{ margin: 0 }}>Sin avisos.</p>}</div>
            </div>
            <div className="panel">
              <h2>Personas</h2>
              <div id="people">{ficha.personas.length ? ficha.personas.slice(0, 6).map((p) => <div className="person" key={p.id}><span className="av">{p.iniciales}</span><div style={{ minWidth: 0 }}><div>{p.nombre}</div><div className="role">{p.papel}</div></div><button className="btn small" type="button" data-open="mail" disabled={!p.email} onClick={() => setCajon({ kind: 'mail', para: p.id })}>Escribir</button></div>) : <p className="small muted" style={{ margin: 0 }}>sin dato: no hay personas vinculadas.</p>}</div>
            </div>
            <div className="panel">
              <h2>Negocios abiertos</h2>
              <div id="deals">
                {abiertos.length ? abiertos.map((d, i) => <div className="deal" key={i}><div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontWeight: 500 }}>{d.nombre}</b><span className="num">{d.importe == null ? 'sin dato' : eur(d.importe)}</span></div><div className="small muted">{d.pipeline} · {d.etapa}</div><div className="stg">{d.etapas.map((s, j) => <i key={j} className={j < d.indice ? 'on' : ''} title={s} />)}</div></div>) : <p className="small muted" style={{ margin: 0 }}>Sin negocios abiertos.{ficha.negocios.length ? ` ${ficha.negocios.length} en el historial (pestaña Negocios).` : ''}</p>}
                <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={() => mas('Nuevo negocio')}>+ Negocio</button>
              </div>
            </div>
            <div className="panel">
              <h2>Datos de la empresa</h2>
              <dl className="kv" id="kv">{ficha.datos.map(([k, v]) => <FragmentKv key={k} k={k} v={v} />)}</dl>
            </div>
            <div className="panel">
              <h2>Comunicaciones</h2>
              <div className="cons" id="cons">{ficha.comunicaciones.map(([k, v, cls]) => <div key={k}><span>{k}</span><span className={`st ${cls}`}>{v}</span></div>)}</div>
              <p className="small muted" style={{ margin: '8px 0 0' }}>Base legal registrada con fecha y origen. Pendiente de validar con el asesor de protección de datos.</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="view" id="v-actividad" hidden={vista !== 'actividad'}>
        <div className="panel"><h2>Toda la actividad</h2><p className="help">Correos de Outlook, reuniones, llamadas, notas, tareas, cambios en ISP Gestión e historial importado de HubSpot.</p><Timeline eventos={ficha.eventos} onOpen={setCajon} /></div>
      </section>

      <section className="view" id="v-contratos" hidden={vista !== 'contratos'}>
        <div className="panel">
          <h2>Contratos y servicios</h2>
          <p className="help">Vienen de ISP Gestión. Margen del último mes cerrado, del módulo de Rentabilidad.{ficha.verMargen ? '' : ' Los márgenes los ven gerencia y superadmin.'}</p>
          <div className="row" style={{ marginBottom: 10 }}><input className="search" type="search" placeholder="Buscar contrato, sede o producto" id="qc" value={qc} onChange={(ev) => setQc(ev.target.value)} /><select className="f" id="fc" value={fc} onChange={(ev) => setFc(ev.target.value)}><option value="">Todos los estados</option><option>Activo</option><option>Baja</option></select></div>
          <div className="tablewrap"><table id="tC">
            <thead><tr><th>Contrato</th><th>Producto</th><th>Sede</th><th className="n">Cuota/mes</th><th>Estado ISP</th><th>Fin permanencia</th>{ficha.verMargen && <th className="n">Margen</th>}</tr></thead>
            <tbody>{contratos.length ? contratos.map((c) => <tr key={c.codigo}><td className="num">{c.codigo}</td><td>{c.producto}</td><td>{c.sede}</td><td className="n">{c.cuota == null ? 'sin dato' : eur(c.cuota, 2)}</td><td><span className={`st ${c.estado === 'Baja' ? 'o' : ''}`}>{c.estado}</span></td><td>{c.finPermanencia}</td>{ficha.verMargen && <td className="n">{c.margenPct == null ? 'sin dato' : <span className={`m ${c.margenPct < 0 ? 'bad' : c.margenPct < 20 ? 'low' : 'ok'}`}>{pctTxt(c.margenPct)}</span>}</td>}</tr>)
              : <tr><td colSpan={ficha.verMargen ? 7 : 6} className="muted">sin dato: {ficha.contratos.length ? 'ningún contrato coincide con el filtro.' : 'no hay contratos de ISP Gestión vinculados a esta ficha.'}</td></tr>}</tbody>
          </table></div>
        </div>
      </section>

      <section className="view" id="v-facturacion" hidden={vista !== 'facturacion'}>
        <div className="grid3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18 }}>
          <div className="panel"><h2>Facturado, últimos 12 meses</h2><div className="bars" id="bars">{ficha.facturacion.hayFacturas ? <Bars meses={ficha.facturacion.meses} a={ficha.facturacion.serie} /> : <p className="small muted" style={{ margin: 0 }}>sin dato: no hay facturas de este cliente en el panel.</p>}</div></div>
          <div className="panel"><h2>Cobros</h2><div className="cons" id="cobros">
            <div><span>Cobrado en {ficha.facturacion.anio}</span><span>{ficha.facturacion.cobrado == null ? 'sin dato' : eur(ficha.facturacion.cobrado)}</span></div>
            <div><span>Pendiente</span><span>{ficha.facturacion.pendiente == null ? 'sin dato' : <span className={`st ${ficha.facturacion.pendiente > 0 ? 'b' : ''}`}>{eur(ficha.facturacion.pendiente)}</span>}</span></div>
            <div><span>Forma de pago</span><span>{ficha.facturacion.formaPago || 'sin dato'}</span></div>
            <div><span>Plazo medio de cobro</span><span>sin dato</span></div>
          </div></div>
        </div>
        <div className="panel"><h2>Facturas</h2><div className="tablewrap"><table id="tF">
          <thead><tr><th>Factura</th><th>Fecha</th><th>Concepto</th><th className="n">Importe</th><th>Estado</th></tr></thead>
          <tbody>{ficha.facturacion.facturas.length ? ficha.facturacion.facturas.map((f) => <tr key={f.numero + f.fechaIso}><td className="num">{f.numero}</td><td>{f.fecha}</td><td>sin dato</td><td className="n">{eur(f.total, 2)}</td><td>{f.estado === 'Cobrada' ? <span className="st">Cobrada</span> : <span className="st b">{f.estado}</span>}</td></tr>)
            : <tr><td colSpan={5} className="muted">sin dato: no hay facturas de este cliente en el panel.</td></tr>}</tbody>
        </table></div></div>
      </section>

      <section className="view" id="v-negocios" hidden={vista !== 'negocios'}>
        <div className="panel"><h2>Negocios</h2><p className="help">Oportunidades de venta de este cliente, en el pipeline de cada producto. Los negocios cerrados de HubSpot aparecen como historial, sin pipeline.</p><div className="tablewrap"><table id="tN">
          <thead><tr><th>Negocio</th><th>Pipeline</th><th>Etapa</th><th className="n">Cuota anual</th><th>Siguiente paso</th></tr></thead>
          <tbody>{ficha.negocios.length ? ficha.negocios.map((d, i) => <tr key={i}><td>{d.nombre}</td><td>{d.historial ? `${d.pipeline} (HubSpot)` : d.pipeline}</td><td>{d.historial ? `Negocio de HubSpot ${d.resultado === 'GANADO' ? 'ganado' : 'perdido'}${d.fecha ? ` · ${d.fecha}` : ''}` : d.etapa}</td><td className="n">{d.importe == null ? 'sin dato' : eur(d.importe)}</td><td>{d.siguiente}</td></tr>)
            : <tr><td colSpan={5} className="muted">sin dato: este cliente no tiene negocios.</td></tr>}</tbody>
        </table></div></div>
      </section>

      <section className="view" id="v-personas" hidden={vista !== 'personas'}>
        <div className="panel"><h2>Personas de contacto</h2><div className="tablewrap"><table id="tP">
          <thead><tr><th>Nombre</th><th>Cargo y papel</th><th>Correo</th><th>Último contacto</th><th></th></tr></thead>
          <tbody>{ficha.personas.length ? ficha.personas.map((p) => <tr key={p.id}><td><a href={`/admin/crm/contactos/${encodeURIComponent(p.id)}`}>{p.nombre}</a></td><td>{p.papel}</td><td>{p.email || 'sin dato'}</td><td>{p.ultimo}</td><td><button className="btn small" type="button" data-open="mail" disabled={!p.email} onClick={() => setCajon({ kind: 'mail', para: p.id })}>Escribir</button></td></tr>)
            : <tr><td colSpan={5} className="muted">sin dato: no hay personas vinculadas.</td></tr>}</tbody>
        </table></div></div>
      </section>

      <section className="view" id="v-rentabilidad" hidden={vista !== 'rentabilidad'}>
        <div className="grid3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18 }}>
          <div className="panel"><h2>Ingreso y coste por mes</h2>
            {ficha.rentabilidad ? <>
              <div className="legend"><span><i style={{ background: 'var(--before)' }} />Ingreso</span><span><i style={{ background: 'var(--accent)' }} />Coste</span></div>
              <div className="bars" id="rbars">{ficha.rentabilidad.hay ? <Bars meses={ficha.rentabilidad.meses} a={ficha.rentabilidad.ingreso} b={ficha.rentabilidad.coste} /> : <p className="small muted" style={{ margin: 0 }}>sin dato: este cliente no aparece en los cálculos de Rentabilidad.</p>}</div>
              <p className="small muted" style={{ margin: '8px 0 0' }}><a href="/admin/rentabilidad">Abrir en Rentabilidad</a></p>
            </> : <p className="small muted" style={{ margin: 0 }}>{ficha.verMargen ? 'sin dato: no hay código ISP para cruzar con Rentabilidad.' : 'Los ingresos, costes y márgenes los ven gerencia y superadmin.'}</p>}
          </div>
          <div className="panel"><h2>Subida de precios 2027</h2><div className="cons" id="sub">
            {ficha.subida ? <>
              <div><span>Subida propuesta</span><span>+{pctTxt(ficha.subida.pctMedio)}</span></div>
              <div><span>Subida al mes</span><span>{eur(ficha.subida.subidaMes, 2)}</span></div>
              <div><span>Subida al año</span><span>{eur(ficha.subida.subidaAnio, 2)}</span></div>
              <div><span>Aviso al cliente</span><span>{ficha.subida.fechaLimiteAviso ? `antes del ${ficha.subida.fechaLimiteAviso}` : 'sin dato'}</span></div>
              <div><span>En vigor desde</span><span>{ficha.subida.fechaEfecto || 'sin dato'}</span></div>
              <div><span>Estado</span><span className="st">Escenario aprobado</span></div>
            </> : <>
              <div><span>Subida propuesta</span><span>sin propuesta</span></div>
              <div><span>Estado</span><span className="st w">No hay escenario aprobado</span></div>
            </>}
          </div><div className="row" style={{ marginTop: 12 }}><a className="btn small" href="/admin/subida-precios">Abrir en el simulador</a><button className="btn small primary" type="button" data-open="ai" disabled={!ficha.subida} onClick={() => setCajon({ kind: 'ai', objetivo: 'Avisar de la actualización de tarifas de 2027' })}>Preparar aviso con IA</button></div></div>
        </div>
      </section>
    </main>

    {cajon && <Drawer key={`${cajon.kind}-${cajon.para || ''}-${cajon.objetivo || ''}`} cajon={cajon} ficha={ficha} m365={m365} puedeEscribir={puedeEscribir} onClose={() => setCajon(null)} onOpen={setCajon} toast={toast} />}
    <div className="toast" id="toast" hidden={!toastMsg}>{toastMsg}</div>
  </>
}

function FragmentKv({ k, v }: { k: string; v: string }) {
  return <><dt>{k}</dt><dd>{v}</dd></>
}

function Drawer({ cajon, ficha, m365, puedeEscribir, onClose, onOpen, toast }: { cajon: NonNullable<Cajon>; ficha: Ficha; m365: M365; puedeEscribir: boolean; onClose: () => void; onOpen: (c: Cajon) => void; toast: (m: string) => void }) {
  const conEmail = ficha.personas.filter((p) => p.email)
  const [para, setPara] = useState<string>(cajon.para && conEmail.some((p) => p.id === cajon.para) ? cajon.para : conEmail[0]?.id || '')
  const outlookListo = m365.conexion.enabled && m365.conexion.connected && Boolean(m365.conexion.mail)
  const [viaOutlook, setViaOutlook] = useState(m365.conexion.enabled)
  const [asunto, setAsunto] = useState(cajon.asunto || '')
  const [objetivo, setObjetivo] = useState(cajon.objetivo || '')
  const [cuerpo, setCuerpo] = useState('')
  const [borradorIa, setBorradorIa] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [avisosIa, setAvisosIa] = useState<string[] | null>(null)
  const isAi = cajon.kind === 'ai'
  async function proponer() {
    setError(null)
    if (!para) return setError('Elige a quién escribes (la persona necesita correo).')
    const obj = objetivo.trim() || 'Correo de seguimiento'
    setOcupado('ia')
    try {
      const qs = new URLSearchParams({ objetivo: obj, tono: 'cercano' })
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(para)}/m365/borrador?${qs}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.asunto) throw new Error(d.error || 'No se pudo generar el borrador.')
      setAsunto(d.asunto); setCuerpo(d.cuerpo); setBorradorIa(true); setAvisosIa(Array.isArray(d.avisos) ? d.avisos : [])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el borrador.') } finally { setOcupado(null) }
  }
  useEffect(() => { if (isAi && para) void proponer() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function enviar() {
    setError(null)
    const p = conEmail.find((x) => x.id === para)
    if (!p?.email) return setError('Elige a quién escribes (la persona necesita correo).')
    if (!asunto.trim()) return setError('Escribe el asunto del correo.')
    if (!cuerpo.trim()) return setError('Escribe el contenido del correo.')
    if (viaOutlook && !outlookListo) return setError('Conecta tu Outlook con permiso de correo o elige «Buzón corporativo».')
    setOcupado('enviar')
    try {
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(p.id)}/actividades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CORREO', clientRequestId: reqId(), title: asunto.trim(), description: cuerpo, direction: 'SALIENTE', to: [p.email], viaOutlook: viaOutlook && outlookListo, borradorIa }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo enviar el correo.')
      toast(d.isolation === 'no_enviado' ? 'Pruebas: no se ha enviado; queda registrado en la ficha.' : d.isolation === 'desviado' ? 'Pruebas: enviado a la dirección de prueba.' : 'Correo enviado y registrado en la ficha.')
      onClose(); setTimeout(() => location.reload(), 700)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar el correo.') } finally { setOcupado(null) }
  }
  // Reunión
  const manana = new Date(Date.now() + 86_400_000)
  const [titulo, setTitulo] = useState(`${ficha.empresa.nombre} · reunión`)
  const [fecha, setFecha] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(manana))
  const [hora, setHora] = useState('10:00')
  const [dur, setDur] = useState('30')
  const [invitados, setInvitados] = useState<string[]>(conEmail[0] ? [conEmail[0].id] : [])
  const [enOutlook, setEnOutlook] = useState(m365.conexion.enabled)
  const [teams, setTeams] = useState(m365.conexion.enabled)
  async function crearReunion() {
    setError(null)
    const ids = invitados.length ? invitados : ficha.personas[0] ? [ficha.personas[0].id] : []
    if (!ids.length) return setError('Añade antes una persona a la ficha.')
    if (!titulo.trim()) return setError('Escribe el título de la reunión.')
    const cuandoD = new Date(`${fecha}T${hora}:00`)
    if (Number.isNaN(cuandoD.getTime())) return setError('Revisa la fecha y la hora.')
    setOcupado('reunion')
    try {
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(ids[0])}/actividades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'REUNION', clientRequestId: reqId(), title: titulo.trim(), description: `Reunión con ${ficha.empresa.nombre}: ${titulo.trim()}`, activityDate: cuandoD.toISOString(), durationMinutes: Number(dur), contactIds: ids.slice(1), syncOutlook: enOutlook, onlineMeeting: enOutlook && teams, inviteAttendees: enOutlook }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo programar la reunión.')
      toast('Reunión guardada en la ficha.'); onClose(); setTimeout(() => location.reload(), 700)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo programar la reunión.') } finally { setOcupado(null) }
  }
  const sinPermiso = !puedeEscribir ? <div className="notice">No tienes permiso para escribir desde el CRM.</div> : null
  if (cajon.kind === 'meet') return <div className="drawer" id="drawer" role="dialog" aria-label="Redactar">
    <div className="row" style={{ justifyContent: 'space-between' }}><h2>Nueva reunión</h2><button className="btn ghost" type="button" data-close onClick={onClose}>✕</button></div>
    {sinPermiso}
    <label>Título</label><input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
    <label>Cuándo</label><div className="row"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ flex: '1 1 140px' }} /><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ flex: '1 1 90px' }} /><select value={dur} onChange={(e) => setDur(e.target.value)} style={{ flex: '1 1 100px' }}><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 h</option></select></div>
    <label>Invitados</label><select multiple size={3} value={invitados} onChange={(e) => setInvitados([...e.target.selectedOptions].map((o) => o.value))}>{conEmail.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
    <label className="chk" style={{ display: 'flex', color: 'var(--fg)' }}><input type="checkbox" checked={enOutlook} disabled={!m365.conexion.enabled} onChange={(e) => setEnOutlook(e.target.checked)} style={{ width: 'auto' }} /> Crear en mi calendario de Outlook</label>
    <label className="chk" style={{ display: 'flex', color: 'var(--fg)' }}><input type="checkbox" checked={teams} disabled={!enOutlook} onChange={(e) => setTeams(e.target.checked)} style={{ width: 'auto' }} /> Añadir reunión de Microsoft Teams</label>
    {m365.conexion.enabled && !m365.conexion.connected && <p className="small muted"><a href={m365.connectUrl}>Conectar mi Outlook</a> para crear la reunión en tu calendario.</p>}
    {m365.aviso && <div className="notice">Pruebas: los invitados se cambian por la dirección de prueba.</div>}
    {error && <div className="notice">{error}</div>}
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" type="button" data-close onClick={onClose}>Cancelar</button><button className="btn primary" type="button" disabled={!puedeEscribir || ocupado != null} onClick={crearReunion}>{ocupado ? 'Creando…' : 'Crear reunión'}</button></div>
  </div>
  return <div className="drawer" id="drawer" role="dialog" aria-label="Redactar">
    <div className="row" style={{ justifyContent: 'space-between' }}><h2>{isAi ? 'Correo con IA' : 'Nuevo correo'}</h2><button className="btn ghost" type="button" data-close onClick={onClose}>✕</button></div>
    {sinPermiso}
    {m365.aviso && <div className="notice">Pruebas: los correos se desvían a la dirección de prueba; ningún cliente los recibe.</div>}
    <label>Enviar desde</label><div className="seg" role="group"><button type="button" aria-pressed={viaOutlook} disabled={!m365.conexion.enabled} onClick={() => setViaOutlook(true)}>Mi Outlook</button><button type="button" aria-pressed={!viaOutlook} onClick={() => setViaOutlook(false)}>Buzón corporativo</button></div>
    {viaOutlook && outlookListo && <p className="small muted" style={{ margin: '6px 0 0' }}>{m365.conexion.email} · queda en Enviados</p>}
    {viaOutlook && m365.conexion.enabled && !outlookListo && <p className="small muted" style={{ margin: '6px 0 0' }}><a href={m365.connectUrl}>{m365.conexion.connected ? 'Conceder permiso de correo' : 'Conectar mi Outlook'}</a> para enviar desde tu buzón.</p>}
    {!viaOutlook && <p className="small muted" style={{ margin: '6px 0 0' }}>{m365.corporativo}</p>}
    <label>Para</label><select value={para} onChange={(e) => setPara(e.target.value)}>{conEmail.length ? conEmail.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.papel !== 'sin dato' ? ` · ${p.papel}` : ''}</option>) : <option value="">sin dato: ninguna persona con correo</option>}</select>
    <label>Asunto</label><input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
    {isAi && <><label>Qué quieres decir (opcional)</label><input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /><p className="small muted" style={{ margin: '6px 0 0' }}>Usa: la conversación con el cliente, las reuniones, los contratos y la facturación. Nunca costes ni márgenes.</p></>}
    <label>Mensaje</label><textarea value={ocupado === 'ia' ? 'Redactando…' : cuerpo} onChange={(e) => { setCuerpo(e.target.value) }} />
    {avisosIa && <p className="small muted" style={{ margin: '6px 0 0' }}><b>Borrador propuesto por IA.</b> Revísalo antes de enviar.{avisosIa.length ? ` ${avisosIa.join(' ')}` : ''}</p>}
    {error && <div className="notice">{error}</div>}
    <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>{isAi ? <button className="btn" type="button" disabled={ocupado != null} onClick={proponer}>Otra versión</button> : <button className="btn" type="button" data-open="ai" onClick={() => onOpen({ kind: 'ai', para, asunto })}>Redactar con IA</button>}<div className="row"><button className="btn" type="button" data-close onClick={onClose}>Cancelar</button><button className="btn primary" type="button" disabled={!puedeEscribir || ocupado != null} onClick={enviar}>{ocupado === 'enviar' ? 'Enviando…' : 'Enviar'}</button></div></div>
    <p className="small muted">Queda en tus Enviados de Outlook y en esta ficha. Las respuestas del cliente aparecen en la actividad.</p>
  </div>
}
