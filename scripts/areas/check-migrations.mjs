#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT } from './run-batteries.mjs';

export function migrationNameValid(name) { return /^\d{8}(?:_\d{6})?_area[1-9]_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name); }
export function additiveSqlCheck(sql) {
  const text = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  // La única excepción son los dos triggers añadidos para hacer append-only la
  // bitácora de Área 4. Se valida su forma completa antes de retirarlos del
  // análisis: un trigger distinto, una tabla distinta o una función distinta
  // sigue siendo SQL no aditivo.
  const allowedAppendOnlyTriggers = /CREATE\s+TRIGGER\s+"area4_auditoria_permisos_no_(?:update_delete|truncate)"\s+BEFORE\s+(?:UPDATE\s+OR\s+DELETE|TRUNCATE)\s+ON\s+"auditoria_permisos_area4"\s+FOR\s+EACH\s+(?:ROW|STATEMENT)\s+EXECUTE\s+FUNCTION\s+"area4_auditoria_permisos_bloquear_mutacion"\(\);/gi;
  const checkedText = text.replace(allowedAppendOnlyTriggers, '');
  const destructive = /\b(DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|SCHEMA|TYPE|TRIGGER|FUNCTION)|TRUNCATE|DELETE\s+FROM|UPDATE\s+[\w".]|RENAME\s+(TO|COLUMN)|ALTER\s+COLUMN\s+\w+\s+TYPE)\b/i;
  return !destructive.test(checkedText);
}
export function main() {
  const baseline = JSON.parse(readFileSync(join(ROOT, 'config/migration-baseline.json'), 'utf8'));
  const dir = join(ROOT, 'prisma/migrations'), results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).filter(x => x.isDirectory())) {
    const file = join(dir, entry.name, 'migration.sql');
    if (!existsSync(file)) { results.push({ name: entry.name, ok: false, reason: 'MIGRATION_SQL_REQUIRED' }); continue; }
    const sql = readFileSync(file, 'utf8'), hash = createHash('sha256').update(sql).digest('hex');
    if (baseline.migrations[entry.name]) results.push({ name: entry.name, ok: baseline.migrations[entry.name].includes(hash), reason: 'LEGACY_MIGRATION_IMMUTABLE' });
    else results.push({ name: entry.name, ok: migrationNameValid(entry.name) && additiveSqlCheck(sql), reason: 'NEW_MIGRATION_REQUIRES_AREA_PREFIX_AND_ADDITIVE_SQL' });
  }
  const failures = results.filter(x => !x.ok);
  console.log(JSON.stringify({ ok: !failures.length, failures, checked: results.length, sqlApplied: false, notice: 'Comprobación lexical; requiere además revisión y ensayo SQL reversible.' }));
  return failures.length ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
