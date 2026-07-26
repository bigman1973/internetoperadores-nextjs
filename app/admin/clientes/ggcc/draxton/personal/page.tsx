'use client'

import { useState, useEffect } from 'react'
import { UserGroupIcon } from '@heroicons/react/24/outline'

interface Asignacion {
  id: string
  contratoDraxtonId: string
  contrato: {
    id: string
    titulo: string
    tipo: string
  }
  empleadoId: string
  empleado: {
    id: string
    nombreCompleto: string
    categoria: string | null
    departamento: string | null
    estado: string | null
  }
  porcentajeDedicacion: number
  nivelTecnico: number | null
  rol: string | null
  funciones: string | null
  fechaInicio: string | null
  fechaFin: string | null
  activo: boolean
  notas: string | null
}

interface ContratoGroup {
  contratoId: string
  titulo: string
  tipo: string
  asignaciones: Asignacion[]
}

const HORAS_NETAS_MES = 128.67

function calcularHorasImputadas(porcentaje: number, nivel: number | null): number {
  const multiplicador = nivel || 1
  return HORAS_NETAS_MES * (porcentaje / 100) * multiplicador
}

function getNivelLabel(nivel: number | null): string {
  if (!nivel) return '—'
  return `N${nivel} (×${nivel})`
}

function getNivelColor(nivel: number | null): string {
  switch (nivel) {
    case 1: return 'bg-blue-100 text-blue-700'
    case 2: return 'bg-orange-100 text-orange-700'
    case 3: return 'bg-purple-100 text-purple-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export default function DraxtonPersonalPage() {
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPersonal()
  }, [])

  const fetchPersonal = async () => {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/personal-contrato')
      if (res.ok) {
        const data = await res.json()
        setAsignaciones(data.asignaciones || [])
      }
    } catch (error) {
      console.error('Error cargando personal:', error)
    } finally {
      setLoading(false)
    }
  }

  // Agrupar por contrato
  const contratoGroups: ContratoGroup[] = []
  const contratoMap = new Map<string, ContratoGroup>()

  asignaciones.forEach(a => {
    if (!a.activo) return
    const key = a.contratoDraxtonId
    if (!contratoMap.has(key)) {
      const group: ContratoGroup = {
        contratoId: key,
        titulo: a.contrato.titulo,
        tipo: a.contrato.tipo,
        asignaciones: [],
      }
      contratoMap.set(key, group)
      contratoGroups.push(group)
    }
    contratoMap.get(key)!.asignaciones.push(a)
  })

  // Ordenar asignaciones dentro de cada contrato por nivel (mayor primero)
  contratoGroups.forEach(g => {
    g.asignaciones.sort((a, b) => (b.nivelTecnico || 0) - (a.nivelTecnico || 0))
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <UserGroupIcon className="w-6 h-6 text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Personal Asignado a Contratos</h2>
            <p className="text-sm text-gray-500">
              Relación de personas de IO asignadas a cada contrato de Draxton — Nivel técnico y horas equivalentes imputadas
            </p>
          </div>
        </div>
      </div>

      {/* Sin datos */}
      {contratoGroups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400">No hay personal asignado a contratos activos.</p>
        </div>
      )}

      {/* Tabla por contrato */}
      {contratoGroups.map(group => {
        const totalHoras = group.asignaciones.reduce(
          (sum, a) => sum + calcularHorasImputadas(a.porcentajeDedicacion, a.nivelTecnico),
          0
        )
        return (
          <div key={group.contratoId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Cabecera del contrato */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{group.titulo}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{group.tipo}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500">Total horas equiv./mes</span>
                  <p className="text-lg font-bold text-indigo-600">{totalHoras.toFixed(1)} h</p>
                </div>
              </div>
            </div>

            {/* Tabla de personal */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Persona</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Nivel</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Dedicación</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Horas equiv./mes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.asignaciones.map(a => {
                    const horasImputadas = calcularHorasImputadas(a.porcentajeDedicacion, a.nivelTecnico)
                    const isBaja = a.fechaFin && new Date(a.fechaFin) <= new Date()
                    return (
                      <tr key={a.id} className={isBaja ? 'opacity-50 bg-red-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{a.empleado.nombreCompleto}</div>
                          {a.rol && <div className="text-xs text-gray-500">{a.rol}</div>}
                          {isBaja && <span className="text-xs text-red-600 font-medium">Baja</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getNivelColor(a.nivelTecnico)}`}>
                            {getNivelLabel(a.nivelTecnico)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-gray-700">
                          {a.porcentajeDedicacion}%
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {horasImputadas.toFixed(1)} h
                        </td>
                      </tr>
                    )
                  })}
                  {/* Fila total */}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-4 py-3 font-semibold text-gray-700" colSpan={3}>
                      Total Contrato
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">
                      {totalHoras.toFixed(1)} h
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Leyenda */}
      {contratoGroups.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2 font-medium">Leyenda de niveles:</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>
              N1 (×1) — Soporte básico
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300"></span>
              N2 (×2) — Advanced Support
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-purple-100 border border-purple-300"></span>
              N3 (×3) — Gestión / Especialista
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Horas equiv./mes = 128,67h × %dedicación × multiplicador nivel. Base: 1.720h/año netas (descontando vacaciones).
          </p>
        </div>
      )}
    </div>
  )
}
