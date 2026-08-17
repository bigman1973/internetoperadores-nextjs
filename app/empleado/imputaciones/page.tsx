'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useImpersonation } from '@/components/empleado/ImpersonationContext';

interface Categoria {
  id: string;
  nombre: string;
  color: string;
  subcategorias: string[];
}

interface Imputacion {
  id: string;
  fecha: string;
  horas: number;
  categoria: string;
  subcategoria: string | null;
  clienteNombre: string | null;
  descripcion: string | null;
  proyecto: { id: string; nombre: string; codigo: string | null } | null;
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function ImputacionesPage() {
  const [imputaciones, setImputaciones] = useState<Imputacion[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [empleadoNombre, setEmpleadoNombre] = useState('');
  const { impersonatedEmail, getQueryParam } = useImpersonation();

  // Form state
  const [formData, setFormData] = useState({
    fecha: formatDate(new Date()),
    horas: '1',
    categoria: '',
    subcategoria: '',
    clienteNombre: '',
    descripcion: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        vista: 'semanal',
        fecha: formatDate(weekStart),
      });
      const qp = getQueryParam();
      if (qp) params.append('as', impersonatedEmail || '');

      const res = await fetch(`/api/empleado/imputaciones?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando datos');
      
      setImputaciones(data.imputaciones || []);
      setCategorias(data.categorias || []);
      setEmpleadoNombre(data.empleado?.nombreCompleto || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [weekStart, impersonatedEmail, getQueryParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/empleado/imputaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setShowForm(false);
      setFormData({ fecha: formatDate(new Date()), horas: '1', categoria: '', subcategoria: '', clienteNombre: '', descripcion: '' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta imputación?')) return;
    try {
      await fetch(`/api/empleado/imputaciones?id=${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      alert('Error al eliminar');
    }
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const thisWeek = () => setWeekStart(getMonday(new Date()));

  // Calcular días de la semana
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Agrupar imputaciones por día
  const impByDay = weekDays.map(day => {
    const dayStr = formatDate(day);
    return imputaciones.filter(imp => imp.fecha.split('T')[0] === dayStr);
  });

  // Total por día y semana
  const totalsByDay = impByDay.map(dayImps => dayImps.reduce((sum, imp) => sum + imp.horas, 0));
  const totalWeek = totalsByDay.reduce((sum, h) => sum + h, 0);

  // Categoría seleccionada para subcategorías
  const selectedCat = categorias.find(c => c.nombre === formData.categoria);

  if (error === 'No se encontró tu perfil de empleado. Contacta con administración.') {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
          No se encontró tu perfil de empleado. Contacta con administración.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Imputación de Tiempos</h1>
          {empleadoNombre && <p className="text-sm text-gray-500 mt-1">{empleadoNombre}</p>}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Imputar tiempo
        </button>
      </div>

      {/* Navegación semanal */}
      <div className="flex items-center justify-between mb-4 bg-white rounded-xl border border-gray-200 p-3">
        <button onClick={prevWeek} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">
            {formatDateShort(weekDays[0])} — {formatDateShort(weekDays[6])}
          </p>
          <button onClick={thisWeek} className="text-xs text-orange-600 hover:underline mt-0.5">
            Ir a esta semana
          </button>
        </div>
        <button onClick={nextWeek} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronRightIcon className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* KPI semanal */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{totalWeek.toFixed(1)}h</p>
          <p className="text-xs text-gray-500 mt-1">Total semana</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{(totalWeek / 5).toFixed(1)}h</p>
          <p className="text-xs text-gray-500 mt-1">Media/día</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{imputaciones.length}</p>
          <p className="text-xs text-gray-500 mt-1">Registros</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: totalWeek >= 40 ? '#16a34a' : totalWeek >= 30 ? '#f59e0b' : '#ef4444' }}>
            {Math.round((totalWeek / 40) * 100)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">Objetivo (40h)</p>
        </div>
      </div>

      {/* Vista semanal */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {weekDays.map((day, i) => {
              const isToday = formatDate(day) === formatDate(new Date());
              return (
                <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isToday ? 'bg-orange-50' : ''}`}>
                  <p className={`text-xs font-medium ${isToday ? 'text-orange-600' : 'text-gray-500'}`}>{DIAS_SEMANA[i]}</p>
                  <p className={`text-sm font-semibold ${isToday ? 'text-orange-700' : 'text-gray-900'}`}>{day.getDate()}</p>
                  <p className={`text-xs mt-1 font-medium ${totalsByDay[i] >= 8 ? 'text-green-600' : totalsByDay[i] > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                    {totalsByDay[i] > 0 ? `${totalsByDay[i]}h` : '—'}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Detalle por día */}
          <div className="divide-y divide-gray-100">
            {weekDays.map((day, i) => {
              const dayImps = impByDay[i];
              if (dayImps.length === 0) return null;
              return (
                <div key={i} className="p-3">
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    {DIAS_SEMANA[i]} {day.getDate()}
                  </p>
                  <div className="space-y-2">
                    {dayImps.map(imp => (
                      <div key={imp.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="inline-flex items-center justify-center w-10 h-7 rounded bg-indigo-100 text-indigo-700 text-xs font-bold flex-shrink-0">
                            {imp.horas}h
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {imp.categoria}
                              {imp.subcategoria && <span className="text-gray-400 font-normal"> · {imp.subcategoria}</span>}
                            </p>
                            {(imp.clienteNombre || imp.descripcion) && (
                              <p className="text-xs text-gray-500 truncate">
                                {imp.clienteNombre && <span className="text-indigo-600">{imp.clienteNombre}</span>}
                                {imp.clienteNombre && imp.descripcion && ' — '}
                                {imp.descripcion}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(imp.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {imputaciones.length === 0 && (
              <div className="p-8 text-center">
                <ClockIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No hay imputaciones esta semana</p>
                <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-orange-600 hover:underline font-medium">
                  Registrar tu primera imputación
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de nueva imputación */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Imputar tiempo</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Fecha y horas en una fila */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={formData.fecha}
                    onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Horas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={formData.horas}
                    onChange={e => setFormData({ ...formData, horas: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">¿Qué tipo de trabajo?</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categorias.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, categoria: cat.nombre, subcategoria: '' })}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        formData.categoria === cat.nombre
                          ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {cat.nombre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subcategoría */}
              {selectedCat && selectedCat.subcategorias.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Detalle (opcional)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCat.subcategorias.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setFormData({ ...formData, subcategoria: formData.subcategoria === sub ? '' : sub })}
                        className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                          formData.subcategoria === sub
                            ? 'bg-indigo-100 text-indigo-700 font-medium'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cliente (opcional) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cliente (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Draxton, Hospital Granollers..."
                  value={formData.clienteNombre}
                  onChange={e => setFormData({ ...formData, clienteNombre: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* Nota */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nota breve (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Revisión propuesta, llamada seguimiento..."
                  value={formData.descripcion}
                  onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.categoria}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
