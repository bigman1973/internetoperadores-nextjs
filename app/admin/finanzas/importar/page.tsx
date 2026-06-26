'use client';

import { useState, useRef } from 'react';
import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const BANCOS = [
  { id: 'santander', nombre: 'Santander', formatos: 'XLSX, TXT' },
  { id: 'caixabank', nombre: 'CaixaBank', formatos: 'CSV, XLSX' },
  { id: 'bbva', nombre: 'BBVA', formatos: 'CSV, XLSX' },
  { id: 'caixa_guissona', nombre: 'Caixa Guissona', formatos: 'CSV' },
  { id: 'vivid', nombre: 'Vivid', formatos: 'CSV' },
  { id: 'wise', nombre: 'Wise', formatos: 'XLSX' },
  { id: 'norma43', nombre: 'Norma 43 (cualquier banco)', formatos: 'N43, Q43, TXT' },
];

export default function ImportarPage() {
  const [banco, setBanco] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

      setResultado(json);
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Extracto Bancario</h1>
        <p className="text-sm text-gray-500 mt-1">Sube un extracto de movimientos para importar y conciliar automáticamente</p>
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
              <div>Movimientos importados: <strong>{resultado.importados}</strong></div>
              <div>Duplicados omitidos: <strong>{resultado.duplicados}</strong></div>
              <div>Categorizados automáticamente: <strong>{resultado.categorizados}</strong></div>
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
