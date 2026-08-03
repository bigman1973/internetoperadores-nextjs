'use client';

import React from 'react';
import { useImpersonation } from './ImpersonationContext';
import { EyeIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function ImpersonationBanner() {
  const { impersonatedEmpleado, impersonatedEmail, setImpersonatedEmail, canImpersonate, empleados } = useImpersonation();

  if (!canImpersonate) return null;

  return (
    <div className="mb-4">
      {impersonatedEmail && impersonatedEmpleado ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-5 w-5 text-amber-600" />
            <span className="text-sm text-amber-800">
              Viendo como: <strong>{impersonatedEmpleado.nombreCompleto}</strong>
              <span className="text-amber-600 ml-1">({impersonatedEmpleado.email})</span>
            </span>
          </div>
          <button
            onClick={() => setImpersonatedEmail(null)}
            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded"
          >
            <XMarkIcon className="h-3 w-3" />
            Volver a mi vista
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3">
          <EyeIcon className="h-4 w-4 text-gray-500" />
          <select
            value=""
            onChange={(e) => setImpersonatedEmail(e.target.value || null)}
            className="text-sm border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer py-0"
          >
            <option value="">Ver como otro empleado...</option>
            {empleados.map(emp => (
              <option key={emp.id} value={emp.email || ''}>
                {emp.nombreCompleto} ({emp.email})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
