import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { config as cargarEntorno } from 'dotenv'
import { Client } from 'pg'

const ENTORNO = '/home/ubuntu/asistente-fases-20261025/pruebas/.env.local-informes'
cargarEntorno({ path: ENTORNO, override: true })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')
const destino = new URL(url)
if (destino.hostname !== '127.0.0.1' || destino.pathname !== '/asistente_fases_informes') throw new Error('INFORMES_DB_GUARD')
process.env.DATABASE_URL = url
process.env.ASSISTANT_MODE = 'extractivo'
process.env.ASSISTANT_REPORT_ALLOW_LOCAL_TEST = 'true'
delete process.env.FINANCE_STAGING_SANDBOX
delete process.env.ASSISTANT_EMBEDDINGS_URL
delete process.env.ASSISTANT_LOCAL_BASE_URL
delete process.env.ASSISTANT_CRON_ENABLED
delete process.env.CRON_SECRET

async function limpiarAsistente(): Promise<void> {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    const identidad = await cliente.query('SELECT current_database() AS db, inet_server_addr()::text AS host LIMIT 1')
    assert.deepEqual(identidad.rows[0], { db: 'asistente_fases_informes', host: '127.0.0.1/32' })
    await cliente.query(`TRUNCATE TABLE
      asistente_informe_propuestas, asistente_informes, asistente_propuestas_aprendizaje,
      asistente_valoraciones, asistente_huecos, asistente_escalados, asistente_leads,
      asistente_mensajes, asistente_conversaciones, asistente_fragmentos,
      asistente_documento_versiones, asistente_documentos CASCADE`)
  } finally { await cliente.end() }
}

function texto(valor: unknown): string { return JSON.stringify(valor) }

async function main() {
  await limpiarAsistente()
  const { default: prisma } = await import('@/lib/prisma')
  const { indexarFuente } = await import('@/lib/asistente/ingesta')
  const { inicioDiaMadrid } = await import('@/lib/asistente/analitica')
  const { cambiarEstadoPropuestaInforme, ejecutarInformesProgramados, generarInformeSiProcede } = await import('@/lib/asistente/informes')
  try {
    // Madrid conserva la medianoche local correcta a ambos lados de DST.
    assert.equal(inicioDiaMadrid('2026-03-29').toISOString(), '2026-03-28T23:00:00.000Z')
    assert.equal(inicioDiaMadrid('2026-10-25').toISOString(), '2026-10-24T22:00:00.000Z')
    console.log('OK rangos Madrid CET/CEST')

    await indexarFuente({
      titulo: '[SINTETICO] Cobertura satelital',
      contenido: 'La conectividad por satélite se valida caso a caso con el equipo técnico y una revisión de cobertura.',
      tipo: 'FAQ', origen: 'prueba-informes:cobertura', urlFuente: '/recursos/cobertura',
    }, 77, { espacio: 'PUBLICO', estado: 'PUBLICADO' })

    const hora = new Date('2026-03-31T07:15:00.000Z') // 09:15 CEST, dentro del 31/03 Madrid.
    const conversacion = await prisma.asistenteConversacion.create({ data: { canal: 'PUBLICO', estado: 'ABIERTA', createdAt: hora, updatedAt: hora } })
    await prisma.asistenteMensaje.create({ data: { conversacionId: conversacion.id, rol: 'usuario', textoAnon: 'Necesito cobertura satélite. Mi correo es persona.sintetica@example.test y mi teléfono 600 000 000.', fuentes: [], createdAt: hora } })
    await prisma.asistenteHueco.create({ data: { preguntaAnon: 'Necesito cobertura satélite. Mi correo es persona.sintetica@example.test.', preguntaNorm: 'necesito cobertura satelite', canal: 'PUBLICO', veces: 4, createdAt: hora, updatedAt: hora } })
    await prisma.asistenteHueco.create({ data: { preguntaAnon: '¿Cuál es el precio y la permanencia?', preguntaNorm: 'precio y permanencia', canal: 'PUBLICO', veces: 2, createdAt: hora, updatedAt: hora } })
    await prisma.asistenteLead.create({ data: {
      conversacionId: conversacion.id, tipo: 'EMPRESA', codigoPostal: '[CP]', usuarios: 12, urgencia: 'ALTA',
      nombre: 'Persona sintetica', email: 'lead.sintetico@example.test', puntuacion: 'CALIENTE', estado: 'NUEVO',
      consentimiento: true, consentimientoVersion: 'prueba-sintetica', borrarDespues: new Date('2027-03-31T00:00:00.000Z'), createdAt: hora, updatedAt: hora,
    } })

    const relojDiario = new Date('2026-04-01T06:05:00.000Z') // 08:05 CEST; el diario es el 31/03.
    const [uno, dos] = await Promise.all([
      generarInformeSiProcede('DIARIO', relojDiario, 77),
      generarInformeSiProcede('DIARIO', relojDiario, 78),
    ])
    assert.equal(Number(uno.generado) + Number(dos.generado), 1)
    const diario = uno.informe || dos.informe
    assert.ok(diario, 'informe diario generado')
    const datos = diario.datos as any
    assert.equal(datos.version, 2)
    assert.equal(datos.zona, 'Europe/Madrid')
    assert.equal(datos.leadsCalientesPendientes.total, 1)
    assert.equal(datos.salvaguardas.sinPiiDeLeads, true)
    assert.equal(datos.salvaguardas.sinContactoConIAExterna, true)
    assert.ok(datos.temas.some((tema: any) => tema.preguntaNorm.includes('cobertura satelite')))
    const cobertura = datos.huecos.find((hueco: any) => hueco.pregunta.includes('cobertura satélite'))
    assert.ok(cobertura?.fuentes?.some((fuente: any) => fuente.titulo.includes('Cobertura satelital')), 'borrador respaldado por fuente pública')
    assert.ok(cobertura.propuesta.includes('conectividad por satélite'), 'respuesta extractiva fundamentada')
    const serializado = texto(datos)
    for (const pii of ['persona.sintetica@example.test', '600 000 000', 'lead.sintetico@example.test', 'Persona sintetica']) assert.ok(!serializado.includes(pii), `no persiste PII: ${pii}`)
    console.log('OK diario: 24h, tendencias 7/30, temas, ejemplos anonimizados, huecos fundados y leads agregados')

    const candidata = diario.propuestas.find((propuesta: any) => propuesta.titulo.includes('cobertura satelite'))
    assert.ok(candidata, 'propuesta de impacto/esfuerzo creada')
    await cambiarEstadoPropuestaInforme(candidata.id, 'DESCARTADA', 77)
    await assert.rejects(() => cambiarEstadoPropuestaInforme(candidata.id, 'HECHA', 77), /PROPUESTA_NO_PENDIENTE/)
    await prisma.asistenteHueco.create({ data: { preguntaAnon: 'Necesito cobertura satélite de nuevo', preguntaNorm: 'necesito cobertura satelite', canal: 'INTERNO', veces: 3, createdAt: new Date('2026-04-01T08:00:00.000Z'), updatedAt: new Date('2026-04-01T08:00:00.000Z') } })
    const siguiente = await generarInformeSiProcede('DIARIO', new Date('2026-04-02T06:05:00.000Z'), 77)
    assert.ok(!siguiente.informe?.propuestas.some((propuesta: any) => propuesta.titulo.includes('cobertura satelite')), 'una propuesta descartada no se repite')
    console.log('OK decisiones terminales y descartes no repetidos')

    // Tick controlado: lunes 08:05 CET genera diario + semanal; no depende del reloj del host.
    const tick = await ejecutarInformesProgramados(new Date('2026-11-02T07:05:00.000Z'), 'prueba-reloj')
    assert.deepEqual(tick.map(resultado => resultado.tipo), ['DIARIO', 'SEMANAL', 'MENSUAL'])
    assert.equal(tick.find(resultado => resultado.tipo === 'DIARIO')?.generado, true)
    assert.equal(tick.find(resultado => resultado.tipo === 'SEMANAL')?.generado, true)
    assert.equal(tick.find(resultado => resultado.tipo === 'MENSUAL')?.motivo, 'AUN_NO_PROCEDE')
    console.log('OK ejecutor con reloj controlado genera diario/semanal y respeta calendario Madrid')

    const salidaCli = execFileSync('./node_modules/.bin/tsx', ['scripts/asistente/ejecutar-informes.ts', '--target=local-test', '--now=2026-11-02T07:05:00.000Z'], {
      cwd: process.cwd(), env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    const linea = salidaCli.trim().split('\n').at(-1) || '{}'
    const cli = JSON.parse(linea)
    assert.equal(cli.ok, true)
    assert.equal(cli.target, 'local-test')
    assert.ok(cli.informes.every((fila: any) => fila.motivo === 'YA_EXISTE' || fila.motivo === 'AUN_NO_PROCEDE'))
    console.log('OK CLI nativo protegido e idempotente en BD local exclusiva')
    console.log('TEST_ASISTENTE_INFORMES_DB_OK')
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
