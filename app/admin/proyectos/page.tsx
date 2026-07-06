'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PlusIcon,
  FolderIcon,
  CurrencyEuroIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface ProyectoConRentabilidad {
  id: string;
  codigo: string | null;
  nombre: string;
  cliente: string | null;
  estado: string;
  presupuesto: number;
  fechaInicio: string | null;
  fechaFin: string | null;
  asignaciones: { empleado: { id: string; nombreCompleto: string; costeHoraActual: number | null }; rol: string | null; porcentaje: number | null }[];
  horasTotales: number;
  costePersonal: number;
  margen: number;
  porcentajeMargen: number;
}

export default function AdminProyectosPage() {
  const [proyectos, setProyectos] = useState<ProyectoConRentabilidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Form state
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    cliente: '',
    presupuesto: '',
    fechaInicio: '',
    fechaFin: '',
  });

  useEffect(() => {
    fetchProyectos();
  }, [filtroEstado]);

  async function fetchProyectos() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/proyectos?estado=${filtroEstado}`);
      const data = await res.json();
      setProyectos(data.proyectos || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function crearProyecto(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/proyectos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ codigo: '', nombre: '', cliente: '', presupuesto: '', fechaInicio: '', fechaFin: '' });
        fetchProyectos();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function formatEur(val: number | null | undefined): string {
    if (val === null || val === undefined) return '—';
    return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  }

  const totalPresupuesto = proyectos.reduce((sum, p) => sum + p.presupuesto, 0);
  const totalCostePersonal = proyectos.reduce((sum, p) => sum + p.costePersonal, 0);
  const totalMargen = totalPresupuesto - totalCostePersonal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos y Rentabilidad</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de proyectos, asignaciones y análisis de márgenes</p>
        </div>
        <div className="flex gap-2">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="todos">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="FINALIZADO">Finalizados</option>
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FolderIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Proyectos activos</p>
              <p className="text-xl font-bold text-gray-900">{proyectos.filter(p => p.estado === 'ACTIVO').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CurrencyEuroIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Presupuesto total</p>
              <p className="text-xl font-bold text-gray-900">{formatEur(totalPresupuesto)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <ClockIcon className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Coste personal total</p>
              <p className="text-xl font-bold text-gray-900">{formatEur(totalCostePersonal)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${totalMargen >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <CurrencyEuroIcon className={`h-5 w-5 ${totalMargen >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Margen total</p>
              <p className={`text-xl font-bold ${totalMargen >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatEur(totalMargen)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de proyectos */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Proyecto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Presupuesto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Horas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Coste Personal</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Margen</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">% Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td>
                </tr>
              ) : proyectos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No hay proyectos. Crea el primero con el botón &quot;Nuevo Proyecto&quot;.
                  </td>
                </tr>
              ) : (
                proyectos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/proyectos/${p.id}`} className="hover:text-orange-600">
                        <div className="font-medium text-gray-900">{p.nombre}</div>
                        {p.codigo && <div className="text-xs text-gray-500">{p.codigo}</div>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.cliente || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' :
                        p.estado === 'FINALIZADO' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatEur(p.presupuesto)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.horasTotales.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatEur(p.costePersonal)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${p.margen >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatEur(p.margen)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${p.porcentajeMargen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {p.presupuesto > 0 ? `${p.porcentajeMargen}%` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear proyecto */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Proyecto</h2>
            <form onSubmit={crearProyecto} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <input
                    type="text"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="PRJ-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="Nombre del proyecto"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <input
                  type="text"
                  value={formData.cliente}
                  onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Nombre del cliente"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.presupuesto}
                  onChange={(e) => setFormData({ ...formData, presupuesto: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    value={formData.fechaInicio}
                    onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                  <input
                    type="date"
                    value={formData.fechaFin}
                    onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                >
                  Crear Proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
