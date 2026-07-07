"use client";

import { useState, useEffect } from 'react';

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

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', color: 'bg-red-100 text-red-800' },
  { value: 'GERENTE', label: 'Gerente', color: 'bg-purple-100 text-purple-800' },
  { value: 'MARKETING', label: 'Marketing', color: 'bg-pink-100 text-pink-800' },
  { value: 'VENTAS', label: 'Ventas', color: 'bg-blue-100 text-blue-800' },
  { value: 'CONTABILIDAD', label: 'Contabilidad', color: 'bg-green-100 text-green-800' },
  { value: 'RRHH', label: 'RRHH', color: 'bg-yellow-100 text-yellow-800' },
];

export default function UsuariosAdminClient() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    nombre: '',
    password: '',
    rol: 'VENTAS',
    roles: ['VENTAS'] as string[],
    activo: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const fetchUsuarios = async () => {
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

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({ email: '', nombre: '', password: '', rol: 'VENTAS', roles: ['VENTAS'], activo: true });
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
        // Actualizar
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

        setSuccessMsg('Usuario actualizado correctamente');
      } else {
        // Crear
        if (!formData.password) {
          setError('La contraseña es obligatoria para nuevos usuarios');
          setSaving(false);
          return;
        }

        const res = await fetch('/api/admin/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al crear usuario');
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

  const getRolBadge = (rol: string) => {
    const rolInfo = ROLES.find(r => r.value === rol);
    return rolInfo || { label: rol, color: 'bg-gray-100 text-gray-800' };
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
          <h1 className="text-2xl font-bold text-gray-900">USUARIOS ADMIN</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestión de usuarios con acceso al panel de administración. {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="mt-4 sm:mt-0 inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
        >
          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo Usuario
        </button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="rounded-md bg-green-50 p-4 border border-green-200">
          <p className="text-sm text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Info sobre Microsoft */}
      <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
        <div className="flex">
          <svg className="h-5 w-5 text-blue-400 mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800">
              <strong>Autenticación Microsoft:</strong> Los usuarios listados aquí pueden iniciar sesión con su cuenta de Microsoft corporativa. 
              Solo los emails registrados en esta tabla están autorizados para acceder al panel.
            </p>
          </div>
        </div>
      </div>

      {/* Tabla de usuarios */}
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
              const rolBadge = getRolBadge(user.rol);
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
                      {(user.roles && user.roles.length > 0 ? user.roles : [user.rol]).map((r) => {
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
                      onClick={() => openEditModal(user)}
                      className="text-orange-600 hover:text-orange-900 mr-4"
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

      {/* Modal Crear/Editar */}
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
                  {!editingUser && (
                    <p className="mt-1 text-xs text-gray-500">Este email se usará para el login con Microsoft</p>
                  )}
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
                        roles: formData.roles.includes(newRol) ? formData.roles : [...formData.roles, newRol]
                      });
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
                  >
                    {ROLES.map((rol) => (
                      <option key={rol.value} value={rol.value}>{rol.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Roles Adicionales</label>
                  <div className="space-y-2">
                    {ROLES.filter(r => r.value !== 'SUPER_ADMIN').map((rol) => (
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
                  <p className="mt-1 text-xs text-gray-500">Un usuario puede tener varios roles simultáneamente</p>
                </div>

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
    </div>
  );
}
