'use client'

import { useState } from 'react'
import Dialog from './Dialog'
import { readResponse } from './model'

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [prepared, setPrepared] = useState(false)
  const [status, setStatus] = useState('')
  const link = typeof window === 'undefined' ? '/admin/login' : `${window.location.origin}/admin/login`
  const text = `Hola ${name.trim()},\n\nPuedes entrar al panel de internetoperadores desde ${link} con tu cuenta Microsoft ${email.trim()}.\n\nLas cuentas @internetoperadores.com se crean al iniciar sesión como Empleado (VISOR), con acceso limitado al portal. Cualquier ampliación de permisos se revisará por separado.\n\nEste mensaje se ha preparado para copiar; no se ha enviado ningún correo.`
  return <Dialog title="Invitar por correo" onClose={onClose}>
    <div className="note"><b>No se enviará ningún correo.</b> Solo se prepara un mensaje y enlace para copiar. No se crea ninguna cuenta ni se modifica Microsoft.</div>
    <form onSubmit={event => { event.preventDefault(); setPrepared(true); setStatus('') }}>
      <div className="fld"><label htmlFor="invite-name">Nombre</label><input id="invite-name" value={name} required maxLength={150} onChange={event => { setName(event.target.value); setPrepared(false) }} autoComplete="name" /></div>
      <div className="fld"><label htmlFor="invite-email">Correo Microsoft</label><input id="invite-email" type="email" value={email} required maxLength={254} onChange={event => { setEmail(event.target.value); setPrepared(false) }} autoComplete="email" /></div>
      <div className="row area4-buttons"><button className="btn" type="button" onClick={onClose}>Cerrar</button><button className="btn primary" type="submit">Preparar mensaje</button></div>
    </form>
    {prepared && <><div className="fld"><label htmlFor="invite-text">Mensaje para copiar</label><textarea id="invite-text" value={text} readOnly rows={9} /></div>
      <button className="btn" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setStatus('Mensaje copiado. No se ha enviado ningún correo.') }
        catch { setStatus('Selecciona el texto del mensaje y cópialo manualmente. No se ha enviado ningún correo.') }
      }}>Copiar mensaje y enlace</button></>}
    {status && <p className="small muted" role="status">{status}</p>}
  </Dialog>
}

export function NewUserDialog({ onClose, onCreated, allowed }: { onClose: () => void; onCreated: () => Promise<void>; allowed: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!confirmed || saving || !allowed || uncertain || created) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/usuarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // La cuenta nace con el mínimo rol enum válido. Sin perfil, extras ni aplicación automática.
        body: JSON.stringify({ nombre: name.trim(), email: email.trim().toLowerCase(), password, rol: 'VISOR' }),
      })
      if (response.status === 403) {
        const data = await response.json().catch(() => ({}))
        setError(`${typeof data.error === 'string' ? data.error : 'Alta denegada por la guardia de este entorno.'} Alta no guardada; no se ha creado ninguna cuenta ni enviado ningún correo.`)
        return
      }
      const data = await readResponse<{ usuario: { id: number } }>(response)
      if (!data.usuario?.id) throw new Error('No se pudo comprobar la cuenta creada.')
      setCreated(true)
      setPassword('')
      await onCreated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar el alta.')
      setUncertain(true)
    } finally { setSaving(false) }
  }

  return <Dialog title="Nuevo usuario" onClose={onClose} busy={saving}>
    {created ? <><div className="note good"><b>Cuenta creada como Empleado (VISOR).</b> No se ha enviado ningún correo ni aplicado ninguna plantilla.</div><p className="small muted">La lista se ha solicitado de nuevo. Revisa la ficha y prepara una propuesta independiente si necesita más permisos.</p><div className="row area4-buttons"><button className="btn primary" type="button" onClick={onClose}>Cerrar</button></div></>
      : confirming ? <>
        <p>Se creará una cuenta local para <b>{name.trim()}</b> con correo <b>{email.trim().toLowerCase()}</b>.</p>
        <div className="note">Rol inicial: <b>Empleado (VISOR)</b>, sin extras ni plantilla automática. No se enviará ningún correo.</div>
        {!allowed && <p className="area4-error">Alta solo preparada, no guardada. La escritura está deshabilitada en este entorno; no se evita la guardia de staging. Producción solo por publicación autorizada con copia previa.</p>}
        <label className="chk"><input type="checkbox" checked={confirmed} disabled={saving || uncertain} onChange={event => setConfirmed(event.target.checked)} />Confirmo el alta de esta cuenta local con acceso mínimo.</label>
        {error && <p className="area4-error" role="alert">{error}</p>}
        {uncertain && <p className="small muted">No se reintentará el alta automáticamente. Cierra este diálogo y recarga los datos para comprobar si existe la cuenta antes de intentarlo otra vez.</p>}
        <div className="row area4-buttons"><button className="btn" type="button" disabled={saving} onClick={uncertain ? onClose : () => { setConfirming(false); setConfirmed(false) }}>{uncertain ? 'Cerrar' : 'Volver'}</button><button className="btn primary" type="button" disabled={!confirmed || saving || !allowed || uncertain} onClick={() => void create()}>{saving ? 'Creando…' : 'Confirmar y crear usuario'}</button></div>
      </> : <>
        <p className="small muted">Alta manual con contraseña. Para cuentas Microsoft puedes preparar una invitación sin crear una cuenta. El rol de partida será Empleado (VISOR).</p>
        <form onSubmit={event => { event.preventDefault(); setConfirming(true); setError('') }}>
          <div className="fld"><label htmlFor="new-name">Nombre</label><input id="new-name" value={name} required maxLength={150} onChange={event => setName(event.target.value)} autoComplete="name" /></div>
          <div className="fld"><label htmlFor="new-email">Correo</label><input id="new-email" type="email" value={email} required maxLength={254} onChange={event => setEmail(event.target.value)} autoComplete="email" /></div>
          <div className="fld"><label htmlFor="new-password">Contraseña inicial</label><input id="new-password" type="password" value={password} required minLength={8} onChange={event => setPassword(event.target.value)} autoComplete="new-password" /></div>
          <div className="fld"><label htmlFor="new-role">Rol inicial</label><select id="new-role" value="VISOR" disabled><option value="VISOR">Empleado — VISOR, sin extras</option></select></div>
          <div className="row area4-buttons"><button className="btn" type="button" onClick={onClose}>Cancelar</button><button className="btn primary" type="submit">Revisar alta</button></div>
        </form>
      </>}
  </Dialog>
}
