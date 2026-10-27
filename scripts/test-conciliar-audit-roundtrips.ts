/*
 * Prueba local, sin red ni DATABASE_URL. Simula las tres mutaciones persistentes
 * de una confirmación B4 de comisión: operación, estado y eventos. Comprueba que
 * siguen revalidándose una por una, que conservan un recibo por acción y que los
 * recibos se insertan juntos dentro del mismo tx.
 */
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import {
  guardPrismaImpersonationMutation,
  runWithImpersonationMutationAuditScope,
} from '../lib/prisma'
import type { TrustedImpersonationContext } from '../lib/impersonation-context'

type FakeTx = {
  auditQueries: Prisma.Sql[]
  $executeRaw: (query: Prisma.Sql) => Promise<number>
}

const context: TrustedImpersonationContext = {
  v: 'v1',
  sessionId: '11111111-1111-4111-8111-111111111111',
  actorId: 101,
  targetId: 202,
  reason: 'Fixture local conciliar_audit_roundtrips.',
  method: 'POST',
  path: '/api/admin/finanzas/conciliar',
  action: 'confirmar',
  ip: null,
  ipSource: 'untrusted_proxy',
}

function fakeTx(): FakeTx {
  const auditQueries: Prisma.Sql[] = []
  return {
    auditQueries,
    async $executeRaw(query) {
      auditQueries.push(query)
      return 1
    },
  }
}

async function guardedWrite(
  tx: FakeTx,
  model: string,
  counters: { verify: number; mutation: number },
  fail = false,
): Promise<void> {
  await guardPrismaImpersonationMutation(
    { action: 'update', args: [], model },
    async () => {
      counters.mutation += 1
      if (fail) throw new Error('conciliar_fixture_rollback')
    },
    {
      requestContext: { status: 'valid', context },
      transaction: tx as never,
      verifyLiveContext: async (checked, checkedTx) => {
        counters.verify += 1
        assert.equal(checked, context, 'La revalidación conserva el contexto firmado exacto.')
        assert.equal(checkedTx, tx, 'La revalidación usa el mismo cliente transaccional.')
        return true
      },
    },
  )
}

async function main(): Promise<void> {
  const commissionTx = fakeTx()
  const commissionCounters = { verify: 0, mutation: 0 }
  await runWithImpersonationMutationAuditScope(commissionTx as never, async () => {
    await guardedWrite(commissionTx, 'OperacionJustificacionB4', commissionCounters)
    await guardedWrite(commissionTx, 'EstadoJustificacionMovimientoB4', commissionCounters)
    await guardedWrite(commissionTx, 'EventoJustificacionB4', commissionCounters)
  })
  assert.deepEqual(commissionCounters, { verify: 3, mutation: 3 }, 'Cada acción conserva su revalidación viva y su mutación.')
  assert.equal(commissionTx.auditQueries.length, 1, 'Tres recibos SUCCESS de comisión usan un único INSERT en el mismo tx.')
  const batchedSql = commissionTx.auditQueries[0]
  assert.ok(batchedSql.strings.join('').includes('INSERT INTO impersonation_event_log'), 'El único viaje mantiene la tabla de auditoría.')
  assert.equal(batchedSql.values.filter((value) => value === context.sessionId).length, 3, 'El lote conserva una fila de auditoría por acción, no un resumen.')

  const rollbackTx = fakeTx()
  const rollbackCounters = { verify: 0, mutation: 0 }
  await assert.rejects(
    () => runWithImpersonationMutationAuditScope(rollbackTx as never, async () => {
      await guardedWrite(rollbackTx, 'OperacionJustificacionB4', rollbackCounters)
      await guardedWrite(rollbackTx, 'EstadoJustificacionMovimientoB4', rollbackCounters, true)
    }),
    /conciliar_fixture_rollback/,
  )
  assert.deepEqual(rollbackCounters, { verify: 2, mutation: 2 }, 'El fallo no omite la revalidación de la acción que iba a ejecutarse.')
  assert.equal(rollbackTx.auditQueries.length, 0, 'Un callback fallido no vacía recibos: el commit no puede dejar auditoría falsa.')

  const deniedTx = fakeTx()
  let deniedMutation = 0
  let deniedVerification = 0
  await assert.rejects(
    () => guardPrismaImpersonationMutation(
      { action: 'update', args: [], model: 'OperacionJustificacionB4' },
      async () => { deniedMutation += 1 },
      {
        requestContext: { status: 'valid', context },
        transaction: deniedTx as never,
        verifyLiveContext: async () => { deniedVerification += 1; return false },
      },
    ),
    /IMPERSONATION_WRITE_DENIED/,
  )
  assert.deepEqual({ deniedVerification, deniedMutation, auditWrites: deniedTx.auditQueries.length }, { deniedVerification: 1, deniedMutation: 0, auditWrites: 0 }, 'Sesión/ACL viva denegada bloquea DML y recibo.')

  console.log(JSON.stringify({
    fixture: 'conciliar_audit_roundtrips',
    databaseOperations: 0,
    commissionActions: 3,
    liveRevalidations: commissionCounters.verify,
    auditRows: 3,
    auditInsertRoundTripsBefore: 3,
    auditInsertRoundTripsAfter: commissionTx.auditQueries.length,
    rollbackFlushes: rollbackTx.auditQueries.length,
    deniedMutation: deniedMutation,
    deniedAuditWrites: deniedTx.auditQueries.length,
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
