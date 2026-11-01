import type { Prisma } from '@prisma/client'

/**
 * Read-only, transaction-local acceleration for the projection G7 seal.
 *
 * B4's current-state reader is an exact `findUnique({ where: { movimientoId } })`.
 * The projection has already constructed its complete source population before the
 * seal starts, so these known movement IDs (including both explicit transfer legs)
 * can be read once from the caller-owned repeatable/serializable transaction.
 *
 * This is intentionally not a general query cache: no raw query, filter, include,
 * select, relation, action, confirmation, undo or recovery path uses it. Arguments
 * outside that exact full-record lookup delegate directly to Prisma while the
 * callback is open. The proxy expires when the callback settles, preventing an old
 * read photo from escaping into later DML.
 */
type Tx = Prisma.TransactionClient & Record<string, any>

type SealSource = Readonly<{
  movimientoId?: unknown
  movimientoParId?: unknown
}>

export type ConciliarSealReadSnapshotRow = Readonly<{
  row: Readonly<{ movimientoId?: unknown }>
  source: SealSource
}>

const WRITE_METHODS = new Set([
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany', 'updateManyAndReturn',
  'upsert', 'delete', 'deleteMany', 'deleteManyAndReturn',
])

function sourceMovementIds(rows: readonly ConciliarSealReadSnapshotRow[]): string[] {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    // The values originate only in already-built server projection sources. Do not
    // derive IDs from predicates, links, UI selections or a broader population.
    if (typeof value === 'string' && value.length > 0 && value.length <= 160) ids.add(value)
  }
  for (const item of rows) {
    add(item.row.movimientoId)
    add(item.source.movimientoId)
    add(item.source.movimientoParId)
  }
  return [...ids]
}

/** Only B4's existing full-record currentState lookup is cache-compatible. */
function cachedCurrentStateId(args: unknown, knownIds: ReadonlySet<string>): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  const query = args as Record<string, unknown>
  const queryPrototype = Object.getPrototypeOf(query)
  if (queryPrototype !== Object.prototype) return null
  if (Object.keys(query).length !== 1 || !Object.prototype.hasOwnProperty.call(query, 'where')) return null
  const where = query.where
  if (!where || typeof where !== 'object' || Array.isArray(where)) return null
  const unique = where as Record<string, unknown>
  const wherePrototype = Object.getPrototypeOf(unique)
  if (wherePrototype !== Object.prototype) return null
  if (Object.keys(unique).length !== 1 || !Object.prototype.hasOwnProperty.call(unique, 'movimientoId')) return null
  const movimientoId = unique.movimientoId
  return typeof movimientoId === 'string' && knownIds.has(movimientoId) ? movimientoId : null
}

function snapshotClosed(): never {
  throw new Error('CONCILIAR_SEAL_READ_SNAPSHOT_CERRADO')
}

function snapshotWriteDenied(): never {
  throw new Error('CONCILIAR_SEAL_READ_SNAPSHOT_SOLO_LECTURA')
}

/**
 * Runs `callback` with the only proxy allowed to observe the B4 current-state
 * snapshot. All delegate functions retain their original delegate receiver; this
 * preserves Prisma extension/class method `this` semantics. `findMany` is invoked
 * on the supplied interactive TransactionClient, never on the global client.
 */
export async function withConciliarSealReadSnapshotTx<T>(
  base: Prisma.TransactionClient,
  rows: readonly ConciliarSealReadSnapshotRow[],
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const tx = base as Tx
  const movementIds = sourceMovementIds(rows)
  const currentStateDelegate = tx.estadoJustificacionMovimientoB4
  const currentStates = movementIds.length
    ? await currentStateDelegate.findMany({ where: { movimientoId: { in: movementIds } } })
    : []
  const byMovementId = new Map<string, any>()
  for (const state of currentStates) {
    if (state && typeof state.movimientoId === 'string') byMovementId.set(state.movimientoId, state)
  }

  const knownIds = new Set(movementIds)
  const delegateProxies = new WeakMap<object, object>()
  let open = true
  const assertOpen = () => { if (!open) snapshotClosed() }

  const proxyDelegate = (delegate: object, isCurrentStateDelegate: boolean): object => {
    const remembered = delegateProxies.get(delegate)
    if (remembered) return remembered
    const proxied = new Proxy(delegate, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, target)
        if (typeof value !== 'function') return Reflect.get(target, property, receiver)
        return (...args: unknown[]) => {
          assertOpen()
          if (typeof property === 'string' && WRITE_METHODS.has(property)) snapshotWriteDenied()
          if (isCurrentStateDelegate && property === 'findUnique') {
            const movimientoId = cachedCurrentStateId(args[0], knownIds)
            if (movimientoId !== null) {
              const state = byMovementId.get(movimientoId)
              // This model contains only scalar/JSON/date fields; keep the read
              // photo immutable even if a validator modifies its returned object.
              return Promise.resolve(state === undefined ? null : structuredClone(state))
            }
          }
          return Reflect.apply(value, target, args)
        }
      },
    })
    delegateProxies.set(delegate, proxied)
    return proxied
  }

  const snapshotTx = new Proxy(tx, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, target)
      if (typeof property === 'string' && (property === '$executeRaw' || property === '$executeRawUnsafe')) {
        return (..._args: unknown[]) => {
          assertOpen()
          return snapshotWriteDenied()
        }
      }
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          assertOpen()
          return Reflect.apply(value, target, args)
        }
      }
      if (value && typeof value === 'object') {
        return proxyDelegate(value, property === 'estadoJustificacionMovimientoB4')
      }
      return Reflect.get(target, property, receiver)
    },
  }) as Prisma.TransactionClient

  try {
    return await callback(snapshotTx)
  } finally {
    // Escaped references fail closed rather than reusing a pre-DML photo in an
    // action, recovery or any later phase of this transaction.
    open = false
  }
}
