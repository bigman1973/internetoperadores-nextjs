/**
 * Área 1 · CRM · Confirmación EN BLOQUE de vínculos ISP → empresa del CRM (decisión de Claude/Víctor, 25/11).
 *
 * Entran solo las propuestas PENDIENTES de tipo CRM_EMPRESA, confianza ALTA y motivo NIF, cuyo cliente ISP
 * aún no tiene empresa, con la empresa destino activa, el NOMBRE IGUAL (mayúsculas, solo letras y cifras)
 * y sin otra propuesta pendiente hacia la misma empresa. El resto queda para revisión manual.
 *
 * - simularBloque: solo lectura. Devuelve recuentos, 10 ejemplos sin datos personales y la huella.
 * - confirmarBloque: una sola transacción. Recalcula la selección, exige la misma huella (si las propuestas
 *   han cambiado, no hace nada), confirma cada propuesta con las mismas reglas que la confirmación una a una
 *   (resolverVinculoEnTx) y escribe el recibo de auditoría DENTRO de la transacción. Si algo falla, se revierte
 *   todo y se deja un recibo ERROR aparte con conteos a cero.
 * - No crea fichas nuevas (las CREAR_* quedan fuera por decisión) ni toca ISP Gestión.
 */
import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { ErrorVinculo, resolverVinculoEnTx } from '@/lib/crm-isp-import'
import {
  codigoError, ErrorImportacionNoAuditada, registrarReciboImportacion, ORIGEN_RECIBO_VINCULOS_BLOQUE,
  type DespuesRecibo,
} from '@/lib/area1-import-recibo'

type Db = PrismaClient | Prisma.TransactionClient
export const CONFIRMACION_BLOQUE = 'CONFIRMAR_BLOQUE'
export const nombreBloque = (v: string | null | undefined) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export type CandidatoBloque = {
  id: string
  ispClienteRowId: string
  destinoId: string
  codigoIsp: string
  doc: string | null
  nombreIsp: string
  nombreEmpresa: string | null
  empresaActiva: boolean
  clienteYaConEmpresa: boolean
  clienteWebId: number | null
  contratos: number
}
export type MotivoExclusion = 'NOMBRE_DISTINTO' | 'EMPRESA_COMPARTIDA' | 'EMPRESA_INACTIVA' | 'CLIENTE_YA_CON_EMPRESA'
export type SeleccionBloque = { incluidos: CandidatoBloque[]; excluidos: Array<{ c: CandidatoBloque; motivos: MotivoExclusion[] }> }

/** Pura: decide qué candidatos entran. `pendientesPorDestino` cuenta TODAS las propuestas CRM_EMPRESA pendientes por empresa. */
export function seleccionarBloque(candidatos: CandidatoBloque[], pendientesPorDestino: Map<string, number>): SeleccionBloque {
  const out: SeleccionBloque = { incluidos: [], excluidos: [] }
  for (const c of candidatos) {
    const motivos: MotivoExclusion[] = []
    if (!c.empresaActiva) motivos.push('EMPRESA_INACTIVA')
    if (c.clienteYaConEmpresa) motivos.push('CLIENTE_YA_CON_EMPRESA')
    if (!c.nombreEmpresa || nombreBloque(c.nombreIsp) === '' || nombreBloque(c.nombreIsp) !== nombreBloque(c.nombreEmpresa)) motivos.push('NOMBRE_DISTINTO')
    if ((pendientesPorDestino.get(c.destinoId) || 0) > 1) motivos.push('EMPRESA_COMPARTIDA')
    if (motivos.length) out.excluidos.push({ c, motivos })
    else out.incluidos.push(c)
  }
  out.incluidos.sort((a, b) => a.id.localeCompare(b.id))
  return out
}
/** Huella de lo que se va a confirmar: si cambia cualquier propuesta incluida, cambia la huella. */
export function huellaBloque(incluidos: CandidatoBloque[]): string {
  const filas = incluidos.map((c) => [c.id, c.ispClienteRowId, c.destinoId, nombreBloque(c.nombreIsp), c.clienteWebId ?? ''].join('|')).sort()
  return createHash('sha256').update(`area1-vinculos-bloque-v1\n${filas.join('\n')}`).digest('hex')
}
export const enmascararDoc = (doc: string | null) => (doc && doc.length > 3 ? `${doc[0]}****${doc.slice(-2)}` : doc ? '****' : 'sin NIF')

export async function cargarCandidatosBloque(db: Db): Promise<{ candidatos: CandidatoBloque[]; pendientesPorDestino: Map<string, number> }> {
  const [vinculos, porDestino] = await Promise.all([
    db.ispVinculoArea1.findMany({
      where: { estado: 'PENDIENTE', tipo: 'CRM_EMPRESA', confianza: 'ALTA', motivo: 'NIF' },
      select: { id: true, ispClienteRowId: true, destinoId: true, cliente: { select: { codigo: true, docNormalizado: true, nombre: true, crmEmpresaId: true, clienteWebId: true, _count: { select: { contratos: true } } } } },
      take: 2000,
    }),
    db.ispVinculoArea1.groupBy({ by: ['destinoId'], where: { estado: 'PENDIENTE', tipo: 'CRM_EMPRESA' }, _count: { _all: true } }),
  ])
  const empresas = vinculos.length
    ? await db.crmEmpresa.findMany({ where: { id: { in: [...new Set(vinculos.map((v) => v.destinoId))] } }, select: { id: true, nombre: true, activo: true } })
    : []
  const emp = new Map(empresas.map((e) => [e.id, e]))
  const candidatos = vinculos.map((v) => ({
    id: v.id,
    ispClienteRowId: v.ispClienteRowId,
    destinoId: v.destinoId,
    codigoIsp: v.cliente.codigo,
    doc: v.cliente.docNormalizado,
    nombreIsp: v.cliente.nombre,
    nombreEmpresa: emp.get(v.destinoId)?.nombre ?? null,
    empresaActiva: Boolean(emp.get(v.destinoId)?.activo),
    clienteYaConEmpresa: Boolean(v.cliente.crmEmpresaId),
    clienteWebId: v.cliente.clienteWebId,
    contratos: v.cliente._count.contratos,
  }))
  return { candidatos, pendientesPorDestino: new Map(porDestino.map((p) => [p.destinoId, p._count._all])) }
}

export type SimulacionBloque = {
  hash: string
  vinculos: number
  empresas: number
  enlacesClienteWeb: number
  contratos: number
  fichasNuevas: 0
  excluidos: Record<MotivoExclusion, number> & { total: number }
  ejemplos: Array<{ codigoIsp: string; nif: string; contratos: number; conClienteWeb: boolean }>
}
export async function simularBloque(db: Db): Promise<SimulacionBloque> {
  const { candidatos, pendientesPorDestino } = await cargarCandidatosBloque(db)
  const sel = seleccionarBloque(candidatos, pendientesPorDestino)
  // Enlaces empresa↔cliente web que se crearían (no existe aún el enlace de ese cliente web).
  const webIds = sel.incluidos.map((c) => c.clienteWebId).filter((x): x is number => x != null)
  const yaEnlazados = webIds.length ? await db.crmEmpresaCliente.count({ where: { clienteId: { in: webIds } } }) : 0
  const excluidos = { NOMBRE_DISTINTO: 0, EMPRESA_COMPARTIDA: 0, EMPRESA_INACTIVA: 0, CLIENTE_YA_CON_EMPRESA: 0, total: sel.excluidos.length }
  for (const e of sel.excluidos) for (const m of e.motivos) excluidos[m]++
  return {
    hash: huellaBloque(sel.incluidos),
    vinculos: sel.incluidos.length,
    empresas: new Set(sel.incluidos.map((c) => c.destinoId)).size,
    enlacesClienteWeb: webIds.length - yaEnlazados,
    contratos: sel.incluidos.reduce((a, c) => a + c.contratos, 0),
    fichasNuevas: 0,
    excluidos,
    ejemplos: [...sel.incluidos].sort((a, b) => a.codigoIsp.localeCompare(b.codigoIsp)).slice(0, 10)
      .map((c) => ({ codigoIsp: c.codigoIsp, nif: enmascararDoc(c.doc), contratos: c.contratos, conClienteWeb: c.clienteWebId != null })),
  }
}

export class ErrorBloque extends Error { constructor(public codigo: 'HASH_DISTINTO' | 'BLOQUE_VACIO', public status = 409) { super(codigo) } }
export type ResultadoBloque = { ok: true; hash: string; vinculos: number; enlacesClienteWeb: number; obsoletas: number; duracionMs: number }

/** Recibo EXITO del bloque (sin datos personales: solo huella y conteos). */
export function reciboBloqueExito(hash: string, r: { vinculos: number; enlacesClienteWeb: number; obsoletas: number }, duracionMs: number): DespuesRecibo {
  return {
    resultado: 'EXITO', hash, duracionMs,
    conteos: {
      vinculosEmpresa: { creados: 0, actualizados: r.vinculos, omitidos: 0, errores: 0 },
      enlacesClienteWeb: { creados: r.enlacesClienteWeb, actualizados: 0, omitidos: 0, errores: 0 },
      propuestasObsoletas: { creados: 0, actualizados: r.obsoletas, omitidos: 0, errores: 0 },
    },
  }
}
export function reciboBloqueError(hash: string, e: unknown, duracionMs: number): DespuesRecibo {
  const codigo = e instanceof ErrorVinculo ? `VINCULO_${e.codigo}` : codigoError(e)
  return {
    resultado: 'ERROR', hash, duracionMs, erroresCodigos: { vinculos: codigo },
    conteos: { vinculosEmpresa: { creados: 0, actualizados: 0, omitidos: 0, errores: 1 }, enlacesClienteWeb: { creados: 0, actualizados: 0, omitidos: 0, errores: 0 }, propuestasObsoletas: { creados: 0, actualizados: 0, omitidos: 0, errores: 0 } },
  }
}

/**
 * actorId: propietario canónico vivo sin «Actuar como» (propietarioImportacion). actor: email para revisadoPor.
 * Si la huella no coincide no escribe nada (ni recibo): las propuestas han cambiado y hay que volver a simular.
 */
export async function confirmarBloque(db: PrismaClient, input: { actorId: number; actor: string; hashEsperado: string }, ahora = () => Date.now()): Promise<ResultadoBloque> {
  const t0 = ahora()
  try {
    return await db.$transaction(async (tx) => {
      const { candidatos, pendientesPorDestino } = await cargarCandidatosBloque(tx)
      const sel = seleccionarBloque(candidatos, pendientesPorDestino)
      const hash = huellaBloque(sel.incluidos)
      if (hash !== input.hashEsperado) throw new ErrorBloque('HASH_DISTINTO')
      if (!sel.incluidos.length) throw new ErrorBloque('BLOQUE_VACIO')
      const r = { vinculos: 0, enlacesClienteWeb: 0, obsoletas: 0 }
      for (const c of sel.incluidos) {
        const ef = await resolverVinculoEnTx(tx, c.id, 'CONFIRMAR', input.actor)
        r.vinculos++
        if (ef.enlaceClienteWeb) r.enlacesClienteWeb++
        r.obsoletas += ef.obsoletas
      }
      const duracionMs = ahora() - t0
      await registrarReciboImportacion(tx, { actorId: input.actorId, origen: ORIGEN_RECIBO_VINCULOS_BLOQUE, despues: reciboBloqueExito(hash, r, duracionMs) })
      return { ok: true as const, hash, ...r, duracionMs }
    }, { timeout: 60_000, maxWait: 10_000 })
  } catch (e) {
    if (e instanceof ErrorBloque) throw e
    try {
      await registrarReciboImportacion(db, { actorId: input.actorId, origen: ORIGEN_RECIBO_VINCULOS_BLOQUE, despues: reciboBloqueError(input.hashEsperado, e, ahora() - t0) })
    } catch {
      throw new ErrorImportacionNoAuditada(codigoError(e))
    }
    throw e
  }
}
