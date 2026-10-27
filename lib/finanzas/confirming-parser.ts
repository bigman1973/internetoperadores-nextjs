/**
 * Parser de documentos de confirming (BBVA PDF + CaixaBank XLS)
 * 
 * Extrae líneas de factura + gastos financieros de los documentos de confirming
 * para revisión documental. No vincula ni acredita cobros automáticamente.
 * 
 * Formatos soportados:
 * - BBVA: PDFs "Liquidació de bestretes" (DEA_Confirming BBVA_*.pdf, DPC_Confirming BBVA_*.pdf)
 * - CaixaBank: XLS con columnas de facturas (ConfirmingCaixa*.xls)
 * - CaixaBank: PDF con datos generales del anticipo (Confirming Caixa*.pdf)
 */

import { createHash } from 'node:crypto';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';

export type ConfirmingTipoDocumento = 'AVISO_CESION' | 'LIQUIDACION' | 'DETALLE_FACTURAS' | 'NO_CLASIFICADO';
export type ConfirmingOrigenDocumento = 'BBVA_PDF' | 'CAIXABANK_PDF' | 'CAIXABANK_XLS';
export type ConfirmingEstadoCuadre = 'CUADRA' | 'DESCUADRE' | 'NO_VERIFICABLE' | 'NO_APLICA';

/**
 * Indica de qué soporte se obtuvo cada bloque. Los importes de una liquidación
 * nunca se completan como diferencia residual: sólo se publican si constan en
 * el soporte indicado.
 */
export interface ConfirmingProcedencia {
  documento: ConfirmingOrigenDocumento;
  resumen: 'ETIQUETAS_PDF' | 'TABLA_XLS' | 'NO_APLICA';
  lineas: 'COORDENADAS_PDF' | 'TABLA_XLS' | 'NO_APLICA';
  netoBancario: 'ETIQUETA_PDF' | 'NO_DISPONIBLE';
  ivaComision: 'ETIQUETA_PDF' | 'NO_DISPONIBLE';
  netoXlsSinIva?: 'TABLA_XLS_SIN_IVA_EXPLICITO';
}

export interface ConfirmingCuadre {
  estado: ConfirmingEstadoCuadre;
  /** nominal - intereses - comisión - IVA comisión - neto bancario, en céntimos. */
  diferenciaCentimos?: number;
  /** importe a deducir - (intereses + comisión + IVA comisión), en céntimos. */
  diferenciaDeducirCentimos?: number;
  /** Sólo se informa cuando las líneas PDF pueden contrastarse contra el resumen. */
  diferenciaNominalLineasCentimos?: number;
  diferenciaInteresesLineasCentimos?: number;
  diferenciaComisionesLineasCentimos?: number;
}

export interface ConfirmingLineaParsed {
  numFactura: string;       // Ej: "DRAX26/1"
  importe: number;          // Importe bruto de la factura
  importeNeto?: number;     // Importe neto (tras descuentos financieros)
  comision?: number;        // Comisión cobrada por el banco
  intereses?: number;       // Intereses cobrados por el banco
  tipoInteres?: number;     // Tipo de interés aplicado (ej: 2.483)
  gastosFinancieros?: number; // Total gastos = comisión + intereses
  fechaFactura?: string;    // DD-MM-YYYY
  fechaPago?: string;       // DD-MM-YYYY (vencimiento/pagament)
  fechaVencimiento?: string; // Fecha vencimiento para CaixaBank
  procedencia?: 'COORDENADAS_PDF' | 'TABLA_XLS';
}

export interface ConfirmingParseResult {
  banco: 'BBVA' | 'CaixaBank';
  /** Distingue un aviso de cesión de una liquidación que sí declara un abono. */
  tipoDocumento?: ConfirmingTipoDocumento;
  procedencia?: ConfirmingProcedencia;
  /** SHA-256 del binario de entrada; no contiene datos de clientes ni importes. */
  sourceHash?: string;
  sociedad?: string;        // DPC (Draxton Powertrain & Chassis) o DEA (Draxton Europe & Asia)
  cliente?: string;         // Nombre del cliente
  contrato?: string;        // Número de contrato BBVA
  fechaDocumento?: string;  // Fecha del documento
  /** Fecha de liquidación declarada en el soporte, si existe. */
  fechaLiquidacion?: string;
  /** Cuenta de abono declarada en el soporte, si existe. */
  cuentaAbono?: string;
  totalRemesa: number;      // Total nominal de la remesa
  totalNeto?: number;       // Total neto (tras intereses/comisiones)
  /** Neto que declara el PDF bancario; no se calcula a partir de otras columnas. */
  netoBancario?: number;
  /** Neto de detalle XLS cuando el XLS no declara IVA; no equivale al neto bancario PDF. */
  totalNetoXlsSinIva?: number;
  totalComisiones?: number; // Total comisiones del documento
  /** IVA sobre comisión que aparece explícitamente en el soporte. */
  totalIvaComision?: number;
  totalIntereses?: number;  // Total intereses del documento
  /** Total de deducciones declarado en el PDF; no es una diferencia calculada. */
  totalDeducir?: number;
  totalGastosFinancieros?: number; // Total gastos financieros (comisiones + intereses + IVA)
  cuadre?: ConfirmingCuadre;
  tae?: number;             // TAE del documento
  lineas: ConfirmingLineaParsed[];
  rawText?: string;         // Texto crudo para debug
}

/**
 * Item textual con posición PDF. Se limita deliberadamente a lo necesario para
 * asociar una fila de factura con una cabecera de columna documental.
 */
export interface BBVACesionPositionalText {
  text: string;
  x: number;
  y: number;
  width: number;
}

type PdfTextItem = {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
}

type PdfPageData = {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
}

const BBVA_CESION_ROW_TOLERANCE = 2.5;

function normalizarEtiquetaPDF(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarFacturaBBVACesion(value: string): string | null {
  const match = value.match(/DRAX\s*\d{0,2}\s*\/\s*\d{1,3}/i);
  if (!match) return null;
  let normalized = match[0].replace(/\s+/g, '').toUpperCase();
  if (/^DRAX\/\d/.test(normalized)) normalized = normalized.replace('DRAX/', 'DRAX26/');
  return normalized;
}

function importeDesdeTokenPDF(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(value)) return null;
  const parsed = parseImporteEspanol(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Reconoce exclusivamente el aviso BBVA de cesión de créditos. En ese formato
 * la única magnitud económica por factura que puede extraerse es el nominal de
 * la columna explícita IMPORTE/(EUR). No contiene liquidación, intereses ni
 * comisión por línea, por lo que esos campos permanecen ausentes.
 */
export function extractBBVACesionNominalLines(pages: readonly (readonly BBVACesionPositionalText[])[]): ConfirmingLineaParsed[] {
  const documentText = normalizarEtiquetaPDF(pages.flat().map((item) => item.text).join(' '));
  if (!/CESION\s+DE\s+CREDITOS/.test(documentText)) return [];

  const lineas: ConfirmingLineaParsed[] = [];
  for (const page of pages) {
    const amountHeader = page.find((item) => normalizarEtiquetaPDF(item.text).includes('IMPORTE'));
    // PDF.js puede dividir la cabecera en dos items ("NUM." y "FACTURA").
    // Se recompone únicamente dentro de la misma banda y, por tanto, no se usa
    // texto de filas ni de páginas diferentes como prueba de estructura.
    const headerBands = new Map<number, BBVACesionPositionalText[]>();
    for (const item of page) {
      const band = Math.round(item.y / BBVA_CESION_ROW_TOLERANCE);
      const items = headerBands.get(band) ?? [];
      items.push(item);
      headerBands.set(band, items);
    }
    const hasInvoiceHeader = [...headerBands.values()].some((items) =>
      /NUM\.?\s*FACTURA/.test(normalizarEtiquetaPDF(
        [...items].sort((left, right) => left.x - right.x).map((item) => item.text).join(' '),
      )),
    );
    if (!amountHeader || !hasInvoiceHeader) continue;

    // Los importes se alinean a la derecha dentro de la columna cuyo encabezado
    // empieza en amountHeader.x. El margen derecho admite dicha alineación, pero
    // nunca atraviesa la columna siguiente de fecha de pago.
    const amountMinX = amountHeader.x - 4;
    const amountMaxX = amountHeader.x + amountHeader.width + 40;
    for (const invoiceItem of page) {
      const numFactura = normalizarFacturaBBVACesion(invoiceItem.text);
      if (!numFactura) continue;
      const amounts = page.flatMap((item) => {
        if (Math.abs(item.y - invoiceItem.y) > BBVA_CESION_ROW_TOLERANCE) return [];
        const centerX = item.x + item.width / 2;
        if (centerX < amountMinX || centerX > amountMaxX) return [];
        const importe = importeDesdeTokenPDF(item.text.trim());
        return importe === null ? [] : [importe];
      });
      // Una fila sólo es inequívoca si tiene exactamente un importe dentro de la
      // columna nominal. Totales y otros tokens quedan fuera por la coordenada y.
      if (amounts.length !== 1) continue;

      const fechaFactura = page
        .filter((item) => Math.abs(item.y - invoiceItem.y) <= BBVA_CESION_ROW_TOLERANCE)
        .filter((item) => item.x > invoiceItem.x + invoiceItem.width && item.x < amountHeader.x)
        .map((item) => item.text.trim())
        .find((item) => /^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(item));

      lineas.push({
        numFactura,
        importe: amounts[0],
        fechaFactura: fechaFactura?.replace(/\//g, '-'),
      });
    }
  }
  return lineas;
}

async function extractBBVACesionPositionedPages(buffer: Buffer): Promise<BBVACesionPositionalText[][]> {
  const positioned = await pdfParse(buffer, {
    pagerender: async (pageData: PdfPageData): Promise<string> => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      const items = textContent.items.flatMap((item): BBVACesionPositionalText[] => {
        const text = typeof item.str === 'string' ? item.str.trim() : '';
        const transform = Array.isArray(item.transform) ? item.transform : [];
        const x = transform[4];
        const y = transform[5];
        const width = item.width;
        if (!text || typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number') return [];
        return [{ text, x, y, width }];
      });
      return JSON.stringify(items);
    },
  });

  return positioned.text
    .split('\n')
    .flatMap((line): BBVACesionPositionalText[][] => {
      const candidate = line.trim();
      if (!candidate.startsWith('[')) return [];
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (!Array.isArray(parsed)) return [];
        const page = parsed.flatMap((item): BBVACesionPositionalText[] => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Partial<BBVACesionPositionalText>;
          if (typeof value.text !== 'string' || typeof value.x !== 'number' || typeof value.y !== 'number' || typeof value.width !== 'number') return [];
          return [{ text: value.text, x: value.x, y: value.y, width: value.width }];
        });
        return [page];
      } catch {
        return [];
      }
    });
}

type BBVALiquidacionColumns = {
  headerY: number;
  facturaX: number;
  facturaEndX: number;
  comisionX: number;
  nominalX: number;
  tipoX: number;
  interesX: number;
};

type BBVALiquidacionResumen = {
  fechaLiquidacion?: string;
  cuentaAbono?: string;
  totalRemesa: number;
  totalComisiones?: number;
  totalIvaComision?: number;
  totalIntereses?: number;
  totalDeducir?: number;
  netoBancario?: number;
  tae?: number;
};

const BBVA_LIQUIDACION_ROW_TOLERANCE = 3;

function importeACentimos(importe: number): number {
  return Math.round(importe * 100);
}

function importeDesdeCentimos(centimos: number): number {
  return centimos / 100;
}

function sumaImportes(items: readonly ConfirmingLineaParsed[], key: 'importe' | 'comision' | 'intereses'): number {
  return importeDesdeCentimos(items.reduce((sum, item) => sum + importeACentimos(item[key] ?? 0), 0));
}

function extraerImporteEtiquetado(text: string, etiqueta: RegExp): number | undefined {
  const match = text.replace(/\s+/g, ' ').match(etiqueta);
  if (!match) return undefined;
  const importe = parseImporteEspanol(match[1]);
  return Number.isFinite(importe) ? importe : undefined;
}

function extraerColumnasLiquidacionBBVA(page: readonly BBVACesionPositionalText[]): BBVALiquidacionColumns | null {
  const bands = new Map<number, BBVACesionPositionalText[]>();
  for (const item of page) {
    const band = Math.round(item.y / BBVA_LIQUIDACION_ROW_TOLERANCE);
    bands.set(band, [...(bands.get(band) ?? []), item]);
  }

  for (const items of bands.values()) {
    const sorted = [...items].sort((left, right) => left.x - right.x);
    const normalized = normalizarEtiquetaPDF(sorted.map((item) => item.text).join(' '));
    if (!/NUM\.?\s*FACTURA/.test(normalized) || !/COMISS/.test(normalized) || !/INTERES/.test(normalized) || !/IMPORT/.test(normalized)) continue;

    const factura = sorted.find((item) => /NUM\.?/.test(normalizarEtiquetaPDF(item.text)));
    const referencia = sorted.find((item) => /REFERENCIA/.test(normalizarEtiquetaPDF(item.text)));
    const comision = sorted.find((item) => /COMISS/.test(normalizarEtiquetaPDF(item.text)));
    const nominal = sorted.find((item) => /INTERES/.test(normalizarEtiquetaPDF(item.text)));
    const tipo = sorted.find((item) => /TIPUS/.test(normalizarEtiquetaPDF(item.text)));
    const interes = sorted.find((item) => normalizarEtiquetaPDF(item.text) === 'IMPORT');
    if (!factura || !referencia || !comision || !nominal || !tipo || !interes) continue;

    return {
      headerY: factura.y,
      facturaX: factura.x,
      facturaEndX: referencia.x,
      comisionX: comision.x + comision.width / 2,
      // La cabecera "Interès" está a la derecha del valor nominal; se usa su
      // columna física como ancla, no su literal económico.
      nominalX: nominal.x + nominal.width / 2,
      tipoX: tipo.x + tipo.width / 2,
      // La cabecera "Import" corresponde físicamente al interés cobrado.
      interesX: interes.x + interes.width / 2,
    };
  }
  return null;
}

function importeDeColumna(row: readonly BBVACesionPositionalText[], columnX: number, tolerance = 52): number | null {
  const matches = row.flatMap((item) => {
    const importe = importeDesdeTokenPDF(item.text.trim());
    if (importe === null || Math.abs(item.x + item.width / 2 - columnX) > tolerance) return [];
    return [importe];
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Extrae el detalle de una liquidación BBVA con las coordenadas de las cabeceras.
 * La semántica se decide por la columna física: "Interès" ancla el nominal y
 * "Import" ancla el interés. No se acepta el orden textual de los tokens.
 */
export function extractBBVALiquidacionLines(pages: readonly (readonly BBVACesionPositionalText[])[]): ConfirmingLineaParsed[] {
  const lineas: ConfirmingLineaParsed[] = [];
  for (const page of pages) {
    const columns = extraerColumnasLiquidacionBBVA(page);
    if (!columns) continue;

    const seenRows = new Set<number>();
    for (const facturaItem of page.filter(item => item.x >= columns.facturaX - 2 && item.x < columns.facturaEndX)) {
      if (facturaItem.y >= columns.headerY - BBVA_LIQUIDACION_ROW_TOLERANCE || [...seenRows].some(y => Math.abs(y - facturaItem.y) <= BBVA_LIQUIDACION_ROW_TOLERANCE)) continue;
      const row = page.filter((item) => Math.abs(item.y - facturaItem.y) <= BBVA_LIQUIDACION_ROW_TOLERANCE);
      const facturaCell = row.filter(item => item.x >= columns.facturaX - 2 && item.x < columns.facturaEndX).sort((a, b) => a.x - b.x).map(item => item.text).join(' ');
      const numFactura = normalizarFacturaBBVACesion(facturaCell);
      if (!numFactura) continue;
      seenRows.add(facturaItem.y);
      const importe = importeDeColumna(row, columns.nominalX);
      const comision = importeDeColumna(row, columns.comisionX);
      const intereses = importeDeColumna(row, columns.interesX);
      if (importe === null || comision === null || intereses === null) continue;

      const tipoToken = row
        .filter((item) => Math.abs(item.x + item.width / 2 - columns.tipoX) <= 38)
        .map((item) => item.text.trim())
        .find((item) => /^\d+[.,]\d{3}$/.test(item));
      const fechaPago = row
        .filter((item) => item.x > columns.facturaX)
        .map((item) => item.text.trim())
        .find((item) => /^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(item));

      lineas.push({
        numFactura,
        importe,
        comision,
        intereses,
        tipoInteres: tipoToken ? parseFloat(tipoToken.replace(',', '.')) : undefined,
        gastosFinancieros: importeDesdeCentimos(importeACentimos(comision) + importeACentimos(intereses)),
        fechaPago: fechaPago?.replace(/\//g, '-'),
        procedencia: 'COORDENADAS_PDF',
      });
    }
  }
  return lineas;
}

function extraerResumenLiquidacionBBVA(text: string): BBVALiquidacionResumen {
  const fechaLiquidacion = text.match(/Data\s+de\s+liquidaci[oó]\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
  const cuentaAbono = text.match(/Compte\s+d['’]abonament\s+de\s+bestreta\s*((?:[A-Z]{2}\s*\d[\s\d]*){1,})/i)?.[1]
    ?.replace(/\s+/g, '');
  const taeText = text.replace(/\s+/g, ' ').match(/TAE\s*([\d.,]+)\s*%/i)?.[1];

  return {
    fechaLiquidacion,
    cuentaAbono,
    totalRemesa: extraerImporteEtiquetado(text, /Import\s+nominal\s*([\d.,]+)\s*EUR/i) ?? 0,
    totalComisiones: extraerImporteEtiquetado(text, /Import\s+comissi[oó]\s*([\d.,]+)\s*EUR/i),
    // Sólo acepta la línea fiscal explícita de comisión. No se calcula IVA por
    // porcentaje ni como residuo contra el neto.
    totalIvaComision: extraerImporteEtiquetado(text, /Impostos?\s+S\/\s*COM\s*\(\s*IVA[^)]*\)\s*([\d.,]+)\s*EUR/i),
    totalIntereses: extraerImporteEtiquetado(text, /Import\s+interessos\s*([\d.,]+)\s*EUR/i),
    totalDeducir: extraerImporteEtiquetado(text, /Import\s+a\s+deduir\s*([\d.,]+)\s*EUR/i),
    netoBancario: extraerImporteEtiquetado(text, /L[ií]quid\s+a\s+favor\s+seu\s*([\d.,]+)\s*EUR/i),
    tae: taeText ? parseFloat(taeText.replace(',', '.')) : undefined,
  };
}

function calcularCuadreLiquidacion(resumen: BBVALiquidacionResumen, lineas: readonly ConfirmingLineaParsed[], requiereDetalle = true): ConfirmingCuadre {
  const allGlobal = [resumen.totalRemesa, resumen.totalComisiones, resumen.totalIvaComision, resumen.totalIntereses, resumen.netoBancario]
    .every((value) => typeof value === 'number' && Number.isFinite(value));
  const diferenciaCentimos = allGlobal
    ? importeACentimos(resumen.totalRemesa) - importeACentimos(resumen.totalIntereses!) - importeACentimos(resumen.totalComisiones!) - importeACentimos(resumen.totalIvaComision!) - importeACentimos(resumen.netoBancario!)
    : undefined;
  const diferenciaDeducirCentimos = resumen.totalDeducir !== undefined && resumen.totalIntereses !== undefined && resumen.totalComisiones !== undefined && resumen.totalIvaComision !== undefined
    ? importeACentimos(resumen.totalDeducir) - importeACentimos(resumen.totalIntereses) - importeACentimos(resumen.totalComisiones) - importeACentimos(resumen.totalIvaComision)
    : undefined;
  const diferenciaNominalLineasCentimos = lineas.length > 0 && resumen.totalRemesa > 0
    ? importeACentimos(sumaImportes(lineas, 'importe')) - importeACentimos(resumen.totalRemesa)
    : undefined;
  const diferenciaInteresesLineasCentimos = lineas.length > 0 && resumen.totalIntereses !== undefined
    ? importeACentimos(sumaImportes(lineas, 'intereses')) - importeACentimos(resumen.totalIntereses)
    : undefined;
  const diferenciaComisionesLineasCentimos = lineas.length > 0 && resumen.totalComisiones !== undefined
    ? importeACentimos(sumaImportes(lineas, 'comision')) - importeACentimos(resumen.totalComisiones)
    : undefined;
  const diferencias = [diferenciaCentimos, diferenciaDeducirCentimos, diferenciaNominalLineasCentimos, diferenciaInteresesLineasCentimos, diferenciaComisionesLineasCentimos]
    .filter((value): value is number => value !== undefined);

  return {
    estado: diferencias.some((value) => value !== 0) ? 'DESCUADRE' : allGlobal && (!requiereDetalle || lineas.length > 0) ? 'CUADRA' : 'NO_VERIFICABLE',
    diferenciaCentimos,
    diferenciaDeducirCentimos,
    diferenciaNominalLineasCentimos,
    diferenciaInteresesLineasCentimos,
    diferenciaComisionesLineasCentimos,
  };
}

/**
 * Variante pura de la liquidación BBVA para la capa de lectura y sus fixtures.
 * `text` procede del PDF y `pages` de PDF.js; ningún campo económico se deriva
 * de un residuo ni se toma de un XLS asociado.
 */
export function parseBBVALiquidacionTextAndPositions(input: {
  text: string;
  pages: readonly (readonly BBVACesionPositionalText[])[];
  sourceHash?: string;
  sociedad?: string;
  cliente?: string;
  contrato?: string;
  fechaDocumento?: string;
}): ConfirmingParseResult {
  const resumen = extraerResumenLiquidacionBBVA(input.text);
  const lineas = extractBBVALiquidacionLines(input.pages);
  const cuadre = calcularCuadreLiquidacion(resumen, lineas);
  const fechaLiquidacion = resumen.fechaLiquidacion;

  return {
    banco: 'BBVA',
    tipoDocumento: 'LIQUIDACION',
    procedencia: {
      documento: 'BBVA_PDF',
      resumen: 'ETIQUETAS_PDF',
      lineas: lineas.length > 0 ? 'COORDENADAS_PDF' : 'NO_APLICA',
      netoBancario: resumen.netoBancario === undefined ? 'NO_DISPONIBLE' : 'ETIQUETA_PDF',
      ivaComision: resumen.totalIvaComision === undefined ? 'NO_DISPONIBLE' : 'ETIQUETA_PDF',
    },
    sourceHash: input.sourceHash,
    sociedad: input.sociedad,
    cliente: input.cliente,
    contrato: input.contrato,
    fechaDocumento: input.fechaDocumento ?? fechaLiquidacion,
    fechaLiquidacion,
    cuentaAbono: resumen.cuentaAbono,
    totalRemesa: resumen.totalRemesa,
    totalNeto: resumen.netoBancario,
    netoBancario: resumen.netoBancario,
    totalComisiones: resumen.totalComisiones,
    totalIvaComision: resumen.totalIvaComision,
    totalIntereses: resumen.totalIntereses,
    totalDeducir: resumen.totalDeducir,
    totalGastosFinancieros: resumen.totalDeducir,
    cuadre,
    tae: resumen.tae,
    lineas,
    rawText: input.text.substring(0, 500),
  };
}

/**
 * Detecta el tipo de archivo de confirming por su nombre
 */
export function detectarTipoConfirming(fileName: string): 'bbva_pdf' | 'caixa_xls' | 'caixa_pdf' | 'unknown' {
  const name = fileName.toLowerCase();
  
  // BBVA: DEA_Confirming BBVA_*.pdf, DPC_Confirming BBVA_*.pdf, DPC_ConfirmingBBVA_*.pdf
  if (name.includes('confirmingbbva') && name.endsWith('.pdf')) return 'bbva_pdf';
  if (name.includes('confirming bbva') && name.endsWith('.pdf')) return 'bbva_pdf';
  if (name.includes('confirming_bbva') && name.endsWith('.pdf')) return 'bbva_pdf';
  if (name.includes('cesi') && name.endsWith('.pdf')) return 'bbva_pdf';
  if ((name.startsWith('dpc_') || name.startsWith('dea_') || name.startsWith('dpc ') || name.startsWith('dea ')) && name.endsWith('.pdf') && !name.includes('caixa')) return 'bbva_pdf';
  
  // CaixaBank XLS
  if (name.includes('caixa') && (name.endsWith('.xls') || name.endsWith('.xlsx'))) return 'caixa_xls';
  
  // CaixaBank PDF
  if (name.includes('caixa') && name.endsWith('.pdf')) return 'caixa_pdf';
  
  // Fallback: si tiene "cesion" o "credito" en el nombre es BBVA
  if ((name.includes('cesion') || name.includes('credito') || name.includes('crédito')) && name.endsWith('.pdf')) return 'bbva_pdf';
  
  return 'unknown';
}

/**
 * Parsea un PDF de Confirming BBVA.
 * 
 * Distingue dos formatos documentales incompatibles:
 * - "Cesión de créditos": tabla nominal de facturas. No liquida ni declara
 *   intereses/comisiones por línea; se extrae únicamente IMPORTE/(EUR) mediante
 *   cabecera y coordenadas.
 * - "Liquidació de bestretes": declara un resumen financiero y una tabla. El
 *   resumen se lee por etiqueta y la tabla por coordenadas de las cabeceras.
 *
 * Estructura de la liquidación:
 * - Página 1: Datos generales (Import nominal, comissió, interessos, TAE, Líquid a favor)
 * - Página 2: Tabla de facturas con columnas:
 *   Núm. factura | Referència | Data de pagament | Comissió | Interès(=importe) | Tipus | Import(=intereses)
 * 
 * IMPORTANTE: En la tabla de facturas:
 * - Columna "Interès" = IMPORTE NOMINAL de la factura (no son intereses)
 * - Columna "Import" = INTERESES cobrados por el banco
 * - Columna "Comissió" = Comisión cobrada por el banco
 * - Columna "Tipus" = Tipo de interés (ej: 2.483)
 */
export async function parseBBVACesionCreditos(buffer: Buffer, fileName?: string): Promise<ConfirmingParseResult> {
  const pdf = await pdfParse(buffer);
  const text = pdf.text;
  const sourceHash = createHash('sha256').update(buffer).digest('hex');
  
  // Detectar sociedad por nombre de archivo o contenido
  let sociedad: string | undefined;
  if (fileName) {
    const fn = fileName.toUpperCase();
    if (fn.startsWith('DPC') || fn.includes('DPC')) sociedad = 'DPC';
    else if (fn.startsWith('DEA') || fn.includes('DEA')) sociedad = 'DEA';
  }
  
  // Detectar sociedad por contenido si no se detectó por nombre
  if (!sociedad) {
    if (text.includes('POWERTRAIN') || text.includes('CHASSIS')) sociedad = 'DPC';
    else if (text.includes('EUROPE') || text.includes('ASIA')) sociedad = 'DEA';
  }
  
  // Extraer cliente
  let cliente: string | undefined;
  const clienteMatch = text.match(/Client\s*(.+)/i);
  if (clienteMatch) {
    cliente = clienteMatch[1].replace(/^\s+/, '').trim();
    cliente = cliente.replace(/[A-Z]\d{8}.*$/, '').trim();
  }
  if (!cliente) {
    const clienteMatch2 = text.match(/A CARGO DE:\s*(.+?)(?:\n|QUE SE CEDEN)/s);
    if (clienteMatch2) {
      cliente = clienteMatch2[1].replace(/\n/g, ' ').trim();
    }
  }
  
  // Extraer contrato
  let contrato: string | undefined;
  const contratoMatch = text.match(/contracte\s+([\d\s]+)/i) || text.match(/CONTRATO:\s*([\d\s\-]+)/);
  if (contratoMatch) {
    contrato = contratoMatch[1].trim();
  }
  
  // Extraer fecha del documento
  let fechaDocumento: string | undefined;
  if (fileName) {
    const fechaMatch = fileName.match(/(\d{2})(\d{2})(\d{4})/);
    if (fechaMatch) {
      fechaDocumento = `${fechaMatch[1]}/${fechaMatch[2]}/${fechaMatch[3]}`;
    }
  }
  if (!fechaDocumento) {
    const fechaLiqMatch = text.match(/Data de liquidació\s*(\d{2}\/\d{2}\/\d{4})/);
    if (fechaLiqMatch) fechaDocumento = fechaLiqMatch[1];
  }

  // El aviso de cesión contiene el nominal individual bajo una cabecera explícita
  // pero no conceptos financieros por fila. Se procesa antes de la liquidación
  // textual para no convertir ausencia de interés/comisión en cero ni reutilizar
  // el nominal como otro concepto.
  const positionedPages = await extractBBVACesionPositionedPages(buffer);
  const cesionLineas = extractBBVACesionNominalLines(positionedPages);
  // Algunas fuentes fragmentan palabras en caracteres separados. El título
  // compacto sigue siendo documental, no una clasificación por nombre.
  const tituloCompacto = normalizarEtiquetaPDF(text).replace(/\s/g, '');
  const cesionSinLiquidacion = /CESIONDECREDITOS|CESSIODECREDITS|CESIODECREDITS/.test(tituloCompacto)
    && !/LIQUIDACIO[N]?DEBESTRETES|LIQUIDACIONDEANTICIPOS/.test(tituloCompacto);
  if (cesionLineas.length > 0 || cesionSinLiquidacion) {
    return {
      banco: 'BBVA',
      tipoDocumento: 'AVISO_CESION',
      procedencia: {
        documento: 'BBVA_PDF',
        resumen: 'NO_APLICA',
        lineas: 'COORDENADAS_PDF',
        netoBancario: 'NO_DISPONIBLE',
        ivaComision: 'NO_DISPONIBLE',
      },
      sourceHash,
      sociedad,
      cliente,
      contrato,
      fechaDocumento,
      totalRemesa: sumaImportes(cesionLineas, 'importe'),
      cuadre: { estado: 'NO_APLICA' },
      lineas: cesionLineas,
      rawText: text.substring(0, 500),
    };
  }
  return parseBBVALiquidacionTextAndPositions({
    text,
    pages: positionedPages,
    sourceHash,
    sociedad,
    cliente,
    contrato,
    fechaDocumento,
  });
}

/**
 * Parsea un XLS de CaixaBank con detalle de facturas
 * 
 * Columnas: Núm. factura | Fecha factura | Fecha vencimiento | Importe factura | Importe neto
 * El neto XLS es un dato de detalle distinto al abono bancario PDF. Como no
 * declara el IVA de comisión ni desglosa conceptos, no se transforman sus
 * diferencias en intereses, comisión, IVA o gastos financieros.
 */
export function parseCaixaBankXLS(buffer: Buffer, fileName?: string): ConfirmingParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  
  const lineas: ConfirmingLineaParsed[] = [];
  let totalRemesa = 0;
  let totalNeto = 0;
  let tieneNetoXls = false;
  
  for (const row of rawData) {
    const numFacturaKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('factura') && k.toLowerCase().includes('n')
    ) || Object.keys(row).find(k => k.toLowerCase().includes('factura'));
    
    const importeKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('importe') && k.toLowerCase().includes('factura')
    ) || Object.keys(row).find(k => 
      k.toLowerCase().includes('importe') && !k.toLowerCase().includes('neto')
    );
    
    const importeNetoKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('importe') && k.toLowerCase().includes('neto')
    );
    
    const fechaFacturaKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('fecha') && k.toLowerCase().includes('factura')
    );
    
    const fechaVencimientoKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('fecha') && k.toLowerCase().includes('vencimiento')
    );
    
    if (!numFacturaKey) continue;
    
    const numFactura = String(row[numFacturaKey] || '').trim();
    if (!numFactura || !numFactura.toUpperCase().includes('DRAX')) continue;
    
    const numFacturaNorm = numFactura.replace(/\s+/g, '').toUpperCase();
    
    let importe = 0;
    if (importeKey && row[importeKey]) {
      importe = parseImporteEspanol(row[importeKey]);
    }
    
    let importeNeto: number | undefined;
    if (importeNetoKey && row[importeNetoKey]) {
      importeNeto = parseImporteEspanol(row[importeNetoKey]);
    }
    
    let fechaFactura: string | undefined;
    if (fechaFacturaKey && row[fechaFacturaKey]) {
      fechaFactura = parseFechaExcel(row[fechaFacturaKey]);
    }
    
    let fechaVencimiento: string | undefined;
    if (fechaVencimientoKey && row[fechaVencimientoKey]) {
      fechaVencimiento = parseFechaExcel(row[fechaVencimientoKey]);
    }
    
    lineas.push({
      numFactura: numFacturaNorm,
      importe,
      importeNeto,
      fechaFactura,
      fechaVencimiento,
      procedencia: 'TABLA_XLS',
    });
    
    totalRemesa = importeDesdeCentimos(importeACentimos(totalRemesa) + importeACentimos(importe));
    if (importeNeto !== undefined) {
      totalNeto = importeDesdeCentimos(importeACentimos(totalNeto) + importeACentimos(importeNeto));
      tieneNetoXls = true;
    }
  }
  
  // Extraer fecha del nombre del archivo
  let fechaDocumento: string | undefined;
  if (fileName) {
    const fechaMatch = fileName.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (fechaMatch) {
      fechaDocumento = `${fechaMatch[1].padStart(2, '0')}/${fechaMatch[2]}/${fechaMatch[3]}`;
    }
  }
  
  return {
    banco: 'CaixaBank',
    tipoDocumento: 'DETALLE_FACTURAS',
    procedencia: {
      documento: 'CAIXABANK_XLS',
      resumen: 'TABLA_XLS',
      lineas: 'TABLA_XLS',
      netoBancario: 'NO_DISPONIBLE',
      ivaComision: 'NO_DISPONIBLE',
      netoXlsSinIva: 'TABLA_XLS_SIN_IVA_EXPLICITO',
    },
    sourceHash: createHash('sha256').update(buffer).digest('hex'),
    cliente: 'DRAXTON EUROPE&ASIA',
    fechaDocumento,
    totalRemesa,
    // Compatibilidad con consumidores históricos: el valor también se expone
    // en el campo inequívoco totalNetoXlsSinIva y nunca como netoBancario.
    totalNeto: tieneNetoXls ? totalNeto : undefined,
    totalNetoXlsSinIva: tieneNetoXls ? totalNeto : undefined,
    cuadre: { estado: 'NO_VERIFICABLE' },
    lineas,
  };
}

/**
 * Parsea un PDF de CaixaBank (datos generales del anticipo)
 * NO contiene detalle de facturas individuales (eso está en el XLS)
 */
function fechaLiquidacionCaixa(text: string): string | undefined {
  const flat = text.replace(/\s+/g, ' ');
  const labelled = flat.match(/(?:Fecha|Data)\s+(?:de\s+)?liquidaci[oó]n?\s*:?\s*(\d{1,2}(?:[\/-]\d{1,2}[\/-]\d{2,4}|\s+[a-záéíóú]{3,10}\.?\s+\d{2,4}))/i)?.[1];
  if (!labelled) return undefined;
  const numeric = labelled.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  const written = labelled.match(/^(\d{1,2})\s+([a-záéíóú]{3,10})\.?\s+(\d{2}|\d{4})$/i);
  const months: Record<string, number> = { ene: 1, enero: 1, gen: 1, gener: 1, feb: 2, febrero: 2, febrer: 2, mar: 3, marzo: 3, marc: 3, abr: 4, abril: 4, apr: 4, may: 5, mayo: 5, maig: 5, jun: 6, junio: 6, juny: 6, jul: 7, julio: 7, juliol: 7, ago: 8, agosto: 8, agost: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, novembre: 11, dic: 12, diciembre: 12, des: 12, desembre: 12 };
  const day = Number(numeric?.[1] ?? written?.[1]);
  const month = numeric ? Number(numeric[2]) : months[(written?.[2] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()];
  const rawYear = numeric?.[3] ?? written?.[3];
  if (!rawYear || !month || !day) return undefined;
  const year = Number(rawYear) + (rawYear.length === 2 ? 2000 : 0);
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}` : undefined;
}

export function parseCaixaBankPDFText(text: string, input: { fileName?: string; sourceHash?: string } = {}): ConfirmingParseResult {
  let totalRemesa = 0;
  let cliente: string | undefined;
  let fechaDocumento: string | undefined;
  
  const clienteMatch = text.match(/Cliente\s*\n?\s*(.+)/i);
  if (clienteMatch) cliente = clienteMatch[1].trim();
  const fechaLiquidacion = fechaLiquidacionCaixa(text);
  const cuentaAbono = text.match(/Cuenta\s+(?:de\s+)?abono\s*:?\s*([^\r\n]+)/i)?.[1]?.trim();

  totalRemesa = extraerImporteEtiquetado(text, /Importe\s+factura\s*([\d.,]+)\s*€?/i) ?? 0;
  const netoBancario = extraerImporteEtiquetado(text, /Importe\s+neto\s*([\d.,]+)\s*€?/i);
  const totalIntereses = extraerImporteEtiquetado(text, /Intereses\s*([\d.,]+)\s*€?/i);
  const ivaPattern = /IVA(?:\s+(?:s\/|sobre))?(?:\s+comisi[oó]n(?:es)?)?(?:\s*\(\s*[\d.,]+\s*%\s*\))?\s*([\d.]+,\d{2})(?!\s*%)/gi;
  // La etiqueta fiscal contiene la palabra comisión, pero no es la comisión.
  // Retirar únicamente esa fila de la búsqueda evita rellenar un concepto ausente.
  const commissionText = text.replace(/\s+/g, ' ').replace(ivaPattern, ' ');
  const totalComisiones = extraerImporteEtiquetado(commissionText, /(?:^|\s)Comisi[oó]n(?:es)?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)(?![\d.,]|\s*%)/i);
  // Si el PDF no declara esta fila, el campo permanece ausente: no se deduce
  // por aplicar porcentaje ni por comparar el neto con el nominal.
  const totalIvaComision = extraerImporteEtiquetado(text, /IVA(?:\s+(?:s\/|sobre))?(?:\s+comisi[oó]n(?:es)?)?(?:\s*\(\s*[\d.,]+\s*%\s*\))?\s*([\d.]+,\d{2})(?!\s*%)/i);
  const totalDeducir = extraerImporteEtiquetado(text, /(?:Total\s+)?(?:a\s+)?deducir\s*([\d.,]+)\s*€?/i);

  if (!fechaDocumento && input.fileName) {
    const fMatch = input.fileName.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (fMatch) {
      fechaDocumento = `${fMatch[1].padStart(2, '0')}/${fMatch[2]}/${fMatch[3]}`;
    }
  }
  
  const summaryPresent = totalRemesa > 0 && netoBancario !== undefined;
  const compact = normalizarEtiquetaPDF(text).replace(/\s/g, '');
  const tipoDocumento: ConfirmingTipoDocumento = /CESIONDECREDITOS|CESSIODECREDITS|CESIODECREDITS/.test(compact) && !summaryPresent ? 'AVISO_CESION'
    : summaryPresent ? 'LIQUIDACION'
      : /(?:OUTLOOK|DESDE|ENVIADO)/.test(normalizarEtiquetaPDF(text)) && /(?:OS\s+PASO\s+DETALLE|DETALLE\s+DE\s+LAS\s+FACTURAS)/.test(normalizarEtiquetaPDF(text)) ? 'DETALLE_FACTURAS' : 'NO_CLASIFICADO';
  const cuadre = tipoDocumento === 'LIQUIDACION'
    ? calcularCuadreLiquidacion({ totalRemesa, totalComisiones, totalIvaComision, totalIntereses, totalDeducir, netoBancario }, [], false)
    : { estado: 'NO_APLICA' as const };
  return {
    banco: 'CaixaBank',
    tipoDocumento,
    procedencia: {
      documento: 'CAIXABANK_PDF',
      resumen: 'ETIQUETAS_PDF',
      lineas: 'NO_APLICA',
      netoBancario: netoBancario === undefined ? 'NO_DISPONIBLE' : 'ETIQUETA_PDF',
      ivaComision: totalIvaComision === undefined ? 'NO_DISPONIBLE' : 'ETIQUETA_PDF',
    },
    sourceHash: input.sourceHash,
    cliente,
    fechaDocumento,
    fechaLiquidacion,
    cuentaAbono,
    totalRemesa,
    totalNeto: netoBancario,
    netoBancario,
    totalComisiones,
    totalIvaComision,
    totalIntereses,
    totalDeducir,
    // Sólo se expone un total si aparece como concepto documental explícito.
    totalGastosFinancieros: totalDeducir,
    cuadre,
    lineas: [],
    rawText: text.substring(0, 500),
  };
}

export async function parseCaixaBankPDF(buffer: Buffer, fileName?: string): Promise<ConfirmingParseResult> {
  const pdf = await pdfParse(buffer);
  return parseCaixaBankPDFText(pdf.text, {
    fileName,
    sourceHash: createHash('sha256').update(buffer).digest('hex'),
  });
}

/**
 * Función principal: parsea cualquier archivo de confirming
 */
export async function parseConfirmingFile(
  buffer: Buffer,
  fileName: string
): Promise<ConfirmingParseResult | null> {
  const tipo = detectarTipoConfirming(fileName);
  
  switch (tipo) {
    case 'bbva_pdf':
      return parseBBVACesionCreditos(buffer, fileName);
    case 'caixa_xls':
      return parseCaixaBankXLS(buffer, fileName);
    case 'caixa_pdf':
      return parseCaixaBankPDF(buffer, fileName);
    default:
      return null;
  }
}

// --- Utilidades ---

function parseImporteEspanol(valor: any): number {
  if (typeof valor === 'number') return valor;
  const str = String(valor).trim().replace('€', '').replace(/\s/g, '').trim();
  if (str.includes(',')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(str) || 0;
}

function parseFechaExcel(valor: any): string | undefined {
  if (!valor) return undefined;
  
  if (typeof valor === 'number') {
    const date = new Date((valor - 25569) * 86400 * 1000);
    if (!Number.isFinite(date.getTime())) return undefined;
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }
  
  const str = String(valor).trim();
  const abbreviated = fechaLiquidacionCaixa(`Fecha liquidación ${str}`);
  if (abbreviated) return abbreviated.replace(/\//g, '-');
  const match = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}-${match[3]}`;
  }
  
  return str;
}

/**
 * Normaliza un número de factura para comparación
 */
export function normalizarNumFactura(numFactura: string): string {
  return numFactura
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\/0+(\d)/, '/$1');
}
