/** Identidad de lectura: snapshots y cuentas efectivamente ligadas, nunca coincidencias fiscales.
 * Sin Prisma runtime, proveedores, normalización persistida ni reparación desde GET.
 */
import type { Prisma } from '@prisma/client'
import { persistedClienteOrigin } from './isp-origen-policy'

export type IdentidadCrm = { nombre: string; nif: string | null }
export type CuentaIspIdentidad = {
  id: string; fuente: 'area1' | 'legacy'; enlace: 'directo' | 'legacy' | 'confirmado'
  ispClienteId: string; clienteWebId: number | null; codigo: string | null
  nombre: string; cif: string | null; nif: string | null; docNormalizado: string | null
  documento: string | null; conflictoDocumento: boolean
  presente: boolean | null; fechaInicio: string | null; fechaFin: string | null; importacionId: string | null
}
export type IdentidadIspEmpresa = {
  estadoLectura: 'ISP' | 'LOCAL' | 'ORIGEN_NO_VERIFICABLE'
  protegida: boolean; nombre: string; nif: string | null; primariaId: string | null
  identidadCrm: IdentidadCrm; cuentas: CuentaIspIdentidad[]; discrepancias: string[]; variasIdentidades: boolean
}
export type IspIdentidadReadDb = Pick<Prisma.TransactionClient, 'crmEmpresaCliente' | 'ispClienteArea1' | 'ispVinculoArea1'>
const READ_LIMIT = 501
const documentoComparable = (v: string | null | undefined) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const nombreComparable = (v: string | null | undefined) => (v || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-ES')
const iso = (v: Date | null | undefined) => v ? v.toISOString() : null
/** Misma evidencia persistida que el guard. Un string arbitrario/no vacío no acredita ISP. */
export function clienteWebEsIsp(c: { id?: number; ispGestionId?: string | null; clienteIdIsp?: string | null }, area1Linked = false): boolean {
  return persistedClienteOrigin(c, area1Linked) === 'source'
}
function documentoCuenta(c: Pick<CuentaIspIdentidad, 'cif' | 'nif' | 'docNormalizado'>) {
  const values = [c.cif, c.nif, c.docNormalizado].filter((x): x is string => Boolean(x?.trim()))
  const conflicto = new Set(values.map(documentoComparable)).size > 1
  return { documento: conflicto ? null : values[0] || null, conflictoDocumento: conflicto }
}
/** Directo primero; en empate conserva el orden ya leído. La primaria es trazabilidad, no fusión fiscal. */
export function proyectarIdentidadIsp(crm: IdentidadCrm, cuentasEntrada: Array<Omit<CuentaIspIdentidad, 'documento' | 'conflictoDocumento'>>): IdentidadIspEmpresa {
  const cuentas = cuentasEntrada.map(c => ({ ...c, ...documentoCuenta(c) }))
  const primaria = cuentas.find(c => c.enlace === 'directo') || cuentas[0] || null
  const identidades = new Set(cuentas.map(c => JSON.stringify([nombreComparable(c.nombre), documentoComparable(c.documento)])))
  const variantesRaw = new Set(cuentas.map(c => JSON.stringify([c.nombre, c.documento])))
  const variasIdentidades = identidades.size > 1 || variantesRaw.size > 1
  const discrepancias: string[] = []
  for (const c of cuentas) {
    if (nombreComparable(crm.nombre) !== nombreComparable(c.nombre)) discrepancias.push(`discrepancia con ISP: razón social de la cuenta ${c.codigo || c.id}; se conserva el dato CRM.`)
    if (!c.conflictoDocumento && documentoComparable(crm.nif) !== documentoComparable(c.documento)) discrepancias.push(`discrepancia con ISP: documento de la cuenta ${c.codigo || c.id}; se conserva el dato CRM.`)
    if (c.conflictoDocumento) discrepancias.push(`discrepancia con ISP: CIF/NIF/documento contradictorios en la cuenta ${c.codigo || c.id}; consulta los valores de origen.`)
  }
  if (variasIdentidades) discrepancias.push('Varias identidades ISP: las cuentas se muestran por separado; no hay una razón fiscal única.')
  return {
    estadoLectura: cuentas.length ? 'ISP' : 'LOCAL', protegida: cuentas.length > 0,
    nombre: variasIdentidades ? 'Varias identidades ISP' : primaria ? primaria.nombre || 'sin dato de ISP' : crm.nombre,
    nif: variasIdentidades ? null : primaria ? primaria.documento : crm.nif,
    primariaId: primaria?.id || null, identidadCrm: { ...crm }, cuentas, discrepancias, variasIdentidades,
  }
}
/** Consulta por IDs/enlaces reales. Los CONFIRMADO deben seguir enlazados al destino efectivo.
 * La clave ispGestionId sólo se usa desde una cuenta persistida source efectivamente ligada.
 * No acepta propuestas pendientes, vínculos vía persona ni matches de nombre/NIF/código.
 */
export async function leerIdentidadIspEmpresa(db: IspIdentidadReadDb, empresaId: string, crm: IdentidadCrm) {
  if (typeof empresaId !== 'string' || !empresaId) throw new IspIdentidadNoEditableError()
  const links = await db.crmEmpresaCliente.findMany({ where: { empresaId }, orderBy: { clienteId: 'asc' }, take: READ_LIMIT, include: { cliente: { select: {
    id: true, ispGestionId: true, clienteIdIsp: true, codigo: true, nombre: true, cif: true, nif: true, fechaAlta: true, fechaBaja: true, formaPago: true, activo: true,
  } } } })
  if (!Array.isArray(links) || links.length >= READ_LIMIT || links.some(l => !l.cliente || !Number.isSafeInteger(l.clienteId) || l.clienteId < 1 || l.cliente.id !== l.clienteId || l.empresaId !== empresaId)) throw new IspIdentidadNoEditableError()
  const webIds = links.map(l => l.clienteId)
  // Misma clave exacta que el core: clienteIdIsp/código/NIF/nombre no son joins alternativos.
  const sourceIds = [...new Set(links.filter(l => persistedClienteOrigin(l.cliente) === 'source').map(l => l.cliente.ispGestionId))]
  const snapshots = await db.ispClienteArea1.findMany({ where: { OR: [{ crmEmpresaId: empresaId }, ...(webIds.length ? [{ clienteWebId: { in: webIds } }] : []), ...(sourceIds.length ? [{ ispClienteId: { in: sourceIds } }] : [])] }, include: { contratos: true }, orderBy: { codigo: 'asc' }, take: READ_LIMIT })
  const confirmed = await db.ispVinculoArea1.findMany({ where: { destinoId: empresaId, tipo: { in: ['CRM_EMPRESA', 'CREAR_EMPRESA'] }, estado: 'CONFIRMADO' }, select: { ispClienteRowId: true }, take: READ_LIMIT })
  if (!Array.isArray(snapshots) || snapshots.length >= READ_LIMIT || !Array.isArray(confirmed) || confirmed.length >= READ_LIMIT) throw new IspIdentidadNoEditableError()
  for (const v of confirmed) if (!snapshots.some(s => s.id === v.ispClienteRowId && s.crmEmpresaId === empresaId)) throw new IspIdentidadNoEditableError()
  for (const l of links) if (persistedClienteOrigin(l.cliente, snapshots.some(s => s.clienteWebId === l.clienteId)) === 'unknown') throw new IspIdentidadNoEditableError()
  if (snapshots.some(s => typeof s.id !== 'string' || !s.id || typeof s.ispClienteId !== 'string' || !s.ispClienteId)) throw new IspIdentidadNoEditableError()
  const confirmedIds = new Set(confirmed.map(v => v.ispClienteRowId))
  const actualWebIds = new Set(links.filter(l => clienteWebEsIsp(l.cliente, snapshots.some(s => s.clienteWebId === l.clienteId))).map(l => l.clienteId))
  const isp = snapshots.filter(s => s.crmEmpresaId === empresaId || (s.clienteWebId != null && actualWebIds.has(s.clienteWebId)) || sourceIds.includes(s.ispClienteId))
  const cuentas: Array<Omit<CuentaIspIdentidad, 'documento' | 'conflictoDocumento'>> = isp.map(s => ({
    id: s.id, fuente: 'area1', enlace: s.crmEmpresaId === empresaId ? 'directo' : confirmedIds.has(s.id) ? 'confirmado' : 'legacy',
    ispClienteId: s.ispClienteId, clienteWebId: s.clienteWebId, codigo: s.codigo, nombre: s.nombre,
    cif: s.cif, nif: s.nif, docNormalizado: s.docNormalizado, presente: s.presenteEnUltimoFichero,
    fechaInicio: iso(s.fechaInicio), fechaFin: iso(s.fechaFin), importacionId: s.ultimaImportacionId,
  }))
  const clientes = links.filter(l => actualWebIds.has(l.clienteId)).map(l => l.cliente)
  for (const c of clientes) if (!isp.some(s => s.clienteWebId === c.id || (sourceIds.includes(c.ispGestionId) && s.ispClienteId === c.ispGestionId))) cuentas.push({
    id: `legacy:${c.id}`, fuente: 'legacy', enlace: 'legacy', ispClienteId: c.ispGestionId, clienteWebId: c.id,
    codigo: c.codigo, nombre: c.nombre, cif: c.cif, nif: c.nif, docNormalizado: null, presente: null,
    fechaInicio: iso(c.fechaAlta), fechaFin: iso(c.fechaBaja), importacionId: null,
  })
  return { identidad: proyectarIdentidadIsp(crm, cuentas), isp, clientes }
}
export function identidadIspNoVerificable(crm: IdentidadCrm): IdentidadIspEmpresa {
  return { estadoLectura: 'ORIGEN_NO_VERIFICABLE', protegida: true, nombre: 'Origen ISP no verificable', nif: null, primariaId: null, identidadCrm: { ...crm }, cuentas: [], discrepancias: ['Origen no verificable: no se habilita la edición de razón social/NIF.'], variasIdentidades: false }
}
/** PATCH legacy: igualdad raw probada se omite; el payload mixto con cambio efectivo se rechaza entero. */
export class IspIdentidadNoEditableError extends Error {
  readonly code = 'ISP_ORIGEN_NO_EDITABLE'
  readonly status = 409
  constructor() { super('La identidad de origen ISP no se puede editar desde el CRM.') }
}
export function camposPanelSinIdentidadIsp<T extends Record<string, unknown>>(fields: T, previous: Record<string, unknown>, protegida: boolean): T {
  const out = { ...fields }
  if (!protegida) return out
  for (const key of ['nombre', 'nif', 'nifNormalizado']) if (Object.hasOwn(out, key)) {
    if (out[key] !== previous[key]) throw new IspIdentidadNoEditableError()
    delete out[key]
  }
  return out
}
