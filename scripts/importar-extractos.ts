/**
 * Script para importar extractos bancarios directamente a la BD
 * - Santander: MovimientosCuenta(18).xlsx (cabeceras en fila 7, datos desde fila 8)
 * - CaixaBank: TT260626.047.XLS (cabeceras en fila 3, datos desde fila 4, formato especial)
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function generarHash(cuenta: string, fecha: string, concepto: string, importe: number, idx: number): string {
  const str = `${cuenta}|${fecha}|${concepto}|${importe}|${idx}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

// Parsear fecha dd/mm/yyyy
function parseFecha(str: string): Date | null {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

async function importarSantander(filePath: string, cuentaId: string) {
  console.log('\n=== IMPORTANDO SANTANDER ===');
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Santander: cabeceras en fila 7 (index 7), datos desde fila 8
  // Columnas: Fecha Operación | Fecha Valor | Concepto | Importe | Divisa | Saldo | ...
  const headerRow = 7;
  console.log(`Cabeceras: ${data[headerRow]?.slice(0, 6).join(' | ')}`);
  console.log(`Total filas de datos: ${data.length - headerRow - 1}`);

  let insertados = 0;
  let duplicados = 0;
  let errores = 0;

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const fechaOp = parseFecha(row[0]?.toString());
    const fechaVal = parseFecha(row[1]?.toString());
    const concepto = row[2]?.toString()?.trim() || '';
    const importe = typeof row[3] === 'number' ? row[3] : parseFloat(row[3]?.toString()?.replace(/\./g, '').replace(',', '.') || '0');
    const saldo = typeof row[5] === 'number' ? row[5] : null;

    if (!fechaOp || !concepto) continue;

    try {
      const hash = generarHash('SAN', fechaOp.toISOString().slice(0, 10), concepto, importe, i);
      await prisma.movimientoBancario.create({
        data: {
          cuentaId,
          fechaOperacion: fechaOp,
          fechaValor: fechaVal || fechaOp,
          concepto,
          importe,
          saldo,
          referencia: row[9]?.toString() || null,
          codigoOperacion: row[7]?.toString() || null,
          infoAdicional: row[11]?.toString() || null,
          hashUnico: hash,
          origenArchivo: 'MovimientosCuenta(18).xlsx',
        },
      });
      insertados++;
    } catch (e: any) {
      if (e.code === 'P2002') duplicados++;
      else {
        errores++;
        if (errores <= 3) console.error(`Error fila ${i}:`, e.message);
      }
    }
  }

  console.log(`Santander: ${insertados} insertados, ${duplicados} duplicados, ${errores} errores`);
}

async function importarCaixaBank(filePath: string, cuentaId: string) {
  console.log('\n=== IMPORTANDO CAIXABANK ===');
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // CaixaBank: cabeceras en fila 3 (index 3), datos desde fila 4
  // Columnas: "" | Número de cuenta | Oficina | Divisa | F. Operación | F. Valor | Ingreso (+) | Gasto (-) | Saldo (+) | Saldo (-) | Concepto común | Concepto propio | ...conceptos complementarios
  const headerRow = 3;
  console.log(`Total filas de datos: ${data.length - headerRow - 1}`);

  let insertados = 0;
  let duplicados = 0;
  let errores = 0;

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[4]) continue;

    const fechaOp = parseFecha(row[4]?.toString());
    const fechaVal = parseFecha(row[5]?.toString());
    
    // Importe: Ingreso (+) en col 6, Gasto (-) en col 7
    const ingreso = typeof row[6] === 'number' ? row[6] : parseFloat(row[6]?.toString()?.replace(/\./g, '').replace(',', '.') || '0');
    const gasto = typeof row[7] === 'number' ? row[7] : parseFloat(row[7]?.toString()?.replace(/\./g, '').replace(',', '.') || '0');
    const importe = ingreso > 0 ? ingreso : -gasto;
    
    // Saldo
    const saldoPos = typeof row[8] === 'number' ? row[8] : 0;
    const saldoNeg = typeof row[9] === 'number' ? row[9] : 0;
    const saldo = saldoPos > 0 ? saldoPos : (saldoNeg > 0 ? -saldoNeg : null);

    // Concepto: combinar conceptos complementarios
    const conceptoParts = [];
    if (row[14]) conceptoParts.push(row[14].toString().trim());
    if (row[18]) conceptoParts.push(row[18].toString().trim());
    if (row[22]) conceptoParts.push(row[22].toString().trim());
    const concepto = conceptoParts.join(' ').replace(/\s+/g, ' ').trim() || `Operación ${row[10]}/${row[11]}`;

    if (!fechaOp || importe === 0) continue;

    try {
      const hash = generarHash('CXB', fechaOp.toISOString().slice(0, 10), concepto, importe, i);
      await prisma.movimientoBancario.create({
        data: {
          cuentaId,
          fechaOperacion: fechaOp,
          fechaValor: fechaVal || fechaOp,
          concepto,
          importe,
          saldo,
          referencia: row[12]?.toString()?.trim() || null,
          hashUnico: hash,
          origenArchivo: 'TT260626.047.XLS',
        },
      });
      insertados++;
    } catch (e: any) {
      if (e.code === 'P2002') duplicados++;
      else {
        errores++;
        if (errores <= 3) console.error(`Error fila ${i}:`, e.message);
      }
    }
  }

  console.log(`CaixaBank: ${insertados} insertados, ${duplicados} duplicados, ${errores} errores`);
}

async function main() {
  // Crear las cuentas bancarias si no existen
  let cuentaSantander = await prisma.cuentaBancaria.findFirst({ where: { banco: 'Santander' } });
  if (!cuentaSantander) {
    cuentaSantander = await prisma.cuentaBancaria.create({
      data: {
        banco: 'Santander',
        iban: 'ES41 0049 1886 77 2810745257',
        alias: 'Principal',
        activa: true,
        saldoActual: 12773.25,
        fechaSaldo: new Date('2026-06-26'),
      },
    });
    console.log('Cuenta Santander creada');
  } else {
    console.log('Cuenta Santander ya existe:', cuentaSantander.id);
  }

  let cuentaCaixaBank = await prisma.cuentaBancaria.findFirst({ where: { banco: 'CaixaBank' } });
  if (!cuentaCaixaBank) {
    cuentaCaixaBank = await prisma.cuentaBancaria.create({
      data: {
        banco: 'CaixaBank',
        iban: 'ES__ 2100 0203 77 0200984012',
        alias: 'Préstamo',
        activa: true,
        saldoActual: 212.51,
        fechaSaldo: new Date('2026-06-26'),
      },
    });
    console.log('Cuenta CaixaBank creada');
  } else {
    console.log('Cuenta CaixaBank ya existe:', cuentaCaixaBank.id);
  }

  // Importar extractos
  await importarSantander('/home/ubuntu/upload/MovimientosCuenta(18).xlsx', cuentaSantander.id);
  await importarCaixaBank('/home/ubuntu/upload/TT260626.047.XLS', cuentaCaixaBank.id);

  // Resumen final
  const totalMov = await prisma.movimientoBancario.count();
  console.log(`\n=== TOTAL MOVIMIENTOS EN BD: ${totalMov} ===`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
