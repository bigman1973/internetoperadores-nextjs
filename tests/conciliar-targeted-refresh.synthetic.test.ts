import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConciliarActionResponse, parseConciliarUndoResponse, type ConciliarReadResponse, type ConciliarRow, type ConciliarSummary } from '../components/finanzas/conciliar/conciliar-contract';

const HASH = 'a'.repeat(64);
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

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

const snapshot: ConciliarReadResponse = {
  tabs: tabs(), rows: [row('posterior', 'AMBAR')], total: 1, limit: 20, offset: 0,
  updatedAt: '2026-10-30T10:01:00.000Z', cuentas: [], stale: false, staleReason: null,
  cutoffDate: '2026-01-01',
  emitidasGroups: [
    { group: 'CON_PROPUESTA', count: 0, amountCentimos: 0 },
    { group: 'PARA_REVISAR', count: 0, amountCentimos: 0 },
    { group: 'SIN_PROPUESTA', count: 0, amountCentimos: 0 },
  ],
  historicSummary: { count: 0, amountCentimos: 0 },
};

const action = parseConciliarActionResponse({
  operationId: OPERATION_ID,
  outcomes: [{ id: 'anterior', ok: true, code: 'HECHO', message: 'Hecho.', operationId: OPERATION_ID }],
  refreshedAt: '2026-10-30T10:01:00.000Z', projectionSynchronized: true, projection: snapshot,
});
assert.deepEqual(action.projection, snapshot,
  'la respuesta de acción adopta la página completa posterior, no un parche de filas derivado en el cliente');
assert.equal(action.projection?.limit, 20, 'la instantánea autoritativa conserva el límite de página');
assert.equal(action.projection?.offset, 0, 'la instantánea autoritativa conserva el desplazamiento de página');
assert.equal(action.projection?.rows[0]?.id, 'posterior', 'la página posterior puede reemplazar por completo la fila confirmada');

assert.throws(() => parseConciliarActionResponse({
  operationId: OPERATION_ID,
  outcomes: [{ id: 'anterior', ok: true, code: 'HECHO', message: 'Hecho.' }],
  refreshedAt: '2026-10-30T10:01:00.000Z', projectionSynchronized: false, projection: snapshot,
}), /proyección no sincronizada/, 'una foto no limpia nunca se adopta como respuesta de mutación');

const undo = parseConciliarUndoResponse({
  operationId: OPERATION_ID, undone: true, message: 'Deshecho.',
  refreshedAt: '2026-10-30T10:02:00.000Z', projectionSynchronized: true, projection: snapshot,
});
assert.equal(undo.projection?.updatedAt, snapshot.updatedAt, 'deshacer usa el mismo contrato de instantánea completa');

const conciliarRoute = readFileSync('app/api/admin/finanzas/conciliar/route.ts', 'utf8');
const paraPedirRoute = readFileSync('app/api/admin/finanzas/modo-facil/para-pedir/route.ts', 'utf8');
const workspace = readFileSync('components/finanzas/conciliar/ConciliarWorkspace.tsx', 'utf8');
const globalSearch = readFileSync('components/finanzas/conciliar/conciliar-global-search.ts', 'utf8');
const actions = readFileSync('lib/finanzas/conciliar-actions.ts', 'utf8');
assert.match(conciliarRoute, /readConciliarProjection\(parseConciliarGetInput\(query\)\)/, 'GET Conciliar sigue siendo lectura de proyección autorizada');
assert.match(paraPedirRoute, /readParaPedirProjection\(parseParaPedirInput\(queryRecord\(request\)\)\)/, 'Para pedir sigue siendo lectura de proyección autorizada');
assert.match(workspace, /const PAGE_SIZE = 20;/, 'Workspace conserva páginas de veinte filas');
assert.match(workspace, /const search = useConciliarGlobalSearch\(\{ initialTab, initialQuery, initialOffset: 0, initialData: initialParsed, read: readGlobal, cache: searchCache \}\)/,
  'el Workspace delega la única lectura de proyección al coordinador global con la semilla SSR y caché privada');
assert.match(workspace, /invalidateProjectionMemory\(true\);\s*void load\(true, true\);/,
  'tras mutar invalida la foto privada y solicita una nueva lectura autorizada de la vista activa');
assert.doesNotMatch(workspace, /search\.adopt\(/,
  'una respuesta de POST no puede sustituir directamente la vista activa después de invalidar su generación');
assert.match(globalSearch, /controllerRef\.current\?\.abort\(\)/,
  'el coordinador aborta la lectura anterior al cambiar la vista');
assert.match(globalSearch, /dataGeneration !== current\.generation/,
  'el coordinador rechaza adoptar una foto que no pertenece a la generación visible');
assert.match(workspace, /const load = useCallback\(async \(_silent = false, _keepNotice = false\) => \{ search\.refresh\(\); \}, \[search\.refresh\]\);/,
  'la recarga posterior sólo solicita de nuevo la vista activa que posee el coordinador, sin aplicar una vista capturada por el POST');
assert.doesNotMatch(workspace, /applyConciliarTargetedRefresh|actualResponseView|(?:window\.)?location\.reload\(|router\.refresh\(/,
  'la UI no mantiene el parche frágil ni una recarga global tras mutar');
assert.match(actions, /const projection = await responseProjection\(tx, 'responseView' in command \? command\.responseView : undefined, result\.projectionSynchronized === true\)/,
  'la vista posterior se lee dentro de la misma transacción y sólo si la proyección quedó sincronizada');

console.log('conciliar authoritative snapshot synthetic test: ok');
