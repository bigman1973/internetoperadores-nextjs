/**
 * Regresión de relevancia pública. Usa únicamente la BD local vacía indicada
 * en .env.local-recuperacion; jamás staging/producción. El corpus es pequeño
 * y explícito: capítulos WEB aprobados, tarifas distractoras y un canario
 * INTERNO para probar que la ACL se aplica antes de cualquier ranking.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { config as cargarEntorno } from 'dotenv'

const raiz = process.cwd()
const entorno = '/home/ubuntu/asistente-fases-20261025/pruebas/.env.local-recuperacion'
cargarEntorno({ path: entorno })
const url = process.env.ASSISTANT_PUBLIC_RELEVANCE_DATABASE_URL || process.env.ASSISTANT_TEST_DATABASE_URL
if (!url) throw new Error('ASSISTANT_TEST_DATABASE_URL_REQUERIDA')
// Si la fixture de recuperación compartida ya tiene evidencias, el runner debe
// suministrar ASSISTANT_PUBLIC_RELEVANCE_DATABASE_URL hacia otra base local
// vacía. Nunca se intenta crear una base ni se toca staging/producción.
const conexion = new URL(url)
if (!['127.0.0.1', 'localhost', '::1'].includes(conexion.hostname) || !/^\/asistente_[a-z0-9_]+$/i.test(conexion.pathname)) throw new Error('RELEVANCE_LOCAL_DB_GUARD')
process.env.DATABASE_URL = url
process.env.ASSISTANT_MODE = 'extractivo'
process.env.ASSISTANT_PUBLIC_ENABLED = 'true'
process.env.FINANCE_STAGING_SANDBOX = '0'
delete process.env.ASSISTANT_EMBEDDINGS_URL
delete process.env.ASSISTANT_LOCAL_BASE_URL

type Caso = {
  nombre: string
  pregunta: string
  fuente: boolean
  contiene?: string[]
  excluye?: string[]
  titulo?: string
  escalar?: boolean
}

const casos: Caso[] = [
  // 3 consultas observadas (Claude).
  { nombre: 'claude-informe-cero-riesgos-precio', pregunta: '¿Qué es el Informe Cero Riesgos y cuánto cuesta?', fuente: true, contiene: ['auditoria', '790 €'], titulo: 'Informe Cero Riesgos', excluye: ['cm-fibra', '45 €'] },
  { nombre: 'claude-backup-5g-caida-fibra', pregunta: '¿Ofrecéis backup de conexión por 5G si se cae la fibra?', fuente: true, contiene: ['backup automático', '5g'], titulo: 'Conectividad con respaldo', excluye: ['cm-fibra', '45 €', 'tarifa'] },
  { nombre: 'claude-precio-backup-no-publicado', pregunta: '¿Qué precio fijo tiene el backup 5G?', fuente: true, contiene: ['no publica ese dato'], titulo: 'Conectividad con respaldo', excluye: ['45 €', '60 €', '75 €'], escalar: true },

  // 23 paráfrasis y negativas derivadas de capítulos WEB públicos.
  { nombre: 'cero-definicion', pregunta: '¿En qué consiste Cero Riesgos?', fuente: true, contiene: ['auditoria estratégica'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-precio', pregunta: '¿Cuál es el precio publicado de Cero Riesgos?', fuente: true, contiene: ['790 €'], titulo: 'Informe Cero Riesgos', excluye: ['45 €'] },
  { nombre: 'cero-coste-parafrasis', pregunta: '¿Qué importe tiene la auditoría de riesgo cero?', fuente: true, contiene: ['790 €'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-analiza', pregunta: '¿Qué revisa el informe de riesgo cero?', fuente: true, contiene: ['telecomunicaciones'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-vulnerabilidades', pregunta: '¿La auditoría identifica vulnerabilidades?', fuente: true, contiene: ['vulnerabilidades'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-sin-interrupcion', pregunta: '¿El análisis de Cero Riesgos detiene la actividad?', fuente: true, contiene: ['sin interrumpir'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-prioridades', pregunta: '¿Cómo se ordenan las recomendaciones de Cero Riesgos?', fuente: true, contiene: ['impacto y urgencia'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-entrega', pregunta: '¿Cuándo entregáis el informe de Cero Riesgos?', fuente: true, contiene: ['48 horas'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-videollamada', pregunta: '¿Explicáis el resultado de Cero Riesgos por videollamada?', fuente: true, contiene: ['videollamada'], titulo: 'Informe Cero Riesgos' },
  { nombre: 'cero-descuento-ausente', pregunta: '¿Qué descuento tiene el Informe Cero Riesgos?', fuente: true, contiene: ['no publica ese dato'], titulo: 'Informe Cero Riesgos', escalar: true },
  { nombre: 'cero-iva-no-inferido', pregunta: '¿Los 790 € de Cero Riesgos incluyen IVA?', fuente: true, contiene: ['790 €', 'no indica'], titulo: 'Informe Cero Riesgos' },

  { nombre: 'backup-fibra-falla', pregunta: 'Si mi fibra falla, ¿entra una conexión de respaldo?', fuente: true, contiene: ['5g'], titulo: 'Conectividad con respaldo', excluye: ['cm-fibra'] },
  { nombre: 'backup-contingencia', pregunta: 'Necesito continuidad de Internet cuando hay un corte de fibra.', fuente: true, contiene: ['backup automático'], titulo: 'Conectividad con respaldo' },
  { nombre: 'backup-failover', pregunta: '¿Tenéis failover automático para que no se caiga el servicio?', fuente: true, contiene: ['failover automático'], titulo: 'Conectividad con respaldo' },
  { nombre: 'backup-tecnologias', pregunta: '¿Qué alternativa se activa si se interrumpe la línea principal?', fuente: true, contiene: ['5g', 'wimax'], titulo: 'Conectividad con respaldo' },
  { nombre: 'backup-conmutacion', pregunta: '¿Cuál es el tiempo de conmutación del failover?', fuente: true, contiene: ['30 segundos'], titulo: 'Conectividad con respaldo' },
  { nombre: 'backup-monitorizacion', pregunta: '¿La conexión redundante tiene monitorización?', fuente: true, contiene: ['monitorización'], titulo: 'Conectividad con respaldo' },
  { nombre: 'backup-velocidad-ausente', pregunta: '¿Qué velocidad garantizada da el respaldo por 5G?', fuente: true, contiene: ['no publica ese dato'], titulo: 'Conectividad con respaldo', excluye: ['1 gbps', '600 mbps'], escalar: true },
  { nombre: 'backup-fibra-tarifa-incidental', pregunta: 'Tengo fibra y quiero 5G de respaldo si se cae.', fuente: true, contiene: ['backup automático'], titulo: 'Conectividad con respaldo', excluye: ['cm-fibra', '45 €', '60 €', '75 €'] },

  { nombre: 'negativa-fibra-sin-respaldo', pregunta: '¿Cuánto cuesta la fibra CM-FIBRA1000?', fuente: false, contiene: ['no tengo esa información'], escalar: true },
  { nombre: 'negativa-5g-incidental', pregunta: '¿Qué tarifa de 5G para móvil tenéis?', fuente: false, contiene: ['no tengo esa información'], escalar: true },
  { nombre: 'negativa-palabra-informe', pregunta: 'Quiero un informe sobre facturación, ¿qué vale?', fuente: false, contiene: ['no tengo esa información'], escalar: true },
  { nombre: 'negativa-incidental-fibra', pregunta: '¿La tarifa doméstica de fibra incluye instalación?', fuente: false, contiene: ['no tengo esa información'], escalar: true },
]

function normal(texto: string): string { return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }
function contiene(texto: string, termino: string): boolean { return normal(texto).includes(normal(termino)) }

async function asegurarBaseVacia(cliente: Client): Promise<void> {
  const tablas = await cliente.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'asistente_%' LIMIT 100")
  if (!tablas.rows.length) return
  for (const tabla of tablas.rows) {
    const n = await cliente.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${tabla.tablename}" LIMIT 1`)
    if (n.rows[0]?.n) throw new Error(`RELEVANCE_DB_NO_VACIA:${tabla.tablename}`)
  }
}

async function recrearEsquemaLocal(cliente: Client): Promise<void> {
  await asegurarBaseVacia(cliente)
  const tablas = await cliente.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'asistente_%' LIMIT 100")
  if (tablas.rows.length) await cliente.query(`DROP TABLE ${tablas.rows.map(fila => `"${fila.tablename.replaceAll('"', '""')}"`).join(', ')} CASCADE`)
  const funciones = await cliente.query<{ proname: string }>("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'asistente_%' LIMIT 100")
  for (const funcion of funciones.rows) await cliente.query(`DROP FUNCTION "${funcion.proname.replaceAll('"', '""')}"() CASCADE`)
  await cliente.query(fs.readFileSync(path.join(raiz, 'prisma/migrations/20261025_asistente_ia/migration.sql'), 'utf8'))
}

async function main(): Promise<void> {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    const identidad = await cliente.query<{ db: string }>('SELECT current_database() AS db LIMIT 1')
    assert.equal(identidad.rows[0]?.db, conexion.pathname.slice(1))
    await recrearEsquemaLocal(cliente)
  } finally {
    await cliente.end()
  }

  const { default: prisma } = await import('@/lib/prisma')
  const { indexarFuente } = await import('@/lib/asistente/ingesta')
  const { buscar } = await import('@/lib/asistente/retrieval')
  const { responderMensaje } = await import('@/lib/asistente/responder')
  const publico = { espacios: ['PUBLICO' as const], roles: [], tenantId: null, usuarioId: null }
  try {
    const web = async (titulo: string, contenido: string, origen: string) => indexarFuente({ titulo, contenido, tipo: 'WEB', origen, urlFuente: '/soluciones' }, undefined, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
    await web('Informe Cero Riesgos — auditoría estratégica', 'El Informe Cero Riesgos es una auditoría estratégica de telecomunicaciones, ciberseguridad, copias de seguridad y vulnerabilidades técnicas. Entrega un diagnóstico claro, ordenado por prioridades.', 'web:cero-riesgos:definicion')
    await web('Informe Cero Riesgos — precio publicado', 'El precio publicado del Informe Cero Riesgos es 790 €. La publicación no indica si el importe incluye IVA.', 'web:cero-riesgos:precio')
    await web('Informe Cero Riesgos — proceso y entrega', 'El análisis se realiza sin interrumpir la actividad. Las recomendaciones se ordenan por impacto y urgencia. El informe se entrega en un máximo de 48 horas y se explica por videollamada.', 'web:cero-riesgos:proceso')
    await web('Conectividad con respaldo — backup automático', 'La línea principal tiene backup automático. Si falla o se cae la fibra, se activa 5G, WiMAX o satélite sin intervención manual. Incluye failover automático para continuidad de servicio.', 'web:conectividad:backup')
    await web('Conectividad con respaldo — SLA', 'La solución de conectividad con respaldo incluye monitorización 24/7. El tiempo de conmutación publicado para el failover es inferior a 30 segundos. No se publica una velocidad garantizada ni un precio fijo.', 'web:conectividad:sla')
    await web('Tecnologías para hogar', 'Para hogar se pueden estudiar fibra FTTH, 4G y 5G según cobertura. Esta página no describe backup automático ni failover.', 'web:hogar:tecnologias')

    // Dato de catálogo deliberadamente marcado como PUBLICADO: debe quedar
    // fuera por doble defensa aunque FTS lo recupere por fibra/5G/precio.
    for (const [nombre, precio] of [['CM-FIBRA1000 MásOrange', '45'], ['CM-FIBRA600 MásOrange', '60'], ['CM-FIBRA300 MásOrange', '75']] as const) {
      const fuente = { titulo: nombre, contenido: `Tarifa ${nombre} de fibra con 5G. Precio ${precio} €.`, tipo: 'TARIFA' as const, origen: `tarifa:${nombre}`, urlFuente: '/tarifas' }
      await assert.rejects(() => indexarFuente(fuente, undefined, { espacio: 'PUBLICO', estado: 'PUBLICADO' }), /FUENTE_NO_APTA/)
      // Corrupt fixture deliberately imitates historical PUBLICADO mistakes;
      // only this EMPTY LOCAL database is writable by this test.
      const insertada = await indexarFuente(fuente, undefined, { espacio: 'INTERNO', estado: 'PUBLICADO' })
      await prisma.asistenteDocumento.update({ where: { id: insertada.documentoId! }, data: { espacio: 'PUBLICO' } })
      await prisma.asistenteFragmento.updateMany({ where: { documentoId: insertada.documentoId! }, data: { espacio: 'PUBLICO' } })
    }
    await indexarFuente({ titulo: 'Canario interno de aislamiento', contenido: 'CROMOZAFIROINTRUSO: precio interno confidencial 1 €.', tipo: 'MD', origen: 'interno:canario', urlFuente: null }, 1, { espacio: 'INTERNO', estado: 'PUBLICADO' })

    const noVisible = await buscar('CROMOZAFIROINTRUSO', publico)
    assert.equal(noVisible.length, 0, 'ACL SQL: ningún candidato INTERNO llega al reranker público')
    const tarifas = await buscar('CM-FIBRA1000 fibra 5G precio', publico)
    assert.equal(tarifas.length, 0, 'un identificador de tarifa no se sustituye por palabras incidentales')

    for (const [indice, caso] of casos.entries()) {
      const respuesta = await responderMensaje({ mensaje: caso.pregunta, contexto: 'PUBLICO', visitanteHash: `relevance-${indice}` })
      assert.equal(!respuesta.sinFuente, caso.fuente, `${caso.nombre}: fuente`)
      if (caso.escalar !== undefined) assert.equal(respuesta.escalar, caso.escalar, `${caso.nombre}: escalado`)
      for (const esperado of caso.contiene || []) assert.ok(contiene(respuesta.respuesta, esperado), `${caso.nombre}: falta «${esperado}» en ${respuesta.respuesta}`)
      for (const prohibido of caso.excluye || []) assert.ok(!contiene(respuesta.respuesta, prohibido), `${caso.nombre}: aparece «${prohibido}» en ${respuesta.respuesta}`)
      if (caso.titulo) assert.ok(respuesta.fuentes.some(fuente => contiene(fuente.titulo, caso.titulo!)), `${caso.nombre}: no cita ${caso.titulo}`)
      assert.ok(respuesta.fuentes.length <= 3, `${caso.nombre}: máximo tres fuentes`)
      assert.equal(new Set(respuesta.fuentes.map(fuente => fuente.documentoId)).size, respuesta.fuentes.length, `${caso.nombre}: no repite documento`)
      assert.ok(!respuesta.fuentes.some(fuente => /CM-FIBRA|Canario interno/i.test(fuente.titulo)), `${caso.nombre}: fuente tarifaria/interna indebida`)
      console.log(`OK ${caso.nombre}`)
    }
    console.log(`TEST_ASISTENTE_PUBLIC_RELEVANCE_DB_OK casos=${casos.length}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
