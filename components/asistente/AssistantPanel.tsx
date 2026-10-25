'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import {
  ctaHref,
  messageCounter,
  parseAssistantResponse,
  restoreConversation,
  safeSourceUrl,
  splitCitations,
  validateEscalation,
  validateLead,
  type AssistantChatResponse,
  type AssistantCta,
  type EscalationInput,
  type FieldErrors,
  type LeadInput,
  type StoredAssistantMessage,
} from './assistant-utils'

const STORAGE_KEY = 'io_asistente_conversacion_v1'
const DEFAULT_MAX_CHARS = 1500
const PROBLEMS = ['Sin cobertura', 'Cortes o lentitud', 'Precio o tarifa', 'Seguridad', 'Backup', 'Otro']

type AssistantConfig = {
  enabled: boolean
  modo?: string
  bienvenida?: string
  aviso?: string
  privacidadUrl?: string
  horario?: { dentroHorario: boolean; texto: string }
  consentimientoVersion?: string
  maxChars?: number
}

type PanelView = 'chat' | 'escalation' | 'lead'

type EscalationState = EscalationInput & { motivo: 'PETICION' | 'ENFADO' | 'SIN_RESPUESTA' | 'FUERA_DOMINIO' }

export type AssistantPanelProps = {
  launcherRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onUnavailable: () => void
}

function emptyEscalation(motivo: EscalationState['motivo'] = 'PETICION'): EscalationState {
  return {
    motivo,
    nombre: '',
    telefono: '',
    email: '',
    preferencia: 'LLAMADA',
    franja: '',
    consentimiento: false,
  }
}

function emptyLead(consentimientoVersion = ''): LeadInput {
  return {
    tipo: '',
    codigoPostal: '',
    conexionActual: '',
    problemas: [],
    usuarios: '',
    urgencia: '',
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    consentimiento: false,
    consentimientoVersion,
  }
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}


function apiError(status: number, code?: string): string {
  if (status === 400 && code === 'MENSAJE_LARGO') return 'El mensaje supera el límite permitido. Acórtalo e inténtalo de nuevo.'
  if (status === 400) return 'Revisa el mensaje antes de enviarlo.'
  if (status === 429) return 'Hemos recibido muchas consultas. Espera unos minutos antes de volver a intentarlo.'
  if (status === 503) return 'El asistente no está disponible en este momento. Puedes hablar con una persona.'
  return 'No hemos podido enviar tu consulta. Comprueba tu conexión e inténtalo de nuevo.'
}

async function bodyJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = await response.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function readSse(
  response: Response,
  onDelta: (text: string) => void,
): Promise<AssistantChatResponse | null> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = 'message'
  let dataLines: string[] = []
  let final: AssistantChatResponse | null = null

  const consume = () => {
    if (!dataLines.length) {
      eventName = 'message'
      return
    }
    const data = dataLines.join('\n')
    dataLines = []
    try {
      const payload = JSON.parse(data) as Record<string, unknown>
      if (eventName === 'delta' && typeof payload.texto === 'string') onDelta(payload.texto)
      if (eventName === 'final') final = parseAssistantResponse(payload)
    } catch {
      // Un evento malformado no debe romper el diálogo ni ejecutar contenido recibido.
    }
    eventName = 'message'
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = done ? '' : (lines.pop() ?? '')
    for (const line of lines) {
      if (!line) {
        consume()
      } else if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (done) break
  }
  consume()
  return final
}

function renderAnswer(text: string) {
  return splitCitations(text).map((part, index) =>
    part.type === 'citation' ? (
      <sup key={`${part.n}-${index}`} className="ml-0.5 rounded bg-orange-100 px-1 py-0.5 text-[0.7rem] font-bold text-orange-800" aria-label={`Fuente ${part.n}`}>
        [{part.n}]
      </sup>
    ) : (
      <span key={`text-${index}`}>{part.value}</span>
    ),
  )
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1 text-xs font-medium text-red-700" role="alert">{children}</p> : null
}

function TextInput({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 sm:text-sm"
      />
      <FieldError>{error}</FieldError>
    </label>
  )
}

export default function AssistantPanel({ launcherRef, onClose, onUnavailable }: AssistantPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const openedAtRef = useRef(Date.now())
  const configAbortRef = useRef<AbortController | null>(null)
  const [config, setConfig] = useState<AssistantConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [configError, setConfigError] = useState('')
  const [hidden, setHidden] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<StoredAssistantMessage[]>([])
  const [restored, setRestored] = useState(false)
  const [draft, setDraft] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [sending, setSending] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [view, setView] = useState<PanelView>('chat')
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [escalation, setEscalation] = useState<EscalationState>(() => emptyEscalation())
  const [escalationErrors, setEscalationErrors] = useState<FieldErrors>({})
  const [escalationSending, setEscalationSending] = useState(false)
  const [escalationResult, setEscalationResult] = useState('')
  const [lead, setLead] = useState<LeadInput>(() => emptyLead())
  const [leadErrors, setLeadErrors] = useState<FieldErrors>({})
  const [leadSending, setLeadSending] = useState(false)
  const [leadResult, setLeadResult] = useState('')

  const maxChars = config?.maxChars && config.maxChars > 0 ? config.maxChars : DEFAULT_MAX_CHARS
  const counter = messageCounter(draft, maxChars)
  const insideHours = config?.horario?.dentroHorario ?? false
  const greeting = config?.bienvenida?.trim() || 'Hola, soy el asistente virtual de Internet Operadores. ¿En qué podemos ayudarte?'

  const loadConfig = useCallback(async () => {
    configAbortRef.current?.abort()
    const controller = new AbortController()
    configAbortRef.current = controller
    setLoadingConfig(true)
    setConfigError('')
    try {
      const response = await fetch('/api/asistente/config', {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      const data = await bodyJson(response)
      if (!response.ok || !data) throw new Error('CONFIG_FAILED')
      if (data.enabled !== true) {
        setHidden(true)
        onUnavailable()
        return
      }
      const nextConfig: AssistantConfig = {
        enabled: true,
        modo: typeof data.modo === 'string' ? data.modo : undefined,
        bienvenida: typeof data.bienvenida === 'string' ? data.bienvenida : undefined,
        aviso: typeof data.aviso === 'string' ? data.aviso : undefined,
        privacidadUrl: typeof data.privacidadUrl === 'string' ? data.privacidadUrl : '/politica-privacidad',
        horario: data.horario && typeof data.horario === 'object'
          ? {
              dentroHorario: Boolean((data.horario as Record<string, unknown>).dentroHorario),
              texto: typeof (data.horario as Record<string, unknown>).texto === 'string'
                ? (data.horario as Record<string, unknown>).texto as string
                : '',
            }
          : undefined,
        consentimientoVersion: typeof data.consentimientoVersion === 'string' ? data.consentimientoVersion : '',
        maxChars: typeof data.maxChars === 'number' ? data.maxChars : DEFAULT_MAX_CHARS,
      }
      setConfig(nextConfig)
      setLead((current) => ({ ...current, consentimientoVersion: nextConfig.consentimientoVersion || '' }))
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setConfigError('No hemos podido iniciar el asistente. Vuelve a intentarlo.')
    } finally {
      if (!controller.signal.aborted) setLoadingConfig(false)
    }
  }, [onUnavailable])

  useEffect(() => {
    void loadConfig()
    return () => configAbortRef.current?.abort()
  }, [loadConfig])

  useEffect(() => {
    if (!config || restored) return
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      const recovered = restoreConversation(stored ? JSON.parse(stored) : null)
      setConversationId(recovered.conversacionId)
      setMessages(recovered.mensajes.length ? recovered.mensajes : [{
        id: id('bienvenida'),
        rol: 'asistente',
        texto: greeting,
        createdAt: Date.now(),
      }])
    } catch {
      setMessages([{ id: id('bienvenida'), rol: 'asistente', texto: greeting, createdAt: Date.now() }])
    } finally {
      setRestored(true)
    }
  }, [config, greeting, restored])

  useEffect(() => {
    if (!restored) return
    try {
      // El almacenamiento de pestaña se limita expresamente a id de conversación y mensajes.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ conversacionId: conversationId, mensajes: messages.slice(-50) }))
    } catch {
      // Navegación privada o cuota: el chat sigue funcionando sólo en memoria.
    }
  }, [conversationId, messages, restored])

  useEffect(() => {
    if (!config || !restored || view !== 'chat') return
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [config, restored, view])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const addAssistantResponse = useCallback((answer: AssistantChatResponse, streamingId?: string) => {
    setConversationId(answer.conversacionId)
    const responseMessage: StoredAssistantMessage = {
      id: streamingId || id('asistente'),
      rol: 'asistente',
      texto: answer.respuesta,
      mensajeId: answer.mensajeId,
      fuentes: answer.fuentes,
      ctas: answer.ctas,
      sinFuente: answer.sinFuente,
      createdAt: Date.now(),
    }
    setMessages((current) => {
      if (streamingId && current.some((message) => message.id === streamingId)) {
        return current.map((message) => message.id === streamingId ? responseMessage : message)
      }
      return [...current, responseMessage]
    })
    if (answer.escalar) {
      setEscalation(emptyEscalation(answer.motivoEscalado || 'PETICION'))
      setView('escalation')
    }
  }, [])

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || sending || !config) return
    if (!counter.valid) {
      setRequestError(`El mensaje no puede superar ${maxChars} caracteres.`)
      return
    }
    const elapsed = Date.now() - openedAtRef.current
    if (elapsed < 1500) {
      setRequestError('Espera un instante y vuelve a enviar tu consulta.')
      return
    }
    setRequestError('')
    setSending(true)
    const userMessage: StoredAssistantMessage = { id: id('usuario'), rol: 'usuario', texto: text, createdAt: Date.now() }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    let streamingId: string | undefined
    try {
      const response = await fetch('/api/asistente/chat', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
        body: JSON.stringify({ conversacionId: conversationId || undefined, mensaje: text, hp: honeypot, t: elapsed }),
      })
      if (!response.ok) {
        const payload = await bodyJson(response)
        setRequestError(apiError(response.status, typeof payload?.codigo === 'string' ? payload.codigo : undefined))
        return
      }
      const contentType = response.headers.get('content-type') || ''
      let answer: AssistantChatResponse | null = null
      if (contentType.includes('text/event-stream')) {
        streamingId = id('stream')
        let accumulated = ''
        answer = await readSse(response, (delta) => {
          accumulated += delta
          const textSoFar = accumulated
          setMessages((current) => {
            const existing = current.find((message) => message.id === streamingId)
            if (existing) return current.map((message) => message.id === streamingId ? { ...message, texto: textSoFar } : message)
            return [...current, { id: streamingId as string, rol: 'asistente', texto: textSoFar, createdAt: Date.now() }]
          })
        })
        if (!answer && accumulated) {
          setRequestError('La respuesta se ha interrumpido. Puedes volver a intentarlo.')
          return
        }
      } else {
        answer = parseAssistantResponse(await bodyJson(response))
      }
      if (!answer) {
        setRequestError('La respuesta recibida no es válida. Vuelve a intentarlo.')
        if (streamingId) setMessages((current) => current.filter((message) => message.id !== streamingId))
        return
      }
      addAssistantResponse(answer, streamingId)
    } catch {
      setRequestError('No hemos podido conectar con el asistente. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setSending(false)
    }
  }

  const submitFeedback = async (messageId: string, useful: boolean, comment?: string) => {
    if (feedbackSending) return
    setFeedbackSending(true)
    setRequestError('')
    try {
      const response = await fetch('/api/asistente/valoracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajeId: messageId, util: useful, ...(comment?.trim() ? { comentario: comment.trim().slice(0, 500) } : {}) }),
      })
      if (!response.ok) throw new Error('FEEDBACK_FAILED')
      setMessages((current) => current.map((message) => message.mensajeId === messageId ? { ...message, valoracion: useful } : message))
      setFeedbackMessageId(null)
      setFeedbackComment('')
    } catch {
      setRequestError('No hemos podido guardar tu valoración. Puedes intentarlo de nuevo.')
    } finally {
      setFeedbackSending(false)
    }
  }

  const showEscalation = (reason: EscalationState['motivo'] = 'PETICION') => {
    setEscalation(emptyEscalation(reason))
    setEscalationErrors({})
    setEscalationResult('')
    setView('escalation')
  }

  const submitEscalation = async (event: FormEvent) => {
    event.preventDefault()
    const errors = validateEscalation(escalation, !insideHours)
    setEscalationErrors(errors)
    if (Object.keys(errors).length) return
    setEscalationSending(true)
    try {
      const response = await fetch('/api/asistente/escalado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacionId: conversationId || undefined,
          motivo: escalation.motivo,
          nombre: escalation.nombre.trim(),
          telefono: escalation.telefono.trim() || undefined,
          email: escalation.email.trim() || undefined,
          preferencia: escalation.preferencia,
          franja: escalation.franja.trim() || undefined,
          consentimiento: escalation.consentimiento,
        }),
      })
      const payload = await bodyJson(response)
      if (!response.ok) throw new Error('ESCALATION_FAILED')
      if (typeof payload?.conversacionId === 'string' && payload.conversacionId.length <= 100) setConversationId(payload.conversacionId)
      setEscalationResult(typeof payload?.mensaje === 'string' ? payload.mensaje : insideHours ? 'Hemos recibido tu solicitud. Te llamaremos ahora o en breve.' : 'Hemos recibido tu solicitud de devolución de llamada.')
    } catch {
      setEscalationResult('No hemos podido enviar tu solicitud. Comprueba los datos e inténtalo de nuevo.')
    } finally {
      setEscalationSending(false)
    }
  }

  const showLead = () => {
    setLead(emptyLead(config?.consentimientoVersion || ''))
    setLeadErrors({})
    setLeadResult('')
    setView('lead')
  }

  const toggleProblem = (problem: string) => {
    setLead((current) => ({
      ...current,
      problemas: current.problemas.includes(problem)
        ? current.problemas.filter((item) => item !== problem)
        : [...current.problemas, problem],
    }))
  }

  const submitLead = async (event: FormEvent) => {
    event.preventDefault()
    const errors = validateLead(lead)
    setLeadErrors(errors)
    if (Object.keys(errors).length) return
    setLeadSending(true)
    try {
      const response = await fetch('/api/asistente/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacionId: conversationId || undefined,
          tipo: lead.tipo,
          codigoPostal: lead.codigoPostal.trim(),
          conexionActual: lead.conexionActual.trim(),
          problemas: lead.problemas,
          usuarios: Number(lead.usuarios),
          urgencia: lead.urgencia,
          nombre: lead.nombre.trim(),
          email: lead.email.trim() || undefined,
          telefono: lead.telefono.trim() || undefined,
          empresa: lead.empresa.trim() || undefined,
          consentimiento: true,
          consentimientoVersion: lead.consentimientoVersion,
        }),
      })
      const payload = await bodyJson(response)
      if (!response.ok) throw new Error('LEAD_FAILED')
      if (typeof payload?.conversacionId === 'string' && payload.conversacionId.length <= 100) setConversationId(payload.conversacionId)
      setLeadResult(typeof payload?.mensaje === 'string' ? payload.mensaje : 'Gracias. Hemos recibido tus datos y te responderemos lo antes posible.')
    } catch {
      setLeadResult('No hemos podido enviar los datos. Comprueba la información e inténtalo de nuevo.')
    } finally {
      setLeadSending(false)
    }
  }

  const clearConversation = () => {
    setConversationId(null)
    setMessages([{ id: id('bienvenida'), rol: 'asistente', texto: greeting, createdAt: Date.now() }])
    setFeedbackMessageId(null)
    setRequestError('')
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // El estado en memoria ya se ha reiniciado.
    }
  }

  const privacyHref = safeSourceUrl(config?.privacidadUrl || '/politica-privacidad', typeof window === 'undefined' ? undefined : window.location.origin) || '/politica-privacidad'
  const screenTitle = view === 'chat' ? 'Asistente virtual' : view === 'escalation' ? 'Hablar con una persona' : 'Cuéntanos qué necesitas'

  const chatContent = useMemo(() => (
    <>
      <div className="border-b border-orange-100 bg-orange-50 px-4 py-3 text-xs leading-5 text-slate-700">
        <p>
          {config?.aviso?.trim() || 'Asistente automático. No compartas datos sensibles.'}{' '}
          <a href={privacyHref} className="font-semibold text-orange-800 underline decoration-orange-400 underline-offset-2 hover:text-orange-950">
            Política de privacidad
          </a>
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-4" aria-live="polite" aria-relevant="additions text">
        <div className="space-y-3">
          {messages.map((message) => {
            const safeSources = (message.fuentes || []).map((source) => ({
              ...source,
              safeUrl: safeSourceUrl(source.url, typeof window === 'undefined' ? undefined : window.location.origin),
            })).filter((source) => source.safeUrl)
            return (
              <article key={message.id} className={message.rol === 'usuario' ? 'ml-8 text-right' : 'mr-4 text-left'}>
                <div className={`inline-block max-w-full rounded-2xl px-3 py-2.5 text-sm leading-5 shadow-sm ${message.rol === 'usuario' ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                  {message.rol === 'asistente' ? renderAnswer(message.texto) : message.texto}
                </div>
                {message.rol === 'asistente' && safeSources.length ? (
                  <section className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-left" aria-label="Fuentes de la respuesta">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Fuentes</p>
                    <ul className="mt-1.5 space-y-2">
                      {safeSources.map((source) => (
                        <li key={`${message.id}-${source.n}`} className="text-xs leading-4 text-slate-700">
                          <a href={source.safeUrl as string} className="font-semibold text-orange-800 underline decoration-orange-300 underline-offset-2 hover:text-orange-950">
                            [{source.n}] {source.titulo}
                          </a>
                          {source.fragmento ? <p className="mt-0.5 text-slate-600">{source.fragmento}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {message.rol === 'asistente' && message.sinFuente ? <p className="mt-1 text-xs text-slate-600">No hemos encontrado una fuente pública concreta para esta respuesta.</p> : null}
                {message.rol === 'asistente' && message.ctas?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.ctas.map((cta, index) => {
                      const href = ctaHref(cta, typeof window === 'undefined' ? undefined : window.location.origin)
                      if (cta.tipo === 'LEAD') {
                        return <button key={`${message.id}-cta-${index}`} type="button" onClick={showLead} className="min-h-9 rounded-lg border border-orange-300 bg-white px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{cta.texto}</button>
                      }
                      return href ? <a key={`${message.id}-cta-${index}`} href={href} className="inline-flex min-h-9 items-center rounded-lg border border-orange-300 bg-white px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{cta.texto}</a> : null
                    })}
                  </div>
                ) : null}
                {message.rol === 'asistente' && message.mensajeId && !message.valoracion ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-600">¿Te ha resultado útil?</span>
                    <button type="button" onClick={() => void submitFeedback(message.mensajeId as string, true)} disabled={feedbackSending} className="min-h-8 rounded-md border border-slate-300 bg-white px-2 text-slate-700 hover:border-orange-400 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50" aria-label="La respuesta ha sido útil">👍</button>
                    <button type="button" onClick={() => { setFeedbackMessageId(message.mensajeId as string); setFeedbackComment('') }} disabled={feedbackSending} className="min-h-8 rounded-md border border-slate-300 bg-white px-2 text-slate-700 hover:border-orange-400 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50" aria-label="La respuesta no ha sido útil">👎</button>
                  </div>
                ) : null}
                {message.rol === 'asistente' && message.mensajeId && feedbackMessageId === message.mensajeId ? (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-left">
                    <label className="block text-xs font-medium text-slate-700" htmlFor={`comentario-${message.id}`}>¿Qué podríamos mejorar? (opcional)</label>
                    <textarea id={`comentario-${message.id}`} value={feedbackComment} maxLength={500} rows={2} onChange={(event) => setFeedbackComment(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                    <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{messageCounter(feedbackComment, 500).length}/500</span><button type="button" onClick={() => void submitFeedback(message.mensajeId as string, false, feedbackComment)} disabled={feedbackSending} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50">{feedbackSending ? 'Enviando…' : 'Enviar opinión'}</button></div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        {requestError ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800" role="alert">{requestError}</p> : null}
        <form onSubmit={sendMessage}>
          <input name="website" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} autoComplete="off" tabIndex={-1} aria-hidden="true" className="absolute h-px w-px overflow-hidden opacity-0" />
          <label className="sr-only" htmlFor="asistente-mensaje">Escribe tu consulta</label>
          <textarea ref={textareaRef} id="asistente-mensaje" value={draft} maxLength={maxChars} rows={2} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder="Escribe tu consulta…" disabled={sending} className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-950 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-slate-100 sm:text-sm" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className={`text-xs ${counter.remaining < 0 ? 'font-semibold text-red-700' : 'text-slate-500'}`} aria-live="polite">{counter.length}/{maxChars}</span>
            <button type="submit" disabled={sending || !draft.trim() || !counter.valid} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-400">{sending ? 'Consultando…' : 'Enviar'}</button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">
          <button type="button" onClick={() => showEscalation()} className="min-h-8 font-semibold text-orange-800 underline decoration-orange-300 underline-offset-2 hover:text-orange-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Hablar con una persona</button>
          <button type="button" onClick={clearConversation} className="min-h-8 text-slate-600 underline underline-offset-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Borrar conversación</button>
        </div>
      </div>
    </>
  ), [config?.aviso, counter.length, counter.remaining, counter.valid, draft, feedbackComment, feedbackMessageId, feedbackSending, greeting, maxChars, messages, privacyHref, requestError, sending])

  if (hidden) return null

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/30 sm:bg-transparent" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="asistente-titulo" className="fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:left-6 sm:h-[min(600px,calc(100dvh-7rem))] sm:w-[min(380px,calc(100vw-3rem))] sm:rounded-2xl sm:border sm:border-slate-200">
        <header className="flex shrink-0 items-center justify-between bg-primary px-4 py-3 text-white">
          <div><h2 id="asistente-titulo" className="text-base font-bold">{screenTitle}</h2>{config?.horario?.texto ? <p className="mt-0.5 text-xs text-orange-50">{config.horario.texto}</p> : null}</div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Cerrar asistente">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        {loadingConfig ? <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-700" aria-live="polite">Preparando el asistente…</div> : null}
        {configError ? <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><p className="text-sm text-slate-700" role="alert">{configError}</p><button type="button" onClick={() => void loadConfig()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Reintentar</button></div> : null}
        {config && restored && view === 'chat' ? chatContent : null}
        {config && restored && view === 'escalation' ? (
          <form onSubmit={submitEscalation} className="min-h-0 flex-1 overflow-y-auto p-4" noValidate>
            {escalationResult ? <div className="rounded-xl bg-green-50 p-3 text-sm leading-5 text-green-900" role="status">{escalationResult}<button type="button" onClick={() => setView('chat')} className="mt-3 block min-h-9 font-semibold text-green-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Volver al asistente</button></div> : <>
              <p className="mb-4 text-sm leading-5 text-slate-700">{insideHours ? 'Estamos en horario de atención. Déjanos tus datos y te llamaremos ahora o en breve.' : 'Ahora no estamos en horario de atención. Indica una franja y te devolveremos la llamada.'}</p>
              <div className="space-y-3"><TextInput label="Nombre" autoComplete="name" value={escalation.nombre} error={escalationErrors.nombre} onChange={(event) => setEscalation({ ...escalation, nombre: event.target.value })} /><TextInput label="Teléfono" type="tel" autoComplete="tel" value={escalation.telefono} error={escalationErrors.telefono || escalationErrors.contacto} onChange={(event) => setEscalation({ ...escalation, telefono: event.target.value })} /><TextInput label="Email" type="email" autoComplete="email" value={escalation.email} error={escalationErrors.email} onChange={(event) => setEscalation({ ...escalation, email: event.target.value })} />
                <fieldset><legend className="text-sm font-medium text-slate-800">¿Cómo prefieres que te atendamos?</legend><div className="mt-1 flex gap-4"><label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="preferencia" checked={escalation.preferencia === 'LLAMADA'} onChange={() => setEscalation({ ...escalation, preferencia: 'LLAMADA' })} /> Llamada</label><label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="preferencia" checked={escalation.preferencia === 'EMAIL'} onChange={() => setEscalation({ ...escalation, preferencia: 'EMAIL' })} /> Email</label></div></fieldset>
                {!insideHours ? <TextInput label="Franja preferida" placeholder="Ej.: mañana de 10:00 a 12:00" value={escalation.franja} error={escalationErrors.franja} onChange={(event) => setEscalation({ ...escalation, franja: event.target.value })} /> : null}
                <label className="flex gap-2 rounded-lg bg-orange-50 p-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={escalation.consentimiento} onChange={(event) => setEscalation({ ...escalation, consentimiento: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600" />Consiento que Internet Operadores trate estos datos para atender mi solicitud de contacto.</label><FieldError>{escalationErrors.consentimiento}</FieldError>
              </div>
              <div className="mt-5 flex gap-3"><button type="button" onClick={() => setView('chat')} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Cancelar</button><button type="submit" disabled={escalationSending} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50">{escalationSending ? 'Enviando…' : 'Solicitar contacto'}</button></div>
            </>}
          </form>
        ) : null}
        {config && restored && view === 'lead' ? (
          <form onSubmit={submitLead} className="min-h-0 flex-1 overflow-y-auto p-4" noValidate>
            {leadResult ? <div className="rounded-xl bg-green-50 p-3 text-sm leading-5 text-green-900" role="status">{leadResult}<button type="button" onClick={() => setView('chat')} className="mt-3 block min-h-9 font-semibold text-green-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Volver al asistente</button></div> : <>
              <p className="mb-4 text-sm leading-5 text-slate-700">Con estos datos prepararemos una recomendación inicial sin compromiso.</p>
              <div className="space-y-3"><fieldset><legend className="text-sm font-medium text-slate-800">¿Para quién es?</legend><div className="mt-1 flex gap-4"><label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="tipo" checked={lead.tipo === 'EMPRESA'} onChange={() => setLead({ ...lead, tipo: 'EMPRESA' })} /> Empresa</label><label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="tipo" checked={lead.tipo === 'HOGAR'} onChange={() => setLead({ ...lead, tipo: 'HOGAR' })} /> Hogar</label></div><FieldError>{leadErrors.tipo}</FieldError></fieldset>
                <TextInput label="Código postal" inputMode="numeric" autoComplete="postal-code" value={lead.codigoPostal} error={leadErrors.codigoPostal} onChange={(event) => setLead({ ...lead, codigoPostal: event.target.value })} />
                <TextInput label="Conexión actual" placeholder="Ej.: fibra de 300 Mb" value={lead.conexionActual} error={leadErrors.conexionActual} onChange={(event) => setLead({ ...lead, conexionActual: event.target.value })} />
                <fieldset><legend className="text-sm font-medium text-slate-800">¿Qué necesitas mejorar?</legend><div className="mt-1 grid grid-cols-2 gap-1">{PROBLEMS.map((problem) => <label key={problem} className="flex min-h-9 items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={lead.problemas.includes(problem)} onChange={() => toggleProblem(problem)} />{problem}</label>)}</div><FieldError>{leadErrors.problemas}</FieldError></fieldset>
                <TextInput label="Número de usuarios" type="number" min="1" max="100000" inputMode="numeric" value={lead.usuarios} error={leadErrors.usuarios} onChange={(event) => setLead({ ...lead, usuarios: event.target.value })} />
                <label className="block text-sm font-medium text-slate-800">Urgencia<select value={lead.urgencia} onChange={(event) => setLead({ ...lead, urgencia: event.target.value as LeadInput['urgencia'] })} aria-invalid={Boolean(leadErrors.urgencia)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"><option value="">Selecciona una opción</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option></select><FieldError>{leadErrors.urgencia}</FieldError></label>
                <TextInput label="Nombre" autoComplete="name" value={lead.nombre} error={leadErrors.nombre} onChange={(event) => setLead({ ...lead, nombre: event.target.value })} />
                <TextInput label="Email" type="email" autoComplete="email" value={lead.email} error={leadErrors.email || leadErrors.contacto} onChange={(event) => setLead({ ...lead, email: event.target.value })} />
                <TextInput label="Teléfono" type="tel" autoComplete="tel" value={lead.telefono} error={leadErrors.telefono} onChange={(event) => setLead({ ...lead, telefono: event.target.value })} />
                {lead.tipo === 'EMPRESA' ? <TextInput label="Empresa" autoComplete="organization" value={lead.empresa} error={leadErrors.empresa} onChange={(event) => setLead({ ...lead, empresa: event.target.value })} /> : null}
                <label className="flex gap-2 rounded-lg bg-orange-50 p-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={lead.consentimiento} onChange={(event) => setLead({ ...lead, consentimiento: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600" />Consiento que Internet Operadores trate estos datos para atender mi solicitud y elaborar una recomendación. Versión: {lead.consentimientoVersion || 'pendiente'}.</label><FieldError>{leadErrors.consentimiento || leadErrors.consentimientoVersion}</FieldError>
              </div>
              <div className="mt-5 flex gap-3"><button type="button" onClick={() => setView('chat')} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Cancelar</button><button type="submit" disabled={leadSending} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50">{leadSending ? 'Enviando…' : 'Enviar solicitud'}</button></div>
            </>}
          </form>
        ) : null}
      </div>
    </div>
  )
}
