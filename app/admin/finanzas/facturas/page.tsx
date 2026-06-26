'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  DocumentTextIcon, CheckCircleIcon, ClockIcon, XCircleIcon, 
  ArrowUpTrayIcon, CloudArrowDownIcon, ArrowPathIcon, EyeIcon 
} from '@heroicons/react/24/outline';

interface Factura {
  id: string;
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string;
  base: number;
  tipoIva: number;
  importeIva: number;
  tipoIrpf: number;
  importeIrpf: number;
  total: number;
  concepto: string | null;
  estado: string;
  imputacion: string | null;
  clienteImputado: string | null;
  departamento: string | null;
  deducibleIva: boolean;
  ocrCompletado?: boolean;
  ocrConfianza?: number;
  carpetaOrigen?: string;
  archivoOneDrive?: string;
}

interface CarpetaStatus {
  total: number;
  nuevos: number;
  yaImportados: number;
}

interface SyncStatus {
  pendientes: CarpetaStatus;
  materiales: CarpetaStatus;
  trimestre1: CarpetaStatus;
  trimestre2: CarpetaStatus;
  trimestre3: CarpetaStatus;
  trimestre4: CarpetaStatus;
  confirming_draxton: CarpetaStatus;
  totalNuevos: number;
}

const ESTADOS = {
  PENDIENTE_REVISION: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  VALIDADA: { label: 'Validada', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  CONTABILIZADA: { label: 'Contabilizada', color: 'bg-blue-100 text-blue-700', icon: DocumentTextIcon },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
};

export default function FacturasPage() {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<any>(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  
  // Sincronización OneDrive
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [checkingSync, setCheckingSync] = useState(false);

  useEffect(() => {
    fetchFacturas();
  }, [page, filtroEstado]);

  useEffect(() => {
    checkSyncStatus();
  }, []);

  async function fetchFacturas() {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '30' });
    if (filtroEstado) params.set('estado', filtroEstado);
    
    const res = await fetch(`/api/admin/finanzas/facturas?${params}`);
    const json = await res.json();
    setFacturas(json.facturas || []);
    setTotal(json.total || 0);
    setResumen(json.resumenFiscal || null);
    setLoading(false);
  }

  async function checkSyncStatus() {
    setCheckingSync(true);
    try {
      const res = await fetch('/api/admin/finanzas/sincronizar-onedrive');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.error('Error checking sync status:', e);
    }
    setCheckingSync(false);
  }

  async function sincronizarOneDrive(carpeta: string = 'ambas') {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/finanzas/sincronizar-onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carpeta, limite: 10 }),
      });
      const data = await res.json();
      setSyncResult(data);
      // Refrescar facturas y estado
      fetchFacturas();
      checkSyncStatus();
    } catch (e: any) {
      setSyncResult({ error: e.message });
    }
    setSyncing(false);
  }

  async function actualizarEstado(id: string, estado: string) {
    await fetch(`/api/admin/finanzas/facturas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    fetchFacturas();
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(str: string) {
    return new Date(str).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas Recibidas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} facturas registradas</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => sincronizarOneDrive('todas')}
            disabled={syncing}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <CloudArrowDownIcon className="h-4 w-4" />
            )}
            {syncing ? 'Sincronizando...' : 'Sincronizar OneDrive'}
          </button>
          <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 flex items-center gap-2">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Subir Factura
          </button>
        </div>
      </div>

      {/* Panel de sincronización OneDrive */}
      {syncStatus && syncStatus.totalNuevos > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CloudArrowDownIcon className="h-6 w-6 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  {syncStatus.totalNuevos} facturas nuevas en OneDrive
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {[  
                    syncStatus.pendientes?.nuevos > 0 && `${syncStatus.pendientes.nuevos} Pendientes`,
                    syncStatus.materiales?.nuevos > 0 && `${syncStatus.materiales.nuevos} Materiales`,
                    syncStatus.trimestre1?.nuevos > 0 && `${syncStatus.trimestre1.nuevos} T1`,
                    syncStatus.trimestre2?.nuevos > 0 && `${syncStatus.trimestre2.nuevos} T2`,
                    syncStatus.trimestre3?.nuevos > 0 && `${syncStatus.trimestre3.nuevos} T3`,
                    syncStatus.trimestre4?.nuevos > 0 && `${syncStatus.trimestre4.nuevos} T4`,
                    syncStatus.confirming_draxton?.nuevos > 0 && `${syncStatus.confirming_draxton.nuevos} Confirming`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => sincronizarOneDrive('todas')}
                disabled={syncing}
                className="text-xs px-3 py-1.5 bg-blue-600 border border-blue-600 rounded-md text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Todas ({syncStatus.totalNuevos})
              </button>
              <button
                onClick={() => sincronizarOneDrive('pendiente')}
                disabled={syncing || !syncStatus.pendientes?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Pendientes ({syncStatus.pendientes?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('materiales')}
                disabled={syncing || !syncStatus.materiales?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Materiales ({syncStatus.materiales?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('trimestre1')}
                disabled={syncing || !syncStatus.trimestre1?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                T1 ({syncStatus.trimestre1?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('trimestre2')}
                disabled={syncing || !syncStatus.trimestre2?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                T2 ({syncStatus.trimestre2?.nuevos || 0})
              </button>
              <button
                onClick={() => sincronizarOneDrive('confirming_draxton')}
                disabled={syncing || !syncStatus.confirming_draxton?.nuevos}
                className="text-xs px-3 py-1.5 bg-white border border-purple-200 rounded-md text-purple-700 hover:bg-purple-100 disabled:opacity-50"
              >
                Confirming Draxton ({syncStatus.confirming_draxton?.nuevos || 0})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado de sincronización */}
      {syncResult && (
        <div className={`rounded-lg p-4 border ${syncResult.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {syncResult.error ? (
            <p className="text-sm text-red-700">Error: {syncResult.error}</p>
          ) : (
            <div>
              <p className="text-sm font-medium text-green-800">{syncResult.mensaje}</p>
              {syncResult.resultados && syncResult.resultados.length > 0 && (
                <div className="mt-2 space-y-1">
                  {syncResult.resultados.slice(0, 5).map((r: any, i: number) => (
                    <p key={i} className="text-xs text-green-700">
                      {r.estado === 'ok' ? '✅' : '❌'} {r.archivo} 
                      {r.proveedor && ` → ${r.proveedor}`}
                      {r.total ? ` (${formatEUR(r.total)})` : ''}
                      {r.error && ` - ${r.error}`}
                    </p>
                  ))}
                  {syncResult.resultados.length > 5 && (
                    <p className="text-xs text-green-600">... y {syncResult.resultados.length - 5} más</p>
                  )}
                </div>
              )}
              <button
                onClick={() => setSyncResult(null)}
                className="mt-2 text-xs text-green-600 underline"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resumen fiscal */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total Base Imponible</p>
            <p className="text-lg font-bold text-gray-900">{formatEUR(resumen.totalBase)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total IVA Soportado</p>
            <p className="text-lg font-bold text-green-700">{formatEUR(resumen.totalIva)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total IRPF Retenido</p>
            <p className="text-lg font-bold text-blue-700">{formatEUR(resumen.totalIrpf)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Total Facturado</p>
            <p className="text-lg font-bold text-gray-900">{formatEUR(resumen.totalFacturado)}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setFiltroEstado(''); setPage(1); }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${!filtroEstado ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
        >
          Todas
        </button>
        {Object.entries(ESTADOS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => { setFiltroEstado(key); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${filtroEstado === key ? 'bg-orange-50 border-orange-200 text-orange-700' : 'text-gray-600'}`}
          >
            {val.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nº Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Base</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Imputación</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Carpeta</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No hay facturas. Sincroniza OneDrive o sube una factura manualmente.</td></tr>
              ) : (
                facturas.map(f => {
                  const estadoInfo = ESTADOS[f.estado as keyof typeof ESTADOS] || ESTADOS.PENDIENTE_REVISION;
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/finanzas/facturas/${f.id}`)}>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatFecha(f.fecha)}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{f.proveedor}</div>
                        {f.cif && <div className="text-xs text-gray-400">{f.cif}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{f.numFactura || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{f.concepto || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatEUR(f.base)}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700">{formatEUR(f.importeIva)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-right">{formatEUR(f.total)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {f.imputacion || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {f.carpetaOrigen && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            f.carpetaOrigen === 'T1' ? 'bg-emerald-50 text-emerald-700' :
                            f.carpetaOrigen === 'T2' ? 'bg-teal-50 text-teal-700' :
                            f.carpetaOrigen === 'Confirming' ? 'bg-purple-50 text-purple-700' :
                            f.carpetaOrigen === 'Materiales' ? 'bg-yellow-50 text-yellow-700' :
                            'bg-gray-50 text-gray-600'
                          }`}>
                            {f.carpetaOrigen}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {f.archivoOneDrive && (
                            <a
                              href={`/api/admin/finanzas/facturas/${f.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                              title="Ver PDF"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </a>
                          )}
                          {f.estado === 'PENDIENTE_REVISION' && (
                            <>
                              <button
                                onClick={() => actualizarEstado(f.id, 'VALIDADA')}
                                className="text-green-600 hover:text-green-800"
                                title="Validar"
                              >
                                <CheckCircleIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => actualizarEstado(f.id, 'RECHAZADA')}
                                className="text-red-400 hover:text-red-600"
                                title="Rechazar"
                              >
                                <XCircleIcon className="h-5 w-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {total > 30 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * 30 + 1} - {Math.min(page * 30, total)} de {total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 30 >= total} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
