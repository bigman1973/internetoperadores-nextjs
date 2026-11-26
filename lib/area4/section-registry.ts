import type { UsersSection } from './users-contract'

/** Canonical metadata only. Registration describes a surface; it never grants access.
 * The literal baseline evidence below was compiled ONCE from UI source4d03c9a3.
 * Additions default closed. Never regenerate it from the current registry at runtime.
 */
export const AREA4_ACTIONS = [
  { letter: 'V', capability: 'lectura', label: 'Ver' },
  { letter: 'E', capability: 'escritura', label: 'Editar' },
  { letter: 'C', capability: 'confirmar', label: 'Confirmar' },
  { letter: 'X', capability: 'exportar', label: 'Exportar' },
] as const
export type Area4ActionLetter = typeof AREA4_ACTIONS[number]['letter']
export type Area4RegistryCapability = typeof AREA4_ACTIONS[number]['capability']
export const AREA4_MENU_GROUP_METADATA = [
  { name: 'Inicio', icon: 'home' },
  { name: 'Comercial', icon: 'chartBar' },
  { name: 'Clientes y contratos', icon: 'users' },
  { name: 'Finanzas', icon: 'calculator' },
  { name: 'Personas', icon: 'briefcase' },
  { name: 'Operación', icon: 'rocketLaunch' },
  { name: 'Administración', icon: 'cog' },
] as const
export const AREA4_MENU_GROUPS = AREA4_MENU_GROUP_METADATA.map(group => group.name)
export type Area4MenuGroup = typeof AREA4_MENU_GROUP_METADATA[number]['name']
export type Area4SurfaceKind = 'page' | 'api'
export type Area4MenuPresentation = 'historico' | 'agrupado'
export type Area4MenuAppearance = Readonly<{ presentation: Area4MenuPresentation; order: number; parent?: string; label?: string; icon?: string; exact?: boolean }>
export type Area4SurfaceMenu = Readonly<{ id: string; label: string; icon: string; sectionKey?: string; query?: string; parameters?: Readonly<Record<string, string>>; appearances: readonly Area4MenuAppearance[]; collapsible?: boolean; preserveContainer?: boolean }>
export type Area4Surface = Readonly<{
  path: string; kind: Area4SurfaceKind; actions?: readonly Area4ActionLetter[];
  request?: Readonly<{ commandBodyLimit?: number; multipartBodyLimit?: number;
    readOnlyReview?: 'conciliar-closed-review-preview' | 'isp-closed-simulation';
    stagingImport?: 'isp-multipart-v1' | 'hubspot-confirm-v1';
    requiredActions?: Readonly<Partial<Record<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', readonly Area4ActionLetter[]>>> }>;
  baselineDescriptor?: string; menu?: readonly Area4SurfaceMenu[];
  availability?: Readonly<{ stagingOnly?: boolean; needsFinance?: boolean; conciliarOnly?: boolean; financeSuffix?: boolean; replacedByConciliar?: boolean; closedByGate?: "crmImportaciones" }>;
  easy?: 'conciliar' | 'modo-facil' | 'para-pedir';
}>
export type Area4UsersRowMetadata = Readonly<{ key: string; label: string; order: number }>
export type Area4Section = Readonly<{
  key: string; areaCode: string; group: Area4MenuGroup; label: string; surfaces: readonly Area4Surface[];
  baselineIdentity?: string; usersRowKey?: string; usersRow?: Area4UsersRowMetadata; usersCodeOrder?: number;
  usersEmptyRows?: readonly (Area4UsersRowMetadata & Readonly<{ baselineIdentity?: string }>)[];
  technicalOrder?: number; historicalContainer?: Readonly<{ name: string; icon: string; order: number }>;
}>
export type Area4SurfaceMatch = Readonly<{ section: Area4Section; surface: Area4Surface; id: string; descriptor: string; baseline: boolean }>

/** Global action selectors are metadata, not a second route inventory. */
export const AREA4_REQUEST_CONTRACT = {
  "safeMethods": [
    "GET",
    "HEAD",
    "OPTIONS"
  ],
  "selectors": [
    "action",
    "accion"
  ],
  "confirmActions": [
    "confirmar",
    "confirmar_traspasos_propios_manual",
    "aprobar",
    "aprobar_extra",
    "aprobar_gasto",
    "validar",
    "asociar_devolucion",
    "asociar_facturas",
    "vincular_factura_interes",
    "vincular_compra",
    "vincular_personal",
    "imputar",
    "imputar-a-ventas",
    "imputar-todas-proveedor",
    "aplicar-similares",
    "guardar-lineas",
    "RESOLVER_CUARENTENA",
    "RESOLVER_HISTORICA"
  ],
  "exportActions": [
    "exportar",
    "export",
    "download",
    "descargar",
    "pdf",
    "excel",
    "csv"
  ],
  "confirmPathSegments": [
    "confirmar",
    "aprobar",
    "validar",
    "confirmacion"
  ],
  "exportPathSegments": [
    "exportar",
    "exportar-a3",
    "export",
    "exportaciones",
    "excel",
    "csv"
  ],
  "exportFinalSegment": "pdf",
  "singleDocumentException": "/api/admin/finanzas/conciliar/documento"
} as const
export const AREA4_BASELINE_SOURCE = '4d03c9a3' as const
export const AREA4_BASELINE_DESCRIPTORS_SHA256 = "46f6730c0eb75836ee9fbf311d6ebb38b1b5e70babedc56591f6d6c97854a92f" as const
export const AREA4_BASELINE_IDENTITIES_SHA256 = "1fd44a77bd14022b2e72de292e7081daf5b7590ec2f8c11c6416844afba0470c" as const

export const AREA4_SECTION_REGISTRY: readonly Area4Section[] = [
  {
    key: "estadisticas",
    areaCode: "admin.estadisticas",
    label: "Estadísticas",
    group: "Inicio",
    baselineIdentity: "[\"estadisticas\",\"admin.estadisticas\"]",
    usersRowKey: "estadisticas",
    usersCodeOrder: 0,
    usersRow: {"key":"estadisticas","label":"Estadísticas","order":1},
    surfaces: [
      {
        path: "/admin/estadisticas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"estadisticas:0:0","label":"Estadísticas","icon":"chartBar","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":13}]}],
        baselineDescriptor: "[1,\"estadisticas\",\"admin.estadisticas\",\"page\",\"/admin/estadisticas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/estadisticas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"estadisticas\",\"admin.estadisticas\",\"api\",\"/api/admin/estadisticas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "inicio",
    areaCode: "admin",
    label: "Panel principal",
    group: "Inicio",
    baselineIdentity: "[\"inicio\",\"admin\"]",
    usersRowKey: "inicio",
    usersCodeOrder: 0,
    usersRow: {"key":"inicio","label":"Dashboard","order":0},
    surfaces: [
      {
        path: "/admin",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"inicio:0:0","label":"Panel principal","icon":"home","appearances":[{"presentation":"agrupado","order":0},{"presentation":"historico","order":0,"label":"Dashboard"}]}],
        baselineDescriptor: "[1,\"inicio\",\"admin\",\"page\",\"/admin\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
    ],
  },
  {
    key: "asistente",
    areaCode: "admin.asistente",
    label: "Asistente IA",
    group: "Comercial",
    baselineIdentity: "[\"asistente\",\"admin.asistente\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 0,
    usersRow: {"key":"asistente","label":"Asistente IA · superficie actual","order":32},
    historicalContainer: {"name":"Asistente IA","icon":"sparkles","order":5},
    surfaces: [
      {
        path: "/admin/asistente",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente:0:0","label":"Asistente IA","icon":"sparkles","appearances":[{"presentation":"agrupado","order":3},{"presentation":"historico","order":0,"parent":"container:asistente","label":"Resumen","icon":"chartBar","exact":true}]}],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"page\",\"/admin/asistente\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/derechos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"api\",\"/api/admin/asistente/derechos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/escalados",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"api\",\"/api/admin/asistente/escalados\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/escalados/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"api\",\"/api/admin/asistente/escalados/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/escalados/[id]/contacto",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"api\",\"/api/admin/asistente/escalados/[id]/contacto\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/huecos/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"api\",\"/api/admin/asistente/huecos/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/retencion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente\",\"admin.asistente\",\"api\",\"/api/admin/asistente/retencion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "comunicados",
    areaCode: "admin.comunicados",
    label: "Comunicados",
    group: "Comercial",
    baselineIdentity: "[\"comunicados\",\"admin.comunicados\"]",
    usersRowKey: "comunicados",
    usersCodeOrder: 0,
    usersRow: {"key":"comunicados","label":"Comunicados","order":4},
    surfaces: [
      {
        path: "/admin/comunicados",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"comunicados:0:0","label":"Comunicados","icon":"megaphone","appearances":[{"presentation":"agrupado","order":4},{"presentation":"historico","order":6}]}],
        baselineDescriptor: "[1,\"comunicados\",\"admin.comunicados\",\"page\",\"/admin/comunicados\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/comunicados",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"comunicados\",\"admin.comunicados\",\"api\",\"/api/admin/comunicados\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/comunicados/asistente-ia",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"comunicados\",\"admin.comunicados\",\"api\",\"/api/admin/comunicados/asistente-ia\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/comunicados/destinatarios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"comunicados\",\"admin.comunicados\",\"api\",\"/api/admin/comunicados/destinatarios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/comunicados/enviar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"comunicados\",\"admin.comunicados\",\"api\",\"/api/admin/comunicados/enviar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/comunicados/preview",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"comunicados\",\"admin.comunicados\",\"api\",\"/api/admin/comunicados/preview\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "crm",
    areaCode: "admin.crm",
    label: "CRM",
    group: "Comercial",
    baselineIdentity: "[\"crm\",\"admin.crm\"]",
    usersRowKey: "crm",
    usersCodeOrder: 0,
    usersRow: {"key":"crm","label":"CRM","order":2},
    historicalContainer: {"name":"CRM","icon":"chartBar","order":1},
    surfaces: [
      {
        path: "/admin/crm",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"crm:0:0","label":"CRM","icon":"chartBar","appearances":[{"presentation":"agrupado","order":0},{"presentation":"historico","order":0,"parent":"container:crm","label":"Resumen"}]}],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"page\",\"/admin/crm\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/crm/hubspot-historial",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"page\",\"/admin/crm/hubspot-historial\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/crm/pipelines",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"page\",\"/admin/crm/pipelines\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/crm/brevo/estado",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/brevo/estado\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/hubspot/historial",
        kind: "api",
        actions: ["V","E","C","X"],
        request: { commandBodyLimit: 16384, stagingImport: "hubspot-confirm-v1", requiredActions: { POST: ["C"] } },
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/hubspot/historial\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/leads/[tipo]/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/leads/[tipo]/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/negocios/sync",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/negocios/sync\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/pipelines",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/pipelines\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/pipelines/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/pipelines/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/pipelines/[id]/negocios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/pipelines/[id]/negocios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/pipelines/buscar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/pipelines/buscar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/pipelines/negocios/[negocioId]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/pipelines/negocios/[negocioId]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/tareas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/crm/tareas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/hubspot-create-list",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/hubspot-create-list\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/integraciones/outlook",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/integraciones/outlook\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/integraciones/outlook/callback",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/integraciones/outlook/callback\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/integraciones/outlook/connect",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm\",\"admin.crm\",\"api\",\"/api/admin/integraciones/outlook/connect\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "leads",
    areaCode: "admin.leads",
    label: "Leads web",
    group: "Comercial",
    baselineIdentity: "[\"leads\",\"admin.leads\"]",
    usersRowKey: "leads",
    usersCodeOrder: 0,
    usersRow: {"key":"leads","label":"Leads","order":3},
    historicalContainer: {"name":"Leads","icon":"inboxStack","order":4},
    surfaces: [
      {
        path: "/admin/leads",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"leads:0:0","label":"Leads web","icon":"globeAlt","appearances":[{"presentation":"agrupado","order":2,"parent":"leads-soluciones:0:0"},{"presentation":"historico","order":2,"parent":"container:leads","label":"Leads Web"}]}],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"page\",\"/admin/leads\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/leads/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"page\",\"/admin/leads/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/leads",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/[id]/cuestionario",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/[id]/cuestionario\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/[id]/enviar-email",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/[id]/enviar-email\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/[id]/generar-auditoria",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/[id]/generar-auditoria\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/[id]/hubspot-deal",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/[id]/hubspot-deal\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/generar-propuesta",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/generar-propuesta\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads/generar-propuesta/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads\",\"admin.leads\",\"api\",\"/api/admin/leads/generar-propuesta/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "subida-precios",
    areaCode: "admin.subida_precios",
    label: "Subida de precios",
    group: "Comercial",
    baselineIdentity: "[\"subida-precios\",\"admin.subida_precios\"]",
    usersRowKey: "subida-precios",
    usersCodeOrder: 0,
    usersRow: {"key":"subida-precios","label":"Subida de precios","order":11},
    surfaces: [
      {
        path: "/admin/subida-precios",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"subida-precios:0:0","label":"Subida de precios","icon":"arrowTrendingUp","appearances":[{"presentation":"agrupado","order":5},{"presentation":"historico","order":15,"label":"Subida de Precios"}]}],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"page\",\"/admin/subida-precios\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/subida-precios/dataset",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"api\",\"/api/admin/subida-precios/dataset\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/subida-precios/escenarios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"api\",\"/api/admin/subida-precios/escenarios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/subida-precios/escenarios/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"api\",\"/api/admin/subida-precios/escenarios/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/subida-precios/escenarios/[id]/aprobar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"api\",\"/api/admin/subida-precios/escenarios/[id]/aprobar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/subida-precios/escenarios/[id]/export",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"api\",\"/api/admin/subida-precios/escenarios/[id]/export\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/subida-precios/tipo-cliente",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"subida-precios\",\"admin.subida_precios\",\"api\",\"/api/admin/subida-precios/tipo-cliente\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "tarifas",
    areaCode: "admin.tarifas",
    label: "Tarifas",
    group: "Comercial",
    baselineIdentity: "[\"tarifas\",\"admin.tarifas\"]",
    usersRowKey: "tarifas",
    usersCodeOrder: 0,
    usersRow: {"key":"tarifas","label":"Tarifas","order":10},
    surfaces: [
      {
        path: "/admin/tarifas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"tarifas:0:0","label":"Tarifas","icon":"creditCard","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":2}]}],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"page\",\"/admin/tarifas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/tarifas/[id]/editar",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"page\",\"/admin/tarifas/[id]/editar\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/tarifas/nueva",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"page\",\"/admin/tarifas/nueva\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/tarifas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/tarifas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/tarifas/[id]/destacada",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas/[id]/destacada\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/tarifas/[id]/duplicate",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas/[id]/duplicate\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/tarifas/[id]/toggle",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas/[id]/toggle\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/tarifas/[id]/web-publish",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas/[id]/web-publish\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/tarifas/reorder",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"tarifas\",\"admin.tarifas\",\"api\",\"/api/admin/tarifas/reorder\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "altas-pendientes",
    areaCode: "admin.altas_pendientes",
    label: "Altas pendientes",
    group: "Clientes y contratos",
    baselineIdentity: "[\"altas-pendientes\",\"admin.altas_pendientes\"]",
    usersRowKey: "altas-pendientes",
    usersCodeOrder: 0,
    usersRow: {"key":"altas-pendientes","label":"Altas pendientes","order":8},
    surfaces: [
      {
        path: "/admin/altas-pendientes",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"altas-pendientes:0:0","label":"Altas pendientes","icon":"clipboardDocumentList","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":7,"label":"Altas Pendientes"}]}],
        baselineDescriptor: "[1,\"altas-pendientes\",\"admin.altas_pendientes\",\"page\",\"/admin/altas-pendientes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/altas-pendientes/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"altas-pendientes\",\"admin.altas_pendientes\",\"page\",\"/admin/altas-pendientes/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/altas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"altas-pendientes\",\"admin.altas_pendientes\",\"api\",\"/api/admin/altas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/altas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"altas-pendientes\",\"admin.altas_pendientes\",\"api\",\"/api/admin/altas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/altas/[id]/documentos/[docId]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"altas-pendientes\",\"admin.altas_pendientes\",\"api\",\"/api/admin/altas/[id]/documentos/[docId]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/altas/[id]/estado",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"altas-pendientes\",\"admin.altas_pendientes\",\"api\",\"/api/admin/altas/[id]/estado\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "clientes",
    areaCode: "admin.clientes",
    label: "Clientes",
    group: "Clientes y contratos",
    baselineIdentity: "[\"clientes\",\"admin.clientes\"]",
    usersRowKey: "clientes",
    usersCodeOrder: 0,
    usersRow: {"key":"clientes","label":"Clientes","order":5},
    historicalContainer: {"name":"Clientes","icon":"users","order":3},
    surfaces: [
      {
        path: "/admin/clientes",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"clientes:0:0","label":"Particulares","icon":"user","appearances":[{"presentation":"agrupado","order":3,"parent":"crm:0:0"},{"presentation":"historico","order":4,"parent":"container:crm"}],"sectionKey":"crm.particulares","query":"segmento=PARTICULAR"},{"id":"clientes:0:1","label":"Clientes","icon":"users","appearances":[{"presentation":"agrupado","order":0},{"presentation":"agrupado","order":0,"parent":"clientes:0:1","label":"Todos los clientes"},{"presentation":"historico","order":0,"parent":"container:clientes","label":"Todos los clientes"}]}],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"page\",\"/admin/clientes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/clientes/[id]/editar",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"page\",\"/admin/clientes/[id]/editar\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/clientes/nuevo",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"page\",\"/admin/clientes/nuevo\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"api\",\"/api/admin/clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"api\",\"/api/admin/clientes/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/[id]/contratos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"api\",\"/api/admin/clientes/[id]/contratos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/[id]/facturas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"api\",\"/api/admin/clientes/[id]/facturas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/[id]/newsletter",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes\",\"admin.clientes\",\"api\",\"/api/admin/clientes/[id]/newsletter\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "contratos",
    areaCode: "admin.contratos",
    label: "Contratos",
    group: "Clientes y contratos",
    baselineIdentity: "[\"contratos\",\"admin.contratos\"]",
    usersRowKey: "contratos",
    usersCodeOrder: 0,
    usersRow: {"key":"contratos","label":"Contratos","order":9},
    surfaces: [
      {
        path: "/admin/contratos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"contratos:0:0","label":"Contratos","icon":"documentDuplicate","appearances":[{"presentation":"agrupado","order":2},{"presentation":"historico","order":8}]}],
        baselineDescriptor: "[1,\"contratos\",\"admin.contratos\",\"page\",\"/admin/contratos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/contratos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"contratos\",\"admin.contratos\",\"api\",\"/api/admin/contratos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-actualizaciones",
    areaCode: "admin.clientes.ggcc.draxton.actualizaciones",
    label: "Draxton · Actualizaciones",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-actualizaciones\",\"admin.clientes.ggcc.draxton.actualizaciones\"]",
    usersRowKey: "draxton-actualizaciones",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-actualizaciones","label":"Draxton · Actualizaciones","order":33},
    technicalOrder: 0,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/actualizaciones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-actualizaciones:0:0","label":"Actualizaciones","icon":"arrowPath","appearances":[{"presentation":"agrupado","order":0,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":0,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-actualizaciones\",\"admin.clientes.ggcc.draxton.actualizaciones\",\"page\",\"/admin/clientes/ggcc/draxton/actualizaciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/actualizaciones",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"draxton-actualizaciones\",\"admin.clientes.ggcc.draxton.actualizaciones\",\"api\",\"/api/admin/clientes/ggcc/draxton/actualizaciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/actualizaciones/informe",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-actualizaciones\",\"admin.clientes.ggcc.draxton.actualizaciones\",\"api\",\"/api/admin/clientes/ggcc/draxton/actualizaciones/informe\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-contrato-guardias",
    areaCode: "admin.clientes.ggcc.draxton.contrato_guardias",
    label: "Draxton · Contrato guardias",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-contrato-guardias\",\"admin.clientes.ggcc.draxton.contrato_guardias\"]",
    usersRowKey: "draxton-contrato-guardias",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-contrato-guardias","label":"Draxton · Contrato guardias","order":34},
    technicalOrder: 1,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/contrato-guardias",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-contrato-guardias:0:0","label":"Contrato de guardias","icon":"shieldCheck","appearances":[{"presentation":"agrupado","order":1,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":1,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-contrato-guardias\",\"admin.clientes.ggcc.draxton.contrato_guardias\",\"page\",\"/admin/clientes/ggcc/draxton/contrato-guardias\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/guardias",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"draxton-contrato-guardias\",\"admin.clientes.ggcc.draxton.contrato_guardias\",\"api\",\"/api/admin/clientes/ggcc/draxton/guardias\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/guardias/informe",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contrato-guardias\",\"admin.clientes.ggcc.draxton.contrato_guardias\",\"api\",\"/api/admin/clientes/ggcc/draxton/guardias/informe\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-informes",
    areaCode: "admin.clientes.ggcc.draxton.informes",
    label: "Draxton · Informes",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-informes\",\"admin.clientes.ggcc.draxton.informes\"]",
    usersRowKey: "draxton-informes",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-informes","label":"Draxton · Informes","order":35},
    technicalOrder: 2,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/informes",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-informes:0:0","label":"Informes","icon":"documentText","appearances":[{"presentation":"agrupado","order":2,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":2,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-informes\",\"admin.clientes.ggcc.draxton.informes\",\"page\",\"/admin/clientes/ggcc/draxton/informes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/informes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-informes\",\"admin.clientes.ggcc.draxton.informes\",\"api\",\"/api/admin/clientes/ggcc/draxton/informes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/informes/generar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-informes\",\"admin.clientes.ggcc.draxton.informes\",\"api\",\"/api/admin/clientes/ggcc/draxton/informes/generar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-kpis",
    areaCode: "admin.clientes.ggcc.draxton.kpis",
    label: "Draxton · KPIs",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-kpis\",\"admin.clientes.ggcc.draxton.kpis\"]",
    usersRowKey: "draxton-kpis",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-kpis","label":"Draxton · KPIs","order":36},
    technicalOrder: 3,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/kpis",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-kpis:0:0","label":"KPIs","icon":"chartBar","appearances":[{"presentation":"agrupado","order":3,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":3,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-kpis\",\"admin.clientes.ggcc.draxton.kpis\",\"page\",\"/admin/clientes/ggcc/draxton/kpis\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/kpis/dashboard",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-kpis\",\"admin.clientes.ggcc.draxton.kpis\",\"api\",\"/api/admin/clientes/ggcc/draxton/kpis/dashboard\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/kpis/importar-tickets",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-kpis\",\"admin.clientes.ggcc.draxton.kpis\",\"api\",\"/api/admin/clientes/ggcc/draxton/kpis/importar-tickets\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/kpis/informe-ejecutivo",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-kpis\",\"admin.clientes.ggcc.draxton.kpis\",\"api\",\"/api/admin/clientes/ggcc/draxton/kpis/informe-ejecutivo\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/kpis/mensuales",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-kpis\",\"admin.clientes.ggcc.draxton.kpis\",\"api\",\"/api/admin/clientes/ggcc/draxton/kpis/mensuales\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-organigrama",
    areaCode: "admin.clientes.ggcc.draxton.organigrama",
    label: "Draxton · Organigrama",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-organigrama\",\"admin.clientes.ggcc.draxton.organigrama\"]",
    usersRowKey: "draxton-organigrama",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-organigrama","label":"Draxton · Organigrama","order":37},
    technicalOrder: 4,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/organigrama",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-organigrama:0:0","label":"Organigrama","icon":"userGroup","appearances":[{"presentation":"agrupado","order":4,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":4,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-organigrama\",\"admin.clientes.ggcc.draxton.organigrama\",\"page\",\"/admin/clientes/ggcc/draxton/organigrama\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/organigrama",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-organigrama\",\"admin.clientes.ggcc.draxton.organigrama\",\"api\",\"/api/admin/clientes/ggcc/draxton/organigrama\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/organigrama/imprimir",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-organigrama\",\"admin.clientes.ggcc.draxton.organigrama\",\"api\",\"/api/admin/clientes/ggcc/draxton/organigrama/imprimir\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-personal",
    areaCode: "admin.clientes.ggcc.draxton.personal",
    label: "Draxton · Personal",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-personal\",\"admin.clientes.ggcc.draxton.personal\"]",
    usersRowKey: "draxton-personal",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-personal","label":"Draxton · Personal","order":38},
    technicalOrder: 5,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/personal",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-personal:0:0","label":"Personal","icon":"briefcase","appearances":[{"presentation":"agrupado","order":5,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":5,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-personal\",\"admin.clientes.ggcc.draxton.personal\",\"page\",\"/admin/clientes/ggcc/draxton/personal\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/personal-contrato",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"draxton-personal\",\"admin.clientes.ggcc.draxton.personal\",\"api\",\"/api/admin/clientes/ggcc/draxton/personal-contrato\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-proyectos",
    areaCode: "admin.clientes.ggcc.draxton.proyectos",
    label: "Draxton · Proyectos internos",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\"]",
    usersRowKey: "draxton-proyectos",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-proyectos","label":"Draxton · Proyectos internos","order":39},
    technicalOrder: 6,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/proyectos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-proyectos:0:0","label":"Proyectos","icon":"folder","appearances":[{"presentation":"agrupado","order":6,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":6,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"page\",\"/admin/clientes/ggcc/draxton/proyectos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-contrato",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-contrato\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-contrato/informe-pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-contrato/informe-pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-contrato/ocr",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-contrato/ocr\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-facturas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-facturas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-personal",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-personal\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/proyectos-proveedores",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-proyectos\",\"admin.clientes.ggcc.draxton.proyectos\",\"api\",\"/api/admin/clientes/ggcc/draxton/proyectos-proveedores\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-seguimiento",
    areaCode: "admin.clientes.ggcc.draxton.seguimiento",
    label: "Draxton · Seguimiento",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-seguimiento\",\"admin.clientes.ggcc.draxton.seguimiento\"]",
    usersRowKey: "draxton-seguimiento",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton-seguimiento","label":"Draxton · Seguimiento","order":40},
    technicalOrder: 7,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/seguimiento",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-seguimiento:0:0","label":"Seguimiento","icon":"clock","appearances":[{"presentation":"agrupado","order":7,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":7,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-seguimiento\",\"admin.clientes.ggcc.draxton.seguimiento\",\"page\",\"/admin/clientes/ggcc/draxton/seguimiento\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/seguimiento/balance-mensual",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-seguimiento\",\"admin.clientes.ggcc.draxton.seguimiento\",\"api\",\"/api/admin/clientes/ggcc/draxton/seguimiento/balance-mensual\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "proyectos-cliente",
    areaCode: "admin.proyectos",
    label: "Proyectos de cliente",
    group: "Clientes y contratos",
    baselineIdentity: "[\"proyectos-cliente\",\"admin.proyectos\"]",
    usersRowKey: "clientes",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/proyectos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"proyectos-cliente:0:0","label":"Proyectos de cliente","icon":"folder","appearances":[{"presentation":"agrupado","order":15,"parent":"clientes:0:1"},{"presentation":"historico","order":4,"parent":"container:clientes","label":"Proyectos Cliente"}]}],
        baselineDescriptor: "[1,\"proyectos-cliente\",\"admin.proyectos\",\"page\",\"/admin/proyectos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/proyectos",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"proyectos-cliente\",\"admin.proyectos\",\"api\",\"/api/admin/proyectos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "conciliacion",
    areaCode: "admin.finanzas.conciliacion",
    label: "Conciliar",
    group: "Finanzas",
    baselineIdentity: "[\"conciliacion\",\"admin.finanzas.conciliacion\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 0,
    surfaces: [
      {
        path: "/admin/finanzas/conciliacion",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"page\",\"/admin/finanzas/conciliacion\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/conciliacion/manual",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"page\",\"/admin/finanzas/conciliacion/manual\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/conciliar",
        kind: "page",
        actions: ["V"],
        availability: {"conciliarOnly":true},
        easy: "conciliar",
        menu: [{"id":"conciliacion:2:0","label":"Conciliar","icon":"arrowsRightLeft","appearances":[{"presentation":"agrupado","order":2,"parent":"finanzas:0:0"},{"presentation":"historico","order":3,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"page\",\"/admin/finanzas/conciliar\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/modo-facil",
        kind: "page",
        actions: ["V"],
        availability: {"needsFinance":true,"financeSuffix":true,"replacedByConciliar":true},
        easy: "modo-facil",
        menu: [{"id":"conciliacion:3:0","label":"Modo fácil","icon":"clipboardDocumentList","appearances":[{"presentation":"historico","order":5,"parent":"container:finanzas","label":"Modo fácil"}]}],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"page\",\"/admin/finanzas/modo-facil\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/para-pedir",
        kind: "page",
        actions: ["V"],
        availability: {"needsFinance":true,"financeSuffix":true,"replacedByConciliar":true},
        easy: "para-pedir",
        menu: [{"id":"conciliacion:4:0","label":"Para pedir","icon":"documentText","appearances":[{"presentation":"agrupado","order":3,"parent":"finanzas:0:0"},{"presentation":"historico","order":6,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"page\",\"/admin/finanzas/para-pedir\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/conciliacion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliacion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion/auto",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliacion/auto\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion/manual",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliacion/manual\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion/sugerencias",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliacion/sugerencias\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":16384,"readOnlyReview":"conciliar-closed-review-preview"},
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":16384,\"readOnlyReview\":\"conciliar-closed-review-preview\"},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar/archivo/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar/archivo/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar/confirming-inventario",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar/confirming-inventario\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar/detalle/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar/detalle/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar/historial",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar/historial\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar/intereses",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar/intereses\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliar/remesa-preview",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/conciliar/remesa-preview\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/automaticas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/automaticas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/automaticas/tramos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/automaticas/tramos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/cobros",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/cobros\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/deshacer",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/deshacer\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/documentos/[id]/archivo",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/documentos/[id]/archivo\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/foto",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/foto\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/para-pedir",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/para-pedir\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/perfil",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/perfil\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/reglas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/reglas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/tarjetas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/tarjetas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/terceros",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/terceros\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/modo-facil/terceros/bloque",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"conciliacion\",\"admin.finanzas.conciliacion\",\"api\",\"/api/admin/finanzas/modo-facil/terceros/bloque\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "facturacion",
    areaCode: "admin.facturacion",
    label: "Facturación",
    group: "Finanzas",
    baselineIdentity: "[\"facturacion\",\"admin.facturacion\"]",
    usersRowKey: "facturacion",
    usersCodeOrder: 0,
    usersRow: {"key":"facturacion","label":"Facturación","order":12},
    surfaces: [
      {
        path: "/admin/facturacion",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"facturacion:0:0","label":"Facturación","icon":"banknotes","appearances":[{"presentation":"agrupado","order":0},{"presentation":"historico","order":9}]}],
        baselineDescriptor: "[1,\"facturacion\",\"admin.facturacion\",\"page\",\"/admin/facturacion\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/facturacion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"facturacion\",\"admin.facturacion\",\"api\",\"/api/admin/facturacion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/facturacion-banco",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"facturacion\",\"admin.facturacion\",\"api\",\"/api/admin/facturacion-banco\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/facturacion/resumen",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"facturacion\",\"admin.facturacion\",\"api\",\"/api/admin/facturacion/resumen\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas",
    areaCode: "admin.finanzas",
    label: "Finanzas",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas\",\"admin.finanzas\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 1,
    usersRow: {"key":"finanzas","label":"Conciliar y movimientos","order":13},
    historicalContainer: {"name":"Finanzas","icon":"calculator","order":10},
    surfaces: [
      {
        path: "/admin/finanzas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas:0:0","label":"Finanzas","icon":"calculator","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":0,"parent":"container:finanzas","label":"Dashboard","icon":"chartBar"}]}],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"page\",\"/admin/finanzas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/analitica-cliente",
        kind: "page",
        actions: ["V"],
        availability: {"stagingOnly":true,"financeSuffix":true},
        menu: [{"id":"finanzas:1:0","label":"Analítica por cliente","icon":"chartBar","appearances":[{"presentation":"agrupado","order":5,"parent":"finanzas:0:0"},{"presentation":"historico","order":8,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"page\",\"/admin/finanzas/analitica-cliente\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/centros-coste",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas:2:0","label":"Centros de coste","icon":"chartBar","appearances":[{"presentation":"agrupado","order":7,"parent":"finanzas:0:0"},{"presentation":"historico","order":10,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"page\",\"/admin/finanzas/centros-coste\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/conciliacion-v2",
        kind: "page",
        actions: ["V"],
        availability: {"replacedByConciliar":true},
        menu: [{"id":"finanzas:3:0","label":"Conciliación","icon":"link","appearances":[{"presentation":"historico","order":4,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"page\",\"/admin/finanzas/conciliacion-v2\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/pendientes",
        kind: "page",
        actions: ["V"],
        availability: {"replacedByConciliar":true},
        menu: [{"id":"finanzas:4:0","label":"Pendientes","icon":"clipboardDocumentList","appearances":[{"presentation":"agrupado","order":1,"parent":"finanzas:0:0"},{"presentation":"historico","order":2,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"page\",\"/admin/finanzas/pendientes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/analitica-cliente",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/analitica-cliente\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/centros-coste",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/centros-coste\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/centros-coste/asignar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/centros-coste/asignar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-propuestas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/conciliacion-propuestas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-v2",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/conciliacion-v2\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-v2/heredados-bloque",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/conciliacion-v2/heredados-bloque\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-v2/heredados-excluidas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/conciliacion-v2/heredados-excluidas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-v2/heredados-recibos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/conciliacion-v2/heredados-recibos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/confirming-draxton",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/confirming-draxton\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/cortes-cobertura",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/cortes-cobertura\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/cuentas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/cuentas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/dashboard",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/dashboard\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/imputacion",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/imputacion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/nominas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/nominas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/nominas-propuestas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/nominas-propuestas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/nominas/empleados",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/nominas/empleados\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/pendientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/pendientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/pendientes/documento",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/pendientes/documento\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/remesas/b6",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/remesas/b6\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/rentabilidad",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/rentabilidad\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/rentabilidad/lineas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/rentabilidad/lineas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/rentabilidad/proveedores",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/rentabilidad/proveedores\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/rentabilidad/servicios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/rentabilidad/servicios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/sincronizar-onedrive",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/sincronizar-onedrive\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/sync-jobs",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas\",\"admin.finanzas\",\"api\",\"/api/admin/finanzas/sync-jobs\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas.impuestos",
    areaCode: "admin.finanzas.impuestos",
    label: "Impuestos",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas.impuestos\",\"admin.finanzas.impuestos\"]",
    usersRowKey: "impuestos",
    usersCodeOrder: 0,
    usersRow: {"key":"impuestos","label":"Impuestos","order":15},
    surfaces: [
      {
        path: "/admin/finanzas/impuestos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas.impuestos:0:0","label":"Impuestos","icon":"documentText","appearances":[{"presentation":"agrupado","order":17,"parent":"finanzas:0:0"},{"presentation":"historico","order":16,"parent":"container:finanzas","icon":"receiptPercent"}]}],
        baselineDescriptor: "[1,\"finanzas.impuestos\",\"admin.finanzas.impuestos\",\"page\",\"/admin/finanzas/impuestos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/impuestos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.impuestos\",\"admin.finanzas.impuestos\",\"api\",\"/api/admin/finanzas/impuestos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/impuestos/presentados",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.impuestos\",\"admin.finanzas.impuestos\",\"api\",\"/api/admin/finanzas/impuestos/presentados\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas.presupuesto",
    areaCode: "admin.finanzas.presupuesto",
    label: "Presupuesto",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\"]",
    usersRowKey: "presupuesto",
    usersCodeOrder: 0,
    usersRow: {"key":"presupuesto","label":"Presupuesto","order":16},
    surfaces: [
      {
        path: "/admin/finanzas/presupuesto",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas.presupuesto:0:0","label":"Presupuesto","icon":"calculator","appearances":[{"presentation":"agrupado","order":18,"parent":"finanzas:0:0"},{"presentation":"historico","order":17,"parent":"container:finanzas","label":"Presupuesto 2027","icon":"chartBar"}]}],
        baselineDescriptor: "[1,\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\",\"page\",\"/admin/finanzas/presupuesto\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/presupuesto/versiones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\",\"api\",\"/api/admin/finanzas/presupuesto/versiones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/presupuesto/versiones/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\",\"api\",\"/api/admin/finanzas/presupuesto/versiones/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/presupuesto/versiones/[id]/lineas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\",\"api\",\"/api/admin/finanzas/presupuesto/versiones/[id]/lineas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/presupuesto/versiones/[id]/aprobar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\",\"api\",\"/api/admin/finanzas/presupuesto/versiones/[id]/aprobar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/presupuesto/versiones/[id]/seguimiento",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.presupuesto\",\"admin.finanzas.presupuesto\",\"api\",\"/api/admin/finanzas/presupuesto/versiones/[id]/seguimiento\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "personal",
    areaCode: "admin.empleados",
    label: "Personal",
    group: "Personas",
    baselineIdentity: "[\"personal\",\"admin.empleados\"]",
    usersRowKey: "personal",
    usersCodeOrder: 0,
    usersRow: {"key":"personal","label":"Personal","order":18},
    historicalContainer: {"name":"Personal","icon":"briefcase","order":16},
    surfaces: [
      {
        path: "/admin/empleados",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal:0:0","label":"Personal","icon":"briefcase","appearances":[{"presentation":"agrupado","order":0},{"presentation":"agrupado","order":0,"parent":"personal:0:0","label":"Costes de personal","icon":"banknotes"},{"presentation":"historico","order":0,"parent":"container:personal","label":"Costes de Personal","icon":"banknotes"}]}],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"page\",\"/admin/empleados\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/empleados/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"page\",\"/admin/empleados/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/empleados/escenarios-salariales",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"page\",\"/admin/empleados/escenarios-salariales\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/empleados/organigrama",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal:3:0","label":"Organigrama","icon":"userGroup","appearances":[{"presentation":"agrupado","order":1,"parent":"personal:0:0"},{"presentation":"historico","order":1,"parent":"container:personal"}]}],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"page\",\"/admin/empleados/organigrama\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/empleados/plan-carrera",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal:4:0","label":"Plan de carrera","icon":"academicCap","appearances":[{"presentation":"agrupado","order":5,"parent":"personal:0:0"},{"presentation":"historico","order":5,"parent":"container:personal","label":"Plan de Carrera"}]}],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"page\",\"/admin/empleados/plan-carrera\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/gastos-extras",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal:5:0","label":"Gastos y extras","icon":"receiptPercent","appearances":[{"presentation":"agrupado","order":6,"parent":"personal:0:0"},{"presentation":"historico","order":6,"parent":"container:personal","label":"Gastos y Extras"}]}],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"page\",\"/admin/gastos-extras\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/empleados",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/[id]/documentos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/[id]/documentos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/[id]/documentos/[documentoId]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/[id]/documentos/[documentoId]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/condiciones-salariales",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/condiciones-salariales\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/escenarios-salariales",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/escenarios-salariales\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/escenarios-salariales/informe",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/escenarios-salariales/informe\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/organigrama",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/organigrama\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/organigrama/informe",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/organigrama/informe\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/plan-carrera",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/plan-carrera\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/simulacion-salarial",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/simulacion-salarial\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/empleados/simulacion-salarial/informe",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/empleados/simulacion-salarial/informe\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/gastos-extras",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"personal\",\"admin.empleados\",\"api\",\"/api/admin/gastos-extras\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "portal-empleado",
    areaCode: "empleado.portal",
    label: "Portal del empleado",
    group: "Personas",
    baselineIdentity: "[\"portal-empleado\",\"empleado.portal\"]",
    usersRowKey: "portal-empleado",
    usersCodeOrder: 0,
    usersRow: {"key":"portal-empleado","label":"Portal del empleado","order":22},
    usersEmptyRows: [{"key":"gastos","label":"Gastos del trabajador","order":20,"baselineIdentity":"[\"gastos\",[]]"}],
    surfaces: [
      {
        path: "/api/empleado/alertas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/alertas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/buscar-clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/buscar-clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/buscar-proyectos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/buscar-proyectos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/empleados-lista",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/empleados-lista\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/gastos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/gastos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/gastos/aprobar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/gastos/aprobar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/gastos/clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/gastos/clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/imputaciones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/imputaciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/nominas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/nominas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/mis-gastos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/mis-gastos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/mis-gastos/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/mis-gastos/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/mis-gastos/[id]/adjunto",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/mis-gastos/[id]/adjunto\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/mis-gastos/avisos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/mis-gastos/avisos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/empleado/usuarios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"api\",\"/api/empleado/usuarios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/empleado",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"portal-empleado:14:0","label":"Portal del empleado","icon":"user","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":22,"label":"Portal Empleado"}]}],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"page\",\"/empleado\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/empleado/gastos",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"page\",\"/empleado/gastos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/empleado/gastos/aprobar",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"page\",\"/empleado/gastos/aprobar\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/empleado/imputaciones",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"page\",\"/empleado/imputaciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/empleado/nominas",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"page\",\"/empleado/nominas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/empleado/mis-gastos",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"portal-empleado\",\"empleado.portal\",\"page\",\"/empleado/mis-gastos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
    ],
  },
  {
    key: "aapp",
    areaCode: "admin.aapp",
    label: "AAPP",
    group: "Operación",
    baselineIdentity: "[\"aapp\",\"admin.aapp\"]",
    usersRowKey: "aapp",
    usersCodeOrder: 0,
    usersRow: {"key":"aapp","label":"AAPP","order":17},
    historicalContainer: {"name":"AAPP","icon":"buildingLibrary","order":19},
    surfaces: [
      {
        path: "/admin/aapp",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"aapp:0:0","label":"AAPP","icon":"buildingLibrary","appearances":[{"presentation":"agrupado","order":2}]}],
        baselineDescriptor: "[1,\"aapp\",\"admin.aapp\",\"page\",\"/admin/aapp\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/aapp/cnmc",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"aapp:1:0","label":"CNMC","icon":"buildingLibrary","appearances":[{"presentation":"agrupado","order":0,"parent":"aapp:0:0"},{"presentation":"historico","order":0,"parent":"container:aapp"}]}],
        baselineDescriptor: "[1,\"aapp\",\"admin.aapp\",\"page\",\"/admin/aapp/cnmc\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/aapp/hacienda",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"aapp:2:0","label":"Hacienda","icon":"buildingLibrary","appearances":[{"presentation":"agrupado","order":1,"parent":"aapp:0:0"},{"presentation":"historico","order":1,"parent":"container:aapp"}]}],
        baselineDescriptor: "[1,\"aapp\",\"admin.aapp\",\"page\",\"/admin/aapp/hacienda\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/aapp/seguridad-social",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"aapp:3:0","label":"Seguridad Social","icon":"buildingLibrary","appearances":[{"presentation":"agrupado","order":2,"parent":"aapp:0:0"},{"presentation":"historico","order":2,"parent":"container:aapp"}]}],
        baselineDescriptor: "[1,\"aapp\",\"admin.aapp\",\"page\",\"/admin/aapp/seguridad-social\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/aapp",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"aapp\",\"admin.aapp\",\"api\",\"/api/admin/aapp\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "certificaciones",
    areaCode: "admin.certificaciones",
    label: "Certificaciones",
    group: "Operación",
    baselineIdentity: "[\"certificaciones\",\"admin.certificaciones\"]",
    usersRowKey: "certificaciones",
    usersCodeOrder: 0,
    usersRow: {"key":"certificaciones","label":"Certificaciones","order":24},
    historicalContainer: {"name":"Certificaciones","icon":"shieldCheck","order":20},
    surfaces: [
      {
        path: "/admin/certificaciones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"certificaciones:0:0","label":"Certificaciones","icon":"shieldCheck","appearances":[{"presentation":"agrupado","order":3},{"presentation":"historico","order":0,"parent":"container:certificaciones","label":"Resumen","icon":"chartBar"}]}],
        baselineDescriptor: "[1,\"certificaciones\",\"admin.certificaciones\",\"page\",\"/admin/certificaciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/certificaciones/[norma]",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"certificaciones:1:0","label":"ISO 27001","icon":"shieldCheck","appearances":[{"presentation":"agrupado","order":0,"parent":"certificaciones:0:0"},{"presentation":"historico","order":1,"parent":"container:certificaciones"}],"sectionKey":"certificaciones.iso_27001","parameters":{"norma":"iso-27001"}},{"id":"certificaciones:1:1","label":"TISAX","icon":"shieldCheck","appearances":[{"presentation":"agrupado","order":1,"parent":"certificaciones:0:0"},{"presentation":"historico","order":2,"parent":"container:certificaciones"}],"sectionKey":"certificaciones.tisax","parameters":{"norma":"tisax"}}],
        baselineDescriptor: "[1,\"certificaciones\",\"admin.certificaciones\",\"page\",\"/admin/certificaciones/[norma]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/certificaciones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"certificaciones\",\"admin.certificaciones\",\"api\",\"/api/admin/certificaciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/certificaciones/documentos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"certificaciones\",\"admin.certificaciones\",\"api\",\"/api/admin/certificaciones/documentos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/certificaciones/documentos/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"certificaciones\",\"admin.certificaciones\",\"api\",\"/api/admin/certificaciones/documentos/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "configuracion",
    areaCode: "admin.configuracion",
    label: "Configuración",
    group: "Operación",
    baselineIdentity: "[\"configuracion\",\"admin.configuracion\"]",
    usersRowKey: "configuracion",
    usersCodeOrder: 0,
    usersRow: {"key":"configuracion","label":"Configuración","order":30},
    surfaces: [
      {
        path: "/admin/configuracion",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"configuracion:0:0","label":"Configuración","icon":"cog","appearances":[{"presentation":"agrupado","order":6},{"presentation":"historico","order":25}]}],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"page\",\"/admin/configuracion\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/configuracion/categorias",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"api\",\"/api/admin/configuracion/categorias\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/configuracion/categorias/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"api\",\"/api/admin/configuracion/categorias/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/configuracion/categorias/[id]/subcategorias",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"api\",\"/api/admin/configuracion/categorias/[id]/subcategorias\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/configuracion/categorias/[id]/subcategorias/[subId]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"api\",\"/api/admin/configuracion/categorias/[id]/subcategorias/[subId]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/configuracion/estrategias",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"api\",\"/api/admin/configuracion/estrategias\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/configuracion/estrategias/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"configuracion\",\"admin.configuracion\",\"api\",\"/api/admin/configuracion/estrategias/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "historial",
    areaCode: "admin.historial",
    label: "Historial",
    group: "Operación",
    baselineIdentity: "[\"historial\",\"admin.historial\"]",
    usersRowKey: "historial",
    usersCodeOrder: 0,
    usersRow: {"key":"historial","label":"Historial","order":29},
    surfaces: [
      {
        path: "/admin/historial",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"historial:0:0","label":"Historial","icon":"documentText","appearances":[{"presentation":"agrupado","order":5},{"presentation":"historico","order":24}]}],
        baselineDescriptor: "[1,\"historial\",\"admin.historial\",\"page\",\"/admin/historial\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/historial",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"historial\",\"admin.historial\",\"api\",\"/api/admin/historial\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/historial/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"historial\",\"admin.historial\",\"api\",\"/api/admin/historial/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "imputaciones",
    areaCode: "admin.imputaciones",
    label: "Imputaciones",
    group: "Operación",
    baselineIdentity: "[\"imputaciones\",\"admin.imputaciones\"]",
    usersRowKey: "imputaciones",
    usersCodeOrder: 0,
    usersRow: {"key":"imputaciones","label":"Imputaciones","order":21},
    surfaces: [
      {
        path: "/admin/imputaciones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"imputaciones:0:0","label":"Imputaciones","icon":"clock","appearances":[{"presentation":"agrupado","order":0},{"presentation":"historico","order":17}]}],
        baselineDescriptor: "[1,\"imputaciones\",\"admin.imputaciones\",\"page\",\"/admin/imputaciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/imputaciones",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"imputaciones\",\"admin.imputaciones\",\"api\",\"/api/admin/imputaciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "peticiones",
    areaCode: "admin.peticiones",
    label: "Peticiones",
    group: "Operación",
    baselineIdentity: "[\"peticiones\",\"admin.peticiones\"]",
    usersRowKey: "peticiones",
    usersCodeOrder: 0,
    usersRow: {"key":"peticiones","label":"Peticiones","order":25},
    surfaces: [
      {
        path: "/admin/peticiones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"peticiones:0:0","label":"Peticiones","icon":"chatBubbleLeftEllipsis","appearances":[{"presentation":"agrupado","order":4},{"presentation":"historico","order":21}]}],
        baselineDescriptor: "[1,\"peticiones\",\"admin.peticiones\",\"page\",\"/admin/peticiones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/peticiones",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"peticiones\",\"admin.peticiones\",\"api\",\"/api/admin/peticiones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "proyectos-internos",
    areaCode: "admin.proyectos_internos",
    label: "Proyectos internos",
    group: "Operación",
    baselineIdentity: "[\"proyectos-internos\",\"admin.proyectos_internos\"]",
    usersRowKey: "proyectos-internos",
    usersCodeOrder: 0,
    usersRow: {"key":"proyectos-internos","label":"Proyectos internos","order":23},
    surfaces: [
      {
        path: "/admin/proyectos-internos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"proyectos-internos:0:0","label":"Proyectos internos","icon":"rocketLaunch","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":18,"label":"Proyectos Internos"}]}],
        baselineDescriptor: "[1,\"proyectos-internos\",\"admin.proyectos_internos\",\"page\",\"/admin/proyectos-internos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
    ],
  },
  {
    key: "actuar-como",
    areaCode: "admin.actuar_como",
    label: "Actuar como",
    group: "Administración",
    baselineIdentity: "[\"actuar-como\",\"admin.actuar_como\"]",
    usersRowKey: "actuar-como",
    usersCodeOrder: 0,
    usersRow: {"key":"actuar-como","label":"Actuar como","order":28},
    surfaces: [
      {
        path: "/admin/actuar-como",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"actuar-como:0:0","label":"Actuar como","icon":"user","appearances":[{"presentation":"agrupado","order":3}]}],
        baselineDescriptor: "[1,\"actuar-como\",\"admin.actuar_como\",\"page\",\"/admin/actuar-como\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/actuar-como",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"actuar-como\",\"admin.actuar_como\",\"api\",\"/api/admin/actuar-como\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/actuar-como/registro",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"actuar-como\",\"admin.actuar_como\",\"api\",\"/api/admin/actuar-como/registro\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "auditoria",
    areaCode: "admin.auditoria",
    label: "Auditoría",
    group: "Administración",
    baselineIdentity: "[\"auditoria\",\"admin.auditoria\"]",
    usersRowKey: "auditoria",
    usersCodeOrder: 0,
    usersRow: {"key":"auditoria","label":"Auditoría","order":27},
    surfaces: [
      {
        path: "/admin/auditoria",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"auditoria:0:0","label":"Auditoría","icon":"shieldCheck","appearances":[{"presentation":"agrupado","order":2}]}],
        baselineDescriptor: "[1,\"auditoria\",\"admin.auditoria\",\"page\",\"/admin/auditoria\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/auditoria",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"auditoria\",\"admin.auditoria\",\"api\",\"/api/admin/auditoria\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "usuarios-permisos",
    areaCode: "admin.usuarios",
    label: "Usuarios y permisos",
    group: "Administración",
    baselineIdentity: "[\"usuarios-permisos\",\"admin.usuarios\"]",
    usersRowKey: "usuarios-permisos",
    usersCodeOrder: 0,
    usersRow: {"key":"usuarios-permisos","label":"Usuarios y permisos","order":26},
    surfaces: [
      {
        path: "/admin/usuarios",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"usuarios-permisos:0:0","label":"Usuarios y permisos","icon":"userGroup","appearances":[{"presentation":"agrupado","order":1},{"presentation":"historico","order":14,"label":"Usuarios Admin"}]}],
        baselineDescriptor: "[1,\"usuarios-permisos\",\"admin.usuarios\",\"page\",\"/admin/usuarios\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/permisos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"usuarios-permisos\",\"admin.usuarios\",\"api\",\"/api/admin/permisos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/usuarios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"usuarios-permisos\",\"admin.usuarios\",\"api\",\"/api/admin/usuarios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/usuarios/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"usuarios-permisos\",\"admin.usuarios\",\"api\",\"/api/admin/usuarios/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/usuarios/menu-presentacion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"usuarios-permisos\",\"admin.usuarios\",\"api\",\"/api/admin/usuarios/menu-presentacion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/usuarios/propuestas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"usuarios-permisos\",\"admin.usuarios\",\"api\",\"/api/admin/usuarios/propuestas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "rentabilidad",
    areaCode: "admin.rentabilidad",
    label: "Rentabilidad · staging",
    group: "Finanzas",
    baselineIdentity: "[\"rentabilidad\",\"admin.rentabilidad\"]",
    usersRowKey: "rentabilidad",
    usersCodeOrder: 0,
    usersRow: {"key":"rentabilidad","label":"Rentabilidad","order":14},
    surfaces: [
      {
        path: "/admin/rentabilidad",
        kind: "page",
        actions: ["V"],
        availability: {"stagingOnly":true},
        menu: [{"id":"rentabilidad:0:0","label":"Rentabilidad · staging","icon":"arrowTrendingUp","appearances":[{"presentation":"agrupado","order":2},{"presentation":"historico","order":11}]}],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"page\",\"/admin/rentabilidad\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/rentabilidad",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"api\",\"/api/admin/rentabilidad\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/rentabilidad/exceptions",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"api\",\"/api/admin/rentabilidad/exceptions\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/rentabilidad/external-costs",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"api\",\"/api/admin/rentabilidad/external-costs\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/rentabilidad/recalculate",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"api\",\"/api/admin/rentabilidad/recalculate\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/rentabilidad/rules",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"api\",\"/api/admin/rentabilidad/rules\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/rentabilidad/sync",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"rentabilidad\",\"admin.rentabilidad\",\"api\",\"/api/admin/rentabilidad/sync\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "peticiones-propias",
    areaCode: "empleado.peticiones",
    label: "Mis peticiones",
    group: "Personas",
    baselineIdentity: "[\"peticiones-propias\",\"empleado.peticiones\"]",
    usersRowKey: "peticiones",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/api/peticiones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"peticiones-propias\",\"empleado.peticiones\",\"api\",\"/api/peticiones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/peticiones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"peticiones-propias:1:0","label":"Mis peticiones","icon":"chatBubbleLeftEllipsis","appearances":[{"presentation":"agrupado","order":2},{"presentation":"historico","order":23}]}],
        baselineDescriptor: "[1,\"peticiones-propias\",\"empleado.peticiones\",\"page\",\"/peticiones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
    ],
  },
  {
    key: "crm.contactos",
    areaCode: "admin.crm.contactos",
    label: "Contactos",
    group: "Comercial",
    baselineIdentity: "[\"crm.contactos\",\"admin.crm.contactos\"]",
    usersRowKey: "crm",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365",
        kind: "api",
        actions: ["V", "E"],
      },
      {
        path: "/api/admin/crm/contactos/[id]/m365/borrador",
        kind: "api",
        actions: ["V", "E"],
        request: { requiredActions: { GET: ["V", "E"], HEAD: ["V", "E"] } },
      },
      {
        path: "/admin/crm/contactos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"crm.contactos:0:0","label":"Contactos","icon":"userGroup","appearances":[{"presentation":"agrupado","order":0,"parent":"crm:0:0"},{"presentation":"historico","order":1,"parent":"container:crm"}]}],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"page\",\"/admin/crm/contactos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/crm/contactos/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"page\",\"/admin/crm/contactos/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/crm/contactos/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/contactos/[id]/actividades",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/[id]/actividades\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/contactos/[id]/actividades/[actividadId]/outlook",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/[id]/actividades/[actividadId]/outlook\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/contactos/[id]/datos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/[id]/datos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/contactos/[id]/hubspot",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/[id]/hubspot\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/contactos/buscar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/buscar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/contactos/sync-datos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.contactos\",\"admin.crm.contactos\",\"api\",\"/api/admin/crm/contactos/sync-datos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "crm.empresas",
    areaCode: "admin.crm.empresas",
    label: "Empresas y autónomos",
    group: "Comercial",
    baselineIdentity: "[\"crm.empresas\",\"admin.crm.empresas\"]",
    usersRowKey: "crm",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/crm/empresas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"crm.empresas:0:0","label":"Empresas y autónomos","icon":"buildingOffice","appearances":[{"presentation":"agrupado","order":1,"parent":"crm:0:0"},{"presentation":"historico","order":2,"parent":"container:crm"}]}],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"page\",\"/admin/crm/empresas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/crm/empresas/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"page\",\"/admin/crm/empresas/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/crm/empresas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/empresas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/empresas/[id]/clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas/[id]/clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/empresas/[id]/contactos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas/[id]/contactos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/empresas/[id]/resumen-ia",
        kind: "api",
        actions: ["V", "E"],
        request: { requiredActions: { GET: ["V", "E"], HEAD: ["V", "E"] } },
      },
      {
        path: "/api/admin/crm/empresas/buscar-clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas/buscar-clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/empresas/buscar-contactos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas/buscar-contactos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/empresas/sync",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.empresas\",\"admin.crm.empresas\",\"api\",\"/api/admin/crm/empresas/sync\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "crm.listas",
    areaCode: "admin.crm.listas",
    label: "Listas y segmentos",
    group: "Comercial",
    baselineIdentity: "[\"crm.listas\",\"admin.crm.listas\"]",
    usersRowKey: "crm",
    usersCodeOrder: 3,
    surfaces: [
      {
        path: "/admin/crm/listas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"crm.listas:0:0","label":"Listas y segmentos","icon":"circleStack","appearances":[{"presentation":"agrupado","order":2,"parent":"crm:0:0"},{"presentation":"historico","order":3,"parent":"container:crm"}]}],
        baselineDescriptor: "[1,\"crm.listas\",\"admin.crm.listas\",\"page\",\"/admin/crm/listas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/crm/listas/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"crm.listas\",\"admin.crm.listas\",\"page\",\"/admin/crm/listas/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/crm/listas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.listas\",\"admin.crm.listas\",\"api\",\"/api/admin/crm/listas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/listas/sync",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"crm.listas\",\"admin.crm.listas\",\"api\",\"/api/admin/crm/listas/sync\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "crm.particulares",
    areaCode: "admin.crm.particulares",
    label: "Particulares",
    group: "Comercial",
    baselineIdentity: "[\"crm.particulares\",\"admin.crm.particulares\"]",
    usersRowKey: "crm",
    usersCodeOrder: 4,
    surfaces: [
    ],
  },
  {
    key: "crm.partners",
    areaCode: "admin.crm.partners",
    label: "Partners",
    group: "Comercial",
    baselineIdentity: "[\"crm.partners\",\"admin.crm.partners\"]",
    usersRowKey: "crm",
    usersCodeOrder: 5,
    surfaces: [
      {
        path: "/admin/crm/partners",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"crm.partners:0:0","label":"Partners","icon":"userGroup","appearances":[{"presentation":"agrupado","order":4,"parent":"crm:0:0"},{"presentation":"historico","order":5,"parent":"container:crm"}]}],
        baselineDescriptor: "[1,\"crm.partners\",\"admin.crm.partners\",\"page\",\"/admin/crm/partners\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
    ],
  },
  {
    key: "crm-isp",
    areaCode: "admin.crm",
    label: "ISP Gestión",
    group: "Comercial",
    baselineIdentity: "[\"crm-isp\",\"admin.crm\"]",
    usersRowKey: "crm",
    usersCodeOrder: 0,
    surfaces: [
      {
        path: "/admin/crm/isp",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"crm-isp:0:0","label":"ISP Gestión","icon":"link","appearances":[{"presentation":"agrupado","order":5,"parent":"crm:0:0"},{"presentation":"historico","order":6,"parent":"container:crm"}]}],
        availability: {"closedByGate":"crmImportaciones"},
        baselineDescriptor: "[1,\"crm-isp\",\"admin.crm\",\"page\",\"/admin/crm/isp\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/crm/isp/importar",
        kind: "api",
        actions: ["V","E","C","X"],
        request: { multipartBodyLimit: 4259840, readOnlyReview: "isp-closed-simulation", stagingImport: "isp-multipart-v1", requiredActions: { POST: ["C"] } },
        baselineDescriptor: "[1,\"crm-isp\",\"admin.crm\",\"api\",\"/api/admin/crm/isp/importar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/crm/isp/vinculos",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"crm-isp\",\"admin.crm\",\"api\",\"/api/admin/crm/isp/vinculos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "clientes.migracion_adamo",
    areaCode: "admin.clientes.migracion_adamo",
    label: "Migración ADAMO",
    group: "Clientes y contratos",
    baselineIdentity: "[\"clientes.migracion_adamo\",\"admin.clientes.migracion_adamo\"]",
    usersRowKey: "clientes",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/admin/clientes/migracion-adamo",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"clientes.migracion_adamo:0:0","label":"Migración ADAMO","icon":"arrowPath","appearances":[{"presentation":"agrupado","order":1,"parent":"clientes:0:1"},{"presentation":"historico","order":1,"parent":"container:clientes"}]}],
        baselineDescriptor: "[1,\"clientes.migracion_adamo\",\"admin.clientes.migracion_adamo\",\"page\",\"/admin/clientes/migracion-adamo\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/migracion-adamo",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes.migracion_adamo\",\"admin.clientes.migracion_adamo\",\"api\",\"/api/admin/migracion-adamo\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/migracion-adamo/enviar-email",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes.migracion_adamo\",\"admin.clientes.migracion_adamo\",\"api\",\"/api/admin/migracion-adamo/enviar-email\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "clientes.ggcc.draxton",
    areaCode: "admin.clientes.ggcc.draxton",
    label: "GGCC · Draxton",
    group: "Clientes y contratos",
    baselineIdentity: "[\"clientes.ggcc.draxton\",\"admin.clientes.ggcc.draxton\"]",
    usersRowKey: "draxton",
    usersCodeOrder: 0,
    usersRow: {"key":"draxton","label":"Grandes cuentas · Draxton","order":6},
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"clientes.ggcc.draxton:0:0","label":"GGCC Draxton","icon":"buildingOffice","appearances":[{"presentation":"agrupado","order":2,"parent":"clientes:0:1"},{"presentation":"historico","order":2,"parent":"container:clientes"}],"collapsible":true,"preserveContainer":true}],
        baselineDescriptor: "[1,\"clientes.ggcc.draxton\",\"admin.clientes.ggcc.draxton\",\"page\",\"/admin/clientes/ggcc/draxton\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/buscar-clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes.ggcc.draxton\",\"admin.clientes.ggcc.draxton\",\"api\",\"/api/admin/clientes/ggcc/draxton/buscar-clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/empresas-grupo",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes.ggcc.draxton\",\"admin.clientes.ggcc.draxton\",\"api\",\"/api/admin/clientes/ggcc/draxton/empresas-grupo\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-contratos",
    areaCode: "admin.clientes.ggcc.draxton.contratos",
    label: "Draxton · Contratos",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\"]",
    usersRowKey: "draxton",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/contratos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-contratos:0:0","label":"Draxton · Contratos","icon":"documentDuplicate","appearances":[{"presentation":"agrupado","order":12,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":12,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"page\",\"/admin/clientes/ggcc/draxton/contratos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos-proveedor",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos-proveedor\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos-proveedor/analizar-pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos-proveedor/analizar-pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos/analizar-pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos/analizar-pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos/informe-contrato",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos/informe-contrato\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos/informe-facturacion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos/informe-facturacion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos/informe-pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos/informe-pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/contratos/rentabilidad-mensual",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-contratos\",\"admin.clientes.ggcc.draxton.contratos\",\"api\",\"/api/admin/clientes/ggcc/draxton/contratos/rentabilidad-mensual\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-finanzas",
    areaCode: "admin.clientes.ggcc.draxton.finanzas",
    label: "Draxton · Finanzas",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-finanzas\",\"admin.clientes.ggcc.draxton.finanzas\"]",
    usersRowKey: "draxton",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/finanzas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-finanzas:0:0","label":"Draxton · Finanzas","icon":"banknotes","appearances":[{"presentation":"agrupado","order":13,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":13,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-finanzas\",\"admin.clientes.ggcc.draxton.finanzas\",\"page\",\"/admin/clientes/ggcc/draxton/finanzas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/facturas-contrato",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-finanzas\",\"admin.clientes.ggcc.draxton.finanzas\",\"api\",\"/api/admin/clientes/ggcc/draxton/facturas-contrato\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/facturas-resumen",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-finanzas\",\"admin.clientes.ggcc.draxton.finanzas\",\"api\",\"/api/admin/clientes/ggcc/draxton/facturas-resumen\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/finanzas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-finanzas\",\"admin.clientes.ggcc.draxton.finanzas\",\"api\",\"/api/admin/clientes/ggcc/draxton/finanzas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/draxton/finanzas/informe",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"draxton-finanzas\",\"admin.clientes.ggcc.draxton.finanzas\",\"api\",\"/api/admin/clientes/ggcc/draxton/finanzas/informe\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "draxton-proyectos-singulares",
    areaCode: "admin.clientes.ggcc.draxton.proyectos_singulares",
    label: "Draxton · Proyectos singulares",
    group: "Clientes y contratos",
    baselineIdentity: "[\"draxton-proyectos-singulares\",\"admin.clientes.ggcc.draxton.proyectos_singulares\"]",
    usersRowKey: "draxton",
    usersCodeOrder: 3,
    surfaces: [
      {
        path: "/admin/clientes/ggcc/draxton/proyectos-singulares",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"draxton-proyectos-singulares:0:0","label":"Draxton · Proyectos singulares","icon":"rocketLaunch","appearances":[{"presentation":"agrupado","order":14,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":14,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"draxton-proyectos-singulares\",\"admin.clientes.ggcc.draxton.proyectos_singulares\",\"page\",\"/admin/clientes/ggcc/draxton/proyectos-singulares\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
    ],
  },
  {
    key: "clientes.ggcc.exagrid",
    areaCode: "admin.clientes.ggcc.exagrid",
    label: "GGCC · Exagrid",
    group: "Clientes y contratos",
    baselineIdentity: "[\"clientes.ggcc.exagrid\",\"admin.clientes.ggcc.exagrid\"]",
    usersRowKey: "exagrid",
    usersCodeOrder: 0,
    usersRow: {"key":"exagrid","label":"Grandes cuentas · Exagrid","order":7},
    surfaces: [
      {
        path: "/admin/clientes/ggcc/exagrid",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"clientes.ggcc.exagrid:0:0","label":"GGCC · Exagrid","icon":"buildingOffice","appearances":[{"presentation":"agrupado","order":3,"parent":"clientes:0:1"},{"presentation":"historico","order":3,"parent":"container:clientes","label":"GGCC - Exagrid"}]}],
        baselineDescriptor: "[1,\"clientes.ggcc.exagrid\",\"admin.clientes.ggcc.exagrid\",\"page\",\"/admin/clientes/ggcc/exagrid\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/clientes/ggcc/exagrid/finanzas",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"clientes.ggcc.exagrid\",\"admin.clientes.ggcc.exagrid\",\"page\",\"/admin/clientes/ggcc/exagrid/finanzas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/clientes/ggcc/exagrid/finanzas",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"clientes.ggcc.exagrid\",\"admin.clientes.ggcc.exagrid\",\"api\",\"/api/admin/clientes/ggcc/exagrid/finanzas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/clientes/ggcc/exagrid/finanzas/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"clientes.ggcc.exagrid\",\"admin.clientes.ggcc.exagrid\",\"api\",\"/api/admin/clientes/ggcc/exagrid/finanzas/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas.analitica_costes",
    areaCode: "admin.finanzas.analitica_costes",
    label: "Reparto entre clientes",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/finanzas/analitica-costes",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas.analitica_costes:0:0","label":"Analítica de costes","icon":"chartBar","appearances":[{"presentation":"agrupado","order":9,"parent":"finanzas:0:0"},{"presentation":"historico","order":12,"parent":"container:finanzas","label":"Analítica de Costes"}]}],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"page\",\"/admin/finanzas/analitica-costes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/analitica-costes/costes-operadora",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas.analitica_costes:1:0","label":"Costes de operadora","icon":"signal","appearances":[{"presentation":"agrupado","order":10,"parent":"finanzas:0:0"},{"presentation":"historico","order":0,"parent":"finanzas.analitica_costes:0:0"}]}],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"page\",\"/admin/finanzas/analitica-costes/costes-operadora\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/costes-operadora",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"page\",\"/admin/finanzas/costes-operadora\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/reparto-clientes",
        kind: "page",
        actions: ["V"],
        availability: {"needsFinance":true,"financeSuffix":true},
        menu: [{"id":"finanzas.analitica_costes:3:0","label":"Reparto entre clientes","icon":"chartBar","appearances":[{"presentation":"agrupado","order":4,"parent":"finanzas:0:0"},{"presentation":"historico","order":7,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"page\",\"/admin/finanzas/reparto-clientes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/analitica-costes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"api\",\"/api/admin/finanzas/analitica-costes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/costes-operadora",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"api\",\"/api/admin/finanzas/costes-operadora\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/costes-operadora/[id]/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"api\",\"/api/admin/finanzas/costes-operadora/[id]/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/costes-operadora/pendientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"api\",\"/api/admin/finanzas/costes-operadora/pendientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/costes-operadora/pendientes/[id]/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"api\",\"/api/admin/finanzas/costes-operadora/pendientes/[id]/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/reparto-clientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas.analitica_costes\",\"admin.finanzas.analitica_costes\",\"api\",\"/api/admin/finanzas/reparto-clientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-facturas",
    areaCode: "admin.finanzas.facturas",
    label: "Facturas recibidas",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-facturas\",\"admin.finanzas.facturas\"]",
    usersRowKey: "facturacion",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/admin/finanzas/facturas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-facturas:0:0","label":"Facturas recibidas","icon":"documentDuplicate","appearances":[{"presentation":"agrupado","order":8,"parent":"finanzas:0:0"},{"presentation":"historico","order":11,"parent":"container:finanzas","label":"Facturas Recibidas"}]}],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"page\",\"/admin/finanzas/facturas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/facturas/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"page\",\"/admin/finanzas/facturas/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/facturas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/[id]/comentarios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/[id]/comentarios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/[id]/movimientos-candidatos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/[id]/movimientos-candidatos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/[id]/ocr",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/[id]/ocr\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/[id]/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/[id]/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/calidad",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/calidad\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/calidad/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/calidad/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/calidad/[id]/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/calidad/[id]/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/estimacion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/estimacion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/facturas/proveedores",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas\",\"admin.finanzas.facturas\",\"api\",\"/api/admin/finanzas/facturas/proveedores\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-facturas-emitidas",
    areaCode: "admin.finanzas.facturas_emitidas",
    label: "Facturación · finanzas-facturas-emitidas",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-facturas-emitidas\",\"admin.finanzas.facturas_emitidas\"]",
    usersRowKey: "facturacion",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/finanzas/facturas-emitidas",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"finanzas-facturas-emitidas\",\"admin.finanzas.facturas_emitidas\",\"page\",\"/admin/finanzas/facturas-emitidas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/facturas-emitidas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-facturas-emitidas\",\"admin.finanzas.facturas_emitidas\",\"api\",\"/api/admin/finanzas/facturas-emitidas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-movimientos",
    areaCode: "admin.finanzas.movimientos",
    label: "Movimientos",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-movimientos\",\"admin.finanzas.movimientos\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 3,
    surfaces: [
      {
        path: "/admin/finanzas/movimientos",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-movimientos:0:0","label":"Movimientos","icon":"banknotes","appearances":[{"presentation":"agrupado","order":0,"parent":"finanzas:0:0"},{"presentation":"historico","order":1,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas-movimientos\",\"admin.finanzas.movimientos\",\"page\",\"/admin/finanzas/movimientos\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/movimientos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-movimientos\",\"admin.finanzas.movimientos\",\"api\",\"/api/admin/finanzas/movimientos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/movimientos/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-movimientos\",\"admin.finanzas.movimientos\",\"api\",\"/api/admin/finanzas/movimientos/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/movimientos/[id]/archivos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-movimientos\",\"admin.finanzas.movimientos\",\"api\",\"/api/admin/finanzas/movimientos/[id]/archivos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-remesas",
    areaCode: "admin.finanzas.conciliacion_remesas",
    label: "Remesas",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 4,
    surfaces: [
      {
        path: "/admin/finanzas/conciliacion-remesas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-remesas:0:0","label":"Remesas","icon":"inboxStack","appearances":[{"presentation":"agrupado","order":6,"parent":"finanzas:0:0"},{"presentation":"historico","order":9,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\",\"page\",\"/admin/finanzas/conciliacion-remesas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-remesas",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\",\"api\",\"/api/admin/finanzas/conciliacion-remesas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-remesas/detalle-remesa",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\",\"api\",\"/api/admin/finanzas/conciliacion-remesas/detalle-remesa\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-remesas/importar-devoluciones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\",\"api\",\"/api/admin/finanzas/conciliacion-remesas/importar-devoluciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-remesas/importar-pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\",\"api\",\"/api/admin/finanzas/conciliacion-remesas/importar-pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/conciliacion-remesas/marcar-cobradas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-remesas\",\"admin.finanzas.conciliacion_remesas\",\"api\",\"/api/admin/finanzas/conciliacion-remesas/marcar-cobradas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-cobros",
    areaCode: "admin.finanzas.cobros_pendientes",
    label: "Cobros pendientes",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-cobros\",\"admin.finanzas.cobros_pendientes\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 5,
    surfaces: [
      {
        path: "/admin/finanzas/cobros-pendientes",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-cobros:0:0","label":"Cobros pendientes","icon":"banknotes","appearances":[{"presentation":"agrupado","order":15,"parent":"finanzas:0:0"},{"presentation":"historico","order":19,"parent":"container:finanzas","label":"Cobros Pendientes"}]}],
        baselineDescriptor: "[1,\"finanzas-cobros\",\"admin.finanzas.cobros_pendientes\",\"page\",\"/admin/finanzas/cobros-pendientes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/cobros-pendientes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-cobros\",\"admin.finanzas.cobros_pendientes\",\"api\",\"/api/admin/finanzas/cobros-pendientes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-fiscal",
    areaCode: "admin.finanzas.datos_fiscales",
    label: "Datos fiscales",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 6,
    surfaces: [
      {
        path: "/admin/finanzas/datos-fiscales",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-fiscal:0:0","label":"Datos fiscales","icon":"buildingOffice","appearances":[{"presentation":"agrupado","order":14,"parent":"finanzas:0:0"},{"presentation":"historico","order":18,"parent":"container:finanzas","label":"Datos Fiscales"}]}],
        baselineDescriptor: "[1,\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\",\"page\",\"/admin/finanzas/datos-fiscales\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/datos-fiscales/[id]/mayor",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\",\"page\",\"/admin/finanzas/datos-fiscales/[id]/mayor\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/datos-fiscales",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\",\"api\",\"/api/admin/finanzas/datos-fiscales\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/datos-fiscales/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\",\"api\",\"/api/admin/finanzas/datos-fiscales/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/datos-fiscales/[id]/mayor",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\",\"api\",\"/api/admin/finanzas/datos-fiscales/[id]/mayor\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/datos-fiscales/poblar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-fiscal\",\"admin.finanzas.datos_fiscales\",\"api\",\"/api/admin/finanzas/datos-fiscales/poblar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-importar",
    areaCode: "admin.finanzas.importar",
    label: "Importar extracto",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-importar\",\"admin.finanzas.importar\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 7,
    surfaces: [
      {
        path: "/admin/finanzas/estado-cuentas",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"finanzas-importar\",\"admin.finanzas.importar\",\"page\",\"/admin/finanzas/estado-cuentas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/finanzas/importar",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-importar:1:0","label":"Importar extracto","icon":"arrowPath","appearances":[{"presentation":"agrupado","order":12,"parent":"finanzas:0:0"},{"presentation":"historico","order":14,"parent":"container:finanzas","label":"Importar Extracto"}]}],
        baselineDescriptor: "[1,\"finanzas-importar\",\"admin.finanzas.importar\",\"page\",\"/admin/finanzas/importar\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/estado-cuentas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-importar\",\"admin.finanzas.importar\",\"api\",\"/api/admin/finanzas/estado-cuentas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/importar-movimientos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-importar\",\"admin.finanzas.importar\",\"api\",\"/api/admin/finanzas/importar-movimientos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-exportar",
    areaCode: "admin.finanzas.exportar_a3",
    label: "Exportar a A3",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-exportar\",\"admin.finanzas.exportar_a3\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 8,
    surfaces: [
      {
        path: "/admin/finanzas/exportar-a3",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-exportar:0:0","label":"Exportar a A3","icon":"documentText","appearances":[{"presentation":"agrupado","order":13,"parent":"finanzas:0:0"},{"presentation":"historico","order":15,"parent":"container:finanzas"}]}],
        baselineDescriptor: "[1,\"finanzas-exportar\",\"admin.finanzas.exportar_a3\",\"page\",\"/admin/finanzas/exportar-a3\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/exportar-a3",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-exportar\",\"admin.finanzas.exportar_a3\",\"api\",\"/api/admin/finanzas/exportar-a3\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-tickets",
    areaCode: "admin.finanzas.tickets",
    label: "Tickets y gastos",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-tickets\",\"admin.finanzas.tickets\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 9,
    surfaces: [
      {
        path: "/admin/finanzas/tickets",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-tickets:0:0","label":"Tickets y gastos","icon":"receiptPercent","appearances":[{"presentation":"agrupado","order":11,"parent":"finanzas:0:0"},{"presentation":"historico","order":13,"parent":"container:finanzas","label":"Tickets/Gastos"}]}],
        baselineDescriptor: "[1,\"finanzas-tickets\",\"admin.finanzas.tickets\",\"page\",\"/admin/finanzas/tickets\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/tickets",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-tickets\",\"admin.finanzas.tickets\",\"api\",\"/api/admin/finanzas/tickets\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/tickets/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-tickets\",\"admin.finanzas.tickets\",\"api\",\"/api/admin/finanzas/tickets/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/tickets/[id]/conciliar",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-tickets\",\"admin.finanzas.tickets\",\"api\",\"/api/admin/finanzas/tickets/[id]/conciliar\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/tickets/[id]/ocr",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-tickets\",\"admin.finanzas.tickets\",\"api\",\"/api/admin/finanzas/tickets/[id]/ocr\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/tickets/upload",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-tickets\",\"admin.finanzas.tickets\",\"api\",\"/api/admin/finanzas/tickets/upload\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "finanzas-draxton",
    areaCode: "admin.finanzas.ggcc_draxton",
    label: "GGCC Draxton",
    group: "Finanzas",
    baselineIdentity: "[\"finanzas-draxton\",\"admin.finanzas.ggcc_draxton\"]",
    usersRowKey: "finanzas",
    usersCodeOrder: 10,
    surfaces: [
      {
        path: "/admin/finanzas/clientes/ggcc-draxton",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"finanzas-draxton:0:0","label":"Finanzas Draxton","icon":"buildingOffice","appearances":[{"presentation":"agrupado","order":8,"parent":"clientes.ggcc.draxton:0:0"},{"presentation":"historico","order":8,"parent":"clientes.ggcc.draxton:0:0"}]}],
        baselineDescriptor: "[1,\"finanzas-draxton\",\"admin.finanzas.ggcc_draxton\",\"page\",\"/admin/finanzas/clientes/ggcc-draxton\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/finanzas/clientes/ggcc-draxton",
        kind: "api",
        actions: ["V","E","C","X"],
        request: {"commandBodyLimit":8388608},
        baselineDescriptor: "[1,\"finanzas-draxton\",\"admin.finanzas.ggcc_draxton\",\"api\",\"/api/admin/finanzas/clientes/ggcc-draxton\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],{\"commandBodyLimit\":8388608},{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/clientes/ggcc-draxton/confirming-lineas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-draxton\",\"admin.finanzas.ggcc_draxton\",\"api\",\"/api/admin/finanzas/clientes/ggcc-draxton/confirming-lineas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/clientes/ggcc-draxton/informe-confirming",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-draxton\",\"admin.finanzas.ggcc_draxton\",\"api\",\"/api/admin/finanzas/clientes/ggcc-draxton/informe-confirming\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"finanzas-draxton\",\"admin.finanzas.ggcc_draxton\",\"api\",\"/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "leads-mantenimiento",
    areaCode: "admin.leads.mantenimiento",
    label: "Mantenimiento IT",
    group: "Comercial",
    baselineIdentity: "[\"leads-mantenimiento\",\"admin.leads.mantenimiento\"]",
    usersRowKey: "leads",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/admin/leads-mantenimiento",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"leads-mantenimiento:0:0","label":"Mantenimiento IT","icon":"wrenchScrewdriver","appearances":[{"presentation":"agrupado","order":1,"parent":"leads-soluciones:0:0"},{"presentation":"historico","order":1,"parent":"container:leads"}]}],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"page\",\"/admin/leads-mantenimiento\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/leads-mantenimiento/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"page\",\"/admin/leads-mantenimiento/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/leads-mantenimiento",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/[id]/cuestionario",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/[id]/cuestionario\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/[id]/enviar-email",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/[id]/enviar-email\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/[id]/hubspot-deal",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/[id]/hubspot-deal\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/[id]/pdf",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/[id]/pdf\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/[id]/propuesta-economica",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/[id]/propuesta-economica\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-mantenimiento/hubspot-pipeline",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-mantenimiento\",\"admin.leads.mantenimiento\",\"api\",\"/api/admin/leads-mantenimiento/hubspot-pipeline\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "leads-soluciones",
    areaCode: "admin.leads.soluciones",
    label: "Leads",
    group: "Comercial",
    baselineIdentity: "[\"leads-soluciones\",\"admin.leads.soluciones\"]",
    usersRowKey: "leads",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/leads-soluciones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"leads-soluciones:0:0","label":"Leads","icon":"inboxStack","appearances":[{"presentation":"agrupado","order":2},{"presentation":"agrupado","order":0,"parent":"leads-soluciones:0:0","label":"Gestión","icon":"queueList"},{"presentation":"historico","order":0,"parent":"container:leads","label":"Gestión","icon":"queueList"}]}],
        baselineDescriptor: "[1,\"leads-soluciones\",\"admin.leads.soluciones\",\"page\",\"/admin/leads-soluciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/leads-soluciones/[id]",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"leads-soluciones\",\"admin.leads.soluciones\",\"page\",\"/admin/leads-soluciones/[id]\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/leads-soluciones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-soluciones\",\"admin.leads.soluciones\",\"api\",\"/api/admin/leads-soluciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-soluciones/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-soluciones\",\"admin.leads.soluciones\",\"api\",\"/api/admin/leads-soluciones/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/leads-soluciones/[id]/generar-oferta",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"leads-soluciones\",\"admin.leads.soluciones\",\"api\",\"/api/admin/leads-soluciones/[id]/generar-oferta\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "personal-nominas",
    areaCode: "admin.empleados.nominas",
    label: "Importar nóminas",
    group: "Personas",
    baselineIdentity: "[\"personal-nominas\",\"admin.empleados.nominas\"]",
    usersRowKey: "nominas",
    usersCodeOrder: 0,
    usersRow: {"key":"nominas","label":"Nóminas","order":19},
    surfaces: [
      {
        path: "/admin/empleados/nominas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal-nominas:0:0","label":"Importar nóminas","icon":"cloudArrowUp","appearances":[{"presentation":"agrupado","order":4,"parent":"personal:0:0"},{"presentation":"historico","order":4,"parent":"container:personal","label":"Importar Nóminas"}]}],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"page\",\"/admin/empleados/nominas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/admin/gastos-nominas",
        kind: "page",
        actions: ["V"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"page\",\"/admin/gastos-nominas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/area5-gastos",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/area5-gastos\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/area5-gastos/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/area5-gastos/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/area5-gastos/cierres",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/area5-gastos/cierres\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/area5-gastos/cierres/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/area5-gastos/cierres/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/area5-gastos/cierres/[id]/paquete",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/area5-gastos/cierres/[id]/paquete\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/area5-gastos/nominas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/area5-gastos/nominas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/nominas/debug",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/nominas/debug\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/nominas/download/[fileId]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/nominas/download/[fileId]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/nominas/sync",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/nominas/sync\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/nominas/upload",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-nominas\",\"admin.empleados.nominas\",\"api\",\"/api/admin/nominas/upload\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "personal-calendario",
    areaCode: "admin.empleados.calendario",
    label: "Calendario",
    group: "Personas",
    baselineIdentity: "[\"personal-calendario\",\"admin.empleados.calendario\"]",
    usersRowKey: "personal",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/admin/empleados/calendario",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal-calendario:0:0","label":"Calendario","icon":"calendarDays","appearances":[{"presentation":"agrupado","order":3,"parent":"personal:0:0"},{"presentation":"historico","order":3,"parent":"container:personal"}]}],
        baselineDescriptor: "[1,\"personal-calendario\",\"admin.empleados.calendario\",\"page\",\"/admin/empleados/calendario\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/calendario",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-calendario\",\"admin.empleados.calendario\",\"api\",\"/api/admin/calendario\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/calendario/sync",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-calendario\",\"admin.empleados.calendario\",\"api\",\"/api/admin/calendario/sync\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "personal-vacaciones",
    areaCode: "admin.empleados.vacaciones",
    label: "Vacaciones",
    group: "Personas",
    baselineIdentity: "[\"personal-vacaciones\",\"admin.empleados.vacaciones\"]",
    usersRowKey: "personal",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/empleados/vacaciones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"personal-vacaciones:0:0","label":"Vacaciones","icon":"sun","appearances":[{"presentation":"agrupado","order":2,"parent":"personal:0:0"},{"presentation":"historico","order":2,"parent":"container:personal"}]}],
        baselineDescriptor: "[1,\"personal-vacaciones\",\"admin.empleados.vacaciones\",\"page\",\"/admin/empleados/vacaciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/vacaciones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"personal-vacaciones\",\"admin.empleados.vacaciones\",\"api\",\"/api/admin/vacaciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.chat",
    areaCode: "admin.asistente.chat",
    label: "Chat interno",
    group: "Comercial",
    baselineIdentity: "[\"asistente.chat\",\"admin.asistente.chat\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 1,
    surfaces: [
      {
        path: "/admin/asistente/chat",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.chat:0:0","label":"Chat interno","icon":"chatBubbleLeftRight","appearances":[{"presentation":"agrupado","order":0,"parent":"asistente:0:0"},{"presentation":"historico","order":1,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.chat\",\"admin.asistente.chat\",\"page\",\"/admin/asistente/chat\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/chat",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.chat\",\"admin.asistente.chat\",\"api\",\"/api/admin/asistente/chat\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.conocimiento",
    areaCode: "admin.asistente.conocimiento",
    label: "Conocimiento",
    group: "Comercial",
    baselineIdentity: "[\"asistente.conocimiento\",\"admin.asistente.conocimiento\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 2,
    surfaces: [
      {
        path: "/admin/asistente/conocimiento",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.conocimiento:0:0","label":"Conocimiento","icon":"bookOpen","appearances":[{"presentation":"agrupado","order":1,"parent":"asistente:0:0"},{"presentation":"historico","order":2,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.conocimiento\",\"admin.asistente.conocimiento\",\"page\",\"/admin/asistente/conocimiento\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/conocimiento",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.conocimiento\",\"admin.asistente.conocimiento\",\"api\",\"/api/admin/asistente/conocimiento\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/conocimiento/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.conocimiento\",\"admin.asistente.conocimiento\",\"api\",\"/api/admin/asistente/conocimiento/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/conocimiento/web-publica",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.conocimiento\",\"admin.asistente.conocimiento\",\"api\",\"/api/admin/asistente/conocimiento/web-publica\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.conversaciones",
    areaCode: "admin.asistente.conversaciones",
    label: "Conversaciones",
    group: "Comercial",
    baselineIdentity: "[\"asistente.conversaciones\",\"admin.asistente.conversaciones\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 3,
    surfaces: [
      {
        path: "/admin/asistente/conversaciones",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.conversaciones:0:0","label":"Conversaciones","icon":"queueList","appearances":[{"presentation":"agrupado","order":2,"parent":"asistente:0:0"},{"presentation":"historico","order":3,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.conversaciones\",\"admin.asistente.conversaciones\",\"page\",\"/admin/asistente/conversaciones\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/conversaciones",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.conversaciones\",\"admin.asistente.conversaciones\",\"api\",\"/api/admin/asistente/conversaciones\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/conversaciones/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.conversaciones\",\"admin.asistente.conversaciones\",\"api\",\"/api/admin/asistente/conversaciones/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.leads",
    areaCode: "admin.asistente.leads",
    label: "Leads del asistente",
    group: "Comercial",
    baselineIdentity: "[\"asistente.leads\",\"admin.asistente.leads\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 4,
    surfaces: [
      {
        path: "/admin/asistente/leads",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.leads:0:0","label":"Leads del asistente","icon":"inboxStack","appearances":[{"presentation":"agrupado","order":3,"parent":"asistente:0:0"},{"presentation":"historico","order":4,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.leads\",\"admin.asistente.leads\",\"page\",\"/admin/asistente/leads\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/leads",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.leads\",\"admin.asistente.leads\",\"api\",\"/api/admin/asistente/leads\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/leads/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.leads\",\"admin.asistente.leads\",\"api\",\"/api/admin/asistente/leads/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/leads/[id]/contacto",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.leads\",\"admin.asistente.leads\",\"api\",\"/api/admin/asistente/leads/[id]/contacto\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.aprendizaje",
    areaCode: "admin.asistente.aprendizaje",
    label: "Aprendizaje",
    group: "Comercial",
    baselineIdentity: "[\"asistente.aprendizaje\",\"admin.asistente.aprendizaje\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 5,
    surfaces: [
      {
        path: "/admin/asistente/aprendizaje",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.aprendizaje:0:0","label":"Aprendizaje","icon":"lightBulb","appearances":[{"presentation":"agrupado","order":4,"parent":"asistente:0:0"},{"presentation":"historico","order":5,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.aprendizaje\",\"admin.asistente.aprendizaje\",\"page\",\"/admin/asistente/aprendizaje\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/aprendizaje",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.aprendizaje\",\"admin.asistente.aprendizaje\",\"api\",\"/api/admin/asistente/aprendizaje\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/aprendizaje/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.aprendizaje\",\"admin.asistente.aprendizaje\",\"api\",\"/api/admin/asistente/aprendizaje/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.analitica",
    areaCode: "admin.asistente.analitica",
    label: "Analítica",
    group: "Comercial",
    baselineIdentity: "[\"asistente.analitica\",\"admin.asistente.analitica\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 6,
    surfaces: [
      {
        path: "/admin/asistente/analitica",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.analitica:0:0","label":"Analítica","icon":"arrowTrendingUp","appearances":[{"presentation":"agrupado","order":5,"parent":"asistente:0:0"},{"presentation":"historico","order":6,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.analitica\",\"admin.asistente.analitica\",\"page\",\"/admin/asistente/analitica\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/analitica",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.analitica\",\"admin.asistente.analitica\",\"api\",\"/api/admin/asistente/analitica\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.propuestas",
    areaCode: "admin.asistente.propuestas",
    label: "Informes y propuestas",
    group: "Comercial",
    baselineIdentity: "[\"asistente.propuestas\",\"admin.asistente.propuestas\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 7,
    surfaces: [
      {
        path: "/admin/asistente/informes",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.propuestas:0:0","label":"Informes y propuestas","icon":"documentText","appearances":[{"presentation":"agrupado","order":6,"parent":"asistente:0:0"},{"presentation":"historico","order":7,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.propuestas\",\"admin.asistente.propuestas\",\"page\",\"/admin/asistente/informes\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/informes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.propuestas\",\"admin.asistente.propuestas\",\"api\",\"/api/admin/asistente/informes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/informes/propuestas/[id]",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.propuestas\",\"admin.asistente.propuestas\",\"api\",\"/api/admin/asistente/informes/propuestas/[id]\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "sistemas",
    areaCode: "admin.sistemas",
    label: "Sistemas y servicios",
    group: "Administración",
    baselineIdentity: "[\"sistemas\",\"admin.sistemas\"]",
    usersRowKey: "sistemas",
    usersCodeOrder: 0,
    usersRow: {"key":"sistemas","label":"Sistemas y servicios","order":31},
    surfaces: [
      {
        path: "/admin/sistemas",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"sistemas:0:0","label":"Sistemas y servicios","icon":"cog","appearances":[{"presentation":"agrupado","order":0},{"presentation":"historico","order":12}]}],
        baselineDescriptor: "[1,\"sistemas\",\"admin.sistemas\",\"page\",\"/admin/sistemas\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/sistemas/servicios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"sistemas\",\"admin.sistemas\",\"api\",\"/api/admin/sistemas/servicios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/sistemas/estado-vivo",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"sistemas\",\"admin.sistemas\",\"api\",\"/api/admin/sistemas/estado-vivo\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/sistemas/costes",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"sistemas\",\"admin.sistemas\",\"api\",\"/api/admin/sistemas/costes\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/sistemas/incidencias",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"sistemas\",\"admin.sistemas\",\"api\",\"/api/admin/sistemas/incidencias\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/sistemas/tasas",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"sistemas\",\"admin.sistemas\",\"api\",\"/api/admin/sistemas/tasas\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "asistente.configuracion",
    areaCode: "admin.asistente.configuracion",
    label: "Configuración",
    group: "Comercial",
    baselineIdentity: "[\"asistente.configuracion\",\"admin.asistente.configuracion\"]",
    usersRowKey: "asistente",
    usersCodeOrder: 8,
    surfaces: [
      {
        path: "/admin/asistente/configuracion",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"asistente.configuracion:0:0","label":"Configuración","icon":"cog","appearances":[{"presentation":"agrupado","order":7,"parent":"asistente:0:0"},{"presentation":"historico","order":8,"parent":"container:asistente"}]}],
        baselineDescriptor: "[1,\"asistente.configuracion\",\"admin.asistente.configuracion\",\"page\",\"/admin/asistente/configuracion\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/asistente/configuracion",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.configuracion\",\"admin.asistente.configuracion\",\"api\",\"/api/admin/asistente/configuracion\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/asistente/configuracion/historial",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"asistente.configuracion\",\"admin.asistente.configuracion\",\"api\",\"/api/admin/asistente/configuracion/historial\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
  {
    key: "certificaciones.iso_27001",
    areaCode: "admin.certificaciones.iso_27001",
    label: "ISO 27001",
    group: "Operación",
    baselineIdentity: "[\"certificaciones.iso_27001\",\"admin.certificaciones.iso_27001\"]",
    usersRowKey: "certificaciones",
    usersCodeOrder: 1,
    surfaces: [
    ],
  },
  {
    key: "certificaciones.tisax",
    areaCode: "admin.certificaciones.tisax",
    label: "TISAX",
    group: "Operación",
    baselineIdentity: "[\"certificaciones.tisax\",\"admin.certificaciones.tisax\"]",
    usersRowKey: "certificaciones",
    usersCodeOrder: 2,
    surfaces: [
    ],
  },
  {
    key: "certificaciones.cuestionarios",
    areaCode: "admin.certificaciones.cuestionarios",
    label: "Cuestionarios de seguridad",
    group: "Operación",
    baselineIdentity: "[\"certificaciones.cuestionarios\",\"admin.certificaciones.cuestionarios\"]",
    usersRowKey: "certificaciones",
    usersCodeOrder: 3,
    surfaces: [
      {
        path: "/admin/certificaciones/cuestionarios",
        kind: "page",
        actions: ["V"],
        menu: [{"id":"certificaciones.cuestionarios:0:0","label":"Cuestionarios de seguridad","icon":"clipboardDocumentList","appearances":[{"presentation":"agrupado","order":2,"parent":"certificaciones:0:0"},{"presentation":"historico","order":3,"parent":"container:certificaciones"}]}],
        baselineDescriptor: "[1,\"certificaciones.cuestionarios\",\"admin.certificaciones.cuestionarios\",\"page\",\"/admin/certificaciones/cuestionarios\",[\"V\"],[[\"V\",\"lectura\"]],null,null]",
      },
      {
        path: "/api/admin/certificaciones/cuestionarios",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"certificaciones.cuestionarios\",\"admin.certificaciones.cuestionarios\",\"api\",\"/api/admin/certificaciones/cuestionarios\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
      {
        path: "/api/admin/certificaciones/cuestionarios/original",
        kind: "api",
        actions: ["V","E","C","X"],
        baselineDescriptor: "[1,\"certificaciones.cuestionarios\",\"admin.certificaciones.cuestionarios\",\"api\",\"/api/admin/certificaciones/cuestionarios/original\",[\"V\",\"E\",\"C\",\"X\"],[[\"V\",\"lectura\"],[\"E\",\"escritura\"],[\"C\",\"confirmar\"],[\"X\",\"exportar\"]],null,{\"safeMethods\":[\"GET\",\"HEAD\",\"OPTIONS\"],\"selectors\":[\"action\",\"accion\"],\"confirmActions\":[\"confirmar\",\"confirmar_traspasos_propios_manual\",\"aprobar\",\"aprobar_extra\",\"aprobar_gasto\",\"validar\",\"asociar_devolucion\",\"asociar_facturas\",\"vincular_factura_interes\",\"vincular_compra\",\"vincular_personal\",\"imputar\",\"imputar-a-ventas\",\"imputar-todas-proveedor\",\"aplicar-similares\",\"guardar-lineas\",\"RESOLVER_CUARENTENA\",\"RESOLVER_HISTORICA\"],\"exportActions\":[\"exportar\",\"export\",\"download\",\"descargar\",\"pdf\",\"excel\",\"csv\"],\"confirmPathSegments\":[\"confirmar\",\"aprobar\",\"validar\",\"confirmacion\"],\"exportPathSegments\":[\"exportar\",\"exportar-a3\",\"export\",\"exportaciones\",\"excel\",\"csv\"],\"exportFinalSegment\":\"pdf\",\"singleDocumentException\":\"/api/admin/finanzas/conciliar/documento\"}]",
      },
    ],
  },
] as const

export function area4SectionByKey(key: string): Area4Section | undefined {
  return AREA4_SECTION_REGISTRY.find(section => section.key === key)
}

function physicalPatternMatches(pathname: string, pattern: string): boolean {
  const actual = pathname.split('/').filter(Boolean)
  const expected = pattern.split('/').filter(Boolean)
  return actual.length === expected.length && expected.every((segment, index) => /^\[[^/]+\]$/.test(segment) || segment === actual[index])
}

export function area4SectionIsBaseline(section: Area4Section): boolean {
  return section.baselineIdentity === JSON.stringify([section.key, section.areaCode])
}

/** Exact, versioned security contract; labels, groups and menu order are cosmetic. */
export function area4SurfaceDescriptor(section: Area4Section, surface: Area4Surface): string {
  const actions = surface.actions || []
  return JSON.stringify([1, section.key, section.areaCode, surface.kind, surface.path, actions,
    AREA4_ACTIONS.filter(action => actions.includes(action.letter)).map(action => [action.letter, action.capability]),
    surface.request || null, surface.kind === 'api' ? AREA4_REQUEST_CONTRACT : null])
}

export function area4RegistrySurfaceMatches(registry: readonly Area4Section[] = AREA4_SECTION_REGISTRY): readonly Area4SurfaceMatch[] {
  return registry.flatMap(section => section.surfaces.map(surface => {
    const descriptor = area4SurfaceDescriptor(section, surface)
    return { section, surface, id: `${surface.kind}:${surface.path}`, descriptor,
      baseline: area4SectionIsBaseline(section) && surface.baselineDescriptor === descriptor }
  }))
}

/** Literal paths win over dynamic patterns, including menu query/hash variants. */
export function area4RegisteredSurface(pathname: string, kind: Area4SurfaceKind): Area4SurfaceMatch | null {
  const path = pathname.split(/[?#]/)[0]
  let best: Area4SurfaceMatch | null = null
  let bestDynamic = Number.POSITIVE_INFINITY
  for (const section of AREA4_SECTION_REGISTRY) for (const surface of section.surfaces) {
    if (surface.kind !== kind || !physicalPatternMatches(path, surface.path)) continue
    const dynamic = (surface.path.match(/\[[^/]+\]/g) || []).length
    if (dynamic >= bestDynamic) continue
    const descriptor = area4SurfaceDescriptor(section, surface)
    best = { section, surface, id: `${kind}:${surface.path}`, descriptor,
      baseline: area4SectionIsBaseline(section) && surface.baselineDescriptor === descriptor }
    bestDynamic = dynamic
    if (dynamic === 0) return best
  }
  return best
}

/** Code gate is compatibility evidence, never a parent grant for a new route. */
export function area4CodeIsBaseline(code: string): boolean {
  return AREA4_SECTION_REGISTRY.some(section => section.areaCode === code && area4SectionIsBaseline(section))
}
export function area4RegisteredSurfaceArea(pathname: string, kind: Area4SurfaceKind): string | null {
  return area4RegisteredSurface(pathname, kind)?.section.areaCode || null
}
export function area4RegisteredSurfacePaths(kind: Area4SurfaceKind): readonly string[] {
  return AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces.filter(surface => surface.kind === kind).map(surface => surface.path))
}

/** Historical row membership is explicit. An added child code gets its own empty row. */
export function area4RegistryUsersSections(registry: readonly Area4Section[] = AREA4_SECTION_REGISTRY): UsersSection[] {
  const rows = new Map<string, { row: UsersSection; order: number; members: Array<{ code: string; order: number }> }>()
  for (const section of registry) {
    const baseline = area4SectionIsBaseline(section)
    const metadata = baseline && section.usersRow
    if (metadata) rows.set(metadata.key, { row: { key: metadata.key, label: metadata.label, group: section.group, codes: [] }, order: metadata.order, members: [] })
    for (const empty of section.usersEmptyRows || []) {
      if (!baseline || empty.baselineIdentity !== JSON.stringify([empty.key, []])) continue
      rows.set(empty.key, { row: { key: empty.key, label: empty.label, group: section.group, codes: [] }, order: empty.order, members: [] })
    }
  }
  for (const section of registry) {
    const key = area4SectionIsBaseline(section) && section.usersRowKey ? section.usersRowKey : section.key
    if (!rows.has(key)) rows.set(key, { row: { key, label: section.label, group: section.group, codes: [] }, order: Number.MAX_SAFE_INTEGER, members: [] })
    rows.get(key)!.members.push({ code: section.areaCode, order: section.usersCodeOrder ?? Number.MAX_SAFE_INTEGER })
  }
  return [...rows.values()].sort((a, b) => a.order - b.order).map(({ row, members }) => ({ ...row,
    codes: [...new Set(members.sort((a, b) => a.order - b.order).map(member => member.code))] }))
}
export const AREA4_REGISTRY_USERS_SECTIONS: UsersSection[] = area4RegistryUsersSections()
export function area4UsersRowIsBaseline(row: UsersSection): boolean {
  if (row.codes.length) return row.codes.every(area4CodeIsBaseline)
    && AREA4_SECTION_REGISTRY.some(section => area4SectionIsBaseline(section) && section.usersRow?.key === row.key)
  return AREA4_SECTION_REGISTRY.some(section => area4SectionIsBaseline(section) && section.usersEmptyRows?.some(empty => empty.key === row.key && empty.baselineIdentity === JSON.stringify([empty.key, []])))
}

export type Area4MenuLeaf = Readonly<{ name: string; href: string; icon: string; section: string; exact?: boolean }>
export type Area4MenuItem = Area4MenuLeaf & Readonly<{ subitems?: readonly Area4MenuItem[]; collapsible?: boolean; preserveContainer?: boolean }>
export type Area4HistoricalMenuEntry = Area4MenuItem | Readonly<{ name: string; icon: string; section: string; children: readonly Area4MenuItem[] }>

type MenuCandidate = { section: Area4Section; surface: Area4Surface; menu: Area4SurfaceMenu; appearance: Area4MenuAppearance }
function menuCandidates(presentation: Area4MenuPresentation): MenuCandidate[] {
  return AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces.flatMap(surface => (surface.menu || []).flatMap(menu =>
    menu.appearances.filter(appearance => appearance.presentation === presentation).map(appearance => ({ section, surface, menu, appearance })))))
}
function menuLeaf(candidate: MenuCandidate): Area4MenuLeaf {
  const { section, surface, menu, appearance } = candidate
  const path = surface.path.replace(/\[([^/]+)\]/g, (_, parameter) => menu.parameters?.[parameter] || `[${parameter}]`)
  return { name: appearance.label || menu.label, href: `${path}${menu.query ? `?${menu.query}` : ''}`,
    icon: appearance.icon || menu.icon, section: menu.sectionKey || section.key,
    ...(appearance.exact ? { exact: true } : {}) }
}
function menuItem(candidate: MenuCandidate, candidates: readonly MenuCandidate[], ancestors: readonly string[] = []): Area4MenuItem {
  // Some legacy overview appearances reuse their parent's menu id: keep the link,
  // but do not recursively expand that alias (or any future cyclic appearance).
  if (ancestors.includes(candidate.menu.id)) return menuLeaf(candidate)
  const children = candidates.filter(child => child.appearance.parent === candidate.menu.id).sort((a, b) => a.appearance.order - b.appearance.order)
  return { ...menuLeaf(candidate),
    ...(candidate.menu.collapsible ? { collapsible: true } : {}),
    ...(candidate.menu.preserveContainer ? { preserveContainer: true } : {}),
    ...(children.length ? { subitems: children.map(child => menuItem(child, candidates, [...ancestors, candidate.menu.id])) } : {}) }
}
export const AREA4_GROUPED_MENU: Readonly<Record<Area4MenuGroup, readonly Area4MenuItem[]>> = AREA4_MENU_GROUPS.reduce((menu, group) => {
  const candidates = menuCandidates('agrupado')
  const roots = candidates.filter(candidate => !candidate.appearance.parent && (area4SectionByKey(candidate.menu.sectionKey || candidate.section.key)?.group === group))
  menu[group] = roots.sort((a, b) => a.appearance.order - b.appearance.order).map(candidate => menuItem(candidate, candidates))
  return menu
}, {} as Record<Area4MenuGroup, readonly Area4MenuItem[]>)
export const AREA4_HISTORICAL_MENU: readonly Area4HistoricalMenuEntry[] = (() => {
  const candidates = menuCandidates('historico')
  const entries: Array<{ order: number; entry: Area4HistoricalMenuEntry }> = candidates.filter(candidate => !candidate.appearance.parent)
    .map(candidate => ({ order: candidate.appearance.order, entry: menuItem(candidate, candidates) }))
  for (const section of AREA4_SECTION_REGISTRY) if (section.historicalContainer) {
    const container = section.historicalContainer
    const children = candidates.filter(candidate => candidate.appearance.parent === `container:${section.key}`).sort((a, b) => a.appearance.order - b.appearance.order)
    entries.push({ order: container.order, entry: { name: container.name, icon: container.icon, section: section.key, children: children.map(candidate => menuItem(candidate, candidates)) } })
  }
  return entries.sort((a, b) => a.order - b.order).map(item => item.entry)
})()
/** Exactly eight technical sections, independently addressable, without a parent grant. */
export function area4TechnicalMenu(registry: readonly Area4Section[] = AREA4_SECTION_REGISTRY): readonly Area4MenuLeaf[] {
  return registry.filter(section => section.technicalOrder !== undefined && area4SectionIsBaseline(section))
    .sort((a, b) => a.technicalOrder! - b.technicalOrder!).map(section => {
    const surface = section.surfaces.find(item => item.kind === 'page')!
    return { name: section.label, href: surface.path, icon: surface.menu?.[0]?.icon || 'folder', section: section.key }
  })
}
export const AREA4_DRAXTON_TECHNICAL_MENU: readonly Area4MenuLeaf[] = area4TechnicalMenu()

/** Easy navigation shares the same physical pages, labels and availability metadata. */
export function area4EasyMenu(conciliarEnabled: boolean): readonly Area4MenuLeaf[] {
  // Encargo J: con Conciliar habilitada, pedir y remesas son vistas de la misma pantalla.
  const desired = conciliarEnabled ? ['conciliar'] : ['modo-facil', 'para-pedir']
  return desired.flatMap(easy => AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces.filter(surface => surface.easy === easy).map(surface => {
    const menu = surface.menu?.[0]
    return { name: menu?.label || section.label, href: surface.path,
      icon: easy === 'para-pedir' ? 'documentText' : 'clipboardDocumentList', section: section.key }
  })))
}

/** Dashboard presentation belongs to this registry, not to a second role/access catalogue.
 * Each block names an EXISTING apartado and its real page; metadata NEVER grants V.
 * Readers require both apartado V and source-surface permission before any data is loaded.
 * Baseline descriptors/identities above are untouched; no automatic assignments or adoption.
 */
export type Area4DashboardReader = 'finance' | 'clients' | 'contracts' | 'crm' | 'rentabilidad' | 'decisions' | 'soon'
export type Area4DashboardDefinition = Readonly<{
  id: string; sectionKey: string; sourcePath: string; title: string; help: string;
  reader: Area4DashboardReader; chart?: 'money' | 'percent';
}>
export const AREA4_DASHBOARD_BLOCKS: readonly Area4DashboardDefinition[] = [
  { id: 'decisiones', sectionKey: 'usuarios-permisos', sourcePath: '/admin/usuarios', title: 'Necesita tu decisión', help: 'Lo que está parado esperando un sí o un no tuyo.', reader: 'decisions' },
  { id: 'facturado', sectionKey: 'facturacion', sourcePath: '/admin/facturacion', title: 'Facturado por mes · {year}', help: '{month} va en curso.', reader: 'finance', chart: 'money' },
  { id: 'avisos', sectionKey: 'conciliacion', sourcePath: '/admin/finanzas/conciliar', title: 'Avisos', help: '', reader: 'finance' },
  { id: 'margen', sectionKey: 'rentabilidad', sourcePath: '/admin/rentabilidad', title: 'Margen por mes', help: 'Margen conocido; provisional solo con fiabilidad inferior al 60 %.', reader: 'rentabilidad', chart: 'percent' },
  { id: 'mi-dia', sectionKey: 'crm', sourcePath: '/admin/crm', title: 'Mi día', help: 'Reuniones guardadas y tareas del CRM.', reader: 'crm' },
  { id: 'altas', sectionKey: 'altas-pendientes', sourcePath: '/admin/altas-pendientes', title: 'Altas pendientes', help: 'Contratos firmados que aún no están en ISP.', reader: 'soon' },
  { id: 'permanencias', sectionKey: 'contratos', sourcePath: '/admin/contratos', title: 'Permanencias que acaban', help: 'Próximos 60 días: buena ocasión para renovar.', reader: 'soon' },
  { id: 'cierre', sectionKey: 'conciliacion', sourcePath: '/admin/finanzas/conciliar', title: 'Cierre de {month}', help: 'Lo que falta para cerrar el mes.', reader: 'soon' },
  { id: 'para-hoy', sectionKey: 'conciliacion', sourcePath: '/admin/finanzas/conciliar', title: 'Para hoy', help: '', reader: 'finance' },
  { id: 'gastos-equipo', sectionKey: 'personal', sourcePath: '/admin/empleados', title: 'Gastos de trabajadores', help: 'Área 5.', reader: 'soon' },
  { id: 'negocios', sectionKey: 'crm', sourcePath: '/admin/crm', title: 'Mis negocios por etapa', help: 'Pulsa uno para abrir su ficha.', reader: 'crm' },
  { id: 'objetivo', sectionKey: 'crm', sourcePath: '/admin/crm', title: 'Objetivo de {month}', help: '', reader: 'soon' },
  { id: 'leads-nuevos', sectionKey: 'leads', sourcePath: '/admin/leads', title: 'Leads nuevos sin contactar', help: 'Llegados por la web y por teléfono.', reader: 'crm' },
  { id: 'draxton-facturas', sectionKey: 'draxton-finanzas', sourcePath: '/admin/clientes/ggcc/draxton/finanzas', title: 'Facturas de Draxton', help: 'Solo las de las sociedades del grupo.', reader: 'soon' },
  { id: 'draxton-documentos', sectionKey: 'draxton-contratos', sourcePath: '/admin/clientes/ggcc/draxton/contratos', title: 'Documentación', help: 'Requerimientos y contratos.', reader: 'soon' },
  { id: 'mis-gastos', sectionKey: 'portal-empleado', sourcePath: '/empleado/gastos', title: 'Mis gastos', help: 'Sube el ticket con el móvil.', reader: 'soon' },
  { id: 'mis-documentos', sectionKey: 'portal-empleado', sourcePath: '/empleado/nominas', title: 'Mis documentos', help: '', reader: 'soon' },
  { id: 'comunicados', sectionKey: 'comunicados', sourcePath: '/admin/comunicados', title: 'Comunicados', help: '', reader: 'soon' },
]
export type Area4DashboardKpiDefinition = Readonly<{
  id: string; sectionKey: string; sourcePath: string; label: string; reader: Area4DashboardReader;
}>
export const AREA4_DASHBOARD_KPIS: readonly Area4DashboardKpiDefinition[] = [
  { id: 'facturado-anio', sectionKey: 'facturacion', sourcePath: '/admin/facturacion', label: 'Facturado {year}', reader: 'finance' },
  { id: 'facturado-mes', sectionKey: 'facturacion', sourcePath: '/admin/facturacion', label: '{month}', reader: 'finance' },
  { id: 'margen-ultimo', sectionKey: 'rentabilidad', sourcePath: '/admin/rentabilidad', label: 'Margen del último mes con dato', reader: 'rentabilidad' },
  { id: 'cobro', sectionKey: 'conciliacion', sourcePath: '/admin/finanzas/conciliar', label: 'Cobro confirmado', reader: 'finance' },
  { id: 'clientes', sectionKey: 'clientes', sourcePath: '/admin/clientes', label: 'Clientes activos', reader: 'clients' },
  { id: 'contratos', sectionKey: 'contratos', sourcePath: '/admin/contratos', label: 'Contratos activos', reader: 'contracts' },
  { id: 'altas-pendientes', sectionKey: 'altas-pendientes', sourcePath: '/admin/altas-pendientes', label: 'Altas pendientes', reader: 'soon' },
  { id: 'leads', sectionKey: 'leads', sourcePath: '/admin/leads', label: 'Leads abiertos', reader: 'crm' },
  { id: 'reuniones', sectionKey: 'crm', sourcePath: '/admin/crm', label: 'Reuniones esta semana', reader: 'crm' },
  { id: 'por-confirmar', sectionKey: 'conciliacion', sourcePath: '/admin/finanzas/conciliar', label: 'Por confirmar', reader: 'finance' },
  { id: 'extractos', sectionKey: 'conciliacion', sourcePath: '/admin/finanzas/conciliar', label: 'Extractos', reader: 'finance' },
  { id: 'proveedores', sectionKey: 'finanzas-facturas', sourcePath: '/admin/finanzas/facturas', label: 'Facturas de proveedor', reader: 'soon' },
  { id: 'remesa', sectionKey: 'finanzas-remesas', sourcePath: '/admin/finanzas/conciliacion-remesas', label: 'Remesa {month}', reader: 'soon' },
  { id: 'mis-leads', sectionKey: 'leads', sourcePath: '/admin/leads', label: 'Mis leads', reader: 'crm' },
  { id: 'mis-negocios', sectionKey: 'crm', sourcePath: '/admin/crm', label: 'Mis negocios', reader: 'crm' },
  { id: 'ganado', sectionKey: 'crm', sourcePath: '/admin/crm', label: 'Ganado en {month}', reader: 'crm' },
  { id: 'objetivo-mes', sectionKey: 'crm', sourcePath: '/admin/crm', label: 'Objetivo del mes', reader: 'soon' },
  { id: 'mis-clientes', sectionKey: 'clientes', sourcePath: '/admin/clientes', label: 'Mis clientes', reader: 'soon' },
  { id: 'draxton-facturado', sectionKey: 'draxton-finanzas', sourcePath: '/admin/clientes/ggcc/draxton/finanzas', label: 'Facturado a Draxton {year}', reader: 'soon' },
  { id: 'draxton-sedes', sectionKey: 'draxton-contratos', sourcePath: '/admin/clientes/ggcc/draxton/contratos', label: 'Sedes', reader: 'soon' },
  { id: 'draxton-pendientes', sectionKey: 'draxton-finanzas', sourcePath: '/admin/clientes/ggcc/draxton/finanzas', label: 'Facturas pendientes', reader: 'soon' },
  { id: 'draxton-incidencias', sectionKey: 'draxton-seguimiento', sourcePath: '/admin/clientes/ggcc/draxton/seguimiento', label: 'Incidencias abiertas', reader: 'soon' },
  { id: 'draxton-requerimientos', sectionKey: 'draxton-contratos', sourcePath: '/admin/clientes/ggcc/draxton/contratos', label: 'Requerimientos AEAT', reader: 'soon' },
  { id: 'draxton-ultima', sectionKey: 'draxton-finanzas', sourcePath: '/admin/clientes/ggcc/draxton/finanzas', label: 'Última factura', reader: 'soon' },
  { id: 'gastos-propios', sectionKey: 'portal-empleado', sourcePath: '/empleado/gastos', label: 'Mis gastos', reader: 'soon' },
  { id: 'nomina-propia', sectionKey: 'portal-empleado', sourcePath: '/empleado/nominas', label: 'Última nómina', reader: 'soon' },
  { id: 'vacaciones-propias', sectionKey: 'portal-empleado', sourcePath: '/empleado', label: 'Vacaciones', reader: 'soon' },
  { id: 'peticiones-propias', sectionKey: 'peticiones-propias', sourcePath: '/peticiones', label: 'Mis peticiones', reader: 'soon' },
  { id: 'comunicados-propios', sectionKey: 'comunicados', sourcePath: '/admin/comunicados', label: 'Comunicados', reader: 'soon' },
  { id: 'agenda-propia', sectionKey: 'portal-empleado', sourcePath: '/empleado', label: 'Mi día', reader: 'soon' },
]
export const AREA4_DASHBOARD_LAYOUTS: Readonly<Record<import('./users-contract').ApprovedRoleKey, Readonly<{ kpis: readonly string[]; columns: readonly (readonly string[])[] }>>> = {
  superadmin: { kpis: ['facturado-anio','facturado-mes','margen-ultimo','cobro','clientes','contratos'], columns: [['decisiones','facturado'],['avisos','margen','mi-dia']] },
  gerente: { kpis: ['facturado-mes','clientes','contratos','altas-pendientes','leads','reuniones'], columns: [['mi-dia','altas'],['facturado','permanencias']] },
  contabilidad: { kpis: ['facturado-mes','cobro','por-confirmar','extractos','proveedores','remesa'], columns: [['cierre','facturado'],['para-hoy','gastos-equipo']] },
  comercial: { kpis: ['mis-leads','mis-negocios','ganado','objetivo-mes','reuniones','mis-clientes'], columns: [['mi-dia','negocios'],['objetivo','leads-nuevos']] },
  draxton: { kpis: ['draxton-facturado','draxton-sedes','draxton-pendientes','draxton-incidencias','draxton-requerimientos','draxton-ultima'], columns: [['draxton-facturas'],['draxton-documentos']] },
  empleado: { kpis: ['gastos-propios','nomina-propia','vacaciones-propias','peticiones-propias','comunicados-propios','agenda-propia'], columns: [['mis-gastos'],['mis-documentos','comunicados']] },
}
