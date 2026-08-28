'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChevronDownIcon,
  EnvelopeIcon,
  IdentificationIcon,
  ListBulletIcon,
  PencilSquareIcon,
  PrinterIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface EmployeeOption {
  id: string;
  nombreCompleto: string;
  email: string | null;
  categoria: string | null;
  departamento: string | null;
}

interface Position {
  id: string;
  empleadoId: string;
  nombreCompleto: string;
  email: string | null;
  estadoEmpleado: string;
  fechaAltaEmpleado: string | null;
  empresaGrupo: string;
  departamento: string;
  cargo: string;
  categoria: string;
  categoriaOrigen: string;
  categoriaNominaMes: number | null;
  categoriaNominaAnio: number | null;
  superiorId: string | null;
  superiorNombre: string | null;
  dependenciaFuncionalId: string | null;
  dependenciaFuncionalNombre: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  funciones: string | null;
  notas: string | null;
  ordenOrganigrama: number;
  mostrarEnOrganigrama: boolean;
}

interface OrganizationData {
  fecha: string;
  puestos: Position[];
  historial: Position[];
  empleados: EmployeeOption[];
  empleadosSinPuesto: EmployeeOption[];
  empresasGrupo: string[];
  resumen: {
    empleados: number;
    empresas: number;
    departamentos: number;
    categoriasDesdeNomina: number;
    sinSuperior: number;
    ocultos: number;
  };
}

interface FormState {
  empleadoId: string;
  empresaGrupo: string;
  departamento: string;
  cargo: string;
  superiorId: string;
  dependenciaFuncionalId: string;
  fechaInicio: string;
  funciones: string;
  notas: string;
  ordenOrganigrama: number;
  mostrarEnOrganigrama: boolean;
  preservarHistorico: boolean;
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const EMPTY_FORM: FormState = {
  empleadoId: '',
  empresaGrupo: 'INTERNET OPERADORES',
  departamento: '',
  cargo: '',
  superiorId: '',
  dependenciaFuncionalId: '',
  fechaInicio: TODAY,
  funciones: '',
  notas: '',
  ordenOrganigrama: 0,
  mostrarEnOrganigrama: true,
  preservarHistorico: true,
};

const DEPARTMENT_COLORS: Record<string, string> = {
  Dirección: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Técnico: 'bg-sky-50 text-sky-700 border-sky-200',
  Administración: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Comercial: 'bg-orange-50 text-orange-700 border-orange-200',
  Marketing: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

function formatDate(value: string | null) {
  if (!value) return 'Actualidad';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function OrganizationCard({
  position,
  children,
  depth,
  onEdit,
  isSuperAdmin,
}: {
  position: Position;
  children: Position[];
  depth: number;
  onEdit: (position: Position) => void;
  isSuperAdmin: boolean;
}) {
  return (
    <div className="relative min-w-0">
      {depth > 0 && <div className="absolute -top-4 left-6 h-4 border-l-2 border-gray-200 lg:left-1/2" aria-hidden="true" />}
      <article className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
            {position.nombreCompleto.split(/[ ,]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-gray-950" title={position.nombreCompleto}>{position.nombreCompleto}</h3>
                <p className="mt-0.5 text-sm font-semibold text-orange-600">{position.cargo}</p>
              </div>
              {isSuperAdmin && (
                <button type="button" onClick={() => onEdit(position)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900" title="Editar puesto">
                  <PencilSquareIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${DEPARTMENT_COLORS[position.departamento] || 'border-gray-200 bg-gray-50 text-gray-700'}`}>{position.departamento}</span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{position.empresaGrupo}</span>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs text-gray-600">
              <div className="flex gap-1"><dt className="font-semibold text-gray-800">Categoría:</dt><dd>{position.categoria}</dd></div>
              {position.email && <div className="flex min-w-0 gap-1"><dt className="sr-only">Correo:</dt><dd className="truncate">{position.email}</dd></div>}
              {position.dependenciaFuncionalNombre && <div className="flex gap-1"><dt className="font-semibold text-gray-800">Funcional:</dt><dd>{position.dependenciaFuncionalNombre}</dd></div>}
            </dl>
          </div>
        </div>
      </article>
      {children.length > 0 && (
        <div className="relative mt-4 space-y-4 border-l-2 border-gray-200 pl-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:border-l-0 lg:pl-0 xl:grid-cols-3">
          {children.map(child => <OrganizationBranch key={child.id} position={child} allPositions={[position, ...children]} fullPositions={undefined} depth={depth + 1} onEdit={onEdit} isSuperAdmin={isSuperAdmin} />)}
        </div>
      )}
    </div>
  );
}

function OrganizationBranch({
  position,
  fullPositions,
  depth,
  onEdit,
  isSuperAdmin,
}: {
  position: Position;
  allPositions?: Position[];
  fullPositions?: Position[];
  depth: number;
  onEdit: (position: Position) => void;
  isSuperAdmin: boolean;
}) {
  const source = fullPositions || [];
  const children = source.filter(item => item.superiorId === position.empleadoId && item.mostrarEnOrganigrama);
  return (
    <div className="relative min-w-0">
      {depth > 0 && <div className="absolute -top-4 left-6 h-4 border-l-2 border-gray-200 lg:left-1/2" aria-hidden="true" />}
      <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
            {position.nombreCompleto.split(/[ ,]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="truncate text-sm font-bold text-gray-950">{position.nombreCompleto}</h3><p className="mt-0.5 text-sm font-semibold text-orange-600">{position.cargo}</p></div>
              {isSuperAdmin && <button type="button" onClick={() => onEdit(position)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100" title="Editar puesto"><PencilSquareIcon className="h-5 w-5" /></button>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${DEPARTMENT_COLORS[position.departamento] || 'border-gray-200 bg-gray-50 text-gray-700'}`}>{position.departamento}</span><span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{position.empresaGrupo}</span></div>
            <p className="mt-3 text-xs text-gray-600"><span className="font-semibold text-gray-800">Categoría:</span> {position.categoria}</p>
            {position.dependenciaFuncionalNombre && <p className="mt-1 text-xs text-gray-600"><span className="font-semibold text-gray-800">Dependencia funcional:</span> {position.dependenciaFuncionalNombre}</p>}
          </div>
        </div>
      </article>
      {children.length > 0 && <div className="relative mt-4 space-y-4 border-l-2 border-gray-200 pl-5"><div className="grid gap-4 xl:grid-cols-2">{children.map(child => <OrganizationBranch key={child.id} position={child} fullPositions={source} depth={depth + 1} onEdit={onEdit} isSuperAdmin={isSuperAdmin} />)}</div></div>}
    </div>
  );
}

export default function OrganizationChartPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [data, setData] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingCategories, setRefreshingCategories] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'organigrama' | 'directorio' | 'historial'>('organigrama');
  const [referenceDate, setReferenceDate] = useState(TODAY);
  const [companyFilter, setCompanyFilter] = useState('todos');
  const [departmentFilter, setDepartmentFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/empleados/organigrama?fecha=${referenceDate}&historial=1`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo cargar el organigrama');
      setData(json);
    } catch (loadError: any) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [referenceDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const departments = useMemo(() => [...new Set((data?.puestos || []).map(position => position.departamento))].sort(), [data]);
  const filteredPositions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-ES');
    return (data?.puestos || []).filter(position => {
      if (companyFilter !== 'todos' && position.empresaGrupo !== companyFilter) return false;
      if (departmentFilter !== 'todos' && position.departamento !== departmentFilter) return false;
      if (query && !`${position.nombreCompleto} ${position.email || ''} ${position.cargo} ${position.categoria}`.toLocaleLowerCase('es-ES').includes(query)) return false;
      return true;
    });
  }, [data, companyFilter, departmentFilter, search]);

  const openEditor = (position?: Position, employee?: EmployeeOption) => {
    const targetId = position?.empleadoId || employee?.id || '';
    setEditing(position || null);
    setForm({
      empleadoId: targetId,
      empresaGrupo: position?.empresaGrupo || 'INTERNET OPERADORES',
      departamento: position?.departamento || employee?.departamento || '',
      cargo: position?.cargo || employee?.categoria || '',
      superiorId: position?.superiorId || '',
      dependenciaFuncionalId: position?.dependenciaFuncionalId || '',
      fechaInicio: position?.fechaInicio?.slice(0, 10) || TODAY,
      funciones: position?.funciones || '',
      notas: position?.notas || '',
      ordenOrganigrama: position?.ordenOrganigrama || 0,
      mostrarEnOrganigrama: position?.mostrarEnOrganigrama ?? true,
      preservarHistorico: true,
    });
    setNotice('');
    setError('');
  };

  const closeEditor = () => { setEditing(null); setForm(EMPTY_FORM); };

  const savePosition = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/empleados/organigrama', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'guardar', ...form }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo guardar');
      setNotice(form.preservarHistorico ? 'La estructura se ha guardado conservando la trazabilidad organizativa.' : 'El puesto actual se ha actualizado.');
      closeEditor();
      await loadData();
    } catch (saveError: any) { setError(saveError.message); } finally { setSaving(false); }
  };

  const refreshCategories = async () => {
    setRefreshingCategories(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/empleados/organigrama', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refrescar_categorias' }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudieron actualizar las categorías');
      setNotice(`${json.actualizadas} categorías actualizadas desde la última nómina${json.errores ? `; ${json.errores} requieren revisión` : ''}.`);
      await loadData();
    } catch (refreshError: any) { setError(refreshError.message); } finally { setRefreshingCategories(false); }
  };

  const roots = filteredPositions.filter(position => !position.superiorId || !filteredPositions.some(candidate => candidate.empleadoId === position.superiorId));
  const printUrl = (type: 'organigrama' | 'directorio') => `/api/admin/empleados/organigrama/informe?fecha=${referenceDate}&tipo=${type}&empresa=${encodeURIComponent(companyFilter)}&departamento=${encodeURIComponent(departmentFilter)}`;

  if (loading && !data) return <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600">Cargando estructura organizativa…</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-600">Personal · Organización</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Organigrama corporativo</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Estructura jerárquica y funcional del grupo. La categoría profesional procede de nómina cuando está disponible; el cargo y las dependencias reflejan la organización interna.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={printUrl('organigrama')} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"><PrinterIcon className="h-5 w-5" /> Imprimir organigrama</a>
            <a href={printUrl('directorio')} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"><ListBulletIcon className="h-5 w-5" /> Imprimir directorio</a>
            {isSuperAdmin && <button type="button" onClick={refreshCategories} disabled={refreshingCategories} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"><ArrowPathIcon className={`h-5 w-5 ${refreshingCategories ? 'animate-spin' : ''}`} /> Categorías de nómina</button>}
          </div>
        </div>
      </section>

      {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Personas', data?.resumen.empleados || 0, UsersIcon, 'text-gray-900'],
          ['Empresas', data?.resumen.empresas || 0, BuildingOffice2Icon, 'text-violet-700'],
          ['Departamentos', data?.resumen.departamentos || 0, Squares2X2Icon, 'text-sky-700'],
          ['Categorías de nómina', `${data?.resumen.categoriasDesdeNomina || 0}/${data?.resumen.empleados || 0}`, IdentificationIcon, 'text-emerald-700'],
          ['Raíces jerárquicas', data?.resumen.sinSuperior || 0, UserGroupIcon, 'text-orange-700'],
        ].map(([label, value, Icon, color]) => (
          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><Icon className={`h-5 w-5 ${color}`} /><p className={`mt-3 text-2xl font-bold ${color}`}>{String(value)}</p><p className="mt-1 text-xs font-medium text-gray-500">{String(label)}</p></div>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Fecha de estructura</span><input type="date" value={referenceDate} onChange={event => setReferenceDate(event.target.value)} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900" /></label>
          <label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Empresa</span><select value={companyFilter} onChange={event => setCompanyFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900"><option value="todos">Todas</option>{data?.empresasGrupo.map(company => <option key={company} value={company}>{company}</option>)}</select></label>
          <label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Departamento</span><select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900"><option value="todos">Todos</option>{departments.map(department => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="text-sm font-semibold text-gray-700 xl:col-span-2"><span className="mb-1 block">Buscar</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre, correo, cargo o categoría" className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900 placeholder:text-gray-400" /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {[['organigrama', 'Organigrama', Squares2X2Icon], ['directorio', 'Directorio', ListBulletIcon], ['historial', 'Histórico', CalendarDaysIcon]].map(([id, label, Icon]) => <button key={String(id)} type="button" onClick={() => setView(id as any)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${view === id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Icon className="h-5 w-5" />{String(label)}</button>)}
          {isSuperAdmin && (data?.empleadosSinPuesto.length || 0) > 0 && <button type="button" onClick={() => openEditor(undefined, data!.empleadosSinPuesto[0])} className="ml-auto min-h-11 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">Añadir persona sin puesto ({data?.empleadosSinPuesto.length})</button>}
        </div>
      </section>

      {view === 'organigrama' && <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-6"><div className="mx-auto max-w-7xl space-y-6">{roots.length ? roots.map(root => <OrganizationBranch key={root.id} position={root} fullPositions={filteredPositions} depth={0} onEdit={openEditor} isSuperAdmin={isSuperAdmin} />) : <div className="py-12 text-center text-gray-500">No hay puestos que coincidan con los filtros.</div>}</div></section>}

      {view === 'directorio' && <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="hidden overflow-x-auto lg:block"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr>{['Persona', 'Empresa', 'Departamento', 'Cargo', 'Categoría', 'Superior', 'Dependencia funcional', ''].map(title => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{filteredPositions.map(position => <tr key={position.id} className="hover:bg-gray-50"><td className="px-4 py-4"><p className="font-semibold text-gray-950">{position.nombreCompleto}</p><p className="mt-0.5 text-xs text-gray-500">{position.email || 'Sin correo'}</p></td><td className="px-4 py-4 text-gray-700">{position.empresaGrupo}</td><td className="px-4 py-4 text-gray-700">{position.departamento}</td><td className="px-4 py-4 font-medium text-gray-900">{position.cargo}</td><td className="px-4 py-4"><p className="text-gray-800">{position.categoria}</p><p className="mt-0.5 text-xs text-gray-500">{position.categoriaOrigen === 'nomina' ? `Nómina ${String(position.categoriaNominaMes).padStart(2, '0')}/${position.categoriaNominaAnio}` : 'Ficha del empleado'}</p></td><td className="px-4 py-4 text-gray-700">{position.superiorNombre || 'Raíz'}</td><td className="px-4 py-4 text-gray-700">{position.dependenciaFuncionalNombre || '—'}</td><td className="px-4 py-4">{isSuperAdmin && <button type="button" onClick={() => openEditor(position)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Editar</button>}</td></tr>)}</tbody></table></div><div className="divide-y divide-gray-100 lg:hidden">{filteredPositions.map(position => <article key={position.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-950">{position.nombreCompleto}</h3><p className="text-sm font-semibold text-orange-600">{position.cargo}</p></div>{isSuperAdmin && <button type="button" onClick={() => openEditor(position)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-gray-100"><PencilSquareIcon className="h-5 w-5" /></button>}</div><dl className="mt-4 grid gap-2 text-sm"><div><dt className="text-xs font-semibold uppercase text-gray-500">Empresa y departamento</dt><dd className="text-gray-800">{position.empresaGrupo} · {position.departamento}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Categoría de nómina</dt><dd className="text-gray-800">{position.categoria}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Dependencia</dt><dd className="text-gray-800">{position.superiorNombre || 'Raíz'}{position.dependenciaFuncionalNombre ? ` · Funcional: ${position.dependenciaFuncionalNombre}` : ''}</dd></div></dl></article>)}</div></section>}

      {view === 'historial' && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-950">Histórico organizativo</h2><p className="mt-1 text-sm text-gray-600">Cada cambio con fecha efectiva puede conservar la etapa anterior para justificar dependencias y autorizaciones futuras.</p><div className="mt-5 space-y-3">{(data?.historial || []).filter(position => !search || position.nombreCompleto.toLocaleLowerCase('es-ES').includes(search.toLocaleLowerCase('es-ES'))).map(position => <article key={position.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-bold text-gray-950">{position.nombreCompleto}</h3><p className="text-sm font-semibold text-orange-600">{position.cargo} · {position.departamento}</p><p className="mt-2 text-sm text-gray-600">Superior: {position.superiorNombre || 'Raíz'}{position.dependenciaFuncionalNombre ? ` · Dependencia funcional: ${position.dependenciaFuncionalNombre}` : ''}</p></div><div className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">{formatDate(position.fechaInicio)} — {formatDate(position.fechaFin)}</div></div></article>)}</div></section>}

      {form.empleadoId && isSuperAdmin && <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 sm:items-center sm:p-6"><div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-5 py-4 sm:px-6"><div><h2 className="text-xl font-bold text-gray-950">{editing ? 'Editar puesto organizativo' : 'Añadir al organigrama'}</h2><p className="mt-1 text-sm text-gray-500">{data?.empleados.find(employee => employee.id === form.empleadoId)?.nombreCompleto}</p></div><button type="button" onClick={closeEditor} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"><XMarkIcon className="h-6 w-6" /></button></div><div className="space-y-5 p-5 sm:p-6"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><strong>Cargo y categoría son conceptos distintos.</strong> El cargo describe la responsabilidad interna; la categoría se obtiene de la nómina y no se edita aquí.</div><div className="grid gap-4 sm:grid-cols-2">{!editing && <label className="text-sm font-semibold text-gray-700 sm:col-span-2"><span className="mb-1 block">Empleado</span><select value={form.empleadoId} onChange={event => { const employee = data?.empleados.find(item => item.id === event.target.value); setForm(current => ({ ...current, empleadoId: event.target.value, departamento: current.departamento || employee?.departamento || '', cargo: current.cargo || employee?.categoria || '' })); }} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900">{data?.empleadosSinPuesto.map(employee => <option key={employee.id} value={employee.id}>{employee.nombreCompleto}</option>)}</select></label>}<label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Empresa del grupo</span><select value={form.empresaGrupo} onChange={event => setForm(current => ({ ...current, empresaGrupo: event.target.value }))} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900">{data?.empresasGrupo.map(company => <option key={company} value={company}>{company}</option>)}</select></label><label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Departamento</span><input value={form.departamento} onChange={event => setForm(current => ({ ...current, departamento: event.target.value }))} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900" /></label><label className="text-sm font-semibold text-gray-700 sm:col-span-2"><span className="mb-1 block">Cargo organizativo</span><input value={form.cargo} onChange={event => setForm(current => ({ ...current, cargo: event.target.value }))} placeholder="Ej. Responsable técnico" className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900" /></label><label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Superior inmediato</span><select value={form.superiorId} onChange={event => setForm(current => ({ ...current, superiorId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900"><option value="">Sin superior / raíz</option>{data?.empleados.filter(employee => employee.id !== form.empleadoId).map(employee => <option key={employee.id} value={employee.id}>{employee.nombreCompleto}</option>)}</select></label><label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Dependencia funcional</span><select value={form.dependenciaFuncionalId} onChange={event => setForm(current => ({ ...current, dependenciaFuncionalId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900"><option value="">No aplica</option>{data?.empleados.filter(employee => employee.id !== form.empleadoId).map(employee => <option key={employee.id} value={employee.id}>{employee.nombreCompleto}</option>)}</select></label><label className="text-sm font-semibold text-gray-700"><span className="mb-1 block">Fecha efectiva</span><input type="date" value={form.fechaInicio} onChange={event => setForm(current => ({ ...current, fechaInicio: event.target.value }))} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900" /></label><label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700"><input type="checkbox" checked={form.mostrarEnOrganigrama} onChange={event => setForm(current => ({ ...current, mostrarEnOrganigrama: event.target.checked }))} className="h-5 w-5 rounded" /> Mostrar en el organigrama</label><label className="text-sm font-semibold text-gray-700 sm:col-span-2"><span className="mb-1 block">Funciones principales</span><textarea rows={3} value={form.funciones} onChange={event => setForm(current => ({ ...current, funciones: event.target.value }))} placeholder="Responsabilidades, ámbito de decisión y funciones principales" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900" /></label><label className="text-sm font-semibold text-gray-700 sm:col-span-2"><span className="mb-1 block">Notas internas</span><textarea rows={2} value={form.notas} onChange={event => setForm(current => ({ ...current, notas: event.target.value }))} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900" /></label></div>{editing && <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" checked={form.preservarHistorico} onChange={event => setForm(current => ({ ...current, preservarHistorico: event.target.checked }))} className="mt-0.5 h-5 w-5 rounded" /><span><strong>Conservar la etapa anterior.</strong> Si la fecha efectiva es posterior al inicio actual, se cerrará la etapa anterior el día previo y se creará una nueva. Desmárcalo solo para corregir un dato del puesto vigente.</span></label>}<div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={closeEditor} className="min-h-11 rounded-xl border border-gray-300 px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button><button type="button" onClick={savePosition} disabled={saving || !form.departamento || !form.cargo} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar estructura'}</button></div></div></div></div>}
    </div>
  );
}
