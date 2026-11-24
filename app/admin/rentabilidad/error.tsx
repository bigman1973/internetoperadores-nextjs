'use client';
export default function ErrorRentabilidad({ reset }: { reset: () => void }) {
  return <div className="p-6 space-y-4 text-slate-900"><h1 className="text-2xl font-bold">Rentabilidad no disponible</h1><p>No se pudo leer la proyección guardada. No se ha modificado ningún dato. Este módulo solo está habilitado en staging para el superadmin real.</p><button className="rounded-lg bg-primary px-4 py-2 text-white" onClick={reset}>Volver a intentar</button></div>;
}
