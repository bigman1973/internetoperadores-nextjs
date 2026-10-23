'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Manual = { cutoffDate: string; balanceCents: number; confirmedAt: string; actorId: number; version: number; id: string }
type Account = {
  id: string; banco: string; alias: string | null; activa: boolean; importedCutoffDate: string | null; latestImportDate: string | null
  effectiveCutoffDate: string | null; cutoffSource: 'MANUAL_CONFIRMADO' | 'EXTRACTO_IMPORTADO' | 'SIN_CORTE'; latestManual: Manual | null
}
type Payload = { accounts: Account[]; coverage: { status: 'KNOWN' | 'PARTIAL' | 'UNKNOWN'; asOf: string | null; activeAccountCount: number; accountsWithKnownCutoff: number } }

function date(value: string | null) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed) : 'Fecha no disponible'
}

/** Shared B5/B7 overlay. It is deliberately read-only: confirmations happen in Estado de extractos. */
export default function ManualCoverageOverlay({ consumer }: { consumer: 'B5' | 'B7' | 'DASHBOARD' }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let disposed = false
    void fetch('/api/admin/finanzas/cortes-cobertura', { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json().catch(() => null)
        if (!response.ok || !json || !Array.isArray(json.accounts) || !json.coverage) throw new Error(typeof json?.error === 'string' ? json.error : 'No se pudo leer la cobertura manual.')
        if (!disposed) setData(json as Payload)
      })
      .catch((cause) => { if (!disposed) setError(cause instanceof Error ? cause.message : 'No se pudo leer la cobertura manual.') })
    return () => { disposed = true }
  }, [])

  if (error) return <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid={`coverage-overlay-${consumer.toLowerCase()}-error`}><strong>Cobertura manual no disponible.</strong> {error} No se presupone cobertura ni se sustituyen fechas.</section>
  if (!data) return <section aria-busy="true" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><span className="sr-only">Cargando corte manual de cobertura</span>Comprobando cobertura manual…</section>

  const pending = data.coverage.activeAccountCount - data.coverage.accountsWithKnownCutoff
  const known = pending === 0 && data.coverage.activeAccountCount > 0
  return <section className={`rounded-xl border p-4 shadow-sm ${known ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`} aria-label="Cobertura manual de extractos" data-testid={`coverage-overlay-${consumer.toLowerCase()}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="font-bold">Cobertura verificable de extractos: {data.coverage.accountsWithKnownCutoff}/{data.coverage.activeAccountCount}</p><p className="mt-1 text-sm">{known ? `Todas las cuentas activas tienen un corte verificable; el mínimo es ${date(data.coverage.asOf)}.` : `${pending} cuenta(s) activa(s) sin corte verificable. Puede confirmarlo tras revisar fecha y saldo del extracto.`}</p></div>
      <Link href="/admin/finanzas/estado-cuentas" className="shrink-0 rounded-lg border border-current/30 bg-white/70 px-3 py-2 text-center text-sm font-bold hover:bg-white focus:outline-none focus:ring-2 focus:ring-current">Revisar extractos</Link>
    </div>
    <ul className="mt-3 grid gap-2 border-t border-current/20 pt-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.accounts.filter((account) => account.activa).map((account) => <li key={account.id} className="rounded-lg bg-white/60 p-3 text-xs">
        <p className="font-bold text-slate-950">{account.alias || account.banco}</p>
        <p className="mt-1">Corte efectivo: <strong>{account.effectiveCutoffDate ? date(account.effectiveCutoffDate) : 'Pendiente de confirmación humana'}</strong></p>
        <p className="mt-1">Última importación: {date(account.latestImportDate)} · corte importado: {date(account.importedCutoffDate)}</p>
        {account.latestManual && <p className="mt-1">Confirmado manualmente (v{account.latestManual.version}); no certifica el encadenado de saldo.</p>}
      </li>)}
    </ul>
    <p className="mt-3 text-xs">Este overlay es sólo metadato B3 auditado. No modifica movimientos ni saldos originales, no afirma que la cadena esté cuadrada y no inicia sincronizaciones.</p>
  </section>
}
