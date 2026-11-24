import type { NextRequest } from 'next/server'
export class Area8InputError extends Error { constructor(message: string, public status = 400) { super(message); this.name = 'Area8InputError' } }
export const URGENCIAS = ['baja', 'media', 'alta', 'critica'] as const
export const MAX_CAPTURA = 5 * 1024 * 1024
const MAX_BODY = 7 * 1024 * 1024 + 65536
export function checkWriteOrigin(req: NextRequest): void {
  if (req.headers.get('origin') !== req.nextUrl.origin) throw new Area8InputError('La solicitud debe realizarse desde esta aplicación.', 403)
}
export function positiveId(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) throw new Area8InputError('Identificador no válido.')
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Area8InputError('Identificador no válido.')
  return id
}
export function text(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string') throw new Area8InputError(`${label} no válido.`)
  const result = value.trim()
  if (required && !result) throw new Area8InputError(`${label} es obligatorio.`)
  if (result.length > max) throw new Area8InputError(`${label} no puede superar ${max.toLocaleString('es-ES')} caracteres.`)
  return result
}
export function urgency(value: unknown): string {
  if (typeof value !== 'string' || !URGENCIAS.includes(value as typeof URGENCIAS[number])) throw new Area8InputError('Urgencia no válida.')
  return value
}
export function pageUrl(value: unknown): string | null {
  if (value === null || value === '' || value === undefined) return null
  const url = text(value, 'Página', 2048)
  if (/[\x00-\x20\x7f\\]/.test(url) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url)) throw new Area8InputError('La página no es una dirección válida.')
  if (url.startsWith('/') && !url.startsWith('//')) return url
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Area8InputError('Indica la dirección de la página o una ruta que empiece por /.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Area8InputError('Solo se admiten páginas http o https sin credenciales.')
  return parsed.toString()
}
export function screenshot(value: unknown): string | null {
  if (value === null || value === '' || value === undefined) return null
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_CAPTURA / 3) * 4 + 64) throw new Area8InputError('La captura no puede superar 5 MB.')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0) throw new Area8InputError('Adjunta una imagen PNG, JPG o WebP válida.')
  const data = Buffer.from(match[2], 'base64')
  if (data.length > MAX_CAPTURA || data.toString('base64') !== match[2]) throw new Area8InputError('La captura no es válida o supera 5 MB.')
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255
  const webp = data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  if (!(match[1] === 'png' && png || match[1] === 'jpeg' && jpeg || match[1] === 'webp' && webp)) throw new Area8InputError('El contenido de la captura no coincide con su formato.')
  return value
}
/** Limitación también para peticiones sin Content-Length; nunca acepta un cuerpo ilimitado. */
export async function readBody(req: NextRequest): Promise<Record<string, any>> {
  checkWriteOrigin(req)
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Area8InputError('Envía los datos en formato JSON.', 415)
  const declared = Number(req.headers.get('content-length') || '0')
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BODY) throw new Area8InputError('La petición es demasiado grande.')
  const reader = req.body?.getReader()
  if (!reader) throw new Area8InputError('Faltan los datos de la petición.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY) { await reader.cancel(); throw new Area8InputError('La petición es demasiado grande.') }
      chunks.push(part.value)
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Area8InputError('Datos de petición no válidos.')
    return data
  } catch (error) {
    if (error instanceof Area8InputError) throw error
    throw new Area8InputError('Datos de petición no válidos.')
  } finally { reader.releaseLock() }
}
