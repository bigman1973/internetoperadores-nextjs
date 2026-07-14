import { prisma } from '../lib/prisma';

async function main() {
  const cuentas = await prisma.cuentaBancaria.findMany({
    where: { activa: true },
    orderBy: { banco: 'asc' }
  });

  for (const cuenta of cuentas) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BANCO: ${cuenta.banco}`);
    console.log(`${'='.repeat(60)}`);

    // Obtener movimientos ordenados por fecha ASC (cronológico)
    const movs = await prisma.movimientoBancario.findMany({
      where: { cuentaId: cuenta.id },
      orderBy: [{ fechaOperacion: 'asc' }, { createdAt: 'asc' }]
    });

    if (movs.length === 0) { console.log('Sin movimientos'); continue; }

    console.log(`Total movimientos: ${movs.length}`);
    console.log(`Período: ${movs[0].fechaOperacion.toISOString().split('T')[0]} → ${movs[movs.length-1].fechaOperacion.toISOString().split('T')[0]}`);

    // Verificar cadena de saldos: saldo_anterior + importe = saldo_actual
    let errores = 0;
    let saldoAnterior: number | null = null;
    
    for (let i = 0; i < movs.length; i++) {
      const m = movs[i];
      const saldo = m.saldo ? Number(m.saldo) : null;
      const importe = Number(m.importe);
      
      if (saldo !== null && saldoAnterior !== null) {
        const esperado = saldoAnterior + importe;
        const diff = Math.abs(esperado - saldo);
        if (diff > 0.01) {
          errores++;
          if (errores <= 10) {
            console.log(`  ❌ Salto en mov #${i}: ${movs[i].fechaOperacion.toISOString().split('T')[0]} | ${m.concepto.substring(0, 40)} | imp: ${importe.toFixed(2)} | saldo esperado: ${esperado.toFixed(2)} | saldo real: ${saldo.toFixed(2)} | diff: ${(saldo - esperado).toFixed(2)}`);
          }
        }
      }
      
      if (saldo !== null) {
        saldoAnterior = saldo;
      }
    }
    
    console.log(`Errores en cadena de saldos: ${errores}`);
    
    // Ahora eliminar duplicados y re-verificar
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
    
    // Reconstruir lista sin duplicados (solo 1 de cada grupo)
    const sinDups: typeof movs = [];
    const seen = new Set<string>();
    for (const m of movs) {
      const key = m.fechaOperacion.toISOString().split('T')[0] + '|' + m.concepto + '|' + Number(m.importe).toFixed(2);
      if (!seen.has(key)) {
        seen.add(key);
        sinDups.push(m);
      }
    }
    
    console.log(`\nSin duplicados: ${sinDups.length} movimientos (eliminados ${movs.length - sinDups.length})`);
    
    // Verificar cadena sin duplicados
    let erroresSinDups = 0;
    saldoAnterior = null;
    for (let i = 0; i < sinDups.length; i++) {
      const m = sinDups[i];
      const saldo = m.saldo ? Number(m.saldo) : null;
      const importe = Number(m.importe);
      
      if (saldo !== null && saldoAnterior !== null) {
        const esperado = saldoAnterior + importe;
        const diff = Math.abs(esperado - saldo);
        if (diff > 0.01) {
          erroresSinDups++;
          if (erroresSinDups <= 5) {
            console.log(`  ❌ Salto sin dups #${i}: ${m.fechaOperacion.toISOString().split('T')[0]} | ${m.concepto.substring(0, 40)} | imp: ${importe.toFixed(2)} | esperado: ${esperado.toFixed(2)} | real: ${saldo.toFixed(2)} | diff: ${(saldo - esperado).toFixed(2)}`);
          }
        }
      }
      
      if (saldo !== null) {
        saldoAnterior = saldo;
      }
    }
    console.log(`Errores en cadena SIN duplicados: ${erroresSinDups}`);
    
    // Saldo final
    const ultimoSaldo = sinDups[sinDups.length - 1].saldo;
    console.log(`Saldo último movimiento: ${ultimoSaldo ? Number(ultimoSaldo).toFixed(2) + '€' : 'N/A'}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
