'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from './RoleContext'
import { DashboardView } from './dashboard/DashboardView'
import { APPROVED_ROLES, ROLE_ENUM } from '@/lib/area4/approved-roles'
import { dashboardPreview } from '@/lib/area4/dashboard-model'
import { area4RegisteredSurface } from '@/lib/area4/section-registry'
import type { ApprovedRoleKey } from '@/lib/area4/users-contract'
import type { DashboardModel } from '@/lib/area4/dashboard-contract'

export default function DashboardClient({ model }: { model: DashboardModel }) {
  const role = useRole()
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<ApprovedRoleKey>(model.role)
  const [pending, startTransition] = useTransition()
  useEffect(() => { setSelectedRole(model.role) }, [model])
  const canViewAs = model.owner && role.isArea4Owner && role.realRole === 'SUPER_ADMIN' && !role.isViewingAs
  const sourceChanged = role.effectiveUserId !== (model.viewerId ?? model.actorId) || (role.isViewingAs && !model.acting)
  const inferredPreview = APPROVED_ROLES.find(r => r.key !== 'superadmin' && ROLE_ENUM[r.key] === role.effectiveRole)?.key || 'empleado'
  let visible = sourceChanged ? dashboardPreview(model, inferredPreview) : selectedRole !== model.role ? { ...dashboardPreview(model, selectedRole), notice: 'Elige una persona activa de este rol para ver sus datos reales. Esta selección no cambia el menú ni la sesión.' } : model
  if (!model.previewingPerson || sourceChanged) visible = { ...visible,
    kpis: visible.kpis.filter(k => role.hasAccess(k.sectionKey) && (!k.href || role.hasSurfaceAccess(k.href))),
    columns: visible.columns.map(c => c.filter(b => role.hasAccess(b.sectionKey) && (!b.href || role.hasSurfaceAccess(b.href))).map(b => ({ ...b,
      rows: b.rows?.filter(r => {
        if (!r.href) return true
        const m = area4RegisteredSurface(r.href, 'page')
        return Boolean(m && role.hasAccess(m.section.key) && role.hasSurfaceAccess(r.href))
      }),
    }))),
  }
  const navigate = (id?: number) => startTransition(() => { router.replace(id ? `/admin?dashboardPersona=${id}` : '/admin', { scroll: false }) })
  const people = (model.people || []).filter(p => p.role === selectedRole)
  const controls = canViewAs ? <>
    {APPROVED_ROLES.map(r => <button key={r.key} type="button" disabled={pending} aria-pressed={selectedRole === r.key} onClick={() => {
      setSelectedRole(r.key)
      if (r.key === 'superadmin') navigate()
      else {
        const first = (model.people || []).find(p => p.role === r.key)
        if (first) navigate(first.id)
      }
    }}>{r.key === 'superadmin' ? 'Dirección' : r.key === 'draxton' ? 'Draxton' : r.name}</button>)}
    {selectedRole !== 'superadmin' && <label className="small">Persona <select aria-label="Persona del rol" disabled={pending || !people.length} value={people.some(p => p.id === model.actorId) ? model.actorId : ''} onChange={event => navigate(Number(event.target.value))}>
      <option value="" disabled>{people.length ? 'Selecciona una persona' : 'No hay personas activas con este rol'}</option>
      {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>}
    {pending && <span className="small" role="status">Cargando datos de la persona…</span>}
  </> : undefined
  return <DashboardView model={visible} controls={controls} />
}
