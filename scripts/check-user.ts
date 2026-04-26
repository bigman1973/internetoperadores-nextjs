import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const user = await prisma.clienteWeb.findFirst({ where: { email: 'juan.perez@email.com' } })
  console.log('USER_FOUND:', JSON.stringify(user, null, 2))
}
main().finally(() => prisma.$disconnect())
