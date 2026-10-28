import assert from 'node:assert/strict';
import test from 'node:test';
import { ConciliarStreamRejectedError, ConciliarStreamUncertainError, readConciliarBatchResponse } from '../components/finanzas/conciliar/conciliar-batch-client';

function response(events: unknown[], split = false): Response {
  const text = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += split ? 7 : bytes.length) controller.enqueue(bytes.slice(i, i + (split ? 7 : bytes.length))); controller.close(); } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
}
const started = { type: 'started', total: 2, provisional: true };
const progress = (rowId: string, completed: number) => ({ type: 'progress', total: 2, completed, rowId, provisional: true });
const committed = { type: 'committed', provisional: false, result: { operationId: 'test-receipt', outcomes: [{ id: 'r1', ok: true }, { id: 'r2', ok: true }] } };

test('avance real partido por chunks sólo entrega resultado tras committed completo', async () => {
  const progressValues: number[] = [];
  const result = await readConciliarBatchResponse(response([started, progress('r1', 1), progress('r2', 2), committed], true), ['r1', 'r2'], (p) => progressValues.push(p.completed));
  assert.deepEqual(result, committed.result); assert.deepEqual(progressValues, [0, 1, 2]);
});

test('un reintento retira el avance provisional sin inventar resultados', async () => {
  const seen: Array<{ completed: number; retrying: boolean }> = [];
  await readConciliarBatchResponse(response([started, progress('r1', 1), { type: 'retrying' }, progress('r1', 1), progress('r2', 2), committed]), ['r1', 'r2'], (p) => seen.push(p));
  assert.deepEqual(seen.map((p) => [p.completed, p.retrying]), [[0, false], [1, false], [0, true], [1, false], [2, false]]);
});

test('rollback confirmado, resultado incierto y truncado no se presentan como hechos', async () => {
  await assert.rejects(readConciliarBatchResponse(response([started, progress('r1', 1), { type: 'rolled_back', code: 'DECISION_CAMBIADA' }]), ['r1', 'r2'], () => undefined), ConciliarStreamRejectedError);
  await assert.rejects(readConciliarBatchResponse(response([started, { type: 'uncertain' }]), ['r1', 'r2'], () => undefined), ConciliarStreamUncertainError);
  await assert.rejects(readConciliarBatchResponse(response([started, progress('r1', 1)]), ['r1', 'r2'], () => undefined), ConciliarStreamUncertainError);
  await assert.rejects(readConciliarBatchResponse(new Response('{', { headers: { 'Content-Type': 'application/json' } }), ['r1', 'r2'], () => undefined), ConciliarStreamUncertainError);
});

test('filas ajenas, repetidas o un recibo parcial se rechazan con resultado incierto', async () => {
  await assert.rejects(readConciliarBatchResponse(response([started, progress('foreign', 1), committed]), ['r1', 'r2'], () => undefined), ConciliarStreamUncertainError);
  await assert.rejects(readConciliarBatchResponse(response([{ ...committed, result: { outcomes: [{ id: 'r1', ok: true }] } }]), ['r1', 'r2'], () => undefined), ConciliarStreamUncertainError);
  await assert.rejects(readConciliarBatchResponse(response([{ ...committed, result: { outcomes: [{ id: 'r1', ok: true }, { id: 'r1', ok: true }] } }]), ['r1', 'r2'], () => undefined), ConciliarStreamUncertainError);
});
