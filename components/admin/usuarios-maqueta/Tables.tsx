import { Fragment } from 'react'
import { Panel } from '@/components/io-ui/kit'
import type { UsersDraft, UsersProposalRow, UsersSnapshot } from '@/lib/area4/users-contract'
import { ACTION_LABELS, ACTIONS, currentRoleKey, groupedSections, roleName } from './model'

export function RolesTable({ snapshot }: { snapshot: UsersSnapshot }) {
  return <Panel title="Roles" help={`Qué puede hacer cada rol en cada apartado. ${ACTIONS.map(action => `${action} = ${ACTION_LABELS[action]}`).join(' · ')}. A cada persona se le pueden sumar extras.`}>
    <div className="tablewrap"><table className="perm roles-matrix" aria-label="Matriz de las seis plantillas de rol">
      <thead><tr><th scope="col">Apartado</th>{snapshot.roles.map(role => <th scope="col" className="role-col" key={role.key}>
        {role.name}<div className="small muted">{snapshot.users.filter(person => person.active && currentRoleKey(snapshot, person) === role.key).length} pers.</div>
      </th>)}</tr></thead>
      <tbody>{groupedSections(snapshot.sections).map(([group, sections]) => <Fragment key={group}>
        <tr className="grp"><th scope="rowgroup" colSpan={snapshot.roles.length + 1}>{group}</th></tr>
        {sections.map(section => <tr key={section.key}><th scope="row">{section.label}</th>{snapshot.roles.map(role =>
          <td className={`role-col mono ${role.permissions[section.key] ? '' : 'muted'}`} key={role.key}>{section.key === 'draxton' && role.key === 'draxton'
            ? <span className="small" title="Agrupación visual: VE en los ocho hijos técnicos; sin permiso sobre el padre Draxton.">8 subapartados VE<br />padre: —</span>
            : role.permissions[section.key] || '·'}</td>)}</tr>)}
      </Fragment>)}</tbody>
    </table></div>
    <div className="area4-role-help">{snapshot.roles.map(role => <p className="small muted" key={role.key}><b>{role.name}:</b> {role.description}</p>)}</div>
    <p className="small muted">Intención de las plantillas. El acceso efectivo depende de códigos disponibles y guardias: Gastos no queda concedido si carece de código propio. Draxton resume sus ocho hijos sin permiso al padre.</p>
    <p className="small muted">Personas activas según su rol principal actual, no el borrador ni sus etiquetas legacy adicionales. Las guardias de cada módulo prevalecen: esta matriz no concede acceso por sí sola.</p>
  </Panel>
}

function DifferenceList({ row, kind }: { row: UsersProposalRow; kind: 'lost' | 'gained' }) {
  const differences = row.differences.filter(diff => diff[kind])
  return differences.length ? <ul className="area4-differences">{differences.map(diff => <li key={diff.section}>
    {diff.label} <b>{diff[kind]}</b><span className="area4-action-description"> ({ACTIONS.filter(action => diff[kind].includes(action)).map(action => ACTION_LABELS[action]).join(', ')})</span>
  </li>)}</ul> : <>—</>
}

export function ChangesTable({ snapshot, rows, drafts }: { snapshot: UsersSnapshot; rows: UsersProposalRow[]; drafts?: UsersDraft[] }) {
  return <div className="tablewrap"><table className="diff" aria-label="Cambios por persona y por acción">
    <thead><tr><th scope="col">Persona</th><th scope="col">Hoy</th><th scope="col">Quedaría</th><th scope="col">Pierde acciones</th><th scope="col">Gana acciones</th></tr></thead>
    <tbody>{rows.map(row => {
      const person = snapshot.users.find(item => item.id === row.userId)
      const state = drafts?.find(item => item.userId === row.userId) ?? row
      return <tr key={row.userId} className={row.active ? '' : 'off'}>
        <td><b>{row.name}</b>{row.blockedReason && <div className="small muted">{row.blockedReason}</div>}</td>
        <td className="small">{row.currentRoleLabel}<div className="muted">{person?.active ? 'Activa' : 'Inactiva'}</div></td>
        <td><b>{person?.protected ? 'Sin cambios' : roleName(snapshot, state.role)}</b>
          <div className={person && person.active !== state.active ? 'chg' : 'small muted'}>{state.active ? 'Activa' : 'Inactiva'}{person && person.active !== state.active ? ' · cambia estado' : ''}</div>
          {Object.entries(state.extras).map(([key, actions]) => <div className="small muted" key={key}>+ {snapshot.sections.find(section => section.key === key)?.label ?? key} · {actions}</div>)}
          {!person?.protected && person?.currentRoleLabel !== roleName(snapshot, state.role) && <div className="small">Cambio de rol / plantilla</div>}
        </td>
        <td className="lose"><DifferenceList row={row} kind="lost" /></td>
        <td className="gain"><DifferenceList row={row} kind="gained" /></td>
      </tr>
    })}</tbody>
  </table></div>
}
