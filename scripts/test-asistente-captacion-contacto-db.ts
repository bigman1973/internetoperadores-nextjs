import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { config as cargarEntorno } from 'dotenv'

cargarEntorno({ path: '/home/ubuntu/asistente-fases-20261025/pruebas/.env.local-captacion' })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/asistente_fases_captacion') throw new Error('LOCAL_DB_GUARD')
process.env.DATABASE_URL = url
process.env.ASSISTANT_MODE = 'extractivo'
process.env.NEXTAUTH_SECRET = 'secreto-local-aislado-de-pruebas-contacto-seguro'
delete process.env.FINANCE_STAGING_SANDBOX

async function main() {
  const { default: prisma } = await import('@/lib/prisma')
  const { cifrarContacto, descifrarContacto, guardarContactoSeguro, leerContactoSeguro } = await import('@/lib/asistente/contacto-seguro')
  try {
    const identidad = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
    assert.equal(identidad[0]?.db, 'asistente_fases_captacion')

    await prisma.asistenteContactoSeguro.deleteMany()
    await prisma.asistenteGestionPrivacidad.deleteMany()
    await prisma.asistenteConversacion.deleteMany({ where: { visitanteHash: { startsWith: 'fixture-captacion-' } } })

    const conversacion = await prisma.asistenteConversacion.create({ data: { canal: 'PUBLICO', visitanteHash: `fixture-captacion-${randomUUID()}` } })
    const contexto = { referenciaTipo: 'LEAD' as const, referenciaId: randomUUID(), conversacionId: conversacion.id }
    const datos = { nombre: 'Ana Prueba', email: 'ana.prueba@example.test', telefono: '600123123', empresa: 'Empresa Sintética S.L.' }
    const borrarDespues = new Date('2027-10-25T08:00:00.000Z')

    const payload = cifrarContacto(datos, contexto)
    assert.ok(!payload.includes(datos.email) && !payload.includes(datos.telefono) && !payload.includes(datos.nombre))
    assert.deepEqual(descifrarContacto(payload, contexto), datos)
    assert.throws(() => descifrarContacto(payload, { ...contexto, referenciaId: randomUUID() }), /CONTACTO_CIFRADO_NO_VERIFICADO/)

    await guardarContactoSeguro(prisma, { ...contexto, datos, borrarDespues })
    await guardarContactoSeguro(prisma, { ...contexto, datos: { ...datos, telefono: '600321321' }, borrarDespues })
    const filas = await prisma.asistenteContactoSeguro.findMany({ where: { referenciaTipo: 'LEAD', referenciaId: contexto.referenciaId }, select: { cifrado: true, keyVersion: true, conversacionId: true } })
    assert.equal(filas.length, 1, 'el contacto se conserva de forma idempotente por referencia')
    assert.equal(filas[0]?.keyVersion, 'contacto-v1')
    assert.equal(filas[0]?.conversacionId, contexto.conversacionId)
    assert.ok(!filas[0]?.cifrado.includes('ana.prueba@example.test') && !filas[0]?.cifrado.includes('600321321'))
    assert.deepEqual(await leerContactoSeguro(prisma, contexto), { ...datos, telefono: '600321321' })
    assert.equal(await leerContactoSeguro(prisma, { ...contexto, conversacionId: randomUUID() }), null)

    const resultado = { eliminados: 1, contactosRevocados: 1 }
    await prisma.asistenteGestionPrivacidad.create({ data: { tipo: 'REVOCACION', objetivoHash: 'fixture-contacto-sin-pii', ejecutor: 'test-local', resultado } })
    const auditoria = await prisma.asistenteGestionPrivacidad.findFirst({ orderBy: { createdAt: 'desc' } })
    assert.deepEqual(auditoria?.resultado, resultado)
    assert.ok(!JSON.stringify(auditoria).includes(datos.email))

    console.log('TEST_ASISTENTE_CAPTACION_CONTACTO_DB_OK')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
