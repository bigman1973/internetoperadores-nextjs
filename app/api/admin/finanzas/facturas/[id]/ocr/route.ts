import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken, downloadFile } from '@/lib/finanzas/microsoft-graph';
import { extraerDatosFactura } from '@/lib/finanzas/ocr-facturas';
import { esTelefonicaMoviles, parsearFacturaTelefonicaMoviles, vincularLineasConClientes } from '@/lib/finanzas/parsers/telefonica-moviles';

/**
 * POST /api/admin/finanzas/facturas/[id]/ocr
 * Reintentar OCR para una factura individual
 * 
 * Flujo:
 * 1. Detecta si es un proveedor con parser específico (Telefónica Móviles, etc.)
 * 2. Si sí → usa parser directo (pdftotext + regex) → más rápido y preciso
 * 3. Si no → usa GPT-4o con el PDF directo
 * 
 * Compatible con Vercel serverless (sin dependencias nativas como poppler)
 */
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Obtener la factura
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id },
    });

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    if (!factura.oneDriveItemId) {
      return NextResponse.json({ error: 'Esta factura no tiene archivo en OneDrive' }, { status: 400 });
    }

    // Descargar el archivo de OneDrive
    const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID;
    if (!DRIVE_ID) {
      return NextResponse.json({ error: 'SHAREPOINT_DRIVE_ID no configurado' }, { status: 500 });
    }

    await getAccessToken();
    const fileBuffer = await downloadFile(DRIVE_ID, factura.oneDriveItemId);
    const fileName = factura.archivoOneDrive || '';

    // ═══════════════════════════════════════════════════════════════
    // DETECCIÓN DE PARSER ESPECÍFICO POR PROVEEDOR
    // ═══════════════════════════════════════════════════════════════
    
    if (esTelefonicaMoviles(fileName, factura.proveedor)) {
      return await procesarConParserTelefonica(id, factura, fileBuffer);
    }

    // ═══════════════════════════════════════════════════════════════
    // FLUJO ESTÁNDAR: GPT-4o
    // ═══════════════════════════════════════════════════════════════
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    let fileBase64: string;
    let mimeType: string;

    if (ext === 'pdf') {
      fileBase64 = fileBuffer.toString('base64');
      mimeType = 'application/pdf';
    } else if (ext === 'png') {
      fileBase64 = fileBuffer.toString('base64');
      mimeType = 'image/png';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      fileBase64 = fileBuffer.toString('base64');
      mimeType = 'image/jpeg';
    } else {
      fileBase64 = fileBuffer.toString('base64');
      mimeType = 'application/pdf';
    }

    // Ejecutar OCR con GPT-4o
    console.log(`[OCR] Procesando factura ${id} con GPT-4o, archivo: ${fileName}, tamaño: ${fileBuffer.length} bytes`);
    const datos = await extraerDatosFactura(fileBase64, mimeType, fileName);

    // Si el OCR devolvió datos del fallback (confianza <= 0.2 y total = 0),
    // significa que GPT-4o falló. Devolver error parcial para diagnóstico.
    const ocrFallido = datos.confianza <= 0.2 && datos.total === 0;
    if (ocrFallido) {
      console.warn(`[OCR] Factura ${id}: OCR falló (confianza ${datos.confianza}, total 0). Proveedor detectado: ${datos.proveedor}`);
    }

    // Buscar coincidencias de clientes en las líneas de detalle
    let lineasConClientes = datos.lineas || [];
    if (lineasConClientes.length > 0) {
      lineasConClientes = await enriquecerLineasConClientes(lineasConClientes);
    }

    // Actualizar la factura en BD
    await prisma.facturaRecibida.update({
      where: { id },
      data: {
        proveedor: datos.proveedor !== 'DESCONOCIDO' ? datos.proveedor : factura.proveedor,
        cif: datos.cif || factura.cif,
        domicilioProveedor: datos.domicilioProveedor || (factura as any).domicilioProveedor || null,
        numFactura: datos.numFactura || factura.numFactura,
        fecha: datos.fecha ? new Date(datos.fecha) : factura.fecha,
        base: datos.base || 0,
        tipoIva: datos.tipoIva ?? 21,
        importeIva: datos.importeIva || 0,
        tipoIrpf: datos.tipoIrpf || 0,
        importeIrpf: datos.importeIrpf || 0,
        total: datos.total || 0,
        concepto: datos.concepto || factura.concepto,
        ocrCompletado: datos.confianza > 0.3,
        ocrConfianza: datos.confianza,
        datosOcrRaw: JSON.stringify(datos),
        lineasDetalle: lineasConClientes.length > 0 ? JSON.stringify(lineasConClientes) : null,
        esInternacional: datos.esInternacional || false,
        paisOrigen: datos.paisOrigen || null,
        telefonoServicio: (datos as any).telefonoServicio || null,
      },
    });

    return NextResponse.json({
      success: !ocrFallido,
      parser: 'gpt4o',
      ocrFallido,
      datos: {
        proveedor: datos.proveedor,
        cif: datos.cif,
        domicilioProveedor: datos.domicilioProveedor,
        numFactura: datos.numFactura,
        fecha: datos.fecha,
        base: datos.base,
        tipoIva: datos.tipoIva,
        importeIva: datos.importeIva,
        total: datos.total,
        confianza: datos.confianza,
        esInternacional: datos.esInternacional,
        paisOrigen: datos.paisOrigen,
        numLineas: lineasConClientes.length,
        lineas: lineasConClientes,
      },
    });
  } catch (error: any) {
    console.error('Error reintentando OCR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Procesa una factura de Telefónica Móviles con el parser específico
 */
async function procesarConParserTelefonica(
  facturaId: string,
  factura: any,
  fileBuffer: Buffer
) {
  try {
    // Parsear con el parser específico (pdftotext + regex)
    const resultado = await parsearFacturaTelefonicaMoviles(fileBuffer);
    
    // Vincular líneas con clientes usando la tabla de contratos
    const lineasVinculadas = await vincularLineasConClientes(resultado.lineas);
    
    // Convertir a formato compatible con la UI de líneas de detalle
    const lineasDetalle = lineasVinculadas.map(linea => ({
      descripcion: linea.concepto,
      cantidad: 1,
      precioUnitario: linea.total,
      iva: 0, // El IVA se aplica al total, no por línea
      importe: linea.total,
      importeNeto: linea.total,
      descuento: 0,
      cliente: linea.clienteNombre || null,
      clienteId: linea.clienteId ? parseInt(linea.clienteId) || null : null,
      clienteMatch: !!linea.clienteNombre,
      clienteNombreBd: linea.clienteNombre || null,
      contratoId: linea.contratoId || null,
      telefono: linea.telefono,
      extension: linea.extension,
    }));
    
    // Estadísticas de vinculación
    const lineasConCliente = lineasDetalle.filter(l => l.clienteMatch).length;
    const lineasSinCliente = lineasDetalle.filter(l => !l.clienteMatch).length;
    
    // Actualizar la factura en BD
    await prisma.facturaRecibida.update({
      where: { id: facturaId },
      data: {
        proveedor: resultado.proveedor,
        cif: resultado.cif,
        domicilioProveedor: resultado.domicilioProveedor,
        numFactura: resultado.numeroFactura || factura.numFactura,
        fecha: resultado.fecha ? new Date(resultado.fecha) : factura.fecha,
        base: resultado.baseImponible,
        tipoIva: 21,
        importeIva: resultado.iva,
        tipoIrpf: 0,
        importeIrpf: 0,
        total: resultado.total,
        concepto: `${resultado.tipoContrato} - ${resultado.numExtensiones} extensiones`,
        ocrCompletado: true,
        ocrConfianza: resultado.confianza,
        datosOcrRaw: JSON.stringify({
          ...resultado,
          parser: 'telefonica-moviles',
          lineasConCliente,
          lineasSinCliente,
        }),
        lineasDetalle: JSON.stringify(lineasDetalle),
        esInternacional: false,
        paisOrigen: 'ES',
      },
    });
    
    return NextResponse.json({
      success: true,
      parser: 'telefonica-moviles',
      datos: {
        proveedor: resultado.proveedor,
        cif: resultado.cif,
        domicilioProveedor: resultado.domicilioProveedor,
        numFactura: resultado.numeroFactura,
        fecha: resultado.fecha,
        base: resultado.baseImponible,
        tipoIva: 21,
        importeIva: resultado.iva,
        total: resultado.total,
        confianza: resultado.confianza,
        esInternacional: false,
        paisOrigen: 'ES',
        numLineas: lineasDetalle.length,
        lineasConCliente,
        lineasSinCliente,
        descuadre: resultado.descuadre,
      },
    });
  } catch (error: any) {
    console.error('Error en parser Telefónica Móviles:', error);
    // Si el parser específico falla, intentar con GPT-4o como fallback
    return NextResponse.json({ 
      error: `Parser Telefónica falló: ${error.message}. Intente con OCR estándar.`,
      fallback: true 
    }, { status: 500 });
  }
}

/**
 * Enriquece las líneas de detalle buscando coincidencias con clientes en la BD
 */
async function enriquecerLineasConClientes(lineas: any[]): Promise<any[]> {
  const clientes = await prisma.clienteWeb.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, nombreComercial: true, codigo: true },
    take: 2000,
  });

  return lineas.map(linea => {
    if (linea.cliente) {
      const clienteNorm = (linea.cliente || '').toLowerCase().trim();
      
      const clienteMatch = clientes.find(c => {
        const nombreBd = c.nombre.toLowerCase().trim();
        const comercialBd = (c.nombreComercial || '').toLowerCase().trim();
        
        return (
          nombreBd === clienteNorm ||
          comercialBd === clienteNorm ||
          nombreBd.includes(clienteNorm) ||
          clienteNorm.includes(nombreBd) ||
          (comercialBd && (
            comercialBd.includes(clienteNorm) ||
            clienteNorm.includes(comercialBd)
          ))
        );
      });

      if (clienteMatch) {
        return {
          ...linea,
          clienteId: clienteMatch.id,
          clienteNombreBd: clienteMatch.nombre,
          clienteMatch: true,
        };
      }
    }
    return { ...linea, clienteMatch: false };
  });
}
