/**
 * Parser de PDFs de remesas de ISPGestión
 * 
 * Extrae los recibos individuales con su fecha de vencimiento (Fecha Abono)
 * para poder agrupar por fecha y cruzar con las sub-remesas del banco.
 * 
 * Formato del texto extraído (pdf-parse):
 * - Cada recibo aparece como líneas separadas:
 *   NOMBRE CLIENTE\n\n22.16€\n\nFACTURA N. XXX\n\nES...(IBAN)\n\nDD/MM/YYYY
 * - El símbolo € es UTF-8 (e2 82 ac)
 * - Los importes usan punto como decimal (22.16€)
 */

export interface ReciboRemesaISP {
  nombreCliente: string;
  importe: number;
  concepto: string;
  iban: string;
  fechaAbono: string; // DD/MM/YYYY
}

export interface RemesaISPParseada {
  numeroRemesa: number;
  fechaRemesa: string; // DD/MM/YYYY
  totalRegistros: number;
  totalImporte: number;
  recibos: ReciboRemesaISP[];
  subGrupos: SubGrupoVencimiento[];
}

export interface SubGrupoVencimiento {
  fechaVencimiento: string; // DD/MM/YYYY
  numRecibos: number;
  importeTotal: number;
  recibos: ReciboRemesaISP[];
}

/**
 * Parsea un PDF de remesa de ISPGestión y extrae los recibos agrupados por fecha de vencimiento
 */
export async function parsearPdfRemesaISP(buffer: Buffer): Promise<RemesaISPParseada> {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  const text: string = data.text;

  // Extraer número de remesa (puede ser "Remesa nº 84" o "Remesa n° 84")
  const numRemesaMatch = text.match(/Remesa\s+n[º°ºo]\s*(\d+)/i);
  const numeroRemesa = numRemesaMatch ? parseInt(numRemesaMatch[1]) : 0;

  // Extraer fecha de remesa
  const fechaRemesaMatch = text.match(/fecha\s+(\d{2}\/\d{2}\/\d{4})/i);
  const fechaRemesa = fechaRemesaMatch ? fechaRemesaMatch[1] : '';

  // Extraer total registros
  const numRegistrosMatch = text.match(/N[úu]mero\s+Registros:?\s*[\n\s]*(\d+)/i);
  const totalRegistros = numRegistrosMatch ? parseInt(numRegistrosMatch[1]) : 0;

  // Extraer total importe (formato: 132.96€ o 28,466.92€ o 28.466,92€)
  // En ISPGestión el formato es con punto decimal: 132.96€
  const totalImporteMatch = text.match(/Total\s+Importe\s*[\n\s]*([\d.,]+)\s*€/i);
  let totalImporte = 0;
  if (totalImporteMatch) {
    const raw = totalImporteMatch[1];
    // Si tiene coma, es separador de miles (ej: 28,466.92)
    // Si solo tiene punto, es decimal (ej: 132.96)
    totalImporte = parseImporteISP(raw);
  }

  // Extraer recibos usando el patrón del texto
  // El texto viene en bloques separados por \n\n:
  // NOMBRE\n\nIMPORTE€\n\nCONCEPTO\n\nIBAN\n\nFECHA
  const recibos: ReciboRemesaISP[] = [];

  // Buscar la sección de datos (después de "Fecha Abono")
  const seccionDatos = text.split(/Fecha\s+Abono/i)[1] || text.split(/Remesa\s+Detalle/i)[1] || '';
  
  // Buscar todas las fechas DD/MM/YYYY en la sección de datos
  const fechaRegex = /(\d{2}\/\d{2}\/\d{4})/g;
  const fechasEncontradas: { fecha: string; index: number }[] = [];
  let m;
  while ((m = fechaRegex.exec(seccionDatos)) !== null) {
    // Excluir fechas que son parte de "Total" o "Número Registros"
    const antes = seccionDatos.substring(Math.max(0, m.index - 50), m.index);
    if (!antes.includes('Total') && !antes.includes('Registros')) {
      fechasEncontradas.push({ fecha: m[1], index: m.index });
    }
  }

  // Buscar importes (formato XX.XX€ con € como Unicode)
  const importeRegex = /([\d.]+)\s*€/g;
  const importesEncontrados: { importe: number; index: number }[] = [];
  while ((m = importeRegex.exec(seccionDatos)) !== null) {
    const val = parseFloat(m[1]);
    if (val > 0 && val < totalImporte) {
      importesEncontrados.push({ importe: val, index: m.index });
    }
  }

  // Buscar conceptos (FACTURA N. XXX)
  const conceptoRegex = /FACTURA\s+N\.\s+\S+(?:\s*-\s*\d+)?/gi;
  const conceptosEncontrados: { concepto: string; index: number }[] = [];
  while ((m = conceptoRegex.exec(seccionDatos)) !== null) {
    conceptosEncontrados.push({ concepto: m[0], index: m.index });
  }

  // Buscar IBANs
  const ibanRegex = /(ES\d{22})/g;
  const ibansEncontrados: { iban: string; index: number }[] = [];
  while ((m = ibanRegex.exec(seccionDatos)) !== null) {
    ibansEncontrados.push({ iban: m[1], index: m.index });
  }

  // Construir recibos: el número de fechas debería coincidir con totalRegistros
  const numRecibos = Math.min(
    fechasEncontradas.length,
    importesEncontrados.length,
    totalRegistros || Infinity
  );

  for (let i = 0; i < numRecibos; i++) {
    recibos.push({
      nombreCliente: '', // Difícil de extraer limpiamente
      importe: importesEncontrados[i]?.importe || 0,
      concepto: conceptosEncontrados[i]?.concepto || '',
      iban: ibansEncontrados[i]?.iban || '',
      fechaAbono: fechasEncontradas[i]?.fecha || fechaRemesa,
    });
  }

  // Si no encontramos suficientes recibos con el método anterior,
  // intentar método alternativo: buscar líneas con el patrón completo
  if (recibos.length < totalRegistros && totalRegistros > 0) {
    // Rellenar con los datos que tenemos
    while (recibos.length < totalRegistros) {
      const idx = recibos.length;
      recibos.push({
        nombreCliente: '',
        importe: importesEncontrados[idx]?.importe || 0,
        concepto: conceptosEncontrados[idx]?.concepto || '',
        iban: ibansEncontrados[idx]?.iban || '',
        fechaAbono: fechasEncontradas[idx]?.fecha || fechaRemesa,
      });
    }
  }

  // Agrupar por fecha de vencimiento
  const gruposMap = new Map<string, ReciboRemesaISP[]>();
  for (const recibo of recibos) {
    const fecha = recibo.fechaAbono;
    if (!gruposMap.has(fecha)) {
      gruposMap.set(fecha, []);
    }
    gruposMap.get(fecha)!.push(recibo);
  }

  const subGrupos: SubGrupoVencimiento[] = [];
  for (const [fecha, recibosGrupo] of gruposMap.entries()) {
    subGrupos.push({
      fechaVencimiento: fecha,
      numRecibos: recibosGrupo.length,
      importeTotal: Math.round(recibosGrupo.reduce((sum, r) => sum + r.importe, 0) * 100) / 100,
      recibos: recibosGrupo,
    });
  }

  // Ordenar por fecha
  subGrupos.sort((a, b) => {
    const [dA, mA, yA] = a.fechaVencimiento.split('/').map(Number);
    const [dB, mB, yB] = b.fechaVencimiento.split('/').map(Number);
    return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
  });

  return {
    numeroRemesa,
    fechaRemesa,
    totalRegistros,
    totalImporte,
    recibos,
    subGrupos,
  };
}

/**
 * Parsea un importe en formato ISPGestión
 * Formato: punto como decimal (132.96), sin separador de miles para < 1000
 * Para >= 1000 puede ser: 28466.92 o 28,466.92
 */
function parseImporteISP(raw: string): number {
  // Si tiene coma y punto: coma es miles, punto es decimal (28,466.92)
  if (raw.includes(',') && raw.includes('.')) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastDot > lastComma) {
      // 28,466.92 → quitar comas
      return parseFloat(raw.replace(/,/g, ''));
    } else {
      // 28.466,92 → quitar puntos, coma a punto
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    }
  }
  // Solo punto: es decimal (132.96)
  if (raw.includes('.') && !raw.includes(',')) {
    return parseFloat(raw);
  }
  // Solo coma: es decimal (132,96)
  if (raw.includes(',') && !raw.includes('.')) {
    return parseFloat(raw.replace(',', '.'));
  }
  return parseFloat(raw);
}
