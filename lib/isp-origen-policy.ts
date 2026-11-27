/** Pure ownership catalogue. Exact Prisma→physical names; no writes or server imports. */
export const ISP_ORIGEN_NO_EDITABLE = 'ISP_ORIGEN_NO_EDITABLE' as const
export class IspOrigenNoEditableError extends Error {
  readonly code = ISP_ORIGEN_NO_EDITABLE
  readonly status = 409
  readonly statusCode = 409
  constructor() { super(ISP_ORIGEN_NO_EDITABLE); this.name = 'IspOrigenNoEditableError' }
}
export function rejectIspOrigen(): never { throw new IspOrigenNoEditableError() }

function fields(spec: string): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(spec.trim().split(/\s+/).filter(Boolean).map(item => {
    const [name, column = name] = item.split(':'); return [name, column]
  })))
}
function entry(table: string, isp: string, panel = '', mixed = '', insertOnly = '') {
  return Object.freeze({ table, ispFields: fields(isp), panelFields: fields(panel), mixedFields: fields(mixed), insertOnly: Object.freeze(insertOnly.split(' ').filter(Boolean)) })
}
export const ISP_ORIGEN_CATALOG = Object.freeze({
  IspClienteArea1: entry('area1_isp_clientes',
    'ispClienteId:isp_cliente_id codigo nombre nombreComercial:nombre_comercial cif nif docNormalizado:doc_normalizado personaFisica:persona_fisica segmentoCrm:segmento_crm categoria email emails telefono movil domicilio numero piso puerta codigoPostal:codigo_postal municipio provincia pais comercial agente fechaInicio:fecha_inicio fechaFin:fecha_fin facturaMail:factura_mail recibePublicidadIsp:recibe_publicidad_isp idioma baneado huella presenteEnUltimoFichero:presente_en_ultimo_fichero primeraImportacionId:primera_importacion_id ultimaImportacionId:ultima_importacion_id',
    'clienteWebId:cliente_web_id crmContactoId:crm_contacto_id crmEmpresaId:crm_empresa_id',
    'estadoMarketing:estado_marketing bajaMarketingMotivo:baja_marketing_motivo bajaMarketingAt:baja_marketing_at', 'ispClienteId primeraImportacionId'),
  IspContratoArea1: entry('area1_isp_contratos',
    'ispContratoId:isp_contrato_id codigoContratoIsp:codigo_contrato_isp serie clienteNombreFichero:cliente_nombre_fichero docNormalizado:doc_normalizado estado activo tarifa descripcion lineaAsociada:linea_asociada importeSinIva:importe_sin_iva descuento velocidad fechaAlta:fecha_alta fechaBaja:fecha_baja permanenciaHasta:permanencia_hasta permanenciaTexto:permanencia_texto periodicidad formaPago:forma_pago proveedor identificadorOperador:identificador_operador observaciones huella presenteEnUltimoFichero:presente_en_ultimo_fichero ultimaImportacionId:ultima_importacion_id',
    'contratoServicioId:contrato_servicio_id', 'ispClienteRowId:isp_cliente_row_id asignacionCliente:asignacion_cliente candidatosCliente:candidatos_cliente', 'ispContratoId'),
  IspFacturacionMensualArea1: entry('area1_isp_facturacion_mensual',
    'codigoCliente:codigo_cliente anio mes importeBase:importe_base ultimaImportacionId:ultima_importacion_id', '', '', 'codigoCliente anio mes'),
  ClienteWeb: entry('clientes_web',
    'ispGestionId:isp_gestion_id clienteIdIsp:cliente_id_isp codigo nombre nif cif personaFisica:persona_fisica nombreComercial:nombre_comercial apellidos nombrePila:nombre_pila email telefono movil fax web movilSms:movil_sms tipoCalle:tipo_calle domicilio numero edificio bloque escalera piso puerta municipio localidad codigoPostal:codigo_postal provincia pais coordenadas cuentaCargo:cuenta_cargo cuentaContable:cuenta_contable formaPago:forma_pago tipoIva:tipo_iva facturaElectronica:factura_electronica facturaMail:factura_mail facturaPapel:factura_papel alertaFacturacion:alerta_facturacion representante cargoRepresentante:cargo_representante nifRepresentante:nif_representante oficinaContable:oficina_contable organoGestor:organo_gestor unidadTramitadora:unidad_tramitadora activo baneado fechaAlta:fecha_alta fechaBaja:fecha_baja idioma categoria',
    'passwordHash:password_hash ultimoAcceso:ultimo_acceso newsletterSuscrito:newsletter_suscrito segmentoCrm:segmento_crm segmentoCrmActualizadoAt:segmento_crm_actualizado_at segmentoCrmActualizadoPor:segmento_crm_actualizado_por',
    'comercial agente origen recibePublicidad:recibe_publicidad aceptoLopd:acepto_lopd', 'ispGestionId clienteIdIsp'),
  ContratoServicio: entry('contratos_servicio',
    'ispGestionContratoId:isp_gestion_contrato_id clienteId:cliente_id titulo tarifa precio importeRemesar:importe_remesar descuentoTotal:descuento_total fechaInicio:fecha_inicio fechaBaja:fecha_baja causaBaja:causa_baja conceptoFacturacion:concepto_facturacion permanencia fechaPermanencia:fecha_permanencia categoria tipoAlta:tipo_alta telefonosContrato:telefonos_contrato observaciones activo', '', '', 'ispGestionContratoId'),
  Factura: entry('facturas',
    'ispGestionId:isp_gestion_id serieFactura:serie_factura numeroDocumento:numero_documento documento fecha idCliente:id_cliente codigoCliente:codigo_cliente nombreCompleto:nombre_completo nifCif:nif_cif base totalImpuesto:total_impuesto total situacion totalPendiente:total_pendiente ejercicio',
    'remesaId:remesa_id', '', 'ispGestionId'),
  Remesa: entry('remesas',
    'ispGestionId:isp_gestion_id nombre fecha nifPresentador:nif_presentador nombrePresentador:nombre_presentador ibanAcreedor:iban_acreedor remesado contabilizado totalImporte:total_importe numeroRegistros:numero_registros archivoGenerado:archivo_generado ejercicio', '', '', 'ispGestionId'),
  FacturaEmitida: entry('facturas_emitidas',
    'cliente cif numFactura:num_factura serie fecha base tipoIva:tipo_iva importeIva:importe_iva total concepto origenSistema:origen_sistema idExterno:id_externo',
    'imputacion formaCobro:forma_cobro remesaRef:remesa_ref proyectoSingularId:proyecto_singular_id estado importeCobrado:importe_cobrado fechaCobro:fecha_cobro facturaISPId:factura_isp_id',
    'tipoIrpf:tipo_irpf importeIrpf:importe_irpf lineas fechaVencimiento:fecha_vencimiento', 'origenSistema idExterno'),
  CrmEmpresa: entry('crm_empresas', 'nombre nif nifNormalizado:nif_normalizado',
    'nombreComercial:nombre_comercial tipo segmentoCrm:segmento_crm dominio web telefono email sector direccion codigoPostal:codigo_postal localidad provincia pais descripcion activo version actualizadoPor:actualizado_por hubspotId:hubspot_id propiedadesHubspot:propiedades_hubspot sincronizadoAt:sincronizado_at origen'),
})
export type IspPolicyModel = keyof typeof ISP_ORIGEN_CATALOG
export const ISP_SOURCE_WRITERS = Object.freeze(['crm-xlsx', 'isp-clients', 'isp-contracts', 'isp-facturas', 'isp-remesas', 'finance-p2'] as const)
export type IspSourceWriter = typeof ISP_SOURCE_WRITERS[number]
const all = (model: IspPolicyModel) => Object.freeze(Object.keys(ISP_ORIGEN_CATALOG[model].ispFields))
const p2FacturaUpdate = Object.freeze(['serieFactura', 'numeroDocumento', 'documento', 'fecha', 'idCliente', 'codigoCliente', 'nombreCompleto', 'nifCif', 'ejercicio'])
export const ISP_LEGACY_FISCAL_HEADER = Object.freeze(['cliente', 'cif', 'numFactura', 'serie', 'fecha', 'base', 'tipoIva', 'importeIva', 'total', 'concepto'] as const)
const legacyInitialFields = Object.freeze([...ISP_LEGACY_FISCAL_HEADER, 'origenSistema', 'idExterno', 'tipoIrpf', 'importeIrpf', 'estado', 'importeCobrado', 'fechaCobro'])
const contractDerivedFields = Object.freeze(['ispClienteRowId', 'asignacionCliente', 'candidatosCliente'])
export const ISP_SOURCE_WRITE_ALLOWLIST = Object.freeze({
  'crm-xlsx': Object.freeze({ IspClienteArea1: all('IspClienteArea1'), IspContratoArea1: all('IspContratoArea1'), IspFacturacionMensualArea1: all('IspFacturacionMensualArea1') }),
  'isp-clients': Object.freeze({ ClienteWeb: all('ClienteWeb') }),
  'isp-contracts': Object.freeze({ ContratoServicio: all('ContratoServicio') }),
  'isp-facturas': Object.freeze({ Factura: all('Factura'), FacturaEmitida: legacyInitialFields }),
  'isp-remesas': Object.freeze({ Remesa: all('Remesa') }),
  'finance-p2': Object.freeze({ Factura: all('Factura'), FacturaEmitida: Object.freeze([...all('FacturaEmitida'), 'tipoIrpf', 'importeIrpf', 'estado', 'importeCobrado', 'fechaCobro', 'facturaISPId']) }),
})
export function sourceWriterFields(writer: IspSourceWriter, model: string, create: boolean): readonly string[] | null {
  const mapping = ISP_SOURCE_WRITE_ALLOWLIST[writer] as Readonly<Record<string, readonly string[]>> | undefined
  if (!mapping || !mapping[model]) return null
  if (writer === 'finance-p2' && model === 'FacturaEmitida' && !create) return null
  if (writer === 'finance-p2' && model === 'Factura' && !create) return p2FacturaUpdate
  if (writer === 'isp-facturas' && model === 'FacturaEmitida') return create ? legacyInitialFields : ISP_LEGACY_FISCAL_HEADER
  const catalogue = ISP_ORIGEN_CATALOG[model as IspPolicyModel]
  if (writer === 'crm-xlsx' && model === 'IspContratoArea1') return [...mapping[model].filter(field => create || !catalogue.insertOnly.includes(field)), ...(create ? ['id'] : []), ...contractDerivedFields]
  if (create && writer === 'crm-xlsx') return [...mapping[model], 'id']
  // Non-null authentication requirement on a new account only. Never a refresh permission.
  if (create && writer === 'isp-clients' && model === 'ClienteWeb') return [...mapping[model], 'passwordHash']
  return create ? mapping[model] : mapping[model].filter(field => !catalogue.insertOnly.includes(field))
}
/** Only a persisted local UUID identity and absence of external ID establishes manual ownership. */
export function persistedClienteOrigin(row: { id?: unknown; ispGestionId?: unknown; clienteIdIsp?: unknown }, area1Linked = false): 'manual' | 'source' | 'unknown' {
  if (!Number.isSafeInteger(row.id) || Number(row.id) < 1) return 'unknown'
  if (area1Linked) return 'source'
  const id = row.ispGestionId
  if (typeof id === 'string' && /^manual-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    && (row.clienteIdIsp === null || row.clienteIdIsp === undefined || row.clienteIdIsp === '')) return 'manual'
  if (typeof id === 'string' && /^[1-9][0-9]*$/.test(id)) return 'source'
  return 'unknown'
}
export function isIspMirror(row: { origenSistema?: unknown; idExterno?: unknown; facturaISPId?: unknown }): boolean {
  // Suspicious external provenance also protects the header; it never grants a loader permission.
  return row.facturaISPId != null || row.idExterno != null
    || (typeof row.origenSistema === 'string' && /isp/i.test(row.origenSistema))
}
export const ISP_CRM_ALIASES = Object.freeze(['nombre', 'nif', 'nifNormalizado'] as const)
export type IspIdentityAccount = Readonly<{ id: string | number; fuente?: string; nombre?: string | null; nif?: string | null; cif?: string | null; docNormalizado?: string | null; codigo?: string | null; [key: string]: unknown }>
export type IspIdentityResolution = Readonly<{ linked: boolean; nombre: string | null; nif: string | null; cuentas: readonly IspIdentityAccount[]; conflictos: readonly string[]; identidadCrm: Readonly<{ nombre?: string | null; nif?: string | null }>; multiplesIdentidades: boolean }>
const doc = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[\s.-]/g, '')
const name = (value: string | null | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es')
/** Accounts must be accredited by the server reader; this pure function cannot establish ownership. */
export function resolverIdentidadIsp(crm: Readonly<{ nombre?: string | null; nif?: string | null }>, cuentas: readonly IspIdentityAccount[]): IspIdentityResolution {
  const conflicts = new Set<string>()
  const names = new Set(cuentas.map(c => name(c.nombre)))
  const documents = cuentas.map(c => {
    const values = [c.cif, c.nif, c.docNormalizado].filter(v => typeof v === 'string' && v.trim()) as string[]
    if (new Set(values.map(doc)).size > 1) conflicts.add('DOCUMENTOS_ISP_CONTRADICTORIOS')
    return values[0] ?? null
  })
  const docs = new Set(documents.map(doc))
  if (names.size > 1) conflicts.add('MULTIPLES_NOMBRES_ISP')
  if (docs.size > 1) conflicts.add('MULTIPLES_DOCUMENTOS_ISP')
  if (cuentas.some(c => name(c.nombre) !== name(crm.nombre))) conflicts.add('NOMBRE_CRM_DISCREPANTE')
  if (documents.some(d => doc(d) !== doc(crm.nif))) conflicts.add('DOCUMENTO_CRM_DISCREPANTE')
  const multiple = names.size > 1 || docs.size > 1 || conflicts.has('DOCUMENTOS_ISP_CONTRADICTORIOS')
  // Do not elect an arbitrary raw spelling, first row or commercial alias as truth.
  const rawNames = new Set(cuentas.map(c => c.nombre ?? null))
  const rawDocs = new Set(documents)
  return Object.freeze({ linked: cuentas.length > 0,
    nombre: cuentas.length ? (rawNames.size === 1 ? cuentas[0].nombre ?? null : null) : crm.nombre ?? null,
    nif: cuentas.length ? (rawDocs.size === 1 && !conflicts.has('DOCUMENTOS_ISP_CONTRADICTORIOS') ? documents[0] : null) : crm.nif ?? null,
    cuentas: Object.freeze([...cuentas]), conflictos: Object.freeze([...conflicts]), identidadCrm: Object.freeze({ ...crm }), multiplesIdentidades: multiple })
}
