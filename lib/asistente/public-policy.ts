export type CandidataFuentePublica = {
  titulo: string
  contenido: string
  origen?: string | null
  tipo?: string | null
}

/**
 * Canoniza exclusivamente el texto de comparación de la política. Conserva el
 * original para indexado/citas, pero evita evadir los mismos términos mediante
 * acentos combinados, variantes de anchura, guiones Unicode o invisibles.
 */
export function normalizarTextoParaPolitica(valor: string): string {
  return String(valor ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Los format characters (ZWSP, joiners, word joiner, BOM…) no separan una
    // palabra visible; los controles tampoco deben partir «Más\0Orange».
    .replace(/[\p{Cf}\p{Cc}\u00AD]/gu, '')
    .replace(/\p{Z}+/gu, ' ')
    .replace(/[\p{Pd}\u2212]/gu, '-')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Términos que identifican catálogo de compras, mayorista o licencias que no
 * deben convertirse en conocimiento del chat público. La comprobación se hace
 * sobre título, contenido y procedencia: nunca se acepta una tarifa sólo por
 * llevar una bandera de publicación.
 */
const PATRONES_NO_PUBLICOS: ReadonlyArray<{ patron: RegExp; motivo: string }> = [
  { patron: /\b(?:m[aá]s\s*orange|masorange)\b/i, motivo: 'MAYORISTA_MASORANGE' },
  // Orange se rechaza sólo cuando el contexto apunta a operador/mayorista, no
  // por usos accidentales como una clase CSS o un color.
  { patron: /\borange\b(?=[\s,:;()\-]*(?:mayorista|wholesale|operador|fibra|tarifa|coste|proveedor))/i, motivo: 'MAYORISTA_ORANGE' },
  { patron: /\bcm\s*[-–—]?\s*fibra\b/i, motivo: 'CATALOGO_CM_FIBRA' },
  { patron: /\b(?:cogent|gpgent)\b/i, motivo: 'MAYORISTA_COGENT' },
  { patron: /\b(?:arrow|v\s*[-–—]?\s*valley|vvalley)\b/i, motivo: 'DISTRIBUIDOR_INTERNO' },
  { patron: /\bzoom(?:\s*[-–—:]?\s*)webinar(?:s)?\b/i, motivo: 'LICENCIA_INTERNA_ZOOM_WEBINAR' },
  { patron: /\b(?:coste\s+(?:operador|mayorista)|precio\s+de\s+compra|margen\s+(?:interno|comercial)|isp\s*gesti[oó]n)\b/i, motivo: 'DATO_COMERCIAL_INTERNO' },
]

/**
 * Nombres de proveedores/mayoristas que nunca identifican una tarifa propia.
 * Se aplican sólo a TARIFA: una guía o comparativa pública puede mencionar
 * legítimamente a estos operadores y no debe desaparecer del corpus web.
 */
const PATRONES_PROVEEDOR_NO_TARIFA: ReadonlyArray<{ patron: RegExp; motivo: string }> = [
  { patron: /\btelef[oó]nica\b/i, motivo: 'PROVEEDOR_MAYORISTA_TELEFONICA' },
  { patron: /\bmovistar\b/i, motivo: 'PROVEEDOR_MAYORISTA_MOVISTAR' },
  { patron: /\bvodafone\b/i, motivo: 'PROVEEDOR_MAYORISTA_VODAFONE' },
  { patron: /\borange\b/i, motivo: 'PROVEEDOR_MAYORISTA_ORANGE' },
  { patron: /\byoigo\b/i, motivo: 'PROVEEDOR_MAYORISTA_YOIGO' },
  { patron: /\bxoc\b/i, motivo: 'PROVEEDOR_MAYORISTA_XOC' },
  { patron: /\btemplus\b/i, motivo: 'PROVEEDOR_MAYORISTA_TEMPLUS' },
  { patron: /\badamo\b/i, motivo: 'PROVEEDOR_MAYORISTA_ADAMO' },
  // No se usa «aire» aislado para no bloquear vocabulario legítimo.
  { patron: /\baire\s*[- ]?\s*networks\b/i, motivo: 'PROVEEDOR_MAYORISTA_AIRE_NETWORKS' },
]

function textoDeCandidata(candidata: CandidataFuentePublica): string {
  return normalizarTextoParaPolitica([candidata.titulo, candidata.contenido, candidata.origen, candidata.tipo]
    .filter((parte): parte is string => typeof parte === 'string')
    .join(' '))
}

/** Devuelve un código estable para informes de ensayo, sin exponer contenido. */
export function motivoFuenteNoAptaParaPublico(candidata: CandidataFuentePublica): string | null {
  const texto = textoDeCandidata(candidata)
  if (!texto.trim()) return 'FUENTE_VACIA'
  const motivoGeneral = PATRONES_NO_PUBLICOS.find(({ patron }) => patron.test(texto))?.motivo
  if (motivoGeneral) return motivoGeneral
  if (normalizarTextoParaPolitica(candidata.tipo || '') === 'tarifa') return PATRONES_PROVEEDOR_NO_TARIFA.find(({ patron }) => patron.test(texto))?.motivo || null
  return null
}

/**
 * Contrato compartido de entrada al espacio público. No es una lista de temas
 * prohibidos: backup, 5G y centralita IP permanecen permitidos si la fuente es
 * una página propia pública y no contiene señales de catálogo interno.
 */
export function fuenteAptaParaPublico(candidata: CandidataFuentePublica): boolean {
  return motivoFuenteNoAptaParaPublico(candidata) === null
}
