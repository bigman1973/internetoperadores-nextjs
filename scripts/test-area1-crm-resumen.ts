/* Área 1 · Batería: visibilidad por rol del Resumen del CRM (sin BD). Ejecutar: npx tsx scripts/test-area1-crm-resumen.ts */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nivelDe, resolverVista, vencimiento, etiquetaOrigen, nombreDeAviso } from '../lib/area1-crm-resumen-vista'
import { inicioDiaMadrid } from '../lib/area1-crm-resumen'

let ok = 0
const t = (n: string, f: () => void) => { f(); ok++; console.log('ok', n) }
const SUPER = { id: 1, nombre: 'Super', rol: 'SUPER_ADMIN', roles: [] }
const GER = { id: 2, nombre: 'Gerente', rol: 'GERENTE', roles: [] }
const COM = { id: 3, nombre: 'Comercial', rol: 'VENTAS', roles: [] }
const VIS = { id: 4, nombre: 'Visor', rol: 'VISOR', roles: [] }

t('niveles por rol y multi-rol', () => {
  assert.equal(nivelDe('SUPER_ADMIN'), 'SUPERADMIN')
  assert.equal(nivelDe('GERENTE'), 'GERENTE')
  assert.equal(nivelDe('VENTAS'), 'COMERCIAL')
  assert.equal(nivelDe('VISOR'), 'COMERCIAL')
  assert.equal(nivelDe('VISOR', ['GERENTE']), 'GERENTE')
})
t('comercial: solo lo suyo, sin márgenes, consentimiento, limpieza, ISP ni vínculos; Equipo ignorado', () => {
  const v = resolverVista(COM, { alcance: 'equipo' })
  assert.equal(v.alcance, 'MIO'); assert.equal(v.usuarioId, 3)
  for (const k of ['alternarAlcance', 'verComo', 'pipelinesPorComercial', 'avisosMargen', 'importesMargen', 'consentimiento', 'limpieza', 'importarIsp', 'vinculosIsp'] as const) assert.equal(v.puede[k], false, k)
})
t('visor se trata como comercial (lo más restrictivo)', () => {
  assert.deepEqual(resolverVista(VIS, { alcance: 'equipo' }).puede, resolverVista(COM, {}).puede)
})
t('gerente: Mío/Equipo, pipelines por comercial en Equipo, avisos de margen sin importes, consentimiento y limpieza', () => {
  const m = resolverVista(GER, {}); const e = resolverVista(GER, { alcance: 'equipo' })
  assert.equal(m.alcance, 'MIO'); assert.equal(e.alcance, 'EQUIPO')
  assert.equal(m.puede.pipelinesPorComercial, false); assert.equal(e.puede.pipelinesPorComercial, true)
  assert.equal(e.puede.avisosMargen, true); assert.equal(e.puede.importesMargen, false)
  assert.equal(e.puede.consentimiento, true); assert.equal(e.puede.limpieza, true)
  assert.equal(e.puede.importarIsp, false); assert.equal(e.puede.vinculosIsp, false); assert.equal(e.puede.verComo, false)
})
t('superadmin: todo', () => {
  const v = resolverVista(SUPER, { alcance: 'equipo' })
  assert.ok(Object.values(v.puede).every(Boolean))
})
t('«Ver como» lo ignora el servidor si no eres superadmin', () => {
  const v = resolverVista(GER, { verComo: '3' }, COM)
  assert.equal(v.verComoActivo, false); assert.equal(v.usuarioId, 2); assert.equal(v.nivel, 'GERENTE')
  const c = resolverVista(COM, { verComo: '1' }, SUPER)
  assert.equal(c.verComoActivo, false); assert.equal(c.puede.importesMargen, false)
})
t('superadmin «Ver como» comercial: aplica la regla del comercial y conserva el selector', () => {
  const v = resolverVista(SUPER, { verComo: '3', alcance: 'equipo' }, COM)
  assert.equal(v.verComoActivo, true); assert.equal(v.usuarioId, 3); assert.equal(v.alcance, 'MIO')
  assert.equal(v.puede.importesMargen, false); assert.equal(v.puede.consentimiento, false); assert.equal(v.puede.importarIsp, false)
  assert.equal(v.puede.verComo, true)
})
t('«Ver como» con id que no coincide con el candidato no cambia nada', () => {
  const v = resolverVista(SUPER, { verComo: '99' }, COM)
  assert.equal(v.verComoActivo, false); assert.equal(v.usuarioId, 1)
})
t('vencimientos como en la maqueta', () => {
  const ahora = new Date('2026-11-24T10:00:00+01:00')
  assert.equal(vencimiento(new Date('2026-11-23T09:00:00+01:00'), ahora).texto, 'Vencida ayer')
  assert.equal(vencimiento(new Date('2026-11-23T09:00:00+01:00'), ahora).clase, '')
  assert.equal(vencimiento(new Date('2026-11-24T18:00:00+01:00'), ahora).clase, 'today')
  assert.equal(vencimiento(new Date('2026-11-26T18:00:00+01:00'), ahora).clase, 'ok')
})
t('origen de formularios y nombre de avisos', () => {
  assert.equal(etiquetaOrigen('/api/contrata/moviles'), 'Contratación web')
  assert.equal(etiquetaOrigen('/api/partners'), 'Partner / gestoría')
  assert.equal(nombreDeAviso('EMPRESA X, S.L.: margen conocido negativo (-1 €)'), 'EMPRESA X, S.L.')
})
t('inicio del día en Madrid (invierno y verano)', () => {
  assert.equal(inicioDiaMadrid(new Date('2026-11-24T23:30:00Z')).toISOString(), '2026-11-24T23:00:00.000Z')
  assert.equal(inicioDiaMadrid(new Date('2026-07-01T10:00:00Z')).toISOString(), '2026-06-30T22:00:00.000Z')
})
t('la página no contiene cifras de ejemplo de la maqueta ni la etiqueta «ejemplo»', () => {
  const src = readFileSync('app/admin/crm/page.tsx', 'utf8')
  for (const x of ['22.198', '12.741', '721', '148', '86.400', '19.883', 'class="ex"', 'className="ex"', 'Rialp', 'Tiresa']) assert.ok(!src.includes(x), x)
})
t('el CSS está todo acotado a .io-ui.area1-resumen', () => {
  const css = readFileSync('app/admin/crm/area1-resumen.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const sels = [...css.matchAll(/(^|\}|\{)\s*([^{}@][^{}]*)\{/g)].map((m) => m[2].trim()).filter((s) => !s.startsWith('@'))
  assert.ok(sels.length > 100)
  for (const s of sels) for (const p of s.split(',')) assert.ok(p.trim().startsWith('.io-ui.area1-resumen'), p)
})
console.log(`\n${ok}/13 ok`)
