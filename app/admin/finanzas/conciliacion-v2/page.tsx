import ReconciliationWorkspace from '@/components/finanzas/reconciliation-v2/ReconciliationWorkspace';

export const dynamic = 'force-dynamic';

/**
 * B4 is intentionally isolated from the legacy reconciliation screens. The
 * client workspace performs explicit reads and audited mutations against the
 * dedicated conciliacion-v2 API contract.
 */
export default function ConciliacionV2Page() {
  return <ReconciliationWorkspace />;
}
