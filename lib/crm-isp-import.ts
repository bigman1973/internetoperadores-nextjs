/**
 * Área 1 · CRM · Importación del fichero de ISP Gestión (superadmin).
 *
 * - Idempotente: clave ID de cliente ISP, Nº de contrato ISP y código+año+mes.
 * - Nunca borra: lo que desaparece del fichero queda marcado como ausente.
 * - Nada se vincula solo: solo se reutiliza la identidad por clave ISP y los
 *   vínculos que ya existían en el CRM; el resto son propuestas que confirma
 *   una persona.
 * - Brevo: solo lectura de bajas (contactos bloqueados); jamás escribe ni envía.
 */
import { getBrevoApiKey } from '@/lib/brevo-config'
import { brevoFetch } from '@/lib/brevo-fetch'
import { randomUUID as createId } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import prismaDefault from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import { acquireIspOrigenFenceTx, runWithIspSourceWriteTx } from '@/lib/isp-origen-server'
import {
  asignarContrato, clasificar, emailsCompartidosEntreDocumentos, estadoMarketing, indexarClientesPorDoc,
  normalizarDocumento, normalizarEmail, normalizarNombre, proponerVinculos,
  type BajaConocida, type ClienteIsp, type FicheroIsp, type IndicesCrm, type Propuesta,
} from '@/lib/crm-isp-import-core'

type Db = PrismaClient | Prisma.TransactionClient
const lotes = <T,>(xs: T[], n = 500): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
const dia = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null)

// ---------------------------------------------------------------- bajas
export type FuenteBajas = { bajas: Map<string, BajaConocida>; brevoVerificado: boolean; brevoError: string | null }

/** Bajas locales: opt-out y rebotes de los contactos y listas de baja/rebote del CRM. */
export async function bajasLocales(db: Db): Promise<Map<string, BajaConocida>> {
  const m = new Map<string, BajaConocida>()
  const optout = await db.$queryRaw<Array<{ email: string; motivo: string }>>`
    SELECT lower(email) AS email,
      CASE WHEN coalesce(propiedades->>'hs_email_hard_bounce_reason_enum', '') <> '' THEN 'CRM_REBOTE' ELSE 'CRM_OPTOUT' END AS motivo
    FROM crm_registros_hubspot
    WHERE object_type_id = '0-1' AND email IS NOT NULL AND (
      propiedades->>'hs_email_optout' = 'true'
      OR coalesce(propiedades->>'hs_email_hard_bounce_reason_enum', '') <> ''
      OR EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(propiedades, '{}'::jsonb)) p WHERE p.key LIKE 'hs_email_optout_%' AND p.value = 'true')
    )`
  for (const r of optout) { const e = normalizarEmail(r.email); if (e) m.set(e, { motivo: r.motivo }) }
  const listas = await db.$queryRaw<Array<{ email: string }>>`
    SELECT DISTINCT lower(r.email) AS email
    FROM crm_lista_miembros m
    JOIN crm_listas l ON l.id = m.lista_id
    JOIN crm_registros_hubspot r ON r.id = m.registro_id
    WHERE m.activo AND r.email IS NOT NULL
      AND l.nombre ~* '(cancel|baja|rebot|bounce|error|unsub)' AND l.nombre !~* 'invalid data'`
  for (const r of listas) { const e = normalizarEmail(r.email); if (e && !m.has(e)) m.set(e, { motivo: 'CRM_LISTA_BAJA' }) }
  return m
}

/** Lectura (GET) de contactos bloqueados en Brevo. Sin clave o con error, se informa y no se presupone consentimiento extra. */
export async function bajasBrevo(fetchImpl: typeof fetch = brevoFetch as typeof fetch, apiKey = getBrevoApiKey()): Promise<{ bajas: Map<string, BajaConocida>; verificado: boolean; error: string | null }> {
  const bajas = new Map<string, BajaConocida>()
  if (!apiKey) return { bajas, verificado: false, error: 'BREVO_API_KEY_NO_CONFIGURADA' }
  const get = async (url: string) => {
    const r = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', 'api-key': apiKey }, signal: AbortSignal.timeout(10000), cache: 'no-store' })
    if (!r.ok) throw new Error(`BREVO_HTTP_${r.status}`)
    return r.json() as Promise<any>
  }
  try {
    for (let offset = 0, pagina = 0; pagina < 50; pagina++, offset += 1000) {
      const j = await get(`https://api.brevo.com/v3/contacts?limit=1000&offset=${offset}`)
      const contactos: any[] = Array.isArray(j?.contacts) ? j.contacts : []
      for (const c of contactos) if (c?.emailBlacklisted) { const e = normalizarEmail(c.email); if (e) bajas.set(e, { motivo: 'BREVO_BLOQUEADO' }) }
      if (contactos.length < 1000) break
    }
    for (let offset = 0, pagina = 0; pagina < 50; pagina++, offset += 100) {
      const j = await get(`https://api.brevo.com/v3/smtp/blockedContacts?limit=100&offset=${offset}`)
      const contactos: any[] = Array.isArray(j?.contacts) ? j.contacts : []
      for (const c of contactos) { const e = normalizarEmail(c?.email); if (e && !bajas.has(e)) bajas.set(e, { motivo: 'BREVO_BLOQUEO_TRANSACCIONAL' }) }
      if (contactos.length < 100) break
    }
    return { bajas, verificado: true, error: null }
  } catch (e) {
    return { bajas, verificado: false, error: e instanceof Error ? e.message.slice(0, 80) : 'BREVO_ERROR' }
  }
}

export async function obtenerBajas(db: Db, opciones: { consultarBrevo: boolean; fetchImpl?: typeof fetch }): Promise<FuenteBajas> {
  const locales = await bajasLocales(db)
  if (!opciones.consultarBrevo) return { bajas: locales, brevoVerificado: false, brevoError: 'NO_CONSULTADO' }
  const brevo = await bajasBrevo(opciones.fetchImpl)
  for (const [e, b] of brevo.bajas) locales.set(e, b)
  return { bajas: locales, brevoVerificado: brevo.verificado, brevoError: brevo.error }
}

// ---------------------------------------------------------------- índices CRM
export async function cargarIndicesCrm(db: Db, clientes: ClienteIsp[]): Promise<IndicesCrm> {
  const push = <K, V>(m: Map<K, V[]>, k: K | null | undefined, v: V) => { if (k === null || k === undefined || k === '') return; const l = m.get(k) || []; if (!l.includes(v)) l.push(v); m.set(k, l) }
  const [cw, contactos, empresas, empresaClientes] = await Promise.all([
    db.clienteWeb.findMany({ select: { id: true, ispGestionId: true, codigo: true, nif: true, cif: true } }),
    db.crmRegistroHubspot.findMany({ where: { objectTypeId: '0-1', OR: [{ clienteWebId: { not: null } }, { email: { not: null } }] }, select: { id: true, email: true, clienteWebId: true } }),
    db.crmEmpresa.findMany({ where: { activo: true }, select: { id: true, nombre: true, nombreComercial: true, nif: true, nifNormalizado: true } }),
    db.crmEmpresaCliente.findMany({ select: { empresaId: true, clienteId: true } }),
  ])
  const idx: IndicesCrm = {
    clientesWebPorIspId: new Map(), clientesWebPorCodigo: new Map(), clientesWebPorDoc: new Map(),
    contactosPorClienteWeb: new Map(), contactosPorEmail: new Map(), empresasPorClienteWeb: new Map(),
    empresasPorDoc: new Map(), empresasPorNombre: new Map(), emailsCompartidos: emailsCompartidosEntreDocumentos(clientes),
    clienteWebDeContacto: new Map(), clientesWebOcupados: new Map(),
  }
  for (const r of cw) {
    idx.clientesWebPorIspId.set(String(r.ispGestionId), { id: r.id, codigo: r.codigo })
    push(idx.clientesWebPorCodigo, r.codigo, r.id)
    for (const d of new Set([normalizarDocumento(r.nif), normalizarDocumento(r.cif)])) push(idx.clientesWebPorDoc, d, r.id)
  }
  for (const c of contactos) {
    if (c.clienteWebId) { push(idx.contactosPorClienteWeb, c.clienteWebId, c.id); idx.clienteWebDeContacto!.set(c.id, c.clienteWebId) }
    push(idx.contactosPorEmail, normalizarEmail(c.email), c.id)
  }
  for (const e of empresas) {
    push(idx.empresasPorDoc, normalizarDocumento(e.nifNormalizado) || normalizarDocumento(e.nif), e.id)
    push(idx.empresasPorNombre, normalizarNombre(e.nombre), e.id)
    push(idx.empresasPorNombre, normalizarNombre(e.nombreComercial), e.id)
  }
  for (const ec of empresaClientes) idx.empresasPorClienteWeb.set(ec.clienteId, ec.empresaId)
  // Identidad por clave (ID ISP + código) de las cuentas del fichero.
  for (const c of clientes) { const r = idx.clientesWebPorIspId.get(c.ispClienteId); if (r && r.codigo === c.codigo) idx.clientesWebOcupados!.set(r.id, c.ispClienteId) }
  return idx
}

// ---------------------------------------------------------------- plan
export type PlanImportacion = {
  hash: string
  resumen: Record<string, any>
  clientes: Array<{ c: ClienteIsp; clase: 'NUEVO' | 'ACTUALIZADO' | 'SIN_CAMBIOS'; rowId: string; marketing: { estado: string; motivo: string | null }; vinculo: ReturnType<typeof proponerVinculos> }>
  contratos: Array<{ k: FicheroIsp['contratos'][number]; clase: 'NUEVO' | 'ACTUALIZADO' | 'SIN_CAMBIOS'; rowId: string; ispClienteRowId: string | null; asignacion: string; candidatos: string[]; contratoServicioId: number | null }>
  facturacion: Array<{ f: FicheroIsp['facturacion'][number]; clase: 'NUEVO' | 'ACTUALIZADO' | 'SIN_CAMBIOS' }>
  ausentes: { clientes: string[]; contratos: number[] }
  brevoVerificado: boolean
}

export async function planificarImportacion(db: Db, fichero: FicheroIsp, fuente: FuenteBajas): Promise<PlanImportacion> {
  const [prevClientes, prevContratos, prevFact, servicio, idx] = await Promise.all([
    db.ispClienteArea1.findMany({ select: { id: true, ispClienteId: true, huella: true, estadoMarketing: true, bajaMarketingMotivo: true, presenteEnUltimoFichero: true, clienteWebId: true, crmContactoId: true, crmEmpresaId: true } }),
    db.ispContratoArea1.findMany({ select: { id: true, ispContratoId: true, huella: true, ispClienteRowId: true, presenteEnUltimoFichero: true } }),
    db.ispFacturacionMensualArea1.findMany({ select: { codigoCliente: true, anio: true, mes: true, importeBase: true } }),
    db.contratoServicio.findMany({ select: { id: true, ispGestionContratoId: true } }),
    cargarIndicesCrm(db, fichero.clientes),
  ])
  const pc = new Map(prevClientes.map((r) => [r.ispClienteId, r]))
  // Las fichas ya asignadas (por clave o por una persona) a otra cuenta ISP no se proponen de nuevo.
  for (const r of prevClientes) if (r.clienteWebId && !idx.clientesWebOcupados!.has(r.clienteWebId)) idx.clientesWebOcupados!.set(r.clienteWebId, r.ispClienteId)
  const pk = new Map(prevContratos.map((r) => [r.ispContratoId, r]))
  const pf = new Map(prevFact.map((r) => [`${r.codigoCliente}|${r.anio}|${r.mes}`, Number(r.importeBase).toFixed(2)]))
  const cs = new Map(servicio.map((r) => [r.ispGestionContratoId, r.id]))
  const R: Record<string, any> = { clientes: { NUEVO: 0, ACTUALIZADO: 0, SIN_CAMBIOS: 0, AUSENTE: 0 }, contratos: { NUEVO: 0, ACTUALIZADO: 0, SIN_CAMBIOS: 0, AUSENTE: 0 }, facturacion: { NUEVO: 0, ACTUALIZADO: 0, SIN_CAMBIOS: 0 }, marketing: {}, motivosBaja: {}, segmentos: {}, vinculos: { identidadClienteWeb: 0, contactoYaVinculado: 0, empresaYaVinculada: 0 }, propuestas: {}, asignacionContratos: {}, contratosConContratoServicio: 0 }
  const inc = (o: Record<string, number>, k: string) => { o[k] = (o[k] || 0) + 1 }

  const clientes: PlanImportacion['clientes'] = []
  const rowIdPorIsp = new Map<string, string>()
  for (const c of fichero.clientes) {
    const prev = pc.get(c.ispClienteId)
    const marketing = estadoMarketing(c, fuente.bajas, prev ? { estadoMarketing: prev.estadoMarketing, bajaMarketingMotivo: prev.bajaMarketingMotivo } : null)
    let clase = clasificar(c, prev)
    if (clase === 'SIN_CAMBIOS' && (prev?.presenteEnUltimoFichero === false)) clase = 'ACTUALIZADO'
    const vinculo = proponerVinculos(c, idx, prev ? { clienteWebId: prev.clienteWebId, crmContactoId: prev.crmContactoId, crmEmpresaId: prev.crmEmpresaId } : null)
    const rowId = prev?.id || createId()
    rowIdPorIsp.set(c.ispClienteId, rowId)
    clientes.push({ c, clase, rowId, marketing, vinculo })
    R.clientes[clase]++
    inc(R.marketing, marketing.estado)
    if (marketing.motivo) inc(R.motivosBaja, marketing.motivo)
    inc(R.segmentos, c.tipoEmpresa ? `EMPRESA_${c.tipoEmpresa}` : c.segmentoCrm)
    if (vinculo.clienteWebId) R.vinculos.identidadClienteWeb++
    if (vinculo.crmContactoId) R.vinculos.contactoYaVinculado++
    if (vinculo.crmEmpresaId) R.vinculos.empresaYaVinculada++
    for (const p of vinculo.propuestas) inc(R.propuestas, `${p.tipo}_${p.confianza}`)
  }
  const enFichero = new Set(fichero.clientes.map((c) => c.ispClienteId))
  const ausentesClientes = prevClientes.filter((r) => !enFichero.has(r.ispClienteId) && r.presenteEnUltimoFichero).map((r) => r.ispClienteId)
  R.clientes.AUSENTE = ausentesClientes.length

  const porDoc = indexarClientesPorDoc(fichero.clientes)
  const contratos: PlanImportacion['contratos'] = []
  for (const k of fichero.contratos) {
    const prev = pk.get(k.ispContratoId)
    const a = asignarContrato(k, porDoc)
    const ispClienteRowId = a.ispClienteId ? rowIdPorIsp.get(a.ispClienteId) || null : null
    let clase = clasificar(k, prev)
    if (clase === 'SIN_CAMBIOS' && (prev?.ispClienteRowId !== ispClienteRowId || prev?.presenteEnUltimoFichero === false)) clase = 'ACTUALIZADO'
    const contratoServicioId = cs.get(k.ispContratoId) ?? null
    if (contratoServicioId) R.contratosConContratoServicio++
    contratos.push({ k, clase, rowId: prev?.id || createId(), ispClienteRowId, asignacion: a.asignacion, candidatos: a.candidatos, contratoServicioId })
    R.contratos[clase]++
    inc(R.asignacionContratos, a.asignacion)
  }
  const enFicheroK = new Set(fichero.contratos.map((k) => k.ispContratoId))
  const ausentesContratos = prevContratos.filter((r) => !enFicheroK.has(r.ispContratoId) && r.presenteEnUltimoFichero).map((r) => r.ispContratoId)
  R.contratos.AUSENTE = ausentesContratos.length

  const facturacion: PlanImportacion['facturacion'] = []
  let totalCentimos = 0
  for (const f of fichero.facturacion) {
    const prev = pf.get(`${f.codigoCliente}|${f.anio}|${f.mes}`)
    const clase = prev === undefined ? 'NUEVO' : prev === Number(f.importeBase).toFixed(2) ? 'SIN_CAMBIOS' : 'ACTUALIZADO'
    facturacion.push({ f, clase })
    R.facturacion[clase]++
    totalCentimos += Math.round(Number(f.importeBase) * 100)
  }
  R.facturacionTotal = (totalCentimos / 100).toFixed(2)
  R.facturacionClientes = new Set(fichero.facturacion.map((f) => f.codigoCliente)).size
  R.avisos = fichero.avisos
  R.brevo = { verificado: fuente.brevoVerificado, error: fuente.brevoError }
  R.ficheroHash = fichero.hash
  return { hash: fichero.hash, resumen: R, clientes, contratos, facturacion, ausentes: { clientes: ausentesClientes, contratos: ausentesContratos }, brevoVerificado: fuente.brevoVerificado }
}

// ---------------------------------------------------------------- aplicar
function datosCliente(c: ClienteIsp, importacionId: string) {
  return {
    codigo: c.codigo, nombre: c.nombre, nombreComercial: c.nombreComercial, cif: c.cif, nif: c.nif, docNormalizado: c.docNormalizado,
    personaFisica: c.personaFisica, segmentoCrm: c.segmentoCrm, categoria: c.categoria, email: c.email, emails: c.emails,
    telefono: c.telefono, movil: c.movil, domicilio: c.domicilio, numero: c.numero, piso: c.piso, puerta: c.puerta,
    codigoPostal: c.codigoPostal, municipio: c.municipio, provincia: c.provincia, pais: c.pais, comercial: c.comercial, agente: c.agente,
    fechaInicio: dia(c.fechaInicio), fechaFin: dia(c.fechaFin), facturaMail: c.facturaMail, recibePublicidadIsp: c.recibePublicidadIsp,
    idioma: c.idioma, baneado: c.baneado,
    huella: c.huella, presenteEnUltimoFichero: true, ultimaImportacionId: importacionId,
  }
}
function datosContrato(x: PlanImportacion['contratos'][number], importacionId: string) {
  const k = x.k
  return {
    codigoContratoIsp: k.codigoContratoIsp, serie: k.serie, clienteNombreFichero: k.clienteNombreFichero, docNormalizado: k.docNormalizado, estado: k.estado,
    activo: k.activo, tarifa: k.tarifa, descripcion: k.descripcion, lineaAsociada: k.lineaAsociada, importeSinIva: k.importeSinIva,
    descuento: k.descuento, velocidad: k.velocidad, fechaAlta: dia(k.fechaAlta), fechaBaja: dia(k.fechaBaja), permanenciaHasta: dia(k.permanenciaHasta),
    permanenciaTexto: k.permanenciaTexto, periodicidad: k.periodicidad, formaPago: k.formaPago, proveedor: k.proveedor,
    identificadorOperador: k.identificadorOperador, observaciones: k.observaciones,
    huella: k.huella, presenteEnUltimoFichero: true, ultimaImportacionId: importacionId,
    ispClienteRowId: x.ispClienteRowId, asignacionCliente: x.asignacion, candidatosCliente: x.candidatos,
  }
}

export type ResultadoAplicarIsp = { importacionId: string; resumen: Record<string, any>; propuestasNuevas: number; propuestasObsoletas: number; propuestasReactivadas: number; propuestasActualizadas: number; vinculosDirectos: number }
export async function aplicarImportacion(db: PrismaClient, plan: PlanImportacion, meta: { ficheroNombre: string; bytes: number; actorId: number; actorEmail: string }, dentroTx?: (tx: Prisma.TransactionClient, r: ResultadoAplicarIsp) => Promise<void>): Promise<ResultadoAplicarIsp> {
  return db.$transaction(async (tx) => {
    const session = await getServerSession(authOptions)
    const actor = await tx.usuarioAdmin.findUnique({ where: { id: meta.actorId }, select: { activo: true, rol: true } })
    if (importacionesCrmCerradas() || process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1' || process.env.IO_PRODUCTION_READ_ONLY === '1'
      || !session || session.impersonation || session.user.userType !== 'admin' || Number(session.user.id) !== meta.actorId
      || !actor?.activo || actor.rol !== 'SUPER_ADMIN') {
      throw Object.assign(new Error('Carga ISP no autorizada.'), { code: 'ISP_SYNC_UNAUTHORIZED', status: 403 })
    }
    const monthKeys = plan.facturacion.map(({ f }) => `${f.codigoCliente}|${f.anio}|${f.mes}`)
    if (new Set(monthKeys).size !== monthKeys.length || plan.facturacion.some(({ f }) => !Number.isInteger(f.mes) || f.mes < 1 || f.mes > 12)) {
      throw Object.assign(new Error('Facturación mensual ISP inválida.'), { code: 'ISP_SNAPSHOT_INVALID', status: 409 })
    }
    const importacionId = createId()
    await tx.ispImportacionArea1.create({ data: { id: importacionId, ficheroNombre: meta.ficheroNombre.slice(0, 200), ficheroHash: plan.hash, ficheroBytes: meta.bytes, actorId: meta.actorId, actorEmail: meta.actorEmail, resumen: plan.resumen as Prisma.InputJsonValue, brevoVerificado: plan.brevoVerificado } })

    let asignacionesFuenteAplicadas = 0
    let contratosAsignacionPendiente = 0
    await runWithIspSourceWriteTx('crm-xlsx', tx, async (writerTx) => {
      // Clientes
      const nuevos = plan.clientes.filter((x) => x.clase === 'NUEVO')
      for (const l of lotes(nuevos)) await writerTx.ispClienteArea1.createMany({ data: l.map((x) => ({ id: x.rowId, ispClienteId: x.c.ispClienteId, primeraImportacionId: importacionId, ...datosCliente(x.c, importacionId) })) })
      for (const x of plan.clientes.filter((y) => y.clase === 'ACTUALIZADO')) {
        const previous = await writerTx.ispClienteArea1.findUnique({ where: { id: x.rowId }, select: { ispClienteId: true } })
        if (previous?.ispClienteId !== x.c.ispClienteId) throw Object.assign(new Error('ISP_SNAPSHOT_ID_MISMATCH'), { code: 'ISP_SNAPSHOT_INVALID', status: 409 })
        await writerTx.ispClienteArea1.update({ where: { id: x.rowId }, data: datosCliente(x.c, importacionId) })
      }
      const sinCambios = plan.clientes.filter((x) => x.clase === 'SIN_CAMBIOS').map((x) => x.rowId)
      for (const l of lotes(sinCambios)) await writerTx.ispClienteArea1.updateMany({ where: { id: { in: l } }, data: { ultimaImportacionId: importacionId } })
      // Ausentes calculados son advertencia: no se aplica presencia sin snapshot completo verificado.

      // Ni null→id ni una coincidencia automática constituyen decisión humana.
      // El refresco conserva todos los enlaces; el algoritmo sólo propone.

      // FK entre snapshots ISP, nunca enlaces humanos CRM ni contratoServicioId.
      // Recalcular tras persistir los clientes: incluye cuentas ausentes del XLSX
      // parcial para que un NIF compartido no se convierta en asignación inventada.
      const persisted = await writerTx.ispClienteArea1.findMany({ select: {
        id: true, ispClienteId: true, codigo: true, nombre: true, nombreComercial: true, docNormalizado: true, cif: true, nif: true,
      }, orderBy: { ispClienteId: 'asc' } })
      const byIspId = new Map(persisted.map((c) => [c.ispClienteId, c.id]))
      // El algoritmo sólo consume identidad fuente. Completar su DTO puro no
      // concede datos/consentimientos ni persiste estos valores auxiliares.
      const candidateDtos: ClienteIsp[] = persisted.map((c) => ({ ...c,
        personaFisica: false, segmentoCrm: 'PARTICULAR', tipoEmpresa: null, categoria: null, email: null, emails: [],
        telefono: null, movil: null, domicilio: null, numero: null, piso: null, puerta: null, codigoPostal: null,
        municipio: null, provincia: null, pais: null, comercial: null, agente: null, fechaInicio: null, fechaFin: null,
        facturaMail: false, recibePublicidadIsp: false, idioma: null, baneado: false, huella: '',
      }))
      const byDoc = indexarClientesPorDoc(candidateDtos)
      for (const original of plan.contratos) {
        const assignment = asignarContrato(original.k, byDoc)
        const previous = await writerTx.ispContratoArea1.findUnique({ where: { ispContratoId: original.k.ispContratoId }, select: {
          id: true, ispContratoId: true, ispClienteRowId: true, asignacionCliente: true, candidatosCliente: true,
        } })
        if (previous && previous.id !== original.rowId) throw Object.assign(new Error('ISP_SNAPSHOT_ID_MISMATCH'), { code: 'ISP_SNAPSHOT_INVALID', status: 409 })
        const rowId = assignment.ispClienteId ? byIspId.get(assignment.ispClienteId) : null
        if (assignment.ispClienteId && !rowId) throw Object.assign(new Error('ISP_SNAPSHOT_CLIENT_MISSING'), { code: 'ISP_SNAPSHOT_INVALID', status: 409 })
        const x = { ...original, ispClienteRowId: rowId ?? null, asignacion: assignment.asignacion, candidatos: assignment.candidatos }
        // La ambigüedad/ausencia parcial no desmonta una asignación existente:
        // ni cambia sus claves documentales/huella a un resultado no acreditado.
        if (!x.ispClienteRowId && previous?.ispClienteRowId) {
          const { ispClienteRowId: _row, asignacionCliente: _assignment, candidatosCliente: _candidates,
            docNormalizado: _doc, clienteNombreFichero: _name, huella: _hash, ...header } = datosContrato(x, importacionId)
          await writerTx.ispContratoArea1.update({ where: { id: x.rowId }, data: header })
          contratosAsignacionPendiente++
          continue
        }
        if (x.ispClienteRowId && x.ispClienteRowId !== previous?.ispClienteRowId) asignacionesFuenteAplicadas++
        if (!previous) await writerTx.ispContratoArea1.create({ data: { id: x.rowId, ispContratoId: x.k.ispContratoId, ...datosContrato(x, importacionId) } })
        else if (x.clase !== 'SIN_CAMBIOS' || previous.ispClienteRowId !== x.ispClienteRowId || previous.asignacionCliente !== x.asignacion || JSON.stringify(previous.candidatosCliente) !== JSON.stringify(x.candidatos)) {
          await writerTx.ispContratoArea1.update({ where: { id: x.rowId }, data: datosContrato(x, importacionId) })
        } else await writerTx.ispContratoArea1.update({ where: { id: x.rowId }, data: { ultimaImportacionId: importacionId } })
      }
      // Tampoco se convierte ausencia contractual en baja/presencia persistida.

      // Facturación mensual
      for (const l of lotes(plan.facturacion.filter((x) => x.clase === 'NUEVO'))) await writerTx.ispFacturacionMensualArea1.createMany({ data: l.map(({ f }) => ({ id: createId(), codigoCliente: f.codigoCliente, anio: f.anio, mes: f.mes, importeBase: f.importeBase, ultimaImportacionId: importacionId })) })
      for (const { f } of plan.facturacion.filter((x) => x.clase === 'ACTUALIZADO')) await writerTx.ispFacturacionMensualArea1.update({ where: { codigoCliente_anio_mes: { codigoCliente: f.codigoCliente, anio: f.anio, mes: f.mes } }, data: { importeBase: f.importeBase, ultimaImportacionId: importacionId } })

    })
    const vinculosDirectos = 0
    // Propuestas: se conservan las decisiones humanas; las pendientes que ya no aplican pasan a OBSOLETO.
    const existentes = await tx.ispVinculoArea1.findMany({ where: { ispClienteRowId: { in: plan.clientes.map(x => x.rowId) } }, select: { id: true, ispClienteRowId: true, tipo: true, destinoId: true, estado: true, motivo: true, confianza: true } })
    let propuestasReactivadas = 0
    let propuestasActualizadas = 0
    const clave = (a: string, t: string, d: string) => `${a}|${t}|${d}`
    const ex = new Map(existentes.map((e) => [clave(e.ispClienteRowId, e.tipo, e.destinoId), e]))
    const vigentes = new Set<string>()
    const crear: Prisma.IspVinculoArea1CreateManyInput[] = []
    for (const x of plan.clientes) {
      for (const p of x.vinculo.propuestas) {
        const k = clave(x.rowId, p.tipo, p.destinoId)
        vigentes.add(k)
        const e = ex.get(k)
        if (!e) crear.push({ id: createId(), ispClienteRowId: x.rowId, tipo: p.tipo, destinoId: p.destinoId, motivo: p.motivo, confianza: p.confianza, detalle: (p.detalle || undefined) as Prisma.InputJsonValue | undefined, ultimaImportacionId: importacionId })
        else if (e.estado === 'PENDIENTE' || e.estado === 'OBSOLETO') {
          await tx.ispVinculoArea1.update({ where: { id: e.id }, data: { motivo: p.motivo, confianza: p.confianza, estado: 'PENDIENTE', ultimaImportacionId: importacionId } })
          // Cambio de negocio real: OBSOLETO → PENDIENTE, o motivo/confianza distintos. Solo el journal no cuenta.
          if (e.estado === 'OBSOLETO') propuestasReactivadas++
          else if (e.motivo !== p.motivo || String(e.confianza) !== String(p.confianza)) propuestasActualizadas++
        }
      }
    }
    for (const l of lotes(crear)) await tx.ispVinculoArea1.createMany({ data: l })
    const obsoletas = existentes.filter((e) => e.estado === 'PENDIENTE' && !vigentes.has(clave(e.ispClienteRowId, e.tipo, e.destinoId))).map((e) => e.id)
    for (const l of lotes(obsoletas)) await tx.ispVinculoArea1.updateMany({ where: { id: { in: l } }, data: { estado: 'OBSOLETO', ultimaImportacionId: importacionId } })

    const r: ResultadoAplicarIsp = { importacionId, resumen: { ...plan.resumen, presenciaAplicada: false, advertenciaOrigen: 'ISP_SNAPSHOT_PRESENCE_UNVERIFIED', marketingAplicado: false, asignacionesAutomaticasAplicadas: false, asignacionesFuenteAplicadas, contratosAsignacionPendiente }, propuestasNuevas: crear.length, propuestasObsoletas: obsoletas.length, propuestasReactivadas, propuestasActualizadas, vinculosDirectos }
    // Recibo de auditoría del Área 4 en la misma transacción: si falla, se revierte la importación.
    if (dentroTx) await dentroTx(tx, r)
    return r
  }, { timeout: 180000, maxWait: 15000 })
}

// ---------------------------------------------------------------- confirmación humana
export class ErrorVinculo extends Error { constructor(public codigo: string) { super(codigo) } }

const CATEGORIA: Record<string, 'CLIENTE_WEB' | 'CONTACTO' | 'EMPRESA'> = { CLIENTE_WEB: 'CLIENTE_WEB', CRM_CONTACTO: 'CONTACTO', CREAR_CONTACTO: 'CONTACTO', CRM_EMPRESA: 'EMPRESA', CREAR_EMPRESA: 'EMPRESA' }

/** Confirma o descarta propuestas elegidas por una persona. Devuelve el resultado de cada una. */
export type EfectoVinculo = { tipo: string; enlaceClienteWeb: boolean; obsoletas: number }
/**
 * Confirma o descarta UNA propuesta dentro de la transacción recibida. Mismas reglas para la
 * confirmación una a una y para el bloque. Lanza ErrorVinculo si no se puede aplicar.
 */
export async function resolverVinculoEnTx(tx: Prisma.TransactionClient, id: string, accion: 'CONFIRMAR' | 'DESCARTAR', actor: string): Promise<EfectoVinculo> {
  await acquireIspOrigenFenceTx(tx)
  const efecto: EfectoVinculo = { tipo: '', enlaceClienteWeb: false, obsoletas: 0 }
  const v = await tx.ispVinculoArea1.findUnique({ where: { id }, include: { cliente: true } })
  if (!v) throw new ErrorVinculo('NO_EXISTE')
  efecto.tipo = v.tipo
  if (v.estado !== 'PENDIENTE') throw new ErrorVinculo('YA_RESUELTA')
  const ahora = new Date()
  if (accion === 'DESCARTAR') {
    await tx.ispVinculoArea1.update({ where: { id }, data: { estado: 'DESCARTADO', revisadoPor: actor, revisadoAt: ahora } })
    return efecto
  }
  const c = v.cliente
  const origen = `ISP_CONFIRMADO:${actor}`.slice(0, 120)
  const link = async (field: 'clienteWebId' | 'crmContactoId' | 'crmEmpresaId', value: number | string) => {
    const result = await tx.ispClienteArea1.updateMany({ where: { id: c.id, OR: [{ [field]: null }, { [field]: value }] }, data: { [field]: value } })
    if (result.count !== 1) throw new ErrorVinculo('YA_RESUELTA')
    const current = await tx.ispClienteArea1.findUnique({ where: { id: c.id }, select: { clienteWebId: true, crmContactoId: true, crmEmpresaId: true } })
    if (!current || current[field] !== value) throw new ErrorVinculo('YA_RESUELTA')
  }
  if (v.tipo === 'CLIENTE_WEB') {
    if (c.clienteWebId) throw new ErrorVinculo('CLIENTE_YA_VINCULADO')
    const destino = Number(v.destinoId)
    const cw = await tx.clienteWeb.findUnique({ where: { id: destino }, select: { id: true } })
    if (!cw) throw new ErrorVinculo('DESTINO_NO_EXISTE')
    const otra = await tx.ispClienteArea1.findFirst({ where: { clienteWebId: destino, id: { not: c.id } }, select: { id: true } })
    if (otra) throw new ErrorVinculo('FICHA_DE_OTRA_CUENTA_ISP')
    await link('clienteWebId', destino)
  } else if (v.tipo === 'CRM_CONTACTO' || v.tipo === 'CREAR_CONTACTO') {
    if (c.crmContactoId) throw new ErrorVinculo('CONTACTO_YA_VINCULADO')
    let contactoId = v.destinoId
    if (v.tipo === 'CREAR_CONTACTO') {
      const nuevo = await tx.crmRegistroHubspot.create({ data: {
        objectTypeId: '0-1', hubspotId: `local:${createId()}`, nombre: c.nombre, email: c.email, telefono: c.movil || c.telefono,
        segmentoCrm: c.segmentoCrm, segmentoCrmActualizadoAt: ahora, segmentoCrmActualizadoPor: origen,
        clienteWebId: c.clienteWebId, vinculoClienteOrigen: c.clienteWebId ? 'ISP_CONFIRMADO' : null, convertidoAt: c.clienteWebId ? ahora : null,
        propiedadesLocales: { origen: 'ISP_GESTION', codigoIsp: c.codigo, estadoMarketing: c.estadoMarketing } as Prisma.InputJsonValue,
        datosActualizadoAt: ahora, datosActualizadoPor: origen,
      }, select: { id: true } })
      contactoId = nuevo.id
    } else {
      const contacto = await tx.crmRegistroHubspot.findUnique({ where: { id: contactoId }, select: { id: true, clienteWebId: true } })
      if (!contacto) throw new ErrorVinculo('DESTINO_NO_EXISTE')
      if (contacto.clienteWebId && contacto.clienteWebId !== c.clienteWebId) throw new ErrorVinculo('CONTACTO_DE_OTRO_CLIENTE')
      if (!contacto.clienteWebId && c.clienteWebId) await tx.crmRegistroHubspot.update({ where: { id: contactoId }, data: { clienteWebId: c.clienteWebId, vinculoClienteOrigen: 'ISP_CONFIRMADO', convertidoAt: ahora } })
    }
    await link('crmContactoId', contactoId)
  } else {
    if (c.crmEmpresaId) throw new ErrorVinculo('EMPRESA_YA_VINCULADA')
    let empresaId = v.destinoId
    if (v.tipo === 'CREAR_EMPRESA') {
      const autonomo = (v.detalle as any)?.tipoEmpresa === 'AUTONOMO'
      const empresa = await tx.crmEmpresa.create({ data: {
        nombre: c.nombre, nombreComercial: c.nombreComercial, nif: c.cif || c.nif, nifNormalizado: c.docNormalizado,
        tipo: autonomo ? 'AUTONOMO' : 'SOCIEDAD', segmentoCrm: 'EMPRESA', telefono: c.telefono || c.movil, email: c.email,
        direccion: [c.domicilio, c.numero, c.piso, c.puerta].filter(Boolean).join(' ') || null, codigoPostal: c.codigoPostal,
        localidad: c.municipio, provincia: c.provincia, pais: c.pais || 'ES', origen: 'ISP', actualizadoPor: origen,
      }, select: { id: true } })
      empresaId = empresa.id
      // Un autónomo también es contacto: titular de su cuenta.
      if (autonomo) {
        const titular = c.crmContactoId || (await tx.crmRegistroHubspot.create({ data: {
          objectTypeId: '0-1', hubspotId: `local:${createId()}`, nombre: c.nombre, email: c.email, telefono: c.movil || c.telefono, segmentoCrm: 'EMPRESA',
          clienteWebId: c.clienteWebId, vinculoClienteOrigen: c.clienteWebId ? 'ISP_CONFIRMADO' : null, convertidoAt: c.clienteWebId ? ahora : null,
          propiedadesLocales: { origen: 'ISP_GESTION', codigoIsp: c.codigo } as Prisma.InputJsonValue, datosActualizadoAt: ahora, datosActualizadoPor: origen,
        }, select: { id: true } })).id
        await tx.crmEmpresaContacto.create({ data: { empresaId, contactoId: titular, principal: true, papel: 'TITULAR', origen: 'ISP' } })
        if (!c.crmContactoId) await link('crmContactoId', titular)
      }
    } else {
      const e = await tx.crmEmpresa.findFirst({ where: { id: empresaId, activo: true }, select: { id: true } })
      if (!e) throw new ErrorVinculo('DESTINO_NO_EXISTE')
    }
    if (c.clienteWebId) {
      const enlace = await tx.crmEmpresaCliente.findUnique({ where: { clienteId: c.clienteWebId } })
      if (enlace && enlace.empresaId !== empresaId) throw new ErrorVinculo('CLIENTE_EN_OTRA_EMPRESA')
      if (!enlace) { await tx.crmEmpresaCliente.create({ data: { empresaId, clienteId: c.clienteWebId, origen: 'ISP_CONFIRMADO' } }); efecto.enlaceClienteWeb = true }
    }
    await link('crmEmpresaId', empresaId)
  }
  await tx.ispVinculoArea1.update({ where: { id }, data: { estado: 'CONFIRMADO', revisadoPor: actor, revisadoAt: ahora } })
  // Las demás propuestas de la misma categoría para este cliente dejan de aplicar.
  const hermanas = Object.entries(CATEGORIA).filter(([, cat]) => cat === CATEGORIA[v.tipo]).map(([t]) => t)
  efecto.obsoletas = (await tx.ispVinculoArea1.updateMany({ where: { ispClienteRowId: c.id, estado: 'PENDIENTE', tipo: { in: hermanas }, id: { not: id } }, data: { estado: 'OBSOLETO', revisadoPor: actor, revisadoAt: ahora } })).count
  return efecto
}
export async function resolverVinculos(db: PrismaClient, ids: string[], accion: 'CONFIRMAR' | 'DESCARTAR', actor: string) {
  const resultados: Array<{ id: string; ok: boolean; codigo?: string }> = []
  for (const id of ids) {
    try {
      await db.$transaction(async (tx) => {
        await resolverVinculoEnTx(tx, id, accion, actor)
      })
      resultados.push({ id, ok: true })
    } catch (e) {
      resultados.push({ id, ok: false, codigo: e instanceof ErrorVinculo ? e.codigo : 'ERROR' })
    }
  }
  return resultados
}

// ---------------------------------------------------------------- ficha
export type ResumenIspFicha = Awaited<ReturnType<typeof resumenIspParaFicha>>

/** Datos ISP para la ficha CRM: contratos, facturación 2026 y clave para el margen de Rentabilidad. */
export async function resumenIspParaFicha(filtro: { crmEmpresaId?: string; crmContactoId?: string; clienteWebIds?: number[] }, db: Db = prismaDefault, anio = 2026) {
  const OR: Prisma.IspClienteArea1WhereInput[] = []
  if (filtro.crmEmpresaId) OR.push({ crmEmpresaId: filtro.crmEmpresaId })
  if (filtro.crmContactoId) OR.push({ crmContactoId: filtro.crmContactoId })
  if (filtro.clienteWebIds?.length) OR.push({ clienteWebId: { in: filtro.clienteWebIds } })
  if (!OR.length) return null
  // Si la migración area1_isp_carga aún no está aplicada en esta BD, la ficha simplemente no muestra el bloque.
  const clientes = await db.ispClienteArea1.findMany({ where: { OR }, take: 20, orderBy: { codigo: 'asc' }, include: { contratos: { orderBy: [{ activo: 'desc' }, { ispContratoId: 'asc' }], take: 200 } } }).catch(() => null)
  if (!clientes) return null
  if (!clientes.length) return null
  const codigos = Array.from(new Set<string>(clientes.map((c) => c.codigo)))
  const fact = await db.ispFacturacionMensualArea1.findMany({ where: { codigoCliente: { in: codigos }, anio }, orderBy: [{ mes: 'asc' }] })
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, importe: 0 }))
  for (const f of fact) meses[f.mes - 1].importe += Number(f.importeBase)
  return {
    anio,
    clientes: clientes.map((c) => ({
      id: c.id, codigo: c.codigo, nombre: c.nombre, segmento: c.segmentoCrm, estadoMarketing: c.estadoMarketing, presente: c.presenteEnUltimoFichero,
      fechaFin: c.fechaFin?.toISOString().slice(0, 10) || null,
      contratos: c.contratos.map((k) => ({
        id: k.id, numero: k.ispContratoId, codigoContratoIsp: k.codigoContratoIsp, estado: k.estado, activo: k.activo, tarifa: k.tarifa,
        descripcion: k.descripcion, proveedor: k.proveedor, velocidad: k.velocidad, importe: k.importeSinIva === null ? null : Number(k.importeSinIva),
        periodicidad: k.periodicidad, fechaAlta: k.fechaAlta?.toISOString().slice(0, 10) || null, fechaBaja: k.fechaBaja?.toISOString().slice(0, 10) || null,
        // Enlace previsto con el módulo de Rentabilidad (Área 3): rentabilidad_lineas.codigo_contrato_isp.
        margen: null as number | null,
      })),
    })),
    facturacion: { meses, total: meses.reduce((s, m) => s + m.importe, 0) },
    margen: { estado: 'PENDIENTE_INTEGRACION_RENTABILIDAD' as const, clave: 'codigo_contrato_isp' },
  }
}
export type { Propuesta }
