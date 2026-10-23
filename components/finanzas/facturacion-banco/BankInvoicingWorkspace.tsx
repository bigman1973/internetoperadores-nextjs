'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePermisoArea } from '@/hooks/usePermisoArea'
import SyncJobPanel from '@/components/finanzas/sync-jobs/SyncJobPanel'
import ManualCoverageOverlay from '@/components/finanzas/ManualCoverageOverlay'
import {
  B7_AREA_PERMISO,
  B7_PAGE_SIZE,
  formatEuroExact,
  parseBankInvoicingDto,
  type B7BankCoverage,
  type B7InvoiceSettlement,
  type B7MoneyAggregate,
  type B7PaymentState,
  type B7ReadDto,
} from './typesparser'

const API_URL = '/api/admin/facturacion-banco'

const STATE_OPTIONS: Array<{ value: B7PaymentState; label: string }> = [
  { value: 'COBRADA_CALCULADA', label: 'Cobrada calculada' },
  { value: 'PENDIENTE_COBRO', label: 'Pendiente de cobro' },
  { value: 'PENDIENTE_COBRO_REVISION', label: 'Pendiente de revisión' },
]

const REASON_LABELS: Record<string, string> = {
  FUENTE_B2_NO_ECONOMICA: 'La fuente FacturaEmitida no está acreditada como económica.',
  IMPORTE_FUENTE_INEXACTO_O_AUSENTE: 'El total de la fuente no es exacto o falta.',
  TOTAL_CERO_SIN_COBRO_EXIGIBLE: 'Total cero: no existe cobro exigible.',
  FECHA_FUENTE_DESCONOCIDA: 'La fecha de FacturaEmitida no está disponible.',
  ENVOLTORIO_FI_NO_COINCIDE_CON_FUENTE: 'El documento bancario no coincide exactamente con la fuente FacturaEmitida.',
  EVIDENCIA_B4_DIRECTA_NO_VIGENTE: 'La evidencia B4 directa no está vigente o no cumple el cierre documental.',
  SOLAPAMIENTO_FI_DIRECTA_Y_REMESA: 'Hay evidencia directa y de remesa solapadas; requiere revisión.',
  REMESA_FUENTE_O_MAPA_FI_INEXACTO: 'La remesa o su mapa explícito con FacturaEmitida no es exacto.',
  REMESA_EVIDENCIA_B4_NO_VIGENTE: 'La evidencia bancaria B4 de la remesa no está vigente.',
  REMESA_SUMA_NO_SEGURA: 'La suma documental de la remesa no es segura.',
  REMESA_DEVOLUCION_SIN_ATRIBUCION_B6_EXACTA: 'Existe devolución de remesa sin atribución B6 exacta confirmada.',
  REMESA_DEVOLUCION_FUERA_DE_RANGO: 'La devolución de remesa queda fuera del rango firmado de la factura.',
  SUMA_NO_SEGURA_O_FUENTE_INEXACTA: 'No se pudo verificar una suma o una fuente exacta.',
  COBRO_DOCUMENTAL_FUERA_DE_RANGO_FIRMADO: 'El cobro documental queda fuera del rango firmado permitido.',
}

function dateLabel(value: string | null, fallback: string): string {
  if (value === null) return fallback
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function civilAgeDays(value: string | null): string {
  if (value === null) return 'No calculable'
  const [year, month, day] = value.split('-').map(Number)
  const from = Date.UTC(year, month - 1, day)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.floor((today - from) / 86_400_000)
  return days >= 0 ? `${days} días` : `${Math.abs(days)} días por delante`
}

function money(value: number | null): string {
  return value === null ? 'Sin total verificable' : formatEuroExact(value)
}

function stateLabel(state: B7PaymentState): string {
  if (state === 'COBRADA_CALCULADA') return 'Cobrada calculada'
  if (state === 'PENDIENTE_COBRO') return 'Pendiente de cobro'
  return 'Pendiente de revisión'
}

function stateClass(state: B7PaymentState): string {
  if (state === 'COBRADA_CALCULADA') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (state === 'PENDIENTE_COBRO') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-rose-200 bg-rose-50 text-rose-900'
}

function sourceLabel(source: B7InvoiceSettlement['paymentSources'][number]): string {
  return source === 'B4_DIRECTO' ? 'B4 · documento directo' : 'B6 · remesa · sólo banco'
}

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] || reason
}

function queryLabel(dto: B7ReadDto): string {
  const { q, mes, estado } = dto.query
  if (!q && !mes && !estado) return 'Resumen completo de FacturaEmitida; no depende de esta página.'
  return 'Resumen de los filtros aplicados por el servidor; no depende de esta página.'
}

function coveragePresentation(coverage: B7BankCoverage): { className: string; title: string; text: string } {
  const count = `${coverage.accountsWithKnownCutoff} de ${coverage.activeAccountCount} cuenta(s) con corte verificable`
  if (coverage.status === 'KNOWN') {
    return {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      title: 'Cobertura bancaria conocida',
      text: coverage.asOf
        ? `El corte mínimo verificado de todas las cuentas activas es ${dateLabel(coverage.asOf, coverage.asOf)}. No se afirma cobertura posterior a esta fecha. ${count}.`
        : `La cobertura se marca conocida, pero el DTO no aporta una fecha de corte. No se afirma cobertura de ninguna fecha posterior. ${count}.`,
    }
  }
  return {
    className: 'border-amber-300 bg-amber-50 text-amber-950',
    title: 'Cobertura bancaria incompleta',
    text: `Cobro observado en extractos disponibles; cobertura incompleta. ${count}.`,
  }
}

function buildRequestUrl(query: { q: string; mes: string; estado: string; offset: number }): string {
  const params = new URLSearchParams({ limit: String(B7_PAGE_SIZE), offset: String(query.offset) })
  const q = query.q.trim()
  if (q) params.set('q', q)
  if (query.mes) params.set('mes', query.mes)
  if (query.estado) params.set('estado', query.estado)
  return `${API_URL}?${params.toString()}`
}

function apiMessage(value: unknown, fallback: string): string {
  return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error
    : fallback
}

/**
 * Pantalla B7 de sólo lectura. La única población presentada es FacturaEmitida;
 * cualquier estado de cobro procede exclusivamente del DTO documental B4/B6.
 */
export default function BankInvoicingWorkspace() {
  const { canRead } = usePermisoArea(B7_AREA_PERMISO)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [state, setState] = useState('')
  const [offset, setOffset] = useState(0)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [data, setData] = useState<B7ReadDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<B7InvoiceSettlement | null>(null)
  const requestSequence = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)

  const requestUrl = useMemo(
    () => buildRequestUrl({ q: search, mes: month, estado: state, offset }),
    [month, offset, search, state],
  )

  const retry = useCallback(() => setReloadNonce((value) => value + 1), [])

  useEffect(() => {
    if (!canRead) {
      activeRequest.current?.abort()
      activeRequest.current = null
      setLoading(false)
      return
    }

    const sequence = ++requestSequence.current
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    setData(null)
    setError(null)
    setLoading(true)

    // Search is deliberately debounced. Every filter refresh uses the same sequence
    // and AbortController so a slower prior response cannot replace current results.
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(requestUrl, { cache: 'no-store', signal: controller.signal })
          const json: unknown = await response.json().catch(() => null)
          if (!response.ok) throw new Error(apiMessage(json, 'No se pudo leer la facturación calculada desde banco.'))
          const parsed = parseBankInvoicingDto(json)
          if (parsed.ok === false) throw new Error(`La respuesta de facturación bancaria no es válida: ${parsed.error}`)
          if (sequence !== requestSequence.current || controller.signal.aborted) return
          setData(parsed.value)
        } catch (caught) {
          if (controller.signal.aborted || sequence !== requestSequence.current) return
          setError(caught instanceof Error ? caught.message : 'No se pudo leer la facturación calculada desde banco.')
        } finally {
          if (sequence === requestSequence.current && !controller.signal.aborted) setLoading(false)
        }
      })()
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [canRead, reloadNonce, requestUrl])

  useEffect(() => () => activeRequest.current?.abort(), [])

  const coverage = data ? coveragePresentation(data.bankCoverage) : null
  const totalPagesStart = data && data.pagination.total > 0 ? data.pagination.offset + 1 : 0
  const totalPagesEnd = data ? Math.min(data.pagination.offset + data.items.length, data.pagination.total) : 0

  if (!canRead) {
    return (
      <section className="mx-auto w-full max-w-7xl min-w-0 p-4 sm:p-6" aria-labelledby="b7-title">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h1 id="b7-title" className="text-xl font-bold">Facturación</h1>
          <p className="mt-2 text-sm">No tiene permiso de lectura para <code>{B7_AREA_PERMISO}</code>. No se han solicitado datos financieros.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 p-4 text-slate-900 sm:p-6" aria-labelledby="b7-title" data-testid="b7-workspace">
      <header className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-800 to-orange-700 p-5 text-white shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-100">Finanzas · facturación documental</p>
        <div className="mt-2 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 id="b7-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Facturación</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-100">Facturas emitidas y cobro documental confirmado por banco. No usa estados de cobro del ISP ni marca facturas como cobradas.</p>
          </div>
          <nav aria-label="Navegación financiera" className="flex flex-wrap gap-2">
            <Link href="/admin/finanzas/conciliacion-v2" className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white">Conciliación</Link>
            <Link href="/admin/finanzas/pendientes" className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white">Pendientes</Link>
          </nav>
        </div>
      </header>

      <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        <strong>Lectura bancaria.</strong> Los cobros se calculan desde banco. Marcar cobradas por ISP/remesa sin abono está desactivado.
      </div>
      <ManualCoverageOverlay consumer="B7" />
      <SyncJobPanel
        source="ISP"
        title="Sincronización de facturas emitidas (ISP)"
        description="Sólo sincroniza facturas emitidas. No modifica cobros, remesas ni estados financieros."
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Filtros de facturación">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(220px,1fr)_190px_230px_auto] lg:items-end">
          <label className="block min-w-0 text-sm font-semibold text-slate-800" htmlFor="b7-search">Buscar
            <input id="b7-search" data-testid="b7-search" value={search} onChange={(event) => { setSearch(event.target.value.slice(0, 120)); setOffset(0) }} maxLength={120} placeholder="Factura o cliente" className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
          </label>
          <label className="block text-sm font-semibold text-slate-800" htmlFor="b7-month">Mes de emisión
            <span className="mt-1 flex gap-2"><input id="b7-month" data-testid="b7-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setOffset(0) }} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /><button type="button" onClick={() => { setMonth(''); setOffset(0) }} disabled={!month} className="rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Todos</button></span>
          </label>
          <label className="block text-sm font-semibold text-slate-800" htmlFor="b7-state">Estado documental
            <select id="b7-state" data-testid="b7-state" value={state} onChange={(event) => { setState(event.target.value); setOffset(0) }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
              <option value="">Todos los estados documentales</option>
              {STATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={retry} disabled={loading} className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-bold text-orange-900 shadow-sm hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60">Actualizar</button>
        </div>
        <p className="mt-3 text-xs text-slate-600">El mes filtra la fecha de la FacturaEmitida. Vacío significa todos los meses y mantiene el resumen completo.</p>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
          <p><strong>No se muestran importes sustituidos.</strong> {error}</p>
          <button type="button" onClick={retry} className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-bold text-rose-900 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500">Reintentar lectura</button>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && data && <>
        {coverage && <section role="status" className={`rounded-xl border p-4 text-sm ${coverage.className}`} aria-label="Cobertura bancaria B3">
          <p className="font-bold">{coverage.title}</p>
          <p className="mt-1">{coverage.text}</p>
        </section>}

        <section aria-label="Resumen de facturación documental" className="min-w-0">
          <p className="mb-3 px-1 text-xs text-slate-600">{queryLabel(data)}</p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MoneyCard title="Facturado" subtitle="FacturaEmitida · firmado" aggregate={data.summary.facturado} tone="slate" />
            <MoneyCard title="Cobro documental confirmado" subtitle="Evidencia B4/B6" aggregate={data.summary.cobroDocumentalConfirmado} tone="emerald" />
            <MoneyCard title="Pendiente no confirmado" subtitle="Sin cobro bancario confirmado" aggregate={data.summary.pendienteNoConfirmado} tone="amber" />
            <DifferenceCard attributable={data.summary.diferenciasCaja.atribuible} unallocated={data.summary.diferenciasCaja.sinAtribuir} />
          </div>
          <p className="mt-3 px-1 text-xs text-slate-600">Población resumida: {data.summary.invoicesTotal} factura(s) · cobradas calculadas: {data.summary.cobradasCalculadas} · pendientes: {data.summary.pendientesCobro} · revisión: {data.summary.revisiones}.</p>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="b7-table-title">
          <div className="flex min-w-0 flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div className="min-w-0"><h2 id="b7-table-title" className="font-bold text-slate-950">Facturas emitidas</h2><p className="mt-1 text-xs text-slate-600">Cobro documental, pendiente y estado se reciben del cálculo B7 de servidor.</p></div>
            <p className="shrink-0 text-xs text-slate-500">{data.pagination.total} resultado(s) de servidor</p>
          </div>
          <InvoiceTable rows={data.items} onDetail={setDetail} />
          <Pagination data={data} disabled={loading} onPage={setOffset} start={totalPagesStart} end={totalPagesEnd} />
        </section>
      </>}

      {!loading && !data && !error && <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Prepare una consulta para leer la facturación documental.</div>}

      {detail && <BankDetailDialog invoice={detail} onClose={() => setDetail(null)} />}
    </section>
  )
}

function MoneyCard({ title, subtitle, aggregate, tone }: { title: string; subtitle: string; aggregate: B7MoneyAggregate; tone: 'slate' | 'emerald' | 'amber' }) {
  const colors = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/60' : tone === 'amber' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'
  const valueClass = tone === 'emerald' ? 'text-emerald-800' : tone === 'amber' ? 'text-amber-900' : 'text-slate-950'
  return <article className={`min-w-0 rounded-xl border p-4 shadow-sm ${colors}`}><p className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</p><p className="mt-1 text-xs text-slate-600">{subtitle}</p><p className={`mt-3 break-words font-mono text-xl font-bold ${valueClass}`}>{money(aggregate.cents)}</p>{aggregate.cents === null && <><p className="mt-2 text-xs font-semibold text-slate-800">Parte conocida: {money(aggregate.knownCents)}</p><p className="mt-1 text-xs text-slate-600">{aggregate.unknownInvoiceCount} factura(s) con datos no verificables.</p></>}</article>
}

function DifferenceCard({ attributable, unallocated }: { attributable: B7MoneyAggregate; unallocated: B7MoneyAggregate }) {
  return <article className="min-w-0 rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-violet-800">Diferencias de caja</p><p className="mt-1 text-xs text-slate-600">No alteran la deuda documental.</p><AggregateLine label="Atribuibles" aggregate={attributable} /><AggregateLine label="No atribuidas" aggregate={unallocated} /></article>
}

function AggregateLine({ label, aggregate }: { label: string; aggregate: B7MoneyAggregate }) {
  return <div className="mt-3 border-t border-violet-200 pt-3"><p className="text-xs font-bold text-slate-700">{label}</p><p className="mt-1 break-words font-mono text-sm font-bold text-slate-950">{money(aggregate.cents)}</p>{aggregate.cents === null && <><p className="mt-1 text-xs font-semibold text-slate-700">Parte conocida: {money(aggregate.knownCents)}</p><p className="mt-1 text-xs text-slate-600">{aggregate.unknownInvoiceCount} factura(s) con datos no verificables.</p></>}</div>
}

function InvoiceTable({ rows, onDetail }: { rows: B7InvoiceSettlement[]; onDetail: (row: B7InvoiceSettlement) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // The legacy mobile stylesheet uses overflow: visible with !important. This
    // must remain a real inline important declaration, not merely a Tailwind class.
    scrollRef.current?.style.setProperty('overflow-x', 'auto', 'important')
  }, [])
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-slate-600"><p className="font-semibold text-slate-800">No hay facturas para estos filtros.</p><p className="mt-1">No se interpreta como cobro, pendiente o importe cero.</p></div>
  return <div ref={scrollRef} className="relative min-w-0 w-full" style={{ overflowX: 'auto', contain: 'inline-size' }} data-testid="b7-table-scroll">
    <table className="w-full min-w-[1220px] text-left text-sm" style={{ display: 'table' }}>
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Nº factura</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Fecha / vencimiento / antigüedad</th><th className="px-4 py-3 text-right">Importe de factura</th><th className="px-4 py-3 text-right">Pagado documental</th><th className="px-4 py-3 text-right">Pendiente</th><th className="px-4 py-3">Estado de pago</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.invoiceId} className="align-top hover:bg-orange-50/40"><td className="px-4 py-3"><p className="font-bold text-slate-950">{row.numFactura || 'Número no disponible'}</p><p className="mt-1 max-w-[180px] break-all font-mono text-xs text-slate-500">FI: {row.invoiceId}</p></td><td className="px-4 py-3"><p className="max-w-[230px] break-words font-medium text-slate-900">{row.cliente || 'Cliente no disponible'}</p>{row.facturaISPId !== null && <p className="mt-1 text-xs text-slate-500">Espejo ISP #{row.facturaISPId}</p>}</td><td className="px-4 py-3 whitespace-nowrap"><p>{dateLabel(row.fechaISO, 'Fecha no disponible')}</p><p className="mt-1 text-xs text-slate-600">Venc.: {dateLabel(row.fechaVencimientoISO, 'No informado')}</p><p className="mt-1 text-xs font-semibold text-orange-800">Antigüedad: {civilAgeDays(row.fechaISO)}</p></td><td className="px-4 py-3 text-right font-mono font-semibold text-slate-950">{money(row.targetCents)}</td><td className="px-4 py-3 text-right font-mono text-slate-900">{money(row.paidDocumentaryCents)}</td><td className="px-4 py-3 text-right font-mono font-bold text-slate-950">{money(row.remainingCents)}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${stateClass(row.paymentState)}`}>{stateLabel(row.paymentState)}</span><div className="mt-2 flex max-w-[220px] flex-wrap gap-1">{row.paymentSources.length === 0 ? <span className="text-xs text-slate-500">Sin fuente documental confirmada</span> : row.paymentSources.map((source) => <span key={source} className="rounded bg-slate-100 px-1.5 py-1 text-xs font-semibold text-slate-700">{sourceLabel(source)}</span>)}</div>{row.reasons.length > 0 && <p className="mt-2 max-w-[230px] text-xs text-rose-800">Revisión: {reasonLabel(row.reasons[0])}</p>}</td><td className="px-4 py-3"><div className="flex min-w-[145px] flex-col gap-2"><button type="button" onClick={() => onDetail(row)} className="rounded-md border border-orange-300 bg-white px-3 py-2 text-xs font-bold text-orange-900 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500">Ver revisión bancaria</button><Link href="/admin/finanzas/facturas-emitidas" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500">Ver detalle</Link></div></td></tr>)}</tbody>
    </table>
  </div>
}

function Pagination({ data, disabled, onPage, start, end }: { data: B7ReadDto; disabled: boolean; onPage: (offset: number) => void; start: number; end: number }) {
  const previousDisabled = disabled || data.pagination.offset === 0
  const nextDisabled = disabled || data.pagination.offset + data.pagination.limit >= data.pagination.total
  if (data.pagination.total <= B7_PAGE_SIZE) return null
  return <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-slate-600">Mostrando {start}–{end} de {data.pagination.total}</p><div className="flex gap-2"><button type="button" onClick={() => onPage(Math.max(0, data.pagination.offset - data.pagination.limit))} disabled={previousDisabled} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Anterior</button><button type="button" onClick={() => onPage(data.pagination.offset + data.pagination.limit)} disabled={nextDisabled} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button></div></div>
}

function BankDetailDialog({ invoice, onClose }: { invoice: B7InvoiceSettlement; onClose: () => void }) {
  return <dialog open aria-labelledby="b7-detail-title" onClose={onClose} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-slate-300 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
    <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-5 sm:p-6"><div className="flex gap-4"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-orange-800">Revisión humana</p><h2 id="b7-detail-title" className="mt-1 text-xl font-bold text-slate-950">Revisión bancaria de {invoice.numFactura || 'factura sin número'}</h2><p className="mt-2 text-sm text-slate-600">Sólo se muestran datos de la factura y fuentes documentales. No se exponen correos ni se presupone el movimiento bancario exacto.</p></div><button type="button" onClick={onClose} className="h-fit rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500">Cerrar</button></div><dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><Meta label="ID FacturaEmitida" value={invoice.invoiceId} /><Meta label="Espejo ISP explícito" value={invoice.facturaISPId === null ? 'No vinculado' : `#${invoice.facturaISPId}`} /><Meta label="Objetivo firmado" value={money(invoice.targetCents)} /><Meta label="Pagado documental" value={money(invoice.paidDocumentaryCents)} /><Meta label="Caja atribuible" value={money(invoice.cashCents)} /><Meta label="Diferencia de caja atribuible" value={money(invoice.attributableCashDifferenceCents)} /><Meta label="Fuentes" value={invoice.paymentSources.length ? invoice.paymentSources.map(sourceLabel).join(' · ') : 'Sin fuente documental confirmada'} /><Meta label="Estado" value={stateLabel(invoice.paymentState)} /></dl><div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">Identificación de movimiento</p><p className="mt-1">Identificar el movimiento exacto requiere revisión humana en Conciliación: este DTO no contiene IDs de evidencia bancaria, por lo que no se adivinan ni se enlazan.</p><Link href="/admin/finanzas/conciliacion-v2" className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600">Abrir Conciliación</Link></div><div className="mt-4"><h3 className="font-bold text-slate-950">Motivos de revisión</h3>{invoice.reasons.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{invoice.reasons.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No hay motivos de revisión devueltos.</p>}</div></div>
  </dialog>
}

function Meta({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-mono text-sm text-slate-950">{value}</dd></div> }

function Skeleton() { return <div aria-busy="true" aria-live="polite" className="space-y-5"><span className="sr-only">Cargando facturación bancaria</span><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />)}</div><div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" /></div> }
