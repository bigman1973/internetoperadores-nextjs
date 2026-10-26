'use client';

import type { FormEvent } from 'react';

interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  roles: string[];
  activo: boolean;
}

interface Perfil {
  id: string;
  nombre: string;
  permisos: Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }>;
}

interface Rol {
  value: string;
  label: string;
  color: string;
}

interface UsuarioForm {
  email: string;
  nombre: string;
  password: string;
  rol: string;
  roles: string[];
  activo: boolean;
  perfilId: string;
}

interface UsuarioEditorModalProps {
  editingUser: Usuario | null;
  formData: UsuarioForm;
  perfiles: Perfil[];
  roles: Rol[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormDataChange: (formData: UsuarioForm) => void;
  onOpenPermisos: (user: Usuario) => void;
}

export default function UsuarioEditorModal({
  editingUser,
  formData,
  perfiles,
  roles,
  saving,
  error,
  onClose,
  onSubmit,
  onFormDataChange,
  onOpenPermisos,
}: UsuarioEditorModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h3>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input
                type="text"
                required
                value={formData.nombre}
                onChange={(e) => onFormDataChange({ ...formData, nombre: e.target.value })}
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
                onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
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
                onChange={(e) => onFormDataChange({ ...formData, password: e.target.value })}
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
                  onFormDataChange({
                    ...formData,
                    rol: newRol,
                    roles: newRol === 'VISOR' ? [] : (formData.roles.includes(newRol) ? formData.roles : [...formData.roles, newRol]),
                  });
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
              >
                {roles.map((rol) => (
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
                  {roles.filter(r => r.value !== 'SUPER_ADMIN' && r.value !== 'VISOR').map((rol) => (
                    <label key={rol.value} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes(rol.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onFormDataChange({ ...formData, roles: [...formData.roles, rol.value] });
                          } else {
                            onFormDataChange({ ...formData, roles: formData.roles.filter(r => r !== rol.value) });
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

            {perfiles.length > 0 && (
              <div className="pt-3 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Aplicar Perfil de Permisos
                </label>
                <select
                  value={formData.perfilId}
                  onChange={(e) => onFormDataChange({ ...formData, perfilId: e.target.value })}
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
                  onChange={(e) => onFormDataChange({ ...formData, activo: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="activo" className="ml-2 text-sm text-gray-700">Usuario activo</label>
              </div>
            )}

            {editingUser && (
              <div className="pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => onOpenPermisos(editingUser)}
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
                onClick={onClose}
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
  );
}
