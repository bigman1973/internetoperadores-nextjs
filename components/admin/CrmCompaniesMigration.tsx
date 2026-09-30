'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CrmHubspotMigrationSection from './CrmHubspotMigrationSection'
import { useRole } from './RoleContext'

type Preview = { remoteAvailable: boolean; local: number; contacts: number; taxProperties: string[]; note: string }
export default function CrmCompaniesMigration() {
  const router = useRouter()
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || (hasAreaAccess('admin.crm.empresas', 'escritura') && hasAreaAccess('admin.crm.contactos', 'escritura')))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [counts, setCounts] = useState({ companies: 0, associations: 0, missingContacts: 0 })
  async function call(mode: 'preview' | 'sync', after?: string | null) {
    const response = await fetch('/api/admin/crm/empresas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...(after ? { after } : {}) }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.')
    return data
  }
  async function check() {
    setBusy(true); setMessage('')
    try {
      const data = await call('preview')
      setPreview(data.summary)
      setCursor(typeof data.lastSync?.detalle?.nextAfter === 'string' ? data.lastSync.detalle.nextAfter : null)
      setMessage('Origen comprobado; todavía no se ha cambiado ningún registro local.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Error de conexión.') } finally { setBusy(false) }
  }
  async function importAll(resume = false) {
    setBusy(true); setMessage('Importando en lotes… Puedes mantener esta pestaña abierta.')
    let next = resume ? cursor : null
    let totals = { companies: 0, associations: 0, missingContacts: 0 }
    try {
      // Máximo 40 lotes por sesión de navegador; después se puede reanudar sin duplicar datos.
      for (let i = 0; i < 40; i++) {
        const data = await call('sync', next)
        const result = data.result as { companies: number; associations: number; missingContacts: number; nextAfter: string | null }
        totals = { companies: totals.companies + result.companies, associations: totals.associations + result.associations, missingContacts: totals.missingContacts + result.missingContacts }
        setCounts(totals); setCursor(result.nextAfter)
        setMessage(`Importados en esta ejecución ${totals.companies.toLocaleString('es-ES')} registros y ${totals.associations.toLocaleString('es-ES')} asociaciones; ${totals.missingContacts} contactos de origen creados como fichas pendientes de completar. Sus vínculos se conservan.`)
        next = result.nextAfter
        if (!next) { setMessage((current) => `${current} Traspaso completado. Revisa las posibles duplicidades antes de darlo por cerrado.`); router.refresh(); return }
      }
      setMessage((current) => `${current} Se ha alcanzado el límite de esta sesión; puedes continuar con el botón «Reanudar».`)
      router.refresh()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'La importación se ha interrumpido. Comprueba el último lote antes de reanudar.') } finally { setBusy(false) }
  }
  return <CrmHubspotMigrationSection description="Solo para terminar el traspaso: copia empresas y relaciones de origen. No hace falta sincronizar a diario; el CRM local funciona por sí mismo."><div className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold text-slate-950">Empresas y asociaciones de HubSpot</h2><p className="mt-1 text-sm text-slate-600">Se importan solo relaciones explícitas de HubSpot. No se crean vínculos por semejanza de nombres, CIF o dominio; las ediciones locales prevalecen al reimportar.</p><div className="mt-4 flex flex-wrap gap-2">{canWrite && <button type="button" disabled={busy} onClick={check} className="min-h-10 rounded-lg border border-orange-300 px-3 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50">Comprobar origen</button>}{canWrite && preview?.remoteAvailable && <button type="button" disabled={busy} onClick={() => importAll(Boolean(cursor))} className="min-h-10 rounded-lg bg-orange-600 px-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{busy ? 'Importando…' : cursor ? 'Reanudar traspaso' : 'Importar empresas'}</button>}</div>{preview && <p className="mt-3 text-xs text-slate-600">Origen {preview.remoteAvailable ? 'disponible' : 'sin empresas visibles'} · {preview.local.toLocaleString('es-ES')} empresas locales · {preview.contacts.toLocaleString('es-ES')} contactos locales. Campos fiscales detectados: {preview.taxProperties.join(', ') || 'ninguno'}. {preview.note}</p>}{message && <p role="status" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}{counts.companies > 0 && <p className="mt-2 text-xs text-slate-500">La importación es idempotente: repetir un lote no duplica empresas ni contactos.</p>}</div></CrmHubspotMigrationSection>
}
