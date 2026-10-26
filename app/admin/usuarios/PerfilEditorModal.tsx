'use client';

import type { ReactNode } from 'react';

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

interface PerfilForm {
  nombre: string;
  descripcion: string;
  color: string;
  permisos: Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }>;
}

interface PerfilEditorModalProps {
  editingPerfil: Perfil | null;
  areas: Area[];
  expandedPerfilAreas: Set<string>;
  perfilForm: PerfilForm;
  saving: boolean;
  onClose: () => void;
  onPerfilFormChange: (perfilForm: PerfilForm) => void;
  onToggleExpanded: (areaCodigo: string) => void;
  onTogglePermiso: (areaCodigo: string, tipo: 'lectura' | 'escritura') => void;
  onToggleGrupo: (parentCodigo: string, tipo: 'lectura' | 'escritura', value: boolean) => void;
  onSave: () => void;
}

export default function PerfilEditorModal({
  editingPerfil,
  areas,
  expandedPerfilAreas,
  perfilForm,
  saving,
  onClose,
  onPerfilFormChange,
  onToggleExpanded,
  onTogglePermiso,
  onToggleGrupo,
  onSave,
}: PerfilEditorModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col transform overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {editingPerfil ? 'Editar Perfil' : 'Nuevo Perfil de Permisos'}
              </h3>
              <p className="text-sm text-gray-600 mt-0.5">Configura a qué secciones tendrá acceso este perfil</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/80 text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-4 border-b">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={perfilForm.nombre}
                  onChange={e => onPerfilFormChange({ ...perfilForm, nombre: e.target.value })}
                  placeholder="Ej: Técnico Draxton"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-medium focus:border-indigo-500 focus:ring-indigo-500 bg-white"
                />
              </div>
              <div className="col-span-6">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Descripción</label>
                <input
                  type="text"
                  value={perfilForm.descripcion}
                  onChange={e => onPerfilFormChange({ ...perfilForm, descripcion: e.target.value })}
                  placeholder="Ej: Acceso a GGCC Draxton y personal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 bg-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Color</label>
                <input
                  type="color"
                  value={perfilForm.color}
                  onChange={e => onPerfilFormChange({ ...perfilForm, color: e.target.value })}
                  className="w-full h-[42px] rounded-lg border border-gray-300 cursor-pointer"
                />
              </div>
            </div>
          </div>

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

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-1.5">
              {areas.filter(a => !a.padre).map(area => {
                const renderAreaRecursive = (areaItem: Area, depth: number): ReactNode => {
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
                        {children.length > 0 ? (
                          <button
                            onClick={() => onToggleExpanded(areaItem.codigo)}
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

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onTogglePermiso(areaItem.codigo, 'lectura')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                              hasRead
                                ? 'bg-blue-100 text-blue-700 shadow-sm'
                                : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                            }`}
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => onTogglePermiso(areaItem.codigo, 'escritura')}
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
                              onClick={() => onToggleGrupo(areaItem.codigo, 'escritura', true)}
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
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={onSave}
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
  );
}
