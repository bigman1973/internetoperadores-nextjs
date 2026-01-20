import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Crear usuario admin
  const passwordHash = await bcrypt.hash('admin123', 10)
  
  const admin = await prisma.usuarioAdmin.upsert({
    where: { email: 'david.perez@internetoperadores.com' },
    update: {},
    create: {
      email: 'david.perez@internetoperadores.com',
      passwordHash,
      nombre: 'David Pérez',
      rol: 'SUPER_ADMIN',
      activo: true,
    },
  })

  console.log('✅ Usuario admin creado:', admin.email)

  // Crear categorías
  const categorias = [
    { nombre: 'Fibra', tipoCliente: 'PARTICULAR' },
    { nombre: '5G', tipoCliente: 'PARTICULAR' },
    { nombre: 'Satélite', tipoCliente: 'PARTICULAR' },
    { nombre: 'WIMAX', tipoCliente: 'PARTICULAR' },
    { nombre: 'Fibra Empresas', tipoCliente: 'EMPRESA' },
    { nombre: 'Conectividad Empresarial', tipoCliente: 'EMPRESA' },
  ]

  for (const cat of categorias) {
    await prisma.categoria.upsert({
      where: { id: categorias.indexOf(cat) + 1 },
      update: {},
      create: {
        ...cat,
        orden: categorias.indexOf(cat),
        activa: true,
      },
    })
  }

  console.log(`✅ ${categorias.length} categorías creadas`)

  console.log('🎉 Seed completado!')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
