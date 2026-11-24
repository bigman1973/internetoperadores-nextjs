import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { canAccessAdminPanel } from '../lib/admin-panel-access'
import { filtrarPeticiones } from '../lib/peticiones-filtros'
import { transicionAdminPermitida } from '../lib/peticiones-flujo'
import {
  ESTADOS_UI, ESTADOS_GESTION_UI, TIPOS_UI, NIVELES_UI, SECCIONES_UI,
  BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO_UI, INTEGRACION_PENDIENTE,
  CAPTURA_MAX_BYTES, CAPTURA_MIMES, capturaSegura, paginaSegura,
  formularioVacio, validarFormulario, leerRespuesta, estaCerrada, puedeEntregar,
} from '../lib/area8/ui'
import PeticionesPage from '../app/peticiones/page'
import AdminPeticionesPage from '../app/admin/peticiones/page'
import PendingPetitionsAlert from '../components/peticiones/PendingPetitionsAlert'

async function main() {
  let reads = 0
  const count = async (id: number) => { reads++; return id === 12 ? 1 : 0 }
  const admin = { userType: 'admin', id: '12' }
  const previousOwner = process.env.AREA4_OWNER_USER_ID
  process.env.AREA4_OWNER_USER_ID = '12'
  try {
    assert.equal(await canAccessAdminPanel({ ...admin, role: 'SUPER_ADMIN' }, count), true)
    assert.equal(await canAccessAdminPanel({ ...admin, id: '13', role: 'SUPER_ADMIN' }, count), false)
  } finally {
    if (previousOwner === undefined) delete process.env.AREA4_OWNER_USER_ID
    else process.env.AREA4_OWNER_USER_ID = previousOwner
  }
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'GERENTE' }, count), true)
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'VISOR', roles: ['VENTAS'] }, count), true)
  assert.equal(reads, 0)
  assert.equal(await canAccessAdminPanel({ ...admin, role: 'VISOR', roles: [] }, count), true)
  assert.equal(await canAccessAdminPanel({ ...admin, id: '13', role: 'VISOR' }, count), false)
  assert.equal(await canAccessAdminPanel({ ...admin, id: 'bad' }, count), false)
  assert.equal(await canAccessAdminPanel({ ...admin, id: '12abc' }, count), false)
  assert.equal(await canAccessAdminPanel({ ...admin, userType: 'cliente', role: 'SUPER_ADMIN' }, count), false)
  assert.equal(reads, 2)

  const items = [
    { id: 1, estado: 'nueva', tipo: 'mejora' },
    { id: 2, estado: 'en_pruebas', tipo: 'error' },
    { id: 3, estado: 'hecha', tipo: 'mejora' },
    { id: 4, estado: 'en_desarrollo', tipo: 'sugerencia' },
  ]
  assert.equal(filtrarPeticiones(items, '', '').length, 4)
  assert.deepEqual(filtrarPeticiones(items, '', 'mejora').map(p => p.id), [1, 3])
  assert.deepEqual(filtrarPeticiones(items, 'en_pruebas', 'error').map(p => p.id), [2])
  assert.equal(filtrarPeticiones(items, 'nueva', 'error').length, 0)
  assert.equal(filtrarPeticiones([], '', '').length, 0)
  assert.deepEqual(items.map(p => p.id), [1, 2, 3, 4])
  assert.deepEqual(ESTADOS_UI.map(e => e.v), ['nueva', 'en_analisis', 'aprobada', 'en_desarrollo', 'en_pruebas', 'hecha', 'descartada'])
  assert.deepEqual(ESTADOS_GESTION_UI.map(e => e.v), ['nueva', 'en_analisis', 'aprobada', 'en_desarrollo', 'descartada'])
  assert.deepEqual(TIPOS_UI.map(e => e.v), ['error', 'mejora', 'sugerencia'])
  assert.deepEqual(NIVELES_UI.map(e => e.v), ['baja', 'media', 'alta', 'critica'])
  assert.equal(SECCIONES_UI.length, 3)
  assert.equal(transicionAdminPermitida('nueva', 'aprobada'), false)
  assert.equal(transicionAdminPermitida('nueva', 'en_analisis'), true)
  assert.equal(transicionAdminPermitida('en_pruebas', 'hecha'), false)
  assert.equal(puedeEntregar('aprobada'), true)
  assert.equal(puedeEntregar('en_desarrollo'), true)
  assert.equal(puedeEntregar('en_analisis'), false)
  assert.equal(estaCerrada('hecha'), true)
  assert.equal(estaCerrada('en_pruebas'), false)

  for (const page of ['/empleado', '/admin/peticiones?estado=nueva', 'https://ejemplo.es/pagina', 'http://localhost/pagina']) assert.equal(paginaSegura(page), page)
  for (const page of [null, '', 'javascript:alert(1)', 'data:text/html,test', '//ejemplo.es', '/\\ejemplo.es', 'https://usuario:clave@ejemplo.es', '/ruta\ninterior', '/%00', '/%7f', 'ftp://ejemplo.es', 'ruta', '/'.repeat(2049)]) assert.equal(paginaSegura(page), null)
  assert.deepEqual(CAPTURA_MIMES, ['image/png', 'image/jpeg', 'image/webp'])
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const capture = (mime: string, bytes: Buffer) => `data:image/${mime};base64,${bytes.toString('base64')}`
  const png = capture('png', pngHeader)
  const jpeg = capture('jpeg', Buffer.from([255, 216, 255, 217]))
  const webp = capture('webp', Buffer.from('RIFF0000WEBP'))
  for (const image of [png, jpeg, webp]) assert.equal(capturaSegura(image), image)
  for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==', 'https://ejemplo.es/image.png', capture('png', Buffer.from('not an image')), capture('jpeg', pngHeader), 'data:image/png;base64,AAAAA', 'data:image/png;base64,iVBORw0KGgp=']) assert.equal(capturaSegura(image), null)
  const limit = Buffer.alloc(CAPTURA_MAX_BYTES)
  pngHeader.copy(limit)
  assert.equal(capturaSegura(capture('png', limit)), capture('png', limit))
  assert.equal(capturaSegura(capture('png', Buffer.concat([limit, Buffer.from([0])]))), null)
  const form = { ...formularioVacio(), titulo: 'Prueba técnica sin datos personales', descripcion: 'Validación local del formulario.' }
  assert.equal(validarFormulario(form), null)
  assert.ok(validarFormulario({ ...form, titulo: ' ' }))
  assert.equal(validarFormulario({ ...form, titulo: 'x'.repeat(200), descripcion: 'x'.repeat(10000) }), null)
  assert.ok(validarFormulario({ ...form, titulo: 'x'.repeat(201) }))
  assert.ok(validarFormulario({ ...form, descripcion: 'x'.repeat(10001) }))
  assert.ok(validarFormulario({ ...form, captura: capture('png', Buffer.from('not an image')) }))
  assert.ok(validarFormulario({ ...form, paginaUrl: 'javascript:alert(1)' }))
  assert.equal('prioridad' in formularioVacio(), false)
  await assert.rejects(leerRespuesta(new Response('Servicio sin integrar', { status: 503 }), 'Error'), { message: INTEGRACION_PENDIENTE })
  await assert.rejects(leerRespuesta(new Response('<html>Error</html>', { status: 500 }), 'Error de consulta'), { message: 'Error de consulta' })
  await assert.rejects(leerRespuesta(new Response('{"success":false,"error":"Conflicto"}', { status: 409 }), 'Error'), { message: 'Conflicto' })

  const page = fs.readFileSync('app/peticiones/page.tsx', 'utf8')
  const management = fs.readFileSync('app/admin/peticiones/page.tsx', 'utf8')
  const pending = fs.readFileSync('components/peticiones/PendingPetitionsAlert.tsx', 'utf8')
  const shared = fs.readFileSync('lib/area8/ui.ts', 'utf8')
  // Mantener las garantías originales de superficie clara, enlace y filtros etiquetados.
  assert.match(page, /min-h-screen[^"\n]*bg-gray-50[^"\n]*text-\[#2D2A26\]/)
  assert.match(page, /colorScheme: 'light'/)
  assert.match(page, /href="\/empleado"/)
  assert.match(page, /id="peticiones-estado"/)
  assert.match(page, /id="peticiones-tipo"/)
  assert.match(page, /maxLength=\{200\}/)
  assert.match(page, /maxLength=\{10000\}/)
  assert.match(page, /maxLength=\{2000\}/)
  assert.match(page, /accept="image\/png,image\/jpeg,image\/webp"/)
  assert.doesNotMatch(page, /accept="image\/\*"/)
  assert.match(page, /peticion\.estado === 'nueva'/)
  assert.match(page, /puedeRetirar\(peticion\) && <button/)
  assert.match(shared, /!peticion\.eventos\?\.length && !peticion\.tramitadaAt/)
  assert.match(shared, /!peticion\.mensajes\?\.some/)
  assert.doesNotMatch(page, /notasAdmin && !peticion\.mensajes\?\.length/)
  assert.match(page, /method: 'PATCH'/)
  assert.match(page, /peticion\.estado === 'en_pruebas'/)
  assert.match(page, /Avisos de estado dentro de la aplicación/)
  assert.match(management, /transicionAdminPermitida\(detalle\.estado, item\.v\)/)
  assert.match(management, /capacidades\.priorizar \? <select/)
  assert.match(management, /!capacidades\.gestionar \|\| \(action === 'cambiar_prioridad' && !capacidades\.priorizar\)/)
  assert.match(management, /asignar_responsable/)
  assert.match(management, /responsableId/)
  assert.match(management, /enviar_validacion/)
  assert.match(management, /maxLength=\{2000\}/)
  assert.doesNotMatch(management, /handleAction\('eliminar'/)
  assert.doesNotMatch(management, /enviaremos un correo|correo automático|data\.email/)
  assert.match(pending, /resumen: 'validacion'/)
  assert.match(pending, /data\.total/)
  assert.match(pending, /if \(error\) return/)
  for (const source of [page, management, pending]) {
    assert.match(source, /min-w-0/)
    assert.match(source, /\[overflow-wrap:anywhere\]/)
    assert.doesNotMatch(source, /font-family|fontFamily/)
  }
  assert.match(management, /md:hidden/)
  assert.match(management, /overflow-x-auto[^"\n]*md:block/)
  assert.match(shared, /max-w-full/)
  assert.match(BOTON_PRINCIPAL, /bg-\[#FF5300\].*text-\[#2D2A26\]/)
  assert.match(BOTON_SECUNDARIO, /min-h-11/)
  assert.match(CAMPO_UI, /w-full max-w-full/)
  for (const source of [page, management]) {
    assert.match(source, /page: String\(paginaActual\)/)
    assert.match(source, /hasMore/)
    assert.match(source, /role="dialog" aria-modal="true"/)
    assert.match(source, /useDialogoUI/)
  }
  // Render inicial real: no se invocan effects, fetch, Prisma ni datos de peticiones simulados.
  const ownMarkup = renderToStaticMarkup(React.createElement(PeticionesPage))
  const adminMarkup = renderToStaticMarkup(React.createElement(AdminPeticionesPage))
  const pendingMarkup = renderToStaticMarkup(React.createElement(PendingPetitionsAlert))
  assert.match(ownMarkup, /Mis peticiones/)
  assert.match(ownMarkup, /Cargando peticiones/)
  assert.match(ownMarkup, /color-scheme:light/)
  assert.match(adminMarkup, /Peticiones y mejoras/)
  assert.match(adminMarkup, /Cargando peticiones/)
  assert.equal(pendingMarkup, '')
  console.log('Peticiones UI: acceso y filtros protegidos; siete estados canónicos; URL y captura raster hasta 5 MiB; formularios acotados; capacidades, transiciones y paginación; avisos sin correo; 503; render inicial sin BD: OK.')
  console.log('400 px: garantías estáticas de tarjetas, min-w-0, max-w-full y overflow de tabla acotado: OK. Aceptación visual pendiente de staging; no se ha usado navegador.')
}
main().catch(error => { console.error(error); process.exit(1) })
