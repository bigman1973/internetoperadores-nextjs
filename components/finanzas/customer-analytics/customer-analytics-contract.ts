/**
 * Adaptador UI del DTO estable de analítica de cliente. No importa Prisma ni
 * helpers de BD. Los importes siguen siendo cadenas de céntimos exactas.
 */
export type PhoneCostReasonCode = string;
export type CentsString = string;
export type PhoneBankStatus = 'NO_CALCULADO' | 'CALCULADO_SIN_ASIGNAR_COSTE';

export type CustomerPhoneRow = Readonly<{
  cliente: { id: number; nombre: string };
  ingresos: { baseCentimos: CentsString; facturas: number };
  coste: { asignablePropuestoCentimos: CentsString; confirmadoCentimos: CentsString | null; baseDocumentadaRelacionadaCentimos: CentsString | null; porcentajeAsignablePorCosteBaseBp: number | null; documentos: number; lineasPropuestas: number };
  margenConfirmado: { centimos: CentsString | null; porcentajeBp: number | null };
  margenPotencialEstimado: { centimos: CentsString | null; porcentajeBp: number | null; costeCompletoAsegurado: false };
  revision: { motivos: PhoneCostReasonCode[]; documentos: number; lineas: number };
}>;

export type PhoneCostDocumentRow = Readonly<{
  /** Identidad interna usada sólo para el enlace privado; jamás se imprime. */
  facturaId: string;
  /** Referencia humana opcional que proporciona el servidor; no se inventa. */
  numeroFactura: string | null;
  fecha: string;
  proveedor: string;
  baseFacturaCentimos: CentsString | null;
  costePropuestoCentimos: CentsString;
  baseNoAsignadaCentimos: CentsString | null;
  lineasDetectadas: number;
  lineasPropuestas: number;
  estado: 'PROPUESTA_PARCIAL' | 'SIN_PROPUESTA' | 'REVISION' | 'BASE_DESCONOCIDA';
  motivos: PhoneCostReasonCode[];
}>;

export type CustomerAnalyticsResponse = Readonly<{
  stagingOnly: true;
  automaticas: false;
  proposalsOnly: true;
  periodo: { desde: string; hasta: string; baseTemporal: 'fecha_factura' };
  proveedor: { clave: 'TELEFONICA'; documentosEncontrados: number; documentosIncluidos: number };
  totales: {
    ingresoBaseCentimos: CentsString; costeBaseDocumentadoCentimos: CentsString | null; costeAsignablePropuestoCentimos: CentsString; costeConfirmadoCentimos: CentsString | null; porcentajeAsignablePorCosteBaseBp: number | null;
    bolsaSinAsignar: { baseConocidaNoAsignadaCentimos: CentsString; documentosBaseConocidaNoAsignada: number; documentosImporteDesconocido: number; importeDesconocidoCentimos: null };
    margenConfirmado: { centimos: CentsString | null; porcentajeBp: number | null; caveat: string };
    margenPotencialEstimado: { centimos: CentsString | null; porcentajeBp: number | null; costeCompletoAsegurado: false; caveat: string };
    documentos: { total: number; conBaseConocida: number; conCosteLineaPropuesto: number };
    lineas: { detectadasConContexto: number; propuestas: number; enRevision: number };
  };
  clientes: CustomerPhoneRow[];
  documentos: PhoneCostDocumentRow[];
  deduplicacion: { documentosRecibidosExcluidos: number; facturasEmitidasEspejoNoSumadas: number; telefonosConContratoDuplicado: number; telefonosSinContratoVigente: number; contratosSinFechaInicio: number; contratosConFechaBajaNoDeterminable: number; clientesNoUnivocos: number; lineasRechazadasPorControlBase: number };
  bancoTelefono: { estado: PhoneBankStatus; usadoEnCoste: false; mensaje: string };
  avisos: PhoneCostReasonCode[];
}>;

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const cents = (value: unknown): value is CentsString => typeof value === 'string' && /^[+-]?\d+$/.test(value);
function object(value: unknown, field: string) { const parsed = record(value); if (!parsed) throw new Error(`${field} debe ser un objeto.`); return parsed; }
function text(value: unknown, field: string) { if (typeof value !== 'string') throw new Error(`${field} debe ser texto.`); return value; }
function nullableText(value: unknown, field: string) { if (value === null) return null; return text(value, field); }
function integer(value: unknown, field: string) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${field} debe ser un entero no negativo.`); return value; }
function nullableCents(value: unknown, field: string): CentsString | null { if (value === null) return null; if (!cents(value)) throw new Error(`${field} debe ser una cadena de céntimos o null.`); return value; }
function strictCents(value: unknown, field: string): CentsString { if (!cents(value)) throw new Error(`${field} debe ser una cadena de céntimos.`); return value; }
function nullableBp(value: unknown, field: string): number | null { if (value === null) return null; if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${field} debe ser puntos básicos enteros o null.`); return value; }
function strings(value: unknown, field: string): string[] { if (!Array.isArray(value)) throw new Error(`${field} debe ser una lista.`); return value.map((item, index) => text(item, `${field}[${index}]`)); }
function list(value: unknown, field: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${field} debe ser una lista.`); return value; }
function flag(value: unknown, expected: boolean, field: string): boolean { if (value !== expected) throw new Error(`${field} debe declarar ${expected}.`); return expected; }

function parseClient(value: unknown, index: number): CustomerPhoneRow {
  const raw = object(value, `clientes[${index}]`); const client = object(raw.cliente, `clientes[${index}].cliente`); const income = object(raw.ingresos, `clientes[${index}].ingresos`); const cost = object(raw.coste, `clientes[${index}].coste`); const confirmedMargin = object(raw.margenConfirmado, `clientes[${index}].margenConfirmado`); const potentialMargin = object(raw.margenPotencialEstimado, `clientes[${index}].margenPotencialEstimado`); const review = object(raw.revision, `clientes[${index}].revision`);
  if (potentialMargin.costeCompletoAsegurado !== false) throw new Error(`clientes[${index}].margenPotencialEstimado.costeCompletoAsegurado debe ser false.`);
  return { cliente: { id: integer(client.id, `clientes[${index}].cliente.id`), nombre: text(client.nombre, `clientes[${index}].cliente.nombre`) }, ingresos: { baseCentimos: strictCents(income.baseCentimos, `clientes[${index}].ingresos.baseCentimos`), facturas: integer(income.facturas, `clientes[${index}].ingresos.facturas`) }, coste: { asignablePropuestoCentimos: strictCents(cost.asignablePropuestoCentimos, `clientes[${index}].coste.asignablePropuestoCentimos`), confirmadoCentimos: nullableCents(cost.confirmadoCentimos, `clientes[${index}].coste.confirmadoCentimos`), baseDocumentadaRelacionadaCentimos: nullableCents(cost.baseDocumentadaRelacionadaCentimos, `clientes[${index}].coste.baseDocumentadaRelacionadaCentimos`), porcentajeAsignablePorCosteBaseBp: nullableBp(cost.porcentajeAsignablePorCosteBaseBp, `clientes[${index}].coste.porcentajeAsignablePorCosteBaseBp`), documentos: integer(cost.documentos, `clientes[${index}].coste.documentos`), lineasPropuestas: integer(cost.lineasPropuestas, `clientes[${index}].coste.lineasPropuestas`) }, margenConfirmado: { centimos: nullableCents(confirmedMargin.centimos, `clientes[${index}].margenConfirmado.centimos`), porcentajeBp: nullableBp(confirmedMargin.porcentajeBp, `clientes[${index}].margenConfirmado.porcentajeBp`) }, margenPotencialEstimado: { centimos: nullableCents(potentialMargin.centimos, `clientes[${index}].margenPotencialEstimado.centimos`), porcentajeBp: nullableBp(potentialMargin.porcentajeBp, `clientes[${index}].margenPotencialEstimado.porcentajeBp`), costeCompletoAsegurado: false }, revision: { motivos: strings(review.motivos, `clientes[${index}].revision.motivos`), documentos: integer(review.documentos, `clientes[${index}].revision.documentos`), lineas: integer(review.lineas, `clientes[${index}].revision.lineas`) } };
}
function parseDocument(value: unknown, index: number): PhoneCostDocumentRow {
  const raw = object(value, `documentos[${index}]`);
  if (!['PROPUESTA_PARCIAL', 'SIN_PROPUESTA', 'REVISION', 'BASE_DESCONOCIDA'].includes(String(raw.estado))) throw new Error(`documentos[${index}].estado no es válido.`);
  return { facturaId: text(raw.facturaId, `documentos[${index}].facturaId`), numeroFactura: raw.numeroFactura === undefined ? null : nullableText(raw.numeroFactura, `documentos[${index}].numeroFactura`), fecha: text(raw.fecha, `documentos[${index}].fecha`), proveedor: text(raw.proveedor, `documentos[${index}].proveedor`), baseFacturaCentimos: nullableCents(raw.baseFacturaCentimos, `documentos[${index}].baseFacturaCentimos`), costePropuestoCentimos: strictCents(raw.costePropuestoCentimos, `documentos[${index}].costePropuestoCentimos`), baseNoAsignadaCentimos: nullableCents(raw.baseNoAsignadaCentimos, `documentos[${index}].baseNoAsignadaCentimos`), lineasDetectadas: integer(raw.lineasDetectadas, `documentos[${index}].lineasDetectadas`), lineasPropuestas: integer(raw.lineasPropuestas, `documentos[${index}].lineasPropuestas`), estado: raw.estado as PhoneCostDocumentRow['estado'], motivos: strings(raw.motivos, `documentos[${index}].motivos`) };
}

/** Rechaza resultados parciales: las incógnitas llegan declaradas como null, nunca como cero. */
export function parseCustomerAnalyticsResponse(value: unknown): CustomerAnalyticsResponse {
  const raw = object(value, 'respuesta'); flag(raw.stagingOnly, true, 'stagingOnly'); flag(raw.automaticas, false, 'automaticas'); flag(raw.proposalsOnly, true, 'proposalsOnly');
  const period = object(raw.periodo, 'periodo'); if (period.baseTemporal !== 'fecha_factura') throw new Error('periodo.baseTemporal debe ser fecha_factura.');
  const provider = object(raw.proveedor, 'proveedor'); if (provider.clave !== 'TELEFONICA') throw new Error('proveedor.clave debe ser TELEFONICA.');
  const totals = object(raw.totales, 'totales'); const bag = object(totals.bolsaSinAsignar, 'totales.bolsaSinAsignar'); const confirmed = object(totals.margenConfirmado, 'totales.margenConfirmado'); const potential = object(totals.margenPotencialEstimado, 'totales.margenPotencialEstimado'); const documents = object(totals.documentos, 'totales.documentos'); const lines = object(totals.lineas, 'totales.lineas');
  if (bag.importeDesconocidoCentimos !== null) throw new Error('totales.bolsaSinAsignar.importeDesconocidoCentimos debe ser null.'); if (potential.costeCompletoAsegurado !== false) throw new Error('totales.margenPotencialEstimado.costeCompletoAsegurado debe ser false.');
  const deduplication = object(raw.deduplicacion, 'deduplicacion'); const bank = object(raw.bancoTelefono, 'bancoTelefono');
  if (!['NO_CALCULADO', 'CALCULADO_SIN_ASIGNAR_COSTE'].includes(String(bank.estado)) || bank.usadoEnCoste !== false) throw new Error('bancoTelefono debe declarar una lectura sin uso en coste.');
  return { stagingOnly: true, automaticas: false, proposalsOnly: true, periodo: { desde: text(period.desde, 'periodo.desde'), hasta: text(period.hasta, 'periodo.hasta'), baseTemporal: 'fecha_factura' }, proveedor: { clave: 'TELEFONICA', documentosEncontrados: integer(provider.documentosEncontrados, 'proveedor.documentosEncontrados'), documentosIncluidos: integer(provider.documentosIncluidos, 'proveedor.documentosIncluidos') }, totales: { ingresoBaseCentimos: strictCents(totals.ingresoBaseCentimos, 'totales.ingresoBaseCentimos'), costeBaseDocumentadoCentimos: nullableCents(totals.costeBaseDocumentadoCentimos, 'totales.costeBaseDocumentadoCentimos'), costeAsignablePropuestoCentimos: strictCents(totals.costeAsignablePropuestoCentimos, 'totales.costeAsignablePropuestoCentimos'), costeConfirmadoCentimos: nullableCents(totals.costeConfirmadoCentimos, 'totales.costeConfirmadoCentimos'), porcentajeAsignablePorCosteBaseBp: nullableBp(totals.porcentajeAsignablePorCosteBaseBp, 'totales.porcentajeAsignablePorCosteBaseBp'), bolsaSinAsignar: { baseConocidaNoAsignadaCentimos: strictCents(bag.baseConocidaNoAsignadaCentimos, 'totales.bolsaSinAsignar.baseConocidaNoAsignadaCentimos'), documentosBaseConocidaNoAsignada: integer(bag.documentosBaseConocidaNoAsignada, 'totales.bolsaSinAsignar.documentosBaseConocidaNoAsignada'), documentosImporteDesconocido: integer(bag.documentosImporteDesconocido, 'totales.bolsaSinAsignar.documentosImporteDesconocido'), importeDesconocidoCentimos: null }, margenConfirmado: { centimos: nullableCents(confirmed.centimos, 'totales.margenConfirmado.centimos'), porcentajeBp: nullableBp(confirmed.porcentajeBp, 'totales.margenConfirmado.porcentajeBp'), caveat: text(confirmed.caveat, 'totales.margenConfirmado.caveat') }, margenPotencialEstimado: { centimos: nullableCents(potential.centimos, 'totales.margenPotencialEstimado.centimos'), porcentajeBp: nullableBp(potential.porcentajeBp, 'totales.margenPotencialEstimado.porcentajeBp'), costeCompletoAsegurado: false, caveat: text(potential.caveat, 'totales.margenPotencialEstimado.caveat') }, documentos: { total: integer(documents.total, 'totales.documentos.total'), conBaseConocida: integer(documents.conBaseConocida, 'totales.documentos.conBaseConocida'), conCosteLineaPropuesto: integer(documents.conCosteLineaPropuesto, 'totales.documentos.conCosteLineaPropuesto') }, lineas: { detectadasConContexto: integer(lines.detectadasConContexto, 'totales.lineas.detectadasConContexto'), propuestas: integer(lines.propuestas, 'totales.lineas.propuestas'), enRevision: integer(lines.enRevision, 'totales.lineas.enRevision') } }, clientes: list(raw.clientes, 'clientes').map(parseClient), documentos: list(raw.documentos, 'documentos').map(parseDocument), deduplicacion: { documentosRecibidosExcluidos: integer(deduplication.documentosRecibidosExcluidos, 'deduplicacion.documentosRecibidosExcluidos'), facturasEmitidasEspejoNoSumadas: integer(deduplication.facturasEmitidasEspejoNoSumadas, 'deduplicacion.facturasEmitidasEspejoNoSumadas'), telefonosConContratoDuplicado: integer(deduplication.telefonosConContratoDuplicado, 'deduplicacion.telefonosConContratoDuplicado'), telefonosSinContratoVigente: integer(deduplication.telefonosSinContratoVigente, 'deduplicacion.telefonosSinContratoVigente'), contratosSinFechaInicio: integer(deduplication.contratosSinFechaInicio, 'deduplicacion.contratosSinFechaInicio'), contratosConFechaBajaNoDeterminable: integer(deduplication.contratosConFechaBajaNoDeterminable, 'deduplicacion.contratosConFechaBajaNoDeterminable'), clientesNoUnivocos: integer(deduplication.clientesNoUnivocos, 'deduplicacion.clientesNoUnivocos'), lineasRechazadasPorControlBase: integer(deduplication.lineasRechazadasPorControlBase, 'deduplicacion.lineasRechazadasPorControlBase') }, bancoTelefono: { estado: bank.estado as PhoneBankStatus, usadoEnCoste: false, mensaje: text(bank.mensaje, 'bancoTelefono.mensaje') }, avisos: strings(raw.avisos, 'avisos') };
}

/** Formatter exacto: no redondea ni transforma null en cero. */
export function formatKnownCents(value: CentsString | null): string {
  if (value === null) return 'No calculable';
  const negative = value.startsWith('-'); const raw = (negative || value.startsWith('+') ? value.slice(1) : value).replace(/^0+(?=\d)/, '') || '0'; const normalized = raw.padStart(3, '0'); const whole = normalized.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}${whole},${normalized.slice(-2)} €`;
}
export function formatKnownBasisPoints(value: number | null): string { if (value === null) return 'No calculable'; const negative = value < 0 ? '−' : ''; const absolute = Math.abs(value); return `${negative}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')} %`; }
export function privateDocumentHref(facturaId: string): string { return `/api/admin/finanzas/modo-facil/documentos/${encodeURIComponent(facturaId)}/archivo`; }
export function documentLabel(document: Pick<PhoneCostDocumentRow, 'numeroFactura' | 'fecha'>): string { return document.numeroFactura?.trim() ? `Factura ${document.numeroFactura.trim()}` : `Factura de ${displayDate(document.fecha)}`; }
export function displayDate(value: string): string { const date = new Date(`${value.slice(0, 10)}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(date); }

/** Códigos internos sólo se conservan en title para auditoría; la pantalla enseña una razón humana. */
export function labelsPhoneReason(reason: string): string {
  const labels: Record<string, string> = { SIN_TELEFONO_EN_CONTEXTO: 'No se ha identificado un servicio en el documento', TELEFONO_NO_NORMALIZABLE: 'El número detectado no se puede verificar', TELEFONO_SIN_CONTRATO_VIGENTE: 'El servicio no tiene contrato vigente verificable en esa fecha', TELEFONO_CONTRATO_AMBIGUO: 'Hay más de un contrato posible para el servicio', VIGENCIA_ALTA_DESCONOCIDA: 'Falta la fecha de alta para comprobar la vigencia', VIGENCIA_BAJA_NO_DETERMINABLE: 'No se puede comprobar la fecha de baja', CLIENTE_NO_UNIVOCO: 'No se ha podido asociar el servicio a un único cliente', SUBTOTAL_NO_VERIFICADO: 'El importe de la línea requiere revisión', SUMA_LINEAS_SUPERA_BASE_FACTURA: 'Las líneas superan la base del documento', BASE_FACTURA_DESCONOCIDA: 'La base del documento no es verificable', METODO_COBRO_REAL_NO_ACREDITADO: 'No consta un coste confirmado por cobro real', FACTURA_EMITIDA_SIN_ESPEJO_ISP_EXPLICITO: 'Falta la relación explícita con la factura ISP' };
  return labels[reason] || 'Requiere revisión humana';
}
export function documentStateLabel(state: PhoneCostDocumentRow['estado']): string { return ({ PROPUESTA_PARCIAL: 'Propuesta parcial', SIN_PROPUESTA: 'Sin propuesta', REVISION: 'Requiere revisión', BASE_DESCONOCIDA: 'Base no verificable' })[state]; }
export function bankStatusLabel(status: PhoneBankStatus): string { return status === 'CALCULADO_SIN_ASIGNAR_COSTE' ? 'Lectura bancaria disponible; no asignada a coste' : 'Lectura bancaria aún no calculada'; }
