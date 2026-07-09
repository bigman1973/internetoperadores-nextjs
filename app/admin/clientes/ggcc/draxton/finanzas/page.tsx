'use client'

import { useState } from 'react'
import { BanknotesIcon, PlusIcon } from '@heroicons/react/24/outline'

export default function DraxtonFinanzasPage() {
  return (
    <div className="space-y-6">
      {/* Descripción */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BanknotesIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Facturación y Cobros</h2>
              <p className="text-sm text-gray-500">Control de facturación emitida a Draxton y seguimiento de cobros</p>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            <PlusIcon className="w-4 h-4" />
            Nueva Factura
          </button>
        </div>
      </div>

      {/* KPIs placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Facturado Total</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">0,00 €</div>
          <div className="text-xs text-gray-400 mt-1">2026</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Cobrado</div>
          <div className="text-2xl font-bold text-green-700 mt-1">0,00 €</div>
          <div className="text-xs text-gray-400 mt-1">2026</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Pendiente Cobro</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">0,00 €</div>
          <div className="text-xs text-gray-400 mt-1">2026</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Facturas Emitidas</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">0</div>
          <div className="text-xs text-gray-400 mt-1">2026</div>
        </div>
      </div>

      {/* Tabla de facturas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Facturas Emitidas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">N.º Factura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Importe</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No hay facturas registradas. Haz clic en &quot;Nueva Factura&quot; para añadir la primera.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
