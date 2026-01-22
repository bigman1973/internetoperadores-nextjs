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
import { formatDate } from '../../lib/utils/format'

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

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente?')) return
    try {
      const response = await fetch(`/api/admin/clientes/${id}`, { method: 'DELETE' })
      if (response.ok) {
        setLocalClientes(prev => prev.filter(c => c.id !== id))
      } else {
        alert('Error al eliminar cliente')
      }
    } catch (error) {
      console.error('Error deleting cliente:', error)
      alert('Error al eliminar cliente')
    }
  }

  const handleToggleNewsletter = async (id: number) => {
    const cliente = localClientes.find(c => c.id === id)
    if (!cliente) return
    try {
      const response = await fetch(`/api/admin/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsletterSuscrito: !cliente.newsletterSuscrito })
      })
      if (response.ok) {
        setLocalClientes(prev => prev.map(c => 
          c.id === id ? { ...c, newsletterSuscrito: !c.newsletterSuscrito } : c
        ))
      }
    } catch (error) {
      console.error('Error updating newsletter:', error)
    }
  }

  return (
    <div className="bg-white shadow border border-gray-200 rounded-lg overflow-hidden">
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID ISPGestión</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Newsletter</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último Acceso</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registro</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {localClientes.map((cliente) => (
              <tr key={cliente.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white font-bold">
                      {cliente.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{cliente.nombre}</div>
                      <div className="text-sm text-gray-500">{cliente.email}</div>
                    </div>
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
                    className={`inline-flex items-center gap-x-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      cliente.newsletterSuscrito
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {cliente.newsletterSuscrito ? (
                      <><CheckCircleIcon className="h-3 w-3" />Suscrito</>
                    ) : (
                      <><XCircleIcon className="h-3 w-3" />No suscrito</>
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
                    <Link href={`/admin/clientes/${cliente.id}/editar`} className="text-orange-600 hover:text-orange-900">
                      <PencilIcon className="h-5 w-5" />
                    </Link>
                    <button onClick={() => handleDelete(cliente.id)} className="text-red-600 hover:text-red-900">
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
