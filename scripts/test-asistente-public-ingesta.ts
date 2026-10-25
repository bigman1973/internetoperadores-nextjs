import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fuenteAptaParaPublico, motivoFuenteNoAptaParaPublico } from '@/lib/asistente/public-policy'
import { esTarifaPublicaComercial } from '@/lib/asistente/ingesta'
import { auditarCoberturaCorpusPublico, coberturaManifestCorpusPublico, extraerCapitulosJsx, extraerCorpusPublicoLocal, motivoExclusionArchivoPagina } from '@/lib/asistente/web-corpus'

function rutaDeArchivoPagina(archivo: string): string {
  if (archivo === 'app/page.js' || archivo === 'app/page.tsx') return '/'
  return `/${archivo.slice('app/'.length).replace(/\/page\.(?:js|jsx|ts|tsx)$/, '')}`
}

async function main() {
  // Contrato compartido: bloquea nombres mayoristas/catálogo, pero no impide
  // temas comerciales legítimos como respaldo 5G o centralita IP.
  const bloqueadas = [
    ['CM-FIBRA 600', 'Tarifa interna para mayorista', 'CATALOGO_CM_FIBRA'],
    ['MásOrange fibra', 'Coste mayorista por línea', 'MAYORISTA_MASORANGE'],
    ['Orange', 'Proveedor operador mayorista', 'MAYORISTA_ORANGE'],
    ['Cogent tránsito', 'Coste de proveedor', 'MAYORISTA_COGENT'],
    ['Arrow', 'Distribuidor de licencias', 'DISTRIBUIDOR_INTERNO'],
    ['Zoom Webinar 500', 'Licencia y precio por participantes', 'LICENCIA_INTERNA_ZOOM_WEBINAR'],
  ] as const
  for (const [titulo, contenido, motivo] of bloqueadas) {
    assert.equal(fuenteAptaParaPublico({ titulo, contenido, tipo: 'TARIFA' }), false, titulo)
    assert.equal(motivoFuenteNoAptaParaPublico({ titulo, contenido, tipo: 'TARIFA' }), motivo, titulo)
  }
  for (const [titulo, contenido] of [
    ['Conexión con respaldo', 'Si falla la fibra se activa backup 5G sin intervención manual.'],
    ['Centralita IP', 'Centralita virtual con extensiones y llamadas para empresas.'],
    ['Backup empresarial', 'Copias de seguridad y recuperación ante ransomware.'],
  ]) assert.equal(fuenteAptaParaPublico({ titulo, contenido, tipo: 'WEB' }), true, titulo)

  // No se amplía el veto a las guías: los proveedores se rechazan sólo si
  // identifican una tarifa. «aire» aislado sigue siendo vocabulario permitido.
  const proveedoresTarifa = [
    ['Telefónica Empresas', 'PROVEEDOR_MAYORISTA_TELEFONICA'],
    ['Movistar Fibra', 'PROVEEDOR_MAYORISTA_MOVISTAR'],
    ['Vodafone One', 'PROVEEDOR_MAYORISTA_VODAFONE'],
    ['Orange Empresas', 'PROVEEDOR_MAYORISTA_ORANGE'],
    ['Yoigo Negocios', 'PROVEEDOR_MAYORISTA_YOIGO'],
    ['XOC tránsito', 'PROVEEDOR_MAYORISTA_XOC'],
    ['Templus cloud', 'PROVEEDOR_MAYORISTA_TEMPLUS'],
    ['Adamo fibra', 'PROVEEDOR_MAYORISTA_ADAMO'],
    ['Aire Networks enlace', 'PROVEEDOR_MAYORISTA_AIRE_NETWORKS'],
  ] as const
  for (const [titulo, motivo] of proveedoresTarifa) {
    assert.equal(motivoFuenteNoAptaParaPublico({ titulo, contenido: 'Precio publicado.', tipo: 'TARIFA' }), motivo, titulo)
    assert.equal(fuenteAptaParaPublico({ titulo, contenido: 'Comparativa pública de cobertura.', tipo: 'WEB' }), true, `mención WEB conservada: ${titulo}`)
  }
  assert.equal(fuenteAptaParaPublico({ titulo: 'Calidad del aire', contenido: 'Instalación exterior con ventilación.', tipo: 'TARIFA' }), true, 'aire aislado no es Aire Networks')
  const zoomEvadido = `Zo\u200bom Web\u200binar 500`
  const masOrangeEvadido = `Ma\u0301s\u0000Orange Fibra`
  assert.equal(fuenteAptaParaPublico({ titulo: zoomEvadido, contenido: 'Licencia publicada.', tipo: 'TARIFA' }), false, 'la política no se evade con invisibles Unicode')
  assert.equal(motivoFuenteNoAptaParaPublico({ titulo: zoomEvadido, contenido: 'Licencia publicada.', tipo: 'TARIFA' }), 'LICENCIA_INTERNA_ZOOM_WEBINAR')
  assert.equal(motivoFuenteNoAptaParaPublico({ titulo: masOrangeEvadido, contenido: 'Proveedor.', tipo: 'TARIFA' }), 'MAYORISTA_MASORANGE', 'la política normaliza acentos combinados y controles')

  // Lista positiva de tarifas: no usa nombre interno como fallback, exige
  // identidad comercial y somete el contenido a la misma política.
  assert.equal(esTarifaPublicaComercial({ nombreComercial: null, categoria: 'Internet', contenido: 'Precio con IVA: 20 €.' }), false)
  assert.equal(esTarifaPublicaComercial({ nombreComercial: 'CM-FIBRA 600', categoria: 'Internet', contenido: 'Precio con IVA: 20 €.' }), false)
  assert.equal(esTarifaPublicaComercial({ nombreComercial: 'Zoom Webinar 500', categoria: 'Comunicaciones', contenido: 'Precio con IVA: 20 €.' }), false)
  assert.equal(esTarifaPublicaComercial({ nombreComercial: 'Movistar Fibra 600', categoria: 'Internet', contenido: 'Precio con IVA: 20 €.' }), false)
  assert.equal(esTarifaPublicaComercial({ nombreComercial: 'Evento 500', categoria: 'Comunicaciones', contenido: 'Precio con IVA: 20 €.', grupoProducto: 'zoom-webinar' }), false)
  assert.equal(esTarifaPublicaComercial({ nombreComercial: 'Fibra Empresa 600', categoria: 'Internet', contenido: 'Precio con IVA: 20 €.' }), true)

  const cobertura = coberturaManifestCorpusPublico()
  assert.ok(cobertura.some(entrada => entrada.ruta === '/cero-riesgos' && entrada.tipo === 'WEB'))
  assert.ok(cobertura.some(entrada => entrada.ruta === '/recursos/faq' && entrada.tipo === 'FAQ'))
  assert.ok(cobertura.some(entrada => entrada.ruta === '/condiciones-generales' && entrada.tipo === 'LEGAL'))
  assert.ok(cobertura.some(entrada => entrada.ruta === '/tarifas/empresa' && entrada.dinamica))
  assert.ok(cobertura.some(entrada => entrada.ruta === '/tarifas/particular' && entrada.dinamica))
  assert.ok(cobertura.length >= 70, 'el manifiesto cubre el inventario ampliado de rutas públicas')
  for (const ruta of ['/recursos/blog/mpls-vs-sdwan', '/recursos/guias/conectividad-empresarial', '/recursos/casos-exito/industria-automocion', '/recursos/herramientas/estimador-ancho-banda', '/sectores/sanidad', '/empresa', '/particular', '/internet', '/movil', '/contacto', '/soporte', '/exagrid', '/fansaticos', '/partners', '/mas-vendido', '/packs', '/selector']) {
    assert.ok(cobertura.some(entrada => entrada.ruta === ruta), `ruta pública declarada: ${ruta}`)
  }
  const archivosPagina = execFileSync('git', ['ls-files', 'app/page.*', 'app/**/page.*'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  for (const archivo of archivosPagina) {
    const excluida = motivoExclusionArchivoPagina(archivo)
    assert.ok(excluida || cobertura.some(entrada => entrada.ruta === rutaDeArchivoPagina(archivo)), `página sin cobertura ni exclusión justificada: ${archivo}`)
  }

  const corpus = await extraerCorpusPublicoLocal()
  const cero = corpus.filter(fuente => fuente.urlFuente === '/cero-riesgos')
  assert.ok(cero.length >= 3, 'Cero Riesgos se separa en varios capítulos')
  assert.ok(cero.some(fuente => fuente.contenido.includes('790 €')), 'el precio literal publicado está en el corpus')
  assert.ok(cero.some(fuente => /48 horas|2 días/.test(fuente.contenido)), 'el plazo literal publicado está en el corpus')
  assert.ok(cero.some(fuente => fuente.titulo.includes('Reúnete con nuestro especialista') && /máximo de 48 horas recibirás un informe claro/i.test(fuente.contenido)), 'el plazo de 48 horas junto al especialista se conserva bajo su encabezado visible')
  assert.ok(cero.some(fuente => fuente.titulo.includes('Entrega en 48 h') && /En menos de 2 días, tendrás el informe completo/i.test(fuente.contenido)), 'la entrega publicada del paso 04 se conserva bajo su encabezado visible')
  assert.ok(cero.some(fuente => /telecomunicaciones, ciberseguridad, copias de seguridad y vulnerabilidades técnicas/i.test(fuente.contenido)), 'se conserva el alcance publicado')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/recursos/faq' && /backup \(5G, WIMAX o Satélite/i.test(fuente.contenido)), 'FAQ de backup se indexa')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/condiciones-generales'), 'condiciones legales se indexan')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/politica-privacidad'), 'privacidad se indexa')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/politica-cookies'), 'cookies se indexa')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/recursos/faq' && fuente.titulo.includes('Primeros pasos con tu router empresarial') && /Configuración inicial.*WiFi/i.test(fuente.contenido)), 'tutorial público de router se extrae de la colección literal sin ejecutarla')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/recursos/blog/mpls-vs-sdwan'), 'artículos de blog se incorporan')
  assert.ok(corpus.some(fuente => fuente.urlFuente === '/sectores/sanidad'), 'páginas de sectores se incorporan')
  assert.ok(corpus.every(fuente => !/Todos los derechos reservados|Cargando declaración de cookies/i.test(fuente.contenido)), 'pie y contenido de terceros no se indexan')
  assert.ok(corpus.every(fuente => !/Zoom Webinar/i.test(`${fuente.titulo}\n${fuente.contenido}`)), 'la licencia Zoom Webinar no llega al corpus')
  const formularioCobertura = corpus.find(fuente => fuente.urlFuente === '/recursos/herramientas/cobertura-fibra' && fuente.titulo === 'Comprobador de Cobertura — Introduce tu dirección')
  assert.ok(formularioCobertura, 'las etiquetas visibles del formulario de cobertura se conservan aunque el cuerpo sea corto')
  assert.equal(formularioCobertura.contenido, 'Dirección completa Código postal Provincia', 'cobertura incorpora sólo las etiquetas estáticas visibles')
  assert.doesNotMatch(formularioCobertura.contenido, /Ej: Calle Gran Vía|28013|Selecciona provincia|Fibra Óptica|recomendamos/i, 'no se incorporan placeholders, opciones, resultados ni recomendaciones simuladas')
  const tiposUso = corpus.filter(fuente => fuente.urlFuente === '/recursos/herramientas/estimador-ancho-banda' && fuente.titulo === 'Estimador de Ancho de Banda — Tipos de uso')
  const listadoTiposUso = tiposUso.find(fuente => /Videoconferencia/.test(fuente.contenido) && /Telefonía VoIP/.test(fuente.contenido) && /Backup en la nube/.test(fuente.contenido))
  assert.ok(listadoTiposUso, 'los tipos de uso se extraen como lista visible agregada bajo la sección que los renderiza')
  assert.ok(listadoTiposUso!.contenido.length <= 900, 'cada registro de lista respeta el máximo de un fragmento público')
  assert.equal(corpus.filter(fuente => fuente.urlFuente === '/recursos/herramientas/estimador-ancho-banda' && ['Videoconferencia', 'Telefonía VoIP', 'Backup en la nube'].includes(fuente.titulo)).length, 0, 'los elementos de la lista no se convierten en títulos aislados')
  assert.ok(corpus.every(fuente => fuente.origen.startsWith('publico:repo:') && fuente.huella.length === 64), 'cada fuente conserva origen y huella verificables')
  assert.equal(new Set(corpus.map(fuente => `${fuente.origen}\n${fuente.titulo}`)).size, corpus.length, 'rutas con componente compartido no colisionan al indexar por origen y título')
  const auditoria = auditarCoberturaCorpusPublico(corpus)
  assert.equal(auditoria.filter(entrada => entrada.estado === 'CERO_FUENTES_A_REVISAR').length, 0, 'toda ruta editorial debe extraer fuentes o dejar una justificación explícita')
  assert.equal(auditoria.filter(entrada => entrada.estado === 'CERO_FUENTES_JUSTIFICADO').length, 0, 'ninguna ruta editorial declarada queda sin una fuente local')
  assert.equal(auditoria.filter(entrada => entrada.estado === 'CATALOGO_DINAMICO_TARIFAS').length, 6, 'los únicos cero fuentes son catálogos que se materializan con tarifasPublicas')

  const jsxSintetico = `
    const secreto = 'NO_INDEXAR_SECRETO';
    const tarjetas = [{ titulo: 'Título de colección visible', descripcion: 'Descripción editorial que sí se presenta al visitante y supera el umbral de contenido.' }];
    export default function Pagina() {
      return <main data-prop="NO_INDEXAR_PROP"><h1>Título JSX visible</h1><p>Texto editorial visible y suficientemente largo para que forme una evidencia pública verificable.</p>{tarjetas.map(t => <article key={t.titulo}><h2>{t.titulo}</h2><p>{t.descripcion}</p></article>)}</main>;
    }
  `
  const capitulosSinteticos = extraerCapitulosJsx(jsxSintetico, { ruta: '/sintetica', archivo: 'app/sintetica/page.tsx', tipo: 'WEB' })
  assert.ok(capitulosSinteticos.some(capitulo => capitulo.titulo === 'Título JSX visible'), 'extrae texto hijo real de JSX')
  assert.ok(capitulosSinteticos.some(capitulo => capitulo.titulo === 'Título de colección visible'), 'extrae una colección literal sólo cuando su map devuelve JSX')
  assert.ok(!capitulosSinteticos.some(capitulo => /NO_INDEXAR_(?:SECRETO|PROP)/.test(`${capitulo.titulo}\n${capitulo.contenido}`)), 'no indexa variables ni props como texto visible')
  const jsxEtiquetasYLista = `
    const usos = [{ nombre: 'Uso visible', descripcion: 'Descripción visible de uso', mbps: 5, secreto: 'NO_INDEXAR_SECRETO_USO' }];
    export default function Pagina() {
      const mostrar = true;
      return <main>
        <h1>Herramienta visible</h1>
        <h2>Datos de cobertura</h2>
        <label>Dirección completa</label><input placeholder="NO_INDEXAR_PLACEHOLDER" value="NO_INDEXAR_VALOR" />
        <label>Código postal</label><label>Provincia</label><select><option>NO_INDEXAR_OPCION</option></select>
        <form><label>NO_INDEXAR_ETIQUETA_EN_FORMULARIO</label></form>
        <h2>Tipos de uso</h2>
        {usos.map(uso => <article><span>{uso.nombre}</span><p>{uso.descripcion}</p><span>{uso.mbps} Mbps</span></article>)}
        {mostrar && usos.map(uso => <p>{uso.secreto}</p>)}
      </main>;
    }
  `
  const capitulosEtiquetasYLista = extraerCapitulosJsx(jsxEtiquetasYLista, { ruta: '/controles-y-lista', archivo: 'app/controles-y-lista/page.tsx', tipo: 'WEB' })
  const etiquetasSinteticas = capitulosEtiquetasYLista.find(capitulo => capitulo.titulo === 'Datos de cobertura')
  assert.equal(etiquetasSinteticas?.contenido, 'Dirección completa Código postal Provincia', 'las etiquetas estáticas sobreviven al umbral sin leer valores de controles')
  const listaSintetica = capitulosEtiquetasYLista.find(capitulo => capitulo.titulo === 'Tipos de uso' && /Uso visible/.test(capitulo.contenido))
  assert.ok(listaSintetica && /Descripción visible de uso 5 Mbps/.test(listaSintetica.contenido), 'una lista sin título por elemento se agrega como texto visible de su sección')
  assert.ok(!capitulosEtiquetasYLista.some(capitulo => /NO_INDEXAR_(?:PLACEHOLDER|VALOR|OPCION|ETIQUETA_EN_FORMULARIO|SECRETO_USO)/.test(`${capitulo.titulo}\n${capitulo.contenido}`)), 'no se indexan controles, formularios ni mapas condicionados no ejecutados')
  console.log(`TEST_ASISTENTE_PUBLIC_INGESTA_OK fuentes=${corpus.length} rutas=${new Set(corpus.map(fuente => fuente.urlFuente)).size} catalogos=${auditoria.filter(entrada => entrada.estado === 'CATALOGO_DINAMICO_TARIFAS').length}`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
