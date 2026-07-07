'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeftIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

interface Evento {
  id: string
  empleadoNombre: string
  tipo: 'VACACIONES' | 'PERMISO' | 'BAJA'
  estado: 'PENDIENTE' | 'APROBADO' | 'DENEGADO' | 'SOLICITADO'
  fechaInicio: string
  fechaFin: string
  horaInicio?: string
  horaFin?: string
  totalDias?: number
  tipoPermiso?: string
  comentario?: string
}

interface CalendarioData {
  eventos: Evento[]
  resumenEmpleados: Record<string, { vacaciones: number; permisos: number; bajas: number }>
  total: number
  ultimaSincronizacion: string | null
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const TIPO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  VACACIONES: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  PERMISO: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  BAJA: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
}

const ESTADO_BADGE: Record<string, string> = {
  APROBADO: 'bg-green-100 text-green-700',
  SOLICITADO: 'bg-yellow-100 text-yellow-700',
  PENDIENTE: 'bg-gray-100 text-gray-600',
  DENEGADO: 'bg-red-100 text-red-700',
}

export default function CalendarioPersonalPage() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [data, setData] = useState<CalendarioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/calendario?year=${year}&month=${month}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Error cargando calendario:', err)
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/calendario/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' })
      })
      const json = await res.json()
      if (res.ok) {
        setSyncResult({ ok: true, message: json.message || 'Sincronización completada' })
        fetchData()
      } else {
        setSyncResult({ ok: false, message: json.error || 'Error al sincronizar' })
      }
    } catch (err) {
      setSyncResult({ ok: false, message: 'Error de conexión' })
    }
    setSyncing(false)
  }

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Generar días del mes para el calendario
  const getDaysInMonth = () => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const daysInMonth = lastDay.getDate()
    // Lunes = 0, Domingo = 6
    let startDay = firstDay.getDay() - 1
    if (startDay < 0) startDay = 6

    const days: (number | null)[] = []
    for (let i = 0; i < startDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  }

  // Obtener eventos para un día específico
  const getEventsForDay = (day: number): Evento[] => {
    if (!data?.eventos) return []
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return data.eventos.filter(e => {
      const start = e.fechaInicio.split('T')[0]
      const end = e.fechaFin.split('T')[0]
      return dateStr >= start && dateStr <= end
    })
  }

  const days = getDaysInMonth()
  const selectedDayEvents = selectedDay ? getEventsForDay(parseInt(selectedDay)) : []

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/empleados" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendario Personal</h1>
            <p className="text-sm text-gray-500">Vacaciones, permisos y bajas — Sincronizado con HRLog</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data?.ultimaSincronizacion && (
            <span className="text-xs text-gray-400">
              Última sync: {new Date(data.ultimaSincronizacion).toLocaleString('es-ES')}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar HRLog'}
          </button>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`mb-4 p-3 rounded-lg ${syncResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {syncResult.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendario */}
        <div className="lg:col-span-3">
          {/* Navegación del mes */}
          <div className="flex items-center justify-between mb-4 bg-white rounded-lg p-4 shadow-sm border">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {MESES[month - 1]} {year}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Grid del calendario */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {/* Cabecera días de la semana */}
            <div className="grid grid-cols-7 border-b">
              {DIAS_SEMANA.map(dia => (
                <div key={dia} className="p-2 text-center text-xs font-medium text-gray-500 bg-gray-50">
                  {dia}
                </div>
              ))}
            </div>

            {/* Días */}
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const events = day ? getEventsForDay(day) : []
                const isToday = day === new Date().getDate() && month === new Date().getMonth() + 1 && year === new Date().getFullYear()
                const isSelected = selectedDay === String(day)
                
                return (
                  <div
                    key={idx}
                    onClick={() => day && setSelectedDay(String(day))}
                    className={`min-h-[80px] p-1 border-b border-r cursor-pointer transition-colors
                      ${!day ? 'bg-gray-50' : 'hover:bg-blue-50'}
                      ${isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''}
                    `}
                  >
                    {day && (
                      <>
                        <span className={`text-xs font-medium ${isToday ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : 'text-gray-700'}`}>
                          {day}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {events.slice(0, 3).map((ev, i) => (
                            <div key={i} className={`text-[10px] px-1 py-0.5 rounded truncate ${TIPO_COLORS[ev.tipo]?.bg} ${TIPO_COLORS[ev.tipo]?.text}`}>
                              {ev.empleadoNombre.split(' ')[0]}
                            </div>
                          ))}
                          {events.length > 3 && (
                            <div className="text-[10px] text-gray-400">+{events.length - 3} más</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs text-gray-600">Vacaciones</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-xs text-gray-600">Permisos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs text-gray-600">Bajas</span>
            </div>
          </div>
        </div>

        {/* Panel lateral */}
        <div className="space-y-4">
          {/* Detalle del día seleccionado */}
          {selectedDay && (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                {parseInt(selectedDay)} de {MESES[month - 1]}
              </h3>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-gray-400">Sin eventos</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map((ev, i) => (
                    <div key={i} className={`p-2 rounded-lg ${TIPO_COLORS[ev.tipo]?.bg}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${TIPO_COLORS[ev.tipo]?.text}`}>
                          {ev.empleadoNombre}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ESTADO_BADGE[ev.estado]}`}>
                          {ev.estado}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {ev.tipo === 'PERMISO' && ev.tipoPermiso && <div>{ev.tipoPermiso}</div>}
                        {ev.horaInicio && ev.horaFin && <div>{ev.horaInicio} - {ev.horaFin}</div>}
                        {ev.comentario && <div className="italic mt-0.5">{ev.comentario}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resumen por empleado */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
              Resumen {MESES[month - 1]}
            </h3>
            {loading ? (
              <p className="text-sm text-gray-400">Cargando...</p>
            ) : data && Object.keys(data.resumenEmpleados).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(data.resumenEmpleados).map(([nombre, res]) => (
                  <div key={nombre} className="text-sm">
                    <div className="font-medium text-gray-700">{nombre}</div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      {res.vacaciones > 0 && <span className="text-blue-600">{res.vacaciones}d vac</span>}
                      {res.permisos > 0 && <span className="text-amber-600">{res.permisos} perm</span>}
                      {res.bajas > 0 && <span className="text-red-600">{res.bajas}d baja</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin eventos este mes</p>
            )}
          </div>

          {/* Lista de eventos del mes */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Eventos del mes</h3>
            {loading ? (
              <p className="text-sm text-gray-400">Cargando...</p>
            ) : data && data.eventos.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {data.eventos.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TIPO_COLORS[ev.tipo]?.dot}`}></div>
                    <div>
                      <div className="font-medium text-gray-700">{ev.empleadoNombre}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(ev.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {ev.fechaInicio !== ev.fechaFin && ` - ${new Date(ev.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}
                        {ev.horaInicio && ` · ${ev.horaInicio}-${ev.horaFin}`}
                      </div>
                      {ev.tipoPermiso && <div className="text-xs text-gray-400">{ev.tipoPermiso}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin eventos</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
