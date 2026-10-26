export function normalizar(valor: string): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^\p{L}\p{N}€@%./:+#-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Prepara una consulta ya anonimizada para FTS sin añadir vocabulario de
 * negocio. Si la persona escribe una declaración seguida de una pregunta
 * explícita (caso habitual tras un marcador PII), la última pregunta es la
 * parte informativa. Los marcadores nunca participan en la recuperación.
 */
export function consultaParaRecuperacion(valor: string): string {
  const sinMarcadores = String(valor ?? '').replace(/\[[A-Z_]+\]/g, ' ').replace(/\s+/g, ' ').trim()
  const inicioPregunta = sinMarcadores.lastIndexOf('¿')
  // «Si se cae mi fibra, ¿cómo entra el respaldo?» conserva el antecedente.
  // Sólo una declaración anonimizada anterior permite acotar a la pregunta.
  const prefijoOriginal = String(valor ?? '').split('¿').slice(0, -1).join('¿')
  return inicioPregunta >= 0 && /\[[A-Z_]+\]/.test(prefijoOriginal)
    ? sinMarcadores.slice(inicioPregunta).trim() : sinMarcadores
}

export function textoPlano(valor: string): string {
  return String(valor ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function recortarTexto(valor: string, maximo: number): string {
  const limpio = String(valor ?? '').trim()
  return limpio.length <= maximo ? limpio : limpio.slice(0, Math.max(0, maximo)).trimEnd()
}

export function trocear(texto: string, opciones: { max?: number; solape?: number } = {}): string[] {
  const max = Math.max(200, Math.min(opciones.max ?? 900, 4000))
  const solape = Math.max(0, Math.min(opciones.solape ?? 140, Math.floor(max / 3)))
  const limpio = textoPlano(texto)
  if (!limpio) return []
  if (limpio.length <= max) return [limpio]

  const partes: string[] = []
  let inicio = 0
  while (inicio < limpio.length) {
    let fin = Math.min(limpio.length, inicio + max)
    if (fin < limpio.length) {
      const ventana = limpio.slice(inicio, fin)
      const corte = Math.max(ventana.lastIndexOf('. '), ventana.lastIndexOf('; '), ventana.lastIndexOf(', '), ventana.lastIndexOf(' '))
      if (corte >= Math.floor(max * 0.55)) fin = inicio + corte + 1
    }
    const fragmento = limpio.slice(inicio, fin).trim()
    if (fragmento) partes.push(fragmento)
    if (fin >= limpio.length) break
    inicio = Math.max(inicio + 1, fin - solape)
  }
  return partes
}

export function sha256Hex(texto: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto')
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex')
}
