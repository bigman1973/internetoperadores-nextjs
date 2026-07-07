/**
 * Parser for COSTES IO PDF files from the gestoría
 * Extracts employee payroll data from the "Resumen de Nómina" format
 * 
 * pdf-parse extracts text in multi-line format where numbers get split:
 * - "1.424,50" may appear as "1.424,5\n0" (integer part split)
 * - "550,57" may appear as "550,\n57" (decimal part split)
 * 
 * Column order in the PDF:
 * Row 1: IRPF, SS_TRAB, NETO, DEVENGADO
 * Row 2: BASE_IRPF, SS_Empresa, SS_TCI
 * Row 3: (optional) ESPECIE
 */

import pdf from 'pdf-parse';

export interface NominaParseResult {
  nombre: string;
  nif: string;
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
}

/**
 * Parse a Spanish-format number (1.234,56 or -1.234,56)
 */
function parseNumber(s: string): number {
  if (!s || s.trim() === '') return 0;
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
}

/**
 * Detect month and year from the PDF text content
 */
function detectPeriod(text: string): { mes: number; anio: number } {
  const match = text.match(/PAGA TOTAL DEL \d{2}\/(\d{2})\/(\d{4})/);
  if (match) {
    return { mes: parseInt(match[1]), anio: parseInt(match[2]) };
  }
  return { mes: 0, anio: 0 };
}

/**
 * Join lines that have split numbers and extract all Spanish-format numbers.
 * Handles two types of splits:
 * 1. "1.424,5" + "0" → "1.424,50" (line ends with digit after comma, next starts with digits)
 * 2. "550," + "57" → "550,57" (line ends with comma, next starts with digits)
 */
function joinAndExtractNumbers(blockLines: string[]): number[] {
  // First, join the lines handling number splits
  let joined = '';
  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    const trimmedLine = line.trimEnd();
    const nextLine = (blockLines[i + 1] || '').trim();
    
    joined += line;
    
    // Case 1: Line ends with "X,Y" pattern (partial decimal) and next line starts with digits
    // e.g., "1.424,5" + "0" → should join without space
    if (/\d$/.test(trimmedLine) && /^\d+(\s|$)/.test(nextLine) && nextLine.length <= 3) {
      // Join directly - the next line is the continuation of a number
      continue;
    }
    
    // Case 2: Line ends with comma and next line starts with digits  
    // e.g., "550," + "57" → should join without space
    if (/,$/.test(trimmedLine) && /^\d/.test(nextLine)) {
      // Join directly
      continue;
    }
    
    joined += ' ';
  }
  
  // Now extract all Spanish-format numbers from the joined text
  const numbers = joined.match(/-?[\d.]+,\d{2}/g) || [];
  return numbers.map(n => parseNumber(n));
}

/**
 * Parse a COSTES IO PDF buffer and extract all employee payroll data.
 */
export async function parseCostesIOPdf(pdfBuffer: Buffer, fileName?: string): Promise<ParseSummary> {
  const data = await pdf(pdfBuffer);
  const text = data.text;
  
  // Detect period
  const { mes, anio } = detectPeriod(text);
  
  const nominas: NominaParseResult[] = [];
  const lines = text.split('\n');
  
  // Find all employee code+name lines and NIF lines
  const nifEntries: { lineIdx: number; nif: string }[] = [];
  const codeEntries: { lineIdx: number; code: string; name: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match NIF: 8 digits + 1 letter (may have MENSUAL on same line for some employees)
    const nifMatch = line.match(/^(\d{8}[A-Z])/);
    if (nifMatch && !line.match(/^\d{6}\s/)) {
      nifEntries.push({ lineIdx: i, nif: nifMatch[1] });
    }
    
    // Match employee code + name: "000004  PEREZ SOLIS, IVAN"
    const codeMatch = line.match(/^(\d{6})\s+(.+)$/);
    if (codeMatch && !line.includes('TOTAL')) {
      codeEntries.push({ lineIdx: i, code: codeMatch[1], name: codeMatch[2].trim() });
    }
  }
  
  // Process each NIF entry
  for (let n = 0; n < nifEntries.length; n++) {
    const nifEntry = nifEntries[n];
    
    // Find the corresponding code+name that comes AFTER this NIF
    const empEntry = codeEntries.find(e => e.lineIdx > nifEntry.lineIdx && 
      (n + 1 >= nifEntries.length || e.lineIdx < nifEntries[n + 1].lineIdx));
    
    if (!empEntry) continue;
    
    // Check type (MENSUAL vs FINIQUITO)
    let isFiniquito = false;
    for (let i = nifEntry.lineIdx; i < Math.min(nifEntry.lineIdx + 3, empEntry.lineIdx); i++) {
      if (lines[i].trim() === 'FINIQUITO') {
        isFiniquito = true;
        break;
      }
    }
    
    // Get fecha cobro
    let fechaCobro = '';
    for (let i = nifEntry.lineIdx + 1; i < empEntry.lineIdx; i++) {
      const dateMatch = lines[i].trim().match(/^(\d{2}\/\d{2}\/\d{4})$/);
      if (dateMatch) {
        fechaCobro = dateMatch[1];
        break;
      }
    }
    
    // Extract numbers from the block between date and code+name
    // Skip NIF line, type line, date line, and the blank line after date
    let dataStartIdx = nifEntry.lineIdx + 1;
    for (let i = nifEntry.lineIdx + 1; i < empEntry.lineIdx; i++) {
      const dateMatch = lines[i].trim().match(/^\d{2}\/\d{2}\/\d{4}$/);
      if (dateMatch) {
        dataStartIdx = i + 1;
        break;
      }
    }
    
    const blockLines = lines.slice(dataStartIdx, empEntry.lineIdx);
    const numbers = joinAndExtractNumbers(blockLines);
    
    // Skip FINIQUITO entries with no numbers
    if (isFiniquito && numbers.length < 3) continue;
    
    if (numbers.length < 4) continue;
    
    // Determine column mapping based on number count and verification
    // Expected: IRPF, SS_TRAB, NETO, DEVENGADO, BASE_IRPF, SS_Empresa, SS_TCI, [ESPECIE]
    // Without IRPF: SS_TRAB, NETO, DEVENGADO, BASE_IRPF, SS_Empresa, SS_TCI, [ESPECIE]
    
    let irpf: number, ssTrab: number, neto: number, devengado: number;
    let baseIrpf: number, ssEmpresa: number, ssTci: number, especie: number;
    
    // Try with IRPF first (7+ numbers)
    if (numbers.length >= 7) {
      irpf = Math.abs(numbers[0]);
      ssTrab = Math.abs(numbers[1]);
      neto = numbers[2];
      devengado = numbers[3];
      baseIrpf = numbers[4];
      ssEmpresa = numbers[5];
      ssTci = numbers[6];
      especie = numbers.length > 7 ? numbers[7] : 0;
      
      // Verify: devengado = neto + irpf + ssTrab
      if (Math.abs(devengado - (neto + irpf + ssTrab)) > 1.0) {
        // Doesn't verify with 7-number layout, try 6-number (no IRPF)
        irpf = 0;
        ssTrab = Math.abs(numbers[0]);
        neto = numbers[1];
        devengado = numbers[2];
        baseIrpf = numbers[3];
        ssEmpresa = numbers[4];
        ssTci = numbers[5];
        especie = numbers.length > 6 ? numbers[6] : 0;
      }
    } else if (numbers.length >= 6) {
      // Try without IRPF first
      irpf = 0;
      ssTrab = Math.abs(numbers[0]);
      neto = numbers[1];
      devengado = numbers[2];
      baseIrpf = numbers[3];
      ssEmpresa = numbers[4];
      ssTci = numbers[5];
      especie = numbers.length > 6 ? numbers[6] : 0;
      
      // Verify
      if (Math.abs(devengado - (neto + ssTrab)) > 1.0) {
        // Try with IRPF
        irpf = Math.abs(numbers[0]);
        ssTrab = Math.abs(numbers[1]);
        neto = numbers[2];
        devengado = numbers[3];
        baseIrpf = numbers[4];
        ssEmpresa = numbers[5];
        ssTci = 0;
        especie = 0;
      }
    } else {
      // 4-5 numbers - minimal data
      irpf = Math.abs(numbers[0]);
      ssTrab = Math.abs(numbers[1]);
      neto = numbers[2];
      devengado = numbers[3];
      baseIrpf = numbers.length > 4 ? numbers[4] : 0;
      ssEmpresa = 0;
      ssTci = 0;
      especie = 0;
    }
    
    const costeTotalEmpresa = devengado + ssTci;
    
    nominas.push({
      nombre: empEntry.name,
      nif: nifEntry.nif,
      mes,
      anio,
      fechaCobro,
      devengadoTotal: devengado,
      netoPercibir: neto,
      irpf,
      ssTrabajador: ssTrab,
      ssEmpresa: ssTci,
      baseIrpf,
      costeTotalEmpresa,
      complementoEspecie: especie,
    });
  }
  
  // Calculate totals
  const totalBruto = nominas.reduce((sum, n) => sum + n.devengadoTotal, 0);
  const totalNeto = nominas.reduce((sum, n) => sum + n.netoPercibir, 0);
  const totalIRPF = nominas.reduce((sum, n) => sum + n.irpf, 0);
  const totalSSTrabajador = nominas.reduce((sum, n) => sum + n.ssTrabajador, 0);
  const totalSSEmpresa = nominas.reduce((sum, n) => sum + n.ssEmpresa, 0);
  const totalCosteEmpresa = nominas.reduce((sum, n) => sum + n.costeTotalEmpresa, 0);
  
  // Verify: Bruto should equal Neto + IRPF + SS_Trab (within tolerance)
  const verificado = nominas.length > 0 && Math.abs(totalBruto - (totalNeto + totalIRPF + totalSSTrabajador)) < 5.0;
  
  return {
    mes,
    anio,
    empleados: nominas.length,
    totalBruto,
    totalNeto,
    totalIRPF,
    totalSSTrabajador,
    totalSSEmpresa,
    totalCosteEmpresa,
    verificado,
    nominas,
  };
}
