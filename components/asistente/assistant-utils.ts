export type AssistantSource = {
  n: number
  titulo: string
  url: string
  fragmento: string
}

export type AssistantCtaType = 'INFORME_CERO_RIESGOS' | 'BACKUP_CONEXION' | 'CONTACTO' | 'LEAD'

export type AssistantCta = {
  tipo: AssistantCtaType
  texto: string
  url?: string
}

export type AssistantChatResponse = {
  conversacionId: string
  mensajeId: string
  respuesta: string
  fuentes: AssistantSource[]
  sinFuente: boolean
  escalar: boolean
  motivoEscalado?: 'PETICION' | 'ENFADO' | 'SIN_RESPUESTA' | 'FUERA_DOMINIO'
  ctas: AssistantCta[]
  modo?: string
}

export type StoredAssistantMessage = {
  id: string
  rol: 'usuario' | 'asistente'
  texto: string
  mensajeId?: string
  fuentes?: AssistantSource[]
  ctas?: AssistantCta[]
  sinFuente?: boolean
  createdAt: number
  valoracion?: boolean
}

export type FieldErrors = Record<string, string>

const CTA_TYPES = new Set<AssistantCtaType>([
  'INFORME_CERO_RIESGOS',
  'BACKUP_CONEXION',
  'CONTACTO',
  'LEAD',
])

const ESCALATION_REASONS = new Set([
  'PETICION',
  'ENFADO',
  'SIN_RESPUESTA',
  'FUERA_DOMINIO',
])

export function messageCounter(message: string, maxChars: number): {
  length: number
  remaining: number
  valid: boolean
} {
  const length = Array.from(message).length
  return { length, remaining: maxChars - length, valid: length <= maxChars }
}

/** Permite sólo rutas locales o URLs del mismo origen; nunca esquemas peligrosos ni hosts ajenos. */
export function safeSourceUrl(raw: unknown, ownOrigin = 'https://www.internetoperadores.com'): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.includes('\\')) return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const candidate = new URL(value)
    const own = new URL(ownOrigin)
    return candidate.protocol === own.protocol && candidate.origin === own.origin ? candidate.href : null
  } catch {
    return null
  }
}

export function citationNumbers(text: string): number[] {
  const seen = new Set<number>()
  const result: number[] = []
  for (const match of text.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(match[1])
    if (n > 0 && !seen.has(n)) {
      seen.add(n)
      result.push(n)
    }
  }
  return result
}

export type CitationPart = { type: 'text'; value: string } | { type: 'citation'; n: number }

export function splitCitations(text: string): CitationPart[] {
  const parts: CitationPart[] = []
  const expression = /\[(\d{1,3})\]/g
  let lastIndex = 0
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, index) })
    const n = Number(match[1])
    if (n > 0) parts.push({ type: 'citation', n })
    else parts.push({ type: 'text', value: match[0] })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length || parts.length === 0) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return parts
}

function text(value: unknown, max = 6000): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function parseAssistantResponse(value: unknown): AssistantChatResponse | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const conversacionId = text(data.conversacionId, 100)
  const mensajeId = text(data.mensajeId, 100)
  const respuesta = text(data.respuesta)
  if (!conversacionId || !mensajeId || !respuesta) return null

  const fuentes = Array.isArray(data.fuentes)
    ? data.fuentes
        .map((source): AssistantSource | null => {
          if (!source || typeof source !== 'object') return null
          const item = source as Record<string, unknown>
          const n = number(item.n)
          const titulo = text(item.titulo, 500)
          const url = text(item.url, 2000)
          const fragmento = text(item.fragmento, 3000)
          return n && titulo && url ? { n, titulo, url, fragmento } : null
        })
        .filter((source): source is AssistantSource => source !== null)
    : []

  const ctas = Array.isArray(data.ctas)
    ? data.ctas
        .map((cta): AssistantCta | null => {
          if (!cta || typeof cta !== 'object') return null
          const item = cta as Record<string, unknown>
          const tipo = text(item.tipo, 50) as AssistantCtaType
          const texto = text(item.texto, 300)
          const url = text(item.url, 2000)
          return CTA_TYPES.has(tipo) && texto ? { tipo, texto, ...(url ? { url } : {}) } : null
        })
        .filter((cta): cta is AssistantCta => cta !== null)
    : []

  const rawReason = text(data.motivoEscalado, 30)
  return {
    conversacionId,
    mensajeId,
    respuesta,
    fuentes,
    sinFuente: Boolean(data.sinFuente),
    escalar: Boolean(data.escalar),
    ...(ESCALATION_REASONS.has(rawReason) ? { motivoEscalado: rawReason as AssistantChatResponse['motivoEscalado'] } : {}),
    ctas,
    ...(typeof data.modo === 'string' ? { modo: text(data.modo, 40) } : {}),
  }
}

export function ctaHref(cta: AssistantCta, ownOrigin?: string): string | null {
  switch (cta.tipo) {
    case 'INFORME_CERO_RIESGOS':
      return '/cero-riesgos'
    case 'BACKUP_CONEXION':
      return safeSourceUrl(cta.url, ownOrigin) || '/productos/backup'
    case 'CONTACTO':
      return '/contacto'
    case 'LEAD':
      return null
  }
}

function emailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function phoneValid(value: string): boolean {
  const digits = value.replace(/[^\d+]/g, '').replace(/^\+34/, '')
  return /^\d{9}$/.test(digits)
}

export type EscalationInput = {
  nombre: string
  telefono: string
  email: string
  preferencia: 'LLAMADA' | 'EMAIL'
  franja: string
  consentimiento: boolean
}

export function validateEscalation(input: EscalationInput, outsideHours = false): FieldErrors {
  const errors: FieldErrors = {}
  if (input.nombre.trim().length < 2) errors.nombre = 'Indica tu nombre para que podamos atenderte.'
  const hasPhone = input.telefono.trim().length > 0
  const hasEmail = input.email.trim().length > 0
  if (!hasPhone && !hasEmail) errors.contacto = 'Indica un teléfono o un correo electrónico.'
  if (hasPhone && !phoneValid(input.telefono)) errors.telefono = 'Revisa el teléfono. Debe tener 9 cifras.'
  if (hasEmail && !emailValid(input.email)) errors.email = 'Revisa el correo electrónico.'
  if (input.preferencia === 'LLAMADA' && !hasPhone) errors.telefono = 'Para llamarte necesitamos un teléfono.'
  if (input.preferencia === 'EMAIL' && !hasEmail) errors.email = 'Para responder por correo necesitamos un email.'
  if (outsideHours && input.franja.trim().length < 2) errors.franja = 'Elige una franja para devolverte la llamada.'
  if (!input.consentimiento) errors.consentimiento = 'Necesitamos tu consentimiento para enviar los datos de contacto.'
  return errors
}

export type LeadInput = {
  tipo: 'EMPRESA' | 'HOGAR' | ''
  codigoPostal: string
  conexionActual: string
  problemas: string[]
  usuarios: string
  urgencia: 'ALTA' | 'MEDIA' | 'BAJA' | ''
  nombre: string
  email: string
  telefono: string
  empresa: string
  consentimiento: boolean
  consentimientoVersion: string
}

export function validateLead(input: LeadInput): FieldErrors {
  const errors: FieldErrors = {}
  if (input.tipo !== 'EMPRESA' && input.tipo !== 'HOGAR') errors.tipo = 'Selecciona si es para empresa u hogar.'
  if (!/^\d{5}$/.test(input.codigoPostal.trim())) errors.codigoPostal = 'Indica un código postal de 5 cifras.'
  if (input.conexionActual.trim().length < 2) errors.conexionActual = 'Cuéntanos qué conexión tienes ahora.'
  if (!input.problemas.length) errors.problemas = 'Selecciona al menos un problema.'
  const users = Number(input.usuarios)
  if (!Number.isInteger(users) || users < 1 || users > 100000) errors.usuarios = 'Indica un número de usuarios válido.'
  if (!['ALTA', 'MEDIA', 'BAJA'].includes(input.urgencia)) errors.urgencia = 'Selecciona la urgencia.'
  if (input.nombre.trim().length < 2) errors.nombre = 'Indica tu nombre.'
  const hasPhone = input.telefono.trim().length > 0
  const hasEmail = input.email.trim().length > 0
  if (!hasPhone && !hasEmail) errors.contacto = 'Indica un email o teléfono para responderte.'
  if (hasPhone && !phoneValid(input.telefono)) errors.telefono = 'Revisa el teléfono. Debe tener 9 cifras.'
  if (hasEmail && !emailValid(input.email)) errors.email = 'Revisa el correo electrónico.'
  if (input.tipo === 'EMPRESA' && input.empresa.trim().length < 2) errors.empresa = 'Indica el nombre de la empresa.'
  if (!input.consentimiento) errors.consentimiento = 'Necesitamos tu consentimiento para tratar estos datos.'
  if (!input.consentimientoVersion) errors.consentimientoVersion = 'No se ha podido verificar la versión del consentimiento.'
  return errors
}

export function restoreConversation(value: unknown): {
  conversacionId: string | null
  mensajes: StoredAssistantMessage[]
} {
  if (!value || typeof value !== 'object') return { conversacionId: null, mensajes: [] }
  const raw = value as Record<string, unknown>
  const messages = Array.isArray(raw.mensajes)
    ? raw.mensajes
        .map((message): StoredAssistantMessage | null => {
          if (!message || typeof message !== 'object') return null
          const item = message as Record<string, unknown>
          const rol = item.rol === 'usuario' || item.rol === 'asistente' ? item.rol : null
          const id = text(item.id, 120)
          const texto = text(item.texto)
          const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now()
          if (!rol || !id || !texto) return null
          return {
            id,
            rol,
            texto,
            ...(typeof item.mensajeId === 'string' ? { mensajeId: text(item.mensajeId, 100) } : {}),
            ...(Array.isArray(item.fuentes) ? { fuentes: item.fuentes as AssistantSource[] } : {}),
            ...(Array.isArray(item.ctas) ? { ctas: item.ctas as AssistantCta[] } : {}),
            ...(typeof item.sinFuente === 'boolean' ? { sinFuente: item.sinFuente } : {}),
            createdAt,
            ...(typeof item.valoracion === 'boolean' ? { valoracion: item.valoracion } : {}),
          }
        })
        .filter((message): message is StoredAssistantMessage => message !== null)
        .slice(-50)
    : []
  return {
    conversacionId: typeof raw.conversacionId === 'string' && raw.conversacionId.length <= 100 ? raw.conversacionId : null,
    mensajes: messages,
  }
}
