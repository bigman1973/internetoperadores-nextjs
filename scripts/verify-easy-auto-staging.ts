import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { assertPrototypeStaging } from '../lib/finanzas/prototype-staging'
import { readCountersTx, readP2CountersTx } from '../lib/finanzas/easy-counterparty-db'
import { parseCounterpartyReadInput } from '../lib/finanzas/easy-counterparty-core'

const input = parseCounterpartyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS' })
const sourceTables = ['movimientos_bancarios', 'cuentas_bancarias', 'facturas_recibidas', 'facturas_emitidas', 'nominas', 'entidades_fiscales', 'usuarios_admin', 'legado_conciliacion_b4'] as const
async function main() {
  await assertPrototypeStaging()
  const mode = process.argv[2]
  assert(mode === '--before' || mode === '--after', 'Modo --before/--after obligatorio')
  const file = process.env.FINANCE_EASY_AUTO_VERIFY_FILE
  assert(file, 'Fichero privado obligatorio')
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    const source: Record<string, unknown> = {}
    for (const name of sourceTables) {
      const rows = await tx.$queryRawUnsafe<Array<{ count: string; hash: string }>>(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS hash FROM "${name}" t LIMIT 1`)
      source[name] = rows[0]
    }
    const [paso1, paso2, counts] = await Promise.all([
      readCountersTx(tx, input, { withDecisions: true, withAccountProof: true }),
      readP2CountersTx(tx, input),
      tx.$queryRaw<Array<{ clase: string; recibos: string; movimientos: string; cargosCentimos: string; cobrosCentimos: string }>>(Prisma.sql`
        SELECT r.clase,count(DISTINCT r.id)::text AS recibos,count(*)::text AS movimientos,
          coalesce(sum(b4_importe_bancario_centimos(m.importe)) FILTER (WHERE m.importe<0),0)::text AS "cargosCentimos",
          coalesce(sum(b4_importe_bancario_centimos(m.importe)) FILTER (WHERE m.importe>0),0)::text AS "cobrosCentimos"
        FROM recibos_auto_modo_facil r JOIN patas_recibo_auto_modo_facil p ON p.recibo_id=r.id
        JOIN movimientos_bancarios m ON m.id=p.movimiento_id
        WHERE NOT EXISTS (SELECT 1 FROM reversiones_auto_modo_facil rv WHERE rv.recibo_id=r.id)
        GROUP BY r.clase ORDER BY r.clase LIMIT 2
      `),
    ])
    const invalid = await tx.$queryRaw<Array<{ invalid: string }>>(Prisma.sql`
      SELECT count(*)::text AS invalid FROM patas_recibo_auto_modo_facil p
      JOIN recibos_auto_modo_facil r ON r.id=p.recibo_id
      JOIN operaciones_justificacion_b4 o ON o.id=p.operacion_b4_id
      JOIN estado_justificacion_movimientos s ON s.movimiento_id=p.movimiento_id
      WHERE NOT EXISTS (SELECT 1 FROM reversiones_auto_modo_facil rv WHERE rv.recibo_id=r.id)
        AND (s.estado::text<>'NO_REQUIERE' OR o.estado::text<>'APLICADA'
          OR NOT EXISTS (SELECT 1 FROM eventos_justificacion_b4 e WHERE e.operacion_id=o.id AND e.detalle->>'origen'='REGLA' AND e.detalle->>'reciboAutoId'=r.id::text)
          OR NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil d WHERE d.movimiento_id=p.movimiento_id AND d.origen::text='AUTO_RECIBO' AND d.snapshot->>'autoReceiptId'=r.id::text AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil rv WHERE rv.revierte_id=d.id))) LIMIT 1
    `)
    assert.equal(invalid[0].invalid, '0', 'Auditoría/origen/estado automático incoherente')
    return { source, paso1, paso2, counts, invalidReceipts: 0, at: new Date().toISOString(), readOnly: true, stagingOnly: true }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 90_000 })
  if (mode === '--after') {
    const before = JSON.parse(readFileSync(file, 'utf8'))
    assert.deepEqual(result.source, before.source, 'El lote cambió fuentes, usuarios o campos legacy')
    assert.deepEqual(result.paso2.justificados, before.paso2.justificados, 'Las reglas no deben inflar documentación justificada')
    writeFileSync(file.replace(/\.json$/, '-after.json'), JSON.stringify({ ...result, legacyUnchanged: true, documentedUnchanged: true }, null, 2) + '\n', { mode: 0o600 })
  } else writeFileSync(file, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ passed: true, stagingOnly: true, mode, counts: result.counts, p1Identificados: result.paso1.identificados, p2SinDocumento: result.paso2.totalMovimientos, p2Documentados: result.paso2.justificados.movimientos, p2NoRequiere: result.paso2.noRequiere.movimientos }))
}
main().catch(error => { console.error('VERIFY_EASY_AUTO_STAGE_FAILED', error instanceof Error ? error.message : 'error'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
