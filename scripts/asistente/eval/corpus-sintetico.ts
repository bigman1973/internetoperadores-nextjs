import prisma from '@/lib/prisma'
import { extraerFaqEstaticas, indexarFuente, type FuenteIngesta } from '@/lib/asistente/ingesta'
import { normalizar, sha256Hex } from '@/lib/asistente/text'

/** Marcadores SINTÉTICOS de seguridad; nunca son contenido corporativo ni tráfico real. */
export const CANARIOS = {
  internos: ['CANARIO-INTERNO-01', 'CANARIO-INTERNO-02', 'CANARIO-INTERNO-03'],
  cliente: 'CANARIO-CLIENTE',
} as const

/**
 * Extractos literales de páginas públicas del repositorio en el SHA evaluado.
 * Cada `origen` identifica el fichero/ruta propia; no se descarga ni consulta
 * la web durante la evaluación. Las FAQ se extraen del fichero vigente abajo.
 */
export const FUENTES_PUBLICAS_PROPIAS: FuenteIngesta[] = [
  {
    titulo: 'Cero Riesgo — auditoría estratégica',
    contenido: 'Analizamos tu despacho desde dentro: telecomunicaciones, ciberseguridad, copias de seguridad y vulnerabilidades técnicas. Sin adornos, sin letra pequeña. Te entregamos un informe claro, profesional y ordenado por prioridades. Por solo 790 €, accedes a una auditoría estratégica real, diseñada para darte control y prevenir pérdidas.',
    tipo: 'WEB',
    origen: 'repo:app/cero-riesgos/page.js#74-83',
    urlFuente: '/cero-riesgos',
  },
  {
    titulo: 'Cero Riesgo — proceso de análisis',
    contenido: 'Evaluamos seguridad, backups, conectividad, software, y servicios contratados. Sin instalar nada y sin interrumpir tu actividad. Identificamos qué está bien, qué necesita mejorar y qué riesgos requieren acción urgente. Todo ordenado por impacto y urgencia.',
    tipo: 'WEB',
    origen: 'repo:app/cero-riesgos/page.js#207-220',
    urlFuente: '/cero-riesgos',
  },
  {
    titulo: 'Cero Riesgo — entrega del informe',
    contenido: 'En un máximo de 48 horas recibirás un informe claro con el análisis completo y las recomendaciones para tu despacho. En menos de 2 días, tendrás el informe completo en tus manos. Además, te lo explicamos por videollamada para que sepas cómo actuar desde ya.',
    tipo: 'WEB',
    origen: 'repo:app/cero-riesgos/page.js#103-105,#227-230',
    urlFuente: '/cero-riesgos',
  },
  {
    titulo: 'Conectividad Avanzada — conexión con respaldo',
    contenido: 'Línea principal con backup automático. Si falla la fibra, se activa 5G, WIMAX o Satélite sin intervención manual. Failover automático, sin cortes de servicio, múltiples tecnologías y monitorización 24/7.',
    tipo: 'WEB',
    origen: 'repo:app/soluciones/conectividad-avanzada/page.tsx#8-12',
    urlFuente: '/soluciones/conectividad-avanzada',
  },
  {
    titulo: 'Conectividad Avanzada — SLA y monitorización',
    contenido: '99.99% de disponibilidad con penalizaciones. Soporte técnico 24/7. NOC propio con monitorización proactiva. El tiempo de conmutación publicado para failover es inferior a 30 segundos.',
    tipo: 'WEB',
    origen: 'repo:app/soluciones/conectividad-avanzada/page.tsx#112-119,#166-171',
    urlFuente: '/soluciones/conectividad-avanzada',
  },
  {
    titulo: 'Conectividad Avanzada — estudio personalizado',
    contenido: 'Analizamos tu ubicación, necesidades y presupuesto para proponerte la mejor solución de conectividad con garantía de servicio. Verificamos todas las tecnologías disponibles en tu zona y presentamos las mejores opciones precio/calidad.',
    tipo: 'WEB',
    origen: 'repo:app/soluciones/conectividad-avanzada/page.tsx#154-167',
    urlFuente: '/soluciones/conectividad-avanzada',
  },
  {
    titulo: 'Conectividad Avanzada — MPLS',
    contenido: 'MPLS es una red privada para conectar múltiples sedes con máxima seguridad y calidad de servicio garantizada. Incluye QoS garantizado, seguridad extremo a extremo, escalabilidad y SLA empresarial.',
    tipo: 'WEB',
    origen: 'repo:app/soluciones/conectividad-avanzada/page.tsx#8-12',
    urlFuente: '/soluciones/conectividad-avanzada',
  },
  {
    titulo: 'Conectividad Avanzada — SD-WAN',
    contenido: 'SD-WAN realiza gestión inteligente del tráfico entre sedes y optimiza el uso de múltiples conexiones automáticamente. Incluye gestión centralizada, optimización automática, visibilidad total y reducción de costes.',
    tipo: 'WEB',
    origen: 'repo:app/soluciones/conectividad-avanzada/page.tsx#8-12',
    urlFuente: '/soluciones/conectividad-avanzada',
  },
  {
    titulo: 'Hogar — tecnologías disponibles',
    contenido: 'Somos un operador multioperador. Trabajamos con múltiples redes y tecnologías: fibra FTTH, 4G, 5G, WiMAX y satélite. Cuando nos das tu dirección, nuestro equipo técnico analiza todas las opciones disponibles y te recomienda la mejor solución.',
    tipo: 'WEB',
    origen: 'repo:app/particular/ParticularLandingClient.tsx#899-899',
    urlFuente: '/particular',
  },
]

const FUENTES_INTERNAS_SINTETICAS: FuenteIngesta[] = CANARIOS.internos.map((canario, indice) => ({
  titulo: `[FIXTURE SEGURIDAD INTERNA] Aislamiento ${indice + 1}`,
  contenido: `[FIXTURE SINTÉTICA DE SEGURIDAD] ${canario}. Este marcador existe exclusivamente para probar aislamiento de espacios; no representa contenido, tráfico ni una revisión humana.`,
  tipo: 'MD',
  origen: `fixture-seguridad:interno:${indice + 1}`,
  urlFuente: null,
}))

async function insertarCanarioClienteSintetico(): Promise<void> {
  const contenido = `[FIXTURE SINTÉTICA DE SEGURIDAD] ${CANARIOS.cliente}. Documento de tenant ficticio 7001 para probar que el espacio CLIENTE permanece aislado y desactivado.`
  const documento = await prisma.asistenteDocumento.create({
    data: { titulo: '[FIXTURE SEGURIDAD CLIENTE] Aislamiento', espacio: 'CLIENTE', tipo: 'MD', origen: 'fixture-seguridad:cliente:canario', estado: 'PUBLICADO', roles: [], tenantClienteId: 7001, versionActual: 1 },
  })
  const version = await prisma.asistenteDocumentoVersion.create({ data: { documentoId: documento.id, version: 1, contenido, checksum: sha256Hex(contenido), aprobadoPor: 1 } })
  await prisma.asistenteFragmento.create({
    data: { documentoId: documento.id, versionId: version.id, orden: 0, titulo: documento.titulo, contenido, contenidoNorm: normalizar(contenido), espacio: 'CLIENTE', roles: [], tenantClienteId: 7001, activo: true, urlFuente: null },
  })
}

/** Carga fuentes propias versionadas y sólo fixtures de seguridad explícitamente sintéticas. */
export async function cargarCorpusFuentesPropias(): Promise<{ faqsPropias: number; fuentesPublicasPropias: number; fixturesSeguridadInternas: number; fixturesSeguridadCliente: number }> {
  const faqs = await extraerFaqEstaticas()
  for (const fuente of faqs) await indexarFuente(fuente, 1, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
  for (const fuente of FUENTES_PUBLICAS_PROPIAS) await indexarFuente(fuente, 1, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
  for (const fuente of FUENTES_INTERNAS_SINTETICAS) await indexarFuente(fuente, 1, { espacio: 'INTERNO', estado: 'PUBLICADO' })
  await insertarCanarioClienteSintetico()
  return { faqsPropias: faqs.length, fuentesPublicasPropias: FUENTES_PUBLICAS_PROPIAS.length, fixturesSeguridadInternas: FUENTES_INTERNAS_SINTETICAS.length, fixturesSeguridadCliente: 1 }
}

/** Compatibilidad temporal para callers previos; el corpus ya no usa fuentes públicas sintéticas. */
export const cargarCorpusSintetico = cargarCorpusFuentesPropias
