import fs from 'node:fs/promises'
import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { normalizar, sha256Hex, textoPlano, trocear } from '@/lib/asistente/text'

const MAX_ARCHIVO = 10 * 1024 * 1024
const RUTAS_WEB_PUBLICAS = [/^\/$/, /^\/(?:internet|movil|particular|empresa|cero-riesgos|soporte|contacto|recursos|tarifas)(?:\/.*)?$/, /^\/soluciones(?:\/.*)?$/]
const HOSTS_WEB_PUBLICOS = new Set(['www.internetoperadores.com', 'staging.internetoperadores.com'])
export type FuenteIngesta = { titulo: string; contenido: string; tipo: 'WEB' | 'FAQ' | 'TARIFA' | 'PDF' | 'DOCX' | 'XLSX' | 'TXT' | 'MD'; origen: string; urlFuente?: string | null }

export function rutaWebPublicaPermitida(ruta: string): boolean { return RUTAS_WEB_PUBLICAS.some(patron => patron.test(ruta)) && !/(?:^|\/)(?:admin|api|cliente|empleado)(?:\/|$)/.test(ruta) }
export function urlWebPublicaPermitida(valor: string): boolean {
  try { const url = new URL(valor); return url.protocol === 'https:' && HOSTS_WEB_PUBLICOS.has(url.hostname) && rutaWebPublicaPermitida(url.pathname) } catch { return false }
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

export async function descargarPaginaPublica(url: string): Promise<FuenteIngesta> {
  if (!urlWebPublicaPermitida(url)) throw new Error('URL_PUBLICA_NO_PERMITIDA')
  const control = new AbortController(); const timeout = setTimeout(() => control.abort(), 6000)
  try {
    const respuesta = await fetch(url, { signal: control.signal, redirect: 'error', headers: { accept: 'text/html' } })
    if (!respuesta.ok || !(respuesta.headers.get('content-type') || '').includes('text/html')) throw new Error('WEB_PUBLICA_NO_DISPONIBLE')
    const html = (await respuesta.text()).slice(0, 2_000_000)
    return { titulo: new URL(url).pathname || '/', contenido: textoPlano(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')), tipo: 'WEB', origen: url, urlFuente: new URL(url).pathname }
  } finally { clearTimeout(timeout) }
}

export async function extraerArchivo(buffer: Buffer, nombre: string): Promise<{ tipo: FuenteIngesta['tipo']; contenido: string }> {
  if (buffer.byteLength > MAX_ARCHIVO) throw new Error('ARCHIVO_DEMASIADO_GRANDE')
  const extension = path.extname(nombre).toLowerCase()
  if (extension === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('FIRMA_PDF_INVALIDA')
    const pdfParse = require('pdf-parse') as (entrada: Buffer) => Promise<{ text: string }>
    return { tipo: 'PDF', contenido: textoPlano((await pdfParse(buffer)).text) }
  }
  if (extension === '.docx') {
    if (!buffer.subarray(0, 2).equals(Buffer.from('PK'))) throw new Error('FIRMA_DOCX_INVALIDA')
    const zip = unzipSync(new Uint8Array(buffer)); const xml = zip['word/document.xml']; if (!xml || !zip['[Content_Types].xml']) throw new Error('DOCX_INVALIDO')
    return { tipo: 'DOCX', contenido: textoPlano(strFromU8(xml).replace(/<[^>]+>/g, ' ')) }
  }
  if (extension === '.xlsx') {
    if (!buffer.subarray(0, 2).equals(Buffer.from('PK'))) throw new Error('FIRMA_XLSX_INVALIDA')
    const zip = unzipSync(new Uint8Array(buffer)); if (!zip['[Content_Types].xml'] || !zip['xl/workbook.xml']) throw new Error('XLSX_INVALIDO')
    const libro = XLSX.read(buffer, { type: 'buffer', cellText: true }); const contenido = libro.SheetNames.map(nombreHoja => XLSX.utils.sheet_to_csv(libro.Sheets[nombreHoja])).join('\n')
    return { tipo: 'XLSX', contenido: textoPlano(contenido) }
  }
  if (extension === '.txt' || extension === '.md') {
    if (buffer.subarray(0, Math.min(buffer.length, 1024)).includes(0)) throw new Error('FIRMA_TEXTO_INVALIDA')
    return { tipo: extension === '.md' ? 'MD' : 'TXT', contenido: textoPlano(buffer.toString('utf8')) }
  }
  throw new Error('TIPO_ARCHIVO_NO_PERMITIDO')
}

export type OpcionesIndexado = {
  /** Espacio de un documento NUEVO. Un documento existente conserva siempre su espacio, roles y cliente. */
  espacio?: 'PUBLICO' | 'INTERNO'
  roles?: string[]
  /** Estado deseado. Por defecto BORRADOR: nada se publica sin aprobación humana explícita. */
  estado?: 'BORRADOR' | 'PUBLICADO'
}
export async function indexarFuente(fuente: FuenteIngesta, actorId?: number, opciones: OpcionesIndexado = {}): Promise<{ creado: boolean; documentoId?: string; estado?: string }> {
  const contenido = textoPlano(fuente.contenido)
  if (!contenido) throw new Error('CONTENIDO_VACIO')
  const checksum = sha256Hex(contenido)
  const anterior = await prisma.asistenteDocumento.findFirst({ where: { origen: fuente.origen }, include: { versiones: { orderBy: { version: 'desc' }, take: 1 } } })
  if (anterior?.versiones[0]?.checksum === checksum) return { creado: false, documentoId: anterior.id, estado: anterior.estado }
  const espacio = anterior ? anterior.espacio : (opciones.espacio || 'INTERNO')
  const roles = anterior ? anterior.roles : (espacio === 'INTERNO' ? (opciones.roles || []) : [])
  // Un documento archivado por una persona no se reactiva por una nueva ingesta.
  const estado = anterior?.estado === 'ARCHIVADO' ? 'ARCHIVADO' : (opciones.estado || 'BORRADOR')
  const publicado = estado === 'PUBLICADO'
  return prisma.$transaction(async tx => {
    const documento = anterior || await tx.asistenteDocumento.create({ data: { titulo: fuente.titulo.slice(0, 500), espacio, roles, tipo: fuente.tipo, origen: fuente.origen, estado, creadoPor: actorId ?? null } })
    const version = (anterior?.versionActual || 0) + 1
    const versionCreada = await tx.asistenteDocumentoVersion.create({ data: { documentoId: documento.id, version, contenido, checksum, creadoPor: actorId ?? null, aprobadoPor: publicado ? actorId ?? null : null } })
    await tx.asistenteDocumento.update({ where: { id: documento.id }, data: { titulo: fuente.titulo.slice(0, 500), tipo: fuente.tipo, estado, versionActual: version, updatedAt: new Date() } })
    // Sólo la versión vigente puede responder: las anteriores quedan inactivas (se conservan para auditoría).
    await tx.asistenteFragmento.updateMany({ where: { documentoId: documento.id, activo: true }, data: { activo: false } })
    const fragmentos = trocear(contenido, { max: 900, solape: 140 })
    if (fragmentos.length) await tx.asistenteFragmento.createMany({ data: fragmentos.map((fragmento, orden) => ({ documentoId: documento.id, versionId: versionCreada.id, orden, titulo: fuente.titulo.slice(0, 500), contenido: fragmento, contenidoNorm: normalizar(fragmento), espacio, roles, tenantClienteId: documento.tenantClienteId ?? null, activo: publicado, urlFuente: fuente.urlFuente || null })) })
    return { creado: true, documentoId: documento.id, estado }
  })
}
