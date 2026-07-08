import { getAllRemesas } from './lib/ispgestion/service'

async function main() {
  try {
    const remesas = await getAllRemesas()
    console.log(`Total remesas en ISPGestión: ${remesas.length}`)
    
    // Filtrar las de junio 2026
    const junio = remesas.filter((r: any) => {
      const fecha = r.fecha || r.date || ''
      return fecha.includes('2026-06') || fecha.includes('06/2026')
    })
    
    console.log(`\nRemesas de junio 2026: ${junio.length}`)
    for (const r of junio) {
      console.log(`ID: ${r.id} | ${r.nombre} | ${r.fecha} | ${r.numero_registros} rec | ${r.total_importe}€`)
    }
    
    if (junio.length === 0) {
      console.log('\nTodas las remesas de 2026:')
      for (const r of remesas) {
        const fecha = r.fecha || ''
        if (fecha.includes('2026')) {
          console.log(`ID: ${r.id} | ${r.nombre} | ${r.fecha} | ${r.numero_registros} rec | ${r.total_importe}€`)
        }
      }
    }
  } catch (e: any) {
    console.error('Error:', e.message)
  }
}
main()
