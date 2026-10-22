'use client'

/** Contratos de lectura y escritura que consume RemesasWorkspace.
 * No contienen Prisma, Node crypto ni efectos de red.
 */

export const B6_AREA_PERMISO = 'admin.finanzas.conciliacion'
export const B6_PAGE_SIZE = 100
/** Límite de la ruta B6 para los catálogos paginados. */
export const B6_MAX_OFFSET = 100_000
/** La fuente específica de membresías B6 no puede superar este número de filas. */
export const B6_MAX_MIEMBROS_REMESA = 2_000
export const B6_MAX_QUERY_LENGTH = 120
export const B6_FACTURAS_SOURCE_HASH_VERSION = 'B6_FACTURAS_SOURCE_V1'

export type FuenteFechaB6 = Readonly<{
  iso: string | null
  exacta: boolean
  codigoFuente: string | null
}>

export type FuenteImporteB6 = Readonly<{
  texto: string | null
  centimos: number | null
  exacto: boolean
  codigoFuente: string | null
}>

export type PaginacionB6 = Readonly<{
  limit: number
  offset: number
  total: number
}>

export type FuenteRemesaB6 = Readonly<{
  totalCentimos: number
  sourceFingerprintSHA256: string
}>

export type RemesaB6 = Readonly<{
  id: number
  ispGestionId: number
  nombre: string | null
  fecha: FuenteFechaB6
  importe: FuenteImporteB6
  numeroRegistros: number | null
  targetSource: FuenteRemesaB6 | null
}>

export type FuenteFacturaB6 = Readonly<{
  id: number
  ispGestionId: number
  fecha: string
  totalCentimos: number
  sourceFingerprintSHA256: string
}>

export type FacturaEmitidaActualB6 = Readonly<{
  id: string
  importe: FuenteImporteB6
  coincideConISP: boolean
}>

export type FacturaISPChoiceB6 = Readonly<{
  id: number
  ispGestionId: number
  serieFactura: string | null
  numeroDocumento: string | null
  nombreCompleto: string | null
  codigoCliente: string | null
  fecha: FuenteFechaB6
  importe: FuenteImporteB6
  remesaId: number | null
  facturaEmitidaActual: FacturaEmitidaActualB6 | null
  source: FuenteFacturaB6 | null
  tieneEvidenciaDirectaB4: boolean
}>

/** La ruta que añadirá el padre debe devolver únicamente líneas B4 REMESA candidatas. */
export type DevolucionB4B6 = Readonly<{
  vinculoId: string
  movimientoId: string
  remesaId: number
  fecha: string
  concepto: string
  importeDocumentoCentimos: number
  importeBancoCentimos: number
  facturaAsignadaId: null
}>

export type RemesasListaResponseB6 = Readonly<{
  recurso: 'remesasLista'
  paginacion: PaginacionB6
  items: readonly RemesaB6[]
}>

export type FacturasISPChoicesResponseB6 = Readonly<{
  recurso: 'facturasISPchoices'
  remesaId: number | null
  paginacion: PaginacionB6
  items: readonly FacturaISPChoiceB6[]
}>

/**
 * Lectura autoritativa de la membresía existente de una remesa. Sus filas
 * conservan la fuente que debe participar en el hash, independientemente del
 * catálogo paginado de candidatas.
 */
export type MiembrosRemesaResponseB6 = Readonly<{
  recurso: 'miembrosRemesa'
  remesaId: number
  paginacion: PaginacionB6
  items: readonly FacturaISPChoiceB6[]
}>

export type DevolucionesB4ResponseB6 = Readonly<{
  recurso: 'devolucionesB4'
  paginacion: PaginacionB6
  items: readonly DevolucionB4B6[]
}>

export type AsociarFacturasPayloadB6 = Readonly<{
  action: 'asociar_facturas'
  remesaId: number
  facturaIdsISP: readonly number[]
  confirmacion: true
  idempotencyKey: string
  expectedRemesaTotalCentimos: number
  expectedRemesaHashSHA256: string
  expectedFacturasHashSHA256: string
}>

export type AsociarDevolucionPayloadB6 = Readonly<{
  action: 'asociar_devolucion'
  remesaId: number
  facturaISPId: number
  vinculoId: string
  movimientoId: string
  confirmacion: true
  idempotencyKey: string
}>

export type RevisionFacturasB6 = Readonly<{
  clase: 'facturas'
  payload: AsociarFacturasPayloadB6
  facturas: readonly FacturaISPChoiceB6[]
  sumaFacturasCentimos: number
  totalRemesaCentimos: number
  cierreExacto: boolean
  advertenciasB4Directas: readonly FacturaISPChoiceB6[]
}>

export type RevisionDevolucionB6 = Readonly<{
  clase: 'devolucion'
  payload: AsociarDevolucionPayloadB6
  linea: DevolucionB4B6
  factura: FacturaISPChoiceB6
}>

export type AvisoB6 = Readonly<{
  tipo: 'success' | 'error' | 'info' | 'warning'
  texto: string
}>
