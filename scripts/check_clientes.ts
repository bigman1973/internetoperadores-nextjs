import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clientes = await prisma.clienteWeb.findMany({
    where: {
      OR: [
        { nombre: { contains: 'European Brakes', mode: 'insensitive' } },
        { nombre: { contains: 'Draxton Brno', mode: 'insensitive' } },
      ]
    },
    select: { id: true, nombre: true, cif: true, nif: true, activo: true, codigo: true }
  });
  console.log('Clientes encontrados:', JSON.stringify(clientes, null, 2));
  
  // También verificar las empresas del grupo que se han creado
  const empresas = await prisma.empresaGrupoDraxton.findMany({
    select: { id: true, nombre: true, cif: true, clienteWebId: true, activa: true }
  });
  console.log('\nEmpresas del grupo:', JSON.stringify(empresas, null, 2));
}

main().then(() => prisma.$disconnect());
