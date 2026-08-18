'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProyectosInternosPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/proyectos?tipo=interno')
  }, [router])
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400">Redirigiendo a Proyectos Internos...</p>
    </div>
  )
}
