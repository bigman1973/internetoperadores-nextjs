import assert from 'node:assert/strict'
import {
  normalizeGuardiasArray,
  normalizeTecnicosDisponibles,
  validateAddTecnicoInput,
} from '../lib/draxton-guardias-validation'

const tecnicos = normalizeTecnicosDisponibles({
  tecnicos: [
    { id: 'empleado-1', nombreCompleto: 'Ana Técnico', categoria: 'TÉCNICO', estado: 'ACTIVO', nif: 'no-debe-salir' },
    { id: '', nombreCompleto: 'Inválido', categoria: 'TÉCNICO', estado: 'ACTIVO' },
  ],
})
assert.deepEqual(tecnicos, [{ id: 'empleado-1', nombreCompleto: 'Ana Técnico', categoria: 'TÉCNICO', estado: 'ACTIVO' }])
assert.deepEqual(normalizeTecnicosDisponibles({ error: 'Sin permiso' }), [])
assert.deepEqual(normalizeGuardiasArray<string>({ tecnicos: [] }), [])
assert.deepEqual(normalizeGuardiasArray<string>(['guardia-1']), ['guardia-1'])

assert.deepEqual(validateAddTecnicoInput({ empleadoId: ' empleado-1 ', nivel: '2', fechaAlta: '2026-02-28' }), {
  ok: true,
  value: { empleadoId: 'empleado-1', nivel: 2, fechaAlta: '2026-02-28' },
})

for (const payload of [
  { empleadoId: '', nivel: 1, fechaAlta: '2026-02-28' },
  { empleadoId: 'empleado-1', nivel: 4, fechaAlta: '2026-02-28' },
  { empleadoId: 'empleado-1', nivel: true, fechaAlta: '2026-02-28' },
  { empleadoId: 'empleado-1', nivel: [2], fechaAlta: '2026-02-28' },
  { empleadoId: 'empleado-1', nivel: 1, fechaAlta: '2026-02-30' },
  { empleadoId: 'empleado-1', nivel: 1, fechaAlta: '28-02-2026' },
]) {
  assert.equal(validateAddTecnicoInput(payload).ok, false)
}

console.log('OK: validación y normalización sintéticas de guardias superadas')
