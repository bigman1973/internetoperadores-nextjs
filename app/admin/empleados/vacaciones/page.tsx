'use client'

import { useState, useEffect } from 'react'
import { 
  SunIcon, 
  ArrowPathIcon, 
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

interface SaldoEmpleado {
  id: string
  empleadoId: string | null
  empleadoNombre: string
  hrlogEmpleadoId: number | null
  anio: number
  diasConvenio: number
  diasBolsa: number
  diasAntiguedad: number
  diasTotal: number
  diasDisfrutadas: number
  diasAprobadas: number
  diasEnTramite: number
  saldoActual: number
  syncAt: string
  empleado?: {
    id: string
    nombreCompleto: string
    departamento: string | null
  }
}

interface Solicitud {
  id: string
  empleadoNombre: string
  tipo: string
  estado: string
  fechaInicio: string
  fechaFin: string
  totalDias: number | null
}

interface VacacionesData {
  saldos: SaldoEmpleado[]
  solicitudes: Solicitud[]
  kpis: {
    empleados: number
    totalDiasEmpresa: number
    totalDisfrutados: number
    totalAprobados: number
    totalEnTramite: number
    totalDisponibles: number
    porcentajeConsumido: number
  }
  ultimaSincronizacion: string | null
  year: number
}

export default function VacacionesPage() {
  const [data, setData] = useState<VacacionesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(2026)

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/vacaciones?year=${year}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [year])

  const handleSync = async () => {
    try {
      setSyncing(true)
      setError('')
      const res = await fetch('/api/admin/calendario/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message || 'Error al sincronizar')
      // El sync tarda ~15s en el Cloud Computer, recargar con polling
      setTimeout(fetchData, 8000)
      setTimeout(fetchData, 18000)
    } catch (err: any) {
      setError(err.message)
      setSyncing(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return 'Nunca'
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-ES', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'APROBADO':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="w-3 h-3" /> Aprobado
        </span>
      case 'SOLICITADO':
      case 'PENDIENTE':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <ClockIcon className="w-3 h-3" /> En trámite
        </span>
      case 'DENEGADO':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <ExclamationTriangleIcon className="w-3 h-3" /> Denegado
        </span>
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{estado}</span>
    }
  }

  const getProgressColor = (porcentaje: number) => {
    if (porcentaje >= 80) return 'bg-red-500'
    if (porcentaje >= 60) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>)}
          </div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <SunIcon className="w-7 h-7 text-amber-500" />
            Control de Vacaciones
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Saldo y solicitudes de vacaciones por empleado
            {data?.ultimaSincronizacion && (
              <span className="ml-2 text-gray-400">
                · Última sync: {formatDateTime(data.ultimaSincronizacion)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar HRLog'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* KPIs */}
      {data?.kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Empleados</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.kpis.empleados}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Días Totales</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.kpis.totalDiasEmpresa}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Disfrutados</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{data.kpis.totalDisfrutados}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Aprobados</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{data.kpis.totalAprobados}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">En Trámite</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{data.kpis.totalEnTramite}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Disponibles</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.kpis.totalDisponibles}</p>
          </div>
        </div>
      )}

      {/* Barra de progreso global */}
      {data?.kpis && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Consumo global de vacaciones</span>
            <span className="text-sm font-bold text-gray-900">{data.kpis.porcentajeConsumido}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all ${getProgressColor(data.kpis.porcentajeConsumido)}`}
              style={{ width: `${Math.min(data.kpis.porcentajeConsumido, 100)}%` }}
            ></div>
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>{data.kpis.totalDisfrutados} disfrutados</span>
            <span>{data.kpis.totalDisponibles} disponibles de {data.kpis.totalDiasEmpresa}</span>
          </div>
        </div>
      )}

      {/* Tabla de saldos por empleado */}
      {data?.saldos && data.saldos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Saldo por Empleado</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Convenio</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bolsa</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Disfrutados</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aprobados</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">En Trámite</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Disponibles</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.saldos.map((saldo) => {
                  const consumido = saldo.diasDisfrutadas + saldo.diasAprobadas + saldo.diasEnTramite
                  const porcentaje = saldo.diasTotal > 0 ? Math.round((consumido / saldo.diasTotal) * 100) : 0
                  return (
                    <tr key={saldo.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{saldo.empleadoNombre}</div>
                        {saldo.empleado?.departamento && (
                          <div className="text-xs text-gray-500">{saldo.empleado.departamento}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-gray-900">{saldo.diasTotal}</td>
                      <td className="px-3 py-3 text-center text-sm text-gray-600">{saldo.diasConvenio}</td>
                      <td className="px-3 py-3 text-center text-sm text-gray-600">{saldo.diasBolsa || '-'}</td>
                      <td className="px-3 py-3 text-center text-sm font-medium text-green-700">{saldo.diasDisfrutadas}</td>
                      <td className="px-3 py-3 text-center text-sm font-medium text-blue-700">{saldo.diasAprobadas}</td>
                      <td className="px-3 py-3 text-center text-sm font-medium text-yellow-700">{saldo.diasEnTramite || '-'}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-gray-900">{saldo.saldoActual}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[80px]">
                            <div 
                              className={`h-2 rounded-full ${getProgressColor(porcentaje)}`}
                              style={{ width: `${Math.min(porcentaje, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500 w-8">{porcentaje}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Solicitudes recientes */}
      {data?.solicitudes && data.solicitudes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Solicitudes de Vacaciones ({year})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Inicio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Fin</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Días</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.solicitudes.map((sol) => (
                  <tr key={sol.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{sol.empleadoNombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(sol.fechaInicio)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(sol.fechaFin)}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">{sol.totalDias || '-'}</td>
                    <td className="px-4 py-3">{getEstadoBadge(sol.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {data?.saldos && data.saldos.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <CalendarDaysIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Sin datos de vacaciones</h3>
          <p className="text-sm text-gray-500 mb-4">
            Pulsa &quot;Sincronizar HRLog&quot; para cargar los saldos de vacaciones desde HRLog.
          </p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar ahora
          </button>
        </div>
      )}
    </div>
  )
}
