import { prisma } from '../lib/prisma';

async function main() {
  const allMovs = await prisma.movimientoBancario.findMany({
    include: { cuenta: { select: { banco: true } } },
    orderBy: [{ fechaOperacion: 'desc' }]
  });

  // Agrupar por cuenta+fecha+concepto+importe
  const grupos: Map<string, typeof allMovs> = new Map();
  for (const m of allMovs) {
    const key = m.cuentaId + '|' + m.fechaOperacion.toISOString().split('T')[0] + '|' + m.concepto + '|' + Number(m.importe).toFixed(2);
    const existing = grupos.get(key);
    if (existing) {
      existing.push(m);
    } else {
      grupos.set(key, [m]);
    }
  }

  let totalDups = 0;
  let dupsConciliados = 0;
  let dupsConTercero = 0;
  let dupsConFactura = 0;
  let dupsConCategoria = 0;
  let ambosConDatos = 0;

  for (const [key, items] of grupos) {
    if (items.length <= 1) continue;
    
    // Ver cuáles tienen datos de conciliación
    const conDatos = items.filter(m => 
      m.conciliado || m.terceroId || m.facturaId || m.categoriaId || m.tipoDocumento
    );
    
    totalDups++;
    
    if (conDatos.length > 1) {
      ambosConDatos++;
      console.log(`⚠️  AMBOS conciliados: ${items[0].cuenta.banco} | ${items[0].fechaOperacion.toISOString().split('T')[0]} | ${items[0].concepto.substring(0, 40)} | ${Number(items[0].importe).toFixed(2)}€`);
      items.forEach(m => {
        console.log(`   ID: ${m.id.substring(0, 8)}... | conciliado: ${m.conciliado} | tercero: ${m.terceroId ? 'SÍ' : 'no'} | factura: ${m.facturaId ? 'SÍ' : 'no'} | cat: ${m.categoriaId ? 'SÍ' : 'no'} | tipoDoc: ${m.tipoDocumento || 'no'}`);
      });
    } else if (conDatos.length === 1) {
      // Solo uno tiene datos, perfecto - eliminamos el otro
      if (conDatos[0].conciliado) dupsConciliados++;
      if (conDatos[0].terceroId) dupsConTercero++;
      if (conDatos[0].facturaId) dupsConFactura++;
      if (conDatos[0].categoriaId) dupsConCategoria++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESUMEN DE DUPLICADOS`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total grupos duplicados: ${totalDups}`);
  console.log(`Grupos donde SOLO UNO tiene conciliación: ${dupsConciliados + dupsConTercero + dupsConFactura + dupsConCategoria > 0 ? 'Sí' : 'Ninguno'}`);
  console.log(`  - Con conciliado=true: ${dupsConciliados}`);
  console.log(`  - Con tercero: ${dupsConTercero}`);
  console.log(`  - Con factura: ${dupsConFactura}`);
  console.log(`  - Con categoría: ${dupsConCategoria}`);
  console.log(`Grupos donde AMBOS tienen datos: ${ambosConDatos}`);
  console.log(`Grupos donde NINGUNO tiene datos: ${totalDups - ambosConDatos - Math.max(dupsConciliados, dupsConTercero, dupsConFactura, dupsConCategoria)}`);
  
  console.log(`\n--- SOLUCIÓN PROPUESTA ---`);
  if (ambosConDatos === 0) {
    console.log(`✅ Ningún par tiene datos en AMBOS registros.`);
    console.log(`   Se puede eliminar el duplicado SIN datos, conservando siempre el que tiene conciliación.`);
  } else {
    console.log(`⚠️  Hay ${ambosConDatos} pares donde ambos registros tienen datos de conciliación.`);
    console.log(`   Estos necesitan revisión manual o merge de datos.`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
