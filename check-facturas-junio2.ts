import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Las facturas no tienen fechaVencimiento ni remesaRef rellenados
  // Vamos a ver si ISPGestión tiene el desglose de recibos por remesa
  // Probemos la API directamente
  
  // Primero veamos qué campos devuelve la API de remesas
  const { request } = await import('./lib/ispgestion/api')
  
  // Obtener detalle de la remesa 82 (JUNIO LLEIDA)
  console.log('=== Detalle remesa 82 (JUNIO LLEIDA) ===')
  try {
    const detalle = await request('remesas/82', 'GET')
    console.log(JSON.stringify(detalle, null, 2).substring(0, 2000))
  } catch (e: any) {
    console.log('Error:', e.message)
  }
}
main().then(() => process.exit(0))
