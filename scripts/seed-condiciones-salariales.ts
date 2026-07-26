import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed condiciones salariales basadas en los datos actuales de nómina
  // Jesús Parra: actualmente 28.359,72€/año (2.363,31/mes), subida a 32.000€ desde 01/07/2026
  const condiciones = [
    {
      empleadoId: '4917dff3-cc09-42da-b060-10b450230f5e', // PARRA GARCIA, JESUS
      fechaEfectiva: new Date('2025-01-01'),
      brutoAnual: 28360,
      motivo: 'incorporacion',
      notas: 'Salario inicial',
      creadoPor: 'sistema',
    },
    {
      empleadoId: '4917dff3-cc09-42da-b060-10b450230f5e', // PARRA GARCIA, JESUS
      fechaEfectiva: new Date('2026-07-01'),
      brutoAnual: 32000,
      motivo: 'subida_anual',
      notas: 'Subida pactada julio 2026',
      creadoPor: 'david.perez@internetoperadores.com',
    },
  ];

  for (const c of condiciones) {
    const existing = await prisma.condicionSalarial.findFirst({
      where: { empleadoId: c.empleadoId, fechaEfectiva: c.fechaEfectiva },
    });
    if (!existing) {
      await prisma.condicionSalarial.create({ data: c });
      console.log(`✓ Creada condición: ${c.brutoAnual}€ desde ${c.fechaEfectiva.toISOString().split('T')[0]} para empleado ${c.empleadoId}`);
    } else {
      console.log(`⏭ Ya existe condición para ${c.empleadoId} en ${c.fechaEfectiva.toISOString().split('T')[0]}`);
    }
  }

  console.log('\n✅ Seed de condiciones salariales completado');
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
