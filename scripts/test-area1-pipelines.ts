/**
 * Área 1 · Batería sintética de los pipelines del CRM del panel.
 * Sin BD, sin red y sin datos personales: reglas puras + lectura estática de la migración y del código.
 * Ejecutar: pnpm exec tsx scripts/test-area1-pipelines.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularCambioEtapa, importePonderado, MOTIVOS_PERDIDA, normalizarMotivo, resultadoNegocio, validarNegocioNuevo } from '../lib/crm-pipelines-core'

let ok = 0
const t = (name: string, fn: () => void) => { fn(); ok++; console.log(`ok - ${name}`) }
const root = join(__dirname, '..')
const sql = readFileSync(join(root, 'prisma/migrations/20261126_area1_crm_pipelines/migration.sql'), 'utf8')

// --- Semilla ---
const pipelines = [...sql.matchAll(/INSERT INTO "area1_crm_pipelines" .*? VALUES \('([^']+)','([^']+)','[^']*','([A-Z]+)',(\d+),ARRAY\[([^\]]*)\]/g)]
  .map((m) => ({ id: m[1], nombre: m[2], segmento: m[3], hubspot: m[5].split(',').map((s) => s.replace(/'/g, '')) }))
const etapas = [...sql.matchAll(/\('([^']+)','([^']+)','((?:[^']|'')+)',(\d+),(\d+),'(ABIERTA|GANADA|PERDIDA)',(NULL|'(?:[^']|'')*'),(true|false)\)/g)]
  .map((m) => ({ id: m[1], pipelineId: m[2], nombre: m[3], orden: Number(m[4]), probabilidad: Number(m[5]), resultado: m[6], criterio: m[7], requiereMotivo: m[8] === 'true' }))

t('siembra exactamente los 8 pipelines de IO', () => {
  assert.equal(pipelines.length, 8)
  assert.deepEqual(pipelines.map((p) => p.id), ['io-particulares', 'io-comunicaciones-unificadas', 'io-conectividad-avanzada', 'io-soluciones-moviles', 'io-infraestructura-red', 'io-exagrid', 'io-mantenimiento-it', 'io-migracion-web'])
  assert.equal(pipelines.find((p) => p.id === 'io-particulares')?.segmento, 'PARTICULAR')
})
t('cada pipeline guarda su id de HubSpot y no incluye LFDeal, Sales, FPlanet ni Shared Selling', () => {
  const ids = pipelines.flatMap((p) => p.hubspot)
  assert.equal(new Set(ids).size, 10)
  for (const prohibido of ['3711728841', '3711646969', 'default', '3846057166']) assert.ok(!ids.includes(prohibido))
  assert.deepEqual(pipelines.find((p) => p.id === 'io-mantenimiento-it')?.hubspot, ['3908790469', '3796653277'])
  assert.deepEqual(pipelines.find((p) => p.id === 'io-migracion-web')?.hubspot, ['3908836560', '3796653278'])
})
t('etapas por pipeline: número, orden y probabilidades crecientes', () => {
  const esperado: Record<string, number> = { 'io-particulares': 7, 'io-mantenimiento-it': 9, 'io-migracion-web': 8 }
  for (const p of pipelines) {
    const e = etapas.filter((x) => x.pipelineId === p.id).sort((a, b) => a.orden - b.orden)
    assert.equal(e.length, esperado[p.id] ?? 9, p.id)
    assert.deepEqual(e.map((x) => x.orden), e.map((_, i) => i + 1))
    const abiertas = e.filter((x) => x.resultado === 'ABIERTA').map((x) => x.probabilidad)
    assert.deepEqual(abiertas, [...abiertas].sort((a, b) => a - b), `${p.id} probabilidades`)
    assert.equal(new Set(e.map((x) => x.id)).size, e.length)
    e.forEach((x) => assert.ok(x.id.startsWith(`${p.id}:`)))
  }
})
t('criterios: una etapa ganada (100%) y una perdida (0%, motivo obligatorio) por pipeline, ambas al final', () => {
  for (const p of pipelines) {
    const e = etapas.filter((x) => x.pipelineId === p.id).sort((a, b) => a.orden - b.orden)
    const g = e.filter((x) => x.resultado === 'GANADA'); const l = e.filter((x) => x.resultado === 'PERDIDA')
    assert.equal(g.length, 1); assert.equal(l.length, 1)
    assert.equal(g[0].probabilidad, 100); assert.equal(l[0].probabilidad, 0)
    assert.ok(l[0].requiereMotivo); assert.ok(!g[0].requiereMotivo)
    assert.notEqual(g[0].criterio, 'NULL'); assert.notEqual(l[0].criterio, 'NULL')
    assert.deepEqual(e.slice(-2).map((x) => x.resultado), ['GANADA', 'PERDIDA'])
  }
})
t('etapas propias leídas de HubSpot (Particulares, Mantenimiento IT, Migración Web y plantilla)', () => {
  const nombres = (id: string) => etapas.filter((x) => x.pipelineId === id).sort((a, b) => a.orden - b.orden).map((x) => `${x.nombre} ${x.probabilidad}`)
  assert.deepEqual(nombres('io-particulares').slice(0, 5), ['Solicitud recibida 20', 'Contacto realizado 40', 'Propuesta aceptada 70', 'Pendiente documentación 85', 'Alta en proceso 95'])
  assert.deepEqual(nombres('io-exagrid').slice(0, 7), ['Consulta recibida 10', 'Contacto realizado 20', 'Necesidades identificadas 30', 'Propuesta enviada 50', 'Negociación 70', 'Pendiente documentación 85', 'Alta en proceso 95'])
  assert.deepEqual(nombres('io-mantenimiento-it').slice(0, 7), ['Lead nuevo 10', 'Propuesta enviada 20', 'Cuestionario completado 30', 'Oferta precio cerrado 50', 'Propuesta pre-aceptada 70', 'Reunión/visita agendada 80', 'Contrato firmado 95'])
  assert.deepEqual(nombres('io-migracion-web').slice(-2), ['Completada 100', 'Perdido 0'])
})
t('migración aditiva y re-ejecutable', () => {
  assert.ok(!/\b(DROP|TRUNCATE|DELETE\s+FROM|RENAME)\b/i.test(sql))
  assert.ok(!/UPDATE\s+[\w".]/i.test(sql))
  const inserts = sql.match(/INSERT INTO/g)?.length || 0
  assert.equal((sql.match(/ON CONFLICT \("id"\) DO NOTHING/g) || []).length, inserts)
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 4)
  assert.equal((sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint/g) || []).length, 6)
})
t('la sincronización de HubSpot no toca las tablas area1 de pipelines', () => {
  for (const f of ['lib/hubspot-listas.ts', 'app/api/admin/crm/negocios/sync/route.ts']) {
    const code = readFileSync(join(root, f), 'utf8')
    assert.ok(!/area1CrmPipeline|area1CrmNegocio|area1_crm_/.test(code), f)
  }
})

// --- Reglas ---
const abierta = { id: 'p:a', pipelineId: 'p', resultado: 'ABIERTA', requiereMotivo: false }
const abierta2 = { id: 'p:b', pipelineId: 'p', resultado: 'ABIERTA', requiereMotivo: false }
const ganada = { id: 'p:g', pipelineId: 'p', resultado: 'GANADA', requiereMotivo: false }
const perdida = { id: 'p:l', pipelineId: 'p', resultado: 'PERDIDA', requiereMotivo: true }
const ahora = new Date('2026-11-24T10:00:00Z')

t('mover entre etapas abiertas mantiene el negocio abierto', () => {
  const r = calcularCambioEtapa({ etapaActual: abierta, etapaDestino: abierta2, pipelineId: 'p', ahora })
  assert.deepEqual(r, { ok: true, resultado: 'ABIERTO', cerradoAt: null, motivoPerdida: null, sinCambios: false })
})
t('ganar cierra con fecha; perder exige motivo válido', () => {
  const g = calcularCambioEtapa({ etapaActual: abierta, etapaDestino: ganada, pipelineId: 'p', ahora })
  assert.ok(g.ok && g.resultado === 'GANADO' && g.cerradoAt?.getTime() === ahora.getTime())
  assert.equal(calcularCambioEtapa({ etapaActual: abierta, etapaDestino: perdida, pipelineId: 'p' }).ok, false)
  assert.equal(calcularCambioEtapa({ etapaActual: abierta, etapaDestino: perdida, pipelineId: 'p', motivo: 'inventado' }).ok, false)
  assert.equal(calcularCambioEtapa({ etapaActual: abierta, etapaDestino: perdida, pipelineId: 'p', motivo: 'Otro' }).ok, false)
  const l = calcularCambioEtapa({ etapaActual: abierta, etapaDestino: perdida, pipelineId: 'p', motivo: 'precio', detalleMotivo: ' 20% más caro ', ahora })
  assert.ok(l.ok && l.resultado === 'PERDIDO' && l.motivoPerdida === 'Precio: 20% más caro')
})
t('reabrir un negocio cerrado limpia cierre y motivo', () => {
  const r = calcularCambioEtapa({ etapaActual: perdida, etapaDestino: abierta, pipelineId: 'p' })
  assert.ok(r.ok && r.resultado === 'ABIERTO' && r.cerradoAt === null && r.motivoPerdida === null)
})
t('rechaza etapas de otro pipeline o desactivadas; detecta sin cambios', () => {
  assert.equal(calcularCambioEtapa({ etapaActual: abierta, etapaDestino: { ...abierta2, pipelineId: 'q' }, pipelineId: 'p' }).ok, false)
  assert.equal(calcularCambioEtapa({ etapaActual: abierta, etapaDestino: { ...abierta2, activo: false }, pipelineId: 'p' }).ok, false)
  const r = calcularCambioEtapa({ etapaActual: abierta, etapaDestino: abierta, pipelineId: 'p' })
  assert.ok(r.ok && r.sinCambios)
})
t('motivos y resultados', () => {
  assert.equal(MOTIVOS_PERDIDA.length, 7)
  assert.equal(normalizarMotivo('  ', null), null)
  assert.equal(normalizarMotivo('Duplicado', ''), 'Duplicado')
  assert.equal(resultadoNegocio({ resultado: 'GANADA' }), 'GANADO')
})
t('validación del alta de negocio', () => {
  assert.equal(validarNegocioNuevo({ nombre: 'ab', empresaId: 'e1' }).ok, false)
  assert.equal(validarNegocioNuevo({ nombre: 'Fibra sede', importe: '-1', empresaId: 'e1' }).ok, false)
  assert.equal(validarNegocioNuevo({ nombre: 'Fibra sede', fechaCierrePrevista: '24/11/2026', empresaId: 'e1' }).ok, false)
  assert.equal(validarNegocioNuevo({ nombre: 'Fibra sede' }).ok, false)
  const v = validarNegocioNuevo({ nombre: '  Fibra   sede ', importe: '1.234,5'.replace('.', ''), fechaCierrePrevista: '2026-12-31', contactoId: 'c1' })
  assert.ok(v.ok && v.data.nombre === 'Fibra sede' && v.data.importe === '1234.50' && v.data.empresaId === null)
})
t('previsión ponderada', () => {
  assert.equal(importePonderado([{ importe: 1000, probabilidad: 50 }, { importe: null, probabilidad: 90 }, { importe: 333.33, probabilidad: 10 }]), 533.33)
})

console.log(`\n${ok} pruebas OK`)
