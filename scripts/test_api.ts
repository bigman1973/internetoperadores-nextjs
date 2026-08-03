import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Test with David Pérez's ID
  const emp = await prisma.empleado.findUnique({
    where: { id: 'cfcf5cde-3399-4adf-a940-633e91ff91ab' },
    select: { id: true, nombreCompleto: true }
  });
  console.log("Found:", emp);
  await prisma.$disconnect();
}
main();
