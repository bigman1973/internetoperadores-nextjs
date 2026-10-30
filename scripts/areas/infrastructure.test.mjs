import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { sha256, validateRelease } from './release-guard.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const LOCK = join(ROOT, 'scripts/areas/with-publication-lock.sh');
const HASH = 'a'.repeat(64);

function registry() {
  return {
    schema: 'io.areas.v1', maxActiveTasks: 3, integrationBranch: 'staging', productionBranch: 'main',
    timeZone: 'Europe/Madrid', publicationWindows: ['13:00', '19:00'],
    areas: Array.from({ length: 9 }, (_, index) => ({ id: `area${index + 1}`, state: index < 3 ? 'active' : 'not_started' })),
    batteries: [{ id: 'live', enabled: true, requiresLiveApiSnapshot: true, minimumCases: 30, minimumSupplementalCases: 6 }],
  };
}

function validInput(now = new Date('2026-10-30T12:15:00.000Z')) {
  const inputRegistry = registry();
  const registryHash = sha256(JSON.stringify(inputRegistry));
  return {
    registry: inputRegistry, registryHash, branch: 'staging', commit: 'c'.repeat(40), now,
    order: { issuer: 'Claude', action: 'publish', messageReference: 'msg-123', commit: 'c'.repeat(40), window: '13:00', date: '2026-10-30', issuedAt: '2026-10-30T12:00:00.000Z', expiresAt: '2026-10-30T12:30:00.000Z' },
    battery: { schema: 'io.areas.battery-report.v1', ok: true, publishAllowed: true, localOnly: false, commit: 'c'.repeat(40), capturedAt: '2026-10-30T12:05:00.000Z', registryHash, results: [{ id: 'live', ok: true, apiPass: true, api: { apiGate: { pass: true }, total: 30, passing: 30, supplemental: Array.from({ length: 6 }, () => ({ pass: true })) } }] },
    backup: { ok: true, target: 'production', restoreVerified: true, dumpSha256: HASH, projectionBackupSha256: HASH, registryHash, capturedAt: '2026-10-30T11:20:00.000Z', restoredAt: '2026-10-30T11:30:00.000Z' },
    rollback: { ok: true, previousDeploymentId: 'deployment-previous', procedureSha256: HASH, tested: true },
  };
}

function mustReject(input, code) {
  const outcome = validateRelease(input);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.reasons.includes(code), `expected ${code}; got ${outcome.reasons.join(', ')}`);
}

test('invariante: nueve áreas y como máximo tres activas', () => {
  assert.equal(validateRelease(validInput()).ok, true);
  const fourActive = validInput();
  fourActive.registry.areas[3].state = 'active';
  mustReject(fourActive, 'AREA_CONCURRENCY_EXCEEDED');
  const eightAreas = validInput();
  eightAreas.registry.areas.pop();
  mustReject(eightAreas, 'AREAS_REGISTRY_INVALID');
});

test('requiere staging, orden Claude con commit y referencia exactos', () => {
  const wrongBranch = validInput(); wrongBranch.branch = 'main'; mustReject(wrongBranch, 'RELEASE_MUST_ORIGINATE_FROM_STAGING');
  const missingReference = validInput(); missingReference.order.messageReference = ''; mustReject(missingReference, 'EXPLICIT_CLAUDE_ORDER_REQUIRED');
  const wrongCommit = validInput(); wrongCommit.order.commit = 'd'.repeat(40); mustReject(wrongCommit, 'EXPLICIT_CLAUDE_ORDER_REQUIRED');
});

test('falla cerrado con fechas NaN, ausentes, futuras o expiradas', () => {
  const invalidNow = validInput(new Date('not-a-date')); mustReject(invalidNow, 'INVALID_CURRENT_TIME');
  const malformedOrder = validInput(); malformedOrder.order.expiresAt = 'NaN'; mustReject(malformedOrder, 'CLAUDE_ORDER_EXPIRED');
  const impossibleCalendar = validInput(); impossibleCalendar.order.expiresAt = '2026-02-31T12:30:00Z'; mustReject(impossibleCalendar, 'CLAUDE_ORDER_EXPIRED');
  const missingCapture = validInput(); delete missingCapture.battery.capturedAt; mustReject(missingCapture, 'ALL_LIVE_AREA_BATTERIES_REQUIRED');
  const futureBackup = validInput(); futureBackup.backup.restoredAt = '2026-10-30T12:16:00.000Z'; mustReject(futureBackup, 'VERIFIED_FRESH_PRODUCTION_BACKUP_REQUIRED');
  const expired = validInput(); expired.order.expiresAt = '2026-10-30T12:15:00.000Z'; mustReject(expired, 'CLAUDE_ORDER_EXPIRED');
});

test('ventanas Madrid conservan 13:xx a ambos lados de los cambios DST', () => {
  // 11:15Z es 13:15 CEST el día de cambio de primavera.
  const spring = validInput(new Date('2026-03-29T11:15:00.000Z'));
  spring.order.date = '2026-03-29'; spring.order.issuedAt = '2026-03-29T11:00:00.000Z'; spring.order.expiresAt = '2026-03-29T11:30:00.000Z';
  spring.battery.capturedAt = '2026-03-29T11:10:00.000Z'; spring.backup.capturedAt = '2026-03-29T10:20:00.000Z'; spring.backup.restoredAt = '2026-03-29T10:30:00.000Z';
  assert.equal(validateRelease(spring).ok, true);
  // 12:15Z es 13:15 CET el día de cambio de otoño.
  const autumn = validInput(new Date('2026-10-25T12:15:00.000Z'));
  autumn.order.date = '2026-10-25'; autumn.order.issuedAt = '2026-10-25T12:00:00.000Z'; autumn.order.expiresAt = '2026-10-25T12:30:00.000Z';
  autumn.battery.capturedAt = '2026-10-25T12:10:00.000Z'; autumn.backup.capturedAt = '2026-10-25T11:20:00.000Z'; autumn.backup.restoredAt = '2026-10-25T11:30:00.000Z';
  assert.equal(validateRelease(autumn).ok, true);
});

test('exige 30/30, seis suplementarios, hash del registro y restauración de producción', () => {
  const incompleteApi = validInput(); incompleteApi.battery.results[0].api.passing = 29; mustReject(incompleteApi, 'ALL_LIVE_AREA_BATTERIES_REQUIRED');
  const incompleteSupplemental = validInput(); incompleteSupplemental.battery.results[0].api.supplemental.pop(); mustReject(incompleteSupplemental, 'ALL_LIVE_AREA_BATTERIES_REQUIRED');
  const staleHash = validInput(); staleHash.battery.registryHash = 'b'.repeat(64); mustReject(staleHash, 'ALL_LIVE_AREA_BATTERIES_REQUIRED');
  const untestedRestore = validInput(); untestedRestore.backup.restoreVerified = false; mustReject(untestedRestore, 'VERIFIED_FRESH_PRODUCTION_BACKUP_REQUIRED');
  const noRollback = validInput(); noRollback.rollback.tested = false; mustReject(noRollback, 'ROLLBACK_PLAN_REQUIRED');
});

test('la validación pura no lee config global cuando recibe registro y hash', () => {
  const source = readFileSync(join(ROOT, 'scripts/areas/release-guard.mjs'), 'utf8');
  assert.match(source, /Cuando registry y registryHash se suministran, no lee/);
  const input = validInput();
  assert.equal(validateRelease(input).ok, true);
});

test('lock flock global serializa dos jobs sobre git-common-dir y wrapper mantiene guard dentro', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'areas-lock-'));
  const log = join(temp, 'events.log');
  const common = spawn('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  let commonDir = '';
  common.stdout.setEncoding('utf8'); common.stdout.on('data', (chunk) => { commonDir += chunk; });
  await once(common, 'exit');
  assert.equal(common.exitCode, 0);
  const lockFile = join(commonDir.trim(), 'locks/publicacion.lock');
  mkdirSync(dirname(lockFile), { recursive: true, mode: 0o700 });
  const script = 'set -e; exec 9>"$1"; flock 9; printf "%s-start\\n" "$2" >> "$3"; sleep "$4"; printf "%s-end\\n" "$2" >> "$3"';
  // Son dos procesos separados y ambos abren exactamente el lock usado por el wrapper.
  const one = spawn('bash', ['-c', script, '--', lockFile, 'one', log, '0.25']);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
  const two = spawn('bash', ['-c', script, '--', lockFile, 'two', log, '0.01']);
  await Promise.all([once(one, 'exit'), once(two, 'exit')]);
  assert.equal(one.exitCode, 0); assert.equal(two.exitCode, 0);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['one-start', 'one-end', 'two-start', 'two-end']);
  // El wrapper adquiere ese flock antes del guard y conserva el descriptor hasta
  // después del único argv del operador; así un guard fallido nunca llega a "$@".
  const wrapper = readFileSync(LOCK, 'utf8');
  assert.match(wrapper, /lock_dir="\$git_common_dir\/locks"\nlock_file="\$lock_dir\/publicacion\.lock"/);
  assert.match(wrapper, /flock 9\nnode .*release-guard\.mjs[\s\S]*\n"\$@"/);

  const config = join(temp, 'invalid-config.json');
  const marker = join(temp, 'operator-was-run');
  writeFileSync(config, JSON.stringify({ orderFile: join(temp, 'order.json'), batteryConfigFile: join(temp, 'missing-battery.json'), backupFile: join(temp, 'backup.json'), rollbackFile: join(temp, 'rollback.json') }));
  chmodSync(config, 0o600);
  for (const name of ['order.json', 'backup.json', 'rollback.json']) { writeFileSync(join(temp, name), '{}'); chmodSync(join(temp, name), 0o600); }
  const failedGuard = spawn(LOCK, ['--config', config, '--', 'touch', marker], { cwd: ROOT, stdio: 'ignore' });
  await once(failedGuard, 'exit');
  assert.notEqual(failedGuard.exitCode, 0);
  assert.equal(existsSync(marker), false, 'el operador no puede ejecutarse si el guard falla');
});
