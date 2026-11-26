/**
 * Área 1 · Puertas de producción de la tanda 1 (25/11/2026).
 * Lo que NO entra en producción se queda cerrado por código, aunque se publique el fichero:
 *  - Ficha nueva: al abrir su puerta en Production, sólo Superadmin/Gerente; el resto usa la anterior.
 *  - Importaciones del CRM (ISP «Aplicar», HubSpot «Importar», vínculos ISP): 404 en producción.
 * Para abrirlas más adelante hay que crear la variable indicada en Production Y publicar de nuevo.
 */
type Env = Record<string, string | undefined>
const enProduccion = (env: Env) => env.VERCEL_ENV === 'production'
export function fichaNuevaHabilitada(env: Env = process.env): boolean {
  return !enProduccion(env) || (env.AREA1_FICHA_NUEVA_PRODUCCION || '').trim() === '1'
}
/** No concede permisos: la página/API siguen exigiendo Empresas y sus guardas vigentes. */
export function fichaNuevaDisponibleParaRol(rol: string | null | undefined, roles?: readonly string[] | null, env: Env = process.env): boolean {
  if (!fichaNuevaHabilitada(env)) return false
  if (!enProduccion(env)) return true
  const vivos = new Set([rol, ...(roles || [])])
  return vivos.has('SUPER_ADMIN') || vivos.has('GERENTE')
}
export function importacionesCrmCerradas(env: Env = process.env): boolean {
  return enProduccion(env) && (env.AREA1_IMPORTACIONES_PRODUCCION || '').trim() !== '1'
}
