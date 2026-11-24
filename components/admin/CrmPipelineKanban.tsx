'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type PipelineResumen = { id: string; nombre: string; producto: string; segmentoCrm: string; negocios: number }
type Etapa = { id: string; nombre: string; orden: number; probabilidad: number; resultado: string; criterio: string | null; requiereMotivo: boolean }
type Negocio = {
  id: string; etapaId: string; nombre: string; importe: number | null; resultado: string; motivoPerdida: string | null
  fechaCierrePrevista: string | null; propietarioNombre: string | null; origen: string; updatedAt: string
  contacto: { id: string; nombre: string | null; email: string | null } | null
  empresa: { id: string; nombre: string } | null
}
type Tablero = { pipeline: { id: string; nombre: string; producto: string; segmentoCrm: string; etapas: Etapa[] }; negocios: Negocio[] }
type Resultado = { id: string; label: string; detalle: string | null }

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function CrmPipelineKanban({ pipelines, motivosPerdida }: { pipelines: PipelineResumen[]; motivosPerdida: string[] }) {
  const [activo, setActivo] = useState(pipelines[0]?.id || '')
  const [tablero, setTablero] = useState<Tablero | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [perdida, setPerdida] = useState<{ negocio: Negocio; etapa: Etapa } | null>(null)
  const [alta, setAlta] = useState(false)

  const cargar = useCallback(async (id: string) => {
    setCargando(true); setError('')
    try {
      const res = await fetch(`/api/admin/crm/pipelines/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el pipeline.')
      setTablero(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setCargando(false) }
  }, [])

  useEffect(() => { if (activo) void cargar(activo) }, [activo, cargar])

  const mover = useCallback(async (negocio: Negocio, etapa: Etapa, motivo?: string, detalleMotivo?: string) => {
    if (negocio.etapaId === etapa.id) return
    if (etapa.resultado === 'PERDIDA' && etapa.requiereMotivo && !motivo) { setPerdida({ negocio, etapa }); return }
    setError('')
    const res = await fetch(`/api/admin/crm/pipelines/negocios/${encodeURIComponent(negocio.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapaId: etapa.id, motivo, detalleMotivo }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'No se pudo mover el negocio.'); return }
    setPerdida(null)
    await cargar(activo)
  }, [activo, cargar])

  const columnas = useMemo(() => {
    if (!tablero) return []
    return tablero.pipeline.etapas.map((etapa) => {
      const items = tablero.negocios.filter((n) => n.etapaId === etapa.id)
      const total = items.reduce((a, n) => a + (n.importe || 0), 0)
      return { etapa, items, total }
    })
  }, [tablero])

  const resumen = useMemo(() => {
    if (!tablero) return { abiertos: 0, ponderado: 0, ganados: 0 }
    const prob = new Map(tablero.pipeline.etapas.map((e) => [e.id, e.probabilidad]))
    const abiertos = tablero.negocios.filter((n) => n.resultado === 'ABIERTO')
    return {
      abiertos: abiertos.length,
      ponderado: abiertos.reduce((a, n) => a + (n.importe || 0) * ((prob.get(n.etapaId) || 0) / 100), 0),
      ganados: tablero.negocios.filter((n) => n.resultado === 'GANADO').reduce((a, n) => a + (n.importe || 0), 0),
    }
  }, [tablero])

  return <div>
    <div className="mb-4 flex flex-wrap gap-2" role="tablist">
      {pipelines.map((p) => <button key={p.id} type="button" role="tab" aria-selected={p.id === activo} onClick={() => setActivo(p.id)}
        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${p.id === activo ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}>
        {p.nombre.replace(/^IO — /, '')}<span className="ml-1.5 opacity-70">{p.negocios}</span>
      </button>)}
    </div>

    {tablero && <div className="mb-4 flex flex-wrap items-center gap-3">
      <Metric title="Negocios abiertos" value={String(resumen.abiertos)} />
      <Metric title="Previsión ponderada" value={eur(resumen.ponderado)} />
      <Metric title="Ganado" value={eur(resumen.ganados)} />
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Segmento: {tablero.pipeline.segmentoCrm}</span>
      <button type="button" onClick={() => setAlta(true)} className="ml-auto rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700">+ Nuevo negocio</button>
    </div>}

    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div>}
    {cargando && !tablero && <p className="text-sm text-slate-500">Cargando…</p>}

    {tablero && <div className="flex gap-3 overflow-x-auto pb-4">
      {columnas.map(({ etapa, items, total }) => <section key={etapa.id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || arrastrando; const n = tablero.negocios.find((x) => x.id === id); setArrastrando(null); if (n) void mover(n, etapa) }}
        className={`flex w-72 shrink-0 flex-col rounded-2xl border p-3 ${etapa.resultado === 'GANADA' ? 'border-emerald-200 bg-emerald-50/60' : etapa.resultado === 'PERDIDA' ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-white'}`}>
        <header className="mb-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">{etapa.nombre}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{etapa.probabilidad}%</span>
          </div>
          <p className="text-xs text-slate-500">{items.length} · {eur(total)}</p>
          {etapa.criterio && <p className="mt-1 text-[11px] leading-4 text-slate-500" title={etapa.criterio}>{etapa.criterio}</p>}
        </header>
        <div className="flex min-h-24 flex-col gap-2">
          {items.map((n) => <article key={n.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', n.id); setArrastrando(n.id) }}
            className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing">
            <p className="font-semibold text-slate-900">{n.nombre}</p>
            <p className="text-xs text-slate-600">{n.empresa?.nombre || n.contacto?.nombre || n.contacto?.email || 'Sin ficha'}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
              {n.importe !== null && <span>{eur(n.importe)}</span>}
              {n.fechaCierrePrevista && <span>Cierre {new Date(`${n.fechaCierrePrevista}T00:00:00`).toLocaleDateString('es-ES')}</span>}
              {n.origen === 'HUBSPOT' && <span className="font-semibold text-orange-600">HubSpot</span>}
            </div>
            {n.motivoPerdida && <p className="mt-1 text-xs text-rose-700">Motivo: {n.motivoPerdida}</p>}
            <label className="mt-2 block text-[11px] text-slate-500">Mover a
              <select aria-label={`Mover ${n.nombre}`} value={n.etapaId} onChange={(e) => { const et = tablero.pipeline.etapas.find((x) => x.id === e.target.value); if (et) void mover(n, et) }}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                {tablero.pipeline.etapas.map((et) => <option key={et.id} value={et.id}>{et.nombre}</option>)}
              </select>
            </label>
          </article>)}
        </div>
      </section>)}
    </div>}

    {perdida && <MotivoPerdidaDialog motivos={motivosPerdida} negocio={perdida.negocio} onCancel={() => setPerdida(null)} onConfirm={(m, d) => void mover(perdida.negocio, perdida.etapa, m, d)} />}
    {alta && tablero && <AltaNegocioDialog pipelineId={tablero.pipeline.id} etapas={tablero.pipeline.etapas.filter((e) => e.resultado === 'ABIERTA')}
      onCancel={() => setAlta(false)} onDone={() => { setAlta(false); void cargar(tablero.pipeline.id) }} />}
  </div>
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p><p className="text-lg font-extrabold text-slate-900">{value}</p></div>
}

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><h3 className="mb-3 text-lg font-bold text-slate-900">{title}</h3>{children}</div>
  </div>
}

function MotivoPerdidaDialog({ motivos, negocio, onCancel, onConfirm }: { motivos: string[]; negocio: Negocio; onCancel: () => void; onConfirm: (motivo: string, detalle: string) => void }) {
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const valido = motivo && (motivo !== 'Otro' || detalle.trim())
  return <Modal title="Cerrar como perdido">
    <p className="mb-3 text-sm text-slate-600">{negocio.nombre}: indica por qué se pierde.</p>
    <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <option value="">Elige un motivo…</option>
      {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
    <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={300} placeholder={motivo === 'Otro' ? 'Explica el motivo (obligatorio)' : 'Detalle (opcional)'} className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={3} />
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button>
      <button type="button" disabled={!valido} onClick={() => onConfirm(motivo, detalle)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Marcar perdido</button>
    </div>
  </Modal>
}

function Buscador({ tipo, valor, onChange }: { tipo: 'contacto' | 'empresa'; valor: Resultado | null; onChange: (r: Resultado | null) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Resultado[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/crm/pipelines/buscar?tipo=${tipo}&query=${encodeURIComponent(q)}`)
      const d = await r.json().catch(() => ({}))
      setRes(r.ok ? d.results || [] : [])
    }, 250)
    return () => clearTimeout(t)
  }, [q, tipo])
  if (valor) return <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm"><span>{valor.label}</span><button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-blue-700">Quitar</button></div>
  return <div className="relative">
    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tipo === 'contacto' ? 'Buscar contacto por nombre o email' : 'Buscar empresa por nombre o NIF'} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
    {res.length > 0 && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      {res.map((r) => <li key={r.id}><button type="button" onClick={() => { onChange(r); setQ(''); setRes([]) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{r.label}{r.detalle && <span className="ml-2 text-xs text-slate-500">{r.detalle}</span>}</button></li>)}
    </ul>}
  </div>
}

function AltaNegocioDialog({ pipelineId, etapas, onCancel, onDone }: { pipelineId: string; etapas: Etapa[]; onCancel: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState('')
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState('')
  const [etapaId, setEtapaId] = useState(etapas[0]?.id || '')
  const [contacto, setContacto] = useState<Resultado | null>(null)
  const [empresa, setEmpresa] = useState<Resultado | null>(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true); setError('')
    const r = await fetch(`/api/admin/crm/pipelines/${encodeURIComponent(pipelineId)}/negocios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, importe, fechaCierrePrevista: fecha || null, etapaId, contactoId: contacto?.id || null, empresaId: empresa?.id || null }),
    })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(d.error || 'No se pudo crear.'); return }
    onDone()
  }
  return <Modal title="Nuevo negocio">
    <div className="space-y-2 text-sm">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del negocio" maxLength={200} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
      <div className="grid grid-cols-2 gap-2">
        <input value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="Importe (€)" inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2" />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Cierre previsto" className="rounded-lg border border-slate-200 px-3 py-2" />
      </div>
      <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} aria-label="Etapa inicial" className="w-full rounded-lg border border-slate-200 px-3 py-2">
        {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.probabilidad}%)</option>)}
      </select>
      <p className="pt-1 text-xs font-semibold text-slate-500">Empresa</p>
      <Buscador tipo="empresa" valor={empresa} onChange={setEmpresa} />
      <p className="pt-1 text-xs font-semibold text-slate-500">Contacto</p>
      <Buscador tipo="contacto" valor={contacto} onChange={setContacto} />
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button>
      <button type="button" disabled={enviando} onClick={() => void enviar()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Crear</button>
    </div>
  </Modal>
}
