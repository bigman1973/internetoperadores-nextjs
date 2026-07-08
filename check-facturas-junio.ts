import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Ver facturas emitidas de junio con remesaRef para entender el desglose
  const facturas = await prisma.facturaEmitida.findMany({
    where: {
      fecha: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30') },
      formaCobro: 'Remesa'
    },
    select: { 
      numFactura: true, 
      total: true, 
      fechaVencimiento: true, 
      remesaRef: true,
      imputacion: true
    },
    orderBy: { fechaVencimiento: 'asc' },
  })
  
  console.log(`Facturas junio con forma cobro Remesa: ${facturas.length}`)
  
  // Agrupar por fechaVencimiento
  const grupos: Record<string, { count: number; total: number; remesaRefs: Set<string> }> = {}
  for (const f of facturas) {
    const key = f.fechaVencimiento?.toISOString().split('T')[0] || 'sin-fecha'
    if (!grupos[key]) grupos[key] = { count: 0, total: 0, remesaRefs: new Set() }
    grupos[key].count++
    grupos[key].total += f.total
    if (f.remesaRef) grupos[key].remesaRefs.add(f.remesaRef)
  }
  
  console.log('\nDesglose por fecha vencimiento:')
  for (const [fecha, data] of Object.entries(grupos).sort()) {
    console.log(`  ${fecha}: ${data.count} facturas, ${data.total.toFixed(2)}€, refs: ${[...data.remesaRefs].join(', ') || 'ninguna'}`)
  }
  
  // Agrupar por imputacion + fechaVencimiento
  console.log('\nDesglose por imputación + fecha vencimiento:')
  const gruposImp: Record<string, { count: number; total: number }> = {}
  for (const f of facturas) {
    const key = `${f.imputacion || 'sin-imp'} | ${f.fechaVencimiento?.toISOString().split('T')[0] || 'sin-fecha'}`
    if (!gruposImp[key]) gruposImp[key] = { count: 0, total: 0 }
    gruposImp[key].count++
    gruposImp[key].total += f.total
  }
  for (const [key, data] of Object.entries(gruposImp).sort()) {
    console.log(`  ${key}: ${data.count} facturas, ${data.total.toFixed(2)}€`)
  }

  // Mostrar algunas facturas con remesaRef
  const conRef = facturas.filter(f => f.remesaRef)
  console.log(`\nFacturas con remesaRef: ${conRef.length}`)
  for (const f of conRef.slice(0, 10)) {
    console.log(`  ${f.numFactura} | ${f.total}€ | venc: ${f.fechaVencimiento?.toISOString().split('T')[0]} | ref: ${f.remesaRef} | ${f.imputacion}`)
  }
}
main().then(() => process.exit(0))
