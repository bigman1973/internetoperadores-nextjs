import assert from 'node:assert/strict'
import { test } from 'node:test'
import { easyOnlyRequestAllowed } from '../lib/finanzas/easy-access-core'
import { impersonationRequestAllowed, impersonationRouteDecision } from '../lib/impersonation-policy'

function inStaging<T>(fn: () => T): T {
  const old = process.env.FINANCE_STAGING_SANDBOX
  process.env.FINANCE_STAGING_SANDBOX = '1'
  try { return fn() } finally {
    if (old === undefined) delete process.env.FINANCE_STAGING_SANDBOX
    else process.env.FINANCE_STAGING_SANDBOX = old
  }
}

test('Conciliar es una entrada acotada de staging, no una ampliación de producción', () => {
  inStaging(() => {
    assert(easyOnlyRequestAllowed('/admin/finanzas/conciliar', 'GET'))
    assert(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar', 'GET'))
    assert(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar', 'POST'))
    assert(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/historial', 'GET'))
    assert(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/archivo/fixture_source', 'GET'))
    for (const path of ['/admin/usuarios', '/admin/empleados/nominas', '/api/admin/nominas/download/fixture_source', '/api/admin/finanzas/conciliar/rebuild', '/api/admin/finanzas/conciliar/archivo/fixture_source/otro', '/api/admin/finanzas/conciliacion-v2', '/api/admin/finanzas/modo-facil/automaticas']) {
      assert.equal(easyOnlyRequestAllowed(path, 'GET'), false, path)
    }
    for (const method of ['DELETE', 'PUT', 'PATCH']) assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar', method), false)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/archivo/fixture_source', 'POST'), false)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/historial', 'POST'), false)
  })
  const old = process.env.FINANCE_STAGING_SANDBOX
  process.env.FINANCE_STAGING_SANDBOX = '0'
  try {
    assert.equal(easyOnlyRequestAllowed('/admin/finanzas/conciliar', 'GET'), false)
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar', 'POST'), false)
    assert(easyOnlyRequestAllowed('/admin/finanzas/modo-facil', 'GET'))
  } finally {
    if (old === undefined) delete process.env.FINANCE_STAGING_SANDBOX
    else process.env.FINANCE_STAGING_SANDBOX = old
  }
})

test('actuar como sólo autoriza las decisiones manuales de Conciliar con el permiso del destino', () => {
  assert(impersonationRequestAllowed('/admin/finanzas/conciliar', 'GET'))
  for (const action of ['confirmar', 'deshacer', 'pedir']) {
    const route = impersonationRouteDecision('/api/admin/finanzas/conciliar', 'POST', new URLSearchParams(), 10, action)
    assert(route.allowed)
    assert.equal(route.targetOnly, true)
    assert.deepEqual(route.permission?.areas, ['admin.finanzas.conciliacion'])
    assert.equal(route.permission?.required, 'escritura')
  }
  for (const action of ['rebuild', 'sincronizar', 'enviar', 'activar_auto', '__multipart__', null]) {
    assert.equal(impersonationRequestAllowed('/api/admin/finanzas/conciliar', 'POST', new URLSearchParams(), 10, action), false)
  }
  assert.equal(impersonationRequestAllowed('/api/admin/finanzas/conciliar', 'POST', new URLSearchParams('actorId=1'), 10, 'confirmar'), false)
  assert.equal(impersonationRequestAllowed('/api/admin/nominas/download/fixture_source', 'GET'), false)
  assert.equal(impersonationRequestAllowed('/api/admin/finanzas/conciliar/archivo/fixture_source', 'POST'), false)
  assert(impersonationRequestAllowed('/api/admin/finanzas/conciliar/archivo/fixture_source', 'GET'))
})

test('intereses: sólo relación manual en staging y mismos permisos efectivos', () => {
  const old=process.env.FINANCE_STAGING_SANDBOX;
  try {
    process.env.FINANCE_STAGING_SANDBOX='1';
    assert(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/intereses','GET'));
    assert(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/intereses','POST'));
    for(const action of ['vincular_factura_interes','desvincular_factura_interes']) assert(impersonationRequestAllowed('/api/admin/finanzas/conciliar/intereses','POST',new URLSearchParams(),10,action));
    assert.equal(impersonationRequestAllowed('/api/admin/finanzas/conciliar/intereses','POST',new URLSearchParams(),10,'crear_factura'),false);
    process.env.FINANCE_STAGING_SANDBOX='0';
    assert.equal(easyOnlyRequestAllowed('/api/admin/finanzas/conciliar/intereses','GET'),false);
  } finally { if(old===undefined)delete process.env.FINANCE_STAGING_SANDBOX;else process.env.FINANCE_STAGING_SANDBOX=old; }
});
