/**
 * Área 1 · Puertas de producción de la tanda 1 (25/11/2026).
 * Lo que NO entra en producción se queda cerrado por código, aunque se publique el fichero:
 *  - Ficha de cliente nueva (/admin/crm/empresas/[id]): en producción se sigue viendo la ficha anterior.
 *  - Importaciones del CRM (ISP «Aplicar», HubSpot «Importar», vínculos ISP): 404 en producción.
 * Para abrirlas más adelante hay que crear la variable indicada en Production Y publicar de nuevo.
 */
type Env = Record<string, string | undefined>
const enProduccion = (env: Env) => env.VERCEL_ENV === 'production'
export function fichaNuevaHabilitada(env: Env = process.env): boolean {
  return !enProduccion(env) || (env.AREA1_FICHA_NUEVA_PRODUCCION || '').trim() === '1'
}
export function importacionesCrmCerradas(env: Env = process.env): boolean {
  return enProduccion(env) && (env.AREA1_IMPORTACIONES_PRODUCCION || '').trim() !== '1'
}
