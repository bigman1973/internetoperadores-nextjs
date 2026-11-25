'use client'
/**
 * Facturación · pantalla según la maqueta aprobada (maqueta_facturacion_aprobada.html).
 * Mismos datos y cálculos que antes (B7, resumen ISP y sincronización ISP): aquí solo se presentan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IoShell, Toast, TopBar, Wrap } from '@/components/io-ui/kit'
import SyncJobPanel from '@/components/finanzas/sync-jobs/SyncJobPanel'
import { parseSyncJobsState, type SyncJobDTO } from '@/components/finanzas/sync-jobs/sync-job-types'
import { B7_PAGE_SIZE, parseBankInvoicingDto, type B7InvoiceSettlement, type B7ReadDto } from '@/components/finanzas/facturacion-banco/typesparser'
import { parseMonthlyInvoicingDto, formatHundredthsPercent, type MonthlyInvoicingDto } from '@/components/finanzas/monthly-invoicing/response-parser'
import { AgeChart, HBarsF, Stacked } from './charts'
import { BUCKET_LABEL, BUCKET_TONE, MES3, MES_LARGO, bucketOf, buildAlerts, cuadra, fmtDate, fmtDay, fmtEur, fmtNum, fmtPct, monthRows, parseLineas, pctOf, reasonPlain, syncText, totales, visibleMonths, type Alert, type Bucket } from './model'

const VIEWS = ['resumen', 'facturas', 'cobros', 'clientes', 'meses'] as const
type View = (typeof VIEWS)[number]
const LABELS: Record<View, string> = { resumen: 'Resumen', facturas: 'Facturas', cobros: 'Cobros y deuda', clientes: 'Por cliente', meses: 'Mes a mes' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const serieOf = (n: string | null) => (n && /^[A-Za-z]+/.exec(n)?.[0]?.toUpperCase()) || 'sin dato'
const ESTADOS: { v: string; label: string }[] = [{ v: 'confirmado', label: 'Cobrada (banco)' }, { v: 'por_confirmar', label: 'Por confirmar' }, { v: 'sin_extracto', label: 'Sin extracto' }, { v: 'revision', label: 'En revisión' }]

type CoverageAccount = { alias: string | null; banco: string; activa: boolean; effectiveCutoffDate: string | null }
type Detail = { loading: boolean; row: Record<string, unknown> | null }

async function getJson(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  let json: unknown = null
  try { json = await res.json() } catch { json = null }
  return { ok: res.ok, status: res.status, json }
}
const errText = (json: unknown, fallback: string) => (json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string' ? (json as { error: string }).error : fallback)

export default function FacturacionClient() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState<View>('resumen')
  const [year, setYear] = useState<number>(today.getFullYear())
  const [dto, setDto] = useState<B7ReadDto | null>(null)
  const [resumen, setResumen] = useState<MonthlyInvoicingDto | null>(null)
  const [resumenError, setResumenError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<CoverageAccount[] | null>(null)
  const [accountsError, setAccountsError] = useState('')
  const [lastSync, setLastSync] = useState<SyncJobDTO | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  /* filtros de Facturas */
  const [q, setQ] = useState(''); const [qd, setQd] = useState('')
  const [fMes, setFMes] = useState(''); const [fSerie, setFSerie] = useState(''); const [fEstado, setFEstado] = useState('')
  const [offset, setOffset] = useState(0)
  const [list, setList] = useState<{ items: B7InvoiceSettlement[]; total: number } | null>(null)
  const [listError, setListError] = useState(''); const [listLoading, setListLoading] = useState(false)
  /* detalle */
  const [sel, setSel] = useState<B7InvoiceSettlement | null>(null)
  const [detail, setDetail] = useState<Detail>({ loading: false, row: null })
  const closeRef = useRef<HTMLButtonElement>(null)
  const seq = useRef(0); const listSeq = useRef(0)

  const say = useCallback((t: string) => { setToast(t) }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast])
  useEffect(() => { const t = setTimeout(() => { setQd(q.trim()); setOffset(0) }, 350); return () => clearTimeout(t) }, [q])

  /* pestañas por #hash, como en la maqueta */
  useEffect(() => { const read = () => { const h = window.location.hash.slice(1); if ((VIEWS as readonly string[]).includes(h)) setView(h as View) }; read(); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read) }, [])
  const go = useCallback((v: View) => { setView(v); try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${v}`) } catch { /* sin historial */ } }, [])

  /* datos principales del año: KPIs, gráficos y reparto de cobro */
  useEffect(() => {
    const my = ++seq.current
    setLoading(true); setError('')
    void (async () => {
      try {
        const r = await getJson(`/api/admin/facturacion-banco?limit=1&anio=${year}`)
        if (my !== seq.current) return
        if (!r.ok) { setError(errText(r.json, 'No se han podido leer las facturas. Inténtalo de nuevo en unos minutos.')); setLoading(false); return }
        const parsed = parseBankInvoicingDto(r.json)
        if (!parsed.ok) { setError('La respuesta del servidor no es válida; no se muestra ninguna cifra.'); setLoading(false); return }
        const years = parsed.value.analitica?.aniosDisponibles ?? []
        if (years.length > 0 && !years.includes(year) && parsed.value.summary.invoicesTotal === 0) { setYear(years[0]); return }
        setDto(parsed.value); setLoading(false)
      } catch { if (my === seq.current) { setError('No se ha podido contactar con el servidor.'); setLoading(false) } }
    })()
  }, [year, reload])

  /* resumen ISP (mayoristas y remesas), cobertura de cuentas y última sincronización: independientes */
  useEffect(() => {
    void (async () => {
      try {
        const r = await getJson('/api/admin/facturacion/resumen')
        if (!r.ok) { setResumenError(errText(r.json, 'sin dato')); return }
        const p = parseMonthlyInvoicingDto(r.json)
        if (p.ok) { setResumen(p.value); setResumenError('') } else setResumenError('sin dato')
      } catch { setResumenError('sin dato') }
    })()
    void (async () => {
      try {
        const r = await getJson('/api/admin/finanzas/cortes-cobertura')
        const j = r.json as { accounts?: unknown } | null
        if (!r.ok || !j || !Array.isArray(j.accounts)) { setAccountsError('sin dato'); return }
        setAccounts((j.accounts as Record<string, unknown>[]).map(a => ({ alias: typeof a.alias === 'string' ? a.alias : null, banco: typeof a.banco === 'string' ? a.banco : 'Cuenta', activa: a.activa !== false, effectiveCutoffDate: typeof a.effectiveCutoffDate === 'string' ? a.effectiveCutoffDate : null })))
      } catch { setAccountsError('sin dato') }
    })()
    void (async () => {
      try {
        const r = await getJson('/api/admin/finanzas/sync-jobs?source=ISP')
        const p = parseSyncJobsState(r.json)
        if (r.ok && p.ok) setLastSync(p.value.activeJob ?? p.value.lastJob)
      } catch { /* sin estado de sincronización */ }
    })()
  }, [reload])

  /* lista de facturas */
  useEffect(() => {
    if (view !== 'facturas') return
    const my = ++listSeq.current
    setListLoading(true); setListError('')
    const p = new URLSearchParams({ limit: String(B7_PAGE_SIZE), offset: String(offset) })
    if (fMes) p.set('mes', `${year}-${fMes}`); else p.set('anio', String(year))
    if (qd) p.set('q', qd); if (fSerie) p.set('serie', fSerie); if (fEstado) p.set('cobro', fEstado)
    void (async () => {
      try {
        const r = await getJson(`/api/admin/facturacion-banco?${p}`)
        if (my !== listSeq.current) return
        if (!r.ok) { setListError(errText(r.json, 'No se ha podido leer el listado.')); setListLoading(false); return }
        const parsed = parseBankInvoicingDto(r.json)
        if (!parsed.ok) { setListError('La respuesta del servidor no es válida.'); setListLoading(false); return }
        setList({ items: parsed.value.items, total: parsed.value.pagination.total }); setListLoading(false)
      } catch { if (my === listSeq.current) { setListError('No se ha podido contactar con el servidor.'); setListLoading(false) } }
    })()
  }, [view, year, qd, fMes, fSerie, fEstado, offset, reload])

  const a = dto?.analitica ?? null
  const cutoff = a?.corte.fecha ?? null
  const tot = useMemo(() => (dto ? totales(dto) : null), [dto])
  const rows = useMemo(() => (a ? monthRows(a, resumen, year) : []), [a, resumen, year])
  const nVis = visibleMonths(year, today)
  const alerts: Alert[] = useMemo(() => (dto ? buildAlerts(dto, rows, resumen, year, today) : []), [dto, rows, resumen, year, today])
  const isCurrent = year === today.getFullYear()

  /* enlace al CRM: se busca la ficha por NIF y, si no, por nombre */
  async function openCrm(name: string | null, cif?: string | null) {
    const tries = [cif, name].filter((x): x is string => !!x && x.trim().length >= 2)
    for (const t of tries) {
      try {
        const r = await getJson(`/api/admin/crm/empresas?query=${encodeURIComponent(t.slice(0, 100))}&limit=1`)
        const id = (r.json as { companies?: { id?: unknown }[] } | null)?.companies?.[0]?.id
        if (r.ok && typeof id === 'string' && id) { window.location.assign(`/admin/crm/empresas/${encodeURIComponent(id)}`); return }
      } catch { /* siguiente intento */ }
    }
    say('Este cliente no tiene ficha en el CRM todavía (o no tienes acceso al CRM).')
  }

  /* panel lateral de una factura */
  function openInvoice(inv: B7InvoiceSettlement) {
    setSel(inv); setDetail({ loading: true, row: null })
    void (async () => {
      try {
        if (!inv.numFactura) { setDetail({ loading: false, row: null }); return }
        const r = await getJson(`/api/admin/finanzas/facturas-emitidas?q=${encodeURIComponent(inv.numFactura)}&limit=5`)
        const rowsJ = (r.json as { facturas?: Record<string, unknown>[] } | null)?.facturas
        const row = r.ok && Array.isArray(rowsJ) ? rowsJ.find(f => f.numFactura === inv.numFactura) ?? null : null
        setDetail({ loading: false, row })
      } catch { setDetail({ loading: false, row: null }) }
    })()
  }
  useEffect(() => {
    if (!sel) return
    closeRef.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSel(null) } }
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k)
  }, [sel])

  /* acciones */
  async function exportAll() {
    if (busy) return
    setBusy('Preparando el Excel…')
    try {
      const all: B7InvoiceSettlement[] = []
      for (let off = 0; off < 100_000; off += 100) {
        const p = new URLSearchParams({ limit: '100', offset: String(off) })
        if (fMes) p.set('mes', `${year}-${fMes}`); else p.set('anio', String(year))
        if (qd) p.set('q', qd); if (fSerie) p.set('serie', fSerie); if (fEstado) p.set('cobro', fEstado)
        const r = await getJson(`/api/admin/facturacion-banco?${p}`)
        const parsed = r.ok ? parseBankInvoicingDto(r.json) : null
        if (!parsed || !parsed.ok) throw new Error('lectura')
        all.push(...parsed.value.items)
        if (off + 100 >= parsed.value.pagination.total) break
      }
      const { exportFacturas } = await import('./export-xlsx')
      await exportFacturas(all.map(i => ({ numero: i.numFactura ?? 'sin dato', cliente: i.cliente ?? 'sin dato', serie: serieOf(i.numFactura), fecha: fmtDate(i.fechaISO), vencimiento: fmtDate(i.fechaVencimientoISO), importe: i.targetCents === null ? null : i.targetCents / 100, cobrado: i.paidDocumentaryCents === null ? null : i.paidDocumentaryCents / 100, pendiente: i.remainingCents === null ? null : i.remainingCents / 100, estado: BUCKET_LABEL[bucketOf(i, cutoff)] })), `${year}${fMes ? `-${fMes}` : ''}`)
      say(`Excel descargado: ${fmtNum(all.length)} facturas.`)
    } catch { say('No se pudo generar el Excel. Vuelve a intentarlo.') } finally { setBusy('') }
  }
  function accion(v: string) {
    if (v === 'excel') void exportAll()
    else if (v === 'anio') setSyncOpen(true)
    else if (v === 'libro') window.location.assign('/admin/finanzas/facturas-emitidas')
  }
  function runAlert(al: Alert) {
    if (al.to === 'conciliar') window.location.assign('/admin/finanzas/conciliar')
    else if (al.to === 'importar') window.location.assign('/admin/finanzas/estado-cuentas')
    else if (al.to === 'revision') { setFEstado('revision'); setFMes(''); setOffset(0); go('facturas') }
    else if (al.to === 'meses') go('meses')
    else if (al.to === 'cobros') go('cobros')
    else window.location.assign('/admin/finanzas/facturas-emitidas')
  }
  const pickMonth = (i: number) => { setFMes(String(i + 1).padStart(2, '0')); setFEstado(''); setFSerie(''); setQ(''); setQd(''); setOffset(0); go('facturas') }
  const pickEstado = (e: string, v: View = 'cobros') => { setFEstado(e); setFMes(''); setOffset(0); if (v === 'facturas') go('facturas') }

  /* ───────── piezas de la pantalla ───────── */
  const F = tot?.base ?? null
  const confirmedAmt = tot?.confirmado ?? null
  const pctConf = F !== null && confirmedAmt !== null ? pctOf(confirmedAmt, F) : null
  const closedMonths = isCurrent ? today.getMonth() : nVis
  const closedSum = rows.slice(0, closedMonths).reduce((s, r) => s + r.fact, 0)
  const curIdx = isCurrent ? today.getMonth() : 11
  const cur = rows[curIdx]
  const kpis: { label: string; v: string; sub: string; tone: string; go: () => void }[] = dto && tot && a ? [
    { label: `Facturado ${year}`, v: fmtEur(tot.facturado ?? tot.base), sub: `${fmtNum(tot.nFacturas)} facturas${nVis > 0 ? ` · ${MES3[0].toLowerCase()}–${MES3[nVis - 1].toLowerCase()}` : ''}`, tone: '', go: () => go('meses') },
    { label: isCurrent ? `${cap(MES_LARGO[curIdx])} (en curso)` : `${cap(MES_LARGO[curIdx])} (cierre)`, v: cur ? fmtEur(Math.round(cur.fact * 100)) : 'sin dato', sub: cur ? `${fmtNum(cur.n)} facturas${isCurrent ? ' hasta hoy' : ''}` : 'sin dato', tone: '', go: () => pickMonth(curIdx) },
    { label: 'Media mensual', v: closedMonths > 0 ? fmtEur(Math.round(closedSum / closedMonths * 100)) : 'sin dato', sub: closedMonths > 0 ? `${MES_LARGO[0]} a ${MES_LARGO[closedMonths - 1]}` : 'sin meses cerrados', tone: '', go: () => go('meses') },
    { label: 'Cobro confirmado', v: fmtEur(confirmedAmt), sub: `${fmtPct(pctConf)} · con extracto bancario`, tone: 'g', go: () => go('cobros') },
    { label: 'Por confirmar', v: fmtEur(tot.porConfirmar), sub: `${fmtNum(tot.nPorConfirmar)} facturas · ir a Conciliar`, tone: 'w', go: () => go('cobros') },
    { label: 'Sin extracto todavía', v: fmtEur(tot.sinExtracto), sub: `${fmtNum(tot.nSinExtracto)} facturas${cutoff ? ` posteriores al ${fmtDay(cutoff)}` : ' sin corte bancario'}`, tone: 'o', go: () => go('cobros') },
  ] : []

  const tabs = <nav className="tabs" role="tablist" aria-label="Vistas">{VIEWS.map(k => <a key={k} role="tab" tabIndex={0} aria-selected={view === k} aria-current={view === k ? 'page' : undefined} onClick={() => go(k)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(k) } }}>{LABELS[k]}{k === 'facturas' && dto && <> <span className="tag">{fmtNum(dto.summary.invoicesTotal)}</span></>}</a>)}</nav>
  const years = a?.aniosDisponibles.length ? a.aniosDisponibles : [year]
  const controls = <>
    <select className="f" aria-label="Año" value={year} onChange={e => { setYear(Number(e.target.value)); setOffset(0); setFMes('') }}>{(years.includes(year) ? years : [year, ...years]).map(y => <option key={y} value={y}>{y}</option>)}</select>
    <span className="sync">{syncText(lastSync?.finishedAt ?? lastSync?.startedAt ?? null, lastSync?.status ?? null, cutoff)}</span>
    <button className="btn" type="button" onClick={() => setSyncOpen(true)}>Sincronizar con ISP</button>
    <a className="btn primary" href="/admin/finanzas/conciliar">Ir a Conciliar</a>
    <select className="f" aria-label="Acciones" value="" disabled={!!busy} onChange={e => accion(e.target.value)}><option value="">{busy || 'Acciones'}</option><option value="excel">Exportar facturas a Excel</option><option value="anio">Leer año completo de ISP</option><option value="libro">Libro de facturas emitidas</option></select>
  </>

  const check = tot ? cuadra(tot) : { ok: false, diff: 0 }
  const sumMeses = a ? a.mensual.reduce((s, m) => s + m.facturado, 0) : 0
  const mesesOk = tot !== null && Math.abs(sumMeses - (tot.facturado ?? tot.base)) <= 1

  return <IoShell><div className="fac">
    <TopBar eyebrow="Facturación · facturas emitidas y cobros" controls={controls} tabs={tabs}>
      <div className="kpis" id="kpis">{kpis.length > 0 ? kpis.map(k => <div className="kpi click" key={k.label} role="button" tabIndex={0} onClick={k.go} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.go() } }}><div className="eyebrow">{k.label}</div><div className={`v ${k.tone}`}>{k.v}</div><div className="s">{k.sub}</div></div>) : Array.from({ length: 6 }, (_, i) => <div className="kpi" key={i}><div className="eyebrow">{loading ? 'Cargando…' : 'sin dato'}</div><div className="v">—</div><div className="s">&nbsp;</div></div>)}</div>
    </TopBar>
    <Wrap as="main">
      {error && <div className="panel"><div className="note bad" role="alert">{error}</div><p><button className="btn" type="button" onClick={() => setReload(n => n + 1)}>Reintentar</button></p></div>}
      {!error && loading && !dto && <div className="panel" aria-busy="true">Cargando facturación de {year}…</div>}
      {dto && a && tot && <>
        {view === 'resumen' && <section>
          <div className="callout">
            <div><div className="eyebrow">Cobro confirmado por banco</div><div className="big">{fmtPct(pctConf)}</div></div>
            <div>
              <b>{pctConf !== null && pctConf < 50 ? 'Solo ' : ''}{fmtEur(confirmedAmt)} de {fmtEur(F)} tienen el cobro confirmado en un extracto.</b> Lo que falta por confirmar no quiere decir que se deba: la mayoría suele estar cobrado y sin conciliar. {cutoff ? `Las cuentas tienen extractos cargados hasta el ${fmtDate(cutoff)}.` : 'Ahora mismo no hay un corte bancario verificable para todas las cuentas.'}
              {F !== null && F > 0 && confirmedAmt !== null && <div className="fmeter" role="img" aria-label="Estado de cobro"><i style={{ width: `${(confirmedAmt / F) * 100}%`, background: 'var(--good)' }} /><i style={{ width: `${(tot.porConfirmar / F) * 100}%`, background: 'var(--warn)' }} /><i style={{ width: `${(tot.sinExtracto / F) * 100}%`, background: 'var(--before)' }} /></div>}
              <div className="legend" style={{ marginTop: 6 }}><span><i style={{ background: 'var(--good)' }} />Confirmado {fmtEur(confirmedAmt)}</span><span><i style={{ background: 'var(--warn)' }} />Por confirmar {fmtEur(tot.porConfirmar)}</span><span><i style={{ background: 'var(--before)' }} />Sin extracto {fmtEur(tot.sinExtracto)}</span></div>
              {check.ok ? <div className="chk">✔ {fmtEur(confirmedAmt)} + {fmtEur(tot.porConfirmar)} + {fmtEur(tot.sinExtracto)} = {fmtEur(F)} facturado</div> : <div className="chk warn">Atención: el reparto no cuadra con lo facturado (diferencia {fmtEur(check.diff, 2)}).</div>}
            </div>
            <a className="btn primary" href="/admin/finanzas/conciliar">Conciliar ahora</a>
          </div>

          <div className="g2">
            <div className="panel">
              <h2>Facturado por mes · {year}</h2>
              <p className="help">{resumen ? 'Clientes finales y mayoristas (V-Valley, Arrow, IPS Norte).' : 'Total facturado por mes.'}{isCurrent ? ` ${cap(MES_LARGO[today.getMonth()])} va en curso.` : ''} Pulsa una barra para ver sus facturas.</p>
              <div className="legend"><span><i style={{ background: 'var(--accent)' }} />{resumen ? 'Clientes finales' : 'Facturado'}</span>{resumen && <span><i style={{ background: 'var(--before)' }} />Mayoristas</span>}{resumen && <span><i style={{ background: 'var(--good)' }} />Remesado (domiciliaciones)</span>}</div>
              <div className="chart"><Stacked label="Facturado por mes" n={nVis} series={resumen ? [rows.map(r => r.fact - (r.may ?? 0)), rows.map(r => r.may ?? 0)] : [rows.map(r => r.fact)]} colors={resumen ? ['var(--accent)', 'var(--before)'] : ['var(--accent)']} line={resumen ? rows.map(r => r.rem) : undefined} dimLast={isCurrent} onPick={pickMonth} /></div>
              {resumenError && <p className="small muted">Mayoristas y remesas: sin dato.</p>}
              {mesesOk ? <div className="chk">✔ Suma de meses {fmtEur(Math.round(sumMeses))} = facturado del año</div> : <div className="chk warn">Atención: la suma de los meses ({fmtEur(Math.round(sumMeses))}) no coincide con lo facturado del año ({fmtEur(tot.facturado ?? tot.base)}).</div>}
            </div>
            <div className="panel">
              <h2>Lo que hay que mirar</h2>
              <div>{alerts.length === 0 ? <p className="muted">Nada que revisar ahora mismo.</p> : alerts.map(al => <div className="look" key={al.title}><span className={`st ${al.tone}`}>{al.head}</span><div><div style={{ fontWeight: 500 }}>{al.title}</div><div className="small muted">{al.text}</div></div><button className="btn small" type="button" onClick={() => runAlert(al)}>{al.action}</button></div>)}</div>
            </div>
          </div>

          <div className="g2b">
            <div className="panel">
              <h2>Principales clientes</h2>
              <p className="help">Los 10 mayores del año. Pulsa uno para abrir su ficha.</p>
              <div className="chart"><HBarsF label="Principales clientes" color="var(--accent)" rows={[...a.topClientes.map(c => ({ label: c.sociedades > 1 ? `${c.cliente} (grupo)` : c.cliente, value: c.facturado / 100, onClick: () => void openCrm(c.cliente) })), ...(a.restoClientes ? [{ label: a.restoClientes.cliente, value: a.restoClientes.facturado / 100, color: 'var(--before)' }] : [])]} /></div>
            </div>
            <div className="panel">
              <h2>Por serie de factura</h2>
              <p className="help">CLL: cuotas · INST: instalaciones · DRAX: Draxton · CPL, ZOOM, HTSP, CMV, CCM y otras.</p>
              <div className="chart"><HBarsF label="Facturado por serie" color="var(--accent)" rows={[...a.porSerie].sort((x, y) => y.facturado - x.facturado).slice(0, 8).map(s => ({ label: s.serie || 'sin serie', value: s.facturado / 100, onClick: () => { setFSerie(s.serie); setFMes(''); setFEstado(''); setOffset(0); go('facturas') } }))} /></div>
            </div>
          </div>
        </section>}

        {view === 'facturas' && <section><div className="panel">
          <h2>Facturas emitidas</h2>
          <p className="help">Pulsa una factura para ver sus líneas, el cliente y el estado del cobro.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="search" type="search" placeholder="Nº de factura, cliente o NIF" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar facturas" />
            <select className="f" aria-label="Mes" value={fMes} onChange={e => { setFMes(e.target.value); setOffset(0) }}><option value="">Todos los meses</option>{MES3.slice(0, 12).map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}</select>
            <select className="f" aria-label="Serie" value={fSerie} onChange={e => { setFSerie(e.target.value); setOffset(0) }}><option value="">Todas las series</option>{a.porSerie.map(s => <option key={s.serie} value={s.serie}>{s.serie || 'sin serie'}</option>)}</select>
            <select className="f" aria-label="Estado" value={fEstado} onChange={e => { setFEstado(e.target.value); setOffset(0) }}><option value="">Todos los estados</option>{ESTADOS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}</select>
          </div>
          {listError && <div className="note bad" role="alert">{listError}</div>}
          <div className="tablewrap"><table aria-busy={listLoading}>
            <thead><tr><th>Nº factura</th><th>Cliente</th><th>Fecha</th><th className="n">Importe</th><th className="n">Cobrado</th><th className="n">Pendiente</th><th>Estado</th></tr></thead>
            <tbody>{(list?.items ?? []).map(inv => { const b = bucketOf(inv, cutoff); return <tr key={inv.invoiceId} className="rowclick" tabIndex={0} onClick={() => openInvoice(inv)} onKeyDown={e => { if (e.key === 'Enter') openInvoice(inv) }}>
              <td className="num"><b style={{ fontWeight: 500 }}>{inv.numFactura ?? 'sin dato'}</b></td>
              <td><a href="/admin/crm/empresas" onClick={e => { e.preventDefault(); e.stopPropagation(); void openCrm(inv.cliente) }}>{inv.cliente ?? 'sin dato'}</a></td>
              <td className="num">{fmtDate(inv.fechaISO)}</td><td className="n">{fmtEur(inv.targetCents, 2)}</td><td className="n">{fmtEur(inv.paidDocumentaryCents, 2)}</td><td className="n">{fmtEur(inv.remainingCents, 2)}</td>
              <td><span className={`st ${BUCKET_TONE[b]}`}>{BUCKET_LABEL[b]}</span></td></tr> })}
              {list && list.items.length === 0 && <tr><td colSpan={7} className="muted">Ninguna factura cumple el filtro.</td></tr>}
              {!list && !listError && <tr><td colSpan={7} className="muted">Cargando facturas…</td></tr>}</tbody>
          </table></div>
          {list && list.total > 0 && <div className="pager"><span>Mostrando {fmtNum(offset + 1)}–{fmtNum(Math.min(offset + B7_PAGE_SIZE, list.total))} de {fmtNum(list.total)}</span><span><button className="btn small" type="button" disabled={offset === 0 || listLoading} onClick={() => setOffset(Math.max(0, offset - B7_PAGE_SIZE))}>Anterior</button> <button className="btn small" type="button" disabled={offset + B7_PAGE_SIZE >= list.total || listLoading} onClick={() => setOffset(offset + B7_PAGE_SIZE)}>Siguiente</button></span></div>}
        </div></section>}

        {view === 'cobros' && <section>
          <div className="g2">
            <div className="panel">
              <h2>Antigüedad de lo no confirmado</h2>
              <p className="help">Días desde la fecha de factura. Ámbar: anterior al último extracto, sin cobro encontrado (puede estar cobrado y sin conciliar). Gris: posterior al último extracto (falta el banco).</p>
              <div className="chart"><AgeChart buckets={a.antiguedad.map(b => ({ tramo: b.tramo, real: b.pendienteReal / 100, sin: b.sinExtracto / 100 }))} /></div>
              {(() => { const r = a.antiguedad.reduce((s, b) => s + b.pendienteReal, 0), s = a.antiguedad.reduce((x, b) => x + b.sinExtracto, 0); const ok = r === a.desglosePendiente.real.cents && s === a.desglosePendiente.sinExtracto.cents; return ok ? <div className="chk">✔ {fmtEur(r)} + {fmtEur(s)} = {fmtEur(r + s)} no confirmados{a.desglosePendiente.revision.count > 0 ? ` (aparte, ${fmtEur(a.desglosePendiente.revision.cents)} en revisión)` : ''}</div> : <div className="chk warn">Atención: las franjas de antigüedad no suman lo pendiente que figura en el resumen.</div> })()}
            </div>
            <div className="panel">
              <h2>Cobertura de extractos</h2>
              <div>{accounts ? <table><thead><tr><th>Cuenta</th><th>Extractos hasta</th><th>Estado</th></tr></thead><tbody>{accounts.map((c, i) => <tr key={i}><td>{(c.alias ?? c.banco) + (c.activa ? '' : ' (cerrada)')}</td><td className="num">{fmtDate(c.effectiveCutoffDate)}</td><td><span className={`st ${c.effectiveCutoffDate ? 'g' : 'o'}`}>{c.effectiveCutoffDate ? 'Verificado' : 'Sin corte'}</span></td></tr>)}</tbody></table> : <p className="muted">{accountsError || 'Cargando…'}</p>}</div>
              <p className="small muted" style={{ margin: '8px 0 0' }}>{a.corte.cuentasVerificadas} de {a.corte.cuentasActivas} cuentas con corte verificable. Corte mínimo: {fmtDate(cutoff)}.</p>
            </div>
          </div>
          <div className="panel">
            <h2>Cobro por mes</h2>
            <p className="help">Cada barra suma lo facturado ese mes, según el estado de cobro.</p>
            <div className="legend"><span><i style={{ background: 'var(--good)' }} />Confirmado</span><span><i style={{ background: 'var(--warn)' }} />Por confirmar</span><span><i style={{ background: 'var(--before)' }} />Sin extracto</span></div>
            <div className="chart"><Stacked label="Cobro por mes" n={nVis} series={[a.mensual.map(m => m.cobrado / 100), a.mensual.map(m => (m.pendienteReal + m.revision) / 100), a.mensual.map(m => m.sinExtracto / 100)]} colors={['var(--good)', 'var(--warn)', 'var(--before)']} dimLast={isCurrent} onPick={pickMonth} /></div>
          </div>
        </section>}

        {view === 'clientes' && <section><div className="panel">
          <h2>Por cliente</h2>
          <p className="help">Facturado del año y estado de cobro de los 10 mayores clientes; el resto va agrupado. Pulsa un cliente para abrir su ficha del CRM.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Cliente</th><th className="n">Facturado {year}</th><th className="n">Confirmado</th><th className="n">Por confirmar</th><th className="n">Sin extracto</th><th>Cobro confirmado</th></tr></thead>
            <tbody>{[...a.topClientes, ...(a.restoClientes ? [a.restoClientes] : [])].map(c => { const isRest = c === a.restoClientes; const p = c.facturado > 0 ? (c.cobrado / c.facturado) * 100 : 0; return <tr key={c.cliente} className={isRest ? '' : 'rowclick'} onClick={isRest ? undefined : () => void openCrm(c.cliente)}>
              <td>{isRest ? c.cliente : <a href="/admin/crm/empresas" onClick={e => { e.preventDefault(); e.stopPropagation(); void openCrm(c.cliente) }}>{c.cliente}</a>}</td>
              <td className="n">{fmtEur(c.facturado, 0)}</td><td className="n">{fmtEur(c.cobrado, 0)}</td><td className="n">{fmtEur(c.pendienteReal + c.revision, 0)}</td><td className="n">{fmtEur(c.sinExtracto, 0)}</td>
              <td><div className="cmeter" title={`${fmtPct(p)}`}><i style={{ width: `${Math.min(100, p)}%`, background: 'var(--good)' }} /></div></td></tr> })}</tbody>
          </table></div>
        </div></section>}

        {view === 'meses' && <section><div className="panel">
          <h2>Resumen mensual</h2>
          <p className="help">Facturación, número de facturas, mayoristas y remesas de domiciliación{resumenError ? ' (mayoristas y remesas: sin dato)' : ''}.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Mes</th><th className="n">Facturación</th><th className="n">Nº</th><th className="n">Mayoristas</th><th className="n">% mayoristas</th><th className="n">Remesado</th><th className="n">Remesas</th></tr></thead>
            <tbody>{(() => {
              const list2 = Array.from({ length: nVis }, (_, i) => ({ i, r: resumen?.resumenMensual.find(x => x.mes === `${year}-${String(i + 1).padStart(2, '0')}`) ?? null }))
              const sum = (f: (x: NonNullable<typeof list2[number]['r']>) => number) => list2.reduce((s, x) => s + (x.r ? f(x.r) : 0), 0)
              const tF = sum(x => x.totalFacturadoCents), tN = sum(x => x.numFacturas), tM = sum(x => x.mayoristasTotalCents), tR = sum(x => x.totalRemesadoCents), tNR = sum(x => x.numRemesas)
              return <>{list2.map(({ i, r }) => <tr key={i}><td>{MES3[i]} {year}</td><td className="n">{r ? fmtEur(r.totalFacturadoCents, 2) : 'sin dato'}</td><td className="n">{r ? r.numFacturas : 'sin dato'}</td><td className="n">{r ? fmtEur(r.mayoristasTotalCents, 2) : 'sin dato'}</td><td className="n">{r ? formatHundredthsPercent(r.mayoristasPorcentajeCentimas) : 'sin dato'}</td><td className="n">{r ? fmtEur(r.totalRemesadoCents, 2) : 'sin dato'}</td><td className="n">{r ? r.numRemesas : 'sin dato'}</td></tr>)}
                <tr className="tot"><td>Total</td><td className="n">{fmtEur(tF, 2)}</td><td className="n">{fmtNum(tN)}</td><td className="n">{fmtEur(tM, 2)}</td><td className="n">{tF > 0 ? formatHundredthsPercent(Math.round((tM / tF) * 10000)) : 'sin dato'}</td><td className="n">{fmtEur(tR, 2)}</td><td className="n">{fmtNum(tNR)}</td></tr></>
            })()}</tbody>
          </table></div>
          {resumen && tot && (() => { const ref = tot.facturado ?? tot.base; const isp = resumen.resumenMensual.filter(x => x.mes.startsWith(`${year}-`)).reduce((s, x) => s + x.totalFacturadoCents, 0); return Math.abs(isp - ref) > 1 ? <div className="chk warn">Esta tabla (ISP) suma {fmtEur(isp, 2)} y el resumen bancario {fmtEur(ref, 2)}: la diferencia es de {fmtEur(isp - ref, 2)}.</div> : <div className="chk">✔ La tabla suma lo mismo que el facturado del año ({fmtEur(isp, 2)})</div> })()}
        </div></section>}
      </>}
    </Wrap>

    {sel && <>
      <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 59 }} aria-hidden="true" />
      <aside className="fdrawer" role="dialog" aria-modal="true" aria-label={`Factura ${sel.numFactura ?? ''}`}>
        <InvoiceDrawer inv={sel} bucket={bucketOf(sel, cutoff)} detail={detail} closeRef={closeRef} onClose={() => setSel(null)} onCrm={(cif) => void openCrm(sel.cliente, cif)} />
      </aside></>}

    {syncOpen && <>
      <div onClick={() => setSyncOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 59 }} aria-hidden="true" />
      <aside className="fdrawer" role="dialog" aria-modal="true" aria-label="Sincronizar con ISP">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>Sincronizar con ISP</h2><button className="btn ghost" type="button" onClick={() => setSyncOpen(false)} aria-label="Cerrar">✕</button></div>
        <p className="small muted">Lee las facturas de ISP Gestión (solo lectura). Lo normal son los últimos 3 meses; el año completo lo puede pedir solo un superadministrador.</p>
        <SyncJobPanel source="ISP" title="Facturas desde ISP" description="Trae las facturas nuevas o cambiadas de ISP Gestión. No modifica nada en ISP." onTerminalJob={() => setReload(n => n + 1)} />
      </aside></>}
    <Toast text={toast} />
  </div></IoShell>
}

function InvoiceDrawer({ inv, bucket, detail, closeRef, onClose, onCrm }: { inv: B7InvoiceSettlement; bucket: Bucket; detail: Detail; closeRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; onCrm: (cif: string | null) => void }) {
  const row = detail.row
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const base = row ? num(row.base) : null, iva = row ? num(row.importeIva) : null
  const cif = row ? str(row.cif) : null
  const forma = row ? str(row.formaCobro) : null
  const lineas = row ? parseLineas(row.lineas) : []
  const concepto = row ? str(row.concepto) : null
  const e = (v: number | null) => (v === null ? 'sin dato' : fmtEur(Math.round(v * 100), 2))
  const sourceStep = inv.paymentSources.includes('B4_REMESA') ? 'Incluida en una remesa de domiciliación' : inv.paymentSources.includes('B4_DIRECTO') ? 'Cobro asociado directamente a la factura' : forma ? `Forma de cobro: ${forma}` : 'Forma de cobro: sin dato'
  const last = bucket === 'COBRADA' ? 'Cobro encontrado en el banco · conciliado' : bucket === 'REAL' ? 'Sin cobro encontrado en el extracto · revisar en Conciliar' : bucket === 'SIN_EXTRACTO' ? 'Pendiente de cargar el extracto' : (inv.reasons.length ? inv.reasons.map(reasonPlain).join(' ') : 'Hay que revisarla en Conciliar.')
  return <>
    <div className="row" style={{ justifyContent: 'space-between' }}><h2>{inv.numFactura ?? 'Factura'}</h2><button ref={closeRef} className="btn ghost" type="button" onClick={onClose} aria-label="Cerrar">✕</button></div>
    <span className={`st ${BUCKET_TONE[bucket]}`}>{BUCKET_LABEL[bucket]}</span>
    <dl className="kv">
      <dt>Cliente</dt><dd><a href="/admin/crm/empresas" onClick={ev => { ev.preventDefault(); onCrm(cif) }}>{inv.cliente ?? 'sin dato'}</a> · ficha del CRM</dd>
      <dt>NIF</dt><dd>{detail.loading ? 'cargando…' : cif ?? 'sin dato'}</dd>
      <dt>Fecha</dt><dd>{fmtDate(inv.fechaISO)}</dd>
      <dt>Vencimiento</dt><dd>{fmtDate(inv.fechaVencimientoISO)}</dd>
      <dt>Forma de pago</dt><dd>{detail.loading ? 'cargando…' : forma ?? 'sin dato'}</dd>
      <dt>Importe</dt><dd><b>{fmtEur(inv.targetCents, 2)}</b>{base !== null && iva !== null ? ` (base ${e(base)} + IVA ${e(iva)})` : ''}</dd>
      <dt>Cobrado</dt><dd>{fmtEur(inv.paidDocumentaryCents, 2)}</dd>
      <dt>Pendiente</dt><dd>{fmtEur(inv.remainingCents, 2)}</dd>
    </dl>
    <h3 className="eyebrow" style={{ margin: '14px 0 6px' }}>Líneas</h3>
    {detail.loading ? <p className="muted">Cargando líneas…</p> : lineas.length > 0 ? <table><thead><tr><th>Concepto</th><th>Contrato</th><th className="n">Importe</th></tr></thead><tbody>{lineas.map((l, i) => <tr key={i}><td>{l.concepto ?? 'sin dato'}</td><td className="num">{l.contrato ?? 'sin dato'}</td><td className="n">{e(l.importe)}</td></tr>)}</tbody></table> : concepto ? <p>{concepto}</p> : <p className="muted">sin dato</p>}
    <h3 className="eyebrow" style={{ margin: '14px 0 6px' }}>Cobro</h3>
    <div className="step"><span className="sdot g" /><div>{inv.facturaISPId !== null ? 'Emitida en ISP Gestión' : 'Emitida'} · {fmtDate(inv.fechaISO)}</div></div>
    <div className="step"><span className={`sdot ${inv.paymentSources.length ? 'g' : ''}`} /><div>{sourceStep}</div></div>
    <div className="step"><span className={`sdot ${bucket === 'COBRADA' ? 'g' : bucket === 'SIN_EXTRACTO' ? '' : 'w'}`} /><div>{last}</div></div>
    <div className="row" style={{ marginTop: 14 }}><button className="btn" type="button" onClick={() => onCrm(cif)}>Abrir ficha del cliente</button>{bucket !== 'COBRADA' && <a className="btn primary" href="/admin/finanzas/conciliar">Buscar en Conciliar</a>}</div>
  </>
}
