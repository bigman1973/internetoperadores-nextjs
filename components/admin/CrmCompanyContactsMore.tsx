'use client'

import { useState } from 'react'
import Link from 'next/link'

type Contact = { id: string; name: string; email: string | null; role: string | null; isPrimary: boolean }
export default function CrmCompanyContactsMore({ companyId, total }: { companyId: string; total: number }) {
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [page, setPage] = useState(1)
  const [found, setFound] = useState(total)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (total <= 150) return null
  async function search(nextPage: number, term = query) {
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(nextPage) })
      if (term.trim().length >= 2) params.set('query', term.trim())
      const response = await fetch(`/api/admin/crm/empresas/${encodeURIComponent(companyId)}/contactos?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los contactos.')
      setContacts((previous) => nextPage === 1 ? data.contacts : [...previous, ...data.contacts])
      setFound(data.total); setPage(nextPage)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los contactos.') } finally { setBusy(false) }
  }
  return <section className="mx-auto mt-5 max-w-7xl rounded-2xl border border-slate-200 bg-white p-5 sm:mx-6" aria-label="Buscar más contactos de esta empresa">
    <h2 className="font-bold text-slate-950">Encontrar otros contactos de esta empresa</h2>
    <p className="mt-1 text-sm text-slate-600">Hay {total.toLocaleString('es-ES')} contactos asociados. Arriba se muestran los primeros 150; aquí puedes buscar por nombre o correo, o cargar el resto por páginas.</p>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void search(1) }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o correo" aria-label="Buscar contacto en esta empresa" className="min-h-10 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-orange-500" /><button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Buscar</button></form>
    {contacts.length > 0 && <ul className="mt-4 divide-y divide-slate-100">{contacts.map((contact) => <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><Link href={`/admin/crm/contactos/${contact.id}`} className="font-semibold text-orange-800 hover:underline">{contact.name}</Link><span className="text-slate-600">{contact.email || 'Sin correo'}{contact.isPrimary ? ' · Empresa principal' : ''}</span></li>)}</ul>}
    {contacts.length > 0 && contacts.length < found && <button type="button" disabled={busy} onClick={() => search(page + 1)} className="mt-3 rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-800 disabled:opacity-50">{busy ? 'Cargando…' : 'Cargar más contactos'}</button>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>
}
