/**
 * Script para importar los 61 EML históricos de guardias Draxton a la BD
 * Ejecutar: npx tsx scripts/import-guardias-eml.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

// Importar el parser directamente (copiar lógica inline para evitar problemas de import)
const prisma = new PrismaClient()

const EML_DIR = '/home/ubuntu/guardias_draxton'
const CONTRATO_GUARDIAS_ID = '8d5e4790-cf71-4047-a286-9b0d6e6e8cef'

// Mapeo de emails a nombres de técnicos
const TECNICOS_MAP: Record<string, string> = {
  'alejandro.martinez.ext@gis.com.mx': 'Alejandro Martínez Cayuelas',
  'alejandro.martinez@internetoperadores.com': 'Alejandro Martínez Cayuelas',
  'pol.terres.ext@gis.com.mx': 'Pol Terrés Duro',
  'pol.terres@internetoperadores.com': 'Pol Terrés Duro',
  'jesus.parra.ext@draxton.com': 'Jesús Parra García',
  'jesus.parra@internetoperadores.com': 'Jesús Parra García',
  'joel.benet.ext@gis.com.mx': 'Joel Benet',
  'joel.benet@internetoperadores.com': 'Joel Benet',
}

const CATEGORIAS: { keywords: string[]; categoria: string }[] = [
  { keywords: ['csoc', 'malicioso', 'seguridad', 'ir5', 'cs00'], categoria: 'csoc' },
  { keywords: ['contraseña', 'password', 'cuenta', 'bloqueado', 'expirad', 'permisos', 'acceso'], categoria: 'usuario' },
  { keywords: ['switch', 'red', 'wifi', 'cámara', 'fibra', 'caída', 'conectividad', 'vpn'], categoria: 'red' },
  { keywords: ['impresora', 'zebra', 'etiqueta'], categoria: 'impresora' },
  { keywords: ['servidor', 'ram', 'cpu', 'disco', 'sobrecalentamiento', 'firepower'], categoria: 'hardware' },
  { keywords: ['aplicativo', 'expertis', 'itaca', 'sap', 'jidocast', 'node-red', 'axon', 'proceso'], categoria: 'software' },
]

const PLANTAS: { keywords: string[]; planta: string }[] = [
  { keywords: ['barcelona', 'bcn', 'dxnbcn'], planta: 'Barcelona' },
  { keywords: ['lleida', 'fonolleres', 'granyanella', 'dxnlld', 'granalla'], planta: 'Lleida' },
  { keywords: ['atxondo', 'axondo'], planta: 'Atxondo' },
  { keywords: ['binefar', 'dxnbnf'], planta: 'Binefar' },
]

function extractHeader(eml: string, header: string): string | null {
  const regex = new RegExp(`^${header}:\\s*(.+?)(?=\\r?\\n[^\\s\\t]|\\r?\\n\\r?\\n)`, 'mis')
  const match = eml.match(regex)
  if (!match) return null
  let value = match[1].replace(/\r?\n\s+/g, ' ').trim()
  value = decodeRFC2047(value)
  return value
}

function decodeRFC2047(str: string): string {
  return str.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_, charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      return Buffer.from(text, 'base64').toString('utf-8')
    } else {
      return text.replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/_/g, ' ')
    }
  })
}

function extractBody(eml: string): string {
  const boundaryMatch = eml.match(/boundary="?([^"\r\n;]+)"?/i)
  
  if (boundaryMatch) {
    const boundary = boundaryMatch[1]
    const parts = eml.split('--' + boundary)
    for (const part of parts) {
      if (part.toLowerCase().includes('content-type: text/plain')) {
        const bodyStart = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2
        let body = part.substring(bodyStart)
        if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
          body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8')
        } else if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
          body = decodeQuotedPrintable(body)
        }
        return cleanBody(body)
      }
    }
    for (const part of parts) {
      if (part.toLowerCase().includes('content-type: text/html')) {
        const bodyStart = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2
        let body = part.substring(bodyStart)
        if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
          body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8')
        } else if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
          body = decodeQuotedPrintable(body)
        }
        return cleanBody(stripHtml(body))
      }
    }
  }
  
  const headerEnd = eml.indexOf('\r\n\r\n') !== -1 ? eml.indexOf('\r\n\r\n') + 4 : eml.indexOf('\n\n') + 2
  let body = eml.substring(headerEnd)
  if (eml.toLowerCase().includes('content-transfer-encoding: base64')) {
    body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8')
  } else if (eml.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
    body = decodeQuotedPrintable(body)
  }
  return cleanBody(body)
}

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
}

function cleanBody(body: string): string {
  const cutPoints = [
    'AVISO. Este correo',
    'NOTICE: This e-mail',
    'Tecnico IT',
    'Técnico IT',
    'http://www.draxton.com',
    '________________________________',
  ]
  let cleaned = body
  for (const cut of cutPoints) {
    const idx = cleaned.indexOf(cut)
    if (idx > 50) cleaned = cleaned.substring(0, idx)
  }
  return cleaned.trim().replace(/\n{3,}/g, '\n\n')
}

function extractFechaIncidencia(subject: string, emailDate: Date): Date {
  const patterns = [
    /(\d{1,2})[\/\-_](\d{1,2})[\/\-_](20\d{2})/,
    /(\d{1,2})[\/\-_](\d{1,2})[\/\-_](\d{2})(?!\d)/,
  ]
  for (const p of patterns) {
    const m = subject.match(p)
    if (m) {
      const day = parseInt(m[1])
      const month = parseInt(m[2])
      let year = parseInt(m[3])
      if (year < 100) year += 2000
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day)
      }
    }
  }
  return emailDate
}

function extractHoras(body: string): { horaInicio: string | null; horaFin: string | null; duracionMinutos: number | null } {
  let horaInicio: string | null = null
  let horaFin: string | null = null
  
  const inicioMatch = body.match(/hora\s*de\s*llamada[:\s]*(\d{1,2}[:\.]?\d{2})/i)
  const finMatch = body.match(/hora\s*de\s*finalizaci[oó]n[:\s]*(\d{1,2}[:\.]?\d{2})/i)
  
  if (inicioMatch) horaInicio = normalizeHora(inicioMatch[1])
  if (finMatch) horaFin = normalizeHora(finMatch[1])
  
  if (!horaInicio) {
    const horaMatch = body.match(/a las\s*(\d{1,2}[:\.]?\d{2})\s*(?:horas?)?/i)
    if (horaMatch) horaInicio = normalizeHora(horaMatch[1])
  }
  
  if (!horaFin) {
    const finMatch2 = body.match(/finaliz[oó]\s*(?:actuaci[oó]n\s*)?a las\s*(\d{1,2}[:\.]?\d{2})/i)
    if (finMatch2) horaFin = normalizeHora(finMatch2[1])
  }
  
  let duracionMinutos: number | null = null
  if (horaInicio && horaFin) {
    const [h1, m1] = horaInicio.split(':').map(Number)
    const [h2, m2] = horaFin.split(':').map(Number)
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1)
    if (mins < 0) mins += 24 * 60
    duracionMinutos = mins
  }
  
  return { horaInicio, horaFin, duracionMinutos }
}

function normalizeHora(h: string): string {
  const clean = h.replace('.', ':')
  if (!clean.includes(':')) return clean + ':00'
  const [hours, mins] = clean.split(':')
  return `${hours.padStart(2, '0')}:${mins.padStart(2, '0')}`
}

function detectCategoria(text: string): string {
  for (const { keywords, categoria } of CATEGORIAS) {
    if (keywords.some(k => text.includes(k))) return categoria
  }
  return 'general'
}

function detectPlanta(text: string): string | null {
  for (const { keywords, planta } of PLANTAS) {
    if (keywords.some(k => text.includes(k))) return planta
  }
  return null
}

function detectDesplazamiento(text: string): boolean {
  const keywords = ['desplazamiento', 'físicamente', 'presencial', 'in situ', 'se llega', 'se desplaz']
  return keywords.some(k => text.includes(k))
}

function cleanSubject(subject: string): string {
  return subject
    .replace(/^(Re:\s*|Fwd:\s*|FW:\s*)+/gi, '')
    .replace(/^(Incidencia de Guardia\s*-?\s*)/i, '')
    .replace(/^(Actuaci[oó]n\s*(de\s*)?Guardia\s*)/i, '')
    .replace(/^(Incidente\s*Guardia\s*)/i, '')
    .replace(/^(Informe\s*(Pasado\s*)?)/i, '')
    .trim() || subject
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

async function main() {
  console.log('=== Importación de EML de Guardias Draxton ===\n')
  
  // Obtener o crear config
  let config = await prisma.guardiaConfig.findUnique({ where: { contratoId: CONTRATO_GUARDIAS_ID } })
  if (!config) {
    config = await prisma.guardiaConfig.create({ data: { contratoId: CONTRATO_GUARDIAS_ID } })
    console.log('Config creada:', config.id)
  } else {
    console.log('Config existente:', config.id)
  }

  // Leer archivos EML
  const files = fs.readdirSync(EML_DIR).filter(f => f.endsWith('.eml'))
  console.log(`\nEncontrados ${files.length} archivos EML\n`)

  let importados = 0
  let duplicados = 0
  let errores = 0

  for (const filename of files) {
    try {
      const filepath = path.join(EML_DIR, filename)
      const content = fs.readFileSync(filepath, 'utf-8')
      
      // Parsear
      const subject = extractHeader(content, 'Subject') || filename
      const from = extractHeader(content, 'From') || ''
      const dateStr = extractHeader(content, 'Date') || ''
      const emailDate = dateStr ? new Date(dateStr) : new Date()
      
      const emailMatch = from.match(/<([^>]+)>/)
      const tecnicoEmail = emailMatch ? emailMatch[1].toLowerCase() : from.toLowerCase()
      const tecnicoNombre = TECNICOS_MAP[tecnicoEmail] || from.replace(/<[^>]+>/, '').trim()
      
      const body = extractBody(content)
      const bodyLower = body.toLowerCase()
      const subjectLower = subject.toLowerCase()
      
      const fecha = extractFechaIncidencia(subject, emailDate)
      const { horaInicio, horaFin, duracionMinutos } = extractHoras(body)
      const categoria = detectCategoria(subjectLower + ' ' + bodyLower)
      const planta = detectPlanta(subjectLower + ' ' + bodyLower)
      const tipoResolucion = detectDesplazamiento(bodyLower) ? 'desplazamiento' : 'remoto'
      const escaladoInterno = bodyLower.includes('joel benet') || bodyLower.includes('escalad')
      
      // ID único del email
      const idMatch = filename.match(/(\d{18,})\.eml$/)
      const emailId = idMatch ? idMatch[1] : `eml_${filename.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}`
      
      const resumen = cleanSubject(subject)

      // Verificar duplicado
      const existente = await prisma.guardiaIncidencia.findUnique({ where: { emailId } })
      if (existente) {
        duplicados++
        console.log(`  [DUP] ${filename}`)
        continue
      }

      // Buscar asignación de la semana
      const lunes = getMonday(fecha)
      const asignacion = await prisma.guardiaAsignacion.findFirst({
        where: { configId: config.id, semanaInicio: lunes }
      })

      // Crear incidencia
      await prisma.guardiaIncidencia.create({
        data: {
          configId: config.id,
          asignacionId: asignacion?.id || null,
          fechaHora: fecha,
          resumen: resumen || subject,
          descripcion: body.substring(0, 3000),
          avisadoPor: 'Servicio de Guardia',
          estado: 'resuelta',
          tipoResolucion,
          escaladoInterno,
          emailId,
          emailSubject: subject,
          emailFrom: from,
          emailDate,
          archivoEml: filename,
          categoria,
          horaInicio,
          horaFin,
          duracionMinutos,
          planta,
          zonaAfectada: planta,
        }
      })
      importados++
      console.log(`  [OK] ${filename} → ${fecha.toLocaleDateString('es-ES')} | ${categoria} | ${planta || '?'} | ${tecnicoNombre}`)
    } catch (err: any) {
      errores++
      console.error(`  [ERR] ${filename}: ${err.message}`)
    }
  }

  console.log(`\n=== RESULTADO ===`)
  console.log(`Importados: ${importados}`)
  console.log(`Duplicados: ${duplicados}`)
  console.log(`Errores: ${errores}`)
  console.log(`Total procesados: ${files.length}`)
  
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
