/** Disponibilidad de esta candidata; no concede permisos ni consulta datos/proveedores. */
type Environment = Readonly<Record<string, string | undefined>>

/** Sistemas, Impuestos y Presupuesto no admiten opt-in en esta tanda.
 * NODE_ENV sólo es fallback sin etiqueta Vercel: un preview compilado sigue igual.
 */
export function extrasProduccionCerrados(env: Environment = process.env): boolean {
  return env.VERCEL_ENV === 'production' || (!env.VERCEL_ENV && env.NODE_ENV === 'production')
}

/** Semilla de presentación del servidor, nunca autorización de páginas/APIs.
 * El runtime financiero ya validado por el layout es requisito conservador;
 * no basta inferir disponibilidad a partir del rol/ACL o del navegador.
 */
export function rentabilidadReadonlyMenuDisponible(
  financeEnvironment: 'staging' | 'production' | null,
  env: Environment = process.env,
): boolean {
  return financeEnvironment === 'production'
    && env.VERCEL_ENV === 'production'
    && env.FINANCE_STAGING_SANDBOX !== '1'
    && env.RENTABILIDAD_ENABLED === '1'
    && env.RENTABILIDAD_PRODUCTION_READ_ONLY === '1'
}
