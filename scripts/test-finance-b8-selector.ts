import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centrosActivos,
  parseCentrosCosteCatalogo,
  problemaSeleccionCentro,
  type CatalogoCentrosEstado,
} from '../components/finanzas/reconciliation-v2/CenterChoiceSelector';

const CENTRO_A = '11111111-1111-4111-8111-111111111111';
const CENTRO_B = '22222222-2222-4222-8222-222222222222';

function catalogo(items: unknown[]): unknown {
  return { recurso: 'centros', items };
}

test('parser del catálogo acepta el contrato GET centros y conserva sólo sus elementos reales', () => {
  const parsed = parseCentrosCosteCatalogo(catalogo([
    { id: CENTRO_A, codigo: 'OPERACIONES', nombre: 'Operaciones', activo: true, version: 3 },
    { id: CENTRO_B, codigo: 'HISTORICO', nombre: 'Histórico', activo: false, version: 2 },
  ]));
  if (parsed.ok === false) throw new Error(parsed.error);
  assert.equal(parsed.ok, true);
  assert.deepEqual(centrosActivos(parsed.items).map((item) => item.id), [CENTRO_A]);
});

test('un error de catálogo no fabrica la opción cero y una selección ya elegida queda bloqueada', () => {
  const invalid = parseCentrosCosteCatalogo({ recurso: 'centros', items: [{ id: 'no-uuid', codigo: 'X', nombre: 'X', activo: true }] });
  assert.equal(invalid.ok, false);
  const errorCatalog: CatalogoCentrosEstado = { kind: 'error', items: [], error: 'fallo de lectura' };
  assert.deepEqual(centrosActivos(errorCatalog.items), []);
  assert.match(problemaSeleccionCentro(CENTRO_A, errorCatalog) || '', /no se puede verificar/i);
  assert.equal(problemaSeleccionCentro(undefined, errorCatalog), null);
});

test('un centro no disponible o inactivo no se borra silenciosamente y requiere limpieza', () => {
  const unavailable: CatalogoCentrosEstado = { kind: 'ready', items: [], error: null };
  assert.match(problemaSeleccionCentro(CENTRO_A, unavailable) || '', /ya no está disponible/i);
  const inactive: CatalogoCentrosEstado = {
    kind: 'ready',
    items: [{ id: CENTRO_A, codigo: 'CERRADO', nombre: 'Centro cerrado', activo: false }],
    error: null,
  };
  assert.match(problemaSeleccionCentro(CENTRO_A, inactive) || '', /inactivo/i);
  assert.equal(problemaSeleccionCentro(null, inactive), null);
});
