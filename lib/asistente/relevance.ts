import { normalizar } from '@/lib/asistente/text'
import { fuenteAptaParaPublico } from '@/lib/asistente/public-policy'

/**
 * Metadatos mínimos que llegan desde una consulta que ya aplicó su ACL. Esta
 * política NO autoriza espacios: sólo decide si una fuente pública ya visible
 * es apropiada para responder en el canal público.
 */
export type FuenteParaRelevancia = {
  id?: string
  documentoId?: string
  titulo: string
  contenido: string
  urlFuente?: string | null
  origen?: string | null
  tipo?: string | null
  puntuacion?: number
}

type IntencionTema = 'CERO_RIESGOS' | 'RESPALDO_CONEXION' | 'GENERAL'
type PerfilConsulta = {
  terminos: string[]
  identificadores: string[]
  intencion: IntencionTema
  pideDefinicion: boolean
  pidePrecio: boolean
  anclas: string[]
  conceptos: string[]
}
type Evaluacion = { puntuacion: number; titulo: number; contenido: number; acepta: boolean }

const PALABRAS_FUNCIONALES = new Set([
  'a', 'al', 'ante', 'como', 'con', 'cual', 'cuales', 'cuando', 'cuanto', 'cuanta', 'cuantos', 'cuantas',
  'de', 'del', 'donde', 'el', 'en', 'es', 'esa', 'ese', 'esta', 'este', 'hay', 'la', 'las', 'lo', 'los',
  'mi', 'mis', 'no', 'o', 'para', 'por', 'que', 'se', 'segun', 'si', 'sobre', 'su', 'sus', 'un', 'una', 'unos', 'unas',
  'busco', 'buscamos', 'dame', 'decidme', 'explica', 'explicame', 'informacion', 'necesito', 'ofrece', 'ofrecen',
  'ofreceis', 'ofrecéis', 'podria', 'podría', 'quiero', 'saber', 'teneis', 'tenéis', 'tiene', 'tienen',
  // Son intenciones de dato, no el tema del producto. No deben convertir una
  // cifra de otra fuente en una respuesta pertinente.
  'coste', 'cuesta', 'cuota', 'importe', 'precio', 'tarifa', 'valor',
  // Etiquetas de forma frecuentes en preguntas. Sólo adquieren sentido cuando
  // van acompañadas de un tema concreto en el cuerpo de la fuente.
  'aparece', 'aparecen', 'pagina', 'publica', 'publicado', 'publicada', 'servicio', 'solucion', 'soluciones',
  'entre', 'sirve', 'tengo', 'tenga', 'varias', 'varios', 'alguien', 'actue', 'actua', 'entra', 'antes',
  'pide', 'considera', 'gestiona', 'anuncia', 'empresarial', 'empresa', 'negocio',
  'contra', 'principal', 'linea', 'interna', 'interno', 'red',
  'informe', 'necesita',
  'incluye', 'incluyen',
])

const RESPALDO_NUCLEO = ['backup', 'respaldo', 'failover', 'conmutacion', 'redundancia']
const RESPALDO_FALLO = ['caida', 'caer', 'falla', 'fallar', 'corte', 'interrupcion', 'interrumpe']
const RESPALDO_RED = ['conexion', 'fibra', 'internet', '5g', '4g', 'wimax', 'satelite']

/**
 * Familias de lenguaje de producto y soporte. Son equivalencias de uso común
 * en español, no nombres de productos ni rutas: sólo se usan para priorizar
 * candidatos que la consulta ACL/FTS ya recuperó. Nunca añaden una fuente ni
 * expanden la consulta a contenido no autorizado.
 */
const CONCEPTOS: Readonly<Record<string, readonly string[]>> = {
  continuidad: [...RESPALDO_NUCLEO, ...RESPALDO_FALLO, 'disponibilidad', 'alternativa'],
  soporte: ['soporte', 'atencion', 'asistencia', 'tecnico', 'incidencia', 'averia'],
  horario: ['horario', '24/7', '24h', 'guardia', 'nocturno', 'fin', 'semana'],
  pago: ['pagar', 'pago', 'recibo', 'domiciliacion', 'sepa', 'transferencia', 'tarjeta', 'factura'],
  configuracion: ['guia', 'tutorial', 'instruccion', 'paso', 'configuracion', 'instalar', 'preparar'],
  redLocal: ['router', 'wifi', 'lan', 'wan', 'red', 'panel'],
  comunicaciones: ['centralita', 'voip', 'extension', 'buzon', 'llamada'],
  teletrabajo: ['vpn', 'teletrabajo', 'remoto', 'casa'],
  ciberseguridad: ['ciberseguridad', 'ransomware', 'antivirus', 'firewall', 'edr', 'endpoint', 'vulnerabilidad'],
  auditoria: ['auditoria', 'auditar', 'analisis', 'analizar', 'evaluar', 'diagnostico', 'revisar'],
  prioridades: ['hallazgo', 'ordenar', 'prioridad', 'impacto', 'urgencia'],
  entrega: ['entrega', 'entregar', 'recibir', 'informe', 'videollamada', 'plazo'],
  multisede: ['sede', 'oficina', 'sucursal', 'delegacion', 'centro'],
  cobertura: ['cobertura', 'comprobador', 'direccion', 'postal', 'provincia', 'ubicacion'],
  capacidad: ['ancho', 'banda', 'videoconferencia', 'voip', 'nube', 'uso', 'trafico'],
  intervencion: ['actua', 'actue', 'alguien', 'manual', 'intervencion'],
}

function tokens(valor: string): string[] {
  return normalizar(valor).split(' ').map(token => token.replace(/^[.:]+|[.:]+$/g, '')).filter(Boolean)
}

function esMismoLexema(a: string, b: string): boolean {
  if (a === b) return true
  // Singular/plural de palabras cortas; para derivaciones exigir cinco letras
  // evita confundir «interrumpe» con «internet» o «interna».
  if (a.length >= 4 && (a + 's' === b || b + 's' === a)) return true
  if (a.length >= 5 && (a + 'r' === b || b + 'r' === a || a + 'n' === b || b + 'n' === a)) return true
  return a.length >= 6 && b.length >= 6 && a.slice(0, 6) === b.slice(0, 6)
}

function incluyeLexema(lista: readonly string[], termino: string): boolean {
  return lista.some(valor => esMismoLexema(valor, termino))
}

function cuentaCoincidencias(consulta: readonly string[], fuente: readonly string[]): number {
  return consulta.filter(termino => incluyeLexema(fuente, termino)).length
}

function cuentaExactas(consulta: readonly string[], fuente: readonly string[]): number {
  return consulta.filter(termino => fuente.includes(termino)).length
}

function contieneAlguno(lista: readonly string[], terminos: readonly string[]): boolean {
  return terminos.some(termino => incluyeLexema(lista, termino))
}

function conceptosDe(tokensConsulta: readonly string[]): string[] {
  return Object.entries(CONCEPTOS)
    .filter(([, terminos]) => contieneAlguno(tokensConsulta, terminos))
    .map(([concepto]) => concepto)
}

function perfilDe(consulta: string): PerfilConsulta {
  const todos = tokens(consulta)
  const terminos = todos.filter(termino => !PALABRAS_FUNCIONALES.has(termino) && (termino.length > 2 || termino === '5g' || termino === '4g'))
  // Un código de tarifa/producto (CM-FIBRA1000, XG-42...) no se puede
  // satisfacer con una coincidencia casual de «fibra», «5G» o «precio».
  const identificadores = terminos.filter(termino => /(?=.*\d)[\p{L}\p{N}-]{4,}/u.test(termino))
  const ceroRiesgos = incluyeLexema(todos, 'cero') && contieneAlguno(todos, ['riesgo'])
  const respaldoExplicito = contieneAlguno(todos, RESPALDO_NUCLEO)
  const falloDeRed = contieneAlguno(todos, RESPALDO_FALLO) && contieneAlguno(todos, RESPALDO_RED)
  const pideDefinicion = /\b(?:que es|en que consiste|como funciona|que incluye|que analiza)\b/.test(normalizar(consulta))
  const pidePrecio = /\b(?:precio|coste|cuesta|cuestan|tarifa|cuota|importe|vale|valen|iva|impuesto)\b/.test(normalizar(consulta))
  return {
    terminos,
    identificadores,
    intencion: ceroRiesgos ? 'CERO_RIESGOS' : respaldoExplicito || falloDeRed ? 'RESPALDO_CONEXION' : 'GENERAL',
    pideDefinicion,
    pidePrecio,
    // Tecnologías inequívocas: oficinas o tráfico no sustituyen el producto.
    // Estas anclas no añaden rutas ni contenido a la recuperación.
    anclas: terminos.filter(termino => ['mpls', 'sd-wan', 'exagrid', 'wildix'].includes(termino)
      || (['router', 'vpn'].includes(termino) && conceptosDe(terminos).includes('configuracion'))),
    conceptos: conceptosDe(todos),
  }
}

function esFuenteCeroRiesgos(titulo: readonly string[], contenido: readonly string[]): boolean {
  const todo = [...titulo, ...contenido]
  return incluyeLexema(todo, 'cero') && contieneAlguno(todo, ['riesgo'])
}

function esFuenteRespaldo(titulo: readonly string[], contenido: readonly string[]): boolean {
  // El título de un artículo sobre caídas no basta: el cuerpo debe explicar
  // la solución de respaldo, no simplemente describir el problema.
  return contieneAlguno(contenido, RESPALDO_NUCLEO)
}

/** Defensa pública: sólo el catálogo certificado por la ingesta positiva es apto. */
export function fuenteAptaParaPublicoLocal(fuente: Pick<FuenteParaRelevancia, 'titulo' | 'contenido' | 'origen' | 'tipo'>): boolean {
  if (!fuenteAptaParaPublico(fuente)) return false
  const tipo = (fuente.tipo || '').toUpperCase()
  const origen = fuente.origen || ''
  if (tipo === 'TARIFA' && !/^publico:tarifa:\d+$/.test(origen)) return false
  if (/^tarifa:/.test(origen)) return false
  return Boolean(String(fuente.titulo || '').trim() && String(fuente.contenido || '').trim())
}

/** Aplica la defensa pública sólo después de que la consulta SQL haya aislado el espacio autorizado. */
export function filtrarCandidatosPublicos<T extends FuenteParaRelevancia>(fuentes: T[]): T[] {
  return fuentes.filter(fuenteAptaParaPublicoLocal)
}

type Frecuencias = Map<string, number>

function fuentesDelMismoTema(perfil: PerfilConsulta, fuentes: FuenteParaRelevancia[]): FuenteParaRelevancia[] {
  if (perfil.intencion === 'CERO_RIESGOS') {
    const cero = fuentes.filter(fuente => esFuenteCeroRiesgos(tokens(fuente.titulo), tokens(fuente.contenido)))
    if (cero.length) return cero
  }
  if (perfil.intencion === 'RESPALDO_CONEXION') {
    const respaldo = fuentes.filter(fuente => esFuenteRespaldo(tokens(fuente.titulo), tokens(fuente.contenido)))
    if (respaldo.length) return respaldo
  }
  return fuentes
}

/**
 * Da poco peso a la palabra que se repite en todas las secciones de una misma
 * página y mantiene el de atributos distintivos que aparecen en el cuerpo.
 * Es una medida local sobre candidatos ya autorizados, no un modelo ni un
 * índice paralelo.
 */
function frecuenciasDe(terminos: readonly string[], fuentes: FuenteParaRelevancia[]): Frecuencias {
  const frecuencias: Frecuencias = new Map()
  for (const termino of terminos) {
    const apariciones = fuentes.reduce((total, fuente) => {
      const todo = [...tokens(fuente.titulo), ...tokens(fuente.contenido)]
      return total + (incluyeLexema(todo, termino) ? 1 : 0)
    }, 0)
    frecuencias.set(termino, apariciones)
  }
  return frecuencias
}

function pesoTermino(termino: string, frecuencias: Frecuencias, total: number): number {
  const repetido = frecuencias.get(termino) || 0
  // Suavizado para mantener una pequeña señal de pertenencia de producto,
  // incluso si todos sus capítulos contienen el mismo nombre.
  return 1 + Math.log((total + 1) / (repetido + 1))
}

function puntuacionPonderada(terminos: readonly string[], fuente: readonly string[], frecuencias: Frecuencias, total: number): number {
  return terminos.reduce((puntuacion, termino) => puntuacion + (incluyeLexema(fuente, termino) ? pesoTermino(termino, frecuencias, total) : 0), 0)
}

function conceptosCoincidentes(conceptos: readonly string[], fuente: readonly string[]): number {
  return conceptos.reduce((total, concepto) => total + (contieneAlguno(fuente, CONCEPTOS[concepto] || []) ? 1 : 0), 0)
}

function tieneCifraDePrecio(texto: string): boolean {
  return /\b\d+(?:[.,]\d+)?\s*€/.test(normalizar(texto))
}

function tieneDefinicionExplicita(texto: string): boolean {
  const normalizado = normalizar(texto)
  return /\b(?:es|son)\s+(?:una|un|el|la)\b/.test(normalizado)
    || /\b(?:analizamos|evaluamos|ofrecemos|incluye|consiste)\b/.test(normalizado)
}

function evaluarFuente(perfil: PerfilConsulta, fuente: FuenteParaRelevancia, frecuencias: Frecuencias, totalTema: number): Evaluacion {
  const titulo = tokens(fuente.titulo)
  const contenido = tokens(fuente.contenido)
  const todo = [...titulo, ...contenido]
  const coincidenciasTitulo = cuentaCoincidencias(perfil.terminos, titulo)
  const coincidenciasContenido = cuentaCoincidencias(perfil.terminos, contenido)
  const exactasTitulo = cuentaExactas(perfil.terminos, titulo)
  const exactasContenido = cuentaExactas(perfil.terminos, contenido)
  const fuenteCero = esFuenteCeroRiesgos(titulo, contenido)
  const fuenteRespaldo = esFuenteRespaldo(titulo, contenido)
  const conceptosContenido = conceptosCoincidentes(perfil.conceptos, contenido)
  const conceptosTitulo = conceptosCoincidentes(perfil.conceptos, titulo)
  const definicionExplicita = tieneDefinicionExplicita(fuente.contenido)
  const fichaDePrecio = tieneCifraDePrecio(`${fuente.titulo} ${fuente.contenido}`)
  // Una FAQ es una respuesta editorial atómica. Si ya comparte el tema de la
  // pregunta, se prefiere a una sección comercial extensa que sólo coincide
  // por vocabulario operativo (por ejemplo, «horario» o «incidencia»).
  const respuestaFaq = (fuente.tipo || '').toUpperCase() === 'FAQ' && (coincidenciasContenido > 0 || conceptosContenido > 0)

  let acepta: boolean
  let bonoTema = 0
  if (perfil.intencion === 'CERO_RIESGOS') {
    // «Informe» o una cifra no identifican por sí mismos el producto. Exigimos
    // el binomio Cero + Riesgo para que un precio accesorio no lo suplante.
    acepta = fuenteCero
    bonoTema = fuenteCero ? 8 : 0
  } else if (perfil.intencion === 'RESPALDO_CONEXION') {
    // Una tarifa de fibra o una página que sólo nombra 5G no responde a una
    // pregunta de contingencia. Debe hablar de respaldo/failover o del fallo
    // de red y su activación.
    acepta = fuenteRespaldo
    bonoTema = fuenteRespaldo ? 8 : 0
  } else {
    // Un título puede ser una etiqueta genérica de página. Se acepta una fuente
    // por dos señales de cuerpo, una coincidencia temática más un concepto, o
    // un título preciso; no por una palabra incidental aislada en el cuerpo.
    acepta = coincidenciasContenido >= 2
      || (coincidenciasContenido >= 1 && conceptosContenido >= 1)
      || (coincidenciasTitulo >= 1 && (coincidenciasContenido >= 1 || conceptosContenido >= 1))
  }
  if (perfil.identificadores.length) acepta = perfil.identificadores.every(identificador => todo.includes(identificador))
  if (perfil.intencion === 'GENERAL' && contieneAlguno(perfil.terminos, ['auditar', 'evaluar', 'evalua', 'analizar', 'analisis'])) {
    acepta = acepta && contieneAlguno(todo, CONCEPTOS.auditoria)
  }
  if (perfil.anclas.length && !perfil.anclas.every(ancla => todo.includes(ancla))) acepta = false

  const ponderadaTitulo = puntuacionPonderada(perfil.terminos, titulo, frecuencias, totalTema)
  const ponderadaContenido = puntuacionPonderada(perfil.terminos, contenido, frecuencias, totalTema)
  const cobertura = perfil.terminos.length ? (ponderadaTitulo + ponderadaContenido) / perfil.terminos.length : 0
  return {
    acepta,
    titulo: coincidenciasTitulo,
    contenido: coincidenciasContenido,
    // El cuerpo recibe más peso que el título porque contiene el dato que se
    // mostrará literalmente. Conceptos sólo desempatan capítulos ya recuperados
    // por ACL/FTS; no permiten que una página genérica responda sin evidencia.
    puntuacion: bonoTema
      + ponderadaTitulo * 8
      + ponderadaContenido * 3
      + cobertura * 2
      + exactasTitulo * 8
      + exactasContenido
      + conceptosContenido * 2
      + cuentaCoincidencias(perfil.terminos, todo) * 15
      + (perfil.terminos.every(termino => incluyeLexema(todo, termino)) ? 35 : 0)
      + (perfil.conceptos.includes('intervencion') && contieneAlguno(contenido, CONCEPTOS.intervencion) ? 48 : 0)
      + conceptosTitulo * 2
      + (respuestaFaq ? 48 : 0)
      + (perfil.anclas.some(ancla => titulo.includes(ancla)) ? 20 : 0)
      + (perfil.anclas.some(ancla => titulo.includes(ancla)) && titulo.length <= 3 ? 28 : 0)
      - (titulo.length > 10 ? 18 : 0)
      // La ficha específica prima sobre el índice que la resume, sólo una
      // vez superado el umbral: no autoriza nuevas fuentes.
      + ((fuente.urlFuente || '').split('/').filter(Boolean).length >= 2 ? 2 : 0)
      + (/^\/(?:productos|soluciones)\//.test(fuente.urlFuente || '') ? 10 : 0)
      + (perfil.pideDefinicion && definicionExplicita ? 20 : 0)
      + (perfil.pidePrecio && fichaDePrecio ? 10 : 0)
      - (!perfil.pidePrecio && fichaDePrecio ? 4 : 0),
  }
}

function claveSinDuplicado(fuente: FuenteParaRelevancia): string {
  if (fuente.documentoId) return `documento:${fuente.documentoId}`
  return `fuente:${normalizar(fuente.titulo)}|${normalizar(fuente.urlFuente || '')}`
}

/**
 * Reordenado léxico, local y determinista. No llama a embeddings, modelos ni
 * red. Además elimina fragmentos repetidos de un mismo documento antes de
 * imponer el máximo de fuentes que puede llegar a la respuesta.
 */
export function reordenarCandidatosLocalmente<T extends FuenteParaRelevancia>(consulta: string, candidatas: T[], limite = 3): T[] {
  const perfil = perfilDe(consulta)
  if (!perfil.terminos.length) return []
  const poblacionTema = fuentesDelMismoTema(perfil, candidatas)
  const frecuencias = frecuenciasDe(perfil.terminos, poblacionTema)
  const vistas = new Set<string>()
  return candidatas
    .map(fuente => ({ fuente, evaluacion: evaluarFuente(perfil, fuente, frecuencias, poblacionTema.length || 1) }))
    .filter(({ evaluacion }) => evaluacion.acepta && evaluacion.puntuacion > 0)
    .sort((a, b) => b.evaluacion.puntuacion - a.evaluacion.puntuacion || b.evaluacion.contenido - a.evaluacion.contenido || b.evaluacion.titulo - a.evaluacion.titulo || (b.fuente.puntuacion || 0) - (a.fuente.puntuacion || 0))
    .filter(({ fuente }) => {
      const clave = claveSinDuplicado(fuente)
      if (vistas.has(clave)) return false
      vistas.add(clave)
      return true
    })
    .slice(0, Math.max(1, Math.min(3, limite)))
    .map(({ fuente, evaluacion }) => ({ ...fuente, puntuacion: evaluacion.puntuacion })) as T[]
}

/** Es pública únicamente la búsqueda cuyo alcance no contiene espacios privados. */
export function esAlcanceSoloPublico(espacios: string[]): boolean {
  return espacios.length > 0 && espacios.every(espacio => espacio === 'PUBLICO')
}
