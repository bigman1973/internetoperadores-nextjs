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
  
  // BBVA: DPC_CesióndeCréditos_*.pdf, DEA_ConfirmingBBVA_*.pdf, DPC_ConfirmingBBVA_*.pdf
  if (name.includes('confirmingbbva') && name.endsWith('.pdf')) return 'bbva_pdf';
  if (name.includes('cesi') && name.endsWith('.pdf')) return 'bbva_pdf';
  if ((name.startsWith('dpc_') || name.startsWith('dea_') || name.startsWith('dpc ') || name.startsWith('dea ')) && name.endsWith('.pdf')) return 'bbva_pdf';
  
  // CaixaBank XLS
  if (name.includes('confirming') && name.includes('caixa') && (name.endsWith('.xls') || name.endsWith('.xlsx'))) return 'caixa_xls';
  if (name.includes('caixa') && (name.endsWith('.xls') || name.endsWith('.xlsx'))) return 'caixa_xls';
  
  // CaixaBank PDF
  if (name.includes('confirming') && name.includes('caixa') && name.endsWith('.pdf')) return 'caixa_pdf';
  if (name.includes('caixa') && name.endsWith('.pdf')) return 'caixa_pdf';
  
  // Fallback: si tiene "cesion" o "credito" en el nombre es BBVA
  if ((name.includes('cesion') || name.includes('credito') || name.includes('crédito')) && name.endsWith('.pdf')) return 'bbva_pdf';
  
  return 'unknown';
}

/**
 * Parsea un PDF de Confirming BBVA
 * 
 * Soporta DOS formatos:
 * 
 * FORMATO ANTIGUO (Castellano - "Cesión de Créditos"):
 * - "DETALLE DE LOS CRÉDITOS A CARGO DE: DRAXTON [SOCIEDAD]"
 * - Datos por factura en líneas separadas: DRAX26/N, fecha, importe, fecha_pago, nº_cesión, fin_plazo
 * - "TOTAL REMESA XX.XXX,XX EUR"
 * 
 * FORMATO NUEVO (Catalán - "Liquidació de bestretes"):
 * - Página 1: Datos generales (Import nominal = total remesa, Líquid a favor = neto)
 * - Página 2: Tabla de facturas con columnas en una sola línea:
 *   "DRAX26 / 15    15/07/2026    4,67 EUR    9.345,93 EUR    2.148    97,25 EUR"
 *   Donde el importe real de la factura es el número más grande (columna "Interès" = importe factura)
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
  
  // Detectar formato: nuevo (catalán) vs antiguo (castellano)
  const esFormatoNuevo = text.includes('Liquidació de bestretes') || text.includes('Import nominal') || text.includes('Líquid a favor');
  
  if (esFormatoNuevo) {
    return parseBBVAFormatoNuevo(text, fileName, sociedad);
  } else {
    return parseBBVAFormatoAntiguo(text, fileName, sociedad);
  }
}

/**
 * Formato nuevo BBVA (catalán - "Liquidació de bestretes")
 * 
 * Texto extraído por pdf-parse (todo pegado sin espacios entre columnas):
 * - Import nominal: 22.236,85 EUR (total remesa)
 * - Líquid a favor seu: 21.992,02 EUR (neto)
 * - Cada línea de factura: "DRAX26 / 1515/07/20264,67 EUR9.345,93 EUR2.14897,25 EUR"
 *   Donde el importe real es el mayor de la línea
 */
function parseBBVAFormatoNuevo(text: string, fileName?: string, sociedad?: string): ConfirmingParseResult {
  // Extraer cliente
  let cliente: string | undefined;
  const clienteMatch = text.match(/Client\s*(.+)/i);
  if (clienteMatch) {
    cliente = clienteMatch[1].replace(/^\s+/, '').trim();
    // Limpiar si tiene NIF pegado
    cliente = cliente.replace(/[A-Z]\d{8}.*$/, '').trim();
  }
  
  // Extraer contrato
  let contrato: string | undefined;
  const contratoMatch = text.match(/contracte\s+([\d\s]+)/i);
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
    const fechaLiqMatch = text.match(/Data de liquidació\s+(\d{2}\/\d{2}\/\d{4})/);
    if (fechaLiqMatch) fechaDocumento = fechaLiqMatch[1];
  }
  
  // Extraer total remesa (Import nominal)
  let totalRemesa = 0;
  const nominalMatch = text.match(/Import nominal\s+([\d.,]+)\s*EUR/i);
  if (nominalMatch) {
    totalRemesa = parseFloat(nominalMatch[1].replace(/\./g, '').replace(',', '.'));
  }
  
  // Extraer total neto (Líquid a favor)
  let totalNeto: number | undefined;
  const netoMatch = text.match(/Líquid a favor\s+\w+\s+([\d.,]+)\s*EUR/i);
  if (netoMatch) {
    totalNeto = parseFloat(netoMatch[1].replace(/\./g, '').replace(',', '.'));
  }
  
  // Extraer líneas de factura
  const lineas: ConfirmingLineaParsed[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line.match(/DRAX\d{2}/i)) continue;
    
    // PASO 1: Separar fechas insertando espacios (clave para evitar que se peguen al importe)
    const cleaned = line.replace(/(\d{2}[-\/]\d{2}[-\/]\d{4})/g, ' $1 ');
    
    // PASO 2: Extraer número de factura con lookahead a espacio
    const facturaRegex = /DRAX\d{2}\s*\/\s*\d{1,3}(?=\s)/i;
    const facturaMatch = cleaned.match(facturaRegex);
    if (!facturaMatch) continue;
    const numFacturaNorm = facturaMatch[0].replace(/\s+/g, '').toUpperCase();
    
    // PASO 3: Extraer fecha de pago
    let fechaPago: string | undefined;
    const fechaMatch = cleaned.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/);
    if (fechaMatch) {
      fechaPago = fechaMatch[1].replace(/\//g, '-');
    }
    
    // PASO 4: Extraer importes (ahora correctamente separados)
    // Estructura de la línea: [comisión EUR] [importe_factura EUR] [código+interés EUR]
    // El 2º importe es SIEMPRE el de la factura
    // El 3º puede ser falso positivo (ej: "2.4836,14" → regex captura "836,14")
    const importeRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g;
    const importesEnLinea: number[] = [];
    let m;
    while ((m = importeRegex.exec(cleaned)) !== null) {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      importesEnLinea.push(val);
    }
    
    // El importe de la factura es el SEGUNDO (posición [1])
    // Si solo hay 1, usar ese. Si hay 0, dejar en 0.
    let importe = 0;
    if (importesEnLinea.length >= 2) {
      importe = importesEnLinea[1]; // 2º importe = importe factura
    } else if (importesEnLinea.length === 1) {
      importe = importesEnLinea[0];
    }
    
    lineas.push({
      numFactura: numFacturaNorm,
      importe,
      fechaPago,
    });
  }
  
  // Si no encontramos total remesa pero tenemos líneas, sumar
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
    totalNeto,
    lineas,
    rawText: text.substring(0, 500),
  };
}

/**
 * Formato antiguo BBVA (castellano - "Cesión de Créditos")
 * 
 * pdf-parse pega todo sin espacios entre columnas:
 * "_ DRAX26 /115-01-20265.301,9215-05-2026469747130-01-2026"
 * 
 * Estrategia: separar fechas (DD-MM-YYYY) insertando espacios,
 * luego extraer factura e importe del texto limpio.
 */
function parseBBVAFormatoAntiguo(text: string, fileName?: string, sociedad?: string): ConfirmingParseResult {
  // Extraer cliente
  let cliente: string | undefined;
  const clienteMatch = text.match(/A CARGO DE:\s*(.+?)(?:\n|QUE SE CEDEN)/s);
  if (clienteMatch) {
    cliente = clienteMatch[1].replace(/\n/g, ' ').trim();
    cliente = cliente.replace(/BILBAO VIZCAYA.*$/i, '').trim();
  }
  
  // Extraer contrato
  const contratoMatch = text.match(/CONTRATO:\s*([\d\s\-]+)/);
  const contrato = contratoMatch ? contratoMatch[1].trim() : undefined;
  
  // Extraer fecha del documento del nombre del archivo
  let fechaDocumento: string | undefined;
  if (fileName) {
    const fechaMatch = fileName.match(/(\d{2})(\d{2})(\d{4})/);
    if (fechaMatch) {
      fechaDocumento = `${fechaMatch[1]}/${fechaMatch[2]}/${fechaMatch[3]}`;
    }
  }
  
  // Dividir el texto en líneas
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const lineas: ConfirmingLineaParsed[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Solo procesar líneas que contienen DRAX
    if (!line.match(/DRAX\d{2}/i)) continue;
    
    // PASO 1: Separar fechas (DD-MM-YYYY y DD/MM/YYYY) insertando espacios
    const cleaned = line.replace(/(\d{2}[-\/]\d{2}[-\/]\d{4})/g, ' $1 ');
    
    // PASO 2: Extraer número de factura
    // Después de separar fechas, el número queda limpio: "_ DRAX26 /1 15-01-2026 5.301,92..."
    const facturaRegex = /DRAX\d{2}\s*\/\s*\d{1,3}(?=\s)/i;
    const facturaMatch = cleaned.match(facturaRegex);
    if (!facturaMatch) continue;
    const numFacturaNorm = facturaMatch[0].replace(/\s+/g, '').toUpperCase();
    
    // Ignorar si es un número de factura claramente inválido (> 999)
    const numAfterSlash = numFacturaNorm.split('/')[1];
    if (numAfterSlash && parseInt(numAfterSlash) > 999) continue;
    
    // PASO 3: Extraer fechas
    const fechas = cleaned.match(/(\d{2}-\d{2}-\d{4})/g) || [];
    const fechaFactura = fechas[0] || undefined;
    const fechaPago = fechas[1] || undefined;
    
    // PASO 4: Extraer importes (formato español X.XXX,XX)
    const importeRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
    const importes: number[] = [];
    let m;
    while ((m = importeRegex.exec(cleaned)) !== null) {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      // Solo importes razonables para facturas (50€ - 50.000€)
      if (val >= 50 && val <= 50000) {
        importes.push(val);
      }
    }
    
    // El importe de la factura es el más grande
    const importe = importes.length > 0 ? Math.max(...importes) : 0;
    
    lineas.push({
      numFactura: numFacturaNorm,
      importe,
      fechaFactura,
      fechaPago,
    });
  }
  
  // Extraer total remesa
  let totalRemesa = 0;
  // Separar fechas también para el total
  const cleanedText = text.replace(/(\d{2}[-\/]\d{2}[-\/]\d{4})/g, ' $1 ');
  const totalMatch = cleanedText.match(/TOTAL(?:\s+REMESA)?\s+([\d.]+,\d{2})/);
  if (totalMatch) {
    totalRemesa = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
  }
  
  // Si no encontramos total, sumar los importes de las líneas
  if (totalRemesa === 0 && lineas.length > 0) {
    totalRemesa = lineas.reduce((sum, l) => sum + l.importe, 0);
  }
  
  // Si hay facturas sin importe pero tenemos el total, distribuir equitativamente
  const sinImporte = lineas.filter(l => l.importe === 0);
  if (sinImporte.length > 0 && totalRemesa > 0) {
    const conImporte = lineas.filter(l => l.importe > 0);
    const sumaConImporte = conImporte.reduce((sum, l) => sum + l.importe, 0);
    const restante = totalRemesa - sumaConImporte;
    if (restante > 0 && sinImporte.length > 0) {
      const importePorFactura = restante / sinImporte.length;
      for (const l of sinImporte) {
        l.importe = Math.round(importePorFactura * 100) / 100;
      }
    }
  }
  
  return {
    banco: 'BBVA',
    sociedad,
    cliente,
    contrato,
    fechaDocumento,
    totalRemesa,
    lineas,
    rawText: text.substring(0, 500),
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
    const fechaMatch = fileName.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (fechaMatch) {
      fechaDocumento = `${fechaMatch[1].padStart(2, '0')}/${fechaMatch[2]}/${fechaMatch[3]}`;
    }
    // Formato: Confirming Caixa 2.07.2026.pdf → 02/07/2026
    if (!fechaDocumento) {
      const fechaMatch2 = fileName.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
      if (fechaMatch2) {
        fechaDocumento = `${fechaMatch2[1].padStart(2, '0')}/${fechaMatch2[2]}/${fechaMatch2[3]}`;
      }
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
 * Contiene datos como: Importe factura, Intereses, Comisiones, Importe neto
 * NO contiene detalle de facturas individuales (eso está en el XLS)
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
  
  // Intentar extraer fecha del nombre del archivo
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
    lineas: [], // El PDF no tiene detalle de líneas individuales
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
  const str = String(valor).trim().replace('€', '').replace(/\s/g, '').trim();
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
