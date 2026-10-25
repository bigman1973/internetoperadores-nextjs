'use client'

import { useState } from 'react'
import LeadsPageClient from '@/components/admin/LeadsPageClient'
import AsistenteLeadsProjection from '@/components/admin/AsistenteLeadsProjection'

export default function LeadsWorkspace() {
  const [origen, setOrigen] = useState<'WEB' | 'ASISTENTE'>('WEB')
  return <div className="p-4 sm:p-6 max-w-7xl mx-auto">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="mt-1 text-sm text-gray-600">Gestiona los leads web existentes y los originados por el asistente desde el mismo módulo.</p>
      </div>
      <label className="text-sm font-medium text-gray-700">Origen
        <select value={origen} onChange={evento => setOrigen(evento.target.value as 'WEB' | 'ASISTENTE')} className="mt-1 block min-h-11 min-w-56 rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500">
          <option value="WEB">Formulario de migración web</option>
          <option value="ASISTENTE">ASISTENTE</option>
        </select>
      </label>
    </div>
    {origen === 'ASISTENTE' ? <AsistenteLeadsProjection /> : <LeadsPageClient integrada />}
  </div>
}
