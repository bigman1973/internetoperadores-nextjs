/**
 * OCR de facturas usando GPT-4o Vision
 * Extrae datos estructurados de PDFs e imágenes de facturas
 * Incluye líneas de detalle con precio para imputación por cliente
 * 
 * IMPORTANTE: Envía PDFs directamente a la API (sin conversión a imagen)
 * Compatible con Vercel serverless (sin dependencias nativas)
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface LineaDetalle {
  descripcion: string;
  cliente: string | null; // Nombre del cliente si se detecta
  cantidad: number;
  precioUnitario: number;
  iva: number; // porcentaje
  importe: number; // total de la línea
}

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
  lineas: LineaDetalle[];
  esInternacional: boolean; // factura intracomunitaria/internacional sin IVA
  paisOrigen: string | null; // país del emisor si es internacional
}

/**
 * Extrae datos de una factura a partir de un PDF o imagen (base64)
 * Soporta envío directo de PDF a GPT-4o (sin conversión a imagen)
 */
export async function extraerDatosFactura(
  fileBase64: string | string[],
  mimeType: string = 'image/png',
  nombreArchivo?: string
): Promise<DatosFactura> {
  const systemPrompt = `Eres un experto en contabilidad española. Extraes datos de facturas recibidas con máxima precisión.
SIEMPRE devuelves un JSON válido con los siguientes campos:
- proveedor: nombre del emisor de la factura (empresa que factura)
- cif: CIF/NIF/VAT del emisor (formato español: B12345678, o formato extranjero si aplica: EE, DE, FR, etc.)
- numFactura: número de factura exacto tal como aparece en el documento
- fecha: fecha de emisión de la factura en formato YYYY-MM-DD (IMPORTANTE: lee el año exacto del documento, no inventes)
- base: base imponible total (número decimal, sin símbolo €)
- tipoIva: porcentaje de IVA principal aplicado (21, 10, 4, 0). Si es factura intracomunitaria sin IVA, pon 0
- importeIva: importe total del IVA (número decimal). Si no hay IVA, pon 0
- tipoIrpf: porcentaje de IRPF retenido (15, 7, 0). Solo aplica a facturas de profesionales/autónomos españoles
- importeIrpf: importe del IRPF retenido (número decimal, positivo)
- total: importe total de la factura (número decimal)
- concepto: descripción general del servicio/producto facturado
- confianza: tu nivel de confianza en la extracción (0.0 a 1.0)
- esInternacional: true si el emisor es una empresa extranjera (no española) o si es factura intracomunitaria
- paisOrigen: código ISO del país del emisor si es internacional (EE, DE, FR, NL, US, etc.), null si es española
- lineas: array de líneas de detalle de la factura. Cada línea tiene:
  - descripcion: texto descriptivo de la línea (servicio, producto, concepto)
  - cliente: si en la descripción aparece un nombre de empresa, persona, municipio, número de teléfono, o referencia a un cliente final, ponlo aquí. Si no hay referencia a cliente, pon null
  - cantidad: cantidad (número)
  - precioUnitario: precio por unidad (número decimal)
  - iva: porcentaje de IVA de esta línea (0 si es intracomunitaria/exenta)
  - importe: importe total de la línea (cantidad × precioUnitario)

REGLAS IMPORTANTES:
- Lee la fecha EXACTA del documento. El año es crucial: si pone 2026, es 2026. No confundas con otros años.
- Si no puedes leer un campo, pon null (excepto números que van a 0)
- El total debe ser: base + importeIva - importeIrpf
- Fechas siempre en formato YYYY-MM-DD
- Si la factura está en otro idioma, traduce el concepto al español
- En las líneas de detalle, incluye TODAS las líneas con precio que aparezcan
- Si una línea menciona un nombre de cliente, municipio, empresa destinataria, número de teléfono asociado a un servicio, o referencia de contrato, extráelo en el campo "cliente"
- FACTURAS INTERNACIONALES: Si el emisor no es español (CIF no empieza por letra española, o tiene VAT de otro país), marca esInternacional=true y tipoIva=0
- Si es un documento que no es una factura (cesión de créditos, contrato, albarán, etc.), indica confianza 0.1 y pon lo que puedas
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

  const userPrompt = nombreArchivo 
    ? `Extrae los datos de esta factura. El nombre del archivo es: "${nombreArchivo}". Incluye TODAS las líneas de detalle con precio.`
    : 'Extrae los datos de esta factura. Incluye TODAS las líneas de detalle con precio.';

  // Preparar el contenido del mensaje
  const content: any[] = [{ type: 'text', text: userPrompt }];

  // Si es un array (múltiples imágenes de páginas), enviar todas
  const files = Array.isArray(fileBase64) ? fileBase64 : [fileBase64];
  
  for (const file of files) {
    if (mimeType === 'application/pdf') {
      // Enviar PDF directamente (soportado desde marzo 2025)
      content.push({
        type: 'file',
        file: {
          filename: nombreArchivo || 'factura.pdf',
          file_data: `data:application/pdf;base64,${file}`,
        },
      });
    } else {
      // Enviar como imagen
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${file}`,
          detail: 'high',
        },
      });
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const responseContent = response.choices[0]?.message?.content || '';
    
    // Limpiar posible markdown
    const jsonStr = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
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
    if (!Array.isArray(datos.lineas)) datos.lineas = [];
    if (typeof datos.esInternacional !== 'boolean') datos.esInternacional = false;
    if (!datos.paisOrigen) datos.paisOrigen = null;
    
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
      lineas: [],
      esInternacional: false,
      paisOrigen: null,
    };
  }
}

/**
 * Extrae datos básicos del nombre del archivo cuando OCR falla
 */
function extraerDatosDeNombreArchivo(nombre: string): DatosFactura {
  const sinExt = nombre.replace(/\.(pdf|jpg|jpeg|png|heic|tiff)$/i, '');
  
  // Intentar extraer fecha DD.MM.YYYY
  const fechaMatch = sinExt.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  let fecha = new Date().toISOString().split('T')[0];
  if (fechaMatch) {
    fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`;
  }
  
  // Intentar extraer proveedor
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
    lineas: [],
    esInternacional: false,
    paisOrigen: null,
  };
}

/**
 * Convierte un PDF a base64 para envío directo a la API
 * Ya no necesita conversión a imagen - GPT-4o acepta PDFs directamente
 */
export function pdfToBase64(pdfBuffer: Buffer): string {
  return pdfBuffer.toString('base64');
}

/**
 * @deprecated Usar pdfToBase64 en su lugar. GPT-4o acepta PDFs directamente.
 * Mantenida por compatibilidad con scripts existentes.
 */
export async function pdfToBase64Images(pdfBuffer: Buffer, maxPages: number = 5): Promise<string[]> {
  // Simplemente devolver el PDF como base64 - GPT-4o lo acepta directamente
  return [pdfBuffer.toString('base64')];
}
