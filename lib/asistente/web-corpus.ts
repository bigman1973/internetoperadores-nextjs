import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { fuenteAptaParaPublico } from '@/lib/asistente/public-policy'
import { sha256Hex, textoPlano } from '@/lib/asistente/text'

export type TipoCorpusPublico = 'WEB' | 'FAQ' | 'LEGAL' | 'TARIFA'

export type EntradaManifestCorpusPublico = {
  ruta: string
  /** Fichero que representa la ruta o contiene su JSX editorial principal. */
  archivo: string
  tipo: TipoCorpusPublico
  /** Otros componentes públicos que esta ruta renderiza con texto editorial. */
  fuentes?: readonly string[]
  /** Componentes públicos declarados para trazabilidad, cuyo texto depende del catálogo dinámico. */
  fuentesDinamicas?: readonly string[]
  /**
   * La ruta se muestra como catálogo alimentado desde la base. No se extraen
   * sus props ni tarjetas plantilla: la fuente de tarifas es tarifasPublicas.
   */
  dinamica?: boolean
  /** La ruta combina texto editorial local con tarjetas de tarifas dinámicas. */
  tarifasDinamicas?: boolean
  /** Justificación explícita si la ruta pública no produce texto indexable. */
  motivoCeroFuentes?: string
  soloEncabezados?: readonly string[]
  omitirEncabezados?: readonly string[]
  /** Compatibilidad con consumidores anteriores; las colecciones se detectan mediante AST. */
  coleccionLiteral?: string
}

export type FuenteCorpusPublico = {
  titulo: string
  contenido: string
  tipo: 'WEB' | 'FAQ' | 'TARIFA'
  origen: string
  urlFuente: string
  huella: string
}

/**
 * Páginas públicas con contenido editorial versionado. No es un crawler: cada
 * archivo se declara de forma explícita y se lee únicamente desde el repositorio.
 * Las rutas de catálogo se mantienen en el inventario, pero no aportan las
 * tarjetas plantilla; sus precios y características se materializan después con
 * tarifasPublicas y su lista positiva comercial.
 */
export const MANIFEST_CORPUS_PUBLICO: readonly EntradaManifestCorpusPublico[] = [
  // La raíz reexporta SelectorPage; se declara el archivo que realmente renderiza texto.
  { ruta: '/', archivo: 'app/selector/page.js', tipo: 'WEB', fuentes: ['app/page.js'] },
  { ruta: '/selector', archivo: 'app/selector/page.js', tipo: 'WEB' },
  { ruta: '/cero-riesgos', archivo: 'app/cero-riesgos/page.js', tipo: 'WEB' },
  { ruta: '/condiciones-generales', archivo: 'app/condiciones-generales/page.js', tipo: 'LEGAL' },
  { ruta: '/contacto', archivo: 'app/contacto/page.tsx', tipo: 'WEB' },
  { ruta: '/empresa', archivo: 'app/empresa/page.js', tipo: 'WEB' },
  { ruta: '/exagrid', archivo: 'app/exagrid/page.js', tipo: 'WEB' },
  { ruta: '/fansaticos', archivo: 'app/fansaticos/page.js', tipo: 'WEB' },
  // La página servidor sólo pasa tarifas; este componente contiene el editorial visible.
  { ruta: '/particular', archivo: 'app/particular/ParticularLandingClient.tsx', tipo: 'WEB', fuentes: ['app/particular/page.tsx'], tarifasDinamicas: true },
  { ruta: '/partners', archivo: 'app/partners/page.tsx', tipo: 'WEB' },
  { ruta: '/politica-cookies', archivo: 'app/politica-cookies/page.js', tipo: 'LEGAL', omitirEncabezados: ['Declaración de Cookies'] },
  { ruta: '/politica-privacidad', archivo: 'app/politica-privacidad/page.js', tipo: 'LEGAL' },

  { ruta: '/productos', archivo: 'app/productos/page.tsx', tipo: 'WEB' },
  { ruta: '/productos/backup', archivo: 'app/productos/backup/page.tsx', tipo: 'WEB' },
  { ruta: '/productos/ciberseguridad', archivo: 'app/productos/ciberseguridad/page.tsx', tipo: 'WEB' },
  { ruta: '/productos/cloud-hosting', archivo: 'app/productos/cloud-hosting/page.tsx', tipo: 'WEB' },
  { ruta: '/productos/comunicaciones-unificadas', archivo: 'app/productos/comunicaciones-unificadas/page.tsx', tipo: 'WEB', tarifasDinamicas: true },
  { ruta: '/productos/conectividad-avanzada', archivo: 'app/productos/conectividad-avanzada/page.tsx', tipo: 'WEB', tarifasDinamicas: true },
  { ruta: '/productos/desarrollo-web', archivo: 'app/productos/desarrollo-web/page.tsx', tipo: 'WEB' },
  { ruta: '/productos/mantenimiento-it', archivo: 'app/productos/mantenimiento-it/page.tsx', tipo: 'WEB' },
  { ruta: '/productos/moviles', archivo: 'app/productos/moviles/page.tsx', tipo: 'WEB' },

  { ruta: '/recursos', archivo: 'app/recursos/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog', archivo: 'app/recursos/blog/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog/conexion-respaldo-senales', archivo: 'app/recursos/blog/conexion-respaldo-senales/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog/mpls-vs-sdwan', archivo: 'app/recursos/blog/mpls-vs-sdwan/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog/ransomware-exagrid', archivo: 'app/recursos/blog/ransomware-exagrid/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog/teams-vs-zoom-vs-wildix', archivo: 'app/recursos/blog/teams-vs-zoom-vs-wildix/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog/tendencias-comunicaciones-2026', archivo: 'app/recursos/blog/tendencias-comunicaciones-2026/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/blog/wifi-empresarial-guia', archivo: 'app/recursos/blog/wifi-empresarial-guia/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/casos-exito', archivo: 'app/recursos/casos-exito/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/casos-exito/hosteleria-hotel', archivo: 'app/recursos/casos-exito/hosteleria-hotel/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/casos-exito/industria-automocion', archivo: 'app/recursos/casos-exito/industria-automocion/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/casos-exito/retail-cadena', archivo: 'app/recursos/casos-exito/retail-cadena/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/casos-exito/sector-publico-sanidad', archivo: 'app/recursos/casos-exito/sector-publico-sanidad/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/casos-exito/servicios-profesionales', archivo: 'app/recursos/casos-exito/servicios-profesionales/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/faq', archivo: 'app/recursos/faq/page.tsx', tipo: 'FAQ' },
  { ruta: '/recursos/guias', archivo: 'app/recursos/guias/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/guias/checklist-seguridad-red', archivo: 'app/recursos/guias/checklist-seguridad-red/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/guias/comunicaciones-unificadas', archivo: 'app/recursos/guias/comunicaciones-unificadas/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/guias/conectividad-empresarial', archivo: 'app/recursos/guias/conectividad-empresarial/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/guias/migracion-a-la-nube', archivo: 'app/recursos/guias/migracion-a-la-nube/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/guias/wifi-empresarial', archivo: 'app/recursos/guias/wifi-empresarial/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/herramientas', archivo: 'app/recursos/herramientas/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/herramientas/calculadora-roi', archivo: 'app/recursos/herramientas/calculadora-roi/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/herramientas/cobertura-fibra', archivo: 'app/recursos/herramientas/cobertura-fibra/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/herramientas/estimador-ancho-banda', archivo: 'app/recursos/herramientas/estimador-ancho-banda/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/herramientas/test-velocidad', archivo: 'app/recursos/herramientas/test-velocidad/page.tsx', tipo: 'WEB' },
  { ruta: '/recursos/webinars', archivo: 'app/recursos/webinars/page.tsx', tipo: 'WEB' },

  { ruta: '/sectores', archivo: 'app/sectores/page.tsx', tipo: 'WEB' },
  { ruta: '/sectores/educacion', archivo: 'app/sectores/educacion/page.tsx', tipo: 'WEB' },
  { ruta: '/sectores/hosteleria-turismo', archivo: 'app/sectores/hosteleria-turismo/page.tsx', tipo: 'WEB' },
  { ruta: '/sectores/industria-logistica', archivo: 'app/sectores/industria-logistica/page.tsx', tipo: 'WEB' },
  { ruta: '/sectores/retail-comercio', archivo: 'app/sectores/retail-comercio/page.tsx', tipo: 'WEB' },
  { ruta: '/sectores/sanidad', archivo: 'app/sectores/sanidad/page.tsx', tipo: 'WEB' },
  { ruta: '/sectores/servicios-profesionales', archivo: 'app/sectores/servicios-profesionales/page.tsx', tipo: 'WEB' },

  { ruta: '/soluciones', archivo: 'app/soluciones/page.tsx', tipo: 'WEB' },
  { ruta: '/soluciones/comunicaciones-unificadas', archivo: 'app/soluciones/comunicaciones-unificadas/page.tsx', tipo: 'WEB', fuentesDinamicas: ['components/public/ProductosSolucionDynamic.tsx'], tarifasDinamicas: true },
  { ruta: '/soluciones/conectividad-avanzada', archivo: 'app/soluciones/conectividad-avanzada/page.tsx', tipo: 'WEB', fuentesDinamicas: ['components/public/ProductosSolucionDynamic.tsx'], tarifasDinamicas: true },
  { ruta: '/soluciones/exagrid', archivo: 'app/soluciones/exagrid/page.tsx', tipo: 'WEB', fuentesDinamicas: ['components/public/ProductosSolucionDynamic.tsx'], tarifasDinamicas: true },
  { ruta: '/soluciones/infraestructura-red', archivo: 'app/soluciones/infraestructura-red/page.tsx', tipo: 'WEB', fuentesDinamicas: ['components/public/ProductosSolucionDynamic.tsx'], tarifasDinamicas: true },
  { ruta: '/soluciones/mantenimiento-it', archivo: 'app/soluciones/mantenimiento-it/page.tsx', tipo: 'WEB', tarifasDinamicas: true },
  { ruta: '/soluciones/migracion-web', archivo: 'app/soluciones/migracion-web/page.tsx', tipo: 'WEB' },
  { ruta: '/soluciones/moviles', archivo: 'app/soluciones/moviles/page.tsx', tipo: 'WEB', fuentesDinamicas: ['components/public/ProductosSolucionDynamic.tsx'], tarifasDinamicas: true },
  { ruta: '/soporte', archivo: 'app/soporte/page.tsx', tipo: 'WEB' },

  // Catálogos de tarifas: contenido comercial real sólo desde tarifasPublicas.
  { ruta: '/internet', archivo: 'app/internet/page.tsx', tipo: 'TARIFA', fuentes: ['components/public/SeccionTarifasParticular.tsx'], dinamica: true },
  { ruta: '/movil', archivo: 'app/movil/page.tsx', tipo: 'TARIFA', fuentes: ['components/public/SeccionTarifasParticular.tsx'], dinamica: true },
  { ruta: '/mas-vendido', archivo: 'app/mas-vendido/page.tsx', tipo: 'TARIFA', fuentes: ['components/public/SeccionTarifasParticular.tsx'], dinamica: true },
  { ruta: '/packs', archivo: 'app/packs/page.tsx', tipo: 'TARIFA', fuentes: ['components/public/SeccionTarifasParticular.tsx'], dinamica: true },
  { ruta: '/tarifas/empresa', archivo: 'app/tarifas/empresa/page.tsx', tipo: 'TARIFA', fuentes: ['app/tarifas/empresa/TarifasEmpresaCatalog.tsx'], dinamica: true },
  { ruta: '/tarifas/particular', archivo: 'app/tarifas/particular/page.tsx', tipo: 'TARIFA', fuentes: ['app/tarifas/particular/TarifasParticularClient.tsx'], dinamica: true },
] as const

export type ExclusionCoberturaPublica = {
  patronArchivo: string
  motivo: string
}

/**
 * Exclusiones explícitas de la cobertura. Son áreas autenticadas, flujos con
 * datos aportados por el usuario o artefactos sin ruta: nunca son fuentes del
 * espacio público, aunque git los enumere como page.*.
 */
export const EXCLUSIONES_COBERTURA_PUBLICA: readonly ExclusionCoberturaPublica[] = [
  { patronArchivo: 'app/admin/**/page.*', motivo: 'AREA_ADMINISTRACION_PRIVADA' },
  { patronArchivo: 'app/cliente/**/page.*', motivo: 'AREA_CLIENTE_PRIVADA' },
  { patronArchivo: 'app/empleado/**/page.*', motivo: 'AREA_EMPLEADO_PRIVADA' },
  { patronArchivo: 'app/api/**/page.*', motivo: 'API_NO_EDITORIAL' },
  { patronArchivo: 'app/cuestionario/[token]/page.tsx', motivo: 'CUESTIONARIO_CON_TOKEN' },
  { patronArchivo: 'app/cuestionario-mantenimiento/[token]/page.tsx', motivo: 'CUESTIONARIO_CON_TOKEN' },
  { patronArchivo: 'app/login/page.tsx', motivo: 'AUTENTICACION' },
  { patronArchivo: 'app/alta-servicio/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/alta-servicio/documentacion/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/carrito/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/cero-riesgos/cotizar/page.js', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/contrata/migracion-web/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/contratar/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/demo/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/pago/cancelado/page.js', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/pago/cancelado/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/pago/confirmacion/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/pago/exito/page.js', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/peticiones/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/respuesta-migracion/page.tsx', motivo: 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO' },
  { patronArchivo: 'app/page.js.backup', motivo: 'ARTEFACTO_BACKUP_SIN_RUTA' },
  { patronArchivo: 'app/cero-riesgos/page.js.backup', motivo: 'ARTEFACTO_BACKUP_SIN_RUTA' },
  { patronArchivo: 'app/fansaticos/page.js.backup', motivo: 'ARTEFACTO_BACKUP_SIN_RUTA' },
]

export type EntradaCoberturaManifest = {
  ruta: string
  archivo: string
  tipo?: TipoCorpusPublico
  estado: 'EDITORIAL_LOCAL' | 'CATALOGO_DINAMICO_TARIFAS' | 'EXCLUIDA'
  motivo?: string
  fuentes?: readonly string[]
  fuentesDinamicas?: readonly string[]
}

/** Inventario completo: fuentes locales, catálogos que se materializan y exclusiones justificadas. */
export const MANIFEST_COBERTURA_PUBLICA: readonly EntradaCoberturaManifest[] = [
  ...MANIFEST_CORPUS_PUBLICO.map(entrada => ({
    ruta: entrada.ruta,
    archivo: entrada.archivo,
    tipo: entrada.tipo,
    estado: entrada.dinamica ? 'CATALOGO_DINAMICO_TARIFAS' as const : 'EDITORIAL_LOCAL' as const,
    fuentes: entrada.fuentes,
    fuentesDinamicas: entrada.fuentesDinamicas,
  })),
  ...EXCLUSIONES_COBERTURA_PUBLICA.map(exclusion => ({
    ruta: '(según patrón de fichero)',
    archivo: exclusion.patronArchivo,
    estado: 'EXCLUIDA' as const,
    motivo: exclusion.motivo,
  })),
] as const

function scriptKindPara(archivo: string): ts.ScriptKind {
  return /\.tsx$/i.test(archivo) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
}

function desenvuelveExpresion(nodo: ts.Expression): ts.Expression {
  let actual = nodo
  while (ts.isParenthesizedExpression(actual) || ts.isAsExpression(actual) || ts.isTypeAssertionExpression(actual) || ts.isSatisfiesExpression(actual)) actual = actual.expression
  return actual
}

function nombreEtiqueta(nodo: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const etiqueta = ts.isJsxElement(nodo) ? nodo.openingElement.tagName : nodo.tagName
  return ts.isIdentifier(etiqueta) ? etiqueta.text : ''
}

const ETIQUETAS_IGNORADAS = new Set(['nav', 'header', 'footer', 'form', 'button', 'input', 'textarea', 'select', 'option', 'svg', 'script', 'style', 'template'])

function esEtiquetaIgnorada(nodo: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const etiqueta = nombreEtiqueta(nodo)
  // Sólo las etiquetas HTML minúsculas se ignoran. Header es un componente React.
  return etiqueta === etiqueta.toLowerCase() && ETIQUETAS_IGNORADAS.has(etiqueta)
}

function textoLiteral(nodo: ts.Expression | undefined): string | null {
  if (!nodo) return null
  const limpio = desenvuelveExpresion(nodo)
  return ts.isStringLiteral(limpio) || ts.isNoSubstitutionTemplateLiteral(limpio) ? textoPlano(limpio.text) : null
}

function textoVisibleNodo(nodo: ts.Node): string {
  const partes: string[] = []
  const visitar = (actual: ts.Node) => {
    if (ts.isJsxElement(actual)) {
      if (esEtiquetaIgnorada(actual)) return
      actual.children.forEach(visitar)
      return
    }
    if (ts.isJsxFragment(actual)) {
      actual.children.forEach(visitar)
      return
    }
    if (ts.isJsxText(actual)) {
      partes.push(actual.getText())
      return
    }
    if (ts.isJsxExpression(actual)) {
      const literal = textoLiteral(actual.expression)
      if (literal) partes.push(literal)
      return
    }
    if (ts.isJsxSelfClosingElement(actual) && nombreEtiqueta(actual) === 'br') partes.push(' ')
  }
  visitar(nodo)
  return textoPlano(partes.join(' '))
}

type TokenVisible =
  | { clase: 'ENCABEZADO'; nivel: number; texto: string }
  | { clase: 'ETIQUETA'; texto: string }
  | { clase: 'TEXTO'; texto: string }

function tokensVisibles(nodo: ts.Node): TokenVisible[] {
  const salida: TokenVisible[] = []
  const visitar = (actual: ts.Node) => {
    if (ts.isJsxElement(actual)) {
      if (esEtiquetaIgnorada(actual)) return
      const etiqueta = nombreEtiqueta(actual)
      if (/^h[1-3]$/.test(etiqueta)) {
        const texto = textoVisibleNodo(actual)
        if (texto) salida.push({ clase: 'ENCABEZADO', nivel: Number(etiqueta.slice(1)), texto })
        return
      }
      // Las etiquetas de controles son texto público sólo cuando están en el
      // JSX estático. Sus valores, placeholder y opciones se descartan por no
      // ser una afirmación editorial. Un <form> entero sigue ignorándose.
      if (etiqueta === 'label') {
        const texto = textoVisibleNodo(actual)
        if (texto) salida.push({ clase: 'ETIQUETA', texto })
        return
      }
      actual.children.forEach(visitar)
      return
    }
    if (ts.isJsxFragment(actual)) {
      actual.children.forEach(visitar)
      return
    }
    if (ts.isJsxText(actual)) {
      const texto = textoPlano(actual.getText())
      if (texto) salida.push({ clase: 'TEXTO', texto })
      return
    }
    if (ts.isJsxExpression(actual)) {
      // Sólo un literal escrito como hijo JSX es texto. Variables, props, mapas,
      // llamadas y comentarios no se evalúan ni se convierten en contenido.
      const texto = textoLiteral(actual.expression)
      if (texto) salida.push({ clase: 'TEXTO', texto })
      return
    }
    if (ts.isJsxSelfClosingElement(actual) && nombreEtiqueta(actual) === 'br') salida.push({ clase: 'TEXTO', texto: ' ' })
  }
  visitar(nodo)
  return salida
}

function esFuncionAnidada(nodo: ts.Node): boolean {
  return ts.isFunctionDeclaration(nodo) || ts.isFunctionExpression(nodo) || ts.isArrowFunction(nodo) || ts.isMethodDeclaration(nodo)
}

function raicesJsxDelComponentePrincipal(archivo: ts.SourceFile): ts.Node[] {
  const funcionPrincipal = archivo.statements.find(sentencia => {
    if (!ts.isFunctionDeclaration(sentencia) || !sentencia.body) return false
    return Boolean(sentencia.modifiers?.some(modificador => modificador.kind === ts.SyntaxKind.DefaultKeyword))
  }) as ts.FunctionDeclaration | undefined
  if (!funcionPrincipal?.body) return []

  const raices: ts.Node[] = []
  const visitar = (actual: ts.Node) => {
    if (actual !== funcionPrincipal.body && esFuncionAnidada(actual)) return
    if (ts.isReturnStatement(actual) && actual.expression) {
      const expresion = desenvuelveExpresion(actual.expression)
      if (ts.isJsxElement(expresion) || ts.isJsxFragment(expresion) || ts.isJsxSelfClosingElement(expresion)) raices.push(expresion)
      return
    }
    ts.forEachChild(actual, visitar)
  }
  visitar(funcionPrincipal.body)
  return raices
}

function declaracionesColeccionesLiterales(archivo: ts.SourceFile): Map<string, ts.ArrayLiteralExpression> {
  const salida = new Map<string, ts.ArrayLiteralExpression>()
  const visitar = (actual: ts.Node) => {
    if (ts.isVariableDeclaration(actual) && ts.isIdentifier(actual.name) && actual.initializer) {
      const inicializador = desenvuelveExpresion(actual.initializer)
      if (ts.isArrayLiteralExpression(inicializador)) salida.set(actual.name.text, inicializador)
    }
    ts.forEachChild(actual, visitar)
  }
  visitar(archivo)
  return salida
}

const CAMPOS_TITULO = ['titulo', 'pregunta', 'nombre', 'perfil', 'p', 'aspecto']
const CAMPOS_NO_EDITORIALES = new Set(['id', 'slug', 'href', 'url', 'imagen', 'imagenoptimizada', 'srcset', 'width', 'height', 'icono', 'color', 'destacado', 'disponible', 'proximamente', 'encurso', 'value', 'key'])
const MAX_LONGITUD_FRAGMENTO_PUBLICO = 900

function nombrePropiedad(propiedad: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(propiedad) || !propiedad.name) return null
  return ts.isIdentifier(propiedad.name) || ts.isStringLiteral(propiedad.name) || ts.isNumericLiteral(propiedad.name) ? propiedad.name.text : null
}

function textosLiterales(valor: ts.Expression): string[] {
  const limpio = desenvuelveExpresion(valor)
  const literal = textoLiteral(limpio)
  if (literal) return [literal]
  if (ts.isArrayLiteralExpression(limpio)) return limpio.elements.flatMap(elemento => ts.isExpression(elemento) ? textosLiterales(elemento) : [])
  if (ts.isObjectLiteralExpression(limpio)) return limpio.properties.flatMap(propiedad => ts.isPropertyAssignment(propiedad) ? textosLiterales(propiedad.initializer) : [])
  return []
}

function registrosDeColeccion(valor: ts.Expression, camposRenderizados?: ReadonlySet<string>): Array<{ titulo: string; contenido: string }> {
  const salida: Array<{ titulo: string; contenido: string }> = []
  const visitar = (actual: ts.Expression, limitarAlNivelActual = Boolean(camposRenderizados)) => {
    const limpio = desenvuelveExpresion(actual)
    if (ts.isArrayLiteralExpression(limpio)) {
      limpio.elements.forEach(elemento => { if (ts.isExpression(elemento)) visitar(elemento, limitarAlNivelActual) })
      return
    }
    if (!ts.isObjectLiteralExpression(limpio)) return

    const todasLasPropiedades = limpio.properties
      .map(propiedad => ({ nombre: nombrePropiedad(propiedad), valor: ts.isPropertyAssignment(propiedad) ? propiedad.initializer : null }))
      .filter((propiedad): propiedad is { nombre: string; valor: ts.Expression } => Boolean(propiedad.nombre && propiedad.valor))
    const propiedades = limitarAlNivelActual && camposRenderizados
      ? todasLasPropiedades.filter(propiedad => camposRenderizados.has(propiedad.nombre))
      : todasLasPropiedades
    const titulo = CAMPOS_TITULO
      .map(campo => propiedades.find(propiedad => propiedad.nombre.toLocaleLowerCase('es') === campo)?.valor)
      .map(valor => valor ? textoLiteral(valor) : null)
      .find((valor): valor is string => Boolean(valor))
    const contenido = textoPlano(propiedades
      .filter(propiedad => !CAMPOS_TITULO.includes(propiedad.nombre.toLocaleLowerCase('es')) && !CAMPOS_NO_EDITORIALES.has(propiedad.nombre.toLocaleLowerCase('es')))
      .flatMap(propiedad => textosLiterales(propiedad.valor))
      .join(' '))
    if (titulo && contenido.length >= 24) salida.push({ titulo, contenido })

    // El fallback histórico para FAQ y características anidadas sólo se usa
    // cuando no se ha podido asociar la colección a campos JSX concretos. En
    // una colección directa con campos renderizados, no se recorren props
    // anidadas que el callback no mostró expresamente.
    if (!limitarAlNivelActual) todasLasPropiedades.forEach(propiedad => {
      const anidado = desenvuelveExpresion(propiedad.valor)
      if (ts.isArrayLiteralExpression(anidado) || ts.isObjectLiteralExpression(anidado)) visitar(anidado, false)
    })
  }
  visitar(valor)
  return salida
}

function callbackRenderizaJsx(callback: ts.Expression | undefined): boolean {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) return false
  let encontrado = false
  const visitar = (actual: ts.Node) => {
    if (actual !== callback && esFuncionAnidada(actual)) return
    if (ts.isJsxElement(actual) || ts.isJsxFragment(actual) || ts.isJsxSelfClosingElement(actual)) { encontrado = true; return }
    ts.forEachChild(actual, visitar)
  }
  visitar(callback.body)
  return encontrado
}

type TokenPlantillaColeccion = { clase: 'TEXTO'; texto: string } | { clase: 'CAMPO'; nombre: string }

type PlantillaColeccion = {
  tokens: TokenPlantillaColeccion[]
  campos: Set<string>
  camposEnEncabezado: Set<string>
}

function nombreCampoDelParametro(expresion: ts.Expression, parametro: string): string | null {
  const limpia = desenvuelveExpresion(expresion)
  if (ts.isIdentifier(limpia) && limpia.text === parametro) return ''
  if (ts.isPropertyAccessExpression(limpia) && ts.isIdentifier(limpia.expression) && limpia.expression.text === parametro) return limpia.name.text
  return null
}

function raizJsxDelCallback(callback: ts.Expression): ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement | null {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null
  const cuerpo = callback.body
  if (ts.isJsxElement(cuerpo) || ts.isJsxFragment(cuerpo) || ts.isJsxSelfClosingElement(cuerpo)) return cuerpo
  if (!ts.isBlock(cuerpo)) return null
  for (const sentencia of cuerpo.statements) {
    if (!ts.isReturnStatement(sentencia) || !sentencia.expression) continue
    const retorno = desenvuelveExpresion(sentencia.expression)
    if (ts.isJsxElement(retorno) || ts.isJsxFragment(retorno) || ts.isJsxSelfClosingElement(retorno)) return retorno
  }
  return null
}

/**
 * Construye una plantilla sólo a partir de los hijos JSX del callback. No se
 * recorren atributos, controladores, props ni expresiones condicionales: así
 * un campo del objeto sólo sale si se coloca realmente como hijo visible.
 */
function plantillaRenderizadaDeMap(callback: ts.Expression): PlantillaColeccion | null {
  if ((!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) || !callback.parameters[0] || !ts.isIdentifier(callback.parameters[0].name)) return null
  const raiz = raizJsxDelCallback(callback)
  if (!raiz) return null
  const parametro = callback.parameters[0].name.text
  const plantilla: PlantillaColeccion = { tokens: [], campos: new Set(), camposEnEncabezado: new Set() }
  const visitar = (actual: ts.Node, enEncabezado = false) => {
    if (ts.isJsxElement(actual)) {
      if (esEtiquetaIgnorada(actual)) return
      const esEncabezado = /^h[1-3]$/.test(nombreEtiqueta(actual))
      actual.children.forEach(hijo => visitar(hijo, enEncabezado || esEncabezado))
      return
    }
    if (ts.isJsxFragment(actual)) {
      actual.children.forEach(hijo => visitar(hijo, enEncabezado))
      return
    }
    if (ts.isJsxText(actual)) {
      const texto = textoPlano(actual.getText())
      if (texto) plantilla.tokens.push({ clase: 'TEXTO', texto })
      return
    }
    if (ts.isJsxExpression(actual) && actual.expression) {
      const campo = nombreCampoDelParametro(actual.expression, parametro)
      if (campo !== null) {
        plantilla.tokens.push({ clase: 'CAMPO', nombre: campo })
        plantilla.campos.add(campo)
        if (enEncabezado) plantilla.camposEnEncabezado.add(campo)
        return
      }
      const texto = textoLiteral(actual.expression)
      if (texto) plantilla.tokens.push({ clase: 'TEXTO', texto })
      return
    }
    if (ts.isJsxSelfClosingElement(actual) && nombreEtiqueta(actual) === 'br') plantilla.tokens.push({ clase: 'TEXTO', texto: ' ' })
  }
  visitar(raiz)
  return plantilla
}

function textoValorVisible(valor: ts.Expression | undefined): string | null {
  if (!valor) return null
  const limpio = desenvuelveExpresion(valor)
  const texto = textoLiteral(limpio)
  if (texto) return texto
  if (ts.isNumericLiteral(limpio)) return limpio.text
  return null
}

function textoFilaColeccion(elemento: ts.Expression, plantilla: PlantillaColeccion): string {
  const limpio = desenvuelveExpresion(elemento)
  const campos = new Map<string, ts.Expression>()
  if (ts.isObjectLiteralExpression(limpio)) limpio.properties.forEach(propiedad => {
    const nombre = nombrePropiedad(propiedad)
    if (nombre && ts.isPropertyAssignment(propiedad)) campos.set(nombre, propiedad.initializer)
  })
  const partes = plantilla.tokens.flatMap(token => {
    if (token.clase === 'TEXTO') return [token.texto]
    const valor = token.nombre === '' ? limpio : campos.get(token.nombre)
    const texto = textoValorVisible(valor)
    return texto ? [texto] : []
  })
  return textoPlano(partes.join(' '))
}

function ultimoEncabezadoEstaticoAntes(raiz: ts.Node, posicion: number): string | null {
  let ultimo: string | null = null
  const visitar = (actual: ts.Node) => {
    if (actual.pos >= posicion) return
    if (ts.isJsxElement(actual)) {
      if (esEtiquetaIgnorada(actual)) return
      if (/^h[1-3]$/.test(nombreEtiqueta(actual))) {
        const texto = textoVisibleNodo(actual)
        if (texto) ultimo = texto
        return
      }
      actual.children.forEach(visitar)
      return
    }
    if (ts.isJsxFragment(actual)) actual.children.forEach(visitar)
  }
  visitar(raiz)
  return ultimo
}

function fragmentosDeListaAgregada(coleccion: ts.ArrayLiteralExpression, plantilla: PlantillaColeccion, titulo: string): Array<{ titulo: string; contenido: string }> {
  const filas = coleccion.elements
    .filter(ts.isExpression)
    .map(elemento => textoFilaColeccion(elemento, plantilla))
    .filter(Boolean)
  const salida: Array<{ titulo: string; contenido: string }> = []
  let actual: string[] = []
  for (const fila of filas) {
    const candidata = textoPlano([...actual, fila].join(' '))
    if (actual.length && candidata.length > MAX_LONGITUD_FRAGMENTO_PUBLICO) {
      salida.push({ titulo, contenido: textoPlano(actual.join(' ')) })
      actual = [fila]
    } else actual.push(fila)
  }
  if (actual.length) salida.push({ titulo, contenido: textoPlano(actual.join(' ')) })
  return salida
}

/**
 * Sólo se aceptan .map() que son hijos JSX directos. Un map dentro de una
 * condición, prop o manejador no es una sección estática garantizada y no se
 * ejecuta para fabricar corpus. Las listas sin título por elemento se agrupan
 * con el último encabezado estático que las contiene.
 */
function coleccionesLiteralesVisibles(raices: readonly ts.Node[], archivo: ts.SourceFile): Array<{ titulo: string; contenido: string }> {
  const declaraciones = declaracionesColeccionesLiterales(archivo)
  const vistas = new Set<ts.ArrayLiteralExpression>()
  const salida: Array<{ titulo: string; contenido: string }> = []

  const incorporar = (coleccion: ts.ArrayLiteralExpression | undefined, callback: ts.Expression, raiz: ts.Node, posicion: number) => {
    if (!coleccion || vistas.has(coleccion)) return
    vistas.add(coleccion)
    const plantilla = plantillaRenderizadaDeMap(callback)
    const tituloSeccion = ultimoEncabezadoEstaticoAntes(raiz, posicion)
    // Una tarjeta con un h1-h3 por elemento conserva registros independientes.
    // Un listado sin ese encabezado, como los tipos de uso de una herramienta,
    // es una única evidencia bajo su sección visible.
    if (plantilla?.campos.size && !plantilla.camposEnEncabezado.size && tituloSeccion) {
      const fragmentos = fragmentosDeListaAgregada(coleccion, plantilla, tituloSeccion)
      if (fragmentos.length) {
        salida.push(...fragmentos)
        return
      }
    }
    salida.push(...registrosDeColeccion(coleccion, plantilla?.camposEnEncabezado.size ? plantilla.campos : undefined))
  }

  const visitarJsx = (nodo: ts.Node, raiz: ts.Node) => {
    if (ts.isJsxElement(nodo)) {
      if (esEtiquetaIgnorada(nodo)) return
      nodo.children.forEach(hijo => {
        if (ts.isJsxExpression(hijo) && hijo.expression) {
          const expresion = desenvuelveExpresion(hijo.expression)
          if (!ts.isCallExpression(expresion) || !ts.isPropertyAccessExpression(expresion.expression) || expresion.expression.name.text !== 'map' || !callbackRenderizaJsx(expresion.arguments[0])) return
          const receptora = desenvuelveExpresion(expresion.expression.expression)
          const coleccion = ts.isIdentifier(receptora) ? declaraciones.get(receptora.text) : ts.isArrayLiteralExpression(receptora) ? receptora : undefined
          incorporar(coleccion, expresion.arguments[0], raiz, expresion.pos)
        } else if (ts.isJsxElement(hijo) || ts.isJsxFragment(hijo)) visitarJsx(hijo, raiz)
      })
      return
    }
    if (ts.isJsxFragment(nodo)) nodo.children.forEach(hijo => {
      if (ts.isJsxExpression(hijo) && hijo.expression) {
        const expresion = desenvuelveExpresion(hijo.expression)
        if (!ts.isCallExpression(expresion) || !ts.isPropertyAccessExpression(expresion.expression) || expresion.expression.name.text !== 'map' || !callbackRenderizaJsx(expresion.arguments[0])) return
        const receptora = desenvuelveExpresion(expresion.expression.expression)
        const coleccion = ts.isIdentifier(receptora) ? declaraciones.get(receptora.text) : ts.isArrayLiteralExpression(receptora) ? receptora : undefined
        incorporar(coleccion, expresion.arguments[0], raiz, expresion.pos)
      } else if (ts.isJsxElement(hijo) || ts.isJsxFragment(hijo)) visitarJsx(hijo, raiz)
    })
  }
  raices.forEach(raiz => visitarJsx(raiz, raiz))
  return salida
}

function coincideConEncabezado(titulo: string, filtros: readonly string[]): boolean {
  const normal = titulo.toLocaleLowerCase('es')
  return filtros.some(filtro => normal.includes(filtro.toLocaleLowerCase('es')))
}

/**
 * Extrae sólo texto que pertenece al árbol JSX retornado por el componente por
 * defecto. Al contrario que un regex sobre el archivo, no lee imports, props,
 * comentarios, controladores ni expresiones JavaScript. Las colecciones sólo se
 * toman si su array literal se usa en un .map que devuelve JSX visible.
 */
export function extraerCapitulosJsx(fuente: string, entrada: EntradaManifestCorpusPublico, archivo = entrada.archivo): Array<{ titulo: string; contenido: string; indice: number }> {
  const ast = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, scriptKindPara(archivo))
  const raices = raicesJsxDelComponentePrincipal(ast)
  const salida: Array<{ titulo: string; contenido: string; indice: number }> = []
  let actual: { titulo: string; contenido: string[]; tieneEtiqueta: boolean; indice: number } | null = null

  const incorporarActual = () => {
    if (!actual) return
    const contenido = textoPlano(actual.contenido.join(' '))
    // El umbral evita capítulos decorativos, pero no descarta una sección de
    // formulario que sólo aporta etiquetas estáticas visibles. Los controles,
    // sus valores, placeholders y opciones se filtran en tokensVisibles.
    const suficiente = contenido.length >= 48 || actual.tieneEtiqueta
    if (suficiente && (!entrada.soloEncabezados?.length || coincideConEncabezado(actual.titulo, entrada.soloEncabezados)) && (!entrada.omitirEncabezados?.length || !coincideConEncabezado(actual.titulo, entrada.omitirEncabezados))) {
      salida.push({ titulo: actual.titulo, contenido, indice: actual.indice })
    }
  }

  for (const raiz of raices) {
    for (const token of tokensVisibles(raiz)) {
      if (token.clase === 'ENCABEZADO') {
        incorporarActual()
        actual = { titulo: token.texto, contenido: [], tieneEtiqueta: false, indice: salida.length + 1 }
      } else if (actual) {
        actual.contenido.push(token.texto)
        if (token.clase === 'ETIQUETA') actual.tieneEtiqueta = true
      }
    }
  }
  incorporarActual()

  const vistos = new Set(salida.map(capitulo => `${capitulo.titulo}\n${capitulo.contenido}`))
  for (const registro of coleccionesLiteralesVisibles(raices, ast)) {
    const clave = `${registro.titulo}\n${registro.contenido}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    salida.push({ titulo: registro.titulo, contenido: registro.contenido, indice: 10_000 + salida.length })
  }
  return salida
}

function tituloDeCapitulo(entrada: EntradaManifestCorpusPublico, titulo: string): string {
  if (entrada.ruta === '/cero-riesgos') return `Cero Riesgos — ${titulo}`
  if (entrada.tipo === 'LEGAL') return `${titulo} — ${entrada.ruta.slice(1).replace(/-/g, ' ')}`
  return titulo
}

function esPlaceholderEditorial(titulo: string, contenido: string): boolean {
  return /contenido\s+en\s+preparaci[oó]n/i.test(titulo) || /estamos\s+preparando\s+la\s+ficha\s+t[eé]cnica/i.test(contenido)
}

/** Construye fuentes sólo desde ficheros locales declarados en el manifiesto. */
export async function extraerCorpusPublicoLocal(raiz = process.cwd()): Promise<FuenteCorpusPublico[]> {
  const salida: FuenteCorpusPublico[] = []
  for (const entrada of MANIFEST_CORPUS_PUBLICO) {
    if (entrada.dinamica) continue
    const archivos = [...new Set([entrada.archivo, ...(entrada.fuentes || [])])]
    for (const archivo of archivos) {
      // app/page.js sólo reexporta el selector y se declara para trazabilidad de
      // la raíz; no genera contenido por sí mismo.
      const fuente = await fs.readFile(path.join(raiz, archivo), 'utf8')
      const capitulos = extraerCapitulosJsx(fuente, entrada, archivo)
      const ast = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, scriptKindPara(archivo))
      const encabezadoPagina = raicesJsxDelComponentePrincipal(ast).flatMap(tokensVisibles)
        .find(token => token.clase === 'ENCABEZADO' && token.nivel === 1)?.texto
      for (const capitulo of capitulos) {
        const contenido = textoPlano(capitulo.contenido)
        if (!contenido) continue
        // «Tipos de uso» o «Introduce tu dirección» necesitan el contexto de
        // la herramienta. Ambos encabezados son JSX visible, no metadatos JS.
        const encabezadoContextual = entrada.ruta.startsWith('/recursos/herramientas/') && encabezadoPagina && capitulo.titulo !== encabezadoPagina
          ? `${encabezadoPagina} — ${capitulo.titulo}` : capitulo.titulo
        const titulo = tituloDeCapitulo(entrada, encabezadoContextual)
        // Una colección literal puede contener una mención visible a un
        // producto interno. No se indexa por estar en JSX: pasa la misma
        // política que se aplicará posteriormente a tarifas y demás fuentes.
        if (esPlaceholderEditorial(titulo, contenido) || !fuenteAptaParaPublico({ titulo, contenido, tipo: entrada.tipo })) continue
        const origenBase = `publico:repo:${archivo}#capitulo-${capitulo.indice}`
        // La raíz y una ruta propia pueden renderizar el mismo componente.
        // No deben colisionar al indexar por origen+título ni perder su URL.
        const origen = salida.some(fuente => fuente.origen === origenBase && fuente.urlFuente !== entrada.ruta)
          ? `${origenBase}:ruta-${encodeURIComponent(entrada.ruta)}` : origenBase
        salida.push({
          titulo,
          contenido,
          tipo: entrada.tipo === 'FAQ' ? 'FAQ' : 'WEB',
          origen,
          urlFuente: entrada.ruta,
          huella: sha256Hex(contenido),
        })
      }
    }
  }
  return salida
}

/** Cobertura operativa que consume el ensayo de ingesta: sólo rutas a extraer o materializar. */
export function coberturaManifestCorpusPublico(): Array<Pick<EntradaManifestCorpusPublico, 'ruta' | 'archivo' | 'tipo' | 'dinamica' | 'tarifasDinamicas' | 'motivoCeroFuentes' | 'fuentes' | 'fuentesDinamicas'>> {
  return MANIFEST_CORPUS_PUBLICO.map(({ ruta, archivo, tipo, dinamica, tarifasDinamicas, motivoCeroFuentes, fuentes, fuentesDinamicas }) => ({ ruta, archivo, tipo, dinamica, tarifasDinamicas, motivoCeroFuentes, fuentes, fuentesDinamicas }))
}

/** Informe local de rutas con cero fuentes para no ocultarlas bajo una cifra global. */
export function auditarCoberturaCorpusPublico(corpus: readonly FuenteCorpusPublico[]): Array<{ ruta: string; fuentes: number; estado: 'EXTRAIDA' | 'CATALOGO_DINAMICO_TARIFAS' | 'CERO_FUENTES_JUSTIFICADO' | 'CERO_FUENTES_A_REVISAR'; motivo?: string }> {
  return MANIFEST_CORPUS_PUBLICO.map(entrada => {
    if (entrada.dinamica) return { ruta: entrada.ruta, fuentes: 0, estado: 'CATALOGO_DINAMICO_TARIFAS' as const, motivo: 'SE_MATERIALIZA_CON_TARIFAS_PUBLICAS' }
    const fuentes = corpus.filter(fuente => fuente.urlFuente === entrada.ruta).length
    if (fuentes) return { ruta: entrada.ruta, fuentes, estado: 'EXTRAIDA' as const }
    if (entrada.motivoCeroFuentes) return { ruta: entrada.ruta, fuentes, estado: 'CERO_FUENTES_JUSTIFICADO' as const, motivo: entrada.motivoCeroFuentes }
    return { ruta: entrada.ruta, fuentes, estado: 'CERO_FUENTES_A_REVISAR' as const }
  })
}

/** Clasifica cada page.* versionada, incluyendo las exclusiones privadas y de flujos. */
export function motivoExclusionArchivoPagina(archivo: string): string | null {
  if (archivo.endsWith('.backup')) return 'ARTEFACTO_BACKUP_SIN_RUTA'
  if (archivo.startsWith('app/admin/')) return 'AREA_ADMINISTRACION_PRIVADA'
  if (archivo.startsWith('app/cliente/')) return 'AREA_CLIENTE_PRIVADA'
  if (archivo.startsWith('app/empleado/')) return 'AREA_EMPLEADO_PRIVADA'
  if (archivo.startsWith('app/api/')) return 'API_NO_EDITORIAL'
  if (archivo.includes('/[token]/')) return 'CUESTIONARIO_CON_TOKEN'
  if (archivo === 'app/login/page.tsx') return 'AUTENTICACION'
  if ([
    'app/alta-servicio/documentacion/page.tsx', 'app/alta-servicio/page.tsx', 'app/carrito/page.tsx', 'app/cero-riesgos/cotizar/page.js',
    'app/contrata/migracion-web/page.tsx', 'app/contratar/page.tsx', 'app/demo/page.tsx', 'app/pago/cancelado/page.js',
    'app/pago/cancelado/page.tsx', 'app/pago/confirmacion/page.tsx', 'app/pago/exito/page.js', 'app/peticiones/page.tsx', 'app/respuesta-migracion/page.tsx',
  ].includes(archivo)) return 'FLUJO_TRANSACCIONAL_FORMULARIO_O_DEMO'
  return null
}
