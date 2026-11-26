'use client'
/**
 * Área 1 · Ficha de cliente del CRM. Marcado, clases y textos copiados de maqueta_crm_ficha_cliente_aprobada.html;
 * los datos de ejemplo se sustituyen por los reales (FichaCliente, lib/area1-ficha-cliente.ts) y lo que falta sale «sin dato».
 * Correo/IA/Outlook conservan las rutas de contacto. La actividad local usa POST de empresa, con persona opcional.
 * La IA solo propone: el envío lo hace siempre la persona con «Enviar».
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EventoFicha, FichaCliente as Ficha } from '@/lib/area1-ficha-cliente'
import type { EstadoMesFicha, FotoFichaRentabilidad } from '@/lib/area1-ficha-rentabilidad'
import { isM365LegacyPending, M365_LEGACY_PENDING_MESSAGE } from '@/lib/m365-legacy-policy'

type Conexion = { enabled: boolean; connected: boolean; email: string | null; mail?: boolean; m365?: boolean; envios?: boolean }
type M365 = { aviso: string | null; conexion: Conexion; corporativo: string; connectUrl: string }
type Vista = 'resumen' | 'actividad' | 'contratos' | 'facturacion' | 'negocios' | 'personas' | 'rentabilidad'
const VISTAS: Vista[] = ['resumen', 'actividad', 'contratos', 'facturacion', 'negocios', 'personas', 'rentabilidad']
type Cajon = null | { kind: 'mail' | 'ai' | 'meet'; para?: string | null; asunto?: string; objetivo?: string }
const eur = (v: number, d = 0) => `${v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
const ICON: Record<string, string> = { mail: '@', meet: '▣', isp: 'ISP', note: 'N' }
const FIL: Array<[string, string]> = [['all', 'Todo'], ['mail', 'Correos'], ['meet', 'Reuniones'], ['note', 'Notas y llamadas'], ['isp', 'ISP Gestión']]
const reqId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ficha-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const pctTxt = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
const mesTxt = (m: string) => `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** Defensa visual: mantiene importes y null entregados, nunca dibuja meses futuros. */
function graficoFacturadoFicha(facturacion: Ficha['facturacion'], hoyIso: string) {
  const corte = hoyIso?.slice(0, 7)
  const points = facturacion.meses.flatMap((mes, i) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(mes) && corte && mes <= corte ? [{ mes, value: facturacion.serie[i] ?? null }] : [])
  return { meses: points.map(p => p.mes), serie: points.map(p => p.value) }
}

function Bars({ meses, a, b, fotos, estados }: { meses: string[]; a: Array<number | null>; b?: Array<number | null>; fotos?: Array<FotoFichaRentabilidad | null>; estados?: EstadoMesFicha[] }) {
  // Comparar ingreso/coste sólo cuando ambos constan en la foto. null nunca significa cero.
  const conocido = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
  const disponibles = meses.map((_, i) => conocido(a[i]) && (!b || conocido(b[i])) && (!fotos || Boolean(fotos[i])) && (!estados || estados[i] === 'DISPONIBLE'))
  const motivo = (i: number) => estados?.[i] === 'SIN_VINCULO' ? 'sin vínculo ISP' : estados?.[i] === 'SIN_FOTO' ? 'sin foto preparada' : estados?.[i] === 'SIN_CLIENTE' ? 'cliente ausente en la foto' : estados?.[i] === 'SIN_COSTE' ? 'sin coste conocido' : 'datos incompletos'
  const huecos = meses.map((m, i) => !disponibles[i] ? `${m}: sin dato (${motivo(i)})` : null).filter(Boolean)
  if (!disponibles.some(Boolean)) return <p className="small muted" style={{ margin: 0 }}>{huecos.length ? huecos.join(' · ') : 'sin dato'}</p>
  const valores = meses.flatMap((_, i) => disponibles[i] ? [a[i]!, ...(b ? [b[i]!] : [])] : [])
  const min = Math.min(0, ...valores) * 1.1, max = Math.max(0, ...valores) * 1.1
  const W = 820, H = 200, pl = 40, pb = 24, bw = (W - pl) / meses.length
  const y = (v: number) => H - pb - (H - pb - 10) * (v - min) / (max - min || 1)
  const cero = y(0)
  const MES = meses.map((m) => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m.slice(5, 7)) - 1])
  return <><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico por mes">
    {[0, 0.5, 1].map((t) => { const valor = min + (max - min || 1) * t, pos = y(valor); return <g key={t}><line x1={pl} x2={W} y1={pos} y2={pos} stroke="var(--line)" /><text x={pl - 6} y={pos + 4} textAnchor="end">{Math.round(valor / 1000)}k</text></g> })}
    {meses.map((m, i) => {
      const x = pl + i * bw + bw * 0.15, w = b ? bw * 0.33 : bw * 0.7
      const foto = fotos?.[i], origen = foto ? ` · foto ${foto.kind} v${foto.version} (${foto.id})` : ''
      return <g key={i}>
        {disponibles[i] && <rect x={x} y={Math.min(cero, y(a[i]!))} width={w} height={Math.abs(cero - y(a[i]!))} rx="2" fill="var(--before)"><title>{`${b ? 'Ingreso ' : ''}${m}: ${eur(a[i]!)}${origen}`}</title></rect>}
        {disponibles[i] && b && <rect x={x + w + 2} y={Math.min(cero, y(b[i]!))} width={w} height={Math.abs(cero - y(b[i]!))} rx="2" fill="var(--accent)"><title>{`Coste ${m}: ${eur(b[i]!)}${origen}`}</title></rect>}
        <text x={pl + i * bw + bw / 2} y={H - 6} textAnchor="middle"><title>{`${m}${disponibles[i] ? origen : `: sin dato (${motivo(i)})`}`}</title>{MES[i]} {m.slice(2, 4)}</text>
      </g>
    })}
  </svg>{huecos.length > 0 && <p className="small muted" style={{ margin: '6px 0 0' }}>{huecos.join(' · ')}</p>}</>
}

function Timeline({ eventos, onOpen, pie, conexion }: { eventos: EventoFicha[]; onOpen: (c: Cajon) => void; pie?: ReactNode; conexion: Conexion }) {
  const [filter, setFilter] = useState('all')
  const lista = eventos.filter((e) => filter === 'all' || e.cat === filter)
  return <>
    <div className="chipsf">{FIL.map((f) => <button key={f[0]} type="button" data-f={f[0]} aria-pressed={f[0] === filter} onClick={() => setFilter(f[0])}>{f[1]}</button>)}</div>
    {pie}
    <div className="tl">
      {lista.length === 0 && <p className="small muted" style={{ margin: '8px 0 0' }}>sin dato: no hay actividad registrada{filter === 'all' ? '' : ' de este tipo'}.</p>}
      {lista.map((e) => <div className="ev" key={e.id}><span className={`ic ${e.cat}`}>{ICON[e.cat]}</span><div>
        <div className="h"><b>{e.titulo}</b><span className={`src ${e.fuente === 'Outlook' ? 'o' : ''}`}>{e.fuente}</span>{e.etiqueta && <span className="src">{e.etiqueta}</span>}<span className="when">{e.cuando}</span></div>
        <div className="x">{e.tipo} · {e.quien}</div>
        {e.texto && <div className="x" style={{ color: 'var(--fg)' }}>{e.texto}</div>}
        {conexion.envios !== false && e.acciones.length > 0 && <div className="acts">
          <button className="btn small" type="button" onClick={() => onOpen({ kind: 'mail', para: e.contactoId, asunto: `Re: ${e.titulo}` })}>Responder</button>
          {conexion.m365 !== false && <button className="btn small" type="button" data-open="ai" onClick={() => onOpen({ kind: 'ai', para: e.contactoId, asunto: `Re: ${e.titulo}`, objetivo: 'Responder a su último correo' })}>Responder con IA</button>}
        </div>}
      </div></div>)}
    </div>
  </>
}

export default function FichaCliente({ ficha, m365, puedeEscribir, puedeEscribirContactos = puedeEscribir }: { ficha: Ficha; m365: M365; puedeEscribir: boolean; puedeEscribirContactos?: boolean }) {
  const [vista, setVista] = useState<Vista>('resumen')
  const [cajon, setCajon] = useState<Cajon>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useCallback((m: string) => { setToastMsg(m); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 2600) }, [])
  // Los callbacks retenidos consultan las props vigentes, no la puerta del render que los creó.
  const conexionVigente = useRef(m365.conexion)
  conexionVigente.current = m365.conexion
  const abrirCajon = useCallback((c: Cajon) => {
    if (c && c.kind !== 'meet' && (conexionVigente.current.envios === false || (c.kind === 'ai' && conexionVigente.current.m365 === false))) return toast(M365_LEGACY_PENDING_MESSAGE)
    setCajon(c)
  }, [toast])
  const show = useCallback((v: string) => { const x = (VISTAS.includes(v as Vista) ? v : 'resumen') as Vista; setVista(x); history.replaceState(null, '', `#${x}`) }, [])
  useEffect(() => { const h = location.hash.slice(1); if (VISTAS.includes(h as Vista)) setVista(h as Vista) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCajon(null) }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [])

  // «Lo que hay que saber» (IA, caché diaria)
  const [ai, setAi] = useState<{ puntos: string[] | null; error: string | null }>({ puntos: null, error: null })
  useEffect(() => {
    if (conexionVigente.current.envios === false || conexionVigente.current.m365 === false) {
      setAi({ puntos: null, error: M365_LEGACY_PENDING_MESSAGE })
      return
    }
    let vivo = true
    const controller = new AbortController()
    setAi({ puntos: null, error: null })
    fetch(`/api/admin/crm/empresas/${encodeURIComponent(ficha.empresa.id)}/resumen-ia`, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!vivo || conexionVigente.current.envios === false || conexionVigente.current.m365 === false) return; if (!r.ok || !Array.isArray(d.puntos)) setAi({ puntos: null, error: d.error || 'Resumen con IA no disponible.' }); else setAi({ puntos: d.puntos, error: null }) })
      .catch(() => vivo && conexionVigente.current.envios !== false && conexionVigente.current.m365 !== false && setAi({ puntos: null, error: 'Resumen con IA no disponible.' }))
    return () => { vivo = false; controller.abort() }
  }, [ficha.empresa.id, m365.conexion.envios, m365.conexion.m365])

  // Correos recibidos de Outlook: solo lectura, se piden al pulsar y no se guardan en la ficha.
  const outlookCorreo = m365.conexion.enabled && m365.conexion.m365 !== false && m365.conexion.connected && !!m365.conexion.mail
  const [recibidos, setRecibidos] = useState<{ estado: 'idle' | 'cargando' | 'ok' | 'error'; eventos: EventoFicha[]; msg: string | null }>({ estado: 'idle', eventos: [], msg: null })
  async function cargarRecibidos() {
    const conexion = conexionVigente.current
    if (!conexion.enabled || conexion.m365 === false || !conexion.connected || !conexion.mail) return
    setRecibidos((r) => ({ ...r, estado: 'cargando', msg: null }))
    try {
      const r = await fetch(`/api/admin/crm/empresas/${encodeURIComponent(ficha.empresa.id)}/correos-recibidos`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !Array.isArray(d.eventos)) throw new Error(d.error || 'No se han podido leer los correos de Outlook.')
      const n = d.eventos.length
      setRecibidos({ estado: 'ok', eventos: d.eventos, msg: d.direcciones === 0 ? 'sin dato: ninguna persona de la ficha tiene email.' : n ? `${n} correo${n === 1 ? '' : 's'} recibido${n === 1 ? '' : 's'} en tu Outlook (últimos ${d.dias} días). Solo lectura: no se guardan en la ficha.` : `Ningún correo de estas personas en tu Outlook en los últimos ${d.dias} días.` })
    } catch (e) { setRecibidos({ estado: 'error', eventos: [], msg: e instanceof Error ? e.message : 'No se han podido leer los correos de Outlook.' }) }
  }
  const eventos = useMemo(() => recibidos.eventos.length ? [...ficha.eventos, ...recibidos.eventos].sort((a, b) => b.fechaIso.localeCompare(a.fechaIso)) : ficha.eventos, [ficha.eventos, recibidos.eventos])
  const pieOutlook = !m365.conexion.enabled || m365.conexion.m365 === false ? null
    : !outlookCorreo ? <p className="small muted" style={{ margin: '6px 0 0' }}><a href={m365.connectUrl}>{m365.conexion.connected ? 'Conceder permiso de correo' : 'Conectar mi Outlook'}</a> para ver aquí los correos que te envía el cliente (solo lectura).</p>
      : <p className="small muted" style={{ margin: '6px 0 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn small" type="button" onClick={cargarRecibidos} disabled={recibidos.estado === 'cargando'}>{recibidos.estado === 'cargando' ? 'Leyendo tu Outlook…' : recibidos.estado === 'idle' ? 'Ver correos recibidos en mi Outlook' : 'Actualizar correos recibidos'}</button>
        {recibidos.msg && <span>{recibidos.msg}</span>}
      </p>

  // Compositor
  const tipos = ['Nota', 'Llamada', 'Correo', 'Reunión', 'Tarea'] as const
  const [tipoComp, setTipoComp] = useState<(typeof tipos)[number]>('Nota')
  const [textoComp, setTextoComp] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [personaComp, setPersonaComp] = useState('')
  async function guardarComp() {
    if (tipoComp === 'Correo') return abrirCajon({ kind: 'mail' })
    if (tipoComp === 'Reunión') return abrirCajon({ kind: 'meet' })
    if (guardando) return
    if (!puedeEscribir) return toast('No tienes permiso para registrar actividad.')
    if (personaComp && (!puedeEscribirContactos || !ficha.personas.some(p => p.id === personaComp))) return toast('No puedes asociar esta persona a la actividad.')
    if (textoComp.trim().length < 2) return toast('Escribe el texto antes de guardar.')
    setGuardando(true)
    try {
      const manana = new Date(Date.now() + 86_400_000)
      const body = tipoComp === 'Nota' ? { type: 'NOTA', description: textoComp.trim() }
        : tipoComp === 'Llamada' ? { type: 'LLAMADA', direction: 'SALIENTE', result: 'CONTACTADO', description: textoComp.trim() }
          : { type: 'TAREA', title: textoComp.trim().slice(0, 250), description: textoComp.trim(), activityDate: new Date().toISOString(), followUp: { dueAt: manana.toISOString(), title: textoComp.trim().slice(0, 250), priority: 'MEDIA' } }
      const r = await fetch(`/api/admin/crm/empresas/${encodeURIComponent(ficha.empresa.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'registrar_actividad', clientRequestId: reqId(), contactId: personaComp || null, ...body }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo guardar.')
      setTextoComp(''); toast('Guardado en la ficha.'); setTimeout(() => location.reload(), 600)
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setGuardando(false) }
  }

  // Contratos
  const [qc, setQc] = useState(''); const [fc, setFc] = useState('')
  const contratos = useMemo(() => ficha.contratos.filter((c) => (!fc || c.estado === fc) && (!qc || [c.codigo, c.producto, c.sede, c.estado].join(' ').toLowerCase().includes(qc.toLowerCase()))), [ficha.contratos, qc, fc])
  const facturado = graficoFacturadoFicha(ficha.facturacion, ficha.hoyIso)
  const mesMargen = ficha.verMargen ? ficha.rentabilidad?.mes : null
  const fotoMargen = ficha.rentabilidad?.snapshot
  const origenMargen = fotoMargen && fotoMargen.month === mesMargen ? `foto ${fotoMargen.kind} v${fotoMargen.version}` : 'sin foto preparada'
  const detalleMargen = mesMargen ? `${mesTxt(mesMargen)} · mes cerrado por calendario · ${origenMargen}${fotoMargen?.kind === 'PROYECCION' ? ' · no acredita cierre certificado' : ''}` : 'sin dato del último mes cerrado por calendario'

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
            {m365.conexion.envios !== false && <button className="btn primary" type="button" data-open="mail" onClick={() => abrirCajon({ kind: 'mail' })}>Escribir correo</button>}
            <button className="btn" type="button" data-open="meet" onClick={() => abrirCajon({ kind: 'meet' })}>Nueva reunión</button>
            {m365.conexion.envios !== false && m365.conexion.m365 !== false && <button className="btn" type="button" data-open="ai" onClick={() => abrirCajon({ kind: 'ai' })}>Redactar con IA</button>}
            <select className="f" aria-label="Más acciones" value="Más" onChange={(ev) => mas(ev.target.value)}><option>Más</option><option>Nuevo negocio</option><option>Nueva tarea</option><option>Registrar llamada</option><option>Añadir persona</option><option>Editar datos</option><option>Exportar ficha</option></select>
          </div>
        </div>
        <nav className="tabs" aria-label="Secciones de la ficha">
          {([['resumen', 'Resumen', null], ['actividad', 'Actividad', eventos.length], ['contratos', 'Contratos y servicios', ficha.contratos.length], ['facturacion', 'Facturación', null], ['negocios', 'Negocios', ficha.negocios.length], ['personas', 'Personas', ficha.personas.length], ['rentabilidad', 'Rentabilidad y subida', null]] as Array<[Vista, string, number | null]>).map(([v, t, n]) =>
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
              <h2>Lo que hay que saber {m365.conexion.envios !== false && m365.conexion.m365 !== false && <span className="small muted" style={{ fontWeight: 400, fontFamily: 'var(--f-body)' }}>· resumen con IA, actualizado hoy</span>}</h2>
              <ul id="aiSum">
                {m365.conexion.envios === false || m365.conexion.m365 === false ? <li role="status" aria-live="polite">{M365_LEGACY_PENDING_MESSAGE}</li> : ai.puntos ? ai.puntos.map((x, i) => <li key={i}>{x}</li>) : <li>{ai.error || 'Preparando el resumen…'}</li>}
              </ul>
              <div className="row">{m365.conexion.envios !== false && m365.conexion.m365 !== false && <button className="btn small primary" type="button" data-open="ai" onClick={() => abrirCajon({ kind: 'ai', objetivo: 'Correo de seguimiento' })}>Proponer correo de seguimiento</button>}<button className="btn small" type="button" onClick={() => abrirCajon({ kind: 'meet' })}>Preparar la próxima reunión</button>{m365.conexion.envios !== false && m365.conexion.m365 !== false && <span className="small muted">La IA propone; tú revisas y envías.</span>}</div>
            </div>
            <div className="panel">
              <h2>Actividad</h2>
              <div className="composer">
                <div className="seg" role="group" aria-label="Tipo">{tipos.filter((t) => t !== 'Correo' || m365.conexion.envios !== false).map((t) => <button key={t} type="button" aria-pressed={tipoComp === t} onClick={() => setTipoComp(t)}>{t}</button>)}</div>
                {tipoComp !== 'Correo' && tipoComp !== 'Reunión' && <label className="small">Persona (opcional)<select aria-label="Persona de la actividad (opcional)" value={personaComp} disabled={!puedeEscribirContactos || guardando} onChange={(ev) => setPersonaComp(ev.target.value)}><option value="">Solo empresa · sin persona</option>{ficha.personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>}
                <textarea placeholder={tipoComp === 'Tarea' ? 'Escribe la tarea (vence mañana).' : tipoComp === 'Llamada' ? 'Resume la llamada.' : tipoComp === 'Correo' || tipoComp === 'Reunión' ? `Pulsa Guardar para abrir el panel de ${tipoComp === 'Correo' ? 'correo' : 'reunión'}.` : 'Escribe una nota. Usa @ para mencionar a un compañero.'} value={textoComp} onChange={(ev) => setTextoComp(ev.target.value)} />
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn small primary" type="button" disabled={guardando || (tipoComp === 'Correo' ? !puedeEscribirContactos : !puedeEscribir)} onClick={guardarComp}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
              </div>
              <Timeline eventos={eventos} onOpen={abrirCajon} pie={pieOutlook} conexion={m365.conexion} />
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
              <div id="people">{ficha.personas.length ? ficha.personas.slice(0, 6).map((p) => <div className="person" key={p.id}><span className="av">{p.iniciales}</span><div style={{ minWidth: 0 }}><div>{p.nombre}</div><div className="role">{p.papel}</div></div>{m365.conexion.envios !== false && <button className="btn small" type="button" data-open="mail" disabled={!p.email} onClick={() => abrirCajon({ kind: 'mail', para: p.id })}>Escribir</button>}</div>) : <p className="small muted" style={{ margin: 0 }}>sin dato: no hay personas vinculadas.</p>}</div>
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
        <div className="panel"><h2>Toda la actividad</h2><p className="help">Correos de Outlook, reuniones, llamadas, notas, tareas, cambios en ISP Gestión e historial importado de HubSpot.</p><Timeline eventos={eventos} onOpen={abrirCajon} pie={pieOutlook} conexion={m365.conexion} /></div>
      </section>

      <section className="view" id="v-contratos" hidden={vista !== 'contratos'}>
        <div className="panel">
          <h2>Contratos y servicios</h2>
          <p className="help">Vienen de ISP Gestión. Margen del último mes cerrado por calendario, del módulo de Rentabilidad.{ficha.verMargen ? ` ${detalleMargen}. El tipo de foto no certifica el cierre del mes.` : ' Los márgenes los ven gerencia y superadmin.'}</p>
          <div className="row" style={{ marginBottom: 10 }}><input className="search" type="search" placeholder="Buscar contrato, sede o producto" id="qc" value={qc} onChange={(ev) => setQc(ev.target.value)} /><select className="f" id="fc" value={fc} onChange={(ev) => setFc(ev.target.value)}><option value="">Todos los estados</option><option>Activo</option><option>Baja</option></select></div>
          <div className="tablewrap"><table id="tC">
            <thead><tr><th>Contrato</th><th>Producto</th><th>Sede</th><th className="n">Cuota/mes</th><th>Estado ISP</th><th>Fin permanencia</th>{ficha.verMargen && <th className="n" title={detalleMargen}>Margen{mesMargen ? ` ${mesTxt(mesMargen)}` : ''}</th>}</tr></thead>
            <tbody>{contratos.length ? contratos.map((c) => <tr key={c.codigo}><td className="num">{c.codigo}</td><td>{c.producto}</td><td>{c.sede}</td><td className="n">{c.cuota == null ? 'sin dato' : eur(c.cuota, 2)}</td><td><span className={`st ${c.estado === 'Baja' ? 'o' : ''}`}>{c.estado}</span></td><td>{c.finPermanencia}</td>{ficha.verMargen && <td className="n">{c.margenPct == null ? 'sin dato' : <span className={`m ${c.margenPct < 0 ? 'bad' : c.margenPct < 20 ? 'low' : 'ok'}`}>{pctTxt(c.margenPct)}</span>}</td>}</tr>)
              : <tr><td colSpan={ficha.verMargen ? 7 : 6} className="muted">sin dato: {ficha.contratos.length ? 'ningún contrato coincide con el filtro.' : 'no hay contratos de ISP Gestión vinculados a esta ficha.'}</td></tr>}</tbody>
          </table></div>
        </div>
      </section>

      <section className="view" id="v-facturacion" hidden={vista !== 'facturacion'}>
        <div className="grid3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18 }}>
          <div className="panel"><h2>Facturado, últimos 12 meses</h2><p className="small muted">El mes actual está abierto y es provisional. No se muestran meses futuros; sin dato no significa cero.</p><div className="bars" id="bars">{ficha.facturacion.hayFacturas ? <Bars meses={facturado.meses} a={facturado.serie} /> : <p className="small muted" style={{ margin: 0 }}>sin dato: no hay facturas de este cliente en el panel.</p>}</div></div>
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
          <tbody>{ficha.personas.length ? ficha.personas.map((p) => <tr key={p.id}><td><a href={`/admin/crm/contactos/${encodeURIComponent(p.id)}`}>{p.nombre}</a></td><td>{p.papel}</td><td>{p.email || 'sin dato'}</td><td>{p.ultimo}</td><td>{m365.conexion.envios !== false && <button className="btn small" type="button" data-open="mail" disabled={!p.email} onClick={() => abrirCajon({ kind: 'mail', para: p.id })}>Escribir</button>}</td></tr>)
            : <tr><td colSpan={5} className="muted">sin dato: no hay personas vinculadas.</td></tr>}</tbody>
        </table></div></div>
      </section>

      <section className="view" id="v-rentabilidad" hidden={vista !== 'rentabilidad'}>
        <div className="grid3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18 }}>
          <div className="panel"><h2>Ingreso y coste por mes</h2>
            {ficha.rentabilidad ? <>
              <div className="legend"><span><i style={{ background: 'var(--before)' }} />Ingreso</span><span><i style={{ background: 'var(--accent)' }} />Coste</span></div>
              <p className="small muted">{detalleMargen}{ficha.rentabilidad.snapshot ? <> ({ficha.rentabilidad.snapshot.id}){ficha.rentabilidad.snapshot.createdAt ? ` · preparada ${ficha.rentabilidad.snapshot.createdAt}` : ''}.</> : '.'} El mes actual está abierto: no se muestra su coste provisional. El coste de los meses cerrados por calendario incluye importes estimados cuando constan en la foto; los meses sin datos completos no se dibujan.</p>
              <div className="bars" id="rbars"><Bars meses={ficha.rentabilidad.meses} a={ficha.rentabilidad.ingreso} b={ficha.rentabilidad.coste} fotos={ficha.rentabilidad.fotos} estados={ficha.rentabilidad.estados} /></div>
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
          </div><div className="row" style={{ marginTop: 12 }}><a className="btn small" href="/admin/subida-precios">Abrir en el simulador</a>{m365.conexion.envios !== false && m365.conexion.m365 !== false && <button className="btn small primary" type="button" data-open="ai" disabled={!ficha.subida} onClick={() => abrirCajon({ kind: 'ai', objetivo: 'Avisar de la actualización de tarifas de 2027' })}>Preparar aviso con IA</button>}</div></div>
        </div>
      </section>
    </main>

    {cajon && <Drawer key={`${cajon.kind}-${cajon.para || ''}-${cajon.objetivo || ''}`} cajon={cajon} ficha={ficha} m365={m365} puedeEscribir={cajon.kind === 'meet' ? puedeEscribir : puedeEscribirContactos} puedeEscribirContactos={puedeEscribirContactos} onClose={() => setCajon(null)} onOpen={abrirCajon} toast={toast} />}
    <div className="toast" id="toast" hidden={!toastMsg}>{toastMsg}</div>
  </>
}

function FragmentKv({ k, v }: { k: string; v: string }) {
  return <><dt>{k}</dt><dd>{v}</dd></>
}

function Drawer({ cajon, ficha, m365, puedeEscribir, puedeEscribirContactos = puedeEscribir, onClose, onOpen, toast }: { cajon: NonNullable<Cajon>; ficha: Ficha; m365: M365; puedeEscribir: boolean; puedeEscribirContactos?: boolean; onClose: () => void; onOpen: (c: Cajon) => void; toast: (m: string) => void }) {
  const conEmail = ficha.personas.filter((p) => p.email)
  const [para, setPara] = useState<string>(cajon.para && conEmail.some((p) => p.id === cajon.para) ? cajon.para : conEmail[0]?.id || '')
  const conexionVigente = useRef(m365.conexion)
  conexionVigente.current = m365.conexion
  const propuestaVigente = useRef<AbortController | null>(null)
  const outlookListo = m365.conexion.enabled && m365.conexion.m365 !== false && m365.conexion.connected && Boolean(m365.conexion.mail)
  const [viaOutlook, setViaOutlook] = useState(m365.conexion.enabled)
  const [asunto, setAsunto] = useState(cajon.asunto || '')
  const [objetivo, setObjetivo] = useState(cajon.objetivo || '')
  const [cuerpo, setCuerpo] = useState('')
  const [borradorIa, setBorradorIa] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [avisosIa, setAvisosIa] = useState<string[] | null>(null)
  const isAi = cajon.kind === 'ai'
  // Se relee tras cada await: React puede sustituir la conexión durante la petición.
  const iaCerrada = () => conexionVigente.current.envios === false || conexionVigente.current.m365 === false
  async function proponer() {
    if (iaCerrada()) return setPendiente(true)
    setError(null)
    if (!para) return setError('Elige a quién escribes (la persona necesita correo).')
    const obj = objetivo.trim() || 'Correo de seguimiento'
    propuestaVigente.current?.abort()
    const controller = new AbortController()
    propuestaVigente.current = controller
    setOcupado('ia')
    try {
      const qs = new URLSearchParams({ objetivo: obj, tono: 'cercano' })
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(para)}/m365/borrador?${qs}`, { cache: 'no-store', signal: controller.signal })
      const d = await r.json().catch(() => ({}))
      if (controller.signal.aborted || iaCerrada()) return
      if (!r.ok || !d.asunto) throw new Error(d.error || 'No se pudo generar el borrador.')
      setAsunto(d.asunto); setCuerpo(d.cuerpo); setBorradorIa(true); setAvisosIa(Array.isArray(d.avisos) ? d.avisos : [])
    } catch (e) { if (!controller.signal.aborted && !iaCerrada()) setError(e instanceof Error ? e.message : 'No se pudo generar el borrador.') } finally { if (propuestaVigente.current === controller) setOcupado(null) }
  }
  useEffect(() => {
    if (conexionVigente.current.envios === false || conexionVigente.current.m365 === false) { propuestaVigente.current?.abort(); setOcupado(null); return }
    if (isAi && para) void proponer()
    return () => { propuestaVigente.current?.abort() }
  }, [m365.conexion.envios, m365.conexion.m365]) // eslint-disable-line react-hooks/exhaustive-deps
  function abrirIa() {
    if (conexionVigente.current.envios === false || conexionVigente.current.m365 === false) return setPendiente(true)
    onOpen({ kind: 'ai', para, asunto })
  }
  async function enviar() {
    if (conexionVigente.current.envios === false) return setPendiente(true)
    setError(null)
    setPendiente(false)
    const p = conEmail.find((x) => x.id === para)
    if (!p?.email) return setError('Elige a quién escribes (la persona necesita correo).')
    if (!asunto.trim()) return setError('Escribe el asunto del correo.')
    if (!cuerpo.trim()) return setError('Escribe el contenido del correo.')
    if (viaOutlook && !outlookListo && m365.conexion.envios !== false) return setError('Conecta tu Outlook con permiso de correo o elige «Buzón corporativo».')
    setOcupado('enviar')
    try {
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(p.id)}/actividades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CORREO', clientRequestId: reqId(), title: asunto.trim(), description: cuerpo, direction: 'SALIENTE', to: [p.email], viaOutlook, borradorIa }) })
      const d = await r.json().catch(() => ({}))
      if (isEnvioPendiente(d)) return setPendiente(true)
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
  const [invitados, setInvitados] = useState<string[]>([])
  // Al cerrar la salida CRM, una reunión nueva empieza sólo en la ficha.
  // Una elección Outlook posterior sigue siendo explícita y nunca se transforma en éxito local.
  const [enOutlook, setEnOutlook] = useState(m365.conexion.enabled && m365.conexion.envios !== false)
  const [teams, setTeams] = useState(m365.conexion.enabled && m365.conexion.envios !== false)
  async function crearReunion() {
    setError(null)
    setPendiente(false)
    if (!puedeEscribir || ocupado) return setError('No tienes permiso para registrar esta reunión.')
    if (enOutlook && conexionVigente.current.envios === false) return setPendiente(true)
    const ids = enOutlook && !invitados.length && conEmail[0] ? [conEmail[0].id] : invitados
    if (enOutlook && !ids.length) return setError('Elige una persona con correo para la reunión de Outlook.')
    if (ids.length && (!puedeEscribirContactos || ids.some(id => !ficha.personas.some(p => p.id === id)))) return setError('No puedes asociar estas personas a la reunión.')
    if (!titulo.trim()) return setError('Escribe el título de la reunión.')
    const cuandoD = new Date(`${fecha}T${hora}:00`)
    if (Number.isNaN(cuandoD.getTime())) return setError('Revisa la fecha y la hora.')
    setOcupado('reunion')
    try {
      const url = enOutlook ? `/api/admin/crm/contactos/${encodeURIComponent(ids[0])}/actividades` : `/api/admin/crm/empresas/${encodeURIComponent(ficha.empresa.id)}`
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(enOutlook ? {} : { action: 'registrar_actividad' }), type: 'REUNION', clientRequestId: reqId(), title: titulo.trim(), description: `Reunión con ${ficha.empresa.nombre}: ${titulo.trim()}`, activityDate: cuandoD.toISOString(), durationMinutes: Number(dur), contactIds: enOutlook ? ids.slice(1) : ids, syncOutlook: enOutlook, onlineMeeting: enOutlook && teams, inviteAttendees: enOutlook }) })
      const d = await r.json().catch(() => ({}))
      if (enOutlook && isEnvioPendiente(d)) return setPendiente(true)
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
    <label>Personas (opcionales en reunión local)</label><select aria-label="Personas de la reunión (opcionales)" multiple size={3} value={invitados} disabled={!puedeEscribirContactos} onChange={(e) => setInvitados([...e.target.selectedOptions].map((o) => o.value))}>{(enOutlook ? conEmail : ficha.personas).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
    {!enOutlook && <p className="small muted">Sin selección se registra solo en la empresa. No se crean eventos ni se envían invitaciones.</p>}
    <label className="chk" style={{ display: 'flex', color: 'var(--fg)' }}><input type="checkbox" checked={enOutlook} disabled={!m365.conexion.enabled} onChange={(e) => setEnOutlook(e.target.checked)} style={{ width: 'auto' }} /> Crear en mi calendario de Outlook</label>
    <label className="chk" style={{ display: 'flex', color: 'var(--fg)' }}><input type="checkbox" checked={teams} disabled={!enOutlook} onChange={(e) => setTeams(e.target.checked)} style={{ width: 'auto' }} /> Añadir reunión de Microsoft Teams</label>
    {m365.conexion.enabled && m365.conexion.m365 !== false && !m365.conexion.connected && <p className="small muted"><a href={m365.connectUrl}>Conectar mi Outlook</a> para crear la reunión en tu calendario.</p>}
    {(pendiente || (m365.conexion.envios === false && enOutlook)) && <div className="notice" role="status" aria-live="polite" style={{ background: '#eff6ff', color: '#1e3a8a' }}>{M365_LEGACY_PENDING_MESSAGE}</div>}
    {enOutlook && m365.aviso && <div className="notice">Pruebas: los invitados se cambian por la dirección de prueba.</div>}
    {error && <div className="notice">{error}</div>}
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" type="button" data-close onClick={onClose}>Cancelar</button><button className="btn primary" type="button" disabled={!puedeEscribir || ocupado != null} onClick={crearReunion}>{ocupado ? 'Creando…' : 'Crear reunión'}</button></div>
  </div>
  return <div className="drawer" id="drawer" role="dialog" aria-label="Redactar">
    <div className="row" style={{ justifyContent: 'space-between' }}><h2>{isAi ? 'Correo con IA' : 'Nuevo correo'}</h2><button className="btn ghost" type="button" data-close onClick={onClose}>✕</button></div>
    {sinPermiso}
    {(pendiente || m365.conexion.envios === false || (isAi && m365.conexion.m365 === false)) && <div className="notice" role="status" aria-live="polite" style={{ background: '#eff6ff', color: '#1e3a8a' }}>{M365_LEGACY_PENDING_MESSAGE}</div>}
    {m365.aviso && <div className="notice">Pruebas: los correos se desvían a la dirección de prueba; ningún cliente los recibe.</div>}
    <fieldset disabled={m365.conexion.envios === false || (isAi && m365.conexion.m365 === false)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <label>Enviar desde</label><div className="seg" role="group"><button type="button" aria-pressed={viaOutlook} disabled={!m365.conexion.enabled} onClick={() => setViaOutlook(true)}>Mi Outlook</button><button type="button" aria-pressed={!viaOutlook} onClick={() => setViaOutlook(false)}>Buzón corporativo</button></div>
    {viaOutlook && outlookListo && <p className="small muted" style={{ margin: '6px 0 0' }}>{m365.conexion.email} · queda en Enviados</p>}
    {viaOutlook && m365.conexion.envios !== false && m365.conexion.enabled && m365.conexion.m365 !== false && !outlookListo && <p className="small muted" style={{ margin: '6px 0 0' }}><a href={m365.connectUrl}>{m365.conexion.connected ? 'Conceder permiso de correo' : 'Conectar mi Outlook'}</a> para enviar desde tu buzón.</p>}
    {!viaOutlook && <p className="small muted" style={{ margin: '6px 0 0' }}>{m365.corporativo}</p>}
    <label>Para</label><select value={para} onChange={(e) => setPara(e.target.value)}>{conEmail.length ? conEmail.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.papel !== 'sin dato' ? ` · ${p.papel}` : ''}</option>) : <option value="">sin dato: ninguna persona con correo</option>}</select>
    <label>Asunto</label><input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
    {isAi && <><label>Qué quieres decir (opcional)</label><input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /><p className="small muted" style={{ margin: '6px 0 0' }}>Usa: la conversación con el cliente, las reuniones, los contratos y la facturación. Nunca costes ni márgenes.</p></>}
    <label>Mensaje</label><textarea value={ocupado === 'ia' ? 'Redactando…' : cuerpo} onChange={(e) => { setCuerpo(e.target.value) }} />
    {avisosIa && <p className="small muted" style={{ margin: '6px 0 0' }}><b>Borrador propuesto por IA.</b> Revísalo antes de enviar.{avisosIa.length ? ` ${avisosIa.join(' ')}` : ''}</p>}
    {error && <div className="notice">{error}</div>}
    <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>{m365.conexion.envios !== false && m365.conexion.m365 !== false && (isAi ? <button className="btn" type="button" disabled={ocupado != null} onClick={proponer}>Otra versión</button> : <button className="btn" type="button" data-open="ai" onClick={abrirIa}>Redactar con IA</button>)}<div className="row"><button className="btn" type="button" data-close onClick={onClose}>Cancelar</button><button className="btn primary" type="button" disabled={!puedeEscribir || ocupado != null} onClick={enviar}>{ocupado === 'enviar' ? 'Enviando…' : 'Enviar'}</button></div></div>
    </fieldset>
    {(m365.conexion.envios === false || (isAi && m365.conexion.m365 === false)) && <button className="btn" type="button" data-close onClick={onClose}>Cerrar</button>}
    {m365.conexion.envios !== false && <p className="small muted">Queda en tus Enviados de Outlook y en esta ficha. Las respuestas del cliente aparecen en la actividad.</p>}
  </div>
}

// Respuestas de acciones externas: el cierre nunca se interpreta como un éxito local.
function isEnvioPendiente(data: unknown): boolean {
  if (isM365LegacyPending(data)) return true
  if (!data || typeof data !== 'object') return false
  const body = data as { code?: unknown; codigo?: unknown; error?: unknown }
  return body.code === 'FINANCE_EXTERNAL_ACTIONS_DISABLED' || body.codigo === 'FINANCE_EXTERNAL_ACTIONS_DISABLED'
    || body.error === 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.'
}
