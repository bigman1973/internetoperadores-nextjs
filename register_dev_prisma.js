const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.desarrolloHistorial.create({
    data: {
      titulo: "Gestión documental y económica en Proyectos Singulares",
      descripcion: "Se ha ampliado el modelo de Proyectos Singulares para incluir importeVenta, costeProveedores, margenEstimado y documentosJson. Se ha actualizado la interfaz para permitir subir PDFs (presupuestos, pedidos, albaranes) y calcular márgenes automáticamente.",
      tipo: "feat",
      estado: "completado",
      autor: "Manus AI",
      commitHash: "855b1de",
      rama: "staging"
    }
  });
  console.log("Desarrollo registrado en DB");
}

main().catch(console.error).finally(() => prisma.$disconnect());
