import type { Prisma } from '@prisma/client'
import { appendArea4Audit, type Area4AuditOperation } from '@/lib/area4/audit'

/**
 * Recibo de auditoría (Área 4, append-only) de las importaciones del CRM.
 * Solo agregados: sin nombres, emails, CIF, nombre de fichero, mensajes crudos ni payloads.
 */
export type ResultadoRecibo = 'EXITO' | 'DUPLICADO' | 'ERROR' | 'PARCIAL'
export type ConteoRecibo = { creados: number; actualizados: number; omitidos: number; errores: number }
export type DespuesRecibo = {
  resultado: ResultadoRecibo
  hash?: string
  journalId?: string
  conteos: Record<string, ConteoRecibo>
  duracionMs: number
  erroresCodigos?: Record<string, string>
}
export const ORIGEN_RECIBO_ISP = 'crm.isp.aplicar'
export const ORIGEN_RECIBO_HUBSPOT = 'crm.hubspot.historial'
/** Confirmación en bloque de vínculos ISP→empresa. Usa la operación CRM_IMPORTACION_ISP (no se añade otra al tipo común del Área 4). */
export const ORIGEN_RECIBO_VINCULOS_BLOQUE = 'crm.isp.vinculos.bloque'
export const OPERACION_ISP: Area4AuditOperation = 'CRM_IMPORTACION_ISP'
export const OPERACION_HUBSPOT: Area4AuditOperation = 'CRM_IMPORTACION_HUBSPOT'

export class ErrorAuditoriaImportacion extends Error {
  constructor() { super('AUDITORIA_NO_REGISTRADA') }
}
/** La importación falló y además no se pudo guardar el recibo de ERROR: no se silencia. */
export class ErrorImportacionNoAuditada extends Error {
  constructor(public causa: unknown) { super('IMPORTACION_FALLIDA_SIN_AUDITORIA') }
}

const cero = (): ConteoRecibo => ({ creados: 0, actualizados: 0, omitidos: 0, errores: 0 })
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0)

/** Código seguro a partir de un error: solo códigos Prisma (Pxxxx) o un literal fijo, nunca el mensaje. */
export function codigoError(e: unknown, defecto = 'ERROR_INTERNO'): string {
  const c = (e as { code?: unknown } | null)?.code
  return typeof c === 'string' && /^P\d{4}$/.test(c) ? c : defecto
}

type Clase = 'NUEVO' | 'ACTUALIZADO' | 'SIN_CAMBIOS'
function conteoClases(filas: ReadonlyArray<{ clase: Clase }>): ConteoRecibo {
  const c = cero()
  for (const f of filas) {
    if (f.clase === 'NUEVO') c.creados++
    else if (f.clase === 'ACTUALIZADO') c.actualizados++
    else c.omitidos++
  }
  return c
}

/** ISP: conteos de lo realmente aplicado dentro de la transacción (no previsión). */
export function reciboIspExito(plan: {
  hash: string
  clientes: ReadonlyArray<{ clase: Clase }>
  contratos: ReadonlyArray<{ clase: Clase }>
  facturacion: ReadonlyArray<{ clase: Clase }>
  ausentes: { clientes: readonly unknown[]; contratos: readonly unknown[] }
}, aplicado: { importacionId: string; propuestasNuevas: number; propuestasObsoletas: number; propuestasReactivadas?: number; propuestasActualizadas?: number; vinculosDirectos?: number }, duracionMs: number): DespuesRecibo {
  const conteos = {
    clientes: conteoClases(plan.clientes),
    contratos: conteoClases(plan.contratos),
    facturacion: conteoClases(plan.facturacion),
    propuestas: { creados: n(aplicado.propuestasNuevas), actualizados: n(aplicado.propuestasObsoletas) + n(aplicado.propuestasReactivadas) + n(aplicado.propuestasActualizadas), omitidos: 0, errores: 0 },
    vinculosDirectos: { creados: 0, actualizados: n(aplicado.vinculosDirectos), omitidos: 0, errores: 0 },
  }
  const cambios = ['clientes', 'contratos', 'facturacion', 'propuestas', 'vinculosDirectos'].reduce((s, k) => s + (conteos as any)[k].creados + (conteos as any)[k].actualizados, 0)
  const ausentes = plan.ausentes.clientes.length + plan.ausentes.contratos.length
  // DUPLICADO solo si se verifica que el negocio no ha cambiado en nada.
  const duplicado = cambios === 0 && ausentes === 0
  return { resultado: duplicado ? 'DUPLICADO' : 'EXITO', hash: plan.hash, journalId: aplicado.importacionId, conteos, duracionMs: n(duracionMs) }
}

/** ISP tras rollback: nada comprometido, no se afirma éxito. */
export function reciboIspError(hash: string | undefined, e: unknown, duracionMs: number): DespuesRecibo {
  return {
    resultado: 'ERROR', ...(hash ? { hash } : {}),
    conteos: { clientes: cero(), contratos: cero(), facturacion: cero(), propuestas: cero(), vinculosDirectos: cero() },
    duracionMs: n(duracionMs), erroresCodigos: { aplicar: codigoError(e, 'APLICACION_FALLIDA') },
  }
}

/** HubSpot: un recibo por ejecución con lo comprometido de verdad por los lotes. */
export function reciboHubspot(input: {
  journalId: string
  importados: { actividades: number; tareas: number; relacionesContacto: number }
  consentimientosGuardados: number
  erroresLectura: Record<string, unknown>
  fallo?: unknown
  duracionMs: number
  cierreFallido?: boolean
}): DespuesRecibo {
  const comprometido = n(input.importados.actividades) + n(input.importados.tareas) + n(input.importados.relacionesContacto) + n(input.consentimientosGuardados)
  const erroresCodigos: Record<string, string> = {}
  for (const k of Object.keys(input.erroresLectura)) erroresCodigos[k] = 'LECTURA_HUBSPOT_FALLIDA'
  const fallo = input.fallo !== undefined
  if (fallo) erroresCodigos.importacion = codigoError(input.fallo, 'LOTE_FALLIDO')
  if (input.cierreFallido) erroresCodigos.cierreJournal = 'CIERRE_JOURNAL_FALLIDO'
  const hayErrores = fallo || Object.keys(erroresCodigos).length > 0
  let resultado: ResultadoRecibo
  if (fallo) resultado = comprometido > 0 ? 'PARCIAL' : 'ERROR'
  else if (hayErrores) resultado = comprometido > 0 ? 'PARCIAL' : 'ERROR'
  else resultado = comprometido === 0 ? 'DUPLICADO' : 'EXITO'
  const nErr = Object.keys(erroresCodigos).length
  return {
    resultado, journalId: input.journalId,
    conteos: {
      actividades: { creados: n(input.importados.actividades), actualizados: 0, omitidos: 0, errores: fallo ? 1 : 0 },
      tareas: { creados: n(input.importados.tareas), actualizados: 0, omitidos: 0, errores: 0 },
      relacionesContacto: { creados: n(input.importados.relacionesContacto), actualizados: 0, omitidos: 0, errores: 0 },
      consentimientos: { creados: 0, actualizados: n(input.consentimientosGuardados), omitidos: 0, errores: 0 },
      lecturas: { creados: 0, actualizados: 0, omitidos: 0, errores: nErr - (fallo ? 1 : 0) - (input.cierreFallido ? 1 : 0) },
    },
    duracionMs: n(input.duracionMs),
    ...(nErr ? { erroresCodigos } : {}),
  }
}

export function validarRecibo(d: DespuesRecibo): void {
  if (!d.hash && !d.journalId) throw new ErrorAuditoriaImportacion()
}

type Db = Pick<Prisma.TransactionClient, 'auditoriaPermisosArea4'>
/** actorId: propietario canónico vivo (requireArea4Owner), nunca el del body ni el heredado de «Actuar como». */
export async function registrarReciboImportacion(db: Db, input: { actorId: number; origen: typeof ORIGEN_RECIBO_ISP | typeof ORIGEN_RECIBO_HUBSPOT | typeof ORIGEN_RECIBO_VINCULOS_BLOQUE; despues: DespuesRecibo }) {
  validarRecibo(input.despues)
  await appendArea4Audit(db, {
    actorId: input.actorId,
    objetivoUsuarioId: null,
    operacion: input.origen === ORIGEN_RECIBO_HUBSPOT ? OPERACION_HUBSPOT : OPERACION_ISP,
    areaCodigo: 'admin.crm',
    antes: null,
    despues: input.despues as unknown as Prisma.InputJsonValue,
    origen: input.origen,
  })
}

/**
 * ISP: el recibo EXITO/DUPLICADO se escribe DENTRO de la transacción de la importación
 * (si falla el recibo, se revierte todo). Tras un rollback, recibo ERROR en una escritura
 * aparte con conteos a cero; si ese también falla, ErrorImportacionNoAuditada.
 */
export async function aplicarIspConRecibo<P extends Parameters<typeof reciboIspExito>[0], R extends { importacionId: string; propuestasNuevas: number; propuestasObsoletas: number }>(
  db: Db,
  plan: P,
  actorId: number,
  aplicar: (dentroTx: (tx: Db, r: R) => Promise<void>) => Promise<R>,
  reloj: () => number = Date.now,
): Promise<R & { recibo: DespuesRecibo }> {
  const t0 = reloj()
  let recibo: DespuesRecibo | null = null
  try {
    const r = await aplicar(async (tx, parcial) => {
      recibo = reciboIspExito(plan, parcial, reloj() - t0)
      await registrarReciboImportacion(tx, { actorId, origen: ORIGEN_RECIBO_ISP, despues: recibo })
    })
    return { ...r, recibo: recibo! }
  } catch (e) {
    try {
      await registrarReciboImportacion(db, { actorId, origen: ORIGEN_RECIBO_ISP, despues: reciboIspError(plan.hash, e, reloj() - t0) })
    } catch {
      throw new ErrorImportacionNoAuditada(e)
    }
    throw e
  }
}

/**
 * Propietario canónico vivo, sin «Actuar como». Se llama en ambos handlers ANTES de cualquier
 * servicio o negocio. El rechazo de session.impersonation es explícito aquí aunque la frontera
 * común también lo aplique (no suprimir al integrar la rama del Área 4).
 */
export type PropietarioImportacion = { ok: boolean; actorId?: number; response?: Response }
type AutorizacionOwner = { ok: boolean; response?: Response; principal?: { id: number }; session?: unknown }
export async function propietarioImportacion(deps?: {
  requireOwner?: () => Promise<AutorizacionOwner>
  rechazar?: (cuerpo: { error: string }, status: number) => Response
}): Promise<PropietarioImportacion> {
  const requireOwner = deps?.requireOwner || (async () => {
    const [{ requireArea4Owner }, { default: prisma }] = await Promise.all([import('@/lib/area4/live-admin'), import('@/lib/prisma')])
    return (await requireArea4Owner(prisma)) as unknown as AutorizacionOwner
  })
  const rechazar = deps?.rechazar || ((cuerpo, status) => Response.json(cuerpo, { status }))
  const auth = await requireOwner()
  if (auth.ok !== true) return { ok: false, response: auth.response }
  if ((auth.session as { impersonation?: unknown } | null | undefined)?.impersonation) {
    return { ok: false, response: rechazar({ error: 'No disponible durante actuación' }, 403) }
  }
  const actorId = auth.principal?.id
  if (!Number.isSafeInteger(actorId) || (actorId as number) <= 0) return { ok: false, response: rechazar({ error: 'No autorizado' }, 401) }
  return { ok: true, actorId }
}
