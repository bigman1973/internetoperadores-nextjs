/**
 * Parser de documentos de confirming (BBVA PDF + CaixaBank XLS)
 * 
 * Extrae líneas de factura de los documentos de confirming para auto-vincular
 * con las facturas emitidas a Draxton.
 * 
 * Formatos soportados:
 * - BBVA: PDFs de "Cesión de Créditos" (DPC_CesióndeCréditos_*.pdf, DEA_CesióndeCréditos_*.pdf)
 * - CaixaBank: XLS con columnas de facturas (ConfirmingCaixa*.xls)
 * - CaixaBank: PDF con datos generales del anticipo (ConfirmingCaixa*.pdf)
 */

import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';

export interface ConfirmingLineaParsed {
  numFactura: string;       // Ej: "DRAX26/1"
  importe: number;          // Importe bruto de la factura
  importeNeto?: number;     // Importe neto (tras descuentos financieros)
  fechaFactura?: string;    // DD-MM-YYYY
  fechaPago?: string;       // DD-MM-YYYY (vencimiento)
  fechaVencimiento?: string; // Fecha vencimiento para CaixaBank
}

export interface ConfirmingParseResult {
  banco: 'BBVA' | 'CaixaBank';
  sociedad?: string;        // DPC (Draxton Powertrain & Chassis) o DEA (Draxton Europe & Asia)
  cliente?: string;         // Nombre del cliente (DRAXTON POWERTRAIN CHASSIS S.L., etc.)
  contrato?: string;        // Número de contrato BBVA
  fechaDocumento?: string;  // Fecha del documento
  totalRemesa: number;      // Total de la remesa/anticipo
  totalNeto?: number;       // Total neto (tras intereses/comisiones)
  lineas: ConfirmingLineaParsed[];
  rawText?: string;         // Texto crudo para debug
}

/**
 * Detecta el tipo de archivo de confirming por su nombre
 */
export function detectarTipoConfirming(fileName: string): 'bbva_pdf' | 'caixa_xls' | 'caixa_pdf' | 'unknown' {
  const name = fileName.toLowerCase();
  
  // BBVA: DPC_CesióndeCréditos_*.pdf o DEA_CesióndeCréditos_*.pdf
  if (name.includes('cesi') && name.endsWith('.pdf')) return 'bbva_pdf';
  if ((name.startsWith('dpc_') || name.startsWith('dea_')) && name.endsWith('.pdf')) return 'bbva_pdf';
  
  // CaixaBank XLS
  if (name.includes('confirming') && (name.endsWith('.xls') || name.endsWith('.xlsx'))) return 'caixa_xls';
  
  // CaixaBank PDF
  if (name.includes('confirming') && name.endsWith('.pdf')) return 'caixa_pdf';
  
  // Fallback: si tiene "cesion" o "credito" en el nombre es BBVA
  if ((name.includes('cesion') || name.includes('credito')) && name.endsWith('.pdf')) return 'bbva_pdf';
  
  return 'unknown';
}

/**
 * Parsea un PDF de Cesión de Créditos de BBVA
 * 
 * Formato del texto extraído:
 * - Contiene "CESIÓN DE CRÉDITOS AMPARADA EN EL CONTRATO: XXXX"
 * - "DETALLE DE LOS CRÉDITOS A CARGO DE: DRAXTON [SOCIEDAD]"
 * - Facturas: "_ DRAX26 /N" seguido de fecha e importe en líneas separadas
 * - "TOTAL REMESA XX.XXX,XX EUR"
 */
export async function parseBBVACesionCreditos(buffer: Buffer, fileName?: string): Promise<ConfirmingParseResult> {
  const pdf = await pdfParse(buffer);
  const text = pdf.text;
  
  // Detectar sociedad por nombre de archivo o contenido
  let sociedad: string | undefined;
  if (fileName) {
    const fn = fileName.toUpperCase();
    if (fn.startsWith('DPC')) sociedad = 'DPC';
    else if (fn.startsWith('DEA')) sociedad = 'DEA';
  }
  
  // Detectar sociedad por contenido si no se detectó por nombre
  if (!sociedad) {
    if (text.includes('POWERTRAIN') || text.includes('CHASSIS')) sociedad = 'DPC';
    else if (text.includes('EUROPE') || text.includes('ASIA')) sociedad = 'DEA';
  }
  
  // Extraer cliente
  let cliente: string | undefined;
  const clienteMatch = text.match(/A CARGO DE:\s*(.+?)(?:\n|QUE SE CEDEN)/s);
  if (clienteMatch) {
    cliente = clienteMatch[1].replace(/\n/g, ' ').trim();
    // Limpiar: quitar "BILBAO VIZCAYA..." que a veces se pega
    cliente = cliente.replace(/BILBAO VIZCAYA.*$/i, '').trim();
  }
  
  // Extraer contrato
  const contratoMatch = text.match(/CONTRATO:\s*([\d\s\-]+)/);
  const contrato = contratoMatch ? contratoMatch[1].trim() : undefined;
  
  // Extraer fecha del documento del nombre del archivo
  let fechaDocumento: string | undefined;
  if (fileName) {
    // Formato: DPC_CesióndeCréditos_15012026.pdf → 15/01/2026
    const fechaMatch = fileName.match(/(\d{2})(\d{2})(\d{4})/);
    if (fechaMatch) {
      fechaDocumento = `${fechaMatch[1]}/${fechaMatch[2]}/${fechaMatch[3]}`;
    }
  }
  
  // Extraer líneas de factura
  // Patrón: "_ DRAX26 /N" o "DRAX26/N" o "DRAX26 /N"
  const lineas: ConfirmingLineaParsed[] = [];
  
  // Buscar todas las facturas DRAX con regex flexible
  const facturaRegex = /(?:_\s*)?DRAX\d{2}\s*\/\s*(\d+)/gi;
  const facturas: string[] = [];
  let match;
  
  while ((match = facturaRegex.exec(text)) !== null) {
    // Reconstruir el número de factura normalizado
    const fullMatch = match[0].replace(/^_\s*/, '').replace(/\s+/g, '');
    // Normalizar: "DRAX26 /1" → "DRAX26/1"
    const normalized = fullMatch.replace(/\s*\/\s*/, '/');
    if (!facturas.includes(normalized)) {
      facturas.push(normalized);
    }
  }
  
  // Extraer importes - buscar números con formato español (X.XXX,XX)
  const importeRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const importes: number[] = [];
  
  // Buscar importes que aparecen después de las facturas y antes del TOTAL
  const detallePart = text.substring(text.indexOf('NUM. FACTURA'));
  const totalIdx = detallePart.indexOf('TOTAL REMESA');
  const detalleSection = totalIdx > 0 ? detallePart.substring(0, totalIdx) : detallePart;
  
  let importeMatch;
  while ((importeMatch = importeRegex.exec(detalleSection)) !== null) {
    const valor = parseFloat(importeMatch[1].replace(/\./g, '').replace(',', '.'));
    // Solo importes razonables para facturas (> 100€ y < 1.000.000€)
    if (valor > 100 && valor < 1000000) {
      importes.push(valor);
    }
  }
  
  // Extraer fechas de pago
  const fechaPagoRegex = /(\d{2}-\d{2}-\d{4})/g;
  const fechasPago: string[] = [];
  let fechaPagoMatch;
  while ((fechaPagoMatch = fechaPagoRegex.exec(detalleSection)) !== null) {
    fechasPago.push(fechaPagoMatch[1]);
  }
  
  // Emparejar facturas con importes
  // En BBVA, los importes aparecen intercalados con las fechas
  // Patrón: factura → fecha_factura → importe → fecha_pago → cesion → fin_plazo
  // Necesitamos filtrar: los importes de factura son los que están entre la fecha de factura y la fecha de pago
  
  // Estrategia: buscar cada factura y su importe asociado en el texto
  for (let i = 0; i < facturas.length; i++) {
    const numFactura = facturas[i];
    
    // Buscar el importe correspondiente
    // Los importes están en orden, uno por factura
    const importe = i < importes.length ? importes[i] : 0;
    
    // Buscar fecha de pago (normalmente es la misma para todas las facturas del mismo confirming)
    // Las fechas de pago son las que tienen formato DD-MM-YYYY y son posteriores a las fechas de factura
    const fechasPagoUnicas = [...new Set(fechasPago)];
    // La fecha de pago suele ser la más lejana (vencimiento)
    let fechaPago: string | undefined;
    if (fechasPagoUnicas.length > 0) {
      // Ordenar por fecha y tomar la más lejana como fecha de pago
      const sorted = fechasPagoUnicas.sort((a, b) => {
        const [da, ma, ya] = a.split('-').map(Number);
        const [db, mb, yb] = b.split('-').map(Number);
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      });
      // La fecha de pago es la que está más lejos (vencimiento)
      fechaPago = sorted[sorted.length - 1];
      // La fecha de factura es la más cercana
    }
    
    lineas.push({
      numFactura,
      importe,
      fechaPago,
    });
  }
  
  // Extraer total remesa
  let totalRemesa = 0;
  const totalMatch = text.match(/TOTAL(?:\s+REMESA)?\s+([\d.]+,\d{2})/);
  if (totalMatch) {
    totalRemesa = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
  }
  
  // Si no encontramos total, sumar los importes
  if (totalRemesa === 0 && lineas.length > 0) {
    totalRemesa = lineas.reduce((sum, l) => sum + l.importe, 0);
  }
  
  return {
    banco: 'BBVA',
    sociedad,
    cliente,
    contrato,
    fechaDocumento,
    totalRemesa,
    lineas,
    rawText: text.substring(0, 500), // Solo primeros 500 chars para debug
  };
}

/**
 * Parsea un XLS de CaixaBank con detalle de facturas
 * 
 * Columnas esperadas:
 * - Núm. factura (o similar)
 * - Fecha factura
 * - Fecha vencimiento
 * - Importe factura
 * - Importe neto
 */
export function parseCaixaBankXLS(buffer: Buffer, fileName?: string): ConfirmingParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convertir a JSON con headers
  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  
  const lineas: ConfirmingLineaParsed[] = [];
  let totalRemesa = 0;
  let totalNeto = 0;
  
  for (const row of rawData) {
    // Buscar la columna de número de factura (puede variar el nombre)
    const numFacturaKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('factura') && k.toLowerCase().includes('n')
    ) || Object.keys(row).find(k => k.toLowerCase().includes('factura'));
    
    const importeKey = Object.keys(row).find(k => 
      k.toLowerCase().includes('importe') && k.toLowerCase().includes('factura')
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
    
    // Solo procesar filas con número de factura tipo DRAX
    if (!numFactura || !numFactura.toUpperCase().includes('DRAX')) continue;
    
    // Normalizar número de factura
    const numFacturaNorm = numFactura.replace(/\s+/g, '').toUpperCase();
    
    // Parsear importe
    let importe = 0;
    if (importeKey && row[importeKey]) {
      importe = parseImporteEspanol(row[importeKey]);
    }
    
    // Parsear importe neto
    let importeNeto: number | undefined;
    if (importeNetoKey && row[importeNetoKey]) {
      importeNeto = parseImporteEspanol(row[importeNetoKey]);
    }
    
    // Parsear fechas
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
    });
    
    totalRemesa += importe;
    if (importeNeto) totalNeto += importeNeto;
  }
  
  // Extraer fecha del nombre del archivo
  let fechaDocumento: string | undefined;
  if (fileName) {
    // Formato: ConfirmingCaixa17.02.2026.xls → 17/02/2026
    const fechaMatch = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (fechaMatch) {
      fechaDocumento = `${fechaMatch[1]}/${fechaMatch[2]}/${fechaMatch[3]}`;
    }
    // Formato alternativo: Confirming CaixaBank-Santander Febrero 2026.xls
    if (!fechaDocumento) {
      const mesMatch = fileName.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(\d{4})/i);
      if (mesMatch) {
        const meses: Record<string, string> = {
          enero: '01', febrero: '02', marzo: '03', abril: '04',
          mayo: '05', junio: '06', julio: '07', agosto: '08',
          septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
        };
        fechaDocumento = `01/${meses[mesMatch[1].toLowerCase()]}/${mesMatch[2]}`;
      }
    }
  }
  
  return {
    banco: 'CaixaBank',
    cliente: 'DRAXTON EUROPE&ASIA',
    fechaDocumento,
    totalRemesa,
    totalNeto,
    lineas,
  };
}

/**
 * Parsea un PDF de CaixaBank (datos generales del anticipo)
 * Menos útil que el XLS pero sirve como respaldo
 */
export async function parseCaixaBankPDF(buffer: Buffer, fileName?: string): Promise<ConfirmingParseResult> {
  const pdf = await pdfParse(buffer);
  const text = pdf.text;
  
  // Extraer datos generales
  let totalRemesa = 0;
  let totalNeto = 0;
  let cliente: string | undefined;
  let fechaDocumento: string | undefined;
  
  // Cliente
  const clienteMatch = text.match(/Cliente\s*\n?\s*(.+)/i);
  if (clienteMatch) cliente = clienteMatch[1].trim();
  
  // Importe factura (total bruto)
  const importeMatch = text.match(/Importe factura\s*\n?\s*([\d.,]+)\s*€?/i);
  if (importeMatch) {
    totalRemesa = parseImporteEspanol(importeMatch[1]);
  }
  
  // Importe neto
  const netoMatch = text.match(/Importe neto\s*\n?\s*([\d.,]+)\s*€?/i);
  if (netoMatch) {
    totalNeto = parseImporteEspanol(netoMatch[1]);
  }
  
  // Fecha solicitud
  const fechaMatch = text.match(/Fecha solicitud\s*\n?\s*(\d{1,2}\s+\w+\s+\d{2,4})/i);
  if (fechaMatch) {
    fechaDocumento = fechaMatch[1].trim();
  }
  
  // Número de facturas
  const nroFacturasMatch = text.match(/Nro facturas\s*\n?\s*(\d+)/i);
  const nroFacturas = nroFacturasMatch ? parseInt(nroFacturasMatch[1]) : 0;
  
  // El PDF de CaixaBank no tiene detalle de facturas individuales
  // Solo datos generales del anticipo
  // Las líneas se extraen del XLS
  
  // Intentar extraer fecha del nombre del archivo
  if (!fechaDocumento && fileName) {
    const fMatch = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (fMatch) {
      fechaDocumento = `${fMatch[1]}/${fMatch[2]}/${fMatch[3]}`;
    }
  }
  
  return {
    banco: 'CaixaBank',
    cliente,
    fechaDocumento,
    totalRemesa,
    totalNeto,
    lineas: [], // El PDF no tiene detalle de líneas
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

/**
 * Parsea un importe en formato español (1.234,56) o número directo
 */
function parseImporteEspanol(valor: any): number {
  if (typeof valor === 'number') return valor;
  const str = String(valor).trim().replace('€', '').trim();
  // Formato español: 1.234,56
  if (str.includes(',')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
  }
  // Formato anglosajón: 1234.56
  return parseFloat(str) || 0;
}

/**
 * Parsea una fecha de Excel (puede ser número serial o string)
 */
function parseFechaExcel(valor: any): string | undefined {
  if (!valor) return undefined;
  
  // Si es un número (fecha serial de Excel)
  if (typeof valor === 'number') {
    const date = new Date((valor - 25569) * 86400 * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
  
  // Si es string, intentar parsear
  const str = String(valor).trim();
  
  // Formato DD/MM/YYYY o DD-MM-YYYY
  const match = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}-${match[3]}`;
  }
  
  return str;
}

/**
 * Normaliza un número de factura para comparación
 * "DRAX26 / 1" → "DRAX26/1"
 * "drax26/01" → "DRAX26/1"
 */
export function normalizarNumFactura(numFactura: string): string {
  return numFactura
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\/0+(\d)/, '/$1'); // Quitar ceros a la izquierda después de /
}
