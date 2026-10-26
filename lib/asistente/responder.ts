import prisma from '@/lib/prisma'
import { resolverAlcance, type ContextoAlcance } from '@/lib/asistente/acl'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { analizarMensaje, coincideTemaProhibido, RESPUESTA_INYECCION } from '@/lib/asistente/guard'
import { dentroHorarioHumano } from '@/lib/asistente/horario'
import { redactarPII } from '@/lib/asistente/pii'
import { proveedorPara, type FuenteRespuesta } from '@/lib/asistente/provider'
import { buscar, type FragmentoRecuperado } from '@/lib/asistente/retrieval'
import { filtrarCandidatosPublicos, intencionAtencionPublica } from '@/lib/asistente/relevance'
import { consultaParaRecuperacion, normalizar } from '@/lib/asistente/text'

export type CtaAsistente = { tipo: 'INFORME_CERO_RIESGOS' | 'BACKUP_CONEXION' | 'CONTACTO' | 'LEAD'; texto: string; url?: string }
export type RespuestaAsistente = { conversacionId: string; mensajeId: string; respuesta: string; fuentes: FuenteRespuesta[]; sinFuente: boolean; escalar: boolean; motivoEscalado?: 'PETICION' | 'ENFADO' | 'SIN_RESPUESTA' | 'FUERA_DOMINIO'; ctas: CtaAsistente[]; modo: 'extractivo' | 'local' }

function ctasPara(texto: string, sinFuente: boolean): CtaAsistente[] {
  const normalizada = normalizar(texto)
  const ctas: CtaAsistente[] = [{ tipo: 'CONTACTO', texto: 'Hablar con una persona', url: '/contacto' }]
  if (!sinFuente && intencionAtencionPublica(texto) === 'COBERTURA_DIRECCION') {
    // LEAD abre la cualificación existente (empresa/hogar y CP) con contacto
    // consentido. No ejecuta un comprobador simulado ni confirma cobertura.
    return [{ tipo: 'LEAD', texto: 'Solicitar comprobación de cobertura' }, ...ctas]
  }
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

type TipoDatoSolicitado = 'NUMERO' | 'FECHA' | 'PRECIO' | 'PORCENTAJE' | 'VELOCIDAD' | 'CODIGO_POSTAL' | null

function tipoDatoSolicitado(pregunta: string): TipoDatoSolicitado {
  const consulta = normalizar(pregunta)
  if (/\b(?:precio|coste|cuesta|cuestan|tarifa|cuota|importe|vale|valen|iva|impuesto)\b/.test(consulta)) return 'PRECIO'
  if (/\b(?:descuento|rebaja|porcentaje|por ciento|disponibilidad)\b/.test(consulta)) return 'PORCENTAJE'
  if (/\bvelocidad\b/.test(consulta)) return 'VELOCIDAD'
  if (/\bcodigo postal\b/.test(consulta)) return 'CODIGO_POSTAL'
  if (/\bfecha\b|^cuando\b/.test(consulta)) return 'FECHA'
  // «Conmutación» puede pedir el funcionamiento o si requiere intervención;
  // sólo es un dato numérico cuando la pregunta solicita explícitamente su
  // tiempo o duración. De otro modo debe conservar la evidencia cualitativa.
  if (/\b(?:cuanto|cuanta|cuantos|cuantas|maximo|maxima|numero|plazo|tiempo|duracion)\b/.test(consulta)) return 'NUMERO'
  return null
}

function contieneTipoDato(texto: string, tipo: Exclude<TipoDatoSolicitado, null>): boolean {
  const normalizado = normalizar(texto)
  if (tipo === 'PRECIO') return /\b\d+(?:[.,]\d+)?\s*€/.test(normalizado)
  if (tipo === 'PORCENTAJE') return /\b\d+(?:[.,]\d+)?\s*%/.test(normalizado)
  if (tipo === 'VELOCIDAD') return /\b\d+(?:[.,]\d+)?\s*(?:mbps|gbps)/.test(normalizado)
  if (tipo === 'CODIGO_POSTAL') return /\b(?:codigo postal|cp)\s*[:=]?\s*\d{5}\b/.test(normalizado)
  if (tipo === 'FECHA') return /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d+\s*(?:horas?|h|dias?|semanas?)\b/.test(normalizado)
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
    // `buscar()` ya ha exigido intención/tópico antes de llegar aquí. No se
    // abre una segunda búsqueda por una cifra ni se convierte una tarifa
    // ajena en respuesta sólo porque el texto contiene «€».
    .sort((a, b) => b.coincidenciasTema - a.coincidenciasTema || a.fuente.n - b.fuente.n)
  return candidatas[0]?.fuente || null
}

function citaDesde(fragmentos: FragmentoRecuperado[]): FuenteRespuesta[] {
  return fragmentos.slice(0, 3).map((fragmento, indice) => ({
    n: indice + 1,
    titulo: fragmento.titulo,
    url: fragmento.urlFuente,
    // El encabezado también es contenido público literal y describe los
    // listados/tutoriales cuyo nombre no se repite en el cuerpo.
    fragmento: `${fragmento.titulo}. ${fragmento.contenido}`.slice(0, 1100),
    documentoId: fragmento.documentoId,
    versionId: fragmento.versionId,
  }))
}

function pideDefinicion(pregunta: string): boolean {
  return /\b(?:que es|en que consiste|como funciona|que incluye|que analiza)\b/.test(normalizar(pregunta))
}

/**
 * En modo extractivo se citan sólo los fragmentos que se muestran. Para un
 * dato no publicado se cita una fuente del mismo tema y se declara el hueco;
 * nunca se toma una cifra de una tarifa o producto diferente para rellenarlo.
 */
export function respuestaExtractivaLiteral(pregunta: string, fragmentos: FragmentoRecuperado[], canal: ContextoAlcance = 'PUBLICO'): { respuesta: string; fuentes: FuenteRespuesta[]; modo: 'extractivo'; datoNoPublicado?: boolean } {
  // `buscar()` mantiene ACL íntegra en SQL y ya aplica esta defensa. Se repite
  // sólo en PUBLICO como protección de profundidad para futuros callers que
  // entregasen candidatos ya visibles; INTERNO no se filtra con política web.
  const fuentes = citaDesde(canal === 'PUBLICO' ? filtrarCandidatosPublicos(fragmentos) : fragmentos)
  if (!fuentes.length) return { respuesta: 'No tengo esa información en nuestra documentación. Si quieres, puedo ponerte en contacto con una persona.', fuentes: [], modo: 'extractivo', datoNoPublicado: true }
  const atencion = canal === 'PUBLICO' ? intencionAtencionPublica(pregunta) : null
  if (atencion) {
    // Estas FAQ explican el procedimiento/horario. No se usa una cifra de
    // instalación para responder disponibilidad ni un guardia como horario.
    const fuente = fuentes[0]
    return { respuesta: `Según nuestra documentación: ${fuente.fragmento} [${fuente.n}]`, fuentes: [fuente], modo: 'extractivo' }
  }
  const fuenteDato = fuenteParaDatoPublicado(pregunta, fuentes)
  if (!fuenteDato) {
    // Las candidatas ya están filtradas por intención: citar evidencia del
    // mismo servicio no equivale a inventar el dato que falta.
    const contextoRelacionado = fuentes.slice(0, 3)
    return { respuesta: `La documentación disponible sobre este servicio no publica ese dato solicitado. ${contextoRelacionado.map(fuente => `[${fuente.n}]`).join(' ')}`, fuentes: contextoRelacionado, modo: 'extractivo', datoNoPublicado: true }
  }
  // Una sola fuente topical suele bastar y evita mezclar textos relacionados.
  // Cuando se piden definición y precio, puede añadirse una segunda fuente
  // sólo si ya pasó el reranker de la misma intención/producto. Así el Informe
  // Cero Riesgos combina descripción y precio sin arrastrar una tarifa ajena.
  if (tipoDatoSolicitado(pregunta) === 'PRECIO' && pideDefinicion(pregunta)) {
    const definicion = fuentes.find(fuente => fuente.n !== fuenteDato.n)
    if (definicion) {
      return {
        respuesta: `Según nuestra documentación: ${definicion.fragmento} [${definicion.n}] ${fuenteDato.fragmento} [${fuenteDato.n}]`,
        fuentes: [definicion, fuenteDato],
        modo: 'extractivo',
      }
    }
  }
  const elegidas = [fuenteDato]
  if (!tipoDatoSolicitado(pregunta) || /\by\b|\b(?:datos|campos|informacion|tipos)\b/.test(normalizar(pregunta))) {
    const yaCubierto = normalizar(fuenteDato.fragmento)
    const pendientes = terminosTema(pregunta).filter(termino => !yaCubierto.includes(termino))
    const complemento = fuentes.filter(fuente => fuente.n !== fuenteDato.n && fuente.url === fuenteDato.url)
      .map(fuente => ({ fuente, aporta: pendientes.filter(termino => normalizar(fuente.fragmento).includes(termino)).length }))
      .filter(({ aporta }) => aporta > 0 || !tipoDatoSolicitado(pregunta) || /\b(?:datos|campos|informacion|tipos)\b/.test(normalizar(pregunta)))
      .sort((a, b) => b.aporta - a.aporta || a.fuente.n - b.fuente.n)[0]?.fuente
    if (complemento) elegidas.push(complemento)
  }
  return { respuesta: `Según nuestra documentación: ${elegidas.map(fuente => `${fuente.fragmento} [${fuente.n}]`).join(' ')}`, fuentes: elegidas, modo: 'extractivo' }
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
  // El contexto procede de la ruta del servidor, no del cuerpo de la petición.
  const analisis = analizarMensaje(entrada.mensaje, runtime.maxChars, entrada.contexto)
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
    // hacia ningún modelo ni se amplía la consulta con alias ni sinónimos.
    const consultaBusqueda = consultaParaRecuperacion(textoAnon)
    const recuperados = await buscar(consultaBusqueda, alcance, { limite: 3 })
    // Segunda defensa explícita también en la frontera de respuesta. No puede
    // sustituir la ACL SQL de buscar(), y no toca consultas INTERNAS legítimas.
    const fragmentos = entrada.contexto === 'PUBLICO' ? filtrarCandidatosPublicos(recuperados) : recuperados
    if (!fragmentos.length || !(fragmentos[0].puntuacion > 0)) {
      respuesta = 'No tengo esa información en nuestra documentación. Si quieres, puedo ponerte en contacto con una persona.'
      sinFuente = true
      motivo = 'SIN_RESPUESTA'
      escalar = true
      await guardarHueco(textoAnon, canal, conversacionId, mensajes.id)
    } else {
      // El modo extractivo conserva evidencia literal. El proveedor local
      // recibe como máximo tres fuentes ya rerankeadas por intención/tópico.
      const resultado = runtime.modo === 'extractivo'
        ? respuestaExtractivaLiteral(textoAnon, fragmentos, entrada.contexto)
        : await proveedorPara(runtime.modo, { modelo: runtime.modelo, tono: runtime.tono })!.responder(textoAnon, fragmentos)
      respuesta = resultado.respuesta
      fuentes = resultado.fuentes
      modoRespuesta = resultado.modo === 'local' ? 'local' : 'extractivo'
      if ('datoNoPublicado' in resultado && resultado.datoNoPublicado) {
        // Hay evidencia citada, pero no concreta el dato: se ofrece humano y
        // se registra el hueco sin etiquetar las fuentes presentes como ausentes.
        motivo = 'SIN_RESPUESTA'; escalar = true
        await guardarHueco(textoAnon, canal, conversacionId, mensajes.id)
      }
    }
  }
  const almacenada = await redactarPII(respuesta, { incluirCodigoPostal: false })
  const asistente = await prisma.asistenteMensaje.create({ data: { conversacionId, rol: 'asistente', textoAnon: almacenada, fuentes: fuentes.map(({ n, titulo, url, documentoId, versionId }) => ({ n, titulo, url, documentoId, versionId })), sinFuente, intent: motivo || null } })
  await prisma.asistenteConversacion.update({ where: { id: conversacionId }, data: { mensajes: { increment: 1 }, estado: escalar ? 'ESCALADA' : 'ABIERTA', escaladoMotivo: motivo || null, updatedAt: new Date() } })
  return { conversacionId, mensajeId: asistente.id, respuesta, fuentes, sinFuente, escalar, ...(motivo ? { motivoEscalado: motivo } : {}), ctas: ctasPara(entrada.mensaje, sinFuente), modo: modoRespuesta }
}
