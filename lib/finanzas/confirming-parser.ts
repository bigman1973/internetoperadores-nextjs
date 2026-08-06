/**
 * Parser de documentos de confirming (BBVA PDF + CaixaBank XLS)
 * 
 * Extrae líneas de factura + gastos financieros de los documentos de confirming
 * para auto-vincular con las facturas emitidas a Draxton.
 * 
 * Formatos soportados:
 * - BBVA: PDFs "Liquidació de bestretes" (DEA_Confirming BBVA_*.pdf, DPC_Confirming BBVA_*.pdf)
 * - CaixaBank: XLS con columnas de facturas (ConfirmingCaixa*.xls)
 * - CaixaBank: PDF con datos generales del anticipo (Confirming Caixa*.pdf)
 */

import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';

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
}

export interface ConfirmingParseResult {
  banco: 'BBVA' | 'CaixaBank';
  sociedad?: string;        // DPC (Draxton Powertrain & Chassis) o DEA (Draxton Europe & Asia)
  cliente?: string;         // Nombre del cliente
  contrato?: string;        // Número de contrato BBVA
  fechaDocumento?: string;  // Fecha del documento
  totalRemesa: number;      // Total nominal de la remesa
  totalNeto?: number;       // Total neto (tras intereses/comisiones)
  totalComisiones?: number; // Total comisiones del documento
  totalIntereses?: number;  // Total intereses del documento
  totalGastosFinancieros?: number; // Total gastos financieros (comisiones + intereses + IVA)
  tae?: number;             // TAE del documento
  lineas: ConfirmingLineaParsed[];
  rawText?: string;         // Texto crudo para debug
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
 * Parsea un PDF de Confirming BBVA ("Liquidació de bestretes")
 * 
 * Estructura del documento:
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
  
  // Extraer datos financieros globales
  let totalRemesa = 0;
  const nominalMatch = text.match(/Import nominal\s*([\d.,]+)\s*EUR/i);
  if (nominalMatch) {
    totalRemesa = parseImporteEspanol(nominalMatch[1]);
  }
  
  let totalNeto: number | undefined;
  const netoMatch = text.match(/Líquid a favor[^\d]+([\d.,]+)\s*EUR/i);
  if (netoMatch) {
    totalNeto = parseImporteEspanol(netoMatch[1]);
  }
  
  let totalComisiones: number | undefined;
  const comisionMatch = text.match(/Import comissió\s*([\d.,]+)\s*EUR/i);
  if (comisionMatch) {
    totalComisiones = parseImporteEspanol(comisionMatch[1]);
  }
  
  let totalIntereses: number | undefined;
  const interesesMatch = text.match(/Import interessos\s*([\d.,]+)\s*EUR/i);
  if (interesesMatch) {
    totalIntereses = parseImporteEspanol(interesesMatch[1]);
  }
  
  // Import a deduir = total gastos financieros (comisión + IVA + intereses)
  let totalGastosFinancieros: number | undefined;
  const deduirMatch = text.match(/Import a deduir\s*([\d.,]+)\s*EUR/i);
  if (deduirMatch) {
    totalGastosFinancieros = parseImporteEspanol(deduirMatch[1]);
  }
  
  // TAE
  let tae: number | undefined;
  const taeMatch = text.match(/TAE\s*([\d.,]+)\s*%/i);
  if (taeMatch) {
    tae = parseFloat(taeMatch[1].replace(',', '.'));
  }
  
  // Extraer líneas de factura
  const lineas: ConfirmingLineaParsed[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line.match(/DRAX/i)) continue;
    // Ignorar línea de cabecera "ClientDRAXTON..."
    if (line.match(/^Client/i)) continue;
    if (line.match(/NIF/i)) continue;
    
    // PASO 1: Separar fechas insertando espacios
    const cleaned = line.replace(/(\d{2}[-\/]\d{2}[-\/]\d{4})/g, ' $1 ');
    
    // PASO 2: Extraer número de factura con lookahead a espacio
    const facturaRegex = /DRAX\d{0,2}\s*\/\s*\d{1,3}(?=\s)/i;
    const facturaMatch = cleaned.match(facturaRegex);
    if (!facturaMatch) continue;
    let numFacturaNorm = facturaMatch[0].replace(/\s+/g, '').toUpperCase();
    
    // Normalizar: si es "DRAX/52" → "DRAX26/52" (falta el año)
    if (numFacturaNorm.match(/^DRAX\/\d/)) {
      numFacturaNorm = numFacturaNorm.replace('DRAX/', 'DRAX26/');
    }
    
    // PASO 3: Extraer fecha de pago
    let fechaPago: string | undefined;
    const fechaMatch = cleaned.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/);
    if (fechaMatch) {
      fechaPago = fechaMatch[1].replace(/\//g, '-');
    }
    
    // PASO 4: Separar tipo de interés (X.XXX) del texto para evitar falsos positivos
    // El tipo (ej: "2.483") se pega al importe de intereses: "2.48374,21 EUR"
    // Insertamos espacio entre el tipo y los dígitos siguientes
    const sinTipo = cleaned.replace(/(\d\.\d{3})(\d)/g, '$1 $2');
    
    // Extraer tipo de interés
    let tipoInteres: number | undefined;
    const tipoMatch = sinTipo.match(/(\d\.\d{3})\s/);
    if (tipoMatch) {
      tipoInteres = parseFloat(tipoMatch[1]);
    }
    
    // Ahora extraer importes EUR (ya limpios)
    const importeRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g;
    const importesEnLinea: number[] = [];
    let m;
    while ((m = importeRegex.exec(sinTipo)) !== null) {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      importesEnLinea.push(val);
    }
    
    // Asignar importes por posición:
    // [0] = comisión, [1] = importe factura, [2] = intereses
    let comision = 0;
    let importe = 0;
    let intereses = 0;
    
    if (importesEnLinea.length >= 3) {
      comision = importesEnLinea[0];
      importe = importesEnLinea[1];
      intereses = importesEnLinea[2];
    } else if (importesEnLinea.length === 2) {
      comision = importesEnLinea[0];
      importe = importesEnLinea[1];
    } else if (importesEnLinea.length === 1) {
      importe = importesEnLinea[0];
    }
    
    const gastosFinancieros = comision + intereses;
    
    lineas.push({
      numFactura: numFacturaNorm,
      importe,
      comision: comision > 0 ? comision : undefined,
      intereses: intereses > 0 ? intereses : undefined,
      tipoInteres,
      gastosFinancieros: gastosFinancieros > 0 ? gastosFinancieros : undefined,
      fechaPago,
    });
  }
  
  // Si no encontramos total remesa pero tenemos líneas, sumar
  if (totalRemesa === 0 && lineas.length > 0) {
    totalRemesa = lineas.reduce((sum, l) => sum + l.importe, 0);
  }
  
  // Si no tenemos totalGastosFinancieros, calcularlo de las líneas
  if (!totalGastosFinancieros && lineas.some(l => l.gastosFinancieros)) {
    totalGastosFinancieros = lineas.reduce((sum, l) => sum + (l.gastosFinancieros || 0), 0);
  }
  
  return {
    banco: 'BBVA',
    sociedad,
    cliente,
    contrato,
    fechaDocumento,
    totalRemesa,
    totalNeto,
    totalComisiones,
    totalIntereses,
    totalGastosFinancieros,
    tae,
    lineas,
    rawText: text.substring(0, 500),
  };
}

/**
 * Parsea un XLS de CaixaBank con detalle de facturas
 * 
 * Columnas: Núm. factura | Fecha factura | Fecha vencimiento | Importe factura | Importe neto
 * Gastos financieros = Importe factura - Importe neto
 */
export function parseCaixaBankXLS(buffer: Buffer, fileName?: string): ConfirmingParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  
  const lineas: ConfirmingLineaParsed[] = [];
  let totalRemesa = 0;
  let totalNeto = 0;
  let totalGastosFinancieros = 0;
  
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
    
    // Gastos financieros = diferencia entre bruto y neto
    const gastosFinancieros = importeNeto ? Math.round((importe - importeNeto) * 100) / 100 : undefined;
    
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
      gastosFinancieros,
      fechaFactura,
      fechaVencimiento,
    });
    
    totalRemesa += importe;
    if (importeNeto) totalNeto += importeNeto;
    if (gastosFinancieros) totalGastosFinancieros += gastosFinancieros;
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
    cliente: 'DRAXTON EUROPE&ASIA',
    fechaDocumento,
    totalRemesa,
    totalNeto,
    totalGastosFinancieros: totalGastosFinancieros > 0 ? totalGastosFinancieros : undefined,
    lineas,
  };
}

/**
 * Parsea un PDF de CaixaBank (datos generales del anticipo)
 * NO contiene detalle de facturas individuales (eso está en el XLS)
 */
export async function parseCaixaBankPDF(buffer: Buffer, fileName?: string): Promise<ConfirmingParseResult> {
  const pdf = await pdfParse(buffer);
  const text = pdf.text;
  
  let totalRemesa = 0;
  let totalNeto = 0;
  let cliente: string | undefined;
  let fechaDocumento: string | undefined;
  let totalGastosFinancieros: number | undefined;
  
  const clienteMatch = text.match(/Cliente\s*\n?\s*(.+)/i);
  if (clienteMatch) cliente = clienteMatch[1].trim();
  
  const importeMatch = text.match(/Importe factura\s*\n?\s*([\d.,]+)\s*€?/i);
  if (importeMatch) {
    totalRemesa = parseImporteEspanol(importeMatch[1]);
  }
  
  const netoMatch = text.match(/Importe neto\s*\n?\s*([\d.,]+)\s*€?/i);
  if (netoMatch) {
    totalNeto = parseImporteEspanol(netoMatch[1]);
  }
  
  // Gastos financieros del PDF = bruto - neto
  if (totalRemesa > 0 && totalNeto > 0) {
    totalGastosFinancieros = Math.round((totalRemesa - totalNeto) * 100) / 100;
  }
  
  if (!fechaDocumento && fileName) {
    const fMatch = fileName.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (fMatch) {
      fechaDocumento = `${fMatch[1].padStart(2, '0')}/${fMatch[2]}/${fMatch[3]}`;
    }
  }
  
  return {
    banco: 'CaixaBank',
    cliente,
    fechaDocumento,
    totalRemesa,
    totalNeto,
    totalGastosFinancieros,
    lineas: [],
    rawText: text.substring(0, 500),
  };
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
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
  
  const str = String(valor).trim();
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
