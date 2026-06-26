/**
 * Parsers bancarios para importar movimientos de diferentes bancos
 * Formatos soportados: Santander XLSX, Caixa Guissona CSV, BBVA CSV, Vivid CSV, Wise XLSX, Norma 43
 */

import crypto from 'crypto';

export interface MovimientoParsed {
  fechaOperacion: Date;
  fechaValor: Date;
  concepto: string;
  importe: number;
  saldo: number | null;
  referencia: string | null;
  codigoOperacion: string | null;
  infoAdicional: string | null;
  hashUnico: string;
}

// Genera un hash único para evitar duplicados
function generarHash(banco: string, fecha: string, concepto: string, importe: number, saldo: number | null): string {
  const data = `${banco}|${fecha}|${concepto.trim()}|${importe}|${saldo ?? ''}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// =============================================
// PARSER SANTANDER (XLSX)
// =============================================
export function parseSantanderXLSX(rows: any[][]): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  
  // Buscar la fila de cabecera
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (row && row[0] && String(row[0]).includes('Fecha')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) return movimientos;
  
  // Procesar filas de datos (después de la cabecera)
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    
    const fechaOp = parseFechaES(String(row[0]));
    const fechaVal = parseFechaES(String(row[1]));
    if (!fechaOp || !fechaVal) continue;
    
    const concepto = String(row[2] || '').trim();
    const importe = parseFloat(String(row[3] || '0').replace(',', '.'));
    const saldo = row[5] ? parseFloat(String(row[5]).replace(',', '.')) : null;
    const codigo = row[7] ? String(row[7]) : null;
    const referencia = row[9] ? String(row[9]) : null;
    const infoAdicional = row[11] ? String(row[11]) : null;
    
    if (isNaN(importe)) continue;
    
    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo,
      referencia,
      codigoOperacion: codigo,
      infoAdicional,
      hashUnico: generarHash('santander', fechaOp.toISOString(), concepto, importe, saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// PARSER SANTANDER (TXT)
// =============================================
export function parseSantanderTXT(content: string): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  const lines = content.split('\n');
  
  // Buscar la línea de cabecera
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Fecha Operación') || lines[i].includes('Fecha Operaci')) {
      dataStart = i + 1;
      break;
    }
  }
  
  if (dataStart === -1) return movimientos;
  
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Formato: DD/MM/YYYY seguido de espacios y más datos
    const fechaMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+([-\d.,]+)\s+EUR\s+([-\d.,]+)\s+EUR/);
    if (!fechaMatch) continue;
    
    const fechaOp = parseFechaES(fechaMatch[1]);
    const fechaVal = parseFechaES(fechaMatch[2]);
    const codigo = fechaMatch[3];
    const concepto = fechaMatch[4].trim();
    const importe = parseImporteES(fechaMatch[5]);
    const saldo = parseImporteES(fechaMatch[6]);
    
    if (!fechaOp || !fechaVal || isNaN(importe)) continue;
    
    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo,
      referencia: null,
      codigoOperacion: codigo,
      infoAdicional: null,
      hashUnico: generarHash('santander', fechaOp.toISOString(), concepto, importe, saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// PARSER CAIXA GUISSONA (CSV con ;)
// =============================================
export function parseCaixaGuissonaCSV(content: string): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  const lines = content.split('\n');
  
  // Primera línea es cabecera: Data;Valor;Concepte;Import;Saldo;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(';');
    if (parts.length < 5) continue;
    
    // Fechas en formato DD/MM/YY
    const fechaOp = parseFechaCorta(parts[0].trim());
    const fechaVal = parseFechaCorta(parts[1].trim());
    if (!fechaOp || !fechaVal) continue;
    
    const concepto = parts[2].trim();
    const importe = parseFloat(parts[3].trim().replace(',', '.'));
    const saldo = parseFloat(parts[4].trim().replace(',', '.'));
    
    if (isNaN(importe)) continue;
    
    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo: isNaN(saldo) ? null : saldo,
      referencia: null,
      codigoOperacion: null,
      infoAdicional: null,
      hashUnico: generarHash('guissona', fechaOp.toISOString(), concepto, importe, isNaN(saldo) ? null : saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// PARSER BBVA (CSV con ,)
// =============================================
export function parseBBVACSV(content: string): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  const lines = content.split('\n');
  
  // Cabecera: Data Procés,Data Valor,Codi,Concepte,Observacions,Oficina,Import,Saldo,Remesa
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // CSV con posibles comillas en campos
    const parts = parseCSVLine(line);
    if (parts.length < 8) continue;
    
    const fechaOp = parseFechaES(parts[0].trim());
    const fechaVal = parseFechaES(parts[1].trim());
    if (!fechaOp || !fechaVal) continue;
    
    const codigo = parts[2].trim();
    const concepte = parts[3].trim();
    const observacions = parts[4].trim();
    const importe = parseFloat(parts[6].trim());
    const saldo = parseFloat(parts[7].trim());
    const remesa = parts[8] ? parts[8].trim() : null;
    
    const concepto = observacions ? `${concepte} - ${observacions}` : concepte;
    
    if (isNaN(importe)) continue;
    
    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo: isNaN(saldo) ? null : saldo,
      referencia: remesa,
      codigoOperacion: codigo,
      infoAdicional: null,
      hashUnico: generarHash('bbva', fechaOp.toISOString(), concepto, importe, isNaN(saldo) ? null : saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// PARSER VIVID (CSV con ;)
// =============================================
export function parseVividCSV(content: string): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  const lines = content.split('\n');
  
  // Cabecera: Completed date;Counterparty name;...;Payment amount;...;Running balance amount;...
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(';');
    if (parts.length < 14) continue;
    
    // Fecha: DD-MM-YYYY
    const fechaStr = parts[0].trim();
    const fechaParts = fechaStr.split('-');
    if (fechaParts.length !== 3) continue;
    const fecha = new Date(parseInt(fechaParts[2]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[0]));
    if (isNaN(fecha.getTime())) continue;
    
    const counterparty = parts[1].trim();
    const tipo = parts[4].trim();
    const referencia = parts[5].trim();
    const importe = parseFloat(parts[8].trim());
    const saldo = parseFloat(parts[13].trim());
    
    const concepto = referencia ? `${counterparty} - ${referencia}` : `${counterparty} (${tipo})`;
    
    if (isNaN(importe)) continue;
    
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: fecha,
      concepto,
      importe,
      saldo: isNaN(saldo) ? null : saldo,
      referencia: referencia || null,
      codigoOperacion: tipo,
      infoAdicional: null,
      hashUnico: generarHash('vivid', fecha.toISOString(), concepto, importe, isNaN(saldo) ? null : saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// PARSER WISE (XLSX)
// =============================================
export function parseWiseXLSX(rows: any[][]): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  
  // Primera fila es cabecera
  // Columnas: [0]ID, [1]Fecha, [2]Fecha y hora, [3]Cantidad, [4]Divisa, [5]Descripción, [6]Referencia, [7]Saldo corriente, ...
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;
    
    const fechaStr = String(row[1]);
    const fecha = new Date(fechaStr);
    if (isNaN(fecha.getTime())) continue;
    
    const importe = parseFloat(String(row[3] || '0'));
    const descripcion = String(row[5] || '').trim();
    const referencia = row[6] ? String(row[6]).trim() : null;
    const saldo = row[7] ? parseFloat(String(row[7])) : null;
    const comercio = row[15] ? String(row[15]).trim() : null;
    
    const concepto = comercio || descripcion;
    
    if (isNaN(importe)) continue;
    
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: fecha,
      concepto,
      importe,
      saldo,
      referencia,
      codigoOperacion: row[21] ? String(row[21]) : null, // Tipo de transacción
      infoAdicional: row[22] ? String(row[22]) : null, // Tipo de detalles
      hashUnico: generarHash('wise', fecha.toISOString(), concepto, importe, saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// PARSER NORMA 43 (AEB43)
// =============================================
export function parseNorma43(content: string): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  const lines = content.split('\n');
  
  let currentMovimiento: Partial<MovimientoParsed> | null = null;
  let conceptoExtra = '';
  
  for (const line of lines) {
    const tipo = line.substring(0, 2);
    
    switch (tipo) {
      case '22': // Registro de movimiento principal
        if (currentMovimiento && currentMovimiento.fechaOperacion) {
          currentMovimiento.concepto = (currentMovimiento.concepto || '') + ' ' + conceptoExtra;
          currentMovimiento.concepto = currentMovimiento.concepto.trim();
          currentMovimiento.hashUnico = generarHash(
            'n43',
            currentMovimiento.fechaOperacion.toISOString(),
            currentMovimiento.concepto,
            currentMovimiento.importe || 0,
            currentMovimiento.saldo || null
          );
          movimientos.push(currentMovimiento as MovimientoParsed);
        }
        
        // Parsear registro tipo 22
        const fechaOpStr = line.substring(10, 16); // AAMMDD
        const fechaValStr = line.substring(16, 22); // AAMMDD
        const signo = line.substring(27, 28); // 1=Debe(negativo), 2=Haber(positivo)
        const importeStr = line.substring(28, 42); // 14 dígitos, 2 decimales implícitos
        const concepto22 = line.substring(42, 80).trim();
        
        const fechaOp = parseFechaN43(fechaOpStr);
        const fechaVal = parseFechaN43(fechaValStr);
        const importe = parseInt(importeStr) / 100 * (signo === '1' ? -1 : 1);
        
        currentMovimiento = {
          fechaOperacion: fechaOp || new Date(),
          fechaValor: fechaVal || fechaOp || new Date(),
          concepto: concepto22,
          importe,
          saldo: null,
          referencia: line.substring(22, 27).trim() || null,
          codigoOperacion: null,
          infoAdicional: null,
          hashUnico: '',
        };
        conceptoExtra = '';
        break;
        
      case '23': // Registro complementario de concepto
        const concepto23 = line.substring(4, 80).trim();
        conceptoExtra += ' ' + concepto23;
        break;
        
      case '33': // Registro de saldo final
        // Guardar último movimiento pendiente
        if (currentMovimiento && currentMovimiento.fechaOperacion) {
          currentMovimiento.concepto = (currentMovimiento.concepto || '') + ' ' + conceptoExtra;
          currentMovimiento.concepto = currentMovimiento.concepto.trim();
          currentMovimiento.hashUnico = generarHash(
            'n43',
            currentMovimiento.fechaOperacion.toISOString(),
            currentMovimiento.concepto,
            currentMovimiento.importe || 0,
            currentMovimiento.saldo || null
          );
          movimientos.push(currentMovimiento as MovimientoParsed);
          currentMovimiento = null;
          conceptoExtra = '';
        }
        break;
    }
  }
  
  // Último movimiento si no se cerró
  if (currentMovimiento && currentMovimiento.fechaOperacion) {
    currentMovimiento.concepto = (currentMovimiento.concepto || '') + ' ' + conceptoExtra;
    currentMovimiento.concepto = currentMovimiento.concepto.trim();
    currentMovimiento.hashUnico = generarHash(
      'n43',
      currentMovimiento.fechaOperacion.toISOString(),
      currentMovimiento.concepto,
      currentMovimiento.importe || 0,
      currentMovimiento.saldo || null
    );
    movimientos.push(currentMovimiento as MovimientoParsed);
  }
  
  return movimientos;
}

// =============================================
// UTILIDADES
// =============================================

function parseFechaES(str: string): Date | null {
  // DD/MM/YYYY
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const year = parseInt(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

function parseFechaCorta(str: string): Date | null {
  // DD/MM/YY
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

function parseFechaN43(str: string): Date | null {
  // AAMMDD
  if (str.length !== 6) return null;
  const year = 2000 + parseInt(str.substring(0, 2));
  const month = parseInt(str.substring(2, 4)) - 1;
  const day = parseInt(str.substring(4, 6));
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

function parseImporteES(str: string): number {
  // Formato: -1.176,40 o 69,95
  return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

// Detectar formato de archivo automáticamente
export function detectarFormato(filename: string, content?: string): string {
  const lower = filename.toLowerCase();
  
  if (lower.includes('n43') || lower.includes('norma43') || lower.endsWith('.n43') || lower.endsWith('.q43')) {
    return 'norma43';
  }
  if (lower.includes('bbva')) return 'bbva';
  if (lower.includes('vivid') || lower.includes('statement')) return 'vivid';
  if (lower.includes('wise') || lower.includes('extracto')) return 'wise';
  if (lower.includes('u266') || lower.includes('guissona')) return 'guissona';
  if (lower.includes('santander') || lower.includes('movimientoscuenta')) return 'santander';
  
  // Intentar detectar por contenido
  if (content) {
    if (content.startsWith('Data;Valor;Concepte')) return 'guissona';
    if (content.includes('Data Procés,Data Valor')) return 'bbva';
    if (content.includes('Completed date;Counterparty')) return 'vivid';
    if (content.substring(0, 2) === '11') return 'norma43'; // Registro cabecera N43
  }
  
  return 'desconocido';
}
