'use client'

import { ShieldCheckIcon } from '@heroicons/react/24/outline'

export default function DraxtonContratoGuardiasPage() {
  return (
    <div className="space-y-6">
      {/* Descripción */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="w-6 h-6 text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Contrato de Guardias</h2>
            <p className="text-sm text-gray-500">Contrato específico de guardias, condiciones, turnos y gestión asociada</p>
          </div>
        </div>
      </div>

      {/* Info del contrato */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Datos del Contrato</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="text-gray-400">Sin configurar</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Fecha Inicio</span>
              <span className="text-gray-400">—</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Fecha Fin</span>
              <span className="text-gray-400">—</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Importe Mensual</span>
              <span className="text-gray-400">—</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Horario Cobertura</span>
              <span className="text-gray-400">—</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Documentación</h3>
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <ShieldCheckIcon className="w-12 h-12 mb-2 text-gray-300" />
            <p className="text-sm">No hay documentos adjuntos</p>
            <p className="text-xs mt-1">Sube el contrato de guardias y anexos</p>
          </div>
        </div>
      </div>

      {/* Turnos de guardia */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Turnos de Guardia</h3>
        </div>
        <div className="px-4 py-12 text-center text-gray-400 text-sm">
          Los turnos de guardia se configurarán próximamente.
        </div>
      </div>
    </div>
  )
}
