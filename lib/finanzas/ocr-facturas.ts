/**
 * OCR de facturas usando GPT-4o Vision
 * Extrae datos estructurados de PDFs e imágenes de facturas
 * Incluye líneas de detalle con precio para imputación por cliente
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
}

/**
 * Extrae datos de una factura a partir de imágenes (base64)
 * Soporta múltiples páginas para facturas largas
 */
export async function extraerDatosFactura(
  imageBase64: string | string[],
  mimeType: string = 'image/png',
  nombreArchivo?: string
): Promise<DatosFactura> {
  const systemPrompt = `Eres un experto en contabilidad española. Extraes datos de facturas recibidas con máxima precisión.
SIEMPRE devuelves un JSON válido con los siguientes campos:
- proveedor: nombre del emisor de la factura (empresa que factura)
- cif: CIF/NIF del emisor (formato español: B12345678, o formato extranjero si aplica)
- numFactura: número de factura exacto tal como aparece en el documento
- fecha: fecha de emisión de la factura en formato YYYY-MM-DD (IMPORTANTE: lee el año exacto del documento, no inventes)
- base: base imponible total (número decimal, sin símbolo €)
- tipoIva: porcentaje de IVA principal aplicado (21, 10, 4, 0)
- importeIva: importe total del IVA (número decimal)
- tipoIrpf: porcentaje de IRPF retenido (15, 7, 0). Solo aplica a facturas de profesionales/autónomos
- importeIrpf: importe del IRPF retenido (número decimal, positivo)
- total: importe total de la factura (número decimal)
- concepto: descripción general del servicio/producto facturado
- confianza: tu nivel de confianza en la extracción (0.0 a 1.0)
- lineas: array de líneas de detalle de la factura. Cada línea tiene:
  - descripcion: texto descriptivo de la línea (servicio, producto, concepto)
  - cliente: si en la descripción aparece un nombre de empresa, persona, municipio, o referencia a un cliente final, ponlo aquí. Si no hay referencia a cliente, pon null
  - cantidad: cantidad (número)
  - precioUnitario: precio por unidad (número decimal)
  - iva: porcentaje de IVA de esta línea
  - importe: importe total de la línea (cantidad × precioUnitario)

REGLAS IMPORTANTES:
- Lee la fecha EXACTA del documento. El año es crucial: si pone 2026, es 2026. No confundas con otros años.
- Si no puedes leer un campo, pon null (excepto números que van a 0)
- El total debe ser: base + importeIva - importeIrpf
- Fechas siempre en formato YYYY-MM-DD
- Si la factura está en otro idioma, traduce el concepto al español
- En las líneas de detalle, incluye TODAS las líneas con precio que aparezcan
- Si una línea menciona un nombre de cliente, municipio, empresa destinataria, número de teléfono asociado a un servicio, o referencia de contrato, extráelo en el campo "cliente"
- Si es un documento que no es una factura (cesión de créditos, contrato, etc.), indica confianza 0.1 y pon lo que puedas
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

  const userPrompt = nombreArchivo 
    ? `Extrae los datos de esta factura. El nombre del archivo es: "${nombreArchivo}". Incluye TODAS las líneas de detalle con precio.`
    : 'Extrae los datos de esta factura. Incluye TODAS las líneas de detalle con precio.';

  // Preparar las imágenes (puede ser una o varias páginas)
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  
  const imageContent: any[] = images.map(img => ({
    type: 'image_url',
    image_url: {
      url: `data:${mimeType};base64,${img}`,
      detail: 'high',
    },
  }));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 4000,
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
    if (!Array.isArray(datos.lineas)) datos.lineas = [];
    
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
  };
}

/**
 * Convierte un PDF a múltiples imágenes base64 (una por página)
 * Usa pdf2image (Python) para la conversión
 */
export async function pdfToBase64Images(pdfBuffer: Buffer, maxPages: number = 5): Promise<string[]> {
  // Escribir PDF temporal
  const fs = await import('fs');
  const path = await import('path');
  const { execSync } = await import('child_process');
  
  const tmpDir = '/tmp/ocr-pdf';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  
  const pdfPath = path.join(tmpDir, `factura-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);
  
  try {
    // Convertir PDF a PNG usando pdftoppm (poppler-utils)
    const outputPrefix = path.join(tmpDir, `page-${Date.now()}`);
    execSync(`pdftoppm -png -r 200 -l ${maxPages} "${pdfPath}" "${outputPrefix}"`, { timeout: 30000 });
    
    // Leer las imágenes generadas
    const images: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      // pdftoppm genera archivos como page-XXX-1.png, page-XXX-2.png, etc.
      const patterns = [
        `${outputPrefix}-${i}.png`,
        `${outputPrefix}-${String(i).padStart(2, '0')}.png`,
        `${outputPrefix}-${String(i).padStart(3, '0')}.png`,
      ];
      
      let found = false;
      for (const imgPath of patterns) {
        if (fs.existsSync(imgPath)) {
          const imgBuffer = fs.readFileSync(imgPath);
          images.push(imgBuffer.toString('base64'));
          fs.unlinkSync(imgPath); // Limpiar
          found = true;
          break;
        }
      }
      if (!found && i > 1) break; // No hay más páginas
    }
    
    // Limpiar PDF temporal
    fs.unlinkSync(pdfPath);
    
    return images;
  } catch (error: any) {
    console.error('Error convirtiendo PDF a imágenes:', error.message);
    // Fallback: enviar el PDF como base64 directamente (solo primera página)
    const base64 = pdfBuffer.toString('base64');
    try { require('fs').unlinkSync(pdfPath); } catch {}
    return [base64];
  }
}
