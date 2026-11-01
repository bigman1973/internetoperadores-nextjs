import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionProvider } from 'next-auth/react';
import { ActuationProvider } from '@/components/impersonation/ActuationProvider';
import ConciliarWorkspace from './ConciliarWorkspace';

const colors = { VERDE: { count: 1, amountCentimos: 1500 }, AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 } };
const initialData = {
  tabs: (['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'] as const).map((tab) => ({ tab, count: 1, amountCentimos: 1500, colors })),
  rows: [{
    id: 'fixture-row-green-01', movimientoId: 'fixture-movement-01', fecha: '2026-10-31', concepto: 'Cobro banco de prueba', banco: 'Banco de prueba', cuenta: 'Operativa', importeCentimos: 1500, pendienteCentimos: 1500,
    color: 'VERDE', grupo: 'Banco', motivo: 'Coincidencia preparada.', documento: { referencia: 'FIX-001', tercero: 'Cliente de prueba', importeCentimos: 1500, fecha: '2026-10-31', href: null }, propuesta: 'FIX-001', seleccionable: true, diferenciaCentimos: 0, linksMovimiento: [], detail: null, decisionHash: 'a'.repeat(64),
  }],
  total: 1, limit: 20, offset: 0, updatedAt: '2026-11-01T20:00:00.000Z', cuentas: [{ id: 'fixture-account-01', banco: 'Banco de prueba', cuenta: 'Operativa' }], stale: false, staleReason: null, cutoffDate: '2026-01-01',
  emitidasGroups: [{ group: 'CON_PROPUESTA', count: 0, amountCentimos: 0 }, { group: 'PARA_REVISAR', count: 0, amountCentimos: 0 }, { group: 'SIN_PROPUESTA', count: 0, amountCentimos: 0 }], historicSummary: { count: 0, amountCentimos: 0 },
};

const session = {
  user: { id: 'fixture-user-01', email: 'fixture@example.test', name: 'Persona de prueba', userType: 'admin' as const, role: 'ADMIN', roles: ['ADMIN'] },
  expires: '2099-11-01T23:00:00.000Z',
};

test('el Workspace real renderiza una fila verde, el botón normal y controles globales sin identificadores privados', () => {
  const html = renderToStaticMarkup(
    <SessionProvider session={session}>
      <ActuationProvider><ConciliarWorkspace initialData={initialData} /></ActuationProvider>
    </SessionProvider>,
  );
  for (const visibleControl of ['Bandejas de conciliación', 'Buscar', 'Confirmar', 'Cobro banco de prueba', 'fixture-row-green-01']) {
    assert.ok(html.includes(visibleControl), `debe renderizar ${visibleControl}`);
  }
  assert.match(html, /data-testid="conciliar-row"/);
  assert.match(html, /bg-emerald-700/);
  assert.ok(!html.includes('private-actual-id'));
});
