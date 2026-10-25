import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { config as cargarEntorno } from 'dotenv'
import { strToU8, zipSync } from 'fflate'
import * as XLSX from 'xlsx'

const raiz = process.cwd()
cargarEntorno({ path: '/home/ubuntu/asistente-fases-20261025/pruebas/.env.local-panel' })
if (!process.env.ASSISTANT_TEST_DATABASE_URL) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')
process.env.DATABASE_URL = process.env.ASSISTANT_TEST_DATABASE_URL
process.env.ASSISTANT_MODE = 'extractivo'
delete process.env.ASSISTANT_CLIENT_ENABLED

function archivo(relativo: string): string { return fs.readFileSync(path.join(raiz, relativo), 'utf8') }
function debeFallar(fn: () => unknown, codigo: string): void {
  assert.throws(fn, (error: unknown) => error instanceof Error && error.message === codigo)
}
function docxSintetico(texto: string): Buffer {
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    'word/document.xml': strToU8(`<w:document><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`),
  }))
}
function xlsxSintetico(texto: string): Buffer {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[texto]]), 'Prueba')
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
async function pdfSintetico(texto: string): Promise<Buffer> {
  const PDFDocument = require('pdfkit') as new () => { on: (evento: string, listener: (dato?: Buffer) => void) => unknown; text: (valor: string) => unknown; end: () => void }
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = []; const documento = new PDFDocument()
    documento.on('data', dato => { if (dato) partes.push(dato) })
    documento.on('error', () => reject(new Error('PDF_SINTETICO_INVALIDO')))
    documento.on('end', () => resolve(Buffer.concat(partes)))
    documento.text(texto); documento.end()
  })
}
function zipBombaSintetica(): Buffer {
  return Buffer.from(zipSync({ 'word/document.xml': strToU8('A'.repeat(300_000)) }, { level: 9 }))
}

async function main() {
  const cliente = new Client({ connectionString: process.env.ASSISTANT_TEST_DATABASE_URL })
  await cliente.connect()
  try {
    await cliente.query('DROP SCHEMA public CASCADE')
    await cliente.query('CREATE SCHEMA public')
    await cliente.query(archivo('prisma/migrations/20261025_asistente_ia/migration.sql'))

    const { extraerArchivo, inspeccionarZip, urlWebPublicaPermitida, rutaWebPublicaPermitida, direccionPublica, indexarFuente } = await import('@/lib/asistente/ingesta')
    const { alcanceClienteConfiableDesdeServidor } = await import('@/lib/asistente/acl')
    const { buscar, urlEmbeddingsInternaParaChat } = await import('@/lib/asistente/retrieval')
    const { actuacionPermitidaParaAsistente } = await import('@/lib/asistente/admin-auth')
    const { assistantClientEnabled } = await import('@/lib/asistente/public-flag')
    const { responderMensaje } = await import('@/lib/asistente/responder')
    const { impersonationRouteDecision } = await import('@/lib/impersonation-policy')

    // Fichero: extensión + magic bytes + ZIP seguro + límites, sin artefactos reales.
    assert.equal((await extraerArchivo(Buffer.from('Texto de prueba sin PII'), 'prueba.txt')).tipo, 'TXT')
    assert.equal((await extraerArchivo(Buffer.from('# Título\nDocumento sintético'), 'prueba.md')).tipo, 'MD')
    assert.match((await extraerArchivo(await pdfSintetico('PDF sintético de conocimiento'), 'prueba.pdf')).contenido, /PDF sintético/)
    assert.match((await extraerArchivo(docxSintetico('Documento sintético DOCX'), 'prueba.docx')).contenido, /DOCX/)
    assert.match((await extraerArchivo(xlsxSintetico('Hoja sintética'), 'prueba.xlsx')).contenido, /Hoja sintética/)
    await assert.rejects(() => extraerArchivo(Buffer.from('no es un PDF'), 'prueba.pdf'), /FIRMA_PDF_INVALIDA/)
    await assert.rejects(() => extraerArchivo(Buffer.from('no es un ZIP'), 'prueba.docx'), /FIRMA_DOCX_INVALIDA/)
    await assert.rejects(() => extraerArchivo(Buffer.from('hola\u0000mundo'), 'prueba.txt'), /FIRMA_TEXTO_INVALIDA/)
    debeFallar(() => inspeccionarZip(zipBombaSintetica()), 'ZIP_BOMBA_O_INVALIDO')

    // SSRF: allowlist exacta, sin credenciales/query/redirects, y prueba de rangos no públicos.
    assert.equal(urlWebPublicaPermitida('https://www.internetoperadores.com/soluciones'), true)
    assert.equal(urlWebPublicaPermitida('https://www.internetoperadores.com/admin'), false)
    assert.equal(urlWebPublicaPermitida('https://www.internetoperadores.com/%61dmin'), false)
    assert.equal(urlWebPublicaPermitida('https://www.internetoperadores.com/soluciones?destino=127.0.0.1'), false)
    assert.equal(urlWebPublicaPermitida('https://usuario@www.internetoperadores.com/soluciones'), false)
    assert.equal(rutaWebPublicaPermitida('/api/asistente'), false)
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.10.1', '::1', 'fc00::1', 'fe80::1']) assert.equal(direccionPublica(ip), false, ip)
    assert.equal(direccionPublica('8.8.8.8'), true)
    assert.equal(urlEmbeddingsInternaParaChat('https://example.test'), null)
    assert.equal(urlEmbeddingsInternaParaChat('https://localhost:8080')?.hostname, 'localhost')
    assert.equal(urlEmbeddingsInternaParaChat('http://127.0.0.1:8080')?.hostname, '127.0.0.1')
    assert.equal(urlEmbeddingsInternaParaChat('http://rag.service.internal:8080')?.hostname, 'rag.service.internal')

    // CLIENTE queda cerrado por defecto, y su tenant sólo se construye en servidor.
    assert.equal(assistantClientEnabled({ ASSISTANT_MODE: 'extractivo' }), false)
    assert.equal(alcanceClienteConfiableDesdeServidor({ clienteId: 1, usuarioId: 1, clienteHabilitado: false }), null)
    const alcanceA = alcanceClienteConfiableDesdeServidor({ clienteId: 101, usuarioId: 101, clienteHabilitado: true })
    const alcanceB = alcanceClienteConfiableDesdeServidor({ clienteId: 202, usuarioId: 202, clienteHabilitado: true })
    assert.deepEqual(alcanceA?.tenantId, 101)
    assert.deepEqual(alcanceB?.tenantId, 202)

    // Fixtures locales sintéticos: dos tenants, un documento público y uno interno rol-restringido.
    const insertar = async (titulo: string, contenido: string, espacio: 'PUBLICO' | 'CLIENTE' | 'INTERNO', tenant: number | null, roles: string[]) => {
      const documento = await cliente.query(`INSERT INTO asistente_documentos (titulo,espacio,tipo,origen,estado,roles,tenant_cliente_id,version_actual) VALUES ($1,$2,'FAQ',$3,'PUBLICADO',$4,$5,1) RETURNING id::text`, [titulo, espacio, `sintetico:${titulo}`, roles, tenant])
      const documentoId = documento.rows[0].id as string
      const version = await cliente.query(`INSERT INTO asistente_documento_versiones (documento_id,version,contenido,checksum,creado_por,aprobado_por) VALUES ($1,1,$2,$3,1,1) RETURNING id::text`, [documentoId, contenido, `checksum-${titulo}`])
      await cliente.query(`INSERT INTO asistente_fragmentos (documento_id,version_id,orden,titulo,contenido,contenido_norm,espacio,roles,tenant_cliente_id,activo) VALUES ($1,$2,0,$3,$4,$5,$6,$7,$8,true)`, [documentoId, version.rows[0].id, titulo, contenido, contenido.toLowerCase(), espacio, roles, tenant])
    }
    await insertar('Público sintético', 'La cobertura pública sintética se confirma mediante estudio.', 'PUBLICO', null, [])
    await insertar('Cliente A sintético', 'Secreto tenant alfa con clave exclusiva.', 'CLIENTE', 101, [])
    await insertar('Cliente B sintético', 'Secreto tenant beta con clave exclusiva.', 'CLIENTE', 202, [])
    await insertar('Interno restringido', 'Procedimiento interno de ventas exclusivo.', 'INTERNO', null, ['admin.ventas'])

    const resultadosA = await buscar('secreto tenant', alcanceA!, { limite: 10 })
    const resultadosB = await buscar('secreto tenant', alcanceB!, { limite: 10 })
    assert.deepEqual(resultadosA.map(resultado => resultado.titulo), ['Cliente A sintético'])
    assert.deepEqual(resultadosB.map(resultado => resultado.titulo), ['Cliente B sintético'])
    const publico = await buscar('procedimiento interno ventas', { espacios: ['PUBLICO'], roles: [], tenantId: null, usuarioId: null }, { limite: 10 })
    assert.equal(publico.length, 0)
    const sinRol = await buscar('procedimiento interno ventas', { espacios: ['INTERNO'], roles: [], tenantId: null, usuarioId: 7 }, { limite: 10 })
    assert.equal(sinRol.length, 0)
    const conRol = await buscar('procedimiento interno ventas', { espacios: ['INTERNO'], roles: ['admin.ventas'], tenantId: null, usuarioId: 7 }, { limite: 10 })
    assert.equal(conRol.length, 1)
    const privilegiado = await buscar('procedimiento interno ventas', { espacios: ['INTERNO'], roles: [], tenantId: null, usuarioId: 1, puedeLeerTodoInterno: true }, { limite: 10 })
    assert.equal(privilegiado.length, 1)

    // Persistencia de conocimiento: se redacta PII antes de fragmentar y no queda publicable sin flujo humano.
    const indexado = await indexarFuente({ titulo: 'Contacto persona@example.test', contenido: 'Llamar al 600 000 000 para la prueba de conocimiento.', tipo: 'TXT', origen: 'sintetico-pii-panel' }, 1, { espacio: 'INTERNO', estado: 'BORRADOR' })
    assert.equal(indexado.estado, 'BORRADOR')
    const almacenado = await cliente.query(`SELECT d.titulo,v.contenido,d.estado FROM asistente_documentos d JOIN asistente_documento_versiones v ON v.documento_id=d.id WHERE d.origen='sintetico-pii-panel' LIMIT 1`)
    assert.match(almacenado.rows[0].titulo, /\[EMAIL\]/)
    assert.match(almacenado.rows[0].contenido, /\[TELEFONO\]/)
    assert.doesNotMatch(almacenado.rows[0].contenido, /600\s*000\s*000/)

    // La propia guardia del panel y el middleware rechazan suplantación, sin tocar la política global.
    assert.equal(actuacionPermitidaParaAsistente({ user: { id: '1' } }), true)
    assert.equal(actuacionPermitidaParaAsistente({ user: { id: '1' }, impersonation: { sessionId: 'sintetica' } }), false)
    assert.equal(impersonationRouteDecision('/api/admin/asistente/chat', 'POST').allowed, false)
    assert.equal(impersonationRouteDecision('/api/admin/asistente/conocimiento', 'GET').allowed, false)

    // El chat extractivo no usa la importación web: una pregunta sin fuente cae al texto seguro "no sé".
    assert.doesNotMatch(archivo('lib/asistente/responder.ts'), /descargarPaginaPublica|fetch\s*\(/)
    const respuesta = await responderMensaje({ mensaje: '¿Qué servicio de xilófono galáctico ofrecéis?', contexto: 'PUBLICO', visitanteHash: 'visitante-sintetico' })
    assert.equal(respuesta.sinFuente, true)
    assert.match(respuesta.respuesta, /No tengo esa información/)

    // Evidencia estática de confirmación y roles API: la ruta no acepta tenant/roles del body.
    const conocimientoId = archivo('app/api/admin/asistente/conocimiento/[id]/route.ts')
    assert.match(conocimientoId, /confirmarPublicacion/)
    assert.match(conocimientoId, /motivoPublicacion/)
    assert.match(archivo('app/api/admin/asistente/chat/route.ts'), /exigirAdminAsistente\('admin\.asistente\.chat', 'escritura'\)/)
    assert.doesNotMatch(archivo('app/api/admin/asistente/chat/route.ts'), /tenantId|roles:\s*z\./)
    console.log('TEST_ASISTENTE_PANEL_SEGURIDAD_OK')
  } finally { await cliente.end() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
