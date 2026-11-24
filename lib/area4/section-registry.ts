/**
 * Registro único, estático y revisable de superficies del panel de Área 4.
 * No cambia URLs ni autoriza por sí mismo: la política de servidor se resuelve aparte.
 * La batería verifica cada página y API administrativa, portal y peticiones propias.
 * Sistemas y servicios, Presupuesto e Impuestos no tienen rutas independientes en este árbol;
 * no se fabrican URLs ni códigos para ellos. Hacienda y la configuración mantienen sus áreas actuales.
 */
export const AREA4_MENU_GROUPS = ['Inicio', 'Comercial', 'Clientes y contratos', 'Finanzas', 'Personas', 'Operación', 'Administración'] as const
export type Area4MenuGroup = typeof AREA4_MENU_GROUPS[number]
export type Area4SurfaceKind = 'page' | 'api'
export type Area4Surface = Readonly<{ path: string; kind: Area4SurfaceKind }>
export type Area4Section = Readonly<{ key: string; areaCode: string; group: Area4MenuGroup; surfaces: readonly Area4Surface[] }>

export const AREA4_SECTION_REGISTRY: readonly Area4Section[] = [
  {
    key: 'estadisticas', areaCode: 'admin.estadisticas', group: 'Inicio',
    surfaces: [
      { path: '/admin/estadisticas', kind: 'page' },
      { path: '/api/admin/estadisticas', kind: 'api' },
    ],
  },
  {
    key: 'inicio', areaCode: 'admin', group: 'Inicio',
    surfaces: [
      { path: '/admin', kind: 'page' },
    ],
  },
  {
    key: 'asistente', areaCode: 'admin.asistente', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente', kind: 'page' },
      { path: '/api/admin/asistente/derechos', kind: 'api' },
      { path: '/api/admin/asistente/escalados', kind: 'api' },
      { path: '/api/admin/asistente/escalados/[id]', kind: 'api' },
      { path: '/api/admin/asistente/escalados/[id]/contacto', kind: 'api' },
      { path: '/api/admin/asistente/huecos/[id]', kind: 'api' },
      { path: '/api/admin/asistente/retencion', kind: 'api' },
    ],
  },
  {
    key: 'comunicados', areaCode: 'admin.comunicados', group: 'Comercial',
    surfaces: [
      { path: '/admin/comunicados', kind: 'page' },
      { path: '/api/admin/comunicados', kind: 'api' },
      { path: '/api/admin/comunicados/asistente-ia', kind: 'api' },
      { path: '/api/admin/comunicados/destinatarios', kind: 'api' },
      { path: '/api/admin/comunicados/enviar', kind: 'api' },
      { path: '/api/admin/comunicados/preview', kind: 'api' },
    ],
  },
  {
    key: 'crm', areaCode: 'admin.crm', group: 'Comercial',
    surfaces: [
      { path: '/admin/crm', kind: 'page' },
      { path: '/api/admin/crm/leads/[tipo]/[id]', kind: 'api' },
      { path: '/api/admin/crm/negocios/sync', kind: 'api' },
      { path: '/api/admin/crm/tareas/[id]', kind: 'api' },
      { path: '/api/admin/hubspot-create-list', kind: 'api' },
      { path: '/api/admin/integraciones/outlook', kind: 'api' },
      { path: '/api/admin/integraciones/outlook/callback', kind: 'api' },
      { path: '/api/admin/integraciones/outlook/connect', kind: 'api' },
    ],
  },
  {
    key: 'leads', areaCode: 'admin.leads', group: 'Comercial',
    surfaces: [
      { path: '/admin/leads', kind: 'page' },
      { path: '/admin/leads/[id]', kind: 'page' },
      { path: '/api/admin/leads', kind: 'api' },
      { path: '/api/admin/leads/[id]', kind: 'api' },
      { path: '/api/admin/leads/[id]/cuestionario', kind: 'api' },
      { path: '/api/admin/leads/[id]/enviar-email', kind: 'api' },
      { path: '/api/admin/leads/[id]/generar-auditoria', kind: 'api' },
      { path: '/api/admin/leads/[id]/hubspot-deal', kind: 'api' },
      { path: '/api/admin/leads/generar-propuesta', kind: 'api' },
      { path: '/api/admin/leads/generar-propuesta/pdf', kind: 'api' },
    ],
  },
  {
    key: 'subida-precios', areaCode: 'admin.subida_precios', group: 'Comercial',
    surfaces: [
      { path: '/admin/subida-precios', kind: 'page' },
      { path: '/api/admin/subida-precios/dataset', kind: 'api' },
      { path: '/api/admin/subida-precios/escenarios', kind: 'api' },
      { path: '/api/admin/subida-precios/escenarios/[id]', kind: 'api' },
      { path: '/api/admin/subida-precios/escenarios/[id]/aprobar', kind: 'api' },
      { path: '/api/admin/subida-precios/escenarios/[id]/export', kind: 'api' },
      { path: '/api/admin/subida-precios/tipo-cliente', kind: 'api' },
    ],
  },
  {
    key: 'tarifas', areaCode: 'admin.tarifas', group: 'Comercial',
    surfaces: [
      { path: '/admin/tarifas', kind: 'page' },
      { path: '/admin/tarifas/[id]/editar', kind: 'page' },
      { path: '/admin/tarifas/nueva', kind: 'page' },
      { path: '/api/admin/tarifas', kind: 'api' },
      { path: '/api/admin/tarifas/[id]', kind: 'api' },
      { path: '/api/admin/tarifas/[id]/destacada', kind: 'api' },
      { path: '/api/admin/tarifas/[id]/duplicate', kind: 'api' },
      { path: '/api/admin/tarifas/[id]/toggle', kind: 'api' },
      { path: '/api/admin/tarifas/[id]/web-publish', kind: 'api' },
      { path: '/api/admin/tarifas/reorder', kind: 'api' },
    ],
  },
  {
    key: 'altas-pendientes', areaCode: 'admin.altas_pendientes', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/altas-pendientes', kind: 'page' },
      { path: '/admin/altas-pendientes/[id]', kind: 'page' },
      { path: '/api/admin/altas', kind: 'api' },
      { path: '/api/admin/altas/[id]', kind: 'api' },
      { path: '/api/admin/altas/[id]/documentos/[docId]', kind: 'api' },
      { path: '/api/admin/altas/[id]/estado', kind: 'api' },
    ],
  },
  {
    key: 'clientes', areaCode: 'admin.clientes', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes', kind: 'page' },
      { path: '/admin/clientes/[id]/editar', kind: 'page' },
      { path: '/admin/clientes/nuevo', kind: 'page' },
      { path: '/api/admin/clientes', kind: 'api' },
      { path: '/api/admin/clientes/[id]', kind: 'api' },
      { path: '/api/admin/clientes/[id]/contratos', kind: 'api' },
      { path: '/api/admin/clientes/[id]/facturas', kind: 'api' },
      { path: '/api/admin/clientes/[id]/newsletter', kind: 'api' },
    ],
  },
  {
    key: 'contratos', areaCode: 'admin.contratos', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/contratos', kind: 'page' },
      { path: '/api/admin/contratos', kind: 'api' },
    ],
  },
  {
    key: 'draxton-actualizaciones', areaCode: 'admin.clientes.ggcc.draxton.actualizaciones', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/actualizaciones', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/actualizaciones', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/actualizaciones/informe', kind: 'api' },
    ],
  },
  {
    key: 'draxton-contrato-guardias', areaCode: 'admin.clientes.ggcc.draxton.contrato_guardias', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/contrato-guardias', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/guardias', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/guardias/informe', kind: 'api' },
    ],
  },
  {
    key: 'draxton-informes', areaCode: 'admin.clientes.ggcc.draxton.informes', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/informes', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/informes', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/informes/generar', kind: 'api' },
    ],
  },
  {
    key: 'draxton-kpis', areaCode: 'admin.clientes.ggcc.draxton.kpis', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/kpis', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/kpis/dashboard', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/kpis/importar-tickets', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/kpis/informe-ejecutivo', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/kpis/mensuales', kind: 'api' },
    ],
  },
  {
    key: 'draxton-organigrama', areaCode: 'admin.clientes.ggcc.draxton.organigrama', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/organigrama', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/organigrama', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/organigrama/imprimir', kind: 'api' },
    ],
  },
  {
    key: 'draxton-personal', areaCode: 'admin.clientes.ggcc.draxton.personal', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/personal', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/personal-contrato', kind: 'api' },
    ],
  },
  {
    key: 'draxton-proyectos', areaCode: 'admin.clientes.ggcc.draxton.proyectos', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/proyectos', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-contrato', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-contrato/informe-pdf', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-contrato/ocr', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-facturas', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-personal', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/proyectos-proveedores', kind: 'api' },
    ],
  },
  {
    key: 'draxton-seguimiento', areaCode: 'admin.clientes.ggcc.draxton.seguimiento', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/seguimiento', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/seguimiento/balance-mensual', kind: 'api' },
    ],
  },
  {
    key: 'proyectos-cliente', areaCode: 'admin.proyectos', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/proyectos', kind: 'page' },
      { path: '/api/admin/proyectos', kind: 'api' },
    ],
  },
  {
    key: 'conciliacion', areaCode: 'admin.finanzas.conciliacion', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/conciliacion', kind: 'page' },
      { path: '/admin/finanzas/conciliacion/manual', kind: 'page' },
      { path: '/admin/finanzas/conciliar', kind: 'page' },
      { path: '/admin/finanzas/modo-facil', kind: 'page' },
      { path: '/admin/finanzas/para-pedir', kind: 'page' },
      { path: '/api/admin/finanzas/conciliacion', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion/auto', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion/manual', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion/sugerencias', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar/archivo/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar/confirming-inventario', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar/detalle/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar/historial', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar/intereses', kind: 'api' },
      { path: '/api/admin/finanzas/conciliar/remesa-preview', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/automaticas', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/automaticas/tramos', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/cobros', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/deshacer', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/documentos/[id]/archivo', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/foto', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/para-pedir', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/perfil', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/reglas', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/tarjetas', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/terceros', kind: 'api' },
      { path: '/api/admin/finanzas/modo-facil/terceros/bloque', kind: 'api' },
    ],
  },
  {
    key: 'facturacion', areaCode: 'admin.facturacion', group: 'Finanzas',
    surfaces: [
      { path: '/admin/facturacion', kind: 'page' },
      { path: '/api/admin/facturacion', kind: 'api' },
      { path: '/api/admin/facturacion-banco', kind: 'api' },
      { path: '/api/admin/facturacion/resumen', kind: 'api' },
    ],
  },
  {
    key: 'finanzas', areaCode: 'admin.finanzas', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas', kind: 'page' },
      { path: '/admin/finanzas/analitica-cliente', kind: 'page' },
      { path: '/admin/finanzas/centros-coste', kind: 'page' },
      { path: '/admin/finanzas/conciliacion-v2', kind: 'page' },
      { path: '/admin/finanzas/pendientes', kind: 'page' },
      { path: '/api/admin/finanzas/analitica-cliente', kind: 'api' },
      { path: '/api/admin/finanzas/centros-coste', kind: 'api' },
      { path: '/api/admin/finanzas/centros-coste/asignar', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-propuestas', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-v2', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-v2/heredados-bloque', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-v2/heredados-excluidas', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-v2/heredados-recibos', kind: 'api' },
      { path: '/api/admin/finanzas/confirming-draxton', kind: 'api' },
      { path: '/api/admin/finanzas/cortes-cobertura', kind: 'api' },
      { path: '/api/admin/finanzas/cuentas', kind: 'api' },
      { path: '/api/admin/finanzas/dashboard', kind: 'api' },
      { path: '/api/admin/finanzas/imputacion', kind: 'api' },
      { path: '/api/admin/finanzas/nominas', kind: 'api' },
      { path: '/api/admin/finanzas/nominas-propuestas', kind: 'api' },
      { path: '/api/admin/finanzas/nominas/empleados', kind: 'api' },
      { path: '/api/admin/finanzas/pendientes', kind: 'api' },
      { path: '/api/admin/finanzas/pendientes/documento', kind: 'api' },
      { path: '/api/admin/finanzas/remesas/b6', kind: 'api' },
      { path: '/api/admin/finanzas/rentabilidad', kind: 'api' },
      { path: '/api/admin/finanzas/rentabilidad/lineas', kind: 'api' },
      { path: '/api/admin/finanzas/rentabilidad/proveedores', kind: 'api' },
      { path: '/api/admin/finanzas/rentabilidad/servicios', kind: 'api' },
      { path: '/api/admin/finanzas/sincronizar-onedrive', kind: 'api' },
      { path: '/api/admin/finanzas/sync-jobs', kind: 'api' },
    ],
  },
  {
    key: 'personal', areaCode: 'admin.empleados', group: 'Personas',
    surfaces: [
      { path: '/admin/empleados', kind: 'page' },
      { path: '/admin/empleados/[id]', kind: 'page' },
      { path: '/admin/empleados/escenarios-salariales', kind: 'page' },
      { path: '/admin/empleados/organigrama', kind: 'page' },
      { path: '/admin/empleados/plan-carrera', kind: 'page' },
      { path: '/admin/gastos-extras', kind: 'page' },
      { path: '/api/admin/empleados', kind: 'api' },
      { path: '/api/admin/empleados/[id]', kind: 'api' },
      { path: '/api/admin/empleados/[id]/documentos', kind: 'api' },
      { path: '/api/admin/empleados/[id]/documentos/[documentoId]', kind: 'api' },
      { path: '/api/admin/empleados/condiciones-salariales', kind: 'api' },
      { path: '/api/admin/empleados/escenarios-salariales', kind: 'api' },
      { path: '/api/admin/empleados/escenarios-salariales/informe', kind: 'api' },
      { path: '/api/admin/empleados/organigrama', kind: 'api' },
      { path: '/api/admin/empleados/organigrama/informe', kind: 'api' },
      { path: '/api/admin/empleados/plan-carrera', kind: 'api' },
      { path: '/api/admin/empleados/simulacion-salarial', kind: 'api' },
      { path: '/api/admin/empleados/simulacion-salarial/informe', kind: 'api' },
      { path: '/api/admin/gastos-extras', kind: 'api' },
    ],
  },
  {
    key: 'portal-empleado', areaCode: 'empleado.portal', group: 'Personas',
    surfaces: [
      { path: '/api/empleado/alertas', kind: 'api' },
      { path: '/api/empleado/buscar-clientes', kind: 'api' },
      { path: '/api/empleado/buscar-proyectos', kind: 'api' },
      { path: '/api/empleado/empleados-lista', kind: 'api' },
      { path: '/api/empleado/gastos', kind: 'api' },
      { path: '/api/empleado/gastos/aprobar', kind: 'api' },
      { path: '/api/empleado/gastos/clientes', kind: 'api' },
      { path: '/api/empleado/imputaciones', kind: 'api' },
      { path: '/api/empleado/nominas', kind: 'api' },
      { path: '/api/empleado/usuarios', kind: 'api' },
      { path: '/empleado', kind: 'page' },
      { path: '/empleado/gastos', kind: 'page' },
      { path: '/empleado/gastos/aprobar', kind: 'page' },
      { path: '/empleado/imputaciones', kind: 'page' },
      { path: '/empleado/nominas', kind: 'page' },
    ],
  },
  {
    key: 'aapp', areaCode: 'admin.aapp', group: 'Operación',
    surfaces: [
      { path: '/admin/aapp', kind: 'page' },
      { path: '/admin/aapp/cnmc', kind: 'page' },
      { path: '/admin/aapp/hacienda', kind: 'page' },
      { path: '/admin/aapp/seguridad-social', kind: 'page' },
      { path: '/api/admin/aapp', kind: 'api' },
    ],
  },
  {
    key: 'certificaciones', areaCode: 'admin.certificaciones', group: 'Operación',
    surfaces: [
      { path: '/admin/certificaciones', kind: 'page' },
      { path: '/admin/certificaciones/[norma]', kind: 'page' },
      { path: '/api/admin/certificaciones', kind: 'api' },
      { path: '/api/admin/certificaciones/documentos', kind: 'api' },
      { path: '/api/admin/certificaciones/documentos/[id]', kind: 'api' },
    ],
  },
  {
    key: 'configuracion', areaCode: 'admin.configuracion', group: 'Operación',
    surfaces: [
      { path: '/admin/configuracion', kind: 'page' },
      { path: '/api/admin/configuracion/categorias', kind: 'api' },
      { path: '/api/admin/configuracion/categorias/[id]', kind: 'api' },
      { path: '/api/admin/configuracion/categorias/[id]/subcategorias', kind: 'api' },
      { path: '/api/admin/configuracion/categorias/[id]/subcategorias/[subId]', kind: 'api' },
      { path: '/api/admin/configuracion/estrategias', kind: 'api' },
      { path: '/api/admin/configuracion/estrategias/[id]', kind: 'api' },
    ],
  },
  {
    key: 'historial', areaCode: 'admin.historial', group: 'Operación',
    surfaces: [
      { path: '/admin/historial', kind: 'page' },
      { path: '/api/admin/historial', kind: 'api' },
      { path: '/api/admin/historial/[id]', kind: 'api' },
    ],
  },
  {
    key: 'imputaciones', areaCode: 'admin.imputaciones', group: 'Operación',
    surfaces: [
      { path: '/admin/imputaciones', kind: 'page' },
      { path: '/api/admin/imputaciones', kind: 'api' },
    ],
  },
  {
    key: 'peticiones', areaCode: 'admin.peticiones', group: 'Operación',
    surfaces: [
      { path: '/admin/peticiones', kind: 'page' },
      { path: '/api/admin/peticiones', kind: 'api' },
    ],
  },
  {
    key: 'proyectos-internos', areaCode: 'admin.proyectos_internos', group: 'Operación',
    surfaces: [
      { path: '/admin/proyectos-internos', kind: 'page' },
    ],
  },
  {
    key: 'actuar-como', areaCode: 'admin.actuar_como', group: 'Administración',
    surfaces: [
      { path: '/admin/actuar-como', kind: 'page' },
      { path: '/api/admin/actuar-como', kind: 'api' },
      { path: '/api/admin/actuar-como/registro', kind: 'api' },
    ],
  },
  {
    key: 'auditoria', areaCode: 'admin.auditoria', group: 'Administración',
    surfaces: [
      { path: '/admin/auditoria', kind: 'page' },
      { path: '/api/admin/auditoria', kind: 'api' },
    ],
  },
  {
    key: 'usuarios-permisos', areaCode: 'admin.usuarios', group: 'Administración',
    surfaces: [
      { path: '/admin/usuarios', kind: 'page' },
      { path: '/api/admin/permisos', kind: 'api' },
      { path: '/api/admin/usuarios', kind: 'api' },
      { path: '/api/admin/usuarios/[id]', kind: 'api' },
      { path: '/api/admin/usuarios/menu-presentacion', kind: 'api' },
    ],
  },
  {
    key: 'rentabilidad', areaCode: 'admin.rentabilidad', group: 'Finanzas',
    surfaces: [
      { path: '/admin/rentabilidad', kind: 'page' },
      { path: '/api/admin/rentabilidad', kind: 'api' },
      { path: '/api/admin/rentabilidad/exceptions', kind: 'api' },
      { path: '/api/admin/rentabilidad/external-costs', kind: 'api' },
      { path: '/api/admin/rentabilidad/recalculate', kind: 'api' },
      { path: '/api/admin/rentabilidad/rules', kind: 'api' },
      { path: '/api/admin/rentabilidad/sync', kind: 'api' },
    ],
  },
  {
    key: 'peticiones-propias', areaCode: 'empleado.peticiones', group: 'Personas',
    surfaces: [
      { path: '/api/peticiones', kind: 'api' },
      { path: '/peticiones', kind: 'page' },
    ],
  },
  {
    key: 'crm.contactos', areaCode: 'admin.crm.contactos', group: 'Comercial',
    surfaces: [
      { path: '/admin/crm/contactos', kind: 'page' },
      { path: '/admin/crm/contactos/[id]', kind: 'page' },
      { path: '/api/admin/crm/contactos/[id]', kind: 'api' },
      { path: '/api/admin/crm/contactos/[id]/actividades', kind: 'api' },
      { path: '/api/admin/crm/contactos/[id]/actividades/[actividadId]/outlook', kind: 'api' },
      { path: '/api/admin/crm/contactos/[id]/datos', kind: 'api' },
      { path: '/api/admin/crm/contactos/[id]/hubspot', kind: 'api' },
      { path: '/api/admin/crm/contactos/buscar', kind: 'api' },
      { path: '/api/admin/crm/contactos/sync-datos', kind: 'api' },
    ],
  },
  {
    key: 'crm.empresas', areaCode: 'admin.crm.empresas', group: 'Comercial',
    surfaces: [
      { path: '/admin/crm/empresas', kind: 'page' },
      { path: '/admin/crm/empresas/[id]', kind: 'page' },
      { path: '/api/admin/crm/empresas', kind: 'api' },
      { path: '/api/admin/crm/empresas/[id]', kind: 'api' },
      { path: '/api/admin/crm/empresas/[id]/clientes', kind: 'api' },
      { path: '/api/admin/crm/empresas/[id]/contactos', kind: 'api' },
      { path: '/api/admin/crm/empresas/buscar-clientes', kind: 'api' },
      { path: '/api/admin/crm/empresas/buscar-contactos', kind: 'api' },
      { path: '/api/admin/crm/empresas/sync', kind: 'api' },
    ],
  },
  {
    key: 'crm.listas', areaCode: 'admin.crm.listas', group: 'Comercial',
    surfaces: [
      { path: '/admin/crm/listas', kind: 'page' },
      { path: '/admin/crm/listas/[id]', kind: 'page' },
      { path: '/api/admin/crm/listas/[id]', kind: 'api' },
      { path: '/api/admin/crm/listas/sync', kind: 'api' },
    ],
  },
  {
    key: 'crm.particulares', areaCode: 'admin.crm.particulares', group: 'Comercial',
    surfaces: [
    ],
  },
  {
    key: 'crm.partners', areaCode: 'admin.crm.partners', group: 'Comercial',
    surfaces: [
      { path: '/admin/crm/partners', kind: 'page' },
    ],
  },
  {
    key: 'crm-isp', areaCode: 'admin.crm', group: 'Comercial',
    surfaces: [
      { path: '/admin/crm/isp', kind: 'page' },
      { path: '/api/admin/crm/isp/importar', kind: 'api' },
      { path: '/api/admin/crm/isp/vinculos', kind: 'api' },
    ],
  },
  {
    key: 'clientes.migracion_adamo', areaCode: 'admin.clientes.migracion_adamo', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/migracion-adamo', kind: 'page' },
      { path: '/api/admin/migracion-adamo', kind: 'api' },
      { path: '/api/admin/migracion-adamo/enviar-email', kind: 'api' },
    ],
  },
  {
    key: 'clientes.ggcc.draxton', areaCode: 'admin.clientes.ggcc.draxton', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/buscar-clientes', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/empresas-grupo', kind: 'api' },
    ],
  },
  {
    key: 'draxton-contratos', areaCode: 'admin.clientes.ggcc.draxton.contratos', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/contratos', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos-proveedor', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos-proveedor/analizar-pdf', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos/analizar-pdf', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos/informe-contrato', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos/informe-facturacion', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos/informe-pdf', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/contratos/rentabilidad-mensual', kind: 'api' },
    ],
  },
  {
    key: 'draxton-finanzas', areaCode: 'admin.clientes.ggcc.draxton.finanzas', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/finanzas', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/draxton/facturas-contrato', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/facturas-resumen', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/finanzas', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/draxton/finanzas/informe', kind: 'api' },
    ],
  },
  {
    key: 'draxton-proyectos-singulares', areaCode: 'admin.clientes.ggcc.draxton.proyectos_singulares', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/draxton/proyectos-singulares', kind: 'page' },
    ],
  },
  {
    key: 'clientes.ggcc.exagrid', areaCode: 'admin.clientes.ggcc.exagrid', group: 'Clientes y contratos',
    surfaces: [
      { path: '/admin/clientes/ggcc/exagrid', kind: 'page' },
      { path: '/admin/clientes/ggcc/exagrid/finanzas', kind: 'page' },
      { path: '/api/admin/clientes/ggcc/exagrid/finanzas', kind: 'api' },
      { path: '/api/admin/clientes/ggcc/exagrid/finanzas/pdf', kind: 'api' },
    ],
  },
  {
    key: 'finanzas.analitica_costes', areaCode: 'admin.finanzas.analitica_costes', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/analitica-costes', kind: 'page' },
      { path: '/admin/finanzas/analitica-costes/costes-operadora', kind: 'page' },
      { path: '/admin/finanzas/costes-operadora', kind: 'page' },
      { path: '/admin/finanzas/reparto-clientes', kind: 'page' },
      { path: '/api/admin/finanzas/analitica-costes', kind: 'api' },
      { path: '/api/admin/finanzas/costes-operadora', kind: 'api' },
      { path: '/api/admin/finanzas/costes-operadora/[id]/pdf', kind: 'api' },
      { path: '/api/admin/finanzas/costes-operadora/pendientes', kind: 'api' },
      { path: '/api/admin/finanzas/costes-operadora/pendientes/[id]/pdf', kind: 'api' },
      { path: '/api/admin/finanzas/reparto-clientes', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-facturas', areaCode: 'admin.finanzas.facturas', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/facturas', kind: 'page' },
      { path: '/admin/finanzas/facturas/[id]', kind: 'page' },
      { path: '/api/admin/finanzas/facturas', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/[id]/comentarios', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/[id]/movimientos-candidatos', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/[id]/ocr', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/[id]/pdf', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/calidad', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/calidad/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/calidad/[id]/pdf', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/estimacion', kind: 'api' },
      { path: '/api/admin/finanzas/facturas/proveedores', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-facturas-emitidas', areaCode: 'admin.finanzas.facturas_emitidas', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/facturas-emitidas', kind: 'page' },
      { path: '/api/admin/finanzas/facturas-emitidas', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-movimientos', areaCode: 'admin.finanzas.movimientos', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/movimientos', kind: 'page' },
      { path: '/api/admin/finanzas/movimientos', kind: 'api' },
      { path: '/api/admin/finanzas/movimientos/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/movimientos/[id]/archivos', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-remesas', areaCode: 'admin.finanzas.conciliacion_remesas', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/conciliacion-remesas', kind: 'page' },
      { path: '/api/admin/finanzas/conciliacion-remesas', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-remesas/detalle-remesa', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-remesas/importar-devoluciones', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-remesas/importar-pdf', kind: 'api' },
      { path: '/api/admin/finanzas/conciliacion-remesas/marcar-cobradas', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-cobros', areaCode: 'admin.finanzas.cobros_pendientes', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/cobros-pendientes', kind: 'page' },
      { path: '/api/admin/finanzas/cobros-pendientes', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-fiscal', areaCode: 'admin.finanzas.datos_fiscales', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/datos-fiscales', kind: 'page' },
      { path: '/admin/finanzas/datos-fiscales/[id]/mayor', kind: 'page' },
      { path: '/api/admin/finanzas/datos-fiscales', kind: 'api' },
      { path: '/api/admin/finanzas/datos-fiscales/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/datos-fiscales/[id]/mayor', kind: 'api' },
      { path: '/api/admin/finanzas/datos-fiscales/poblar', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-importar', areaCode: 'admin.finanzas.importar', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/estado-cuentas', kind: 'page' },
      { path: '/admin/finanzas/importar', kind: 'page' },
      { path: '/api/admin/finanzas/estado-cuentas', kind: 'api' },
      { path: '/api/admin/finanzas/importar-movimientos', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-exportar', areaCode: 'admin.finanzas.exportar_a3', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/exportar-a3', kind: 'page' },
      { path: '/api/admin/finanzas/exportar-a3', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-tickets', areaCode: 'admin.finanzas.tickets', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/tickets', kind: 'page' },
      { path: '/api/admin/finanzas/tickets', kind: 'api' },
      { path: '/api/admin/finanzas/tickets/[id]', kind: 'api' },
      { path: '/api/admin/finanzas/tickets/[id]/conciliar', kind: 'api' },
      { path: '/api/admin/finanzas/tickets/[id]/ocr', kind: 'api' },
      { path: '/api/admin/finanzas/tickets/upload', kind: 'api' },
    ],
  },
  {
    key: 'finanzas-draxton', areaCode: 'admin.finanzas.ggcc_draxton', group: 'Finanzas',
    surfaces: [
      { path: '/admin/finanzas/clientes/ggcc-draxton', kind: 'page' },
      { path: '/api/admin/finanzas/clientes/ggcc-draxton', kind: 'api' },
      { path: '/api/admin/finanzas/clientes/ggcc-draxton/confirming-lineas', kind: 'api' },
      { path: '/api/admin/finanzas/clientes/ggcc-draxton/informe-confirming', kind: 'api' },
      { path: '/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings', kind: 'api' },
    ],
  },
  {
    key: 'leads-mantenimiento', areaCode: 'admin.leads.mantenimiento', group: 'Comercial',
    surfaces: [
      { path: '/admin/leads-mantenimiento', kind: 'page' },
      { path: '/admin/leads-mantenimiento/[id]', kind: 'page' },
      { path: '/api/admin/leads-mantenimiento', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/[id]', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/[id]/cuestionario', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/[id]/enviar-email', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/[id]/hubspot-deal', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/[id]/pdf', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/[id]/propuesta-economica', kind: 'api' },
      { path: '/api/admin/leads-mantenimiento/hubspot-pipeline', kind: 'api' },
    ],
  },
  {
    key: 'leads-soluciones', areaCode: 'admin.leads.soluciones', group: 'Comercial',
    surfaces: [
      { path: '/admin/leads-soluciones', kind: 'page' },
      { path: '/admin/leads-soluciones/[id]', kind: 'page' },
      { path: '/api/admin/leads-soluciones', kind: 'api' },
      { path: '/api/admin/leads-soluciones/[id]', kind: 'api' },
      { path: '/api/admin/leads-soluciones/[id]/generar-oferta', kind: 'api' },
    ],
  },
  {
    key: 'personal-nominas', areaCode: 'admin.empleados.nominas', group: 'Personas',
    surfaces: [
      { path: '/admin/empleados/nominas', kind: 'page' },
      { path: '/api/admin/nominas/debug', kind: 'api' },
      { path: '/api/admin/nominas/download/[fileId]', kind: 'api' },
      { path: '/api/admin/nominas/sync', kind: 'api' },
      { path: '/api/admin/nominas/upload', kind: 'api' },
    ],
  },
  {
    key: 'personal-calendario', areaCode: 'admin.empleados.calendario', group: 'Personas',
    surfaces: [
      { path: '/admin/empleados/calendario', kind: 'page' },
      { path: '/api/admin/calendario', kind: 'api' },
      { path: '/api/admin/calendario/sync', kind: 'api' },
    ],
  },
  {
    key: 'personal-vacaciones', areaCode: 'admin.empleados.vacaciones', group: 'Personas',
    surfaces: [
      { path: '/admin/empleados/vacaciones', kind: 'page' },
      { path: '/api/admin/vacaciones', kind: 'api' },
    ],
  },
  {
    key: 'asistente.chat', areaCode: 'admin.asistente.chat', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/chat', kind: 'page' },
      { path: '/api/admin/asistente/chat', kind: 'api' },
    ],
  },
  {
    key: 'asistente.conocimiento', areaCode: 'admin.asistente.conocimiento', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/conocimiento', kind: 'page' },
      { path: '/api/admin/asistente/conocimiento', kind: 'api' },
      { path: '/api/admin/asistente/conocimiento/[id]', kind: 'api' },
      { path: '/api/admin/asistente/conocimiento/web-publica', kind: 'api' },
    ],
  },
  {
    key: 'asistente.conversaciones', areaCode: 'admin.asistente.conversaciones', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/conversaciones', kind: 'page' },
      { path: '/api/admin/asistente/conversaciones', kind: 'api' },
      { path: '/api/admin/asistente/conversaciones/[id]', kind: 'api' },
    ],
  },
  {
    key: 'asistente.leads', areaCode: 'admin.asistente.leads', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/leads', kind: 'page' },
      { path: '/api/admin/asistente/leads', kind: 'api' },
      { path: '/api/admin/asistente/leads/[id]', kind: 'api' },
      { path: '/api/admin/asistente/leads/[id]/contacto', kind: 'api' },
    ],
  },
  {
    key: 'asistente.aprendizaje', areaCode: 'admin.asistente.aprendizaje', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/aprendizaje', kind: 'page' },
      { path: '/api/admin/asistente/aprendizaje', kind: 'api' },
      { path: '/api/admin/asistente/aprendizaje/[id]', kind: 'api' },
    ],
  },
  {
    key: 'asistente.analitica', areaCode: 'admin.asistente.analitica', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/analitica', kind: 'page' },
      { path: '/api/admin/asistente/analitica', kind: 'api' },
    ],
  },
  {
    key: 'asistente.propuestas', areaCode: 'admin.asistente.propuestas', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/informes', kind: 'page' },
      { path: '/api/admin/asistente/informes', kind: 'api' },
      { path: '/api/admin/asistente/informes/propuestas/[id]', kind: 'api' },
    ],
  },
  {
    key: 'asistente.configuracion', areaCode: 'admin.asistente.configuracion', group: 'Comercial',
    surfaces: [
      { path: '/admin/asistente/configuracion', kind: 'page' },
      { path: '/api/admin/asistente/configuracion', kind: 'api' },
      { path: '/api/admin/asistente/configuracion/historial', kind: 'api' },
    ],
  },
  {
    key: 'certificaciones.iso_27001', areaCode: 'admin.certificaciones.iso_27001', group: 'Operación',
    surfaces: [
    ],
  },
  {
    key: 'certificaciones.tisax', areaCode: 'admin.certificaciones.tisax', group: 'Operación',
    surfaces: [
    ],
  },
  {
    key: 'certificaciones.cuestionarios', areaCode: 'admin.certificaciones.cuestionarios', group: 'Operación',
    surfaces: [
      { path: '/admin/certificaciones/cuestionarios', kind: 'page' },
      { path: '/api/admin/certificaciones/cuestionarios', kind: 'api' },
      { path: '/api/admin/certificaciones/cuestionarios/original', kind: 'api' },
    ],
  },
] as const
export type Area4MenuLeaf = Readonly<{ name: string; href: string; icon: string; section: string }>
export type Area4MenuItem = Area4MenuLeaf & Readonly<{ subitems?: readonly Area4MenuLeaf[] }>

/** Las ocho áreas técnicas ya existentes; no conceden los roots Clientes ni Draxton. */
export const AREA4_DRAXTON_TECHNICAL_MENU: readonly Area4MenuLeaf[] = [
  { name: 'Draxton · Actualizaciones', href: '/admin/clientes/ggcc/draxton/actualizaciones', icon: 'arrowPath', section: 'draxton-actualizaciones' },
  { name: 'Draxton · Contrato guardias', href: '/admin/clientes/ggcc/draxton/contrato-guardias', icon: 'shieldCheck', section: 'draxton-contrato-guardias' },
  { name: 'Draxton · Informes', href: '/admin/clientes/ggcc/draxton/informes', icon: 'documentText', section: 'draxton-informes' },
  { name: 'Draxton · KPIs', href: '/admin/clientes/ggcc/draxton/kpis', icon: 'chartBar', section: 'draxton-kpis' },
  { name: 'Draxton · Organigrama', href: '/admin/clientes/ggcc/draxton/organigrama', icon: 'userGroup', section: 'draxton-organigrama' },
  { name: 'Draxton · Personal', href: '/admin/clientes/ggcc/draxton/personal', icon: 'briefcase', section: 'draxton-personal' },
  { name: 'Draxton · Proyectos internos', href: '/admin/clientes/ggcc/draxton/proyectos', icon: 'folder', section: 'draxton-proyectos' },
  { name: 'Draxton · Seguimiento', href: '/admin/clientes/ggcc/draxton/seguimiento', icon: 'clock', section: 'draxton-seguimiento' },
]

/** Solo presentación; las rutas heredadas permanecen disponibles fuera del menú agrupado. */
export const AREA4_GROUPED_MENU: Readonly<Record<Area4MenuGroup, readonly Area4MenuItem[]>> = {
  Inicio: [
    { name: 'Panel principal', href: '/admin', icon: 'home', section: 'inicio' },
    { name: 'Estadísticas', href: '/admin/estadisticas', icon: 'chartBar', section: 'estadisticas' },
  ],
  Comercial: [
    { name: 'CRM', href: '/admin/crm', icon: 'chartBar', section: 'crm', subitems: [
      { name: 'Contactos', href: '/admin/crm/contactos', icon: 'userGroup', section: 'crm.contactos' },
      { name: 'Empresas y autónomos', href: '/admin/crm/empresas', icon: 'buildingOffice', section: 'crm.empresas' },
      { name: 'Listas y segmentos', href: '/admin/crm/listas', icon: 'circleStack', section: 'crm.listas' },
      { name: 'Particulares', href: '/admin/clientes?segmento=PARTICULAR', icon: 'user', section: 'crm.particulares' },
      { name: 'Partners', href: '/admin/crm/partners', icon: 'userGroup', section: 'crm.partners' },
      { name: 'ISP Gestión', href: '/admin/crm/isp', icon: 'link', section: 'crm-isp' },
    ] },
    { name: 'Tarifas', href: '/admin/tarifas', icon: 'creditCard', section: 'tarifas' },
    { name: 'Leads', href: '/admin/leads-soluciones', icon: 'inboxStack', section: 'leads-soluciones', subitems: [
      { name: 'Gestión', href: '/admin/leads-soluciones', icon: 'queueList', section: 'leads-soluciones' },
      { name: 'Mantenimiento IT', href: '/admin/leads-mantenimiento', icon: 'wrenchScrewdriver', section: 'leads-mantenimiento' },
      { name: 'Leads web', href: '/admin/leads', icon: 'globeAlt', section: 'leads' },
    ] },
    { name: 'Asistente IA', href: '/admin/asistente', icon: 'sparkles', section: 'asistente', subitems: [
      { name: 'Chat interno', href: '/admin/asistente/chat', icon: 'chatBubbleLeftRight', section: 'asistente.chat' },
      { name: 'Conocimiento', href: '/admin/asistente/conocimiento', icon: 'bookOpen', section: 'asistente.conocimiento' },
      { name: 'Conversaciones', href: '/admin/asistente/conversaciones', icon: 'queueList', section: 'asistente.conversaciones' },
      { name: 'Leads del asistente', href: '/admin/asistente/leads', icon: 'inboxStack', section: 'asistente.leads' },
      { name: 'Aprendizaje', href: '/admin/asistente/aprendizaje', icon: 'lightBulb', section: 'asistente.aprendizaje' },
      { name: 'Analítica', href: '/admin/asistente/analitica', icon: 'arrowTrendingUp', section: 'asistente.analitica' },
      { name: 'Informes y propuestas', href: '/admin/asistente/informes', icon: 'documentText', section: 'asistente.propuestas' },
      { name: 'Configuración', href: '/admin/asistente/configuracion', icon: 'cog', section: 'asistente.configuracion' },
    ] },
    { name: 'Comunicados', href: '/admin/comunicados', icon: 'megaphone', section: 'comunicados' },
    { name: 'Subida de precios', href: '/admin/subida-precios', icon: 'arrowTrendingUp', section: 'subida-precios' },
  ],
  'Clientes y contratos': [
    { name: 'Clientes', href: '/admin/clientes', icon: 'users', section: 'clientes', subitems: [
      { name: 'Todos los clientes', href: '/admin/clientes', icon: 'users', section: 'clientes' },
      { name: 'Migración ADAMO', href: '/admin/clientes/migracion-adamo', icon: 'arrowPath', section: 'clientes.migracion_adamo' },
      { name: 'GGCC · Draxton', href: '/admin/clientes/ggcc/draxton', icon: 'buildingOffice', section: 'clientes.ggcc.draxton' },
      { name: 'GGCC · Exagrid', href: '/admin/clientes/ggcc/exagrid', icon: 'buildingOffice', section: 'clientes.ggcc.exagrid' },
      ...AREA4_DRAXTON_TECHNICAL_MENU,
      { name: 'Draxton · Contratos', href: '/admin/clientes/ggcc/draxton/contratos', icon: 'documentDuplicate', section: 'draxton-contratos' },
      { name: 'Draxton · Finanzas', href: '/admin/clientes/ggcc/draxton/finanzas', icon: 'banknotes', section: 'draxton-finanzas' },
      { name: 'Draxton · Proyectos singulares', href: '/admin/clientes/ggcc/draxton/proyectos-singulares', icon: 'rocketLaunch', section: 'draxton-proyectos-singulares' },
      { name: 'Proyectos de cliente', href: '/admin/proyectos', icon: 'folder', section: 'proyectos-cliente' },
    ] },
    { name: 'Altas pendientes', href: '/admin/altas-pendientes', icon: 'clipboardDocumentList', section: 'altas-pendientes' },
    { name: 'Contratos', href: '/admin/contratos', icon: 'documentDuplicate', section: 'contratos' },
  ],
  Finanzas: [
    { name: 'Facturación', href: '/admin/facturacion', icon: 'banknotes', section: 'facturacion' },
    { name: 'Finanzas', href: '/admin/finanzas', icon: 'calculator', section: 'finanzas', subitems: [
      { name: 'Movimientos', href: '/admin/finanzas/movimientos', icon: 'banknotes', section: 'finanzas-movimientos' },
      { name: 'Pendientes', href: '/admin/finanzas/pendientes', icon: 'clipboardDocumentList', section: 'finanzas' },
      { name: 'Conciliar', href: '/admin/finanzas/conciliar', icon: 'arrowsRightLeft', section: 'conciliacion' },
      { name: 'Para pedir', href: '/admin/finanzas/para-pedir', icon: 'documentText', section: 'conciliacion' },
      { name: 'Reparto entre clientes', href: '/admin/finanzas/reparto-clientes', icon: 'chartBar', section: 'finanzas.analitica_costes' },
      { name: 'Analítica por cliente', href: '/admin/finanzas/analitica-cliente', icon: 'chartBar', section: 'finanzas' },
      { name: 'Remesas', href: '/admin/finanzas/conciliacion-remesas', icon: 'inboxStack', section: 'finanzas-remesas' },
      { name: 'Centros de coste', href: '/admin/finanzas/centros-coste', icon: 'chartBar', section: 'finanzas' },
      { name: 'Facturas recibidas', href: '/admin/finanzas/facturas', icon: 'documentDuplicate', section: 'finanzas-facturas' },
      { name: 'Analítica de costes', href: '/admin/finanzas/analitica-costes', icon: 'chartBar', section: 'finanzas.analitica_costes' },
      { name: 'Costes de operadora', href: '/admin/finanzas/analitica-costes/costes-operadora', icon: 'signal', section: 'finanzas.analitica_costes' },
      { name: 'Tickets y gastos', href: '/admin/finanzas/tickets', icon: 'receiptPercent', section: 'finanzas-tickets' },
      { name: 'Importar extracto', href: '/admin/finanzas/importar', icon: 'arrowPath', section: 'finanzas-importar' },
      { name: 'Exportar a A3', href: '/admin/finanzas/exportar-a3', icon: 'documentText', section: 'finanzas-exportar' },
      { name: 'Datos fiscales', href: '/admin/finanzas/datos-fiscales', icon: 'buildingOffice', section: 'finanzas-fiscal' },
      { name: 'Cobros pendientes', href: '/admin/finanzas/cobros-pendientes', icon: 'banknotes', section: 'finanzas-cobros' },
      { name: 'GGCC Draxton', href: '/admin/finanzas/clientes/ggcc-draxton', icon: 'buildingOffice', section: 'finanzas-draxton' },
    ] },
    { name: 'Rentabilidad · staging', href: '/admin/rentabilidad', icon: 'arrowTrendingUp', section: 'rentabilidad' },
  ],
  Personas: [
    { name: 'Personal', href: '/admin/empleados', icon: 'briefcase', section: 'personal', subitems: [
      { name: 'Costes de personal', href: '/admin/empleados', icon: 'banknotes', section: 'personal' },
      { name: 'Organigrama', href: '/admin/empleados/organigrama', icon: 'userGroup', section: 'personal' },
      { name: 'Vacaciones', href: '/admin/empleados/vacaciones', icon: 'sun', section: 'personal-vacaciones' },
      { name: 'Calendario', href: '/admin/empleados/calendario', icon: 'calendarDays', section: 'personal-calendario' },
      { name: 'Importar nóminas', href: '/admin/empleados/nominas', icon: 'cloudArrowUp', section: 'personal-nominas' },
      { name: 'Plan de carrera', href: '/admin/empleados/plan-carrera', icon: 'academicCap', section: 'personal' },
      { name: 'Gastos y extras', href: '/admin/gastos-extras', icon: 'receiptPercent', section: 'personal' },
    ] },
    { name: 'Portal del empleado', href: '/empleado', icon: 'user', section: 'portal-empleado' },
    { name: 'Mis peticiones', href: '/peticiones', icon: 'chatBubbleLeftEllipsis', section: 'peticiones-propias' },
  ],
  Operación: [
    { name: 'Imputaciones', href: '/admin/imputaciones', icon: 'clock', section: 'imputaciones' },
    { name: 'Proyectos internos', href: '/admin/proyectos-internos', icon: 'rocketLaunch', section: 'proyectos-internos' },
    { name: 'AAPP', href: '/admin/aapp', icon: 'buildingLibrary', section: 'aapp', subitems: [
      { name: 'CNMC', href: '/admin/aapp/cnmc', icon: 'buildingLibrary', section: 'aapp' },
      { name: 'Hacienda', href: '/admin/aapp/hacienda', icon: 'buildingLibrary', section: 'aapp' },
      { name: 'Seguridad Social', href: '/admin/aapp/seguridad-social', icon: 'buildingLibrary', section: 'aapp' },
    ] },
    { name: 'Certificaciones', href: '/admin/certificaciones', icon: 'shieldCheck', section: 'certificaciones', subitems: [
      { name: 'ISO 27001', href: '/admin/certificaciones/iso-27001', icon: 'shieldCheck', section: 'certificaciones.iso_27001' },
      { name: 'TISAX', href: '/admin/certificaciones/tisax', icon: 'shieldCheck', section: 'certificaciones.tisax' },
      { name: 'Cuestionarios de seguridad', href: '/admin/certificaciones/cuestionarios', icon: 'clipboardDocumentList', section: 'certificaciones.cuestionarios' },
    ] },
    { name: 'Peticiones', href: '/admin/peticiones', icon: 'chatBubbleLeftEllipsis', section: 'peticiones' },
    { name: 'Historial', href: '/admin/historial', icon: 'documentText', section: 'historial' },
    { name: 'Configuración', href: '/admin/configuracion', icon: 'cog', section: 'configuracion' },
  ],
  Administración: [
    { name: 'Usuarios y permisos', href: '/admin/usuarios', icon: 'userGroup', section: 'usuarios-permisos' },
    { name: 'Auditoría', href: '/admin/auditoria', icon: 'shieldCheck', section: 'auditoria' },
    { name: 'Actuar como', href: '/admin/actuar-como', icon: 'user', section: 'actuar-como' },
  ],
} as const

export function area4SectionByKey(key: string): Area4Section | undefined {
  return AREA4_SECTION_REGISTRY.find(section => section.key === key)
}

function area4SurfaceMatches(pathname: string, pattern: string): boolean {
  const actual = pathname.split('/').filter(Boolean)
  const expected = pattern.split('/').filter(Boolean)
  return actual.length === expected.length && expected.every((segment, index) => /^\[[^/]+\]$/.test(segment) || segment === actual[index])
}

/** Resuelve una ruta real al área declarada, sin depender de la presentación del menú. */
export function area4RegisteredSurfaceArea(pathname: string, kind: Area4SurfaceKind): string | null {
  const path = pathname.split(/[?#]/)[0]
  let best: { areaCode: string; dynamicSegments: number } | null = null
  for (const section of AREA4_SECTION_REGISTRY) {
    for (const surface of section.surfaces) {
      if (surface.kind !== kind || !area4SurfaceMatches(path, surface.path)) continue
      const dynamicSegments = (surface.path.match(/\[[^/]+\]/g) || []).length
      if (dynamicSegments === 0) return section.areaCode
      if (!best || dynamicSegments < best.dynamicSegments) best = { areaCode: section.areaCode, dynamicSegments }
    }
  }
  return best?.areaCode || null
}

export function area4RegisteredSurfacePaths(kind: Area4SurfaceKind): readonly string[] {
  return AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces.filter(surface => surface.kind === kind).map(surface => surface.path))
}
