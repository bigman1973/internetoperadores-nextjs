'use client';

import { useState, useEffect, useCallback } from 'react';

interface LeadSolucion {
  id: string;
  tipo: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string | null;
  datos: Record<string, any>;
  estado: string;
  prioridad: string;
  notas: string | null;
  presupuestoUrl: string | null;
  createdAt: string;
}

interface Stats {
  estado: string;
  _count: { id: number };
}

interface StatsTipo {
  tipo: string;
  _count: { id: number };
}

const TIPOS_SOLUCION = [
  { value: '', label: 'Todas' },
  { value: 'EXAGRID', label: 'ExaGrid' },
  { value: 'INFRAESTRUCTURA_RED', label: 'Infraestructura de Red' },
  { value: 'MANTENIMIENTO_IT', label: 'Mantenimiento IT' },
  { value: 'MOVILES', label: 'Movilidad Empresarial' },
  { value: 'COMUNICACIONES_UNIFICADAS', label: 'Comunicaciones Unificadas' },
  { value: 'CONECTIVIDAD_AVANZADA', label: 'Conectividad Avanzada' },
];

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'NUEVO', label: 'Nuevo' },
  { value: 'CONTACTADO', label: 'Contactado' },
  { value: 'EN_PROCESO', label: 'En proceso' },
  { value: 'PRESUPUESTO_ENVIADO', label: 'Presupuesto enviado' },
  { value: 'CERRADO_GANADO', label: 'Cerrado (ganado)' },
  { value: 'CERRADO_PERDIDO', label: 'Cerrado (perdido)' },
  { value: 'DESCARTADO', label: 'Descartado' },
];

const PRIORIDADES = [
  { value: '', label: 'Todas' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'BAJA', label: 'Baja' },
];

const TIPO_LABELS: Record<string, string> = {
  EXAGRID: 'ExaGrid',
  INFRAESTRUCTURA_RED: 'Infraestructura',
  MANTENIMIENTO_IT: 'Mantenimiento IT',
  MOVILES: 'Movilidad',
  COMUNICACIONES_UNIFICADAS: 'UCaaS',
  CONECTIVIDAD_AVANZADA: 'Conectividad',
};

const TIPO_COLORS: Record<string, string> = {
  EXAGRID: 'bg-purple-100 text-purple-800',
  INFRAESTRUCTURA_RED: 'bg-blue-100 text-blue-800',
  MANTENIMIENTO_IT: 'bg-green-100 text-green-800',
  MOVILES: 'bg-yellow-100 text-yellow-800',
  COMUNICACIONES_UNIFICADAS: 'bg-indigo-100 text-indigo-800',
  CONECTIVIDAD_AVANZADA: 'bg-cyan-100 text-cyan-800',
};

const ESTADO_LABELS: Record<string, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  EN_PROCESO: 'En proceso',
  PRESUPUESTO_ENVIADO: 'Presupuesto enviado',
  CERRADO_GANADO: 'Cerrado (ganado)',
  CERRADO_PERDIDO: 'Cerrado (perdido)',
  DESCARTADO: 'Descartado',
};

const ESTADO_COLORS: Record<string, string> = {
  NUEVO: 'bg-blue-100 text-blue-800',
  CONTACTADO: 'bg-yellow-100 text-yellow-800',
  EN_PROCESO: 'bg-orange-100 text-orange-800',
  PRESUPUESTO_ENVIADO: 'bg-purple-100 text-purple-800',
  CERRADO_GANADO: 'bg-green-100 text-green-800',
  CERRADO_PERDIDO: 'bg-red-100 text-red-800',
  DESCARTADO: 'bg-gray-100 text-gray-800',
};

const PRIORIDAD_COLORS: Record<string, string> = {
  ALTA: 'bg-red-100 text-red-800',
  MEDIA: 'bg-yellow-100 text-yellow-800',
  BAJA: 'bg-green-100 text-green-800',
  URGENTE: 'bg-red-200 text-red-900',
};

export default function LeadsSolucionesClient() {
  const [leads, setLeads] = useState<LeadSolucion[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [statsTipo, setStatsTipo] = useState<StatsTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [buscar, setBuscar] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadSolucion | null>(null);
  const [editingNotas, setEditingNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo) params.set('tipo', filtroTipo);
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroPrioridad) params.set('prioridad', filtroPrioridad);
      if (buscar) params.set('buscar', buscar);

      const res = await fetch(`/api/admin/leads-soluciones?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads);
        setStats(data.stats);
        setStatsTipo(data.statsTipo);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, filtroEstado, filtroPrioridad, buscar]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const totalLeads = leads.length;
  const nuevos = stats.find(s => s.estado === 'NUEVO')?._count.id || 0;
  const enProceso = stats.find(s => s.estado === 'EN_PROCESO')?._count.id || 0;
  const contactados = stats.find(s => s.estado === 'CONTACTADO')?._count.id || 0;
  const cerradosGanados = stats.find(s => s.estado === 'CERRADO_GANADO')?._count.id || 0;

  const updateLead = async (id: string, data: { estado?: string; prioridad?: string; notas?: string }) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads-soluciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setLeads(prev => prev.map(l => l.id === id ? updated : l));
        if (selectedLead?.id === id) setSelectedLead(updated);
        fetchLeads(); // Refresh stats
      }
    } catch (error) {
      console.error('Error updating lead:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderDatos = (datos: Record<string, any>) => {
    if (!datos || Object.keys(datos).length === 0) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {Object.entries(datos).map(([key, value]) => {
          if (!value || value === 'No indicado') return null;
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .replace('Num ', 'Nº ')
            .trim();
          const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
          return (
            <div key={key} className="text-sm">
              <span className="font-medium text-gray-600">{label}:</span>{' '}
              <span className="text-gray-900">{displayValue}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads Soluciones</h1>
        <p className="text-gray-500 mt-1">Gestión unificada de solicitudes de soluciones empresariales</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total leads</p>
          <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Nuevos</p>
          <p className="text-2xl font-bold text-blue-600">{nuevos}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Contactados</p>
          <p className="text-2xl font-bold text-yellow-600">{contactados}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">En proceso</p>
          <p className="text-2xl font-bold text-orange-600">{enProceso}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Cerrados (ganados)</p>
          <p className="text-2xl font-bold text-green-600">{cerradosGanados}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Empresa, contacto, email..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solución</label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            >
              {TIPOS_SOLUCION.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            >
              {ESTADOS.map(e => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
            <select
              value={filtroPrioridad}
              onChange={(e) => setFiltroPrioridad(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            >
              {PRIORIDADES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla + Detalle */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Tabla */}
        <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${selectedLead ? 'lg:w-3/5' : 'w-full'}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando leads...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg font-medium">No hay leads</p>
              <p className="mt-1 text-sm">Los leads llegarán cuando se envíen formularios desde la web</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solución</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => {
                        setSelectedLead(lead);
                        setEditingNotas(lead.notas || '');
                      }}
                      className={`cursor-pointer hover:bg-orange-50 transition-colors ${selectedLead?.id === lead.id ? 'bg-orange-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{lead.empresa}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{lead.nombre}</div>
                        <div className="text-xs text-gray-500">{lead.email}</div>
                        {lead.telefono && <div className="text-xs text-gray-500">{lead.telefono}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLORS[lead.tipo] || 'bg-gray-100 text-gray-800'}`}>
                          {TIPO_LABELS[lead.tipo] || lead.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLORS[lead.estado] || 'bg-gray-100 text-gray-800'}`}>
                          {ESTADO_LABELS[lead.estado] || lead.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORIDAD_COLORS[lead.prioridad] || 'bg-gray-100 text-gray-800'}`}>
                          {lead.prioridad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel de detalle */}
        {selectedLead && (
          <div className="lg:w-2/5 bg-white rounded-lg border border-gray-200 p-5 space-y-4 h-fit sticky top-4">
            {/* Header del detalle */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedLead.empresa}</h3>
                <p className="text-sm text-gray-500">{selectedLead.nombre} · {selectedLead.email}</p>
                {selectedLead.telefono && <p className="text-sm text-gray-500">{selectedLead.telefono}</p>}
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tipo y fecha */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${TIPO_COLORS[selectedLead.tipo] || 'bg-gray-100 text-gray-800'}`}>
                {TIPO_LABELS[selectedLead.tipo] || selectedLead.tipo}
              </span>
              <span className="text-xs text-gray-500">{formatDate(selectedLead.createdAt)}</span>
            </div>

            {/* Estado y Prioridad editables */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select
                  value={selectedLead.estado}
                  onChange={(e) => updateLead(selectedLead.id, { estado: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500"
                  disabled={saving}
                >
                  {ESTADOS.filter(e => e.value).map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prioridad</label>
                <select
                  value={selectedLead.prioridad}
                  onChange={(e) => updateLead(selectedLead.id, { prioridad: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500"
                  disabled={saving}
                >
                  {PRIORIDADES.filter(p => p.value).map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Datos del formulario */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1">Datos del formulario</h4>
              {renderDatos(selectedLead.datos)}
            </div>

            {/* Notas */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea
                value={editingNotas}
                onChange={(e) => setEditingNotas(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
                placeholder="Añadir notas sobre este lead..."
              />
              {editingNotas !== (selectedLead.notas || '') && (
                <button
                  onClick={() => updateLead(selectedLead.id, { notas: editingNotas })}
                  disabled={saving}
                  className="mt-2 px-3 py-1.5 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar notas'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
