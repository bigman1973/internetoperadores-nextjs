import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const emps = await prisma.empleado.findMany({
    select: { nombreCompleto: true, nif: true, estado: true },
    orderBy: { nombreCompleto: 'asc' }
  });
  emps.forEach(e => console.log(`${e.estado.padEnd(8)} ${e.nif.padEnd(12)} ${e.nombreCompleto}`));
  await prisma.$disconnect();
}
main();
