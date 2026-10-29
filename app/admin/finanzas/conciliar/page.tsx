import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import ConciliarWorkspace from '@/components/finanzas/conciliar/ConciliarWorkspace';
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime';
import { requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import { requireAuth } from '@/lib/middleware/auth';
import { CONCILIAR_DEFAULT_CUTOFF, parseConciliarGetInput } from '@/lib/finanzas/conciliar-contract';
import { readConciliarProjection } from '@/lib/finanzas/conciliar-projection-read';
import prisma from '@/lib/prisma';
import { resolveFinanceConfirmingReadingAccess } from '@/lib/finanzas/finance-confirming-reading-access';
import { readPersistedFinanceConfirmingReadingQueue } from '@/lib/finanzas/finance-confirming-reading-persisted';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sfo1';

function calendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** La foto inicial ya pasó por ACL vivo y no se reutiliza fuera de este render. */
export default async function ConciliarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const started = performance.now();
  const timing = (phase: 'guard' | 'access' | 'projection') => {
    const region = process.env.VERCEL_REGION;
    const executionRegion = typeof region === 'string' && /^[a-z]{3}\d$/.test(region) ? region : 'unavailable';
    if (process.env.FINANCE_STAGING_SANDBOX === '1') console.info('conciliar-render-timing', { phase, elapsedMs: Math.round(performance.now() - started), executionRegion });
  };
  try {
    await assertConciliarRuntime();
    timing('guard');
    // requireAuth usa cache() de React: comparte únicamente la misma sesión ya
    // comprobada por el layout en este render, nunca permisos entre requests.
    const access = await requireB4FinanceAccess('lectura', await requireAuth('admin'));
    timing('access');
    if (!access.ok) notFound();
    const query = await searchParams;
    const initialTab = query.tab === 'PAGOS' || query.tab === 'EMITIDAS' || query.tab === 'RECIBIDAS' ? query.tab : 'COBROS';
    const initialQuery = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';
    const requestedCutoff = calendarDate(query.cutoffDate);
    const cookieCutoff = calendarDate((await cookies()).get('io_conciliar_cutoff')?.value);
    const initialCutoff = requestedCutoff ?? cookieCutoff ?? CONCILIAR_DEFAULT_CUTOFF;
    const requestedOrden = query.orden === 'FECHA' || query.orden === 'CONCEPTO' || query.orden === 'IMPORTE' ? query.orden : null;
    const requestedDireccion = query.direccion === 'ASC' || query.direccion === 'DESC' ? query.direccion : null;
    const initialOrden = requestedOrden ?? 'IMPORTE';
    const initialDireccion = requestedDireccion ?? 'DESC';
    const initialGlobalOrder = requestedOrden !== null || requestedDireccion !== null;
    const input = parseConciliarGetInput({
      tab: initialTab,
      ...(initialQuery ? { q: initialQuery } : {}),
      cutoffDate: initialCutoff,
      ...(initialOrden === 'IMPORTE' && initialDireccion === 'DESC' ? {} : { orden: initialOrden, direccion: initialDireccion }),
      limit: '20',
      offset: '0',
    });
    const [initialData, confirmingReadingQueue] = await Promise.all([
      readConciliarProjection(input),
      readPersistedFinanceConfirmingReadingQueue(prisma),
    ]);
    timing('projection');
    const confirmingReadingAccess = resolveFinanceConfirmingReadingAccess({ puedeConciliar: true, puedeParaPedir: false });
    return <><link rel="preload" href="/fonts/RobotoLatin-VF.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><ConciliarWorkspace key={`${initialTab}:${initialQuery}:${initialCutoff}:${initialOrden}:${initialDireccion}:${initialGlobalOrder}`} initialTab={initialTab} initialQuery={initialQuery} initialCutoff={initialCutoff} initialOrden={initialOrden} initialDireccion={initialDireccion} initialGlobalOrder={initialGlobalOrder} initialData={initialData} confirmingReadingQueue={confirmingReadingQueue} confirmingReadingAccess={confirmingReadingAccess} /></>;
  } catch (error) {
    if (error instanceof ConciliarRuntimeError) notFound();
    throw error;
  }
}
