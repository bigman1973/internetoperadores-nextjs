import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Comprobando usuario cliente...')
  
  const email = 'juan.perez@email.com'
  const password = 'cliente123'
  
  const existingClient = await prisma.clienteWeb.findUnique({
    where: { email }
  })

  if (existingClient) {
    console.log('✅ El cliente ya existe. Actualizando contraseña para asegurar acceso...')
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.clienteWeb.update({
      where: { email },
      data: { passwordHash }
    })
    console.log('✅ Contraseña actualizada.')
  } else {
    console.log('❌ El cliente no existe. Creándolo...')
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.clienteWeb.create({
      data: {
        email,
        passwordHash,
        nombre: 'Juan Pérez',
        ispGestionId: 'CLIENTE_TEST_001',
        newsletterSuscrito: true
      }
    })
    console.log('✅ Cliente creado exitosamente.')
  }
}

main()
  .catch((e) => {
    console.error('❌ Error en el script:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
