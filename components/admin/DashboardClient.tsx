'use client'
import { useEffect, useState } from 'react'
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
  const [preview, setPreview] = useState<ApprovedRoleKey | null>(null)
  const [invalidated, setInvalidated] = useState(false)
  useEffect(() => { setInvalidated(false) }, [model])
  const canViewAs = model.owner && role.isArea4Owner && role.realRole === 'SUPER_ADMIN' && !role.isViewingAsUser
  const sourceChanged = role.effectiveUserId !== model.actorId || (role.isViewingAs && !model.acting) || invalidated
  const inferredPreview = APPROVED_ROLES.find(r => r.key !== 'superadmin' && ROLE_ENUM[r.key] === role.effectiveRole)?.key || 'empleado'
  let visible = (preview || sourceChanged) ? dashboardPreview(model, preview || inferredPreview) : model
  // Actual-person display is intersected again with the live client seed. This
  // never authorizes a reader; SSR has already excluded denied data entirely.
  if (!preview) visible = { ...visible,
    kpis: visible.kpis.filter(k => role.hasAccess(k.sectionKey) && (!k.href || role.hasSurfaceAccess(k.href))),
    columns: visible.columns.map(c => c.filter(b => role.hasAccess(b.sectionKey) && (!b.href || role.hasSurfaceAccess(b.href))).map(b => ({ ...b,
      rows: b.rows?.filter(r => {
        if (!r.href) return true
        const m = area4RegisteredSurface(r.href, 'page')
        return Boolean(m && role.hasAccess(m.section.key) && role.hasSurfaceAccess(r.href))
      }),
    }))),
  }
  const controls = canViewAs ? APPROVED_ROLES.map(r => <button key={r.key} type="button" aria-pressed={(preview || 'superadmin') === r.key} onClick={() => {
    setInvalidated(true)
    if (r.key === 'superadmin') { setPreview(null); role.setViewAsRole(null); router.refresh() }
    else { setPreview(r.key); role.setViewAsRole(ROLE_ENUM[r.key]) }
  }}>{r.key === 'superadmin' ? 'Dirección' : r.key === 'draxton' ? 'Draxton' : r.name}</button>) : undefined
  return <DashboardView model={visible} controls={controls} />
}
