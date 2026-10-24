#!/usr/bin/env node
'use strict';

/*
 * Release-only validator/generator. It never connects to PostgreSQL.
 * --write is intentionally required to materialize the derived SQL files.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repo = path.resolve(__dirname, '..');
const outputDir = path.join(repo, 'prisma/production-releases/20261024_easy_finance');
const manifestDefault = '/home/ubuntu/finanzas-publicacion-facil-20261024/revision/migraciones-fijadas.json';
const reviewSourceHashes = Object.freeze({
  '20261024_customer_cost_allocation': 'da9365de35774e2d1497827a78b92e8b694557eea36059ca2c88b2d96abc1112',
  '20261024_easy_access_profiles': 'ba8f28600b06f8a6327996ca9b6d8a3fe82fa63ed6bcc8dad3f51d0ba95e4f00',
  '20261024_easy_counterparty_steps': 'a010920f06d5793605b10ab7d99a1e5f8c07ebf089d422527d138725504a9bf2',
  '20261024_easy_counterparty_uuid_guard': '60bb94106bb764c0b4cfa205c122402714b4e680b385e48018c684f15ced1e11',
  '20261024_easy_restricted_automation': 'ff3e03bfa12e8bfa72f226a4661d2e6b73bb7dc7a74d0e8e677a19ff09d684ab',
  '20261024_modo_facil_proposal_rules': 'a487b3acc6af12d4dfb6225b60f8a1875c00e3b186f002a98e901024c58f44ae',
  '20261024_zz_easy_counterparty_bulk': 'f3e97df85e2316f4fd47e375db6caefe2574613cb13a50255a52a7a1d00e4d38',
});

const release = Object.freeze([
  ['20261024prodscope_customer_cost_allocation', '20261024_customer_cost_allocation'],
  ['20261024prodscope_easy_access_profiles', '20261024_easy_access_profiles'],
  ['20261024prodscope_easy_counterparty_steps', '20261024_easy_counterparty_steps'],
  ['20261024prodscope_easy_counterparty_uuid_guard', '20261024_easy_counterparty_uuid_guard'],
  ['20261024prodscope_easy_restricted_automation', '20261024_easy_restricted_automation'],
  ['20261024prodscope_modo_facil_proposal_rules', '20261024_modo_facil_proposal_rules'],
  ['20261024prodscope_zz_easy_counterparty_bulk', '20261024_zz_easy_counterparty_bulk'],
]);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePath = source => path.join(repo, 'prisma/migrations', source, 'migration.sql');
const targetPath = name => path.join(outputDir, `${name}.sql`);
const targetRelativePath = name => `prisma/production-releases/20261024_easy_finance/${name}.sql`;
const replaceAll = (text, pairs) => pairs.reduce((out, [from, to]) => out.replaceAll(from, to), text);

function header(source, sourceHash) {
  return `-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.\n-- Fuente staging auditada: ${source}/migration.sql SHA-256 ${sourceHash}.\n-- Preflight de creación obligatorio, habilitado sólo por el aplicador transaccional.\nDO $$\nBEGIN\n  IF current_setting('io.finance_easy_production_ddl', true) = '1' THEN\n    NULL;\n  ELSE\n    RAISE EXCEPTION 'FINANCE_EASY_PRODUCTION_DDL_GUARD_REQUIRED' USING ERRCODE = '55000';\n  END IF;\nEND;\n$$;\n\n`;
}

/* Only environment/identity/policy literals and explanatory comments vary. Tables,
 * columns, indexes, constraints, relations, and all non-environment functions stay
 * byte-for-byte inherited from the source body. */
function adaptSource(source, text) {
  const commonEnvironment = [
    ['io_staging_finanzas', 'railway'],
    ["current_database() IS DISTINCT FROM 'railway'\n     OR current_user IS DISTINCT FROM 'railway'", "current_database() IS DISTINCT FROM 'railway'\n     OR current_user IS DISTINCT FROM 'postgres'"],
    ["current_database()<>'railway' OR current_user<>'railway'", "current_database()<>'railway' OR current_user<>'postgres'"],
    ["current_database() <> 'railway' OR current_user <> 'railway'", "current_database() <> 'railway' OR current_user <> 'postgres'"],
    ['EASY_ACCESS_STAGING_ONLY', 'EASY_ACCESS_PRODUCTION_ONLY'],
    ['EASY_COUNTERPARTY_STAGING_ONLY', 'EASY_COUNTERPARTY_PRODUCTION_ONLY'],
    ['EASY_AUTO_STAGING_ONLY', 'EASY_AUTO_PRODUCTION_ONLY'],
    ['EASY_COUNTERPARTY_BULK_STAGING_ONLY', 'EASY_COUNTERPARTY_BULK_PRODUCTION_ONLY'],
  ];
  switch (source) {
    case '20261024_customer_cost_allocation':
      return replaceAll(text, [
        ...commonEnvironment,
        ['Reparto de costes de operadora entre clientes — staging only.', 'Reparto de costes de operadora entre clientes — production-only.'],
        ['reparto_coste_cliente_assert_staging_role', 'reparto_coste_cliente_assert_production_role'],
        ['repartos_coste_cliente_insert_stage_tr', 'repartos_coste_cliente_insert_production_tr'],
        ['repartos_coste_cliente_contratos_insert_stage_tr', 'repartos_coste_cliente_contratos_insert_production_tr'],
        ['repartos_coste_cliente_lineas_insert_stage_tr', 'repartos_coste_cliente_lineas_insert_production_tr'],
        ['auditorias_reparto_coste_cliente_insert_stage_tr', 'auditorias_reparto_coste_cliente_insert_production_tr'],
        ['sólo admite staging railway', 'sólo admite producción railway/postgres'],
      ]);
    case '20261024_easy_access_profiles':
      return replaceAll(text, commonEnvironment);
    case '20261024_easy_counterparty_steps':
      return replaceAll(text, [
        ...commonEnvironment,
        ['Aplicar exclusivamente en io_staging_finanzas como io_staging_finanzas.', 'Aplicar exclusivamente en railway como postgres.'],
        ['latest staging profile', 'latest production profile'],
      ]);
    case '20261024_easy_counterparty_uuid_guard':
      return replaceAll(text, [
        ...commonEnvironment,
        ['-- Staging exclusivo: corrige la forma UUID 8-4-4-4-12 del recibo P1.', '-- Production-only: corrige la forma UUID 8-4-4-4-12 del recibo P1.'],
      ]);
    case '20261024_easy_restricted_automation':
      return replaceAll(text, [
        ...commonEnvironment,
        ['-- Automatización restringida Modo Fácil — propuesta ADITIVA, staging exclusivo.', '-- Automatización restringida Modo Fácil — release ADITIVO, production-only.'],
        ['assertPrototypeStaging() y transacciones SERIALIZABLE.', 'el guard server-side de producción y transacciones SERIALIZABLE.'],
        ["'MODO_FACIL_AUTO_RESTRINGIDA_STAGING_20261024'", "'MODO_FACIL_AUTO_RESTRINGIDA_PRODUCTION_20261024'"],
        ["\"entorno\" = 'STAGING'", "\"entorno\" = 'PRODUCTION'"],
        ['easy_auto_assert_staging_insert', 'easy_auto_assert_production_insert'],
        ['_staging_tr', '_production_tr'],
        ['-- Staging only is a database backstop. It cannot be replaced by an env flag.', '-- Production identity is a database backstop. It cannot be replaced by a web env flag.'],
      ]);
    case '20261024_modo_facil_proposal_rules':
      return replaceAll(text, [
        ['-- Modo Fácil — migración ADITIVA propuesta para revisión y aplicación EXCLUSIVA\n-- en io_staging_finanzas. NO ejecutar automáticamente, no contiene DML, reset,', '-- Modo Fácil — migración ADITIVA de producción, aplicación EXCLUSIVA\n-- en railway como postgres. NO ejecutar automáticamente, no contiene DML, reset,'],
      ]);
    case '20261024_zz_easy_counterparty_bulk':
      return replaceAll(text, [
        ...commonEnvironment,
        ['-- Lotes de terceros Modo Fácil — propuesta ADITIVA para revisión.', '-- Lotes de terceros Modo Fácil — release ADITIVO de producción.'],
        ['-- NO EJECUTAR AUTOMÁTICAMENTE. Sólo staging io_staging_finanzas/io_staging_finanzas.', '-- NO EJECUTAR AUTOMÁTICAMENTE. Sólo railway/postgres.'],
        ['-- NO EJECUTAR AUTOMÁTICAMENTE. Sólo staging railway/railway.', '-- NO EJECUTAR AUTOMÁTICAMENTE. Sólo railway/postgres.'],
        ['easy_counterparty_bulk_staging_only', 'easy_counterparty_bulk_production_only'],
        ['-- Database staging backstop, independent of the web environment. No P1 bulk\n-- receipt can be created with a production database/user pair.', '-- Database production-identity backstop, independent of the web environment. No P1 bulk\n-- receipt can be created outside the railway/postgres pair.'],
      ]);
    default:
      throw new Error(`UNKNOWN_SOURCE:${source}`);
  }
}

function expectedTarget(source) {
  const body = fs.readFileSync(sourcePath(source), 'utf8');
  const sourceHash = sha256(body);
  if (sourceHash !== reviewSourceHashes[source]) throw new Error(`SOURCE_HASH_NOT_REVIEWED:${source}`);
  return header(source, sourceHash) + adaptSource(source, body);
}

/* Statement splitter that understands quoted identifiers, SQL strings, line/block
 * comments and PostgreSQL dollar-quoted PL/pgSQL bodies. It is used only for the
 * additive AST-like safety assertions below; exact target equality is stricter. */
function splitStatements(sql) {
  const statements = [];
  let start = 0, i = 0, state = 'normal', dollar = null;
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (state === 'normal') {
      if (c === '-' && n === '-') { state = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'single'; i++; continue; }
      if (c === '"') { state = 'double'; i++; continue; }
      if (c === '$') {
        const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) { dollar = match[0]; state = 'dollar'; i += dollar.length; continue; }
      }
      if (c === ';') { statements.push(sql.slice(start, i + 1)); start = i + 1; }
      i++; continue;
    }
    if (state === 'line') { if (c === '\n') state = 'normal'; i++; continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'normal'; i += 2; } else i++; continue; }
    if (state === 'single') { if (c === "'" && n === "'") { i += 2; continue; } if (c === "'") state = 'normal'; i++; continue; }
    if (state === 'double') { if (c === '"' && n === '"') { i += 2; continue; } if (c === '"') state = 'normal'; i++; continue; }
    if (state === 'dollar') { if (sql.startsWith(dollar, i)) { i += dollar.length; state = 'normal'; dollar = null; } else i++; }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start));
  return statements;
}

function uncomment(statement) {
  return statement.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim();
}
function unquoteIdentifier(value) { return value.replaceAll('"', '').toLowerCase(); }

function additiveAstAssertions(name, sql) {
  const createdTables = new Set();
  const alterTables = [];
  for (const raw of splitStatements(sql)) {
    const statement = uncomment(raw);
    if (!statement) continue;
    const upper = statement.toUpperCase();
    if (/^(INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE)\b/.test(upper)) throw new Error(`BUSINESS_DML_OR_DESTRUCTIVE_ROOT:${name}`);
    if (!/^(CREATE|ALTER|DO)\b/.test(upper)) throw new Error(`UNEXPECTED_ROOT_STATEMENT:${name}`);
    const createTable = statement.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+")|(?:[A-Za-z_][A-Za-z0-9_]*))/i);
    if (createTable) createdTables.add(unquoteIdentifier(createTable[1]));
    const alterTable = statement.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?((?:"[^"]+")|(?:[A-Za-z_][A-Za-z0-9_]*))/i);
    if (alterTable) alterTables.push(unquoteIdentifier(alterTable[1]));
  }
  for (const table of alterTables) if (!createdTables.has(table)) throw new Error(`ALTER_NOT_NEW_TABLE:${name}:${table}`);
  if (/\bSECURITY\s+DEFINER\b/i.test(sql)) throw new Error(`SECURITY_DEFINER_FORBIDDEN:${name}`);
  if (/\b(?:GRANT|REVOKE|CREATE\s+ROLE|ALTER\s+ROLE|SET\s+ROLE)\b/i.test(sql)) throw new Error(`ROLE_OR_PRIVILEGE_CHANGE_FORBIDDEN:${name}`);
  if (!sql.includes("current_setting('io.finance_easy_production_ddl', true) = '1'")) throw new Error(`DDL_PREFLIGHT_MISSING:${name}`);
  if (sql.includes('io_staging_finanzas')) throw new Error(`STAGING_IDENTITY_RETAINED:${name}`);
}

function expectedManifest() {
  return release.map(([name, source]) => {
    const text = expectedTarget(source);
    return { name, sourceSha256: reviewSourceHashes[source], sha256: sha256(text), path: targetRelativePath(name) };
  });
}

function verifyManifest(manifestPath) {
  const actual = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = expectedManifest();
  if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error('MANIFEST_NONEMPTY_SEVEN_REQUIRED');
  for (let i = 0; i < expected.length; i++) {
    if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) throw new Error(`MANIFEST_NOT_EXACT:${i}`);
  }
  return expected;
}

function writeRelease() {
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  for (const [name, source] of release) {
    fs.writeFileSync(targetPath(name), expectedTarget(source), { mode: 0o600 });
  }
}

function validate(manifestPath) {
  const manifest = verifyManifest(manifestPath);
  let replacementFunctions = 0;
  for (const [name, source] of release) {
    const target = targetPath(name);
    if (!fs.existsSync(target)) throw new Error(`TARGET_MISSING:${name}`);
    const actual = fs.readFileSync(target, 'utf8');
    const expected = expectedTarget(source);
    if (actual !== expected) throw new Error(`TARGET_NOT_DETERMINISTIC_DERIVATION:${name}`);
    if (sha256(actual) !== manifest.find(x => x.name === name).sha256) throw new Error(`TARGET_HASH_MISMATCH:${name}`);
    additiveAstAssertions(name, actual);
    const matches = actual.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([A-Za-z_][A-Za-z0-9_]*)/ig) || [];
    replacementFunctions += matches.length;
    if (matches.length && (name !== '20261024prodscope_easy_counterparty_uuid_guard' || !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+easy_counterparty_guard_append_only\s*\(/i.test(actual))) {
      throw new Error(`UNEXPECTED_FUNCTION_REPLACEMENT:${name}`);
    }
  }
  if (replacementFunctions !== 1) throw new Error('UUID_REPLACEMENT_MUST_BE_UNIQUE');
  const p1 = fs.readFileSync(targetPath('20261024prodscope_easy_counterparty_steps'), 'utf8');
  if (!/CREATE\s+FUNCTION\s+easy_counterparty_guard_append_only\s*\(/i.test(p1)) throw new Error('UUID_REPLACEMENT_WITHOUT_SAME_BATCH_NEW_FUNCTION');
  const automation = fs.readFileSync(targetPath('20261024prodscope_easy_restricted_automation'), 'utf8');
  if (!automation.includes("'MODO_FACIL_AUTO_RESTRINGIDA_PRODUCTION_20261024'") || !automation.includes("\"entorno\" = 'PRODUCTION'")) throw new Error('PRODUCTION_POLICY_LITERALS_MISSING');
  console.log(JSON.stringify({ ok: true, releaseFiles: manifest.length, manifest: manifestPath, target: 'railway/postgres', tracker: 'finance_release_migrations', noBusinessDml: true, securityDefiner: false }, null, 2));
}

const args = process.argv.slice(2);
const manifestArg = args.indexOf('--manifest');
const manifestPath = manifestArg === -1 ? manifestDefault : args[manifestArg + 1];
if (manifestArg !== -1 && !manifestPath) throw new Error('MANIFEST_PATH_REQUIRED');
if (args.includes('--write')) writeRelease();
if (args.includes('--print-manifest')) console.log(JSON.stringify(expectedManifest(), null, 2));
if (!args.includes('--write') || args.includes('--validate')) validate(manifestPath);
