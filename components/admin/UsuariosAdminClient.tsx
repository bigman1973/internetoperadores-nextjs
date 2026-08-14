'use client';

import { useState, useEffect } from 'react';
import PermisosUsuarioModal from './PermisosUsuarioModal';

interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  roles: string[];
  activo: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
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
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, perfilesRes, areasRes] = await Promise.all([
        fetch('/api/admin/usuarios'),
        fetch('/api/admin/permisos?action=perfiles'),
        fetch('/api/admin/permisos?action=areas'),
      ]);
      const usersData = await usersRes.json();
      const perfilesData = await perfilesRes.json();
      const areasData = await areasRes.json();
      setUsuarios(usersData.usuarios || []);
      setPerfiles(perfilesData.perfiles || []);
      setAreas(areasData.areas || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsuarios = async () => {
    try {
      const res = await fetch('/api/admin/usuarios');
      const data = await res.json();
      setUsuarios(data.usuarios || []);
    } catch (err) {
      console.error('Error fetching usuarios:', err);
    }
  };

  const fetchPerfiles = async () => {
    try {
      const res = await fetch('/api/admin/permisos?action=perfiles');
      const data = await res.json();
      setPerfiles(data.perfiles || []);
    } catch (err) {
      console.error('Error fetching perfiles:', err);
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({ email: '', nombre: '', password: '', rol: 'VISOR', roles: [], activo: true, perfilId: '' });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (user: Usuario) => {
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
  const openCreatePerfil = () => {
    setEditingPerfil(null);
    setPerfilForm({ nombre: '', descripcion: '', color: '#6366f1', permisos: [] });
    setShowPerfilModal(true);
  };

  const openEditPerfil = (perfil: Perfil) => {
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
      fetchPerfiles();
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
      fetchPerfiles();
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
      <div className="flex items-center justify-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
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
              className="inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
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
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
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
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
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
            onClick={() => setActiveTab('perfiles')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
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
        <div className="overflow-hidden rounded-lg bg-white shadow border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
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
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer ${
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
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Permisos
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-orange-600 hover:text-orange-900 mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="text-red-600 hover:text-red-900"
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

          {perfiles.length === 0 ? (
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
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowModal(false)}></div>
            <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>

              {error && (
                <div className="mb-4 rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre</label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Contraseña {editingUser && '(dejar vacío para no cambiar)'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
                    placeholder={editingUser ? '••••••••' : ''}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Rol Principal</label>
                  <select
                    value={formData.rol}
                    onChange={(e) => {
                      const newRol = e.target.value;
                      setFormData({
                        ...formData,
                        rol: newRol,
                        roles: newRol === 'VISOR' ? [] : (formData.roles.includes(newRol) ? formData.roles : [...formData.roles, newRol]),
                      });
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
                  >
                    {ROLES.map((rol) => (
                      <option key={rol.value} value={rol.value}>{rol.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Visor = solo portal empleado. Para acceso admin, selecciona otro rol o aplica un perfil.
                  </p>
                </div>

                {formData.rol !== 'VISOR' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Roles Adicionales</label>
                    <div className="space-y-2">
                      {ROLES.filter(r => r.value !== 'SUPER_ADMIN' && r.value !== 'VISOR').map((rol) => (
                        <label key={rol.value} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.roles.includes(rol.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, roles: [...formData.roles, rol.value] });
                              } else {
                                setFormData({ ...formData, roles: formData.roles.filter(r => r !== rol.value) });
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rol.color}`}>
                            {rol.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Aplicar perfil de permisos */}
                {perfiles.length > 0 && (
                  <div className="pt-3 border-t border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Aplicar Perfil de Permisos
                    </label>
                    <select
                      value={formData.perfilId}
                      onChange={(e) => setFormData({ ...formData, perfilId: e.target.value })}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="">— Sin cambios en permisos —</option>
                      {perfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} ({p.permisos?.filter(pp => pp.lectura).length || 0} áreas)</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Al seleccionar un perfil, se reemplazarán los permisos granulares actuales del usuario.
                    </p>
                  </div>
                )}

                {editingUser && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="activo"
                      checked={formData.activo}
                      onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <label htmlFor="activo" className="ml-2 text-sm text-gray-700">Usuario activo</label>
                  </div>
                )}

                {editingUser && (
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        setPermisosUser({ id: editingUser.id, nombre: editingUser.nombre });
                      }}
                      className="w-full rounded-md bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                      Gestionar Permisos Granulares
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : (editingUser ? 'Actualizar' : 'Crear Usuario')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear/Editar Perfil */}
      {showPerfilModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowPerfilModal(false)}></div>
            <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col transform overflow-hidden rounded-2xl bg-white shadow-2xl">
              {/* Header */}
              <div className="px-6 py-5 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {editingPerfil ? 'Editar Perfil' : 'Nuevo Perfil de Permisos'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5">Configura a qué secciones tendrá acceso este perfil</p>
                </div>
                <button onClick={() => setShowPerfilModal(false)} className="p-2 rounded-full hover:bg-white/80 text-gray-400 hover:text-gray-700 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Form fields */}
              <div className="px-6 py-4 border-b">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nombre</label>
                    <input
                      type="text"
                      value={perfilForm.nombre}
                      onChange={e => setPerfilForm({ ...perfilForm, nombre: e.target.value })}
                      placeholder="Ej: Técnico Draxton"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-medium focus:border-indigo-500 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Descripción</label>
                    <input
                      type="text"
                      value={perfilForm.descripcion}
                      onChange={e => setPerfilForm({ ...perfilForm, descripcion: e.target.value })}
                      placeholder="Ej: Acceso a GGCC Draxton y personal"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Color</label>
                    <input
                      type="color"
                      value={perfilForm.color}
                      onChange={e => setPerfilForm({ ...perfilForm, color: e.target.value })}
                      className="w-full h-[42px] rounded-lg border border-gray-300 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Leyenda compacta */}
              <div className="px-6 py-2.5 bg-indigo-50/50 border-b flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Ver = acceso de lectura
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Editar = crear, modificar y eliminar
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">Los subapartados heredan del padre</span>
              </div>

              {/* Áreas - Árbol recursivo */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-1.5">
                  {areas.filter(a => !a.padre).map(area => {
                    const renderAreaRecursive = (areaItem: Area, depth: number): React.ReactNode => {
                      const children = areas.filter(a => a.padre === areaItem.codigo);
                      const permiso = perfilForm.permisos.find(p => p.areaCodigo === areaItem.codigo);
                      const hasRead = permiso?.lectura || false;
                      const hasWrite = permiso?.escritura || false;
                      const isExpanded = expandedPerfilAreas.has(areaItem.codigo);
                      const displayName = areaItem.nombre.includes(' > ') ? areaItem.nombre.split(' > ').pop() : areaItem.nombre;
                      const isRoot = depth === 0;
                      const indent = depth * 20;

                      return (
                        <div key={areaItem.id}>
                          <div
                            className={`flex items-center gap-2 rounded-lg transition-all ${
                              isRoot
                                ? `px-4 py-3 ${hasRead ? 'bg-indigo-50/60 border border-indigo-200' : 'bg-white border border-gray-200'}`
                                : `px-3 py-2 ${hasRead ? 'bg-white/80' : 'hover:bg-gray-50/50'}`
                            }`}
                            style={{ marginLeft: isRoot ? 0 : `${indent}px` }}
                          >
                            {/* Expand/collapse */}
                            {children.length > 0 ? (
                              <button
                                onClick={() => setExpandedPerfilAreas(prev => {
                                  const next = new Set(prev);
                                  if (next.has(areaItem.codigo)) next.delete(areaItem.codigo);
                                  else next.add(areaItem.codigo);
                                  return next;
                                })}
                                className={`p-1 rounded-md transition-colors ${
                                  isRoot
                                    ? 'text-indigo-500 hover:bg-indigo-100'
                                    : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                }`}
                              >
                                <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                              </button>
                            ) : (
                              <span className="w-[26px] flex justify-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                              </span>
                            )}

                            {/* Nombre */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className={`${
                                isRoot ? 'text-sm font-bold text-gray-900' : `text-xs ${hasRead ? 'text-gray-800 font-medium' : 'text-gray-500'}`
                              }`}>
                                {displayName}
                              </span>
                              {children.length > 0 && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                  isRoot ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {children.length}
                                </span>
                              )}
                            </div>

                            {/* Botones de permiso */}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => togglePerfilPermiso(areaItem.codigo, 'lectura')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                  hasRead
                                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                                    : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                                }`}
                              >
                                Ver
                              </button>
                              <button
                                onClick={() => togglePerfilPermiso(areaItem.codigo, 'escritura')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                  hasWrite
                                    ? 'bg-green-100 text-green-700 shadow-sm'
                                    : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
                                }`}
                              >
                                Editar
                              </button>
                              {children.length > 0 && (
                                <button
                                  onClick={() => togglePerfilGrupo(areaItem.codigo, 'escritura', true)}
                                  className="p-1 rounded-md bg-indigo-50 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors"
                                  title="Dar acceso completo a este grupo y todos sus subapartados"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Hijos recursivos */}
                          {children.length > 0 && isExpanded && (
                            <div className={`${isRoot ? 'mt-1 ml-4 pl-3 border-l-2 border-indigo-100' : 'mt-0.5 ml-3 pl-2 border-l border-gray-200'} space-y-0.5`}>
                              {children.map(child => renderAreaRecursive(child, depth + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };
                    return renderAreaRecursive(area, 0);
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      {perfilForm.permisos.filter(p => p.lectura).length} secciones
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
                      {perfilForm.permisos.filter(p => p.escritura).length} editables
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPerfilModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSavePerfil}
                    disabled={saving || !perfilForm.nombre.trim()}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {saving ? 'Guardando...' : (editingPerfil ? 'Guardar Cambios' : 'Crear Perfil')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
