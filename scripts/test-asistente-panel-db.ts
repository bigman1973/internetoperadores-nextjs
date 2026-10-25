import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { config as cargarEntorno } from 'dotenv'

const raiz = process.cwd()
cargarEntorno({ path: '/home/ubuntu/asistente-ia-20261025/pruebas/.env.panel' })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')

function archivo(relativo: string): string {
  return fs.readFileSync(path.join(raiz, relativo), 'utf8')
}

async function main() {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    await cliente.query('DROP SCHEMA public CASCADE')
    await cliente.query('CREATE SCHEMA public')
    await cliente.query(archivo('prisma/migrations/20261025_asistente_ia/migration.sql'))

    const tablas = await cliente.query("SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'asistente_%' LIMIT 1")
    const idGenerado = await cliente.query("INSERT INTO asistente_conversaciones (canal,visitante_hash) VALUES ('PUBLICO','hash-privado-completo') RETURNING id::text AS id")
    assert.equal(tablas.rows[0]?.total, 15)
    const conversacionId = idGenerado.rows[0]?.id as string
    assert.match(conversacionId, /^[0-9a-f-]{36}$/i)

    const mensaje = await cliente.query("INSERT INTO asistente_mensajes (conversacion_id,rol,texto_anon,fuentes,sin_fuente) VALUES ($1,'usuario','consulta [EMAIL]',$2::jsonb,true) RETURNING id::text AS id", [conversacionId, JSON.stringify([{ n: 1, titulo: 'Fuente de prueba' }])])
    await cliente.query("INSERT INTO asistente_valoraciones (mensaje_id,util,comentario_anon) VALUES ($1,false,'comentario anonimizado')", [mensaje.rows[0]?.id])
    await cliente.query("INSERT INTO asistente_leads (conversacion_id,tipo,codigo_postal,usuarios,urgencia,nombre,email,telefono,puntuacion,consentimiento,consentimiento_version,borrar_despues) VALUES ($1,'EMPRESA','28000',2,'ALTA','Persona de prueba','persona@example.test','600000000','CALIENTE',true,'prueba',now()+interval '1 month')", [conversacionId])
    await cliente.query("INSERT INTO asistente_escalados (conversacion_id,motivo,dentro_horario,contacto_nombre,contacto_email,consentimiento) VALUES ($1,'PETICION',true,'Persona de prueba','persona@example.test',true)", [conversacionId])
    await cliente.query("INSERT INTO asistente_escalados (conversacion_id,motivo,dentro_horario,consentimiento) VALUES ($1,'OTRO',false,false)", [conversacionId])

    const lead = await cliente.query('SELECT consentimiento,nombre,email,telefono,puntuacion,estado FROM asistente_leads LIMIT 1')
    const escalados = await cliente.query('SELECT consentimiento,contacto_nombre,contacto_email,estado FROM asistente_escalados ORDER BY created_at ASC LIMIT 2')
    const mensajeGuardado = await cliente.query('SELECT texto_anon,fuentes,sin_fuente FROM asistente_mensajes LIMIT 1')
    assert.equal(lead.rows[0]?.consentimiento, true)
    assert.equal(lead.rows[0]?.estado, 'NUEVO')
    assert.equal(escalados.rows[0]?.consentimiento, true)
    assert.equal(escalados.rows[1]?.consentimiento, false)
    assert.equal(escalados.rows[1]?.contacto_nombre, null)
    assert.equal(escalados.rows[1]?.contacto_email, null)
    assert.equal(mensajeGuardado.rows[0]?.sin_fuente, true)
    assert.match(mensajeGuardado.rows[0]?.texto_anon || '', /\[EMAIL\]/)

    const fuentes = mensajeGuardado.rows[0]?.fuentes as Array<{ n?: number; titulo?: string }>
    assert.equal(fuentes[0]?.n, 1)
    assert.equal(fuentes[0]?.titulo, 'Fuente de prueba')

    const contratos = [
      'app/api/admin/asistente/conversaciones/route.ts',
      'app/api/admin/asistente/conversaciones/[id]/route.ts',
      'app/api/admin/asistente/leads/route.ts',
      'app/api/admin/asistente/leads/[id]/route.ts',
      'app/api/admin/asistente/escalados/route.ts',
      'app/api/admin/asistente/escalados/[id]/route.ts',
      'app/api/admin/asistente/configuracion/historial/route.ts',
    ]
    for (const relativo of contratos) {
      const contenido = archivo(relativo)
      assert.match(contenido, /export const runtime = 'nodejs'/)
      assert.match(contenido, /export const dynamic = 'force-dynamic'/)
      assert.match(contenido, /jsonPrivado/)
      assert.doesNotMatch(contenido, /take:\s*limit\s*\+\s*1/)
    }
    const detalleConversacion = archivo('app/api/admin/asistente/conversaciones/[id]/route.ts')
    assert.match(detalleConversacion, /visitanteHashCorto/)
    assert.match(detalleConversacion, /const \{ visitanteHash, \.\.\.segura \} = conversacion/)
    assert.match(detalleConversacion, /visitanteHash\.slice\(0, 8\)/)
    const apiLeads = archivo('app/api/admin/asistente/leads/route.ts')
    assert.match(apiLeads, /consentimiento \? \{ nombre, empresa, email, telefono \} : null/)
    const apiLeadCambio = archivo('app/api/admin/asistente/leads/[id]/route.ts')
    assert.match(apiLeadCambio, /esMismoOrigen/)
    assert.match(apiLeadCambio, /leerJsonLimitado/)
    assert.match(apiLeadCambio, /nota:/)

    console.log('TEST_ASISTENTE_PANEL_DB_OK')
  } finally {
    await cliente.end()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
