import { normalizar } from '@/lib/asistente/text'

const INYECCION = [
  /\bignora(?:r)? (?:todas? )?(?:las )?(?:instrucciones|reglas|indicaciones)\b/i,
  /\bignore (?:(?:all|the|previous|prior) )*(?:instructions|rules|prompts?)\b/i,
  /\b(?:muestra|ensena|revela|dime|imprime|give me|show me|reveal) (?:tu |el |the )?(?:prompt|system prompt|mensaje de sistema|instrucciones internas?)\b/i,
  /\b(?:print|dump|display|expose) (?:the )?(?:system |developer |internal )?(?:prompt|instructions|rules)\b/i,
  /\b(?:actua|actúa|pretend|roleplay|simulate) (?:como |as )?(?:sistema|system|developer|administrador|admin)\b/i,
  /\b(?:pretend|act|roleplay|simulate) (?:that )?(?:you )?(?:are|as) (?:an? )?(?:admin(?:istrator)?|developer|system)\b/i,
  /\b(?:system|developer|assistant)\s*:\s*/i,
  /\b(?:jailbreak|dan mode|do anything now|prompt injection)\b/i,
  /\b(?:lista|muestra|dame|exporta|revela) (?:los |las )?(?:datos|contratos|facturas|clientes|conversaciones|documentos) (?:de |del )?(?:otro|otros|otra|otras|all)\b/i,
  /\b(?:lista|muestra|dame|exporta|revela) (?:las? |los? )?(?:facturas|contratos|datos|clientes|conversaciones|documentos)(?:\s+de)?\s+(?:todos?|otras? personas?|otros? clientes?)\b/i,
  /\b(?:lista|muestra|dame|exporta|revela) (?:las? |los? )?(?:documentos|datos|instrucciones|contenido) (?:internos?|privados?|ocultos?|no publicos?)\b/i,
  /\b(?:bypass|elude|saltate|sáltate|omite) (?:la |los |las )?(?:seguridad|filtros|restricciones|controles)\b/i,
  /\b(?:saltate|sáltate|omite) (?:las? )?(?:reglas|instrucciones|restricciones|controles)\b/i,
  // Variantes en inglés: exfiltración de datos de terceros, reglas ocultas y elusión de controles.
  /\b(?:give me|show me|send me|list|export|dump|reveal|leak) (?:all |every |the |other |any )*(?:clients?|customers?|users?)'?s? (?:data|records|invoices|contracts|conversations|details|emails|phones)\b/i,
  /\b(?:show|reveal|print|display|expose|dump|leak) (?:me )?(?:the |your )?(?:hidden|internal|secret|system|developer|private) (?:rules|instructions|prompts?|messages?|documents?|config(?:uration)?)\b/i,
  /\b(?:bypass|elude|evade|disable|skip|override) (?:the |all |your |any )?(?:security|safety|filters?|restrictions|rules|guardrails|controls)\b/i,
]
const ENFADO = /\b(?:inutil|inútil|mierda|puta|estafa(?:dores)?|imbecil|imbécil|vergonzoso|ladrones?|cabreo|enfadad[oa]|reclamacion|reclamación)\b/i
// «soporte» o «contactar con» solos son preguntas informativas (FAQ); la petición
// de persona exige un sujeto humano explícito o «hablar con alguien».
const HUMANO = /\b(?:persona|humano|humana|agente|operador|operadora|comercial|llamad(?:me|a)|hablar con alguien)\b/i
const SALUDO = /^(?:hola|buenas(?:\s+(?:tardes|dias|días|noches))?|hey|hello|hi|que tal|qué tal)[!. ,¡¿?]*$/i
const FUERA_DOMINIO = /\b(?:receta|horoscopo|horóscopo|resultado(?:s)? (?:de )?futbol|fútbol|criptomoneda|acciones? de bolsa|programa(?:r)? en python|politica internacional|política internacional)\b/i

export type AnalisisMensaje = { longitudOk: boolean; injection: boolean; enfado: boolean; peticionHumano: boolean; fueraDominio: boolean; saludo: boolean }

export function analizarMensaje(texto: string, maximo = 1500): AnalisisMensaje {
  const limpio = String(texto ?? '').trim()
  const normalizado = normalizar(limpio)
  return {
    longitudOk: limpio.length > 0 && limpio.length <= maximo,
    injection: INYECCION.some(patron => patron.test(limpio)) || /(?:<\|(?:system|assistant|developer)\|>|\[INST\]|###\s*(?:system|instruction))/i.test(limpio),
    enfado: ENFADO.test(normalizado),
    peticionHumano: HUMANO.test(normalizado),
    fueraDominio: FUERA_DOMINIO.test(normalizado),
    saludo: SALUDO.test(limpio),
  }
}

/**
 * Los temas se administran sólo en configuración de servidor. Se comparan como
 * frases normalizadas completas (no como expresiones regulares) para que un
 * valor de configuración no cambie la gramática de la guardia ni coincida
 * dentro de otra palabra.
 */
export function coincideTemaProhibido(texto: string, temas: readonly unknown[]): boolean {
  const mensaje = ` ${normalizar(texto)} `
  if (mensaje.trim().length < 2) return false
  return temas.some((tema) => {
    if (typeof tema !== 'string') return false
    const frase = normalizar(tema).slice(0, 160)
    return frase.length >= 2 && mensaje.includes(` ${frase} `)
  })
}

export const RESPUESTA_INYECCION = 'No puedo ayudar con instrucciones internas, datos de otras personas ni cambios de seguridad. Puedo responder dudas sobre los servicios de Internet Operadores.'
