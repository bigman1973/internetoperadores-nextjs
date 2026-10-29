import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parseConfirmingControlledSupportDeclaration, ConfirmingControlledSupportRegistryError } from '../lib/finanzas/confirming-controlled-support-registry'
import { easyOnlyRequestAllowed } from '../lib/finanzas/easy-access-core'
import { impersonationRouteDecision } from '../lib/impersonation-policy'

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
}
function key(value: unknown): string { return createHash('sha256').update(canonical(value), 'utf8').digest('hex') }
function declaration(fuentes: unknown[], parejaCaixaDeclaradaId: string | null) {
  const sorted = [...fuentes].sort((left, right) => `${(left as { tipo: string }).tipo}:${(left as { facturaRecibidaId: string }).facturaRecibidaId}`.localeCompare(`${(right as { tipo: string }).tipo}:${(right as { facturaRecibidaId: string }).facturaRecibidaId}`))
  return { action: 'declarar', confirmar: true, parejaCaixaDeclaradaId, fuentes: sorted, idempotencyKey: key({ action: 'declarar', confirmar: true, parejaCaixaDeclaradaId, fuentes: sorted }) }
}
function code(error: unknown): string | null { return error instanceof ConfirmingControlledSupportRegistryError ? error.code : null }

test('acepta una única declaración BBVA con hash canónico de cuerpo', () => {
  const input = declaration([{ facturaRecibidaId: 'source-bbva-1', tipo: 'BBVA_PDF' }], null)
  assert.deepEqual(parseConfirmingControlledSupportDeclaration(input), input)
})

test('acepta sólo una pareja Caixa explícita PDF/XLS con id de pareja', () => {
  const input = declaration([
    { facturaRecibidaId: 'source-caixa-xls', tipo: 'CAIXA_XLS' },
    { facturaRecibidaId: 'source-caixa-pdf', tipo: 'CAIXA_PDF' },
  ], 'caixa-2026-10-29-a')
  const parsed = parseConfirmingControlledSupportDeclaration(input)
  assert.deepEqual(parsed.fuentes.map(source => source.tipo), ['CAIXA_PDF', 'CAIXA_XLS'])
  assert.equal(parsed.parejaCaixaDeclaradaId, 'caixa-2026-10-29-a')
})

test('rechaza Drive/Item del navegador y cualquier forma de pareja incompleta', () => {
  const withIdentity = declaration([{ facturaRecibidaId: 'source-bbva-1', tipo: 'BBVA_PDF', driveId: 'forged', itemId: 'forged' }], null)
  assert.throws(() => parseConfirmingControlledSupportDeclaration(withIdentity), error => code(error) === 'FUENTES_INVALIDAS')
  const incomplete = declaration([{ facturaRecibidaId: 'source-caixa-pdf', tipo: 'CAIXA_PDF' }], 'caixa-2026-10-29-a')
  assert.throws(() => parseConfirmingControlledSupportDeclaration(incomplete), error => code(error) === 'PAREJA_CAIXA_INVALIDA')
})

test('rechaza un hash que no sea del cuerpo exacto y confirmado', () => {
  const valid = declaration([{ facturaRecibidaId: 'source-bbva-1', tipo: 'BBVA_PDF' }], null)
  const tampered = { ...valid, fuentes: [{ facturaRecibidaId: 'source-other', tipo: 'BBVA_PDF' }] }
  assert.throws(() => parseConfirmingControlledSupportDeclaration(tampered), error => code(error) === 'IDEMPOTENCY_KEY_INVALIDA')
})

test('la nueva ruta es literal: actuación y modo fácil no conceden prefijos vecinos', () => {
  const route = '/api/admin/finanzas/confirming/fuentes'
  assert.equal(impersonationRouteDecision(route, 'GET').allowed, true)
  assert.equal(impersonationRouteDecision(route, 'POST', new URLSearchParams(), 17, 'declarar').allowed, true)
  assert.equal(impersonationRouteDecision(route, 'POST', new URLSearchParams(), 17, 'confirmar').allowed, false)
  assert.equal(impersonationRouteDecision(`${route}/arbitrario`, 'GET').allowed, false)
  const before = process.env.FINANCE_STAGING_SANDBOX
  process.env.FINANCE_STAGING_SANDBOX = '1'
  try {
    assert.equal(easyOnlyRequestAllowed(route, 'GET'), true)
    assert.equal(easyOnlyRequestAllowed(route, 'POST'), true)
    assert.equal(easyOnlyRequestAllowed(`${route}/arbitrario`, 'GET'), false)
  } finally {
    if (before === undefined) delete process.env.FINANCE_STAGING_SANDBOX
    else process.env.FINANCE_STAGING_SANDBOX = before
  }
})

test('middleware real: ruta exacta de fuentes sólo usa el permiso existente en staging', () => {
  const source = readFileSync('middleware.js', 'utf8')
  const start = source.indexOf('function financeAreas(pathname) {')
  const end = source.indexOf('\nexport async function middleware(', start)
  assert.ok(start >= 0 && end > start)
  const route = '/api/admin/finanzas/confirming/fuentes'
  for (const sandbox of [undefined, '0', '1']) {
    const areas = runInNewContext(source.slice(start, end) + '\nfinanceAreas', { process: { env: { FINANCE_STAGING_SANDBOX: sandbox } } })
    assert.deepEqual(Array.from(areas(route)), sandbox === '1' ? ['admin.finanzas.conciliacion'] : [])
    assert.deepEqual(Array.from(areas(route + '/otra')), [])
  }
})

test('panel administrativo: no muestra identificadores técnicos y conserva éxito tras refrescar', () => {
  const source = readFileSync('components/finanzas/confirming/ConfirmingControlledSourcesPanel.tsx', 'utf8')
  assert.ok(source.includes('Preparar documentos de confirming'))
  assert.ok(source.includes('Sólo prepara su revisión; no importa ni confirma cobros.'))
  assert.ok(source.includes('await load(false)'))
  assert.ok(source.includes('Cambiar selección'))
  assert.ok(source.includes('Reintentar'))
  assert.ok(!source.includes('>Drive / Item'))
  assert.ok(!source.includes('{candidate.identidadControlada.'))
  assert.ok(!source.includes('ejecuta OCR'))
})
