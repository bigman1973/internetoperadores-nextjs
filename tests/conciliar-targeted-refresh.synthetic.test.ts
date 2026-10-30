import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyConciliarTargetedRefresh,
  type ConciliarPrivateProjectionToken,
  type ConciliarTargetedProjectionPatch,
} from '../components/finanzas/conciliar/conciliar-targeted-refresh';
import type { ConciliarReadResponse, ConciliarRow, ConciliarSummary } from '../components/finanzas/conciliar/conciliar-contract';

const HASH = 'a'.repeat(64);
const TOKEN: ConciliarPrivateProjectionToken = { identityScope: 'usuario:17', generation: 7, viewKey: 'tab=COBROS&limit=20&offset=0' };

function row(id: string, color: ConciliarRow['color'] = 'VERDE'): ConciliarRow {
  return {
    id, movimientoId: `mov-${id}`, fecha: '2026-10-30', concepto: `Movimiento ${id}`,
    banco: 'Banco', cuenta: 'Cuenta', importeCentimos: 100, pendienteCentimos: 100,
    color, grupo: 'CLIENTES', motivo: color === 'VERDE' ? 'Exacto' : 'Revisar', documento: null,
    propuesta: null, seleccionable: color === 'VERDE', diferenciaCentimos: 0,
    linksMovimiento: [], detail: null, decisionHash: HASH,
  };
}

function tabs(): readonly ConciliarSummary[] {
  return ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'].map((tab) => ({
    tab: tab as ConciliarSummary['tab'], count: tab === 'COBROS' ? 1 : 0, amountCentimos: tab === 'COBROS' ? 100 : 0,
    colors: {
      VERDE: { count: tab === 'COBROS' ? 1 : 0, amountCentimos: tab === 'COBROS' ? 100 : 0 },
      AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 },
    },
  }));
}

const current: ConciliarReadResponse = {
  tabs: tabs(), rows: [row('a'), row('b')], total: 2, limit: 20, offset: 0,
  updatedAt: '2026-10-30T10:00:00.000Z', cuentas: [], stale: false, staleReason: null,
  cutoffDate: '2026-01-01',
  emitidasGroups: [
    { group: 'CON_PROPUESTA', count: 0, amountCentimos: 0 },
    { group: 'PARA_REVISAR', count: 0, amountCentimos: 0 },
    { group: 'SIN_PROPUESTA', count: 0, amountCentimos: 0 },
  ],
  historicSummary: { count: 0, amountCentimos: 0 },
};

function patch(overrides: Partial<ConciliarTargetedProjectionPatch> = {}): ConciliarTargetedProjectionPatch {
  return {
    baseGeneration: 7, generation: 8, updatedAt: '2026-10-30T10:01:00.000Z', stale: false, staleReason: null,
    total: 1, tabs: tabs(), changedRows: [row('a', 'AMBAR')], removedRowIds: ['b'], ...overrides,
  };
}

const successfulPatch = patch();
const applied = applyConciliarTargetedRefresh({ active: TOKEN, cached: TOKEN, current, affectedRowIds: ['a', 'b'], patch: successfulPatch });
assert(applied, 'la misma identidad, generación, vista e intersección debe permitir un parche selectivo');
assert.equal(applied.data.rows.length, 1);
assert.equal(applied.data.rows[0]?.id, 'a');
assert.equal(applied.data.rows[0]?.color, 'AMBAR');
assert.equal(applied.data.rows[0]?.seleccionable, false);
assert.equal(applied.data.rows[0], successfulPatch.changedRows[0], 'la fila tocada se reemplaza, sin recrear filas no afectadas');
assert.equal(applied.data.total, 1);
assert.equal(applied.token.generation, 8);
assert.deepEqual(applied.invalidatedRowIds, ['a', 'b'], 'detalle y selección se invalidan sólo para filas afectadas');

assert.equal(applyConciliarTargetedRefresh({
  active: { ...TOKEN, identityScope: 'actuacion:otra' }, cached: TOKEN, current, affectedRowIds: ['a', 'b'], patch: patch(),
}), null, 'una respuesta privada no cruza identidades');
assert.equal(applyConciliarTargetedRefresh({
  active: { ...TOKEN, viewKey: 'tab=PAGOS&limit=20&offset=0' }, cached: TOKEN, current, affectedRowIds: ['a', 'b'], patch: patch(),
}), null, 'una respuesta de otra búsqueda no cruza vistas');
assert.equal(applyConciliarTargetedRefresh({
  active: TOKEN, cached: TOKEN, current, affectedRowIds: ['a', 'b'], patch: patch({ baseGeneration: 6 }),
}), null, 'no se aplica una generación de partida distinta');
assert.equal(applyConciliarTargetedRefresh({
  active: TOKEN, cached: TOKEN, current, affectedRowIds: ['a'], patch: patch(),
}), null, 'no se aplica una fila eliminada fuera de la intersección sellada');
assert.equal(applyConciliarTargetedRefresh({
  active: TOKEN, cached: TOKEN, current, affectedRowIds: ['a', 'b'], patch: patch({ changedRows: [row('no-visible')], removedRowIds: [] }),
}), null, 'una inserción fuera de la página obliga a la lectura paginada normal');
assert.equal(applyConciliarTargetedRefresh({
  active: TOKEN, cached: TOKEN, current, affectedRowIds: ['a', 'b'], patch: patch({ stale: true }),
}), null, 'una foto dirty no se mezcla con una página previa');
assert.equal(applyConciliarTargetedRefresh({
  active: TOKEN, cached: TOKEN, current: { ...current, stale: true, staleReason: 'Pendiente' }, affectedRowIds: ['a', 'b'], patch: patch(),
}), null, 'una foto de origen pendiente tampoco admite una mezcla parcial');
assert.equal(applyConciliarTargetedRefresh({
  active: TOKEN, cached: TOKEN, current, affectedRowIds: Array.from({ length: 21 }, (_, index) => `fila-${index}`), patch: patch(),
}), null, 'el adaptador no procesa más de veinte filas afectadas');

const conciliarRoute = readFileSync('app/api/admin/finanzas/conciliar/route.ts', 'utf8');
const paraPedirRoute = readFileSync('app/api/admin/finanzas/modo-facil/para-pedir/route.ts', 'utf8');
const workspace = readFileSync('components/finanzas/conciliar/ConciliarWorkspace.tsx', 'utf8');
assert.match(conciliarRoute, /readConciliarProjection\(parseConciliarGetInput\(query\)\)/, 'GET Conciliar sigue siendo lectura de proyección autorizada');
assert.match(paraPedirRoute, /readParaPedirProjection\(parseParaPedirInput\(queryRecord\(request\)\)\)/, 'Para pedir sigue siendo lectura de proyección autorizada');
assert.match(workspace, /const PAGE_SIZE = 20;/, 'Workspace conserva páginas de veinte filas');
assert.doesNotMatch(workspace, /(?:window\.)?location\.reload\(|router\.refresh\(/, 'Workspace no usa una recarga global para sus mutaciones');

console.log('conciliar targeted refresh synthetic test: ok');
