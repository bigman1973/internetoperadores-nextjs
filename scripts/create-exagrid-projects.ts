import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Añadir columna proveedor a la tabla
  await prisma.$executeRawUnsafe('ALTER TABLE exagrid_proyectos ADD COLUMN IF NOT EXISTS proveedor TEXT DEFAULT NULL');
  console.log('Columna proveedor añadida');

  // Obtener facturas V-Valley y Arrow
  const facturas = await prisma.facturaEmitida.findMany({
    where: {
      OR: [
        { cliente: { contains: 'valley', mode: 'insensitive' } },
        { cliente: { contains: 'arrow', mode: 'insensitive' } },
      ]
    },
    select: { id: true, numFactura: true, base: true, concepto: true }
  });

  console.log(`Encontradas ${facturas.length} facturas Exagrid`);

  for (const f of facturas) {
    const coste = Math.round(Number(f.base) * 0.92 * 100) / 100;
    
    // Verificar si ya existe
    const existing = await prisma.exagridProyecto.findUnique({ where: { facturaId: f.id } });
    if (existing) {
      console.log(`Ya existe proyecto para ${f.numFactura}`);
      continue;
    }

    await prisma.exagridProyecto.create({
      data: {
        facturaId: f.id,
        nombreProyecto: `Proyecto Exagrid - ${f.numFactura}`,
        descripcion: 'Venta Exagrid via distribuidor',
        costeProveedor: coste,
        otrosCostes: 0,
        estadoCobro: 'pendiente',
        estadoPago: 'pendiente',
      }
    });
    console.log(`Creado: ${f.numFactura} - Base: ${Number(f.base)} - Coste (92%): ${coste} - Margen: ${(Number(f.base) - coste).toFixed(2)}`);
  }

  // Actualizar proveedor en todos
  await prisma.$executeRawUnsafe("UPDATE exagrid_proyectos SET proveedor = 'Consultoria Exagrid' WHERE proveedor IS NULL");
  console.log('Proveedor "Consultoria Exagrid" asignado a todos los proyectos');

  await prisma.$disconnect();
}

main().catch(console.error);
