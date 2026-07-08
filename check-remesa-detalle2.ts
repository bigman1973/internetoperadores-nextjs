import request from './lib/ispgestion/service'

async function main() {
  // Probar distintos endpoints para obtener recibos/desglose de una remesa
  const endpoints = [
    'remesas?id=82',
    'recibos?remesa_id=82',
    'recibos?remesaid=82',
    'facturas?remesa_id=82',
    'facturas?remesaid=82',
  ]

  for (const ep of endpoints) {
    console.log(`\n=== GET ${ep} ===`)
    try {
      const data = await request(ep, 'GET')
      if (Array.isArray(data)) {
        console.log(`Array de ${data.length} elementos`)
        if (data.length > 0) {
          console.log('Primer elemento:', JSON.stringify(data[0]).substring(0, 500))
        }
      } else if (data && typeof data === 'object') {
        console.log(JSON.stringify(data).substring(0, 500))
      }
    } catch (e: any) {
      console.log(`Error: ${e.message}`)
    }
  }

  // Probar obtener facturas de junio para ver si tienen campo remesa
  console.log('\n=== Facturas junio 2026 (primeras 5) ===')
  try {
    const facturas = await request('facturas', 'GET', null, { 
      fecha_desde: '2026-06-01',
      fecha_hasta: '2026-06-30',
      mostrar: 5
    })
    if (Array.isArray(facturas) && facturas.length > 0) {
      console.log(`Total: ${facturas.length}`)
      console.log('Primera factura:', JSON.stringify(facturas[0]).substring(0, 800))
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`)
  }
}
main().then(() => process.exit(0))
