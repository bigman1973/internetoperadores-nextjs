const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Buscar clientes Draxton en la BD
  const draxton = await prisma.factura.findMany({
    where: {
      OR: [
        { nombreCompleto: { contains: 'DRAXTON', mode: 'insensitive' } },
        { nombreCompleto: { contains: 'DRAX', mode: 'insensitive' } },
        { nombreCompleto: { contains: 'INFUN', mode: 'insensitive' } }
      ]
    },
    select: { nombreCompleto: true, codigoCliente: true, serieFactura: true },
    distinct: ['nombreCompleto']
  });
  console.log('Clientes Draxton encontrados:', JSON.stringify(draxton, null, 2));

  // Facturación por mes
  if (draxton.length > 0) {
    const codigos = draxton.map((d: any) => d.codigoCliente);
    const facturas = await prisma.factura.findMany({
      where: { codigoCliente: { in: codigos } },
      select: { 
        serieFactura: true, 
        numeroDocumento: true, 
        fecha: true, 
        nombreCompleto: true, 
        base: true, 
        total: true, 
        situacion: true,
        totalPendiente: true
      },
      orderBy: { fecha: 'desc' }
    });
    
    console.log(`\nTotal facturas Draxton: ${facturas.length}`);
    
    // Agrupar por mes
    const porMes: Record<string, { count: number, base: number, total: number, pendiente: number }> = {};
    for (const f of facturas) {
      const mes = f.fecha.toISOString().substring(0, 7); // YYYY-MM
      if (!porMes[mes]) porMes[mes] = { count: 0, base: 0, total: 0, pendiente: 0 };
      porMes[mes].count++;
      porMes[mes].base += Number(f.base);
      porMes[mes].total += Number(f.total);
      porMes[mes].pendiente += Number(f.totalPendiente);
    }
    
    console.log('\nFacturación por mes:');
    const meses = Object.keys(porMes).sort();
    for (const mes of meses) {
      const m = porMes[mes];
      console.log(`  ${mes}: ${m.count} facturas | Base: ${m.base.toFixed(2)}€ | Total: ${m.total.toFixed(2)}€ | Pendiente: ${m.pendiente.toFixed(2)}€`);
    }
    
    // Total
    const totalBase = Object.values(porMes).reduce((s, m) => s + m.base, 0);
    const totalTotal = Object.values(porMes).reduce((s, m) => s + m.total, 0);
    const totalPendiente = Object.values(porMes).reduce((s, m) => s + m.pendiente, 0);
    console.log(`\n  TOTAL: Base ${totalBase.toFixed(2)}€ | Total ${totalTotal.toFixed(2)}€ | Pendiente ${totalPendiente.toFixed(2)}€`);
  }
}

main().then(() => prisma.$disconnect());
