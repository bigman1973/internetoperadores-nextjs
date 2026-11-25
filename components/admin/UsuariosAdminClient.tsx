'use client'

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { IoShell, Kpis, Note, Panel, Pill, TopBar, Wrap } from '@/components/io-ui/kit'
import type { UsersSnapshot } from '@/lib/area4/users-contract'
import { InviteDialog, NewUserDialog } from './usuarios-maqueta/AccountDialogs'
import ActuationDialog from './usuarios-maqueta/ActuationDialog'
import ApplyDialog from './usuarios-maqueta/ApplyDialog'
import { AuditPanel, useUsersAudit } from './usuarios-maqueta/Audit'
import MenuControl from './usuarios-maqueta/MenuControl'
import { CopyDialog, ExtraDialog } from './usuarios-maqueta/PermissionDialogs'
import { ChangesTable, RolesTable } from './usuarios-maqueta/Tables'
import RegistryAssignments from './usuarios-maqueta/RegistryAssignments'
import UsersPanel, { type PersonAction } from './usuarios-maqueta/UsersPanel'
import { currentRoleKey, formatDate, personDraft, VIEWS, type View } from './usuarios-maqueta/model'
import { useUsersDraft } from './usuarios-maqueta/useUsersDraft'
import './usuarios-maqueta.css'

const TAB_LABELS: Record<View, string> = {
  usuarios: 'Usuarios', roles: 'Roles', cambios: 'Cambios propuestos', auditoria: 'Auditoría',
}
type OpenDialog = PersonAction | 'invite' | 'new' | null

export default function UsuariosAdminClient({ initialSnapshot }: { initialSnapshot: UsersSnapshot }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [view, setView] = useState<View>('usuarios')
  const [selectedId, setSelectedId] = useState<number | null>(initialSnapshot.users.find(person => !person.protected)?.id ?? initialSnapshot.users[0]?.id ?? null)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const workspace = useUsersDraft(initialSnapshot)
  const audit = useUsersAudit()
  const history = useUsersAudit(selectedId)
  const { snapshot, drafts, rows, changedCount, busy } = workspace
  const selected = snapshot.users.find(person => person.id === selectedId)
  const selectedDraft = selected ? drafts.find(draft => draft.userId === selected.id) ?? personDraft(selected) : null
  const blockedRows = rows.filter(row => row.changes && row.blockedReason)
  const proposalCount = rows.filter(row => row.changes).length

  // IoShell no admite className: adaptar solo el nodo local antes del primer paint,
  // sin alterar el kit ni añadir selectores que afecten a otras áreas.
  useLayoutEffect(() => {
    const shell = rootRef.current?.querySelector('.io-ui')
    shell?.classList.add('area4-usuarios')
    return () => shell?.classList.remove('area4-usuarios')
  }, [])

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.slice(1)
      setView(VIEWS.includes(hash as View) ? hash as View : 'usuarios')
    }
    readHash()
    window.addEventListener('hashchange', readHash)
    return () => window.removeEventListener('hashchange', readHash)
  }, [])

  function changeView(next: View) {
    setView(next)
    if (window.location.hash !== `#${next}`) window.location.hash = next
  }

  function tabKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % VIEWS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + VIEWS.length) % VIEWS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = VIEWS.length - 1
    else if (event.key === ' ') { event.preventDefault(); changeView(VIEWS[index]); return }
    else return
    event.preventDefault()
    changeView(VIEWS[next])
    tabRefs.current[next]?.focus()
  }

  const activePeople = snapshot.users.filter(person => person.active)
  const latest = snapshot.users.filter(person => person.lastAccess && !Number.isNaN(Date.parse(person.lastAccess))).sort((a, b) => Date.parse(b.lastAccess!) - Date.parse(a.lastAccess!))[0]
  const owners = activePeople.filter(person => currentRoleKey(snapshot, person) === 'superadmin')
  const managers = activePeople.filter(person => currentRoleKey(snapshot, person) === 'gerente')

  const tabs = <nav className="tabs" role="tablist" aria-label="Vistas de usuarios y permisos">{VIEWS.map((key, index) =>
    <a key={key} href={`#${key}`} id={`area4-tab-${key}`} role="tab" aria-controls={`area4-view-${key}`} aria-selected={view === key} aria-current={view === key ? 'page' : undefined} tabIndex={view === key ? 0 : -1} ref={node => { tabRefs.current[index] = node }} onClick={() => changeView(key)} onKeyDown={event => tabKeyDown(event, index)}>
      {TAB_LABELS[key]}{key === 'cambios' && proposalCount > 0 && <> <span className="tag P">{proposalCount}</span></>}
    </a>)}</nav>

  return <div className="area4-root" ref={rootRef}><IoShell>
    <TopBar eyebrow="Administración · Usuarios y permisos" tabs={tabs} controls={<>
      <Pill tone={workspace.edited || proposalCount ? 'mod' : 'ok'}>{workspace.edited ? 'Cambios sin guardar' : proposalCount ? 'Propuesta sin aplicar' : 'Sin cambios'}</Pill>
      <button className="btn" type="button" disabled={busy} onClick={() => setDialog('invite')}>Invitar por correo</button>
      <button className="btn primary" type="button" disabled={busy} onClick={() => setDialog('new')}>+ Nuevo usuario</button>
    </>}>
      <Kpis items={[
        { label: 'Personas activas', value: activePeople.length, sub: `${snapshot.users.length - activePeople.length} inactivas` },
        { label: 'Superadmin', value: owners.length, sub: owners.map(person => person.name.split(' ')[0]).join(', ') || 'Sin persona activa' },
        { label: 'Gerentes', value: managers.length, sub: managers.map(person => person.name.split(' ')[0]).join(' y ') || 'Sin personas activas' },
        { label: 'Roles', value: snapshot.roles.length, sub: 'plantillas' },
        { label: 'Cambios propuestos', value: proposalCount, sub: 'personas afectadas' },
        { label: 'Último acceso', value: <span className="area4-last-access">{latest ? formatDate(latest.lastAccess, true) : 'Nunca'}</span>, sub: latest?.name ?? 'Sin accesos registrados' },
      ]} />
    </TopBar>
    <Wrap as="main"><div className="area4-page">
      <MenuControl onSaved={() => { void audit.load() }} />
      <RegistryAssignments registry={snapshot.registry} roles={snapshot.roles} busy={busy} onSaved={async () => { await workspace.refreshSnapshot(true); await audit.load() }} />
      {workspace.error && <Note tone="bad"><span role="alert">{workspace.error}</span></Note>}
      {workspace.notice && <p className="small muted" role="status">{workspace.notice}</p>}
      <section className="view" role="tabpanel" id="area4-view-usuarios" aria-labelledby="area4-tab-usuarios" hidden={view !== 'usuarios'} tabIndex={0}>
        <UsersPanel snapshot={snapshot} drafts={drafts} rows={rows} selectedId={selectedId} onSelect={id => { setDialog(null); setSelectedId(id) }} onUpdate={workspace.updateDraft} onAction={action => setDialog(action)} events={history.events} auditLoading={history.loading} auditError={history.error} auditCursor={history.cursor} onLoadHistory={() => void history.load(history.cursor)} busy={busy} />
      </section>
      <section className="view" role="tabpanel" id="area4-view-roles" aria-labelledby="area4-tab-roles" hidden={view !== 'roles'} tabIndex={0}><RolesTable snapshot={snapshot} /></section>
      <section className="view" role="tabpanel" id="area4-view-cambios" aria-labelledby="area4-tab-cambios" hidden={view !== 'cambios'} tabIndex={0}>
        <Panel title="Cambios propuestos" help="Así quedaría cada persona. Revisa todas las diferencias por acción antes de preparar la revisión del servidor. Ningún cambio se aplica al abrir esta pantalla.">
          <div className="area4-notices">
            {snapshot.warnings.map((warning, index) => <Note key={index}>{warning}</Note>)}
            {!snapshot.applyingAllowed && <Note><b>Aplicación deshabilitada · {snapshot.environmentLabel}.</b> En producción, solo publicación autorizada con copia previa e informe. Este borrador no escribe en producción.</Note>}
            {blockedRows.length > 0 && <Note tone="bad"><b>El lote contiene cambios bloqueados.</b> No se puede aplicar hasta resolver las incompatibilidades de los contratos vivos.{blockedRows.map(row => <p className="small" key={row.userId}>{row.name}: {row.blockedReason}</p>)}</Note>}
          </div>
          <ChangesTable snapshot={snapshot} rows={rows} drafts={drafts} />
          <div className="row area4-buttons">
            <button className="btn" type="button" disabled={busy} onClick={workspace.saveLocal}>Guardar borrador local</button>
            <button className="btn" type="button" disabled={busy || !workspace.savedAvailable} onClick={workspace.restoreLocal}>Restaurar sin aplicar</button>
            <button className="btn" type="button" disabled={busy} onClick={workspace.resetDraft}>Volver a propuesta inicial</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void workspace.refreshSnapshot(true)}>Recargar datos</button>
            <button className="btn" type="button" disabled={busy} onClick={() => changeView('usuarios')}>Ver cómo lo verá cada uno</button>
            <button className="btn" type="button" disabled={busy || !proposalCount} onClick={() => void workspace.preparePreview()}>Revisar en servidor (sin aplicar)</button>
            <button className="btn primary" type="button" disabled={busy || !changedCount || !snapshot.applyingAllowed || blockedRows.length > 0} onClick={() => void workspace.preparePreview()}>{busy ? 'Preparando…' : 'Aplicar los cambios'}</button>
          </div>
          <p className="small muted area4-footnote">La propuesta inicial y la revisión del servidor detallan cada código y acción. Al editar, el borrador muestra la unión visual por apartado hasta pedir una revisión granular nueva. «Aplicar» primero prepara esa revisión sin escribir y después exige confirmación. «Ver como» usa permisos actuales, no simula el borrador.</p>
        </Panel>
      </section>
      <section className="view" role="tabpanel" id="area4-view-auditoria" aria-labelledby="area4-tab-auditoria" hidden={view !== 'auditoria'} tabIndex={0}><AuditPanel audit={audit} /></section>
    </div></Wrap>
    {dialog === 'invite' && <InviteDialog onClose={() => setDialog(null)} />}
    {dialog === 'new' && <NewUserDialog allowed={snapshot.applyingAllowed} onClose={() => setDialog(null)} onCreated={async () => { await workspace.refreshSnapshot(true); await audit.load() }} />}
    {selected && selectedDraft && dialog === 'extra' && <ExtraDialog snapshot={snapshot} person={selected} draft={selectedDraft} onClose={() => setDialog(null)} onUpdate={update => workspace.updateDraft(selected.id, update)} />}
    {selected && dialog === 'copy' && <CopyDialog snapshot={snapshot} person={selected} drafts={drafts} onClose={() => setDialog(null)} onUpdate={update => workspace.updateDraft(selected.id, update)} />}
    {selected && dialog === 'actuation' && <ActuationDialog person={selected} onClose={() => setDialog(null)} />}
    {workspace.confirmOpen && workspace.proposal && <ApplyDialog snapshot={snapshot} proposal={workspace.proposal} busy={busy} error={workspace.error} onClose={() => workspace.setConfirmOpen(false)} onApply={() => { void workspace.applyConfirmed().then(() => { void audit.load(); void history.load() }) }} />}
  </IoShell></div>
}
