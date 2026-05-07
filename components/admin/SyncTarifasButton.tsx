'use client';

export default function SyncTarifasButton() {
  const handleSync = () => {
    alert('La sincronización de tarifas desde ISPGestión está desactivada. Las tarifas se gestionan manualmente desde el panel para evitar sobreescrituras de datos editados.');
  };

  return (
    <button
      onClick={handleSync}
      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors cursor-not-allowed"
      title="Sincronización de tarifas desactivada"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
      Sync Tarifas (Desactivado)
    </button>
  );
}
