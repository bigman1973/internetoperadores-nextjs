'use client'

import { useEffect, useRef, useState } from 'react'
import { AREA4_ACTIONS } from '@/lib/area4/section-registry'
import type { ActionLetter, ApprovedRole, ApprovedRoleKey } from '@/lib/area4/users-contract'
import type {
  Area4RegistrySnapshot, SectionAssignmentCommand, SectionAssignmentDraft,
  SectionAssignmentPending, SectionAssignmentProposal, SectionRoleSelection,
} from '@/lib/area4/section-assignments'
import Dialog from './Dialog'

// Claves del contrato, no plantillas de permisos. Los nombres vivos vienen del snapshot.
export const REGISTRY_ASSIGNMENT_ROLES = [
  { key: 'superadmin', label: 'Superadmin' },
  { key: 'gerente', label: 'Gerente' },
  { key: 'contabilidad', label: 'Contabilidad' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'draxton', label: 'Draxton' },
  { key: 'empleado', label: 'Empleado' },
] as const satisfies readonly { key: ApprovedRoleKey; label: string }[]

const canonicalActions = (value: string) => AREA4_ACTIONS.filter(action => value.includes(action.letter)).map(action => action.letter).join('')
const copyRoles = (roles: SectionRoleSelection): SectionRoleSelection => Object.fromEntries(
  REGISTRY_ASSIGNMENT_ROLES.map(role => [role.key, canonicalActions(roles[role.key])]),
) as SectionRoleSelection

export function createRegistryDrafts(pending: readonly SectionAssignmentPending[]): SectionAssignmentDraft[] {
  return pending.map(section => ({ sectionKey: section.sectionKey,
    roles: Object.fromEntries(REGISTRY_ASSIGNMENT_ROLES.map(role => [role.key, ''])) as SectionRoleSelection,
  })).sort((a, b) => a.sectionKey.localeCompare(b.sectionKey))
}

/** Nunca selecciona V automáticamente. Al retirar V se retiran sus dependientes. */
export function toggleRegistryAction(value: string, letter: ActionLetter, checked: boolean): string {
  if (checked && letter !== 'V' && !value.includes('V')) return value
  if (!checked && letter === 'V') return ''
  return canonicalActions(checked ? `${value}${letter}` : value.replace(letter, ''))
}

export function registryReviewCommand(drafts: readonly SectionAssignmentDraft[]): Extract<SectionAssignmentCommand, { action: 'preview-sections' }> {
  return { action: 'preview-sections', drafts: drafts.map(draft => ({ sectionKey: draft.sectionKey, roles: copyRoles(draft.roles) }))
    .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey)) }
}

export function registryApplyAllowed(input: {
  assigningAllowed: boolean; proposal: SectionAssignmentProposal | null; confirmed: boolean;
  busy: boolean; registryRevision?: string;
}): boolean {
  return Boolean(input.assigningAllowed && input.confirmed && !input.busy && input.proposal
    && /^[a-f0-9]{64}$/.test(input.proposal.revision) && input.proposal.drafts.length && input.proposal.rows.length
    && (!input.registryRevision || input.proposal.assignmentRevision === input.registryRevision))
}

const actionText = (value: string) => value || 'Sin acciones'
const roleName = (roles: readonly Pick<ApprovedRole, 'key' | 'name'>[], key: ApprovedRoleKey) =>
  roles.find(role => role.key === key)?.name ?? REGISTRY_ASSIGNMENT_ROLES.find(role => role.key === key)!.label

async function readResult<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo completar la operación de apartados.')
  if (!data || typeof data !== 'object') throw new Error('La respuesta del servidor no es válida.')
  return data as T
}

export function RegistryAssignmentDiff({ proposal, roles }: {
  proposal: SectionAssignmentProposal; roles: readonly Pick<ApprovedRole, 'key' | 'name'>[];
}) {
  return <div className="area4-registry-sections">{proposal.rows.map(section => <section className="area4-registry-section" key={section.sectionKey}>
    <h3>{section.label}</h3>
    <p className="small muted">{section.group} · sección <code>{section.sectionKey}</code></p>
    <div className="area4-registry-scroll"><table className="area4-registry-diff">
      <caption>Diferencias por rol y superficie de {section.label}</caption>
      <thead><tr><th scope="col">Rol</th><th scope="col">Superficie real</th><th scope="col">Antes</th><th scope="col">Después</th><th scope="col">Diferencia</th></tr></thead>
      <tbody>{REGISTRY_ASSIGNMENT_ROLES.flatMap(role => section.surfaces.map(surface => {
        const before = AREA4_ACTIONS.filter(action => surface.actions.includes(action.letter) && section.before?.[role.key]?.includes(action.letter)).map(action => action.letter).join('')
        const after = AREA4_ACTIONS.filter(action => surface.actions.includes(action.letter) && section.roles[role.key].includes(action.letter)).map(action => action.letter).join('')
        const lost = [...before].filter(letter => !after.includes(letter)).join('')
        const gained = [...after].filter(letter => !before.includes(letter)).join('')
        return <tr key={`${role.key}:${surface.id}`}><th scope="row">{roleName(roles, role.key)}</th>
          <td><span className="small muted">{surface.kind === 'api' ? 'API' : 'Página'}</span> <code>{surface.path}</code></td>
          <td>{actionText(before)}</td><td>{actionText(after)}</td>
          <td>{lost && <span className="lose">Retirar {lost}</span>}{lost && gained && <br />}{gained && <span className="gain">Añadir {gained}</span>}{!lost && !gained && <span className="muted">Sin cambio</span>}</td>
        </tr>
      }))}</tbody>
    </table></div>
  </section>)}</div>
}

export default function RegistryAssignments({ registry, roles, busy: workspaceBusy = false, onSaved }: {
  registry?: Area4RegistrySnapshot; roles: readonly Pick<ApprovedRole, 'key' | 'name'>[];
  busy?: boolean; onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<SectionAssignmentDraft[]>([])
  const [proposal, setProposal] = useState<SectionAssignmentProposal | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [operation, setOperation] = useState<'review' | 'apply' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestInFlight = useRef(false)
  const pending = registry?.pending ?? []
  const busy = workspaceBusy || operation !== null
  const canApply = registryApplyAllowed({ assigningAllowed: registry?.assigningAllowed === true,
    proposal, confirmed, busy, registryRevision: registry?.revision })

  useEffect(() => { setProposal(null); setConfirmed(false) }, [registry?.revision])

  function start() {
    if (busy || requestInFlight.current || !pending.length) return
    setDrafts(createRegistryDrafts(pending))
    setProposal(null)
    setConfirmed(false)
    setError('')
    setNotice('')
    setOpen(true)
  }

  function update(sectionKey: string, role: ApprovedRoleKey, letter: ActionLetter, checked: boolean) {
    if (busy || requestInFlight.current) return
    setDrafts(previous => previous.map(draft => draft.sectionKey === sectionKey
      ? { ...draft, roles: { ...draft.roles, [role]: toggleRegistryAction(draft.roles[role], letter, checked) } } : draft))
    setProposal(null)
    setConfirmed(false)
    setError('')
  }

  async function review() {
    if (busy || requestInFlight.current || !drafts.length) return
    requestInFlight.current = true
    setOperation('review')
    setProposal(null)
    setConfirmed(false)
    setError('')
    try {
      // Solo preview: revisar no ejecuta assign-sections, ni adopta usuarios.
      const result = await readResult<{ sectionProposal?: SectionAssignmentProposal; proposal?: SectionAssignmentProposal }>(await fetch('/api/admin/usuarios/propuestas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(registryReviewCommand(drafts)),
      }))
      const next = result.sectionProposal ?? result.proposal
      if (!next || !/^[a-f0-9]{64}$/.test(next.revision) || !Array.isArray(next.rows) || !next.rows.length
        || !Array.isArray(next.drafts) || JSON.stringify(registryReviewCommand(next.drafts)) !== JSON.stringify(registryReviewCommand(drafts))) {
        throw new Error('La revisión del servidor no está completa o no coincide con la selección. Revisa de nuevo.')
      }
      setProposal(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo revisar la selección.') }
    finally { requestInFlight.current = false; setOperation(null) }
  }

  async function apply() {
    if (!canApply || !proposal || requestInFlight.current) return
    requestInFlight.current = true
    setOperation('apply')
    setError('')
    try {
      const command: SectionAssignmentCommand = { action: 'assign-sections', drafts: proposal.drafts, confirmed: true, revision: proposal.revision }
      const result = await readResult<{ ok?: boolean }>(await fetch('/api/admin/usuarios/propuestas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(command),
      }))
      if (result.ok !== true) throw new Error('El servidor no confirmó la asignación.')
      setProposal(null)
      setConfirmed(false)
      setOpen(false)
      setNotice('Plantillas de roles asignadas. No se han adoptado usuarios ni concedido permisos personales. Los borradores de usuarios se conservan.')
      // El padre recarga con refreshSnapshot(true) y carga auditoría; no aplica usuarios.
      try { await onSaved() }
      catch { setError('La asignación fue confirmada, pero no se pudo actualizar la vista o la auditoría. Recarga los datos; no vuelvas a aplicar esta revisión.') }
    } catch (cause) {
      setProposal(null)
      setConfirmed(false)
      setError(`${cause instanceof Error ? cause.message : 'No se pudo asignar.'} Revisa de nuevo antes de confirmar; no se reintenta automáticamente.`)
    } finally { requestInFlight.current = false; setOperation(null) }
  }

  return <>
    {pending.length > 0 && <div className="note area4-registry-notice" role="status">
      <div><b>Apartados nuevos sin asignar</b> <span className="tag P" aria-label={`${pending.length} apartados pendientes`}>{pending.length}</span>
        <p className="small muted">Sus superficies nuevas siguen sin asignación explícita a las plantillas de roles.</p></div>
      <button type="button" className="btn" disabled={busy} onClick={start}>Asignar a roles</button>
    </div>}
    {notice && <p className="small muted" role="status">{notice}</p>}
    {error && !open && <p className="area4-error" role="alert">{error}</p>}
    {open && <Dialog title="Asignar apartados nuevos a roles" onClose={() => { if (!busy && !requestInFlight.current) setOpen(false) }} busy={busy} wide>
      <div className="note"><b>Solo asigna PLANTILLAS de roles.</b> No adopta usuarios, no cambia sus borradores ni concede permisos personales (grants). La ACL viva y las guardias de cada módulo prevalecen.</div>
      {!registry?.assigningAllowed && <p className="small muted">Asignación deshabilitada en este entorno. Puedes seleccionar y revisar en modo de solo lectura, sin aplicar.</p>}
      <p className="small">Selecciona explícitamente las acciones de cada uno de los seis roles. Todas empiezan vacías. {AREA4_ACTIONS.filter(action => action.letter !== 'V').map(action => action.letter).join('/')} requiere V; retirar V retira sus acciones dependientes.</p>
      <p className="small muted">{AREA4_ACTIONS.map(action => `${action.letter} · ${action.label}`).join(' / ')}</p>
      <div className="area4-registry-sections">{drafts.map(draft => {
        const section = pending.find(item => item.sectionKey === draft.sectionKey)
        if (!section) return <p className="area4-error" key={draft.sectionKey}>La sección {draft.sectionKey} ya no está pendiente. Cierra y vuelve a abrir para revisar el registro actual.</p>
        const supported = new Set(section.surfaces.flatMap(surface => surface.actions))
        return <fieldset className="area4-registry-section" disabled={busy} key={draft.sectionKey}>
          <legend>{section.label}</legend>
          <p className="small muted">{section.group} · sección <code>{section.sectionKey}</code></p>
          <ul className="area4-registry-paths">{section.surfaces.map(surface => <li key={surface.id}>
            <span className="small muted">{surface.kind === 'api' ? 'API' : 'Página'}</span> <code>{surface.path}</code> <span className="small muted">· {surface.actions.join('/')}</span>
          </li>)}</ul>
          <div className="area4-registry-scroll"><table className="area4-registry-matrix">
            <caption>Acciones por rol para {section.label}</caption>
            <thead><tr><th scope="col">Rol</th>{AREA4_ACTIONS.map(action => <th scope="col" key={action.letter}>{action.letter}</th>)}</tr></thead>
            <tbody>{REGISTRY_ASSIGNMENT_ROLES.map(role => <tr key={role.key}><th scope="row">{roleName(roles, role.key)}</th>{AREA4_ACTIONS.map(action =>
              <td key={action.letter}><label className="area4-registry-action"><input type="checkbox"
                aria-label={`${roleName(roles, role.key)} · ${section.label} · ${action.letter} · ${action.label}`}
                checked={draft.roles[role.key].includes(action.letter)}
                disabled={busy || !supported.has(action.letter) || (action.letter !== 'V' && !draft.roles[role.key].includes('V'))}
                onChange={event => update(draft.sectionKey, role.key, action.letter, event.target.checked)} /></label></td>,
            )}</tr>)}</tbody>
          </table></div>
        </fieldset>
      })}</div>
      {proposal && <section className="area4-registry-review" aria-label="Revisión del servidor">
        <h3>Revisión del servidor · sin aplicar</h3>
        <p className="small muted">Revisión <code className="area4-registry-revision">{proposal.revision}</code>. Cualquier edición invalida esta revisión y su confirmación.</p>
        <RegistryAssignmentDiff proposal={proposal} roles={roles} />
        <label className="chk area4-confirmation"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />Confirmo que he revisado las diferencias de los seis roles y todas las superficies. Solo asigno plantillas; no adopto usuarios ni concedo permisos personales.</label>
      </section>}
      {error && <p className="area4-error" role="alert">{error}</p>}
      <div className="row area4-buttons">
        <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancelar sin aplicar</button>
        <button type="button" className="btn" disabled={busy || !drafts.length || drafts.some(draft => !pending.some(section => section.sectionKey === draft.sectionKey))} onClick={() => void review()}>{operation === 'review' ? 'Revisando…' : 'Revisar en servidor (sin aplicar)'}</button>
        <button type="button" className="btn primary" disabled={!canApply} onClick={() => void apply()}>{operation === 'apply' ? 'Asignando…' : 'Confirmar y asignar plantillas'}</button>
      </div>
    </Dialog>}
  </>
}
