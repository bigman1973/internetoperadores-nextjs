import assert from 'node:assert/strict';
import { parseParaPedirRead, type ParaPedirMovimiento } from '../lib/finanzas/para-pedir-contract';
import { paraPedirStatusLabel } from '../lib/finanzas/para-pedir-presentation';
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth';

const row = (estadoPedido: ParaPedirMovimiento['estadoPedido'], pedido: ParaPedirMovimiento['pedido']): Pick<ParaPedirMovimiento, 'estadoPedido' | 'pedido'> => ({ estadoPedido, pedido });

assert.equal(paraPedirStatusLabel(row('SIN_PEDIR', null)), 'Falta pedirla');
assert.equal(paraPedirStatusLabel(row('PEDIDO', { dia: '2026-10-30', actorNombre: 'Lucía', diasTranscurridos: 0 })), 'Pedida el 30/10 (por Lucía)');
assert.equal(paraPedirStatusLabel(row('PEDIDO', { dia: '2026-10-30', actorNombre: null, diasTranscurridos: 0 })), 'Pedida el 30/10');
assert.equal(paraPedirStatusLabel(row('PEDIDO_SIN_AUDITORIA', null)), 'Pedido sin auditoría verificable');
assert.equal(paraPedirStatusLabel(row('RECIBIDO', null)), 'Documento recibido · revisar y confirmar');

const parsed = parseParaPedirRead({
  stagingOnly: true,
  automaticas: false,
  accionExterna: 'NINGUNA',
  criterio: 'foto persistida',
  filtro: { estado: 'TODOS', q: null, tercero: null },
  total: 4,
  limit: 20,
  offset: 0,
  totalPagina: 0,
  resumen: { movimientos: 4, pendienteCentimos: 0 },
  proyeccion: { actualizadaEn: '2026-10-30T10:00:00.000Z', version: 1, pendienteActualizacion: false },
  agrupaciones: [{
    tercero: 'Tercero de prueba', movimientos: 4, pendienteCentimos: 0,
    faltanPedir: 1, pedidos: 1, pedidosSinAuditoria: 1, recibidos: 1, pedidosMas15Dias: 0,
  }],
  movimientos: [],
});
assert.deepEqual(parsed.agrupaciones[0], {
  tercero: 'Tercero de prueba', movimientos: 4, pendienteCentimos: 0,
  faltanPedir: 1, pedidos: 1, pedidosSinAuditoria: 1, recibidos: 1, pedidosMas15Dias: 0,
});
assert.throws(() => parseParaPedirRead({
  ...parsed,
  agrupaciones: [{ ...parsed.agrupaciones[0], recibidos: undefined }],
}), /recibidos verificable/, 'Un contador ausente no se convierte en cero.');

type PermissionDb = Parameters<typeof requireB4ActorAccess>[2];
function database(permission: { lectura: boolean; escritura: boolean }): NonNullable<PermissionDb> {
  return {
    usuarioAdmin: { findUnique: async () => ({ id: 7, activo: true, rol: 'USUARIO', roles: [] }) },
    permisoArea: { findUnique: async () => ({ activo: true }) },
    permisoUsuario: {
      findMany: async () => [permission],
      count: async () => 1,
    },
  } as unknown as NonNullable<PermissionDb>;
}

async function main() {
  const lectura = await requireB4ActorAccess(7, 'lectura', database({ lectura: true, escritura: false }));
  assert.equal(lectura.ok, true, 'La lista conserva el permiso B4 de lectura.');
  const escritura = await requireB4ActorAccess(7, 'escritura', database({ lectura: true, escritura: false }));
  assert.equal(escritura.ok, false, 'Marcar como pedida sigue requiriendo el permiso B4 de escritura vivo.');

  console.log(JSON.stringify({ test: 'para-pedir-labels-counters-permissions', assertions: 9, databaseQueries: 0, networkCalls: 0 }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
