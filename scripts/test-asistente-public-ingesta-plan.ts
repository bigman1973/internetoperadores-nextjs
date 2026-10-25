import assert from 'node:assert/strict'
import {
  confirmarReciboAplicado,
  confirmarReciboRevertido,
  crearReciboDesactivacionTarifas,
  identificadorPlanDesactivacionTarifas,
  planificarDesactivacionTarifasNoElegibles,
  verificarReciboDesactivacionTarifas,
  type PlanDesactivacionTarifas,
  type ReciboDesactivacionTarifas,
} from '@/lib/asistente/ingesta'

const secreto = Buffer.alloc(32, 7)

const plan: PlanDesactivacionTarifas = {
  version: 2,
  preparadoEn: '2026-10-25T22:19:55.507Z',
  origenesAptosHuella: 'a'.repeat(64),
  snapshotPrivadoHuella: 'b'.repeat(64),
  candidatas: 1,
  ignoradasNoAcreditadas: 2,
  motivos: { SIN_EVIDENCIA_AUTOMATICA_ACREDITADA: 2 },
  documentos: [{
    id: '00000000-0000-4000-8000-000000000001',
    origen: 'tarifa:42',
    titulo: 'Tarifa histórica acreditada',
    estadoAnterior: 'PUBLICADO',
    versionActual: 1,
    updatedAt: '2026-10-25T22:19:55.507Z',
    creadoPor: null,
    versionCreadoPor: null,
    aprobadoPor: null,
    fragmentos: [{ id: '00000000-0000-4000-8000-000000000002', versionId: '00000000-0000-4000-8000-000000000003', orden: 0, activo: true }],
  }],
}

function copia<T>(valor: T): T { return JSON.parse(JSON.stringify(valor)) as T }

async function probarAcreditacionConSnapshot(): Promise<void> {
  const updatedAt = new Date('2026-10-25T22:19:55.507Z')
  const documento = (id: string, origen: string, creadoPor: number | null = null) => ({
    id, origen, titulo: `Tarifa ${origen}`, estado: 'PUBLICADO', versionActual: 1, updatedAt, creadoPor,
    versiones: [{ version: 1, creadoPor: null, aprobadoPor: null }],
    fragmentos: [{ id: `${id}-fragmento`, versionId: `${id}-version`, orden: 0, activo: true }],
  })
  const acreditado = documento('doc-acreditado', 'tarifa:42')
  const soloPrefijo = documento('doc-solo-prefijo', 'publico:tarifa:43')
  const actorHumano = documento('doc-actor-humano', 'tarifa:44', 7)
  const sinSnapshot = documento('doc-sin-snapshot', 'tarifa:45')
  const cliente = { asistenteDocumento: { findMany: async () => [acreditado, soloPrefijo, actorHumano, sinSnapshot] } } as any
  const evidencia = {
    huella: 'c'.repeat(64),
    docs: [{
      id: acreditado.id, espacio: 'PUBLICO', estado: 'PUBLICADO', version_actual: 1,
      origen: acreditado.origen, titulo: acreditado.titulo, updated_at: updatedAt.toISOString(),
    }],
    fragments: [{ id: acreditado.fragmentos[0].id, documento_id: acreditado.id, activo: true }],
  }
  const preparado = await planificarDesactivacionTarifasNoElegibles(['publico:tarifa:999'], evidencia, cliente)
  assert.equal(preparado.candidatas, 1)
  assert.equal(preparado.documentos[0].id, acreditado.id)
  assert.equal(preparado.ignoradasNoAcreditadas, 2)
  assert.equal(preparado.motivos.ORIGEN_NO_HEREDADO_EXACTO, 1)
  assert.equal(preparado.motivos.SIN_EVIDENCIA_AUTOMATICA_ACREDITADA, 2)
}

async function main() {
  const recibo = crearReciboDesactivacionTarifas(plan, secreto)
  verificarReciboDesactivacionTarifas(recibo, secreto)
  assert.equal(recibo.estado, 'PREPARADO')
  assert.equal(identificadorPlanDesactivacionTarifas(plan).length, 64)

  const alterado = copia(recibo)
  alterado.plan.documentos[0].origen = 'tarifa:43'
  assert.throws(() => verificarReciboDesactivacionTarifas(alterado, secreto), /RECIBO_TARIFAS_MAC_INVALIDO/)
  assert.throws(() => verificarReciboDesactivacionTarifas(recibo, Buffer.alloc(32, 8)), /RECIBO_TARIFAS_MAC_INVALIDO/)

  const aplicado = confirmarReciboAplicado(recibo, {
    desactivados: 1,
    fragmentosDesactivados: 1,
    aplicadoEn: '2026-10-25T22:20:00.000Z',
  }, secreto)
  verificarReciboDesactivacionTarifas(aplicado, secreto)
  assert.equal(aplicado.estado, 'APLICADO')
  assert.throws(() => confirmarReciboAplicado(aplicado, {
    desactivados: 1,
    fragmentosDesactivados: 1,
    aplicadoEn: '2026-10-25T22:20:01.000Z',
  }, secreto), /RECIBO_TARIFAS_ESTADO_INVALIDO/)

  const revertido = confirmarReciboRevertido(aplicado, {
    restaurados: 1,
    fragmentosRestaurados: 1,
    revertidoEn: '2026-10-25T22:21:00.000Z',
  }, secreto)
  verificarReciboDesactivacionTarifas(revertido, secreto)
  assert.equal(revertido.estado, 'REVERTIDO')

  const versionAntigua = { ...recibo, version: 1 } as unknown as ReciboDesactivacionTarifas
  assert.throws(() => verificarReciboDesactivacionTarifas(versionAntigua, secreto), /RECIBO_TARIFAS_INVALIDO/)
  await probarAcreditacionConSnapshot()
  console.log('TEST_ASISTENTE_PUBLIC_INGESTA_PLAN_OK')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
