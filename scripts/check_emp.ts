import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const emps = await prisma.empleado.findMany({
    where: { nombreCompleto: { contains: 'PEREZ', mode: 'insensitive' } },
    select: { id: true, nombreCompleto: true, nif: true }
  });
  console.log(JSON.stringify(emps, null, 2));
  await prisma.$disconnect();
}
main();
