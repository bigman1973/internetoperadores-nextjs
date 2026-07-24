import prisma from '@/lib/prisma'

/**
 * Registra un área automáticamente si no existe.
 * Llamar desde el server-side de cada página protegida.
 * Si el área ya existe, no hace nada.
 */
export async function registrarArea(codigo: string, nombre: string, padre?: string) {
  try {
    await prisma.permisoArea.upsert({
      where: { codigo },
      update: {},
      create: {
        codigo,
        nombre,
        padre: padre || null,
        activo: true,
      },
    })
  } catch (e) {
    // Silenciar errores de registro (puede haber race conditions)
    console.warn(`[permisos] Error registrando área ${codigo}:`, e)
  }
}

/**
 * Verifica si un usuario tiene permiso de lectura o escritura en un área.
 * Soporta herencia: si tiene permiso en un padre, hereda a los hijos.
 * SUPER_ADMIN y GERENTE siempre tienen acceso total.
 */
export async function verificarPermisoServer(
  usuarioId: number,
  codigoArea: string,
  rol?: string
): Promise<{ lectura: boolean; escritura: boolean }> {
  // SUPER_ADMIN y GERENTE siempre tienen acceso total
  if (rol === 'SUPER_ADMIN' || rol === 'GERENTE') {
    return { lectura: true, escritura: true }
  }

  // Construir cadena de herencia
  const partes = codigoArea.split('.')
  const codigosHerencia: string[] = []
  for (let i = 1; i <= partes.length; i++) {
    codigosHerencia.push(partes.slice(0, i).join('.'))
  }

  // Buscar permisos del usuario en cualquiera de los niveles
  const permisos = await prisma.permisoUsuario.findMany({
    where: {
      usuarioId,
      area: {
        codigo: { in: codigosHerencia },
      },
    },
  })

  if (permisos.length === 0) {
    return { lectura: false, escritura: false }
  }

  let lectura = false
  let escritura = false

  for (const p of permisos) {
    if (p.lectura) lectura = true
    if (p.escritura) escritura = true
  }

  return { lectura, escritura }
}

/**
 * Hook para usar en componentes client-side.
 * Devuelve una función que verifica permisos via API.
 */
export function getCodigoAreaFromPath(pathname: string): string {
  // Convierte /admin/clientes/ggcc/draxton/contratos → admin.clientes.ggcc.draxton.contratos
  const clean = pathname
    .replace(/^\//, '')  // quitar / inicial
    .replace(/\//g, '.') // reemplazar / por .
    .replace(/-/g, '_')  // reemplazar - por _
  return clean
}
