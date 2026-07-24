// Script para registrar todas las áreas existentes del panel admin
// Ejecutar: node -e "require('esbuild-register/dist/node').register({})" && npx ts-node scripts/seed-permisos-areas.ts
// O simplemente: node --loader ts-node/esm scripts/seed-permisos-areas.ts

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const areas = [
  // Nivel 1: Secciones principales
  { codigo: 'admin', nombre: 'Panel Admin', padre: null, orden: 0 },

  // Nivel 2: Módulos principales
  { codigo: 'admin.clientes', nombre: 'Clientes', padre: 'admin', orden: 1 },
  { codigo: 'admin.finanzas', nombre: 'Finanzas', padre: 'admin', orden: 2 },
  { codigo: 'admin.empleados', nombre: 'Empleados', padre: 'admin', orden: 3 },
  { codigo: 'admin.tarifas', nombre: 'Tarifas', padre: 'admin', orden: 4 },
  { codigo: 'admin.leads', nombre: 'Leads', padre: 'admin', orden: 5 },
  { codigo: 'admin.facturacion', nombre: 'Facturación', padre: 'admin', orden: 6 },
  { codigo: 'admin.estadisticas', nombre: 'Estadísticas', padre: 'admin', orden: 7 },
  { codigo: 'admin.comunicados', nombre: 'Comunicados', padre: 'admin', orden: 8 },
  { codigo: 'admin.configuracion', nombre: 'Configuración', padre: 'admin', orden: 9 },
  { codigo: 'admin.usuarios', nombre: 'Usuarios', padre: 'admin', orden: 10 },
  { codigo: 'admin.historial', nombre: 'Historial', padre: 'admin', orden: 11 },
  { codigo: 'admin.proyectos', nombre: 'Proyectos', padre: 'admin', orden: 12 },
  { codigo: 'admin.contratos', nombre: 'Contratos', padre: 'admin', orden: 13 },
  { codigo: 'admin.subida_precios', nombre: 'Subida de Precios', padre: 'admin', orden: 14 },
  { codigo: 'admin.altas_pendientes', nombre: 'Altas Pendientes', padre: 'admin', orden: 15 },

  // Nivel 3: Clientes > GGCC
  { codigo: 'admin.clientes.ggcc', nombre: 'Grandes Cuentas', padre: 'admin.clientes', orden: 1 },
  { codigo: 'admin.clientes.migracion_adamo', nombre: 'Migración Adamo', padre: 'admin.clientes', orden: 2 },

  // Nivel 4: GGCC > Draxton
  { codigo: 'admin.clientes.ggcc.draxton', nombre: 'GGCC > Draxton', padre: 'admin.clientes.ggcc', orden: 1 },

  // Nivel 5: Draxton subapartados
  { codigo: 'admin.clientes.ggcc.draxton.dashboard', nombre: 'Draxton > Dashboard', padre: 'admin.clientes.ggcc.draxton', orden: 1 },
  { codigo: 'admin.clientes.ggcc.draxton.contratos', nombre: 'Draxton > Contratos', padre: 'admin.clientes.ggcc.draxton', orden: 2 },
  { codigo: 'admin.clientes.ggcc.draxton.finanzas', nombre: 'Draxton > Finanzas', padre: 'admin.clientes.ggcc.draxton', orden: 3 },
  { codigo: 'admin.clientes.ggcc.draxton.personal', nombre: 'Draxton > Personal', padre: 'admin.clientes.ggcc.draxton', orden: 4 },
  { codigo: 'admin.clientes.ggcc.draxton.seguimiento', nombre: 'Draxton > Seguimiento', padre: 'admin.clientes.ggcc.draxton', orden: 5 },
  { codigo: 'admin.clientes.ggcc.draxton.kpis', nombre: 'Draxton > KPIs', padre: 'admin.clientes.ggcc.draxton', orden: 6 },
  { codigo: 'admin.clientes.ggcc.draxton.informes', nombre: 'Draxton > Informes', padre: 'admin.clientes.ggcc.draxton', orden: 7 },
  { codigo: 'admin.clientes.ggcc.draxton.proyectos', nombre: 'Draxton > Proyectos Internos', padre: 'admin.clientes.ggcc.draxton', orden: 8 },
  { codigo: 'admin.clientes.ggcc.draxton.proyectos_singulares', nombre: 'Draxton > Proyectos Singulares', padre: 'admin.clientes.ggcc.draxton', orden: 9 },
  { codigo: 'admin.clientes.ggcc.draxton.contrato_guardias', nombre: 'Draxton > Contrato Guardias', padre: 'admin.clientes.ggcc.draxton', orden: 10 },

  // Nivel 3: Finanzas subapartados
  { codigo: 'admin.finanzas.facturas', nombre: 'Finanzas > Facturas', padre: 'admin.finanzas', orden: 1 },
  { codigo: 'admin.finanzas.facturas_emitidas', nombre: 'Finanzas > Facturas Emitidas', padre: 'admin.finanzas', orden: 2 },
  { codigo: 'admin.finanzas.movimientos', nombre: 'Finanzas > Movimientos', padre: 'admin.finanzas', orden: 3 },
  { codigo: 'admin.finanzas.conciliacion', nombre: 'Finanzas > Conciliación', padre: 'admin.finanzas', orden: 4 },
  { codigo: 'admin.finanzas.conciliacion_remesas', nombre: 'Finanzas > Conciliación Remesas', padre: 'admin.finanzas', orden: 5 },
  { codigo: 'admin.finanzas.cobros_pendientes', nombre: 'Finanzas > Cobros Pendientes', padre: 'admin.finanzas', orden: 6 },
  { codigo: 'admin.finanzas.datos_fiscales', nombre: 'Finanzas > Datos Fiscales', padre: 'admin.finanzas', orden: 7 },
  { codigo: 'admin.finanzas.importar', nombre: 'Finanzas > Importar', padre: 'admin.finanzas', orden: 8 },
  { codigo: 'admin.finanzas.exportar_a3', nombre: 'Finanzas > Exportar A3', padre: 'admin.finanzas', orden: 9 },
  { codigo: 'admin.finanzas.analitica_costes', nombre: 'Finanzas > Analítica de Costes', padre: 'admin.finanzas', orden: 10 },
  { codigo: 'admin.finanzas.tickets', nombre: 'Finanzas > Tickets', padre: 'admin.finanzas', orden: 11 },
  { codigo: 'admin.finanzas.ggcc_draxton', nombre: 'Finanzas > GGCC Draxton', padre: 'admin.finanzas', orden: 12 },

  // Nivel 3: Empleados subapartados
  { codigo: 'admin.empleados.listado', nombre: 'Empleados > Listado', padre: 'admin.empleados', orden: 1 },
  { codigo: 'admin.empleados.nominas', nombre: 'Empleados > Nóminas', padre: 'admin.empleados', orden: 2 },
  { codigo: 'admin.empleados.calendario', nombre: 'Empleados > Calendario', padre: 'admin.empleados', orden: 3 },
  { codigo: 'admin.empleados.vacaciones', nombre: 'Empleados > Vacaciones', padre: 'admin.empleados', orden: 4 },

  // Nivel 3: Leads subapartados
  { codigo: 'admin.leads.generales', nombre: 'Leads > Generales', padre: 'admin.leads', orden: 1 },
  { codigo: 'admin.leads.mantenimiento', nombre: 'Leads > Mantenimiento IT', padre: 'admin.leads', orden: 2 },
  { codigo: 'admin.leads.soluciones', nombre: 'Leads > Soluciones', padre: 'admin.leads', orden: 3 },
]

async function main() {
  console.log('Registrando áreas de permisos...')
  
  for (const area of areas) {
    await prisma.permisoArea.upsert({
      where: { codigo: area.codigo },
      update: { nombre: area.nombre, padre: area.padre, orden: area.orden },
      create: {
        codigo: area.codigo,
        nombre: area.nombre,
        padre: area.padre,
        orden: area.orden,
        activo: true,
      },
    })
    console.log(`  ✓ ${area.codigo} → ${area.nombre}`)
  }

  console.log(`\n✅ ${areas.length} áreas registradas correctamente.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
