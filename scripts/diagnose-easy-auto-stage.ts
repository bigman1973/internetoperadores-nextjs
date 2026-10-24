import 'dotenv/config'
import prisma from '../lib/prisma'
import { assertPrototypeStaging } from '../lib/finanzas/prototype-staging'
import { centsFromExactSqlText, isPureBankCommission, selectBilateralTransfers, normalizeEasyAutoText, type EasyAutoMovement } from '../lib/finanzas/easy-auto-core'
async function main() {
  await assertPrototypeStaging()
  const rows = await prisma.$queryRawUnsafe<Array<any>>(`SELECT m.id,m.cuenta_id,m.fecha_operacion::date::text AS fecha,m.importe::text AS importe,m.concepto,m.tercero,m.referencia,m.info_adicional,c.banco,m.conciliado,m.factura_id,m.factura_emitida_id,m.gasto_id,m.nomina_id,m.entrega_a_cuenta_empleado_id,m.traspaso_relacionado_id,coalesce(e.version,1) AS version FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id WHERE c.activa AND m.fecha_operacion::date BETWEEN '2026-01-01' AND '2026-10-08' AND coalesce(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' ORDER BY m.id LIMIT 3000`)
  const groups: Record<string, { n: number; centimos: number }> = {}
  const lexicon: Record<string, number> = {}
  const movements: EasyAutoMovement[] = []
  for (const r of rows) {
    let m: EasyAutoMovement
    try { m={id:r.id,cuentaId:r.cuenta_id,fecha:r.fecha,importeCentimos:centsFromExactSqlText(r.importe,'fuente'),versionB4:r.version,concepto:normalizeEasyAutoText(r.concepto),tercero:normalizeEasyAutoText(r.tercero),referencia:normalizeEasyAutoText(r.referencia),infoAdicional:normalizeEasyAutoText(r.info_adicional),bancoCuenta:normalizeEasyAutoText(r.banco)} } catch { continue }
    movements.push(m)
    const text=[m.concepto,m.tercero,m.referencia,m.infoAdicional].join(' ')
    if (m.importeCentimos<0 && /\bCOMISION(?:ES)?\b/.test(text)) {
      const reason=/\bCOMISION(?:ES)?\s*(?:DE\s+)?0(?:[,.]0{1,2})?\b/.test(text)?'COMISION_CERO_O_PREFIJO_CERO':/\b(?:POS|TPV|TARJETA|CARD|VISA|MASTERCARD|AMEX|INTERES(?:ES)?|INTEREST|PRESTAMO|CREDITO|LEASING|FINANCIACION|COMPRA)\b/.test(text)?'TARJETA_INTERESES_FINANCIACION':'PURA'
      lexicon[reason]=(lexicon[reason]??0)+1
    }
    if (!isPureBankCommission(m)) continue
    const cause=r.factura_id||r.factura_emitida_id||r.gasto_id||r.nomina_id||r.entrega_a_cuenta_empleado_id?'VINCULO_DOCUMENTAL_LEGACY':r.traspaso_relacionado_id?'VINCULO_TRASPASO_LEGACY':r.conciliado?'SOLO_FLAG_LEGACY_CONCILIADO':'SIN_BLOQUEO_LEGACY'
    groups[cause]??={n:0,centimos:0}; groups[cause].n++; groups[cause].centimos+=m.importeCentimos
  }
  console.log(JSON.stringify({ stagingOnly:true, readOnly:true, pendientes:rows.length, lexicon, comisionesPuras:groups, traspasosPotencialesSinGuardas:selectBilateralTransfers(movements).length }))
}
main().catch(()=>{console.error('AUTO_STAGE_DIAG_FAILED');process.exitCode=1}).finally(()=>prisma.$disconnect())
