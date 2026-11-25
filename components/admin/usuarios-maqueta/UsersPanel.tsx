'use client'

import { Fragment, useState } from 'react'
import { Panel } from '@/components/io-ui/kit'
import type { UsersAuditEvent, UsersDraft, UsersPerson, UsersProposalRow, UsersSnapshot } from '@/lib/area4/users-contract'
import { AuditLog } from './Audit'
import { ACTION_LABELS, ACTIONS, effectivePermissions, expandedPermissions, formatDate, groupedSections, initials, personDraft, roleName } from './model'

export type PersonAction = 'copy' | 'extra' | 'actuation'

export default function UsersPanel({ snapshot, drafts, rows, selectedId, onSelect, onUpdate, onAction, events, auditLoading, auditError, auditCursor, onLoadHistory, busy }: {
  snapshot: UsersSnapshot; drafts: UsersDraft[]; rows: UsersProposalRow[];
  selectedId: number | null; onSelect: (id: number) => void;
  onUpdate: (id: number, update: Partial<Omit<UsersDraft, 'userId'>>) => void;
  onAction: (action: PersonAction) => void; events: UsersAuditEvent[];
  auditLoading: boolean; auditError: string; auditCursor: string | null;
  onLoadHistory: () => void; busy: boolean;
}) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const selected = snapshot.users.find(person => person.id === selectedId)
  const list = snapshot.users.filter(person => {
    const draft = drafts.find(item => item.userId === person.id) ?? personDraft(person)
    const needle = query.trim().toLocaleLowerCase('es')
    return (!needle || `${person.name} ${person.email}`.toLocaleLowerCase('es').includes(needle))
      && (!roleFilter || draft.role === roleFilter)
      && (!stateFilter || draft.active === (stateFilter === 'on'))
  })

  return <div className="ulay">
    <Panel>
      <div className="row area4-filters">
        <input className="search" type="search" aria-label="Buscar persona o correo" placeholder="Buscar persona o correo" value={query} onChange={event => setQuery(event.target.value)} />
        <select className="f" aria-label="Filtrar por rol" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
          <option value="">Todos los roles</option>{snapshot.roles.map(role => <option key={role.key} value={role.key}>{role.name}</option>)}
        </select>
        <select className="f" aria-label="Filtrar por estado" value={stateFilter} onChange={event => setStateFilter(event.target.value)}>
          <option value="">Activos e inactivos</option><option value="on">Solo activos</option><option value="off">Solo inactivos</option>
        </select>
      </div>
      <div className="tablewrap"><table className="area4-list" aria-label="Personas y permisos propuestos">
        <thead><tr><th scope="col">Persona</th><th scope="col">Rol</th><th scope="col" className="n">Extras</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col"><span className="small">Cambios</span></th></tr></thead>
        <tbody>{list.map(person => {
          const draft = drafts.find(item => item.userId === person.id) ?? personDraft(person)
          const row = rows.find(item => item.userId === person.id)
          const extraCount = Object.values(draft.extras).filter(Boolean).length
          return <tr key={person.id} className={`${selectedId === person.id ? 'sel' : ''} ${draft.active ? '' : 'off'} rowclick`} onClick={() => onSelect(person.id)}>
            <td><button type="button" className="area4-person" aria-pressed={selectedId === person.id} onClick={event => { event.stopPropagation(); onSelect(person.id) }}><span className="av" aria-hidden="true">{initials(person.name)}</span>{person.name}</button><div className="small muted area4-email">{person.email}</div></td>
            <td>{roleName(snapshot, draft.role)}</td><td className="n">{extraCount ? `+${extraCount}` : '—'}</td>
            <td><span className={`st ${draft.active ? '' : 'off'}`}>{draft.active ? 'Activa' : 'Inactiva'}</span></td>
            <td className="small">{formatDate(person.lastAccess, true)}</td><td>{row?.changes && <span className="chg">cambia</span>}</td>
          </tr>
        })}{!list.length && <tr><td colSpan={6} className="empty">No hay personas con estos filtros.</td></tr>}</tbody>
      </table></div>
      <p className="small muted area4-footnote">Quien entra con su cuenta @internetoperadores.com se crea como <b>Empleado</b> (VISOR: solo su portal y peticiones) hasta que le asignes un rol.</p>
    </Panel>
    {selected ? <PersonCard snapshot={snapshot} person={selected} draft={drafts.find(item => item.userId === selected.id) ?? personDraft(selected)} hasDraft={drafts.some(item => item.userId === selected.id)} row={rows.find(item => item.userId === selected.id)} onUpdate={onUpdate} onAction={onAction} events={events.filter(event => event.targetUserId === selected.id)} auditLoading={auditLoading} auditError={auditError} auditCursor={auditCursor} onLoadHistory={onLoadHistory} busy={busy} />
      : <Panel className="side"><p className="empty">Selecciona una persona para revisar su ficha.</p></Panel>}
  </div>
}

function PersonCard({ snapshot, person, draft, hasDraft, row, onUpdate, onAction, events, auditLoading, auditError, auditCursor, onLoadHistory, busy }: {
  snapshot: UsersSnapshot; person: UsersPerson; draft: UsersDraft; row?: UsersProposalRow;
  hasDraft: boolean;
  onUpdate: (id: number, update: Partial<Omit<UsersDraft, 'userId'>>) => void;
  onAction: (action: PersonAction) => void; events: UsersAuditEvent[];
  auditLoading: boolean; auditError: string; auditCursor: string | null; onLoadHistory: () => void; busy: boolean;
}) {
  const next = effectivePermissions(snapshot, person, hasDraft ? draft : undefined)
  const current = person.active ? person.current : {}
  const base = expandedPermissions(snapshot, draft.role, {})
  const disabled = busy || person.protected
  const allowedRoles = person.role === 'superadmin'
    ? snapshot.roles.filter(role => role.key === 'superadmin')
    : snapshot.roles.filter(role => role.key !== 'superadmin')
  const removeExtra = (key: string) => {
    const extras = { ...draft.extras }
    delete extras[key]
    onUpdate(person.id, { extras })
  }

  return <Panel className="side" title={<><span className="av" aria-hidden="true">{initials(person.name)}</span>{person.name}</>} help={<>{person.email} · último acceso {formatDate(person.lastAccess)}</>}>
    <div className="row area4-person-actions">
      <button className="btn small" type="button" disabled={disabled} title={person.protectionReason} onClick={() => onUpdate(person.id, { active: !draft.active })}>{draft.active ? 'Desactivar' : 'Activar'}</button>
      <button className="btn small" type="button" disabled={disabled || !person.active} title={person.protectionReason} onClick={() => onAction('actuation')}>Ver como {person.name.split(' ')[0]}</button>
      <button className="btn small" type="button" disabled={disabled} title={person.protectionReason} onClick={() => onAction('copy')}>Copiar permisos de…</button>
    </div>
    {person.protected && <p className="small muted" role="note">{person.protectionReason ?? 'Cuenta protegida: no se puede modificar ni usar como fuente de permisos.'}</p>}
    {row?.blockedReason && !person.protected && <p className="area4-error">{row.blockedReason}</p>}
    {!hasDraft && !person.protected && <p className="small muted">Fuera del lote inicial. Rol actual: {person.currentRoleLabel}. No cambia nada hasta que prepares un borrador explícito con estos controles.</p>}
    {person.active !== draft.active && <p className="small"><span className="chg">Estado propuesto: {draft.active ? 'activa' : 'inactiva'}</span> Solo borrador, pendiente de confirmación.</p>}
    <div className="fld"><label htmlFor={`role-${person.id}`}>Rol</label><select id={`role-${person.id}`} value={draft.role} disabled={disabled} onChange={event => onUpdate(person.id, { role: event.target.value as UsersDraft['role'] })}>
      {allowedRoles.map(role => <option key={role.key} value={role.key}>{role.name} — {role.description}</option>)}
    </select></div>
    <div className="fld"><span className="field-label">Extras sobre su rol</span><div className="chips">
      {Object.entries(draft.extras).filter(([, value]) => Boolean(value)).map(([key, actions]) => <button className="chipx" key={key} type="button" disabled={disabled} aria-label={`Quitar extra ${snapshot.sections.find(section => section.key === key)?.label ?? key}`} onClick={() => removeExtra(key)}>{snapshot.sections.find(section => section.key === key)?.label ?? key} · {actions} ×</button>)}
      {!Object.values(draft.extras).some(Boolean) && <span className="small muted">Ninguno</span>}
      <button className="btn small" type="button" disabled={disabled} onClick={() => onAction('extra')}>+ Añadir extra</button>
    </div></div>
    <div className="fld"><span className="field-label">Lo que verá en su menú</span></div>
    <div className="tablewrap"><table className="perm" aria-label={`Permisos propuestos de ${person.name}`}>
      <thead><tr><th scope="col">Apartado</th>{ACTIONS.map(action => <th className="c" scope="col" key={action}><abbr title={ACTION_LABELS[action]}>{action}</abbr></th>)}</tr></thead>
      <tbody>{groupedSections(snapshot.sections).map(([group, sections]) => {
        const visible = sections.filter(section => next[section.key] || current[section.key])
        if (!visible.length) return null
        return <Fragment key={group}><tr className="grp"><th scope="rowgroup" colSpan={5}>{group}</th></tr>{visible.map(section => {
          const loss = ACTIONS.filter(action => (current[section.key] ?? '').includes(action) && !(next[section.key] ?? '').includes(action)).join('')
          return <tr key={section.key}><td>{section.label}{loss && <> <span className="lose">pierde {loss}</span></>}</td>{ACTIONS.map(action => {
            const on = (next[section.key] ?? '').includes(action)
            const extra = on && hasDraft && !person.protected && !(base[section.key] ?? '').includes(action)
            const lost = (current[section.key] ?? '').includes(action) && !on
            return <td className="c" key={action}><span className={`ck ${on ? 'on' : ''} ${extra ? 'extra' : ''} ${lost ? 'lost' : ''}`} role="img" aria-label={`${section.label}: ${ACTION_LABELS[action]} ${lost ? 'se pierde' : on ? extra ? 'por extra' : 'por rol' : 'no concedido'}`} /></td>
          })}</tr>
        })}</Fragment>
      })}</tbody>
    </table></div>
    <p className="small muted area4-legend"><span className="ck on" /> por su rol · <span className="ck on extra" /> extra · <span className="ck lost" /> lo pierde con el cambio</p>
    <p className="small muted">Intención de la propuesta, no garantía de acceso efectivo: las guardias de cada módulo prevalecen. Gastos sin código propio no se concede; los ocho hijos Draxton no conceden permiso sobre el padre.</p>
    <div className="fld area4-history"><span className="field-label">Historial de esta persona</span></div>
    {auditLoading && <p className="small muted" role="status">Cargando historial real…</p>}
    {auditError ? <p className="area4-error">{auditError}</p> : <AuditLog events={events} empty="Sin eventos de esta persona en el registro cargado." />}
    {auditCursor && <button type="button" className="btn small" disabled={auditLoading} onClick={onLoadHistory}>Cargar historial anterior</button>}
  </Panel>
}
