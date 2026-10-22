import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { B4ServiceError, confirmarB4, createDocumentoB4, deshacerB4 } from '../lib/finanzas/reconciliation-db'
import { leerCandidatasNomina } from '../lib/finanzas/nominas-propuestas-db'
import { evaluarSeleccionNominas } from '../lib/finanzas/nominas-propuestas-core'
import { bibliotecaFinancieraConfigurada } from '../lib/finanzas/archivo-fuente-controlada'
import {
  listarArchivosPrivadosMovimiento,
  resolverArchivoPrivadoMovimiento,
} from '../lib/finanzas/movimiento-archivos-privados'

/**
 * Integración B4/nóminas exclusivamente para io_staging_finanzas.
 *
 * Ejecutar sólo así:
 * FINANCE_STAGING_SANDBOX=1 FINANCE_NOMINAS_ROLLBACK_TEST=1 \
 *   npx tsx scripts/test-finance-nominas-postgres.ts
 *
 * No usa Graph ni red: las fuentes nómina/archivo se leen únicamente desde BD.
 * Todos los fixtures, wrappers, vínculos y recibos quedan dentro de una única
 * transacción SERIALIZABLE exterior, terminada siempre por rollback intencional.
 */

const TAG = `NOMINAS-ROLLBACK-${randomUUID()}`
const DAY = new Date('2042-02-02T09:00:00.000Z')
const PRIVATE_ERROR_FILE = '/home/ubuntu/finanzas-victor-20261022/nominas-postgres-error-private.txt'
type Tx = any
type Snapshot = Record<string, unknown>
let diagnosticPhase = 'bootstrap'

class RollbackSentinel extends Error {
  constructor() { super('FINANCE_NOMINAS_ROLLBACK_ONLY') }
}

class SanitizedTestError extends Error {
  constructor(public readonly code: string) { super(code) }
}

function equal<T>(actual: T, expected: T, message?: string): asserts actual is T {
  assert.equal(actual, expected, message)
}

/** Only counts and aggregate hashes; existing source rows never leave PostgreSQL. */
async function payrollBaseline(): Promise<Snapshot> {
  const rows = await prisma.$queryRawUnsafe<Array<{ snapshot: Snapshot }>>(`
    SELECT jsonb_object_agg(nombre, jsonb_build_object('count', cantidad, 'hash', huella)) AS snapshot
    FROM (
      SELECT 'nominas'::text AS nombre, count(*)::text AS cantidad,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS huella
      FROM nominas t
      UNION ALL
      SELECT 'movimientos_bancarios', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), ''))
      FROM movimientos_bancarios t
      UNION ALL
      SELECT 'vinculos_movimiento_documento', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), ''))
      FROM vinculos_movimiento_documento t
    ) s
  `)
  equal(rows.length, 1, 'No se pudo obtener el baseline financiero')
  return rows[0].snapshot
}

async function fixtureCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number | string }>>`
    SELECT (
      (SELECT count(*) FROM empleados WHERE nombre_completo LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM nominas n JOIN empleados e ON e.id = n.empleado_id WHERE e.nombre_completo LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM nomina_documentos nd JOIN nominas n ON n.id = nd.nomina_id JOIN empleados e ON e.id = n.empleado_id WHERE e.nombre_completo LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM cuentas_bancarias WHERE iban = ${`ES00${TAG.replaceAll('-', '')}`}) +
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM documentos_conciliables d JOIN nominas n ON n.id = d.nomina_id JOIN empleados e ON e.id = n.empleado_id WHERE e.nombre_completo LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM vinculos_movimiento_documento v JOIN movimientos_bancarios m ON m.id = v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM estado_justificacion_movimientos e JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM operaciones_justificacion_b4 o JOIN movimientos_bancarios m ON m.id = o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM eventos_justificacion_b4 e JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM recibos_eleccion_centro_b8 r JOIN operaciones_justificacion_b4 o ON o.id = r.operacion_b4_id JOIN movimientos_bancarios m ON m.id = o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})
    )::bigint AS count
  `
  return Number(rows[0]?.count ?? 0)
}

async function b4Rejected(code: string, status: number, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B4ServiceError, `Se esperaba B4ServiceError ${code}`)
    equal(error.code, code, 'Código B4 inesperado')
    equal(error.status, status, 'Estado HTTP B4 inesperado')
    return
  }
  assert.fail(`La operación debía rechazar ${code}`)
}

async function main() {
  if (process.env.FINANCE_NOMINAS_ROLLBACK_TEST !== '1') throw new Error('FINANCE_NOMINAS_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('FINANCE_STAGING_SANDBOX=1 es obligatorio')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('NOMINAS_TEST_PRODUCTION_BLOCKED')

  // The only pre-transaction reads: exact isolated identity, C9 DDL and local library.
  const [identity, c9] = await Promise.all([
    prisma.$queryRaw<Array<{ db: string; usuario: string }>>`SELECT current_database() AS db, current_user AS usuario`,
    prisma.$queryRaw<Array<{ applied: bigint | number }>>`
      SELECT count(*)::bigint AS applied FROM pg_trigger
      WHERE tgname IN ('facturas_recibidas_naturaleza_c9_tr', 'documentos_conciliables_fuente_confirming_c9_tr')
        AND NOT tgisinternal
    `,
  ])
  equal(identity[0]?.db, 'io_staging_finanzas', 'La prueba sólo admite io_staging_finanzas')
  equal(identity[0]?.usuario, 'io_staging_finanzas', 'La prueba sólo admite el rol aislado')
  equal(Number(c9[0]?.applied ?? 0), 2, 'Las guardas C9 requeridas no están aplicadas en staging')
  assert(bibliotecaFinancieraConfigurada(), 'SHAREPOINT_DRIVE_ID/DRIVE_ID local y válido es obligatorio')

  const before = await payrollBaseline()
  equal(await fixtureCount(), 0, 'Colisión improbable de fixtures de nómina')

  const singleton = prisma as any
  const realTransaction = singleton.$transaction.bind(singleton)
  let reachedSentinel = false
  let phase = 'preflight'

  try {
    await realTransaction(async (tx: Tx) => {
      // Services import the root singleton. Route their nested transactions, raw
      // staging fence, and private file-reader delegates to this outer rollback tx.
      const saved = {
        transaction: singleton.$transaction,
        queryRaw: singleton.$queryRaw,
        queryRawUnsafe: singleton.$queryRawUnsafe,
        movimientoBancario: singleton.movimientoBancario,
        vinculoMovimientoDocumento: singleton.vinculoMovimientoDocumento,
        adjuntoPendienteB5: singleton.adjuntoPendienteB5,
        soporteConfirmingDraxton: singleton.soporteConfirmingDraxton,
      }
      singleton.$transaction = async (callback: (serviceTx: Tx) => Promise<unknown>) => callback(tx)
      singleton.$queryRaw = tx.$queryRaw.bind(tx)
      singleton.$queryRawUnsafe = tx.$queryRawUnsafe.bind(tx)
      singleton.movimientoBancario = tx.movimientoBancario
      singleton.vinculoMovimientoDocumento = tx.vinculoMovimientoDocumento
      singleton.adjuntoPendienteB5 = tx.adjuntoPendienteB5
      singleton.soporteConfirmingDraxton = tx.soporteConfirmingDraxton

      try {
        diagnosticPhase = phase
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
        let sequence = 0
        const at = () => new Date(DAY.getTime() + (++sequence) * 60_000)
        const actor = await tx.usuarioAdmin.create({
          data: {
            email: `${TAG.toLowerCase()}@example.invalid`,
            nombre: `${TAG}-ACTOR`,
            passwordHash: '$2b$12$NominasRollbackOnlyNoLoginHash',
            rol: 'SUPER_ADMIN', roles: ['CONTABILIDAD'], activo: true,
          },
          select: { id: true },
        })
        const account = await tx.cuentaBancaria.create({
          data: { id: randomUUID(), banco: `${TAG}-BANCO`, iban: `ES00${TAG.replaceAll('-', '')}`, alias: `${TAG}-CUENTA`, activa: true },
          select: { id: true },
        })
        const employee = async (suffix: string) => tx.empleado.create({
          data: { id: randomUUID(), codigoNomina: `${TAG}-${suffix}`, nombreCompleto: `${TAG}-EMPLEADO-${suffix}`, nif: `${TAG}-${suffix}` },
          select: { id: true },
        })
        const payroll = async (empleadoId: string, neto: number, archivoUrl: string | null = null) => tx.nomina.create({
          data: {
            id: randomUUID(), empleadoId, anio: 2042, mes: 1,
            salarioBase: neto, devengadoTotal: neto, netoPercibir: neto,
            archivoUrl, archivoNombre: archivoUrl ? 'nomina.pdf' : null,
          },
          select: { id: true },
        })
        const movement = async (label: string, amount: number) => tx.movimientoBancario.create({
          data: {
            id: randomUUID(), cuentaId: account.id, fechaOperacion: at(), fechaValor: at(),
            concepto: `${TAG}-${label}`, importe: amount, hashUnico: `${TAG}-${label}-${randomUUID()}`,
            referencia: `${TAG}-${label}`,
          },
          select: { id: true },
        })

        const individualEmployee = await employee('INDIVIDUAL')
        const groupEmployeeA = await employee('GRUPO-A')
        const groupEmployeeB = await employee('GRUPO-B')
        const missingEmployee = await employee('SIN-ARCHIVO')
        const individual = await payroll(individualEmployee.id, 100)
        const groupA = await payroll(groupEmployeeA.id, 40)
        const groupB = await payroll(groupEmployeeB.id, 60)
        const missing = await payroll(missingEmployee.id, 25)
        await tx.nominaDocumento.createMany({ data: [
          { id: randomUUID(), nominaId: groupA.id, driveItemId: `groupA${randomUUID().replaceAll('-', '')}`, nombre: 'nomina-grupo-a.pdf', tipo: 'NOMINA' },
          { id: randomUUID(), nominaId: groupB.id, driveItemId: `groupB${randomUUID().replaceAll('-', '')}`, nombre: 'nomina-grupo-b.pdf', tipo: 'NOMINA' },
        ] })
        const individualMovement = await movement('INDIVIDUAL-100', -100)
        const groupMovement = await movement('GRUPO-100', -100)
        const unrelatedMissingMovement = await movement('SIN-ARCHIVO-25', -25)

        // Phase 1: GET is source-only: exact net text, no B4 wrapper, no auto-link.
        phase = 'get-readonly'
        diagnosticPhase = phase
        const beforeGetWrappers = await tx.documentoConciliable.count({ where: { nominaId: { in: [individual.id, groupA.id, groupB.id, missing.id] } } })
        equal(beforeGetWrappers, 0)
        const individualRead = await leerCandidatasNomina(individualMovement.id, '2042-01')
        equal(individualRead.noEscrituras, true)
        equal(individualRead.requiereConfirmacionHumana, true)
        equal(individualRead.movimiento.importeCentimos, -10_000)
        assert.deepEqual(individualRead.candidatasNetoExacto.map(row => row.sourceNominaId), [individual.id], 'El neto individual debe leerse exacto desde BD')
        const missingRow = individualRead.candidatasPeriodoParaGrupo.find(row => row.sourceNominaId === missing.id)
        assert(missingRow && missingRow.archivo === null, 'La nómina sin archivo debe seguir visible como fuente sin autovincular')
        assert(individualRead.advertencias.some(value => value === `SIN_ARCHIVO_DESCARGABLE:${missing.id}`))
        equal(await tx.documentoConciliable.count({ where: { nominaId: { in: [individual.id, groupA.id, groupB.id, missing.id] } } }), beforeGetWrappers)
        assert.deepEqual(await tx.movimientoBancario.findMany({ where: { id: { in: [individualMovement.id, groupMovement.id, unrelatedMissingMovement.id] } }, select: { nominaId: true } }), [{ nominaId: null }, { nominaId: null }, { nominaId: null }])

        const groupRead = await leerCandidatasNomina(groupMovement.id, '2042-01')
        const groupCandidates = groupRead.candidatasPeriodoParaGrupo.map((candidate) => ({
          ...candidate,
          periodo: { anio: candidate.anio, mes: candidate.mes },
        })) as any
        const explicitGroup = evaluarSeleccionNominas({
          importeMovimientoCentimos: groupRead.movimiento.importeCentimos,
          periodo: { anio: 2042, mes: 1 }, candidatas: groupCandidates,
          sourceNominaIds: [groupA.id, groupB.id],
          afirmacion: { netoVerificado: true, periodoVerificado: true, evidenciaHumanaDisponible: true },
        })
        equal(explicitGroup.estado, 'LISTA_PARA_PREPARAR_B4')
        equal(explicitGroup.clase, 'GRUPO_NOMINAS_SELECCIONADO_EXACTO')
        equal(explicitGroup.totalCentimos, -10_000 as any)
        equal(await tx.documentoConciliable.count({ where: { nominaId: { in: [groupA.id, groupB.id] } } }), 0, 'GET/evaluación de grupo no puede autoconsumir ni crear wrappers')

        // Phase 2: B4 wrapper is the explicit human preparation; no file means no DML.
        phase = 'missing-file'
        diagnosticPhase = phase
        const individualDoc: any = await createDocumentoB4(actor.id, { action: 'documento', tipoDocumento: 'NOMINA', sourceId: individual.id })
        equal(individualDoc.created, true)
        equal(individualDoc.documento.importeObjetivoCentimos, -10_000, 'B4 debe usar netoPercibir de la fuente NOMINA, firmado')
        const rejectedBefore = {
          operations: await tx.operacionJustificacionB4.count({ where: { movimientoId: individualMovement.id } }),
          links: await tx.vinculoMovimientoDocumento.count({ where: { movimientoId: individualMovement.id } }),
          states: await tx.estadoJustificacionMovimientoB4.count({ where: { movimientoId: individualMovement.id } }),
          events: await tx.eventoJustificacionB4.count({ where: { movimientoId: individualMovement.id } }),
          receipts: await tx.reciboEleccionCentroB8.count({ where: { operacionB4: { movimientoId: individualMovement.id } } }),
        }
        const individualConfirm = () => confirmarB4(actor.id, {
          action: 'confirmar', confirmacion: true, idempotencyKey: randomUUID(), version: 1,
          borrador: {
            movimientoId: individualMovement.id, importeMovimientoCentimos: -10_000, estado: 'JUSTIFICADO',
            lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: individualDoc.documento.id, importeCentimos: -10_000 }],
          },
        })
        await b4Rejected('ARCHIVO_DESCARGABLE_REQUERIDO', 409, individualConfirm)
        assert.deepEqual({
          operations: await tx.operacionJustificacionB4.count({ where: { movimientoId: individualMovement.id } }),
          links: await tx.vinculoMovimientoDocumento.count({ where: { movimientoId: individualMovement.id } }),
          states: await tx.estadoJustificacionMovimientoB4.count({ where: { movimientoId: individualMovement.id } }),
          events: await tx.eventoJustificacionB4.count({ where: { movimientoId: individualMovement.id } }),
          receipts: await tx.reciboEleccionCentroB8.count({ where: { operacionB4: { movimientoId: individualMovement.id } } }),
        }, rejectedBefore, 'El rechazo por archivo faltante no puede hacer DML B4/B8')

        // This is a DB-local legacy controlled locator, never a URL Graph or host.
        const controlledItem = 'itemXcontrolado'
        await tx.nomina.update({ where: { id: individual.id }, data: { archivoUrl: `/api/admin/nominas/download/${controlledItem}`, archivoNombre: 'nomina-controlada.pdf' } })
        phase = 'confirm-and-private-file'
        diagnosticPhase = phase
        const confirmed: any = await individualConfirm()
        diagnosticPhase = 'confirm-result'
        equal(confirmed.idempotente, false)
        const individualLinks = await tx.vinculoMovimientoDocumento.findMany({
          where: { movimientoId: individualMovement.id, activo: true }, select: { id: true, importeCentimos: true, documentoConciliableId: true },
        })
        diagnosticPhase = 'confirm-link'
        assert.deepEqual(individualLinks.map(row => ({ documentoConciliableId: row.documentoConciliableId, importeCentimos: row.importeCentimos })), [{ documentoConciliableId: individualDoc.documento.id, importeCentimos: -10_000 }])
        const linkedSource = await tx.vinculoMovimientoDocumento.findFirst({
          where: { movimientoId: individualMovement.id, activo: true },
          select: { documentoConciliable: { select: { nomina: { select: { archivoUrl: true } } } } },
        })
        if (linkedSource?.documentoConciliable?.nomina?.archivoUrl !== `/api/admin/nominas/download/${controlledItem}`) {
          throw new SanitizedTestError('PRIVATE_SOURCE_ROUTE_NOT_VISIBLE')
        }
        const privateDelegateLinks = await singleton.vinculoMovimientoDocumento.findMany({
          where: { movimientoId: individualMovement.id, activo: true }, select: { id: true },
        })
        if (privateDelegateLinks.length !== 1) throw new SanitizedTestError(`PRIVATE_DELEGATE_LINK_CARDINALITY_${privateDelegateLinks.length}`)
        const privateList = await listarArchivosPrivadosMovimiento(individualMovement.id)
        diagnosticPhase = 'private-list'
        equal(privateList.noEscrituras, true)
        if (privateList.archivos.length !== 1) throw new SanitizedTestError(`PRIVATE_LIST_CARDINALITY_${privateList.archivos.length}`)
        const uiFile: any = privateList.archivos[0]
        diagnosticPhase = 'private-ui'
        equal(uiFile.estado, 'DISPONIBLE')
        equal(uiFile.origen, 'NOMINA_ARCHIVO_URL_RELATIVA')
        assert.equal(Object.prototype.hasOwnProperty.call(uiFile, 'locator'), false, 'El localizador interno no se expone al listado UI')
        assert(!JSON.stringify(privateList).includes(controlledItem), 'El item privado no se expone en la respuesta UI')
        const internal: any = await resolverArchivoPrivadoMovimiento(individualMovement.id, uiFile.archivoId)
        diagnosticPhase = 'private-internal'
        equal(internal.locator.tipo, 'DRIVE_CONFIGURADO')
        equal(internal.locator.itemId, controlledItem)

        // Force all deferred SQL guards while confirmed state and active link are valid.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')

        // Phase 3: complete B4 reversal removes the active confirmed-file projection.
        phase = 'reversal'
        diagnosticPhase = phase
        const undone: any = await deshacerB4(actor.id, {
          action: 'deshacer', confirmacion: true, idempotencyKey: randomUUID(), version: confirmed.estado.version,
          operacionId: confirmed.operacion.id,
          lineas: individualLinks.map(row => ({ id: row.id, importeCentimos: row.importeCentimos })),
        })
        equal(undone.idempotente, false)
        equal(await tx.vinculoMovimientoDocumento.count({ where: { movimientoId: individualMovement.id, activo: true } }), 0)
        equal((await listarArchivosPrivadosMovimiento(individualMovement.id)).archivos.length, 0, 'La reversión total debe ocultar el archivo confirmado')

        // Phase 4: group consumption happens only after explicit two-ID human selection.
        phase = 'explicit-group'
        diagnosticPhase = phase
        const [groupDocA, groupDocB] = await Promise.all([
          createDocumentoB4(actor.id, { action: 'documento', tipoDocumento: 'NOMINA', sourceId: groupA.id }),
          createDocumentoB4(actor.id, { action: 'documento', tipoDocumento: 'NOMINA', sourceId: groupB.id }),
        ]) as any[]
        equal(groupDocA.documento.importeObjetivoCentimos, -4_000)
        equal(groupDocB.documento.importeObjetivoCentimos, -6_000)
        const groupConfirmed: any = await confirmarB4(actor.id, {
          action: 'confirmar', confirmacion: true, idempotencyKey: randomUUID(), version: 1,
          borrador: {
            movimientoId: groupMovement.id, importeMovimientoCentimos: -10_000, estado: 'JUSTIFICADO',
            lineas: [
              { tipo: 'DOCUMENTO', documentoConciliableId: groupDocA.documento.id, importeCentimos: -4_000 },
              { tipo: 'DOCUMENTO', documentoConciliableId: groupDocB.documento.id, importeCentimos: -6_000 },
            ],
          },
        })
        equal(groupConfirmed.estado.estado, 'JUSTIFICADO')
        const groupSum = await tx.vinculoMovimientoDocumento.aggregate({ where: { movimientoId: groupMovement.id, activo: true }, _sum: { importeCentimos: true }, _count: { _all: true } })
        equal(groupSum._count._all, 2)
        equal(groupSum._sum.importeCentimos, -10_000)
        equal((await tx.movimientoBancario.findUnique({ where: { id: groupMovement.id }, select: { nominaId: true } }))?.nominaId, null, 'B4 no escribe un autovínculo nominal heredado')

        // Final deferred-constraint validation occurs before the mandatory outer rollback.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        reachedSentinel = true
        throw new RollbackSentinel()
      } finally {
        singleton.$transaction = saved.transaction
        singleton.$queryRaw = saved.queryRaw
        singleton.$queryRawUnsafe = saved.queryRawUnsafe
        singleton.movimientoBancario = saved.movimientoBancario
        singleton.vinculoMovimientoDocumento = saved.vinculoMovimientoDocumento
        singleton.adjuntoPendienteB5 = saved.adjuntoPendienteB5
        singleton.soporteConfirmingDraxton = saved.soporteConfirmingDraxton
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 20_000,
      timeout: 180_000,
    })
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error
  }

  assert(reachedSentinel, 'La transacción no alcanzó el rollback obligatorio')
  equal(await fixtureCount(), 0, 'El rollback dejó fixtures sintéticos de nómina')
  assert.deepEqual(await payrollBaseline(), before, 'El rollback alteró el hash baseline de nóminas/movimientos/vínculos')
  console.log('Nóminas PostgreSQL: lectura BD, archivo privado, B4, reversión, grupo explícito, C9 y rollback verificados sin persistencia.')
}

main()
  .catch((error: unknown) => {
    // Deliberately no stack, message, IDs, amounts, SQL or PII in diagnostics/console.
    try {
      mkdirSync(dirname(PRIVATE_ERROR_FILE), { recursive: true, mode: 0o700 })
      const candidate = (error as { code?: unknown } | null)?.code
      const code = typeof candidate === 'string' && /^[A-Z0-9_]{1,80}$/.test(candidate) ? candidate : 'NOMINAS_POSTGRES_TEST_FAILED'
      writeFileSync(PRIVATE_ERROR_FILE, `${JSON.stringify({ test: 'nominas-postgres', phase: diagnosticPhase, code })}\n`, { mode: 0o600 })
    } catch { /* diagnostics failure must not disclose anything */ }
    console.error('La prueba PostgreSQL de nóminas no se completó; no se ha autorizado ninguna persistencia.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
