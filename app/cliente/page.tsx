"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  cliente: {
    nombre: string;
    nombreComercial: string | null;
    codigo: string | null;
    email: string;
    fechaAlta: string | null;
  };
  kpis: {
    serviciosActivos: number;
    facturacionMensual: number;
    facturasPendientes: number;
    totalPendiente: number;
  };
  ultimasFacturas: Array<{
    id: number;
    documento: string | null;
    fecha: string;
    total: number;
    situacion: string;
    totalPendiente: number;
  }>;
  serviciosResumen: Array<{
    id: number;
    titulo: string;
    tarifa: string;
    precio: number;
  }>;
}

interface AltaCliente {
  id: string;
  tarifaNombre: string;
  estado: string;
  createdAt: string;
  token: string;
}

export default function ClienteDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [altas, setAltas] = useState<AltaCliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/cliente/dashboard').then(r => r.ok ? r.json() : null),
      fetch('/api/cliente/altas').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([dashData, altasData]) => {
      setData(dashData);
      setAltas(altasData || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Error al cargar los datos del panel.</div>;
  }

  const estadoLabel = (estado: string) => {
    const map: Record<string, { text: string; color: string }> = {
      'ESPERANDO_DOCUMENTACION': { text: 'Pendiente documentación', color: 'bg-yellow-100 text-yellow-800' },
      'DOCUMENTACION_COMPLETA': { text: 'Documentación enviada', color: 'bg-blue-100 text-blue-800' },
      'EN_REVISION': { text: 'En revisión', color: 'bg-purple-100 text-purple-800' },
      'APROBADA': { text: 'Aprobada', color: 'bg-green-100 text-green-800' },
      'RECHAZADA': { text: 'Rechazada', color: 'bg-red-100 text-red-800' },
      'SERVICIO_ACTIVO': { text: 'Activo', color: 'bg-green-100 text-green-800' },
    };
    return map[estado] || { text: estado, color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {data.cliente.nombreComercial || data.cliente.nombre}
        </h1>
        <p className="text-gray-500 mt-1">
          Bienvenido a tu panel de cliente. Aquí puedes gestionar tus servicios y facturación.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Servicios activos</p>
              <p className="text-2xl font-bold text-gray-900">{data.kpis.serviciosActivos}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Cuota mensual</p>
              <p className="text-2xl font-bold text-gray-900">{data.kpis.facturacionMensual.toFixed(2)} €</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Facturas pendientes</p>
              <p className="text-2xl font-bold text-gray-900">{data.kpis.facturasPendientes}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Importe pendiente</p>
              <p className="text-2xl font-bold text-gray-900">{data.kpis.totalPendiente.toFixed(2)} €</p>
            </div>
          </div>
        </div>
      </div>

      {/* Altas en curso */}
      {altas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Altas en curso</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {altas.map(alta => {
              const estado = estadoLabel(alta.estado);
              return (
                <div key={alta.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{alta.tarifaNombre}</p>
                    <p className="text-xs text-gray-500">
                      Solicitada el {new Date(alta.createdAt).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estado.color}`}>
                      {estado.text}
                    </span>
                    {alta.estado === 'ESPERANDO_DOCUMENTACION' && (
                      <a
                        href={`/alta-servicio/documentacion?token=${alta.token}`}
                        className="text-xs text-orange-600 font-medium hover:underline"
                      >
                        Subir docs
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Servicios activos */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Servicios activos</h2>
            <Link href="/cliente/servicios" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {data.serviciosResumen.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">No hay servicios activos</p>
            ) : (
              data.serviciosResumen.map(s => (
                <div key={s.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.titulo}</p>
                    <p className="text-xs text-gray-500">{s.tarifa}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{s.precio.toFixed(2)} €/mes</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Últimas facturas */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Últimas facturas</h2>
            <Link href="/cliente/facturacion" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
              Ver todas
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {data.ultimasFacturas.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">No hay facturas disponibles</p>
            ) : (
              data.ultimasFacturas.map(f => (
                <div key={f.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{f.documento || 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{new Date(f.fecha).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{f.total.toFixed(2)} €</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      f.situacion === 'COBRADA' 
                        ? 'bg-green-50 text-green-700' 
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {f.situacion === 'COBRADA' ? 'Pagada' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
