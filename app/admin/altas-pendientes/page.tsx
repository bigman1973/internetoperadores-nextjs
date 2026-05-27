'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface AltaResumen {
  id: string
  tipoCliente: 'PARTICULAR' | 'EMPRESA'
  nombre?: string
  apellidos?: string
  razonSocial?: string
  email: string
  telefono?: string
  tarifaNombre: string
  importeCuota: number
  metodoPago: string
  estado: string
  esPortabilidad: boolean
  createdAt: string
  documentosCount: number
  documentosValidados: number
}

const ESTADOS_LABEL: Record<string, { label: string; color: string }> = {
  FORMULARIO_PENDIENTE: { label: 'Formulario pendiente', color: 'bg-gray-100 text-gray-700' },
  FORMULARIO_COMPLETADO: { label: 'Formulario completado', color: 'bg-blue-100 text-blue-700' },
  DOCUMENTACION_PENDIENTE: { label: 'Docs pendientes', color: 'bg-yellow-100 text-yellow-700' },
  DOCUMENTACION_PARCIAL: { label: 'Docs parcial', color: 'bg-amber-100 text-amber-700' },
  DOCUMENTACION_COMPLETA: { label: 'Docs completa', color: 'bg-green-100 text-green-700' },
  PAGO_PENDIENTE: { label: 'Pago pendiente', color: 'bg-orange-100 text-orange-700' },
  PAGO_COMPLETADO: { label: 'Pago completado', color: 'bg-green-100 text-green-700' },
  EN_REVISION: { label: 'En revisión', color: 'bg-purple-100 text-purple-700' },
  APROBADA: { label: 'Aprobada', color: 'bg-green-100 text-green-800' },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700' },
  SERVICIO_ACTIVO: { label: 'Servicio activo', color: 'bg-green-200 text-green-800' },
  CANCELADA: { label: 'Cancelada', color: 'bg-red-100 text-red-600' },
}

const METODO_PAGO_LABEL: Record<string, string> = {
  SEPA_DOMICILIACION: '🏦 SEPA',
  TARJETA_VIVID: '💳 Tarjeta',
  CRYPTO_TRIPLE_A: '🪙 Crypto',
}

export default function AltasPendientesPage() {
  const [altas, setAltas] = useState<AltaResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS')
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS')

  useEffect(() => {
    fetchAltas()
  }, [])

  const fetchAltas = async () => {
    try {
      const res = await fetch('/api/admin/altas')
      const data = await res.json()
      if (res.ok) setAltas(data)
    } catch (err) {
      console.error('Error cargando altas:', err)
    } finally {
      setLoading(false)
    }
  }

  const altasFiltradas = altas.filter(a => {
    if (filtroEstado !== 'TODOS' && a.estado !== filtroEstado) return false
    if (filtroTipo !== 'TODOS' && a.tipoCliente !== filtroTipo) return false
    return true
  })

  const contarPorEstado = (estado: string) => altas.filter(a => a.estado === estado).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Altas de Servicio Pendientes</h1>
          <p className="text-sm text-gray-500 mt-1">{altas.length} altas en total</p>
        </div>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-2xl font-bold text-yellow-600">{contarPorEstado('DOCUMENTACION_PENDIENTE') + contarPorEstado('DOCUMENTACION_PARCIAL')}</p>
          <p className="text-xs text-gray-500">Esperando docs</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-2xl font-bold text-green-600">{contarPorEstado('DOCUMENTACION_COMPLETA')}</p>
          <p className="text-xs text-gray-500">Docs completa</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-2xl font-bold text-purple-600">{contarPorEstado('EN_REVISION')}</p>
          <p className="text-xs text-gray-500">En revisión</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-2xl font-bold text-orange-600">{contarPorEstado('APROBADA')}</p>
          <p className="text-xs text-gray-500">Aprobadas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
        >
          <option value="TODOS">Todos los estados</option>
          {Object.entries(ESTADOS_LABEL).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
        >
          <option value="TODOS">Todos los tipos</option>
          <option value="PARTICULAR">Particular</option>
          <option value="EMPRESA">Empresa</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarifa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pago</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Docs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {altasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No hay altas que coincidan con los filtros
                  </td>
                </tr>
              ) : (
                altasFiltradas.map(alta => {
                  const estadoInfo = ESTADOS_LABEL[alta.estado] || { label: alta.estado, color: 'bg-gray-100 text-gray-700' }
                  return (
                    <tr key={alta.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {alta.tipoCliente === 'EMPRESA' ? alta.razonSocial : `${alta.nombre} ${alta.apellidos}`}
                          </p>
                          <p className="text-xs text-gray-500">{alta.email}</p>
                          <span className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded ${
                            alta.tipoCliente === 'EMPRESA' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {alta.tipoCliente === 'EMPRESA' ? 'Empresa' : 'Particular'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{alta.tarifaNombre}</p>
                        <p className="text-xs text-gray-500">{Number(alta.importeCuota).toFixed(2)}€/mes</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{METODO_PAGO_LABEL[alta.metodoPago] || alta.metodoPago}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">{alta.documentosCount}</span>
                          {alta.documentosCount > 0 && (
                            <span className="text-xs text-gray-400">
                              ({alta.documentosValidados} ✓)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">
                          {new Date(alta.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(alta.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/altas-pendientes/${alta.id}`}
                          className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
