'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

type Horario = { zona: 'Europe/Madrid'; dias: number[]; inicio: string; fin: string }
type Configuracion = { modo: 'extractivo' | 'local' | 'desactivado'; maxChars: number; horario: Horario; bienvenida: string; temasProhibidos: string[]; retencionMeses: number; consentimientoVersion: string; publicEnabled: boolean; clientEnabled: boolean }
type Cambio = { id: string; campo: string; antes: unknown; despues: unknown; actorId: number | null; motivo: string; createdAt: string }
const fecha = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

export default function ConfiguracionAsistente({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null)
  const [historial, setHistorial] = useState<Cambio[]>([])
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [temas, setTemas] = useState('')
  const [motivo, setMotivo] = useState('')
  const [confirmarLocal, setConfirmarLocal] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    setCargando(true); setMensaje('')
    try {
      const [respuestaConfig, respuestaHistorial] = await Promise.all([fetch('/api/admin/asistente/configuracion', { cache: 'no-store' }), fetch('/api/admin/asistente/configuracion/historial?limit=50', { cache: 'no-store' })])
      const datosConfig = await respuestaConfig.json().catch(() => null); const datosHistorial = await respuestaHistorial.json().catch(() => null)
      if (!respuestaConfig.ok) throw new Error(datosConfig?.error || 'No se ha podido cargar la configuración.')
      if (!respuestaHistorial.ok) throw new Error(datosHistorial?.error || 'No se ha podido cargar el historial.')
      setConfiguracion(datosConfig); setHistorial(datosHistorial?.items || []); setDias(datosConfig?.horario?.dias || [1, 2, 3, 4, 5]); setTemas((datosConfig?.temasProhibidos || []).join('\n'))
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido cargar la configuración.') } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  function cambiar<K extends keyof Configuracion>(campo: K, valor: Configuracion[K]) { setConfiguracion((previa) => previa ? { ...previa, [campo]: valor } : previa) }
  function alternarDia(dia: number) { setDias((previos) => previos.includes(dia) ? previos.filter((valor) => valor !== dia) : [...previos, dia].sort()) }

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!configuracion || !puedeEscribir || guardando) return
    if (!motivo.trim() || motivo.trim().length < 3) { setMensaje('Indica un motivo de al menos 3 caracteres para guardar los cambios.'); return }
    if (configuracion.modo === 'local' && !confirmarLocal) { setMensaje('Confirma de forma explícita que deseas activar el modo local.'); return }
    if (configuracion.modo === 'local' && !window.confirm('Vas a activar el modo local. ¿Confirmas que has revisado esta decisión?')) return
    setGuardando(true); setMensaje('')
    const payload = {
      modo: configuracion.modo,
      bienvenida: configuracion.bienvenida,
      horarioHumano: { zona: 'Europe/Madrid' as const, dias, inicio: configuracion.horario.inicio, fin: configuracion.horario.fin },
      temasProhibidos: temas.split('\n').map((tema) => tema.trim()).filter(Boolean),
      retencionMeses: configuracion.retencionMeses,
      consentimientoVersion: configuracion.consentimientoVersion,
      motivo: motivo.trim(),
      ...(configuracion.modo === 'local' ? { confirmar: true } : {}),
    }
    try {
      const respuesta = await fetch('/api/admin/asistente/configuracion', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(datos?.error || 'No se ha podido guardar la configuración.')
      setMensaje('Configuración actualizada y cambio registrado en el historial.'); setMotivo(''); setConfirmarLocal(false); await cargar()
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se ha podido guardar la configuración.') } finally { setGuardando(false) }
  }

  if (cargando) return <div className="space-y-6"><div className="h-16 animate-pulse rounded-xl bg-gray-200" /><div className="h-[440px] animate-pulse rounded-xl bg-gray-100" /><p aria-live="polite" className="text-sm text-gray-600">Cargando configuración…</p></div>
  if (!configuracion) return <div className="rounded-xl border border-red-200 bg-red-50 p-5"><h1 className="text-xl font-bold text-red-900">No se ha podido cargar la configuración</h1><p className="mt-2 text-sm text-red-800">{mensaje || 'Vuelve a intentarlo dentro de unos minutos.'}</p><button onClick={cargar} className="mt-4 min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500">Reintentar</button></div>

  return <div className="space-y-6">
    <div className="sm:flex sm:items-start sm:justify-between"><div><h1 className="text-2xl font-bold text-gray-900">Configuración</h1><p className="mt-1 text-sm text-gray-600">Los cambios se auditan con un motivo. El modo efectivo puede estar limitado por el entorno.</p></div><button type="button" onClick={cargar} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 sm:mt-0"><ArrowPathIcon className="h-5 w-5" aria-hidden="true" />Actualizar</button></div>
    {!puedeEscribir && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Tienes acceso de lectura. No puedes guardar cambios.</p>}
    <form onSubmit={guardar} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-5 lg:grid-cols-2"><fieldset><legend className="text-sm font-semibold text-gray-900">Comportamiento</legend><label className="mt-3 block text-sm font-medium text-gray-700">Modo<select value={configuracion.modo} disabled={!puedeEscribir} onChange={(evento) => cambiar('modo', evento.target.value as Configuracion['modo'])} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100"><option value="extractivo">Extractivo</option><option value="local">Local</option><option value="desactivado">Desactivado</option></select></label>{configuracion.modo === 'local' && <label className="mt-3 flex min-h-11 items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={confirmarLocal} disabled={!puedeEscribir} onChange={(evento) => setConfirmarLocal(evento.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />Confirmo explícitamente que deseo activar el modo local.</label>}<label className="mt-3 block text-sm font-medium text-gray-700">Mensaje de bienvenida<textarea value={configuracion.bienvenida} onChange={(evento) => cambiar('bienvenida', evento.target.value)} required minLength={1} maxLength={1200} disabled={!puedeEscribir} className="mt-1 block min-h-24 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label></fieldset><fieldset><legend className="text-sm font-semibold text-gray-900">Atención humana y conservación</legend><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm font-medium text-gray-700">Inicio<input type="time" value={configuracion.horario.inicio} disabled={!puedeEscribir} onChange={(evento) => cambiar('horario', { ...configuracion.horario, inicio: evento.target.value })} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label><label className="text-sm font-medium text-gray-700">Fin<input type="time" value={configuracion.horario.fin} disabled={!puedeEscribir} onChange={(evento) => cambiar('horario', { ...configuracion.horario, fin: evento.target.value })} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label></div><div className="mt-3"><span className="text-sm font-medium text-gray-700">Días de atención</span><div className="mt-2 flex flex-wrap gap-2">{[['L', 1], ['M', 2], ['X', 3], ['J', 4], ['V', 5], ['S', 6], ['D', 7]].map(([nombre, dia]) => <label key={String(dia)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm text-gray-800"><input type="checkbox" disabled={!puedeEscribir} checked={dias.includes(Number(dia))} onChange={() => alternarDia(Number(dia))} className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />{nombre}</label>)}</div></div><label className="mt-3 block text-sm font-medium text-gray-700">Meses de retención<input type="number" min="1" max="120" value={configuracion.retencionMeses} disabled={!puedeEscribir} onChange={(evento) => cambiar('retencionMeses', Number(evento.target.value))} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label><label className="mt-3 block text-sm font-medium text-gray-700">Versión de consentimiento<input value={configuracion.consentimientoVersion} onChange={(evento) => cambiar('consentimientoVersion', evento.target.value)} required maxLength={120} disabled={!puedeEscribir} className="mt-1 block min-h-11 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label></fieldset></div><label className="mt-5 block text-sm font-medium text-gray-700">Temas prohibidos (uno por línea)<textarea value={temas} onChange={(evento) => setTemas(evento.target.value)} disabled={!puedeEscribir} maxLength={6050} className="mt-1 block min-h-24 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label><label className="mt-5 block text-sm font-medium text-gray-700">Motivo del cambio<span className="text-red-700"> *</span><textarea value={motivo} onChange={(evento) => setMotivo(evento.target.value)} required minLength={3} maxLength={500} disabled={!puedeEscribir} placeholder="Ej.: Ajuste revisado por el equipo de soporte" className="mt-1 block min-h-20 w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" /></label><div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={!puedeEscribir || guardando} className="min-h-11 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-orange-300">{guardando ? 'Guardando…' : 'Guardar cambios'}</button><span className="text-xs text-gray-500">Límite actual por mensaje: {configuracion.maxChars} caracteres.</span></div></form>
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="font-semibold text-gray-900">Historial de configuración</h2><p className="mt-1 text-sm text-gray-600">Últimos 50 cambios registrados.</p></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Campo</th><th className="px-4 py-3">Antes</th><th className="px-4 py-3">Después</th><th className="px-4 py-3">Motivo</th></tr></thead><tbody className="divide-y divide-gray-200">{historial.length ? historial.map((cambio) => <tr key={cambio.id} className="align-top hover:bg-gray-50"><td className="whitespace-nowrap px-4 py-3 text-gray-700">{fecha.format(new Date(cambio.createdAt))}</td><td className="px-4 py-3 font-medium text-gray-900">{cambio.campo}</td><td className="max-w-[180px] px-4 py-3 text-xs text-gray-700"><Valor valor={cambio.antes} /></td><td className="max-w-[180px] px-4 py-3 text-xs text-gray-700"><Valor valor={cambio.despues} /></td><td className="max-w-sm px-4 py-3 text-gray-700">{cambio.motivo}</td></tr>) : <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-600">Todavía no hay cambios registrados.</td></tr>}</tbody></table></div></section>
    {configuracion.modo === 'local' && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />El entorno puede aplicar un modo más restrictivo que el seleccionado aquí.</p>}
    <p aria-live="polite" className="min-h-5 text-sm text-gray-700">{mensaje}</p>
  </div>
}
function Valor({ valor }: { valor: unknown }) { const texto = typeof valor === 'string' ? valor : JSON.stringify(valor); return <span className="break-words">{texto?.slice(0, 240) || '—'}</span> }
