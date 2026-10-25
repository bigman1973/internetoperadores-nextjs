import { normalizar } from '@/lib/asistente/text'

/**
 * Canonicalización exclusiva de la guardia. Elimina marcas invisibles antes de
 * normalizar para que «i\u200bgnora» o letras con diacríticos combinados no separen
 * los lexemas de seguridad. No se usa como consulta de recuperación.
 */
function normalizarParaGuardia(valor: string): string {
  const confusables: Record<string, string> = {
    'а': 'a', 'е': 'e', 'і': 'i', 'ј': 'j', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
    'Α': 'a', 'Ε': 'e', 'Ι': 'i', 'Ο': 'o', 'Ρ': 'p', 'Χ': 'x',
    'α': 'a', 'ε': 'e', 'ι': 'i', 'ο': 'o', 'ρ': 'p', 'χ': 'x',
  }
  const sinMarcas = String(valor ?? '')
    .normalize('NFKD')
    .replace(/[\p{M}\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, '')
    .replace(/[аеијорсухΑΕΙΟΡΧαειορχ]/gu, caracter => confusables[caracter] || caracter)
    // Leetspeak sólo se corrige dentro de una palabra: evita alterar cifras y precios.
    .replace(/([\p{L}])0(?=[\p{L}])/gu, '$1o')
    .replace(/([\p{L}])1(?=[\p{L}])/gu, '$1i')
    .replace(/([\p{L}])3(?=[\p{L}])/gu, '$1e')
    .replace(/([\p{L}])4(?=[\p{L}])/gu, '$1a')
    .replace(/([\p{L}])5(?=[\p{L}])/gu, '$1s')
    .replace(/([\p{L}])7(?=[\p{L}])/gu, '$1t')
    .replace(/\b1(?=[\p{L}])/gu, 'i')
    .replace(/\b3(?=[\p{L}])/gu, 'e')
  return normalizar(sinMarcas)
}

// La orden de abandonar normas se exige junto al objeto protegido; «instrucciones
// para instalar el router» no tiene una orden de desobediencia y sigue siendo válida.
const ORDEN_DESOBEDECER = /\b(?:ignor\w*|ignro\w*|desobed\w*|omiti\w*|omite\w*|salt(?:a|ate|arse|ar)\w*|haz caso omiso|no sig\w*|deja de segu\w*|olvida\w*|ignore\w*|disregard\w*|override\w*|bypass\w*|evade\w*|elude\w*|do not follow|stop following|forget\w*)\b/
const REGLAS_ASISTENTE = /\b(?:instruc\w*|instructions?|indicacion\w*|directr\w*|directives?|reglas?|rules?|normas?|polic(?:y|ies)|prompts?|mensaje(?:s)? (?:del )?sistema|system (?:prompt|message|instructions?)|developer (?:prompt|message|instructions?)|guardrails?|safety (?:rules?|instructions?))\b/
const PEDIR_EXFILTRACION = /\b(?:muestr\w*|ensen\w*|revel\w*|d(?:ame|ime|anos|enos)\w*|lista\w*|export\w*|imprim\w*|compart\w*|filtr\w*|extra\w*|resum\w*|descri\w*|explic\w*|quiero|necesito|busco|show\w*|reveal\w*|give me|send me|list\w*|export\w*|print\w*|dump\w*|display\w*|expose\w*|leak\w*|summari[sz]\w*|i (?:want|need))\b/
const MATERIAL_SENSIBLE = /\b(?:instruc\w*|instructions?|indicacion\w*|directr\w*|directives?|reglas?|rules?|normas?|polic(?:y|ies)|prompts?|mensaje(?:s)? (?:del )?sistema|system (?:prompt|message|instructions?)|developer (?:prompt|message|instructions?)|documentaci\w*|documentos?|documentation|docs?|catalog\w*|tarif\w*|pricing|prices?|rates?|price list|configuraci(?:on|ones)|config(?:uration)?s?)\b/
const CLASIFICACION_INTERNA = /\b(?:intern\w*|priv(?:ad|at)\w*|ocult\w*|hidden|secret\w*|confiden(?:cial|tial)\w*|no public\w*|del equipo|de tu equipo|your team|the team|mayorista\w*)\b/
const REFERENCIA_PROPIA_ASISTENTE = /\b(?:tu|tus|vuestro|vuestra|vuestros|vuestras|your|system|developer|assistant|modelo)\s+(?:instruc\w*|instructions?|indicacion\w*|directr\w*|directives?|reglas?|rules?|normas?|polic(?:y|ies)|prompts?|mensaje(?:s)?|configuraci(?:on|ones)|config(?:uration)?s?)\b/
const PROMPT_EXPLICITO = /\b(?:tu|tus|vuestro|vuestra|vuestros|vuestras|your|system|developer|assistant|modelo)\s+(?:prompts?|mensaje(?:s)? (?:del )?sistema|system (?:prompt|message)|developer (?:prompt|message))\b/

function pideMaterialInterno(texto: string): boolean {
  // Una pregunta sobre catálogo, reglas o documentación interna se rechaza
  // aunque no contenga «muéstrame». Una consulta técnica sobre «red interna LAN»
  // no coincide con estos objetos clasificados y sigue siendo legítima.
  const objetivoClasificado = new RegExp(`${CLASIFICACION_INTERNA.source}\\s+${MATERIAL_SENSIBLE.source}|${MATERIAL_SENSIBLE.source}\\s+${CLASIFICACION_INTERNA.source}`)
  if (objetivoClasificado.test(texto)) return true
  return PEDIR_EXFILTRACION.test(texto) && REFERENCIA_PROPIA_ASISTENTE.test(texto)
}

const INYECCION_DIRECTA = [
  /\b(?:roleplay as|pretend you are|simulate) (?:the |a )?(?:developer|admin|system)(?: message)?\b/,
  /\b(?:bypass|omite) (?:la |las |los |el )?(?:seguridad|filtros?|controles?|restricciones?)\b/,
  /\b(?:dime|muestra|revela) (?:el )?mensaje de sistema\b/,

  /\b(?:actua|actuar|comportate|asume|pretend|act) (?:como |as )?(?:el |un |the |a )?(?:sistema|system|developer|desarrollador|administrador|root)\b/,
  /\bno respetes (?:las? )?(?:reglas|normas|instrucciones)\b/,

  /\b(?:system|developer|assistant)\s*:/,
  /\b(?:jailbreak|dan mode|do anything now|prompt injection)\b/,
  /\b(?:lista|muestra|dame|exporta|revela) (?:los |las )?(?:datos|contratos|facturas|clientes|conversaciones|documentos) (?:de |del )?(?:otro|otros|otra|otras|all)\b/,
  /\b(?:lista|muestra|dame|exporta|revela) (?:las? |los? )?(?:facturas|contratos|datos|clientes|conversaciones|documentos)(?:\s+de)?\s+(?:todos?|otras? personas?|otros? clientes?)\b/,
  /\b(?:give me|show me|send me|list|export|dump|reveal|leak) (?:all |every |the |other |any )*(?:clients?|customers?|users?)'?s? (?:data|records|invoices|contracts|conversations|details|emails|phones)\b/,
  /\b(?:bypass|elude|evade|disable|skip|override) (?:the |all |your |any )?(?:security|safety|filters?|restrictions|rules|guardrails|controls)\b/,
  /\b(?:saltate|omite) (?:las? )?(?:reglas|instrucciones|restricciones|controles)\b/,
]

type ContextoGuardia = 'PUBLICO' | 'INTERNO' | 'CLIENTE'

function esInyeccion(textoOriginal: string, textoGuardia: string, contexto: ContextoGuardia): boolean {
  const marcadorRol = /(?:<\|(?:system|assistant|developer)\|>|\[INST\]|###\s*(?:system|instruction))/i.test(textoOriginal)
  if (marcadorRol || INYECCION_DIRECTA.some(patron => patron.test(textoGuardia))) return true
  if (ORDEN_DESOBEDECER.test(textoGuardia) && REGLAS_ASISTENTE.test(textoGuardia)) return true
  if (PEDIR_EXFILTRACION.test(textoGuardia) && PROMPT_EXPLICITO.test(textoGuardia)) return true
  // El alcance llega exclusivamente del servidor tras ACL. Un panel interno
  // autorizado puede resumir documentación propia, pero nunca puede anular
  // instrucciones ni exponer el prompt (los dos controles anteriores).
  return contexto === 'PUBLICO' && pideMaterialInterno(textoGuardia)
}

const ENFADO = /\b(?:inutil|inútil|mierda|puta|estafa(?:dores)?|imbecil|imbécil|vergonzoso|ladrones?|cabreo|enfadad[oa]|reclamacion|reclamación)\b/i
// «soporte» o «contactar con» solos son preguntas informativas (FAQ); la petición
// de persona exige un sujeto humano explícito o «hablar con alguien».
const HUMANO = /\b(?:persona|humano|humana|agente|operador|operadora|comercial|llamad(?:me|a)|hablar con alguien)\b/i
const SALUDO = /^(?:hola|buenas(?:\s+(?:tardes|dias|días|noches))?|hey|hello|hi|que tal|qué tal)[!. ,¡¿?]*$/i
const FUERA_DOMINIO = /\b(?:receta|horoscopo|horóscopo|resultado(?:s)? (?:de )?futbol|fútbol|criptomoneda|acciones? de bolsa|programa(?:r)? en python|politica internacional|política internacional)\b/i

export type AnalisisMensaje = { longitudOk: boolean; injection: boolean; enfado: boolean; peticionHumano: boolean; fueraDominio: boolean; saludo: boolean }

export function analizarMensaje(texto: string, maximo = 1500, contexto: ContextoGuardia = 'PUBLICO'): AnalisisMensaje {
  const limpio = String(texto ?? '').trim()
  const normalizado = normalizar(limpio)
  const guardia = normalizarParaGuardia(limpio)
  return {
    longitudOk: limpio.length > 0 && limpio.length <= maximo,
    injection: esInyeccion(limpio, guardia, contexto),
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

export const RESPUESTA_INYECCION = 'Lo siento, no puedo ayudar a revelar instrucciones ni información interna. Puedo ayudarte con información pública sobre los servicios de Internet Operadores.'
