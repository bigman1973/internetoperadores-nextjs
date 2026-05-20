'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  nombreEmpresa: string;
  contacto: string;
  email: string;
  telefono: string | null;
  urlWeb: string | null;
  sector: string | null;
  estado: string;
  prioridad: string;
  presupuesto: string | null;
  plazo: string | null;
  createdAt: string;
  cuestionario: { id: string; token: string; estado: string } | null;
}

interface Stats {
  estado: string;
  _count: { id: number };
}

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'NUEVO', label: 'Nuevo' },
  { value: 'CONTACTADO', label: 'Contactado' },
  { value: 'CUESTIONARIO_ENVIADO', label: 'Cuestionario enviado' },
  { value: 'CUESTIONARIO_COMPLETADO', label: 'Cuestionario completado' },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada' },
  { value: 'CERRADO_GANADO', label: 'Cerrado (ganado)' },
  { value: 'CERRADO_PERDIDO', label: 'Cerrado (perdido)' },
];

const PRIORIDADES = [
  { value: '', label: 'Todas' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'BAJA', label: 'Baja' },
];

const SECTORES = [
  { value: '', label: 'Todos' },
  { value: 'seguros', label: 'Seguros' },
  { value: 'construccion', label: 'Construcción' },
  { value: 'hosteleria', label: 'Hostelería' },
  { value: 'despachos', label: 'Despachos' },
  { value: 'comercio', label: 'Comercio' },
  { value: 'salud', label: 'Salud' },
  { value: 'industria', label: 'Industria' },
  { value: 'otro', label: 'Otro' },
];

const estadoColor: Record<string, string> = {
  NUEVO: 'bg-blue-100 text-blue-800',
  CONTACTADO: 'bg-yellow-100 text-yellow-800',
  CUESTIONARIO_ENVIADO: 'bg-purple-100 text-purple-800',
  CUESTIONARIO_COMPLETADO: 'bg-green-100 text-green-800',
  PROPUESTA_ENVIADA: 'bg-orange-100 text-orange-800',
  CERRADO_GANADO: 'bg-emerald-100 text-emerald-800',
  CERRADO_PERDIDO: 'bg-red-100 text-red-800',
};

const prioridadColor: Record<string, string> = {
  ALTA: 'bg-red-100 text-red-700',
  MEDIA: 'bg-yellow-100 text-yellow-700',
  BAJA: 'bg-gray-100 text-gray-700',
};

export default function LeadsPageClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroSector, setFiltroSector] = useState('');
  const [buscar, setBuscar] = useState('');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroEstado) params.set('estado', filtroEstado);
    if (filtroPrioridad) params.set('prioridad', filtroPrioridad);
    if (filtroSector) params.set('sector', filtroSector);
    if (buscar) params.set('buscar', buscar);

    try {
      const res = await fetch(`/api/admin/leads?${params.toString()}`);
      const data = await res.json();
      setLeads(data.leads || []);
      setStats(data.stats || []);
    } catch (error) {
      console.error('Error cargando leads:', error);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroPrioridad, filtroSector, buscar]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const totalLeads = stats.reduce((sum, s) => sum + s._count.id, 0);
  const nuevos = stats.find(s => s.estado === 'NUEVO')?._count.id || 0;
  const enProceso = stats.filter(s => !['NUEVO', 'CERRADO_GANADO', 'CERRADO_PERDIDO'].includes(s.estado))
    .reduce((sum, s) => sum + s._count.id, 0);
  const cerrados = stats.filter(s => s.estado === 'CERRADO_GANADO').reduce((sum, s) => sum + s._count.id, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads Migración Web</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de solicitudes del formulario de migración web</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total leads</p>
          <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Nuevos</p>
          <p className="text-2xl font-bold text-blue-600">{nuevos}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">En proceso</p>
          <p className="text-2xl font-bold text-orange-600">{enProceso}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Cerrados (ganados)</p>
          <p className="text-2xl font-bold text-emerald-600">{cerrados}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Empresa, contacto, email..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prioridad</label>
            <select
              value={filtroPrioridad}
              onChange={(e) => setFiltroPrioridad(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sector</label>
            <select
              value={filtroSector}
              onChange={(e) => setFiltroSector(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {SECTORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de leads */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando leads...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-lg mb-2">No hay leads todavía</p>
            <p className="text-sm">Los leads aparecerán aquí cuando alguien complete el formulario de migración web</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sector</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Prioridad</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cuestionario</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.nombreEmpresa}</div>
                      {lead.urlWeb && (
                        <a href={lead.urlWeb} target="_blank" rel="noopener" className="text-xs text-orange-600 hover:underline">
                          {lead.urlWeb}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{lead.contacto}</div>
                      <div className="text-xs text-gray-500">{lead.email}</div>
                      {lead.telefono && <div className="text-xs text-gray-500">{lead.telefono}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-gray-700">{lead.sector || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[lead.estado] || 'bg-gray-100 text-gray-700'}`}>
                        {ESTADOS.find(e => e.value === lead.estado)?.label || lead.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${prioridadColor[lead.prioridad] || 'bg-gray-100 text-gray-700'}`}>
                        {lead.prioridad}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.cuestionario ? (
                        <span className={`text-xs ${lead.cuestionario.estado === 'COMPLETADO' ? 'text-green-600' : 'text-purple-600'}`}>
                          {lead.cuestionario.estado === 'COMPLETADO' ? '✅ Completado' : '📨 Enviado'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Sin crear</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="text-orange-600 hover:text-orange-700 text-sm font-medium"
                      >
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
