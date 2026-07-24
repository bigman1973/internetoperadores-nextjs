'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/components/admin/RoleContext'

const tabs = [
  { href: '/admin/clientes/ggcc/draxton/finanzas', area: 'admin.clientes.ggcc.draxton.finanzas' },
  { href: '/admin/clientes/ggcc/draxton/contratos', area: 'admin.clientes.ggcc.draxton.contratos' },
  { href: '/admin/clientes/ggcc/draxton/proyectos-singulares', area: 'admin.clientes.ggcc.draxton.proyectos_singulares' },
  { href: '/admin/clientes/ggcc/draxton/proyectos', area: 'admin.clientes.ggcc.draxton.proyectos' },
  { href: '/admin/clientes/ggcc/draxton/personal', area: 'admin.clientes.ggcc.draxton.personal' },
  { href: '/admin/clientes/ggcc/draxton/contrato-guardias', area: 'admin.clientes.ggcc.draxton.contrato_guardias' },
  { href: '/admin/clientes/ggcc/draxton/seguimiento', area: 'admin.clientes.ggcc.draxton.seguimiento' },
  { href: '/admin/clientes/ggcc/draxton/kpis', area: 'admin.clientes.ggcc.draxton.kpis' },
  { href: '/admin/clientes/ggcc/draxton/informes', area: 'admin.clientes.ggcc.draxton.informes' },
]

export default function DraxtonPage() {
  const router = useRouter()
  const { hasAreaAccess, permisosLoaded, isSuperAdmin, isViewingAs } = useRole()

  useEffect(() => {
    // SUPER_ADMIN sin simulación: ir a finanzas directamente
    if (isSuperAdmin && !isViewingAs) {
      router.replace('/admin/clientes/ggcc/draxton/finanzas')
      return
    }

    // Esperar a que se carguen los permisos
    if (!permisosLoaded) return

    // Buscar la primera pestaña accesible
    const firstAccessible = tabs.find(tab => hasAreaAccess(tab.area, 'lectura'))
    
    if (firstAccessible) {
      router.replace(firstAccessible.href)
    } else {
      router.replace('/admin/clientes/ggcc/draxton/finanzas')
    }
  }, [permisosLoaded, hasAreaAccess, isSuperAdmin, isViewingAs, router])

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  )
}
