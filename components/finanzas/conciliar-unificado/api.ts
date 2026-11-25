import {
  parseConciliarActionResponse, parseConciliarReadResponse, parseConciliarUndoResponse,
  safeOutcomeMessage, type ConciliarReadResponse,
} from '@/components/finanzas/conciliar/conciliar-contract'
import { parseEasyReadResponse, type EasyMovement } from '@/components/finanzas/easy/easy-contract'
import type { ParaPedirRead } from '@/lib/finanzas/para-pedir-contract'
import type { LecturaBandeja } from '@/lib/finanzas/conciliar-unificado'

export const API_CONCILIAR = '/api/admin/finanzas/conciliar'
export const API_FACIL = '/api/admin/finanzas/modo-facil'
export const CUTOFF = '2026-01-01'

/** Un error cuyo resultado no se conoce (red, 5xx o respuesta ilegible): se reintenta con la MISMA clave. */
export class ResultadoIncierto extends Error {}
export class ErrorServidor extends Error {
  constructor(message: string, readonly status: number, readonly codigo: string | null) { super(message) }
}

export function mensajeError(raw: unknown, fallback: string): string {
  const texto = raw && typeof raw === 'object' && typeof (raw as { error?: unknown }).error === 'string' ? (raw as { error: string }).error : ''
  return safeOutcomeMessage(texto, fallback)
}
function codigoDe(raw: unknown): string | null {
  return raw && typeof raw === 'object' && typeof (raw as { codigo?: unknown }).codigo === 'string' ? (raw as { codigo: string }).codigo : null
}

export function cabecerasActuacion(sesion: string | null | undefined): Record<string, string> {
  return sesion ? { 'x-io-acting-session': sesion } : {}
}

/** POST JSON que nunca confunde «no sé qué pasó» con «falló»: 5xx y red -> ResultadoIncierto. */
export async function postJson(url: string, body: unknown, sesion: string | null | undefined): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabecerasActuacion(sesion) }, body: JSON.stringify(body) })
  } catch { throw new ResultadoIncierto('No hemos podido comprobar el resultado.') }
  const raw: unknown = await response.json().catch(() => null)
  if (response.status >= 500) throw new ResultadoIncierto(mensajeError(raw, 'No hemos podido comprobar el resultado.'))
  if (!response.ok) throw new ErrorServidor(mensajeError(raw, 'No se pudo completar la acción.'), response.status, codigoDe(raw))
  return raw
}

export async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store', signal })
  const raw: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ErrorServidor(mensajeError(raw, 'No se pudo leer.'), response.status, codigoDe(raw))
  return raw
}

export type FiltrosLectura = Readonly<{ q: string; cuentaId: string; limit: number; offset: number }>
export function queryLectura(l: Pick<LecturaBandeja, 'tab'> & Partial<LecturaBandeja> | { tab: string; grupo?: string; estado?: string }, f: FiltrosLectura): string {
  const p = new URLSearchParams({ tab: l.tab, limit: String(f.limit), offset: String(f.offset), cutoffDate: CUTOFF, orden: 'FECHA', direccion: 'DESC' })
  if (f.q.trim()) p.set('q', f.q.trim().slice(0, 120))
  if (f.cuentaId) p.set('cuentaId', f.cuentaId)
  if ('grupo' in l && l.grupo) p.set('grupo', l.grupo)
  if ('estado' in l && l.estado) p.set('estado', l.estado)
  return p.toString()
}
export async function leerProyeccion(l: { tab: string; grupo?: string; estado?: string }, f: FiltrosLectura, signal?: AbortSignal): Promise<ConciliarReadResponse> {
  return parseConciliarReadResponse(await getJson(`${API_CONCILIAR}?${queryLectura(l, f)}`, signal))
}

export const resultadoConfirmacion = parseConciliarActionResponse
export const resultadoDeshacer = parseConciliarUndoResponse

/** Cola de Modo fácil de un día: de ahí salen las sugerencias exactas, la versión y el motivo «no requiere» propuesto. */
export async function leerModoFacilDia(dia: string, signal?: AbortSignal): Promise<readonly EasyMovement[]> {
  const p = new URLSearchParams({ desde: dia, hasta: dia, limit: '100', offset: '0' })
  return parseEasyReadResponse(await getJson(`${API_FACIL}?${p}`, signal)).movimientos
}

export async function leerParaPedir(params: { estado: string; q: string; tercero: string | null; limit: number; offset: number }, signal?: AbortSignal): Promise<ParaPedirRead> {
  const p = new URLSearchParams({ estado: params.estado, limit: String(params.limit), offset: String(params.offset) })
  if (params.q.trim()) p.set('q', params.q.trim().slice(0, 120))
  if (params.tercero) p.set('tercero', params.tercero)
  return await getJson(`${API_FACIL}/para-pedir?${p}`, signal) as ParaPedirRead
}
