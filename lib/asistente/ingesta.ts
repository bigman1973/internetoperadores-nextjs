import { lookup } from 'node:dns/promises'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { strFromU8, unzipSync } from 'fflate'
import { Agent } from 'undici'
import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { redactarPIILocal } from '@/lib/asistente/pii'
import { fuenteAptaParaPublico, motivoFuenteNoAptaParaPublico } from '@/lib/asistente/public-policy'
import { normalizar, sha256Hex, textoPlano, trocear } from '@/lib/asistente/text'

const MAX_ARCHIVO = 10 * 1024 * 1024
const MAX_TEXTO_EXTRAIDO = 1 * 1024 * 1024
const MAX_PAGINAS_PDF = 250
const MAX_ZIP_ENTRADAS = 500
const MAX_ZIP_ENTRADA_DESCOMPRIMIDA = 12 * 1024 * 1024
const MAX_ZIP_DESCOMPRIMIDO = 24 * 1024 * 1024
const MAX_ZIP_RATIO = 100
const RUTAS_WEB_PUBLICAS = [/^\/$/, /^\/(?:internet|movil|particular|empresa|cero-riesgos|soporte|contacto|recursos|tarifas)(?:\/.*)?$/, /^\/soluciones(?:\/.*)?$/]
const HOSTS_WEB_PUBLICOS = new Set(['www.internetoperadores.com', 'staging.internetoperadores.com'])
const FIRMAS_BINARIAS = [Buffer.from('%PDF-'), Buffer.from('PK\x03\x04'), Buffer.from('PK\x05\x06'), Buffer.from('PK\x07\x08'), Buffer.from('D0CF11E0A1B11AE1', 'hex')]

export type FuenteIngesta = { titulo: string; contenido: string; tipo: 'WEB' | 'FAQ' | 'TARIFA' | 'PDF' | 'DOCX' | 'XLSX' | 'TXT' | 'MD'; origen: string; urlFuente?: string | null }
type EntradaZip = { nombre: string; comprimido: number; descomprimido: number }
type ClienteLecturaIngesta = Pick<Prisma.TransactionClient, 'tarifa' | 'asistenteDocumento'>
type ClienteIngesta = Pick<Prisma.TransactionClient, 'asistenteDocumento' | 'asistenteDocumentoVersion' | 'asistenteFragmento'>
type ClienteMutacionIngesta = ClienteIngesta & Pick<Prisma.TransactionClient, '$queryRaw'>

function empiezaPor(buffer: Buffer, firma: Buffer): boolean { return buffer.subarray(0, firma.length).equals(firma) }
function errorZip(codigo: string): never { throw new Error(codigo) }
function limiteTexto(contenido: string): string {
  const limpio = textoPlano(contenido)
  if (!limpio) throw new Error('CONTENIDO_VACIO')
  if (Buffer.byteLength(limpio, 'utf8') > MAX_TEXTO_EXTRAIDO) throw new Error('CONTENIDO_EXTRAIDO_DEMASIADO_GRANDE')
  return limpio
}
function rutaCanonicaPublica(ruta: string): string | null {
  if (!ruta.startsWith('/') || ruta.includes('\\') || /%2f|%5c/i.test(ruta)) return null
  try {
    const decodificada = decodeURIComponent(ruta)
    if (decodificada !== ruta || decodificada.includes('..')) return null
    return decodificada
  } catch { return null }
}
export function rutaWebPublicaPermitida(ruta: string): boolean {
  const canonica = rutaCanonicaPublica(ruta)
  return Boolean(canonica && RUTAS_WEB_PUBLICAS.some(patron => patron.test(canonica)) && !/(?:^|\/)(?:admin|api|cliente|empleado)(?:\/|$)/.test(canonica))
}
export function urlWebPublicaPermitida(valor: string): boolean {
  try {
    const url = new URL(valor)
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && HOSTS_WEB_PUBLICOS.has(url.hostname.toLowerCase())
      && rutaWebPublicaPermitida(url.pathname)
  } catch { return false }
}
export function direccionPublica(ip: string): boolean {
  const limpia = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(limpia)) {
    const partes = limpia.split('.').map(Number)
    if (partes.some(parte => parte > 255)) return false
    return !(partes[0] === 0 || partes[0] === 10 || partes[0] === 127 || partes[0] >= 224
      || (partes[0] === 100 && partes[1] >= 64 && partes[1] <= 127)
      || (partes[0] === 169 && partes[1] === 254)
      || (partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31)
      || (partes[0] === 192 && (partes[1] === 0 || partes[1] === 2 || partes[1] === 88 && partes[2] === 99 || partes[1] === 168))
      || (partes[0] === 198 && (partes[1] === 18 || partes[1] === 19 || partes[1] === 51 && partes[2] === 100))
      || (partes[0] === 203 && partes[1] === 0 && partes[2] === 113))
  }
  if (!limpia.includes(':')) return false
  return !(limpia === '::' || limpia === '::1' || limpia.startsWith('fe80:') || limpia.startsWith('fc') || limpia.startsWith('fd') || limpia.startsWith('ff'))
}
/** Comprueba antes del fetch que el host permitido no resuelve a una dirección privada. */
export async function validarDestinoWebPublico(valor: string): Promise<URL> {
  if (!urlWebPublicaPermitida(valor)) throw new Error('URL_PUBLICA_NO_PERMITIDA')
  const url = new URL(valor)
  const direcciones = await lookup(url.hostname, { all: true, verbatim: true })
  if (!direcciones.length || direcciones.some(direccion => !direccionPublica(direccion.address))) throw new Error('DESTINO_WEB_NO_PUBLICO')
  return url
}

/**
 * Evita DNS rebinding: el socket recibe la IP comprobada, pero conserva el
 * hostname original para SNI y la validación del certificado TLS.
 */
function dispatcherDestinoValidado(url: URL, direccion: string): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname: string, _opciones: unknown, callback: (error: Error | null, address: string, family: number) => void) => callback(null, direccion, direccion.includes(':') ? 6 : 4),
    } as any,
  })
}

export async function extraerFaqEstaticas(archivo = path.join(process.cwd(), 'app/recursos/faq/page.tsx')): Promise<FuenteIngesta[]> {
  const fuente = await fs.readFile(archivo, 'utf8')
  const inicio = fuente.indexOf('const faqs = [')
  const fin = fuente.indexOf('];', inicio)
  if (inicio < 0 || fin < inicio) throw new Error('FAQ_ESTATICA_NO_ENCONTRADA')
  const bloque = fuente.slice(inicio, fin)
  const encontrados = [...bloque.matchAll(/pregunta:\s*'([^']+)'\s*,\s*respuesta:\s*'([^']+)'/g)]
  return encontrados.map((coincidencia, indice) => ({ titulo: coincidencia[1], contenido: coincidencia[2], tipo: 'FAQ', origen: `faq-estatica:${indice + 1}`, urlFuente: '/recursos/faq' }))
}

export async function tarifasPublicas(db: ClienteLecturaIngesta = prisma): Promise<FuenteIngesta[]> {
  const tarifas = await db.tarifa.findMany({
    where: { activa: true, OR: [{ publicarWebParticular: true }, { publicarWebEmpresa: true }] },
    select: {
      id: true, nombreComercial: true, descripcionCorta: true, descripcionLarga: true,
      velocidad: true, velocidadBajada: true, velocidadSubida: true, precioSinIva: true,
      precioConIva: true, permanencia: true, garantia: true, cuotaAlta: true,
      caracteristicas: true, categoria: true, subcategoria: true, datosIncluidos: true,
      minutosIncluidos: true, smsIncluidos: true, grupoProducto: true, varianteLabel: true,
      tipoPeriodicidad: true, precioPeriodo: true, precioPeriodoIva: true,
      publicarWebParticular: true, publicarWebEmpresa: true,
    },
  })
  const fuentes: FuenteIngesta[] = []
  for (const tarifa of tarifas) {
    // El grupo se usa en la página para agrupar las licencias. Aunque el
    // nombre comercial no contenga la palabra Webinar, ese grupo nunca es
    // conocimiento apto para el chat público.
    if ((tarifa.grupoProducto || '').toLocaleLowerCase('es').replace(/[_\s]+/g, '-') === 'zoom-webinar') continue
    // La web no muestra el nombre interno como sustituto. Sin nombre comercial
    // explícito, no existe una identidad apta para que el chat la recomiende.
    const nombreComercial = textoPlano(tarifa.nombreComercial || '')
    const categoria = textoPlano(tarifa.categoria || '')
    if (!nombreComercial || !categoria) continue
    const detallesCaracteristicas = caracteristicasPublicas(tarifa.caracteristicas)
    const contenido = textoPlano([
      `Tarifa ${nombreComercial}.`,
      `Categoría: ${categoria}.`,
      tarifa.subcategoria && `Subcategoría: ${tarifa.subcategoria}.`,
      tarifa.descripcionCorta,
      tarifa.descripcionLarga,
      tarifa.velocidad && `Velocidad: ${tarifa.velocidad}.`,
      tarifa.velocidadBajada && `Velocidad de bajada: ${tarifa.velocidadBajada}.`,
      tarifa.velocidadSubida && `Velocidad de subida: ${tarifa.velocidadSubida}.`,
      `Precio sin IVA: ${tarifa.precioSinIva.toString()} €.`,
      `Precio con IVA: ${tarifa.precioConIva.toString()} €.`,
      tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 && tarifa.precioPeriodo != null && `Precio mensual equivalente sin IVA: ${tarifa.precioPeriodo.toString()} €.`,
      tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 && tarifa.precioPeriodoIva != null && `Precio mensual equivalente con IVA: ${tarifa.precioPeriodoIva.toString()} €.`,
      tarifa.permanencia && `Permanencia: ${tarifa.permanencia}.`,
      tarifa.garantia && `Garantía: ${tarifa.garantia}.`,
      tarifa.cuotaAlta != null && `Cuota de alta: ${tarifa.cuotaAlta.toString()} €.`,
      tarifa.datosIncluidos && `Datos incluidos: ${tarifa.datosIncluidos}.`,
      tarifa.minutosIncluidos && `Minutos incluidos: ${tarifa.minutosIncluidos}.`,
      tarifa.smsIncluidos && `SMS incluidos: ${tarifa.smsIncluidos}.`,
      tarifa.varianteLabel && `Variante pública: ${tarifa.varianteLabel}.`,
      detallesCaracteristicas,
    ].filter(Boolean).join(' '))
    if (!esTarifaPublicaComercial({ nombreComercial, categoria, contenido, grupoProducto: tarifa.grupoProducto })) continue
    const urlFuente = tarifa.publicarWebEmpresa ? '/tarifas/empresa' : '/tarifas/particular'
    // Procedencia certificada por esta ingesta positiva. Los documentos antiguos
    // tarifa:id no se consideran certificados; se archivan preservando sus
    // versiones. No cambia el catálogo comercial ni los precios originales.
    fuentes.push({ titulo: nombreComercial, tipo: 'TARIFA', origen: `publico:tarifa:${tarifa.id}`, urlFuente, contenido })
  }
  return fuentes
}

function caracteristicasPublicas(valor: unknown): string {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return ''
  const caracteristicas = valor as { incluyePlanAnterior?: unknown; items?: unknown }
  const partes: string[] = []
  if (typeof caracteristicas.incluyePlanAnterior === 'string') partes.push(caracteristicas.incluyePlanAnterior)
  if (Array.isArray(caracteristicas.items)) {
    for (const item of caracteristicas.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const fila = item as { titulo?: unknown; descripcion?: unknown }
      if (typeof fila.titulo === 'string') partes.push(fila.descripcion && typeof fila.descripcion === 'string' ? `${fila.titulo}: ${fila.descripcion}` : fila.titulo)
    }
  }
  return partes.join(' ')
}

/** Lista positiva: la misma condición de ruta pública más identidad comercial visible y política de contenido. */
export function esTarifaPublicaComercial(candidata: { nombreComercial: string | null | undefined; categoria: string | null | undefined; contenido: string; grupoProducto?: string | null }): boolean {
  const nombreComercial = textoPlano(candidata.nombreComercial || '')
  const categoria = textoPlano(candidata.categoria || '')
  if (nombreComercial.length < 3 || categoria.length < 2 || !textoPlano(candidata.contenido)) return false
  if ((candidata.grupoProducto || '').toLocaleLowerCase('es').replace(/[_\s]+/g, '-') === 'zoom-webinar') return false
  return fuenteAptaParaPublico({ titulo: nombreComercial, contenido: candidata.contenido, tipo: 'TARIFA' })
}

/** Sólo se utiliza por la importación explícita de una página propia; el chat nunca hace fetch web. */
export async function descargarPaginaPublica(valor: string): Promise<FuenteIngesta> {
  const url = await validarDestinoWebPublico(valor)
  const direcciones = await lookup(url.hostname, { all: true, verbatim: true })
  const direccion = direcciones.find(candidata => direccionPublica(candidata.address))?.address
  if (!direccion) throw new Error('DESTINO_WEB_NO_PUBLICO')
  const dispatcher = dispatcherDestinoValidado(url, direccion)
  const control = new AbortController()
  const timeout = setTimeout(() => control.abort(), 6000)
  try {
    const respuesta = await fetch(url, { signal: control.signal, redirect: 'error', headers: { accept: 'text/html' }, dispatcher } as RequestInit)
    if (!respuesta.ok || !(respuesta.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error('WEB_PUBLICA_NO_DISPONIBLE')
    const longitud = Number(respuesta.headers.get('content-length'))
    if (Number.isFinite(longitud) && longitud > 2_000_000) throw new Error('WEB_PUBLICA_DEMASIADO_GRANDE')
    const html = await respuesta.text()
    if (Buffer.byteLength(html, 'utf8') > 2_000_000) throw new Error('WEB_PUBLICA_DEMASIADO_GRANDE')
    return { titulo: url.pathname || '/', contenido: limiteTexto(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')), tipo: 'WEB', origen: url.toString(), urlFuente: url.pathname }
  } finally { clearTimeout(timeout); await dispatcher.close() }
}

/** Lee el directorio central antes de descomprimir; así se bloquean ZIP bombs y ZIP64 no soportados. */
export function inspeccionarZip(buffer: Buffer): EntradaZip[] {
  if (buffer.length < 22 || !empiezaPor(buffer, Buffer.from('PK'))) errorZip('ZIP_INVALIDO')
  const inicioBusqueda = Math.max(0, buffer.length - 65_557)
  let eocd = -1
  for (let indice = buffer.length - 22; indice >= inicioBusqueda; indice -= 1) {
    if (buffer.readUInt32LE(indice) === 0x06054b50) { eocd = indice; break }
  }
  if (eocd < 0 || eocd + 22 > buffer.length) errorZip('ZIP_INVALIDO')
  const entradas = buffer.readUInt16LE(eocd + 10)
  const tamanoCentral = buffer.readUInt32LE(eocd + 12)
  const offsetCentral = buffer.readUInt32LE(eocd + 16)
  if (entradas === 0xffff || tamanoCentral === 0xffffffff || offsetCentral === 0xffffffff || entradas > MAX_ZIP_ENTRADAS || offsetCentral + tamanoCentral > eocd) errorZip('ZIP_BOMBA_O_INVALIDO')
  const salida: EntradaZip[] = []
  let cursor = offsetCentral
  let total = 0
  for (let indice = 0; indice < entradas; indice += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== 0x02014b50) errorZip('ZIP_INVALIDO')
    const flags = buffer.readUInt16LE(cursor + 8)
    const comprimido = buffer.readUInt32LE(cursor + 20)
    const descomprimido = buffer.readUInt32LE(cursor + 24)
    const nombreLongitud = buffer.readUInt16LE(cursor + 28)
    const extraLongitud = buffer.readUInt16LE(cursor + 30)
    const comentarioLongitud = buffer.readUInt16LE(cursor + 32)
    const fin = cursor + 46 + nombreLongitud + extraLongitud + comentarioLongitud
    if ((flags & 0x1) !== 0 || fin > eocd || comprimido === 0xffffffff || descomprimido === 0xffffffff) errorZip('ZIP_BOMBA_O_INVALIDO')
    const nombre = buffer.subarray(cursor + 46, cursor + 46 + nombreLongitud).toString('utf8')
    if (!nombre || nombre.startsWith('/') || nombre.includes('\\') || nombre.split('/').some(parte => parte === '..')) errorZip('ZIP_INVALIDO')
    if (descomprimido > MAX_ZIP_ENTRADA_DESCOMPRIMIDA || total + descomprimido > MAX_ZIP_DESCOMPRIMIDO || (comprimido === 0 ? descomprimido > 0 : descomprimido / comprimido > MAX_ZIP_RATIO)) errorZip('ZIP_BOMBA_O_INVALIDO')
    total += descomprimido
    salida.push({ nombre, comprimido, descomprimido })
    cursor = fin
  }
  if (cursor !== offsetCentral + tamanoCentral) errorZip('ZIP_INVALIDO')
  return salida
}
function descomprimirOoxml(buffer: Buffer, tipo: 'DOCX' | 'XLSX'): Record<string, Uint8Array> {
  inspeccionarZip(buffer)
  try {
    const zip = unzipSync(new Uint8Array(buffer))
    const tipos = zip['[Content_Types].xml']
    if (!tipos) throw new Error('OOXML_INVALIDO')
    const contenidoTipos = strFromU8(tipos)
    if (tipo === 'DOCX') {
      if (!zip['word/document.xml'] || !/wordprocessingml\.document\.main\+xml/i.test(contenidoTipos)) throw new Error('DOCX_INVALIDO')
    } else if (!zip['xl/workbook.xml'] || !/spreadsheetml\.sheet\.main\+xml/i.test(contenidoTipos)) throw new Error('XLSX_INVALIDO')
    return zip
  } catch (error) {
    if (error instanceof Error && /^(?:ZIP_|DOCX_|XLSX_|OOXML_)/.test(error.message)) throw error
    throw new Error(`${tipo}_INVALIDO`)
  }
}
function textoUtf8(buffer: Buffer): string {
  if (!buffer.length || buffer.subarray(0, Math.min(buffer.length, 1024)).includes(0) || FIRMAS_BINARIAS.some(firma => empiezaPor(buffer, firma))) throw new Error('FIRMA_TEXTO_INVALIDA')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) } catch { throw new Error('FIRMA_TEXTO_INVALIDA') }
}
async function extraerPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const documento = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, disableFontFace: true }).promise
    if (!Number.isSafeInteger(documento.numPages) || documento.numPages < 1 || documento.numPages > MAX_PAGINAS_PDF) throw new Error('PDF_DEMASIADAS_PAGINAS')
    const paginas: string[] = []
    for (let pagina = 1; pagina <= documento.numPages; pagina += 1) {
      const contenido = await documento.getPage(pagina).then(actual => actual.getTextContent())
      paginas.push(contenido.items.map(item => 'str' in item ? item.str : '').join(' '))
      if (Buffer.byteLength(paginas.join('\n'), 'utf8') > MAX_TEXTO_EXTRAIDO) throw new Error('CONTENIDO_EXTRAIDO_DEMASIADO_GRANDE')
    }
    return limiteTexto(paginas.join('\n'))
  } catch (error) {
    if (error instanceof Error && /^(?:PDF_DEMASIADAS_PAGINAS|CONTENIDO_EXTRAIDO_DEMASIADO_GRANDE|CONTENIDO_VACIO)$/.test(error.message)) throw error
    throw new Error('PDF_INVALIDO')
  }
}

export async function extraerArchivo(buffer: Buffer, nombre: string): Promise<{ tipo: FuenteIngesta['tipo']; contenido: string }> {
  if (!buffer.length) throw new Error('ARCHIVO_VACIO')
  if (buffer.byteLength > MAX_ARCHIVO) throw new Error('ARCHIVO_DEMASIADO_GRANDE')
  const extension = path.extname(path.basename(nombre)).toLowerCase()
  if (extension === '.pdf') {
    if (!empiezaPor(buffer, Buffer.from('%PDF-'))) throw new Error('FIRMA_PDF_INVALIDA')
    return { tipo: 'PDF', contenido: await extraerPdf(buffer) }
  }
  if (extension === '.docx') {
    if (!empiezaPor(buffer, Buffer.from('PK'))) throw new Error('FIRMA_DOCX_INVALIDA')
    const zip = descomprimirOoxml(buffer, 'DOCX')
    return { tipo: 'DOCX', contenido: limiteTexto(strFromU8(zip['word/document.xml']).replace(/<[^>]+>/g, ' ')) }
  }
  if (extension === '.xlsx') {
    if (!empiezaPor(buffer, Buffer.from('PK'))) throw new Error('FIRMA_XLSX_INVALIDA')
    descomprimirOoxml(buffer, 'XLSX')
    try {
      const libro = XLSX.read(buffer, { type: 'buffer', cellText: true, cellFormula: false, cellHTML: false })
      return { tipo: 'XLSX', contenido: limiteTexto(libro.SheetNames.map(nombreHoja => XLSX.utils.sheet_to_csv(libro.Sheets[nombreHoja])).join('\n')) }
    } catch { throw new Error('XLSX_INVALIDO') }
  }
  if (extension === '.txt' || extension === '.md') return { tipo: extension === '.md' ? 'MD' : 'TXT', contenido: limiteTexto(textoUtf8(buffer)) }
  throw new Error('TIPO_ARCHIVO_NO_PERMITIDO')
}

/** Texto del índice: título + fragmento. La cita sigue mostrando únicamente el fragmento. */
export function textoIndexable(titulo: string, fragmento: string): string {
  const t = normalizar(String(titulo ?? '').slice(0, 500))
  const f = normalizar(fragmento)
  return t && !f.startsWith(t) ? `${t} . ${f}` : f
}
export type OpcionesIndexado = {
  /** Espacio de un documento NUEVO. Un documento existente conserva siempre su espacio, roles y cliente. */
  espacio?: 'PUBLICO' | 'INTERNO'
  roles?: string[]
  /** Estado deseado. Por defecto BORRADOR: nada se publica sin aprobación humana explícita. */
  estado?: 'BORRADOR' | 'PUBLICADO'
  /** Ingesta conservadora: una fuente existente nunca se actualiza. */
  soloCrearSiNoExiste?: boolean
}
/** Excepción explícita: contacto de empresa ya publicado, nunca un teléfono de visitante. */
export function redactarContenidoFuente(fuente: FuenteIngesta, espacio: string): string {
  const contenido = limiteTexto(fuente.contenido)
  const contactoCorporativoAcreditado = espacio === 'PUBLICO' && fuente.tipo === 'FAQ'
    && fuente.urlFuente === '/recursos/faq' && fuente.origen.startsWith('publico:repo:app/recursos/faq/page.tsx#')
  if (!contactoCorporativoAcreditado) return redactarPIILocal(contenido, true)
  // Segmentar evita que un marcador escrito por el usuario se convierta en
  // un número. Sólo este literal publicado en contacto/footer queda intacto.
  return contenido.split(/(900 730 034)/).map(parte => parte === '900 730 034' ? parte : redactarPIILocal(parte, true)).join('')
}
/** Persiste texto anonimizado, salvo contacto corporativo público explícitamente acreditado. */
export async function indexarFuente(fuente: FuenteIngesta, actorId?: number, opciones: OpcionesIndexado = {}, db?: ClienteIngesta): Promise<{ creado: boolean; documentoId?: string; estado?: string }> {
  // El llamante de una ingesta compuesta inyecta su transacción para que el
  // índice, sus fragmentos y la retirada formen una única operación atómica.
  if (!db) return prisma.$transaction(tx => indexarFuente(fuente, actorId, opciones, tx))
  // La carga desde el panel sigue entrando como BORRADOR. La salvaguarda sólo
  // aplica a la publicación automática en el espacio público.
  if (opciones.espacio === 'PUBLICO' && opciones.estado === 'PUBLICADO' && !fuenteAptaParaPublico(fuente)) {
    throw new Error(`FUENTE_NO_APTA_PARA_PUBLICO:${motivoFuenteNoAptaParaPublico(fuente) || 'POLITICA'}`)
  }
  const titulo = redactarPIILocal(textoPlano(fuente.titulo).slice(0, 500), true)
  // Una página puede aportar varios extractos aprobados con títulos distintos.
  // El origen identifica la página, pero el documento de conocimiento se
  // identifica por la pareja origen+título para no desactivar otros extractos.
  const anterior = fuente.origen
    ? await db.asistenteDocumento.findFirst({ where: { origen: fuente.origen, titulo }, include: { versiones: { orderBy: { version: 'desc' }, take: 1 } } })
    : null
  const espacio = anterior ? anterior.espacio : (opciones.espacio || 'INTERNO')
  const contenido = redactarContenidoFuente(fuente, espacio)
  const checksum = sha256Hex(contenido)
  if (anterior?.versiones[0]?.checksum === checksum) return { creado: false, documentoId: anterior.id, estado: anterior.estado }
  if (anterior && opciones.soloCrearSiNoExiste) return { creado: false, documentoId: anterior.id, estado: anterior.estado }
  const roles = anterior ? anterior.roles : (espacio === 'INTERNO' ? (opciones.roles || []) : [])
  const estado = anterior?.estado === 'ARCHIVADO' ? 'ARCHIVADO' : (opciones.estado || 'BORRADOR')
  const publicado = estado === 'PUBLICADO'
  const documento = anterior || await db.asistenteDocumento.create({ data: { titulo, espacio, roles, tipo: fuente.tipo, origen: fuente.origen || `admin:${randomUUID()}`, estado, creadoPor: actorId ?? null } })
  const version = (anterior?.versionActual || 0) + 1
  const versionCreada = await db.asistenteDocumentoVersion.create({ data: { documentoId: documento.id, version, contenido, checksum, creadoPor: actorId ?? null, aprobadoPor: publicado ? actorId ?? null : null } })
  await db.asistenteDocumento.update({ where: { id: documento.id }, data: { titulo, tipo: fuente.tipo, estado, versionActual: version, updatedAt: new Date() } })
  await db.asistenteFragmento.updateMany({ where: { documentoId: documento.id, activo: true }, data: { activo: false } })
  const fragmentos = trocear(contenido, { max: 900, solape: 140 })
  if (fragmentos.length) await db.asistenteFragmento.createMany({ data: fragmentos.map((fragmento, orden) => ({ documentoId: documento.id, versionId: versionCreada.id, orden, titulo, contenido: fragmento, contenidoNorm: textoIndexable(titulo, fragmento), espacio, roles, tenantClienteId: documento.tenantClienteId ?? null, activo: publicado, urlFuente: fuente.urlFuente || null })) })
  return { creado: true, documentoId: documento.id, estado }
}

type FragmentoTarifaObservado = { id: string; versionId: string; orden: number; activo: boolean }
type DocumentoTarifaPublicado = {
  id: string
  origen: string | null
  titulo: string
  estado: string
  versionActual: number
  updatedAt: Date
  creadoPor: number | null
  versiones: Array<{ version: number; creadoPor: number | null; aprobadoPor: number | null }>
  fragmentos: FragmentoTarifaObservado[]
}

/** Fotografía privada previa a la ejecución; nunca se imprime ni se publica. */
export type EvidenciaSnapshotPrivadoTarifas = {
  huella: string
  docs: Array<{
    id: string
    espacio: string
    estado: string
    version_actual: number
    origen: string | null
    titulo: string
    updated_at: string
  }>
  fragments: Array<{ id: string; documento_id: string; activo: boolean }>
}

export type DocumentoPlanDesactivacionTarifa = {
  id: string
  origen: string
  titulo: string
  estadoAnterior: 'PUBLICADO'
  versionActual: 1
  updatedAt: string
  creadoPor: null
  versionCreadoPor: null
  aprobadoPor: null
  fragmentos: FragmentoTarifaObservado[]
}

/**
 * El plan y el recibo se guardan exclusivamente en ficheros 0600 del operador.
 * No hay tabla de auditoría de ingesta del asistente en el esquema actual; este
 * JSON firmado es la evidencia privada exacta de la retirada, sin DDL.
 */
export type PlanDesactivacionTarifas = {
  version: 2
  preparadoEn: string
  origenesAptosHuella: string
  snapshotPrivadoHuella: string
  candidatas: number
  ignoradasNoAcreditadas: number
  motivos: Record<string, number>
  documentos: DocumentoPlanDesactivacionTarifa[]
}

export type ReciboDesactivacionTarifas = {
  version: 2
  estado: 'PREPARADO' | 'APLICADO' | 'REVERTIDO'
  plan: PlanDesactivacionTarifas
  aplicacion?: {
    version: 1
    aplicadoEn: string
    desactivados: number
    fragmentosDesactivados: number
  }
  reversion?: {
    version: 1
    revertidoEn: string
    restaurados: number
    fragmentosRestaurados: number
  }
  firmaMac: string
}

function serializarCanonico(valor: unknown): string {
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'number' || typeof valor === 'string') return JSON.stringify(valor)
  if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(',')}]`
  if (!valor || typeof valor !== 'object') throw new Error('PLAN_TARIFAS_SERIALIZACION_INVALIDA')
  const objeto = valor as Record<string, unknown>
  return `{${Object.keys(objeto).sort().map(clave => `${JSON.stringify(clave)}:${serializarCanonico(objeto[clave])}`).join(',')}}`
}

function claveMacPlan(secreto: Buffer | string): Buffer {
  const clave = Buffer.isBuffer(secreto) ? secreto : Buffer.from(secreto, 'utf8')
  if (clave.length < 32) throw new Error('PLAN_SECRETO_DEBIL')
  return clave
}

function sinFirma(recibo: ReciboDesactivacionTarifas): Omit<ReciboDesactivacionTarifas, 'firmaMac'> {
  const { firmaMac: _firmaMac, ...contenido } = recibo
  return contenido
}

function firmaMacRecibo(contenido: Omit<ReciboDesactivacionTarifas, 'firmaMac'>, secreto: Buffer | string): string {
  return createHmac('sha256', claveMacPlan(secreto)).update(serializarCanonico(contenido), 'utf8').digest('hex')
}

function fechasIguales(actual: Date, esperado: string): boolean {
  const esperada = new Date(esperado)
  return Number.isFinite(esperada.getTime()) && actual.getTime() === esperada.getTime()
}

function mismosFragmentos(actuales: FragmentoTarifaObservado[], esperados: FragmentoTarifaObservado[]): boolean {
  if (actuales.length !== esperados.length) return false
  const ordenar = (a: FragmentoTarifaObservado, b: FragmentoTarifaObservado) => a.id.localeCompare(b.id)
  const a = [...actuales].sort(ordenar)
  const b = [...esperados].sort(ordenar)
  return a.every((fragmento, indice) => fragmento.id === b[indice].id
    && fragmento.versionId === b[indice].versionId
    && fragmento.orden === b[indice].orden
    && fragmento.activo === b[indice].activo)
}

function origenTarifaHeredadaAcreditable(origen: string | null): origen is string {
  return Boolean(origen && /^tarifa:\d+$/.test(origen))
}

function evidenciaCoincideConDocumento(documento: DocumentoTarifaPublicado, evidencia: EvidenciaSnapshotPrivadoTarifas): boolean {
  const previo = evidencia.docs.find(candidata => candidata.id === documento.id)
  if (!previo || !origenTarifaHeredadaAcreditable(documento.origen)) return false
  if (previo.espacio !== 'PUBLICO' || previo.estado !== 'PUBLICADO' || previo.version_actual !== 1
    || previo.origen !== documento.origen || previo.titulo !== documento.titulo || previo.updated_at !== documento.updatedAt.toISOString()) return false
  if (documento.creadoPor !== null || documento.versionActual !== 1 || documento.versiones.length !== 1
    || documento.versiones[0]?.version !== 1 || documento.versiones[0]?.creadoPor !== null || documento.versiones[0]?.aprobadoPor !== null) return false
  const fragmentosPrevios = evidencia.fragments
    .filter(fragmento => fragmento.documento_id === documento.id)
    .map(fragmento => ({ id: fragmento.id, versionId: '', orden: -1, activo: fragmento.activo }))
  if (!fragmentosPrevios.length || fragmentosPrevios.length !== documento.fragmentos.length) return false
  const activosPrevios = new Map(fragmentosPrevios.map(fragmento => [fragmento.id, fragmento.activo]))
  return documento.fragmentos.every(fragmento => activosPrevios.get(fragmento.id) === fragmento.activo)
}

function documentoPlan(documento: DocumentoTarifaPublicado): DocumentoPlanDesactivacionTarifa {
  if (!origenTarifaHeredadaAcreditable(documento.origen)) throw new Error('PLAN_TARIFAS_ORIGEN_INVALIDO')
  return {
    id: documento.id,
    origen: documento.origen,
    titulo: documento.titulo,
    estadoAnterior: 'PUBLICADO',
    versionActual: 1,
    updatedAt: documento.updatedAt.toISOString(),
    creadoPor: null,
    versionCreadoPor: null,
    aprobadoPor: null,
    fragmentos: documento.fragmentos.map(fragmento => ({ ...fragmento })),
  }
}

function planDocumentoCoincide(actual: DocumentoTarifaPublicado, plan: DocumentoPlanDesactivacionTarifa, estado: 'PUBLICADO' | 'ARCHIVADO', fragmentosActivosEsperados: boolean): boolean {
  return actual.id === plan.id
    && actual.origen === plan.origen
    && actual.titulo === plan.titulo
    && actual.estado === estado
    && actual.versionActual === plan.versionActual
    && actual.creadoPor === plan.creadoPor
    && actual.versiones.length === 1
    && actual.versiones[0]?.version === plan.versionActual
    && actual.versiones[0]?.creadoPor === plan.versionCreadoPor
    && actual.versiones[0]?.aprobadoPor === plan.aprobadoPor
    && mismosFragmentos(actual.fragmentos, plan.fragmentos.map(fragmento => ({ ...fragmento, activo: fragmentosActivosEsperados ? fragmento.activo : false })))
}

async function documentoBloqueadoActual(db: ClienteMutacionIngesta, id: string): Promise<DocumentoTarifaPublicado | null> {
  const bloqueados = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM asistente_documentos WHERE id = CAST(${id} AS uuid) FOR UPDATE`)
  if (bloqueados.length !== 1) return null
  return await db.asistenteDocumento.findUnique({
    where: { id },
    select: {
      id: true, origen: true, titulo: true, estado: true, versionActual: true, updatedAt: true, creadoPor: true,
      versiones: { select: { version: true, creadoPor: true, aprobadoPor: true }, orderBy: { version: 'asc' } },
      fragmentos: { select: { id: true, versionId: true, orden: true, activo: true }, orderBy: { id: 'asc' } },
    },
  }) as DocumentoTarifaPublicado | null
}

export function identificadorPlanDesactivacionTarifas(plan: PlanDesactivacionTarifas): string {
  return sha256Hex(`plan-desactivacion-tarifas-v2\n${serializarCanonico(plan)}`)
}

/** Huella estable del conjunto exacto de tarifas públicas aptas del plan. */
export function huellaOrigenesAptosTarifas(origenes: Iterable<string>): string {
  return sha256Hex([...new Set(origenes)].sort().join('\n'))
}

export function crearReciboDesactivacionTarifas(plan: PlanDesactivacionTarifas, secreto: Buffer | string): ReciboDesactivacionTarifas {
  const contenido: Omit<ReciboDesactivacionTarifas, 'firmaMac'> = { version: 2, estado: 'PREPARADO', plan }
  return { ...contenido, firmaMac: firmaMacRecibo(contenido, secreto) }
}

export function verificarReciboDesactivacionTarifas(recibo: ReciboDesactivacionTarifas, secreto: Buffer | string): void {
  if (recibo?.version !== 2 || !['PREPARADO', 'APLICADO', 'REVERTIDO'].includes(recibo.estado)
    || !recibo.plan || recibo.plan.version !== 2 || !/^[a-f0-9]{64}$/i.test(recibo.firmaMac || '')) throw new Error('RECIBO_TARIFAS_INVALIDO')
  const esperada = Buffer.from(firmaMacRecibo(sinFirma(recibo), secreto), 'hex')
  const recibida = Buffer.from(recibo.firmaMac, 'hex')
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) throw new Error('RECIBO_TARIFAS_MAC_INVALIDO')
}

/**
 * Conservador y sin migración: un prefijo no autoriza nunca una retirada. Sólo
 * se consideran documentos creados por el antiguo flujo automático cuando la
 * fotografía privada anterior acredita exactamente su identidad, versión 1,
 * creación sin actor, versión sin aprobador y fragmentos observados.
 */
export async function planificarDesactivacionTarifasNoElegibles(
  origenesAptos: Iterable<string>,
  evidencia: EvidenciaSnapshotPrivadoTarifas,
  db: ClienteLecturaIngesta = prisma,
): Promise<PlanDesactivacionTarifas> {
  const permitidos = new Set(origenesAptos)
  const motivos: Record<string, number> = {}
  const sumar = (motivo: string) => { motivos[motivo] = (motivos[motivo] || 0) + 1 }
  const publicadas = await db.asistenteDocumento.findMany({
    where: { espacio: 'PUBLICO', estado: 'PUBLICADO', tipo: 'TARIFA' },
    select: {
      id: true, origen: true, titulo: true, estado: true, versionActual: true, updatedAt: true, creadoPor: true,
      versiones: { select: { version: true, creadoPor: true, aprobadoPor: true }, orderBy: { version: 'asc' } },
      fragmentos: { select: { id: true, versionId: true, orden: true, activo: true }, orderBy: { id: 'asc' } },
    },
  }) as DocumentoTarifaPublicado[]
  const documentos: DocumentoPlanDesactivacionTarifa[] = []
  let ignoradasNoAcreditadas = 0
  for (const documento of publicadas) {
    if (!origenTarifaHeredadaAcreditable(documento.origen)) { sumar('ORIGEN_NO_HEREDADO_EXACTO'); continue }
    if (permitidos.has(documento.origen)) { sumar('AUN_ELEGIBLE'); continue }
    if (!evidenciaCoincideConDocumento(documento, evidencia)) {
      ignoradasNoAcreditadas += 1
      sumar('SIN_EVIDENCIA_AUTOMATICA_ACREDITADA')
      continue
    }
    documentos.push(documentoPlan(documento))
  }
  if (!permitidos.size && documentos.length) throw new Error('PLAN_TARIFAS_SIN_ELEGIBLES')
  documentos.sort((a, b) => a.id.localeCompare(b.id))
  return {
    version: 2,
    preparadoEn: new Date().toISOString(),
    origenesAptosHuella: huellaOrigenesAptosTarifas(permitidos),
    snapshotPrivadoHuella: evidencia.huella,
    candidatas: documentos.length,
    ignoradasNoAcreditadas,
    motivos,
    documentos,
  }
}

export type ResultadoAplicacionDesactivacionTarifas = { desactivados: number; fragmentosDesactivados: number; aplicadoEn: string }

/** Desactiva exactamente el snapshot firmado. Una divergencia aborta toda la transacción. */
export async function aplicarDesactivacionTarifas(
  recibo: ReciboDesactivacionTarifas,
  secreto: Buffer | string,
  db?: ClienteMutacionIngesta,
): Promise<ResultadoAplicacionDesactivacionTarifas> {
  verificarReciboDesactivacionTarifas(recibo, secreto)
  if (recibo.estado !== 'PREPARADO' || recibo.aplicacion || recibo.reversion) throw new Error('RECIBO_TARIFAS_ESTADO_INVALIDO')
  if (!db) return prisma.$transaction(tx => aplicarDesactivacionTarifas(recibo, secreto, tx))
  const documentos = [...recibo.plan.documentos].sort((a, b) => a.id.localeCompare(b.id))
  for (const documento of documentos) {
    const actual = await documentoBloqueadoActual(db, documento.id)
    if (!actual || !fechasIguales(actual.updatedAt, documento.updatedAt) || !planDocumentoCoincide(actual, documento, 'PUBLICADO', true)) throw new Error('PLAN_TARIFAS_OBSOLETO')
  }
  const aplicadoEn = new Date()
  let desactivados = 0
  let fragmentosDesactivados = 0
  for (const documento of documentos) {
    const actualizado = await db.asistenteDocumento.updateMany({
      // El FOR UPDATE y la comparación anterior de updatedAt preservan el
      // control de concurrencia sin depender de redondeos de Date/SQL.
      where: { id: documento.id, estado: 'PUBLICADO', versionActual: documento.versionActual },
      data: { estado: 'ARCHIVADO', updatedAt: aplicadoEn },
    })
    if (actualizado.count !== 1) throw new Error('PLAN_TARIFAS_OBSOLETO')
    desactivados += 1
    for (const fragmento of documento.fragmentos.filter(candidata => candidata.activo)) {
      const desactivado = await db.asistenteFragmento.updateMany({
        where: { id: fragmento.id, documentoId: documento.id, versionId: fragmento.versionId, orden: fragmento.orden, activo: true },
        data: { activo: false },
      })
      if (desactivado.count !== 1) throw new Error('PLAN_TARIFAS_OBSOLETO')
      fragmentosDesactivados += 1
    }
  }
  return { desactivados, fragmentosDesactivados, aplicadoEn: aplicadoEn.toISOString() }
}

export function confirmarReciboAplicado(
  recibo: ReciboDesactivacionTarifas,
  resultado: ResultadoAplicacionDesactivacionTarifas,
  secreto: Buffer | string,
): ReciboDesactivacionTarifas {
  verificarReciboDesactivacionTarifas(recibo, secreto)
  if (recibo.estado !== 'PREPARADO') throw new Error('RECIBO_TARIFAS_ESTADO_INVALIDO')
  const contenido: Omit<ReciboDesactivacionTarifas, 'firmaMac'> = {
    version: 2,
    estado: 'APLICADO',
    plan: recibo.plan,
    aplicacion: { version: 1, ...resultado },
  }
  return { ...contenido, firmaMac: firmaMacRecibo(contenido, secreto) }
}

export type ResultadoReversionDesactivacionTarifas = { restaurados: number; fragmentosRestaurados: number; revertidoEn: string }

/**
 * Rollback limitado estrictamente a la retirada de tarifas. No borra ni
 * revierte las fuentes indexadas; el snapshot previo se conserva para una
 * recuperación manual de esa parte si fuera necesaria.
 */
export async function revertirDesactivacionTarifas(
  recibo: ReciboDesactivacionTarifas,
  secreto: Buffer | string,
  db?: ClienteMutacionIngesta,
): Promise<ResultadoReversionDesactivacionTarifas> {
  verificarReciboDesactivacionTarifas(recibo, secreto)
  if (recibo.estado !== 'APLICADO' || !recibo.aplicacion || recibo.reversion) throw new Error('RECIBO_TARIFAS_ESTADO_INVALIDO')
  if (!db) return prisma.$transaction(tx => revertirDesactivacionTarifas(recibo, secreto, tx))
  const documentos = [...recibo.plan.documentos].sort((a, b) => a.id.localeCompare(b.id))
  for (const documento of documentos) {
    const actual = await documentoBloqueadoActual(db, documento.id)
    if (!actual || !fechasIguales(actual.updatedAt, recibo.aplicacion.aplicadoEn)
      || !planDocumentoCoincide(actual, documento, 'ARCHIVADO', false)) throw new Error('ROLLBACK_TARIFAS_OBSOLETO')
  }
  const revertidoEn = new Date()
  let restaurados = 0
  let fragmentosRestaurados = 0
  for (const documento of documentos) {
    const actualizado = await db.asistenteDocumento.updateMany({
      // Igual que en la retirada, el bloqueo y la revalidación exacta son la
      // condición de carrera; no se vuelve a serializar la fecha para el WHERE.
      where: { id: documento.id, estado: 'ARCHIVADO', versionActual: documento.versionActual },
      data: { estado: documento.estadoAnterior, updatedAt: revertidoEn },
    })
    if (actualizado.count !== 1) throw new Error('ROLLBACK_TARIFAS_OBSOLETO')
    restaurados += 1
    for (const fragmento of documento.fragmentos.filter(candidata => candidata.activo)) {
      const restaurado = await db.asistenteFragmento.updateMany({
        where: { id: fragmento.id, documentoId: documento.id, versionId: fragmento.versionId, orden: fragmento.orden, activo: false },
        data: { activo: true },
      })
      if (restaurado.count !== 1) throw new Error('ROLLBACK_TARIFAS_OBSOLETO')
      fragmentosRestaurados += 1
    }
  }
  return { restaurados, fragmentosRestaurados, revertidoEn: revertidoEn.toISOString() }
}

export function confirmarReciboRevertido(
  recibo: ReciboDesactivacionTarifas,
  resultado: ResultadoReversionDesactivacionTarifas,
  secreto: Buffer | string,
): ReciboDesactivacionTarifas {
  verificarReciboDesactivacionTarifas(recibo, secreto)
  if (recibo.estado !== 'APLICADO' || !recibo.aplicacion) throw new Error('RECIBO_TARIFAS_ESTADO_INVALIDO')
  const contenido: Omit<ReciboDesactivacionTarifas, 'firmaMac'> = {
    version: 2,
    estado: 'REVERTIDO',
    plan: recibo.plan,
    aplicacion: recibo.aplicacion,
    reversion: { version: 1, ...resultado },
  }
  return { ...contenido, firmaMac: firmaMacRecibo(contenido, secreto) }
}
