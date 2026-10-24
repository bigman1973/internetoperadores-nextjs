export type EasyAccessProfile = Readonly<{
  easyOnly: boolean;
  canManageAutomation: boolean;
  environment: 'staging' | 'production';
}>;

/** El servidor siempre declara el entorno; el cliente no acepta ausencia ni coerción. */
export function parseEasyStagingOnly(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('El servidor no informó stagingOnly como booleano.');
  return value;
}

/** Un perfil parcial o malformado nunca habilita una vista avanzada en el navegador. */
export function parseEasyAccessProfile(value: unknown): EasyAccessProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('No se ha podido comprobar el perfil de acceso.');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.easyOnly !== 'boolean' || typeof raw.canManageAutomation !== 'boolean' || (raw.environment !== 'staging' && raw.environment !== 'production')) {
    throw new Error('No se ha podido comprobar el perfil de acceso.');
  }
  // This is a server-derived capability. The browser neither elevates it from a
  // role nor changes it according to an URL/environment supplied by the client.
  return { easyOnly: raw.easyOnly, canManageAutomation: raw.canManageAutomation, environment: raw.environment };
}

/** La ausencia o el error de perfil conservan la vista sencilla, sin datos avanzados momentáneos. */
export function mayViewAdvancedEasyWorkspace(profile: EasyAccessProfile | null | undefined): boolean {
  return profile?.easyOnly === false;
}

/** La ausencia, el error o un perfil no verificable bloquea las reglas. */
export function mayManageAutomation(profile: EasyAccessProfile | null | undefined): boolean {
  return profile?.canManageAutomation === true && profile.easyOnly === false;
}

const DOCUMENTO_PRIVADO = /^\/api\/admin\/finanzas\/modo-facil\/documentos\/[A-Za-z0-9_-]{1,100}\/archivo$/;
const ARCHIVO_B5_PRIVADO = /^\/api\/admin\/finanzas\/movimientos\/[A-Za-z0-9_-]{1,100}\/archivos$/;
const ADJUNTO_B5 = /^ADJUNTO_B5:[A-Za-z0-9_-]{1,100}$/;

/** Acepta exclusivamente las rutas privadas permitidas por Modo Fácil. */
export function safeEasyPrivateHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 600 || !value.startsWith('/')) return null;
  let parsed: URL;
  try { parsed = new URL(value, 'https://modo-facil.invalid'); } catch { return null; }
  if (parsed.origin !== 'https://modo-facil.invalid' || parsed.hash) return null;
  if (DOCUMENTO_PRIVADO.test(parsed.pathname) && parsed.search === '') return `${parsed.pathname}`;
  if (!ARCHIVO_B5_PRIVADO.test(parsed.pathname)) return null;
  const values = parsed.searchParams.getAll('archivoId');
  if (values.length !== 1 || !ADJUNTO_B5.test(values[0])) return null;
  for (const key of parsed.searchParams.keys()) if (key !== 'archivoId') return null;
  return `${parsed.pathname}?archivoId=${encodeURIComponent(values[0])}`;
}

export type TwoStepCounter = Readonly<{
  label: string;
  cantidad: number;
  importeCentimos: string;
}>;

export type TwoStepMonth = Readonly<{
  mes: string;
  paso1Pendientes: TwoStepCounter;
  paso1Identificados: TwoStepCounter;
  paso2Pendientes: TwoStepCounter;
  documentosJustificados: TwoStepCounter;
  noFiscales: TwoStepCounter;
}>;

export type TwoStepSummaryModel = Readonly<{
  periodo: { desde: string; hasta: string };
  meses: readonly TwoStepMonth[];
  totales: {
    paso1Pendientes: TwoStepCounter;
    paso1Identificados: TwoStepCounter;
    paso2Pendientes: TwoStepCounter;
    documentosJustificados: TwoStepCounter;
    noFiscales: TwoStepCounter;
  };
}>;
