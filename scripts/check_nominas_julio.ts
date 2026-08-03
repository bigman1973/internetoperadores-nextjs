import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const nominas = await prisma.nomina.findMany({
    where: { mes: 7, anio: 2026 },
    include: { empleado: { select: { nombreCompleto: true } } },
    orderBy: { empleado: { nombreCompleto: 'asc' } }
  });
  nominas.forEach(n => console.log(`${n.empleado.nombreCompleto.padEnd(35)} Dev:${n.devengadoTotal.toFixed(2).padStart(10)} Neto:${n.netoPercibir.toFixed(2).padStart(10)} Archivo:${n.archivoNombre || '-'} URL:${n.archivoUrl || '-'}`));
  console.log(`\nTotal: ${nominas.length} nóminas`);
  await prisma.$disconnect();
}
main();
