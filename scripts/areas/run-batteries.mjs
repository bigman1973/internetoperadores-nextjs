#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, chmodSync, lstatSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function validateRegistry(registry) {
  if (registry?.schema !== 'io.areas.v1' || registry.maxActiveTasks !== 3 || registry.areas?.length !== 9) throw Error('AREAS_REGISTRY_INVALID');
  const ids = registry.areas.map(x => x.id);
  if (new Set(ids).size !== 9 || ids.some((id, i) => id !== `area${i + 1}`)) throw Error('AREAS_IDENTITIES_INVALID');
  if (registry.areas.filter(x => ['active', 'diagnostic'].includes(x.state)).length > 3) throw Error('AREA_CONCURRENCY_EXCEEDED');
  if (!registry.batteries?.some(x => x.enabled) || new Set(registry.batteries.map(x => x.id)).size !== registry.batteries.length) throw Error('BATTERIES_REGISTRY_INVALID');
  return registry;
}
function privateFile(file) {
  const path = resolve(file), stat = lstatSync(path);
  if (path.startsWith(ROOT + '/') || !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw Error('PRIVATE_CONFIG_UNSAFE');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function parseArguments(argv) {
  const args = { localOnly: false, config: process.env.AREAS_BATTERY_CONFIG };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--local-only') args.localOnly = true;
    else if (argv[i] === '--config' && argv[i + 1]) args.config = argv[++i];
    else throw Error('BATTERIES_ARGUMENTS_INVALID');
  }
  return args;
}
function run(argv, output, name) {
  const log = join(output, `${name}.log`);
  const result = spawnSync(argv[0], argv.slice(1), { cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, FINANCE_STAGING_SANDBOX: '1', FINANCE_GRAPH_DELTA_ENABLED: '0' } });
  writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''), { mode: 0o600 });
  return { ok: result.status === 0 && !result.error, log, stdout: result.stdout ?? '' };
}
export function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv), registry = validateRegistry(JSON.parse(readFileSync(join(ROOT, 'config/areas.json'), 'utf8')));
  const output = mkdtempSync(join(tmpdir(), 'io-area-batteries-')); chmodSync(output, 0o700);
  const config = args.config ? privateFile(args.config) : null;
  const migrations = run([process.execPath, 'scripts/areas/check-migrations.mjs'], output, 'migration-convention');
  const enabled = registry.batteries.filter(x => x.enabled), results = [];
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim();
  for (const battery of enabled) {
    const pure = battery.pureSuites.map((path, i) => ({ suite: path, ...run([join(ROOT, 'node_modules/.bin/tsx'), path], output, `${battery.id}-pure-${i}`) }));
    const result = { id: battery.id, purePassing: pure.filter(x => x.ok).length, pureTotal: pure.length, pureFailures: pure.filter(x => !x.ok).map(x => x.suite), apiPass: false, reasons: [] };
    if (result.pureFailures.length) result.reasons.push('PURE_BATTERY_FAILED');
    if (args.localOnly) result.reasons.push('LOCAL_ONLY_NOT_RELEASE_EVIDENCE');
    else {
      const entry = config?.batteries?.[battery.id];
      if (!entry?.snapshotFile || !entry?.caseFile || !entry?.envFile) result.reasons.push('LIVE_API_INPUTS_REQUIRED');
      else {
        const api = run([join(ROOT, 'node_modules/.bin/tsx'), battery.apiRunner, '--snapshot-file', entry.snapshotFile, '--input-file', entry.caseFile, '--env-file', entry.envFile], output, `${battery.id}-live-api`);
        let evidence; try { evidence = JSON.parse(api.stdout); } catch { result.reasons.push('LIVE_API_RESULT_INVALID'); }
        result.apiPass = Boolean(api.ok && evidence?.ok && evidence.apiGate?.pass && evidence.total === battery.minimumCases && evidence.passing === battery.minimumCases && evidence.supplemental?.length === battery.minimumSupplementalCases && evidence.supplemental.every(x => x.pass));
        if (!result.apiPass) result.reasons.push('LIVE_API_BATTERY_FAILED');
        if (evidence) result.api = evidence;
      }
    }
    result.ok = !result.pureFailures.length && result.apiPass;
    delete result.stdout; results.push(result);
  }
  const report = { schema: 'io.areas.battery-report.v1', commit: sha, capturedAt: new Date().toISOString(), ok: migrations.ok && results.every(x => x.ok), publishAllowed: !args.localOnly && migrations.ok && results.every(x => x.ok), migrationGate: migrations.ok, localOnly: args.localOnly, registryHash: createHash('sha256').update(readFileSync(join(ROOT, 'config/areas.json'))).digest('hex'), results };
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...report, reportFile: join(output, 'report.json') }));
  return report.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.log(JSON.stringify({ ok: false, publishAllowed: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'BATTERIES_FAILED_CLOSED' })); process.exitCode = 1; }
}
