/**
 * Parser de PDFs de remesas del Santander
 * 
 * El texto extraído por pdf-parse tiene un formato peculiar:
 * - Los datos de recibos están ANTES del "Listado de órdenes (N)"
 * - El subtotal está antes del "Listado de órdenes" correspondiente
 * - Formato: "DeudorCuenta de cargoImporte\nNOMBREIBANIMPORTE EUR\n..."
 * - Luego: "XXX,XX EUR\nSubtotal importe:\nListado de órdenes (N)\n...Fecha cobro\nDD/MM/YYYY"
 * 
 * Estructura real del texto:
 * [cabecera con importe total]
 * [recibos grupo 1 concatenados sin espacios]
 * [subtotal grupo 1] EUR
 * Subtotal importe:
 * Listado de órdenes (N)
 * ...Fecha cobro
 * DD/MM/YYYY
 * [recibos grupo 2]
 * [subtotal grupo 2] EUR
 * Subtotal importe:
 * Listado de órdenes (M)
 * ...Fecha cobro
 * DD/MM/YYYY
 */

export interface OrdenSantander {
  deudor: string;
  cuentaCargo: string;
  importe: number;
}

export interface SubRemesaSantander {
  fechaCobro: string; // DD/MM/YYYY
  numOrdenes: number;
  subtotal: number;
  ordenes: OrdenSantander[];
}

export interface RemesaSantanderParseada {
  importeTotal: number;
  fechaEnvio: string;
  contrato: string;
  subRemesas: SubRemesaSantander[];
}

/**
 * Parsea un PDF de remesa del Santander y extrae las sub-remesas por fecha de cobro
 */
export async function parsearPdfRemesaSantander(buffer: Buffer): Promise<RemesaSantanderParseada> {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  const text: string = data.text;

  // Extraer importe total
  const importeTotalMatch = text.match(/Importe\s+total\n([\d.,]+)\s*EUR/i);
  const importeTotal = importeTotalMatch ? parseImporteES(importeTotalMatch[1]) : 0;

  // Extraer fecha de envío
  const fechaEnvioMatch = text.match(/Fecha\s+de\s+env[ií]o\n(\d{2}\/\d{2}\/\d{4})/i);
  const fechaEnvio = fechaEnvioMatch ? fechaEnvioMatch[1] : '';

  // Extraer contrato
  const contratoMatch = text.match(/(ES\d{20,24})\nContrato/i);
  const contrato = contratoMatch ? contratoMatch[1] : '';

  // Estrategia: buscar todos los bloques "Subtotal importe:" seguidos de 
  // "Listado de órdenes (N)" y luego "Fecha cobro\nDD/MM/YYYY"
  
  // Encontrar subtotales: el importe está en la línea ANTERIOR a "Subtotal importe:"
  // Patrón: "XXX,XX EUR\nSubtotal importe:"
  const subtotalRegex = /([\d.,]+)\s*EUR\nSubtotal\s+importe:/gi;
  const subtotales: number[] = [];
  let m;
  while ((m = subtotalRegex.exec(text)) !== null) {
    subtotales.push(parseImporteES(m[1]));
  }

  // Encontrar "Listado de órdenes (N)" con su número
  const listadoRegex = /Listado\s+de\s+[óo]rdenes\s*\((\d+)\)/gi;
  const numOrdenes: number[] = [];
  while ((m = listadoRegex.exec(text)) !== null) {
    numOrdenes.push(parseInt(m[1]));
  }

  // Encontrar fechas de cobro (después de "Fecha cobro\n")
  const fechaCobroRegex = /Fecha\s+cobro\n(\d{2}\/\d{2}\/\d{4})/gi;
  const fechasCobro: string[] = [];
  while ((m = fechaCobroRegex.exec(text)) !== null) {
    fechasCobro.push(m[1]);
  }

  // Construir sub-remesas: cada una tiene subtotal, numOrdenes y fechaCobro
  // El orden es: subtotal[0] → listado[0] → fecha[0]
  const subRemesas: SubRemesaSantander[] = [];
  const count = Math.min(subtotales.length, numOrdenes.length, fechasCobro.length);

  for (let i = 0; i < count; i++) {
    subRemesas.push({
      fechaCobro: fechasCobro[i],
      numOrdenes: numOrdenes[i],
      subtotal: subtotales[i],
      ordenes: [], // No extraemos órdenes individuales por ahora (difícil sin separadores)
    });
  }

  // Si no encontramos subtotales pero sí fechas y numOrdenes, intentar calcular
  if (subRemesas.length === 0 && fechasCobro.length > 0) {
    for (let i = 0; i < fechasCobro.length; i++) {
      subRemesas.push({
        fechaCobro: fechasCobro[i],
        numOrdenes: numOrdenes[i] || 0,
        subtotal: 0,
        ordenes: [],
      });
    }
  }

  return {
    importeTotal,
    fechaEnvio,
    contrato,
    subRemesas,
  };
}

/**
 * Parsea un importe en formato español (coma decimal, punto miles)
 */
function parseImporteES(raw: string): number {
  if (!raw) return 0;
  // Si tiene punto y coma: punto es miles, coma es decimal
  if (raw.includes('.') && raw.includes(',')) {
    return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  }
  // Solo coma: es decimal
  if (raw.includes(',')) {
    return parseFloat(raw.replace(',', '.'));
  }
  // Solo punto
  if (raw.includes('.')) {
    return parseFloat(raw);
  }
  return parseFloat(raw);
}
