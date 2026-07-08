import request from './lib/ispgestion/service'

async function main() {
  // Buscar un cliente que tenga día de cobro diferente al 1
  // Primero veamos los campos de efectos/forma de pago
  console.log('=== GET clientes con más detalle ===')
  try {
    const data = await request('clientes', 'GET', null, { mostrar: 5 })
    if (Array.isArray(data) && data.length > 0) {
      // Mostrar todos los campos que contengan "efecto", "forma", "pago", "dia"
      const campos = Object.keys(data[0])
      const relevantes = campos.filter(c => 
        c.includes('efecto') || c.includes('forma') || c.includes('pago') || 
        c.includes('dia') || c.includes('fecha') || c.includes('periodo') ||
        c.includes('factur')
      )
      console.log('Campos de pago/facturación:')
      for (const c of relevantes) {
        const valores = data.map((d: any) => d[c]).filter((v: any) => v != null)
        console.log(`  ${c}: ${valores.length > 0 ? valores.join(', ') : '(todos null)'}`)
      }
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`)
  }

  // Ver qué tiene la BD local en contratos
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  
  // Buscar contratos con día de cobro o vencimiento
  console.log('\n=== Contratos locales con info de cobro ===')
  const contratos = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT concepto_facturacion, fecha_inicio 
    FROM contratos_servicio 
    WHERE activo = true 
    LIMIT 10
  `) as any[]
  for (const c of contratos) {
    console.log(`  ${c.concepto_facturacion} | inicio: ${c.fecha_inicio}`)
  }

  // Ver schema de contratos
  console.log('\n=== Columnas tabla contratos_servicio ===')
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'contratos_servicio' 
    ORDER BY ordinal_position
  `) as any[]
  console.log(cols.map((c: any) => c.column_name).join(', '))
}
main().then(() => process.exit(0))
