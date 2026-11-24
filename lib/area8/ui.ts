import { useEffect, useRef } from 'react'

/** Contrato de lectura: el backend normaliza los estados históricos. */
export const ESTADOS_UI = [
  { v: 'nueva', l: 'Nueva', c: 'bg-orange-50 text-orange-900' },
  { v: 'en_analisis', l: 'En análisis', c: 'bg-amber-50 text-amber-900' },
  { v: 'aprobada', l: 'Aprobada', c: 'bg-blue-50 text-blue-900' },
  { v: 'en_desarrollo', l: 'En desarrollo', c: 'bg-indigo-50 text-indigo-900' },
  { v: 'en_pruebas', l: 'En pruebas', c: 'bg-violet-50 text-violet-900' },
  { v: 'hecha', l: 'Hecha', c: 'bg-green-50 text-green-900' },
  { v: 'descartada', l: 'Descartada', c: 'bg-gray-100 text-gray-700' },
] as const

export type EstadoUI = typeof ESTADOS_UI[number]['v']
export type UrgenciaUI = 'baja' | 'media' | 'alta' | 'critica'
export const ESTADOS_GESTION_UI = ESTADOS_UI.filter(item =>
  ['nueva', 'en_analisis', 'aprobada', 'en_desarrollo', 'descartada'].includes(item.v))
export const TIPOS_UI = [
  { v: 'error', l: 'Error / Incidencia', c: 'bg-red-50 text-red-900' },
  { v: 'mejora', l: 'Mejora', c: 'bg-blue-50 text-blue-900' },
  { v: 'sugerencia', l: 'Sugerencia', c: 'bg-green-50 text-green-900' },
] as const
export const NIVELES_UI = [
  { v: 'baja', l: 'Baja' }, { v: 'media', l: 'Media' },
  { v: 'alta', l: 'Alta' }, { v: 'critica', l: 'Crítica' },
] as const
export const SECCIONES_UI = [
  { v: 'panel_admin', l: 'Panel administrativo' },
  { v: 'web_publica', l: 'Web pública' },
  { v: 'portal_empleado', l: 'Portal empleado' },
] as const

export interface ResponsableUI { id: number; nombre: string }
export interface EventoUI {
  id: string
  estadoAnterior: EstadoUI | null
  estadoNuevo: EstadoUI
  mensaje: string
  createdAt: string
  leidoAt: string | null
}
export interface MensajeUI {
  id: number; autorEmail: string; autorNombre: string; autorTipo: string
  tipo: string; mensaje: string; createdAt: string
}
export interface PeticionUI {
  id: number; tipo: string; seccion: string; titulo: string; descripcion: string
  prioridad: string; estado: EstadoUI; captura: string | null; paginaUrl: string | null
  urgencia: UrgenciaUI; responsableId: number | null; responsable: ResponsableUI | null
  eventos: EventoUI[]; mensajes: MensajeUI[]; notasAdmin: string | null
  usuarioEmail: string; usuarioNombre: string; resueltaPor: string | null
  tramitadaAt?: string | null
  fechaResolucion: string | null; feedbackSatisfecho: boolean | null
  fechaFeedback: string | null; fechaCierre: string | null; createdAt: string; updatedAt: string
}
export interface FormularioUI {
  tipo: string; seccion: string; titulo: string; descripcion: string
  captura: string; paginaUrl: string; urgencia: UrgenciaUI
}
export const formularioVacio = (): FormularioUI => ({
  tipo: 'mejora', seccion: 'panel_admin', titulo: '', descripcion: '',
  captura: '', paginaUrl: '', urgencia: 'media',
})

export const INTEGRACION_PENDIENTE = 'La interfaz está preparada, pero la integración de peticiones está pendiente en este entorno. Esta consulta o cambio no se ha podido completar. Inténtalo de nuevo cuando esté disponible.'
export const BOTON_PRINCIPAL = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-[#FF5300] px-4 py-2.5 text-sm font-semibold text-[#2D2A26] hover:bg-[#e94c00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5300] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
export const BOTON_SECUNDARIO = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#2D2A26] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5300] disabled:cursor-not-allowed disabled:opacity-50'
export const CAMPO_UI = 'min-h-11 min-w-0 w-full max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#FF5300] disabled:bg-gray-100'
export const CAPTURA_MAX_BYTES = 5 * 1024 * 1024
export const CAPTURA_MIMES = ['image/png', 'image/jpeg', 'image/webp']

export const etiquetaEstado = (estado: string | null) => ESTADOS_UI.find(item => item.v === estado)?.l || 'Sin estado anterior'
export const etiquetaNivel = (nivel: string) => NIVELES_UI.find(item => item.v === nivel)?.l || 'Sin indicar'
export const etiquetaSeccion = (seccion: string) => SECCIONES_UI.find(item => item.v === seccion)?.l || seccion
export const estaCerrada = (estado: string) => ['hecha', 'descartada'].includes(estado)
export const puedeEntregar = (estado: string) => ['aprobada', 'en_desarrollo'].includes(estado)
export const tieneAjustes = (peticion: PeticionUI) => peticion.estado === 'en_desarrollo' && peticion.mensajes?.some(m => m.tipo === 'ajustes')
export const puedeRetirar = (peticion: PeticionUI) => peticion.estado === 'nueva' && !peticion.eventos?.length && !peticion.tramitadaAt && !peticion.responsableId && !peticion.notasAdmin && !peticion.mensajes?.some(message => message.autorTipo === 'admin')

/** No permitir esquemas ejecutables, URLs protocol-relative ni barras invertidas. */
export function paginaSegura(valor: string | null | undefined): string | null {
  const pagina = valor?.trim()
  if (!pagina || pagina.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(pagina) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(pagina)) return null
  if (/^https?:\/\//i.test(pagina)) {
    try {
      const url = new URL(pagina)
      return url.hostname && !url.username && !url.password ? pagina : null
    } catch { return null }
  }
  if (pagina.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(pagina)) return null
  // El contrato del servidor usa rutas locales que empiezan por /.
  return pagina.startsWith('/') ? pagina : null
}

/** Las capturas se muestran exclusivamente como imágenes raster en data URI. */
export function capturaSegura(valor: string | null | undefined): string | null {
  if (!valor || valor.length > Math.ceil(CAPTURA_MAX_BYTES / 3) * 4 + 64) return null
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor)
  if (!match || match[2].length % 4 !== 0) return null
  const base64 = match[2]
  const bytes = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
  if (bytes > CAPTURA_MAX_BYTES) return null
  try {
    // Solo decodificar cabecera y último bloque, no toda la captura en cada render.
    const header = atob(base64.slice(0, 16))
    if (btoa(atob(base64.slice(-4))) !== base64.slice(-4)) return null
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header.charCodeAt(index) === byte)
    const jpeg = bytes >= 4 && header.charCodeAt(0) === 255 && header.charCodeAt(1) === 216 && header.charCodeAt(2) === 255
    const webp = bytes >= 12 && header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP'
    return match[1] === 'png' && png || match[1] === 'jpeg' && jpeg || match[1] === 'webp' && webp ? valor : null
  } catch { return null }
}
export function validarFormulario(form: FormularioUI): string | null {
  if (!form.titulo.trim() || !form.descripcion.trim()) return 'El título y la descripción son obligatorios.'
  if (form.titulo.length > 200) return 'El título no puede superar 200 caracteres.'
  if (form.descripcion.length > 10000) return 'La descripción no puede superar 10.000 caracteres.'
  if (form.paginaUrl.trim() && !paginaSegura(form.paginaUrl)) return 'Indica una URL http(s) o una ruta que empiece por /, de hasta 2.048 caracteres.'
  if (!NIVELES_UI.some(item => item.v === form.urgencia)) return 'Selecciona una urgencia válida.'
  if (form.captura && !capturaSegura(form.captura)) return 'Adjunta solo PNG, JPEG o WebP de hasta 5 MiB.'
  return null
}

export async function leerRespuesta<T>(response: Response, mensaje: string): Promise<T> {
  // Un despliegue sin el esquema integrado puede devolver 503 sin cuerpo JSON.
  if (response.status === 503) throw new Error(INTEGRACION_PENDIENTE)
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.success === false) throw new Error(data?.error || mensaje)
  return data as T
}
export const mensajeError = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
export const fechaUI = (fecha: string | null | undefined, hora = false) => {
  if (!fecha) return 'Fecha no disponible'
  const date = new Date(fecha)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : hora ? date.toLocaleString('es-ES') : date.toLocaleDateString('es-ES')
}

/** Foco acotado al diálogo, Escape y devolución del foco al botón de origen. */
export function useDialogoUI(abierto: boolean, cerrar: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef(cerrar)
  useEffect(() => { cerrarRef.current = cerrar }, [cerrar])
  useEffect(() => {
    if (!abierto || !ref.current) return
    const anterior = document.activeElement as HTMLElement | null
    const dialogo = ref.current
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const elementos = () => Array.from(dialogo.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'))
    ;(elementos()[0] || dialogo).focus()
    const teclado = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cerrarRef.current(); return }
      if (event.key !== 'Tab') return
      const items = elementos()
      const primero = items[0], ultimo = items[items.length - 1]
      if (!primero) { event.preventDefault(); dialogo.focus(); return }
      if (event.shiftKey && (document.activeElement === primero || document.activeElement === dialogo)) { event.preventDefault(); ultimo.focus() }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus() }
    }
    dialogo.addEventListener('keydown', teclado)
    return () => {
      dialogo.removeEventListener('keydown', teclado)
      document.body.style.overflow = overflowAnterior
      if (anterior?.isConnected) anterior.focus()
    }
  }, [abierto])
  return ref
}
