'use client';

import { useState } from 'react';

export default function SyncTarifasButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSync = async () => {
    if (!confirm('¿Sincronizar tarifas desde ISP Gestión? Esto reemplazará todas las tarifas actuales con las activas de ISP Gestión.')) {
      return;
    }
    
    setLoading(true);
    setResult(null);
    
    try {
      const res = await fetch('/api/sync-tarifas', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      
      if (data.success) {
        alert(`Sincronización completada: ${data.inserted} tarifas activas importadas de ${data.totalISP} totales en ISP Gestión.`);
        window.location.reload();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error de conexión: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Sincronizando tarifas...
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sincronizar Tarifas ISP Gestión
        </>
      )}
    </button>
  );
}
