import request from './lib/ispgestion/service'

async function main() {
  // Obtener detalle de la remesa 82 (JUNIO LLEIDA) para ver si tiene desglose de recibos
  console.log('=== Detalle remesa 82 (JUNIO LLEIDA) ===')
  try {
    const detalle = await request('remesas/82', 'GET')
    console.log(JSON.stringify(detalle, null, 2).substring(0, 3000))
  } catch (e: any) {
    console.log('Error:', e.message)
  }

  // Probar endpoint de recibos de una remesa
  console.log('\n=== Recibos de remesa 82 ===')
  try {
    const recibos = await request('remesas/82/recibos', 'GET')
    if (Array.isArray(recibos)) {
      console.log(`Total recibos: ${recibos.length}`)
      // Agrupar por fecha vencimiento
      const grupos: Record<string, { count: number; total: number }> = {}
      for (const r of recibos) {
        const venc = r.fecha_vencimiento || r.vencimiento || r.fecha || 'sin-fecha'
        if (!grupos[venc]) grupos[venc] = { count: 0, total: 0 }
        grupos[venc].count++
        grupos[venc].total += parseFloat(r.importe || r.total || 0)
      }
      console.log('\nAgrupado por vencimiento:')
      for (const [fecha, data] of Object.entries(grupos).sort()) {
        console.log(`  ${fecha}: ${data.count} recibos, ${data.total.toFixed(2)}€`)
      }
      // Mostrar primeros 5
      console.log('\nPrimeros 5 recibos:')
      for (const r of recibos.slice(0, 5)) {
        console.log(`  ${JSON.stringify(r).substring(0, 200)}`)
      }
    } else {
      console.log(JSON.stringify(recibos, null, 2).substring(0, 2000))
    }
  } catch (e: any) {
    console.log('Error recibos:', e.message)
  }
}
main().then(() => process.exit(0))
