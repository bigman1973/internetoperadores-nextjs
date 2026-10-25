import assert from 'node:assert/strict';
import { serializeUsuariosInitiales } from '../components/admin/usuariosInitialData';

const rows = [
  {
    id: 7,
    email: 'synthetic@example.invalid',
    nombre: 'Usuario sintético',
    rol: 'VISOR',
    roles: ['VISOR'],
    activo: true,
    ultimoAcceso: new Date('2026-01-02T03:04:05.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    perfilAsignado: null,
  },
] as const;

const result = serializeUsuariosInitiales(rows);

assert.deepEqual(result, [{
  id: 7,
  email: 'synthetic@example.invalid',
  nombre: 'Usuario sintético',
  rol: 'VISOR',
  roles: ['VISOR'],
  activo: true,
  ultimoAcceso: '2026-01-02T03:04:05.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  perfilAsignado: null,
}]);
assert.notStrictEqual(result[0].roles, rows[0].roles);
assert.doesNotThrow(() => JSON.stringify(result));

console.log('usuariosInitialData synthetic test: ok');
