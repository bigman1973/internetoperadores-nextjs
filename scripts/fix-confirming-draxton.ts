/**
 * Script para reprocesar las 3 facturas de Confirming Draxton
 * que tienen total=0 y proveedor=DESCONOCIDO.
 * 
 * Aplica la nueva lógica de post-procesamiento sobre el datosOcrRaw existente
 * (sin re-llamar a GPT-4o).
 * 
 * Uso: npx tsx scripts/fix-confirming-draxton.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FACTURA_IDS = [
  '3691d96a-8559-4e77-b6b2-f891043b4b08',
  '715b9454-f325-4334-978f-06e9e9b2b304',
  '7e0d8404-3bc8-4e4f-9cd0-783ce1326725',
];

async function main() {
  console.log('=== Reprocesando facturas Confirming Draxton ===\n');

  for (const id of FACTURA_IDS) {
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id },
      select: {
        id: true,
        proveedor: true,
        total: true,
        base: true,
        datosOcrRaw: true,
        lineasDetalle: true,
          archivoOneDrive: true,
      },
    });

    if (!factura) {
      console.log(`❌ Factura ${id} no encontrada`);
      continue;
    }

    console.log(`📄 Factura: ${factura.archivoOneDrive}`);
    console.log(`   Proveedor actual: ${factura.proveedor}`);
    console.log(`   Total actual: ${factura.total}`);
    console.log(`   Base actual: ${factura.base}`);

    // Parsear datosOcrRaw
    let datos: any;
    try {
      datos = factura.datosOcrRaw ? JSON.parse(factura.datosOcrRaw as string) : null;
    } catch (e) {
      console.log(`   ❌ Error parseando datosOcrRaw: ${e}`);
      continue;
    }

    if (!datos) {
      console.log(`   ❌ No hay datosOcrRaw`);
      continue;
    }

    const lineas = datos.lineas || [];
    console.log(`   Líneas OCR: ${lineas.length}`);

    if (lineas.length === 0) {
      console.log(`   ⚠️ No hay líneas para procesar`);
      continue;
    }

    // Mostrar líneas existentes
    for (const l of lineas) {
      console.log(`     - ${l.descripcion?.substring(0, 50)} | cliente: ${l.cliente} | importeNeto: ${l.importeNeto} | importe: ${l.importe}`);
    }

    // POST-PROCESAMIENTO 1: Si total=0 y base=0 pero hay líneas con importes → sumar líneas
    let nuevoTotal = factura.total ? Number(factura.total) : 0;
    let nuevaBase = factura.base ? Number(factura.base) : 0;
    let nuevoTipoIva = datos.tipoIva;
    let nuevoImporteIva = datos.importeIva;

    if (nuevoTotal === 0 && nuevaBase === 0 && lineas.length > 0) {
      const sumaLineas = lineas.reduce((sum: number, l: any) => sum + (l.importeNeto || l.importe || 0), 0);
      if (sumaLineas > 0) {
        nuevaBase = Math.round(sumaLineas * 100) / 100;
        nuevoTotal = nuevaBase; // Confirming no tiene IVA
        nuevoTipoIva = 0;
        nuevoImporteIva = 0;
        console.log(`   ✅ Total calculado de líneas: ${nuevoTotal}€`);
      }
    }

    // POST-PROCESAMIENTO 2: Si proveedor es DESCONOCIDO → usar cliente de líneas
    let nuevoProveedor = factura.proveedor;
    if (nuevoProveedor === 'DESCONOCIDO' && lineas.length > 0) {
      const clienteLinea = lineas.find((l: any) => l.cliente && l.cliente !== 'null')?.cliente;
      if (clienteLinea) {
        nuevoProveedor = clienteLinea;
        console.log(`   ✅ Proveedor detectado de líneas: ${nuevoProveedor}`);
      }
    }

    // Actualizar datosOcrRaw con los nuevos valores
    datos.total = nuevoTotal;
    datos.base = nuevaBase;
    datos.tipoIva = nuevoTipoIva;
    datos.importeIva = nuevoImporteIva;
    datos.proveedor = nuevoProveedor;

    // Actualizar en BD
    await prisma.facturaRecibida.update({
      where: { id },
      data: {
        proveedor: nuevoProveedor,
        total: nuevoTotal,
        base: nuevaBase,
        tipoIva: nuevoTipoIva,
        importeIva: nuevoImporteIva,
        datosOcrRaw: JSON.stringify(datos),
        ocrCompletado: true,
        ocrConfianza: 0.7, // Confianza media: datos extraídos pero de documento no-factura
      },
    });

    console.log(`   ✅ Actualizado: proveedor=${nuevoProveedor}, total=${nuevoTotal}€, base=${nuevaBase}€\n`);
  }

  console.log('=== Proceso completado ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
