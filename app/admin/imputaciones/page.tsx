'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClockIcon, UserGroupIcon, CurrencyEuroIcon, ChartBarIcon, PlusIcon, PencilIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface KPIs {
  totalHoras: number;
  totalCoste: number;
  registros: number;
  empleadosActivos: number;
}

interface ResumenEmpleado { id: string; nombre: string; horas: number; coste: number; }
interface ResumenCategoria { nombre: string; horas: number; coste: number; }
interface ResumenCliente { nombre: string; horas: number; coste: number; }
interface Empleado { id: string; nombreCompleto: string; departamento: string | null; }
interface Categoria { id: string; nombre: string; color: string; subcategorias: string[]; activa: boolean; orden: number; }

const PERIODOS = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

function formatEur(v: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(v); }

export default function ImputacionesAdminPage() {
  const [kpis, setKpis] = useState<KPIs>({ totalHoras: 0, totalCoste: 0, registros: 0, empleadosActivos: 0 });
  const [porEmpleado, setPorEmpleado] = useState<ResumenEmpleado[]>([]);
  const [porCategoria, setPorCategoria] = useState<ResumenCategoria[]>([]);
  const [porCliente, setPorCliente] = useState<ResumenCliente[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'registros' | 'categorias'>('dashboard');
  const [imputaciones, setImputaciones] = useState<any[]>([]);
  const [editingImp, setEditingImp] = useState<any | null>(null);

  // Categoría form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [catForm, setCatForm] = useState({ nombre: '', color: '#6366f1', subcategorias: '' });

  // Imputar como admin
  const [showImputarForm, setShowImputarForm] = useState(false);
  const [imputarSubmitting, setImputarSubmitting] = useState(false);
  const [imputarForm, setImputarForm] = useState({
    empleadoId: '',
    fecha: new Date().toISOString().split('T')[0],
    horas: '1',
    categoria: '',
    subcategoria: '',
    subcategoria2: '',
    subcategoria3: '',
    clienteNombre: '',
    descripcion: '',
  });

  // Buscador de clientes
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteResults, setClienteResults] = useState<any[]>([]);
  const [searchingCliente, setSearchingCliente] = useState(false);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);

  const buscarClientes = async (query: string) => {
    setClienteSearch(query);
    if (query.length < 2) { setClienteResults([]); setShowClienteDropdown(false); return; }
    setSearchingCliente(true);
    try {
      const res = await fetch(`/api/empleado/buscar-clientes?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setClienteResults(data);
      setShowClienteDropdown(true);
    } catch { setClienteResults([]); }
    finally { setSearchingCliente(false); }
  };

  const seleccionarCliente = (cliente: any) => {
    setImputarForm({ ...imputarForm, clienteNombre: cliente.nombre });
    setClienteSearch(cliente.nombre);
    setShowClienteDropdown(false);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo, fecha });
      if (filtroEmpleado) params.append('empleadoId', filtroEmpleado);
      if (filtroCategoria) params.append('categoria', filtroCategoria);

      const res = await fetch(`/api/admin/imputaciones?${params}`);
      const data = await res.json();
      setKpis(data.kpis);
      setPorEmpleado(data.porEmpleado);
      setPorCategoria(data.porCategoria);
      setPorCliente(data.porCliente);
      setEmpleados(data.empleados);
      setImputaciones(data.imputaciones || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [periodo, fecha, filtroEmpleado, filtroCategoria]);

  const fetchCategorias = async () => {
    const res = await fetch('/api/admin/imputaciones?action=categorias');
    const data = await res.json();
    setCategorias(data.categorias || []);
  };

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategorias(); }, []);

  const handleSaveCat = async () => {
    const subcats = catForm.subcategorias.split(',').map(s => s.trim()).filter(Boolean);
    const body: any = {
      action: editingCat ? 'editar_categoria' : 'crear_categoria',
      nombre: catForm.nombre,
      color: catForm.color,
      subcategorias: subcats,
    };
    if (editingCat) body.id = editingCat.id;

    await fetch('/api/admin/imputaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setShowCatForm(false);
    setEditingCat(null);
    setCatForm({ nombre: '', color: '#6366f1', subcategorias: '' });
    fetchCategorias();
  };

  const handleDeleteCat = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    await fetch('/api/admin/imputaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'eliminar_categoria', id }),
    });
    fetchCategorias();
  };

  const maxHoras = Math.max(...porEmpleado.map(e => e.horas), 1);

  const handleImputar = async (e: React.FormEvent) => {
    e.preventDefault();
    setImputarSubmitting(true);
    try {
      const action = editingImp ? 'editar_imputacion' : 'imputar';
      const payload: any = { action, ...imputarForm };
      if (editingImp) payload.id = editingImp.id;
      const res = await fetch('/api/admin/imputaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowImputarForm(false);
      setEditingImp(null);
      setImputarForm({ empleadoId: '', fecha: new Date().toISOString().split('T')[0], horas: '1', categoria: '', subcategoria: '', subcategoria2: '', subcategoria3: '', clienteNombre: '', descripcion: '' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImputarSubmitting(false);
    }
  };

  const selectedImputarCat = categorias.find(c => c.nombre === imputarForm.categoria);
  const imputarN1Options: any[] = (selectedImputarCat?.subcategorias as any[]) || [];
  const imputarSelectedN1 = imputarN1Options.find((n: any) => n.nombre === imputarForm.subcategoria);
  const imputarN2Options: any[] = imputarSelectedN1?.hijos || [];
  const imputarSelectedN2 = imputarN2Options.find((n: any) => n.nombre === imputarForm.subcategoria2);
  const imputarN3Options: any[] = imputarSelectedN2?.hijos || [];

  // Buscador de clientes: mostrar cuando es Comercial (cualquier sub) o Soporte Técnico (no Alta nueva, no Infraestructura)
  const adminNeedsClienteSearch = (
    (imputarForm.categoria === 'Soporte Técnico' && 
     (imputarForm.subcategoria === 'Particular' || imputarForm.subcategoria === 'Empresa') &&
     imputarForm.subcategoria2 !== '' && imputarForm.subcategoria2 !== 'Alta nueva'
    ) ||
    (imputarForm.categoria === 'Comercial' && imputarForm.subcategoria !== '')
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Imputación de Tiempos</h1>
          <p className="text-sm text-gray-500 mt-1">Análisis de dedicación del equipo</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImputarForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" /> Imputar horas
          </button>
          <button
            onClick={() => setTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'dashboard' ? 'bg-orange-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab('registros')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'registros' ? 'bg-orange-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Registros
          </button>
          <button
            onClick={() => setTab('categorias')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'categorias' ? 'bg-orange-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Categorías
          </button>
        </div>
      </div>

      {tab === 'dashboard' && (
        <>
          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {PERIODOS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriodo(p.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${periodo === p.value ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
            />
            <select
              value={filtroEmpleado}
              onChange={e => setFiltroEmpleado(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
            >
              <option value="">Todos los empleados</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>{e.nombreCompleto}</option>
              ))}
            </select>
            <select
              value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
            >
              <option value="">Todas las categorías</option>
              {categorias.filter(c => c.activa).map(c => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100"><ClockIcon className="w-5 h-5 text-orange-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.totalHoras.toFixed(1)}h</p>
                  <p className="text-xs text-gray-500">Horas totales</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100"><CurrencyEuroIcon className="w-5 h-5 text-green-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatEur(kpis.totalCoste)}</p>
                  <p className="text-xs text-gray-500">Coste total</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100"><ChartBarIcon className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.registros}</p>
                  <p className="text-xs text-gray-500">Registros</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100"><UserGroupIcon className="w-5 h-5 text-purple-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.empleadosActivos}</p>
                  <p className="text-xs text-gray-500">Empleados imputando</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tablas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Por empleado */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Por empleado</h3>
              {porEmpleado.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos en este período</p>
              ) : (
                <div className="space-y-3">
                  {porEmpleado.map(emp => (
                    <div key={emp.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 truncate">{emp.nombre}</span>
                        <span className="text-gray-900 font-semibold">{emp.horas.toFixed(1)}h</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${(emp.horas / maxHoras) * 100}%` }}></div>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatEur(emp.coste)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Por categoría */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Por categoría</h3>
              {porCategoria.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos en este período</p>
              ) : (
                <div className="space-y-3">
                  {porCategoria.map(cat => {
                    const pct = kpis.totalHoras > 0 ? (cat.horas / kpis.totalHoras) * 100 : 0;
                    return (
                      <div key={cat.nombre} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700">{cat.nombre}</span>
                            <span className="text-gray-500">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-14 text-right">{cat.horas.toFixed(1)}h</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Por cliente */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Por cliente</h3>
              {porCliente.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos en este período</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {porCliente.map(cli => (
                    <div key={cli.nombre} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cli.nombre}</p>
                        <p className="text-xs text-gray-500">{formatEur(cli.coste)}</p>
                      </div>
                      <span className="text-sm font-bold text-indigo-600">{cli.horas.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'registros' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Registros de Imputaciones</h2>
            <p className="text-sm text-gray-500">{imputaciones.length} registros en el período</p>
          </div>
          {imputaciones.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No hay imputaciones en este período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 font-medium text-gray-600">Fecha</th>
                    <th className="pb-2 font-medium text-gray-600">Empleado</th>
                    <th className="pb-2 font-medium text-gray-600">Horas</th>
                    <th className="pb-2 font-medium text-gray-600">Categoría</th>
                    <th className="pb-2 font-medium text-gray-600">Detalle</th>
                    <th className="pb-2 font-medium text-gray-600">Cliente</th>
                    <th className="pb-2 font-medium text-gray-600">Nota</th>
                    <th className="pb-2 font-medium text-gray-600 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {imputaciones.map((imp: any) => (
                    <tr key={imp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 text-gray-900">{new Date(imp.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</td>
                      <td className="py-2 text-gray-700">{imp.empleado?.nombreCompleto || '-'}</td>
                      <td className="py-2 font-medium text-gray-900">{imp.horas}h</td>
                      <td className="py-2"><span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">{imp.categoria}</span></td>
                      <td className="py-2 text-gray-600 text-xs">{imp.rutaCompleta || imp.subcategoria || '-'}</td>
                      <td className="py-2 text-gray-600">{imp.clienteNombre || '-'}</td>
                      <td className="py-2 text-gray-500 text-xs max-w-[150px] truncate">{imp.descripcion || '-'}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => {
                            setEditingImp(imp);
                            setImputarForm({
                              empleadoId: imp.empleadoId,
                              fecha: imp.fecha.split('T')[0],
                              horas: String(imp.horas),
                              categoria: imp.categoria,
                              subcategoria: imp.subcategoria || '',
                              subcategoria2: imp.subcategoria2 || '',
                              subcategoria3: imp.subcategoria3 || '',
                              clienteNombre: imp.clienteNombre || '',
                              descripcion: imp.descripcion || '',
                            });
                            setShowImputarForm(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 mr-2"
                          title="Editar"
                        >
                          <PencilIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('¿Eliminar esta imputación?')) return;
                            await fetch('/api/admin/imputaciones', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'eliminar_imputacion', id: imp.id }),
                            });
                            fetchData();
                          }}
                          className="text-red-500 hover:text-red-700"
                          title="Eliminar"
                        >
                          <TrashIcon className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'categorias' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Categorías de Imputación</h2>
              <p className="text-sm text-gray-500">Define las categorías que verán los empleados al imputar</p>
            </div>
            <button
              onClick={() => { setShowCatForm(true); setEditingCat(null); setCatForm({ nombre: '', color: '#6366f1', subcategorias: '' }); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
            >
              <PlusIcon className="w-4 h-4" /> Nueva categoría
            </button>
          </div>

          <div className="space-y-3">
            {categorias.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{cat.nombre}</p>
                    {cat.subcategorias.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {cat.subcategorias.join(', ')}
                      </p>
                    )}
                  </div>
                  {!cat.activa && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs">Inactiva</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingCat(cat); setCatForm({ nombre: cat.nombre, color: cat.color, subcategorias: cat.subcategorias.join(', ') }); setShowCatForm(true); }}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteCat(cat.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {categorias.length === 0 && (
              <p className="text-center text-gray-400 py-8">No hay categorías creadas. Crea la primera para que los empleados puedan imputar.</p>
            )}
          </div>

          {/* Modal categoría */}
          {showCatForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  {editingCat ? 'Editar categoría' : 'Nueva categoría'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={catForm.nombre}
                      onChange={e => setCatForm({ ...catForm, nombre: e.target.value })}
                      placeholder="Ej: Comercial, Soporte Técnico..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                    <input
                      type="color"
                      value={catForm.color}
                      onChange={e => setCatForm({ ...catForm, color: e.target.value })}
                      className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Subcategorías (separadas por coma)</label>
                    <input
                      type="text"
                      value={catForm.subcategorias}
                      onChange={e => setCatForm({ ...catForm, subcategorias: e.target.value })}
                      placeholder="Ej: Visita cliente, Propuesta, Seguimiento"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    />
                    <p className="text-xs text-gray-400 mt-1">Opciones que verá el empleado como detalle adicional</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowCatForm(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button onClick={handleSaveCat} disabled={!catForm.nombre} className="flex-1 px-4 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                      {editingCat ? 'Guardar' : 'Crear'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal imputar como admin */}
      {showImputarForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{editingImp ? 'Editar imputacion' : 'Imputar horas'}</h2>
            <p className="text-sm text-gray-500 mb-4">Registra horas en nombre de cualquier empleado</p>
            <form onSubmit={handleImputar} className="space-y-4">
              {/* Empleado */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Empleado</label>
                <select
                  value={imputarForm.empleadoId}
                  onChange={e => setImputarForm({ ...imputarForm, empleadoId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  required
                >
                  <option value="">Seleccionar empleado...</option>
                  {empleados.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombreCompleto} {emp.departamento ? `(${emp.departamento})` : ''}</option>
                  ))}
                </select>
              </div>
              {/* Fecha y horas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={imputarForm.fecha}
                    onChange={e => setImputarForm({ ...imputarForm, fecha: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
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
                    value={imputarForm.horas}
                    onChange={e => setImputarForm({ ...imputarForm, horas: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    required
                  />
                </div>
              </div>
              {/* Categoría */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                <div className="grid grid-cols-3 gap-2">
                  {categorias.filter(c => c.activa).map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setImputarForm({ ...imputarForm, categoria: cat.nombre, subcategoria: '', subcategoria2: '', subcategoria3: '' })}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        imputarForm.categoria === cat.nombre
                          ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-200'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {cat.nombre}
                    </button>
                  ))}
                </div>
              </div>
              {/* Nivel 1 */}
              {imputarN1Options.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Detalle</label>
                  <div className="flex flex-wrap gap-1.5">
                    {imputarN1Options.map((opt: any) => (
                      <button
                        key={opt.nombre}
                        type="button"
                        onClick={() => setImputarForm({ ...imputarForm, subcategoria: imputarForm.subcategoria === opt.nombre ? '' : opt.nombre, subcategoria2: '', subcategoria3: '' })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          imputarForm.subcategoria === opt.nombre
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {opt.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Nivel 2 */}
              {imputarN2Options.length > 0 && imputarForm.subcategoria && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <div className="flex flex-wrap gap-1.5">
                    {imputarN2Options.map((opt: any) => (
                      <button
                        key={opt.nombre}
                        type="button"
                        onClick={() => setImputarForm({ ...imputarForm, subcategoria2: imputarForm.subcategoria2 === opt.nombre ? '' : opt.nombre, subcategoria3: '' })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          imputarForm.subcategoria2 === opt.nombre
                            ? 'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-200'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {opt.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Nivel 3 */}
              {imputarN3Options.length > 0 && imputarForm.subcategoria2 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Servicio</label>
                  <div className="flex flex-wrap gap-1.5">
                    {imputarN3Options.map((opt: any) => (
                      <button
                        key={opt.nombre}
                        type="button"
                        onClick={() => setImputarForm({ ...imputarForm, subcategoria3: imputarForm.subcategoria3 === opt.nombre ? '' : opt.nombre })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          imputarForm.subcategoria3 === opt.nombre
                            ? 'border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {opt.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Ruta preview */}
              {imputarForm.subcategoria && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{imputarForm.categoria}</span>
                    {imputarForm.subcategoria && <span>{' > '}{imputarForm.subcategoria}</span>}
                    {imputarForm.subcategoria2 && <span>{' > '}{imputarForm.subcategoria2}</span>}
                    {imputarForm.subcategoria3 && <span>{' > '}{imputarForm.subcategoria3}</span>}
                  </p>
                </div>
              )}
              {/* Cliente - buscador inteligente o campo libre */}
              {adminNeedsClienteSearch ? (
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                  {imputarForm.clienteNombre ? (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-indigo-700 flex-1">{imputarForm.clienteNombre}</span>
                      <button type="button" onClick={() => { setImputarForm({ ...imputarForm, clienteNombre: '' }); setClienteSearch(''); }} className="text-indigo-400 hover:text-indigo-600 text-xs">\u2715 Cambiar</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar cliente por nombre, CIF o codigo..."
                        value={clienteSearch}
                        onChange={e => buscarClientes(e.target.value)}
                        onFocus={() => clienteResults.length > 0 && setShowClienteDropdown(true)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                      />
                      {searchingCliente && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                      {showClienteDropdown && clienteResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {clienteResults.map((c: any) => (
                            <button key={c.id} type="button" onClick={() => seleccionarCliente(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                              <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                              <p className="text-xs text-gray-500">{c.cif || c.nif || ''}{c.municipio ? ` \u2022 ${c.municipio}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {showClienteDropdown && clienteResults.length === 0 && clienteSearch.length >= 2 && !searchingCliente && (
                        <p className="text-xs text-gray-400 mt-1">No se encontraron clientes</p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cliente (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Draxton, Hospital Granollers..."
                    value={imputarForm.clienteNombre}
                    onChange={e => setImputarForm({ ...imputarForm, clienteNombre: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                  />
                </div>
              )}
              {/* Nota */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nota breve (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Revisión propuesta, llamada seguimiento..."
                  value={imputarForm.descripcion}
                  onChange={e => setImputarForm({ ...imputarForm, descripcion: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                />
              </div>
              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowImputarForm(false); setEditingImp(null); }}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={imputarSubmitting || !imputarForm.empleadoId || !imputarForm.categoria}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {imputarSubmitting ? 'Guardando...' : 'Imputar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
