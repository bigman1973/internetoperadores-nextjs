'use client'

import { useRole } from '@/components/admin/RoleContext'

/**
 * Hook para verificar permisos granulares en componentes client-side.
 * Usa el contexto de RoleContext que ya tiene los permisos cargados.
 * 
 * Ejemplo de uso:
 * const { canRead, canWrite } = usePermisoArea('admin.clientes.ggcc.draxton.contratos')
 */
export function usePermisoArea(codigoArea: string) {
  const { hasAreaAccess } = useRole()

  return {
    canRead: hasAreaAccess(codigoArea, 'lectura'),
    canWrite: hasAreaAccess(codigoArea, 'escritura'),
  }
}

/**
 * Componente wrapper que oculta contenido si no tiene permiso.
 * 
 * Ejemplo:
 * <ProtectedArea codigo="admin.clientes.ggcc.draxton.contratos" tipo="lectura">
 *   <ContenidoProtegido />
 * </ProtectedArea>
 */
export function ProtectedArea({ 
  children, 
  codigo, 
  tipo = 'lectura',
  fallback = null 
}: { 
  children: React.ReactNode
  codigo: string
  tipo?: 'lectura' | 'escritura'
  fallback?: React.ReactNode
}) {
  const { hasAreaAccess } = useRole()
  
  if (!hasAreaAccess(codigo, tipo)) {
    return fallback as any
  }

  return children
}
