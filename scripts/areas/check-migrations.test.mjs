import assert from 'node:assert/strict';
import test from 'node:test';
import { additiveSqlCheck, migrationNameValid } from './check-migrations.mjs';

test('las migraciones nuevas exigen prefijo areaN', () => {
  assert.equal(migrationNameValid('20261030_area3_g7_readonly_guard'), true);
  assert.equal(migrationNameValid('20261030_g7_readonly_guard'), false);
  assert.equal(migrationNameValid('20261030_area10_fuera'), false);
});

test('el protector CREATE TRIGGER BEFORE TRUNCATE es aditivo y no es un TRUNCATE ejecutado', () => {
  const protector = `
    CREATE FUNCTION area3_proteger_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'protegido'; END $$;
    CREATE TRIGGER area3_protector BEFORE TRUNCATE ON area3_auditoria
      FOR EACH STATEMENT EXECUTE FUNCTION area3_proteger_truncate();
  `;
  assert.equal(additiveSqlCheck(protector), true);
});

test('TRUNCATE TABLE, TRUNCATE abreviado y DROP reales siguen bloqueados', () => {
  for (const sql of ['TRUNCATE TABLE area3_auditoria;', 'TRUNCATE area3_auditoria;', 'DROP TABLE area3_auditoria;', 'DROP VIEW area3_resumen;', 'DROP TRIGGER area3_protector ON area3_auditoria;']) {
    assert.equal(additiveSqlCheck(sql), false, sql);
  }
});
