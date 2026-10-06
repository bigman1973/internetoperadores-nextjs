import assert from 'node:assert/strict';
import { checkIncorporationDate } from '../lib/salary-incorporation-date';

const hire = new Date('2025-03-10T00:00:00.000Z');
assert.equal(checkIncorporationDate(hire, new Date(hire), '2025-03-10'), null);
assert.equal(checkIncorporationDate(hire, new Date(hire), '2025-01-01'), 'date-mismatch');
assert.equal(checkIncorporationDate(hire, new Date(hire), '2025-04-01'), 'date-mismatch');
assert.equal(checkIncorporationDate(hire, new Date(hire), 'no-es-fecha'), 'date-mismatch');
assert.equal(checkIncorporationDate(hire, null, '2025-03-10'), 'hire-unverified');
assert.equal(checkIncorporationDate(hire, new Date('2025-03-11T00:00:00.000Z'), '2025-03-10'), 'hire-unverified');
console.log('Fechas de incorporación: alta de nómina obligatoria y discrepancias bloqueadas.');
