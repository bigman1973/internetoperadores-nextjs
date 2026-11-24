'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BellAlertIcon } from '@heroicons/react/24/outline';

interface Aviso { id: number; tipo: string; texto: string; gastoId: string | null; leido: boolean; fecha: string }
interface Resp { revisor: boolean; noLeidos: number; avisos: Aviso[]; pendientesRevision: number }

/** Avisos de gastos (aprobado, rechazado, aclaración, nuevos pendientes). Solo dentro del panel: no envía correos. */
export default function AvisosGastos({ compacto = false }: { compacto?: boolean }) {
  const [d, setD] = useState<Resp | null>(null);
  const cargar = useCallback(async () => {
    try { const r = await fetch('/api/empleado/mis-gastos/avisos', { cache: 'no-store' }); if (r.ok) setD(await r.json()); } catch { /* sin avisos */ }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function leerTodos() {
    await fetch('/api/empleado/mis-gastos/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todos: true }) });
    cargar();
  }
  if (!d) return null;
  const sinLeer = d.avisos.filter(a => !a.leido);
  if (!d.pendientesRevision && !sinLeer.length && compacto) return null;
  const mostrados = compacto ? sinLeer.slice(0, 4) : d.avisos.slice(0, 15);
  return (
    <section aria-label="Avisos de gastos" className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-medium text-orange-900"><BellAlertIcon className="h-5 w-5" />Avisos de gastos{sinLeer.length > 0 && <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs text-white">{sinLeer.length}</span>}</div>
        {sinLeer.length > 0 && <button type="button" onClick={leerTodos} className="min-h-9 text-xs font-medium text-orange-800 underline">Marcar como leídos</button>}
      </div>
      {d.revisor && d.pendientesRevision > 0 && (
        <Link href="/admin/gastos-nominas" className="mt-3 block rounded-lg bg-white px-3 py-2 text-sm font-medium text-orange-800 shadow-sm hover:bg-orange-100">
          Tienes {d.pendientesRevision} {d.pendientesRevision === 1 ? 'gasto pendiente' : 'gastos pendientes'} de revisar →
        </Link>
      )}
      <ul className="mt-3 space-y-2">
        {mostrados.map(a => (
          <li key={a.id} className={`rounded-lg px-3 py-2 text-sm ${a.leido ? 'bg-white/60 text-gray-600' : 'bg-white text-gray-900 shadow-sm'}`}>
            {a.texto}<span className="ml-2 text-xs text-gray-400">{new Date(a.fecha).toLocaleDateString('es-ES')}</span>
          </li>
        ))}
        {!mostrados.length && !(d.revisor && d.pendientesRevision) && <li className="text-sm text-gray-500">No tienes avisos.</li>}
      </ul>
      {compacto && <Link href="/empleado/mis-gastos" className="mt-3 inline-block text-sm font-medium text-orange-800 underline">Ir a mis gastos</Link>}
    </section>
  );
}
