'use client'

import { useEffect, useMemo, useState } from 'react'
import type { UsersDraft, UsersProposal, UsersSnapshot } from '@/lib/area4/users-contract'
import { initialDrafts, localRows, personDraft, readResponse, safeDrafts, STORAGE_KEY } from './model'

export function useUsersDraft(initialSnapshot: UsersSnapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [drafts, setDrafts] = useState(() => initialDrafts(initialSnapshot))
  const [proposal, setProposal] = useState<UsersProposal | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savedAvailable, setSavedAvailable] = useState(false)
  const [edited, setEdited] = useState(false)
  const rows = useMemo(() => localRows(snapshot, drafts), [snapshot, drafts])
  const changedCount = rows.filter(row => row.changes && !row.blockedReason).length

  useEffect(() => {
    try { setSavedAvailable(Boolean(window.localStorage.getItem(STORAGE_KEY))) } catch { /* Almacenamiento opcional. */ }
  }, [])

  function updateDraft(userId: number, update: Partial<Omit<UsersDraft, 'userId'>>) {
    const person = snapshot.users.find(item => item.id === userId)
    if (busy || !person || person.protected) return
    setDrafts(previous => {
      const current = previous.find(item => item.userId === userId) ?? personDraft(person)
      return safeDrafts(snapshot, [...previous.filter(item => item.userId !== userId), { ...current, ...update }])
    })
    setProposal(null)
    setEdited(true)
    setError('')
    setNotice('Borrador actualizado. Todavía no se ha aplicado ningún cambio.')
  }

  function saveLocal() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ revision: snapshot.proposal.revision, drafts, savedAt: new Date().toISOString() }))
      setSavedAvailable(true)
      setNotice('Borrador guardado solo en este navegador. No se ha aplicado.')
    } catch { setError('No se pudo guardar el borrador en este navegador.') }
  }

  function restoreLocal() {
    try {
      const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (!data || !Array.isArray(data.drafts)) throw new Error('No hay un borrador local válido.')
      const valid = data.drafts.filter((draft: UsersDraft) => draft && Number.isSafeInteger(draft.userId) && typeof draft.role === 'string' && typeof draft.active === 'boolean' && draft.extras && typeof draft.extras === 'object' && !Array.isArray(draft.extras))
      setDrafts(safeDrafts(snapshot, valid))
      setProposal(null)
      setEdited(true)
      setNotice(data.revision !== snapshot.proposal.revision
        ? 'Borrador restaurado sin aplicar. Los datos han cambiado: revisa todas las diferencias y prepara una nueva revisión del servidor.'
        : 'Borrador restaurado solo en la pantalla. No se ha aplicado.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo restaurar el borrador.') }
  }

  function resetDraft() {
    if (busy) return
    setDrafts(initialDrafts(snapshot))
    setProposal(null)
    setEdited(false)
    setNotice('Se ha vuelto a la propuesta inicial, sin aplicar nada.')
  }

  async function refreshSnapshot(preserveDraft = false) {
    setBusy(true)
    setError('')
    try {
      const next = await readResponse<UsersSnapshot>(await fetch('/api/admin/usuarios/propuestas', { cache: 'no-store', headers: { Accept: 'application/json' } }))
      setSnapshot(next)
      setDrafts(preserveDraft ? safeDrafts(next, [...initialDrafts(next), ...drafts].filter((draft, index, all) => all.findLastIndex(item => item.userId === draft.userId) === index)) : initialDrafts(next))
      setProposal(null)
      if (!preserveDraft) setEdited(false)
      setNotice(preserveDraft ? 'Datos actuales recargados. Borrador conservado; prepara una nueva revisión antes de aplicar.' : 'Datos actuales recargados. No se ha aplicado nada.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron actualizar los datos.') }
    finally { setBusy(false) }
  }

  async function preparePreview() {
    if (busy || !rows.some(row => row.changes)) return
    setBusy(true)
    setError('')
    try {
      const result = await readResponse<{ proposal: UsersProposal }>(await fetch('/api/admin/usuarios/propuestas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', drafts: safeDrafts(snapshot, drafts) }),
      }))
      if (!result.proposal?.revision || !Array.isArray(result.proposal.rows) || !Array.isArray(result.proposal.drafts)) throw new Error('La revisión del servidor no está completa.')
      setProposal(result.proposal)
      setConfirmOpen(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar la revisión.') }
    finally { setBusy(false) }
  }

  async function applyConfirmed() {
    if (!proposal || busy || !snapshot.applyingAllowed) return
    if (proposal.rows.some(row => row.changes && row.blockedReason)) {
      setError('La propuesta contiene cambios bloqueados. Revisa los motivos antes de aplicar.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await readResponse<{ ok: true; snapshot: UsersSnapshot }>(await fetch('/api/admin/usuarios/propuestas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', confirmed: true, revision: proposal.revision, drafts: proposal.drafts }),
      }))
      if (result.ok !== true || !result.snapshot) throw new Error('El servidor no confirmó la aplicación. Recarga los datos antes de intentarlo otra vez.')
      setSnapshot(result.snapshot)
      setDrafts(initialDrafts(result.snapshot))
      setProposal(null)
      setConfirmOpen(false)
      setEdited(false)
      try { window.localStorage.removeItem(STORAGE_KEY); setSavedAvailable(false) } catch { /* No afecta a la transacción. */ }
      setNotice('Cambios confirmados por el servidor. La auditoría conserva el registro real.')
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'No se pudo confirmar la aplicación.'} Recarga los datos y prepara una revisión nueva; no se reintentará automáticamente.`)
      setProposal(null)
      setConfirmOpen(false)
    } finally { setBusy(false) }
  }

  return {
    snapshot, drafts, rows, changedCount, proposal, confirmOpen, setConfirmOpen,
    busy, error, notice, savedAvailable, edited, updateDraft, saveLocal, restoreLocal,
    resetDraft, refreshSnapshot, preparePreview, applyConfirmed,
  }
}
