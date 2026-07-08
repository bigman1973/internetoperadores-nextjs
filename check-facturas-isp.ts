import request from './lib/ispgestion/service'
import { getAllFacturas } from './lib/ispgestion/service'

async function main() {
  // Usar la función que ya existe para obtener facturas
  console.log('=== Obteniendo facturas de ISPGestión ===')
  try {
    const facturas = await getAllFacturas()
    console.log(`Total facturas: ${facturas.length}`)
    
    // Filtrar junio 2026
    const junio = facturas.filter((f: any) => {
      const fecha = f.fecha || ''
      return fecha.startsWith('2026-06')
    })
    console.log(`Facturas junio 2026: ${junio.length}`)
    
    if (junio.length > 0) {
      // Ver campos disponibles
      console.log('\nCampos de primera factura:')
      console.log(Object.keys(junio[0]).join(', '))
      
      // Buscar campos de remesa/vencimiento
      const primera = junio[0]
      console.log('\nPrimera factura completa:')
      console.log(JSON.stringify(primera).substring(0, 800))
      
      // Ver si hay campo de vencimiento o remesa
      const conRemesa = junio.filter((f: any) => f.remesa || f.remesaid || f.remesa_id || f.id_remesa)
      console.log(`\nFacturas con campo remesa: ${conRemesa.length}`)
      
      // Agrupar por vencimiento si existe
      const conVenc = junio.filter((f: any) => f.fecha_vencimiento || f.vencimiento)
      console.log(`Facturas con vencimiento: ${conVenc.length}`)
      if (conVenc.length > 0) {
        console.log('Ejemplo:', JSON.stringify(conVenc[0]).substring(0, 300))
      }
    }
  } catch (e: any) {
    console.log('Error:', e.message)
  }
}
main().then(() => process.exit(0))
