#!/usr/bin/env node
/**
 * Gate de publicación: valida telemetría privada y ejecuta siempre el runner
 * de baterías; no acepta un informe de baterías suministrado como fixture.
 *
 * La atribución de `issuer: Claude` es un dato de protocolo/telemetría. No es
 * una firma criptográfica y este proceso no puede verificar a Claude de forma
 * automática.
 */
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT, validateRegistry } from './run-batteries.mjs';

const MAX_BATTERY_AGE_MS = 30 * 60 * 1000;
const MAX_BACKUP_AGE_MS = 60 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/i;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const SECRET_KEY = /(token|secret|password|api[_-]?key|authorization|credential)/i;
const RUNNER = join(ROOT, 'scripts/areas/run-batteries.mjs');

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeInstant(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_INSTANT.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  const zoneValid = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  // Date.parse normaliza casos como 2026-02-31: se valida la fecha civil antes.
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || !zoneValid) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeNow(now) {
  return now instanceof Date && Number.isFinite(now.getTime()) ? now : null;
}

function madridClock(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const year = get('year'), month = get('month'), day = get('day');
  const hour = get('hour'), minute = get('minute');
  if (![year, month, day, hour, minute].every((part) => /^\d{2,4}$/.test(part ?? ''))) return null;
  return { date: `${year}-${month}-${day}`, hour, minute, time: `${hour}:${minute}` };
}

function ageIsValid(instant, now, maximumAgeMs) {
  const date = safeInstant(instant);
  if (!date) return false;
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= maximumAgeMs;
}

function hasSha256(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSecretTelemetry(value) {
  if (Array.isArray(value)) return value.some(hasSecretTelemetry);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, nested]) => SECRET_KEY.test(key) || hasSecretTelemetry(nested));
}

function expectedBatteryEvidence(registry, battery, commit, registryHash, now) {
  if (!isPlainObject(battery) || battery.schema !== 'io.areas.battery-report.v1') return false;
  if (!battery.ok || !battery.publishAllowed || battery.localOnly || battery.commit !== commit) return false;
  if (!ageIsValid(battery.capturedAt, now, MAX_BATTERY_AGE_MS)) return false;
  if (!hasSha256(battery.registryHash) || battery.registryHash !== registryHash) return false;

  const enabled = registry.batteries.filter((entry) => entry.enabled);
  if (!enabled.length || !Array.isArray(battery.results) || battery.results.length !== enabled.length) return false;
  return enabled.every((definition) => {
    // La política de publicación es explícitamente 30/30 y seis suplementarios.
    if (definition.minimumCases !== 30 || definition.minimumSupplementalCases !== 6 || definition.requiresLiveApiSnapshot !== true) return false;
    const result = battery.results.find((entry) => entry?.id === definition.id);
    const api = result?.api;
    return Boolean(
      result?.ok && result.apiPass &&
      isPlainObject(api) && api.apiGate?.pass === true &&
      api.total === 30 && api.passing === 30 &&
      Array.isArray(api.supplemental) && api.supplemental.length === 6 && api.supplemental.every((entry) => entry?.pass === true),
    );
  });
}

function expectedBackupEvidence(backup, registryHash, now) {
  if (!isPlainObject(backup) || hasSecretTelemetry(backup)) return false;
  if (!backup.ok || backup.target !== 'production' || backup.restoreVerified !== true) return false;
  if (!hasSha256(backup.dumpSha256) || !hasSha256(backup.projectionBackupSha256)) return false;
  if (!hasSha256(backup.registryHash) || backup.registryHash !== registryHash) return false;
  if (!ageIsValid(backup.capturedAt, now, MAX_BACKUP_AGE_MS) || !ageIsValid(backup.restoredAt, now, MAX_BACKUP_AGE_MS)) return false;
  const capturedAt = safeInstant(backup.capturedAt);
  const restoredAt = safeInstant(backup.restoredAt);
  return restoredAt.getTime() >= capturedAt.getTime() && restoredAt.getTime() - capturedAt.getTime() <= MAX_BACKUP_AGE_MS;
}

function expectedRollbackEvidence(rollback) {
  return isPlainObject(rollback) && !hasSecretTelemetry(rollback) && rollback.ok === true &&
    nonEmptyString(rollback.previousDeploymentId) && hasSha256(rollback.procedureSha256) && rollback.tested === true;
}

/**
 * Validación pura. Cuando registry y registryHash se suministran, no lee
 * config/areas.json ni ninguna otra configuración global.
 */
export function validateRelease({ registry, registryHash, order, battery, backup, rollback, branch, commit, now = new Date() }) {
  const reasons = [];
  try { validateRegistry(registry); } catch (error) { return { ok: false, publishAllowed: false, reasons: [error.message] }; }
  const current = safeNow(now);
  if (!current) return { ok: false, publishAllowed: false, reasons: ['INVALID_CURRENT_TIME'] };
  if (registry.timeZone !== 'Europe/Madrid' || !Array.isArray(registry.publicationWindows)) reasons.push('PUBLICATION_POLICY_INVALID');
  if (!hasSha256(registryHash)) reasons.push('REGISTRY_HASH_INVALID');
  if (branch !== 'staging') reasons.push('RELEASE_MUST_ORIGINATE_FROM_STAGING');
  if (!nonEmptyString(commit)) reasons.push('RELEASE_COMMIT_REQUIRED');
  if (!isPlainObject(order) || hasSecretTelemetry(order) || order.issuer !== 'Claude' || order.action !== 'publish' || !nonEmptyString(order.messageReference) || order.commit !== commit) reasons.push('EXPLICIT_CLAUDE_ORDER_REQUIRED');

  const clock = madridClock(current);
  const orderedWindow = isPlainObject(order) && typeof order.window === 'string' ? order.window : '';
  const permittedWindow = /^([01]\d|2[0-3]):00$/.test(orderedWindow) && registry.publicationWindows.includes(orderedWindow);
  if (!clock || !permittedWindow || order?.date !== clock.date || clock.hour !== orderedWindow.slice(0, 2)) reasons.push('OUTSIDE_PUBLICATION_TURN');
  if (!ageIsValid(order?.issuedAt, current, MAX_BACKUP_AGE_MS) || !safeInstant(order?.expiresAt) || safeInstant(order.expiresAt).getTime() <= current.getTime()) reasons.push('CLAUDE_ORDER_EXPIRED');

  if (!expectedBatteryEvidence(registry, battery, commit, registryHash, current)) reasons.push('ALL_LIVE_AREA_BATTERIES_REQUIRED');
  if (!expectedBackupEvidence(backup, registryHash, current)) reasons.push('VERIFIED_FRESH_PRODUCTION_BACKUP_REQUIRED');
  if (!expectedRollbackEvidence(rollback)) reasons.push('ROLLBACK_PLAN_REQUIRED');
  return { ok: reasons.length === 0, publishAllowed: reasons.length === 0, reasons };
}

function assertPrivatePath(file) {
  if (!nonEmptyString(file)) throw Error('RELEASE_PRIVATE_INPUT_REQUIRED');
  const absolute = resolve(file);
  const stat = lstatSync(absolute);
  if (absolute === ROOT || absolute.startsWith(`${ROOT}/`) || !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw Error('RELEASE_PRIVATE_INPUT_UNSAFE');
  return absolute;
}

function jsonFile(file) {
  const absolute = assertPrivatePath(file);
  const parsed = JSON.parse(readFileSync(absolute, 'utf8'));
  if (!isPlainObject(parsed) || hasSecretTelemetry(parsed)) throw Error('RELEASE_PRIVATE_TELEMETRY_UNSAFE');
  return parsed;
}

function releaseConfig(file) {
  const config = jsonFile(file);
  const required = ['orderFile', 'batteryConfigFile', 'backupFile', 'rollbackFile'];
  if (Object.keys(config).length !== required.length || required.some((key) => !Object.hasOwn(config, key) || !nonEmptyString(config[key]))) throw Error('RELEASE_CONFIG_INVALID');
  // batteryConfigFile is deliberately a path, never a precomputed battery report.
  return { ...config, batteryConfigFile: assertPrivatePath(config.batteryConfigFile) };
}

export function runLiveBattery(batteryConfigFile) {
  const result = spawnSync(process.execPath, [RUNNER, '--config', batteryConfigFile], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
    // No se heredan tokens o secretos del entorno del proceso de publicación.
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', LANG: 'C', TZ: 'UTC', FINANCE_GRAPH_DELTA_ENABLED: '0' },
  });
  if (result.error || result.status !== 0) throw Error('LIVE_BATTERY_RUNNER_FAILED');
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw Error('LIVE_BATTERY_REPORT_INVALID'); }
  return report;
}

function staticRegistry() {
  const file = join(ROOT, 'config/areas.json');
  const source = readFileSync(file);
  return { registry: JSON.parse(source.toString('utf8')), registryHash: sha256(source) };
}

export function main(argv = process.argv.slice(2), dependencies = {}) {
  if (argv.length !== 2 || argv[0] !== '--config' || !isAbsolute(argv[1])) throw Error('RELEASE_CONFIG_REQUIRED');
  const config = releaseConfig(argv[1]);
  const { registry, registryHash } = staticRegistry();
  const commit = dependencies.commit ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim();
  const branch = dependencies.branch ?? spawnSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim();
  const battery = dependencies.runLiveBattery ? dependencies.runLiveBattery(config.batteryConfigFile) : runLiveBattery(config.batteryConfigFile);
  const result = validateRelease({ registry, registryHash, branch, commit, order: jsonFile(config.orderFile), battery, backup: jsonFile(config.backupFile), rollback: jsonFile(config.rollbackFile), now: dependencies.now ?? new Date() });
  if (!result.ok) { console.log(JSON.stringify(result)); return 1; }
  console.log(JSON.stringify({
    ...result,
    commit,
    deploymentExecuted: false,
    orderVerification: 'protocol-telemetry-only; no cryptographic signature or automatic verification of Claude',
    notice: 'El wrapper conserva el lock global durante el comando explícito del operador; este guard no publica, programa ni ejecuta git push.',
  }));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.log(JSON.stringify({ ok: false, publishAllowed: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'RELEASE_GUARD_FAILED_CLOSED' })); process.exitCode = 1; }
}
