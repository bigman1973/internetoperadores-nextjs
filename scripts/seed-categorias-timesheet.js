const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categorias = [
    {
      nombre: 'Comercial',
      color: '#f59e0b',
      orden: 1,
      subcategorias: ['Visita cliente', 'Propuesta/Presupuesto', 'Seguimiento', 'Negocio nuevo', 'Llamada comercial'],
    },
    {
      nombre: 'Soporte Técnico',
      color: '#3b82f6',
      orden: 2,
      subcategorias: ['Incidencia', 'Mantenimiento preventivo', 'Instalación', 'Configuración', 'Consulta técnica'],
    },
    {
      nombre: 'Administración',
      color: '#8b5cf6',
      orden: 3,
      subcategorias: ['Facturación', 'Contabilidad', 'Gestión interna', 'Documentación', 'Proveedores'],
    },
    {
      nombre: 'Proyectos',
      color: '#10b981',
      orden: 4,
      subcategorias: ['Planificación', 'Ejecución', 'Seguimiento', 'Entrega', 'Reunión de proyecto'],
    },
    {
      nombre: 'Dirección',
      color: '#ef4444',
      orden: 5,
      subcategorias: ['Reunión estratégica', 'Supervisión', 'Planificación', 'Gestión de equipo'],
    },
    {
      nombre: 'Formación',
      color: '#06b6d4',
      orden: 6,
      subcategorias: ['Formación interna', 'Formación externa', 'Certificación', 'Autoformación'],
    },
  ];

  for (const cat of categorias) {
    await prisma.categoriaTimesheet.upsert({
      where: { nombre: cat.nombre },
      update: { color: cat.color, orden: cat.orden, subcategorias: cat.subcategorias },
      create: cat,
    });
    console.log(`✓ ${cat.nombre} (${cat.subcategorias.length} subcategorías)`);
  }

  console.log('\n✅ Categorías de timesheet creadas correctamente');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
