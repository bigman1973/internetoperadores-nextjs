import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const facturaFiles: Record<string, string> = {
  'INST26/4': '/home/ubuntu/upload/000135_Factura-Ventas_INST26-4.pdf',
  'INST26/6': '/home/ubuntu/upload/000135_Factura-Ventas_INST26-6.pdf',
  'INST26/59': '/home/ubuntu/upload/000135_Factura-Ventas_INST26-59(2).pdf',
  'INST26/78': '/home/ubuntu/upload/000104_Factura-Ventas_INST26-78(1)(1).pdf',
  'INST26/104': '/home/ubuntu/upload/ARROW_Factura-Ventas_INST26-104.pdf',
};

async function main() {
  for (const [numFactura, filePath] of Object.entries(facturaFiles)) {
    const factura = await prisma.facturaEmitida.findFirst({ where: { numFactura } });
    if (!factura) {
      console.log(`Factura ${numFactura} no encontrada en BD`);
      continue;
    }

    const proyecto = await prisma.exagridProyecto.findUnique({ where: { facturaId: factura.id } });
    if (!proyecto) {
      console.log(`Proyecto para ${numFactura} no encontrado`);
      continue;
    }

    if (!fs.existsSync(filePath)) {
      console.log(`Archivo no encontrado: ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64}`;

    await prisma.exagridProyecto.update({
      where: { id: proyecto.id },
      data: { archivoFactura: dataUrl },
    });

    console.log(`Subida: ${numFactura} (${path.basename(filePath)}) - ${(buffer.length / 1024).toFixed(0)} KB`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
