'use client'

import { RocketLaunchIcon } from '@heroicons/react/24/outline'

export default function ProyectosInternosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Proyectos Internos</h1>
        <p className="text-sm text-gray-500 mt-1">Proyectos de desarrollo, mejoras internas y evoluciones del negocio</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <RocketLaunchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Proximamente</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Aqui podras gestionar los proyectos internos de la empresa: desarrollos tecnologicos, 
          mejoras de procesos, evoluciones de infraestructura y cualquier iniciativa que no este 
          vinculada directamente a un cliente.
        </p>
      </div>
    </div>
  )
}
