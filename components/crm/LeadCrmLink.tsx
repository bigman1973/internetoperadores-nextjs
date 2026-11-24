'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRole } from '@/components/admin/RoleContext'

type LeadType = 'MIGRACION' | 'SOLUCION' | 'PARTNER'

/** Solo el clic explícito puede crear la ficha; una ficha vinculada es un enlace. */
export default function LeadCrmLink({ tipo, id, contactoId, className = '' }: {
  tipo: LeadType
  id: string
  contactoId?: string | null
  className?: string
}) {
  const router = useRouter()
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentContactId = contactoId || linkedContactId
  const sourceArea = tipo === 'PARTNER' ? 'admin.crm.partners' : 'admin.leads'
  const canRead = isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'lectura')
  const canWrite = !isViewingAs && (isSuperAdmin || (
    hasAreaAccess('admin.crm.contactos', 'escritura') && hasAreaAccess(sourceArea, 'escritura') && hasAreaAccess(sourceArea, 'lectura')
  ))
  const buttonStyle = `inline-flex min-h-11 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`

  const openContact = async () => {
    if (pending || currentContactId || !canWrite) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/crm/leads/${tipo}/${encodeURIComponent(id)}`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok || !data.success || typeof data.contactoId !== 'string' || !data.contactoId) {
        throw new Error(data.error || 'No se pudo abrir la ficha CRM.')
      }
      setLinkedContactId(data.contactoId)
      router.push(`/admin/crm/contactos/${encodeURIComponent(data.contactoId)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error de conexión al abrir la ficha CRM.')
    } finally {
      setPending(false)
    }
  }

  if (!canRead) return null
  if (currentContactId) {
    return <Link href={`/admin/crm/contactos/${encodeURIComponent(currentContactId)}`} prefetch={false} className={buttonStyle}>Abrir ficha CRM</Link>
  }
  if (!canWrite) return null

  return (
    <div>
      <button type="button" onClick={openContact} disabled={pending} className={buttonStyle}>
        {pending ? 'Abriendo ficha CRM…' : 'Abrir/crear ficha CRM'}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
