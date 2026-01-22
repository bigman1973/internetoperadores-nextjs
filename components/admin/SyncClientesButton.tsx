'use client';

import { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

export default function SyncClientesButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    if (!confirm('¿Estás seguro de que quieres sincronizar todos los clientes desde ISPGestión? Esto puede tardar unos momentos.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/clientes/sync', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(data.message || 'Sincronización completada con éxito.');
        router.refresh();
      } else {
        alert('Error en la sincronización: ' + (data.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error al sincronizar:', error);
      alert('Error de red al intentar sincronizar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="inline-flex items-center gap-x-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Sincronizando...' : 'Sincronizar ISPGestión'}
    </button>
  );
}
