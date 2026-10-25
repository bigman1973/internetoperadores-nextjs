import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isReviewQueueVisible } from '../components/finanzas/easy/EasyReviewQueues';

test('las pestañas conservan Todos y sólo hacen visible la cola solicitada', () => {
  assert.equal(isReviewQueueVisible('TODOS', 'P1_PENDIENTE'), true);
  assert.equal(isReviewQueueVisible('TODOS', 'P2_PENDIENTE'), true);
  assert.equal(isReviewQueueVisible('TODOS', 'COBROS_PROPUESTOS'), true);
  assert.equal(isReviewQueueVisible('P1_PENDIENTE', 'P1_PENDIENTE'), true);
  assert.equal(isReviewQueueVisible('P1_PENDIENTE', 'P2_PENDIENTE'), false);
  assert.equal(isReviewQueueVisible('P2_PENDIENTE', 'COBROS_PROPUESTOS'), false);
  assert.equal(isReviewQueueVisible('COBROS_PROPUESTOS', 'COBROS_PROPUESTOS'), true);
});

test('el aislante de pestañas es sólo de presentación y no inicia servicios ni mutaciones', () => {
  const source = readFileSync('components/finanzas/easy/EasyReviewQueues.tsx', 'utf8');
  const panel = readFileSync('components/finanzas/easy/EasyReviewQueuePanel.tsx', 'utf8');
  assert.match(source, /const \[queueStep, setQueueStep\] = useState/);
  assert.match(source, /EasyReviewQueuePanel/);
  assert.match(panel, /hidden=\{!visible\}/);
  assert.match(panel, /data-easy-review-isolated/);
  assert.match(panel, /@supports \(content-visibility: auto\)/);
  assert.match(panel, /contain-intrinsic-size: auto 36rem/);
  assert.match(panel, /overflow-anchor: none/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(panel, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(panel, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(source, /\/api\//);
  assert.doesNotMatch(panel, /\/api\//);
});

console.log('test-finance-easy-review-queues: OK');
