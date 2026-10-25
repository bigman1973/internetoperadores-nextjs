import assert from 'node:assert/strict'
import { isAssistantExcludedPath } from '../lib/asistente/public-flag'
import {
  citationNumbers,
  ctaHref,
  messageCounter,
  parseAssistantResponse,
  safeSourceUrl,
  splitCitations,
  validateEscalation,
  validateLead,
} from '../components/asistente/assistant-utils'

for (const pathname of ['/admin', '/admin/asistente', '/empleado/turnos', '/cliente', '/login', '/api/asistente/config', '/checkout', '/carrito', '/pago/tarjeta']) {
  assert.equal(isAssistantExcludedPath(pathname), true, `La ruta ${pathname} debe excluir el widget`)
}
for (const pathname of ['/', '/empresa', '/contacto', '/administracion', '/apiaria']) {
  assert.equal(isAssistantExcludedPath(pathname), false, `La ruta ${pathname} no debe excluir el widget`)
}
assert.equal(isAssistantExcludedPath(null), true)

assert.deepEqual(messageCounter('hola', 5), { length: 4, remaining: 1, valid: true })
assert.deepEqual(messageCounter('😀😀', 2), { length: 2, remaining: 0, valid: true })
assert.equal(messageCounter('más largo', 3).valid, false)

assert.equal(safeSourceUrl('/cero-riesgos'), '/cero-riesgos')
assert.equal(safeSourceUrl('https://www.internetoperadores.com/recursos/faq'), 'https://www.internetoperadores.com/recursos/faq')
assert.equal(safeSourceUrl('https://evil.example/recursos'), null)
assert.equal(safeSourceUrl('//evil.example/ruta'), null)
assert.equal(safeSourceUrl('javascript:alert(1)'), null)
assert.equal(safeSourceUrl('/ruta\\malformada'), null)

assert.deepEqual(citationNumbers('Consulta [2], después [1] y otra vez [2].'), [2, 1])
assert.deepEqual(splitCitations('Texto [1] y [2].'), [
  { type: 'text', value: 'Texto ' },
  { type: 'citation', n: 1 },
  { type: 'text', value: ' y ' },
  { type: 'citation', n: 2 },
  { type: 'text', value: '.' },
])

const parsed = parseAssistantResponse({
  conversacionId: '00000000-0000-4000-8000-000000000001',
  mensajeId: '00000000-0000-4000-8000-000000000002',
  respuesta: 'Puedes consultar la guía [1].',
  fuentes: [{ n: 1, titulo: 'Guía de ejemplo', url: '/recursos/guia', fragmento: 'Contenido de prueba.' }],
  sinFuente: false,
  escalar: true,
  motivoEscalado: 'PETICION',
  ctas: [
    { tipo: 'INFORME_CERO_RIESGOS', texto: 'Ver informe' },
    { tipo: 'LEAD', texto: 'Solicitar recomendación' },
    { tipo: 'TIPO_NO_PERMITIDO', texto: 'No se muestra' },
  ],
  modo: 'extractivo',
})
assert(parsed)
assert.equal(parsed.fuentes.length, 1)
assert.equal(parsed.ctas.length, 2)
assert.equal(parsed.motivoEscalado, 'PETICION')
assert.equal(parseAssistantResponse({ respuesta: 'sin id' }), null)
assert.equal(ctaHref({ tipo: 'INFORME_CERO_RIESGOS', texto: 'Informe' }), '/cero-riesgos')
assert.equal(ctaHref({ tipo: 'BACKUP_CONEXION', texto: 'Backup', url: 'https://evil.example' }), '/productos/backup')
assert.equal(ctaHref({ tipo: 'CONTACTO', texto: 'Contacto' }), '/contacto')
assert.equal(ctaHref({ tipo: 'LEAD', texto: 'Lead' }), null)

const validEscalation = {
  nombre: 'Persona de prueba',
  telefono: '600 000 000',
  email: '',
  preferencia: 'LLAMADA' as const,
  franja: '',
  consentimiento: true,
}
assert.deepEqual(validateEscalation(validEscalation), {})
assert.equal(validateEscalation({ ...validEscalation, consentimiento: false }).consentimiento.length > 0, true)
assert.equal(validateEscalation({ ...validEscalation, telefono: '', email: '' }).contacto.length > 0, true)
assert.equal(validateEscalation({ ...validEscalation, franja: '' }, true).franja.length > 0, true)
assert.equal(validateEscalation({ ...validEscalation, telefono: '123', email: 'correo-invalido' }).telefono.length > 0, true)
assert.equal(validateEscalation({ ...validEscalation, telefono: '123', email: 'correo-invalido' }).email.length > 0, true)

const validLead = {
  tipo: 'EMPRESA' as const,
  codigoPostal: '28001',
  conexionActual: 'Fibra de 300 Mb',
  problemas: ['Cortes o lentitud'],
  usuarios: '14',
  urgencia: 'MEDIA' as const,
  nombre: 'Empresa de prueba',
  email: 'equipo@ejemplo.test',
  telefono: '',
  empresa: 'Ejemplo Test SL',
  consentimiento: true,
  consentimientoVersion: '2026-10-borrador',
}
assert.deepEqual(validateLead(validLead), {})
const invalidLead = validateLead({
  ...validLead,
  tipo: '',
  codigoPostal: '1234',
  conexionActual: '',
  problemas: [],
  usuarios: '0',
  urgencia: '',
  nombre: 'X',
  email: 'mal',
  empresa: '',
  consentimiento: false,
  consentimientoVersion: '',
})
for (const field of ['tipo', 'codigoPostal', 'conexionActual', 'problemas', 'usuarios', 'urgencia', 'nombre', 'email', 'consentimiento', 'consentimientoVersion']) {
  assert.equal(Boolean(invalidLead[field]), true, `Debe validar ${field}`)
}
assert.equal(Boolean(validateLead({ ...validLead, empresa: '' }).empresa), true, 'Debe exigir empresa cuando el tipo es EMPRESA')

console.log('Widget asistente: rutas excluidas, contador, fuentes, citas, parseo y formularios validados correctamente.')
