'use client'

import { useId, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { ConfirmingDocumentoLectura } from '@/lib/finanzas/confirming-documentos'

const MANUAL_API = '/api/admin/finanzas/conciliar/confirming-documentos'
const INVENTORY_API = '/api/admin/finanzas/conciliar/confirming-inventario'
const MAX_BYTES = 4 * 1024 * 1024
const euros = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? 'No disponible' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
const types = { AVISO_CESION: 'Aviso de cesión (no liquidación)', LIQUIDACION: 'Liquidación documental', DETALLE_FACTURAS: 'Detalle de facturas', NO_CLASIFICADO: 'No clasificado' }
type Inventory = { inventoryComplete: boolean; siteVerified: boolean; readAt: string; files: readonly { key: string; nombre: string; grupo: string; size: number | null }[] }

/** Parent mounts this only in staging and supplies live presentation capabilities.
 * No mount-time fetch, no persistence, no C11 callback or "confirmar" action. */
export default function ConfirmingDocumentos(p: Readonly<{ stagingOnly: boolean; acting: boolean; canUpload: boolean }>) {
  const { data: session } = useSession()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ConfirmingDocumentoLectura | null>(null)
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const viewingAs = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verComo')
  const actingSession = session as typeof session & { impersonation?: unknown }
  const blocked = !p.stagingOnly || p.acting || actingSession?.impersonation != null || viewingAs

  async function responseJson(response: Response) {
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo completar la lectura documental.')
    return data
  }
  async function readManual() {
    if (blocked || !p.canUpload || !file || inFlight.current) return
    const current = ++generation.current
    const selected = file
    inFlight.current = true; setBusy(true); setMessage(''); setResult(null)
    try {
      if (selected.size === 0 || selected.size > MAX_BYTES || !/\.(pdf|xls|xlsx)$/i.test(selected.name)) throw new Error('Seleccione un único PDF, XLS o XLSX no vacío de hasta 4 MiB.')
      const body = new FormData(); body.append('archivo', selected)
      // Browser supplies multipart boundary and HTTPS Origin. Nothing is archived.
      const data = await responseJson(await fetch(MANUAL_API, { method: 'POST', body, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }))
      if (data?.schema !== 'CONFIRMING_DOCUMENTO_LECTURA_V1' || data?.lecturaManual !== true || data?.stagingOnly !== true || data?.confirmable !== false || data?.archivado !== false || data?.persistido !== false || data?.efectos?.businessWrites !== 0 || !Array.isArray(data.lineas) || !Array.isArray(data.avisos)) throw new Error('Respuesta de lectura no verificable; no se presenta como confirming confirmable.')
      if (current === generation.current) setResult(data)
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo. No se ha confirmado ningún cobro.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function readFolders() {
    if (blocked || inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage(''); setInventory(null)
    try {
      // Opt-in explicit click only. No Graph call or automatic upload from this UI.
      const data = await responseJson(await fetch(INVENTORY_API, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' }))
      if (data?.inventoryComplete !== true || data?.siteVerified !== true || !Array.isArray(data.files)) throw new Error('El inventario documental no se ha podido verificar como completo.')
      setInventory(data)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron leer las carpetas.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  function clear() {
    generation.current++; setFile(null); setResult(null); setInventory(null); setMessage('')
    if (input.current) input.current.value = ''
  }
  if (blocked) return null
  return <details className="fold" style={{ marginTop: 12 }}>
    <summary>Leer confirming documental (manual, sólo staging)</summary>
    <div className="foldbody">
      <h3>Lectura de documentos BBVA / CaixaBank</h3>
      <p className="help">Análisis temporal en memoria, sin archivar ni persistir. No confirma cobros, no marca facturas emitidas pagadas y no crea ni modifica lotes C11. Un cuadre documental no habilita confirmación.</p>
      <p className="small muted">Seleccione un PDF, XLS o XLSX de hasta 4 MiB. El nombre debe identificar Confirming BBVA o Confirming Caixa para el parser nativo. Cesión no es liquidación; el XLS Caixa sólo contiene detalle y requiere revisar su PDF por separado.</p>
      <form onSubmit={event => { event.preventDefault(); void readManual() }}>
        <label htmlFor={`${id}-file`}>Archivo para lectura manual</label>
        <input ref={input} id={`${id}-file`} type="file" accept=".pdf,.xls,.xlsx" disabled={busy || !p.canUpload}
          onChange={event => {
            generation.current++; setResult(null); setMessage('')
            const selected = event.target.files?.[0] ?? null
            if (selected && (!/\.(pdf|xls|xlsx)$/i.test(selected.name) || selected.size === 0 || selected.size > MAX_BYTES)) {
              setFile(null); event.target.value = ''; setMessage('Seleccione un PDF, XLS o XLSX no vacío de hasta 4 MiB.'); return
            }
            setFile(selected)
          }} style={{ display: 'block', marginTop: 8 }} />
        {!p.canUpload && <p className="small muted">La subida manual requiere permisos B4 vivos de lectura y escritura, aunque el análisis no escriba datos de negocio.</p>}
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="submit" className="btn" disabled={busy || !file || !p.canUpload}>{busy ? 'Leyendo…' : 'Analizar lectura manual'}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void readFolders()}>Leer carpetas (sólo inventario)</button>
          <button type="button" className="btn small" disabled={busy} onClick={clear}>Limpiar lectura en memoria</button>
        </div>
      </form>
      {message && <p role="alert" style={{ marginTop: 12 }}>{message}</p>}
      {result && <section aria-labelledby={`${id}-result`} style={{ marginTop: 16 }}>
        <h4 id={`${id}-result`}>{result.banco} · {types[result.tipoDocumento] ?? 'No clasificado'}</h4>
        <p className="small muted">{result.archivo.nombre} · Fecha documental: {result.fechaDocumento ?? 'No disponible'} · Fecha liquidación: {result.fechaLiquidacion ?? 'No disponible'}</p>
        <p><strong>Estado: análisis documental, no confirmable.</strong> Archivo no archivado ni persistido.</p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {([
            ['Nominal', result.importes.nominal], ['Intereses', result.importes.intereses],
            ['Comisión', result.importes.comision], ['IVA comisión (explícito)', result.importes.ivaComision],
            ['Neto bancario PDF', result.importes.netoBancario], ['Deducciones declaradas', result.importes.deducciones],
            ['Neto detalle XLS sin IVA (no abono)', result.importes.netoDetalleXlsSinIva],
          ] as const).map(([label, value]) => <div key={label}><dt className="small muted">{label}</dt><dd style={{ margin: 0 }}>{euros(value)}</dd></div>)}
        </dl>
        <p style={{ marginTop: 12 }}><strong>Cuadre documental:</strong> {result.cuadre.estado === 'CUADRA' ? 'Cuadra aritméticamente (no acredita cobro)' : result.cuadre.estado === 'DESCUADRE' ? 'Descuadre: revisión humana' : result.cuadre.estado === 'NO_APLICA' ? 'No aplica a este tipo documental' : 'No verificable con este soporte'}</p>
        <dl className="small muted">
          {([
            ['Nominal − intereses − comisión − IVA − neto bancario', result.cuadre.diferenciaCentimos],
            ['Deducciones − conceptos financieros', result.cuadre.diferenciaDeducirCentimos],
            ['Nominal líneas − resumen', result.cuadre.diferenciaNominalLineasCentimos],
            ['Intereses líneas − resumen', result.cuadre.diferenciaInteresesLineasCentimos],
            ['Comisiones líneas − resumen', result.cuadre.diferenciaComisionesLineasCentimos],
          ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null ? 'No disponible' : `${value} céntimos`}</dd></div>)}
        </dl>
        <ul>{result.avisos.map((aviso, index) => <li key={index}>{aviso}</li>)}</ul>
        <p className="small muted">Procedencia: {result.procedencia?.documento ?? 'No disponible'} · Resumen: {result.procedencia?.resumen ?? 'No disponible'} · Líneas: {result.procedencia?.lineas ?? 'No disponible'}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table"><caption>Detalle recuperado: {result.lineas.length} líneas, sin vincular ni cobrar</caption>
            <thead><tr><th>Factura</th><th>Nominal</th><th>Intereses</th><th>Comisión</th><th>Neto detalle sin IVA</th><th>Fecha factura</th><th>Pago / vencimiento</th><th>Procedencia</th></tr></thead>
            <tbody>{result.lineas.map((line, index) => <tr key={`${line.factura}-${index}`}><td>{line.factura}</td><td>{euros(line.nominal)}</td><td>{euros(line.intereses)}</td><td>{euros(line.comision)}</td><td>{euros(line.netoDetalleSinIva)}</td><td>{line.fechaFactura ?? 'No disponible'}</td><td>{line.fechaPago ?? line.fechaVencimiento ?? 'No disponible'}</td><td>{line.procedencia ?? 'No disponible'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>}
      {inventory && <section aria-labelledby={`${id}-inventory`} style={{ marginTop: 16 }}>
        <h4 id={`${id}-inventory`}>Inventario leído bajo petición ({inventory.files.length} archivos)</h4>
        <p className="small muted">Lectura actual: {inventory.readAt}. No es análisis de adjuntos, descarga, archivo ni importación. La revisión de todos los adjuntos del futuro buzón de administración queda fuera de este lector.</p>
        <ul>{inventory.files.map(item => <li key={item.key}>{item.grupo} · {item.nombre} · {typeof item.size === 'number' ? `${item.size} bytes` : 'Tamaño no disponible'}</li>)}</ul>
      </section>}
    </div>
  </details>
}
