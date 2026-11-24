#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAutomationEnabled, madridDate } from '../lib/rentabilidad/automation';
import { shiftMonth } from '../lib/rentabilidad/engine';
const env={DATABASE_URL:'postgresql://io_staging_finanzas:unit_test_only@localhost/io_staging_finanzas',FINANCE_STAGING_SANDBOX:'1',VERCEL_ENV:'preview',RENTABILIDAD_ENABLED:'1'};
test('automatización solo con interruptor y base aislada de staging',()=>assert.doesNotThrow(()=>assertAutomationEnabled(env)));
test('interruptor apagado bloquea antes de cualquier proveedor',()=>assert.throws(()=>assertAutomationEnabled({...env,RENTABILIDAD_ENABLED:'0'}),/RENTABILIDAD_DISABLED/));
test('producción denegada aunque el interruptor esté activo',()=>assert.throws(()=>assertAutomationEnabled({...env,VERCEL_ENV:'production'}),/RENTABILIDAD_STAGING_REQUIRED/));
test('base o usuario incorrectos se deniegan',()=>assert.throws(()=>assertAutomationEnabled({...env,DATABASE_URL:'postgresql://other:unit_test_only@localhost/other'}),/RENTABILIDAD_STAGING_REQUIRED/));
test('entorno de solo lectura impide ejecuciones derivadas',()=>assert.throws(()=>assertAutomationEnabled({...env,IO_PRODUCTION_READ_ONLY:'1'}),/RENTABILIDAD_STAGING_REQUIRED/));
test('día 5 se determina en Madrid, no UTC, en invierno',()=>assert.deepEqual(madridDate(new Date('2026-11-04T23:30:00Z')),{month:'2026-11',day:5}));
test('día 5 se determina en Madrid con horario de verano',()=>assert.deepEqual(madridDate(new Date('2026-07-04T22:30:00Z')),{month:'2026-07',day:5}));
test('enero cierra diciembre del ejercicio anterior',()=>assert.equal(shiftMonth(madridDate(new Date('2027-01-05T03:00:00Z')).month,-1),'2026-12'));
