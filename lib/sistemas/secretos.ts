/**
 * Este módulo guarda titulares, planes y notas, pero NUNCA contraseñas ni tokens.
 * Cualquier texto libre con apariencia de credencial se rechaza antes de llegar a la base de datos.
 */
const PATRONES: RegExp[] = [
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/,            // claves tipo OpenAI/Stripe
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,                      // tokens de GitHub
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,                    // Slack
  /\bAKIA[0-9A-Z]{16}\b/,                              // AWS
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,     // JWT
  /\bpostgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/i,           // cadena de conexión con contraseña
  /(?:contraseñ?a|password|passwd|pwd|clave|token|secret|api[_ -]?key|apikey)\s*[:=]\s*\S{6,}/i,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/,                    // cadenas largas opacas
];

export function pareceCredencial(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return PATRONES.some(p => p.test(texto));
}

/** Devuelve el nombre del primer campo con apariencia de credencial, o null. */
export function primerCampoSospechoso(campos: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(campos)) {
    const valores = Array.isArray(v) ? v : [v];
    for (const x of valores) if (typeof x === 'string' && pareceCredencial(x)) return k;
  }
  return null;
}
