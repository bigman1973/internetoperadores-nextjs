import net from 'node:net'

function ipv4Privada(host: string): boolean {
  const partes = host.split('.').map(Number)
  return partes.length === 4 && partes.every(parte => Number.isInteger(parte) && parte >= 0 && parte <= 255) && (
    partes[0] === 10 || partes[0] === 127 || (partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) || (partes[0] === 192 && partes[1] === 168)
  )
}

export function urlInternaSegura(valor: string | undefined): URL | null {
  if (!valor) return null
  try {
    const url = new URL(valor)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    const adicionales = (process.env.ASSISTANT_INTERNAL_HOST_ALLOWLIST || '').split(',').map(hostPermitido => hostPermitido.trim().toLowerCase()).filter(Boolean)
    const esInterno = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.railway.internal') || adicionales.includes(host) || (net.isIP(host) === 4 && ipv4Privada(host)) || (net.isIP(host) === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd')))
    return esInterno ? url : null
  } catch { return null }
}

export async function fetchInterno(url: URL, init: RequestInit, timeoutMs = 4000): Promise<Response> {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), timeoutMs)
  try { return await fetch(url, { ...init, signal: control.signal }) } finally { clearTimeout(temporizador) }
}
