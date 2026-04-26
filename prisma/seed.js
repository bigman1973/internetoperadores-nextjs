const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos (JS)...');

  // 1. Crear usuario admin por defecto
  const adminPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.usuarioAdmin.upsert({
    where: { email: 'david.perez@internetoperadores.com' },
    update: {
      passwordHash: adminPassword,
    },
    create: {
      email: 'david.perez@internetoperadores.com',
      passwordHash: adminPassword,
      nombre: 'David Pérez',
      rol: 'SUPER_ADMIN',
      activo: true,
    },
  });

  console.log('✅ Usuario admin procesado:', admin.email);

  // 2. Crear categorías por defecto
  const categorias = [
    { nombre: 'FIBRA', tipoCliente: 'AMBOS', descripcion: 'Conexión de fibra óptica', icono: 'fiber', orden: 1 },
    { nombre: 'WIMAX', tipoCliente: 'AMBOS', descripcion: 'Conexión inalámbrica WIMAX', icono: 'wifi', orden: 2 },
    { nombre: '4G', tipoCliente: 'AMBOS', descripcion: 'Conexión 4G/LTE', icono: 'signal', orden: 3 },
    { nombre: 'SATÉLITE', tipoCliente: 'AMBOS', descripcion: 'Conexión por satélite', icono: 'satellite', orden: 4 },
    { nombre: 'MÓVIL', tipoCliente: 'PARTICULAR', descripcion: 'Líneas móviles', icono: 'phone', orden: 5 },
    { nombre: 'PACKS', tipoCliente: 'AMBOS', descripcion: 'Paquetes combinados', icono: 'package', orden: 6 },
  ];

  for (const cat of categorias) {
    const existingCat = await prisma.categoria.findFirst({
      where: { nombre: cat.nombre }
    });

    if (existingCat) {
      await prisma.categoria.update({
        where: { id: existingCat.id },
        data: cat
      });
    } else {
      await prisma.categoria.create({
        data: cat
      });
    }
  }

  console.log('✅ Categorías procesadas');

  // 3. Crear cliente de ejemplo
  const clientePassword = await bcrypt.hash('cliente123', 10);
  
  const existingCliente = await prisma.clienteWeb.findFirst({
    where: { email: 'juan.perez@email.com' },
  });
  
  let cliente;
  if (existingCliente) {
    cliente = await prisma.clienteWeb.update({
      where: { id: existingCliente.id },
      data: { passwordHash: clientePassword },
    });
  } else {
    cliente = await prisma.clienteWeb.create({
      data: {
        email: 'juan.perez@email.com',
        passwordHash: clientePassword,
        nombre: 'Juan Pérez',
        ispGestionId: 'CLIENTE_001',
        newsletterSuscrito: true,
      },
    });
  }

  console.log('✅ Cliente de ejemplo procesado:', cliente.email);

  console.log('🎉 Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
