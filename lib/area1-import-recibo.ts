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
// Cast temporal: el Área 4 añade estas dos operaciones al tipo; al llegar su commit se puede quitar el cast.
export const OPERACION_ISP = 'CRM_IMPORTACION_ISP' as unknown as Area4AuditOperation
export const OPERACION_HUBSPOT = 'CRM_IMPORTACION_HUBSPOT' as unknown as Area4AuditOperation

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
}, aplicado: { importacionId: string; propuestasNuevas: number; propuestasObsoletas: number }, duracionMs: number): DespuesRecibo {
  const conteos = {
    clientes: conteoClases(plan.clientes),
    contratos: conteoClases(plan.contratos),
    facturacion: conteoClases(plan.facturacion),
    vinculos: { creados: n(aplicado.propuestasNuevas), actualizados: n(aplicado.propuestasObsoletas), omitidos: 0, errores: 0 },
  }
  const cambios = ['clientes', 'contratos', 'facturacion', 'vinculos'].reduce((s, k) => s + (conteos as any)[k].creados + (conteos as any)[k].actualizados, 0)
  const ausentes = plan.ausentes.clientes.length + plan.ausentes.contratos.length
  // DUPLICADO solo si se verifica que el negocio no ha cambiado en nada.
  const duplicado = cambios === 0 && ausentes === 0
  return { resultado: duplicado ? 'DUPLICADO' : 'EXITO', hash: plan.hash, journalId: aplicado.importacionId, conteos, duracionMs: n(duracionMs) }
}

/** ISP tras rollback: nada comprometido, no se afirma éxito. */
export function reciboIspError(hash: string | undefined, e: unknown, duracionMs: number): DespuesRecibo {
  return {
    resultado: 'ERROR', ...(hash ? { hash } : {}),
    conteos: { clientes: cero(), contratos: cero(), facturacion: cero(), vinculos: cero() },
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
}): DespuesRecibo {
  const comprometido = n(input.importados.actividades) + n(input.importados.tareas) + n(input.importados.relacionesContacto) + n(input.consentimientosGuardados)
  const erroresCodigos: Record<string, string> = {}
  for (const k of Object.keys(input.erroresLectura)) erroresCodigos[k] = 'LECTURA_HUBSPOT_FALLIDA'
  const fallo = input.fallo !== undefined
  if (fallo) erroresCodigos.importacion = codigoError(input.fallo, 'LOTE_FALLIDO')
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
      lecturas: { creados: 0, actualizados: 0, omitidos: 0, errores: nErr - (fallo ? 1 : 0) },
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
export async function registrarReciboImportacion(db: Db, input: { actorId: number; origen: typeof ORIGEN_RECIBO_ISP | typeof ORIGEN_RECIBO_HUBSPOT; despues: DespuesRecibo }) {
  validarRecibo(input.despues)
  await appendArea4Audit(db, {
    actorId: input.actorId,
    objetivoUsuarioId: null,
    operacion: input.origen === ORIGEN_RECIBO_ISP ? OPERACION_ISP : OPERACION_HUBSPOT,
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

/** Propietario canónico vivo, sin «Actuar como». Devuelve el id o la respuesta de rechazo. */
export type PropietarioImportacion = { ok: boolean; actorId?: number; response?: Response }
export async function propietarioImportacion(): Promise<PropietarioImportacion> {
  const [{ requireArea4Owner }, { default: prisma }, { NextResponse }] = await Promise.all([import('@/lib/area4/live-admin'), import('@/lib/prisma'), import('next/server')])
  const auth = await requireArea4Owner(prisma)
  if (auth.ok !== true) return { ok: false, response: (auth as { response: Response }).response }
  if ((auth.session as { impersonation?: unknown } | null)?.impersonation) {
    return { ok: false, response: NextResponse.json({ error: 'Sal de «Actuar como» para importar.' }, { status: 403 }) }
  }
  return { ok: true, actorId: (auth as { principal: { id: number } }).principal.id }
}
