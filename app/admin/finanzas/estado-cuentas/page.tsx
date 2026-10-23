'use client'

import ManualCutoffWorkspace from '@/components/finanzas/ManualCutoffWorkspace'

/**
 * B3 cortes manuales: la pantalla sustituye la antigua vista pasiva por una
 * confirmación humana auditada. No actualiza movimientos ni saldos bancarios.
 */
export default function EstadoCuentasPage() {
  return <ManualCutoffWorkspace />
}
