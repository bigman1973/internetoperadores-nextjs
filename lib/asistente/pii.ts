import { fetchInterno, urlInternaSegura } from '@/lib/asistente/network'

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const IBAN_ES = /\bES\s?\d{2}(?:\s?\d{4}){4}\s?\d{4}\b/gi
const DNI_NIE = /\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi
const TELEFONO = /(?<!\d)(?:(?:\+|00)34[ .-]?)?(?:[6789]\d{2}[ .-]?\d{3}[ .-]?\d{3})(?!\d)/g
const TARJETA_CANDIDATA = /(?<!\d)(?:\d[ -]?){13,19}\d(?!\d)/g
const URL_SENSIBLE = /\bhttps?:\/\/[^\s<>]+/gi
const CODIGO_POSTAL = /\b(?:0[1-9]|[1-4]\d|5[0-2])\d{3}\b/g

function soloDigitos(valor: string): string { return valor.replace(/\D/g, '') }
function luhn(valor: string): boolean {
  const numeros = soloDigitos(valor)
  if (numeros.length < 13 || numeros.length > 19) return false
  if (/^(\d)\1+$/.test(numeros)) return false
  let suma = 0
  for (let indice = numeros.length - 1, par = false; indice >= 0; indice -= 1, par = !par) {
    let digito = Number(numeros[indice])
    if (par) digito = digito * 2 > 9 ? digito * 2 - 9 : digito * 2
    suma += digito
  }
  return suma % 10 === 0
}

function reemplazarUrl(match: string): string {
  try {
    const url = new URL(match)
    const sensible = [...url.searchParams.keys()].some(clave => /token|secret|key|api[_-]?key|auth|password|pass|signature|sig|session/i.test(clave))
      || /\/(?:token|reset|activate|magic|session)\//i.test(url.pathname)
    return sensible ? '[URL_SENSIBLE]' : match
  } catch { return match }
}

/** Redacción local, deliberadamente determinista. El microservicio es sólo una mejora opcional. */
export function redactarPIILocal(texto: string, incluirCodigoPostal = false): string {
  let salida = String(texto ?? '')
  salida = salida.replace(URL_SENSIBLE, reemplazarUrl)
  salida = salida.replace(EMAIL, '[EMAIL]')
  salida = salida.replace(IBAN_ES, '[IBAN]')
  salida = salida.replace(DNI_NIE, '[DNI]')
  salida = salida.replace(TELEFONO, '[TELEFONO]')
  salida = salida.replace(TARJETA_CANDIDATA, coincidencia => luhn(coincidencia) ? '[TARJETA]' : coincidencia)
  if (incluirCodigoPostal) salida = salida.replace(CODIGO_POSTAL, '[CP]')
  return salida
}

export async function redactarPII(texto: string, opciones: { incluirCodigoPostal?: boolean } = {}): Promise<string> {
  const base = redactarPIILocal(texto, opciones.incluirCodigoPostal)
  const servicio = urlInternaSegura(process.env.ASSISTANT_EMBEDDINGS_URL)
  if (!servicio || texto.length > 20000) return base
  try {
    const url = new URL('/v1/redact', servicio)
    const respuesta = await fetchInterno(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.ASSISTANT_EMBEDDINGS_API_KEY ? { authorization: `Bearer ${process.env.ASSISTANT_EMBEDDINGS_API_KEY}` } : {}) }, body: JSON.stringify({ text: texto, language: 'es' }) })
    if (!respuesta.ok) return base
    const datos = await respuesta.json() as { text?: unknown }
    return typeof datos.text === 'string' && datos.text.length <= 25000 ? redactarPIILocal(datos.text, opciones.incluirCodigoPostal) : base
  } catch { return base }
}

export { luhn }
