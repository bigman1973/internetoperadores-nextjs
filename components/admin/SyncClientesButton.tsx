'use client'
import { useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

export default function SyncClientesButton() {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.clientes', 'escritura'))
  const [isSyncing, setIsSyncing] = useState(false)

  if (!canWrite) return null

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        const conversiones = Number(data.contactosConvertidos || 0)
        alert(`Sincronización completada: ${Number(data.upserted || data.count || 0).toLocaleString('es-ES')} clientes revisados.${conversiones ? ` ${conversiones.toLocaleString('es-ES')} contactos CRM han pasado a cliente.` : ' No había nuevos contactos CRM para convertir.'}`)
        window.location.reload()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error syncing clients:', error)
      alert('Error al conectar con el servidor de sincronización.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50"
    >
      <ArrowPathIcon className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'Sincronizando...' : 'Sincronizar ISPGestión'}
    </button>
  )
}
