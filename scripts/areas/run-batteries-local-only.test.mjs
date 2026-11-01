import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

function run(...args) {
  return spawnSync(process.execPath, ['scripts/areas/run-batteries.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function reportFrom(result) {
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test('la batería local pasa sólo con migraciones y suites puras, sin habilitar publicación', () => {
  const result = run('--local-only');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = reportFrom(result);
  assert.equal(report.ok, true);
  assert.equal(report.localOnly, true);
  assert.equal(report.publishAllowed, false);
  assert.equal(report.migrationGate, true);
  assert.ok(report.results.length > 0);
  assert.ok(report.results.every((item) => item.purePassing === item.pureTotal && item.apiPass === false));
});

test('sin los artefactos privados la batería real falla cerradamente', () => {
  const result = run();
  assert.notEqual(result.status, 0);
  const report = reportFrom(result);
  assert.equal(report.ok, false);
  assert.equal(report.localOnly, false);
  assert.equal(report.publishAllowed, false);
  assert.ok(report.results.every((item) => item.reasons.includes('LIVE_API_INPUTS_REQUIRED')));
});
