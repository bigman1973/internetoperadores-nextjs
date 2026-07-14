import { prisma } from '../lib/prisma';

async function main() {
  const allMovs = await prisma.movimientoBancario.findMany({
    include: { cuenta: { select: { banco: true } } },
    orderBy: [{ fechaOperacion: 'desc' }]
  });

  console.log('Total movimientos en BD:', allMovs.length);

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

  const idsToDelete: string[] = [];

  for (const [key, items] of grupos) {
    if (items.length <= 1) continue;

    // Puntuar cada item: más datos = más puntos
    const scored = items.map(m => {
      let score = 0;
      if (m.conciliado) score += 10;
      if (m.terceroId) score += 20;
      if (m.facturaId) score += 20;
      if (m.categoriaId) score += 15;
      if (m.tipoDocumento) score += 5;
      if (m.traspasoRelacionadoId) score += 10;
      return { m, score };
    });

    // Ordenar por score DESC, luego por createdAt ASC (el más antiguo gana en empate)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.m.createdAt?.getTime() || 0) - (b.m.createdAt?.getTime() || 0);
    });

    // Conservar el primero (mejor score), eliminar el resto
    for (let i = 1; i < scored.length; i++) {
      idsToDelete.push(scored[i].m.id);
    }
  }

  console.log(`\nDuplicados a eliminar: ${idsToDelete.length}`);

  if (idsToDelete.length === 0) {
    console.log('No hay duplicados que eliminar.');
    return;
  }

  // Eliminar en batches de 50
  const batchSize = 50;
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const result = await prisma.movimientoBancario.deleteMany({
      where: { id: { in: batch } }
    });
    deleted += result.count;
    console.log(`  Eliminados ${deleted}/${idsToDelete.length}...`);
  }

  console.log(`\n✅ Total eliminados: ${deleted}`);

  // Verificar resultado
  const remaining = await prisma.movimientoBancario.count();
  console.log(`Movimientos restantes en BD: ${remaining}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
