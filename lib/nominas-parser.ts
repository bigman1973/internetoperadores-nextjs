/**
 * Parser for payroll PDF files
 * Supports two formats:
 * 1. COSTES IO - Summary table with all employees (from gestoría)
 * 2. Nóminas individuales - Detailed payslip per employee (one or multiple pages)
 * 
 * pdf-parse extracts text in multi-line format where numbers get split:
 * - "1.424,50" may appear as "1.424,5\n0" (integer part split)
 * - "550,57" may appear as "550,\n57" (decimal part split)
 */

import pdf from 'pdf-parse';

export async function extractPayrollPdfText(buffer: Buffer): Promise<string> {
  try {
    return (await pdf(buffer)).text;
  } catch (legacyError) {
    // pdf-parse 1.x incorpora un PDF.js antiguo que falla con algunos XRef
    // generados por la gestoría. Nunca aceptar el PDF si tampoco se puede leer
    // y verificar con el parser financiero habitual.
    if (!(legacyError instanceof Error) || !/xref|invalid pdf|formaterror/i.test(legacyError.message)) throw legacyError;
    const modern = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = modern.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, useSystemFonts: true });
    const document = await task.promise;
    try {
      if (document.numPages > 80) throw new Error('El PDF tiene demasiadas páginas para una nómina');
      const lines: string[] = [];
      for (let n = 1; n <= document.numPages; n++) {
        const page = await document.getPage(n);
        const content = await page.getTextContent();
        let row = '';
        let prevY: number | null = null;
        let prevRight: number | null = null;
        for (const raw of content.items) {
          if (!('str' in raw)) continue;
          const item = raw as { str: string; transform: number[]; width: number; hasEOL?: boolean };
          const x = item.transform[4], y = item.transform[5];
          if (prevY !== null && Math.abs(prevY - y) > 2) { lines.push(row); row = ''; prevRight = null; }
          if (row && prevRight !== null && x - prevRight > 2) row += x - prevRight > 20 ? '  ' : ' ';
          row += item.str;
          prevY = y; prevRight = x + item.width;
          if (item.hasEOL) { lines.push(row); row = ''; prevY = null; prevRight = null; }
        }
        if (row) lines.push(row);
        lines.push('');
      }
      if (!lines.join('').trim()) throw new Error('El PDF no contiene texto seleccionable');
      return lines.join('\n');
    } finally {
      await task.destroy();
    }
  }
}

export interface NominaParseResult {
  nombre: string;
  nif: string;
  tipo?: 'NOMINA' | 'LIQUIDACION';
  mes: number;
  anio: number;
  fechaCobro: string;
  devengadoTotal: number;
  netoPercibir: number;
  irpf: number;
  ssTrabajador: number;
  ssEmpresa: number;
  baseIrpf: number;
  costeTotalEmpresa: number;
  complementoEspecie: number;
}

export interface ParseSummary {
  mes: number;
  anio: number;
  empleados: number;
  totalBruto: number;
  totalNeto: number;
  totalIRPF: number;
  totalSSTrabajador: number;
  totalSSEmpresa: number;
  totalCosteEmpresa: number;
  verificado: boolean;
  nominas: NominaParseResult[];
  formato: 'costes_io' | 'nomina_individual';
}

/**
 * Extract the professional category printed on an individual payslip.
 * The worker row follows the pattern: NAME  CATEGORY  DATE  NIF.
 */
export function extractProfessionalCategoryFromPayrollText(text: string): string | null {
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.includes('NIF.') || line.includes('AFILIACION')) continue;
    if (!/(\d{8}[A-Z])\s*$/.test(line)) continue;

    const segments = line.trim().split(/\s{2,}/).filter(Boolean);
    if (segments.length >= 3) {
      const nifIndex = segments.findIndex(segment => /\d{8}[A-Z]\s*$/.test(segment));
      if (nifIndex >= 2) {
        const category = segments[1].trim();
        if (category && !/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(category)) return category;
      }
    }

    const categoryMatch = line.match(/^\s{2,}.+?\s{2,}([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s/.-]+?)\s{2,}.*\d{8}[A-Z]\s*$/);
    if (categoryMatch?.[1]) return categoryMatch[1].trim();
  }

  return null;
}

/** ANTIGÜEDAD del recibo individual: no equivale necesariamente al alta contractual.
 * Se limita al encabezado inmediato para no confundirla con el período pagado. */
export function extractPayrollSeniorityDate(text: string): string | null {
  const match = text.match(/ANTIG[ÜU]EDAD[\s\S]{0,110}?\b(\d{1,2})\s+(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s+(\d{2}|20\d{2})\b/i);
  if (!match) return null;
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const month = months.indexOf(match[2].toUpperCase());
  const day = Number(match[1]);
  const shortYear = Number(match[3]);
  const year = match[3].length === 2 ? (shortYear >= 70 ? 1900 : 2000) + shortYear : shortYear;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day || date > new Date()) return null;
  return date.toISOString().slice(0, 10);
}

/** Reintegros documentados en las líneas de devengos de la nómina individual.
 * Solo se toma la columna final de importe; cantidades y precios unitarios
 * anteriores al código no se suman. null = desglose ambiguo/no verificado. */
export function extractPayrollReimbursements(text: string): number | null {
  if (!/LIQUIDO A\s+PERCIBIR/i.test(text) || !/DEVENGADO/i.test(text)) return null;
  const expense = /\b(?:kilometraje|dietas?|gastos?\s+(?:de\s+)?(?:desplazamiento|viaje|transporte|manutenci[oó]n|estancia)|reintegro\s+de\s+gastos?|locomoci[oó]n|suplidos?|peajes?|aparcamiento|parking)\b/i;
  const possiblyNonSalary = /\b(?:gastos?|dietas?|kilometraje|desplazamiento|locomoci[oó]n|manutenci[oó]n|estancia|reembolso|reintegro|suplidos?|peajes?|aparcamiento|parking)\b/i;
  let total = 0;
  for (const line of text.split('\n')) {
    const label = line.match(/\b\d{3}\s*-\s*([^\n]+)/);
    if (!label) continue;
    if (!expense.test(label[1])) {
      if (possiblyNonSalary.test(label[1])) return null;
      continue;
    }
    const amounts = label[1].match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
    // No usar un valor si podría ser un precio unitario, una deducción o
    // una devolución: la proyección debe permanecer pendiente de revisión.
    if (amounts.length !== 1 || amounts[0].startsWith('-')) return null;
    const cents = Math.round(Number(amounts[0].replace(/\./g, '').replace(',', '.')) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) return null;
    total += cents;
  }
  return Number.isSafeInteger(total) ? total / 100 : null;
}

/** Algunos finiquitos contienen también la nómina de los últimos días trabajados.
 * Solo se aceptan como justificante si su total cuadra al céntimo con el resumen
 * de gestoría (nómina parcial + línea FINIQUITO), nunca se suman otra vez. */
export function parseCombinedSettlementReceipt(text: string) {
  const identity = text.match(/Apellidos y Nombre:\s*(.+?)\s*N\.?I\.?F\.?\s*:\s*(\d{8}[A-Z])/i);
  const date = text.match(/\b(?:En\s+[^\n,]+,?\s*)?a\s+(\d{1,2})\s+de\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+de\s+(20\d{2})\b/i);
  const totalsLine = text.split('\n').find(line => /\bTotales\b/i.test(line));
  const netLine = text.split('\n').find(line => /Importe\s+L[ií]quido\s+a\s+percibir/i.test(line));
  const indemnityLine = text.split('\n').find(line => /\bIndemnizaci[oó]n\b/i.test(line));
  const amounts = totalsLine?.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
  const net = netLine?.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
  if (!identity || !date || amounts?.length !== 2 || net?.length !== 1 || !/DOCUMENTO DE LIQUIDACI[OÓ]N Y FINIQUITO/i.test(text)) return null;
  const money = (value: string) => Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100);
  const [devengado, deducciones] = amounts.map(money);
  const liquido = money(net[0]);
  if (devengado <= 0 || deducciones < 0 || devengado - deducciones !== liquido) return null;
  const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const indemnity = indemnityLine?.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)?.at(-1);
  return { nombre: identity[1].trim(), nif: identity[2].toUpperCase(), dia: Number(date[1]), mes: months.indexOf(date[2].toUpperCase()) + 1, anio: Number(date[3]), devengado, deducciones, liquido, indemnizacion: indemnity ? money(indemnity) : null };
}

export async function parsePayrollProfessionalCategory(pdfBuffer: Buffer): Promise<string | null> {
  return extractProfessionalCategoryFromPayrollText(await extractPayrollPdfText(pdfBuffer));
}

/**
 * Parse a Spanish-format number (1.234,56 or -1.234,56)
 */
function parseNumber(s: string): number {
  if (!s || s.trim() === '') return 0;
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
}

/**
 * Detect format type from PDF text
 */
function detectFormat(text: string): 'costes_io' | 'nomina_individual' {
  // COSTES IO has "PAGA TOTAL DEL" and employee codes like "000004"
  if (text.includes('PAGA TOTAL DEL') && /\d{6}\s+[A-Z]/.test(text)) {
    return 'costes_io';
  }
  // Individual nóminas have "LIQUIDO A PERCIBIR" and "T. DEVENGADO"
  if (text.includes('LIQUIDO A') && text.includes('DEVENGADO')) {
    return 'nomina_individual';
  }
  if (text.includes('RESUMEN DE NOMINA') || text.includes('Resumen de N')) {
    return 'costes_io';
  }
  return 'nomina_individual';
}

// ============================================================
// COSTES IO PARSER
// ============================================================

function detectPeriodCostes(text: string): { mes: number; anio: number } {
  const match = text.match(/PAGA TOTAL DEL \d{2}\/(\d{2})\/(\d{4})/);
  if (match) {
    return { mes: parseInt(match[1]), anio: parseInt(match[2]) };
  }
  return { mes: 0, anio: 0 };
}

function joinAndExtractNumbers(blockLines: string[]): number[] {
  let joined = '';
  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    const trimmedLine = line.trimEnd();
    const nextLine = (blockLines[i + 1] || '').trim();
    
    joined += line;
    
    if (/\d$/.test(trimmedLine) && /^\d+(\s|$)/.test(nextLine) && nextLine.length <= 3) {
      continue;
    }
    if (/,$/.test(trimmedLine) && /^\d/.test(nextLine)) {
      continue;
    }
    joined += ' ';
  }
  
  const numbers = joined.match(/-?[\d.]+,\d{2}/g) || [];
  return numbers.map(n => parseNumber(n));
}

export function parseCostesIO(text: string): ParseSummary {
  const { mes, anio } = detectPeriodCostes(text);
  const nominas: NominaParseResult[] = [];
  const lines = text.split('\n');
  
  const nifEntries: { lineIdx: number; nif: string }[] = [];
  const codeEntries: { lineIdx: number; code: string; name: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nifMatch = line.match(/^(\d{8}[A-Z])/);
    if (nifMatch && !line.match(/^\d{6}\s/)) {
      nifEntries.push({ lineIdx: i, nif: nifMatch[1] });
    }
    const codeMatch = line.match(/^(\d{6})\s+(.+)$/);
    if (codeMatch && !line.includes('TOTAL')) {
      codeEntries.push({ lineIdx: i, code: codeMatch[1], name: codeMatch[2].trim() });
    }
  }
  
  for (let n = 0; n < nifEntries.length; n++) {
    const nifEntry = nifEntries[n];
    const empEntry = codeEntries.find(e => e.lineIdx > nifEntry.lineIdx && 
      (n + 1 >= nifEntries.length || e.lineIdx < nifEntries[n + 1].lineIdx));
    if (!empEntry) continue;
    
    let isFiniquito = false;
    for (let i = nifEntry.lineIdx; i < Math.min(nifEntry.lineIdx + 3, empEntry.lineIdx); i++) {
      if (lines[i].trim() === 'FINIQUITO') { isFiniquito = true; break; }
    }
    
    let fechaCobro = '';
    for (let i = nifEntry.lineIdx + 1; i < empEntry.lineIdx; i++) {
      const dateMatch = lines[i].trim().match(/^(\d{2}\/\d{2}\/\d{4})$/);
      if (dateMatch) { fechaCobro = dateMatch[1]; break; }
    }
    
    let dataStartIdx = nifEntry.lineIdx + 1;
    for (let i = nifEntry.lineIdx + 1; i < empEntry.lineIdx; i++) {
      if (lines[i].trim().match(/^\d{2}\/\d{2}\/\d{4}$/)) { dataStartIdx = i + 1; break; }
    }
    
    const blockLines = lines.slice(dataStartIdx, empEntry.lineIdx);
    const numbers = joinAndExtractNumbers(blockLines);
    
    // En el resumen de la gestoría un finiquito sin IRPF ni cotización se
    // imprime solo con NETO y DEVENGADO. No omitir esa segunda línea del empleado.
    if (isFiniquito && numbers.length === 2 && Math.abs(numbers[0] - numbers[1]) <= 0.01) {
      nominas.push({
        nombre: empEntry.name, nif: nifEntry.nif, tipo: 'LIQUIDACION', mes, anio, fechaCobro,
        devengadoTotal: numbers[1], netoPercibir: numbers[0], irpf: 0,
        ssTrabajador: 0, ssEmpresa: 0, baseIrpf: 0,
        costeTotalEmpresa: numbers[1], complementoEspecie: 0,
      });
      continue;
    }
    if (numbers.length < 4) throw new Error('El resumen contiene una fila de trabajador incompleta');
    
    let irpf: number, ssTrab: number, neto: number, devengado: number;
    let baseIrpf: number, ssEmpresa: number, especie: number;
    
    if (numbers.length >= 7) {
      irpf = Math.abs(numbers[0]);
      ssTrab = Math.abs(numbers[1]);
      neto = numbers[2];
      devengado = numbers[3];
      baseIrpf = numbers[4];
      ssEmpresa = numbers[5];
      especie = numbers.length > 7 ? numbers[7] : 0;
      
      if (Math.abs(devengado - (neto + irpf + ssTrab)) > 1.0) {
        irpf = 0;
        ssTrab = Math.abs(numbers[0]);
        neto = numbers[1];
        devengado = numbers[2];
        baseIrpf = numbers[3];
        ssEmpresa = numbers[4];
        especie = numbers.length > 6 ? numbers[6] : 0;
      }
    } else if (numbers.length >= 6) {
      irpf = 0;
      ssTrab = Math.abs(numbers[0]);
      neto = numbers[1];
      devengado = numbers[2];
      baseIrpf = numbers[3];
      ssEmpresa = numbers[4];
      especie = numbers.length > 6 ? numbers[6] : 0;
      
      if (Math.abs(devengado - (neto + ssTrab)) > 1.0) {
        irpf = Math.abs(numbers[0]);
        ssTrab = Math.abs(numbers[1]);
        neto = numbers[2];
        devengado = numbers[3];
        baseIrpf = numbers[4];
        ssEmpresa = numbers[5];
        especie = 0;
      }
    } else {
      irpf = Math.abs(numbers[0]);
      ssTrab = Math.abs(numbers[1]);
      neto = numbers[2];
      devengado = numbers[3];
      baseIrpf = numbers.length > 4 ? numbers[4] : 0;
      ssEmpresa = 0;
      especie = 0;
    }
    
    // S.S. TCI = SS empresa + SS trabajador; usar TCI duplicaría la cuota del trabajador.
    const costeTotalEmpresa = devengado + ssEmpresa;
    
    nominas.push({
      nombre: empEntry.name, nif: nifEntry.nif, tipo: isFiniquito ? 'LIQUIDACION' : 'NOMINA', mes, anio, fechaCobro,
      devengadoTotal: devengado, netoPercibir: neto, irpf,
      ssTrabajador: ssTrab, ssEmpresa, baseIrpf,
      costeTotalEmpresa, complementoEspecie: especie,
    });
  }
  
  const totalBruto = nominas.reduce((sum, n) => sum + n.devengadoTotal, 0);
  const totalNeto = nominas.reduce((sum, n) => sum + n.netoPercibir, 0);
  const totalIRPF = nominas.reduce((sum, n) => sum + n.irpf, 0);
  const totalSSTrabajador = nominas.reduce((sum, n) => sum + n.ssTrabajador, 0);
  const totalSSEmpresa = nominas.reduce((sum, n) => sum + n.ssEmpresa, 0);
  const totalCosteEmpresa = nominas.reduce((sum, n) => sum + n.costeTotalEmpresa, 0);
  const cuadrePorConcepto = nominas.every(n =>
    Math.abs(Math.round(n.devengadoTotal * 100) - Math.round((n.netoPercibir + n.irpf + n.ssTrabajador) * 100)) <= 1 &&
    Math.abs(Math.round(n.costeTotalEmpresa * 100) - Math.round((n.devengadoTotal + n.ssEmpresa) * 100)) <= 1
  );
  const verificado = mes >= 1 && mes <= 12 && anio >= 2024 &&
    nominas.length > 0 && nominas.length === nifEntries.length && cuadrePorConcepto &&
    Math.abs(Math.round(totalBruto * 100) - Math.round((totalNeto + totalIRPF + totalSSTrabajador) * 100)) <= 1;
  
  return {
    mes, anio, empleados: nominas.length,
    totalBruto, totalNeto, totalIRPF, totalSSTrabajador, totalSSEmpresa, totalCosteEmpresa,
    verificado, nominas, formato: 'costes_io',
  };
}

// ============================================================
// NÓMINA INDIVIDUAL PARSER
// ============================================================

const MONTH_MAP: Record<string, number> = {
  'ENE': 1, 'FEB': 2, 'MAR': 3, 'ABR': 4, 'MAY': 5, 'JUN': 6,
  'JUL': 7, 'AGO': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DIC': 12,
  'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4, 'MAYO': 5, 'JUNIO': 6,
  'JULIO': 7, 'AGOSTO': 8, 'SEPTIEMBRE': 9, 'OCTUBRE': 10, 'NOVIEMBRE': 11, 'DICIEMBRE': 12,
};

/**
 * Parse individual nómina format (one or more employees, each on a separate page)
 * 
 * Key data points per employee:
 * - Worker line: "NAME  CATEGORY  DATE  NIF"
 * - Period: "MENS 01 JUN 26 a 30 JUN 26"
 * - COTIZACION lines (995-997): SS Trabajador deducciones
 * - TRIBUTACION I.R.P.F. line (999): IRPF
 * - Bases line (after "T. DEVENGADO" header): 6 numbers, T.DEVENGADO is the 5th (penultimate)
 * - LIQUIDO A PERCIBIR: net pay (on next line)
 * - Number before "SWIFT/BIC:COSTE EMPRESA:": total company cost
 */
function parseNominaIndividual(text: string): ParseSummary {
  const nominas: NominaParseResult[] = [];
  const lines = text.split('\n');
  
  // Split into employee blocks by finding "NIF. B" (company NIF) which starts each payslip
  const blockStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^NIF\.\s*B\d+/)) {
      blockStarts.push(i);
    }
  }
  
  let mes = 0;
  let anio = 0;
  
  for (let b = 0; b < blockStarts.length; b++) {
    const startIdx = blockStarts[b];
    const endIdx = b + 1 < blockStarts.length ? blockStarts[b + 1] : lines.length;
    const block = lines.slice(startIdx, endIdx);
    const blockText = block.join('\n');
    
    // Extract employee NIF from the worker line (8 digits + letter at end of line)
    let nombre = '';
    let nif = '';
    
    for (const line of block) {
      // Worker line pattern: "    NAME  CATEGORY  DATE  NIF"
      // The NIF is always 8 digits + 1 letter at the end
      const nifAtEnd = line.match(/(\d{8}[A-Z])\s*$/);
      if (nifAtEnd && !line.includes('NIF.') && !line.includes('AFILIACION')) {
        nif = nifAtEnd[1];
        // Extract name: everything from start (after spaces) to the category
        const nameMatch = line.match(/^\s{4}(.+?)\s{2,}/);
        if (nameMatch) {
          nombre = nameMatch[1].trim();
        }
        break;
      }
    }
    
    if (!nif) continue;
    
    // If nombre still has category appended, clean it
    // The name is before the first double-space gap
    if (!nombre) {
      // Fallback: get name from the top of the block (centered name)
      for (let i = 0; i < Math.min(5, block.length); i++) {
        const line = block[i].trim();
        if (line.match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+$/) && line.length > 5 && 
            !line.includes('EMPRESA') && !line.includes('INTERNET') && 
            !line.includes('LLEIDA') && !line.includes('BARCELONA') &&
            !line.includes('MADRID') && !line.includes('NIF')) {
          nombre = line;
          break;
        }
      }
    }
    
    if (!nombre) continue;
    
    // Extract period: "MENS 01 JUN 26 a 30 JUN 26"
    const periodMatch = blockText.match(/MENS\s+\d{2}\s+(\w+)\s+(\d{2})\s+a\s+\d{2}\s+\w+\s+\d{2}/);
    if (periodMatch) {
      const monthStr = periodMatch[1].toUpperCase().substring(0, 3);
      const yearShort = parseInt(periodMatch[2]);
      mes = MONTH_MAP[monthStr] || MONTH_MAP[periodMatch[1].toUpperCase()] || 0;
      anio = yearShort < 100 ? 2000 + yearShort : yearShort;
    }
    
    // Extract IRPF from "999   TRIBUTACION I.R.P.F." line
    let irpf = 0;
    for (const line of block) {
      // Pattern: "999   TRIBUTACION I.R.P.F. 3,06                                 43,59"
      // or:      "999   TRIBUTACION I.R.P.F.23,79                                973,50"
      const irpfMatch = line.match(/999\s+TRIBUTACION I\.R\.P\.F\.\s*[\d,]+\s+([\d.,]+)\s*$/);
      if (irpfMatch) {
        irpf = parseNumber(irpfMatch[1]);
        break;
      }
      // Alternative pattern without code
      const irpfMatch2 = line.match(/TRIBUTACION I\.R\.P\.F\.\s*[\d,]+\s+([\d.,]+)\s*$/);
      if (irpfMatch2) {
        irpf = parseNumber(irpfMatch2[1]);
        break;
      }
    }
    
    // Extract SS Trabajador: sum of COTIZACION lines (codes 994-997)
    let ssTrab = 0;
    for (const line of block) {
      const cotMatch = line.match(/99[4-7]\s+COTIZACION\s+.+?([\d.,]+)\s*$/);
      if (cotMatch) {
        ssTrab += parseNumber(cotMatch[1]);
      }
    }
    
    // Extract especie deduction
    let especie = 0;
    for (const line of block) {
      const especieMatch = line.match(/789\s+Dcto\.Conceptos en Especie\s+([\d.,]+)/);
      if (especieMatch) {
        especie = parseNumber(especieMatch[1]);
      }
    }
    
    // Extract T.DEVENGADO from the bases line
    // The bases line comes right after "REM. TOTALP.P.EXTRASBASE I.R.P.F.T. DEVENGADOBASE A.T. Y DES."
    // It contains 4-6 numbers. T.DEVENGADO is the penultimate number (before T.A DEDUCIR)
    let devengado = 0;
    let baseIrpf = 0;
    for (let i = 0; i < block.length; i++) {
      if (block[i].includes('REM. TOTAL') && block[i].includes('DEVENGADO')) {
        // Data is on the next line
        const dataLine = block[i + 1] || '';
        const nums = (dataLine.match(/[\d.,]+/g) || []).map(n => parseNumber(n));
        if (nums.length >= 6) {
          // 6 numbers: BASE_SS, BASE_SS(repeat), BASE_IRPF, BASE_SS(repeat), T.DEVENGADO, T.A_DEDUCIR
          devengado = nums[nums.length - 2]; // penultimate
          baseIrpf = nums[2] || nums[0];
        } else if (nums.length >= 4) {
          // 4 numbers (gerente sin SS): BASE_SS, BASE_SS, T.DEVENGADO, T.A_DEDUCIR
          devengado = nums[nums.length - 2]; // penultimate
          baseIrpf = nums[0];
        } else if (nums.length >= 2) {
          devengado = nums[nums.length - 2];
        } else if (nums.length === 1) {
          devengado = nums[0];
        }
        break;
      }
    }
    
    // Extract LIQUIDO A PERCIBIR (net pay)
    let neto = 0;
    for (let i = 0; i < block.length; i++) {
      if (block[i].includes('LIQUIDO A') && block[i].includes('PERCIBIR')) {
        const nextLine = block[i + 1] || '';
        const netoMatch = nextLine.match(/([\d.,]+)/);
        if (netoMatch) {
          neto = parseNumber(netoMatch[1]);
        }
        break;
      }
    }
    
    // Extract COSTE EMPRESA (number on line before "SWIFT/BIC:COSTE EMPRESA:")
    let costeEmpresa = 0;
    for (let i = 0; i < block.length; i++) {
      if (block[i].includes('SWIFT/BIC:COSTE EMPRESA')) {
        const prevLine = block[i - 1] || '';
        const nums = prevLine.match(/([\d.,]+)/g);
        if (nums && nums.length > 0) {
          costeEmpresa = parseNumber(nums[0]);
        }
        break;
      }
    }
    
    // Calculate SS Empresa
    const ssEmpresa = costeEmpresa > 0 ? costeEmpresa - devengado : 0;
    
    // If devengado is 0, calculate from neto + irpf + ssTrab + especie
    if (devengado === 0 && neto > 0) {
      devengado = neto + irpf + ssTrab + especie;
    }
    
    // Fecha cobro
    let fechaCobro = '';
    for (const line of block) {
      const fechaMatch = line.match(/(\d{1,2})\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/);
      if (fechaMatch) {
        const day = fechaMatch[1].padStart(2, '0');
        const monthNum = MONTH_MAP[fechaMatch[2]] || 1;
        fechaCobro = `${day}/${monthNum.toString().padStart(2, '0')}/${fechaMatch[3]}`;
        break;
      }
    }
    
    nominas.push({
      nombre, nif, tipo: /\b(?:FINIQUITO|LIQUIDACI[ÓO]N)\b/i.test(blockText) ? 'LIQUIDACION' : 'NOMINA', mes, anio, fechaCobro,
      devengadoTotal: devengado,
      netoPercibir: neto,
      irpf,
      ssTrabajador: ssTrab,
      ssEmpresa,
      baseIrpf,
      costeTotalEmpresa: costeEmpresa || devengado + ssEmpresa,
      complementoEspecie: especie,
    });
  }
  
  const totalBruto = nominas.reduce((sum, n) => sum + n.devengadoTotal, 0);
  const totalNeto = nominas.reduce((sum, n) => sum + n.netoPercibir, 0);
  const totalIRPF = nominas.reduce((sum, n) => sum + n.irpf, 0);
  const totalSSTrabajador = nominas.reduce((sum, n) => sum + n.ssTrabajador, 0);
  const totalSSEmpresa = nominas.reduce((sum, n) => sum + n.ssEmpresa, 0);
  const totalCosteEmpresa = nominas.reduce((sum, n) => sum + n.costeTotalEmpresa, 0);
  // For individual nóminas, verify: devengado = neto + irpf + ssTrab + especie
  const verificado = nominas.length > 0 && nominas.every(n => {
    const check = n.netoPercibir + n.irpf + n.ssTrabajador + n.complementoEspecie;
    return Math.abs(n.devengadoTotal - check) < 5.0;
  });
  
  return {
    mes, anio, empleados: nominas.length,
    totalBruto, totalNeto, totalIRPF, totalSSTrabajador, totalSSEmpresa, totalCosteEmpresa,
    verificado, nominas, formato: 'nomina_individual',
  };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Parse any payroll PDF (auto-detects format)
 */
export async function parseCostesIOPdf(pdfBuffer: Buffer, fileName?: string): Promise<ParseSummary> {
  const text = await extractPayrollPdfText(pdfBuffer);
  
  const format = detectFormat(text);
  
  if (format === 'costes_io') {
    return parseCostesIO(text);
  } else {
    return parseNominaIndividual(text);
  }
}
