import prisma from '@/lib/prisma'
import { resolverAlcance, type ContextoAlcance } from '@/lib/asistente/acl'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { analizarMensaje, RESPUESTA_INYECCION } from '@/lib/asistente/guard'
import { dentroHorarioHumano } from '@/lib/asistente/horario'
import { redactarPII } from '@/lib/asistente/pii'
import { proveedorPara, type FuenteRespuesta } from '@/lib/asistente/provider'
import { buscar } from '@/lib/asistente/retrieval'
import { normalizar } from '@/lib/asistente/text'

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

async function conversacionSegura(id: string | undefined, canal: 'PUBLICO' | 'INTERNO' | 'CLIENTE', usuarioId: number | null, visitanteHash: string | null, retencionMeses: number): Promise<string> {
  if (id) {
    const existente = await prisma.asistenteConversacion.findFirst({ where: { id, canal, ...(canal === 'INTERNO' ? { usuarioId } : {}), ...(canal === 'PUBLICO' ? { visitanteHash } : {}) }, select: { id: true } })
    if (existente) return existente.id
  }
  const borrarDespues = new Date(); borrarDespues.setMonth(borrarDespues.getMonth() + retencionMeses)
  const creada = await prisma.asistenteConversacion.create({ data: { canal, usuarioId, visitanteHash, borrarDespues } })
  return creada.id
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
  if (analisis.injection) {
    respuesta = RESPUESTA_INYECCION
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
    const fragmentos = await buscar(entrada.mensaje, alcance, { limite: 6 })
    if (!fragmentos.length || fragmentos[0].puntuacion < 0.02) {
      respuesta = 'No tengo esa información en nuestra documentación. Si quieres, puedo ponerte en contacto con una persona.'
      sinFuente = true
      motivo = 'SIN_RESPUESTA'
      escalar = true
      await guardarHueco(textoAnon, canal, conversacionId, mensajes.id)
    } else {
      const proveedor = proveedorPara(runtime.modo)
      const resultado = await proveedor!.responder(entrada.mensaje, fragmentos)
      respuesta = resultado.respuesta
      fuentes = resultado.fuentes
    }
  }
  const almacenada = await redactarPII(respuesta, { incluirCodigoPostal: false })
  const asistente = await prisma.asistenteMensaje.create({ data: { conversacionId, rol: 'asistente', textoAnon: almacenada, fuentes: fuentes.map(({ n, titulo, url, documentoId, versionId }) => ({ n, titulo, url, documentoId, versionId })), sinFuente, intent: motivo || null } })
  await prisma.asistenteConversacion.update({ where: { id: conversacionId }, data: { mensajes: { increment: 1 }, estado: escalar ? 'ESCALADA' : 'ABIERTA', escaladoMotivo: motivo || null, updatedAt: new Date() } })
  return { conversacionId, mensajeId: asistente.id, respuesta, fuentes, sinFuente, escalar, ...(motivo ? { motivoEscalado: motivo } : {}), ctas: ctasPara(entrada.mensaje, sinFuente), modo: runtime.modo }
}
