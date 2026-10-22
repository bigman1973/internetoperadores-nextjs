/*
 * VM-only B4 smoke test. It imports only the pure core: no DATABASE_URL, Prisma
 * client, HTTP server or network access is used. Run manually with:
 *   npx tsx scripts/test-finance-b4-api.ts
 */
import assert from 'node:assert/strict'
import { validarBorradorMovimiento } from '../lib/finanzas/reconciliation-core'

const movimientoId = '11111111-1111-4111-8111-111111111111'
const documentoId = '22222222-2222-4222-8222-222222222222'

const confirmed = validarBorradorMovimiento(
  {
    movimientoId,
    importeMovimientoCentimos: -1250,
    estado: 'JUSTIFICADO',
    lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: documentoId, importeCentimos: -1250 }],
  },
  [{ documentoConciliableId: documentoId, tipoDocumento: 'FACTURA_RECIBIDA', importeObjetivoCentimos: -1250, netoActivoPrevioCentimos: 0 }],
)
assert.equal(confirmed.ok, true, 'un cierre exacto firmado debe ser válido')

const rejected = validarBorradorMovimiento(
  { movimientoId, importeMovimientoCentimos: -1250, estado: 'JUSTIFICADO', lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: documentoId, importeCentimos: 1250 }] },
  [{ documentoConciliableId: documentoId, tipoDocumento: 'FACTURA_RECIBIDA', importeObjetivoCentimos: -1250, netoActivoPrevioCentimos: 0 }],
)
assert.equal(rejected.ok, false, 'el signo opuesto no puede cerrar un pagadero')

console.log('B4 VM-only smoke test passed (2 scopes; no DB/network).')
