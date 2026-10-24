#!/usr/bin/env node
'use strict';
/*
 * Release-only generator/validator for the production «Actuar como» ledger.
 * It never connects to PostgreSQL. The production SQL is derived from the
 * reviewed staging migration (already applied in io_staging_finanzas) and only
 * environment identity, guard names and explanatory comments change. Tables,
 * columns, constraints, indexes and trigger logic stay byte-for-byte inherited.
 *
 *   node scripts/impersonation-production-release.cjs --write     # materialise
 *   node scripts/impersonation-production-release.cjs --validate  # default
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repo = path.resolve(__dirname, '..');
const sourceRelative = 'prisma/migrations/20261024_impersonation_ledger/migration.sql';
const targetName = '20261024prodscope_impersonation_ledger';
const targetRelative = `prisma/production-releases/20261024_impersonation/${targetName}.sql`;
// SHA-256 of the staging migration reviewed, rollback-rehearsed and applied.
const REVIEWED_SOURCE_SHA256 = '146cccfa21b608c37b89f653b8bace71e8e3b7138003fa4e43bb67d9dcae1e08';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function header(sourceHash) {
  return [
    '-- Release productivo dedicado 20261024 «Actuar como»: sólo railway/postgres; no usar Prisma.',
    `-- Fuente staging auditada: ${sourceRelative} SHA-256 ${sourceHash}.`,
    '-- Preflight de creación obligatorio, habilitado sólo por el aplicador transaccional.',
    'DO $$',
    'BEGIN',
    "  IF current_setting('io.impersonation_production_ddl', true) = '1' THEN",
    '    NULL;',
    '  ELSE',
    "    RAISE EXCEPTION 'IMPERSONATION_PRODUCTION_DDL_GUARD_REQUIRED' USING ERRCODE = '55000';",
    '  END IF;',
    'END;',
    '$$;',
    '',
    '',
  ].join('\n');
}

const REPLACEMENTS = Object.freeze([
  ['-- Actuar como — migración ADITIVA PROPUESTA. NO EJECUTAR AUTOMÁTICAMENTE.\n-- Exclusiva de io_staging_finanzas/io_staging_finanzas. No contiene DML,',
    '-- Actuar como — release ADITIVO de producción. NO EJECUTAR AUTOMÁTICAMENTE.\n-- Exclusiva de railway/postgres. No contiene DML,'],
  ["IF current_database() <> 'io_staging_finanzas' OR current_user <> 'io_staging_finanzas' THEN\n    RAISE EXCEPTION 'IMPERSONATION_STAGING_ONLY';",
    "IF current_database() <> 'railway' OR current_user <> 'postgres' THEN\n    RAISE EXCEPTION 'IMPERSONATION_PRODUCTION_ONLY';"],
  ["IF current_database() <> 'io_staging_finanzas' OR current_user <> 'io_staging_finanzas' THEN\n    RAISE EXCEPTION 'IMPERSONATION_STAGING_ONLY' USING ERRCODE='42501';",
    "IF current_database() <> 'railway' OR current_user <> 'postgres' THEN\n    RAISE EXCEPTION 'IMPERSONATION_PRODUCTION_ONLY' USING ERRCODE='42501';"],
  ['impersonation_staging_append_only_guard', 'impersonation_production_append_only_guard'],
]);

function expectedTarget() {
  const body = fs.readFileSync(path.join(repo, sourceRelative), 'utf8');
  const sourceHash = sha256(body);
  if (sourceHash !== REVIEWED_SOURCE_SHA256) throw new Error('SOURCE_HASH_NOT_REVIEWED');
  let out = body;
  for (const [from, to] of REPLACEMENTS) {
    if (!out.includes(from)) throw new Error(`REPLACEMENT_SOURCE_MISSING:${from.slice(0, 60)}`);
    out = out.replaceAll(from, to);
  }
  return header(sourceHash) + out;
}

/** Structural checks: only additive objects, no staging identity left, no DML. */
function assertAdditive(sql) {
  if (/io_staging_finanzas|IMPERSONATION_STAGING_ONLY|impersonation_staging_/i.test(sql)) throw new Error('STAGING_IDENTITY_LEFT');
  // Trigger events (BEFORE INSERT OR UPDATE OR DELETE / BEFORE TRUNCATE ON) are
  // the append-only protection itself, not statements; remove only that form.
  const code = sql.replace(/--[^\n]*/g, '').replace(/BEFORE (?:INSERT OR UPDATE OR DELETE|TRUNCATE) ON /g, 'BEFORE_EVENT ON ');
  if (/\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO|ALTER\s+TABLE|GRANT|REVOKE|CREATE\s+(?:ROLE|USER|DATABASE|EXTENSION)|SECURITY\s+DEFINER)\b/i.test(code)) {
    throw new Error('NON_ADDITIVE_STATEMENT');
  }
  const tables = [...code.matchAll(/CREATE TABLE (\w+)/g)].map(match => match[1]).sort();
  const expected = ['impersonation_control_command_receipts', 'impersonation_event_log', 'impersonation_session_ends', 'impersonation_sessions'];
  if (tables.join(',') !== expected.join(',')) throw new Error('UNEXPECTED_TABLE_SET');
  const functions = [...code.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/g)].map(match => match[1]);
  if (functions.join(',') !== 'impersonation_production_append_only_guard') throw new Error('UNEXPECTED_FUNCTION_SET');
  if ((code.match(/CREATE TRIGGER /g) || []).length !== 8) throw new Error('UNEXPECTED_TRIGGER_COUNT');
  for (const guard of ["current_database() <> 'railway' OR current_user <> 'postgres'", 'IMPERSONATION_PRODUCTION_DDL_GUARD_REQUIRED']) {
    if (!sql.includes(guard)) throw new Error(`GUARD_MISSING:${guard}`);
  }
  if ((sql.match(/current_database\(\) <> 'railway' OR current_user <> 'postgres'/g) || []).length !== 2) throw new Error('IDENTITY_GUARD_COUNT');
}

function manifest(text) {
  return { name: targetName, path: targetRelative, sourceSha256: REVIEWED_SOURCE_SHA256, sha256: sha256(text) };
}

const args = process.argv.slice(2);
if (args.some(arg => !['--write', '--validate', '--print-manifest'].includes(arg))) throw new Error('UNKNOWN_OPTION');
const expected = expectedTarget();
assertAdditive(expected);
const absoluteTarget = path.join(repo, targetRelative);
if (args.includes('--write')) {
  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
  fs.writeFileSync(absoluteTarget, expected);
}
if (args.includes('--print-manifest')) console.log(JSON.stringify(manifest(expected), null, 2));
if (!args.includes('--write') || args.includes('--validate')) {
  const actual = fs.readFileSync(absoluteTarget, 'utf8');
  if (actual !== expected) throw new Error('TARGET_NOT_DERIVED_FROM_REVIEWED_SOURCE');
  assertAdditive(actual);
  console.log(JSON.stringify({ ok: true, target: 'railway/postgres', ...manifest(actual), tables: 4, triggers: 8, noBusinessDml: true }));
}
