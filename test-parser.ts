import { parseCostesIOPdf } from './lib/nominas-parser';
import * as fs from 'fs';

async function testFile(filePath: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${filePath.split('/').pop()}`);
  console.log(`${'='.repeat(70)}`);
  
  const buffer = fs.readFileSync(filePath);
  const result = await parseCostesIOPdf(buffer, filePath.split('/').pop());
  
  console.log(`Formato: ${result.formato}`);
  console.log(`Periodo: ${result.mes}/${result.anio}`);
  console.log(`Empleados encontrados: ${result.empleados}`);
  console.log(`Verificado: ${result.verificado}`);
  console.log(`\nTotales:`);
  console.log(`  Bruto:        ${result.totalBruto.toFixed(2)} €`);
  console.log(`  Neto:         ${result.totalNeto.toFixed(2)} €`);
  console.log(`  IRPF:         ${result.totalIRPF.toFixed(2)} €`);
  console.log(`  SS Trab:      ${result.totalSSTrabajador.toFixed(2)} €`);
  console.log(`  SS Empresa:   ${result.totalSSEmpresa.toFixed(2)} €`);
  console.log(`  Coste Emp:    ${result.totalCosteEmpresa.toFixed(2)} €`);
  console.log(`  Check (B=N+I+S): ${(result.totalNeto + result.totalIRPF + result.totalSSTrabajador).toFixed(2)} vs ${result.totalBruto.toFixed(2)}`);
  
  console.log(`\nDetalle por empleado:`);
  for (const n of result.nominas) {
    // COSTES IO: Bruto = Neto + IRPF + SS (especie is separate)
    // Individual: Bruto = Neto + IRPF + SS + Especie
    const checkBase = n.netoPercibir + n.irpf + n.ssTrabajador;
    const checkWithEspecie = checkBase + n.complementoEspecie;
    const ok = (Math.abs(n.devengadoTotal - checkBase) < 5.0 || Math.abs(n.devengadoTotal - checkWithEspecie) < 5.0) ? '✓' : '✗';
    console.log(`  ${ok} ${n.nombre.padEnd(35)} NIF:${n.nif} Bruto:${n.devengadoTotal.toFixed(2)} Neto:${n.netoPercibir.toFixed(2)} IRPF:${n.irpf.toFixed(2)} SS:${n.ssTrabajador.toFixed(2)} SSEmp:${n.ssEmpresa.toFixed(2)} Coste:${n.costeTotalEmpresa.toFixed(2)}`);
  }
}

async function main() {
  const files = [
    '/home/ubuntu/upload/COSTES.pdf',
    '/home/ubuntu/upload/NOMINASJUNIO.pdf',
    '/home/ubuntu/upload/NominasJunio2026InternetOperadores.pdf',
  ];
  
  for (const f of files) {
    if (fs.existsSync(f)) {
      await testFile(f);
    } else {
      console.log(`File not found: ${f}`);
    }
  }
}

main().catch(console.error);
