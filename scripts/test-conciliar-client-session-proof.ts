/* Pruebas puras del proof de sesión cliente; no abre red, BD, build ni TSC. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conciliarSessionProofMatchesActiveActuation,
  directConciliarSessionExpiry,
  isCurrentConciliarSessionProof,
  isSuccessfulConciliarSessionProofResponse,
  normalizeConciliarClientSessionProof,
  readConciliarSessionIdentity,
} from '../components/finanzas/conciliar/conciliar-client-session-proof';

const NOW = Date.parse('2026-11-02T00:00:00.000Z');
const FUTURE = '2026-11-02T01:00:00.000Z';
const ACTUATION_FUTURE = '2026-11-02T00:30:00.000Z';

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: '42',
      email: 'effective@example.test',
      name: 'Actor efectivo',
      userType: 'admin',
      role: 'CONTABILIDAD',
      roles: ['FINANZAS', 'CONTABILIDAD'],
    },
    ...overrides,
  };
}

function acting(overrides: Record<string, unknown> = {}) {
  return session({
    impersonation: {
      sessionId: 'acting-session-1',
      actorId: '7',
      actorName: 'Actor real',
      targetId: '42',
      targetName: 'Actor efectivo',
      expiresAt: ACTUATION_FUTURE,
    },
    ...overrides,
  });
}

test('SSR autenticado sin expires permanece sin capacidad hasta que un GET auténtico igual aporta la prueba', () => {
  const initial = session();
  assert.equal(directConciliarSessionExpiry(initial, NOW), null, 'RSC no fabrica una caducidad');
  const proof = normalizeConciliarClientSessionProof(initial, session({ expires: FUTURE }), NOW);
  assert.deepEqual(proof, { ok: true, expiresAt: Date.parse(FUTURE) });
  assert.ok(proof.ok && proof.expiresAt > NOW, 'sólo la prueba GET permite lecturas posteriores');
});

test('un GET sin expires nunca acredita una sesión infinita ni fabrica fecha', () => {
  const proof = normalizeConciliarClientSessionProof(session(), session(), NOW);
  assert.deepEqual(proof, { ok: false, reason: 'malformed' });
  assert.equal(directConciliarSessionExpiry(session({ expires: 'Infinity' }), NOW), null);
});

test('no adopta el proof de otro usuario ni el de roles diferentes', () => {
  const otherUser = session({ expires: FUTURE, user: { ...session().user as Record<string, unknown>, id: '43' } });
  const changedRoles = session({ expires: FUTURE, user: { ...session().user as Record<string, unknown>, roles: ['SUPER_ADMIN'] } });
  assert.deepEqual(normalizeConciliarClientSessionProof(session(), otherUser, NOW), { ok: false, reason: 'identity-changed' });
  assert.deepEqual(normalizeConciliarClientSessionProof(session(), changedRoles, NOW), { ok: false, reason: 'identity-changed' });
});

test('conserva actor efectivo y rechaza SID, actor, destino o caducidad de actuación distintos', () => {
  const context = acting();
  const identity = readConciliarSessionIdentity(context);
  assert.equal(identity?.userId, '42');
  assert.equal(identity?.impersonation?.actorId, '7');
  const variants = [
    acting({ expires: FUTURE, impersonation: { ...acting().impersonation as Record<string, unknown>, sessionId: 'acting-session-2' } }),
    acting({ expires: FUTURE, impersonation: { ...acting().impersonation as Record<string, unknown>, actorId: '8' } }),
    acting({ expires: FUTURE, impersonation: { ...acting().impersonation as Record<string, unknown>, targetId: '43' } }),
    acting({ expires: FUTURE, impersonation: { ...acting().impersonation as Record<string, unknown>, expiresAt: '2026-11-02T00:31:00.000Z' } }),
  ];
  for (const candidate of variants) {
    const proof = normalizeConciliarClientSessionProof(context, candidate, NOW);
    assert.equal(proof.ok, false, 'ningún SID, actor, destino o vencimiento distinto habilita lectura');
  }
});

test('la forma real de NextAuth admite IDs numéricos de actuación y exige la misma actuación viva', () => {
  const raw = { ...acting().impersonation as Record<string, unknown>, actorId: 7, targetId: 42 };
  const context = acting({ impersonation: raw });
  const proof = normalizeConciliarClientSessionProof(context, acting({ expires: FUTURE, impersonation: raw }), NOW);
  assert.deepEqual(proof, { ok: true, expiresAt: Date.parse(FUTURE) });
  const identity = readConciliarSessionIdentity(context);
  assert.equal(identity?.impersonation?.actorId, '7');
  assert.equal(conciliarSessionProofMatchesActiveActuation(identity, raw), true);
  assert.equal(conciliarSessionProofMatchesActiveActuation(identity, { ...raw, targetId: 43 }), false);
  for (const actorId of [0, -1, 7.1, Number.MAX_SAFE_INTEGER + 1, '07', '7.0', '7e0']) {
    assert.equal(readConciliarSessionIdentity(acting({ impersonation: { ...raw, actorId } })), null);
  }
});

test('caducidades expiradas o malformadas no habilitan la lectura y una actuación expirada también falla cerrada', () => {
  assert.deepEqual(normalizeConciliarClientSessionProof(session(), session({ expires: '2026-11-01T23:59:59.000Z' }), NOW), { ok: false, reason: 'malformed' });
  assert.deepEqual(normalizeConciliarClientSessionProof(session(), session({ expires: 'fecha-invalida' }), NOW), { ok: false, reason: 'malformed' });
  assert.deepEqual(normalizeConciliarClientSessionProof(acting({ impersonation: { ...acting().impersonation as Record<string, unknown>, expiresAt: '2026-11-01T23:59:59.000Z' } }), acting({ expires: FUTURE, impersonation: { ...acting().impersonation as Record<string, unknown>, expiresAt: '2026-11-01T23:59:59.000Z' } }), NOW), { ok: false, reason: 'expired' });
});

test('401/403 no son un proof y una respuesta tardía abortada o de otra identidad se descarta', () => {
  assert.equal(isSuccessfulConciliarSessionProofResponse(200), true);
  assert.equal(isSuccessfulConciliarSessionProofResponse(401), false);
  assert.equal(isSuccessfulConciliarSessionProofResponse(403), false);
  const controller = new AbortController();
  assert.equal(isCurrentConciliarSessionProof({ signal: controller.signal, requestKey: 'identity-a', currentKey: 'identity-a' }), true);
  controller.abort();
  assert.equal(isCurrentConciliarSessionProof({ signal: controller.signal, requestKey: 'identity-a', currentKey: 'identity-a' }), false);
  assert.equal(isCurrentConciliarSessionProof({ requestKey: 'identity-a', currentKey: 'identity-b' }), false);
});

console.log('OK: prueba de sesión cliente fail-closed, sin red ni BD.');
