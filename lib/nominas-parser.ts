/**
 * Parser for COSTES IO PDF files from the gestoría
 * Extracts employee payroll data from the "Resumen de Nómina" format
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

const MONTH_NAMES: Record<string, number> = {
  'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4,
  'MAYO': 5, 'JUNIO': 6, 'JULIO': 7, 'AGOSTO': 8,
  'SEPTIEMBRE': 9, 'OCTUBRE': 10, 'NOVIEMBRE': 11, 'DICIEMBRE': 12,
};

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
  // Look for "PAGA TOTAL DEL dd/mm/yyyy AL dd/mm/yyyy"
  const match = text.match(/PAGA TOTAL DEL \d{2}\/(\d{2})\/(\d{4})/);
  if (match) {
    return { mes: parseInt(match[1]), anio: parseInt(match[2]) };
  }
  
  // Fallback: look for month name in filename pattern
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (text.toUpperCase().includes(`COSTES IO ${name}`)) {
      const yearMatch = text.match(/20\d{2}/);
      return { mes: num, anio: yearMatch ? parseInt(yearMatch[0]) : 2026 };
    }
  }
  
  return { mes: 0, anio: 0 };
}

/**
 * Parse a COSTES IO PDF buffer and extract all employee payroll data
 */
export async function parseCostesIOPdf(pdfBuffer: Buffer, fileName?: string): Promise<ParseSummary> {
  const data = await pdf(pdfBuffer);
  const text = data.text;
  
  // Detect period
  const { mes, anio } = detectPeriod(text);
  
  const nominas: NominaParseResult[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Match employee lines: 000004 PEREZ SOLIS, IVAN  49258646Y  MENSUAL  31/01/2026  numbers...
    const match = line.trim().match(/^(\d{6})\s+(.+?)\s+(\d{8}[A-Z])\s+MENSUAL\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
    if (!match) continue;
    
    const name = match[2].trim();
    const nif = match[3];
    const fechaCobro = match[4];
    const numbersStr = match[5];
    
    // Extract all numbers
    const numbers = numbersStr.match(/-?[\d.]+,\d{2}/g) || [];
    
    // Determine if IRPF is missing by checking leading whitespace
    const firstNumPos = numbersStr.indexOf(numbers[0] || '');
    const irpfMissing = firstNumPos > 15;
    
    let irpf: number, ssTrab: number, neto: number, devengado: number;
    let baseIrpf: number, ssEmpresaBase: number, ssTci: number, especie: number;
    
    if (irpfMissing) {
      // No IRPF (e.g., Patricia Parra in some months)
      irpf = 0;
      ssTrab = parseNumber(numbers[0] || '0');
      neto = parseNumber(numbers[1] || '0');
      devengado = parseNumber(numbers[2] || '0');
      baseIrpf = parseNumber(numbers[3] || '0');
      ssEmpresaBase = parseNumber(numbers[4] || '0');
      ssTci = parseNumber(numbers[5] || '0');
      especie = parseNumber(numbers[6] || '0');
    } else {
      // Normal case with all fields
      irpf = parseNumber(numbers[0] || '0');
      ssTrab = parseNumber(numbers[1] || '0');
      neto = parseNumber(numbers[2] || '0');
      devengado = parseNumber(numbers[3] || '0');
      baseIrpf = parseNumber(numbers[4] || '0');
      ssEmpresaBase = parseNumber(numbers[5] || '0');
      ssTci = parseNumber(numbers[6] || '0');
      especie = parseNumber(numbers[7] || '0');
    }
    
    const costeTotalEmpresa = devengado + ssTci;
    
    nominas.push({
      nombre: name,
      nif,
      mes,
      anio,
      fechaCobro,
      devengadoTotal: devengado,
      netoPercibir: neto,
      irpf: Math.abs(irpf),
      ssTrabajador: Math.abs(ssTrab),
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
  
  // Verify: Bruto should equal Neto + IRPF + SS_Trab
  const verificado = Math.abs(totalBruto - (totalNeto + totalIRPF + totalSSTrabajador)) < 1.0;
  
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
