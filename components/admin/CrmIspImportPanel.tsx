'use client'

import { useCallback, useEffect, useState } from 'react'

type Resumen = Record<string, any>
type Vinculo = {
  id: string; tipo: string; motivo: string; confianza: string; estado: string; destino: string
  cliente: { codigo: string; nombre: string; docNormalizado: string | null; email: string | null; segmentoCrm: string; clienteWebId: number | null }
}

const TIPO_LABEL: Record<string, string> = {
  CLIENTE_WEB: 'Ficha de cliente', CRM_CONTACTO: 'Contacto CRM', CRM_EMPRESA: 'Empresa CRM',
  CREAR_CONTACTO: 'Crear contacto', CREAR_EMPRESA: 'Crear empresa / autónomo',
}
const MARKETING_LABEL: Record<string, string> = { APTO: 'Con consentimiento', BAJA: 'Baja (prevalece)', SIN_CONSENTIMIENTO: 'Sin consentimiento', SIN_EMAIL: 'Sin email' }
const n = (v: unknown) => Number(v || 0).toLocaleString('es-ES')

function Tabla({ titulo, filas }: { titulo: string; filas: Array<[string, unknown]> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-900">{titulo}</h3>
      <dl className="divide-y divide-gray-100 text-sm">
        {filas.map(([k, v]) => <div key={k} className="flex justify-between px-4 py-1.5"><dt className="text-gray-600">{k}</dt><dd className="font-semibold text-gray-900">{typeof v === 'number' ? n(v) : String(v ?? '—')}</dd></div>)}
      </dl>
    </div>
  )
}

function ResumenImportacion({ r }: { r: Resumen }) {
  const bloque = (o: any) => [['Nuevos', o?.NUEVO], ['Actualizados', o?.ACTUALIZADO], ['Sin cambios', o?.SIN_CAMBIOS], ...(o?.AUSENTE !== undefined ? [['Ya no están en el fichero (se conservan)', o.AUSENTE]] : [])] as Array<[string, unknown]>
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Tabla titulo="Clientes" filas={bloque(r.clientes)} />
      <Tabla titulo="Contratos" filas={[...bloque(r.contratos), ['Enlazados con contratos del panel', r.contratosConContratoServicio], ...Object.entries(r.asignacionContratos || {}).map(([k, v]) => [`Asignación ${k}`, v] as [string, unknown])]} />
      <Tabla titulo="Facturación 2026" filas={[...bloque(r.facturacion), ['Clientes con facturación', r.facturacionClientes], ['Total base sin IVA (€)', Number(r.facturacionTotal || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })]]} />
      <Tabla titulo="Consentimiento de marketing" filas={[...Object.entries(r.marketing || {}).map(([k, v]) => [MARKETING_LABEL[k] || k, v] as [string, unknown]), ['Bajas de Brevo consultadas', r.brevo?.verificado ? 'Sí' : `No (${r.brevo?.error || '—'})`]]} />
      <Tabla titulo="Vínculos" filas={[['Ficha de cliente por clave ISP', r.vinculos?.identidadClienteWeb], ['Contacto ya vinculado en el CRM', r.vinculos?.contactoYaVinculado], ['Empresa ya vinculada en el CRM', r.vinculos?.empresaYaVinculada], ...Object.entries(r.propuestas || {}).map(([k, v]) => [`Propuesta ${k.replace(/_(ALTA|MEDIA|BAJA)$/, ' · $1').replace(/_/g, ' ').toLowerCase()}`, v] as [string, unknown])]} />
      <Tabla titulo="Segmentos y avisos" filas={[...Object.entries(r.segmentos || {}).map(([k, v]) => [k.replace('_', ' · ').toLowerCase(), v] as [string, unknown]), ...Object.entries(r.avisos || {}).map(([k, v]) => [k.replace(/_/g, ' '), v] as [string, unknown])]} />
    </div>
  )
}

export default function CrmIspImportPanel() {
  const [fichero, setFichero] = useState<File | null>(null)
  const [consultarBrevo, setConsultarBrevo] = useState(true)
  const [simulacion, setSimulacion] = useState<{ hash: string; resumen: Resumen } | null>(null)
  const [aplicado, setAplicado] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState({ tipo: '', confianza: '', estado: 'PENDIENTE', pagina: 1 })
  const [lista, setLista] = useState<{ total: number; porTipo: any[]; vinculos: Vinculo[]; aviso?: string } | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [mensaje, setMensaje] = useState('')

  const enviar = async (modo: 'simular' | 'aplicar') => {
    if (!fichero) return
    setCargando(true); setError(''); setMensaje('')
    const fd = new FormData()
    fd.set('fichero', fichero); fd.set('modo', modo); fd.set('consultarBrevo', consultarBrevo ? '1' : '0')
    if (modo === 'aplicar') { fd.set('hashEsperado', simulacion?.hash || ''); fd.set('confirmacion', 'APLICAR') }
    try {
      const r = await fetch('/api/admin/crm/isp/importar', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error')
      if (modo === 'simular') { setSimulacion({ hash: j.hash, resumen: j.resumen }); setAplicado(null) }
      else { setAplicado(j); setSimulacion(null); setMensaje(`Importación aplicada. Propuestas nuevas: ${n(j.propuestasNuevas)}; obsoletas: ${n(j.propuestasObsoletas)}.`); cargarLista() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setCargando(false) }
  }

  const cargarLista = useCallback(async () => {
    const q = new URLSearchParams({ estado: filtro.estado, pagina: String(filtro.pagina), ...(filtro.tipo ? { tipo: filtro.tipo } : {}), ...(filtro.confianza ? { confianza: filtro.confianza } : {}) })
    const r = await fetch(`/api/admin/crm/isp/vinculos?${q}`)
    if (r.ok) { setLista(await r.json()); setSeleccion(new Set()) }
  }, [filtro])
  useEffect(() => { cargarLista() }, [cargarLista])

  const resolver = async (accion: 'CONFIRMAR' | 'DESCARTAR') => {
    if (!seleccion.size) return
    if (accion === 'CONFIRMAR' && !window.confirm(`Vas a confirmar ${seleccion.size} propuesta(s). Las de «Crear» crean fichas nuevas en el CRM. ¿Continuar?`)) return
    setCargando(true); setMensaje('')
    const r = await fetch('/api/admin/crm/isp/vinculos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [...seleccion], accion }) })
    const j = await r.json().catch(() => ({}))
    setCargando(false)
    setMensaje(r.ok ? `${accion === 'CONFIRMAR' ? 'Confirmadas' : 'Descartadas'}: ${j.ok}. ${j.errores?.length ? `No aplicadas: ${j.errores.length} (${[...new Set(j.errores.map((e: any) => e.codigo))].join(', ')}).` : ''}` : j.error || 'Error')
    cargarLista()
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/40 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" accept=".xlsx" onChange={(e) => { setFichero(e.target.files?.[0] || null); setSimulacion(null); setAplicado(null) }} className="text-sm" />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={consultarBrevo} onChange={(e) => setConsultarBrevo(e.target.checked)} />Consultar bajas en Brevo (solo lectura)</label>
          <button type="button" disabled={!fichero || cargando} onClick={() => enviar('simular')} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">1. Simular</button>
          <button type="button" disabled={!simulacion || cargando} onClick={() => { if (window.confirm('Se guardarán los datos del fichero en el CRM. ¿Aplicar la importación simulada?')) enviar('aplicar') }} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">2. Aplicar</button>
        </div>
        {cargando && <p className="text-sm text-gray-600">Procesando…</p>}
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
        {mensaje && <p className="text-sm font-medium text-green-800">{mensaje}</p>}
        {simulacion && <><p className="text-sm text-gray-700">Simulación (no se ha guardado nada). Huella del fichero: <code className="text-xs">{simulacion.hash.slice(0, 16)}…</code></p><ResumenImportacion r={simulacion.resumen} /></>}
        {aplicado && <ResumenImportacion r={aplicado.resumen} />}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="mr-auto text-xl font-bold text-gray-900">Propuestas de vínculo {lista ? `(${n(lista.total)})` : ''}</h2>
          <select value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value, pagina: 1 })} className="rounded-md border-gray-300 text-sm">
            {['PENDIENTE', 'CONFIRMADO', 'DESCARTADO', 'OBSOLETO'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value, pagina: 1 })} className="rounded-md border-gray-300 text-sm">
            <option value="">Todos los tipos</option>{Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtro.confianza} onChange={(e) => setFiltro({ ...filtro, confianza: e.target.value, pagina: 1 })} className="rounded-md border-gray-300 text-sm">
            <option value="">Toda confianza</option>{['ALTA', 'MEDIA', 'BAJA'].map((x) => <option key={x}>{x}</option>)}
          </select>
          {filtro.estado === 'PENDIENTE' && <>
            <button type="button" disabled={!seleccion.size || cargando} onClick={() => resolver('CONFIRMAR')} className="rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmar ({seleccion.size})</button>
            <button type="button" disabled={!seleccion.size || cargando} onClick={() => resolver('DESCARTAR')} className="rounded-md bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50">Descartar</button>
          </>}
        </div>
        {lista?.aviso && <p className="text-sm text-amber-700">{lista.aviso}</p>}
        <p className="text-xs text-gray-500">Las coincidencias de confianza media o baja deben revisarse una a una. Nada se vincula sin tu confirmación.</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">{filtro.estado === 'PENDIENTE' && <input type="checkbox" aria-label="Seleccionar página" checked={Boolean(lista?.vinculos.length) && seleccion.size === lista?.vinculos.length} onChange={(e) => setSeleccion(new Set(e.target.checked ? lista?.vinculos.map((v) => v.id) : []))} />}</th>
                <th className="px-3 py-2">Cliente ISP</th><th className="px-3 py-2">Propuesta</th><th className="px-3 py-2">Destino</th><th className="px-3 py-2">Motivo</th><th className="px-3 py-2">Confianza</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lista?.vinculos.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-2">{filtro.estado === 'PENDIENTE' && <input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(v.id)} onChange={(e) => { const s = new Set(seleccion); if (e.target.checked) s.add(v.id); else s.delete(v.id); setSeleccion(s) }} />}</td>
                  <td className="px-3 py-2"><div className="font-medium text-gray-900">{v.cliente.nombre}</div><div className="text-xs text-gray-500">{v.cliente.codigo} · {v.cliente.docNormalizado || 'sin NIF'} · {v.cliente.email || 'sin email'} · {v.cliente.segmentoCrm}</div></td>
                  <td className="px-3 py-2">{TIPO_LABEL[v.tipo] || v.tipo}</td>
                  <td className="px-3 py-2 text-gray-700">{v.destino}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{v.motivo}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${v.confianza === 'ALTA' ? 'bg-green-100 text-green-800' : v.confianza === 'MEDIA' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{v.confianza}</span></td>
                </tr>
              ))}
              {lista && !lista.vinculos.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No hay propuestas con este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {lista && lista.total > 50 && (
          <div className="flex items-center gap-3 text-sm">
            <button type="button" disabled={filtro.pagina <= 1} onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina - 1 })} className="rounded border px-2 py-1 disabled:opacity-40">Anterior</button>
            <span>Página {filtro.pagina} de {Math.ceil(lista.total / 50)}</span>
            <button type="button" disabled={filtro.pagina * 50 >= lista.total} onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina + 1 })} className="rounded border px-2 py-1 disabled:opacity-40">Siguiente</button>
          </div>
        )}
      </section>
    </div>
  )
}
