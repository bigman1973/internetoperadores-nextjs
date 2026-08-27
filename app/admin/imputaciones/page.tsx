'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClockIcon, UserGroupIcon, CurrencyEuroIcon, ChartBarIcon, PlusIcon, PencilIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import CommercialContextFields, { InfoTip } from '@/components/imputaciones/CommercialContextFields';
import { getActividadComercial, getComplejidadComercial, getResultadoComercial } from '@/lib/imputaciones-comercial';

interface KPIs {
  totalHoras: number;
  totalCoste: number;
  registros: number;
  empleadosActivos: number;
}

interface ResumenEmpleado { id: string; nombre: string; horas: number; coste: number; }
interface ResumenCategoria { nombre: string; horas: number; coste: number; }
interface ResumenCliente { nombre: string; horas: number; coste: number; }
interface ComercialKpis { registros: number; registrosContextualizados: number; horas: number; actividadTotal: number; actividadContactable: number; contactosEfectivos: number; efectividadPct: number | null; complejidadMedia: number | null; continuidadPct: number | null; avancePct: number | null; }
interface ResumenEmpresaGrupo { empresa: string; horas: number; registros: number; actividad: number; contactosEfectivos: number; avances: number; }
interface ResumenActividadComercial { tipo: string; horas: number; registros: number; cantidad: number; }
interface Empleado { id: string; nombreCompleto: string; departamento: string | null; }
interface Categoria { id: string; nombre: string; color: string; subcategorias: string[]; activa: boolean; orden: number; }

const PERIODOS = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

function formatEur(v: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(v); }
function formatPct(v: number | null) { return v === null ? 'Sin datos' : `${v.toFixed(0)}%`; }
function formatComplejidad(v: number | null) {
  if (v === null) return 'Sin datos';
  if (v < 1.5) return 'Sencilla';
  if (v < 2.5) return 'Estándar';
  return 'Compleja';
}

function getInitialImputarForm() {
  return {
    empleadoId: '',
    fecha: new Date().toISOString().split('T')[0],
    horas: '1',
    categoria: '',
    subcategoria: '',
    subcategoria2: '',
    subcategoria3: '',
    clienteNombre: '',
    clienteId: '',
    descripcion: '',
    empresaGrupo: 'INTERNET OPERADORES',
    tipoActividad: '',
    cantidadActividad: '',
    contactosEfectivos: '',
    resultadoComercial: '',
    complejidadComercial: '',
    proximaAccion: '',
    fechaProximaAccion: '',
  };
}

export default function ImputacionesAdminPage() {
  const [kpis, setKpis] = useState<KPIs>({ totalHoras: 0, totalCoste: 0, registros: 0, empleadosActivos: 0 });
  const [porEmpleado, setPorEmpleado] = useState<ResumenEmpleado[]>([]);
  const [porCategoria, setPorCategoria] = useState<ResumenCategoria[]>([]);
  const [porCliente, setPorCliente] = useState<ResumenCliente[]>([]);
  const [comercialKpis, setComercialKpis] = useState<ComercialKpis>({ registros: 0, registrosContextualizados: 0, horas: 0, actividadTotal: 0, actividadContactable: 0, contactosEfectivos: 0, efectividadPct: null, complejidadMedia: null, continuidadPct: null, avancePct: null });
  const [porEmpresaGrupo, setPorEmpresaGrupo] = useState<ResumenEmpresaGrupo[]>([]);
  const [porTipoActividad, setPorTipoActividad] = useState<ResumenActividadComercial[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'registros' | 'pendientes' | 'categorias'>('dashboard');
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [imputaciones, setImputaciones] = useState<any[]>([]);
  const [editingImp, setEditingImp] = useState<any | null>(null);

  // Categoría form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [catForm, setCatForm] = useState({ nombre: '', color: '#6366f1', subcategorias: '' });

  // Imputar como admin
  const [showImputarForm, setShowImputarForm] = useState(false);
  const [imputarSubmitting, setImputarSubmitting] = useState(false);
  const [imputarForm, setImputarForm] = useState(getInitialImputarForm);

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
    setImputarForm({ ...imputarForm, clienteNombre: cliente.nombre, clienteId: String(cliente.id) });
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
      setComercialKpis(data.comercialKpis || { registros: 0, registrosContextualizados: 0, horas: 0, actividadTotal: 0, actividadContactable: 0, contactosEfectivos: 0, efectividadPct: null, complejidadMedia: null, continuidadPct: null, avancePct: null });
      setPorEmpresaGrupo(data.porEmpresaGrupo || []);
      setPorTipoActividad(data.porTipoActividad || []);
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

  const fetchPendientes = async () => {
    try {
      const res = await fetch('/api/admin/imputaciones?action=pendientes');
      const data = await res.json();
      setPendientes(data.pendientes || []);
    } catch (e) { setPendientes([]); }
  };

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategorias(); fetchPendientes(); }, []);

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
  const maxHorasEmpresa = Math.max(...porEmpresaGrupo.map(e => e.horas), 1);

  const handleImputar = async (e: React.FormEvent) => {
    e.preventDefault();
    setImputarSubmitting(true);
    try {
      const action = editingImp ? 'editar_imputacion' : 'imputar';
      const payload: any = { action, ...imputarForm };
      if (editingImp) payload.id = editingImp.id;
      if (selectedProyecto) payload.proyectoId = selectedProyecto.id;
      const res = await fetch('/api/admin/imputaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowImputarForm(false);
      setEditingImp(null);
      setSelectedProyecto(null);
      setImputarForm(getInitialImputarForm());
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
    (imputarForm.categoria === 'Comercial' && imputarForm.empresaGrupo === 'INTERNET OPERADORES')
  );

  const adminNeedsProyectoSearch = imputarForm.categoria === 'Proyectos';

  // Buscador de proyectos admin
  const [proyectoSearch, setProyectoSearch] = useState('');
  const [proyectoResults, setProyectoResults] = useState<any[]>([]);
  const [searchingProyecto, setSearchingProyecto] = useState(false);
  const [showProyectoDropdown, setShowProyectoDropdown] = useState(false);
  const [selectedProyecto, setSelectedProyecto] = useState<any>(null);

  const buscarProyectos = async (query: string) => {
    setProyectoSearch(query);
    if (query.length < 2) { setProyectoResults([]); setShowProyectoDropdown(false); return; }
    setSearchingProyecto(true);
    try {
      const res = await fetch(`/api/empleado/buscar-proyectos?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setProyectoResults(data);
      setShowProyectoDropdown(true);
    } catch { setProyectoResults([]); }
    finally { setSearchingProyecto(false); }
  };

  const seleccionarProyecto = (proy: any) => {
    setSelectedProyecto(proy);
    setImputarForm({ ...imputarForm, descripcion: proy.nombre });
    setProyectoSearch(proy.nombre);
    setShowProyectoDropdown(false);
  };

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
            onClick={() => { setEditingImp(null); setSelectedProyecto(null); setImputarForm(getInitialImputarForm()); setClienteSearch(''); setShowImputarForm(true); }}
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
            onClick={() => { setTab('pendientes'); fetchPendientes(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'pendientes' ? 'bg-orange-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Pendientes {pendientes.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{pendientes.length}</span>}
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

          {(filtroCategoria === '' || filtroCategoria === 'Comercial') && (
            <section className="space-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Lectura contextual de la actividad comercial</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">Estos indicadores no son cuotas individuales. Combinan volumen, resultado, complejidad y continuidad para interpretar el trabajo con contexto: una gestión compleja puede aportar más que muchas acciones breves.</p>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-indigo-700 ring-1 ring-indigo-100">{comercialKpis.horas.toFixed(1)} h</span>
                  <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-gray-700 ring-1 ring-gray-200">{comercialKpis.registrosContextualizados} de {comercialKpis.registros} con contexto</span>
                </div>
              </div>

              {comercialKpis.registros === 0 ? (
                <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-500 ring-1 ring-gray-100">No hay actividad comercial en el período seleccionado.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-white p-4 ring-1 ring-indigo-100">
                      <p className="text-xs font-medium text-gray-600">Efectividad de contacto <InfoTip text="Contactos o conversaciones reales sobre el total de intentos comparables informados. No incluye correos, reuniones u ofertas, porque su volumen no es equivalente." /></p>
                      <p className="mt-2 text-2xl font-bold text-indigo-700">{formatPct(comercialKpis.efectividadPct)}</p>
                      <p className="mt-1 text-xs text-gray-500">{comercialKpis.contactosEfectivos} efectivos de {comercialKpis.actividadContactable} intentos comparables</p>
                    </div>
                    <div className="rounded-xl bg-white p-4 ring-1 ring-violet-100">
                      <p className="text-xs font-medium text-gray-600">Complejidad media <InfoTip text="Media del contexto indicado por el empleado: sencilla, estándar o compleja. Evita comparar igual una tarea rutinaria y una gestión estratégica o técnica." /></p>
                      <p className="mt-2 text-2xl font-bold text-violet-700">{formatComplejidad(comercialKpis.complejidadMedia)}</p>
                      <p className="mt-1 text-xs text-gray-500">{comercialKpis.complejidadMedia === null ? 'Aún no se ha informado' : `${comercialKpis.complejidadMedia.toFixed(1)} sobre 3`}</p>
                    </div>
                    <div className="rounded-xl bg-white p-4 ring-1 ring-emerald-100">
                      <p className="text-xs font-medium text-gray-600">Continuidad comercial <InfoTip text="Porcentaje de gestiones que dejan una próxima acción o que ya han quedado cerradas. Sirve para evitar que una oportunidad pierda seguimiento." /></p>
                      <p className="mt-2 text-2xl font-bold text-emerald-700">{formatPct(comercialKpis.continuidadPct)}</p>
                      <p className="mt-1 text-xs text-gray-500">Con seguimiento o cierre trazado</p>
                    </div>
                    <div className="rounded-xl bg-white p-4 ring-1 ring-amber-100">
                      <p className="text-xs font-medium text-gray-600">Avance comercial <InfoTip text="Gestiones con un resultado que hace avanzar la oportunidad: contacto, reunión, oferta, negociación, venta o cierre. Es una lectura orientativa, no una clasificación del empleado." /></p>
                      <p className="mt-2 text-2xl font-bold text-amber-700">{formatPct(comercialKpis.avancePct)}</p>
                      <p className="mt-1 text-xs text-gray-500">{comercialKpis.actividadTotal} acciones aproximadas informadas</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Dedicación por empresa del grupo</h3>
                      <div className="mt-3 space-y-3">
                        {porEmpresaGrupo.map(item => (
                          <div key={item.empresa}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                              <span className="font-semibold text-gray-700">{item.empresa}</span>
                              <span className="text-gray-500">{item.horas.toFixed(1)} h · {item.registros} registros</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.max(3, (item.horas / maxHorasEmpresa) * 100)}%` }} /></div>
                            <p className="mt-1 text-[11px] text-gray-400">{item.actividad} acciones · {item.contactosEfectivos} contactos efectivos · {item.avances} avances</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Actividad informada</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">El volumen se presenta junto a las horas; nunca se interpreta de forma aislada.</p>
                      <div className="mt-3 divide-y divide-gray-100">
                        {porTipoActividad.length === 0 ? <p className="py-5 text-center text-xs text-gray-400">Los registros históricos todavía no incluyen detalle de actividad.</p> : porTipoActividad.map(item => (
                          <div key={item.tipo} className="flex items-center justify-between gap-3 py-2.5">
                            <div>
                              <p className="text-xs font-semibold text-gray-700">{getActividadComercial(item.tipo)?.label || item.tipo}</p>
                              <p className="text-[11px] text-gray-400">{item.registros} registros · {item.horas.toFixed(1)} h</p>
                            </div>
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{item.cantidad} {getActividadComercial(item.tipo)?.unidad || 'acciones'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

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
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 font-medium text-gray-600">Fecha</th>
                    <th className="pb-2 font-medium text-gray-600">Empleado</th>
                    <th className="pb-2 font-medium text-gray-600">Horas</th>
                    <th className="pb-2 font-medium text-gray-600">Categoría</th>
                    <th className="pb-2 font-medium text-gray-600">Detalle</th>
                    <th className="pb-2 font-medium text-gray-600">Contexto comercial</th>
                    <th className="pb-2 font-medium text-gray-600">Cliente</th>
                    <th className="pb-2 font-medium text-gray-600">Descripción</th>
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
                      <td className="py-3 pr-3 text-gray-600 text-xs">{imp.rutaCompleta || imp.subcategoria || '-'}</td>
                      <td className="py-3 pr-3 text-xs text-gray-600 min-w-[210px]">
                        {imp.categoria === 'Comercial' ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-indigo-700">{imp.empresaGrupo || 'INTERNET OPERADORES'}</p>
                            <p>{getActividadComercial(imp.tipoActividad)?.label || 'Actividad sin detallar'}{imp.cantidadActividad !== null && imp.cantidadActividad !== undefined ? ` · ${imp.cantidadActividad} ${getActividadComercial(imp.tipoActividad)?.unidad || 'acciones'}` : ''}</p>
                            <p>{getResultadoComercial(imp.resultadoComercial)?.label || 'Resultado sin detallar'}{imp.complejidadComercial ? ` · ${getComplejidadComercial(imp.complejidadComercial)?.label || imp.complejidadComercial}` : ''}</p>
                            {imp.proximaAccion && <p className="text-emerald-700">Siguiente: {imp.proximaAccion}</p>}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="py-3 pr-3 text-gray-600 min-w-[170px]">{imp.clienteNombre || '-'}</td>
                      <td className="py-3 pr-3 text-gray-600 text-xs min-w-[280px] max-w-[380px] whitespace-pre-wrap break-words leading-relaxed">{imp.descripcion || '-'}</td>
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
                              clienteId: imp.clienteId ? String(imp.clienteId) : '',
                              descripcion: imp.descripcion || '',
                              empresaGrupo: imp.empresaGrupo || 'INTERNET OPERADORES',
                              tipoActividad: imp.tipoActividad || '',
                              cantidadActividad: imp.cantidadActividad !== null && imp.cantidadActividad !== undefined ? String(imp.cantidadActividad) : '',
                              contactosEfectivos: imp.contactosEfectivos !== null && imp.contactosEfectivos !== undefined ? String(imp.contactosEfectivos) : '',
                              resultadoComercial: imp.resultadoComercial || '',
                              complejidadComercial: imp.complejidadComercial || '',
                              proximaAccion: imp.proximaAccion || '',
                              fechaProximaAccion: imp.fechaProximaAccion ? imp.fechaProximaAccion.split('T')[0] : '',
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

      {tab === 'pendientes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Horas pendientes de imputar</h3>
            <p className="text-sm text-gray-500">Empleados con horas asignadas a proyectos que aun no han imputado</p>
          </div>
          {pendientes.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No hay horas pendientes de imputar. Todos los recursos estan al dia.</p>}
          {pendientes.map((p: any) => (
            <div key={p.asignacionId} className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{p.empleado.nombreCompleto}</p>
                  <p className="text-xs text-gray-500">{p.empleado.departamento || 'Sin departamento'} {p.rol ? `- ${p.rol}` : ''}</p>
                </div>
                <div className="text-right mr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${p.proyecto.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{p.proyecto.tipo === 'cliente' ? 'Cliente' : 'Interno'}</span>
                  <p className="text-sm font-medium mt-1">{p.proyecto.nombre}</p>
                </div>
                <div className="text-right mr-4">
                  <p className="text-sm"><span className="text-green-600 font-medium">{p.horasImputadas}h</span> / {p.horasEstimadas}h</p>
                  <p className="text-xs text-amber-600 font-medium">{p.horasPendientes}h pendientes</p>
                </div>
                <button
                  onClick={() => {
                    setImputarForm({ ...imputarForm, empleadoId: p.empleado.id, categoria: 'Proyectos', subcategoria: 'Ejecucion' });
                    setSelectedProyecto(p.proyecto);
                    setShowImputarForm(true);
                  }}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                >
                  Imputar
                </button>
              </div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (p.horasImputadas / p.horasEstimadas) * 100)}%` }} />
              </div>
            </div>
          ))}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
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
              {imputarForm.categoria === 'Comercial' && (
                <CommercialContextFields
                  value={imputarForm}
                  horas={imputarForm.horas}
                  descripcion={imputarForm.descripcion}
                  onChange={patch => {
                    if (patch.empresaGrupo && patch.empresaGrupo !== imputarForm.empresaGrupo) {
                      setClienteSearch('');
                      setImputarForm(current => ({ ...current, ...patch, clienteNombre: '', clienteId: '' }));
                      return;
                    }
                    setImputarForm(current => ({ ...current, ...patch }));
                  }}
                />
              )}

              {/* Cliente - buscador inteligente o campo libre */}
              {adminNeedsClienteSearch ? (
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                  {imputarForm.clienteNombre ? (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-indigo-700 flex-1">{imputarForm.clienteNombre}</span>
                      <button type="button" onClick={() => { setImputarForm({ ...imputarForm, clienteNombre: '', clienteId: '' }); setClienteSearch(''); }} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium" aria-label="Cambiar cliente">✕ Cambiar</button>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">{imputarForm.categoria === 'Comercial' ? 'Cliente, contacto u oportunidad (opcional)' : 'Cliente (opcional)'}</label>
                  <input
                    type="text"
                    placeholder={imputarForm.categoria === 'Comercial' ? 'Ej: empresa o contacto sobre el que se ha trabajado' : 'Ej: Draxton, Hospital Granollers...'}
                    value={imputarForm.clienteNombre}
                    onChange={e => setImputarForm({ ...imputarForm, clienteNombre: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                  />
                </div>
              )}
              {/* Buscador de proyectos */}
              {adminNeedsProyectoSearch && (
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Proyecto</label>
                  {selectedProyecto ? (
                    <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${selectedProyecto.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {selectedProyecto.tipo === 'cliente' ? 'Cliente' : 'Interno'}
                      </span>
                      <span className="text-sm font-medium text-violet-700 flex-1">{selectedProyecto.nombre}</span>
                      <button type="button" onClick={() => { setSelectedProyecto(null); setProyectoSearch(''); }} className="text-violet-400 hover:text-violet-600 text-xs">Cambiar</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar proyecto por nombre..."
                        value={proyectoSearch}
                        onChange={e => buscarProyectos(e.target.value)}
                        onFocus={() => proyectoResults.length > 0 && setShowProyectoDropdown(true)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-violet-500"
                      />
                      {searchingProyecto && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                      {showProyectoDropdown && proyectoResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {proyectoResults.map((p: any) => (
                            <button key={p.id} type="button" onClick={() => seleccionarProyecto(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${p.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                  {p.tipo === 'cliente' ? 'Cliente' : 'Interno'}
                                </span>
                                <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
                              </div>
                              {p.detalle && <p className="text-xs text-gray-500 mt-0.5 ml-12">{p.detalle}</p>}
                            </button>
                          ))}
                        </div>
                      )}
                      {showProyectoDropdown && proyectoResults.length === 0 && proyectoSearch.length >= 2 && !searchingProyecto && (
                        <p className="text-xs text-gray-400 mt-1">No se encontraron proyectos</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Descripción del trabajo (opcional)</label>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="Resume la gestión, el contexto y cualquier detalle útil para continuar el trabajo."
                  value={imputarForm.descripcion}
                  onChange={e => setImputarForm({ ...imputarForm, descripcion: e.target.value })}
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder-gray-400"
                />
                <p className="mt-1 text-[11px] text-gray-400">Unas líneas claras permiten interpretar el tiempo sin convertir la imputación en un informe.</p>
              </div>
              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowImputarForm(false); setEditingImp(null); setSelectedProyecto(null); setImputarForm(getInitialImputarForm()); }}
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
