'use client'
import { useEffect, useRef, useState } from 'react'
import type { FilaDocumentoComparacion, ResultadoDocumentosComparacion } from '@/lib/finanzas/documentos-panel-comparacion'

const API = '/api/admin/finanzas/documentos/comparacion'
export type DocumentosComparacionProps = Readonly<{
  /** Padre deriva la elegibilidad del registry; API vuelve a exigir VFactura+B4Read. */
  eligible?: boolean; canRead?: boolean; acting?: boolean; stagingOnly?: boolean; from?: string; to?: string;
  onCompared?: (result: ResultadoDocumentosComparacion) => void;
}>
function csvSnapshot(result: ResultadoDocumentosComparacion) {
  const cell = (v: unknown) => { const s = String(v ?? '').replace(/[\r\n\u0000]/g, ' '); return `"${(/^[\s]*[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` }
  const rows: unknown[][] = [
    ['tipo', 'id_opaco', 'nombre', 'origen', 'fecha_factura', 'provenancia_fecha', 'modified_at_archivo', 'created_at_no_ingreso', 'seleccion', 'evidencia', 'hash_disponible', 'motivos', 'from', 'to', 'inventario_completo', 'semana_completa', 'leido_at'],
    ['RESUMEN', '', '', '', '', '', '', '', '', '', result.hashesCompletos, result.avisos.join(' | '), result.rango.from, result.rango.to, result.inventarioCompleto, false, result.readAt],
  ]
  const add = (tipo: string, r: FilaDocumentoComparacion) => rows.push([tipo, r.id, r.nombre, r.origen, r.fechaFactura, r.fechaFacturaProvenancia, r.modifiedAt, r.createdAt, r.seleccion, r.evidencia, r.hashDisponible, r.motivos.join(' | '), result.rango.from, result.rango.to, result.inventarioCompleto, false, result.readAt])
  for (const [tipo, group] of [['FALTA_PANEL', result.faltanEnPanel], ['FALTA_CARPETAS', result.faltanEnCarpetas], ['CAMBIO_FUERA', result.cambiosFuera], ['NO_VERIFICABLE', result.NO_VERIFICABLE], ['COINCIDENCIA', result.coincidencias]] as const) for (const r of group) add(tipo, r)
  for (const group of result.copiasHuella) for (const r of group.documentos) add('COPIA_HUELLA_AVISO', r)
  for (const inv of result.inventoryCompleteness) rows.push(['PROVEEDOR', '', inv.proveedor, inv.scope, '', '', '', '', '', '', '', inv.incidencias.join(' | '), result.rango.from, result.rango.to, inv.completo, false, result.readAt])
  return '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n'
}
function validRange(from: string, to: string) {
  const stamp = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN
  const a = stamp(from), b = stamp(to)
  return Number.isFinite(a) && Number.isFinite(b) && new Date(a).toISOString().slice(0, 10) === from && new Date(b).toISOString().slice(0, 10) === to && a <= b && b - a < 31 * 86400000
}
function Rows({ title, rows }: { title: string; rows: readonly FilaDocumentoComparacion[] }) {
  return <details className="rounded-lg border border-slate-200 p-3">
    <summary className="cursor-pointer font-medium text-slate-900">{title}: {rows.length}</summary>
    {rows.length === 0 ? <p className="mt-2 text-sm text-slate-700">Sin filas en el alcance leído. No demuestra ausencia global.</p> : <>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Documento / ID opaco</th><th className="p-2">Fecha documental</th><th className="p-2">Modificación de archivo</th><th className="p-2">Evidencia / avisos</th></tr></thead>
        <tbody>{rows.slice(0, 100).map((r, index) => <tr key={`${r.id}:${index}`} className="border-t border-slate-200 align-top">
          <td className="p-2 break-all">{r.nombre}<br /><span className="text-xs text-slate-600">{r.origen} · {r.id}</span>
            {r.archivoUrlPrivada && <><br /><a href={r.archivoUrlPrivada} className="text-orange-800 underline" rel="noreferrer">Descarga privada (≤4 MiB)</a></>}</td>
          <td className="p-2">{r.fechaFactura ?? 'Sin fecha'}<br /><span className="text-xs">{r.fechaFacturaProvenancia ?? 'Provenancia no verificada'}</span></td>
          <td className="p-2">{r.modifiedAt ?? 'No verificada'}<br /><span className="text-xs">Selección: {r.seleccion}<br />CreatedAt (no ingreso): {r.createdAt ?? '—'}</span></td>
          <td className="p-2">{r.evidencia}<br />Hash: {r.hashDisponible ? r.hashProvenancia : 'NO DISPONIBLE'}
            {r.motivos.map((m, i) => <p key={i} className="mt-1 text-orange-800">{m}</p>)}</td>
        </tr>)}</tbody>
      </table></div>
      {rows.length > 100 && <p className="mt-2 text-sm text-orange-800">Pantalla limitada a 100 filas de {rows.length}; el CSV del resultado incluye todas las filas devueltas. Esto no amplía el alcance del inventario.</p>}
    </>}
  </details>
}
/** Ninguna consulta al montar/abrir Conciliar: Graph se lee únicamente en Comparar. */
export default function DocumentosComparacion(p: DocumentosComparacionProps = {}) {
  const viewingAs = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verComo')
  const [from, setFrom] = useState(p.from ?? '2026-11-30'), [to, setTo] = useState(p.to ?? '2026-12-04')
  const [result, setResult] = useState<ResultadoDocumentosComparacion | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  // Montaje sin props permitido sólo para tab Stage del padre; no concede permisos.
  // El servidor sigue cerrando Production y exige VFactura+B4Read vivos.
  const allowed = (p.eligible ?? p.canRead ?? true) && p.stagingOnly !== false && !p.acting && !viewingAs
  // Sólo cancelación/limpieza de datos: nunca carga automática ni Graph en useEffect.
  useEffect(() => { if (!allowed) { controller.current?.abort(); setResult(null); setError(''); setBusy(false) } }, [allowed])
  useEffect(() => () => controller.current?.abort(), [])
  const compare = async () => {
    if (!allowed || busy || !validRange(from, to)) return
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch(`${API}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'GET', cache: 'no-store', credentials: 'same-origin', signal: abort.signal })
      const raw = await response.json()
      if (!response.ok) throw new Error(typeof raw?.error === 'string' ? raw.error : 'No se pudo comparar.')
      if (raw?.version !== 'documentos-comparacion/v1' || raw.soloLectura !== true || raw.semanaCompleta !== false
        || !Array.isArray(raw.inventoryCompleteness) || !Array.isArray(raw.NO_VERIFICABLE) || raw.rango?.from !== from || raw.rango?.to !== to) throw new Error('Respuesta incompleta: no se puede verificar el resultado.')
      if (abort.signal.aborted) return
      setResult(raw); p.onCompared?.(raw)
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Resultado no verificable.') }
    finally { if (!abort.signal.aborted) setBusy(false) }
  }
  const downloadCsv = () => {
    if (!result || !allowed) return
    const url = URL.createObjectURL(new Blob([csvSnapshot(result)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `comparacion-documentos-${result.rango.from}-${result.rango.to}.csv`
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!allowed) return null
  return <section className="rounded-xl border border-orange-200 bg-white p-4 space-y-3" aria-label="Comparación documentos panel y carpetas">
    <h3 className="font-semibold text-slate-900">Panel vs. carpetas — comparación de solo lectura (staging)</h3>
    <p className="text-sm text-slate-700">Convivencia 30/11–4/12: carpetas de Lorena siguen RW. Comparar no importa, valida, cobra, archiva ni elimina. Fecha de archivo ≠ fecha de factura ≠ recepción.</p>
    <div className="flex flex-wrap gap-3 items-end"><label className="text-sm">Desde (UTC)<input type="date" value={from} disabled={busy} onChange={e => { setFrom(e.target.value); setResult(null) }} className="block rounded border border-slate-300 p-2" /></label>
      <label className="text-sm">Hasta (UTC)<input type="date" value={to} disabled={busy} onChange={e => { setTo(e.target.value); setResult(null) }} className="block rounded border border-slate-300 p-2" /></label>
      <button type="button" className="rounded-lg bg-orange-700 px-4 py-2 font-medium text-white disabled:opacity-50" disabled={busy || !validRange(from, to)} onClick={() => void compare()}>{busy ? 'Comparando lecturas…' : 'Comparar'}</button>
    </div>
    {!validRange(from, to) && <p className="text-sm text-orange-800">Seleccione fechas válidas, ordenadas y hasta 31 días inclusivos.</p>}
    {error && <p role="alert" className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-orange-900">NO VERIFICABLE: {error} No se han cambiado documentos ni permisos.</p>}
    {result && <>
      <div role="status" className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-orange-900">
        <strong>{result.estado === 'INCOMPLETO' ? 'Comparación incompleta — no verificable' : result.estado === 'DIFERENCIAS' ? 'Diferencias para revisión humana' : 'Sin diferencias únicamente en el alcance leído'}</strong>
        <p className="text-sm mt-1">Leído: {result.readAt}. Inventario: {result.inventarioCompleto ? 'raíces y páginas leídas' : 'incompleto'}. Hashes: {result.hashesCompletos ? 'disponibles en selección' : 'cobertura incompleta'}. Semana completa: NO CERTIFICADA.</p>
      </div>
      <button type="button" className="rounded-lg border border-orange-300 px-3 py-2 text-orange-800" onClick={downloadCsv}>Descargar informe CSV de este resultado</button>
      <ul className="text-sm text-slate-700 list-disc pl-5">{result.inventoryCompleteness.map(i => <li key={i.proveedor}><strong>{i.proveedor}</strong>: {i.completo && !i.truncado ? 'listado agotado' : 'NO VERIFICABLE / incompleto'} · {i.documentos} documentos · {i.scope}{i.incidencias.map((s, n) => <p key={n} className="text-orange-800">{s}</p>)}</li>)}</ul>
      <Rows title="Faltan en panel (sin ID/hash en registro leído)" rows={result.faltanEnPanel} />
      <Rows title="Faltan en carpetas legacy (pueden estar sólo en manual)" rows={result.faltanEnCarpetas} />
      <Rows title="Copias por huella — sólo aviso, sin borrar" rows={result.copiasHuella.flatMap(g => g.documentos.map(r => ({ ...r, motivos: [...r.motivos, g.aviso] })))} />
      <Rows title="Cambios fuera del registro panel (incluye fuera de rango)" rows={result.cambiosFuera} />
      <Rows title="NO VERIFICABLE" rows={result.NO_VERIFICABLE} />
      <Rows title="Coincidencias por ID/hash (ID no certifica igualdad de bytes)" rows={result.coincidencias} />
      <p className="text-sm text-slate-700">Fuera de selección: {result.fueraRango}. Las ausencias son del alcance, no globales.</p>
      {result.avisos.map((s, i) => <p key={i} className="text-xs text-slate-700">{s}</p>)}
      <p className="text-sm text-orange-900">Corte 9/12 sólo tras correo administración funcionando, TODOS los documentos semanales sin faltas, Lorena sin atascos y A3 noviembre correcto. Esta comparación no acredita esas condiciones. Auditoría nocturna readonly/alerta-only prevista, no activada.</p>
    </>}
  </section>
}
