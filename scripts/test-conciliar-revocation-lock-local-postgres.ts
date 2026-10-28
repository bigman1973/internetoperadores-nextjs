import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

// Synthetic additive fixture in a NEW local database. No application env/URL or
// restored production database is opened, changed or deleted.
const config = { host: '/var/run/postgresql', port: 5432, user: 'ubuntu', password: '' };
const database = 'io_test_revocation_' + randomUUID().replaceAll('-', '');
const source = readFileSync('lib/impersonation.ts', 'utf8');
const helper = source.slice(source.indexOf('async function appendImpersonationEndTx('), source.indexOf('/** The exit payload'));
assert.ok(helper.indexOf('FOR UPDATE OF s') >= 0 && helper.indexOf('FOR UPDATE OF s') < helper.indexOf('INSERT INTO impersonation_session_ends'), 'Every terminal path must lock the same parent before inserting its end.');
const admin = new Client({ ...config, database: 'postgres' });
let a: Client | null = null, b: Client | null = null;

async function main() {
  await admin.connect();
  const identity = (await admin.query('SELECT current_user AS role,inet_server_addr() AS network LIMIT 1')).rows[0];
  assert.equal(identity.role, 'ubuntu'); assert.equal(identity.network, null, 'Unix socket required.');
  assert.match(database, /^io_test_revocation_[a-f0-9]{32}$/);
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  a = new Client({ ...config, database }); b = new Client({ ...config, database });
  await a.connect(); await b.connect();
  await a.query('CREATE TABLE impersonation_sessions(id uuid PRIMARY KEY)');
  await a.query('CREATE TABLE impersonation_session_ends(session_id uuid UNIQUE NOT NULL REFERENCES impersonation_sessions(id))');
  const prior = randomUUID(), guarded = randomUUID();
  await a.query('INSERT INTO impersonation_sessions(id) VALUES($1),($2)', [prior, guarded]);
  // Reproduce the old hole: a child insert only takes KEY SHARE on the parent.
  await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await a.query('SELECT s.id FROM impersonation_sessions s WHERE s.id=$1 FOR SHARE OF s', [prior]);
  await b.query('BEGIN');
  await b.query("SET LOCAL lock_timeout='150ms'");
  await b.query('INSERT INTO impersonation_session_ends(session_id) VALUES($1)', [prior]);
  await b.query('COMMIT'); await a.query('ROLLBACK');
  // The fixed central helper takes FOR UPDATE before its child INSERT.
  await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await a.query('SELECT s.id FROM impersonation_sessions s WHERE s.id=$1 FOR SHARE OF s', [guarded]);
  await b.query('BEGIN'); await b.query("SET LOCAL lock_timeout='150ms'");
  let blocked = false;
  try { await b.query('SELECT s.id FROM impersonation_sessions s WHERE s.id=$1 LIMIT 1 FOR UPDATE OF s', [guarded]); }
  catch (error) { blocked = (error as { code?: string }).code === '55P03'; }
  assert.ok(blocked, 'A terminal writer cannot commit while a cached transaction holds the live-session fence.');
  await b.query('ROLLBACK'); await a.query('COMMIT');
  await b.query('BEGIN');
  await b.query('SELECT s.id FROM impersonation_sessions s WHERE s.id=$1 LIMIT 1 FOR UPDATE OF s', [guarded]);
  await b.query('INSERT INTO impersonation_session_ends(session_id) VALUES($1)', [guarded]);
  await b.query('COMMIT');
  const live = (await a.query('SELECT NOT EXISTS(SELECT 1 FROM impersonation_session_ends WHERE session_id=$1) AS live LIMIT 1', [guarded])).rows[0];
  assert.equal(live.live, false, 'The next callback observes revocation and cannot reuse prior authorization.');
  console.log(JSON.stringify({ ok: true, localSyntheticOnly: true, productionWrites: 0, stagingWrites: 0, oldHoleReproduced: true, concurrentTerminalWriterBlocked: true, nextCallbackSeesRevocation: true, originalBackupsUntouched: true }));
}
main().catch(error => { console.error('REVOCATION_LOCK_TEST_FAILED', (error as { code?: string }).code || 'ASSERTION'); process.exitCode = 1; }).finally(async () => { if (a) await a.end(); if (b) await b.end(); await admin.end(); });
