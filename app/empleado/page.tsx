'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ReceiptPercentIcon, ClockIcon, DocumentTextIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useImpersonation } from '@/components/empleado/ImpersonationContext';
import EmployeeTimesheetSummary from '@/components/imputaciones/EmployeeTimesheetSummary';
import type { ResumenPersonalImputaciones } from '@/lib/imputaciones-diarias';

interface Alerta {
  tipo: string;
  nivel: string;
  titulo: string;
  descripcion: string;
  proyectos?: any[];
  diasSinImputar?: number;
}

export default function EmpleadoPage() {
  const { data: session } = useSession();
  const { impersonatedEmail, impersonatedEmpleado, getQueryParam, isReady } = useImpersonation();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [resumenImputaciones, setResumenImputaciones] = useState<ResumenPersonalImputaciones | null>(null);
  const [loadingAlertas, setLoadingAlertas] = useState(true);

  useEffect(() => {
    async function fetchAlertas() {
      if (!isReady) return;
      try {
        setLoadingAlertas(true);
        const query = getQueryParam();
        const res = await fetch(`/api/empleado/alertas${query ? `?${query}` : ''}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setAlertas(data.alertas || []);
          setResumenImputaciones(data.resumenImputaciones || null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingAlertas(false);
      }
    }
    fetchAlertas();
  }, [impersonatedEmail, getQueryParam, isReady]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {impersonatedEmpleado?.nombreCompleto || session?.user?.name || 'Empleado'}
        </h1>
        <p className="text-gray-500 mt-1">Portal de empleado de Internet Operadores</p>
      </div>

      {!loadingAlertas && resumenImputaciones && <EmployeeTimesheetSummary summary={resumenImputaciones} />}

      {/* Otras alertas */}
      {!loadingAlertas && alertas.filter(alerta => !alerta.tipo.startsWith('horas_sin_imputar')).length > 0 && (
        <div className="mb-6 space-y-3">
          {alertas.filter(alerta => !alerta.tipo.startsWith('horas_sin_imputar')).map((alerta, i) => (
            <div
              key={i}
              className={`rounded-xl border p-4 ${
                alerta.nivel === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon
                  className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                    alerta.nivel === 'error' ? 'text-red-500' : 'text-amber-500'
                  }`}
                />
                <div className="flex-1">
                  <p className={`font-medium ${alerta.nivel === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
                    {alerta.titulo}
                  </p>
                  <p className={`text-sm mt-0.5 ${alerta.nivel === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                    {alerta.descripcion}
                  </p>
                  {alerta.tipo === 'proyectos_pendientes' && alerta.proyectos && (
                    <div className="mt-2 space-y-1">
                      {alerta.proyectos.map((p: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 text-sm">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${p.proyecto.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {p.proyecto.tipo === 'cliente' ? 'Cliente' : 'Interno'}
                          </span>
                          <span className="text-gray-700">{p.proyecto.nombre}</span>
                          <span className="text-amber-700 font-medium">{p.horasPendientes}h pendientes</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  href="/empleado/imputaciones"
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    alerta.nivel === 'error'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  Imputar ahora
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accesos rapidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/empleado/imputaciones"
          className="flex items-center gap-4 p-6 bg-white rounded-xl border hover:border-orange-200 hover:shadow-sm transition-all"
        >
          <div className="p-3 bg-blue-50 rounded-lg">
            <ClockIcon className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Imputar Horas</h2>
            <p className="text-sm text-gray-500">Registra tu tiempo de trabajo semanal</p>
          </div>
        </Link>

        <Link
          href="/empleado/gastos"
          className="flex items-center gap-4 p-6 bg-white rounded-xl border hover:border-orange-200 hover:shadow-sm transition-all"
        >
          <div className="p-3 bg-orange-50 rounded-lg">
            <ReceiptPercentIcon className="h-8 w-8 text-orange-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Tickets de Gasto</h2>
            <p className="text-sm text-gray-500">Sube tickets y gestiona tus gastos</p>
          </div>
        </Link>

        <Link
          href="/empleado/nominas"
          className="flex items-center gap-4 p-6 bg-white rounded-xl border hover:border-orange-200 hover:shadow-sm transition-all"
        >
          <div className="p-3 bg-green-50 rounded-lg">
            <DocumentTextIcon className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Mis Nominas</h2>
            <p className="text-sm text-gray-500">Consulta y descarga tus nominas</p>
          </div>
        </Link>

        <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-dashed">
          <div className="p-3 bg-gray-100 rounded-lg">
            <InformationCircleIcon className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-500">Mas secciones</h2>
            <p className="text-sm text-gray-400">Proximamente: vacaciones, formacion...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
