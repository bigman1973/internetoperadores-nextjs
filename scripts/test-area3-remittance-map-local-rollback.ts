/*
 * Área 3 / G7: ensayo PostgreSQL estrictamente LOCAL, opt-in y rollback-only.
 *
 * Lee la conexión desde el fichero privado autorizado sólo al ejecutarse. Rechaza
 * producción/staging y cualquier host no local. Inserta dos FI sintéticas dentro
 * de una única TX SERIALIZABLE: una conserva el mapa/auditoría importada completos
 * y la otra no tiene FK ISP. Ambas se eliminan con el rollback obligatorio.
 *
 * Uso:
 *   AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK=1 \
 *   ./node_modules/.bin/tsx scripts/test-area3-remittance-map-local-rollback.ts
 */
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { Prisma, PrismaClient } from '@prisma/client'

const CONFIG_PATH = '/home/ubuntu/conciliar-cierre-20261029/privado/local-admin-db.json'
const PRIVATE_ERROR_PATH = '/home/ubuntu/conciliar-arreglos-20261030/privado/area3-remittance-map-local-error.txt'
const EXPECTED_DATABASE = 'io_restore_conciliar_fix_20261030_2111'
const TAG = `AREA3-G7-LOCAL-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 12, 0, 0))
const BANK_DAY = new Date(Date.UTC(2044, 1, 4, 12, 0, 0))
const GENERATION_AT = new Date(Date.UTC(2099, 0, 1, 0, 0, 0))

type Tx = any
class RollbackOnly extends Error { constructor() { super('AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK_ONLY') } }

function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function centsDecimal(cents: number): string { return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` }
function safeFailure(error: unknown): void {
  const raw = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : 'AREA3_G7_LOCAL_UNKNOWN'
  try { writeFileSync(PRIVATE_ERROR_PATH, raw, { encoding: 'utf8', mode: 0o600 }); chmodSync(PRIVATE_ERROR_PATH, 0o600) } catch { /* private diagnostic is best effort */ }
}

/** Accept only a local socket or loopback URL from the private local admin file. */
function localConnection(): string {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>
  const candidate = [raw.databaseUrl, raw.url, raw.connectionString, raw.connection_url, raw.DATABASE_URL]
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  assert(candidate, 'La configuración local no contiene una URL de conexión admitida.')
  const url = new URL(candidate)
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'La conexión local debe ser PostgreSQL.')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  assert(['127.0.0.1', '::1', 'localhost', ''].includes(host) || url.searchParams.has('host'), 'Sólo se admite loopback o socket Unix local.')
  const database = decodeURIComponent(url.pathname.slice(1))
  assert.equal(database, EXPECTED_DATABASE, 'La base no es la restauración local autorizada.')
  return candidate
}

async function assertLocalIdentity(db: PrismaClient): Promise<void> {
  const rows = await db.$queryRaw<Array<{ database: string; host: string | null }>>`
    SELECT current_database() AS database, host(inet_server_addr()) AS host LIMIT 1
  `
  assert.equal(rows.length, 1, 'La conexión debe responder una única identidad.')
  assert.equal(rows[0]?.database, EXPECTED_DATABASE, 'La identidad local no corresponde a la restauración autorizada.')
  assert(['127.0.0.1', '::1', null].includes(rows[0]?.host ?? null), 'El servidor no es socket/loopback local.')
}

async function fixtureCount(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
    SELECT (
      (SELECT count(*) FROM remesas WHERE nombre=${`${TAG}-REMESA`}) +
      (SELECT count(*) FROM facturas WHERE serie_factura=${TAG}) +
      (SELECT count(*) FROM facturas_emitidas WHERE num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM identidad_factura_isp_eventos_b7 identity_event
        JOIN facturas_emitidas fi ON fi.id=identity_event.factura_emitida_id
        WHERE fi.num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM cuentas_bancarias WHERE alias=${TAG}) +
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM modo_facil_generaciones_cobro WHERE fuente=${TAG}) +
      (SELECT count(*) FROM modo_facil_propuestas_cobro proposal
        JOIN modo_facil_generaciones_cobro generation ON generation.id=proposal.generacion_id
        WHERE generation.fuente=${TAG})
    )::bigint AS total
  `)
  return Number(rows[0]?.total ?? 0)
}

async function run(): Promise<void> {
  assert.equal(process.env.AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK, '1', 'AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK=1 es obligatorio.')
  assert.notEqual(process.env.NODE_ENV, 'production', 'El ensayo local no se ejecuta en producción.')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'El ensayo local no se ejecuta en producción.')
  const url = localConnection()
  const savedDatabaseUrl = process.env.DATABASE_URL
  const savedSandbox = process.env.FINANCE_STAGING_SANDBOX
  process.env.DATABASE_URL = url
  process.env.FINANCE_STAGING_SANDBOX = '0'
  const client = new PrismaClient({ datasources: { db: { url } } })
  let shared: { $disconnect: () => Promise<void> } | null = null
  let reachedRollback = false
  try {
    const [mapDb, prismaModule] = await Promise.all([
      import('../lib/finanzas/area3-remittance-map-db'),
      import('../lib/prisma'),
    ])
    shared = prismaModule.default as unknown as { $disconnect: () => Promise<void> }
    await assertLocalIdentity(client)
    assert.equal(await fixtureCount(client), 0, 'Existe una colisión previa de fixtures sintéticos.')
    try {
      await client.$transaction(async (tx: Tx) => {
        let seed = 1_900_000_000 + (Date.now() % 10_000_000)
        const nextIsp = () => ++seed
        const account = await tx.cuentaBancaria.create({ data: {
          id: randomUUID(), banco: `${TAG}-BANCO`, alias: TAG,
          iban: `ES00${randomUUID().replaceAll('-', '').slice(0, 30)}`, activa: true, fechaCorteExtracto: null,
        }, select: { id: true } })
        const remesa = await tx.remesa.create({ data: {
          ispGestionId: nextIsp(), nombre: `${TAG}-REMESA`, fecha: DAY,
          totalImporte: centsDecimal(20_000), numeroRegistros: 2,
        }, select: { id: true } })
        const source = await tx.factura.create({ data: {
          ispGestionId: nextIsp(), serieFactura: TAG, numeroDocumento: `${TAG}-FACTURA`, fecha: DAY,
          idCliente: nextIsp(), codigoCliente: `${TAG}-CLIENTE`, nombreCompleto: `${TAG}-CLIENTE`, nifCif: 'B12345678',
          base: centsDecimal(10_000), totalImpuesto: '0.00', total: centsDecimal(10_000), situacion: 'PENDIENTE', totalPendiente: centsDecimal(10_000), remesaId: remesa.id,
        }, select: { id: true, ispGestionId: true, numeroDocumento: true, serieFactura: true, nombreCompleto: true, nifCif: true } })
        const completeFi = await tx.facturaEmitida.create({ data: {
          id: randomUUID(), cliente: source.nombreCompleto, cif: source.nifCif, numFactura: source.numeroDocumento, serie: source.serieFactura, fecha: DAY,
          base: 100, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total: 100, origenSistema: 'ISPGestion', idExterno: String(source.ispGestionId), facturaISPId: source.id,
        }, select: { id: true } })
        const missingFi = await tx.facturaEmitida.create({ data: {
          id: randomUUID(), cliente: `${TAG}-CLIENTE-SIN-MAPA`, cif: 'B87654321', numFactura: `${TAG}-SIN-MAPA`, serie: TAG, fecha: DAY,
          base: 100, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total: 100, origenSistema: 'ISPGestion', idExterno: String(nextIsp()),
        }, select: { id: true } })
        const actor = await tx.usuarioAdmin.create({ data: {
          email: `${TAG.toLowerCase()}@example.invalid`, passwordHash: '$2b$12$Area3MapRollbackOnlyHash', nombre: TAG,
          rol: 'SUPER_ADMIN', roles: ['CONTABILIDAD'], activo: true,
        }, select: { id: true } })
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO identidad_factura_isp_eventos_b7(id,factura_emitida_id,factura_isp_id,actor_id,fuente_hash,snapshot)
          VALUES(CAST(${randomUUID()} AS uuid),${completeFi.id},${source.id},${actor.id},${sha(`${TAG}:identity`)},CAST(${JSON.stringify({ idExterno: String(source.ispGestionId), noAcreditaCobro: true })} AS jsonb))
        `)
        const movement = await tx.movimientoBancario.create({ data: {
          id: randomUUID(), cuentaId: account.id, fechaOperacion: BANK_DAY, fechaValor: BANK_DAY, importe: 100,
          concepto: `${TAG}-ABONO`, referencia: TAG, tercero: `${TAG}-TERCERO`, hashUnico: `${TAG}-${randomUUID()}`,
        }, select: { id: true } })
        const generationId = randomUUID()
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO modo_facil_generaciones_cobro(id,creada_at,fuente,resumen)
          VALUES(CAST(${generationId} AS uuid),${GENERATION_AT},${TAG},'{}'::jsonb)
        `)
        const proposal = async (id: string, fiId: string, label: string) => {
          const lineas = [{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: String(remesa.id), importeCentimos: 10_000 }]
          const composicion = [{ facturaEmitidaId: fiId, importeCentimos: 10_000 }]
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO modo_facil_propuestas_cobro(id,generacion_id,movimiento_id,movimiento_par_id,importe_movimiento_centimos,metodo,nivel,estado_propuesto,motivo_no_requiere,lineas,composicion,explicacion,fingerprint)
            VALUES(CAST(${id} AS uuid),CAST(${generationId} AS uuid),${movement.id},NULL,10000,'REMESA_VENCIMIENTO','EXACTA','JUSTIFICADO',NULL,CAST(${JSON.stringify(lineas)} AS jsonb),CAST(${JSON.stringify(composicion)} AS jsonb),${label},${sha(`${TAG}:${label}`)})
          `)
        }
        const completeProposal = randomUUID()
        await proposal(completeProposal, completeFi.id, `${TAG}-COMPLETA`)
        const rawComplete = [{ propuestaId: completeProposal, generacionId, metodo: 'REMESA_VENCIMIENTO', lineas: [{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: String(remesa.id), importeCentimos: 10_000 }], composicion: [{ facturaEmitidaId: completeFi.id, importeCentimos: 10_000 }] }]
        const complete = await mapDb.readArea3RemittanceMapPreflightsTx(tx, rawComplete)
        assert.equal(complete.get(completeProposal)?.complete, true, 'El candidato con mapa auditado y corroboración importada debe pasar G7.')

        // Reuse the real reader with a second current-generation proposal in the
        // same rollback transaction. It must become AMBAR without creating a map.
        const missingMovement = await tx.movimientoBancario.create({ data: {
          id: randomUUID(), cuentaId: account.id, fechaOperacion: BANK_DAY, fechaValor: BANK_DAY, importe: 100,
          concepto: `${TAG}-ABONO-SIN-MAPA`, referencia: `${TAG}-SIN-MAPA`, tercero: `${TAG}-TERCERO`, hashUnico: `${TAG}-${randomUUID()}`,
        }, select: { id: true } })
        const missingProposal = randomUUID()
        const missingLines = [{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: String(remesa.id), importeCentimos: 10_000 }]
        const missingComposition = [{ facturaEmitidaId: missingFi.id, importeCentimos: 10_000 }]
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO modo_facil_propuestas_cobro(id,generacion_id,movimiento_id,movimiento_par_id,importe_movimiento_centimos,metodo,nivel,estado_propuesto,motivo_no_requiere,lineas,composicion,explicacion,fingerprint)
          VALUES(CAST(${missingProposal} AS uuid),CAST(${generationId} AS uuid),${missingMovement.id},NULL,10000,'REMESA_VENCIMIENTO','EXACTA','JUSTIFICADO',NULL,CAST(${JSON.stringify(missingLines)} AS jsonb),CAST(${JSON.stringify(missingComposition)} AS jsonb),${`${TAG}-SIN-MAPA`},${sha(`${TAG}:missing`)})
        `)
        const rawMissing = [{ propuestaId: missingProposal, generacionId, metodo: 'REMESA_VENCIMIENTO', lineas: missingLines, composicion: missingComposition }]
        const missing = await mapDb.lockArea3RemittanceMapPreflightsTx(tx, rawMissing)
        assert.deepEqual(missing.get(missingProposal) && { complete: missing.get(missingProposal)!.complete, missing: missing.get(missingProposal)!.missingReceiptCount }, { complete: false, missing: 1 }, 'El candidato sin FK FI→ISP debe quedar AMBAR antes de B4/B6/B7.')
        assert((await fixtureCount(tx)) > 0, 'Los fixtures deben existir dentro de la transacción antes del rollback.')
        reachedRollback = true
        throw new RollbackOnly()
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
    } catch (error) {
      if (!(error instanceof RollbackOnly)) throw error
    }
    assert(reachedRollback, 'El ensayo no alcanzó el rollback obligatorio.')
    assert.equal(await fixtureCount(client), 0, 'El rollback obligatorio debe eliminar los fixtures sintéticos.')
    console.log(JSON.stringify({ test: 'area3-remittance-map-local-rollback', localOnly: true, serializable: true, rollback: true, passed: true, scenarios: ['complete-map-green', 'missing-map-amber'], mutationsCommitted: 0 }))
  } finally {
    await client.$disconnect()
    if (shared) await shared.$disconnect()
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = savedDatabaseUrl
    if (savedSandbox === undefined) delete process.env.FINANCE_STAGING_SANDBOX
    else process.env.FINANCE_STAGING_SANDBOX = savedSandbox
  }
}

run().catch(error => {
  safeFailure(error)
  const code = error instanceof Error && error.message.includes('AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK=1 es obligatorio.')
    ? 'AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK_OPT_IN_REQUIRED'
    : 'AREA3_REMITTANCE_MAP_LOCAL_ROLLBACK_FAILED'
  console.error(code)
  process.exitCode = 1
})
