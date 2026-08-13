import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapeo de secciones legacy a códigos de área (del RoleContext)
const SECTION_TO_AREAS: Record<string, string[]> = {
  'dashboard': ['admin'],
  'tarifas': ['admin.tarifas'],
  'clientes': ['admin.clientes', 'admin.clientes.todos', 'admin.clientes.migracion_adamo', 'admin.clientes.ggcc.draxton', 'admin.clientes.ggcc.draxton.finanzas', 'admin.clientes.ggcc.draxton.contratos', 'admin.clientes.ggcc.draxton.personal', 'admin.clientes.ggcc.draxton.seguimiento', 'admin.clientes.ggcc.draxton.kpis', 'admin.clientes.ggcc.draxton.informes', 'admin.clientes.ggcc.draxton.proyectos', 'admin.clientes.ggcc.draxton.proyectos_singulares', 'admin.clientes.ggcc.draxton.contrato_guardias'],
  'leads': ['admin.leads', 'admin.leads.generales', 'admin.leads.mantenimiento', 'admin.leads.soluciones'],
  'comunicados': ['admin.comunicados'],
  'altas-pendientes': ['admin.altas_pendientes'],
  'contratos': ['admin.contratos'],
  'facturacion': ['admin.facturacion'],
  'finanzas': ['admin.finanzas', 'admin.finanzas.facturas', 'admin.finanzas.facturas_emitidas', 'admin.finanzas.movimientos', 'admin.finanzas.conciliacion', 'admin.finanzas.conciliacion_remesas', 'admin.finanzas.cobros_pendientes', 'admin.finanzas.datos_fiscales', 'admin.finanzas.importar', 'admin.finanzas.exportar_a3', 'admin.finanzas.analitica_costes', 'admin.finanzas.ggcc_draxton'],
  'estadisticas': ['admin.estadisticas'],
  'usuarios': ['admin.usuarios'],
  'subida-precios': ['admin.subida_precios'],
  'personal': ['admin.empleados', 'admin.empleados.nominas', 'admin.empleados.calendario', 'admin.empleados.vacaciones'],
  'proyectos': ['admin.proyectos'],
  'historial': ['admin.historial'],
  'configuracion': ['admin.configuracion'],
};

// Permisos por rol (del RoleContext actual)
const PERMISOS_POR_ROL: Record<string, string[]> = {
  GERENTE: [
    'dashboard', 'tarifas', 'clientes', 'leads', 'comunicados',
    'altas-pendientes', 'contratos', 'facturacion', 'finanzas',
    'estadisticas', 'usuarios', 'subida-precios', 'personal',
    'proyectos', 'historial', 'configuracion'
  ],
  MARKETING: [
    'dashboard', 'leads', 'comunicados', 'estadisticas'
  ],
  VENTAS: [
    'dashboard', 'tarifas', 'clientes', 'leads', 'altas-pendientes', 'contratos'
  ],
  CONTABILIDAD: [
    'dashboard', 'facturacion', 'finanzas', 'subida-precios', 'estadisticas'
  ],
  RRHH: [
    'dashboard', 'personal'
  ],
};

const PERFIL_COLORS: Record<string, string> = {
  GERENTE: '#7c3aed',
  MARKETING: '#ec4899',
  VENTAS: '#2563eb',
  CONTABILIDAD: '#059669',
  RRHH: '#d97706',
};

const PERFIL_DESCRIPTIONS: Record<string, string> = {
  GERENTE: 'Acceso completo a todas las secciones del panel de administración (excepto tickets financieros)',
  MARKETING: 'Acceso a leads, comunicados y estadísticas',
  VENTAS: 'Acceso a tarifas, clientes, leads, altas pendientes y contratos',
  CONTABILIDAD: 'Acceso a facturación, finanzas, subida de precios y estadísticas',
  RRHH: 'Acceso a la gestión de personal, nóminas y calendario',
};

async function main() {
  // Obtener todas las áreas existentes
  const areas = await prisma.permisoArea.findMany({ where: { activo: true } });
  const areaSet = new Set(areas.map(a => a.codigo));

  for (const [rol, secciones] of Object.entries(PERMISOS_POR_ROL)) {
    // Construir permisos del perfil
    const permisos: Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }> = [];
    
    for (const seccion of secciones) {
      const areaCodigos = SECTION_TO_AREAS[seccion] || [];
      for (const codigo of areaCodigos) {
        if (areaSet.has(codigo)) {
          // No duplicar
          if (!permisos.find(p => p.areaCodigo === codigo)) {
            permisos.push({ areaCodigo: codigo, lectura: true, escritura: true });
          }
        }
      }
    }

    // Crear o actualizar perfil
    const nombre = rol.charAt(0) + rol.slice(1).toLowerCase();
    await prisma.perfilPermisos.upsert({
      where: { nombre },
      update: {
        descripcion: PERFIL_DESCRIPTIONS[rol],
        color: PERFIL_COLORS[rol],
        permisos: permisos,
        activo: true,
      },
      create: {
        nombre,
        descripcion: PERFIL_DESCRIPTIONS[rol],
        color: PERFIL_COLORS[rol],
        permisos: permisos,
        activo: true,
      },
    });

    console.log(`✓ Perfil "${nombre}" creado con ${permisos.length} áreas`);
  }

  console.log('\nPerfiles creados correctamente.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
