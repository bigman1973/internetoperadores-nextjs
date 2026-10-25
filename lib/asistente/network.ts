import net from 'node:net'
import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'

function ipv4Privada(host: string): boolean {
  const partes = host.split('.').map(Number)
  return partes.length === 4 && partes.every(parte => Number.isInteger(parte) && parte >= 0 && parte <= 255) && (
    partes[0] === 10 || partes[0] === 127 || (partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) || (partes[0] === 192 && partes[1] === 168)
  )
}

export function direccionInternaSegura(host: string): boolean {
  const limpio = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (net.isIP(limpio) === 4) return ipv4Privada(limpio)
  if (limpio.startsWith('::ffff:')) return ipv4Privada(limpio.slice(7))
  return net.isIP(limpio) === 6 && (limpio === '::1' || limpio.startsWith('fc') || limpio.startsWith('fd'))
}

export function urlInternaSegura(valor: string | undefined): URL | null {
  if (!valor) return null
  try {
    const url = new URL(valor)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const adicionales = (process.env.ASSISTANT_INTERNAL_HOST_ALLOWLIST || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
    const esInterno = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || adicionales.includes(host) || direccionInternaSegura(host)
    return esInterno ? url : null
  } catch { return null }
}

/** Transporte sin proxy, sin redirecciones y con DNS privado fijado contra rebinding. */
export async function fetchInterno(url: URL, init: RequestInit, timeoutMs = 4000): Promise<Response> {
  if (!urlInternaSegura(url.toString())) throw new Error('ASSISTANT_NETWORK_NOT_INTERNAL')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const direcciones = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true })
  if (!direcciones.length || direcciones.some(d => !direccionInternaSegura(d.address))) throw new Error('ASSISTANT_DNS_NOT_PRIVATE')
  const fijada = direcciones[0]
  if (init.body !== undefined && init.body !== null && typeof init.body !== 'string') throw new Error('ASSISTANT_BODY_NOT_TEXT')
  const cuerpo = typeof init.body === 'string' ? Buffer.from(init.body) : undefined
  const headers = new Headers(init.headers)
  if (cuerpo) headers.set('content-length', String(cuerpo.length))
  return new Promise<Response>((resolve, reject) => {
    const solicitar = url.protocol === 'https:' ? https.request : http.request
    const peticion = solicitar(url, {
      method: init.method || 'GET', headers: Object.fromEntries(headers), agent: false,
      lookup: ((_host: string, options: any, callback: any) => options?.all
        ? callback(null, [fijada]) : callback(null, fijada.address, fijada.family)) as any,
    }, respuesta => {
      const estado = respuesta.statusCode || 502
      if (estado >= 300 && estado < 400) { respuesta.resume(); peticion.destroy(new Error('ASSISTANT_REDIRECT_FORBIDDEN')); return }
      const partes: Buffer[] = []; let bytes = 0
      respuesta.on('data', (parte: Buffer) => {
        bytes += parte.length
        if (bytes > 1_048_576) { peticion.destroy(new Error('ASSISTANT_RESPONSE_TOO_LARGE')); return }
        partes.push(parte)
      })
      respuesta.on('error', reject)
      respuesta.on('end', () => {
        const salida = new Headers()
        for (const [nombre, valor] of Object.entries(respuesta.headers)) if (valor !== undefined) salida.set(nombre, Array.isArray(valor) ? valor.join(', ') : valor)
        try { resolve(new Response([204, 205, 304].includes(estado) ? null : Buffer.concat(partes), { status: estado, headers: salida })) } catch (error) { reject(error) }
      })
    })
    const temporizador = setTimeout(() => peticion.destroy(new Error('ASSISTANT_NETWORK_TIMEOUT')), timeoutMs)
    peticion.on('error', reject)
    peticion.on('close', () => clearTimeout(temporizador))
    if (cuerpo) peticion.write(cuerpo)
    peticion.end()
  })
}
