/**
 * Área 1 · Batería sintética del importador ISP → CRM.
 * Sin datos reales, sin credenciales, sin BD ni red: libro XLSX generado en memoria
 * y dobles en memoria de Prisma y de fetch.
 * Ejecutar: pnpm exec tsx scripts/test-area1-isp-import.ts
 */
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  asignarContrato, esCifSociedad, estadoMarketing, extraerEmails, fecha, indexarClientesPorDoc, leerFicheroIsp,
  normalizarDocumento, normalizarTelefono, proponerVinculos, segmentoDe, ErrorFicheroIsp, type IndicesCrm,
} from '../lib/crm-isp-import-core'
import { bajasBrevo, planificarImportacion } from '../lib/crm-isp-import'

let pruebas = 0
const prueba = async (nombre: string, fn: () => unknown | Promise<unknown>) => { await fn(); pruebas++; console.log(`ok - ${nombre}`) }

const CAB_CLIENTES = ['CODIGO', 'ID CLIENTES', 'NOMBRECOMPLETO', 'NOMBRE COMERCIAL', 'CIF', 'NIF', 'PERSONAFISICA', 'CATEGORIA', 'EMAIL', 'TELEFONO1', 'MOVIL', 'DOMICILIO', 'NUMERO', 'PISO', 'PUERTA', 'POSTAL', 'LOCALIDAD', 'MUNICIPIO', 'PROVINCIA', 'PAIS', 'COMERCIAL', 'AGENTE', 'FECHA INICIO', 'FECHA FIN', 'FACTURA MAIL', 'RECIBEPUBLICIDAD', 'IDIOMA', 'COORDENADAS', 'NUMERO FACTURAS', 'TARIFA PRECIO', 'BANEADO']
const CAB_CONTRATOS = ['ESTADO', 'CLIENTE', 'DNI/CIF', 'SERIE', 'Nº CONTRATO', 'TARIFA', 'DESCRIPCIÓN /UBICACIÓN', 'LÍNEA ASOCIADA', 'IMPORTE (sin IVA)', 'DESCUENTO', 'VELOCIDAD', 'FECHA ALTA', 'FECHA BAJA', 'PERMANENCIA', 'PERIORICIDAD', 'FORMA DE PAGO', 'PROVEEDOR', 'IDENTIFICADOR OPERADOR', 'OBSERVACIONES']
const cliente = (o: Record<string, string>) => CAB_CLIENTES.map((c) => o[c] ?? '')
// Identidades ficticias: dominio .test reservado, documentos de prueba sin titular real.
const CLIENTES = [
  cliente({ CODIGO: '900001', 'ID CLIENTES': '9001', NOMBRECOMPLETO: 'Persona Sintética Uno', NIF: '00000001R', PERSONAFISICA: '1', EMAIL: 'uno@ejemplo.test', MOVIL: '600000001', RECIBEPUBLICIDAD: '1', 'FECHA INICIO': '2024-01-15', BANEADO: 'false' }),
  cliente({ CODIGO: '900002', 'ID CLIENTES': '9002', NOMBRECOMPLETO: 'Empresa Ficticia SL', CIF: 'B00000002', PERSONAFISICA: '0', EMAIL: 'admin@ficticia.test; facturas@ficticia.test', TELEFONO1: '+34 900 000 002', RECIBEPUBLICIDAD: '1', BANEADO: 'false' }),
  cliente({ CODIGO: '900003', 'ID CLIENTES': '9003', NOMBRECOMPLETO: 'Autonomo Sintetico', NIF: '00000003T', PERSONAFISICA: '0', EMAIL: 'baja@ejemplo.test', RECIBEPUBLICIDAD: '1', BANEADO: 'false' }),
  cliente({ CODIGO: '900004', 'ID CLIENTES': '9004', NOMBRECOMPLETO: 'Empresa Ficticia SL Sede 2', CIF: 'B00000002', PERSONAFISICA: '0', RECIBEPUBLICIDAD: '0', BANEADO: 'false' }),
]
const contrato = (o: Record<string, string>) => CAB_CONTRATOS.map((c) => o[c] ?? '')
const CONTRATOS = [
  contrato({ ESTADO: 'Activo', CLIENTE: 'Persona Sintética Uno', 'DNI/CIF': '00000001R', SERIE: 'CLL', 'Nº CONTRATO': '5001', TARIFA: 'Fibra prueba', 'IMPORTE (sin IVA)': '29.95', 'FECHA ALTA': '46000', PERMANENCIA: 'Sin permanencia', PERIORICIDAD: 'Mensual', PROVEEDOR: 'Proveedor X' }),
  contrato({ ESTADO: 'Baja definitiva', CLIENTE: 'Empresa Ficticia SL', 'DNI/CIF': 'B00000002', SERIE: 'CLL', 'Nº CONTRATO': '5002', 'IMPORTE (sin IVA)': '10.123456', 'FECHA BAJA': '46100', PERMANENCIA: '46500' }),
  contrato({ ESTADO: 'Activo', CLIENTE: 'Sin Coincidencia', 'DNI/CIF': 'B00000099', 'Nº CONTRATO': '5003', 'IMPORTE (sin IVA)': '5' }),
]
function libro(clientes = CLIENTES, contratos = CONTRATOS, sinHoja?: string): Buffer {
  const wb = XLSX.utils.book_new()
  if (sinHoja !== 'Clientes') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB_CLIENTES, ...clientes]), 'Clientes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB_CONTRATOS, ...contratos]), 'Contratos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CODIGO', 'Fact 2026-01', 'Fact 2026-02', 'Total 2026'], ['900001', 29.95, 29.95, 59.9], ['900002', 100, 0, 100]]), 'Facturacion_2026')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function indicesVacios(): IndicesCrm {
  return { clientesWebPorIspId: new Map(), clientesWebPorCodigo: new Map(), clientesWebPorDoc: new Map(), contactosPorClienteWeb: new Map(), contactosPorEmail: new Map(), empresasPorClienteWeb: new Map(), empresasPorDoc: new Map(), empresasPorNombre: new Map(), emailsCompartidos: new Set() }
}

/** Doble en memoria de las lecturas que hace planificarImportacion. */
function dbFicticia(estado: { isp?: any[]; contratos?: any[]; fact?: any[] } = {}) {
  const vacio = async () => []
  return {
    ispClienteArea1: { findMany: async () => estado.isp || [] },
    ispContratoArea1: { findMany: async () => estado.contratos || [] },
    ispFacturacionMensualArea1: { findMany: async () => estado.fact || [] },
    contratoServicio: { findMany: async () => [{ id: 77, ispGestionContratoId: 5001 }] },
    clienteWeb: { findMany: async () => [{ id: 1, ispGestionId: '9001', codigo: '900001', nif: '00000001R', cif: null }, { id: 2, ispGestionId: '9002', codigo: '000000', nif: null, cif: 'B00000002' }] },
    crmRegistroHubspot: { findMany: async () => [{ id: 'c1', email: 'uno@ejemplo.test', clienteWebId: 1 }, { id: 'c2', email: 'admin@ficticia.test', clienteWebId: null }] },
    crmEmpresa: { findMany: async () => [{ id: 'e1', nombre: 'Empresa Ficticia', nombreComercial: null, nif: 'B00000002', nifNormalizado: 'B00000002' }] },
    crmEmpresaCliente: { findMany: vacio },
  } as any
}

async function main() {
  await prueba('normaliza documentos, emails, teléfonos y fechas', () => {
    assert.equal(normalizarDocumento('es-b0000000-2'), 'B00000002')
    assert.equal(normalizarDocumento(' 00000001-r '), '00000001R')
    assert.deepEqual(extraerEmails('A@x.test; b@x.test, a@x.test no-es-email'), ['a@x.test', 'b@x.test'])
    assert.equal(normalizarTelefono('+34 600 00 00 01'), '600000001')
    assert.equal(normalizarTelefono('123'), null)
    assert.equal(fecha('46000'), '2025-12-09')
    assert.equal(fecha('2024-01-15'), '2024-01-15')
    assert.equal(fecha('Sin permanencia'), null)
  })
  await prueba('segmenta particular, sociedad y autónomo', () => {
    assert.equal(esCifSociedad('B00000002'), true)
    assert.equal(esCifSociedad('X0000000T'), false)
    assert.deepEqual(segmentoDe(true, '00000001R'), { segmento: 'PARTICULAR', tipoEmpresa: null })
    assert.deepEqual(segmentoDe(false, 'B00000002'), { segmento: 'EMPRESA', tipoEmpresa: 'SOCIEDAD' })
    assert.deepEqual(segmentoDe(false, '00000003T'), { segmento: 'EMPRESA', tipoEmpresa: 'AUTONOMO' })
  })
  await prueba('lee el libro y rechaza hojas o columnas que faltan', () => {
    const f = leerFicheroIsp(libro())
    assert.equal(f.clientes.length, 4)
    assert.equal(f.contratos.length, 3)
    assert.equal(f.facturacion.length, 4)
    assert.equal(f.clientes[1].emails.length, 2)
    assert.equal(f.contratos[1].activo, false)
    assert.equal(f.contratos[1].permanenciaHasta, '2027-04-23')
    assert.equal(f.contratos[1].importeSinIva, '10.1235')
    assert.equal(f.avisos.clientes_sin_email, 1)
    assert.throws(() => leerFicheroIsp(libro(CLIENTES, CONTRATOS, 'Clientes')), (e: unknown) => e instanceof ErrorFicheroIsp && e.codigo === 'HOJA_FALTA')
    assert.throws(() => leerFicheroIsp(Buffer.from('no es xlsx')), ErrorFicheroIsp)
  })
  await prueba('la huella es estable y el mismo fichero da el mismo hash', () => {
    const a = leerFicheroIsp(libro()), b = leerFicheroIsp(libro())
    assert.deepEqual(a.clientes.map((c) => c.huella), b.clientes.map((c) => c.huella))
  })
  await prueba('las bajas prevalecen siempre sobre RECIBEPUBLICIDAD', () => {
    const bajas = new Map([['baja@ejemplo.test', { motivo: 'BREVO_BLOQUEADO' }]])
    assert.deepEqual(estadoMarketing({ emails: ['uno@ejemplo.test'], recibePublicidadIsp: true }, bajas), { estado: 'APTO', motivo: null })
    assert.deepEqual(estadoMarketing({ emails: ['baja@ejemplo.test'], recibePublicidadIsp: true }, bajas), { estado: 'BAJA', motivo: 'BREVO_BLOQUEADO' })
    assert.equal(estadoMarketing({ emails: [], recibePublicidadIsp: true }, bajas).estado, 'SIN_EMAIL')
    assert.equal(estadoMarketing({ emails: ['uno@ejemplo.test'], recibePublicidadIsp: false }, bajas).estado, 'SIN_CONSENTIMIENTO')
    // Una baja anterior no la reactiva un fichero posterior.
    assert.equal(estadoMarketing({ emails: ['uno@ejemplo.test'], recibePublicidadIsp: true }, bajas, { estadoMarketing: 'BAJA', bajaMarketingMotivo: 'CRM_OPTOUT' }).estado, 'BAJA')
    // Retirar la publicidad en ISP tras haber estado apto cuenta como baja.
    assert.deepEqual(estadoMarketing({ emails: ['uno@ejemplo.test'], recibePublicidadIsp: false }, bajas, { estadoMarketing: 'APTO', bajaMarketingMotivo: null }), { estado: 'BAJA', motivo: 'ISP_RETIRA_PUBLICIDAD' })
  })
  await prueba('propone vínculos sin vincular nada dudoso', () => {
    const f = leerFicheroIsp(libro())
    const idx = indicesVacios()
    idx.clientesWebPorIspId.set('9001', { id: 1, codigo: '900001' })
    idx.contactosPorClienteWeb.set(1, ['c1'])
    idx.clientesWebPorIspId.set('9002', { id: 2, codigo: '000000' })
    idx.contactosPorEmail.set('admin@ficticia.test', ['c2'])
    idx.empresasPorDoc.set('B00000002', ['e1'])
    const uno = proponerVinculos(f.clientes[0], idx)
    assert.equal(uno.clienteWebId, 1)
    assert.equal(uno.crmContactoId, 'c1')
    assert.equal(uno.propuestas.length, 0)
    const dos = proponerVinculos(f.clientes[1], idx)
    assert.equal(dos.clienteWebId, null, 'ID igual pero código distinto: no es identidad')
    assert.ok(dos.propuestas.some((p) => p.tipo === 'CLIENTE_WEB' && p.motivo === 'ID_ISP_CODIGO_DISTINTO'))
    assert.ok(dos.propuestas.some((p) => p.tipo === 'CRM_CONTACTO' && p.destinoId === 'c2' && p.confianza === 'ALTA'))
    assert.ok(dos.propuestas.some((p) => p.tipo === 'CRM_EMPRESA' && p.destinoId === 'e1' && p.confianza === 'ALTA'))
    const tres = proponerVinculos(f.clientes[2], idx)
    assert.ok(tres.propuestas.some((p) => p.tipo === 'CREAR_EMPRESA' && (p.detalle as any).tipoEmpresa === 'AUTONOMO'))
    idx.emailsCompartidos.add('admin@ficticia.test')
    assert.equal(proponerVinculos(f.clientes[1], idx).propuestas.find((p) => p.tipo === 'CRM_CONTACTO')?.confianza, 'BAJA')
  })
  await prueba('no propone lo que ya es de otro cliente y respeta decisiones previas', () => {
    const f = leerFicheroIsp(libro())
    const idx = indicesVacios()
    idx.clienteWebDeContacto = new Map([['c9', 99]])
    idx.clientesWebOcupados = new Map([[2, '9999']])
    idx.clientesWebPorIspId.set('9002', { id: 2, codigo: '000000' })
    idx.contactosPorEmail.set('admin@ficticia.test', ['c9'])
    const dos = proponerVinculos(f.clientes[1], idx)
    assert.ok(!dos.propuestas.some((p) => p.tipo === 'CLIENTE_WEB'), 'la ficha 2 es identidad de otra cuenta ISP')
    assert.ok(!dos.propuestas.some((p) => p.tipo === 'CRM_CONTACTO'), 'el contacto c9 es de otra ficha de cliente')
    // Particular con email de un contacto ajeno: se propone crear, con confianza media.
    idx.contactosPorEmail.set('uno@ejemplo.test', ['c9'])
    const uno = proponerVinculos(f.clientes[0], idx)
    assert.deepEqual(uno.propuestas.filter((p) => p.tipo === 'CREAR_CONTACTO').map((p) => [p.motivo, p.confianza]), [['EMAIL_EN_OTRO_CLIENTE', 'MEDIA']])
    // Lo ya resuelto (por clave o por una persona) no vuelve a proponerse en la siguiente importación.
    const previo = { clienteWebId: 5, crmContactoId: 'c5', crmEmpresaId: 'e5' }
    const r = proponerVinculos(f.clientes[1], idx, previo)
    assert.deepEqual([r.clienteWebId, r.crmContactoId, r.crmEmpresaId, r.propuestas.length], [5, 'c5', 'e5', 0])
  })
  await prueba('asigna contratos por NIF, NIF+nombre, ambiguo y huérfano', () => {
    const f = leerFicheroIsp(libro())
    const porDoc = indexarClientesPorDoc(f.clientes)
    assert.equal(asignarContrato(f.contratos[0], porDoc).asignacion, 'NIF')
    assert.deepEqual(asignarContrato(f.contratos[1], porDoc), { ispClienteId: '9002', asignacion: 'NIF_NOMBRE', candidatos: [] })
    assert.equal(asignarContrato(f.contratos[2], porDoc).asignacion, 'HUERFANO')
    const ambiguo = { ...f.contratos[1], clienteNombreFichero: 'Otro nombre' }
    assert.equal(asignarContrato(ambiguo, porDoc).asignacion, 'AMBIGUO')
  })
  await prueba('planifica e idempotencia: reimportar el mismo fichero no cambia nada', async () => {
    const f = leerFicheroIsp(libro())
    const fuente = { bajas: new Map([['baja@ejemplo.test', { motivo: 'CRM_OPTOUT' }]]), brevoVerificado: false, brevoError: 'NO_CONSULTADO' }
    const p1 = await planificarImportacion(dbFicticia(), f, fuente)
    assert.equal(p1.resumen.clientes.NUEVO, 4)
    assert.equal(p1.resumen.contratos.NUEVO, 3)
    assert.equal(p1.resumen.facturacion.NUEVO, 4)
    assert.equal(p1.resumen.contratosConContratoServicio, 1)
    assert.equal(p1.resumen.marketing.BAJA, 1)
    assert.equal(p1.resumen.facturacionTotal, '159.90')
    const estado = {
      isp: p1.clientes.map((x) => ({ id: x.rowId, ispClienteId: x.c.ispClienteId, huella: x.c.huella, estadoMarketing: x.marketing.estado, bajaMarketingMotivo: x.marketing.motivo, presenteEnUltimoFichero: true })),
      contratos: p1.contratos.map((x) => ({ id: x.rowId, ispContratoId: x.k.ispContratoId, huella: x.k.huella, ispClienteRowId: x.ispClienteRowId, presenteEnUltimoFichero: true })),
      fact: f.facturacion.map((x) => ({ ...x, importeBase: x.importeBase })),
    }
    const p2 = await planificarImportacion(dbFicticia(estado), f, fuente)
    assert.deepEqual(p2.resumen.clientes, { NUEVO: 0, ACTUALIZADO: 0, SIN_CAMBIOS: 4, AUSENTE: 0 })
    assert.deepEqual(p2.resumen.contratos, { NUEVO: 0, ACTUALIZADO: 0, SIN_CAMBIOS: 3, AUSENTE: 0 })
    assert.deepEqual(p2.resumen.facturacion, { NUEVO: 0, ACTUALIZADO: 0, SIN_CAMBIOS: 4 })
    assert.deepEqual(p2.clientes.map((x) => x.rowId), p1.clientes.map((x) => x.rowId), 'las filas conservan su id')
    // Un cliente que desaparece del fichero se marca ausente, no se borra.
    const f3 = leerFicheroIsp(libro(CLIENTES.slice(0, 3)))
    const p3 = await planificarImportacion(dbFicticia(estado), f3, fuente)
    assert.equal(p3.resumen.clientes.AUSENTE, 1)
    assert.deepEqual(p3.ausentes.clientes, ['9004'])
  })
  await prueba('Brevo: solo GET, lee bloqueados y degrada sin clave', async () => {
    const metodos: string[] = []
    const fake = (async (url: string, init: any) => {
      metodos.push(init.method)
      if (String(url).includes('/v3/contacts')) return new Response(JSON.stringify({ contacts: [{ email: 'Baja@Ejemplo.test', emailBlacklisted: true }, { email: 'ok@ejemplo.test', emailBlacklisted: false }] }))
      return new Response(JSON.stringify({ contacts: [{ email: 'rebote@ejemplo.test', reason: { code: 'hardBounce' } }] }))
    }) as unknown as typeof fetch
    const r = await bajasBrevo(fake, 'clave-ficticia')
    assert.equal(r.verificado, true)
    assert.deepEqual([...r.bajas.keys()].sort(), ['baja@ejemplo.test', 'rebote@ejemplo.test'])
    assert.ok(metodos.every((m) => m === 'GET'))
    const sin = await bajasBrevo(fake, '')
    assert.equal(sin.verificado, false)
    assert.equal(sin.error, 'BREVO_API_KEY_NO_CONFIGURADA')
    const err = await bajasBrevo((async () => new Response('x', { status: 401 })) as unknown as typeof fetch, 'clave-ficticia')
    assert.equal(err.verificado, false)
  })
  console.log(`\n${pruebas} pruebas superadas`)
}

main().catch((e) => { console.error(e); process.exit(1) })
