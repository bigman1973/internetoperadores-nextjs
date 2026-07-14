'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon, CalendarDaysIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

const BANCOS = [
  { id: 'santander', nombre: 'Santander', formatos: 'XLSX, TXT' },
  { id: 'caixabank', nombre: 'CaixaBank', formatos: 'CSV, XLSX' },
  { id: 'bbva', nombre: 'BBVA', formatos: 'CSV, XLSX' },
  { id: 'guissona', nombre: 'Caixa Guissona', formatos: 'CSV' },
  { id: 'vivid', nombre: 'Vivid', formatos: 'CSV' },
  { id: 'wise', nombre: 'Wise', formatos: 'XLSX' },
  { id: 'norma43', nombre: 'Norma 43 (cualquier banco)', formatos: 'N43, Q43, TXT' },
];

interface EstadoCuenta {
  banco: string;
  activa: boolean;
  ultimoMovimiento: string | null;
  totalMovimientos: number;
  primerMovimiento: string | null;
}

interface HistorialImportacion {
  id: string | null;
  archivo: string;
  banco: string;
  totalMovimientos: number;
  duplicados: number;
  fechaPrimerMov: string | null;
  fechaUltimoMov: string | null;
  fechaImportacion: string | null;
  archivoUrl: string | null;
}

export default function ImportarPage() {
  const [banco, setBanco] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [estadoCuentas, setEstadoCuentas] = useState<EstadoCuenta[]>([]);
  const [historial, setHistorial] = useState<HistorialImportacion[]>([]);
  const [loadingEstado, setLoadingEstado] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEstadoCuentas();
  }, []);

  async function fetchEstadoCuentas() {
    try {
      const res = await fetch('/api/admin/finanzas/estado-cuentas');
      if (res.ok) {
        const data = await res.json();
        setEstadoCuentas(data.estadoCuentas || []);
        setHistorial(data.historial || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingEstado(false);
  }

  async function handleImportar() {
    if (!banco || !archivo) {
      setError('Selecciona un banco y un archivo');
      return;
    }

    setLoading(true);
    setError('');
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append('banco', banco);
      formData.append('archivo', archivo);

      const res = await fetch('/api/admin/finanzas/importar-movimientos', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al importar');

      setResultado(json.resumen || json);
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = '';
      fetchEstadoCuentas(); // Refrescar estado tras importar
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  function diasDesde(fecha: string | null): number | null {
    if (!fecha) return null;
    const hoy = new Date();
    const f = new Date(fecha);
    return Math.floor((hoy.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Extracto Bancario</h1>
        <p className="text-sm text-gray-500 mt-1">Sube un extracto de movimientos para importar y conciliar automáticamente</p>
      </div>

      {/* Estado de cuentas - último movimiento por banco */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDaysIcon className="h-5 w-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Estado de extractos por banco</h3>
        </div>
        {loadingEstado ? (
          <div className="text-sm text-gray-400">Cargando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {estadoCuentas.map((cuenta) => {
              const dias = diasDesde(cuenta.ultimoMovimiento);
              const esReciente = dias !== null && dias <= 7;
              const esAntiguo = dias !== null && dias > 30;
              const esInactiva = !cuenta.activa;
              return (
                <div key={cuenta.banco} className={`rounded-lg border p-3 ${esInactiva ? 'border-gray-200 bg-gray-50 opacity-70' : esAntiguo ? 'border-red-200 bg-red-50' : esReciente ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{cuenta.banco}</span>
                      {esInactiva && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">CERRADA</span>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${esInactiva ? 'bg-gray-200 text-gray-500' : esAntiguo ? 'bg-red-100 text-red-700' : esReciente ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {dias !== null ? (dias === 0 ? 'Hoy' : `Hace ${dias} días`) : 'Sin datos'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-gray-600">
                      <span className="text-gray-500">Último mov:</span>{' '}
                      <span className="font-medium">
                        {cuenta.ultimoMovimiento ? new Date(cuenta.ultimoMovimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : 'N/A'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="text-gray-500">Primer mov:</span>{' '}
                      <span className="font-medium">
                        {cuenta.primerMovimiento ? new Date(cuenta.primerMovimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : 'N/A'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="text-gray-500">Total movimientos:</span>{' '}
                      <span className="font-medium">{cuenta.totalMovimientos.toLocaleString('es-ES')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historial de importaciones */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 mb-4">
          <DocumentTextIcon className="h-5 w-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Últimas importaciones</h3>
        </div>
        {loadingEstado ? (
          <div className="text-sm text-gray-400">Cargando...</div>
        ) : historial.length === 0 ? (
          <p className="text-sm text-gray-400">No hay importaciones registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium text-gray-500 uppercase">Fecha importación</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500 uppercase">Archivo</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500 uppercase">Banco</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-500 uppercase">Movimientos</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500 uppercase">Período</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-500 uppercase">Archivo</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={h.id || i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600">
                      {h.fechaImportacion ? new Date(h.fechaImportacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-900 max-w-[200px] truncate" title={h.archivo}>
                      {h.archivo}
                    </td>
                    <td className="py-2 px-2 text-gray-600">{h.banco}</td>
                    <td className="py-2 px-2 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                        {h.totalMovimientos}
                      </span>
                      {h.duplicados > 0 && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px]">
                          +{h.duplicados} dup
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-500">
                      {h.fechaPrimerMov && h.fechaUltimoMov ? (
                        <>
                          {new Date(h.fechaPrimerMov).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          {' → '}
                          {new Date(h.fechaUltimoMov).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </>
                      ) : 'N/A'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {h.archivoUrl ? (
                        <a
                          href={h.archivoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium"
                          title="Descargar archivo original"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-6">
        {/* Selección de banco */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Banco</label>
          <select
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            className="w-full border rounded-lg px-4 py-2.5"
          >
            <option value="">Selecciona un banco...</option>
            {BANCOS.map(b => (
              <option key={b.id} value={b.id}>{b.nombre} ({b.formatos})</option>
            ))}
          </select>
        </div>

        {/* Selección de archivo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Archivo</label>
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-orange-300 transition-colors">
            <ArrowUpTrayIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt,.n43,.q43"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
            />
            {archivo && (
              <p className="text-sm text-green-600 mt-2">Archivo seleccionado: {archivo.name} ({(archivo.size / 1024).toFixed(1)} KB)</p>
            )}
          </div>
        </div>

        {/* Botón importar */}
        <button
          onClick={handleImportar}
          disabled={loading || !banco || !archivo}
          className="w-full bg-orange-600 text-white py-3 rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Importando...
            </>
          ) : (
            <>
              <ArrowUpTrayIcon className="h-5 w-5" />
              Importar Movimientos
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">Importación completada</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-green-700">
              <div>Movimientos importados: <strong>{resultado.insertados ?? resultado.importados ?? 0}</strong></div>
              <div>Duplicados omitidos: <strong>{(resultado.duplicados ?? 0) + (resultado.duplicadosPorContenido ?? 0)}</strong></div>
              {resultado.reglasAplicadas !== undefined && (
                <div>Reglas aplicadas: <strong>{resultado.reglasAplicadas}</strong></div>
              )}
              {resultado.saldoFinal !== undefined && (
                <div>Saldo final: <strong>{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(resultado.saldoFinal)}</strong></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info de formatos */}
      <div className="bg-white rounded-xl border p-6 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Formatos soportados</h3>
        <div className="space-y-2">
          {BANCOS.map(b => (
            <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
              <span className="text-sm text-gray-700">{b.nombre}</span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{b.formatos}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Recomendación: descarga siempre en formato <strong>Norma 43</strong> para unificar todos los bancos en un solo formato.
        </p>
      </div>
    </div>
  );
}
