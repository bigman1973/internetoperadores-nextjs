'use client'
import { useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

export default function SyncContratosButton() {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/sync-contratos', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        alert(`Sincronización exitosa: ${data.upserted} contratos sincronizados (${data.activos} activos, ${data.bajas} dados de baja).`)
        window.location.reload()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error syncing contracts:', error)
      alert('Error al conectar con el servidor de sincronización.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
    >
      <ArrowPathIcon className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'Sincronizando contratos...' : 'Sincronizar Contratos'}
    </button>
  )
}
