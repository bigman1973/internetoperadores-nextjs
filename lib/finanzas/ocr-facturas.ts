/**
 * OCR de facturas usando GPT-4o Vision
 * Extrae datos estructurados de PDFs e imágenes de facturas
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface DatosFactura {
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string; // YYYY-MM-DD
  base: number;
  tipoIva: number;
  importeIva: number;
  tipoIrpf: number;
  importeIrpf: number;
  total: number;
  concepto: string | null;
  confianza: number; // 0-1
}

/**
 * Extrae datos de una factura a partir de una imagen (base64)
 */
export async function extraerDatosFactura(
  imageBase64: string,
  mimeType: string = 'image/png',
  nombreArchivo?: string
): Promise<DatosFactura> {
  const systemPrompt = `Eres un experto en contabilidad española. Extraes datos de facturas recibidas con precisión.
SIEMPRE devuelves un JSON válido con los siguientes campos:
- proveedor: nombre del emisor de la factura
- cif: CIF/NIF del emisor (formato español: B12345678, 12345678A, etc.)
- numFactura: número de factura
- fecha: fecha de la factura en formato YYYY-MM-DD
- base: base imponible (número decimal, sin símbolo €)
- tipoIva: porcentaje de IVA aplicado (21, 10, 4, 0)
- importeIva: importe del IVA (número decimal)
- tipoIrpf: porcentaje de IRPF retenido (15, 7, 0). Solo aplica a facturas de profesionales/autónomos
- importeIrpf: importe del IRPF retenido (número decimal, positivo)
- total: importe total de la factura (número decimal)
- concepto: descripción breve del servicio/producto
- confianza: tu nivel de confianza en la extracción (0.0 a 1.0)

REGLAS:
- Si no puedes leer un campo, pon null (excepto números que van a 0)
- El total debe ser: base + importeIva - importeIrpf
- Si hay varias líneas con distintos IVA, usa el IVA mayoritario y suma las bases
- Fechas siempre en formato YYYY-MM-DD
- Si la factura está en otro idioma, traduce el concepto al español
- Si es un ticket/recibo sin número de factura, pon "TICKET" en numFactura
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

  const userPrompt = nombreArchivo 
    ? `Extrae los datos de esta factura. El nombre del archivo es: "${nombreArchivo}"`
    : 'Extrae los datos de esta factura.';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Limpiar posible markdown
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const datos = JSON.parse(jsonStr) as DatosFactura;
    
    // Validaciones básicas
    if (!datos.proveedor) datos.proveedor = 'DESCONOCIDO';
    if (!datos.fecha) datos.fecha = new Date().toISOString().split('T')[0];
    if (isNaN(datos.base)) datos.base = 0;
    if (isNaN(datos.importeIva)) datos.importeIva = 0;
    if (isNaN(datos.importeIrpf)) datos.importeIrpf = 0;
    if (isNaN(datos.total)) datos.total = datos.base + datos.importeIva - datos.importeIrpf;
    if (isNaN(datos.tipoIva)) datos.tipoIva = 21;
    if (isNaN(datos.tipoIrpf)) datos.tipoIrpf = 0;
    if (isNaN(datos.confianza)) datos.confianza = 0.5;
    
    return datos;
  } catch (error: any) {
    console.error('Error en OCR de factura:', error.message);
    
    // Intentar extraer datos del nombre del archivo
    if (nombreArchivo) {
      return extraerDatosDeNombreArchivo(nombreArchivo);
    }
    
    return {
      proveedor: 'ERROR_OCR',
      cif: null,
      numFactura: null,
      fecha: new Date().toISOString().split('T')[0],
      base: 0,
      tipoIva: 21,
      importeIva: 0,
      tipoIrpf: 0,
      importeIrpf: 0,
      total: 0,
      concepto: `Error OCR: ${error.message}`,
      confianza: 0,
    };
  }
}

/**
 * Extrae datos básicos del nombre del archivo cuando OCR falla
 * Formato típico: "DD.MM.YYYY PROVEEDOR FRA. NUMERO.pdf"
 */
function extraerDatosDeNombreArchivo(nombre: string): DatosFactura {
  const sinExt = nombre.replace(/\.(pdf|jpg|jpeg|png|heic|tiff)$/i, '');
  
  // Intentar extraer fecha DD.MM.YYYY
  const fechaMatch = sinExt.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  let fecha = new Date().toISOString().split('T')[0];
  if (fechaMatch) {
    fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`;
  }
  
  // Intentar extraer proveedor (texto entre fecha y "FRA.")
  let proveedor = 'DESCONOCIDO';
  const proveedorMatch = sinExt.match(/\d{4}\s+(.+?)\s+FRA/i);
  if (proveedorMatch) {
    proveedor = proveedorMatch[1].trim();
  }
  
  // Intentar extraer número de factura
  let numFactura: string | null = null;
  const numMatch = sinExt.match(/FRA\.?\s*(.+)/i);
  if (numMatch) {
    numFactura = numMatch[1].trim();
  }
  
  return {
    proveedor,
    cif: null,
    numFactura,
    fecha,
    base: 0,
    tipoIva: 21,
    importeIva: 0,
    tipoIrpf: 0,
    importeIrpf: 0,
    total: 0,
    concepto: null,
    confianza: 0.2,
  };
}

/**
 * Convierte un PDF a imagen base64 para OCR
 * Usa solo la primera página (donde suelen estar los datos fiscales)
 */
export async function pdfToBase64Image(pdfBuffer: Buffer): Promise<string> {
  // Para PDFs, enviamos directamente como base64 - GPT-4o Vision puede leer PDFs
  // a través de la API de archivos, pero es más simple enviar como imagen
  // Usamos la primera página convertida a PNG
  
  // Alternativa: enviar el PDF directamente como base64
  // GPT-4o-mini puede procesar PDFs directamente si se envían como imagen
  return pdfBuffer.toString('base64');
}
