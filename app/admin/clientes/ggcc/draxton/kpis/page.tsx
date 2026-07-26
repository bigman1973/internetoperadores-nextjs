'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  ChartBarIcon,
  ClockIcon,
  ShieldCheckIcon,
  ScaleIcon,
  PencilIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';

interface DashboardData {
  filtros: { planta: string; anio: number; mes: number | null };
  bloque1: {
    totalTickets: number;
    ticketsCerrados: number;
    ticketsAbiertos: number;
    mttrHoras: number;
    ratioProactividad: number;
    ticketsPorMes: { mes: number; total: number }[];
    ticketsPorCategoria: { categoria: string; total: number }[];
    ticketsPorTecnico: { tecnico: string; total: number }[];
    ticketsPorSeveridad: { severidad: string; total: number }[];
    ticketsPorSla: { sla: string; total: number }[];
    ticketsPorTipo: { tipo: string; total: number }[];
  };
  bloque2: {
    kpiMensual: any;
    acumulado: { horasAuditorias: number; horasProveedores: number; horasImplementaciones: number };
  };
  bloque3: { preventivosEjecutados: number; preventivosplanificados: number; cumplimiento: number };
  bloque4: { horasContratadas: number; horasEjecutadas: number; overDelivery: number; saturacion: number };
  proyectos: {
    total: number;
    activos: number;
    completados: number;
    planificados: number;
    pausados: number;
    lista: { id: string; titulo: string; descripcion: string | null; categoria: string; estado: string; impacto: string | null; ahorroEstimado: number | null; fechaInicio: string | null; fechaFinPrevista: string | null; fechaFinReal: string | null; prioridad: string; responsable: string | null }[];
  };
  kpisAnuales: any[];
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function KpisDraxtonPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [planta, setPlanta] = useState('LLEIDA');
  const [anio, setAnio] = useState(2026);
  const [mes, setMes] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [kpiForm, setKpiForm] = useState({
    horasAuditorias: 0, horasProveedores: 0, horasImplementaciones: 0,
    detalleImplementaciones: '', preventivosEjecutados: 0, preventivosplanificados: 0,
    horasContratadas: 0, horasEjecutadas: 0, resumenEjecutivo: '', recomendaciones: '',
  });
  const [kpiMes, setKpiMes] = useState(new Date().getMonth() + 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchDashboard(); }, [planta, anio, mes]);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ planta, anio: String(anio) });
      if (mes) params.set('mes', String(mes));
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/kpis/dashboard?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('planta', planta);
      const res = await fetch('/api/admin/clientes/ggcc/draxton/kpis/importar-tickets', {
        method: 'POST', body: formData,
      });
      const result = await res.json();
      setUploadResult(result);
      if (result.success) fetchDashboard();
    } catch (e) { console.error(e); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  async function guardarKpi() {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/kpis/mensuales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planta, mes: kpiMes, anio, ...kpiForm }),
      });
      setShowKpiForm(false);
      fetchDashboard();
    } catch (e) { console.error(e); }
  }

  function loadKpiForEdit(mesEditar: number) {
    const existing = data?.kpisAnuales?.find((k: any) => k.mes === mesEditar && k.planta === planta);
    if (existing) {
      setKpiForm({
        horasAuditorias: existing.horasAuditorias || 0,
        horasProveedores: existing.horasProveedores || 0,
        horasImplementaciones: existing.horasImplementaciones || 0,
        detalleImplementaciones: existing.detalleImplementaciones || '',
        preventivosEjecutados: existing.preventivosEjecutados || 0,
        preventivosplanificados: existing.preventivosplanificados || 0,
        horasContratadas: existing.horasContratadas || 0,
        horasEjecutadas: existing.horasEjecutadas || 0,
        resumenEjecutivo: existing.resumenEjecutivo || '',
        recomendaciones: existing.recomendaciones || '',
      });
    } else {
      setKpiForm({ horasAuditorias: 0, horasProveedores: 0, horasImplementaciones: 0, detalleImplementaciones: '', preventivosEjecutados: 0, preventivosplanificados: 0, horasContratadas: 0, horasEjecutadas: 0, resumenEjecutivo: '', recomendaciones: '' });
    }
    setKpiMes(mesEditar);
    setShowKpiForm(true);
  }

  const b1 = data?.bloque1;
  const b2 = data?.bloque2;
  const b3 = data?.bloque3;
  const b4 = data?.bloque4;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/clientes/ggcc/draxton" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Informes KPIs · Draxton</h1>
            <p className="text-sm text-gray-500">Dashboard de valor y rendimiento del servicio IT</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={planta} onChange={e => setPlanta(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
            <option value="LLEIDA">Lleida</option>
            <option value="BCN">Barcelona</option>
            <option value="TODAS">Todas</option>
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="px-3 py-1.5 border rounded-lg text-sm">
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <select value={mes || ''} onChange={e => setMes(e.target.value ? Number(e.target.value) : null)} className="px-3 py-1.5 border rounded-lg text-sm">
            <option value="">Todo el año</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <button onClick={() => window.open(`/api/admin/clientes/ggcc/draxton/kpis/informe-ejecutivo?planta=${planta}&anio=${anio}&mes=${mes || ''}`, '_blank')}
            className="flex items-center gap-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">
            <DocumentArrowDownIcon className="h-4 w-4" /> Informe Ejecutivo
          </button>
        </div>
      </div>

      {/* Importar Excel + Registrar KPIs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" id="upload-excel" />
          <label htmlFor="upload-excel" className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
            <ArrowUpTrayIcon className="h-4 w-4" /> {uploading ? 'Importando...' : 'Importar Excel Tickets'}
          </label>
        </div>
        <button onClick={() => loadKpiForEdit(new Date().getMonth() + 1)}
          className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
          <PencilIcon className="h-4 w-4" /> Registrar KPIs Manuales
        </button>
        {uploadResult && (
          <span className={`text-xs ${uploadResult.success ? 'text-green-600' : 'text-red-600'}`}>
            {uploadResult.success ? `✓ ${uploadResult.ticketsImportados} tickets importados` : `✗ ${uploadResult.error}`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando dashboard...</div>
      ) : !data || !b1 ? (
        <div className="text-center py-12 text-gray-400">No hay datos disponibles. Importa un Excel de tickets para empezar.</div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={<ChartBarIcon className="h-5 w-5 text-blue-600" />} label="Tickets Totales" value={b1.totalTickets} sub={`${b1.ticketsCerrados} cerrados`} />
            <KpiCard icon={<ClockIcon className="h-5 w-5 text-amber-600" />} label="MTTR (horas)" value={b1.mttrHoras} sub="Tiempo medio resolución" />
            <KpiCard icon={<ShieldCheckIcon className="h-5 w-5 text-green-600" />} label="Proactividad" value={`${b1.ratioProactividad}%`} sub="Tickets generados por IT" />
            <KpiCard icon={<ScaleIcon className="h-5 w-5 text-purple-600" />} label="SLA Cumplido" value={`${b1.ticketsPorSla.find(s => s.sla === 'Met')?.total || 0}`} sub={`de ${b1.totalTickets} tickets`} />
          </div>

          {/* BLOQUE 1: Continuidad Operativa */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5 text-blue-600" />
              Bloque 1: Continuidad Operativa
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tickets por mes */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Tickets por mes</h3>
                <div className="flex items-end gap-1 h-40">
                  {b1.ticketsPorMes.map(t => {
                    const max = Math.max(...b1.ticketsPorMes.map(x => x.total));
                    const pct = max > 0 ? (t.total / max) * 100 : 0;
                    return (
                      <div key={t.mes} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-medium text-gray-600">{t.total}</span>
                        <div className="w-full bg-blue-500 rounded-t" style={{ height: `${pct}%`, minHeight: '4px' }} />
                        <span className="text-[10px] text-gray-500">{MESES[t.mes - 1]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Tickets por categoría */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Top categorías</h3>
                <div className="space-y-2">
                  {b1.ticketsPorCategoria.slice(0, 8).map(t => {
                    const pct = b1.totalTickets > 0 ? (t.total / b1.totalTickets) * 100 : 0;
                    return (
                      <div key={t.categoria} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-48 truncate">{t.categoria}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-3">
                          <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-8 text-right">{t.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Tickets por técnico */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribución por técnico</h3>
                <div className="space-y-2">
                  {b1.ticketsPorTecnico.filter(t => t.tecnico !== 'Sin asignar').map(t => {
                    const pct = b1.totalTickets > 0 ? (t.total / b1.totalTickets) * 100 : 0;
                    return (
                      <div key={t.tecnico} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-40 truncate">{t.tecnico}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-3">
                          <div className="bg-orange-500 h-3 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-12 text-right">{t.total} ({pct.toFixed(0)}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* SLA */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado SLA</h3>
                <div className="grid grid-cols-2 gap-3">
                  {b1.ticketsPorSla.map(t => (
                    <div key={t.sla} className={`p-3 rounded-lg border text-center ${t.sla === 'Met' ? 'bg-green-50 border-green-200' : t.sla === 'Breached' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                      <p className="text-lg font-bold">{t.total}</p>
                      <p className="text-xs text-gray-600">{t.sla}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* BLOQUE 2: Valor Añadido */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              Bloque 2: Proyectos y Tareas de Alto Valor
            </h2>
            {b2 && b2.acumulado.horasAuditorias + b2.acumulado.horasProveedores + b2.acumulado.horasImplementaciones > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
                  <p className="text-2xl font-bold text-green-700">{b2.acumulado.horasAuditorias}h</p>
                  <p className="text-xs text-green-600 mt-1">Soporte a Auditorías</p>
                  <p className="text-[10px] text-gray-500 mt-1">ISO, IATF, clientes OEM</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-center">
                  <p className="text-2xl font-bold text-blue-700">{b2.acumulado.horasProveedores}h</p>
                  <p className="text-xs text-blue-600 mt-1">Gestión de Proveedores</p>
                  <p className="text-[10px] text-gray-500 mt-1">Alarmas, seguridad, preventivos</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 text-center">
                  <p className="text-2xl font-bold text-purple-700">{b2.acumulado.horasImplementaciones}h</p>
                  <p className="text-xs text-purple-600 mt-1">Implementaciones y Mejoras</p>
                  <p className="text-[10px] text-gray-500 mt-1">Servidores, SCCM, actualizaciones</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 text-sm">
                No hay datos de tareas de alto valor registrados. Usa &quot;Registrar KPIs Manuales&quot; para añadirlos.
              </div>
            )}
          </div>

          {/* BLOQUE 3: Control de Activos */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-amber-600" />
              Bloque 3: Control de Activos y Riesgos
            </h2>
            {b3 && b3.preventivosplanificados > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm font-semibold text-amber-800">Cumplimiento de Preventivos</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-4">
                      <div className="bg-amber-500 h-4 rounded-full" style={{ width: `${b3.cumplimiento}%` }} />
                    </div>
                    <span className="text-lg font-bold text-amber-700">{b3.cumplimiento}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{b3.preventivosEjecutados} de {b3.preventivosplanificados} planificados</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 text-sm">
                No hay datos de preventivos registrados.
              </div>
            )}
          </div>

          {/* BLOQUE 4: Balance de Recursos */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ScaleIcon className="h-5 w-5 text-red-600" />
              Bloque 4: Balance de Recursos
            </h2>
            {b4 && b4.horasContratadas > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg border text-center">
                  <p className="text-2xl font-bold text-gray-700">{b4.horasContratadas}h</p>
                  <p className="text-xs text-gray-500 mt-1">Horas Contratadas</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center">
                  <p className="text-2xl font-bold text-red-700">{b4.horasEjecutadas}h</p>
                  <p className="text-xs text-red-600 mt-1">Horas Ejecutadas</p>
                </div>
                <div className={`p-4 rounded-lg border text-center ${b4.overDelivery > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`text-2xl font-bold ${b4.overDelivery > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {b4.overDelivery > 0 ? '+' : ''}{b4.overDelivery}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Over-delivery</p>
                  <p className="text-[10px] text-gray-400">Saturación: {b4.saturacion}%</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 text-sm">
                No hay datos de horas contratadas/ejecutadas. Registra los KPIs manuales del mes.
              </div>
            )}
          </div>

          {/* PROYECTOS INTERNOS */}
          {data?.proyectos && data.proyectos.total > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <RocketLaunchIcon className="h-5 w-5 text-orange-600" />
                Proyectos Internos e Implementaciones
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-center">
                  <p className="text-xl font-bold text-orange-700">{data.proyectos.activos}</p>
                  <p className="text-xs text-orange-600">En curso</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                  <p className="text-xl font-bold text-green-700">{data.proyectos.completados}</p>
                  <p className="text-xs text-green-600">Completados</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border text-center">
                  <p className="text-xl font-bold text-gray-700">{data.proyectos.planificados}</p>
                  <p className="text-xs text-gray-500">Planificados</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                  <p className="text-xl font-bold text-yellow-700">{data.proyectos.pausados}</p>
                  <p className="text-xs text-yellow-600">Pausados</p>
                </div>
              </div>
              <div className="space-y-2">
                {data.proyectos.lista.filter(p => p.estado === 'en_curso').map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg border-l-4 border-l-orange-500">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.titulo}</p>
                      {p.descripcion && <p className="text-xs text-gray-500 mt-0.5">{p.descripcion}</p>}
                      <div className="flex gap-3 mt-1">
                        {p.responsable && <span className="text-[10px] text-gray-400">👤 {p.responsable}</span>}
                        {p.fechaFinPrevista && <span className="text-[10px] text-gray-400">📅 {new Date(p.fechaFinPrevista).toLocaleDateString('es-ES')}</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      p.prioridad === 'alta' ? 'bg-red-100 text-red-700' : p.prioridad === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                    }`}>{p.prioridad}</span>
                  </div>
                ))}
                {data.proyectos.lista.filter(p => p.estado === 'completado').slice(0, 3).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg border-l-4 border-l-green-500 bg-green-50/30">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.titulo}</p>
                      {p.impacto && <p className="text-xs text-green-600 mt-0.5 italic">{p.impacto}</p>}
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">completado</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla resumen mensual */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Resumen mensual de KPIs</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Mes</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Tickets</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">H. Auditorías</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">H. Proveedores</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">H. Implement.</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">H. Contrat.</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">H. Ejecut.</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {MESES.map((m, i) => {
                    const mesNum = i + 1;
                    const ticketsMes = b1.ticketsPorMes.find(t => t.mes === mesNum);
                    const kpiMesData = data?.kpisAnuales?.find((k: any) => k.mes === mesNum && k.planta === planta);
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{m} {anio}</td>
                        <td className="px-4 py-2 text-right">{ticketsMes?.total || '—'}</td>
                        <td className="px-4 py-2 text-right">{kpiMesData?.horasAuditorias || '—'}</td>
                        <td className="px-4 py-2 text-right">{kpiMesData?.horasProveedores || '—'}</td>
                        <td className="px-4 py-2 text-right">{kpiMesData?.horasImplementaciones || '—'}</td>
                        <td className="px-4 py-2 text-right">{kpiMesData?.horasContratadas || '—'}</td>
                        <td className="px-4 py-2 text-right">{kpiMesData?.horasEjecutadas || '—'}</td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => loadKpiForEdit(mesNum)} className="text-gray-400 hover:text-purple-600">
                            <PencilIcon className="h-4 w-4 inline" />
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

      {/* Modal KPIs manuales */}
      {showKpiForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowKpiForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                Registrar KPIs · {MESES[kpiMes - 1]} {anio} · {planta}
              </h3>
              <p className="text-sm text-gray-500 mt-1">Datos de tareas de alto valor y balance de recursos</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Bloque 2 */}
              <div>
                <h4 className="text-sm font-semibold text-green-700 mb-3">Tareas de Alto Valor (horas)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Auditorías</label>
                    <input type="number" value={kpiForm.horasAuditorias} onChange={e => setKpiForm({ ...kpiForm, horasAuditorias: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Gestión Proveedores</label>
                    <input type="number" value={kpiForm.horasProveedores} onChange={e => setKpiForm({ ...kpiForm, horasProveedores: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Implementaciones</label>
                    <input type="number" value={kpiForm.horasImplementaciones} onChange={e => setKpiForm({ ...kpiForm, horasImplementaciones: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-500">Detalle implementaciones</label>
                  <textarea value={kpiForm.detalleImplementaciones} onChange={e => setKpiForm({ ...kpiForm, detalleImplementaciones: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm" rows={2} placeholder="Ej: Despliegue SCCM, actualización servidores..." />
                </div>
              </div>
              {/* Bloque 3 */}
              <div>
                <h4 className="text-sm font-semibold text-amber-700 mb-3">Control de Activos</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Preventivos ejecutados</label>
                    <input type="number" value={kpiForm.preventivosEjecutados} onChange={e => setKpiForm({ ...kpiForm, preventivosEjecutados: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Preventivos planificados</label>
                    <input type="number" value={kpiForm.preventivosplanificados} onChange={e => setKpiForm({ ...kpiForm, preventivosplanificados: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                </div>
              </div>
              {/* Bloque 4 */}
              <div>
                <h4 className="text-sm font-semibold text-red-700 mb-3">Balance de Recursos</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Horas contratadas (mes)</label>
                    <input type="number" value={kpiForm.horasContratadas} onChange={e => setKpiForm({ ...kpiForm, horasContratadas: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Horas ejecutadas (mes)</label>
                    <input type="number" value={kpiForm.horasEjecutadas} onChange={e => setKpiForm({ ...kpiForm, horasEjecutadas: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border rounded text-sm" />
                  </div>
                </div>
              </div>
              {/* Narrativa */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Narrativa del Informe</h4>
                <div>
                  <label className="text-xs text-gray-500">Resumen ejecutivo (3-4 logros del mes)</label>
                  <textarea value={kpiForm.resumenEjecutivo} onChange={e => setKpiForm({ ...kpiForm, resumenEjecutivo: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm" rows={3} placeholder="• Auditoría ISO superada con éxito&#10;• Despliegue SCCM completado&#10;• Control inventario al 95%" />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-500">Recomendaciones</label>
                  <textarea value={kpiForm.recomendaciones} onChange={e => setKpiForm({ ...kpiForm, recomendaciones: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm" rows={2} placeholder="Ej: Necesidad de ampliar cobertura en BCN..." />
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-between">
              <select value={kpiMes} onChange={e => setKpiMes(Number(e.target.value))} className="px-3 py-1.5 border rounded text-sm">
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setShowKpiForm(false)} className="px-4 py-2 text-gray-600 text-sm">Cancelar</button>
                <button onClick={guardarKpi} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                  Guardar KPIs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: any; sub: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
