'use client';

import { useState, useEffect } from 'react';
import { 
  BanknotesIcon, 
  ArrowPathIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  DocumentMagnifyingGlassIcon,
  ClockIcon,
  BuildingLibraryIcon,
} from '@heroicons/react/24/outline';

interface KPIs {
  totalRemesado: number;
  totalCobradoBanco: number;
  diferenciaNeta: number;
  totalDevuelto: number;
  totalRecuperado: number;
  pendienteRecuperar: number;
  numRemesas: number;
  numDevoluciones: number;
  numDevolucionesPendientes: number;
}

interface ResumenMensual {
  mes: string;
  totalRemesado: number;
  totalCobradoBanco: number;
  santander: number;
  caixaGuissona: number;
  diferencia: number;
  numMovimientos: number;
  totalDevuelto: number;
  numDevoluciones: number;
}

interface RemesaRow {
  id: number;
  ispGestionId: number;
  nombre: string;
  fecha: string;
  totalImporte: number;
  numeroRegistros: number;
  estadoConciliacion: string;
  importeBanco: number | null;
  diferencia: number | null;
  totalRemesadoMes: number;
  totalCobradoMes: number;
  diferenciaMes: number | null;
  numMovimientosBanco: number;
  cobroSantander: number;
  cobroCaixaGuissona: number;
  numDevoluciones: number;
  totalDevoluciones: number;
}

interface DevolucionRow {
  id: string;
  numeroFactura: string;
  referenciaRemesa: string | null;
  nombreCliente: string;
  importe: number;
  motivo: string | null;
  fechaDevolucion: string;
  estado: string;
  importeCobrado: number | null;
  fechaCobro: string | null;
  remesaNombre: string | null;
  facturaSituacion: string | null;
  archivoOrigen: string | null;
}

function formatEUR(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMes(mesKey: string) {
  const [anio, m] = mesKey.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[parseInt(m) - 1]} ${anio}`;
}

const MESES = [
  { value: '', label: 'Todo el año' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export default function ConciliacionRemesasPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [remesas, setRemesas] = useState<RemesaRow[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [year, setYear] = useState(2026);
  const [mes, setMes] = useState('');
  const [vista, setVista] = useState<'resumen' | 'remesas' | 'devoluciones'>('resumen');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [year, mes]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: year.toString() });
      if (mes) params.set('mes', mes);
      const res = await fetch(`/api/admin/finanzas/conciliacion-remesas?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setKpis(json.kpis);
      setResumenMensual(json.resumenMensual || []);
      setRemesas(json.remesas);
      setDevoluciones(json.devoluciones);
    } catch (e: any) {
      console.error(e);
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setLoading(false);
  }

  async function ejecutarConciliacion(accion: string) {
    setProcesando(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion-remesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, year, mes: mes ? parseInt(mes) : undefined }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      const r = json.resultados;
      const partes = [];
      if (r.remesasConciliadas > 0) partes.push(`${r.remesasConciliadas} remesas conciliadas`);
      if (r.remesasConDiferencia > 0) partes.push(`${r.remesasConDiferencia} con diferencia`);
      if (r.devolucionesDetectadasBanco > 0) partes.push(`${r.devolucionesDetectadasBanco} devoluciones detectadas`);
      if (r.pagosPosterioresDetectados > 0) partes.push(`${r.pagosPosterioresDetectados} pagos posteriores`);
      if (r.errores?.length > 0) partes.push(`${r.errores.length} errores`);
      
      setMensaje({ 
        tipo: partes.length > 0 ? 'success' : 'error', 
        texto: partes.length > 0 ? partes.join(', ') : 'No se encontraron nuevos registros para procesar',
      });
      fetchData();
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setProcesando(false);
  }

  async function importarDevoluciones() {
    if (!mes) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un mes para importar devoluciones' });
      return;
    }
    setImportando(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/admin/finanzas/conciliacion-remesas/importar-devoluciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, mes: parseInt(mes) }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      const r = json.resultados;
      setMensaje({ 
        tipo: 'success', 
        texto: `Importadas ${r.devolucionesImportadas} devoluciones (${r.facturasEnlazadas} enlazadas a facturas, ${r.devolucionesDuplicadas} duplicadas omitidas)`,
      });
      fetchData();
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
    setImportando(false);
  }

  function getEstadoBadge(estado: string) {
    switch (estado) {
      case 'CONCILIADA':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="w-3 h-3" /> Conciliada</span>;
      case 'DIFERENCIA':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><ExclamationTriangleIcon className="w-3 h-3" /> Diferencia</span>;
      case 'PENDIENTE':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><ClockIcon className="w-3 h-3" /> Pendiente</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{estado}</span>;
    }
  }

  function getEstadoDevolucionBadge(estado: string) {
    switch (estado) {
      case 'COBRADO_TRANSFERENCIA':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="w-3 h-3" /> Cobrado</span>;
      case 'COBRADO_PARCIAL':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><CheckCircleIcon className="w-3 h-3" /> Parcial</span>;
      case 'INCOBRABLE':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><XCircleIcon className="w-3 h-3" /> Incobrable</span>;
      case 'PENDIENTE':
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><ClockIcon className="w-3 h-3" /> Pendiente</span>;
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliacion de Remesas</h1>
          <p className="text-sm text-gray-500 mt-1">Cruce mensual: remesas ISPGestion vs cobros banco (Santander + Caixa Guissona)</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <select value={mes} onChange={e => setMes(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
            {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <BanknotesIcon className="w-4 h-4" />
              Remesado ISP
            </div>
            <div className="text-xl font-bold text-gray-900">{formatEUR(kpis.totalRemesado)}</div>
            <div className="text-xs text-gray-400 mt-1">{kpis.numRemesas} remesas</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <BuildingLibraryIcon className="w-4 h-4 text-green-500" />
              Cobrado Banco
            </div>
            <div className="text-xl font-bold text-green-700">{formatEUR(kpis.totalCobradoBanco)}</div>
            <div className="text-xs text-gray-400 mt-1">
              Dif: <span className={kpis.diferenciaNeta >= 0 ? 'text-green-600' : 'text-red-600'}>{formatEUR(kpis.diferenciaNeta)}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <XCircleIcon className="w-4 h-4 text-red-500" />
              Devuelto
            </div>
            <div className="text-xl font-bold text-red-700">{formatEUR(kpis.totalDevuelto)}</div>
            <div className="text-xs text-gray-400 mt-1">{kpis.numDevoluciones} devoluciones</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ArrowPathIcon className="w-4 h-4 text-blue-500" />
              Recuperado
            </div>
            <div className="text-xl font-bold text-blue-700">{formatEUR(kpis.totalRecuperado)}</div>
            <div className="text-xs text-gray-400 mt-1">de {formatEUR(kpis.totalDevuelto)}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
              Pdte. Recuperar
            </div>
            <div className="text-xl font-bold text-amber-700">{formatEUR(kpis.pendienteRecuperar)}</div>
            <div className="text-xs text-gray-400 mt-1">{kpis.numDevolucionesPendientes} pendientes</div>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 bg-gray-50 rounded-xl p-4 border">
        <button
          onClick={() => ejecutarConciliacion('todo')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className={`w-4 h-4 ${procesando ? 'animate-spin' : ''}`} />
          {procesando ? 'Procesando...' : 'Conciliar Todo'}
        </button>
        <button
          onClick={() => ejecutarConciliacion('conciliar')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <DocumentMagnifyingGlassIcon className="w-4 h-4" />
          Solo Cruzar Remesas
        </button>
        <button
          onClick={() => ejecutarConciliacion('detectar_devoluciones')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          Detectar Devoluciones Banco
        </button>
        <button
          onClick={importarDevoluciones}
          disabled={importando || !mes}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          title={!mes ? 'Selecciona un mes primero' : ''}
        >
          <ArrowDownTrayIcon className={`w-4 h-4 ${importando ? 'animate-bounce' : ''}`} />
          {importando ? 'Importando...' : 'Importar DevSEPA (OneDrive)'}
        </button>
        <button
          onClick={() => ejecutarConciliacion('detectar_pagos')}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <CheckCircleIcon className="w-4 h-4" />
          Detectar Pagos Posteriores
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setVista('resumen')}
            className={`pb-2 text-sm font-medium border-b-2 ${vista === 'resumen' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Resumen Mensual ({resumenMensual.length})
          </button>
          <button
            onClick={() => setVista('remesas')}
            className={`pb-2 text-sm font-medium border-b-2 ${vista === 'remesas' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Remesas ({remesas.length})
          </button>
          <button
            onClick={() => setVista('devoluciones')}
            className={`pb-2 text-sm font-medium border-b-2 ${vista === 'devoluciones' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Devoluciones ({devoluciones.length})
          </button>
        </nav>
      </div>

      {/* Tabla Resumen Mensual */}
      {vista === 'resumen' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Mes</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Remesado ISP</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cobrado Banco</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Santander</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Caixa Guissona</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferencia</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Movimientos</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Devuelto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumenMensual.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay datos. Pulsa &quot;Conciliar Todo&quot; para procesar.</td></tr>
                ) : (
                  resumenMensual.map(rm => (
                    <tr key={rm.mes} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{formatMes(rm.mes)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatEUR(rm.totalRemesado)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700 font-medium">{formatEUR(rm.totalCobradoBanco)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEUR(rm.santander)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {rm.caixaGuissona > 0 ? formatEUR(rm.caixaGuissona) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className={rm.diferencia >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {rm.diferencia >= 0 ? '+' : ''}{formatEUR(rm.diferencia)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{rm.numMovimientos}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {rm.totalDevuelto > 0 ? (
                          <span className="text-red-600">{formatEUR(rm.totalDevuelto)} ({rm.numDevoluciones})</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {resumenMensual.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-medium">
                  <tr>
                    <td className="px-4 py-3 text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">{formatEUR(resumenMensual.reduce((s, r) => s + r.totalRemesado, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{formatEUR(resumenMensual.reduce((s, r) => s + r.totalCobradoBanco, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEUR(resumenMensual.reduce((s, r) => s + r.santander, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEUR(resumenMensual.reduce((s, r) => s + r.caixaGuissona, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(() => {
                        const total = resumenMensual.reduce((s, r) => s + r.diferencia, 0);
                        return <span className={total >= 0 ? 'text-green-600' : 'text-red-600'}>{total >= 0 ? '+' : ''}{formatEUR(total)}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{resumenMensual.reduce((s, r) => s + r.numMovimientos, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">{formatEUR(resumenMensual.reduce((s, r) => s + r.totalDevuelto, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tabla Remesas */}
      {vista === 'remesas' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Remesa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Importe ISP</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cobro Banco (prop.)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferencia</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Registros</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Devoluciones</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {remesas.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay remesas para el periodo seleccionado</td></tr>
                ) : (
                  remesas.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.nombre}</div>
                        <div className="text-xs text-gray-400">ISP #{r.ispGestionId}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(r.fecha)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatEUR(r.totalImporte)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {r.importeBanco !== null ? formatEUR(r.importeBanco) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {r.diferencia !== null ? (
                          <span className={Math.abs(r.diferencia) < 1 ? 'text-green-600' : r.diferencia > 0 ? 'text-blue-600' : 'text-red-600'}>
                            {r.diferencia > 0 ? '+' : ''}{formatEUR(r.diferencia)}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.numeroRegistros}</td>
                      <td className="px-4 py-3 text-center">
                        {r.numDevoluciones > 0 ? (
                          <span className="text-red-600 font-medium">{r.numDevoluciones} ({formatEUR(r.totalDevoluciones)})</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{getEstadoBadge(r.estadoConciliacion)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla Devoluciones */}
      {vista === 'devoluciones' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Factura</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Importe</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Remesa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Dev.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cobro</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devoluciones.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay devoluciones para el periodo seleccionado</td></tr>
                ) : (
                  devoluciones.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 font-mono">{d.numeroFactura}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{d.nombreCliente}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-600 font-medium">{formatEUR(d.importe)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.remesaNombre || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(d.fechaDevolucion)}</td>
                      <td className="px-4 py-3 text-center">{getEstadoDevolucionBadge(d.estado)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {d.importeCobrado ? (
                          <div>
                            <div className="text-green-600 font-medium">{formatEUR(d.importeCobrado)}</div>
                            {d.fechaCobro && <div className="text-gray-400">{formatDate(d.fechaCobro)}</div>}
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
