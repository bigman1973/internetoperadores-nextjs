import 'dotenv/config'
import assert from 'node:assert/strict'
import prisma from '../lib/prisma'
import { assertPhoneCostPrototypeStaging, parsePhoneCostReadOptions, readPhoneCostAnalytics } from '../lib/finanzas/phone-cost-db'

async function main() {
  await assertPhoneCostPrototypeStaging()
  const options = parsePhoneCostReadOptions(new URLSearchParams('desde=2026-01-01&hasta=2026-10-08&proveedor=TELEFONICA'))
  const before = await Promise.all([
    prisma.facturaRecibida.count(),
    prisma.imputacionCosteCliente.count(),
    prisma.facturaEmitida.count(),
  ])
  const result = await readPhoneCostAnalytics(options)
  const after = await Promise.all([
    prisma.facturaRecibida.count(),
    prisma.imputacionCosteCliente.count(),
    prisma.facturaEmitida.count(),
  ])

  assert.deepEqual(after, before, 'la analítica telefónica no debe persistir ni alterar ninguna población')
  assert.equal(result.stagingOnly, true)
  assert.equal(result.automaticas, false)
  assert.equal(result.proposalsOnly, true)
  assert.equal(result.periodo.desde, '2026-01-01')
  assert.equal(result.periodo.hasta, '2026-10-08')
  assert.equal(result.bancoTelefono.usadoEnCoste, false)
  assert.equal(result.totales.margenPotencialEstimado.costeCompletoAsegurado, false)
  assert.equal(result.totales.margenPotencialEstimado.porcentajeBp, null)
  assert.equal(result.totales.costeConfirmadoCentimos, null, 'una propuesta PDF staging no convierte el coste en confirmado')
  assert.ok(result.documentos.every(row => !Object.keys(row).some(key => key.toLowerCase().includes('telefono'))), 'el DTO de documento no expone números de teléfono')
  console.log(JSON.stringify({
    stagingOnly: result.stagingOnly,
    periodo: result.periodo,
    documentosLeidos: result.documentos.length,
    propuestasCentimos: result.totales.costeAsignablePropuestoCentimos,
    costeConfirmado: result.totales.costeConfirmadoCentimos,
    sinEscrituras: true,
  }))
}

main()
  .catch(error => { console.error('Lectura PHONE rechazada:', error instanceof Error ? error.message : 'Error'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
