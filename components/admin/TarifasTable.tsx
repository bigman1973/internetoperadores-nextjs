'use client'

import Link from 'next/link'
import { useState } from 'react'
import { 
  PencilIcon, 
  TrashIcon, 
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  StarIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { formatCurrency, formatDate } from '../../../lib/utils/format'

interface Tarifa {
  id: number
  tipoCliente: string
  categoria: string
  nombre: string
  velocidad: string | null
  precioConIva: number
  permanencia: string | null
  destacada: boolean
  activa: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: { nombre: string } | null
  updatedBy: { nombre: string } | null
}

interface TarifasTableProps {
  tarifas: Tarifa[]
}

export default function TarifasTable({ tarifas }: TarifasTableProps) {
  const [localTarifas, setLocalTarifas] = useState(tarifas)

  const handleToggleActiva = async (id: number) => {
    try {
      const tarifa = localTarifas.find(t => t.id === id)
      const response = await fetch(`/api/admin/tarifas/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: !tarifa?.activa }),
      })

      if (response.ok) {
        setLocalTarifas(prev =>
          prev.map(t => (t.id === id ? { ...t, activa: !t.activa } : t))
        )
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error)
    }
  }

  const handleToggleDestacada = async (id: number) => {
    try {
      const tarifa = localTarifas.find(t => t.id === id)
      const response = await fetch(`/api/admin/tarifas/${id}/destacada`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destacada: !tarifa?.destacada }),
      })

      if (response.ok) {
        setLocalTarifas(prev =>
          prev.map(t => (t.id === id ? { ...t, destacada: !t.destacada } : t))
        )
      }
    } catch (error) {
      console.error('Error al cambiar destacada:', error)
    }
  }

  const handleDuplicate = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/tarifas/${id}/duplicate`, {
        method: 'POST',
      })

      if (response.ok) {
        window.location.reload()
      }
    } catch (error) {
      console.error('Error al duplicar:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta tarifa?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/tarifas/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setLocalTarifas(prev => prev.filter(t => t.id !== id))
      }
    } catch (error) {
      console.error('Error al eliminar:', error)
    }
  }

  if (localTarifas.length === 0) {
    return (
      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-gray-500">
            No se encontraron tarifas con los filtros aplicados.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tarifa
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Categoría
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Velocidad
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Precio
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {localTarifas.map(tarifa => (
              <tr key={tarifa.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div>
                      <div className="flex items-center gap-x-2">
                        <div className="text-sm font-medium text-gray-900">
                          {tarifa.nombre}
                        </div>
                        {tarifa.destacada && (
                          <StarIconSolid className="h-4 w-4 text-yellow-400" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {tarifa.permanencia || 'Sin permanencia'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                    tarifa.tipoCliente === 'PARTICULAR'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {tarifa.tipoCliente === 'PARTICULAR' ? 'Particular' : 'Empresa'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tarifa.categoria}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tarifa.velocidad || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {formatCurrency(Number(tarifa.precioConIva))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handleToggleActiva(tarifa.id)}
                    className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-semibold ${
                      tarifa.activa
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tarifa.activa ? (
                      <>
                        <EyeIcon className="h-3 w-3" />
                        Activa
                      </>
                    ) : (
                      <>
                        <EyeSlashIcon className="h-3 w-3" />
                        Inactiva
                      </>
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-x-2">
                    <button
                      onClick={() => handleToggleDestacada(tarifa.id)}
                      className="text-gray-400 hover:text-yellow-500"
                      title="Destacar"
                    >
                      {tarifa.destacada ? (
                        <StarIconSolid className="h-5 w-5 text-yellow-400" />
                      ) : (
                        <StarIcon className="h-5 w-5" />
                      )}
                    </button>
                    <Link
                      href={`/admin/tarifas/${tarifa.id}/editar`}
                      className="text-orange-600 hover:text-orange-900"
                      title="Editar"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </Link>
                    <button
                      onClick={() => handleDuplicate(tarifa.id)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Duplicar"
                    >
                      <DocumentDuplicateIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(tarifa.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Eliminar"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden divide-y divide-gray-200">
        {localTarifas.map(tarifa => (
          <div key={tarifa.id} className="px-4 py-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-x-2">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {tarifa.nombre}
                  </h3>
                  {tarifa.destacada && (
                    <StarIconSolid className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-x-2 text-xs text-gray-500">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    tarifa.tipoCliente === 'PARTICULAR'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {tarifa.tipoCliente === 'PARTICULAR' ? 'Particular' : 'Empresa'}
                  </span>
                  <span>{tarifa.categoria}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(Number(tarifa.precioConIva))}
                  </span>
                  <button
                    onClick={() => handleToggleActiva(tarifa.id)}
                    className={`inline-flex items-center gap-x-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      tarifa.activa
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {tarifa.activa ? 'Activa' : 'Inactiva'}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-x-3">
              <button
                onClick={() => handleToggleDestacada(tarifa.id)}
                className="text-gray-400 hover:text-yellow-500"
              >
                {tarifa.destacada ? (
                  <StarIconSolid className="h-5 w-5 text-yellow-400" />
                ) : (
                  <StarIcon className="h-5 w-5" />
                )}
              </button>
              <Link
                href={`/admin/tarifas/${tarifa.id}/editar`}
                className="text-orange-600 hover:text-orange-900"
              >
                <PencilIcon className="h-5 w-5" />
              </Link>
              <button
                onClick={() => handleDuplicate(tarifa.id)}
                className="text-blue-600 hover:text-blue-900"
              >
                <DocumentDuplicateIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => handleDelete(tarifa.id)}
                className="text-red-600 hover:text-red-900"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
