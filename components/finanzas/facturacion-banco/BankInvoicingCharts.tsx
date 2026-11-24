'use client'
import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatEuroExact, type B7Analytics, type B7Summary } from './typesparser'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const COLORS = {
  actual: '#ea580c',
  previo: '#94a3b8',
  cobrado: '#059669',
  real: '#dc2626',
  sinExtracto: '#cbd5e1',
  revision: '#7c3aed',
}

function euros(cents: number): number { return cents / 100 }
function compact(cents: number): string {
  const value = Math.abs(cents) / 100
  const sign = cents < 0 ? '-' : ''
  if (value >= 1_000_000) return `${sign}${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M€`
  if (value >= 1_000) return `${sign}${Math.round(value / 1_000).toLocaleString('es-ES')} k€`
  return `${sign}${Math.round(value).toLocaleString('es-ES')} €`
}

type TooltipEntry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number }
function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 shadow-lg">
      <p className="mb-1 font-bold">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: entry.color }} />
          <span className="text-slate-700">{entry.name}:</span>
          <span className="font-mono font-semibold">{formatEuroExact(Math.round(Number(entry.value ?? 0) * 100))}</span>
        </p>
      ))}
    </div>
  )
}

function ChartCard({ title, subtitle, check, children, testId }: { title: string; subtitle: string; check?: { ok: boolean; text: string }; children: React.ReactNode; testId: string }) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p>
      <div className="mt-3 h-72 w-full min-w-0">{children}</div>
      {check && (
        <p className={`mt-2 text-xs font-semibold ${check.ok ? 'text-emerald-700' : 'text-rose-700'}`} data-testid={`${testId}-check`}>
          {check.ok ? '✔ ' : '✖ '}{check.text}
        </p>
      )}
    </article>
  )
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0)
}

export interface BankInvoicingChartsProps {
  analytics: B7Analytics
  summary: B7Summary
  selectedMonth: number | null
  onSelectMonth: (month: number) => void
  hasStateOrSearchFilter: boolean
}

export default function BankInvoicingCharts({ analytics, summary, selectedMonth, onSelectMonth, hasStateOrSearchFilter }: BankInvoicingChartsProps) {
  const year = analytics.anioGrafico
  const previous = analytics.anioPrevio
  const hasPrevious = analytics.mensual.some((m) => m.facturadoPrevio !== 0)

  const monthly = useMemo(() => analytics.mensual.map((m) => ({
    mes: MONTHS[m.mes - 1], numero: m.mes,
    actual: euros(m.facturado), previo: euros(m.facturadoPrevio),
    cobrado: euros(m.cobrado), real: euros(m.pendienteReal), sinExtracto: euros(m.sinExtracto), revision: euros(m.revision),
  })), [analytics.mensual])

  const series = useMemo(() => analytics.porSerie.slice(0, 12).map((s) => ({ nombre: s.serie, facturado: euros(s.facturado), facturas: s.facturas })), [analytics.porSerie])
  const clients = useMemo(() => {
    const rows = analytics.topClientes.map((c) => ({ nombre: c.cliente.length > 30 ? `${c.cliente.slice(0, 29)}…` : c.cliente, completo: c.cliente, facturado: euros(c.facturado), facturas: c.facturas, sociedades: c.sociedades }))
    if (analytics.restoClientes) rows.push({ nombre: analytics.restoClientes.cliente, completo: analytics.restoClientes.cliente, facturado: euros(analytics.restoClientes.facturado), facturas: analytics.restoClientes.facturas, sociedades: analytics.restoClientes.sociedades })
    return rows
  }, [analytics.topClientes, analytics.restoClientes])
  const aging = useMemo(() => analytics.antiguedad.map((a) => ({ tramo: a.tramo, real: euros(a.pendienteReal), sinExtracto: euros(a.sinExtracto), n: a.facturasReal + a.facturasSinExtracto })), [analytics.antiguedad])

  // Comprobaciones de coherencia con las cifras de la tabla (mismos céntimos, no redondeos).
  const serieTotal = sumBy(analytics.porSerie, (s) => s.facturado)
  const clientTotal = sumBy(analytics.topClientes, (c) => c.facturado) + (analytics.restoClientes?.facturado ?? 0)
  const agingTotal = sumBy(analytics.antiguedad, (a) => a.pendienteReal + a.sinExtracto)
  const pendingTotal = analytics.desglosePendiente.real.cents + analytics.desglosePendiente.sinExtracto.cents
  const facturado = summary.facturado.cents
  const monthlyYear = sumBy(analytics.mensual, (m) => m.facturado)
  const monthlyStack = sumBy(analytics.mensual, (m) => m.cobrado + m.pendienteReal + m.sinExtracto + m.revision)

  return (
    <section aria-label="Gráficas de facturación" className="min-w-0 space-y-3" data-testid="b7-charts">
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <ChartCard
          testId="chart-mensual"
          title={`Facturado por mes · ${year ?? '—'}${hasPrevious && previous ? ` frente a ${previous}` : ''}`}
          subtitle={hasPrevious ? 'Barras agrupadas por mes de emisión. Pulsa una barra para filtrar ese mes.' : `No hay facturas de ${previous ?? 'el año anterior'} en el panel: sólo se muestra ${year ?? 'el año'}. Pulsa una barra para filtrar ese mes.`}
          check={{ ok: monthlyYear === monthlyStack, text: `Total ${year ?? ''}: ${formatEuroExact(monthlyYear)}${facturado !== null && !hasStateOrSearchFilter && selectedMonth === null && analytics.anioGrafico !== null ? (facturado === monthlyYear ? ' · coincide con la tarjeta Facturado' : ' · la tarjeta Facturado incluye otros años') : ''}` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => compact(Math.round(v * 100))} tick={{ fontSize: 12 }} width={64} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {hasPrevious && <Bar dataKey="previo" name={String(previous)} fill={COLORS.previo} radius={[3, 3, 0, 0]} />}
              <Bar dataKey="actual" name={String(year)} fill={COLORS.actual} radius={[3, 3, 0, 0]} onClick={(entry: { numero?: number }) => { if (entry?.numero) onSelectMonth(entry.numero) }} cursor="pointer">
                {monthly.map((m) => <Cell key={m.numero} fill={COLORS.actual} fillOpacity={selectedMonth === null || selectedMonth === m.numero ? 1 : 0.35} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          testId="chart-cobrado"
          title={`Cobrado frente a pendiente por mes · ${year ?? '—'}`}
          subtitle="Cada barra suma lo facturado ese mes: cobrado (confirmado en el banco), pendiente real y sin extracto bancario cargado."
          check={{ ok: monthlyYear === monthlyStack, text: `Cobrado + pendiente real + sin extracto + revisión = ${formatEuroExact(monthlyStack)} (igual al facturado del año)` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => compact(Math.round(v * 100))} tick={{ fontSize: 12 }} width={64} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="cobrado" name="Cobrado" stackId="s" fill={COLORS.cobrado} />
              <Bar dataKey="real" name="Pendiente real" stackId="s" fill={COLORS.real} />
              <Bar dataKey="sinExtracto" name="Sin extracto bancario" stackId="s" fill={COLORS.sinExtracto} />
              <Bar dataKey="revision" name="En revisión" stackId="s" fill={COLORS.revision} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          testId="chart-serie"
          title="Facturado por serie"
          subtitle="Serie de la factura (CLL, CPL, INST, DRAX…) sobre la selección de la tabla."
          check={facturado === null ? undefined : { ok: serieTotal === facturado, text: `Suma de series ${formatEuroExact(serieTotal)} ${serieTotal === facturado ? '= tarjeta Facturado' : '≠ tarjeta Facturado (' + formatEuroExact(facturado) + ')'}` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => compact(Math.round(v * 100))} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 12 }} width={96} />
              <Tooltip content={<MoneyTooltip />} />
              <Bar dataKey="facturado" name="Facturado" fill={COLORS.actual} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          testId="chart-clientes"
          title="Principales clientes"
          subtitle="Los 10 mayores por importe facturado. Las sociedades de Draxton se suman como un único cliente."
          check={facturado === null ? undefined : { ok: clientTotal === facturado, text: `Clientes (con «Resto») ${formatEuroExact(clientTotal)} ${clientTotal === facturado ? '= tarjeta Facturado' : '≠ tarjeta Facturado (' + formatEuroExact(facturado) + ')'}` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={clients} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => compact(Math.round(v * 100))} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={168} />
              <Tooltip content={<MoneyTooltip />} />
              <Bar dataKey="facturado" name="Facturado" fill={COLORS.actual} radius={[0, 3, 3, 0]}>
                {clients.map((c, i) => <Cell key={c.completo} fill={i === clients.length - 1 && analytics.restoClientes ? COLORS.previo : COLORS.actual} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        testId="chart-antiguedad"
        title="Antigüedad de la deuda"
        subtitle="Días desde la fecha de factura hasta hoy, sólo facturas pendientes. En rojo la deuda real; en gris lo que no se puede afirmar por falta de extracto."
        check={{ ok: agingTotal === pendingTotal, text: `Antigüedad ${formatEuroExact(agingTotal)} = pendiente real ${formatEuroExact(analytics.desglosePendiente.real.cents)} + sin extracto ${formatEuroExact(analytics.desglosePendiente.sinExtracto.cents)}` }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={aging} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="tramo" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => compact(Math.round(v * 100))} tick={{ fontSize: 12 }} width={64} />
            <Tooltip content={<MoneyTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="real" name="Pendiente real" stackId="a" fill={COLORS.real} />
            <Bar dataKey="sinExtracto" name="Sin extracto bancario" stackId="a" fill={COLORS.sinExtracto} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  )
}
