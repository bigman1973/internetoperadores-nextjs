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
  descuento: number; // porcentaje de descuento (0-100)
  iva: number; // porcentaje
  importe: number; // importe bruto (cantidad × precioUnitario)
  importeNeto: number; // importe después de descuento (importe real facturado)
}

export interface DatosFactura {
  proveedor: string;
  cif: string | null;
  domicilioProveedor: string | null; // Dirección fiscal del proveedor
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
- cif: CIF/NIF/VAT del emisor (formato español: B12345678, o formato extranjero si aplica: EE, DE, FR, NL, etc.)
- domicilioProveedor: dirección fiscal completa del emisor tal como aparece en la factura (calle, número, ciudad, código postal, país). Si no aparece, pon null
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
- esInternacional: true si el emisor NO es una empresa española. Indicadores: CIF/VAT no español (no empieza por A-Z español seguido de 8 dígitos), dirección en otro país, moneda diferente, idioma extranjero, o mención "reverse charge", "intra-community supply", "VAT exempt Art. 44/196 Directive"
- paisOrigen: código ISO de 2 letras del país del emisor si es internacional (EE=Estonia, DE=Alemania, FR=Francia, NL=Holanda, US=EEUU, GB=Reino Unido, IT=Italia, PT=Portugal, etc.), null si es española
- lineas: array de TODAS las líneas de detalle de la factura. Cada línea tiene:
  - descripcion: texto descriptivo COMPLETO de la línea (servicio, producto, concepto). Incluye toda la información relevante
  - cliente: si en la descripción aparece un nombre de empresa, persona, municipio, número de teléfono, o referencia a un cliente final, ponlo aquí. Si NO hay referencia clara a un cliente, pon null (NO inventes)
  - cantidad: cantidad (número)
  - precioUnitario: precio por unidad (número decimal)
  - descuento: porcentaje de descuento aplicado a esta línea (0 si no hay descuento, ej: 5 para un 5%)
  - iva: porcentaje de IVA de esta línea (0 si es intracomunitaria/exenta)
  - importe: importe bruto de la línea (cantidad × precioUnitario, SIN aplicar descuento)
  - importeNeto: importe REAL facturado de la línea DESPUÉS de aplicar el descuento. Es el importe que aparece en la columna "Total" de la factura. Si no hay descuento, importeNeto = importe

REGLAS IMPORTANTES:
- Lee la fecha EXACTA del documento. El año es crucial: si pone 2026, es 2026. No confundas con otros años.
- Si no puedes leer un campo, pon null (excepto números que van a 0)
- CUADRE CRÍTICO: La suma de todos los importeNeto de las líneas DEBE ser EXACTAMENTE igual a la base imponible total de la factura.
  * importeNeto DEBE leerse DIRECTAMENTE de la columna "Total" o "Importe" final de cada línea en el PDF. NO lo calcules tú.
  * NO calcules importeNeto como cantidad*precio*(1-descuento/100). Lee el valor REAL que aparece en la columna Total/Amount del PDF.
  * Si la factura tiene columnas como: Cantidad | Precio | Desc% | Total → el campo importeNeto es el valor de la columna "Total" de cada línea.
  * importe (bruto) SÍ es cantidad × precioUnitario (sin descuento).
  * Antes de responder, VERIFICA: sum(importeNeto de todas las líneas) == base imponible. Si no cuadra, revisa los valores de importeNeto leyéndolos de nuevo del PDF.
- El total debe ser: base + importeIva - importeIrpf
- Fechas siempre en formato YYYY-MM-DD
- Si la factura está en otro idioma, traduce el concepto al español pero mantén las descripciones de línea en el idioma original
- En las líneas de detalle, incluye ABSOLUTAMENTE TODAS las líneas con precio que aparezcan, incluso si no tienen cliente asociado
- Si una línea menciona un nombre de cliente, municipio, empresa destinataria, número de teléfono asociado a un servicio, o referencia de contrato, extráelo en el campo "cliente"
- Si una línea NO menciona ningún cliente, pon cliente: null. NO inventes clientes.
- FACTURAS INTERNACIONALES: 
  * Si el CIF/VAT empieza por código de país no español (EE, DE, FR, NL, etc.) → esInternacional=true
  * Si la dirección del emisor es de otro país → esInternacional=true
  * Si dice "reverse charge", "VAT exempt", "intra-community" → esInternacional=true
  * Si el idioma principal NO es español → probablemente internacional
  * Empresas conocidas internacionales: Wildix (Estonia/Italia), Hetzner (Alemania), OVH (Francia), AWS (Irlanda), Google Cloud (Irlanda), Microsoft (Irlanda), Cloudflare (EEUU)
- DOMICILIO: Extrae la dirección fiscal del emisor completa. Suele aparecer en la cabecera de la factura junto al nombre y CIF
- Si es un documento que no es una factura (cesión de créditos, contrato, albarán, etc.), indica confianza 0.1 y pon lo que puedas
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

  const userPrompt = nombreArchivo 
    ? `Extrae los datos de esta factura. El nombre del archivo es: "${nombreArchivo}". Incluye TODAS las líneas de detalle con precio, tengan o no cliente asociado.`
    : 'Extrae los datos de esta factura. Incluye TODAS las líneas de detalle con precio, tengan o no cliente asociado.';

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
      max_tokens: 16000,
      temperature: 0.1,
    });

    const responseContent = response.choices[0]?.message?.content || '';
    
    // Limpiar posible markdown
    let jsonStr = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Si el JSON está truncado (respuesta cortada por max_tokens), intentar reparar
    if (response.choices[0]?.finish_reason === 'length') {
      // Intentar cerrar el JSON truncado
      jsonStr = repararJsonTruncado(jsonStr);
    }
    
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
    if (!datos.domicilioProveedor) datos.domicilioProveedor = null;
    
    // POST-PROCESAMIENTO: Ajustar importeNeto si hay descuadre con la base
    if (datos.lineas.length > 0 && datos.base > 0) {
      // Asegurar que cada línea tiene importeNeto
      for (const linea of datos.lineas) {
        if (linea.importeNeto === undefined || linea.importeNeto === null || isNaN(linea.importeNeto)) {
          linea.importeNeto = linea.importe || 0;
        }
      }
      
      const sumaImporteNeto = datos.lineas.reduce((sum, l) => sum + (l.importeNeto || 0), 0);
      const descuadre = Math.abs(sumaImporteNeto - datos.base);
      
      // Si hay descuadre > 0.05€, ajustar proporcionalmente
      if (descuadre > 0.05 && sumaImporteNeto > 0) {
        const factor = datos.base / sumaImporteNeto;
        let sumaAjustada = 0;
        
        for (let i = 0; i < datos.lineas.length; i++) {
          if (i < datos.lineas.length - 1) {
            datos.lineas[i].importeNeto = Math.round((datos.lineas[i].importeNeto || 0) * factor * 100) / 100;
            sumaAjustada += datos.lineas[i].importeNeto;
          } else {
            // Última línea: ajustar para cuadrar exactamente
            datos.lineas[i].importeNeto = Math.round((datos.base - sumaAjustada) * 100) / 100;
          }
        }
        
        // Recalcular descuento real basado en importeNeto ajustado
        for (const linea of datos.lineas) {
          if (linea.importe > 0 && linea.importeNeto < linea.importe) {
            linea.descuento = Math.round((1 - linea.importeNeto / linea.importe) * 10000) / 100;
          }
        }
      }
    }
    
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
      domicilioProveedor: null,
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
    domicilioProveedor: null,
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
 * Repara un JSON truncado por max_tokens
 * Intenta cerrar arrays y objetos abiertos para que sea parseable
 */
function repararJsonTruncado(json: string): string {
  // Contar llaves y corchetes abiertos
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (const char of json) {
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') openBraces++;
    if (char === '}') openBraces--;
    if (char === '[') openBrackets++;
    if (char === ']') openBrackets--;
  }

  // Si estamos dentro de un string, cerrarlo
  if (inString) {
    json += '"';
  }

  // Eliminar la última propiedad incompleta (después de la última coma válida)
  // Buscar la última coma seguida de contenido incompleto
  const lastCompleteComma = json.lastIndexOf(',');
  const lastCloseBrace = json.lastIndexOf('}');
  const lastCloseBracket = json.lastIndexOf(']');
  
  if (lastCompleteComma > lastCloseBrace && lastCompleteComma > lastCloseBracket) {
    // La última coma indica un elemento incompleto después de ella
    json = json.substring(0, lastCompleteComma);
    // Recalcular
    openBraces = 0;
    openBrackets = 0;
    inString = false;
    escape = false;
    for (const char of json) {
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  // Cerrar arrays y objetos abiertos
  while (openBrackets > 0) { json += ']'; openBrackets--; }
  while (openBraces > 0) { json += '}'; openBraces--; }

  return json;
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
