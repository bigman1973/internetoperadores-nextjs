import { prisma } from '../lib/prisma';

async function main() {
  const movs = await prisma.movimientoBancario.findMany({
    where: { cuenta: { banco: { contains: 'BBVA', mode: 'insensitive' } } },
    orderBy: [{ fechaOperacion: 'desc' }, { concepto: 'asc' }]
  });
  console.log('Total movimientos BBVA:', movs.length);
  
  // Agrupar por fecha+concepto+importe
  const grupos: Map<string, typeof movs> = new Map();
  for (const m of movs) {
    const key = m.fechaOperacion.toISOString().split('T')[0] + '|' + m.concepto + '|' + Number(m.importe).toFixed(2);
    const existing = grupos.get(key);
    if (existing) {
      existing.push(m);
    } else {
      grupos.set(key, [m]);
    }
  }
  
  let totalDups = 0;
  const dupsToDelete: string[] = [];
  for (const [key, items] of grupos) {
    if (items.length > 1) {
      totalDups += items.length - 1;
      console.log(items.length + 'x |', key.substring(0, 100));
      // Mantener el primero (más antiguo createdAt), eliminar los demás
      items.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      for (let i = 1; i < items.length; i++) {
        dupsToDelete.push(items[i].id);
      }
    }
  }
  console.log('\nTotal duplicados a eliminar:', totalDups);
  console.log('IDs a eliminar:', dupsToDelete);

  // También buscar en todos los bancos
  console.log('\n--- Buscando duplicados en TODOS los bancos ---');
  const allMovs = await prisma.movimientoBancario.findMany({
    include: { cuenta: { select: { banco: true } } },
    orderBy: [{ fechaOperacion: 'desc' }]
  });
  console.log('Total movimientos en BD:', allMovs.length);
  
  const gruposAll: Map<string, typeof allMovs> = new Map();
  for (const m of allMovs) {
    const key = m.cuentaId + '|' + m.fechaOperacion.toISOString().split('T')[0] + '|' + m.concepto + '|' + Number(m.importe).toFixed(2);
    const existing = gruposAll.get(key);
    if (existing) {
      existing.push(m);
    } else {
      gruposAll.set(key, [m]);
    }
  }
  
  let totalDupsAll = 0;
  const allDupsToDelete: string[] = [];
  for (const [key, items] of gruposAll) {
    if (items.length > 1) {
      totalDupsAll += items.length - 1;
      const banco = items[0].cuenta.banco;
      console.log(items.length + 'x |', banco, '|', key.split('|').slice(1).join('|').substring(0, 80));
      items.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      for (let i = 1; i < items.length; i++) {
        allDupsToDelete.push(items[i].id);
      }
    }
  }
  console.log('\nTotal duplicados en TODOS los bancos:', totalDupsAll);
  console.log('IDs a eliminar:', allDupsToDelete.length);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
