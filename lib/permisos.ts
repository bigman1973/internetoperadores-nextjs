import prisma from '@/lib/prisma'

// Solo se almacenan códigos de áreas públicas, nunca identidades ni permisos.
// La TTL permite revalidar un área si la configuración cambia en otra instancia.
const registeredAreas = new Map<string, { expires: number; pending?: Promise<void> }>()
const AREA_TTL_MS = 5 * 60 * 1000

/**
 * Registra un área automáticamente si no existe.
 * Llamar desde el server-side de cada página protegida.
 * Si el área ya existe, no hace nada.
 */
export async function registrarArea(codigo: string, nombre: string, padre?: string) {
  const cached = registeredAreas.get(codigo)
  if (cached?.pending) return cached.pending
  if (cached && cached.expires > Date.now()) return

  const pending = (async () => {
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
    registeredAreas.set(codigo, { expires: Date.now() + AREA_TTL_MS })
  } catch (e) {
    registeredAreas.delete(codigo)
    // Silenciar errores de registro (puede haber race conditions)
    console.warn(`[permisos] Error registrando área ${codigo}:`, e)
  }
  })()
  registeredAreas.set(codigo, { expires: 0, pending })
  return pending
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
  const [areaObjetivo, permisos] = await Promise.all([
    prisma.permisoArea.findUnique({ where: { codigo: codigoArea }, select: { activo: true } }),
    prisma.permisoUsuario.findMany({
      where: {
        usuarioId,
        area: {
          codigo: { in: codigosHerencia },
          activo: true,
        },
      },
    }),
  ])

  if (areaObjetivo?.activo === false) return { lectura: false, escritura: false }

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
