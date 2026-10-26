import { NextResponse } from 'next/server'

export const CABECERAS_PRIVADAS = { 'cache-control': 'private, no-store' }

export function jsonPrivado(cuerpo: unknown, estado = 200): NextResponse {
  return NextResponse.json(cuerpo, { status: estado, headers: CABECERAS_PRIVADAS })
}

export function esMismoOrigen(req: Request): boolean {
  const origen = req.headers.get('origin')
  const sitio = req.headers.get('sec-fetch-site')
  let esperado = ''
  try { esperado = new URL(req.url).origin } catch { return false }
  return origen === esperado && (sitio === null || sitio.toLowerCase() === 'same-origin')
}

export async function leerJsonLimitado(req: Request, maxBytes = 8192): Promise<{ ok: true; datos: unknown } | { ok: false }> {
  const longitud = Number(req.headers.get('content-length'))
  if (Number.isFinite(longitud) && longitud > maxBytes) return { ok: false }
  try {
    const lector = req.body?.getReader()
    if (!lector) return { ok: false }
    const partes: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await lector.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await lector.cancel(); return { ok: false } }
      partes.push(value)
    }
    const bytes = new Uint8Array(total)
    let desplazamiento = 0
    for (const parte of partes) { bytes.set(parte, desplazamiento); desplazamiento += parte.byteLength }
    return { ok: true, datos: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch { return { ok: false } }
}

export function uuidValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}

export function ipSolicitud(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const real = req.headers.get('x-real-ip')?.trim()
  return reenviada || real || '0.0.0.0'
}
