export type FinanceEnvironmentInput = Readonly<{
  stagingSandbox?: string;
  vercelEnvironment?: string;
  productionEnabled?: string;
  automaticLinksDisabled?: string;
  databaseUrl?: string;
}>;

/** Sólo configuración de servidor; ningún campo procede de una petición o sesión. */
export function financeEnvironment(input: FinanceEnvironmentInput): 'staging' | 'production' | null {
  let url: URL;
  try { url = new URL(input.databaseUrl ?? ''); } catch { return null; }
  const user = decodeURIComponent(url.username);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
  // El sandbox es prioritario: nunca se degrada a producción si su URL es incorrecta.
  if (input.stagingSandbox === '1') {
    return url.pathname === '/io_staging_finanzas' && user === 'io_staging_finanzas' ? 'staging' : null;
  }
  if (input.vercelEnvironment !== 'production' || input.productionEnabled !== '1' || input.automaticLinksDisabled !== '1') return null;
  return url.hostname === 'yamanote.proxy.rlwy.net' && url.port === '34880'
    && url.pathname === '/railway' && user === 'postgres' ? 'production' : null;
}
