import request from './lib/ispgestion/service'

async function main() {
  // Los contratos tienen día de cobro - vamos a ver
  console.log('=== GET contratos (primeros 3) ===')
  try {
    const data = await request('contratos', 'GET', null, { mostrar: 3 })
    if (Array.isArray(data) && data.length > 0) {
      console.log('Campos:', Object.keys(data[0]).join(', '))
      console.log('\nPrimer contrato:')
      console.log(JSON.stringify(data[0], null, 2).substring(0, 1000))
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`)
  }

  // Probar endpoint de clientes para ver si tienen día de cobro
  console.log('\n=== GET clientes (primero) ===')
  try {
    const data = await request('clientes', 'GET', null, { mostrar: 1 })
    if (Array.isArray(data) && data.length > 0) {
      console.log('Campos:', Object.keys(data[0]).join(', '))
      // Buscar campos de vencimiento/cobro
      const campos = Object.keys(data[0])
      const relevantes = campos.filter(c => 
        c.includes('venc') || c.includes('cobro') || c.includes('dia') || 
        c.includes('remesa') || c.includes('banco') || c.includes('iban')
      )
      console.log('Campos relevantes:', relevantes.join(', '))
      for (const c of relevantes) {
        console.log(`  ${c}: ${data[0][c]}`)
      }
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`)
  }
}
main().then(() => process.exit(0))
