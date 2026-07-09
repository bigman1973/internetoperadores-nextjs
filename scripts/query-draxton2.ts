const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const facturas = await prisma.factura.findMany({
    where: { codigoCliente: { in: ['006003', '006004', '006006', '006001'] } },
    select: { nombreCompleto: true, fecha: true, base: true, total: true, situacion: true, serieFactura: true, numeroDocumento: true },
    orderBy: [{ nombreCompleto: 'asc' }, { fecha: 'desc' }]
  });
  
  const porSociedad: Record<string, any[]> = {};
  for (const f of facturas) {
    const key = f.nombreCompleto;
    if (porSociedad[key] === undefined) {
      porSociedad[key] = [];
    }
    porSociedad[key].push(f);
  }
  
  for (const [nombre, facts] of Object.entries(porSociedad)) {
    const total = (facts as any[]).reduce((s: number, f: any) => s + Number(f.base), 0);
    console.log(`\n${nombre}: ${(facts as any[]).length} facturas | Total base: ${total.toFixed(2)}€`);
    for (const f of (facts as any[]).slice(0, 5)) {
      console.log(`  ${f.serieFactura}/${f.numeroDocumento} | ${f.fecha.toISOString().substring(0,10)} | Base: ${Number(f.base).toFixed(2)}€ | ${f.situacion}`);
    }
  }
  
  // Estado de cobro
  const cobradas = facturas.filter((f: any) => f.situacion === 'COBRADA');
  const pendientes = facturas.filter((f: any) => f.situacion !== 'COBRADA');
  const totalCobrado = cobradas.reduce((s: number, f: any) => s + Number(f.total), 0);
  const totalPendiente = pendientes.reduce((s: number, f: any) => s + Number(f.total), 0);
  console.log(`\n--- RESUMEN COBROS ---`);
  console.log(`Cobradas: ${cobradas.length} facturas | ${totalCobrado.toFixed(2)}€`);
  console.log(`Pendientes: ${pendientes.length} facturas | ${totalPendiente.toFixed(2)}€`);
}

main().then(() => prisma.$disconnect());
