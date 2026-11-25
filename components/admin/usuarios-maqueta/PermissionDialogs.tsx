'use client'

import { useState } from 'react'
import type { UsersDraft, UsersPerson, UsersSnapshot } from '@/lib/area4/users-contract'
import Dialog from './Dialog'
import { ACTION_LABELS, ACTIONS, cleanExtras, normalizeActions, personDraft, roleName } from './model'

export function ExtraDialog({ snapshot, person, draft, onUpdate, onClose }: {
  snapshot: UsersSnapshot; person: UsersPerson; draft: UsersDraft;
  onUpdate: (update: Partial<Omit<UsersDraft, 'userId'>>) => void; onClose: () => void;
}) {
  const [sectionKey, setSectionKey] = useState(snapshot.sections[0]?.key ?? '')
  const [actions, setActions] = useState('V')
  return <Dialog title={`Añadir extra · ${person.name}`} onClose={onClose}>
    <p className="small muted">Se añadirá al borrador, no a la cuenta. Editar, confirmar o exportar requiere también ver.</p>
    <form onSubmit={event => {
      event.preventDefault()
      if (!sectionKey || !actions || person.protected) return
      onUpdate({ extras: cleanExtras({ ...draft.extras, [sectionKey]: normalizeActions((draft.extras[sectionKey] ?? '') + actions) }, snapshot.sections) })
      onClose()
    }}>
      <div className="fld"><label htmlFor="extra-section">Apartado</label><select id="extra-section" value={sectionKey} onChange={event => setSectionKey(event.target.value)}>{snapshot.sections.map(section => <option key={section.key} value={section.key}>{section.group} · {section.label}</option>)}</select></div>
      <fieldset><legend className="small muted">Acciones del extra</legend><div className="area4-checkboxes">{ACTIONS.map(action => <label className="chk" key={action}><input type="checkbox" checked={actions.includes(action)} onChange={event => {
        if (!event.target.checked && action === 'V') setActions('')
        else setActions(normalizeActions(event.target.checked ? actions + action : actions.replace(action, '')))
      }} />{action} · {ACTION_LABELS[action]}</label>)}</div></fieldset>
      <div className="row area4-buttons"><button className="btn" type="button" onClick={onClose}>Cancelar</button><button className="btn primary" type="submit" disabled={!actions || !sectionKey || person.protected}>Añadir al borrador</button></div>
    </form>
  </Dialog>
}

export function CopyDialog({ snapshot, person, drafts, onUpdate, onClose }: {
  snapshot: UsersSnapshot; person: UsersPerson; drafts: UsersDraft[];
  onUpdate: (update: Partial<Omit<UsersDraft, 'userId'>>) => void; onClose: () => void;
}) {
  const sources = snapshot.users.filter(source => !source.protected && source.role !== 'superadmin' && source.id !== person.id)
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? null)
  const source = sources.find(item => item.id === sourceId)
  const draft = source ? drafts.find(item => item.userId === source.id) ?? personDraft(source) : null
  return <Dialog title={`Copiar permisos · ${person.name}`} onClose={onClose}>
    <p className="small muted">Copia solo el rol y los extras visibles de la persona elegida al borrador. No cambia su estado ni copia privilegios de cuentas protegidas o del propietario.</p>
    <div className="fld"><label htmlFor="copy-source">Copiar permisos de</label><select id="copy-source" value={sourceId ?? ''} onChange={event => setSourceId(Number(event.target.value))}>
      {!sources.length && <option value="">No hay fuentes disponibles</option>}{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></div>
    {draft && <p className="small">Rol: <b>{roleName(snapshot, draft.role)}</b> · {Object.values(draft.extras).filter(Boolean).length} extras</p>}
    <div className="row area4-buttons"><button className="btn" type="button" onClick={onClose}>Cancelar</button><button className="btn primary" type="button" disabled={!source || !draft || draft.role === 'superadmin' || person.protected} onClick={() => {
      if (!source || !draft || source.protected || draft.role === 'superadmin' || person.protected) return
      onUpdate({ role: draft.role, extras: cleanExtras(draft.extras, snapshot.sections) })
      onClose()
    }}>Copiar al borrador</button></div>
  </Dialog>
}
