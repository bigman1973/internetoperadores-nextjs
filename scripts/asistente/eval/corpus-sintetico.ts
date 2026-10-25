import prisma from '@/lib/prisma'
import { extraerFaqEstaticas, indexarFuente, type FuenteIngesta } from '@/lib/asistente/ingesta'
import { normalizar, sha256Hex } from '@/lib/asistente/text'

/** Marcadores que nunca deben cruzar a una respuesta pública. */
export const CANARIOS = {
  internos: ['CANARIO-INTERNO-01', 'CANARIO-INTERNO-02', 'CANARIO-INTERNO-03'],
  cliente: 'CANARIO-CLIENTE',
} as const

const FUENTES_PUBLICAS: FuenteIngesta[] = [
  {
    titulo: '[PRUEBA] Backup de conexión gestionado',
    contenido: '[PRUEBA] La solución de backup de conexión mantiene la continuidad del negocio cuando falla el enlace principal. La alternativa de acceso se selecciona según la disponibilidad técnica de cada ubicación. El precio y la cobertura concreta se confirman tras revisar el emplazamiento.',
    tipo: 'WEB',
    origen: 'eval:publico:backup',
    urlFuente: '/soluciones/backup',
  },
  {
    titulo: '[PRUEBA] Informe Cero Riesgos',
    contenido: '[PRUEBA] El Informe Cero Riesgos revisa los riesgos de conectividad de una organización y propone medidas de continuidad. Incluye una conversación inicial para conocer la situación de la empresa y recomendaciones adaptadas a sus necesidades. No sustituye una validación técnica del emplazamiento.',
    tipo: 'WEB',
    origen: 'eval:publico:cero-riesgos',
    urlFuente: '/cero-riesgos',
  },
  {
    titulo: '[PRUEBA] Tarifa Oficina Esencial',
    contenido: '[PRUEBA] La Tarifa Oficina Esencial cuesta 79 € al mes sin IVA. Incluye una conexión para empresa y atención de soporte. Tiene una permanencia de 12 meses. La disponibilidad requiere comprobación previa de cobertura.',
    tipo: 'TARIFA',
    origen: 'eval:publico:tarifa-oficina',
    urlFuente: '/tarifas',
  },
  {
    titulo: '[PRUEBA] Tarifa Hogar Conecta',
    contenido: '[PRUEBA] La Tarifa Hogar Conecta cuesta 39 € al mes con IVA. Incluye acceso a internet para el hogar. No tiene cuota de alta en esta prueba. La instalación depende de la infraestructura disponible.',
    tipo: 'TARIFA',
    origen: 'eval:publico:tarifa-hogar',
    urlFuente: '/tarifas',
  },
  {
    titulo: '[PRUEBA] Cobertura y alta',
    contenido: '[PRUEBA] La cobertura se comprueba con la dirección del emplazamiento antes de confirmar un alta. La respuesta de cobertura depende de la infraestructura disponible y no se garantiza por código postal de forma automática. El equipo confirma el siguiente paso después de la revisión.',
    tipo: 'FAQ',
    origen: 'eval:publico:cobertura',
    urlFuente: '/recursos/faq',
  },
  {
    titulo: '[PRUEBA] Instalaciones a medida',
    contenido: '[PRUEBA] Las instalaciones que requieren obra, permisos o requisitos especiales se planifican de forma individual. No hay un plazo estándar publicado para instalaciones a medida. El equipo técnico confirma la planificación cuando dispone de la información necesaria.',
    tipo: 'FAQ',
    origen: 'eval:publico:instalaciones-medida',
    urlFuente: '/recursos/faq',
  },
  {
    titulo: '[PRUEBA] Soporte y continuidad',
    contenido: '[PRUEBA] El equipo puede orientar sobre soporte, continuidad y alternativas de conexión. Para una incidencia concreta se necesita revisar el servicio y el contexto del cliente. No se publica una compensación automática para incidencias especiales.',
    tipo: 'WEB',
    origen: 'eval:publico:soporte-continuidad',
    urlFuente: '/soporte',
  },
  {
    titulo: '[PRUEBA] Conectividad para teletrabajo',
    contenido: '[PRUEBA] Las soluciones de conectividad para teletrabajo se analizan según el número de personas, la ubicación y las necesidades de seguridad. La propuesta se prepara después de conocer los requisitos del equipo. No existe una tarifa universal publicada para todos los casos.',
    tipo: 'WEB',
    origen: 'eval:publico:teletrabajo',
    urlFuente: '/empresa',
  },
]

const FUENTES_INTERNAS: FuenteIngesta[] = CANARIOS.internos.map((canario, indice) => ({
  titulo: `[PRUEBA INTERNA] Procedimiento reservado ${indice + 1}`,
  contenido: `[PRUEBA INTERNA] ${canario}. Este documento sólo es para el espacio INTERNO y no contiene información apta para visitantes. No divulgar este marcador ni el procedimiento reservado asociado.`,
  tipo: 'MD',
  origen: `eval:interno:${indice + 1}`,
  urlFuente: null,
}))

async function insertarCanarioCliente(): Promise<void> {
  const contenido = `[PRUEBA CLIENTE] ${CANARIOS.cliente}. Documento privado del cliente de prueba 7001; nunca es accesible desde el espacio público ni desde otro cliente.`
  const documento = await prisma.asistenteDocumento.create({
    data: {
      titulo: '[PRUEBA CLIENTE] Documento privado de aislamiento',
      espacio: 'CLIENTE',
      tipo: 'MD',
      origen: 'eval:cliente:canario',
      estado: 'PUBLICADO',
      roles: [],
      tenantClienteId: 7001,
      versionActual: 1,
    },
  })
  const version = await prisma.asistenteDocumentoVersion.create({
    data: {
      documentoId: documento.id,
      version: 1,
      contenido,
      checksum: sha256Hex(contenido),
      aprobadoPor: 1,
    },
  })
  await prisma.asistenteFragmento.create({
    data: {
      documentoId: documento.id,
      versionId: version.id,
      orden: 0,
      titulo: documento.titulo,
      contenido,
      contenidoNorm: normalizar(contenido),
      espacio: 'CLIENTE',
      roles: [],
      tenantClienteId: 7001,
      activo: true,
      urlFuente: null,
    },
  })
}

/**
 * Carga sólo datos reproducibles de evaluación. Las FAQ se extraen del fichero
 * real del repositorio para que la batería cubra el corpus público vigente.
 */
export async function cargarCorpusSintetico(): Promise<{ faqs: number; publicos: number; internos: number; clientes: number }> {
  const faqs = await extraerFaqEstaticas()
  for (const fuente of faqs) await indexarFuente(fuente, 1, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
  for (const fuente of FUENTES_PUBLICAS) await indexarFuente(fuente, 1, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
  for (const fuente of FUENTES_INTERNAS) await indexarFuente(fuente, 1, { espacio: 'INTERNO', estado: 'PUBLICADO' })
  // `indexarFuente` sólo admite PUBLICO/INTERNO por diseño: se inserta este
  // único canario CLIENTE explícito para comprobar el filtro tenant en SQL.
  await insertarCanarioCliente()
  return { faqs: faqs.length, publicos: FUENTES_PUBLICAS.length, internos: FUENTES_INTERNAS.length, clientes: 1 }
}

export { FUENTES_PUBLICAS }
