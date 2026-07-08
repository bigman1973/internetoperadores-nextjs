import request from './lib/ispgestion/service'

async function main() {
  // Probar distintos endpoints para obtener recibos
  const endpoints = [
    'recibos',
    'recibos_remesa',
    'remesa_recibos',
    'domiciliaciones',
    'cobros',
  ]

  for (const ep of endpoints) {
    console.log(`\n=== GET ${ep}?mostrar=5 ===`)
    try {
      const data = await request(ep, 'GET', null, { mostrar: 5 })
      if (Array.isArray(data)) {
        console.log(`Array de ${data.length} elementos`)
        if (data.length > 0) {
          console.log('Campos:', Object.keys(data[0]).join(', '))
          console.log('Primer elemento:', JSON.stringify(data[0]).substring(0, 500))
        }
      } else if (data && typeof data === 'object') {
        console.log(JSON.stringify(data).substring(0, 500))
      }
    } catch (e: any) {
      console.log(`Error: ${e.message}`)
    }
  }

  // Probar obtener detalle de factura individual para ver si tiene vencimiento
  console.log('\n=== GET facturacion/52378 (detalle factura) ===')
  try {
    const data = await request('facturacion', 'GET', null, { id: 52378 })
    if (Array.isArray(data) && data.length > 0) {
      console.log('Campos:', Object.keys(data[0]).join(', '))
      console.log(JSON.stringify(data[0]).substring(0, 800))
    } else {
      console.log(JSON.stringify(data).substring(0, 500))
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`)
  }
}
main().then(() => process.exit(0))
