import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...')

  // 1. Crear usuario admin por defecto
  const adminPassword = await bcrypt.hash('admin123', 10)
  
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
  })

  console.log('✅ Usuario admin procesado:', admin.email)

  // 2. Crear categorías por defecto (Usando nombre como identificador lógico)
  const categorias = [
    { nombre: 'FIBRA', tipoCliente: 'AMBOS', descripcion: 'Conexión de fibra óptica', icono: 'fiber', orden: 1 },
    { nombre: 'WIMAX', tipoCliente: 'AMBOS', descripcion: 'Conexión inalámbrica WIMAX', icono: 'wifi', orden: 2 },
    { nombre: '4G', tipoCliente: 'AMBOS', descripcion: 'Conexión 4G/LTE', icono: 'signal', orden: 3 },
    { nombre: 'SATÉLITE', tipoCliente: 'AMBOS', descripcion: 'Conexión por satélite', icono: 'satellite', orden: 4 },
    { nombre: 'MÓVIL', tipoCliente: 'PARTICULAR', descripcion: 'Líneas móviles', icono: 'phone', orden: 5 },
    { nombre: 'PACKS', tipoCliente: 'AMBOS', descripcion: 'Paquetes combinados', icono: 'package', orden: 6 },
  ]

  for (const cat of categorias) {
    // Buscamos por nombre para evitar conflictos de ID
    const existingCat = await prisma.categoria.findFirst({
      where: { nombre: cat.nombre }
    })

    if (existingCat) {
      await prisma.categoria.update({
        where: { id: existingCat.id },
        data: cat as any
      })
    } else {
      await prisma.categoria.create({
        data: cat as any
      })
    }
  }

  console.log('✅ Categorías procesadas')

  // 3. Crear algunas tarifas de ejemplo
  const tarifasEjemplo = [
    {
      tipoCliente: 'PARTICULAR',
      categoria: 'FIBRA',
      nombre: 'Fibra 600',
      descripcionCorta: 'Fibra simétrica de alta velocidad',
      velocidad: '600/600 Mbps',
      precioSinIva: 29.99,
      precioConIva: 36.29,
      costeOperador: 22.50,
      permanencia: 'Sin permanencia',
      penalizacion: null,
      garantia: '99.9%',
      observaciones: 'Router incluido. Instalación gratuita.',
      destacada: true,
      activa: true,
      orden: 1,
      createdById: admin.id,
      updatedById: admin.id,
    },
    {
      tipoCliente: 'PARTICULAR',
      categoria: 'FIBRA',
      nombre: 'Fibra 300',
      descripcionCorta: 'Fibra simétrica económica',
      velocidad: '300/300 Mbps',
      precioSinIva: 24.99,
      precioConIva: 30.24,
      costeOperador: 18.50,
      permanencia: '12 meses',
      penalizacion: '50€',
      garantia: '99.9%',
      observaciones: 'Router incluido.',
      destacada: false,
      activa: true,
      orden: 2,
      createdById: admin.id,
      updatedById: admin.id,
    },
    {
      tipoCliente: 'EMPRESA',
      categoria: 'FIBRA',
      nombre: 'Fibra Empresa 1000',
      descripcionCorta: 'Fibra simétrica empresarial',
      velocidad: '1000/1000 Mbps',
      precioSinIva: 89.99,
      precioConIva: 108.89,
      costeOperador: 65.00,
      permanencia: '24 meses',
      penalizacion: '200€',
      garantia: '99.95%',
      observaciones: 'SLA empresarial. Soporte prioritario 24/7.',
      destacada: true,
      activa: true,
      orden: 1,
      createdById: admin.id,
      updatedById: admin.id,
    },
  ]

  for (const tarifa of tarifasEjemplo) {
    const existingTarifa = await prisma.tarifa.findFirst({
      where: { nombre: tarifa.nombre, tipoCliente: tarifa.tipoCliente as any }
    })

    if (existingTarifa) {
      await prisma.tarifa.update({
        where: { id: existingTarifa.id },
        data: tarifa as any
      })
    } else {
      await prisma.tarifa.create({
        data: tarifa as any
      })
    }
  }

  console.log('✅ Tarifas de ejemplo procesadas')

  // 4. Crear cliente de ejemplo
  const clientePassword = await bcrypt.hash('cliente123', 10)
  
  const existingCliente = await prisma.clienteWeb.findFirst({
    where: { email: 'juan.perez@email.com' },
  })
  
  let cliente
  if (existingCliente) {
    cliente = await prisma.clienteWeb.update({
      where: { id: existingCliente.id },
      data: { passwordHash: clientePassword },
    })
  } else {
    cliente = await prisma.clienteWeb.create({
      data: {
        email: 'juan.perez@email.com',
        passwordHash: clientePassword,
        nombre: 'Juan Pérez',
        ispGestionId: 'CLIENTE_001',
        newsletterSuscrito: true,
      },
    })
  }

  console.log('✅ Cliente de ejemplo procesado:', cliente.email)

  console.log('🎉 Seed completado exitosamente!')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
