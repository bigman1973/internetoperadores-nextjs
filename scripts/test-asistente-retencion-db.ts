import assert from 'node:assert/strict'
import { config as cargarEntorno } from 'dotenv'
import { Client } from 'pg'

const ENTORNO = '/home/ubuntu/asistente-fases-20261025/pruebas/.env.local-seguridad'
cargarEntorno({ path: ENTORNO, override: true })
const url = process.env.ASSISTANT_TEST_DATABASE_URL
if (!url) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || parsed.pathname !== '/asistente_fases_seguridad') throw new Error('SEGURIDAD_DB_GUARD')
process.env.DATABASE_URL = url
process.env.ASSISTANT_MODE = 'extractivo'
process.env.NEXTAUTH_SECRET = 'prueba-local-seguridad-solo-fixtures-no-usar-en-produccion'
delete process.env.FINANCE_STAGING_SANDBOX

type Ids = { conversacion: string; lead?: string; escalado?: string; mensaje?: string }

async function crearContratoPrivacidad(cliente: Client): Promise<void> {
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS asistente_contactos_seguros (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      referencia_tipo TEXT NOT NULL CHECK (referencia_tipo IN ('LEAD','ESCALADO')),
      referencia_id UUID NOT NULL,
      conversacion_id UUID NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
      cifrado TEXT NOT NULL,
      key_version TEXT NOT NULL,
      borrar_despues TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT asistente_contactos_seguros_pkey PRIMARY KEY (id),
      CONSTRAINT asistente_contactos_seguros_referencia_tipo_referencia_id_key UNIQUE (referencia_tipo, referencia_id)
    );
    CREATE TABLE IF NOT EXISTS asistente_gestion_privacidad (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo TEXT NOT NULL CHECK (tipo IN ('PURGA','SUPRESION','REVOCACION')),
      objetivo_hash TEXT NOT NULL,
      actor_id INTEGER NULL,
      ejecutor TEXT NOT NULL,
      resultado JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS asistente_gestion_privacidad_created_at_idx ON asistente_gestion_privacidad(created_at);
  `)
}

async function limpiar(cliente: Client): Promise<void> {
  await cliente.query('TRUNCATE TABLE asistente_gestion_privacidad, asistente_contactos_seguros, asistente_valoraciones, asistente_huecos, asistente_escalados, asistente_leads, asistente_mensajes, asistente_conversaciones CASCADE')
}

async function conversacion(cliente: Client, opciones: { expira: Date; canal?: string } ): Promise<Ids> {
  const fila = await cliente.query<{ id: string }>("INSERT INTO asistente_conversaciones (id,canal,visitante_hash,borrar_despues) VALUES (gen_random_uuid(),$1,$2,$3) RETURNING id::text", [opciones.canal || 'PUBLICO', `fixture-retencion-${Math.random().toString(16).slice(2)}`, opciones.expira])
  return { conversacion: fila.rows[0].id }
}

async function lead(cliente: Client, conversacionId: string, expira: Date, consentimiento = true): Promise<string> {
  const fila = await cliente.query<{ id: string }>(`
    INSERT INTO asistente_leads (id,conversacion_id,tipo,codigo_postal,usuarios,urgencia,nombre,email,telefono,empresa,puntuacion,consentimiento,consentimiento_version,consentimiento_at,borrar_despues)
    VALUES (gen_random_uuid(),$1,'EMPRESA','28000',2,'MEDIA','FIXTURE_CONTACTO','fixture.contacto@example.test','600000000','FIXTURE EMPRESA','TEMPLADO',$2,'fixture-v1',CURRENT_TIMESTAMP,$3)
    RETURNING id::text
  `, [conversacionId, consentimiento, expira])
  return fila.rows[0].id
}

async function escalado(cliente: Client, conversacionId: string, consentimiento = true): Promise<string> {
  const fila = await cliente.query<{ id: string }>(`
    INSERT INTO asistente_escalados (id,conversacion_id,motivo,dentro_horario,contacto_nombre,contacto_email,contacto_telefono,consentimiento)
    VALUES (gen_random_uuid(),$1,'PETICION',true,'FIXTURE_ESCALADO','fixture.escalado@example.test','600000001',$2)
    RETURNING id::text
  `, [conversacionId, consentimiento])
  return fila.rows[0].id
}

async function mensajeYHueco(cliente: Client, conversacionId: string): Promise<string> {
  const mensaje = await cliente.query<{ id: string }>("INSERT INTO asistente_mensajes (id,conversacion_id,rol,texto_anon,sin_fuente) VALUES (gen_random_uuid(),$1,'usuario','consulta [EMAIL]',true) RETURNING id::text", [conversacionId])
  await cliente.query("INSERT INTO asistente_valoraciones (id,mensaje_id,util,comentario_anon) VALUES (gen_random_uuid(),$1,false,'comentario [TELEFONO]')", [mensaje.rows[0].id])
  await cliente.query("INSERT INTO asistente_huecos (id,pregunta_anon,pregunta_norm,canal,conversacion_id,mensaje_id) VALUES (gen_random_uuid(),'fixture anonimo','fixture anonimo','PUBLICO',$1,$2)", [conversacionId, mensaje.rows[0].id])
  return mensaje.rows[0].id
}

async function contacto(cliente: Client, referenciaTipo: 'LEAD' | 'ESCALADO', referenciaId: string, conversacionId: string, expira: Date): Promise<void> {
  await cliente.query('INSERT INTO asistente_contactos_seguros (referencia_tipo,referencia_id,conversacion_id,cifrado,key_version,borrar_despues) VALUES ($1,$2,$3,$4,$5,$6)', [referenciaTipo, referenciaId, conversacionId, 'fixture-cifrado-sin-pii', 'fixture-v1', expira])
}

async function existe(cliente: Client, tabla: string, id: string): Promise<boolean> {
  const resultado = await cliente.query(`SELECT EXISTS(SELECT 1 FROM ${tabla} WHERE id=$1::uuid) AS existe`, [id])
  return resultado.rows[0].existe === true
}

async function main(): Promise<void> {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    await crearContratoPrivacidad(cliente)
    await limpiar(cliente)
    const { previsualizarPurga, previsualizarDerecho, confirmarPrivacidad, nuevaClaveIdempotenciaPrivacidad, ErrorPrivacidad } = await import('@/lib/asistente/retencion')
    const ahora = new Date('2026-10-25T18:00:00.000Z')
    const vencido = new Date('2026-10-24T18:00:00.000Z')
    const futuro = new Date('2026-12-25T18:00:00.000Z')

    // PURGA: conversación vencida, dependencias con CASCADE y contactos cifrados nuevos.
    const caduca = await conversacion(cliente, { expira: vencido })
    const mensajeCaduca = await mensajeYHueco(cliente, caduca.conversacion)
    const leadCaduca = await lead(cliente, caduca.conversacion, vencido)
    const escaladoCaduca = await escalado(cliente, caduca.conversacion)
    await contacto(cliente, 'LEAD', leadCaduca, caduca.conversacion, vencido)
    await contacto(cliente, 'ESCALADO', escaladoCaduca, caduca.conversacion, vencido)
    const vigente = await conversacion(cliente, { expira: futuro })
    const leadVigente = await lead(cliente, vigente.conversacion, futuro)
    await contacto(cliente, 'LEAD', leadVigente, vigente.conversacion, futuro)

    const previewPurga = await previsualizarPurga({ actorId: 7, ahora })
    assert.equal(previewPurga.accion, 'PURGA')
    assert.equal(previewPurga.recuentos.conversaciones, 1)
    assert.equal(previewPurga.recuentos.mensajes, 1)
    assert.equal(previewPurga.recuentos.valoraciones, 1)
    assert.equal(previewPurga.recuentos.huecos, 1)
    assert.equal(previewPurga.recuentos.leads, 1)
    assert.equal(previewPurga.recuentos.escalados, 1)
    assert.equal(previewPurga.recuentos.contactos, 2)
    assert.ok(previewPurga.previewToken)

    const purga = await confirmarPrivacidad({ actorId: 7, previewToken: previewPurga.previewToken!, confirmacion: true, idempotencyKey: nuevaClaveIdempotenciaPrivacidad(), ejecutor: 'test.retencion' })
    assert.equal(purga.idempotente, false)
    assert.equal(await existe(cliente, 'asistente_conversaciones', caduca.conversacion), false)
    assert.equal(await existe(cliente, 'asistente_mensajes', mensajeCaduca), false)
    assert.equal(await existe(cliente, 'asistente_leads', leadCaduca), false)
    assert.equal(await existe(cliente, 'asistente_escalados', escaladoCaduca), false)
    assert.equal(await existe(cliente, 'asistente_conversaciones', vigente.conversacion), true)
    assert.equal(await existe(cliente, 'asistente_leads', leadVigente), true)
    assert.equal((await cliente.query('SELECT count(*)::int AS total FROM asistente_contactos_seguros')).rows[0].total, 1)

    // Repetir una purga ya ejecutada conserva la semántica idempotente y deja recibo sin PII.
    const previewRepetida = await previsualizarPurga({ actorId: 7, ahora })
    const repetida = await confirmarPrivacidad({ actorId: 7, previewToken: previewRepetida.previewToken!, confirmacion: true, idempotencyKey: nuevaClaveIdempotenciaPrivacidad(), ejecutor: 'test.retencion' })
    assert.equal(repetida.idempotente, true)
    const auditorias = await cliente.query<{ objetivo_hash: string; resultado: unknown }>('SELECT objetivo_hash,resultado FROM asistente_gestion_privacidad ORDER BY created_at ASC')
    assert.equal(auditorias.rows.length, 2)
    for (const auditoria of auditorias.rows) {
      assert.match(auditoria.objetivo_hash, /^[a-f0-9]{64}$/)
      const serializado = JSON.stringify(auditoria.resultado)
      assert.doesNotMatch(serializado, /fixture\.contacto@example\.test|600000000|FIXTURE_CONTACTO/i)
      assert.match(serializado, /recuentos/)
    }

    // REVOCACIÓN: anonimiza la proyección del asistente y elimina sólo el contacto seguro asociado.
    const revocable = await conversacion(cliente, { expira: futuro })
    const leadRevocable = await lead(cliente, revocable.conversacion, futuro, true)
    await contacto(cliente, 'LEAD', leadRevocable, revocable.conversacion, futuro)
    const previewRevocar = await previsualizarDerecho({ actorId: 7, accion: 'REVOCACION', objetivoTipo: 'LEAD', objetivoId: leadRevocable })
    assert.equal(previewRevocar.recuentos.leads, 1)
    assert.equal(previewRevocar.recuentos.contactos, 1)
    const revocada = await confirmarPrivacidad({ actorId: 7, previewToken: previewRevocar.previewToken!, confirmacion: true, idempotencyKey: nuevaClaveIdempotenciaPrivacidad(), ejecutor: 'test.derechos' })
    assert.equal(revocada.accion, 'REVOCACION')
    const leadAnonimo = await cliente.query('SELECT nombre,email,telefono,empresa,consentimiento,estado FROM asistente_leads WHERE id=$1::uuid', [leadRevocable])
    assert.deepEqual(leadAnonimo.rows[0], { nombre: '[CONTACTO_REVOCADO]', email: null, telefono: null, empresa: null, consentimiento: true, estado: 'DESCARTADO' })
    assert.equal((await cliente.query('SELECT count(*)::int AS total FROM asistente_contactos_seguros WHERE referencia_id=$1::uuid', [leadRevocable])).rows[0].total, 0)
    const previewRevocada = await previsualizarDerecho({ actorId: 7, accion: 'REVOCACION', objetivoTipo: 'LEAD', objetivoId: leadRevocable })
    assert.equal(previewRevocada.recuentos.leads, 0)
    assert.equal(previewRevocada.recuentos.contactos, 0)

    // SUPRESIÓN dirigida: elimina sólo datos del asistente vinculados a la conversación.
    const suprimir = await conversacion(cliente, { expira: futuro })
    await mensajeYHueco(cliente, suprimir.conversacion)
    const leadSuprimir = await lead(cliente, suprimir.conversacion, futuro)
    await contacto(cliente, 'LEAD', leadSuprimir, suprimir.conversacion, futuro)
    const previewSuprimir = await previsualizarDerecho({ actorId: 7, accion: 'SUPRESION', objetivoTipo: 'CONVERSACION', objetivoId: suprimir.conversacion })
    assert.equal(previewSuprimir.recuentos.conversaciones, 1)
    const suprimida = await confirmarPrivacidad({ actorId: 7, previewToken: previewSuprimir.previewToken!, confirmacion: true, idempotencyKey: nuevaClaveIdempotenciaPrivacidad(), ejecutor: 'test.derechos' })
    assert.equal(suprimida.idempotente, false)
    assert.equal(await existe(cliente, 'asistente_conversaciones', suprimir.conversacion), false)

    // Revalidación: una preview no puede confirmar si su conjunto vencido cambió.
    const obsoleta = await conversacion(cliente, { expira: futuro })
    const leadObsoleta = await lead(cliente, obsoleta.conversacion, vencido)
    const previewObsoleta = await previsualizarPurga({ actorId: 7, ahora })
    await cliente.query('UPDATE asistente_leads SET borrar_despues=$1 WHERE id=$2::uuid', [futuro, leadObsoleta])
    await assert.rejects(
      () => confirmarPrivacidad({ actorId: 7, previewToken: previewObsoleta.previewToken!, confirmacion: true, idempotencyKey: nuevaClaveIdempotenciaPrivacidad(), ejecutor: 'test.obsoleta' }),
      (error: unknown) => error instanceof ErrorPrivacidad && error.codigo === 'PREVISUALIZACION_OBSOLETA',
    )
    assert.equal(await existe(cliente, 'asistente_conversaciones', obsoleta.conversacion), true)

    console.log('TEST_ASISTENTE_RETENCION_DB_OK')
  } finally {
    await cliente.end()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
