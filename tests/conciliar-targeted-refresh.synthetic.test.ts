import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConciliarActionResponse, parseConciliarUndoResponse, type ConciliarReadResponse, type ConciliarRow, type ConciliarSummary } from '../components/finanzas/conciliar/conciliar-contract';
import { canAdoptConciliarMutationProjection } from '../components/finanzas/conciliar/conciliar-mutation-ui';
import { createConciliarSearchMachineState, reduceConciliarSearchMachine } from '../components/finanzas/conciliar/conciliar-global-search';

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

const view = { tab: 'COBROS', desde: '2026-01-01', hasta: '2026-10-30', cuentaId: 'cuenta-A', q: 'remesa', cutoffDate: '2026-01-01', historic: false, estado: 'VERDE', grupo: 'CLIENTES', orden: 'IMPORTE', direccion: 'DESC', limit: 20, offset: 20 };
const authority = { synchronized: true, requestIdentity: 'usuario:3:valid', currentIdentity: 'usuario:3:valid', requestView: JSON.stringify(view), currentView: JSON.stringify(view), requestGeneration: 4, currentGeneration: 4, requestSequence: 7, currentSequence: 7, pendingCount: 1 };
assert.equal(canAdoptConciliarMutationProjection(authority), true, 'sólo la autoridad exacta adopta la instantánea sincronizada');
for (const change of [
  { synchronized: false }, { currentIdentity: null }, { currentIdentity: 'usuario:4:valid' },
  { currentIdentity: 'usuario:3:permiso-revocado' }, { currentIdentity: 'usuario:3:otra-actuacion' },
  { requestGeneration: 3 }, { currentGeneration: 5 }, { requestSequence: 6 }, { currentSequence: 8 },
  { pendingCount: 0 }, { pendingCount: 2 },
]) assert.equal(canAdoptConciliarMutationProjection({ ...authority, ...change }), false,
  `no adopta autoridad obsoleta o solapada: ${JSON.stringify(change)}`);
for (const change of [
  { tab: 'PAGOS' }, { offset: 0 }, { limit: 50 }, { cuentaId: 'cuenta-B' },
  { desde: '2026-02-01' }, { hasta: '2026-11-01' }, { cutoffDate: '2025-01-01' },
  { q: 'otra' }, { historic: true }, { estado: 'AMBAR' }, { grupo: 'PROVEEDORES' },
  { orden: 'FECHA' }, { direccion: 'ASC' }, { emitidasGrupo: 'PARA_REVISAR' },
]) assert.equal(canAdoptConciliarMutationProjection({ ...authority, currentView: JSON.stringify({ ...view, ...change }) }), false,
  `no cruza vista ni ámbito financiero: ${JSON.stringify(change)}`);
const activePage = createConciliarSearchMachineState('PAGOS', 'vista actual', 20, true);
const fallback = reduceConciliarSearchMachine(activePage, { type: 'REFRESH' });
assert.equal(fallback.phase, 'loading', 'rechazar la foto debe pedir GET, no mantener idle con una foto vieja');
assert.deepEqual(fallback.view, activePage.view, 'el fallback conserva la vista activa, no la capturada por el POST');
assert.equal(fallback.generation, activePage.generation + 1, 'el fallback invalida la generación financiera anterior');
assert.equal(reduceConciliarSearchMachine(fallback, { type: 'RESOLVED', generation: activePage.generation }), fallback,
  'una lectura antigua no desbloquea la generación del GET fallback');

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
assert.equal([...workspace.matchAll(/invalidateProjectionMemory\(true\);\s*if \(!adoptProjection\(result\)\) void load\(true, true\);/g)].length, 2,
  'confirmar/pedir y deshacer invalidan caché; sólo evitan el GET si adoptan la foto exacta');
assert.match(workspace, /const adoptProjection = [\s\S]*?result\.projection && canAdoptConciliarMutationProjection\(\{\s*synchronized: result\.projectionSynchronized, requestIdentity: operationIdentityScope, currentIdentity: currentIdentityScopeRef\.current,\s*requestView, currentView: projectionContextRef\.current\.view, requestGeneration, currentGeneration: projectionContextRef\.current\.generation,\s*requestSequence, currentSequence: mutationSequence\.current, pendingCount: pendingOperationsRef\.current\.length,\s*\}\) && search\.adopt\(result\.projection, requestGeneration\);/,
  'la única adopción exige proyección presente y todos los controles actuales del helper antes del coordinador');
assert.equal([...workspace.matchAll(/search\.adopt\(/g)].length, 1, 'ninguna rama de éxito puede adoptar sin la guarda exacta');
assert.match(workspace, /projectionContextRef\.current = \{ view: JSON\.stringify\(responseViewFor\(requestInput\)\), generation: search\.generation \};/,
  'la comparación se actualiza en cada render con los filtros financieros actuales');
for (const field of ['desde: input.from', 'hasta: input.to', 'cuentaId: input.accountId', 'cutoffDate: input.cutoffDate', 'emitidasGrupo: input.emitidasGrupo', 'estado: input.estado', 'grupo: input.grupo', 'orden: input.orden', 'direccion: input.direccion', 'limit: input.limit', 'offset: input.offset']) {
  assert.ok(workspace.includes(field), `la vista serializada incluye el ámbito ${field}`);
}
assert.match(globalSearch, /controllerRef\.current\?\.abort\(\)/,
  'el coordinador aborta la lectura anterior al cambiar la vista');
assert.match(globalSearch, /if \(current\.phase !== 'idle' \|\| generation !== current\.generation \|\| dataGeneration !== current\.generation\) return false/,
  'el coordinador rechaza adopción durante GET/transición o con datos de otra generación');
assert.match(globalSearch, /action\.type === 'CLEAR' \|\| action\.type === 'REFRESH'[\s\S]*?setAcceptedData\(null\)[\s\S]*?setDataGeneration\(null\)/,
  'el GET fallback elimina explícitamente los datos financieros anteriores');
assert.match(workspace, /const load = useCallback\(async \(_silent = false, _keepNotice = false\) => \{ search\.refresh\(\); \}, \[search\.refresh\]\);/,
  'la recarga posterior sólo solicita de nuevo la vista activa que posee el coordinador, sin aplicar una vista capturada por el POST');
assert.doesNotMatch(workspace, /applyConciliarTargetedRefresh|actualResponseView|(?:window\.)?location\.reload\(|router\.refresh\(/,
  'la UI no mantiene el parche frágil ni una recarga global tras mutar');
assert.match(actions, /const projection = await responseProjection\(tx, 'responseView' in command \? command\.responseView : undefined, result\.projectionSynchronized === true\)/,
  'la vista posterior se lee dentro de la misma transacción y sólo si la proyección quedó sincronizada');

console.log('conciliar authoritative snapshot synthetic test: ok');
