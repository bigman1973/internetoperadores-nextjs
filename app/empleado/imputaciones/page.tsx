'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, ClockIcon, TrashIcon } from '@heroicons/react/24/outline';

interface Proyecto {
  id: string;
  nombre: string;
  codigo: string | null;
}

interface Imputacion {
  id: string;
  fecha: string;
  horas: number;
  descripcion: string | null;
  proyecto: Proyecto;
}

interface Resumen {
  totalHoras: number;
  horasPorProyecto: Record<string, number>;
  mes: number;
  anio: number;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function ImputacionesPage() {
  const [imputaciones, setImputaciones] = useState<Imputacion[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(new Date().getFullYear());

  // Form
  const [formData, setFormData] = useState({
    proyectoId: '',
    fecha: new Date().toISOString().split('T')[0],
    horas: '',
    descripcion: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [mes, anio]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/empleado/imputaciones?mes=${mes}&anio=${anio}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setImputaciones(data.imputaciones || []);
      setProyectos(data.proyectosAsignados || []);
      setResumen(data.resumen || null);
    } catch (e) {
      setError('Error al cargar las imputaciones');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/empleado/imputaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowForm(false);
        setFormData({ ...formData, horas: '', descripcion: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Error al guardar');
      }
    } catch (e) {
      alert('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <p className="text-yellow-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Imputación de Horas</h1>
          <p className="text-sm text-gray-500 mt-1">Registra las horas dedicadas a cada proyecto</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
        >
          <PlusIcon className="h-4 w-4" />
          Imputar Horas
        </button>
      </div>

      {/* Filtro mes */}
      <div className="flex items-center gap-3">
        <select
          value={mes}
          onChange={(e) => setMes(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          {MESES.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={anio}
          onChange={(e) => setAnio(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value={2026}>2026</option>
          <option value={2025}>2025</option>
        </select>
      </div>

      {/* Resumen del mes */}
      {resumen && (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="h-5 w-5 text-orange-600" />
            <h2 className="font-semibold text-gray-900">Resumen {MESES[mes]} {anio}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total horas</p>
              <p className="text-2xl font-bold text-gray-900">{resumen.totalHoras.toFixed(1)}h</p>
            </div>
            {Object.entries(resumen.horasPorProyecto).map(([proyecto, horas]) => (
              <div key={proyecto}>
                <p className="text-xs text-gray-500">{proyecto}</p>
                <p className="text-lg font-semibold text-gray-700">{horas.toFixed(1)}h</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulario nueva imputación */}
      {showForm && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Nueva imputación</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto *</label>
                <select
                  value={formData.proyectoId}
                  onChange={(e) => setFormData({ ...formData, proyectoId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                >
                  <option value="">Seleccionar proyecto...</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo ? `[${p.codigo}] ` : ''}{p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horas *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={formData.horas}
                  onChange={(e) => setFormData({ ...formData, horas: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="8"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Qué tarea realizaste..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de imputaciones */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Proyecto</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Horas</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">Cargando...</td>
              </tr>
            ) : imputaciones.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No hay imputaciones este mes. Usa el botón &quot;Imputar Horas&quot; para registrar tu dedicación.
                </td>
              </tr>
            ) : (
              imputaciones.map((imp) => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {new Date(imp.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{imp.proyecto.nombre}</span>
                    {imp.proyecto.codigo && (
                      <span className="ml-1 text-xs text-gray-500">({imp.proyecto.codigo})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{imp.horas}h</td>
                  <td className="px-4 py-3 text-gray-600">{imp.descripcion || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
