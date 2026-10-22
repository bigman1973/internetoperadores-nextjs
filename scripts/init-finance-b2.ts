/* Inicialización B2. Por defecto simula; FINANCE_B2_APPLY=1 aplica sólo a la BD aislada.
 * Conserva todos los valores originales y vínculos: sólo clasifica calidad/identidad
 * y registra auditoría. El orden evita una canónica OCR inválida y violar unicidad.
 */
import { prisma } from '../lib/prisma'
import { assertFinanceStagingIsolated } from '../lib/finanzas/staging-safety'
import { claveCanonicaFactura, hayErrorOcrHistorico } from '../lib/finanzas/invoice-quality'
import { auditarCambioB2, backfillIdentidadExactaEnTx, planDeduplicacion } from '../lib/finanzas/invoice-quality-db'
const apply = process.env.FINANCE_B2_APPLY === '1'
async function limitFour<T>(items: T[], action: (item: T) => Promise<void>) {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) await action(items[cursor++])
  }))
}
async function main() {
  await assertFinanceStagingIsolated()
  const facturas = await prisma.facturaRecibida.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, cif: true, numFactura: true, proveedor: true, datosOcrRaw: true, ocrCompletado: true, createdAt: true, fecha: true, base: true, importeIva: true, importeIrpf: true, total: true, calidad: true, copiaDeId: true, canonKey: true, conflictoIdentidad: true, duplicadoExterno: true, movimientos: { select: { id: true } }, confirmingLineas: { select: { id: true } }, documentosOperadora: { select: { id: true } } },
  })
  const grupos = new Map<string, typeof facturas>()
  const errores = facturas.filter(f => hayErrorOcrHistorico(f.datosOcrRaw, f.proveedor, f.ocrCompletado))
  for (const f of facturas) {
    const key = claveCanonicaFactura(f.cif, f.numFactura)
    if (key) grupos.set(key, [...(grupos.get(key) || []), f])
  }
  const duplicados = [...grupos.values()].filter(rows => rows.length > 1)
  console.log(JSON.stringify({ modo: apply ? 'APLICAR_STAGING' : 'SIMULACION_SIN_ESCRITURAS', facturasAnalizadas: facturas.length, sinIdentidadCompleta: facturas.length - [...grupos.values()].reduce((n, rows) => n + rows.length, 0), clavesExactasABackfill: [...grupos.entries()].filter(([key, rows]) => rows.some(f => f.canonKey !== key)).length, identidadesDuplicadas: duplicados.length, identidadesConConflicto: duplicados.filter(rows => planDeduplicacion(rows).conflicto).length, erroresOcrHistoricosAMarcar: errores.filter(f => f.calidad === 'VALIDA').length }, null, 2))
  if (!apply) return
  let marcados = 0, gruposCambios = 0
  // Primero impide que una fila ERROR_OCR antigua se elija como canónica válida.
  await limitFour(errores, async f => {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM facturas_recibidas WHERE id = ${f.id} FOR UPDATE`
      const current = await tx.facturaRecibida.findUnique({ where: { id: f.id } })
      if (!current || current.calidad !== 'VALIDA') return
      await tx.facturaRecibida.update({ where: { id: f.id }, data: { calidad: 'REVISAR_LECTURA', versionCalidad: { increment: 1 } } })
      await auditarCambioB2(tx, { facturaId: f.id, accion: 'MARCAR_OCR_HISTORICO_B2', detalle: JSON.parse(JSON.stringify({ originalEconomico: { proveedor: current.proveedor, cif: current.cif, numFactura: current.numFactura, fecha: current.fecha, base: current.base, tipoIva: current.tipoIva, importeIva: current.importeIva, tipoIrpf: current.tipoIrpf, importeIrpf: current.importeIrpf, total: current.total, estado: current.estado, datosOcrRaw: current.datosOcrRaw }, antes: { calidad: current.calidad, versionCalidad: current.versionCalidad }, despues: { calidad: 'REVISAR_LECTURA', versionCalidad: current.versionCalidad + 1 } })) })
      marcados++
    }, { maxWait: 10_000, timeout: 20_000 })
  })
  await limitFour([...grupos.entries()], async ([key, rows]) => {
    const result = await prisma.$transaction(tx => backfillIdentidadExactaEnTx(tx, key, rows.map(f => f.id)), { maxWait: 10_000, timeout: 20_000 })
    gruposCambios += Number(Boolean(result.cambios))
  })
  console.log(JSON.stringify({ aplicado: true, gruposConCambios: gruposCambios, erroresOcrHistoricosMarcados: marcados }))
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'B2_INIT_FAILED'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
