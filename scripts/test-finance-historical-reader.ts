import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { parseHistoricoB4ReadDto } from '../lib/finanzas/reconciliation-db'

const ROOT = resolve(import.meta.dirname, '..')
const readerPath = resolve(ROOT, 'lib/finanzas/reconciliation-db.ts')
const routePath = resolve(ROOT, 'app/api/admin/finanzas/conciliacion-v2/route.ts')

function fila(overrides: Record<string, unknown> = {}) {
  return {
    movimientoId: 'movimiento-1',
    id: 'historico-1',
    origen: 'HISTORICO',
    clasificacion: 'PROPUESTA',
    procedencia: 'DESCONOCIDO',
    motivos: ['PROCEDENCIA_DESCONOCIDA'],
    documentos: [{
      tipo: 'NOMINA',
      sourceId: 'nomina-1',
      documentoConciliableId: 'documento-1',
      referencia: 'Nómina 09/2026',
      importeObjetivoCentimos: -12345,
      archivoDisponible: true,
      version: 3,
      stale: false,
    }],
    creadoAt: new Date('2026-10-23T08:00:00.000Z'),
    ...overrides,
  }
}

test('el parser histórico entrega exclusivamente el DTO público mínimo', () => {
  const parsed = parseHistoricoB4ReadDto(fila({
    snapshotLegacy: { archivoDriveId: 'privado' },
    sourceHash: 'a'.repeat(64),
    lote: 'lote-privado',
    creadoPorId: 99,
    actorId: 99,
    documentos: [{
      ...fila().documentos[0],
      archivoDriveId: 'drive-privado',
      oneDriveItemId: 'item-privado',
    }],
  }))
  assert.ok(parsed)
  assert.deepEqual(parsed, {
    id: 'historico-1',
    origen: 'HISTORICO',
    clasificacion: 'PROPUESTA',
    procedencia: 'DESCONOCIDO',
    motivos: ['PROCEDENCIA_DESCONOCIDA'],
    documentos: [{
      tipo: 'NOMINA',
      sourceId: 'nomina-1',
      documentoConciliableId: 'documento-1',
      referencia: 'Nómina 09/2026',
      importeObjetivoCentimos: -12345,
      archivoDisponible: true,
      version: 3,
      stale: false,
    }],
    creadoAt: '2026-10-23T08:00:00.000Z',
  })
  assert.equal(JSON.stringify(parsed).includes('privado'), false)
})

test('el parser falla cerrado ante JSON histórico no verificable', () => {
  assert.equal(parseHistoricoB4ReadDto(fila({ origen: 'OTRO' })), null)
  assert.equal(parseHistoricoB4ReadDto(fila({ clasificacion: 'AUTOMATICO' })), null)
  assert.equal(parseHistoricoB4ReadDto(fila({ documentos: [{ ...fila().documentos[0], importeObjetivoCentimos: 1.5 }] })), null)
  assert.equal(parseHistoricoB4ReadDto(fila({ documentos: [{ ...fila().documentos[0], documentoConciliableId: undefined }] })), null)
})

test('la lectura limita legado a la página, excluye lotes revertidos y deja fuera documentos/lookups exactos', () => {
  const source = readFileSync(readerPath, 'utf8')
  const route = readFileSync(routePath, 'utf8')

  assert.match(source, /WHERE legado\.movimiento_id IN \(\$\{Prisma\.join\(movimientoIds\)\}\)/)
  assert.match(source, /LIMIT \$\{movimientoIds\.length\}/)
  assert.match(source, /NOT EXISTS \(SELECT 1 FROM reversiones_legado_b4 reversion WHERE reversion\.lote = legado\.lote\)/)
  assert.match(source, /options\.heredados && !options\.movimientoId/)
  assert.match(source, /readDocumentPage\(documentTake, documentosOffset, q\)/)
  assert.doesNotMatch(source, /snapshotLegacy: .*historico|sourceHash: .*historico|creadoPorId: .*historico/)
  assert.match(route, /value === 'SI' \|\| value === 'PROPUESTA'/)
  assert.match(route, /filtroHeredados === null/)
})

test('no convierte un tipo legacy GASTO en el TICKET B4 actual', () => {
  const source = readFileSync(readerPath, 'utf8')
  assert.match(source, /wrapper\.tipo === documento\.tipo/)
  assert.match(source, /GASTO no se reinterpreta como el TICKET/)
})
