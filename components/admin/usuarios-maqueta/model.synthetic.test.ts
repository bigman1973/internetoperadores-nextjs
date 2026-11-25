import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APPROVED_ROLES, USERS_SECTIONS } from '@/lib/area4/approved-roles'
import type { UsersPerson, UsersSnapshot } from '@/lib/area4/users-contract'
import { cleanExtras, currentRoleKey, effectivePermissions, expandedPermissions, initialDrafts, localRows, normalizeActions, safeDrafts } from './model'

function fixture(): UsersSnapshot {
  const users: UsersPerson[] = [
    { id: 101, name: 'Persona sintética', email: 'persona@example.test', active: true, lastAccess: null, currentRoleLabel: 'Gerente + RRHH', role: 'empleado', extras: { finanzas: 'V' }, current: { finanzas: 'VECX' }, next: { finanzas: 'V' }, protected: false },
    { id: 102, name: 'Cuenta fuera del lote', email: 'fuera@example.test', active: true, lastAccess: null, currentRoleLabel: 'Comercial', role: 'empleado', extras: {}, current: { finanzas: 'VX' }, next: { finanzas: 'VX' }, protected: false },
    { id: 303, name: 'Propietario sintético', email: 'owner@example.test', active: true, lastAccess: null, currentRoleLabel: 'Superadmin', role: 'superadmin', extras: {}, current: { finanzas: 'VECX' }, next: { finanzas: 'VECX' }, protected: true, protectionReason: 'Propietario protegido' },
  ]
  return {
    users, roles: APPROVED_ROLES,
    sections: [{ key: 'finanzas', label: 'Conciliar', group: 'Finanzas', codes: ['admin.finanzas'] }],
    proposal: {
      revision: 'a'.repeat(64),
      drafts: [{ userId: 101, role: 'empleado', active: true, extras: { finanzas: 'V' } }],
      rows: [{
        userId: 101, name: users[0].name, currentRoleLabel: users[0].currentRoleLabel,
        role: 'empleado', active: true, extras: { finanzas: 'V' }, changes: true,
        differences: [
          { section: 'admin.finanzas', label: 'Conciliar · admin.finanzas', lost: 'ECX', gained: '' },
          { section: 'admin.finanzas.detalle', label: 'Conciliar · admin.finanzas.detalle', lost: 'X', gained: '' },
        ],
      }],
    },
    applyingAllowed: false, environmentLabel: 'Sintético sin BD', warnings: [],
  }
}

test('E/C/X requieren V y letras quedan normalizadas', () => {
  assert.equal(normalizeActions('XCE'), 'VECX')
  assert.equal(normalizeActions('fooVV'), 'V')
  assert.equal(normalizeActions(''), '')
})

test('extras solo admiten section keys visibles, nunca códigos ocultos', () => {
  assert.deepEqual(cleanExtras({ finanzas: 'EC', 'admin.hidden': 'VECX' }, fixture().sections), { finanzas: 'VEC' })
})

test('el lote inicial solo incluye drafts del servidor; no propietario ni desconocidos', () => {
  assert.deepEqual(initialDrafts(fixture()).map(draft => draft.userId), [101])
  assert.deepEqual(safeDrafts(fixture(), [{ userId: 303, role: 'empleado', extras: {}, active: false }]), [])
})

test('nunca se promueve a superadmin desde un borrador manipulado', () => {
  assert.equal(safeDrafts(fixture(), [{ userId: 101, role: 'superadmin', extras: {}, active: true }])[0].role, 'empleado')
})

test('la propuesta original conserva TODOS los códigos y acciones aunque V permanezca', () => {
  const snapshot = fixture()
  const row = localRows(snapshot, initialDrafts(snapshot))[0]
  assert.deepEqual(row.differences, snapshot.proposal.rows[0].differences)
  assert.equal(row.differences[0].lost, 'ECX')
})

test('el borrador local compara E/C/X, no solo visibilidad', () => {
  const snapshot = fixture()
  const row = localRows(snapshot, [{ userId: 101, role: 'gerente', extras: {}, active: true }])[0]
  assert.deepEqual(row.differences, [{ section: 'finanzas', label: 'Conciliar', lost: 'EC', gained: '' }])
})

test('cuentas sin borrador y protegidas no aparecen cambiadas', () => {
  const snapshot = fixture()
  const rows = localRows(snapshot, initialDrafts(snapshot))
  assert.equal(rows.find(row => row.userId === 102)?.changes, false)
  assert.equal(rows.find(row => row.userId === 303)?.changes, false)
  assert.deepEqual(effectivePermissions(snapshot, snapshot.users[2], { userId: 303, role: 'empleado', extras: {}, active: false }), { finanzas: 'VECX' })
})

test('desactivar representa pérdida de todas las acciones, solo en borrador', () => {
  const snapshot = fixture()
  const row = localRows(snapshot, [{ userId: 101, role: 'empleado', extras: {}, active: false }])[0]
  assert.equal(row.active, false)
  assert.equal(row.differences[0].lost, 'VECX')
  assert.equal(snapshot.users[0].active, true)
})

test('recuentos usan rol principal actual, no propuesta ni etiquetas legacy extra', () => {
  const snapshot = fixture()
  assert.equal(currentRoleKey(snapshot, snapshot.users[0]), 'gerente')
  assert.equal(currentRoleKey(snapshot, snapshot.users[1]), 'comercial')
  assert.equal(currentRoleKey(snapshot, snapshot.users[2]), 'superadmin')
})

test('un borrador idéntico al original usa next exacto del servidor', () => {
  const snapshot = fixture()
  snapshot.users[0].next = { finanzas: 'VX' }
  assert.deepEqual(effectivePermissions(snapshot, snapshot.users[0], initialDrafts(snapshot)[0]), { finanzas: 'VX' })
})

test('Clientes V se expande a Draxton, Exagrid e hijos con el mismo helper del servidor', () => {
  const snapshot = { ...fixture(), sections: USERS_SECTIONS }
  const next = expandedPermissions(snapshot, 'contabilidad', { clientes: 'V', personal: 'VEC', nominas: 'VECX' })
  assert.equal(next.draxton, 'V')
  assert.equal(next.exagrid, 'V')
  const technical = USERS_SECTIONS.filter(section => section.key.startsWith('draxton-'))
  assert.equal(technical.length, 8)
  assert.ok(technical.every(section => next[section.key] === 'V'))
  assert.equal(next.nominas, '')
})

test('Técnico Draxton tiene ocho hijos VE pero no padre; Gastos sin código no se concede', () => {
  const snapshot = { ...fixture(), sections: USERS_SECTIONS }
  const next = expandedPermissions(snapshot, 'draxton', {})
  assert.equal(next.draxton, '')
  const technical = USERS_SECTIONS.filter(section => section.key.startsWith('draxton-'))
  assert.equal(technical.length, 8)
  assert.ok(technical.every(section => next[section.key] === 'VE'))
  if (!USERS_SECTIONS.find(section => section.key === 'gastos')!.codes.length) assert.equal(next.gastos, '')
})
