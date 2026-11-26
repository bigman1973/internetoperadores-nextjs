'use client'
/**
 * Área 1 · Microsoft 365 en la ficha (sistema io-ui de components/io-ui).
 * - Area1M365Correo: canal de envío (mi Outlook / buzón corporativo) y «Redactar con IA».
 *   La IA solo rellena asunto y cuerpo: el envío lo hace siempre el usuario con el botón del compositor.
 * - Area1M365Aviso: franja de aislamiento en staging.
 * - Area1M365Acciones: en la cronología, «Actualizar desde Outlook» (reunión) y «Ver respuestas» (correo).
 */
import { useState } from 'react'
import { Note, Pill } from '@/components/io-ui/kit'
import { ioFontClasses } from '@/components/io-ui/fonts'
import './area1-m365.css'

type Conexion = { enabled: boolean; connected: boolean; email: string | null; mail?: boolean; m365?: boolean }

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={`io-ui area1-m365 ${ioFontClasses}`}>{children}</div>
}

export function Area1M365Aviso({ aviso }: { aviso: string | null }) {
  if (!aviso) return null
  return <Shell><Note><b>Pruebas:</b> {aviso}</Note></Shell>
}

const connectUrl = (contactId: string) => `/api/admin/integraciones/outlook/connect?returnTo=${encodeURIComponent(`/admin/crm/contactos/${contactId}`)}`

export function Area1M365Correo({ contactId, conexion, corporativo, viaOutlook, onCanal, onBorrador }: {
  contactId: string
  conexion: Conexion
  corporativo: string
  viaOutlook: boolean
  onCanal: (outlook: boolean) => void
  onBorrador: (b: { asunto: string; cuerpo: string }) => void
}) {
  const [objetivo, setObjetivo] = useState('')
  const [tono, setTono] = useState<'cercano' | 'formal' | 'breve'>('cercano')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[] | null>(null)
  const outlookListo = conexion.enabled && conexion.connected && Boolean(conexion.mail)

  async function proponer() {
    setError(null)
    if (objetivo.trim().length < 3) return setError('Explica en una frase qué quieres conseguir con el correo.')
    if (avisos && !window.confirm('El nuevo borrador sustituirá el asunto y el mensaje actuales. ¿Continuar?')) return
    setCargando(true)
    try {
      const qs = new URLSearchParams({ objetivo: objetivo.trim(), tono })
      const r = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(contactId)}/m365/borrador?${qs}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.asunto) throw new Error(d.error || 'No se pudo generar el borrador.')
      onBorrador({ asunto: d.asunto, cuerpo: d.cuerpo })
      setAvisos(Array.isArray(d.avisos) ? d.avisos : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el borrador.')
    } finally {
      setCargando(false)
    }
  }

  return <Shell>
    <div className="m365-row">
      <span className="m365-lbl">Enviar desde</span>
      <div className="seg" role="group" aria-label="Buzón de envío">
        <button type="button" aria-pressed={viaOutlook} disabled={!conexion.enabled} onClick={() => onCanal(true)} title={outlookListo ? undefined : 'Conecta tu Outlook con permiso de correo'}>Mi Outlook</button>
        <button type="button" aria-pressed={!viaOutlook} onClick={() => onCanal(false)}>Buzón corporativo</button>
      </div>
      {viaOutlook && outlookListo && <Pill tone="ok">{conexion.email} · queda en Enviados</Pill>}
      {viaOutlook && !outlookListo && <Pill tone="mod">Pendiente de conectar</Pill>}
      {!viaOutlook && <Pill>{corporativo}</Pill>}
    </div>
    {conexion.enabled && conexion.m365 !== false && !conexion.connected && <p className="m365-sub"><a className="btn" href={connectUrl(contactId)}>Conectar mi Outlook</a> para enviar desde tu buzón y ver las respuestas en la ficha.</p>}
    {conexion.enabled && conexion.connected && !conexion.mail && <p className="m365-sub"><a className="btn" href={connectUrl(contactId)}>Conceder permiso de correo</a> Tu conexión actual solo incluye el calendario.</p>}
    {!conexion.enabled && <p className="m365-sub">El envío desde tu Outlook está pendiente de activar en este entorno.</p>}

    <div className="m365-ia">
      <div className="m365-row">
        <span className="m365-lbl">Redactar con IA</span>
        <div className="seg" role="group" aria-label="Tono">
          {(['cercano', 'formal', 'breve'] as const).map((t) => <button key={t} type="button" aria-pressed={tono === t} onClick={() => setTono(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
      </div>
      <div className="m365-row">
        <input className="m365-input" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} maxLength={600} placeholder="Qué quieres conseguir: p. ej. proponer una reunión para revisar su contrato de fibra" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void proponer() } }} />
        <button type="button" className="btn primary" onClick={proponer} disabled={cargando}>{cargando ? 'Redactando…' : 'Proponer borrador'}</button>
      </div>
      <p className="m365-sub">Usa la ficha: negocios, notas, reuniones, correos, contratos y facturación de ISP. No envía nada.</p>
      {error && <Note tone="bad">{error}</Note>}
      {avisos && <Note><b>Borrador propuesto por IA.</b> Revísalo y corrígelo: solo se envía cuando pulses «Enviar y registrar».{avisos.length > 0 && <ul className="m365-list">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}</Note>}
    </div>
  </Shell>
}

type Respuesta = { id: string; recibido: string | null; deNombre: string | null; de: string | null; asunto: string | null; extracto: string | null }

export function Area1M365Acciones({ contactId, activityId, sincronizable, hilo, aislamiento, borradorIa }: {
  contactId: string
  activityId: string
  sincronizable: boolean
  hilo: boolean
  aislamiento: string | null
  borradorIa: boolean
}) {
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [respuestas, setRespuestas] = useState<Respuesta[] | null>(null)
  const base = `/api/admin/crm/contactos/${encodeURIComponent(contactId)}/actividades/${encodeURIComponent(activityId)}/m365`
  if (!sincronizable && !hilo && !aislamiento && !borradorIa) return null

  async function sincronizar() {
    setCargando(true); setError(null); setEstado(null)
    try {
      const r = await fetch(base, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo leer Outlook.')
      setEstado(d.cancelada ? 'La reunión está cancelada en Outlook; la ficha se ha actualizado.' : d.cambios?.length ? `Actualizado desde Outlook: ${d.cambios.join(', ')}. Recarga para verlo.` : 'Sin cambios en Outlook.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer Outlook.') } finally { setCargando(false) }
  }
  async function verRespuestas() {
    setCargando(true); setError(null)
    try {
      const r = await fetch(base, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo leer el hilo.')
      setRespuestas(d.respuestas || [])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el hilo.') } finally { setCargando(false) }
  }

  return <Shell>
    <div className="m365-row">
      {aislamiento && <Pill tone="mod">{aislamiento === 'no_enviado' ? 'Pruebas: no enviado' : aislamiento === 'desviado' ? 'Pruebas: desviado a prueba' : 'Pruebas'}</Pill>}
      {borradorIa && <Pill>Borrador con IA revisado</Pill>}
      {sincronizable && <button type="button" className="btn" onClick={sincronizar} disabled={cargando}>{cargando ? 'Leyendo…' : 'Actualizar desde Outlook'}</button>}
      {hilo && <button type="button" className="btn" onClick={verRespuestas} disabled={cargando}>{cargando ? 'Leyendo…' : 'Ver respuestas'}</button>}
    </div>
    {estado && <Note tone="good">{estado}</Note>}
    {error && <Note tone="bad">{error}</Note>}
    {respuestas && (respuestas.length === 0
      ? <p className="m365-sub">Aún no hay respuestas del cliente en tu buzón.</p>
      : <ul className="m365-hilo">{respuestas.map((m) => <li key={m.id}><span className="m365-de">{m.deNombre || m.de || 'Remitente'}</span><span className="m365-fecha">{m.recibido ? new Date(m.recibido).toLocaleString('es-ES') : ''}</span><p>{m.extracto}</p></li>)}</ul>)}
  </Shell>
}
