import assert from 'node:assert/strict'
import { config as cargarEntorno } from 'dotenv'

cargarEntorno({ path: '/home/ubuntu/asistente-fases-20261025/pruebas/.env.local-captacion' })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/asistente_fases_captacion') throw new Error('LOCAL_DB_GUARD')
process.env.DATABASE_URL = url
process.env.ASSISTANT_MODE = 'extractivo'
process.env.ASSISTANT_PUBLIC_ENABLED = 'true'
process.env.NEXTAUTH_SECRET = 'secreto-local-aislado-de-pruebas-captacion-lead'
process.env.ASSISTANT_CONSENT_VERSION = 'prueba-local-v1'
process.env.FINANCE_STAGING_SANDBOX = '0' // Evita que Prisma reponga .env de staging; la URL de test ya está verificada.

const entrada = {
  tipo: 'EMPRESA' as const,
  codigoPostal: '28080',
  conexionActual: 'fibra de 300 Mb',
  problemas: ['Necesitamos backup de conexión ante caídas', 'Contacto ana.prueba@example.test'],
  usuarios: 34,
  urgencia: 'ALTA' as const,
  nombre: 'Ana Prueba',
  email: 'ana.prueba@example.test',
  telefono: '600123123',
  empresa: 'Empresa Sintética S.L.',
  consentimiento: true as const,
  consentimientoVersion: 'prueba-local-v1',
  necesidades: 'Necesitamos continuidad; llamad a ana.prueba@example.test en el 600123123.',
}

async function main() {
  const { default: prisma } = await import('@/lib/prisma')
  const { crearLead, puntuarLead } = await import('@/lib/asistente/leads')
  const { leerContactoSeguro } = await import('@/lib/asistente/contacto-seguro')
  const { listarProyeccionesLeadAsistente } = await import('@/lib/asistente/leads-admin')
  const { POST } = await import('@/app/api/asistente/lead/route')

  try {
    const identidad = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
    assert.equal(identidad[0]?.db, 'asistente_fases_captacion')

    await prisma.asistenteContactoSeguro.deleteMany()
    await prisma.asistenteLead.deleteMany()
    await prisma.asistenteRateLimit.deleteMany()
    await prisma.asistenteFragmento.deleteMany()
    await prisma.asistenteDocumentoVersion.deleteMany()
    await prisma.asistenteDocumento.deleteMany()
    await prisma.asistenteConversacion.deleteMany({ where: { visitanteHash: { startsWith: 'fixture-captacion-' } } })
    await prisma.asistenteConfiguracion.upsert({
      where: { id: 'default' },
      create: { id: 'default', modo: 'extractivo', retencionMeses: 12, consentimientoVersion: entrada.consentimientoVersion },
      update: { modo: 'extractivo', retencionMeses: 12, consentimientoVersion: entrada.consentimientoVersion },
    })

    const documento = await prisma.asistenteDocumento.create({
      data: { titulo: 'Backup de conexión aprobado', espacio: 'PUBLICO', tipo: 'FAQ', estado: 'PUBLICADO', origen: 'fixture-sintetico' },
    })
    const version = await prisma.asistenteDocumentoVersion.create({
      data: { documentoId: documento.id, version: 1, contenido: 'El servicio de backup de conexión mantiene continuidad ante caídas de fibra.', checksum: 'fixture-captacion-v1' },
    })
    await prisma.asistenteFragmento.create({
      data: {
        documentoId: documento.id,
        versionId: version.id,
        orden: 0,
        titulo: 'Backup de conexión aprobado',
        contenido: 'El servicio de backup de conexión mantiene continuidad ante caídas de fibra.',
        contenidoNorm: 'el servicio de backup de conexion mantiene continuidad ante caidas de fibra',
        espacio: 'PUBLICO',
      },
    })
    const borrador = await prisma.asistenteDocumento.create({
      data: { titulo: 'Backup no aprobado', espacio: 'PUBLICO', tipo: 'FAQ', estado: 'BORRADOR', origen: 'fixture-sintetico' },
    })
    const versionBorrador = await prisma.asistenteDocumentoVersion.create({
      data: { documentoId: borrador.id, version: 1, contenido: 'El backup de conexión de borrador no se puede recomendar.', checksum: 'fixture-captacion-borrador-v1' },
    })
    await prisma.asistenteFragmento.create({
      data: { documentoId: borrador.id, versionId: versionBorrador.id, orden: 0, titulo: 'Backup no aprobado', contenido: 'El backup de conexión de borrador no se puede recomendar.', contenidoNorm: 'el backup de conexion de borrador no se puede recomendar', espacio: 'PUBLICO' },
    })
    const interno = await prisma.asistenteDocumento.create({
      data: { titulo: 'Backup interno', espacio: 'INTERNO', tipo: 'FAQ', estado: 'PUBLICADO', origen: 'fixture-sintetico' },
    })
    const versionInterna = await prisma.asistenteDocumentoVersion.create({
      data: { documentoId: interno.id, version: 1, contenido: 'El backup de conexión interno no se puede recomendar al público.', checksum: 'fixture-captacion-interno-v1' },
    })
    await prisma.asistenteFragmento.create({
      data: { documentoId: interno.id, versionId: versionInterna.id, orden: 0, titulo: 'Backup interno', contenido: 'El backup de conexión interno no se puede recomendar al público.', contenidoNorm: 'el backup de conexion interno no se puede recomendar al publico', espacio: 'INTERNO' },
    })

    assert.equal(puntuarLead(entrada), 'CALIENTE')
    const visitanteA = 'fixture-captacion-visitante-a'
    const primera = await crearLead(entrada, 12, visitanteA)
    const segunda = await crearLead({ ...entrada, conversacionId: primera.conversacionId, telefono: '600321321' }, 12, visitanteA)
    assert.equal(primera.conversacionId, segunda.conversacionId, 'la misma visitante y conversación conservan su conversación')

    const leadsA = await prisma.asistenteLead.findMany({ orderBy: { createdAt: 'asc' } })
    assert.equal(leadsA.length, 1, 'la repetición no duplica el lead')
    const leadA = leadsA[0]
    assert.equal(leadA.puntuacion, 'CALIENTE')
    assert.equal(leadA.nombre, '[CONTACTO_CIFRADO]')
    assert.equal(leadA.email, '[CONTACTO_CIFRADO]')
    assert.equal(leadA.telefono, null)
    assert.equal(leadA.empresa, '[CONTACTO_CIFRADO]')
    const serializado = JSON.stringify(leadA)
    for (const pii of ['Ana Prueba', 'ana.prueba@example.test', '600123123', '600321321', 'Empresa Sintética S.L.']) assert.ok(!serializado.includes(pii), `sin PII en claro: ${pii}`)
    assert.ok(!leadA.resumen?.includes('ana.prueba@example.test') && !leadA.necesidades?.includes('600123123'))
    assert.equal(leadA.servicioRecomendado, 'Backup de conexión aprobado', 'la recomendación deriva sólo de fuente PUBLICO/PUBLICADO del servidor, no de borrador ni fuente interna')

    const contactoA = await leerContactoSeguro(prisma, { referenciaTipo: 'LEAD', referenciaId: leadA.id, conversacionId: leadA.conversacionId })
    assert.deepEqual(contactoA, { nombre: 'Ana Prueba', email: 'ana.prueba@example.test', telefono: '600321321', empresa: 'Empresa Sintética S.L.' })
    const seguro = await prisma.asistenteContactoSeguro.findUnique({ where: { referenciaTipo_referenciaId: { referenciaTipo: 'LEAD', referenciaId: leadA.id } } })
    assert.ok(seguro && !seguro.cifrado.includes('ana.prueba@example.test') && !seguro.cifrado.includes('600321321'))

    const visitanteB = 'fixture-captacion-visitante-b'
    const ajeno = await crearLead({ ...entrada, conversacionId: primera.conversacionId, email: 'otro.fixture@example.test', telefono: '611222333' }, 12, visitanteB)
    assert.notEqual(ajeno.conversacionId, primera.conversacionId, 'un visitante distinto no reutiliza conversación ajena')
    assert.equal(await prisma.asistenteLead.count(), 2, 'un visitante distinto obtiene su propia referencia')

    const proyecciones = await listarProyeccionesLeadAsistente({ puntuacion: 'CALIENTE' })
    assert.equal(proyecciones.length, 2)
    const proyeccion = JSON.stringify(proyecciones)
    for (const pii of ['Ana Prueba', 'ana.prueba@example.test', 'Empresa Sintética S.L.']) assert.ok(!proyeccion.includes(pii), `la proyección no expone PII: ${pii}`)
    assert.ok(proyecciones.every(item => item.origen === 'ASISTENTE' && item.puntuacion === 'CALIENTE'))

    const inyectada = await POST(new Request('http://local.test/api/asistente/lead', {
      method: 'POST',
      headers: { origin: 'http://local.test', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.24' },
      body: JSON.stringify({ ...entrada, conversacionId: undefined, servicioRecomendado: 'Servicio inventado desde navegador' }),
    }))
    assert.equal(inyectada.status, 400, 'la API no acepta una recomendación enviada por navegador')

    const respuesta = await POST(new Request('http://local.test/api/asistente/lead', {
      method: 'POST',
      headers: { origin: 'http://local.test', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.24' },
      body: JSON.stringify({ ...entrada, conversacionId: undefined, email: 'publico.fixture@example.test', telefono: '622333444' }),
    }))
    assert.equal(respuesta.status, 200)
    const publica = await respuesta.json() as Record<string, unknown>
    assert.deepEqual(Object.keys(publica).sort(), ['conversacionId', 'mensaje', 'ok'])
    assert.equal(publica.ok, true)
    assert.equal(typeof publica.conversacionId, 'string')
    assert.ok(!('id' in publica) && !('leadId' in publica) && !('puntuacion' in publica))

    console.log('TEST_ASISTENTE_CAPTACION_LEAD_DB_OK')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
