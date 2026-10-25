import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { config as cargarEntorno } from 'dotenv'

const raiz = process.cwd()
cargarEntorno({ path: '/home/ubuntu/asistente-ia-20261025/pruebas/.env.local-dev' })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')

async function main() {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    const identidad = await cliente.query("SELECT current_database() AS db LIMIT 1")
    assert.equal(identidad.rows[0]?.db, 'asistente_dev')
    const tablas = (await cliente.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'asistente_%' LIMIT 100")).rows.map(fila => fila.tablename)
    if (tablas.length) await cliente.query(`DROP TABLE ${tablas.map(tabla => `"${tabla.replaceAll('"', '""')}"`).join(', ')} CASCADE`)
    const funcion = (await cliente.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'asistente_%' LIMIT 100")).rows.map(fila => fila.proname)
    for (const nombre of funcion) await cliente.query(`DROP FUNCTION "${nombre.replaceAll('"', '""')}"() CASCADE`)
    await cliente.query(fs.readFileSync(path.join(raiz, 'prisma/migrations/20261025_asistente_ia/migration.sql'), 'utf8'))
    const n = (await cliente.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'asistente_%' LIMIT 1")).rows[0].n
    assert.equal(n, 15)
    await cliente.query("INSERT INTO asistente_config_cambios (campo,motivo) VALUES ('modo','prueba')")
    await assert.rejects(() => cliente.query("UPDATE asistente_config_cambios SET campo='x'"))
    const documentos = await cliente.query(`
      INSERT INTO asistente_documentos (titulo,espacio,tipo,estado,roles,tenant_cliente_id) VALUES
      ('Público','PUBLICO','FAQ','PUBLICADO',ARRAY[]::text[],NULL),
      ('Interno','INTERNO','FAQ','PUBLICADO',ARRAY['admin.soporte']::text[],NULL),
      ('Cliente A','CLIENTE','FAQ','PUBLICADO',ARRAY[]::text[],101),
      ('Cliente B','CLIENTE','FAQ','PUBLICADO',ARRAY[]::text[],202)
      RETURNING id::text
    `)
    const ids = documentos.rows.map(fila => fila.id)
    const versiones = [] as string[]
    for (const [indice, id] of ids.entries()) {
      const version = await cliente.query("INSERT INTO asistente_documento_versiones (documento_id,version,contenido,checksum) VALUES ($1,1,$2,$3) RETURNING id::text", [id, `secreto-${indice}`, `hash-${indice}`])
      versiones.push(version.rows[0].id)
      await cliente.query("INSERT INTO asistente_fragmentos (documento_id,version_id,orden,titulo,contenido,contenido_norm,espacio,roles,tenant_cliente_id) VALUES ($1,$2,0,$3,$4,$5,$6,$7,$8)", [id, versiones[indice], `T${indice}`, `texto exclusivo prueba aislamiento ${indice}`, `texto exclusivo prueba aislamiento ${indice}`, indice === 0 ? 'PUBLICO' : indice === 1 ? 'INTERNO' : 'CLIENTE', indice === 1 ? ['admin.soporte'] : [], indice >= 2 ? (indice === 2 ? 101 : 202) : null])
    }
    const publico = await cliente.query("SELECT contenido FROM asistente_fragmentos f JOIN asistente_documentos d ON d.id=f.documento_id WHERE f.activo AND d.estado='PUBLICADO' AND f.espacio=ANY($1::text[]) AND (f.espacio<>'INTERNO' OR cardinality(f.roles)=0 OR f.roles <@ $2::text[]) AND (f.espacio<>'CLIENTE' OR f.tenant_cliente_id=$3) LIMIT 50", [['PUBLICO'], [], null])
    assert.deepEqual(publico.rows.map(fila => fila.contenido), ['texto exclusivo prueba aislamiento 0'])
    const clienteA = await cliente.query("SELECT contenido FROM asistente_fragmentos f JOIN asistente_documentos d ON d.id=f.documento_id WHERE f.activo AND d.estado='PUBLICADO' AND f.espacio=ANY($1::text[]) AND (f.espacio<>'CLIENTE' OR f.tenant_cliente_id=$2) LIMIT 50", [['CLIENTE'], 101])
    assert.deepEqual(clienteA.rows.map(fila => fila.contenido), ['texto exclusivo prueba aislamiento 2'])
    await cliente.query("INSERT INTO asistente_conversaciones (id,canal) VALUES (gen_random_uuid(),'PUBLICO')")
    const conv = (await cliente.query("SELECT id::text FROM asistente_conversaciones LIMIT 1")).rows[0].id
    const mensaje = (await cliente.query("INSERT INTO asistente_mensajes (conversacion_id,rol,texto_anon,sin_fuente) VALUES ($1,'usuario','pregunta anonima',true) RETURNING id::text", [conv])).rows[0].id
    await cliente.query("INSERT INTO asistente_huecos (pregunta_anon,pregunta_norm,canal,conversacion_id,mensaje_id) VALUES ('pregunta anonima','pregunta anonima','PUBLICO',$1,$2) ON CONFLICT (pregunta_norm,canal) DO UPDATE SET veces=asistente_huecos.veces+1", [conv, mensaje])
    await cliente.query("INSERT INTO asistente_huecos (pregunta_anon,pregunta_norm,canal,conversacion_id,mensaje_id) VALUES ('pregunta anonima','pregunta anonima','PUBLICO',$1,$2) ON CONFLICT (pregunta_norm,canal) DO UPDATE SET veces=asistente_huecos.veces+1", [conv, mensaje])
    assert.equal((await cliente.query("SELECT veces FROM asistente_huecos WHERE pregunta_norm='pregunta anonima' LIMIT 1")).rows[0].veces, 2)
    await cliente.query("INSERT INTO asistente_rate_limit (clave_hash,ventana,contador) VALUES ('h',date_trunc('hour',now()),1) ON CONFLICT (clave_hash,ventana) DO UPDATE SET contador=asistente_rate_limit.contador+1")
    assert.equal((await cliente.query("SELECT contador FROM asistente_rate_limit WHERE clave_hash='h' LIMIT 1")).rows[0].contador, 1)
    console.log('TEST_ASISTENTE_CORE_DB_OK')
  } finally { await cliente.end() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
