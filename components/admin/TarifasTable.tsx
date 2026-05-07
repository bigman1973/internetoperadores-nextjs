'use client'

import Link from 'next/link'
import { useState } from 'react'
import { 
  PencilIcon, 
  TrashIcon, 
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  StarIcon,
  PhoneIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  TvIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { formatCurrency, formatDate } from '../../lib/utils/format'

interface Tarifa {
  id: number
  tipoCliente: string
  categoria: string
  nombre: string
  velocidad: string | null
  precioSinIva: number
  precioConIva: number
  costeOperador: number | null
  permanencia: string | null
  destacada: boolean
  activa: boolean
  ispGestionId: string | null
  esMovil: boolean
  esFijo: boolean
  esInternet: boolean
  esTv: boolean
  esCompuesta: boolean
  velocidadBajada: string | null
  velocidadSubida: string | null
  fibraBajada: string | null
  fibraSubida: string | null
  datosIncluidos: string | null
  minutosIncluidos: string | null
  smsIncluidos: string | null
  conceptoFacturacion: string | null
  servicioPppoe: string | null
  duracionPermanenciaMeses: number | null
  observacionesPermanencia: string | null
  noFacturar: boolean
  noProrrateable: boolean
  publicarWeb: boolean
  tipoPeriodicidad: number | null
  precioPeriodo: number | null
  precioPeriodoIva: number | null
  createdAt: Date
  updatedAt: Date
  createdBy: { nombre: string } | null
  updatedBy: { nombre: string } | null
}

interface TarifasTableProps {
  tarifas: Tarifa[]
}

function ServiceBadges({ tarifa }: { tarifa: Tarifa }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tarifa.esMovil && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          <DevicePhoneMobileIcon className="h-3 w-3" />
          Móvil
        </span>
      )}
      {tarifa.esFijo && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
          <PhoneIcon className="h-3 w-3" />
          Fijo
        </span>
      )}
      {tarifa.esInternet && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700">
          <GlobeAltIcon className="h-3 w-3" />
          Internet
        </span>
      )}
      {tarifa.esTv && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700">
          <TvIcon className="h-3 w-3" />
          TV
        </span>
      )}
      {tarifa.esCompuesta && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700">
          Pack
        </span>
      )}
      {!tarifa.esMovil && !tarifa.esFijo && !tarifa.esInternet && !tarifa.esTv && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-500">
          Servicio
        </span>
      )}
    </div>
  )
}

function TarifaDetails({ tarifa }: { tarifa: Tarifa }) {
  return (
    <tr>
      <td colSpan={8} className="px-6 py-3 bg-gray-50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {/* Precios */}
          <div>
            <span className="font-semibold text-gray-700 block">Precios</span>
            <div className="mt-1 space-y-0.5 text-gray-600">
              <div>Sin IVA: <span className="font-medium">{formatCurrency(tarifa.precioSinIva)}</span></div>
              <div>Con IVA: <span className="font-medium">{formatCurrency(tarifa.precioConIva)}</span></div>
              {tarifa.costeOperador && tarifa.costeOperador > 0 && (
                <div>Coste operador: <span className="font-medium">{formatCurrency(tarifa.costeOperador)}</span></div>
              )}
              {tarifa.precioPeriodo && (
                <div>Precio período: <span className="font-medium">{formatCurrency(tarifa.precioPeriodo)}</span></div>
              )}
            </div>
          </div>
          
          {/* Velocidad y datos */}
          <div>
            <span className="font-semibold text-gray-700 block">Conectividad</span>
            <div className="mt-1 space-y-0.5 text-gray-600">
              {tarifa.velocidad && <div>Velocidad: <span className="font-medium">{tarifa.velocidad}</span></div>}
              {tarifa.velocidadBajada && <div>Bajada radio: <span className="font-medium">{tarifa.velocidadBajada} Mbps</span></div>}
              {tarifa.velocidadSubida && <div>Subida radio: <span className="font-medium">{tarifa.velocidadSubida} Mbps</span></div>}
              {tarifa.fibraBajada && <div>Fibra bajada: <span className="font-medium">{tarifa.fibraBajada} Mbps</span></div>}
              {tarifa.fibraSubida && <div>Fibra subida: <span className="font-medium">{tarifa.fibraSubida} Mbps</span></div>}
              {tarifa.datosIncluidos && <div>Datos: <span className="font-medium">{tarifa.datosIncluidos}</span></div>}
              {tarifa.minutosIncluidos && <div>Minutos: <span className="font-medium">{tarifa.minutosIncluidos}</span></div>}
              {tarifa.smsIncluidos && <div>SMS: <span className="font-medium">{tarifa.smsIncluidos}</span></div>}
              {tarifa.servicioPppoe && <div>Servicio: <span className="font-medium">{tarifa.servicioPppoe}</span></div>}
              {!tarifa.velocidad && !tarifa.velocidadBajada && !tarifa.fibraBajada && !tarifa.datosIncluidos && !tarifa.minutosIncluidos && !tarifa.servicioPppoe && (
                <div className="text-gray-400">Sin datos de conectividad</div>
              )}
            </div>
          </div>
          
          {/* Permanencia */}
          <div>
            <span className="font-semibold text-gray-700 block">Permanencia</span>
            <div className="mt-1 space-y-0.5 text-gray-600">
              {tarifa.duracionPermanenciaMeses ? (
                <>
                  <div>Duración: <span className="font-medium">{tarifa.duracionPermanenciaMeses} meses</span></div>
                  {tarifa.permanencia && <div>Penalización: <span className="font-medium text-red-600">{tarifa.permanencia}</span></div>}
                  {tarifa.observacionesPermanencia && <div className="text-gray-500 italic">{tarifa.observacionesPermanencia}</div>}
                </>
              ) : (
                <div className="text-green-600 font-medium">Sin permanencia</div>
              )}
            </div>
          </div>
          
          {/* Info adicional */}
          <div>
            <span className="font-semibold text-gray-700 block">Info adicional</span>
            <div className="mt-1 space-y-0.5 text-gray-600">
              {tarifa.ispGestionId && <div>ID ISP Gestión: <span className="font-medium">#{tarifa.ispGestionId}</span></div>}
              {tarifa.conceptoFacturacion && <div>Facturación: <span className="font-medium">{tarifa.conceptoFacturacion}</span></div>}
              {tarifa.noFacturar && <div className="text-amber-600 font-medium">No facturable</div>}
              {tarifa.noProrrateable && <div className="text-amber-600">No prorrateable</div>}
              {tarifa.publicarWeb && <div className="text-green-600">Publicada en web</div>}
              {tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad !== 1 && (
                <div>Periodicidad: <span className="font-medium">Tipo {tarifa.tipoPeriodicidad}</span></div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

export default function TarifasTable({ tarifas }: TarifasTableProps) {
  const [localTarifas, setLocalTarifas] = useState(tarifas)
  const [expandedId, setExpandedId] = useState<number | null>(null)

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
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tarifa
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Servicios
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Categoría
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Precio (sin IVA)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Precio (con IVA)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Permanencia
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Estado
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {localTarifas.map(tarifa => (
              <>
                <tr key={tarifa.id} className={`hover:bg-gray-50 cursor-pointer ${expandedId === tarifa.id ? 'bg-gray-50' : ''}`}
                    onClick={() => setExpandedId(expandedId === tarifa.id ? null : tarifa.id)}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {expandedId === tarifa.id ? (
                        <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-x-2">
                          <div className="text-sm font-medium text-gray-900">
                            {tarifa.nombre}
                          </div>
                          {tarifa.destacada && (
                            <StarIconSolid className="h-4 w-4 text-yellow-400" />
                          )}
                        </div>
                        {tarifa.ispGestionId && (
                          <div className="text-xs text-gray-400">ISP #{tarifa.ispGestionId}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ServiceBadges tarifa={tarifa} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    <span className="text-xs">{tarifa.categoria}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatCurrency(Number(tarifa.precioSinIva))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(Number(tarifa.precioConIva))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {tarifa.duracionPermanenciaMeses ? (
                      <span className="text-amber-600 font-medium">{tarifa.duracionPermanenciaMeses} meses</span>
                    ) : (
                      <span className="text-green-600">Sin permanencia</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleActiva(tarifa.id); }}
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
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-x-2" onClick={(e) => e.stopPropagation()}>
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
                {expandedId === tarifa.id && (
                  <TarifaDetails key={`detail-${tarifa.id}`} tarifa={tarifa} />
                )}
              </>
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
                <div className="mt-1">
                  <ServiceBadges tarifa={tarifa} />
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {tarifa.categoria}
                  {tarifa.ispGestionId && <span className="ml-2 text-gray-400">ISP #{tarifa.ispGestionId}</span>}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(Number(tarifa.precioConIva))}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      ({formatCurrency(Number(tarifa.precioSinIva))} sin IVA)
                    </span>
                  </div>
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
                <div className="mt-1 text-xs text-gray-500">
                  {tarifa.duracionPermanenciaMeses ? (
                    <span className="text-amber-600">Permanencia: {tarifa.duracionPermanenciaMeses} meses</span>
                  ) : (
                    <span className="text-green-600">Sin permanencia</span>
                  )}
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
