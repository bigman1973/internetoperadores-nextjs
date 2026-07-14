import { prisma } from '../lib/prisma';

async function main() {
  const cuentas = await prisma.cuentaBancaria.findMany({
    orderBy: { banco: 'asc' }
  });

  for (const cuenta of cuentas) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BANCO: ${cuenta.banco} (${cuenta.activa ? 'ACTIVA' : 'CERRADA'})`);
    console.log(`${'='.repeat(60)}`);

    const movs = await prisma.movimientoBancario.findMany({
      where: { cuentaId: cuenta.id },
      orderBy: { fechaOperacion: 'desc' }
    });

    console.log(`Total movimientos: ${movs.length}`);

    if (movs.length === 0) continue;

    // Último movimiento (más reciente)
    const ultimo = movs[0];
    console.log(`Último mov: ${ultimo.fechaOperacion.toISOString().split('T')[0]} | ${ultimo.concepto.substring(0, 50)} | ${Number(ultimo.importe).toFixed(2)}€ | Saldo: ${ultimo.saldo ? Number(ultimo.saldo).toFixed(2) + '€' : 'N/A'}`);

    // Primer movimiento (más antiguo)
    const primero = movs[movs.length - 1];
    console.log(`Primer mov: ${primero.fechaOperacion.toISOString().split('T')[0]} | ${primero.concepto.substring(0, 50)} | ${Number(primero.importe).toFixed(2)}€ | Saldo: ${primero.saldo ? Number(primero.saldo).toFixed(2) + '€' : 'N/A'}`);

    // Buscar duplicados (misma fecha + concepto + importe)
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

    let dups = 0;
    for (const [key, items] of grupos) {
      if (items.length > 1) {
        dups += items.length - 1;
      }
    }
    console.log(`Duplicados detectados: ${dups}`);

    // Verificar saldo: sumar todos los importes y comparar con saldo del último mov
    const sumaImportes = movs.reduce((acc, m) => acc + Number(m.importe), 0);
    console.log(`Suma de todos los importes: ${sumaImportes.toFixed(2)}€`);
    
    if (ultimo.saldo) {
      const saldoUltimo = Number(ultimo.saldo);
      const saldoPrimeroAntes = primero.saldo ? Number(primero.saldo) - Number(primero.importe) : null;
      console.log(`Saldo último mov (según banco): ${saldoUltimo.toFixed(2)}€`);
      if (saldoPrimeroAntes !== null) {
        const saldoCalculado = saldoPrimeroAntes + sumaImportes;
        console.log(`Saldo inicial (antes del primer mov): ${saldoPrimeroAntes.toFixed(2)}€`);
        console.log(`Saldo calculado (inicial + suma importes): ${saldoCalculado.toFixed(2)}€`);
        const diff = saldoCalculado - saldoUltimo;
        if (Math.abs(diff) > 0.01) {
          console.log(`⚠️  DESCUADRE: ${diff.toFixed(2)}€ (diferencia entre saldo calculado y saldo real)`);
          // Calcular cuánto sería sin duplicados
          let sumaSinDups = 0;
          for (const [key, items] of grupos) {
            sumaSinDups += Number(items[0].importe); // Solo contar 1 de cada grupo
          }
          const saldoSinDups = saldoPrimeroAntes + sumaSinDups;
          console.log(`Saldo sin duplicados: ${saldoSinDups.toFixed(2)}€`);
          const diffSinDups = saldoSinDups - saldoUltimo;
          if (Math.abs(diffSinDups) < 0.01) {
            console.log(`✅ SIN DUPLICADOS CUADRA PERFECTAMENTE`);
          } else {
            console.log(`⚠️  Sin duplicados aún descuadra: ${diffSinDups.toFixed(2)}€`);
          }
        } else {
          console.log(`✅ Saldo CUADRA correctamente`);
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
