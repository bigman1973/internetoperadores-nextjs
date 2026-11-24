/**
 * Lista blanca de listas de Brevo de Internet Operadores.
 * La cuenta de Brevo es compartida con otras empresas del grupo (LFDeal, Farms Planet…):
 * el panel de IO solo puede leer o escribir en estas listas, en cualquier entorno.
 *
 * Por defecto: 22-24 y 30-40 (newsletters 30/31/32, DOI/diario 33-39, pruebas internas 40).
 * Las listas 8-18 quedan FUERA hasta que Víctor las revise; se añaden con BREVO_LISTAS_IO_EXTRA="8,10".
 */
type Env = Record<string, string | undefined>
export const BREVO_LISTAS_IO_POR_DEFECTO: readonly number[] = [22, 23, 24, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]

export function brevoListasIO(env: Env = process.env): Set<number> {
  const extra = (env.BREVO_LISTAS_IO_EXTRA || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
  return new Set([...BREVO_LISTAS_IO_POR_DEFECTO, ...extra])
}

/** IDs de lista que toca una llamada: ruta /contacts/lists/{id}… y campos del cuerpo (listIds, unlinkListIds, recipients…). */
export function listasDeLlamada(ruta: string, body: unknown): number[] {
  const ids: number[] = []
  const m = ruta.match(/\/contacts\/lists\/(\d+)/)
  if (m) ids.push(Number(m[1]))
  let datos: any = null
  if (typeof body === 'string') { try { datos = JSON.parse(body) } catch { datos = null } }
  const tomar = (v: unknown) => { if (Array.isArray(v)) for (const x of v) { const n = Number(x); if (Number.isInteger(n)) ids.push(n) } }
  if (datos && typeof datos === 'object') {
    tomar(datos.listIds); tomar(datos.unlinkListIds); tomar(datos.listId != null ? [datos.listId] : null)
    tomar(datos.recipients?.listIds); tomar(datos.recipients?.exclusionListIds)
  }
  return ids
}

export function listasFueraDeIO(ruta: string, body: unknown, env: Env = process.env): number[] {
  const permitidas = brevoListasIO(env)
  return [...new Set(listasDeLlamada(ruta, body))].filter((id) => !permitidas.has(id))
}
