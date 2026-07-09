'use client'

import { ChartBarSquareIcon } from '@heroicons/react/24/outline'

export default function DraxtonKPIsPage() {
  return (
    <div className="space-y-6">
      {/* Descripción */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <ChartBarSquareIcon className="w-6 h-6 text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">KPIs de Contratos</h2>
            <p className="text-sm text-gray-500">Medición de resultados y rendimiento de los contratos con Draxton</p>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Disponibilidad de Servicio</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-green-700">—</span>
            <span className="text-sm text-gray-400 mb-1">% uptime</span>
          </div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-green-500 rounded-full" style={{ width: '0%' }}></div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Objetivo: 99.9%</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tiempo Medio Resolución</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-indigo-700">—</span>
            <span className="text-sm text-gray-400 mb-1">horas</span>
          </div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-indigo-500 rounded-full" style={{ width: '0%' }}></div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Objetivo: &lt; 4h</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Satisfacción Cliente</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-amber-700">—</span>
            <span className="text-sm text-gray-400 mb-1">/ 10</span>
          </div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-amber-500 rounded-full" style={{ width: '0%' }}></div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Objetivo: &gt; 8.5</p>
        </div>
      </div>

      {/* Tabla de métricas mensuales */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Evolución Mensual</h3>
        </div>
        <div className="px-4 py-12 text-center text-gray-400 text-sm">
          Los KPIs se calcularán automáticamente a partir de los datos de seguimiento e incidencias.
        </div>
      </div>
    </div>
  )
}
