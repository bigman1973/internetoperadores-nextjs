"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string | null;
  datos: any;
  estado: string;
  prioridad: string;
  notas: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  nuevos: number;
  enProceso: number;
  presupuestoEnviado: number;
  ganados: number;
  perdidos: number;
  conOferta: number;
  sinOferta: number;
  porTipo: {
    FARMACIA: number;
    HORECA: number;
    PYME: number;
    MEDIANA_GRANDE: number;
  };
}

const TIPOS_NEGOCIO = [
  { value: '', label: 'Todos los tipos' },
  { value: 'FARMACIA', label: 'Farmacia / Centro médico' },
  { value: 'HORECA', label: 'HORECA' },
  { value: 'PYME', label: 'PYME' },
  { value: 'MEDIANA_GRANDE', label: 'Mediana / Grande' },
];

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'NUEVO', label: 'Nuevo' },
  { value: 'EN_PROCESO', label: 'En proceso' },
  { value: 'PRESUPUESTO_ENVIADO', label: 'Presupuesto enviado' },
  { value: 'PROPUESTA_PREACEPTADA', label: 'Propuesta pre-aceptada' },
  { value: 'REUNION_AGENDADA', label: 'Reunión agendada' },
  { value: 'GANADO', label: 'Ganado' },
  { value: 'CERRADO_GANADO', label: 'Cerrado (ganado)' },
  { value: 'PERDIDO', label: 'Perdido' },
  { value: 'CERRADO_PERDIDO', label: 'Cerrado (perdido)' },
  { value: 'DESCARTADO', label: 'Descartado' },
];

const OFERTA_FILTER = [
  { value: '', label: 'Todas' },
  { value: 'si', label: 'Con oferta' },
  { value: 'no', label: 'Sin oferta' },
];

const estadoColors: Record<string, string> = {
  NUEVO: 'bg-blue-100 text-blue-800',
  EN_PROCESO: 'bg-yellow-100 text-yellow-800',
  PRESUPUESTO_ENVIADO: 'bg-purple-100 text-purple-800',
  PROPUESTA_PREACEPTADA: 'bg-emerald-100 text-emerald-800',
  REUNION_AGENDADA: 'bg-indigo-100 text-indigo-800',
  GANADO: 'bg-green-100 text-green-800',
  CERRADO_GANADO: 'bg-green-100 text-green-800',
  PERDIDO: 'bg-red-100 text-red-800',
  CERRADO_PERDIDO: 'bg-red-100 text-red-800',
  DESCARTADO: 'bg-gray-100 text-gray-800',
  CONTACTADO: 'bg-teal-100 text-teal-800',
};

const tipoNegocioColors: Record<string, string> = {
  FARMACIA: 'bg-emerald-100 text-emerald-800',
  HORECA: 'bg-amber-100 text-amber-800',
  PYME: 'bg-sky-100 text-sky-800',
  MEDIANA_GRANDE: 'bg-violet-100 text-violet-800',
};

const tipoNegocioLabels: Record<string, string> = {
  FARMACIA: 'Farmacia',
  HORECA: 'HORECA',
  PYME: 'PYME',
  MEDIANA_GRANDE: 'Med/Grande',
};

const prioridadIcons: Record<string, string> = {
  URGENTE: '🔴',
  ALTA: '🟠',
  MEDIA: '🟡',
  BAJA: '⚪',
};

export default function LeadsMantenimientoPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroOferta, setFiltroOferta] = useState('');
  const [buscar, setBuscar] = useState('');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo) params.set('tipoNegocio', filtroTipo);
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroOferta) params.set('conOferta', filtroOferta);
      if (buscar) params.set('buscar', buscar);

      const res = await fetch(`/api/admin/leads-mantenimiento?${params.toString()}`);
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setLeads(data.leads);
      setStats(data.stats);
    } catch {
      console.error('Error cargando leads');
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, filtroEstado, filtroOferta, buscar]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const tiempoDesde = (fecha: string) => {
    const diff = Date.now() - new Date(fecha).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const horas = Math.floor(mins / 60);
    if (horas < 24) return `hace ${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `hace ${dias}d`;
    return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads Mantenimiento IT</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de solicitudes de servicios IT gestionados</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLeads}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Dashboard métricas */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">Total</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{stats.nuevos}</p>
            <p className="text-xs text-blue-600 mt-1">Nuevos</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">{stats.enProceso}</p>
            <p className="text-xs text-yellow-600 mt-1">En proceso</p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-700">{stats.presupuestoEnviado}</p>
            <p className="text-xs text-purple-600 mt-1">Presupuesto</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.ganados}</p>
            <p className="text-xs text-green-600 mt-1">Ganados</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{stats.perdidos}</p>
            <p className="text-xs text-red-600 mt-1">Perdidos</p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 text-center">
            <p className="text-2xl font-bold text-orange-700">{stats.conOferta}</p>
            <p className="text-xs text-orange-600 mt-1">Con oferta</p>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{stats.sinOferta}</p>
            <p className="text-xs text-gray-500 mt-1">Sin oferta</p>
          </div>
        </div>
      )}

      {/* Distribución por tipo de negocio */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setFiltroTipo(filtroTipo === 'FARMACIA' ? '' : 'FARMACIA')}
            className={`rounded-xl border p-3 text-center transition-all ${filtroTipo === 'FARMACIA' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-200 bg-white hover:border-emerald-300'}`}
          >
            <p className="text-lg font-bold text-emerald-700">{stats.porTipo.FARMACIA}</p>
            <p className="text-xs text-gray-600">Farmacia</p>
          </button>
          <button
            onClick={() => setFiltroTipo(filtroTipo === 'HORECA' ? '' : 'HORECA')}
            className={`rounded-xl border p-3 text-center transition-all ${filtroTipo === 'HORECA' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-200 bg-white hover:border-amber-300'}`}
          >
            <p className="text-lg font-bold text-amber-700">{stats.porTipo.HORECA}</p>
            <p className="text-xs text-gray-600">HORECA</p>
          </button>
          <button
            onClick={() => setFiltroTipo(filtroTipo === 'PYME' ? '' : 'PYME')}
            className={`rounded-xl border p-3 text-center transition-all ${filtroTipo === 'PYME' ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-200' : 'border-gray-200 bg-white hover:border-sky-300'}`}
          >
            <p className="text-lg font-bold text-sky-700">{stats.porTipo.PYME}</p>
            <p className="text-xs text-gray-600">PYME</p>
          </button>
          <button
            onClick={() => setFiltroTipo(filtroTipo === 'MEDIANA_GRANDE' ? '' : 'MEDIANA_GRANDE')}
            className={`rounded-xl border p-3 text-center transition-all ${filtroTipo === 'MEDIANA_GRANDE' ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200' : 'border-gray-200 bg-white hover:border-violet-300'}`}
          >
            <p className="text-lg font-bold text-violet-700">{stats.porTipo.MEDIANA_GRANDE}</p>
            <p className="text-xs text-gray-600">Med/Grande</p>
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <input
              type="text"
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              placeholder="Nombre, empresa, email..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de negocio</label>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            >
              {TIPOS_NEGOCIO.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            >
              {ESTADOS.map(e => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Oferta</label>
            <select
              value={filtroOferta}
              onChange={e => setFiltroOferta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            >
              {OFERTA_FILTER.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de leads */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
            ))}
          </div>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="mt-4 text-gray-500 text-sm">No hay leads de mantenimiento IT con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Empresa / Contacto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Oferta</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Equipos</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => {
                  const datos = lead.datos || {};
                  const tipoNeg = datos.tipoNegocio || '';
                  const tieneOferta = !!datos.ofertaGenerada;
                  const ofertaTipo = datos.ofertaGenerada?.tipo;

                  return (
                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{lead.empresa}</p>
                          <p className="text-xs text-gray-500">{lead.nombre} — {lead.email}</p>
                          {lead.telefono && <p className="text-xs text-gray-400">{lead.telefono}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {tipoNeg && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tipoNegocioColors[tipoNeg] || 'bg-gray-100 text-gray-700'}`}>
                            {tipoNegocioLabels[tipoNeg] || tipoNeg}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoColors[lead.estado] || 'bg-gray-100 text-gray-700'}`}>
                          {lead.estado.replace(/_/g, ' ')}
                        </span>
                        {lead.prioridad && lead.prioridad !== 'MEDIA' && (
                          <span className="ml-1 text-xs">{prioridadIcons[lead.prioridad] || ''}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tieneOferta ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            {ofertaTipo === 'PROPUESTA_MEDIDA' ? 'A medida' : 'Automática'}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{datos.numEquipos || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{tiempoDesde(lead.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/leads-mantenimiento/${lead.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-100 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          Gestionar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
            Mostrando {leads.length} lead{leads.length !== 1 ? 's' : ''} de mantenimiento IT
          </div>
        </div>
      )}
    </div>
  );
}
