'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';

interface NodoOrganigrama {
  id: string;
  nombre: string;
  rol: string;
  tipoEntidad: string;
  empresa: string | null;
  ubicacion: string;
  departamento: string | null;
  esColaborador: boolean;
  especialidad: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  reportaAId: string | null;
  orden: number;
}

const TIPOS_ENTIDAD = [
  { value: 'interno', label: 'Interno Draxton', color: 'bg-sky-100 border-sky-300 text-sky-900' },
  { value: 'io', label: 'Internet Operadores', color: 'bg-orange-100 border-orange-300 text-orange-900' },
  { value: 'externo', label: 'Empresa externa', color: 'bg-amber-100 border-amber-300 text-amber-900' },
];

const UBICACIONES = ['HQ', 'BCN', 'LLEIDA', 'REMOTO'];

const emptyForm = {
  nombre: '', rol: '', tipoEntidad: 'interno', empresa: '', ubicacion: 'HQ',
  departamento: '', esColaborador: false, especialidad: '', email: '', telefono: '',
  notas: '', reportaAId: '',
};

export default function OrganigramaDraxtonPage() {
  const [nodos, setNodos] = useState<NodoOrganigrama[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filtroUbicacion, setFiltroUbicacion] = useState('todos');

  useEffect(() => { fetchNodos(); }, []);

  async function fetchNodos() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/organigrama');
      const data = await res.json();
      setNodos(data.nodos || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // Construir árbol jerárquico
  const arbol = useMemo(() => {
    const orgNodos = nodos.filter(n => !n.esColaborador);
    const raices = orgNodos.filter(n => !n.reportaAId);
    function buildTree(parentId: string | null): NodoOrganigrama[] {
      return orgNodos
        .filter(n => n.reportaAId === parentId)
        .sort((a, b) => a.orden - b.orden);
    }
    return { raices, buildTree };
  }, [nodos]);

  const colaboradores = useMemo(() => nodos.filter(n => n.esColaborador), [nodos]);

  const nodosFiltrados = useMemo(() => {
    if (filtroUbicacion === 'todos') return nodos;
    return nodos.filter(n => n.ubicacion === filtroUbicacion);
  }, [nodos, filtroUbicacion]);

  function openNew(reportaAId?: string) {
    setEditingId(null);
    setForm({ ...emptyForm, reportaAId: reportaAId || '' });
    setShowModal(true);
  }

  function openEdit(nodo: NodoOrganigrama) {
    setEditingId(nodo.id);
    setForm({
      nombre: nodo.nombre,
      rol: nodo.rol,
      tipoEntidad: nodo.tipoEntidad,
      empresa: nodo.empresa || '',
      ubicacion: nodo.ubicacion,
      departamento: nodo.departamento || '',
      esColaborador: nodo.esColaborador,
      especialidad: nodo.especialidad || '',
      email: nodo.email || '',
      telefono: nodo.telefono || '',
      notas: nodo.notas || '',
      reportaAId: nodo.reportaAId || '',
    });
    setShowModal(true);
  }

  async function guardar() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        reportaAId: form.reportaAId || null,
        empresa: form.empresa || null,
        departamento: form.departamento || null,
        especialidad: form.especialidad || null,
        email: form.email || null,
        telefono: form.telefono || null,
        notas: form.notas || null,
      };

      if (editingId) {
        await fetch('/api/admin/clientes/ggcc/draxton/organigrama', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        await fetch('/api/admin/clientes/ggcc/draxton/organigrama', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      await fetchNodos();
    } finally { setSaving(false); }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este nodo del organigrama?')) return;
    await fetch(`/api/admin/clientes/ggcc/draxton/organigrama?id=${id}`, { method: 'DELETE' });
    await fetchNodos();
  }

  function getTipoStyle(tipo: string) {
    return TIPOS_ENTIDAD.find(t => t.value === tipo)?.color || 'bg-gray-100 border-gray-300 text-gray-900';
  }

  function getTipoLabel(tipo: string) {
    return TIPOS_ENTIDAD.find(t => t.value === tipo)?.label || tipo;
  }

  // Componente de nodo del árbol
  function NodoArbol({ nodo, nivel }: { nodo: NodoOrganigrama; nivel: number }) {
    const hijos = arbol.buildTree(nodo.id);
    const tipoStyle = getTipoStyle(nodo.tipoEntidad);

    return (
      <div className="flex flex-col items-center">
        {/* Nodo */}
        <div
          className={`relative border-2 rounded-lg px-4 py-3 min-w-[160px] max-w-[200px] text-center cursor-pointer hover:shadow-md transition-shadow ${tipoStyle}`}
          onClick={() => openEdit(nodo)}
        >
          <p className="font-semibold text-sm leading-tight">{nodo.nombre}</p>
          <p className="text-xs mt-0.5 opacity-80">{nodo.rol}</p>
          {nodo.empresa && nodo.tipoEntidad !== 'interno' && (
            <p className="text-xs font-medium mt-0.5">{nodo.empresa}</p>
          )}
          <p className="text-[10px] mt-1 opacity-60">{nodo.ubicacion}</p>
        </div>

        {/* Hijos */}
        {hijos.length > 0 && (
          <>
            {/* Línea vertical hacia abajo */}
            <div className="w-px h-6 bg-gray-300" />
            {/* Línea horizontal */}
            {hijos.length > 1 && (
              <div className="relative w-full flex justify-center">
                <div className="absolute top-0 h-px bg-gray-300" style={{
                  left: `${50 / hijos.length}%`,
                  right: `${50 / hijos.length}%`,
                }} />
              </div>
            )}
            <div className="flex gap-4 items-start">
              {hijos.map(hijo => (
                <div key={hijo.id} className="flex flex-col items-center">
                  <div className="w-px h-6 bg-gray-300" />
                  <NodoArbol nodo={hijo} nivel={nivel + 1} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/clientes/ggcc/draxton" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organigrama IT · Draxton</h1>
            <p className="text-sm text-gray-500">Estructura del equipo IT con empresas externas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filtroUbicacion}
            onChange={e => setFiltroUbicacion(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm"
          >
            <option value="todos">Todas las ubicaciones</option>
            {UBICACIONES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => openNew()}
            className="flex items-center gap-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
          >
            <PlusIcon className="h-4 w-4" /> Añadir persona
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-medium text-gray-500">Leyenda:</span>
        {TIPOS_ENTIDAD.map(t => (
          <span key={t.value} className={`px-2 py-1 rounded border ${t.color}`}>{t.label}</span>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando organigrama...</div>
      ) : (
        <>
          {/* Organigrama visual */}
          <div className="bg-white rounded-xl border p-8 overflow-x-auto">
            <div className="flex justify-center min-w-[900px]">
              <div className="flex flex-col items-center gap-0">
                {arbol.raices.map(raiz => (
                  <NodoArbol key={raiz.id} nodo={raiz} nivel={0} />
                ))}
              </div>
            </div>
          </div>

          {/* Colaboradores externos */}
          {colaboradores.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <UserGroupIcon className="h-5 w-5 text-purple-600" />
                  Colaboradores Externos
                </h3>
                <button
                  onClick={() => { setEditingId(null); setForm({ ...emptyForm, esColaborador: true, tipoEntidad: 'externo' }); setShowModal(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700"
                >
                  <PlusIcon className="h-3 w-3" /> Añadir colaborador
                </button>
              </div>

              {/* Agrupar por empresa */}
              {(() => {
                const porEmpresa: Record<string, NodoOrganigrama[]> = {};
                colaboradores.forEach(c => {
                  const emp = c.empresa || 'Sin empresa';
                  if (!porEmpresa[emp]) porEmpresa[emp] = [];
                  porEmpresa[emp].push(c);
                });
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(porEmpresa).map(([empresa, cols]) => (
                      <div key={empresa} className="border rounded-lg p-3 bg-purple-50">
                        <h4 className="font-medium text-sm text-purple-800 mb-2 flex items-center gap-1">
                          <BuildingOfficeIcon className="h-4 w-4" />
                          {empresa}
                        </h4>
                        <div className="space-y-1.5">
                          {cols.map(c => (
                            <div key={c.id} className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium text-gray-900">{c.nombre}</span>
                                {c.especialidad && <span className="text-gray-500 ml-1">· {c.especialidad}</span>}
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-blue-600 p-0.5">
                                  <PencilIcon className="h-3 w-3" />
                                </button>
                                <button onClick={() => eliminar(c.id)} className="text-gray-400 hover:text-red-600 p-0.5">
                                  <TrashIcon className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Directorio completo */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">Directorio completo</h3>
              <p className="text-xs text-gray-500">Click en un nombre para editar</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Rol</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Empresa</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Ubicación</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Reporta a</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {nodosFiltrados.map(n => {
                    const superior = nodos.find(x => x.id === n.reportaAId);
                    return (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium cursor-pointer hover:text-orange-600" onClick={() => openEdit(n)}>
                          {n.nombre}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{n.rol}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTipoStyle(n.tipoEntidad)}`}>
                            {getTipoLabel(n.tipoEntidad)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{n.empresa || '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{n.ubicacion}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{superior?.nombre || '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => openEdit(n)} className="text-gray-400 hover:text-blue-600 p-1">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => eliminar(n.id)} className="text-gray-400 hover:text-red-600 p-1 ml-1">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal CRUD */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar persona' : 'Añadir persona al organigrama'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Nombre completo *</label>
                  <input type="text" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Ej: Alejandro Martinez" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Rol / Función *</label>
                  <input type="text" value={form.rol} onChange={e => setForm({...form, rol: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Ej: Advanced Support IT, Guardias" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Tipo</label>
                  <select value={form.tipoEntidad} onChange={e => setForm({...form, tipoEntidad: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm">
                    {TIPOS_ENTIDAD.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Empresa (si externo)</label>
                  <input type="text" value={form.empresa} onChange={e => setForm({...form, empresa: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" placeholder="IO, Inkoova, IPS..." />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Ubicación</label>
                  <select value={form.ubicacion} onChange={e => setForm({...form, ubicacion: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm">
                    {UBICACIONES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Departamento</label>
                  <input type="text" value={form.departamento} onChange={e => setForm({...form, departamento: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Infraestructura, ERP..." />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Reporta a</label>
                  <select value={form.reportaAId} onChange={e => setForm({...form, reportaAId: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm">
                    <option value="">— Nadie (nivel superior) —</option>
                    {nodos.filter(n => n.id !== editingId && !n.esColaborador).map(n => (
                      <option key={n.id} value={n.id}>{n.nombre} ({n.rol})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Teléfono</label>
                  <input type="text" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="esColaborador" checked={form.esColaborador}
                    onChange={e => setForm({...form, esColaborador: e.target.checked})} className="rounded" />
                  <label htmlFor="esColaborador" className="text-sm text-gray-700">Es colaborador externo (aparece en sección aparte)</label>
                </div>
                {form.esColaborador && (
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Especialidad</label>
                    <input type="text" value={form.especialidad} onChange={e => setForm({...form, especialidad: e.target.value})}
                      className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Soporte código .NET, Redes..." />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Notas</label>
                  <textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}
                    className="w-full px-3 py-1.5 border rounded text-sm" rows={2} />
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancelar</button>
              <button onClick={guardar} disabled={saving || !form.nombre || !form.rol}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
