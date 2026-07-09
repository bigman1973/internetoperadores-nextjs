'use client'

import { UserGroupIcon, PlusIcon } from '@heroicons/react/24/outline'

export default function DraxtonPersonalPage() {
  return (
    <div className="space-y-6">
      {/* Descripción */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserGroupIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Personal Asignado</h2>
              <p className="text-sm text-gray-500">Personas de Internet Operadores asignadas a los contratos de Draxton</p>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            <PlusIcon className="w-4 h-4" />
            Asignar Persona
          </button>
        </div>
      </div>

      {/* Tabla de personal */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Equipo Asignado</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empleado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contrato Asignado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Dedicación</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Coste/Hora</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No hay personal asignado. Haz clic en &quot;Asignar Persona&quot; para vincular empleados.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
