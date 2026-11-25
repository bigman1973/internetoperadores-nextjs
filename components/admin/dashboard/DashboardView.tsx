'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { IoShell, Panel } from '@/components/io-ui/kit'
import type {
  DashboardBlock,
  DashboardCheck,
  DashboardGoal,
  DashboardKpi,
  DashboardModel,
  DashboardPoint,
  DashboardRow,
} from '@/lib/area4/dashboard-contract'
import './dashboard.css'

type DashboardViewProps = { model: DashboardModel; controls?: ReactNode }

const emptyValue = (value: string | number | null | undefined) => value == null || value === '' ? 'sin dato' : String(value)

function Status({ row }: { row: DashboardRow }) {
  return <span className={`dashboard-status ${row.tone ?? ''}`}>{emptyValue(row.badge)}</span>
}

function Rows({ rows }: { rows?: DashboardRow[] }) {
  if (!rows?.length) return <p className="dashboard-empty">No hay pendientes.</p>
  return <div className="dashboard-items">
    {rows.map((row, index) => {
      const content = <><Status row={row} /><div><div className="dashboard-item-title">{emptyValue(row.title)}</div><div className="dashboard-item-detail">{emptyValue(row.detail)}</div></div>{row.action ? <span className="dashboard-item-action">{row.action}</span> : <span aria-hidden="true" />}</>
      return row.href ? <Link className="dashboard-item" href={row.href} key={`${row.title}-${index}`}>{content}</Link> : <div className="dashboard-item" key={`${row.title}-${index}`}>{content}</div>
    })}
  </div>
}

function Checks({ checks }: { checks?: DashboardCheck[] }) {
  if (!checks?.length) return <p className="dashboard-empty">No hay pendientes.</p>
  return <div className="dashboard-checks">
    {checks.map((check, index) => {
      const content = <><span className={`dashboard-check-box ${check.done === true ? 'on' : ''}`} aria-hidden="true" /> <span>{emptyValue(check.label)}</span><span className="dashboard-check-detail">{emptyValue(check.detail)}</span></>
      return check.href ? <Link className="dashboard-check" href={check.href} key={`${check.label}-${index}`}>{content}</Link> : <div className="dashboard-check" key={`${check.label}-${index}`}>{content}</div>
    })}
  </div>
}

function Goals({ goals }: { goals?: DashboardGoal[] }) {
  if (!goals?.length) return <p className="dashboard-empty">No hay objetivos.</p>
  return <div className="dashboard-goals">
    {goals.map((goal, index) => {
      const current = goal.current == null ? null : Math.max(0, goal.current)
      const target = goal.target == null ? null : Math.max(0, goal.target)
      const ratio = current != null && target && target > 0 ? Math.max(0, Math.min(100, current / target * 100)) : 0
      return <div className="dashboard-goal" key={`${goal.label}-${index}`}>
        <div className="dashboard-goal-row"><span>{emptyValue(goal.label)}</span><b>{goal.current == null || goal.target == null ? 'sin dato' : `${goal.current} / ${goal.target}${goal.unit ? ` ${goal.unit}` : ''}`}</b></div>
        <div className="dashboard-progress" aria-hidden="true"><i style={{ width: `${ratio}%` }} /></div>
      </div>
    })}
  </div>
}

function monthLabel(month: string) {
  const raw = month.slice(5, 7)
  const labels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return labels[Number(raw) - 1] ?? month
}

function formatPoint(value: number | null, chart?: DashboardBlock['chart']) {
  if (value == null || !Number.isFinite(value)) return 'sin dato'
  return chart === 'percent' ? `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : `${Math.round(value / 1000).toLocaleString('es-ES')}k`
}

function Bars({ points, chart, title }: { points?: DashboardPoint[]; chart: 'money' | 'percent'; title: string }) {
  const W = 520, H = 170, left = 36, right = 10, top = 16, bottom = 26
  if (!points?.length) return <p className="dashboard-empty">sin dato</p>
  const values = points.map(point => point.value).filter((value): value is number => value != null && Number.isFinite(value))
  if (!values.length) return <p className="dashboard-empty">sin dato</p>
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1
  const plotHeight = H - top - bottom
  const slot = (W - left - right) / points.length
  const barWidth = Math.min(28, slot * .64)
  const y = (value: number) => top + (max - value) / span * plotHeight
  const zero = y(0)
  return <div className="dashboard-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <line x1={left} x2={W - right} y1={zero} y2={zero} stroke="var(--line)" />
      {points.map((point, index) => {
        const x = left + slot * index + (slot - barWidth) / 2
        const value = point.value
        const label = monthLabel(point.month)
        if (value == null || !Number.isFinite(value)) return <g key={`${point.month}-${index}`}><text x={x + barWidth / 2} y={zero - 5} textAnchor="middle">—</text><text x={x + barWidth / 2} y={H - 7} textAnchor="middle">{label}</text></g>
        const valueY = y(value), rectY = value >= 0 ? valueY : zero, height = Math.max(1, Math.abs(zero - valueY))
        return <g key={`${point.month}-${index}`}>
          <rect className={point.provisional ? 'provisional' : ''} x={x} y={rectY} width={barWidth} height={height} rx="2" fill="var(--accent)"><title>{`${point.month} · ${formatPoint(value, chart)}${point.provisional ? ' · provisional' : ''}${point.reliability == null ? '' : ` · fiabilidad ${formatPoint(point.reliability, 'percent')}`}`}</title></rect>
          <text className="dashboard-chart-value" x={x + barWidth / 2} y={value >= 0 ? rectY - 4 : rectY + height + 12} textAnchor="middle">{formatPoint(value, chart)}</text>
          <text x={x + barWidth / 2} y={H - 7} textAnchor="middle">{label}</text>
        </g>
      })}
      <text x={left} y={top - 4} textAnchor="start">{formatPoint(max, chart)}</text>
      {min < 0 && <text x={left} y={H - bottom + 12} textAnchor="start">{formatPoint(min, chart)}</text>}
    </svg>
    <div className="dashboard-legend"><span><i className="current" />Dato</span><span><i className="provisional" />Provisional</span></div>
  </div>
}

function Block({ block }: { block: DashboardBlock }) {
  const body = block.state === 'soon' ? <p className="dashboard-empty">Próximamente</p> : block.state === 'unavailable' ? <p className="dashboard-empty">{emptyValue(block.message)}</p> : block.state === 'empty' ? <p className="dashboard-empty">{emptyValue(block.message) || 'No hay pendientes.'}</p> : block.chart ? <Bars points={block.points} chart={block.chart} title={block.title} /> : block.checks ? <Checks checks={block.checks} /> : block.goals ? <Goals goals={block.goals} /> : <Rows rows={block.rows} />
  const title = block.href ? <Link className="dashboard-panel-link" href={block.href}>{block.title}</Link> : block.title
  return <div data-dashboard-block={block.id}><Panel title={title} help={block.help}>{body}</Panel></div>
}

function Kpi({ kpi }: { kpi: DashboardKpi }) {
  const content = <><div className="eyebrow">{emptyValue(kpi.label)}</div><div className={`v ${kpi.tone ?? ''}`}>{emptyValue(kpi.value)}</div><div className="s">{emptyValue(kpi.sub)}</div></>
  return kpi.href ? <Link className="kpi dashboard-kpi" href={kpi.href}>{content}</Link> : <div className="kpi dashboard-kpi">{content}</div>
}

export function DashboardView({ model, controls }: DashboardViewProps) {
  return <IoShell>
    <div className="area4-dashboard">
      <header className="top">
        <div className="wrap">
          <div className="bar">
            <div className="hello"><h1>{emptyValue(model.greeting)}, {emptyValue(model.userName)}</h1><p>{emptyValue(model.roleLabel)} · {emptyValue(model.dateLabel)}</p></div>
            <div className="scn"><input className="search" type="search" placeholder="Buscar cliente, factura, contrato…" aria-label="Buscar en el panel" disabled title="Próximamente" /></div>
          </div>
          {controls && <div className="viewas"><b>Ver como</b><div className="seg" role="group" aria-label="Rol">{controls}</div><span className="small muted">Solo Superadmin. Vista de la persona en solo lectura; el menú y «Actuar como» no cambian.</span></div>}
        </div>
        <div className="kpis">{model.kpis.map(kpi => <Kpi key={kpi.id} kpi={kpi} />)}</div>
      </header>
      <main className="wrap">
        <p className="small muted" style={{ margin: '0 0 18px' }}>{model.notice}</p>
        {!model.columns.some(c => c.length > 0) && <p className="dashboard-empty">No hay apartados visibles con tus permisos actuales. Puedes usar las entradas permitidas de tu menú.</p>}
        <div className="dashboard-grid">{model.columns.map((column, index) => <div className="dashboard-column" key={`column-${index}`}>{column.map(block => <Block block={block} key={block.id} />)}</div>)}</div>
        <p className="perm"><b>Qué ve el rol {emptyValue(model.roleLabel)}:</b> {emptyValue(model.permissionText)}</p>
      </main>
    </div>
  </IoShell>
}
