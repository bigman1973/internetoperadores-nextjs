import prisma from '@/lib/prisma'
import { redactarPII } from '@/lib/asistente/pii'
import { buscar, type FragmentoRecuperado } from '@/lib/asistente/retrieval'
import { textoPlano } from '@/lib/asistente/text'
import { indexarFuente } from '@/lib/asistente/ingesta'

export type OrigenPropuestaAprendizaje = 'HUECO' | 'VALORACION'
export type EspacioAprendizaje = 'PUBLICO' | 'INTERNO'
export type FuentePropuesta = { documentoId: string; versionId: string; titulo: string; url: string | null; fragmento: string }

function alcanceParaEspacio(espacio: EspacioAprendizaje) {
  return espacio === 'PUBLICO'
    ? { espacios: ['PUBLICO' as const], roles: [], tenantId: null, usuarioId: null }
    : { espacios: ['PUBLICO' as const, 'INTERNO' as const], roles: [], tenantId: null, usuarioId: null }
}

function oracionesLiterales(fragmentos: FragmentoRecuperado[]): string {
  const frases: string[] = []
  for (const fragmento of fragmentos.slice(0, 3)) {
    const candidatas = fragmento.contenido.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []
    for (const candidata of candidatas) {
      const frase = candidata.trim()
      if (frase.length >= 20) frases.push(frase)
      if (frases.length >= 4) return frases.join(' ')
    }
  }
  return frases.join(' ')
}

function fuentesDe(fragmentos: FragmentoRecuperado[]): FuentePropuesta[] {
  return fragmentos.slice(0, 4).map(fragmento => ({
    documentoId: fragmento.documentoId,
    versionId: fragmento.versionId,
    titulo: fragmento.titulo,
    url: fragmento.urlFuente,
    fragmento: fragmento.contenido.slice(0, 500),
  }))
}

async function origenAprendizaje(origen: OrigenPropuestaAprendizaje, huecoId?: string, valoracionId?: string): Promise<{ pregunta: string; espacio: EspacioAprendizaje; huecoId: string | null; valoracionId: string | null } | null> {
  if (origen === 'HUECO') {
    if (!huecoId || valoracionId) return null
    const hueco = await prisma.asistenteHueco.findUnique({ where: { id: huecoId }, select: { id: true, preguntaAnon: true, canal: true, estado: true } })
    if (!hueco || !['NUEVO', 'PROPUESTO'].includes(hueco.estado)) return null
    return { pregunta: hueco.preguntaAnon, espacio: hueco.canal === 'PUBLICO' ? 'PUBLICO' : 'INTERNO', huecoId: hueco.id, valoracionId: null }
  }
  if (!valoracionId || huecoId) return null
  const valoracion = await prisma.asistenteValoracion.findUnique({
    where: { id: valoracionId },
    select: {
      id: true,
      util: true,
      mensaje: { select: { conversacionId: true, createdAt: true, textoAnon: true, conversacion: { select: { canal: true } } } },
    },
  })
  if (!valoracion || valoracion.util) return null
  const preguntaUsuario = await prisma.asistenteMensaje.findFirst({
    where: { conversacionId: valoracion.mensaje.conversacionId, rol: 'usuario', createdAt: { lte: valoracion.mensaje.createdAt } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { textoAnon: true },
  })
  return {
    pregunta: preguntaUsuario?.textoAnon || valoracion.mensaje.textoAnon,
    espacio: valoracion.mensaje.conversacion.canal === 'PUBLICO' ? 'PUBLICO' : 'INTERNO',
    huecoId: null,
    valoracionId: valoracion.id,
  }
}

/** Crea un borrador extractivo: jamás publica ni cambia documentos existentes. */
export async function crearPropuestaAprendizaje(entrada: { origen: OrigenPropuestaAprendizaje; huecoId?: string; valoracionId?: string; actorId: number }) {
  const origen = await origenAprendizaje(entrada.origen, entrada.huecoId, entrada.valoracionId)
  if (!origen) throw new Error('ORIGEN_NO_DISPONIBLE')
  const pregunta = await redactarPII(textoPlano(origen.pregunta).slice(0, 1600), { incluirCodigoPostal: true })
  const fragmentos = await buscar(pregunta, alcanceParaEspacio(origen.espacio), { limite: 4 })
  const respuestaPropuesta = await redactarPII(oracionesLiterales(fragmentos).slice(0, 3500), { incluirCodigoPostal: false })
  const fuentes = fuentesDe(fragmentos)
  const propuesta = await prisma.$transaction(async tx => {
    if (origen.huecoId) await tx.asistenteHueco.update({ where: { id: origen.huecoId }, data: { estado: 'PROPUESTO', updatedAt: new Date() } })
    return tx.asistentePropuestaAprendizaje.create({
      data: {
        origen: entrada.origen,
        huecoId: origen.huecoId,
        valoracionId: origen.valoracionId,
        pregunta,
        respuestaPropuesta,
        fuentes,
      },
      select: { id: true, origen: true, pregunta: true, respuestaPropuesta: true, fuentes: true, estado: true, createdAt: true },
    })
  })
  return { ...propuesta, requiereRedactar: !respuestaPropuesta.trim() }
}

/**
 * Aprobación humana: re-redacta PII, indexa el nuevo documento PUBLICADO y sólo
 * entonces enlaza la decisión. Si la indexación falla, no se marca aprobada.
 */
export async function decidirPropuestaAprendizaje(entrada: { id: string; accion: 'aprobar' | 'descartar'; actorId: number; pregunta?: string; respuesta?: string; espacio?: EspacioAprendizaje }) {
  const propuesta = await prisma.asistentePropuestaAprendizaje.findUnique({
    where: { id: entrada.id },
    select: { id: true, estado: true, huecoId: true, pregunta: true, respuestaPropuesta: true },
  })
  if (!propuesta) throw new Error('PROPUESTA_NO_ENCONTRADA')
  if (propuesta.estado !== 'PROPUESTA') throw new Error('PROPUESTA_YA_DECIDIDA')
  const ahora = new Date()
  if (entrada.accion === 'descartar') {
    const resultado = await prisma.$transaction(async tx => {
      const actualizada = await tx.asistentePropuestaAprendizaje.update({ where: { id: propuesta.id }, data: { estado: 'DESCARTADA', revisorId: entrada.actorId, decidedAt: ahora }, select: { id: true, estado: true, decidedAt: true } })
      if (propuesta.huecoId) {
        const hueco = await tx.asistenteHueco.findUnique({ where: { id: propuesta.huecoId }, select: { preguntaNorm: true } })
        if (hueco) await tx.asistenteHueco.updateMany({ where: { preguntaNorm: hueco.preguntaNorm, estado: { in: ['NUEVO', 'PROPUESTO'] } }, data: { estado: 'DESCARTADO', updatedAt: ahora } })
      }
      return actualizada
    })
    return { ...resultado, documentoId: null, duracionIndexadoMs: null, slaMenosDeCincoMinutos: null }
  }

  const pregunta = await redactarPII(textoPlano(entrada.pregunta ?? propuesta.pregunta).slice(0, 1600), { incluirCodigoPostal: true })
  const respuesta = await redactarPII(textoPlano(entrada.respuesta ?? propuesta.respuestaPropuesta).slice(0, 6000), { incluirCodigoPostal: false })
  if (!pregunta.trim() || !respuesta.trim()) throw new Error('RESPUESTA_REQUERIDA')
  const espacio = entrada.espacio || 'INTERNO'
  const inicioIndexado = Date.now()
  const resultadoIndice = await indexarFuente({
    titulo: `Aprendizaje: ${pregunta.slice(0, 180)}`,
    contenido: respuesta,
    tipo: 'FAQ',
    origen: `aprendizaje:${propuesta.id}`,
    urlFuente: null,
  }, entrada.actorId, { espacio, estado: 'PUBLICADO' })
  if (!resultadoIndice.documentoId) throw new Error('INDEXADO_NO_DISPONIBLE')
  const duracionIndexadoMs = Date.now() - inicioIndexado
  // indexarFuente crea los fragmentos y los activa de forma síncrona; este tipo
  // identifica el origen aprobado sin alterar el contenido ni su publicación.
  await prisma.asistenteDocumento.update({ where: { id: resultadoIndice.documentoId }, data: { tipo: 'APRENDIZAJE', updatedAt: ahora } })

  const resultado = await prisma.$transaction(async tx => {
    const actualizada = await tx.asistentePropuestaAprendizaje.updateMany({
      where: { id: propuesta.id, estado: 'PROPUESTA' },
      data: { estado: 'APROBADA', revisorId: entrada.actorId, documentoId: resultadoIndice.documentoId, decidedAt: ahora, pregunta, respuestaPropuesta: respuesta },
    })
    if (actualizada.count !== 1) throw new Error('PROPUESTA_YA_DECIDIDA')
    if (propuesta.huecoId) {
      const hueco = await tx.asistenteHueco.findUnique({ where: { id: propuesta.huecoId }, select: { preguntaNorm: true } })
      if (hueco) await tx.asistenteHueco.updateMany({ where: { preguntaNorm: hueco.preguntaNorm, estado: { in: ['NUEVO', 'PROPUESTO'] } }, data: { estado: 'RESUELTO', updatedAt: ahora } })
    }
    return tx.asistentePropuestaAprendizaje.findUniqueOrThrow({ where: { id: propuesta.id }, select: { id: true, estado: true, documentoId: true, decidedAt: true } })
  })
  return { ...resultado, duracionIndexadoMs, slaMenosDeCincoMinutos: duracionIndexadoMs < 5 * 60_000 }
}

export async function cambiarEstadoHueco(id: string, estado: 'DESCARTADO' | 'NUEVO') {
  const resultado = await prisma.asistenteHueco.updateMany({ where: { id }, data: { estado, updatedAt: new Date() } })
  if (!resultado.count) throw new Error('HUECO_NO_ENCONTRADO')
  return { id, estado }
}
