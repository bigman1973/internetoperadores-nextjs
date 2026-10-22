import { PrismaClient } from '@prisma/client'

// La copia de Finanzas nunca debe reconectar a producción por un override ausente.
if (process.env.FINANCE_STAGING_SANDBOX === '1') {
  let isolated = false
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    isolated = url.pathname === '/io_staging_finanzas' && url.username === 'io_staging_finanzas'
  } catch { /* fail closed, sin imprimir credenciales */ }
  if (!isolated) throw new Error('Staging Finanzas bloqueado: conexión no aislada')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
