import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Limpiar datos existentes
  await prisma.organigramaDraxton.deleteMany({});
  console.log('🗑️  Limpiado organigrama existente');

  // === NIVEL 1: ICT Director ===
  const jordi = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Jordi Noguera',
      rol: 'ICT Director',
      tipoEntidad: 'interno',
      ubicacion: 'HQ',
      departamento: 'Dirección IT',
      orden: 1,
    },
  });
  console.log('✓ Jordi Noguera (ICT Director)');

  // === NIVEL 2: IT Managers ===
  const sergi = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Sergi Tallón',
      rol: 'IT Manager Infraestructura Europa y Asia',
      tipoEntidad: 'interno',
      ubicacion: 'HQ',
      departamento: 'Infraestructura',
      reportaAId: jordi.id,
      orden: 1,
    },
  });
  console.log('✓ Sergi Tallón');

  const joseAntonio = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Jose Antonio Colorado',
      rol: 'IT Manager BCN - ERP Europa y Asia y Matrix',
      tipoEntidad: 'interno',
      ubicacion: 'HQ',
      departamento: 'ERP',
      reportaAId: jordi.id,
      orden: 2,
    },
  });
  console.log('✓ Jose Antonio Colorado');

  const gerardo = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Gerardo Morales',
      rol: 'Operaciones y Matrix',
      tipoEntidad: 'interno',
      ubicacion: 'HQ',
      departamento: 'Operaciones',
      reportaAId: jordi.id,
      orden: 3,
    },
  });
  console.log('✓ Gerardo Morales');

  const eduard = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Eduard Vendrell',
      rol: 'IT/OT, IA, Bigdata',
      tipoEntidad: 'externo',
      empresa: 'Inkoova',
      ubicacion: 'HQ',
      departamento: 'IT/OT',
      reportaAId: jordi.id,
      orden: 4,
    },
  });
  console.log('✓ Eduard Vendrell (Inkoova)');

  // === NIVEL 3: Reportan a Sergi ===
  const alexis = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Alexis',
      rol: 'Infraestructuras, Sistemas y Gobierno IT',
      tipoEntidad: 'interno',
      ubicacion: 'HQ',
      departamento: 'Infraestructura',
      reportaAId: sergi.id,
      orden: 1,
    },
  });
  console.log('✓ Alexis');

  // === NIVEL 3: Reportan a Jose Antonio ===
  const francisco = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Francisco Nicolas',
      rol: 'Programador y EDI',
      tipoEntidad: 'interno',
      ubicacion: 'HQ',
      departamento: 'ERP',
      reportaAId: joseAntonio.id,
      orden: 1,
    },
  });
  console.log('✓ Francisco Nicolas');

  const alejandro = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Alejandro Martinez',
      rol: 'Advanced Support IT, Guardias',
      tipoEntidad: 'io',
      empresa: 'IO',
      ubicacion: 'HQ',
      departamento: 'Soporte',
      reportaAId: joseAntonio.id,
      orden: 2,
    },
  });
  console.log('✓ Alejandro Martinez (IO)');

  // === NIVEL 3: Reportan a Gerardo ===
  const jesus = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Jesús Parra',
      rol: 'Advanced Support IT, Guardias',
      tipoEntidad: 'io',
      empresa: 'IO',
      ubicacion: 'LLEIDA',
      departamento: 'Soporte',
      reportaAId: gerardo.id,
      orden: 1,
    },
  });
  console.log('✓ Jesús Parra (IO)');

  // === NIVEL 4: Reportan a Alexis ===
  const javier = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Javier Sanchez',
      rol: 'Gobierno IT',
      tipoEntidad: 'externo',
      empresa: 'Nextret',
      ubicacion: 'HQ',
      departamento: 'Gobierno IT',
      reportaAId: alexis.id,
      orden: 1,
    },
  });
  console.log('✓ Javier Sanchez (Nextret)');

  // === NIVEL 4: Reportan a Francisco ===
  const nestor = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Nestor',
      rol: 'Bolsa Expertis, Formador EDI',
      tipoEntidad: 'externo',
      empresa: 'IPS',
      ubicacion: 'HQ',
      departamento: 'ERP',
      reportaAId: francisco.id,
      orden: 1,
    },
  });
  console.log('✓ Nestor (IPS)');

  // === NIVEL 4: Reportan a Alejandro ===
  const pol = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Pol Terres',
      rol: 'Helpdesk, Guardias',
      tipoEntidad: 'io',
      empresa: 'IO',
      ubicacion: 'BCN',
      departamento: 'Helpdesk',
      reportaAId: alejandro.id,
      orden: 1,
    },
  });
  console.log('✓ Pol Terres (IO)');

  const gonzalo = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Gonzalo Postal',
      rol: 'Helpdesk',
      tipoEntidad: 'io',
      empresa: 'IO',
      ubicacion: 'HQ',
      departamento: 'Helpdesk',
      reportaAId: alejandro.id,
      orden: 2,
    },
  });
  console.log('✓ Gonzalo Postal (IO)');

  // === NIVEL 4: Reportan a Jesús ===
  const patricia = await prisma.organigramaDraxton.create({
    data: {
      nombre: 'Patricia Parra',
      rol: 'Helpdesk',
      tipoEntidad: 'io',
      empresa: 'IO',
      ubicacion: 'LLEIDA',
      departamento: 'Helpdesk',
      reportaAId: jesus.id,
      orden: 1,
    },
  });
  console.log('✓ Patricia Parra (IO)');

  // === COLABORADORES EXTERNOS ===
  const colaboradores = [
    { nombre: 'Laro', empresa: 'IPS', especialidad: 'Soporte código .NET' },
    { nombre: 'Alba', empresa: 'IPS', especialidad: 'Soporte código .NET' },
    { nombre: 'Luis', empresa: 'IPS', especialidad: 'Soporte CIM, MQTT y JDK' },
    { nombre: 'Alexander', empresa: 'Seidor', especialidad: 'Soporte Auditorías' },
    { nombre: 'Juan Hidalgo', empresa: 'Seidor', especialidad: 'Consultor' },
    { nombre: 'Rafael Aliaga', empresa: 'IPData', especialidad: 'Redes' },
    { nombre: 'Cristian Hurtado', empresa: 'Pista Cero', especialidad: 'Soporte Sistemas Virtualización' },
    { nombre: 'Soporte Nextret', empresa: 'Nextret', especialidad: 'Administración Backups' },
    { nombre: 'Consultoría SAP (Matrix)', empresa: 'Matrix', especialidad: 'Migración ERP' },
  ];

  for (const col of colaboradores) {
    await prisma.organigramaDraxton.create({
      data: {
        nombre: col.nombre,
        rol: col.especialidad,
        tipoEntidad: 'externo',
        empresa: col.empresa,
        ubicacion: 'HQ',
        esColaborador: true,
        especialidad: col.especialidad,
        orden: 0,
      },
    });
    console.log(`✓ Colaborador: ${col.nombre} (${col.empresa})`);
  }

  console.log('\n✅ Seed del organigrama Draxton completado');
  console.log(`   Total nodos: ${await prisma.organigramaDraxton.count()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
