'use client';

import { useState, type ReactNode } from 'react';
import EasyReviewQueuePanel from './EasyReviewQueuePanel';

export type EasyReviewQueueStep = 'TODOS' | 'P1_PENDIENTE' | 'P2_PENDIENTE' | 'COBROS_PROPUESTOS';

type QueuePanel = Exclude<EasyReviewQueueStep, 'TODOS'>;

type EasyReviewQueuesProps = Readonly<{
  whoQueueEnabled: boolean;
  whoQueue: ReactNode;
  collectionQueue: ReactNode;
  documentQueue: ReactNode;
}>;

/** La vista "Todos" conserva el comportamiento actual: presenta las tres colas. */
export function isReviewQueueVisible(step: EasyReviewQueueStep, panel: QueuePanel): boolean {
  return step === 'TODOS' || step === panel;
}

/**
 * Aislante de presentación para las pestañas de Modo fácil.
 *
 * No consulta servicios ni inicia acciones. Mantiene los paneles que ya muestra
 * "Todos" montados y sólo alterna su visibilidad; así el clic de pestaña no
 * vuelve a renderizar ni a reinicializar las colas grandes que no han cambiado.
 */
export default function EasyReviewQueues({ whoQueueEnabled, whoQueue, collectionQueue, documentQueue }: EasyReviewQueuesProps) {
  const [queueStep, setQueueStep] = useState<EasyReviewQueueStep>('TODOS');

  return <section aria-labelledby="queue-title">
    <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 id="queue-title" className="text-xl font-extrabold text-slate-950">Colas de revisión</h2>
        <p className="mt-1 text-sm text-slate-600">Primero revisa quién es; después, qué papel lo justifica.</p>
      </div>
      <div role="tablist" aria-label="Cola de revisión" className="flex flex-wrap gap-2">
        <button type="button" role="tab" aria-selected={queueStep === 'TODOS'} onClick={() => setQueueStep('TODOS')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 ${queueStep === 'TODOS' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>Todos</button>
        <button type="button" role="tab" aria-selected={queueStep === 'P1_PENDIENTE'} disabled={!whoQueueEnabled} onClick={() => setQueueStep('P1_PENDIENTE')} title={!whoQueueEnabled ? 'Esta cola estará disponible cuando los datos estén listos.' : undefined} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${queueStep === 'P1_PENDIENTE' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-950 hover:bg-blue-100'}`}>Quién es</button>
        <button type="button" role="tab" aria-selected={queueStep === 'P2_PENDIENTE'} onClick={() => setQueueStep('P2_PENDIENTE')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 ${queueStep === 'P2_PENDIENTE' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-950 hover:bg-orange-100'}`}>Qué papel lo justifica</button>
        <button type="button" role="tab" aria-selected={queueStep === 'COBROS_PROPUESTOS'} onClick={() => setQueueStep('COBROS_PROPUESTOS')} className={`rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600 ${queueStep === 'COBROS_PROPUESTOS' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-950 hover:bg-emerald-100'}`}>Cobros con factura propuesta</button>
      </div>
    </div>

    <EasyReviewQueuePanel id="easy-queue-all" panel="who" visible={queueStep === 'TODOS'} isolated={false} children={null} />
    <EasyReviewQueuePanel id="easy-queue-who" panel="who" visible={isReviewQueueVisible(queueStep, 'P1_PENDIENTE')} isolated={queueStep !== 'TODOS'}>
      {whoQueue}
    </EasyReviewQueuePanel>
    <EasyReviewQueuePanel id="easy-queue-collections" panel="collections" visible={isReviewQueueVisible(queueStep, 'COBROS_PROPUESTOS')} isolated={queueStep !== 'TODOS'} className={queueStep === 'TODOS' ? 'mt-5' : undefined}>
      {collectionQueue}
    </EasyReviewQueuePanel>
    <EasyReviewQueuePanel id="easy-queue-document" panel="document" visible={isReviewQueueVisible(queueStep, 'P2_PENDIENTE')} isolated={queueStep !== 'TODOS'} className={queueStep === 'TODOS' ? 'mt-5' : undefined}>
      {documentQueue}
    </EasyReviewQueuePanel>
  </section>;
}
