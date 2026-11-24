export class Area9Error extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'Area9Error' }
}

export function pagination(params: URLSearchParams) {
  const integer = (name: string, fallback: number, max: number) => {
    const raw = params.get(name)
    if (raw === null) return fallback
    if (!/^[1-9]\d*$/.test(raw)) throw new Area9Error(400, `${name} debe ser un entero positivo`)
    const n = Number(raw)
    if (!Number.isSafeInteger(n) || n > max) throw new Area9Error(400, `${name} fuera de rango`)
    return n
  }
  const page = integer('page', 1, 1_000_000)
  const limit = integer('limit', 50, 100)
  return { page, limit, skip: (page - 1) * limit }
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Area9Error(400, 'Cuerpo JSON inválido')
  return value as Record<string, unknown>
}

export function plainText(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(value)) {
    throw new Area9Error(400, `${field} debe ser texto sin HTML, dentro del límite permitido`)
  }
  const result = value.trim()
  if (!allowEmpty && !result) throw new Area9Error(400, `${field} es obligatorio`)
  return result
}

export function positiveId(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^[1-9]\d*$/.test(String(value))) {
    throw new Area9Error(400, 'Identificador inválido')
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) throw new Area9Error(400, 'Identificador inválido')
  return id
}

export function publicationId(value: unknown): string {
  if (typeof value !== 'string' || !/^c[a-z0-9]{24,31}$/.test(value)) throw new Area9Error(400, 'Identificador de publicación inválido')
  return value
}

const TYPES = ['publica', 'privada', 'ambas'] as const
const STATES = ['completado', 'en_progreso', 'planificado'] as const
export type ManualData = { titulo?: string; descripcion?: string; tipo?: string; estado?: string; fecha?: Date }

export function manualData(value: unknown, partial = false): ManualData {
  const body = objectBody(value)
  const allowed = new Set(['accion', 'titulo', 'descripcion', 'tipo', 'estado', 'autor', 'fecha'])
  if (body.accion !== undefined && body.accion !== 'crear_desarrollo') throw new Area9Error(400, 'Acción no permitida en un desarrollo manual')
  if (Object.keys(body).some(key => !allowed.has(key))) throw new Area9Error(400, 'Campos no permitidos en un desarrollo manual')
  const data: ManualData = {}
  if (!partial || body.titulo !== undefined) data.titulo = plainText(body.titulo, 'Título', 200)
  if (!partial || body.descripcion !== undefined) data.descripcion = plainText(body.descripcion ?? '', 'Descripción', 20_000, true)
  if (!partial || body.tipo !== undefined) {
    const tipo = body.tipo ?? 'publica'
    if (!TYPES.includes(tipo as typeof TYPES[number])) throw new Area9Error(400, 'Tipo inválido')
    data.tipo = tipo as string
  }
  if (!partial || body.estado !== undefined) {
    const estado = body.estado ?? 'completado'
    if (!STATES.includes(estado as typeof STATES[number])) throw new Area9Error(400, 'Estado inválido')
    data.estado = estado as string
  }
  if (body.autor !== undefined) plainText(body.autor, 'Autor', 100, true) // Compatibilidad: nunca suplanta la identidad autenticada.
  if (body.fecha !== undefined) {
    if (typeof body.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(body.fecha)) throw new Area9Error(400, 'Fecha inválida')
    const date = new Date(body.fecha)
    if (!Number.isFinite(date.getTime())) throw new Area9Error(400, 'Fecha inválida')
    data.fecha = date
  }
  if (partial && !Object.keys(data).length) throw new Area9Error(400, 'No hay cambios manuales')
  return data
}

export type Development = { id: number; titulo: string; descripcion: string; tipo: string; estado: string; autor: string | null; commitHash: string | null; rama: string | null; fecha: Date }
export function automaticDevelopment(row: Pick<Development, 'commitHash' | 'rama' | 'autor'>): boolean {
  return row.commitHash !== null || row.rama !== null || /\(auto\)|autom[aá]tico/i.test(row.autor ?? '')
}
export function serializeDevelopment(row: Development) {
  return { id: row.id, titulo: row.titulo, descripcion: row.descripcion, tipo: row.tipo, estado: row.estado,
    autor: row.autor, fecha: row.fecha, commit_hash: row.commitHash, rama: row.rama, automatico: automaticDevelopment(row) }
}

export function confirmedClosedRequest(row: { estado: string; feedbackSatisfecho: boolean | null; fechaCierre: Date | null }): boolean {
  return (row.estado === 'hecha' || row.estado === 'resuelta') && row.feedbackSatisfecho === true
    && row.fechaCierre instanceof Date && Number.isFinite(row.fechaCierre.getTime())
}

export function linkInput(value: unknown) {
  const body = objectBody(value)
  if (Object.keys(body).some(key => !['accion', 'publicacionId', 'peticionId', 'confirmo'].includes(key))) throw new Area9Error(400, 'Campos no permitidos en el vínculo')
  if (body.accion !== 'vincular_peticion' || body.confirmo !== true) throw new Area9Error(400, 'Se requiere confirmación humana explícita: confirmo:true')
  return { publicacionId: publicationId(body.publicacionId), peticionId: positiveId(body.peticionId) }
}

export function publicSafeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1000 || /[\s\\\u0000-\u001f]/.test(value)) throw new Area9Error(400, 'URL de publicación inválida')
  let url: URL
  try { url = new URL(value) } catch { throw new Area9Error(400, 'URL de publicación inválida') }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !host.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    || /^[0-9.]+$/.test(host) || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.includes(':')) throw new Area9Error(400, 'URL de publicación no segura')
  return url.toString()
}
