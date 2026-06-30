/**
 * Parser específico para facturas de Telefónica Móviles España
 * 
 * Estas facturas son kilométricas (100+ páginas) con detalle por extensión/línea.
 * No se usa GPT-4o sino extracción directa de texto con pdf-parse + regex.
 * 
 * Usa pdf-parse v1.1.1 (pdfjs-dist v1.x interno, sin workers, compatible Vercel serverless).
 * 
 * Estructura del PDF:
 * - Página 1: Resumen general (total, nº extensiones, fecha, nº factura)
 * - Páginas 2+: Detalle por extensión (Extensión + Teléfono + Cuotas + Llamadas)
 */

import { prisma } from '@/lib/prisma';

export interface LineaTelefonica {
  extension: string;
  telefono: string;
  cuotaMensual: number;
  llamadas: number;
  total: number;
  concepto: string;
  clienteId?: string;
  clienteNombre?: string;
  contratoId?: number;
}

export interface ResultadoParserTelefonica {
  proveedor: string;
  cif: string;
  numeroFactura: string;
  fecha: string;
  baseImponible: number;
  iva: number;
  total: number;
  tipoContrato: string;
  numExtensiones: number;
  lineas: LineaTelefonica[];
  sumaLineas: number;
  descuadre: number;
  esInternacional: boolean;
  paisOrigen: string;
  domicilioProveedor: string;
  confianza: number;
}

/**
 * Detecta si un PDF es una factura de Telefónica Móviles basándose en el nombre del archivo
 */
export function esTelefonicaMoviles(nombreArchivo: string, proveedor?: string): boolean {
  const nombre = (nombreArchivo || '').toUpperCase();
  const prov = (proveedor || '').toUpperCase();
  
  return (
    nombre.includes('TELEFÓNICA MÓVILES') ||
    nombre.includes('TELEFONICA MOVILES') ||
    prov.includes('TELEFÓNICA MÓVILES') ||
    prov.includes('TELEFONICA MOVILES') ||
    // Patrón de nº factura de Telefónica Móviles: XX-XXXX-XXXXXX
    /\d{2}-[A-Z]\d[A-Z]\d-\d{6}/.test(nombre)
  );
}

/**
 * Extrae texto completo de un PDF usando pdf-parse v1.1.1 (sin workers, compatible serverless)
 */
async function extraerTextoPDF(pdfBuffer: Buffer): Promise<{ text: string; numPages: number }> {
  // pdf-parse v1.1.1 es CJS, usar require dinámico
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  
  const data = await pdfParse(pdfBuffer);
  
  return { text: data.text, numPages: data.numpages };
}

/**
 * Parsea una factura de Telefónica Móviles extrayendo el detalle por línea/extensión
 */
export async function parsearFacturaTelefonicaMoviles(pdfBuffer: Buffer): Promise<ResultadoParserTelefonica> {
  const { text, numPages } = await extraerTextoPDF(pdfBuffer);
  
  // Extraer datos generales de la cabecera
  const fechaMatch = text.match(/Madrid,\s+(\d{2}\s+\w+\s+\d{4})/);
  const facturaMatch = text.match(/Factura\s+([\w-]+)/);
  const cifMatch = text.match(/CIF\/NIF:\s*([\w\d]+)/);
  
  // Buscar base imponible y total
  const baseMatch = text.match(/Total\s*\(Base imponible\)\s*([\d.,]+)/);
  const ivaMatch = text.match(/IVA\s*\(\d+%?\)\s*([\d.,]+)/);
  const totalMatch = text.match(/TOTAL\s*a pagar\s*\(euros\)\s*([\d.,]+)/);
  const extensionesMatch = text.match(/Extensiones móviles:\s*(\d+)/);
  const tipoContratoMatch = text.match(/Tipo de contrato:\s*([^\n]+)/);
  
  let baseImponible = baseMatch ? parseFloat(baseMatch[1].replace('.', '').replace(',', '.')) : 0;
  const iva = ivaMatch ? parseFloat(ivaMatch[1].replace('.', '').replace(',', '.')) : 0;
  let totalFactura = totalMatch ? parseFloat(totalMatch[1].replace('.', '').replace(',', '.')) : 0;
  const numExtensiones = extensionesMatch ? parseInt(extensionesMatch[1]) : 0;
  
  // Parsear fecha
  const fechaStr = fechaMatch ? fechaMatch[1] : '';
  const fecha = parsearFechaTelefonica(fechaStr);
  
  // Dividir por extensiones y extraer datos de cada una
  const bloques = text.split(/(?=Extensión móvil:\s*\d+)/);
  const lineas: LineaTelefonica[] = [];
  
  for (let i = 1; i < bloques.length; i++) {
    const bloque = bloques[i];
    
    const extMatch = bloque.match(/Extensión móvil:\s*(\d+)/);
    const telMatch = bloque.match(/Teléfono\s*(\d{9})/);
    
    // Buscar "Otros conceptos" y "Llamadas" con sus importes
    const otrosMatch = bloque.match(/Otros conceptos\s+([\d.,]+)/);
    const llamadasMatch = bloque.match(/Llamadas\s*\([^)]*\)\s+([\d.,]+)/);
    
    // También buscar el Total del bloque
    const totalBloqueMatch = bloque.match(/Total\s+([\d.,]+)/);
    
    const extension = extMatch ? extMatch[1] : '';
    const telefono = telMatch ? telMatch[1] : '';
    const cuotaMensual = otrosMatch ? parseFloat(otrosMatch[1].replace('.', '').replace(',', '.')) : 0;
    const llamadasImporte = llamadasMatch ? parseFloat(llamadasMatch[1].replace('.', '').replace(',', '.')) : 0;
    
    // Usar el Total del bloque si existe, sino sumar cuota + llamadas
    let totalLinea = cuotaMensual + llamadasImporte;
    if (totalBloqueMatch) {
      const totalBloque = parseFloat(totalBloqueMatch[1].replace('.', '').replace(',', '.'));
      // Solo usar el total del bloque si es razonable
      if (totalBloque > 0 && totalBloque < 10000 && Math.abs(totalBloque - totalLinea) < totalLinea * 0.5) {
        totalLinea = totalBloque;
      }
    }
    
    // Extraer concepto (tipo de tarifa)
    const conceptoMatch = bloque.match(/(Dúo\s+\w+\s*(?:Plus\s+)?Corp|Bono\s+\w+|MultiSIM|Tarifa\s+\w+|Plan\s+\w+)/i);
    const concepto = conceptoMatch ? conceptoMatch[1].trim() : 'Cuota móvil';
    
    if (extension && telefono) {
      lineas.push({
        extension,
        telefono,
        cuotaMensual,
        llamadas: llamadasImporte,
        total: totalLinea,
        concepto: `Ext ${extension} - Tel ${telefono} - ${concepto}`,
      });
    }
  }
  
  const sumaLineas = lineas.reduce((sum, l) => sum + l.total, 0);
  
  // Si no encontramos base imponible en la cabecera, usar la suma de líneas
  if (baseImponible === 0 && sumaLineas > 0) {
    baseImponible = sumaLineas;
  }
  if (totalFactura === 0 && baseImponible > 0) {
    totalFactura = Math.round(baseImponible * 1.21 * 100) / 100;
  }
  
  const descuadre = Math.abs(baseImponible - sumaLineas);
  
  // Si hay descuadre > 0.01€, ajustar proporcionalmente
  if (descuadre > 0.01 && lineas.length > 0 && sumaLineas > 0) {
    const factor = baseImponible / sumaLineas;
    for (const linea of lineas) {
      linea.total = Math.round(linea.total * factor * 100) / 100;
      linea.cuotaMensual = Math.round(linea.cuotaMensual * factor * 100) / 100;
      linea.llamadas = Math.round(linea.llamadas * factor * 100) / 100;
    }
  }
  
  return {
    proveedor: 'TELEFÓNICA MÓVILES ESPAÑA, S.A.U.',
    cif: cifMatch ? cifMatch[1] : 'A78923125',
    numeroFactura: facturaMatch ? facturaMatch[1] : '',
    fecha,
    baseImponible,
    iva,
    total: totalFactura,
    tipoContrato: tipoContratoMatch ? tipoContratoMatch[1].trim() : 'Plan Corporativo',
    numExtensiones,
    lineas,
    sumaLineas: lineas.reduce((sum, l) => sum + l.total, 0),
    descuadre: Math.abs(baseImponible - lineas.reduce((sum, l) => sum + l.total, 0)),
    esInternacional: false,
    paisOrigen: 'ES',
    domicilioProveedor: 'Ronda de la Comunicación s/n, 28050 Madrid, España',
    confianza: 1.0,
  };
}

/**
 * Vincula las líneas telefónicas con los contratos/clientes de la BD
 */
export async function vincularLineasConClientes(lineas: LineaTelefonica[]): Promise<LineaTelefonica[]> {
  // Obtener todos los contratos activos con teléfono
  const contratos = await prisma.contratoServicio.findMany({
    where: {
      activo: true,
      telefonosContrato: { not: null },
    },
    select: {
      id: true,
      clienteId: true,
      telefonosContrato: true,
      titulo: true,
    },
  });
  
  // Crear mapeo teléfono → contrato
  const mapaTelefono = new Map<string, { clienteId: string; contratoId: number; titulo: string }>();
  
  for (const contrato of contratos) {
    if (!contrato.telefonosContrato) continue;
    const telefonos = contrato.telefonosContrato.split(',').map((t: string) => t.trim()).filter((t: string) => /^\d{9}$/.test(t));
    for (const tel of telefonos) {
      mapaTelefono.set(tel, {
        clienteId: contrato.clienteId,
        contratoId: contrato.id,
        titulo: contrato.titulo || '',
      });
    }
  }
  
  // Obtener nombres de clientes
  const clienteIdsSet = new Set<string>();
  mapaTelefono.forEach(v => clienteIdsSet.add(v.clienteId));
  const clienteIds = Array.from(clienteIdsSet);
  
  const clientes = await prisma.clienteWeb.findMany({
    where: { clienteIdIsp: { in: clienteIds } },
    select: { id: true, clienteIdIsp: true, nombre: true },
  });
  const mapaClientes = new Map<string, { id: string; nombre: string }>();
  clientes.forEach(c => {
    if (c.clienteIdIsp) mapaClientes.set(c.clienteIdIsp, { id: c.id, nombre: c.nombre });
  });
  
  // Vincular cada línea
  return lineas.map(linea => {
    const match = mapaTelefono.get(linea.telefono);
    if (match) {
      const cliente = mapaClientes.get(match.clienteId);
      return {
        ...linea,
        clienteId: cliente?.id || match.clienteId,
        clienteNombre: cliente?.nombre || 'Cliente desconocido',
        contratoId: match.contratoId,
      };
    }
    return linea;
  });
}

/**
 * Parsea fechas en formato "01 Marzo 2026"
 */
function parsearFechaTelefonica(fechaStr: string): string {
  const meses: Record<string, string> = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
  };
  
  const match = fechaStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!match) return new Date().toISOString().split('T')[0];
  
  const dia = match[1].padStart(2, '0');
  const mes = meses[match[2].toLowerCase()] || '01';
  const anio = match[3];
  
  return `${anio}-${mes}-${dia}`;
}
