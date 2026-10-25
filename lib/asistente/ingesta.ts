import { lookup } from 'node:dns/promises'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { strFromU8, unzipSync } from 'fflate'
import { Agent } from 'undici'
import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { redactarPIILocal } from '@/lib/asistente/pii'
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

export async function tarifasPublicas(): Promise<FuenteIngesta[]> {
  const tarifas = await prisma.tarifa.findMany({ where: { activa: true, OR: [{ publicarWebParticular: true }, { publicarWebEmpresa: true }] }, select: { id: true, nombre: true, nombreComercial: true, descripcionCorta: true, descripcionLarga: true, velocidad: true, precioSinIva: true, precioConIva: true, permanencia: true, penalizacion: true, garantia: true, cuotaAlta: true, caracteristicas: true, tipoCliente: true, categoria: true, datosIncluidos: true, minutosIncluidos: true, publicarWebParticular: true, publicarWebEmpresa: true } })
  return tarifas.map(tarifa => ({ titulo: tarifa.nombreComercial || tarifa.nombre, tipo: 'TARIFA', origen: `tarifa:${tarifa.id}`, urlFuente: '/tarifas', contenido: textoPlano([`Tarifa ${tarifa.nombreComercial || tarifa.nombre}.`, tarifa.descripcionCorta, tarifa.descripcionLarga, `Categoría: ${tarifa.categoria}.`, tarifa.velocidad && `Velocidad: ${tarifa.velocidad}.`, `Precio sin IVA: ${tarifa.precioSinIva.toString()} €.`, `Precio con IVA: ${tarifa.precioConIva.toString()} €.`, tarifa.permanencia && `Permanencia: ${tarifa.permanencia}.`, tarifa.cuotaAlta != null && `Cuota de alta: ${tarifa.cuotaAlta.toString()} €.`, tarifa.datosIncluidos && `Datos incluidos: ${tarifa.datosIncluidos}.`, tarifa.minutosIncluidos && `Minutos incluidos: ${tarifa.minutosIncluidos}.`].filter(Boolean).join(' ')) }))
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
}
/** Persiste sólo texto localmente anonimizado; el nombre original de archivo tampoco se conserva como origen. */
export async function indexarFuente(fuente: FuenteIngesta, actorId?: number, opciones: OpcionesIndexado = {}): Promise<{ creado: boolean; documentoId?: string; estado?: string }> {
  const titulo = redactarPIILocal(textoPlano(fuente.titulo).slice(0, 500), true)
  const contenido = redactarPIILocal(limiteTexto(fuente.contenido), true)
  const checksum = sha256Hex(contenido)
  // Una página puede aportar varios extractos aprobados con títulos distintos.
  // El origen identifica la página, pero el documento de conocimiento se
  // identifica por la pareja origen+título para no desactivar otros extractos.
  const anterior = fuente.origen
    ? await prisma.asistenteDocumento.findFirst({ where: { origen: fuente.origen, titulo }, include: { versiones: { orderBy: { version: 'desc' }, take: 1 } } })
    : null
  if (anterior?.versiones[0]?.checksum === checksum) return { creado: false, documentoId: anterior.id, estado: anterior.estado }
  const espacio = anterior ? anterior.espacio : (opciones.espacio || 'INTERNO')
  const roles = anterior ? anterior.roles : (espacio === 'INTERNO' ? (opciones.roles || []) : [])
  const estado = anterior?.estado === 'ARCHIVADO' ? 'ARCHIVADO' : (opciones.estado || 'BORRADOR')
  const publicado = estado === 'PUBLICADO'
  return prisma.$transaction(async tx => {
    const documento = anterior || await tx.asistenteDocumento.create({ data: { titulo, espacio, roles, tipo: fuente.tipo, origen: fuente.origen || `admin:${randomUUID()}`, estado, creadoPor: actorId ?? null } })
    const version = (anterior?.versionActual || 0) + 1
    const versionCreada = await tx.asistenteDocumentoVersion.create({ data: { documentoId: documento.id, version, contenido, checksum, creadoPor: actorId ?? null, aprobadoPor: publicado ? actorId ?? null : null } })
    await tx.asistenteDocumento.update({ where: { id: documento.id }, data: { titulo, tipo: fuente.tipo, estado, versionActual: version, updatedAt: new Date() } })
    await tx.asistenteFragmento.updateMany({ where: { documentoId: documento.id, activo: true }, data: { activo: false } })
    const fragmentos = trocear(contenido, { max: 900, solape: 140 })
    if (fragmentos.length) await tx.asistenteFragmento.createMany({ data: fragmentos.map((fragmento, orden) => ({ documentoId: documento.id, versionId: versionCreada.id, orden, titulo, contenido: fragmento, contenidoNorm: textoIndexable(titulo, fragmento), espacio, roles, tenantClienteId: documento.tenantClienteId ?? null, activo: publicado, urlFuente: fuente.urlFuente || null })) })
    return { creado: true, documentoId: documento.id, estado }
  })
}
