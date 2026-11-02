import type { Area4Capability } from './policy'

export type Area4TemplateGrant = Readonly<{
  areaCodigo: string
  lectura: boolean
  escritura: boolean
  confirmar: boolean
  exportar: boolean
}>

export type Area4Template = Readonly<{
  id: string
  nombre: string
  descripcion: string
  color: string
  permisos: readonly Area4TemplateGrant[]
}>

const allBusiness = (areaCodigo: string): Area4TemplateGrant => ({
  areaCodigo,
  lectura: true,
  escritura: true,
  confirmar: true,
  exportar: true,
})

const readOnly = (areaCodigo: string): Area4TemplateGrant => ({
  areaCodigo,
  lectura: true,
  escritura: false,
  confirmar: false,
  exportar: false,
})

const employeeRequest = (areaCodigo: string): Area4TemplateGrant => ({
  areaCodigo,
  lectura: true,
  escritura: true,
  confirmar: true,
  exportar: false,
})

/**
 * Perfiles preparados, no asignados. La aplicación posterior exige confirmación
 * humana y deja siempre una evidencia append-only.
 */
export const AREA4_TEMPLATES: readonly Area4Template[] = [
  {
    id: 'area4-gerente-operativo',
    nombre: 'AREA4 · Gerente operativo',
    descripcion: 'Todo el negocio salvo Usuarios, permisos, auditoría y Actuar como.',
    color: '#FF5300',
    permisos: [
      'admin.crm', 'admin.tarifas', 'admin.clientes', 'admin.leads', 'admin.asistente',
      'admin.comunicados', 'admin.altas_pendientes', 'admin.contratos', 'admin.facturacion',
      'admin.finanzas', 'admin.estadisticas', 'admin.subida_precios', 'admin.empleados',
      'admin.proyectos', 'admin.proyectos_internos', 'admin.aapp', 'admin.certificaciones',
      'admin.peticiones', 'admin.historial', 'admin.configuracion', 'admin.imputaciones',
    ].map(allBusiness),
  },
  {
    id: 'area4-contabilidad-clientes-rrhh',
    nombre: 'AREA4 · Contabilidad + Clientes (ver) + RRHH',
    descripcion: 'Contabilidad y RRHH completos; Clientes solo consulta, incluidos sus subapartados.',
    color: '#2D2A26',
    permisos: [
      allBusiness('admin.facturacion'),
      allBusiness('admin.finanzas'),
      readOnly('admin.clientes'),
      allBusiness('admin.empleados'),
    ],
  },
  {
    id: 'area4-empleado-portal-peticiones',
    nombre: 'AREA4 · Empleado: Portal y Peticiones',
    descripcion: 'Portal propio y sus peticiones de mejora o incidencia; sin acceso administrativo.',
    color: '#64748b',
    permisos: [
      employeeRequest('empleado.portal'),
      employeeRequest('empleado.peticiones'),
    ],
  },
  {
    id: 'area4-tecnico-draxton-8',
    nombre: 'AREA4 · Técnico Draxton (8 subáreas)',
    descripcion: 'Equivalente a las ocho subáreas actuales de Alejandro y Jesús. No se asigna automáticamente.',
    color: '#2563eb',
    permisos: [
      'admin.clientes.ggcc.draxton.actualizaciones',
      'admin.clientes.ggcc.draxton.contrato_guardias',
      'admin.clientes.ggcc.draxton.informes',
      'admin.clientes.ggcc.draxton.kpis',
      'admin.clientes.ggcc.draxton.organigrama',
      'admin.clientes.ggcc.draxton.personal',
      'admin.clientes.ggcc.draxton.proyectos',
      'admin.clientes.ggcc.draxton.seguimiento',
    ].map(areaCodigo => ({ areaCodigo, lectura: true, escritura: true, confirmar: false, exportar: false })),
  },
] as const

export function isArea4Capability(value: string): value is Area4Capability {
  return ['lectura', 'escritura', 'confirmar', 'exportar'].includes(value)
}
