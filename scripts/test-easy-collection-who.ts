import 'dotenv/config'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { readCountersTx, readEasyCounterparties, readEasyMovementWhoByIds } from '../lib/finanzas/easy-counterparty-db'

type Tx = Prisma.TransactionClient & Record<string, any>
const STAGING_DATABASE = 'io_staging_finanzas'
const STAGING_USER = 'io_staging_finanzas'

function stagingUrlGuard() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.pathname, `/${STAGING_DATABASE}`, 'La prueba sólo admite la base de staging aislada.')
  assert.equal(decodeURIComponent(url.username), STAGING_USER, 'La prueba sólo admite el usuario de staging aislado.')
}

async function remittanceSample(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ movementId: string; fecha: string }>>(Prisma.sql`
    WITH generacion_vigente AS (
      SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1
    )
    SELECT p.movimiento_id AS "movementId",m.fecha_operacion::date::text AS fecha
    FROM modo_facil_propuestas_cobro p
    JOIN generacion_vigente g ON g.id=p.generacion_id
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    LEFT JOIN estado_justificacion_movimientos b4 ON b4.movimiento_id=m.id
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.composicion)='array' THEN p.composicion ELSE '[]'::jsonb END
    ) composicion(valor) ON true
    LEFT JOIN facturas_emitidas fe ON fe.id=NULLIF(btrim(composicion.valor->>'facturaEmitidaId'),'')
    WHERE p.metodo IN ('REMESA_VENCIMIENTO','REMESA_UNION','REMESA_RESIDUO')
      AND p.estado_propuesto='JUSTIFICADO'
      AND COALESCE(b4.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND m.entidad_fiscal_id IS NULL AND m.factura_id IS NULL AND m.factura_emitida_id IS NULL
      AND m.entrega_a_cuenta_empleado_id IS NULL AND m.nomina_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND NOT EXISTS (
            SELECT 1 FROM decisiones_tercero_modo_facil r
            WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil"
          )
      )
    GROUP BY p.id,m.id,m.fecha_operacion
    HAVING COUNT(DISTINCT fe.id) >= 1
      AND COUNT(DISTINCT lower(NULLIF(btrim(fe.cliente),''))) >= 2
    ORDER BY p.importe_movimiento_centimos DESC,p.id ASC
    LIMIT 1
  `)
  assert.equal(rows.length, 1, 'Falta una remesa vigente, documental y sin decisión P1 para la prueba de sólo lectura.')
  return rows[0]
}

async function confirmedSample(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ movementId: string }>>(Prisma.sql`
    WITH generacion_vigente AS (
      SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1
    )
    SELECT p.movimiento_id AS "movementId"
    FROM modo_facil_propuestas_cobro p
    JOIN generacion_vigente g ON g.id=p.generacion_id
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    JOIN estado_justificacion_movimientos b4 ON b4.movimiento_id=m.id AND b4.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.composicion)='array' THEN p.composicion ELSE '[]'::jsonb END
    ) composicion(valor) ON true
    LEFT JOIN facturas_emitidas fe ON fe.id=NULLIF(btrim(composicion.valor->>'facturaEmitidaId'),'')
    WHERE p.estado_propuesto='JUSTIFICADO'
      AND m.entidad_fiscal_id IS NULL AND m.factura_id IS NULL AND m.factura_emitida_id IS NULL
      AND m.entrega_a_cuenta_empleado_id IS NULL AND m.nomina_id IS NULL
      AND EXISTS (
        SELECT 1 FROM eventos_justificacion_b4 aprobacion
        JOIN operaciones_justificacion_b4 operacion ON operacion.id=aprobacion.operacion_id
          AND operacion.estado='APLICADA'::"EstadoOperacionB4" AND operacion.revertida_at IS NULL
        WHERE aprobacion.movimiento_id=p.movimiento_id
          AND aprobacion.accion='APROBACION'::"AccionEventoJustificacionB4"
          AND aprobacion.detalle->>'origen'='PROPUESTA_COBRO'
          AND aprobacion.detalle->>'bulkKind'='COBROS_CONFIRMACION'
          AND aprobacion.detalle->>'rol'='PRINCIPAL'
          AND aprobacion.detalle->>'propuestaId'=p.id::text
          AND aprobacion.detalle->>'generacionId'=p.generacion_id::text
          AND aprobacion.detalle->>'fingerprint'=p.fingerprint
          AND NOT EXISTS (
            SELECT 1 FROM eventos_justificacion_b4 reversion
            WHERE reversion.accion='REVERSION'::"AccionEventoJustificacionB4"
              AND reversion.detalle->>'origen'='PROPUESTA_COBRO'
              AND reversion.detalle->>'bulkKind'='COBROS_REVERSION'
              AND reversion.detalle->>'bloqueId'=aprobacion.detalle->>'bloqueId'
              AND reversion.detalle->>'propuestaId'=p.id::text
              AND reversion.detalle->>'generacionId'=p.generacion_id::text
              AND reversion.detalle->>'fingerprint'=p.fingerprint
              AND reversion.detalle->>'rol'='PRINCIPAL'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND NOT EXISTS (
            SELECT 1 FROM decisiones_tercero_modo_facil r
            WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil"
          )
      )
    GROUP BY p.id,m.id
    HAVING COUNT(DISTINCT fe.id) >= 1
      AND COUNT(DISTINCT lower(NULLIF(btrim(fe.cliente),''))) >= 1
    ORDER BY p.id ASC
    LIMIT 1
  `)
  return rows[0] ?? null
}

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio.')
  stagingUrlGuard()
  const identity = await prisma.$queryRaw<Array<{ databaseName: string; databaseUser: string }>>(Prisma.sql`
    SELECT current_database() AS "databaseName",current_user AS "databaseUser" LIMIT 1
  `)
  assert.deepEqual(identity[0], { databaseName: STAGING_DATABASE, databaseUser: STAGING_USER }, 'Sólo se permite staging aislado.')

  const result = await prisma.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const sample = await remittanceSample(tx)
    const who = await readEasyMovementWhoByIds([sample.movementId])
    const remittance = who.get(sample.movementId)
    assert(remittance, 'La proyección debe devolver el movimiento solicitado.')
    assert.equal(remittance.estado, 'PROPUESTO', 'Una remesa vigente no confirmada nunca queda identificada.')
    assert.match(remittance.nombre ?? '', /^Varios clientes · remesa de [1-9]\d* recibos$/, 'La etiqueta de remesa debe venir de facturas documentales.')

    const counters = await readCountersTx(tx, {
      desde: sample.fecha, hasta: sample.fecha, limit: 1, offset: 0, sentido: 'COBROS',
    }, { withDecisions: true, withAccountProof: false })
    assert(counters.propuestosTexto >= 1, 'El contador P1 debe incluir la remesa propuesta sin afirmar que está identificada.')
    assert.equal(counters.identificados + counters.propuestosTexto + counters.sinIdentificar, counters.totalMovimientos, 'Los estados P1 deben particionar el contador.')

    const confirmed = await confirmedSample(tx)
    if (!confirmed) return { remesaPropuesta: true, contadorPropuesto: true, confirmadaDisponible: false }
    const confirmedWho = await readEasyMovementWhoByIds([confirmed.movementId])
    const confirmedView = confirmedWho.get(confirmed.movementId)
    assert(confirmedView, 'La proyección debe devolver el cobro confirmado solicitado.')
    assert.equal(confirmedView.estado, 'IDENTIFICADO', 'Una aprobación B4 vigente debe identificar sólo después de la confirmación humana.')
    assert(confirmedView.nombre && confirmedView.nombre.length > 0, 'La identificación confirmada debe conservar una etiqueta documental visible.')
    return { remesaPropuesta: true, contadorPropuesto: true, confirmadaDisponible: true, confirmadaIdentificada: true }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 })

  const queue = await readEasyCounterparties({ desde: '2026-01-01', hasta: '2026-10-08', limit: 25, offset: 0, sentido: 'TODOS', pendientes: true })
  assert(queue.movimientos.length <= 25, 'La cola completa sigue paginada.')
  assert(queue.total >= queue.movimientos.length)
  console.log(JSON.stringify({ ok: true, writes: 0, ...result, colaCompleta: true }))
}

run().catch(error => {
  console.error('EASY_COLLECTION_WHO_STAGING_FAILED', error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Error de servicio; detalle privado omitido')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
