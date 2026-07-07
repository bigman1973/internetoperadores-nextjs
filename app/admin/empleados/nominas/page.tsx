'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  CloudArrowUpIcon,
  ArrowPathIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

interface OneDriveFile {
  name: string;
  id: string;
  month: string;
  monthNum: number;
  loaded: boolean;
  empleadosEnBD: number;
}

interface SyncStatus {
  anio: number;
  archivosOneDrive: OneDriveFile[];
  mesesCargados: number[];
  totalMesesDisponibles: number;
  totalMesesCargados: number;
}

interface UploadResult {
  success: boolean;
  archivo?: string;
  mes?: number;
  anio?: number;
  empleadosProcesados?: number;
  empleadosEnPDF?: number;
  noEncontrados?: string[];
  resumen?: {
    totalBruto: number;
    totalNeto: number;
    totalIRPF: number;
    totalSSTrabajador: number;
    totalSSEmpresa: number;
    totalCosteEmpresa: number;
    verificado: boolean;
  };
  error?: string;
}

interface SyncResult {
  success: boolean;
  anio: number;
  resultados: { mes: number; success: boolean; summary?: any; error?: string }[];
  resumen: { totalArchivos: number; exitosos: number; fallidos: number };
  error?: string;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function NominasPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkSyncStatus();
  }, []);

  async function checkSyncStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/nominas/sync?anio=2026');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al consultar estado');
      }
      const data = await res.json();
      setSyncStatus(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync(meses?: number[]) {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/nominas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio: 2026, meses }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al sincronizar');
      setSyncResult(data);
      // Refresh status
      await checkSyncStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/nominas/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setUploadResult(data);
      if (data.success) {
        // Refresh status
        await checkSyncStatus();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function formatEur(val: number): string {
    return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/empleados" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Nóminas</h1>
            <p className="text-sm text-gray-500 mt-1">Sincronizar con OneDrive o subir archivos COSTES IO</p>
          </div>
        </div>
      </div>

      {/* Error global */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Two columns: Sync OneDrive + Upload Manual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sincronizar con OneDrive */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <CloudArrowUpIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sincronizar con OneDrive</h2>
              <p className="text-xs text-gray-500">SharePoint: Accounting & Finances / Nóminas</p>
            </div>
          </div>

          {/* Status */}
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Consultando OneDrive...
            </div>
          ) : syncStatus ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{syncStatus.totalMesesDisponibles}</span> archivos disponibles en OneDrive |{' '}
                <span className="font-medium text-green-600">{syncStatus.totalMesesCargados}</span> meses cargados en BD
              </div>

              {/* File list */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {syncStatus.archivosOneDrive.map((file) => (
                  <div key={file.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      {file.loaded ? (
                        <CheckCircleIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="text-gray-700">{file.name}</span>
                    </div>
                    <div className="text-xs">
                      {file.loaded ? (
                        <span className="text-green-600">{file.empleadosEnBD} empleados</span>
                      ) : (
                        <button
                          onClick={() => handleSync([file.monthNum])}
                          disabled={syncing}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Importar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Sync all button */}
              <button
                onClick={() => handleSync()}
                disabled={syncing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                {syncing ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-4 w-4" />
                    Sincronizar todos
                  </>
                )}
              </button>

              <button
                onClick={checkSyncStatus}
                disabled={loading}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
              >
                Refrescar estado
              </button>
            </div>
          ) : null}

          {/* Sync result */}
          {syncResult && (
            <div className={`p-3 rounded-lg text-sm ${syncResult.resumen.fallidos > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
              <p className="font-medium">
                Sincronización completada: {syncResult.resumen.exitosos}/{syncResult.resumen.totalArchivos} exitosos
              </p>
              {syncResult.resultados.map((r, i) => (
                <div key={i} className="mt-1 flex items-center gap-1">
                  {r.success ? (
                    <CheckCircleIcon className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircleIcon className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span>{MESES[r.mes]}: {r.success ? `${r.summary?.empleados || 0} empleados` : r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subida manual */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <DocumentArrowUpIcon className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Subida manual</h2>
              <p className="text-xs text-gray-500">Subir un archivo PDF de COSTES IO directamente</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Sube un archivo PDF de <span className="font-medium">&quot;COSTES IO&quot;</span> generado por la gestoría.
              El sistema detectará automáticamente el mes/año y cargará los datos de todos los empleados.
            </p>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-orange-300 transition-colors">
              <DocumentArrowUpIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-3">
                Arrastra un PDF aquí o haz clic para seleccionar
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 cursor-pointer text-sm font-medium">
                <DocumentArrowUpIcon className="h-4 w-4" />
                Seleccionar PDF
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Procesando PDF...
              </div>
            )}
          </div>

          {/* Upload result */}
          {uploadResult && (
            <div className={`p-4 rounded-lg text-sm ${uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {uploadResult.success ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-green-800">Carga exitosa</span>
                  </div>
                  <div className="space-y-1 text-green-700">
                    <p><span className="font-medium">Archivo:</span> {uploadResult.archivo}</p>
                    <p><span className="font-medium">Periodo:</span> {MESES[uploadResult.mes || 0]} {uploadResult.anio}</p>
                    <p><span className="font-medium">Empleados:</span> {uploadResult.empleadosProcesados}/{uploadResult.empleadosEnPDF} procesados</p>
                    {uploadResult.resumen && (
                      <div className="mt-2 pt-2 border-t border-green-200 grid grid-cols-2 gap-1">
                        <p>Bruto: {formatEur(uploadResult.resumen.totalBruto)}</p>
                        <p>Neto: {formatEur(uploadResult.resumen.totalNeto)}</p>
                        <p>IRPF: {formatEur(uploadResult.resumen.totalIRPF)}</p>
                        <p>SS Trab: {formatEur(uploadResult.resumen.totalSSTrabajador)}</p>
                        <p>SS Emp: {formatEur(uploadResult.resumen.totalSSEmpresa)}</p>
                        <p className="font-semibold">Coste: {formatEur(uploadResult.resumen.totalCosteEmpresa)}</p>
                      </div>
                    )}
                    {uploadResult.noEncontrados && uploadResult.noEncontrados.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-yellow-200 text-yellow-700">
                        <p className="font-medium">Empleados no encontrados en BD:</p>
                        {uploadResult.noEncontrados.map((name, i) => (
                          <p key={i} className="ml-2">• {name}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800">Error al procesar</p>
                    <p className="text-red-700 mt-1">{uploadResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Información */}
      <div className="bg-gray-50 rounded-xl border p-4 text-sm text-gray-600">
        <h3 className="font-semibold text-gray-800 mb-2">Información</h3>
        <ul className="space-y-1 list-disc list-inside">
          <li>Los archivos deben ser del formato <span className="font-mono text-xs bg-gray-200 px-1 rounded">COSTES IO [MES] [AÑO].pdf</span> generados por la gestoría.</li>
          <li>Al importar un mes que ya existe, se reemplazan los datos anteriores (no se duplican).</li>
          <li>El sistema verifica automáticamente que Bruto = Neto + IRPF + SS Trabajador.</li>
          <li>Los empleados se identifican por su NIF. Si un empleado del PDF no está en la BD, se reportará.</li>
        </ul>
      </div>
    </div>
  );
}
