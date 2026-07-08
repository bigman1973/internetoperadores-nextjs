import { prisma } from '../lib/prisma';

async function main() {
  // Facturas CPL junio
  const facturas = await prisma.factura.findMany({
    where: {
      serieFactura: 'CPL',
      ejercicio: 2026,
      fecha: { gte: new Date(2026, 5, 1), lte: new Date(2026, 5, 30, 23, 59, 59) },
      documento: 'Factura Ventas'
    },
    select: { numeroDocumento: true, nombreCompleto: true, total: true, codigoCliente: true }
  });

  // Buscar factura individual con importe 407.54
  const matchExacta = facturas.filter(f => Math.abs(Number(f.total) - 407.54) < 0.01);
  console.log('Factura exacta 407.54:', JSON.stringify(matchExacta));

  // Buscar en cualquier mes
  const matchAny = await prisma.factura.findMany({
    where: { serieFactura: 'CPL', total: { gte: 407, lte: 408 } },
    select: { numeroDocumento: true, nombreCompleto: true, total: true, fecha: true }
  });
  console.log('\nFacturas CPL ~407-408 cualquier mes:', JSON.stringify(matchAny, null, 2));

  // Agrupar por cliente
  const porCliente: Record<string, { nombre: string; total: number; facturas: string[] }> = {};
  for (const f of facturas) {
    const key = f.codigoCliente;
    if (!porCliente[key]) {
      porCliente[key] = { nombre: f.nombreCompleto, total: 0, facturas: [] };
    }
    porCliente[key].total += Number(f.total);
    porCliente[key].facturas.push(f.numeroDocumento);
  }

  // Buscar cliente cuyo total sea ~407.54
  const clienteMatch = Object.entries(porCliente).filter(([_, v]) => Math.abs(v.total - 407.54) < 0.5);
  console.log('\nClientes cuyas facturas suman ~407.54:', JSON.stringify(clienteMatch, null, 2));

  // Top 5 más cercanos
  const sorted = Object.entries(porCliente).sort((a, b) => Math.abs(a[1].total - 407.54) - Math.abs(b[1].total - 407.54));
  console.log('\nTop 5 clientes más cercanos a 407.54:');
  sorted.slice(0, 5).forEach(([code, v]) => {
    console.log(`  ${code} - ${v.nombre}: ${v.total.toFixed(2)} (${v.facturas.join(', ')})`);
  });

  // Otra idea: el rechazo podría ser de un recibo que agrupa facturas de meses anteriores
  // Buscar HOTEL MONT ROMIES que es la factura más grande (433.64)
  console.log('\nHOTEL MONT ROMIES facturas CPL:', 
    facturas.filter(f => f.nombreCompleto.includes('MONT ROMIES')).map(f => `${f.numeroDocumento}: ${Number(f.total).toFixed(2)}`));
}

main().then(() => process.exit(0));
