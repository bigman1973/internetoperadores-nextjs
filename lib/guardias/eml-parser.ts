/**
 * Parser de correos EML de incidencias de guardia Draxton
 * Extrae: fecha, hora inicio/fin, técnico, descripción, resolución, categoría, planta
 */

export interface IncidenciaEML {
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: Date;
  archivoEml: string;
  // Datos extraídos
  fecha: Date;
  horaInicio: string | null;
  horaFin: string | null;
  duracionMinutos: number | null;
  tecnicoNombre: string;
  tecnicoEmail: string;
  resumen: string;
  descripcion: string;
  categoria: string;
  planta: string | null;
  tipoResolucion: string; // remoto | desplazamiento
  escaladoInterno: boolean;
}

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
  'alexis.roldan@internetoperadores.com': 'Alexis Roldán',
  'sergi.tallon@internetoperadores.com': 'Sergi Tallón',
};

// Categorías basadas en palabras clave
const CATEGORIAS: { keywords: string[]; categoria: string }[] = [
  { keywords: ['csoc', 'malicioso', 'seguridad', 'ir5', 'cs00'], categoria: 'csoc' },
  { keywords: ['contraseña', 'password', 'cuenta', 'bloqueado', 'expirad', 'permisos', 'acceso'], categoria: 'usuario' },
  { keywords: ['switch', 'red', 'wifi', 'cámara', 'fibra', 'caída', 'conectividad', 'vpn'], categoria: 'red' },
  { keywords: ['impresora', 'zebra', 'etiqueta'], categoria: 'impresora' },
  { keywords: ['servidor', 'ram', 'cpu', 'disco', 'sobrecalentamiento', 'firepower'], categoria: 'hardware' },
  { keywords: ['aplicativo', 'expertis', 'itaca', 'sap', 'jidocast', 'node-red'], categoria: 'software' },
];

// Plantas basadas en palabras clave
const PLANTAS: { keywords: string[]; planta: string }[] = [
  { keywords: ['barcelona', 'bcn', 'dxnbcn'], planta: 'Barcelona' },
  { keywords: ['lleida', 'fonolleres', 'granyanella', 'dxnlld'], planta: 'Lleida' },
  { keywords: ['atxondo', 'axondo'], planta: 'Atxondo' },
  { keywords: ['binefar', 'dxnbnf'], planta: 'Binefar' },
];

/**
 * Parsea un archivo EML y extrae los datos de la incidencia
 */
export function parseGuardiaEML(emlContent: string, filename: string): IncidenciaEML {
  // Parsear headers
  const subject = extractHeader(emlContent, 'Subject') || filename;
  const from = extractHeader(emlContent, 'From') || '';
  const dateStr = extractHeader(emlContent, 'Date') || '';
  const emailDate = dateStr ? new Date(dateStr) : new Date();
  
  // Extraer email del From
  const emailMatch = from.match(/<([^>]+)>/);
  const tecnicoEmail = emailMatch ? emailMatch[1].toLowerCase() : from.toLowerCase();
  const tecnicoNombre = TECNICOS_MAP[tecnicoEmail] || extractNameFromFrom(from);
  
  // Extraer body (texto plano)
  const body = extractBody(emlContent);
  const bodyLower = body.toLowerCase();
  const subjectLower = subject.toLowerCase();
  
  // Extraer fecha de la incidencia (del subject)
  const fecha = extractFechaIncidencia(subject, emailDate);
  
  // Extraer horas
  const { horaInicio, horaFin, duracionMinutos } = extractHoras(body);
  
  // Detectar categoría
  const categoria = detectCategoria(subjectLower + ' ' + bodyLower);
  
  // Detectar planta
  const planta = detectPlanta(subjectLower + ' ' + bodyLower);
  
  // Detectar si fue desplazamiento
  const tipoResolucion = detectDesplazamiento(bodyLower) ? 'desplazamiento' : 'remoto';
  
  // Detectar escalado
  const escaladoInterno = bodyLower.includes('sergi tallón') || bodyLower.includes('sergi tallon') || bodyLower.includes('joel benet') || bodyLower.includes('escalad');
  
  // Generar ID único del email (usar el ID del nombre del archivo)
  const idMatch = filename.match(/(\d{18,})\.eml$/);
  const emailId = idMatch ? idMatch[1] : `eml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Resumen limpio
  const resumen = cleanSubject(subject);
  
  return {
    emailId,
    emailSubject: subject,
    emailFrom: from,
    emailDate,
    archivoEml: filename,
    fecha,
    horaInicio,
    horaFin,
    duracionMinutos,
    tecnicoNombre,
    tecnicoEmail,
    resumen,
    descripcion: body.substring(0, 3000), // Limitar a 3000 chars
    categoria,
    planta,
    tipoResolucion,
    escaladoInterno,
  };
}

function extractHeader(eml: string, header: string): string | null {
  // Headers pueden estar en múltiples líneas (continuación con espacio/tab)
  const regex = new RegExp(`^${header}:\\s*(.+?)(?=\\r?\\n[^\\s\\t]|\\r?\\n\\r?\\n)`, 'mis');
  const match = eml.match(regex);
  if (!match) return null;
  // Limpiar continuaciones de línea y encoding
  let value = match[1].replace(/\r?\n\s+/g, ' ').trim();
  // Decodificar =?UTF-8?Q?...?= o =?UTF-8?B?...?=
  value = decodeRFC2047(value);
  return value;
}

function decodeRFC2047(str: string): string {
  return str.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_, charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      return Buffer.from(text, 'base64').toString('utf-8');
    } else {
      return text.replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/_/g, ' ');
    }
  });
}

function extractBody(eml: string): string {
  // Buscar el boundary para multipart
  const boundaryMatch = eml.match(/boundary="?([^"\r\n;]+)"?/i);
  
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = eml.split('--' + boundary);
    // Buscar la parte text/plain
    for (const part of parts) {
      if (part.toLowerCase().includes('content-type: text/plain')) {
        // Extraer contenido después de los headers de la parte
        const bodyStart = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2;
        let body = part.substring(bodyStart);
        // Decodificar si es base64 o quoted-printable
        if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
          body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
        } else if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
          body = decodeQuotedPrintable(body);
        }
        return cleanBody(body);
      }
    }
    // Si no hay text/plain, buscar text/html
    for (const part of parts) {
      if (part.toLowerCase().includes('content-type: text/html')) {
        const bodyStart = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2;
        let body = part.substring(bodyStart);
        if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
          body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
        } else if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
          body = decodeQuotedPrintable(body);
        }
        return cleanBody(stripHtml(body));
      }
    }
  }
  
  // Sin multipart: buscar body después de headers
  const headerEnd = eml.indexOf('\r\n\r\n') !== -1 ? eml.indexOf('\r\n\r\n') + 4 : eml.indexOf('\n\n') + 2;
  let body = eml.substring(headerEnd);
  
  // Verificar encoding
  if (eml.toLowerCase().includes('content-transfer-encoding: base64')) {
    body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
  } else if (eml.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
    body = decodeQuotedPrintable(body);
  }
  
  return cleanBody(body);
}

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Soft line breaks
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}

function cleanBody(body: string): string {
  // Eliminar firma y disclaimers
  const cutPoints = [
    'AVISO. Este correo',
    'NOTICE: This e-mail',
    'Tecnico IT',
    'Técnico IT',
    'http://www.draxton.com',
    '________________________________',
  ];
  let cleaned = body;
  for (const cut of cutPoints) {
    const idx = cleaned.indexOf(cut);
    if (idx > 50) cleaned = cleaned.substring(0, idx);
  }
  return cleaned.trim().replace(/\n{3,}/g, '\n\n');
}

function extractNameFromFrom(from: string): string {
  // "Martinez Cayuelas Alejandro <email>" → "Alejandro Martínez Cayuelas"
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim();
  return from;
}

function extractFechaIncidencia(subject: string, emailDate: Date): Date {
  // Patrones: "09/01/2026", "09_01_2026", "24/02/2026", "30/01"
  const patterns = [
    /(\d{1,2})[\/\-_](\d{1,2})[\/\-_](20\d{2})/,
    /(\d{1,2})[\/\-_](\d{1,2})[\/\-_](\d{2})(?!\d)/,
  ];
  for (const p of patterns) {
    const m = subject.match(p);
    if (m) {
      const day = parseInt(m[1]);
      const month = parseInt(m[2]);
      let year = parseInt(m[3]);
      if (year < 100) year += 2000;
      return new Date(year, month - 1, day);
    }
  }
  return emailDate;
}

function extractHoras(body: string): { horaInicio: string | null; horaFin: string | null; duracionMinutos: number | null } {
  let horaInicio: string | null = null;
  let horaFin: string | null = null;
  
  // Patrones de Jesús Parra: "Hora de llamada: 01:00" / "Hora de finalización: 01:17"
  const inicioMatch = body.match(/hora\s*de\s*llamada[:\s]*(\d{1,2}[:\.]?\d{2})/i);
  const finMatch = body.match(/hora\s*de\s*finalizaci[oó]n[:\s]*(\d{1,2}[:\.]?\d{2})/i);
  
  if (inicioMatch) horaInicio = normalizeHora(inicioMatch[1]);
  if (finMatch) horaFin = normalizeHora(finMatch[1]);
  
  // Patrones de Alejandro: "a las 22:35 horas" / "a las 1:44"
  if (!horaInicio) {
    const horaMatch = body.match(/a las\s*(\d{1,2}[:\.]?\d{2})\s*(?:horas?)?/i);
    if (horaMatch) horaInicio = normalizeHora(horaMatch[1]);
  }
  
  // Buscar hora de fin: "se finalizó actuación a las 23:55" / "finalización: 01:17"
  if (!horaFin) {
    const finMatch2 = body.match(/finaliz[oó]\s*(?:actuaci[oó]n\s*)?a las\s*(\d{1,2}[:\.]?\d{2})/i);
    if (finMatch2) horaFin = normalizeHora(finMatch2[1]);
  }
  
  // Calcular duración
  let duracionMinutos: number | null = null;
  if (horaInicio && horaFin) {
    const [h1, m1] = horaInicio.split(':').map(Number);
    const [h2, m2] = horaFin.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60; // Cruzó medianoche
    duracionMinutos = mins;
  }
  
  return { horaInicio, horaFin, duracionMinutos };
}

function normalizeHora(h: string): string {
  const clean = h.replace('.', ':');
  if (!clean.includes(':')) return clean + ':00';
  const [hours, mins] = clean.split(':');
  return `${hours.padStart(2, '0')}:${mins.padStart(2, '0')}`;
}

function detectCategoria(text: string): string {
  for (const { keywords, categoria } of CATEGORIAS) {
    if (keywords.some(k => text.includes(k))) return categoria;
  }
  return 'general';
}

function detectPlanta(text: string): string | null {
  for (const { keywords, planta } of PLANTAS) {
    if (keywords.some(k => text.includes(k))) return planta;
  }
  return null;
}

function detectDesplazamiento(text: string): boolean {
  const keywords = ['desplazamiento', 'físicamente', 'presencial', 'in situ', 'se llega', 'se desplaz'];
  return keywords.some(k => text.includes(k));
}

function cleanSubject(subject: string): string {
  // Limpiar prefijos comunes
  return subject
    .replace(/^(Re:\s*|Fwd:\s*|FW:\s*)+/gi, '')
    .replace(/^(Incidencia de Guardia\s*-?\s*)/i, '')
    .replace(/^(Actuaci[oó]n\s*(de\s*)?Guardia\s*)/i, '')
    .replace(/^(Incidente\s*Guardia\s*)/i, '')
    .replace(/^(Informe\s*(Pasado\s*)?)/i, '')
    .replace(/^\d{1,2}[\/\-_]\d{1,2}[\/\-_]?\d{0,4}\s*[|\-]?\s*/, '')
    .trim() || subject;
}
