'use client'

import Link from 'next/link'
import { useState } from 'react'
import { 
  PencilIcon, 
  TrashIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'
import { formatDate } from '@/lib/utils/format'

interface Cliente {
  id: number
  email: string
  nombre: string
  ispGestionId: string
  newsletterSuscrito: boolean
  ultimoAcceso: Date | null
  createdAt: Date
  updatedAt: Date
}

interface ClientesTableProps {
  clientes: Cliente[]
}

export default function ClientesTable({ clientes }: ClientesTableProps) {
  const [localClientes, setLocalClientes] = useState(clientes)

  const handleToggleNewsletter = async (id: number) => {
    try {
      const cliente = localClientes.find(c => c.id === id)
      const response = await fetch(`/api/admin/clientes/${id}/newsletter`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsletterSuscrito: !cliente?.newsletterSuscrito }),
      })

      if (response.ok) {
        setLocalClientes(prev =>
          prev.map(c => (c.id === id ? { ...c, newsletterSuscrito: !c.newsletterSuscrito } : c))
        )
      }
    } catch (error) {
      console.error('Error al cambiar suscripción newsletter:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/clientes/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setLocalClientes(prev => prev.filter(c => c.id !== id))
      }
    } catch (error) {
      console.error('Error al eliminar:', error)
    }
  }

  if (localClientes.length === 0) {
    return (
      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-gray-500">
            No se encontraron clientes con los filtros aplicados.
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
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                ID ISPGestión
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Newsletter
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Último Acceso
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Fecha Registro
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {localClientes.map(cliente => (
              <tr key={cliente.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm">
                      {cliente.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {cliente.nombre}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-x-2">
                    <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-900">{cliente.email}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                    {cliente.ispGestionId}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handleToggleNewsletter(cliente.id)}
                    className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-semibold ${
                      cliente.newsletterSuscrito
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cliente.newsletterSuscrito ? (
                      <>
                        <CheckCircleIcon className="h-3 w-3" />
                        Suscrito
                      </>
                    ) : (
                      <>
                        <XCircleIcon className="h-3 w-3" />
                        No suscrito
                      </>
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {cliente.ultimoAcceso ? formatDate(cliente.ultimoAcceso) : 'Nunca'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(cliente.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-x-2">
                    <Link
                      href={`/admin/clientes/${cliente.id}/editar`}
                      className="text-orange-600 hover:text-orange-900"
                      title="Editar"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(cliente.id)}
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
        {localClientes.map(cliente => (
          <div key={cliente.id} className="px-4 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-x-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm flex-shrink-0">
                  {cliente.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {cliente.nombre}
                  </h3>
                  <div className="mt-1 flex items-center gap-x-1 text-xs text-gray-500">
                    <EnvelopeIcon className="h-3 w-3" />
                    <span className="truncate">{cliente.email}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">ID ISPGestión:</span>
                <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700">
                  {cliente.ispGestionId}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Newsletter:</span>
                <button
                  onClick={() => handleToggleNewsletter(cliente.id)}
                  className={`inline-flex items-center gap-x-1 rounded-full px-2 py-1 font-semibold ${
                    cliente.newsletterSuscrito
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {cliente.newsletterSuscrito ? 'Suscrito' : 'No suscrito'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Último acceso:</span>
                <span className="text-gray-900">
                  {cliente.ultimoAcceso ? formatDate(cliente.ultimoAcceso) : 'Nunca'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Registro:</span>
                <span className="text-gray-900">{formatDate(cliente.createdAt)}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-x-3">
              <Link
                href={`/admin/clientes/${cliente.id}/editar`}
                className="text-orange-600 hover:text-orange-900"
              >
                <PencilIcon className="h-5 w-5" />
              </Link>
              <button
                onClick={() => handleDelete(cliente.id)}
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
