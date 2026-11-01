import assert from 'node:assert/strict'
import test from 'node:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { withConciliarSealReadSnapshotTx } from '../lib/finanzas/conciliar-seal-read-snapshot'

test('snapshot G7 agrupa currentState, conserva receptor Prisma y sólo cachea findUnique exacto', async () => {
  const fullA = { movimientoId: 'movement-a', estado: 'SIN_DOCUMENTO', version: 1 }
  const fullB = { movimientoId: 'movement-b', estado: 'JUSTIFICADO', version: 7 }
  const findManyCalls: unknown[] = []
  const liveFindUniqueCalls: unknown[] = []
  let auxiliaryReceiver: unknown = null
  const stateDelegate = {
    async findMany(args: unknown) {
      assert.strictEqual(this, stateDelegate, 'findMany conserva el receptor del delegado real')
      findManyCalls.push(args)
      return [fullA, fullB]
    },
    async findUnique(args: unknown) {
      assert.strictEqual(this, stateDelegate, 'fallback findUnique conserva el receptor del delegado real')
      liveFindUniqueCalls.push(args)
      return { movimientoId: 'live', estado: 'SIN_DOCUMENTO', version: 99 }
    },
    async create() { throw new Error('La escritura no debe alcanzar el delegado') },
  }
  const otherDelegate = {
    async findUnique(args: unknown) {
      auxiliaryReceiver = this
      return { args }
    },
  }
  const tx = {
    estadoJustificacionMovimientoB4: stateDelegate,
    otraLectura: otherDelegate,
    async $queryRaw() { return [] },
    async $executeRaw() { throw new Error('La escritura no debe alcanzar el cliente') },
  }
  const scope = new AsyncLocalStorage<object>()
  let callbackTx: object | null = null
  let stateDelegateReference: object | null = null
  const rows = [
    { row: { movimientoId: 'movement-a', color: 'VERDE', seleccionable: false }, source: { movimientoId: 'movement-a', movimientoParId: 'movement-b' } },
    { row: { movimientoId: 'movement-a', color: 'AMBAR', seleccionable: false }, source: { movimientoId: 'movement-a', movimientoParId: 'movement-b' } },
  ]

  await withConciliarSealReadSnapshotTx(tx as never, rows, async snapshotTx => {
    callbackTx = snapshotTx as object
    await scope.run(snapshotTx as object, async () => {
      // This mirrors the manual-pair ALS rule: preparation and its later
      // precheck must receive one exact proxy identity, never base then proxy.
      assert.strictEqual(scope.getStore(), snapshotTx)
      stateDelegateReference = (snapshotTx as any).estadoJustificacionMovimientoB4
      assert.strictEqual(await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: 'movement-a' } }), fullA)
      assert.strictEqual(await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: 'movement-b' } }), fullB)
      // A changed select is not semantically equivalent to B4 currentState;
      // it must never receive a full cached record.
      const selected = await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique({
        where: { movimientoId: 'movement-a' }, select: { version: true },
      })
      assert.equal(selected.version, 99)
      await (snapshotTx as any).otraLectura.findUnique({ where: { id: 'other' } })
      assert.strictEqual(auxiliaryReceiver, otherDelegate, 'delegados no cacheados conservan this')
      assert.throws(() => (snapshotTx as any).estadoJustificacionMovimientoB4.create({ data: {} }), /SOLO_LECTURA/)
      assert.throws(() => (snapshotTx as any).$executeRaw('UPDATE forbidden'), /SOLO_LECTURA/)
    })
  })

  assert.notStrictEqual(callbackTx, tx, 'el sello opera con una identidad temporal distinta del cliente base')
  assert.ok(stateDelegateReference, 'el delegado se expone durante el callback')
  assert.deepEqual(findManyCalls, [{ where: { movimientoId: { in: ['movement-a', 'movement-b'] } } }])
  assert.equal(liveFindUniqueCalls.length, 1, 'select alterado hace fallback vivo')
  assert.equal((liveFindUniqueCalls[0] as any).select.version, true)
  assert.deepEqual(rows.map(item => item.row.seleccionable), [false, false], 'la foto de lectura no promueve flags ni toca decisiones G7')
  assert.throws(() => (stateDelegateReference as any).findUnique({ where: { movimientoId: 'movement-a' } }), /CERRADO/)
})

test('snapshot G7 conserva null de fila B4 ausente, rechaza argumentos no exactos y no vive fuera del callback', async () => {
  const liveCalls: unknown[] = []
  const stateDelegate = {
    async findMany() { return [] },
    async findUnique(args: unknown) { liveCalls.push(args); return { movimientoId: 'live-only', version: 3 } },
    async update() { throw new Error('La escritura no debe alcanzar el delegado') },
  }
  const tx = { estadoJustificacionMovimientoB4: stateDelegate }
  let escapedTx: any = null

  await withConciliarSealReadSnapshotTx(tx as never, [
    { row: { movimientoId: 'missing' }, source: { movimientoId: 'missing' } },
  ], async snapshotTx => {
    escapedTx = snapshotTx
    assert.equal(await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: 'missing' } }), null)
    await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: 'missing' }, include: { movimiento: true } })
    await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: { equals: 'missing' } } })
    await (snapshotTx as any).estadoJustificacionMovimientoB4.findUnique(Object.assign(Object.create(null), { where: { movimientoId: 'missing' } }))
    assert.throws(() => (snapshotTx as any).estadoJustificacionMovimientoB4.update({ where: { movimientoId: 'missing' }, data: {} }), /SOLO_LECTURA/)
  })

  assert.equal(liveCalls.length, 3, 'include, uniqueWhere mutado o args desconocidos no puede consumir una foto completa')
  assert.throws(() => escapedTx.estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: 'missing' } }), /CERRADO/)
})
