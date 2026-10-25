import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { config as cargarEntorno } from 'dotenv'

cargarEntorno({ path: '/home/ubuntu/asistente-ia-20261025/pruebas/.env.aprendizaje' })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')
process.env.DATABASE_URL = url
process.env.ASSISTANT_MODE = 'extractivo'
process.env.ASSISTANT_PUBLIC_ENABLED = 'true'
delete process.env.FINANCE_STAGING_SANDBOX
delete process.env.ASSISTANT_EMBEDDINGS_URL
delete process.env.ASSISTANT_LOCAL_BASE_URL
delete process.env.ASSISTANT_CRON_ENABLED
delete process.env.CRON_SECRET

async function recrearEsquema() {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    await cliente.query('DROP SCHEMA public CASCADE')
    await cliente.query('CREATE SCHEMA public')
    await cliente.query(fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20261025_asistente_ia/migration.sql'), 'utf8'))
  } finally { await cliente.end() }
}

async function main() {
  await recrearEsquema()
  const { default: prisma } = await import('@/lib/prisma')
  const { indexarFuente } = await import('@/lib/asistente/ingesta')
  const { crearPropuestaAprendizaje, decidirPropuestaAprendizaje } = await import('@/lib/asistente/aprendizaje')
  const { responderMensaje } = await import('@/lib/asistente/responder')
  const { normalizar } = await import('@/lib/asistente/text')
  const { obtenerMetricasAnalitica, rangoAnalitica } = await import('@/lib/asistente/analitica')
  const { cambiarEstadoPropuestaInforme, generarInformeSiProcede } = await import('@/lib/asistente/informes')
  const cron = await import('@/app/api/cron/asistente-informe/route')
  try {
    const identidad = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
    assert.ok(identidad[0]?.db, 'la prueba usa una BD local configurada')

    // Hueco -> propuesta extractiva -> aprobación humana -> respuesta con cita del nuevo documento.
    const fuente = await indexarFuente({
      titulo: 'Guía zafiro',
      contenido: 'La validación zafiro se realiza desde el panel siguiendo el registro de incidencias y la comprobación final.',
      tipo: 'FAQ', origen: 'prueba-aprendizaje:guia-zafiro', urlFuente: null,
    }, 7, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
    const pregunta = '¿Cómo se realiza la validación zafiro?'
    const hueco = await prisma.asistenteHueco.create({ data: { preguntaAnon: pregunta, preguntaNorm: normalizar(pregunta), canal: 'PUBLICO' } })
    const propuesta = await crearPropuestaAprendizaje({ origen: 'HUECO', huecoId: hueco.id, actorId: 7 })
    assert.ok(propuesta.respuestaPropuesta.includes('validación zafiro'), 'la propuesta sólo extrae frases de fuentes')
    assert.equal((propuesta.fuentes as unknown[]).length, 1)
    // Se archiva la fuente de apoyo para demostrar que la respuesta posterior cita el documento aprobado.
    await prisma.asistenteDocumento.update({ where: { id: fuente.documentoId! }, data: { estado: 'ARCHIVADO' } })
    const aprobada = await decidirPropuestaAprendizaje({ id: propuesta.id, accion: 'aprobar', actorId: 7, espacio: 'PUBLICO' })
    assert.equal(aprobada.estado, 'APROBADA')
    const documento = await prisma.asistenteDocumento.findUniqueOrThrow({ where: { id: aprobada.documentoId! }, select: { tipo: true, estado: true, espacio: true } })
    assert.deepEqual(documento, { tipo: 'APRENDIZAJE', estado: 'PUBLICADO', espacio: 'PUBLICO' })
    assert.equal((await prisma.asistenteHueco.findUniqueOrThrow({ where: { id: hueco.id } })).estado, 'RESUELTO')
    const chat = await responderMensaje({ mensaje: pregunta, contexto: 'PUBLICO', visitanteHash: 'visitante-prueba-aprendizaje' })
    assert.equal(chat.sinFuente, false)
    assert.ok(chat.fuentes.some(cita => cita.documentoId === aprobada.documentoId), 'el chat cita el documento aprobado de inmediato')
    console.log('OK hueco → propuesta → aprobación → cita inmediata')

    // Un descarte no publica ningún documento.
    const huecoDescartado = await prisma.asistenteHueco.create({ data: { preguntaAnon: '¿Qué significa el código cuarzo?', preguntaNorm: 'que significa el codigo cuarzo', canal: 'PUBLICO' } })
    const propuestaDescartada = await crearPropuestaAprendizaje({ origen: 'HUECO', huecoId: huecoDescartado.id, actorId: 7 })
    const documentosAntes = await prisma.asistenteDocumento.count()
    const descarte = await decidirPropuestaAprendizaje({ id: propuestaDescartada.id, accion: 'descartar', actorId: 7 })
    assert.equal(descarte.estado, 'DESCARTADA')
    assert.equal(await prisma.asistenteDocumento.count(), documentosAntes)
    assert.equal((await prisma.asistenteHueco.findUniqueOrThrow({ where: { id: huecoDescartado.id } })).estado, 'DESCARTADO')
    console.log('OK descarte no publica nada')

    // Datos sintéticos para métricas agregadas.
    const conversacion = await prisma.asistenteConversacion.create({ data: { canal: 'PUBLICO', estado: 'ESCALADA', createdAt: new Date('2026-10-25T10:00:00Z'), updatedAt: new Date('2026-10-25T10:00:00Z') } })
    const mensaje = await prisma.asistenteMensaje.create({ data: { conversacionId: conversacion.id, rol: 'asistente', textoAnon: 'Respuesta de prueba', fuentes: [], createdAt: new Date('2026-10-25T10:01:00Z') } })
    await prisma.asistenteValoracion.create({ data: { mensajeId: mensaje.id, util: false, createdAt: new Date('2026-10-25T10:02:00Z') } })
    await prisma.asistenteEscalado.create({ data: { conversacionId: conversacion.id, motivo: 'ENFADO', dentroHorario: true, createdAt: new Date('2026-10-25T10:03:00Z') } })
    await prisma.asistenteLead.create({ data: { conversacionId: conversacion.id, tipo: 'HOGAR', codigoPostal: '[CP]', usuarios: 1, urgencia: 'BAJA', nombre: '[PERSONA]', telefono: '[TELEFONO]', puntuacion: 'FRIO', consentimiento: true, consentimientoVersion: 'prueba', borrarDespues: new Date('2027-10-25T10:00:00Z'), createdAt: new Date('2026-10-25T10:04:00Z'), updatedAt: new Date('2026-10-25T10:04:00Z') } })
    const metricas = await obtenerMetricasAnalitica(rangoAnalitica('2026-10-25', '2026-10-25', new Date('2026-10-26T12:00:00Z')))
    assert.ok(metricas.volumen.some(fila => fila.canal === 'PUBLICO' && fila.conversaciones >= 1))
    assert.ok(metricas.escalados.some(fila => fila.motivo === 'ENFADO' && fila.total >= 1))
    assert.ok(metricas.conversionLead.conLead >= 1)
    assert.ok(metricas.satisfaccion.noUtiles >= 1)
    console.log('OK analítica agregada con datos sintéticos')

    // Dos ejecuciones simultáneas sólo crean un informe diario.
    const ahoraInforme = new Date('2026-10-26T10:00:00Z')
    const [primero, segundo] = await Promise.all([
      generarInformeSiProcede('DIARIO', ahoraInforme, 7),
      generarInformeSiProcede('DIARIO', ahoraInforme, 8),
    ])
    assert.equal(Number(primero.generado) + Number(segundo.generado), 1)
    assert.equal(await prisma.asistenteInforme.count({ where: { tipo: 'DIARIO' } }), 1)
    console.log('OK informe diario idempotente con concurrencia')

    // Una huella descartada nunca se vuelve a proponer en un informe posterior.
    const preguntaRepetida = 'duda recurrente amatista'
    await prisma.asistenteHueco.create({ data: { preguntaAnon: preguntaRepetida, preguntaNorm: preguntaRepetida, canal: 'INTERNO', createdAt: new Date('2026-10-26T10:00:00Z'), updatedAt: new Date('2026-10-26T10:00:00Z') } })
    const informe27 = await generarInformeSiProcede('DIARIO', new Date('2026-10-27T10:00:00Z'), 7)
    const candidata = informe27.informe?.propuestas.find((fila: any) => fila.titulo.includes('amatista'))
    assert.ok(candidata, 'se deriva una propuesta por hueco recurrente')
    await cambiarEstadoPropuestaInforme(candidata!.id, 'DESCARTADA', 7)
    await prisma.asistenteHueco.create({ data: { preguntaAnon: preguntaRepetida, preguntaNorm: preguntaRepetida, canal: 'CLIENTE', createdAt: new Date('2026-10-27T10:00:00Z'), updatedAt: new Date('2026-10-27T10:00:00Z') } })
    const informe28 = await generarInformeSiProcede('DIARIO', new Date('2026-10-28T10:00:00Z'), 7)
    assert.ok(!informe28.informe?.propuestas.some((fila: any) => fila.titulo.includes('amatista')), 'una huella descartada no reaparece')
    console.log('OK huella descartada no reaparece')

    // Sin bandera habilitadora, el cron queda deliberadamente inerte.
    const respuestaCron = await cron.GET(new Request('http://localhost/api/cron/asistente-informe'))
    assert.equal(respuestaCron.status, 404)
    console.log('OK cron inerte sin flag')
    console.log('TEST_ASISTENTE_APRENDIZAJE_DB_OK')
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
