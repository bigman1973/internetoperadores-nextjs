const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categorias = [
    {
      nombre: 'Comercial',
      color: '#f59e0b',
      orden: 1,
      subcategorias: [
        { nombre: 'Nuevos clientes' },
        {
          nombre: 'Fidelización',
          hijos: [
            {
              nombre: 'Empresa',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: '4G' },
                { nombre: 'Wimax' },
                { nombre: 'Telefonía Fija' },
                { nombre: 'Telefonía Móvil' },
                { nombre: 'Centralita' },
                { nombre: 'Mantenimiento' },
                { nombre: 'Videoconferencia' },
                { nombre: 'Otros' },
              ],
            },
            {
              nombre: 'Particular',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: '4G' },
                { nombre: 'Wimax' },
                { nombre: 'Telefonía Fija' },
                { nombre: 'Telefonía Móvil' },
              ],
            },
          ],
        },
        { nombre: 'Envío de producto' },
      ],
    },
    {
      nombre: 'Soporte Técnico',
      color: '#3b82f6',
      orden: 2,
      subcategorias: [
        {
          nombre: 'Particular',
          hijos: [
            { nombre: 'Alta nueva' },
            {
              nombre: 'Incidencia',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: '4G' },
                { nombre: 'Wimax' },
                { nombre: 'Telefonía Fija' },
                { nombre: 'Telefonía Móvil' },
              ],
            },
            {
              nombre: 'Petición',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: '4G' },
                { nombre: 'Wimax' },
                { nombre: 'Telefonía Fija' },
                { nombre: 'Telefonía Móvil' },
              ],
            },
          ],
        },
        {
          nombre: 'Empresa',
          hijos: [
            { nombre: 'Alta nueva' },
            {
              nombre: 'Incidencia',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: '4G' },
                { nombre: 'Wimax' },
                { nombre: 'Telefonía Fija' },
                { nombre: 'Telefonía Móvil' },
                { nombre: 'Centralita' },
                { nombre: 'Mantenimiento' },
              ],
            },
            {
              nombre: 'Petición',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: '4G' },
                { nombre: 'Wimax' },
                { nombre: 'Telefonía Fija' },
                { nombre: 'Telefonía Móvil' },
                { nombre: 'Centralita' },
                { nombre: 'Mantenimiento' },
              ],
            },
            { nombre: 'Mantenimiento preventivo' },
          ],
        },
        {
          nombre: 'Infraestructura',
          hijos: [
            {
              nombre: 'Incidencia',
              hijos: [
                { nombre: 'Fibra' },
                { nombre: 'Datacenter' },
              ],
            },
            { nombre: 'Desarrollos nuevos' },
            { nombre: 'Actualizaciones' },
          ],
        },
      ],
    },
    {
      nombre: 'Administración',
      color: '#8b5cf6',
      orden: 3,
      subcategorias: [
        { nombre: 'Facturación' },
        { nombre: 'Contabilidad' },
        { nombre: 'Gestión interna' },
        { nombre: 'Documentación' },
        { nombre: 'Proveedores' },
      ],
    },
    {
      nombre: 'Proyectos',
      color: '#10b981',
      orden: 4,
      subcategorias: [
        { nombre: 'Planificación' },
        { nombre: 'Ejecución' },
        { nombre: 'Seguimiento' },
        { nombre: 'Entrega' },
        { nombre: 'Reunión de proyecto' },
      ],
    },
    {
      nombre: 'Dirección',
      color: '#ef4444',
      orden: 5,
      subcategorias: [
        { nombre: 'Reunión estratégica' },
        { nombre: 'Supervisión' },
        { nombre: 'Planificación' },
        { nombre: 'Gestión de equipo' },
      ],
    },
    {
      nombre: 'Formación',
      color: '#06b6d4',
      orden: 6,
      subcategorias: [
        { nombre: 'Formación interna' },
        { nombre: 'Formación externa' },
        { nombre: 'Certificación' },
        { nombre: 'Autoformación' },
      ],
    },
  ];

  for (const cat of categorias) {
    await prisma.categoriaTimesheet.upsert({
      where: { nombre: cat.nombre },
      update: { color: cat.color, orden: cat.orden, subcategorias: cat.subcategorias },
      create: { nombre: cat.nombre, color: cat.color, orden: cat.orden, subcategorias: cat.subcategorias },
    });
    const countNodes = (nodes) => nodes.reduce((sum, n) => sum + 1 + (n.hijos ? countNodes(n.hijos) : 0), 0);
    console.log(`✓ ${cat.nombre} — ${countNodes(cat.subcategorias)} opciones en árbol`);
  }

  console.log('\n✅ Categorías jerárquicas actualizadas correctamente');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
