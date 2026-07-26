import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const emp = await prisma.empleado.findFirst({
    where: { nombreCompleto: { contains: 'LORENA', mode: 'insensitive' } },
    include: { nominas: { orderBy: [{ anio: 'asc' }, { mes: 'asc' }] } }
  });
  if (!emp) { console.log('No encontrada'); return; }
  console.log(`Empleada: ${emp.nombreCompleto}`);
  console.log('---');
  for (const n of emp.nominas) {
    console.log(`Mes ${n.mes}/${n.anio}: devengado=${n.devengadoTotal}, neto=${n.netoPercibir}, irpf=${n.irpf}, ssTrab=${n.ssTrabajador}, ssEmp=${n.ssEmpresa}, costeTotalEmp=${n.costeTotalEmpresa}, desplaz=${n.gastosDesplazamiento}, especie=${n.complementoEspecie}`);
  }
  const totalDevengado = emp.nominas.reduce((s, n) => s + (n.devengadoTotal || 0), 0);
  const totalNeto = emp.nominas.reduce((s, n) => s + (n.netoPercibir || 0), 0);
  const totalIrpf = emp.nominas.reduce((s, n) => s + Math.abs(n.irpf || 0), 0);
  const totalSsTrab = emp.nominas.reduce((s, n) => s + Math.abs(n.ssTrabajador || 0), 0);
  const meses = emp.nominas.length;
  console.log(`\nTotal devengado: ${totalDevengado}, Meses: ${meses}, Proyección 12m: ${(totalDevengado/meses)*12}`);
  console.log(`Total neto: ${totalNeto}, Total IRPF: ${totalIrpf}, Total SS Trab: ${totalSsTrab}`);
  console.log(`Neto + IRPF + SS Trab = ${totalNeto + totalIrpf + totalSsTrab}`);
  console.log(`Bruto real (si 1666.67/mes): ${1666.67 * 12}`);
}
main().then(() => prisma.$disconnect());
