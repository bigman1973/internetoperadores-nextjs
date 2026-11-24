import prisma from '@/lib/prisma'
import type {Prisma} from '@prisma/client'
import { evaluateArea4Capability, isArea4Owner, isArea4OwnerOnlyArea, isArea4MissingAdoptionColumn } from './area4/policy'

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
  _rol?: string,
  database: Pick<Prisma.TransactionClient, 'usuarioAdmin' | 'permisoArea' | 'permisoUsuario'> = prisma,
): Promise<{ lectura: boolean; escritura: boolean; confirmar: boolean; exportar: boolean }> {
  const denied = { lectura: false, escritura: false, confirmar: false, exportar: false }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) return denied
  // The legacy role argument is retained for callers, but never authorizes.
  const principal = await database.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!principal?.activo) return denied
  if (isArea4Owner(principal)) return { lectura: true, escritura: true, confirmar: true, exportar: true }
  if (principal.rol === 'SUPER_ADMIN' || isArea4OwnerOnlyArea(codigoArea)) return denied
  const codes = codigoArea.split('.').map((_, i, parts) => parts.slice(0, i + 1).join('.'))
  const [area, rows] = await Promise.all([
    database.permisoArea.findUnique({ where: { codigo: codigoArea }, select: { activo: true } }),
    database.permisoUsuario.findMany({ where: { usuarioId, area: { codigo: { in: codes }, activo: true } },
      select: { lectura: true, escritura: true, area: { select: { codigo: true } } } }),
  ])
  if (area?.activo === false) return denied
  let adopted = false
  try {
    const marker = await database.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { permisosArea4Vivos: true } })
    adopted = marker?.permisosArea4Vivos === true
  } catch (error) {
    if (!isArea4MissingAdoptionColumn(error)) throw error
  }
  if (!adopted) {
    // Historical V/E only; C/X are not invented from a legacy write grant.
    return { lectura: principal.rol === 'GERENTE' || rows.some(p => p.lectura),
      escritura: principal.rol === 'GERENTE' || rows.some(p => p.escritura), confirmar: false, exportar: false }
  }
  const liveRows = await database.permisoUsuario.findMany({ where: { usuarioId, area: { codigo: { in: codes }, activo: true } },
    select: { lectura: true, escritura: true, confirmar: true, exportar: true, area: { select: { codigo: true } } } })
  const grants = liveRows.map(p => ({ codigo: p.area.codigo, lectura: p.lectura, escritura: p.escritura, confirmar: p.confirmar, exportar: p.exportar }))
  return Object.fromEntries(['lectura', 'escritura', 'confirmar', 'exportar'].map(capability => [capability,
    evaluateArea4Capability({ principal, grants, codigoArea, capability: capability as 'lectura' | 'escritura' | 'confirmar' | 'exportar', permissionsAdopted: true })])) as typeof denied
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
