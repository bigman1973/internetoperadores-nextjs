'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const PermisosUsuarioModal = dynamic(() => import('./PermisosUsuarioModal'), { ssr: false });
const UsuarioEditorModal = dynamic(() => import('../../app/admin/usuarios/UsuarioEditorModal'), { ssr: false });
const PerfilEditorModal = dynamic(() => import('../../app/admin/usuarios/PerfilEditorModal'), { ssr: false });

interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  roles: string[];
  activo: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
  perfilAsignado?: string | null;
}

interface Perfil {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  permisos: Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }>;
  activo: boolean;
}

interface Area {
  id: string;
  codigo: string;
  nombre: string;
  padre: string | null;
}

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', color: 'bg-red-100 text-red-800' },
  { value: 'GERENTE', label: 'Gerente', color: 'bg-purple-100 text-purple-800' },
  { value: 'MARKETING', label: 'Marketing', color: 'bg-pink-100 text-pink-800' },
  { value: 'VENTAS', label: 'Ventas', color: 'bg-blue-100 text-blue-800' },
  { value: 'CONTABILIDAD', label: 'Contabilidad', color: 'bg-green-100 text-green-800' },
  { value: 'RRHH', label: 'RRHH', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'VISOR', label: 'Visor (Solo Portal)', color: 'bg-gray-100 text-gray-800' },
];

export default function UsuariosAdminClient() {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'perfiles'>('usuarios');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [perfilesLoaded, setPerfilesLoaded] = useState(false);
  const [perfilesLoading, setPerfilesLoading] = useState(false);
  const perfilesRequestRef = useRef<Promise<void> | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    nombre: '',
    password: '',
    rol: 'VISOR',
    roles: [] as string[],
    activo: true,
    perfilId: '', // Perfil a aplicar
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [permisosUser, setPermisosUser] = useState<{id: number, nombre: string} | null>(null);

  // Perfiles editor state
  const [showPerfilModal, setShowPerfilModal] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<Perfil | null>(null);
  const [expandedPerfilAreas, setExpandedPerfilAreas] = useState<Set<string>>(new Set());
  const [perfilForm, setPerfilForm] = useState({
    nombre: '',
    descripcion: '',
    color: '#6366f1',
    permisos: [] as Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }>,
  });

  useEffect(() => {
    const fetchInitialUsuarios = async () => {
      try {
        const res = await fetch('/api/admin/usuarios');
        const data = await res.json();
        setUsuarios(data.usuarios || []);
      } catch (err) {
        console.error('Error fetching usuarios:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialUsuarios();
  }, []);

  const fetchUsuarios = async () => {
    try {
      const res = await fetch('/api/admin/usuarios');
      const data = await res.json();
      setUsuarios(data.usuarios || []);
    } catch (err) {
      console.error('Error fetching usuarios:', err);
    }
  };

  const fetchPerfiles = async (force = false) => {
    if (!force && perfilesLoaded) return;
    if (!force && perfilesRequestRef.current) return perfilesRequestRef.current;

    const request = (async () => {
      setPerfilesLoading(true);
      try {
        const res = await fetch('/api/admin/permisos?action=perfiles');
        const data = await res.json();
        setPerfiles(data.perfiles || []);
        setPerfilesLoaded(true);
      } catch (err) {
        console.error('Error fetching perfiles:', err);
      } finally {
        setPerfilesLoading(false);
      }
    })();

    perfilesRequestRef.current = request;
    try {
      await request;
    } finally {
      if (perfilesRequestRef.current === request) {
        perfilesRequestRef.current = null;
      }
    }
  };

  const fetchAreas = async () => {
    if (areas.length > 0) return;
    try {
      const res = await fetch('/api/admin/permisos?action=areas');
      const data = await res.json();
      setAreas(data.areas || []);
    } catch (err) {
      console.error('Error fetching áreas:', err);
    }
  };

  const openCreateModal = async () => {
    setEditingUser(null);
    setFormData({ email: '', nombre: '', password: '', rol: 'VISOR', roles: [], activo: true, perfilId: '' });
    setError('');
    await fetchPerfiles();
    setShowModal(true);
  };

  const openEditModal = async (user: Usuario) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      nombre: user.nombre,
      password: '',
      rol: user.rol,
      roles: user.roles || [user.rol],
      activo: user.activo,
      perfilId: '',
    });
    setError('');
    await fetchPerfiles();
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editingUser) {
        const body: any = {
          nombre: formData.nombre,
          rol: formData.rol,
          roles: formData.roles,
          activo: formData.activo,
        };
        if (formData.password) {
          body.password = formData.password;
        }

        const res = await fetch(`/api/admin/usuarios/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al actualizar usuario');
        }

        // Aplicar perfil si se seleccionó uno
        if (formData.perfilId) {
          await fetch('/api/admin/permisos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'aplicar_perfil', usuarioId: editingUser.id, perfilId: formData.perfilId }),
          });
        }

        setSuccessMsg('Usuario actualizado correctamente');
      } else {
        if (!formData.password) {
          setError('La contraseña es obligatoria para nuevos usuarios');
          setSaving(false);
          return;
        }

        const res = await fetch('/api/admin/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            nombre: formData.nombre,
            password: formData.password,
            rol: formData.rol,
            roles: formData.roles,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al crear usuario');
        }

        const created = await res.json();

        // Aplicar perfil si se seleccionó uno
        if (formData.perfilId && created.usuario?.id) {
          await fetch('/api/admin/permisos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'aplicar_perfil', usuarioId: created.usuario.id, perfilId: formData.perfilId }),
          });
        }

        setSuccessMsg('Usuario creado correctamente');
      }

      setShowModal(false);
      fetchUsuarios();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: Usuario) => {
    try {
      const res = await fetch(`/api/admin/usuarios/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !user.activo }),
      });

      if (res.ok) {
        fetchUsuarios();
        setSuccessMsg(`Usuario ${!user.activo ? 'activado' : 'desactivado'} correctamente`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error toggling user:', err);
    }
  };

  const handleDelete = async (user: Usuario) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${user.nombre}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/usuarios/${user.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchUsuarios();
        setSuccessMsg('Usuario eliminado correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  // --- Perfiles ---
  const openCreatePerfil = async () => {
    await fetchAreas();
    setEditingPerfil(null);
    setPerfilForm({ nombre: '', descripcion: '', color: '#6366f1', permisos: [] });
    setShowPerfilModal(true);
  };

  const openEditPerfil = async (perfil: Perfil) => {
    await fetchAreas();
    setEditingPerfil(perfil);
    setPerfilForm({
      nombre: perfil.nombre,
      descripcion: perfil.descripcion || '',
      color: perfil.color,
      permisos: perfil.permisos || [],
    });
    setShowPerfilModal(true);
  };

  const handleSavePerfil = async () => {
    if (!perfilForm.nombre.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'guardar_perfil',
          id: editingPerfil?.id || undefined,
          nombre: perfilForm.nombre.trim(),
          descripcion: perfilForm.descripcion.trim() || null,
          color: perfilForm.color,
          permisos: perfilForm.permisos,
        }),
      });
      setShowPerfilModal(false);
      fetchPerfiles(true);
      setSuccessMsg(editingPerfil ? 'Perfil actualizado' : 'Perfil creado');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error guardando perfil:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePerfil = async (perfil: Perfil) => {
    if (!confirm(`¿Eliminar el perfil "${perfil.nombre}"? Los usuarios que lo tenían aplicado conservarán sus permisos actuales.`)) return;
    try {
      await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'eliminar_perfil', id: perfil.id }),
      });
      fetchPerfiles(true);
      setSuccessMsg('Perfil eliminado');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error eliminando perfil:', err);
    }
  };

  const togglePerfilPermiso = (areaCodigo: string, tipo: 'lectura' | 'escritura') => {
    setPerfilForm(prev => {
      const existing = prev.permisos.find(p => p.areaCodigo === areaCodigo);
      if (existing) {
        if (tipo === 'escritura') {
          const newVal = !existing.escritura;
          return {
            ...prev,
            permisos: prev.permisos.map(p =>
              p.areaCodigo === areaCodigo
                ? { ...p, escritura: newVal, lectura: newVal ? true : p.lectura }
                : p
            ),
          };
        } else {
          const newVal = !existing.lectura;
          return {
            ...prev,
            permisos: prev.permisos.map(p =>
              p.areaCodigo === areaCodigo
                ? { ...p, lectura: newVal, escritura: newVal ? p.escritura : false }
                : p
            ),
          };
        }
      } else {
        return {
          ...prev,
          permisos: [...prev.permisos, {
            areaCodigo,
            lectura: true,
            escritura: tipo === 'escritura',
          }],
        };
      }
    });
  };

  const togglePerfilGrupo = (parentCodigo: string, tipo: 'lectura' | 'escritura', value: boolean) => {
    const areasGrupo = areas.filter(a => a.codigo === parentCodigo || a.codigo.startsWith(parentCodigo + '.'));
    setPerfilForm(prev => {
      let updated = [...prev.permisos];
      for (const area of areasGrupo) {
        const existing = updated.find(p => p.areaCodigo === area.codigo);
        if (existing) {
          if (tipo === 'escritura') {
            updated = updated.map(p => p.areaCodigo === area.codigo ? { ...p, escritura: value, lectura: value ? true : p.lectura } : p);
          } else {
            updated = updated.map(p => p.areaCodigo === area.codigo ? { ...p, lectura: value, escritura: value ? p.escritura : false } : p);
          }
        } else if (value) {
          updated.push({ areaCodigo: area.codigo, lectura: true, escritura: tipo === 'escritura' });
        }
      }
      return { ...prev, permisos: updated };
    });
  };

  const toggleExpandedPerfilArea = (areaCodigo: string) => {
    setExpandedPerfilAreas(prev => {
      const next = new Set(prev);
      if (next.has(areaCodigo)) next.delete(areaCodigo);
      else next.add(areaCodigo);
      return next;
    });
  };

  const getRolBadge = (rol: string) => {
    const rolInfo = ROLES.find(r => r.value === rol);
    return rolInfo || { label: rol, color: 'bg-gray-100 text-gray-800' };
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">USUARIOS Y PERMISOS</h1>
            <p className="mt-1 text-sm text-gray-500">Gestión de usuarios, roles y perfiles de permisos.</p>
          </div>
          <div className="mt-4 h-11 w-40 rounded-md bg-gray-100 sm:mt-0" />
        </div>
        <div className="border-b border-gray-200"><div className="h-11 w-72 rounded-t bg-gray-100" /></div>
        <div className="h-24 rounded-md border border-blue-100 bg-blue-50" />
        <div className="min-h-[24rem] overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
          <div className="min-w-[800px] divide-y divide-gray-200">
            <div className="h-12 bg-gray-50" />
            {[...Array(5)].map((_, index) => <div key={index} className="h-20 animate-pulse bg-gray-50/50" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">USUARIOS Y PERMISOS</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestión de usuarios, roles y perfiles de permisos. {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          {activeTab === 'usuarios' && (
            <button
              onClick={openCreateModal}
              className="inline-flex min-h-11 items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nuevo Usuario
            </button>
          )}
          {activeTab === 'perfiles' && (
            <button
              onClick={openCreatePerfil}
              className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nuevo Perfil
            </button>
          )}
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="rounded-md bg-green-50 p-4 border border-green-200">
          <p className="text-sm text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`min-h-11 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'usuarios'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-1.053M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              Usuarios ({usuarios.length})
            </span>
          </button>
          <button
            onClick={() => {
              setActiveTab('perfiles');
              fetchPerfiles();
            }}
            className={`min-h-11 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'perfiles'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Perfiles de Permisos ({perfiles.length})
            </span>
          </button>
        </nav>
      </div>

      {/* Info sobre Microsoft */}
      {activeTab === 'usuarios' && (
        <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
          <div className="flex">
            <svg className="h-5 w-5 text-blue-400 mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div>
              <p className="text-sm text-blue-800">
                <strong>Autenticación Microsoft:</strong> Los usuarios @internetoperadores.com se auto-crean como <strong>Visor</strong> (solo portal empleado).
                Para dar acceso al panel admin, asigna un perfil de permisos o cambia el rol.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Usuarios */}
      {activeTab === 'usuarios' && (
        <div className="overflow-x-auto rounded-lg bg-white shadow border border-gray-200">
          <table className="min-w-[800px] divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último acceso</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {usuarios.map((user) => {
                const displayRoles = user.roles && user.roles.length > 0 ? user.roles : [user.rol];
                return (
                  <tr key={user.id} className={!user.activo ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.nombre}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {displayRoles.map((r) => {
                          const badge = getRolBadge(r);
                          return (
                            <span key={r} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                              {badge.label}
                            </span>
                          );
                        })}
                        {user.perfilAsignado && (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200">
                            {user.perfilAsignado}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`inline-flex min-h-11 items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer ${
                          user.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        <span className={`mr-1.5 h-2 w-2 rounded-full ${user.activo ? 'bg-green-400' : 'bg-red-400'}`}></span>
                        {user.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.ultimoAcceso)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setPermisosUser({ id: user.id, nombre: user.nombre })}
                        className="mr-3 inline-flex min-h-11 min-w-11 items-center text-indigo-600 hover:text-indigo-900"
                      >
                        Permisos
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="mr-3 inline-flex min-h-11 min-w-11 items-center text-orange-600 hover:text-orange-900"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="inline-flex min-h-11 min-w-11 items-center text-red-600 hover:text-red-900"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: Perfiles de Permisos */}
      {activeTab === 'perfiles' && (
        <div className="space-y-4">
          <div className="rounded-md bg-indigo-50 p-4 border border-indigo-200">
            <p className="text-sm text-indigo-800">
              <strong>Perfiles de permisos:</strong> Define conjuntos de permisos reutilizables. Al aplicar un perfil a un usuario,
              se le asignan automáticamente todos los permisos del perfil. Puedes crear, editar y eliminar perfiles.
            </p>
          </div>

          {perfilesLoading ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200 text-sm text-gray-500">
              Cargando perfiles de permisos...
            </div>
          ) : perfiles.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay perfiles creados</h3>
              <p className="mt-1 text-sm text-gray-500">Crea un perfil para definir un conjunto de permisos reutilizable.</p>
              <button onClick={openCreatePerfil} className="mt-4 text-sm text-indigo-600 font-medium hover:text-indigo-500">
                + Crear primer perfil
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {perfiles.map((perfil) => {
                const numPermisos = perfil.permisos?.filter(p => p.lectura || p.escritura).length || 0;
                return (
                  <div key={perfil.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: perfil.color }}></div>
                        <h3 className="text-sm font-bold text-gray-900">{perfil.nombre}</h3>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditPerfil(perfil)}
                          className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                          title="Editar perfil"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeletePerfil(perfil)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Eliminar perfil"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {perfil.descripcion && (
                      <p className="mt-1 text-xs text-gray-500">{perfil.descripcion}</p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {numPermisos} áreas con acceso
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Áreas incluidas:</p>
                      <div className="flex flex-wrap gap-1">
                        {perfil.permisos?.filter(p => p.lectura).slice(0, 5).map(p => (
                          <span key={p.areaCodigo} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {p.areaCodigo.replace('admin.', '').replace(/\./g, ' > ')}
                          </span>
                        ))}
                        {(perfil.permisos?.filter(p => p.lectura).length || 0) > 5 && (
                          <span className="text-[9px] text-gray-400">+{(perfil.permisos?.filter(p => p.lectura).length || 0) - 5} más</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Crear/Editar Usuario */}
      {showModal && (
        <UsuarioEditorModal
          editingUser={editingUser}
          formData={formData}
          perfiles={perfiles}
          roles={ROLES}
          saving={saving}
          error={error}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          onFormDataChange={setFormData}
          onOpenPermisos={(user) => {
            setShowModal(false);
            setPermisosUser({ id: user.id, nombre: user.nombre });
          }}
        />
      )}

      {/* Modal Crear/Editar Perfil */}
      {showPerfilModal && (
        <PerfilEditorModal
          editingPerfil={editingPerfil}
          areas={areas}
          expandedPerfilAreas={expandedPerfilAreas}
          perfilForm={perfilForm}
          saving={saving}
          onClose={() => setShowPerfilModal(false)}
          onPerfilFormChange={setPerfilForm}
          onToggleExpanded={toggleExpandedPerfilArea}
          onTogglePermiso={togglePerfilPermiso}
          onToggleGrupo={togglePerfilGrupo}
          onSave={handleSavePerfil}
        />
      )}

      {/* Modal Permisos Granulares */}
      {permisosUser && (
        <PermisosUsuarioModal
          usuarioId={permisosUser.id}
          usuarioNombre={permisosUser.nombre}
          onClose={() => setPermisosUser(null)}
        />
      )}
    </div>
  );
}
