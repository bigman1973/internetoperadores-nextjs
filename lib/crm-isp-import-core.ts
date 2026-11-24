/**
 * Área 1 · CRM · Núcleo puro del importador del fichero de ISP Gestión.
 *
 * Sin Prisma ni red: lee el libro, normaliza y calcula huellas, consentimiento
 * de marketing y propuestas de vínculo. Lo usan la API del superadmin y las
 * pruebas sintéticas. ISP Gestión manda en clientes, contratos y facturación.
 */
import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'

export type Segmento = 'PARTICULAR' | 'EMPRESA' | 'PARTNER'
export type EstadoMarketing = 'APTO' | 'BAJA' | 'SIN_CONSENTIMIENTO' | 'SIN_EMAIL'
export type TipoVinculo = 'CLIENTE_WEB' | 'CRM_CONTACTO' | 'CRM_EMPRESA' | 'CREAR_CONTACTO' | 'CREAR_EMPRESA'
export type Confianza = 'ALTA' | 'MEDIA' | 'BAJA'

export const HOJAS = {
  clientes: 'Clientes',
  contratos: 'Contratos',
  facturacion: 'Facturacion_2026',
} as const

const COLUMNAS_CLIENTES = ['CODIGO', 'ID CLIENTES', 'NOMBRECOMPLETO', 'NOMBRE COMERCIAL', 'CIF', 'NIF', 'PERSONAFISICA', 'EMAIL', 'TELEFONO1', 'MOVIL', 'RECIBEPUBLICIDAD']
const COLUMNAS_CONTRATOS = ['ESTADO', 'CLIENTE', 'DNI/CIF', 'SERIE', 'Nº CONTRATO', 'TARIFA', 'IMPORTE (sin IVA)', 'FECHA ALTA', 'FECHA BAJA', 'PROVEEDOR']

export class ErrorFicheroIsp extends Error {
  constructor(public codigo: string, mensaje: string) { super(mensaje) }
}

export type ClienteIsp = {
  ispClienteId: string
  codigo: string
  nombre: string
  nombreComercial: string | null
  cif: string | null
  nif: string | null
  docNormalizado: string | null
  personaFisica: boolean
  segmentoCrm: Segmento
  tipoEmpresa: 'SOCIEDAD' | 'AUTONOMO' | null
  categoria: number | null
  email: string | null
  emails: string[]
  telefono: string | null
  movil: string | null
  domicilio: string | null
  numero: string | null
  piso: string | null
  puerta: string | null
  codigoPostal: string | null
  municipio: string | null
  provincia: string | null
  pais: string | null
  comercial: number | null
  agente: number | null
  fechaInicio: string | null
  fechaFin: string | null
  facturaMail: boolean
  recibePublicidadIsp: boolean
  idioma: string | null
  baneado: boolean
  huella: string
}

export type ContratoIsp = {
  ispContratoId: number
  codigoContratoIsp: string
  serie: string | null
  clienteNombreFichero: string
  docNormalizado: string | null
  estado: string
  activo: boolean
  tarifa: string | null
  descripcion: string | null
  lineaAsociada: string | null
  importeSinIva: string | null
  descuento: string | null
  velocidad: string | null
  fechaAlta: string | null
  fechaBaja: string | null
  permanenciaHasta: string | null
  permanenciaTexto: string | null
  periodicidad: string | null
  formaPago: string | null
  proveedor: string | null
  identificadorOperador: string | null
  observaciones: string | null
  huella: string
}

export type FacturacionIsp = { codigoCliente: string; anio: number; mes: number; importeBase: string }

export type FicheroIsp = {
  hash: string
  bytes: number
  clientes: ClienteIsp[]
  contratos: ContratoIsp[]
  facturacion: FacturacionIsp[]
  avisos: Record<string, number>
}

// ---------------------------------------------------------------- normalización
export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s ? s : null
}
export function normalizarDocumento(v: unknown): string | null {
  let s = String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (s.startsWith('ES') && s.length === 11) s = s.slice(2)
  return s || null
}
/** CIF de persona jurídica: empieza por letra de sociedad (no DNI ni NIE). */
export function esCifSociedad(doc: string | null): boolean {
  return Boolean(doc && /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(doc))
}
export function normalizarEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  return /^[^@\s;,]+@[^@\s;,]+\.[a-z]{2,}$/.test(s) ? s : null
}
export function extraerEmails(v: unknown): string[] {
  const out: string[] = []
  for (const parte of String(v ?? '').split(/[;,\s]+/)) {
    const e = normalizarEmail(parte)
    if (e && !out.includes(e)) out.push(e)
  }
  return out
}
export function normalizarTelefono(v: unknown): string | null {
  let s = String(v ?? '').replace(/\D/g, '')
  if (s.startsWith('34') && s.length === 11) s = s.slice(2)
  return s.length >= 9 ? s : null
}
export function normalizarNombre(v: unknown): string | null {
  const s = String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/\b(S\.?L\.?U?|S\.?A\.?U?|S\.?C\.?P|S\.?COOP|SLL|SLP)\b\.?/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ').trim()
  return s || null
}
function entero(v: unknown): number | null {
  const s = texto(v)
  if (!s || !/^-?\d+$/.test(s)) return null
  return Number(s)
}
function booleano(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'si' || s === 'sí' || s === 's'
}
/** Fecha ISO (YYYY-MM-DD) desde texto ISO, dd/mm/aaaa o número de serie de Excel. */
export function fecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = texto(v)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s))
    if (serial < 20000 || serial > 80000) return null
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  return null
}
/** Importe decimal como texto con 4 decimales (evita errores de coma flotante). */
export function decimal(v: unknown, decimales = 4): string | null {
  const s = texto(v)
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return n.toFixed(decimales)
}
export function huella(valor: unknown): string {
  return createHash('sha256').update(JSON.stringify(valor)).digest('hex')
}

export function segmentoDe(personaFisica: boolean, doc: string | null): { segmento: Segmento; tipoEmpresa: 'SOCIEDAD' | 'AUTONOMO' | null } {
  if (esCifSociedad(doc)) return { segmento: 'EMPRESA', tipoEmpresa: 'SOCIEDAD' }
  if (!personaFisica) return { segmento: 'EMPRESA', tipoEmpresa: 'AUTONOMO' }
  return { segmento: 'PARTICULAR', tipoEmpresa: null }
}

// ---------------------------------------------------------------- lectura
type Fila = Record<string, unknown>
function filas(libro: XLSX.WorkBook, hoja: string, obligatorias: string[]): Fila[] {
  const ws = libro.Sheets[hoja]
  if (!ws) throw new ErrorFicheroIsp('HOJA_FALTA', `Falta la hoja «${hoja}».`)
  const datos = XLSX.utils.sheet_to_json<Fila>(ws, { defval: null, raw: true })
  const cabecera = new Set(Object.keys(datos[0] || {}))
  const faltan = obligatorias.filter((c) => !cabecera.has(c))
  if (faltan.length) throw new ErrorFicheroIsp('COLUMNAS_FALTAN', `La hoja «${hoja}» no tiene las columnas: ${faltan.join(', ')}.`)
  return datos.filter((f) => Object.values(f).some((v) => v !== null && String(v).trim() !== ''))
}

export function leerFicheroIsp(buffer: Buffer | Uint8Array): FicheroIsp {
  const bytes = buffer.byteLength
  if (bytes === 0) throw new ErrorFicheroIsp('FICHERO_VACIO', 'El fichero está vacío.')
  if (bytes > 15 * 1024 * 1024) throw new ErrorFicheroIsp('FICHERO_GRANDE', 'El fichero supera 15 MB.')
  let libro: XLSX.WorkBook
  try {
    libro = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellFormula: false, cellHTML: false })
  } catch {
    throw new ErrorFicheroIsp('FICHERO_ILEGIBLE', 'No es un libro XLSX legible.')
  }
  const avisos: Record<string, number> = {}
  const aviso = (k: string) => { avisos[k] = (avisos[k] || 0) + 1 }

  const clientes: ClienteIsp[] = []
  const vistos = new Set<string>()
  for (const f of filas(libro, HOJAS.clientes, COLUMNAS_CLIENTES)) {
    const ispClienteId = texto(f['ID CLIENTES'])
    const codigo = texto(f['CODIGO'])
    const nombre = texto(f['NOMBRECOMPLETO'])
    if (!ispClienteId || !codigo || !nombre) { aviso('clientes_sin_clave'); continue }
    if (vistos.has(ispClienteId)) { aviso('clientes_id_repetido'); continue }
    vistos.add(ispClienteId)
    const cif = texto(f['CIF']), nif = texto(f['NIF'])
    const docNormalizado = normalizarDocumento(cif) || normalizarDocumento(nif)
    const personaFisica = booleano(f['PERSONAFISICA'])
    const { segmento, tipoEmpresa } = segmentoDe(personaFisica, docNormalizado)
    const emails = extraerEmails(f['EMAIL'])
    const base = {
      ispClienteId, codigo, nombre,
      nombreComercial: texto(f['NOMBRE COMERCIAL']), cif, nif, docNormalizado, personaFisica,
      segmentoCrm: segmento, tipoEmpresa,
      categoria: entero(f['CATEGORIA']),
      email: emails[0] || null, emails,
      telefono: normalizarTelefono(f['TELEFONO1']), movil: normalizarTelefono(f['MOVIL']),
      domicilio: texto(f['DOMICILIO']), numero: texto(f['NUMERO']), piso: texto(f['PISO']), puerta: texto(f['PUERTA']),
      codigoPostal: texto(f['POSTAL']), municipio: texto(f['MUNICIPIO']), provincia: texto(f['PROVINCIA']), pais: texto(f['PAIS']),
      comercial: entero(f['COMERCIAL']), agente: entero(f['AGENTE']),
      fechaInicio: fecha(f['FECHA INICIO']), fechaFin: fecha(f['FECHA FIN']),
      facturaMail: booleano(f['FACTURA MAIL']), recibePublicidadIsp: booleano(f['RECIBEPUBLICIDAD']),
      idioma: texto(f['IDIOMA']), baneado: booleano(f['BANEADO']),
    }
    if (!docNormalizado) aviso('clientes_sin_nif')
    if (!emails.length) aviso('clientes_sin_email')
    if (!base.telefono && !base.movil) aviso('clientes_sin_telefono')
    clientes.push({ ...base, huella: huella(base) })
  }
  const porCodigo = new Map<string, number>()
  for (const c of clientes) porCodigo.set(c.codigo, (porCodigo.get(c.codigo) || 0) + 1)
  for (const n of porCodigo.values()) if (n > 1) aviso('codigo_cliente_repetido')

  const contratos: ContratoIsp[] = []
  const contratosVistos = new Set<number>()
  for (const f of filas(libro, HOJAS.contratos, COLUMNAS_CONTRATOS)) {
    const id = entero(f['Nº CONTRATO'])
    const cliente = texto(f['CLIENTE'])
    if (id === null || !cliente) { aviso('contratos_sin_clave'); continue }
    if (contratosVistos.has(id)) { aviso('contratos_id_repetido'); continue }
    contratosVistos.add(id)
    const estado = texto(f['ESTADO']) || 'Desconocido'
    const permanencia = texto(f['PERMANENCIA'])
    const permanenciaHasta = permanencia && /^\d{5}/.test(permanencia) ? fecha(permanencia) : null
    const base = {
      ispContratoId: id, codigoContratoIsp: String(id), serie: texto(f['SERIE']),
      clienteNombreFichero: cliente, docNormalizado: normalizarDocumento(f['DNI/CIF']),
      estado, activo: !/baja/i.test(estado),
      tarifa: texto(f['TARIFA']), descripcion: texto(f['DESCRIPCIÓN /UBICACIÓN']), lineaAsociada: texto(f['LÍNEA ASOCIADA']),
      importeSinIva: decimal(f['IMPORTE (sin IVA)']), descuento: decimal(f['DESCUENTO']),
      velocidad: texto(f['VELOCIDAD']), fechaAlta: fecha(f['FECHA ALTA']), fechaBaja: fecha(f['FECHA BAJA']),
      permanenciaHasta, permanenciaTexto: permanenciaHasta ? null : permanencia,
      periodicidad: texto(f['PERIORICIDAD']), formaPago: texto(f['FORMA DE PAGO']), proveedor: texto(f['PROVEEDOR']),
      identificadorOperador: texto(f['IDENTIFICADOR OPERADOR']), observaciones: texto(f['OBSERVACIONES']),
    }
    contratos.push({ ...base, huella: huella(base) })
  }

  const facturacion: FacturacionIsp[] = []
  const wsFact = libro.Sheets[HOJAS.facturacion]
  if (wsFact) {
    const datos = XLSX.utils.sheet_to_json<Fila>(wsFact, { defval: null, raw: true })
    const columnasMes = Object.keys(datos[0] || {}).map((k) => ({ k, m: k.match(/^Fact (\d{4})-(\d{2})$/) })).filter((x) => x.m)
    if (!datos.length || !('CODIGO' in (datos[0] || {})) || !columnasMes.length) throw new ErrorFicheroIsp('COLUMNAS_FALTAN', 'La hoja «Facturacion_2026» necesita CODIGO y columnas «Fact AAAA-MM».')
    for (const f of datos) {
      const codigo = texto(f['CODIGO'])
      if (!codigo) continue
      for (const { k, m } of columnasMes) {
        const importe = decimal(f[k], 2)
        if (importe === null) continue
        facturacion.push({ codigoCliente: codigo, anio: Number(m![1]), mes: Number(m![2]), importeBase: importe })
      }
    }
  } else aviso('sin_hoja_facturacion')

  return { hash: createHash('sha256').update(buffer).digest('hex'), bytes, clientes, contratos, facturacion, avisos }
}

// ---------------------------------------------------------------- consentimiento
export type BajaConocida = { motivo: string }
/**
 * Las bajas prevalecen siempre: una baja registrada no la reactiva ningún
 * fichero posterior, y una baja en Brevo o en el CRM anula RECIBEPUBLICIDAD.
 */
export function estadoMarketing(
  cliente: Pick<ClienteIsp, 'emails' | 'recibePublicidadIsp'>,
  bajas: Map<string, BajaConocida>,
  anterior?: { estadoMarketing: string; bajaMarketingMotivo: string | null } | null,
): { estado: EstadoMarketing; motivo: string | null } {
  if (anterior?.estadoMarketing === 'BAJA') return { estado: 'BAJA', motivo: anterior.bajaMarketingMotivo || 'BAJA_PREVIA' }
  const baja = cliente.emails.map((e) => bajas.get(e)).find(Boolean)
  if (baja) return { estado: 'BAJA', motivo: baja.motivo }
  if (!cliente.emails.length) return { estado: 'SIN_EMAIL', motivo: null }
  if (!cliente.recibePublicidadIsp) {
    if (anterior?.estadoMarketing === 'APTO') return { estado: 'BAJA', motivo: 'ISP_RETIRA_PUBLICIDAD' }
    return { estado: 'SIN_CONSENTIMIENTO', motivo: null }
  }
  return { estado: 'APTO', motivo: null }
}

// ---------------------------------------------------------------- vínculos
export type IndicesCrm = {
  clientesWebPorIspId: Map<string, { id: number; codigo: string | null }>
  clientesWebPorCodigo: Map<string, number[]>
  clientesWebPorDoc: Map<string, number[]>
  contactosPorClienteWeb: Map<number, string[]>
  contactosPorEmail: Map<string, string[]>
  empresasPorClienteWeb: Map<number, string>
  empresasPorDoc: Map<string, string[]>
  empresasPorNombre: Map<string, string[]>
  /** emails presentes en clientes ISP con documento distinto: no son prueba de identidad */
  emailsCompartidos: Set<string>
  /** ficha de cliente del panel a la que ya pertenece cada contacto CRM */
  clienteWebDeContacto?: Map<string, number>
  /** fichas de cliente del panel que ya son la identidad de otra cuenta ISP */
  clientesWebOcupados?: Map<number, string>
}
/** Vínculos ya resueltos (por clave o por una persona) en importaciones anteriores. */
export type VinculoPrevio = { clienteWebId: number | null; crmContactoId: string | null; crmEmpresaId: string | null }
export type Propuesta = { tipo: TipoVinculo; destinoId: string; motivo: string; confianza: Confianza; detalle?: Record<string, unknown> }
export type ResultadoVinculo = {
  /** identidad por clave, no es una asociación nueva */
  clienteWebId: number | null
  /** vínculos que ya existían en el CRM y se reutilizan */
  crmContactoId: string | null
  crmEmpresaId: string | null
  propuestas: Propuesta[]
}

export function proponerVinculos(c: ClienteIsp, idx: IndicesCrm, previo?: VinculoPrevio | null): ResultadoVinculo {
  const propuestas: Propuesta[] = []
  let clienteWebId: number | null = null
  let crmContactoId: string | null = null
  let crmEmpresaId: string | null = null
  const add = (p: Propuesta) => { if (!propuestas.some((x) => x.tipo === p.tipo && x.destinoId === p.destinoId)) propuestas.push(p) }

  // 1. Ficha de cliente del panel: es la misma cuenta de ISP si coinciden ID y código.
  const porId = idx.clientesWebPorIspId.get(c.ispClienteId)
  const ocupado = (id: number) => { const o = idx.clientesWebOcupados?.get(id); return !!o && o !== c.ispClienteId }
  if (previo?.clienteWebId) clienteWebId = previo.clienteWebId
  else if (porId && porId.codigo === c.codigo) clienteWebId = porId.id
  else {
    if (porId && !ocupado(porId.id)) add({ tipo: 'CLIENTE_WEB', destinoId: String(porId.id), motivo: 'ID_ISP_CODIGO_DISTINTO', confianza: 'MEDIA' })
    for (const id of idx.clientesWebPorCodigo.get(c.codigo) || []) if (!ocupado(id)) add({ tipo: 'CLIENTE_WEB', destinoId: String(id), motivo: 'CODIGO', confianza: 'MEDIA' })
    const porDoc = c.docNormalizado ? idx.clientesWebPorDoc.get(c.docNormalizado) || [] : []
    for (const id of porDoc) if (!ocupado(id)) add({ tipo: 'CLIENTE_WEB', destinoId: String(id), motivo: 'NIF', confianza: porDoc.length === 1 ? 'MEDIA' : 'BAJA' })
  }

  // 2. Contacto CRM.
  const yaVinculados = previo?.crmContactoId ? [previo.crmContactoId] : clienteWebId ? idx.contactosPorClienteWeb.get(clienteWebId) || [] : []
  if (yaVinculados.length === 1) crmContactoId = yaVinculados[0]
  else for (const id of yaVinculados) add({ tipo: 'CRM_CONTACTO', destinoId: id, motivo: 'VARIOS_YA_VINCULADOS', confianza: 'MEDIA' })
  if (!yaVinculados.length) {
    let enOtroCliente = 0
    for (const email of c.emails) {
      const todos = idx.contactosPorEmail.get(email) || []
      // Un contacto que ya es de otra ficha de cliente no se puede reasignar: no se propone.
      const ids = todos.filter((id) => { const cw = idx.clienteWebDeContacto?.get(id); return !cw || cw === clienteWebId })
      enOtroCliente += todos.length - ids.length
      const fiable = ids.length === 1 && todos.length === 1 && !idx.emailsCompartidos.has(email)
      for (const id of ids) add({ tipo: 'CRM_CONTACTO', destinoId: id, motivo: 'EMAIL', confianza: fiable ? 'ALTA' : 'BAJA' })
    }
    if (!propuestas.some((p) => p.tipo === 'CRM_CONTACTO') && c.segmentoCrm === 'PARTICULAR' && (c.emails.length || c.telefono || c.movil)) {
      add(enOtroCliente
        ? { tipo: 'CREAR_CONTACTO', destinoId: 'NUEVO', motivo: 'EMAIL_EN_OTRO_CLIENTE', confianza: 'MEDIA' }
        : { tipo: 'CREAR_CONTACTO', destinoId: 'NUEVO', motivo: 'SIN_CANDIDATO', confianza: 'ALTA' })
    }
  }

  // 3. Empresas y autónomos.
  if (c.segmentoCrm === 'EMPRESA') {
    const existente = previo?.crmEmpresaId || (clienteWebId ? idx.empresasPorClienteWeb.get(clienteWebId) : undefined)
    if (existente) crmEmpresaId = existente
    else {
      const porDoc = c.docNormalizado ? idx.empresasPorDoc.get(c.docNormalizado) || [] : []
      for (const id of porDoc) add({ tipo: 'CRM_EMPRESA', destinoId: id, motivo: 'NIF', confianza: porDoc.length === 1 ? 'ALTA' : 'MEDIA' })
      if (!porDoc.length) {
        const nombres = [normalizarNombre(c.nombre), normalizarNombre(c.nombreComercial)].filter(Boolean) as string[]
        for (const n of nombres) for (const id of idx.empresasPorNombre.get(n) || []) add({ tipo: 'CRM_EMPRESA', destinoId: id, motivo: 'NOMBRE', confianza: 'BAJA' })
      }
      if (!propuestas.some((p) => p.tipo === 'CRM_EMPRESA')) {
        add({ tipo: 'CREAR_EMPRESA', destinoId: 'NUEVO', motivo: 'SIN_CANDIDATO', confianza: 'ALTA', detalle: { tipoEmpresa: c.tipoEmpresa } })
      }
    }
  }
  return { clienteWebId, crmContactoId, crmEmpresaId, propuestas }
}

/** Un contrato se asigna por NIF; si el NIF es de varias cuentas ISP, por NIF y nombre. */
export function asignarContrato(k: ContratoIsp, clientesPorDoc: Map<string, ClienteIsp[]>): { ispClienteId: string | null; asignacion: 'NIF' | 'NIF_NOMBRE' | 'AMBIGUO' | 'HUERFANO'; candidatos: string[] } {
  const cands = k.docNormalizado ? clientesPorDoc.get(k.docNormalizado) || [] : []
  if (cands.length === 1) return { ispClienteId: cands[0].ispClienteId, asignacion: 'NIF', candidatos: [] }
  if (!cands.length) return { ispClienteId: null, asignacion: 'HUERFANO', candidatos: [] }
  const nombre = normalizarNombre(k.clienteNombreFichero)
  const porNombre = cands.filter((c) => normalizarNombre(c.nombre) === nombre || normalizarNombre(c.nombreComercial) === nombre)
  if (porNombre.length === 1) return { ispClienteId: porNombre[0].ispClienteId, asignacion: 'NIF_NOMBRE', candidatos: [] }
  return { ispClienteId: null, asignacion: 'AMBIGUO', candidatos: cands.map((c) => c.codigo) }
}

export function indexarClientesPorDoc(clientes: ClienteIsp[]): Map<string, ClienteIsp[]> {
  const m = new Map<string, ClienteIsp[]>()
  for (const c of clientes) {
    for (const d of new Set([c.docNormalizado, normalizarDocumento(c.cif), normalizarDocumento(c.nif)].filter(Boolean) as string[])) {
      const l = m.get(d) || []
      l.push(c)
      m.set(d, l)
    }
  }
  return m
}

export function emailsCompartidosEntreDocumentos(clientes: ClienteIsp[]): Set<string> {
  const docs = new Map<string, Set<string>>()
  for (const c of clientes) for (const e of c.emails) {
    const s = docs.get(e) || new Set<string>()
    s.add(c.docNormalizado || c.ispClienteId)
    docs.set(e, s)
  }
  return new Set([...docs].filter(([, s]) => s.size > 1).map(([e]) => e))
}

export type Clasificacion = 'NUEVO' | 'ACTUALIZADO' | 'SIN_CAMBIOS'
export function clasificar<T extends { huella: string }>(nuevo: T, anterior?: { huella: string } | null): Clasificacion {
  if (!anterior) return 'NUEVO'
  return anterior.huella === nuevo.huella ? 'SIN_CAMBIOS' : 'ACTUALIZADO'
}
