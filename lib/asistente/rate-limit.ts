import crypto from 'node:crypto'
import prisma from '@/lib/prisma'

function secreto(): string { return process.env.ASSISTANT_HASH_SECRET || process.env.NEXTAUTH_SECRET || '' }
export function hmacAsistente(valor: string): string {
  const clave = secreto()
  if (!clave) return 'sin-secreto:' + crypto.createHash('sha256').update(valor).digest('hex')
  return crypto.createHmac('sha256', clave).update(valor).digest('hex')
}

function limite(): number {
  const numero = Number(process.env.ASSISTANT_PUBLIC_RATE_LIMIT_PER_10M)
  return Number.isInteger(numero) && numero >= 1 && numero <= 500 ? numero : 20
}

export async function consumirRateLimit(clave: string, ahora = new Date(), maximo?: number): Promise<{ permitido: boolean; restante: number }> {
  const ventana = new Date(Math.floor(ahora.getTime() / 600000) * 600000)
  const hash = hmacAsistente(clave)
  const tope = Number.isInteger(maximo) && Number(maximo) >= 1 && Number(maximo) <= 500 ? Number(maximo) : limite()
  try {
    const filas = await prisma.$queryRaw<Array<{ contador: number }>>`
      INSERT INTO asistente_rate_limit (clave_hash, ventana, contador)
      VALUES (${hash}, ${ventana}, 1)
      ON CONFLICT (clave_hash, ventana)
      DO UPDATE SET contador = asistente_rate_limit.contador + 1
      RETURNING contador
    `
    const contador = Number(filas[0]?.contador || tope + 1)
    return { permitido: contador <= tope, restante: Math.max(0, tope - contador) }
  } catch {
    return { permitido: false, restante: 0 }
  }
}
