import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cargando empleados...');

  const empleados = [
    {
      codigoNomina: '000004',
      nombreCompleto: 'PEREZ SOLIS, IVAN',
      nif: '49258646Y',
      email: 'ivan.perez@internetoperadores.com',
      departamento: 'Comercial',
      categoria: 'COMERCIAL',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000005',
      nombreCompleto: 'POSTAL QUIROZ, GONZALO',
      nif: '47669283N',
      email: 'gonzalo.postal@internetoperadores.com',
      departamento: 'Comercial',
      categoria: 'COMERCIAL',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000006',
      nombreCompleto: 'TERRES DURO, POL',
      nif: '49780575L',
      email: null,
      departamento: 'Técnico',
      categoria: 'TÉCNICO',
      estado: 'BAJA' as const,
      fechaAlta: new Date('2023-01-01'),
      fechaBaja: new Date('2026-07-31'),
    },
    {
      codigoNomina: '000008',
      nombreCompleto: 'PARRA GARCIA, JESUS',
      nif: '53147813B',
      email: 'jesus.parra@internetoperadores.com',
      departamento: 'Técnico',
      categoria: 'TÉCNICO',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000010',
      nombreCompleto: 'MARTINEZ CAYUELAS, ALEJANDRO',
      nif: '26071099R',
      email: 'alejandro.martinez@internetoperadores.com',
      departamento: 'Técnico',
      categoria: 'TÉCNICO',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000012',
      nombreCompleto: 'BUSQUETS JOFRE, ESTEVE',
      nif: '78090248G',
      email: 'esteve.busquets@internetoperadores.com',
      departamento: 'Técnico',
      categoria: 'TÉCNICO',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000013',
      nombreCompleto: 'PARRA GARCIA, PATRICIA',
      nif: '43724870F',
      email: 'patricia.parra@internetoperadores.com',
      departamento: 'Administración',
      categoria: 'ADMINISTRATIVO',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000014',
      nombreCompleto: 'BENET LOPETEGUI, JOEL',
      nif: '53396466B',
      email: null,
      departamento: 'Técnico',
      categoria: 'TÉCNICO',
      estado: 'BAJA' as const,
      fechaAlta: new Date('2023-01-01'),
      fechaBaja: new Date('2026-07-31'),
    },
    {
      codigoNomina: '000015',
      nombreCompleto: 'GIMENO MARTINEZ, LORENA',
      nif: '53672064T',
      email: 'lorena.gimeno@internetoperadores.com',
      departamento: 'Administración',
      categoria: 'ADMINISTRATIVO',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2023-01-01'),
    },
    {
      codigoNomina: '000016',
      nombreCompleto: 'PEREZ MONTANO, DAVID JAVIER',
      nif: '43747194K',
      email: 'david.perez@internetoperadores.com',
      departamento: 'Dirección',
      categoria: 'GERENTE',
      estado: 'ACTIVO' as const,
      fechaAlta: new Date('2025-03-01'),
      numAfiliacionSS: '25/10135286-35',
      tarifaCotizacion: 100,
    },
  ];

  for (const emp of empleados) {
    const created = await prisma.empleado.upsert({
      where: { nif: emp.nif },
      update: {
        nombreCompleto: emp.nombreCompleto,
        email: emp.email,
        departamento: emp.departamento,
        categoria: emp.categoria,
        estado: emp.estado,
        fechaBaja: emp.fechaBaja || null,
      },
      create: {
        codigoNomina: emp.codigoNomina,
        nombreCompleto: emp.nombreCompleto,
        nif: emp.nif,
        email: emp.email,
        departamento: emp.departamento,
        categoria: emp.categoria,
        estado: emp.estado,
        fechaAlta: emp.fechaAlta,
        fechaBaja: emp.fechaBaja || null,
        numAfiliacionSS: (emp as any).numAfiliacionSS || null,
        tarifaCotizacion: (emp as any).tarifaCotizacion || null,
      },
    });
    console.log(`  ✓ ${created.nombreCompleto} (${created.nif})`);
  }

  // Cargar nóminas de Mayo 2026 (datos del resumen)
  console.log('\nCargando nóminas Mayo 2026...');

  const nominasMayo = [
    { nif: '49258646Y', irpf: 43.59, ssTrab: 92.59, neto: 1288.32, devengado: 1424.50, baseIrpf: 1424.50, ssEmpresa: 457.98, ssTCI: 550.57, especie: 0 },
    { nif: '47669283N', irpf: 58.19, ssTrab: 94.79, neto: 1305.36, devengado: 1458.34, baseIrpf: 1458.34, ssEmpresa: 468.87, ssTCI: 563.66, especie: 0 },
    { nif: '49780575L', irpf: 163.76, ssTrab: 107.19, neto: 1801.04, devengado: 2071.99, baseIrpf: 1649.19, ssEmpresa: 530.21, ssTCI: 637.40, especie: 455.32 },
    { nif: '53147813B', irpf: 224.25, ssTrab: 119.87, neto: 1641.23, devengado: 1985.35, baseIrpf: 1844.19, ssEmpresa: 592.92, ssTCI: 712.79, especie: 152.02 },
    { nif: '26071099R', irpf: 368.82, ssTrab: 152.89, neto: 2074.99, devengado: 2596.70, baseIrpf: 2352.14, ssEmpresa: 756.21, ssTCI: 909.10, especie: 263.37 },
    { nif: '78090248G', irpf: 582.74, ssTrab: 207.21, neto: 2673.01, devengado: 3462.96, baseIrpf: 3187.83, ssEmpresa: 1024.88, ssTCI: 1232.09, especie: 296.29 },
    { nif: '43724870F', irpf: 0, ssTrab: 92.85, neto: 1388.91, devengado: 1481.76, baseIrpf: 1428.59, ssEmpresa: 459.31, ssTCI: 552.16, especie: 57.26 },
    { nif: '53396466B', irpf: 648.28, ssTrab: 217.55, neto: 2655.96, devengado: 3521.79, baseIrpf: 3346.80, ssEmpresa: 1075.98, ssTCI: 1293.53, especie: 188.45 },
    { nif: '53672064T', irpf: 107.33, ssTrab: 108.33, neto: 1451.01, devengado: 1666.67, baseIrpf: 1666.67, ssEmpresa: 535.84, ssTCI: 644.17, especie: 0 },
    // David Pérez - datos de su nómina individual
    { nif: '43747194K', irpf: 973.50, ssTrab: 0, neto: 3291.70, devengado: 4353.76, baseIrpf: 4092.06, ssEmpresa: 0, ssTCI: 0, especie: 88.56 },
  ];

  for (const nom of nominasMayo) {
    const empleado = await prisma.empleado.findUnique({ where: { nif: nom.nif } });
    if (!empleado) continue;

    const costeTotalEmpresa = nom.devengado + nom.ssEmpresa;

    await prisma.nomina.upsert({
      where: {
        empleadoId_mes_anio: {
          empleadoId: empleado.id,
          mes: 5,
          anio: 2026,
        },
      },
      update: {
        devengadoTotal: nom.devengado,
        irpf: nom.irpf,
        ssTrabajador: nom.ssTrab,
        netoPercibir: nom.neto,
        baseIrpf: nom.baseIrpf,
        ssEmpresa: nom.ssEmpresa,
        ssTCI: nom.ssTCI,
        complementoEspecie: nom.especie || null,
        costeTotalEmpresa,
      },
      create: {
        empleadoId: empleado.id,
        mes: 5,
        anio: 2026,
        devengadoTotal: nom.devengado,
        irpf: nom.irpf,
        porcentajeIrpf: nom.baseIrpf > 0 ? Math.round((nom.irpf / nom.baseIrpf) * 10000) / 100 : 0,
        ssTrabajador: nom.ssTrab,
        netoPercibir: nom.neto,
        baseIrpf: nom.baseIrpf,
        baseSS: nom.baseIrpf, // Aproximación
        ssEmpresa: nom.ssEmpresa,
        ssTCI: nom.ssTCI,
        complementoEspecie: nom.especie || null,
        costeTotalEmpresa,
      },
    });
    console.log(`  ✓ Nómina Mayo 2026 - ${empleado.nombreCompleto}: Coste empresa ${costeTotalEmpresa.toFixed(2)}€`);

    // Actualizar coste/hora del empleado (basado en 160 horas/mes)
    const costeHora = costeTotalEmpresa / 160;
    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { costeHoraActual: Math.round(costeHora * 100) / 100 },
    });
  }

  console.log('\n✅ Seed completado con éxito');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
