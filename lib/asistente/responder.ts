import prisma from '@/lib/prisma'
import { resolverAlcance, type ContextoAlcance } from '@/lib/asistente/acl'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { analizarMensaje, coincideTemaProhibido, RESPUESTA_INYECCION } from '@/lib/asistente/guard'
import { dentroHorarioHumano } from '@/lib/asistente/horario'
import { redactarPII } from '@/lib/asistente/pii'
import { proveedorPara, type FuenteRespuesta } from '@/lib/asistente/provider'
import { buscar, type FragmentoRecuperado } from '@/lib/asistente/retrieval'
import { consultaParaRecuperacion, normalizar } from '@/lib/asistente/text'

export type CtaAsistente = { tipo: 'INFORME_CERO_RIESGOS' | 'BACKUP_CONEXION' | 'CONTACTO' | 'LEAD'; texto: string; url?: string }
export type RespuestaAsistente = { conversacionId: string; mensajeId: string; respuesta: string; fuentes: FuenteRespuesta[]; sinFuente: boolean; escalar: boolean; motivoEscalado?: 'PETICION' | 'ENFADO' | 'SIN_RESPUESTA' | 'FUERA_DOMINIO'; ctas: CtaAsistente[]; modo: 'extractivo' | 'local' }

function ctasPara(texto: string, sinFuente: boolean): CtaAsistente[] {
  const normalizada = normalizar(texto)
  const ctas: CtaAsistente[] = [{ tipo: 'CONTACTO', texto: 'Hablar con una persona', url: '/contacto' }]
  if (/empresa|negocio|riesgo|seguridad|continuidad/.test(normalizada)) ctas.unshift({ tipo: 'INFORME_CERO_RIESGOS', texto: 'Conoce el Informe Cero Riesgos', url: '/cero-riesgos' })
  if (/backup|respaldo|caida|caida|failover|continuidad/.test(normalizada)) ctas.unshift({ tipo: 'BACKUP_CONEXION', texto: 'Soluciones de backup de conexión', url: '/soluciones' })
  if (sinFuente) ctas.push({ tipo: 'LEAD', texto: 'Cuéntanos qué necesitas', url: '/contacto' })
  return ctas.slice(0, 3)
}

function respuestaHumana(motivo: 'PETICION' | 'ENFADO' | 'FUERA_DOMINIO', dentro: boolean): string {
  if (motivo === 'ENFADO') return dentro ? 'Siento que la experiencia no haya sido buena. Voy a dejar constancia para que una persona pueda ayudarte.' : 'Siento que la experiencia no haya sido buena. Puedes dejarnos tus datos de contacto y te responderemos en horario de atención.'
  if (motivo === 'FUERA_DOMINIO') return 'Puedo ayudarte con servicios de conectividad, móvil, soporte y soluciones de Internet Operadores. Para otra consulta, puedes contactar con nuestro equipo.'
  return dentro ? 'De acuerdo, puedo derivarte con una persona del equipo. Si nos dejas una forma de contacto, te atenderemos.' : 'De acuerdo, puedes dejarnos una forma de contacto y te responderemos en horario de atención.'
}

type TipoDatoSolicitado = 'NUMERO' | 'FECHA' | 'PRECIO' | 'PORCENTAJE' | 'VELOCIDAD' | null

function tipoDatoSolicitado(pregunta: string): TipoDatoSolicitado {
  const consulta = normalizar(pregunta)
  if (/\b(?:precio|coste|tarifa|cuota|importe)\b/.test(consulta)) return 'PRECIO'
  if (/\b(?:descuento|rebaja|porcentaje|por ciento|disponibilidad)\b/.test(consulta)) return 'PORCENTAJE'
  if (/\bvelocidad\b/.test(consulta)) return 'VELOCIDAD'
  if (/\b(?:fecha|cuando)\b/.test(consulta)) return 'FECHA'
  if (/\b(?:cuanto|cuanta|cuantos|cuantas|maximo|maxima|numero|plazo|tiempo|conmutacion)\b/.test(consulta)) return 'NUMERO'
  return null
}

function contieneTipoDato(texto: string, tipo: Exclude<TipoDatoSolicitado, null>): boolean {
  const normalizado = normalizar(texto)
  if (tipo === 'PRECIO') return /\b\d+(?:[.,]\d+)?\s*€/.test(normalizado)
  if (tipo === 'PORCENTAJE') return /\b\d+(?:[.,]\d+)?\s*%/.test(normalizado)
  if (tipo === 'VELOCIDAD') return /\b\d+(?:[.,]\d+)?\s*(?:mbps|gbps)/.test(normalizado)
  if (tipo === 'FECHA') return /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(normalizado)
  return /\b\d+(?:[.,]\d+)?\b/.test(normalizado)
}

function terminosTema(pregunta: string): string[] {
  const noTematicos = new Set(['cual', 'cuales', 'como', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'de', 'el', 'en', 'es', 'exacta', 'exacto', 'fecha', 'fijo', 'garantizada', 'garantizado', 'la', 'las', 'los', 'maxima', 'maximo', 'ofrece', 'ofrecemos', 'precio', 'publica', 'publicado', 'que', 'se', 'tarifa', 'tiene', 'una', 'un', 'velocidad'])
  return normalizar(pregunta).split(' ').filter(termino => termino.length > 1 && !noTematicos.has(termino))
}

function fuenteParaDatoPublicado(pregunta: string, fuentes: FuenteRespuesta[]): FuenteRespuesta | null {
  const tipo = tipoDatoSolicitado(pregunta)
  if (!tipo) return fuentes[0] || null
  const tema = terminosTema(pregunta)
  const candidatas = fuentes
    .map(fuente => ({ fuente, texto: normalizar(`${fuente.titulo} ${fuente.fragmento}`) }))
    .filter(({ texto }) => contieneTipoDato(texto, tipo))
    .map(({ fuente, texto }) => ({ fuente, coincidenciasTema: tema.filter(termino => texto.includes(termino)).length }))
    .filter(candidata => candidata.coincidenciasTema > 0)
    .sort((a, b) => b.coincidenciasTema - a.coincidenciasTema || a.fuente.n - b.fuente.n)
  return candidatas[0]?.fuente || null
}

/** En modo extractivo se citan fragmentos literales, sin resumir cifras, plazos ni condiciones. */
function respuestaExtractivaLiteral(pregunta: string, fragmentos: FragmentoRecuperado[]): { respuesta: string; fuentes: FuenteRespuesta[]; modo: 'extractivo'; datoNoPublicado?: boolean } {
  const fuentes = fragmentos.slice(0, 4).map((fragmento, indice) => ({
    n: indice + 1,
    titulo: fragmento.titulo,
    url: fragmento.urlFuente,
    fragmento: fragmento.contenido.slice(0, 900),
    documentoId: fragmento.documentoId,
    versionId: fragmento.versionId,
  }))
  const referencias = fuentes.map(fuente => `[${fuente.n}]`).join(' ')
  const fuenteDato = fuenteParaDatoPublicado(pregunta, fuentes)
  if (!fuenteDato) return { respuesta: `La documentación disponible no concreta ese dato. ${referencias}`, fuentes, modo: 'extractivo', datoNoPublicado: true }
  // Se reproduce sólo el fragmento más pertinente. Las otras fuentes quedan
  // citadas como relacionadas sin introducir en la respuesta cifras, plazos o
  // condiciones que no responden a la pregunta.
  const contenido = tipoDatoSolicitado(pregunta)
    ? fuenteDato.fragmento
    : fuentes.map(fuente => `${fuente.fragmento} [${fuente.n}]`).join(' ')
  return { respuesta: `Según nuestra documentación: ${contenido} ${referencias}`, fuentes, modo: 'extractivo' }
}

async function conversacionSegura(id: string | undefined, canal: 'PUBLICO' | 'INTERNO' | 'CLIENTE', usuarioId: number | null, visitanteHash: string | null, retencionMeses: number): Promise<string> {
  if (id) {
    const existente = await prisma.asistenteConversacion.findFirst({ where: { id, canal, ...(canal === 'INTERNO' ? { usuarioId } : {}), ...(canal === 'PUBLICO' ? { visitanteHash } : {}) }, select: { id: true } })
    if (existente) return existente.id
  }
  const borrarDespues = new Date(); borrarDespues.setMonth(borrarDespues.getMonth() + retencionMeses)
  const creada = await prisma.asistenteConversacion.create({ data: { canal, usuarioId, visitanteHash, borrarDespues } })
  return creada.id
}
/** Recupera la conversación pública del MISMO visitante o crea una nueva; nunca acepta un id ajeno. */
export function conversacionPublicaSegura(id: string | undefined, visitanteHash: string, retencionMeses: number): Promise<string> {
  return conversacionSegura(id, 'PUBLICO', null, visitanteHash, retencionMeses)
}

async function guardarHueco(preguntaAnon: string, canal: string, conversacionId: string, mensajeId: string): Promise<void> {
  const preguntaNorm = normalizar(preguntaAnon).slice(0, 1200)
  if (!preguntaNorm) return
  await prisma.asistenteHueco.upsert({ where: { preguntaNorm_canal: { preguntaNorm, canal } }, update: { veces: { increment: 1 }, updatedAt: new Date(), conversacionId, mensajeId }, create: { preguntaAnon: preguntaAnon.slice(0, 1600), preguntaNorm, canal, conversacionId, mensajeId } })
}

export async function responderMensaje(entrada: { mensaje: string; conversacionId?: string; contexto: ContextoAlcance; visitanteHash?: string }): Promise<RespuestaAsistente> {
  const runtime = await getAssistantRuntime()
  if (runtime.modo === 'desactivado') throw new Error('ASSISTANT_DISABLED')
  const analisis = analizarMensaje(entrada.mensaje, runtime.maxChars)
  if (!analisis.longitudOk) throw new Error(entrada.mensaje.trim() ? 'MENSAJE_LARGO' : 'MENSAJE_INVALIDO')
  const alcance = await resolverAlcance(entrada.contexto)
  if (!alcance) throw new Error('NO_AUTORIZADO')
  const canal = entrada.contexto === 'INTERNO' ? 'INTERNO' : entrada.contexto === 'CLIENTE' ? 'CLIENTE' : 'PUBLICO'
  const conversacionId = await conversacionSegura(entrada.conversacionId, canal, alcance.usuarioId, canal === 'PUBLICO' ? entrada.visitanteHash || null : null, runtime.retencionMeses)
  const textoAnon = await redactarPII(entrada.mensaje, { incluirCodigoPostal: true })
  const mensajes = await prisma.asistenteMensaje.create({ data: { conversacionId, rol: 'usuario', textoAnon, intent: analisis.saludo ? 'SALUDO' : null } })
  await prisma.asistenteConversacion.update({ where: { id: conversacionId }, data: { mensajes: { increment: 1 }, updatedAt: new Date() } })

  let respuesta: string
  let fuentes: FuenteRespuesta[] = []
  let sinFuente = false
  let escalar = false
  let motivo: RespuestaAsistente['motivoEscalado']
  let modoRespuesta: RespuestaAsistente['modo'] = 'extractivo'
  if (analisis.injection) {
    respuesta = RESPUESTA_INYECCION
    sinFuente = true
  } else if (coincideTemaProhibido(entrada.mensaje, runtime.temasProhibidos)) {
    // Esta decisión se toma antes de construir la consulta de recuperación:
    // un tema prohibido nunca llega al índice ni al proveedor extractivo.
    motivo = 'FUERA_DOMINIO'
    escalar = true
    respuesta = 'Este tema no está disponible en el asistente. Si necesitas ayuda sobre nuestros servicios, puedo ponerte en contacto con una persona del equipo.'
    sinFuente = true
  } else if (analisis.enfado || analisis.peticionHumano || analisis.fueraDominio) {
    motivo = analisis.enfado ? 'ENFADO' : analisis.peticionHumano ? 'PETICION' : 'FUERA_DOMINIO'
    escalar = true
    respuesta = respuestaHumana(motivo, dentroHorarioHumano(runtime.horario))
    sinFuente = true
  } else if (analisis.saludo) {
    respuesta = runtime.bienvenida
    sinFuente = true
  } else {
    // Se busca sobre el texto ya anonimizado y sin marcadores ([DNI], [IBAN]…).
    // Una declaración PII anterior a una pregunta no añade ruido a FTS ni sale
    // hacia embeddings; no se amplía la consulta con alias ni sinónimos.
    const consultaBusqueda = consultaParaRecuperacion(textoAnon)
    const fragmentos = await buscar(consultaBusqueda, alcance, { limite: 6 })
    if (!fragmentos.length || !(fragmentos[0].puntuacion > 0)) {
      respuesta = 'No tengo esa información en nuestra documentación. Si quieres, puedo ponerte en contacto con una persona.'
      sinFuente = true
      motivo = 'SIN_RESPUESTA'
      escalar = true
      await guardarHueco(textoAnon, canal, conversacionId, mensajes.id)
    } else {
      // El modo extractivo no reescribe los fragmentos: conserva evidencia
      // literal. El proveedor local recibe la pregunta anonimizada y la
      // configuración aprobada; si cae al fallback informa su modo real.
      const resultado = runtime.modo === 'extractivo'
        ? respuestaExtractivaLiteral(textoAnon, fragmentos)
        : await proveedorPara(runtime.modo, { modelo: runtime.modelo, tono: runtime.tono })!.responder(textoAnon, fragmentos)
      respuesta = resultado.respuesta
      fuentes = resultado.fuentes
      modoRespuesta = resultado.modo === 'local' ? 'local' : 'extractivo'
      if ('datoNoPublicado' in resultado && resultado.datoNoPublicado) {
        sinFuente = true; motivo = 'SIN_RESPUESTA'; escalar = true
        await guardarHueco(textoAnon, canal, conversacionId, mensajes.id)
      }
    }
  }
  const almacenada = await redactarPII(respuesta, { incluirCodigoPostal: false })
  const asistente = await prisma.asistenteMensaje.create({ data: { conversacionId, rol: 'asistente', textoAnon: almacenada, fuentes: fuentes.map(({ n, titulo, url, documentoId, versionId }) => ({ n, titulo, url, documentoId, versionId })), sinFuente, intent: motivo || null } })
  await prisma.asistenteConversacion.update({ where: { id: conversacionId }, data: { mensajes: { increment: 1 }, estado: escalar ? 'ESCALADA' : 'ABIERTA', escaladoMotivo: motivo || null, updatedAt: new Date() } })
  return { conversacionId, mensajeId: asistente.id, respuesta, fuentes, sinFuente, escalar, ...(motivo ? { motivoEscalado: motivo } : {}), ctas: ctasPara(entrada.mensaje, sinFuente), modo: modoRespuesta }
}
