'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AcademicCapIcon,
  TrophyIcon,
  ChartBarIcon,
  CurrencyEuroIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

interface Empleado {
  id: string;
  nombreCompleto: string;
  categoria: string | null;
  estado: string;
}

interface Objetivo {
  id: string;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  periodo: string | null;
  fechaInicio: string | null;
  fechaLimite: string | null;
  estado: string;
  progreso: number;
  peso: number;
  resultado: string | null;
  createdAt: string;
}

interface Evaluacion {
  id: string;
  periodo: string;
  fecha: string;
  evaluador: string | null;
  puntuacion: number | null;
  fortalezas: string | null;
  areasMetjora: string | null;
  comentarios: string | null;
  accionesAcordadas: string | null;
  proximaRevision: string | null;
}

interface Formacion {
  id: string;
  titulo: string;
  tipo: string;
  proveedor: string | null;
  estado: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  horas: number | null;
  coste: number | null;
  certificado: boolean;
  urlCertificado: string | null;
  notas: string | null;
}

interface Condicion {
  id: string;
  fechaEfectiva: string;
  brutoAnual: number;
  motivo: string | null;
  notas: string | null;
}

const CATEGORIAS_OBJ = [
  { value: 'rendimiento', label: 'Rendimiento' },
  { value: 'desarrollo', label: 'Desarrollo profesional' },
  { value: 'formacion', label: 'Formación' },
  { value: 'proyecto', label: 'Proyecto' },
];

const ESTADOS_OBJ = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_progreso', label: 'En progreso', color: 'bg-blue-100 text-blue-700' },
  { value: 'cumplido', label: 'Cumplido', color: 'bg-green-100 text-green-700' },
  { value: 'no_cumplido', label: 'No cumplido', color: 'bg-red-100 text-red-700' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
];

const TIPOS_FORMACION = [
  { value: 'curso', label: 'Curso' },
  { value: 'certificacion', label: 'Certificación' },
  { value: 'taller', label: 'Taller' },
  { value: 'conferencia', label: 'Conferencia' },
  { value: 'mentoria', label: 'Mentoría' },
  { value: 'autoformacion', label: 'Autoformación' },
];

const ESTADOS_FORMACION = [
  { value: 'planificado', label: 'Planificado', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_curso', label: 'En curso', color: 'bg-blue-100 text-blue-700' },
  { value: 'completado', label: 'Completado', color: 'bg-green-100 text-green-700' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-700' },
];

const MOTIVOS_SALARIAL = [
  { value: 'incorporacion', label: 'Incorporación' },
  { value: 'subida_anual', label: 'Subida anual' },
  { value: 'promocion', label: 'Promoción' },
  { value: 'revision', label: 'Revisión' },
  { value: 'otro', label: 'Otro' },
];

export default function PlanCarreraPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [selectedEmpleado, setSelectedEmpleado] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'objetivos' | 'evaluaciones' | 'formacion' | 'salarial'>('objetivos');

  // Data
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [formaciones, setFormaciones] = useState<Formacion[]>([]);
  const [condiciones, setCondiciones] = useState<Condicion[]>([]);

  // Forms
  const [showObjForm, setShowObjForm] = useState(false);
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [showFormForm, setShowFormForm] = useState(false);
  const [showCondForm, setShowCondForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Objetivo form
  const [objForm, setObjForm] = useState({
    titulo: '', descripcion: '', categoria: 'rendimiento', periodo: '2026-H2',
    fechaInicio: '', fechaLimite: '', peso: '1',
  });

  // Evaluación form
  const [evalForm, setEvalForm] = useState({
    periodo: '2026-H1', fecha: '', puntuacion: '',
    fortalezas: '', areasMejora: '', comentarios: '', accionesAcordadas: '', proximaRevision: '',
  });

  // Formación form
  const [formForm, setFormForm] = useState({
    titulo: '', tipoFormacion: 'curso', proveedor: '', estado: 'planificado',
    fechaInicio: '', fechaFin: '', horas: '', coste: '', notas: '',
  });

  // Condición salarial form
  const [condForm, setCondForm] = useState({
    fechaEfectiva: '', brutoAnual: '', motivo: 'subida_anual', notas: '',
  });

  useEffect(() => {
    fetchEmpleados();
  }, []);

  useEffect(() => {
    if (selectedEmpleado) fetchPlanCarrera();
  }, [selectedEmpleado]);

  async function fetchEmpleados() {
    const res = await fetch('/api/admin/empleados?estado=ACTIVO&anio=2026&periodo=mes&mes=6');
    const data = await res.json();
    const emps = (data.empleados || []).map((e: any) => ({
      id: e.id, nombreCompleto: e.nombreCompleto, categoria: e.categoria, estado: e.estado,
    }));
    setEmpleados(emps);
    if (emps.length > 0 && !selectedEmpleado) setSelectedEmpleado(emps[0].id);
  }

  async function fetchPlanCarrera() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/empleados/plan-carrera?empleadoId=${selectedEmpleado}`);
      const data = await res.json();
      setObjetivos(data.objetivos || []);
      setEvaluaciones(data.evaluaciones || []);
      setFormaciones(data.formaciones || []);
      setCondiciones(data.condiciones || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function guardarObjetivo() {
    setSaving(true);
    try {
      await fetch('/api/admin/empleados/plan-carrera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'objetivo', empleadoId: selectedEmpleado, ...objForm }),
      });
      setShowObjForm(false);
      setObjForm({ titulo: '', descripcion: '', categoria: 'rendimiento', periodo: '2026-H2', fechaInicio: '', fechaLimite: '', peso: '1' });
      await fetchPlanCarrera();
    } finally { setSaving(false); }
  }

  async function actualizarObjetivo(id: string, data: Partial<Objetivo>) {
    await fetch('/api/admin/empleados/plan-carrera', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'objetivo', id, ...data }),
    });
    await fetchPlanCarrera();
  }

  async function guardarEvaluacion() {
    setSaving(true);
    try {
      await fetch('/api/admin/empleados/plan-carrera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'evaluacion', empleadoId: selectedEmpleado, ...evalForm }),
      });
      setShowEvalForm(false);
      setEvalForm({ periodo: '2026-H1', fecha: '', puntuacion: '', fortalezas: '', areasMejora: '', comentarios: '', accionesAcordadas: '', proximaRevision: '' });
      await fetchPlanCarrera();
    } finally { setSaving(false); }
  }

  async function guardarFormacion() {
    setSaving(true);
    try {
      await fetch('/api/admin/empleados/plan-carrera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'formacion', empleadoId: selectedEmpleado, ...formForm }),
      });
      setShowFormForm(false);
      setFormForm({ titulo: '', tipoFormacion: 'curso', proveedor: '', estado: 'planificado', fechaInicio: '', fechaFin: '', horas: '', coste: '', notas: '' });
      await fetchPlanCarrera();
    } finally { setSaving(false); }
  }

  async function guardarCondicion() {
    setSaving(true);
    try {
      await fetch('/api/admin/empleados/condiciones-salariales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleadoId: selectedEmpleado, ...condForm }),
      });
      setShowCondForm(false);
      setCondForm({ fechaEfectiva: '', brutoAnual: '', motivo: 'subida_anual', notas: '' });
      await fetchPlanCarrera();
    } finally { setSaving(false); }
  }

  async function eliminar(tipo: string, id: string) {
    if (!confirm('¿Eliminar este registro?')) return;
    if (tipo === 'condicion') {
      await fetch(`/api/admin/empleados/condiciones-salariales?id=${id}`, { method: 'DELETE' });
    } else {
      await fetch(`/api/admin/empleados/plan-carrera?tipo=${tipo}&id=${id}`, { method: 'DELETE' });
    }
    await fetchPlanCarrera();
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES');
  }

  function formatEur(v: number) {
    return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  const empActual = empleados.find(e => e.id === selectedEmpleado);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/empleados" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan de Carrera</h1>
            <p className="text-sm text-gray-500">Objetivos, evaluaciones, formación y evolución salarial</p>
          </div>
        </div>
        <select
          value={selectedEmpleado}
          onChange={(e) => setSelectedEmpleado(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm font-medium"
        >
          {empleados.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.nombreCompleto}</option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      {empActual && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrophyIcon className="h-5 w-5 text-amber-500" />
              <span className="text-xs text-gray-500">Objetivos activos</span>
            </div>
            <p className="text-2xl font-bold">{objetivos.filter(o => o.estado === 'pendiente' || o.estado === 'en_progreso').length}</p>
            <p className="text-xs text-green-600">{objetivos.filter(o => o.estado === 'cumplido').length} cumplidos</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="h-5 w-5 text-blue-500" />
              <span className="text-xs text-gray-500">Última evaluación</span>
            </div>
            <p className="text-2xl font-bold">
              {evaluaciones.length > 0 && evaluaciones[0].puntuacion ? `${evaluaciones[0].puntuacion}/5` : '—'}
            </p>
            <p className="text-xs text-gray-400">{evaluaciones.length > 0 ? evaluaciones[0].periodo : 'Sin evaluaciones'}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="h-5 w-5 text-purple-500" />
              <span className="text-xs text-gray-500">Formación</span>
            </div>
            <p className="text-2xl font-bold">{formaciones.filter(f => f.estado === 'completado').length}</p>
            <p className="text-xs text-blue-600">{formaciones.filter(f => f.estado === 'en_curso' || f.estado === 'planificado').length} pendientes</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <CurrencyEuroIcon className="h-5 w-5 text-green-500" />
              <span className="text-xs text-gray-500">Bruto actual</span>
            </div>
            <p className="text-2xl font-bold">
              {condiciones.length > 0 ? formatEur(condiciones[0].brutoAnual) : '—'}
            </p>
            <p className="text-xs text-gray-400">
              {condiciones.length > 0 ? `desde ${formatDate(condiciones[0].fechaEfectiva)}` : 'Sin registrar'}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-6">
          {[
            { key: 'objetivos', label: 'Objetivos', icon: TrophyIcon },
            { key: 'evaluaciones', label: 'Evaluaciones', icon: ChartBarIcon },
            { key: 'formacion', label: 'Formación', icon: AcademicCapIcon },
            { key: 'salarial', label: 'Evolución Salarial', icon: CurrencyEuroIcon },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 pb-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                tab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border">
          {/* OBJETIVOS */}
          {tab === 'objetivos' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Objetivos</h3>
                <button
                  onClick={() => setShowObjForm(!showObjForm)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                >
                  <PlusIcon className="h-4 w-4" /> Nuevo objetivo
                </button>
              </div>

              {showObjForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Título *</label>
                      <input type="text" value={objForm.titulo} onChange={e => setObjForm({...objForm, titulo: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Ej: Obtener certificación AWS" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Descripción</label>
                      <textarea value={objForm.descripcion} onChange={e => setObjForm({...objForm, descripcion: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" rows={2} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Categoría</label>
                      <select value={objForm.categoria} onChange={e => setObjForm({...objForm, categoria: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm">
                        {CATEGORIAS_OBJ.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Periodo</label>
                      <input type="text" value={objForm.periodo} onChange={e => setObjForm({...objForm, periodo: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="2026-H2" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Fecha inicio</label>
                      <input type="date" value={objForm.fechaInicio} onChange={e => setObjForm({...objForm, fechaInicio: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Fecha límite</label>
                      <input type="date" value={objForm.fechaLimite} onChange={e => setObjForm({...objForm, fechaLimite: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Peso (1-5)</label>
                      <input type="number" min="1" max="5" value={objForm.peso} onChange={e => setObjForm({...objForm, peso: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={guardarObjetivo} disabled={saving || !objForm.titulo}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setShowObjForm(false)} className="px-4 py-2 text-gray-600 text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {objetivos.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sin objetivos registrados</p>
              ) : (
                <div className="space-y-3">
                  {objetivos.map(obj => {
                    const estadoInfo = ESTADOS_OBJ.find(e => e.value === obj.estado) || ESTADOS_OBJ[0];
                    return (
                      <div key={obj.id} className="p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{obj.titulo}</h4>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoInfo.color}`}>
                                {estadoInfo.label}
                              </span>
                              {obj.periodo && <span className="text-xs text-gray-400">{obj.periodo}</span>}
                            </div>
                            {obj.descripcion && <p className="text-sm text-gray-600 mt-1">{obj.descripcion}</p>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                              <span>Categoría: {CATEGORIAS_OBJ.find(c => c.value === obj.categoria)?.label}</span>
                              <span>Peso: {obj.peso}</span>
                              {obj.fechaLimite && <span>Límite: {formatDate(obj.fechaLimite)}</span>}
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${obj.progreso >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                  style={{ width: `${Math.min(obj.progreso, 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-10">{obj.progreso}%</span>
                            </div>
                            {obj.resultado && <p className="text-sm text-green-700 mt-1 italic">{obj.resultado}</p>}
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <select
                              value={obj.estado}
                              onChange={e => actualizarObjetivo(obj.id, { estado: e.target.value })}
                              className="text-xs border rounded px-1 py-0.5"
                            >
                              {ESTADOS_OBJ.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                            </select>
                            <input
                              type="number" min="0" max="100" value={obj.progreso}
                              onChange={e => actualizarObjetivo(obj.id, { progreso: parseInt(e.target.value) as any })}
                              className="w-14 text-xs border rounded px-1 py-0.5 text-center"
                            />
                            <button onClick={() => eliminar('objetivo', obj.id)} className="text-red-400 hover:text-red-600 p-1">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* EVALUACIONES */}
          {tab === 'evaluaciones' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Evaluaciones de Desempeño</h3>
                <button
                  onClick={() => setShowEvalForm(!showEvalForm)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                >
                  <PlusIcon className="h-4 w-4" /> Nueva evaluación
                </button>
              </div>

              {showEvalForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Periodo *</label>
                      <input type="text" value={evalForm.periodo} onChange={e => setEvalForm({...evalForm, periodo: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="2026-H1" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Fecha *</label>
                      <input type="date" value={evalForm.fecha} onChange={e => setEvalForm({...evalForm, fecha: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Puntuación (1-5)</label>
                      <select value={evalForm.puntuacion} onChange={e => setEvalForm({...evalForm, puntuacion: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm">
                        <option value="">—</option>
                        <option value="1">1 - Insuficiente</option>
                        <option value="2">2 - Mejorable</option>
                        <option value="3">3 - Adecuado</option>
                        <option value="4">4 - Notable</option>
                        <option value="5">5 - Excepcional</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Próxima revisión</label>
                      <input type="date" value={evalForm.proximaRevision} onChange={e => setEvalForm({...evalForm, proximaRevision: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Fortalezas</label>
                      <textarea value={evalForm.fortalezas} onChange={e => setEvalForm({...evalForm, fortalezas: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" rows={2} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Áreas de mejora</label>
                      <textarea value={evalForm.areasMejora} onChange={e => setEvalForm({...evalForm, areasMejora: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" rows={2} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Acciones acordadas</label>
                      <textarea value={evalForm.accionesAcordadas} onChange={e => setEvalForm({...evalForm, accionesAcordadas: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" rows={2} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Comentarios generales</label>
                      <textarea value={evalForm.comentarios} onChange={e => setEvalForm({...evalForm, comentarios: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" rows={2} />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={guardarEvaluacion} disabled={saving || !evalForm.periodo || !evalForm.fecha}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setShowEvalForm(false)} className="px-4 py-2 text-gray-600 text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {evaluaciones.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sin evaluaciones registradas</p>
              ) : (
                <div className="space-y-4">
                  {evaluaciones.map(ev => (
                    <div key={ev.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-gray-900">{ev.periodo}</span>
                          <span className="text-sm text-gray-400">{formatDate(ev.fecha)}</span>
                          {ev.puntuacion && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              ev.puntuacion >= 4 ? 'bg-green-100 text-green-700' :
                              ev.puntuacion >= 3 ? 'bg-blue-100 text-blue-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {ev.puntuacion}/5
                            </span>
                          )}
                        </div>
                        <button onClick={() => eliminar('evaluacion', ev.id)} className="text-red-400 hover:text-red-600">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {ev.fortalezas && (
                          <div>
                            <span className="text-xs font-medium text-green-700">Fortalezas:</span>
                            <p className="text-gray-600 mt-0.5">{ev.fortalezas}</p>
                          </div>
                        )}
                        {ev.areasMetjora && (
                          <div>
                            <span className="text-xs font-medium text-amber-700">Áreas de mejora:</span>
                            <p className="text-gray-600 mt-0.5">{ev.areasMetjora}</p>
                          </div>
                        )}
                        {ev.accionesAcordadas && (
                          <div className="col-span-2">
                            <span className="text-xs font-medium text-blue-700">Acciones acordadas:</span>
                            <p className="text-gray-600 mt-0.5">{ev.accionesAcordadas}</p>
                          </div>
                        )}
                        {ev.comentarios && (
                          <div className="col-span-2">
                            <span className="text-xs font-medium text-gray-500">Comentarios:</span>
                            <p className="text-gray-600 mt-0.5">{ev.comentarios}</p>
                          </div>
                        )}
                      </div>
                      {ev.proximaRevision && (
                        <p className="text-xs text-gray-400 mt-2">Próxima revisión: {formatDate(ev.proximaRevision)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FORMACIÓN */}
          {tab === 'formacion' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Formación y Certificaciones</h3>
                <button
                  onClick={() => setShowFormForm(!showFormForm)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                >
                  <PlusIcon className="h-4 w-4" /> Nueva formación
                </button>
              </div>

              {showFormForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Título *</label>
                      <input type="text" value={formForm.titulo} onChange={e => setFormForm({...formForm, titulo: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Ej: AWS Solutions Architect" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Tipo</label>
                      <select value={formForm.tipoFormacion} onChange={e => setFormForm({...formForm, tipoFormacion: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm">
                        {TIPOS_FORMACION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Proveedor</label>
                      <input type="text" value={formForm.proveedor} onChange={e => setFormForm({...formForm, proveedor: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Ej: Amazon, Udemy..." />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Estado</label>
                      <select value={formForm.estado} onChange={e => setFormForm({...formForm, estado: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm">
                        {ESTADOS_FORMACION.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Horas</label>
                      <input type="number" value={formForm.horas} onChange={e => setFormForm({...formForm, horas: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Fecha inicio</label>
                      <input type="date" value={formForm.fechaInicio} onChange={e => setFormForm({...formForm, fechaInicio: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Fecha fin</label>
                      <input type="date" value={formForm.fechaFin} onChange={e => setFormForm({...formForm, fechaFin: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Coste (€)</label>
                      <input type="number" step="10" value={formForm.coste} onChange={e => setFormForm({...formForm, coste: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Notas</label>
                      <input type="text" value={formForm.notas} onChange={e => setFormForm({...formForm, notas: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={guardarFormacion} disabled={saving || !formForm.titulo}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setShowFormForm(false)} className="px-4 py-2 text-gray-600 text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {formaciones.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sin formación registrada</p>
              ) : (
                <div className="space-y-3">
                  {formaciones.map(f => {
                    const estadoInfo = ESTADOS_FORMACION.find(e => e.value === f.estado) || ESTADOS_FORMACION[0];
                    return (
                      <div key={f.id} className="p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{f.titulo}</h4>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoInfo.color}`}>
                                {estadoInfo.label}
                              </span>
                              {f.certificado && <CheckCircleIcon className="h-4 w-4 text-green-500" />}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span>{TIPOS_FORMACION.find(t => t.value === f.tipo)?.label}</span>
                              {f.proveedor && <span>{f.proveedor}</span>}
                              {f.horas && <span>{f.horas}h</span>}
                              {f.coste && <span>{f.coste} €</span>}
                              {f.fechaInicio && <span>{formatDate(f.fechaInicio)} → {f.fechaFin ? formatDate(f.fechaFin) : '...'}</span>}
                            </div>
                            {f.notas && <p className="text-xs text-gray-500 mt-1">{f.notas}</p>}
                          </div>
                          <button onClick={() => eliminar('formacion', f.id)} className="text-red-400 hover:text-red-600 p-1">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* EVOLUCIÓN SALARIAL */}
          {tab === 'salarial' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Evolución Salarial</h3>
                <button
                  onClick={() => setShowCondForm(!showCondForm)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                >
                  <PlusIcon className="h-4 w-4" /> Nueva condición
                </button>
              </div>

              {showCondForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Fecha efectiva *</label>
                      <input type="date" value={condForm.fechaEfectiva} onChange={e => setCondForm({...condForm, fechaEfectiva: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Bruto anual (€) *</label>
                      <input type="number" step="100" value={condForm.brutoAnual} onChange={e => setCondForm({...condForm, brutoAnual: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="32000" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Motivo</label>
                      <select value={condForm.motivo} onChange={e => setCondForm({...condForm, motivo: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm">
                        {MOTIVOS_SALARIAL.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Notas</label>
                      <input type="text" value={condForm.notas} onChange={e => setCondForm({...condForm, notas: e.target.value})}
                        className="w-full px-3 py-1.5 border rounded text-sm" placeholder="Opcional" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={guardarCondicion} disabled={saving || !condForm.fechaEfectiva || !condForm.brutoAnual}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                      {saving ? 'Guardando...' : 'Registrar'}
                    </button>
                    <button onClick={() => setShowCondForm(false)} className="px-4 py-2 text-gray-600 text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {condiciones.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sin condiciones salariales registradas</p>
              ) : (
                <div className="space-y-3">
                  {condiciones.map((c, idx) => {
                    const prevCond = condiciones[idx + 1];
                    const incremento = prevCond ? ((c.brutoAnual - prevCond.brutoAnual) / prevCond.brutoAnual * 100) : null;
                    return (
                      <div key={c.id} className={`p-4 border rounded-lg ${idx === 0 ? 'bg-orange-50 border-orange-200' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="text-xl font-bold text-gray-900">{formatEur(c.brutoAnual)}<span className="text-sm font-normal text-gray-400">/año</span></span>
                              {incremento !== null && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${incremento > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {incremento > 0 ? '+' : ''}{incremento.toFixed(1)}%
                                </span>
                              )}
                              {idx === 0 && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">Vigente</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span>Desde {formatDate(c.fechaEfectiva)}</span>
                              {c.motivo && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{MOTIVOS_SALARIAL.find(m => m.value === c.motivo)?.label || c.motivo}</span>}
                              {c.notas && <span>{c.notas}</span>}
                            </div>
                          </div>
                          <button onClick={() => eliminar('condicion', c.id)} className="text-red-400 hover:text-red-600 p-1">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
