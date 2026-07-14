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
  tercero: string | null; // Destinatario (salidas) u Ordenante (entradas)
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
    
    // Extraer tercero del concepto de Santander
    let tercero: string | null = null;
    
    // Transferencia salida: "Transferencia (Inmediata) A Favor De [DESTINATARIO] Concepto [X]"
    const salidaMatch = concepto.match(/Transferencia\s*(?:\(Inmediata\)\s*)?A Favor De\s+(.+?)(?:\s+Concepto|$)/i);
    if (salidaMatch) {
      tercero = salidaMatch[1].replace(/[,.]\s*$/, '').trim();
    }
    // Transferencia entrada: "Transferencia (Inmediata) De [ORDENANTE], Concepto [X]"
    if (!tercero) {
      const entradaMatch = concepto.match(/Transferencia\s*(?:\(Inmediata\)\s*)?De\s+(.+?)(?:,\s*(?:Referencia|Concepto)|$)/i);
      if (entradaMatch) {
        tercero = entradaMatch[1].replace(/[,.]\s*$/, '').trim();
      }
    }
    // Compra: "Compra [COMERCIO], [LUGAR], Tarjeta [NUM]" o "Compra Internet En [COMERCIO], [LUGAR]"
    if (!tercero) {
      const compraMatch = concepto.match(/^Compra(?:\s+Internet)?\s+(?:En\s+)?(.+?),\s+.+?,\s+Tarj/i)
        || concepto.match(/^Compra(?:\s+Internet)?\s+(?:En\s+)?(.+?),\s+.+?\s+Es,\s+Tarj/i)
        || concepto.match(/^Compra(?:\s+Internet)?\s+(?:En\s+)?(.+?),\s+/i);
      if (compraMatch) {
        tercero = compraMatch[1].replace(/[,.]\s*$/, '').trim();
      }
    }
    // Pago Movil: "Pago Movil En [COMERCIO], [LUGAR] Es, Tarj."
    if (!tercero) {
      const pagoMatch = concepto.match(/^Pago Movil En\s+(.+?),\s+.+?\s+Es,\s+Tarj/i)
        || concepto.match(/^Pago Movil En\s+(.+?),\s+/i);
      if (pagoMatch) {
        tercero = pagoMatch[1].replace(/[,.]\s*$/, '').trim();
      }
    }
    // Recibo: "Recibo [EMPRESA] Nº Recibo [NUM]"
    if (!tercero) {
      const reciboMatch = concepto.match(/^Recibo\s+(.+?)\s+(?:Nº|N\u00ba|Nº)\s*Recibo/i)
        || concepto.match(/^Recibo\s+(.+?)\s+(?:Ref|De\b)/i);
      if (reciboMatch) {
        tercero = reciboMatch[1].replace(/[,.]\s*$/, '').trim();
      }
    }

    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo,
      referencia,
      codigoOperacion: codigo,
      infoAdicional,
      tercero,
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
    
    // Extraer tercero del concepto de Santander TXT (misma lógica que XLSX)
    let tercero: string | null = null;
    const salidaM = concepto.match(/Transferencia\s*(?:\(Inmediata\)\s*)?A Favor De\s+(.+?)(?:\s+Concepto|$)/i);
    if (salidaM) {
      tercero = salidaM[1].replace(/[,.]\s*$/, '').trim();
    }
    if (!tercero) {
      const entradaM = concepto.match(/Transferencia\s*(?:\(Inmediata\)\s*)?De\s+(.+?)(?:,\s*(?:Referencia|Concepto)|$)/i);
      if (entradaM) {
        tercero = entradaM[1].replace(/[,.]\s*$/, '').trim();
      }
    }
    if (!tercero) {
      const compraM = concepto.match(/^Compra(?:\s+Internet)?\s+(?:En\s+)?(.+?),\s+/i);
      if (compraM) tercero = compraM[1].replace(/[,.]\s*$/, '').trim();
    }
    if (!tercero) {
      const pagoM = concepto.match(/^Pago Movil En\s+(.+?),\s+/i);
      if (pagoM) tercero = pagoM[1].replace(/[,.]\s*$/, '').trim();
    }
    if (!tercero) {
      const reciboM = concepto.match(/^Recibo\s+(.+?)\s+(?:N\u00ba|N\u00b0|Ref|De\b)/i);
      if (reciboM) tercero = reciboM[1].replace(/[,.]\s*$/, '').trim();
    }

    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo,
      referencia: null,
      codigoOperacion: codigo,
      infoAdicional: null,
      tercero,
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
    
    // Extraer tercero del concepto de Caixa Guissona
    let tercero: string | null = null;
    
    if (concepto.startsWith('TF/')) {
      // Formato: "TF/[ORDENANTE] [CONCEPTO]"
      const tfMatch2 = concepto.match(/^TF\/(.+?)(?:\s{2,}|\s+(?:TRASPAS|SIN CONCEPTO|NO\.|FRA|PAGO|TRASPASO|ENVIADO))/i);
      if (tfMatch2) {
        tercero = tfMatch2[1].trim();
      } else {
        const contenido = concepto.substring(3).trim();
        const refMatch = contenido.match(/^([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s.,]+?)(?:\s+(?:NO\.|FRA|PAGO|SIN|TRASPAS|TRASPASO).*)?$/i);
        tercero = refMatch ? refMatch[1].trim() : contenido.substring(0, 60).trim();
      }
    } else if (/^R\./i.test(concepto)) {
      // Formato: "R.[EMPRESA] FACTURA/FAC/N./YC..." (recibo domiciliado)
      const rMatch = concepto.match(/^R\.(.+?)(?:\s+(?:FACTURA|FAC|N\.|YC|FRA|FACT)[\s./]|$)/i);
      if (rMatch) {
        tercero = rMatch[1].trim();
      }
    } else if (/^DEV\.R\./i.test(concepto)) {
      // Formato: "DEV.R. [EMPRESA]" (devolución de recibo)
      const devMatch = concepto.match(/^DEV\.R\.\s*(.+?)$/i);
      if (devMatch) {
        tercero = devMatch[1].trim();
      }
    } else if (/^TRASPAS A /i.test(concepto)) {
      // Formato: "TRASPAS A [PERSONA/EMPRESA] A COMPTE/CONPTE"
      const trMatch = concepto.match(/^TRASPAS A\s+(.+?)\s+A\s+CO[MN]PTE/i);
      if (trMatch) {
        tercero = trMatch[1].trim();
      } else {
        const trMatch2 = concepto.match(/^TRASPAS A\s+(.+?)$/i);
        if (trMatch2) tercero = trMatch2[1].trim();
      }
    } else if (/^TRF IMMEDIATA/i.test(concepto)) {
      // Formato: "TRF IMMEDIATA [EMPRESA] [CONCEPTO]"
      const trfMatch = concepto.match(/^TRF IMMEDIATA\s+(.+?)(?:\s+A CUENTA|\s+PAGO|\s+FRA|$)/i);
      if (trfMatch) {
        tercero = trfMatch[1].trim();
      }
    } else if (/^E\s+/i.test(concepto)) {
      // Formato: "E [EMPRESA] [NÚMERO_TARJETA]" (compra con tarjeta)
      const eMatch = concepto.match(/^E\s+(.+?)\s+\d{4}/i);
      if (eMatch) {
        tercero = eMatch[1].trim();
      }
    } else if (/^RB\//i.test(concepto)) {
      // Formato: "RB/[EMPRESA]" (recibo)
      tercero = concepto.substring(3).trim() || null;
    }

    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo: isNaN(saldo) ? null : saldo,
      referencia: null,
      codigoOperacion: null,
      infoAdicional: null,
      tercero,
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
    
    // Extraer tercero del concepto de BBVA
    // El campo Observacions suele contener el destinatario/ordenante
    // Formato TRANSFERÈNCIES: "TRANSFERÈNCIES | [DESTINATARIO]\n[ORDENANTE] - [REF]"
    // En CSV llega como: Concepte="TRANSFERÈNCIES", Observacions="[DESTINATARIO/CONCEPTO]"
    let tercero: string | null = null;
    if (observacions) {
      // Si el concepto es TRANSFERÈNCIES, el observacions es el tercero o concepto libre
      if (/TRANSFER/i.test(concepte)) {
        // Limpiar: quitar referencias numéricas, "Internet Operadores -" prefijo
        const obs = observacions.trim();
        // Si empieza con "Internet Operadores" seguido de referencia, el tercero está en otra parte
        if (!/^Internet Operadores\s*[-,]/i.test(obs) && !/^INTERNET OPERADORES\s*[-,]/i.test(obs)) {
          tercero = obs.replace(/\s*[-|]\s*\d+$/, '').trim() || null;
        }
      } else {
        // Para otros tipos (domiciliaciones, etc.), el observacions suele ser el tercero
        tercero = observacions.trim() || null;
      }
    }

    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal,
      concepto,
      importe,
      saldo: isNaN(saldo) ? null : saldo,
      referencia: remesa,
      codigoOperacion: codigo,
      infoAdicional: null,
      tercero,
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
    const importe = parseImporteES(parts[8].trim());
    const saldo = parseImporteES(parts[13].trim());
    
    const concepto = referencia ? `${counterparty} - ${referencia}` : `${counterparty} (${tipo})`;
    
    if (isNaN(importe)) continue;
    
    // Vivid ya tiene el tercero como campo separado: Counterparty name
    const tercero = counterparty || null;

    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: fecha,
      concepto,
      importe,
      saldo: isNaN(saldo) ? null : saldo,
      referencia: referencia || null,
      codigoOperacion: tipo,
      infoAdicional: null,
      tercero,
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
    
    // Wise: el comercio (col 15) o la descripción (col 5) es el tercero
    const tercero = comercio || descripcion || null;

    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: fecha,
      concepto,
      importe,
      saldo,
      referencia,
      codigoOperacion: row[21] ? String(row[21]) : null, // Tipo de transacción
      infoAdicional: row[22] ? String(row[22]) : null, // Tipo de detalles
      tercero,
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
          tercero: null, // Norma43 no tiene campo separado de tercero
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
// PARSER CAIXABANK (XLS formato TT*.XLS)
// =============================================
/**
 * CaixaBank exporta XLS con estructura:
 * - Fila 1: "MOVIMIENTOS DESDE : DD/MM/YYYY HASTA: DD/MM/YYYY"
 * - Fila 3: Cabeceras (Número de cuenta, Oficina, Divisa, F. Operación, F. Valor, Ingreso (+), Gasto (-), Saldo (+), Saldo (-), Concepto común, Concepto propio, Referencia 1, Referencia 2, Concepto complementario 1-10)
 * - Fila 4+: Datos
 */
export function parseCaixaBankXLS(rows: any[][]): MovimientoParsed[] {
  const movimientos: MovimientoParsed[] = [];
  
  // Detectar formato simplificado: cabecera "Fecha, Fecha valor, Movimiento, Más datos, Importe, Saldo"
  let headerRow = -1;
  let formatoSimplificado = false;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;
    const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join('|');
    if (rowStr.includes('fecha') && rowStr.includes('movimiento') && rowStr.includes('importe')) {
      headerRow = i;
      formatoSimplificado = true;
      break;
    }
    if (row.some((cell: any) => String(cell || '').includes('Operaci'))) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) return movimientos;
  
  // Formato simplificado: Fecha | Fecha valor | Movimiento | Más datos | Importe | Saldo
  if (formatoSimplificado) {
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 5) continue;
      
      // Fechas como número de serie Excel o string DD/MM/YYYY
      const fechaOp = parseExcelDate(row[0]);
      const fechaVal = parseExcelDate(row[1]) || fechaOp;
      if (!fechaOp) continue;
      
      const concepto = String(row[2] || '').trim();
      const masDatos = String(row[3] || '').trim();
      const importe = typeof row[4] === 'number' ? row[4] : parseFloat(String(row[4] || '0').replace(',', '.'));
      const saldo = row[5] !== undefined && row[5] !== '' ? (typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'))) : null;
      
      if (isNaN(importe) || importe === 0) continue;
      
      const conceptoFinal = masDatos ? `${concepto} ${masDatos}` : concepto;
      
      movimientos.push({
        fechaOperacion: fechaOp,
        fechaValor: fechaVal,
        concepto: conceptoFinal,
        importe,
        saldo: saldo !== null && !isNaN(saldo) ? saldo : null,
        referencia: null,
        codigoOperacion: null,
        infoAdicional: null,
        hashUnico: generarHash('caixabank', fechaOp.toISOString(), conceptoFinal, importe, saldo !== null && !isNaN(saldo) ? saldo : null),
      });
    }
    return movimientos;
  }
  
  // Procesar filas de datos
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue; // Col 1 = Número de cuenta
    
    // Col 4 = F. Operación, Col 5 = F. Valor
    const fechaOpStr = String(row[4] || '').trim();
    const fechaValStr = String(row[5] || '').trim();
    if (!fechaOpStr || fechaOpStr === 'NaN') continue;
    
    const fechaOp = parseFechaES(fechaOpStr);
    const fechaVal = parseFechaES(fechaValStr) || fechaOp;
    if (!fechaOp) continue;
    
    // Col 6 = Ingreso (+), Col 7 = Gasto (-)
    const ingreso = parseFloat(String(row[6] || '0'));
    const gasto = parseFloat(String(row[7] || '0'));
    const importe = !isNaN(ingreso) && ingreso > 0 ? ingreso : (!isNaN(gasto) && gasto > 0 ? -gasto : 0);
    if (importe === 0) continue;
    
    // Col 8 = Saldo (+), Col 9 = Saldo (-)
    const saldoPos = parseFloat(String(row[8] || '0'));
    const saldoNeg = parseFloat(String(row[9] || '0'));
    const saldo = !isNaN(saldoPos) && saldoPos > 0 ? saldoPos : (!isNaN(saldoNeg) && saldoNeg > 0 ? -saldoNeg : null);
    
    // Col 10 = Concepto común, Col 11 = Concepto propio
    const conceptoComun = String(row[10] || '').trim();
    const conceptoPropio = String(row[11] || '').trim();
    
    // Col 14 = Concepto complementario 1 (principal)
    const compl1 = String(row[14] || '').trim();
    // Col 18 = Concepto complementario 5 (descripción adicional)
    const compl5 = String(row[18] || '').trim();
    // Col 22 = Concepto complementario 9 (ordenante/beneficiario)
    const compl9 = String(row[22] || '').trim();
    // Col 23 = Concepto complementario 10
    const compl10 = String(row[23] || '').trim();
    
    // Construir concepto legible
    const partes = [compl1, compl5, compl9, compl10].filter(p => p && p !== 'NaN');
    const concepto = partes.length > 0 ? partes.join(' | ') : `CC:${conceptoComun}/${conceptoPropio}`;
    
    // Col 13 = Referencia 2 (BIC, etc.)
    const referencia = String(row[13] || '').trim() || null;
    
    // CaixaBank: compl9 (col 22) es el ordenante/beneficiario
    const tercero = (compl9 && compl9 !== 'NaN') ? compl9 : null;

    movimientos.push({
      fechaOperacion: fechaOp,
      fechaValor: fechaVal!,
      concepto: concepto.substring(0, 500),
      importe,
      saldo,
      referencia: referencia !== 'NaN' ? referencia : null,
      codigoOperacion: conceptoComun || null,
      infoAdicional: conceptoPropio || null,
      tercero,
      hashUnico: generarHash('caixabank', fechaOp.toISOString(), concepto, importe, saldo),
    });
  }
  
  return movimientos;
}

// =============================================
// UTILIDADES
// =============================================

function parseExcelDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  // Si es un número de serie Excel (ej: 46204)
  if (typeof value === 'number') {
    // Excel serial date: días desde 1900-01-01 (con bug del 29/02/1900)
    const excelEpoch = new Date(1899, 11, 30); // 30 dic 1899
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date;
  }
  // Si es string, intentar DD/MM/YYYY o DD/MM/YY
  const str = String(value).trim();
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  return null;
}

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
  if (lower.startsWith('tt') && (lower.endsWith('.xls') || lower.endsWith('.xlsx'))) return 'caixabank';
  if (lower.includes('caixabank') || lower.includes('caixa_bank') || lower.includes('movimientos_cuenta')) return 'caixabank';
  
  // Intentar detectar por contenido
  if (content) {
    if (content.startsWith('Data;Valor;Concepte')) return 'guissona';
    if (content.includes('Data Procés,Data Valor')) return 'bbva';
    if (content.includes('Completed date;Counterparty')) return 'vivid';
    if (content.substring(0, 2) === '11') return 'norma43'; // Registro cabecera N43
  }
  
  return 'desconocido';
}
