'use client'
import { useCallback, useRef, useState } from 'react'

export type DocumentosPanelProps = {
  /** Presentation only. API always rechecks real session, live Stage and V/E/C. */
  readOnly?: boolean
  onChanged?: () => void | Promise<void>
  className?: string
}
type Campos = { fecha: string | null; proveedor: string | null; cif: string | null; numFactura: string | null; base: number | null; tipoIva: number | null; importeIva: number | null; tipoIrpf: number | null; importeIrpf: number | null; total: number | null }
type Documento = { id: string; version: number; hash: string; estado: string; tipo: string; nombreOriginal: string; nombreActual: string | null; rutaActual: string | null; originalDisponible: boolean; campos: Campos; lectura: { texto: string; aviso: string; campos: Campos }; facturaId: string | null; error: string | null }
const API = '/api/admin/finanzas/documentos'
const fields = [ ['fecha','Fecha documental','date'], ['proveedor','Proveedor','text'], ['cif','CIF/NIF','text'], ['numFactura','Número factura','text'], ['base','Base (€)','number'], ['tipoIva','Tipo IVA (%)','number'], ['importeIva','Importe IVA (€)','number'], ['tipoIrpf','Tipo IRPF (%)','number'], ['importeIrpf','Importe IRPF (€)','number'], ['total','Total (€)','number'] ] as const
async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' })
  const body = await response.json().catch(() => ({ error: 'Respuesta no JSON; operación no confirmada.' }))
  if (!response.ok) throw new Error(`${body.code ? `${body.code}: ` : ''}${body.error ?? 'Operación no confirmada.'}`)
  return body
}
export default function DocumentosPanel({ readOnly = false, onChanged, className = '' }: DocumentosPanelProps) {
  const [rows, setRows] = useState<Documento[]>([]), [selected, setSelected] = useState<Documento | null>(null)
  const [values, setValues] = useState<Record<string,string>>({}), [canWrite, setCanWrite] = useState(false), [canConfirm, setCanConfirm] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [reviewed, setReviewed] = useState(false)
  const [file, setFile] = useState<File | null>(null), [tipo, setTipo] = useState('FACTURA_RECIBIDA'), [uploadConfirmed, setUploadConfirmed] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const uploadRequest = useRef<string | null>(null), actionRequest = useRef<{ action: string; id: string; payload: string; uuid: string } | null>(null)
  const choose = (documento: Documento) => { setSelected(documento); setValues(Object.fromEntries(fields.map(([key]) => [key, documento.campos[key] === null ? '' : String(documento.campos[key])]))); setReviewed(false) }
  const refresh = useCallback(async (appendOffset?: number) => {
    const data = await jsonRequest(`${API}?offset=${appendOffset ?? 0}&limit=40`)
    setRows(previous => appendOffset ? [...previous, ...data.documentos] : data.documentos)
    setCanWrite(data.canWrite === true); setCanConfirm(data.canConfirm === true); setNextOffset(data.nextOffset)
  }, [])
  // Mount is inert: the human explicitly clicks Actualizar (DB only) first.
  const writeAllowed = canWrite && !readOnly, confirmAllowed = writeAllowed && canConfirm
  const after = async (documento: Documento) => { choose(documento); await refresh(); await onChanged?.() }
  const upload = async () => {
    if (!file || !writeAllowed || !uploadConfirmed || busy) return
    setBusy(true); setMessage('')
    try {
      if (file.size > 4 * 1024 * 1024 || !file.size) throw new Error('Archivo vacío o mayor de 4 MiB.')
      uploadRequest.current ??= crypto.randomUUID()
      const form = new FormData(); form.append('archivo',file); form.append('tipo',tipo); form.append('solicitudId',uploadRequest.current); form.append('confirmacionHumana','true')
      const data = await jsonRequest(API, { method: 'POST', body: form })
      await after(data.documento)
      setMessage(data.documento.repetido ? data.documento.aviso ?? 'Hash repetido: reutilizado, no se creó otro documento/factura.' : 'Original verificado en la carpeta privada Stage. Pendiente de revisión humana.')
      uploadRequest.current = null; setFile(null); setUploadConfirmed(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Subida no confirmada.') }
    finally { setBusy(false) }
  }
  const act = async (action: 'GUARDAR' | 'VALIDAR' | 'ARCHIVAR') => {
    if (!selected || busy || !writeAllowed || (action !== 'GUARDAR' && (!confirmAllowed || !reviewed))) return
    setBusy(true); setMessage('')
    try {
      const campos = Object.fromEntries(fields.map(([key,,kind]) => [key, values[key] === '' || values[key] === undefined ? null : kind === 'number' ? Number(values[key]) : values[key]]))
      const payload = JSON.stringify({ action, ...(action === 'ARCHIVAR' ? {} : { campos }) })
      const last = actionRequest.current
      const requestId = last && last.action === action && last.id === selected.id && last.payload === payload ? last.uuid : crypto.randomUUID()
      actionRequest.current = { action, id: selected.id, payload, uuid: requestId }
      const data = await jsonRequest(`${API}/${selected.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, version: selected.version, solicitudId: requestId, ...(action === 'GUARDAR' ? {} : { confirmacionHumana: true }), ...(action === 'ARCHIVAR' ? {} : { campos }) }) })
      await after(data.documento)
      setMessage(action === 'ARCHIVAR' ? 'Archivado verificado en Graph y confirmado con historial/auditoría en BD.' : action === 'VALIDAR' ? 'Factura VALIDADA/VALIDA creada. Aún pendiente de archivar; sin enlaces, cobros ni imputación.' : 'Correcciones humanas guardadas; aún no existe una nueva factura validada.')
      actionRequest.current = null
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Acción no confirmada.')
      // Metadata re-read is DB-only. Retain idempotency UUID for safe retry.
      try { const data = await jsonRequest(`${API}/${selected.id}`); choose(data.documento); await refresh() } catch { /* Leave the previous receipt visible; no fabricated success. */ }
    } finally { setBusy(false) }
  }
  const download = async () => {
    if (!selected || busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`${API}/${selected.id}?original=true`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? 'Original no disponible.') }
      const blob = await response.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = selected.nombreOriginal; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
      setMessage('Original descargado. Ábralo y revise los datos antes de confirmar.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Descarga no confirmada.') }
    finally { setBusy(false) }
  }
  return <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`} aria-label="Documentos manuales Stage">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Documentos · circuito manual Stage</h2><p className="text-sm text-slate-600">Entrada manual paralela al correo futuro. Sólo carpeta privada STAGING_FINANZAS_NO_CONTABILIZAR; nada se contabiliza ni se enlaza automáticamente.</p></div><button type="button" disabled={busy} onClick={() => refresh().catch(e => setMessage(e.message))} className="rounded border px-3 py-2 text-sm">Actualizar</button></div>
    {message && <p role="status" className="my-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    {!writeAllowed && <p className="mt-3 text-sm text-slate-600">Modo lectura o permiso E no concedido. Las acciones también se autorizan en servidor.</p>}
    {writeAllowed && <div className="my-4 grid gap-3 rounded bg-slate-50 p-3 md:grid-cols-2">
      <label className="text-sm">Original PDF/JPEG/PNG (máx. 4 MiB)<input aria-label="Archivo original" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} className="mt-1 block w-full" onChange={e => { setFile(e.target.files?.[0] ?? null); uploadRequest.current = null; setUploadConfirmed(false) }} /></label>
      <label className="text-sm">Clasificación documental<select className="mt-1 block w-full rounded border p-2" value={tipo} disabled={busy} onChange={e => { setTipo(e.target.value); uploadRequest.current = null }}><option value="FACTURA_RECIBIDA">Factura recibida</option><option value="CONFIRMING">Confirming (sólo pendiente)</option><option value="OTRO">Otro (sólo pendiente)</option></select><span className="text-xs text-slate-500">Nóminas excluidas: requieren canal y permiso protegido.</span></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={uploadConfirmed} disabled={busy} onChange={e => setUploadConfirmed(e.target.checked)} />Confirmo la incorporación manual de este original a Stage, sin borrar ni sobrescribir.</label>
      <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={!file || !uploadConfirmed || busy} onClick={upload}>Incorporar original</button>
    </div>}
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
      <div className="max-h-[700px] overflow-auto"><ul className="space-y-2">{rows.map(row => <li key={row.id}><button type="button" onClick={() => choose(row)} disabled={busy} className={`w-full rounded border p-3 text-left text-sm ${selected?.id === row.id ? 'border-blue-500 bg-blue-50' : ''}`}><strong className="block break-all">{row.nombreOriginal}</strong><span className="block">{row.tipo} · {row.estado}</span><span className="block break-all font-mono text-xs">SHA256 {row.hash}</span></button></li>)}</ul>{!rows.length && <p className="py-4 text-sm text-slate-500">Sin documentos del panel o lista aún no disponible.</p>}{nextOffset !== null && <button type="button" disabled={busy} className="mt-2 rounded border px-3 py-2" onClick={() => refresh(nextOffset).catch(e => setMessage(e.message))}>Cargar más</button>}</div>
      {selected ? <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !selected.originalDisponible} onClick={download} className="rounded border px-3 py-2 text-sm">Descargar original para revisar</button><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => navigator.clipboard.writeText(selected.hash).then(() => setMessage('Hash copiado.')).catch(() => setMessage('No se pudo copiar el hash.'))}>Copiar SHA256</button></div>
        <p className="text-sm">Estado: <strong>{selected.estado}</strong> · versión {selected.version}{selected.facturaId && <> · Factura {selected.facturaId}</>}</p>
        <p className="break-all text-xs text-slate-500">{selected.rutaActual ?? 'Original aún no verificado. Reserva sin éxito de subida.'}</p>
        {selected.error && <p className="rounded bg-amber-50 p-2 text-sm">{selected.error}</p>}
        <details className="rounded border p-3"><summary className="cursor-pointer text-sm">Lectura local no fiable · revisar manualmente</summary><p className="my-2 text-sm text-amber-800">{selected.lectura.aviso}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{selected.lectura.texto || 'Sin texto extraíble. Lectura manual requerida.'}</pre></details>
        <div className="grid gap-3 md:grid-cols-2">{fields.map(([key,label,kind]) => <label key={key} className="text-sm">{label}<input type={kind} step={kind === 'number' ? '0.01' : undefined} value={values[key] ?? ''} placeholder="Sin confirmar" disabled={busy || !writeAllowed || selected.estado !== 'PENDIENTE_REVISION'} onChange={e => { setValues(v => ({ ...v, [key]: e.target.value })); setReviewed(false) }} className="mt-1 block w-full rounded border p-2 disabled:bg-slate-50" /></label>)}</div>
        {selected.tipo !== 'FACTURA_RECIBIDA' && <p className="text-sm text-amber-800">Esta clasificación se conserva pendiente: no se permite validar como factura ni archivar contablemente desde este mínimo.</p>}
        {writeAllowed && selected.estado === 'PENDIENTE_REVISION' && <button type="button" disabled={busy} onClick={() => act('GUARDAR')} className="rounded border px-3 py-2">Guardar correcciones (sin validar)</button>}
        {selected.tipo === 'FACTURA_RECIBIDA' && ['PENDIENTE_REVISION','VALIDADA_PENDIENTE_ARCHIVO'].includes(selected.estado) && <>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={busy || !confirmAllowed} onChange={e => setReviewed(e.target.checked)} />He abierto el original y confirmado humanamente los campos, la fecha documental y el cuadre Base + IVA − IRPF = Total. Autorizo sólo la acción indicada.</label>
          {!canConfirm && <p className="text-xs text-amber-800">Se requiere permiso C vivo en Facturas y Conciliación. E no sustituye C.</p>}
          <button type="button" disabled={busy || !reviewed || !confirmAllowed} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40" onClick={() => act(selected.estado === 'PENDIENTE_REVISION' ? 'VALIDAR' : 'ARCHIVAR')}>{selected.estado === 'PENDIENTE_REVISION' ? 'Validar factura · no archiva aún' : 'Archivar original validado / reintentar'}</button>
        </>}
      </div> : <p className="py-4 text-sm text-slate-500">Seleccione un documento para leer, corregir, validar y después archivar.</p>}
    </div>
  </section>
}
