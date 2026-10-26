// Pantalla de barrera de staging: no sustituye a NextAuth ni da permisos al panel.
export const STAGING_ACCESS_PATH = '/acceso-staging';
export function safeStagingReturn(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  try {
    const parsed = new URL(value, 'https://staging.invalid');
    const decoded = decodeURIComponent(parsed.pathname);
    if (parsed.origin !== 'https://staging.invalid' || decoded.startsWith('//') || /[\\\r\n]/.test(decoded) || decoded === STAGING_ACCESS_PATH || decoded.startsWith('/api/')) return '/';
    return parsed.pathname + parsed.search;
  } catch { return '/'; }
}
function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function stagingAccessHtml(returnTo, invalid = false) {
  const next = escape(safeStagingReturn(returnTo));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acceso a staging · Internet Operadores</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#172033;font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:grid;place-items:center;padding:20px}.card{width:100%;max-width:440px;border:1px solid #e2e8f0;border-top:5px solid #f97316;border-radius:14px;background:white;padding:28px;box-shadow:0 8px 30px #0f172a0d}.brand{font-weight:700;color:#ea580c;font-size:15px}h1{font-size:26px;margin:14px 0 12px}p{font-size:15px;line-height:1.6;color:#475569}label{display:block;font-weight:600;font-size:14px;margin:18px 0 7px}input{width:100%;padding:13px;border:1px solid #94a3b8;border-radius:7px;font:inherit}button{width:100%;margin:24px 0 6px;padding:14px;background:#ea580c;color:#fff;border:0;border-radius:7px;font:inherit;font-weight:700;cursor:pointer}input:focus,button:focus{outline:3px solid #fdba74;outline-offset:3px}.note{font-size:13px}.error{padding:12px;background:#fef2f2;color:#991b1b;border-radius:7px}footer{font-size:12px;color:#64748b;margin-top:20px}@media(max-width:360px){.card{padding:20px}h1{font-size:23px}}
</style></head><body><main class="card"><div class="brand">Internet Operadores · Staging</div><h1>Acceso al entorno de pruebas</h1><p>La web de pruebas está disponible y protegida. Introduce las credenciales de staging que ya utilizabas.</p>${invalid ? '<p class="error" role="alert">No se ha podido validar el acceso. Comprueba el usuario y la contraseña de staging.</p>' : ''}<form action="${STAGING_ACCESS_PATH}" method="post"><input type="hidden" name="next" value="${next}"><label for="staging-user">Usuario de staging</label><input id="staging-user" name="username" autocomplete="username" required maxlength="128" autofocus><label for="staging-password">Contraseña de staging</label><input id="staging-password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Entrar en staging</button></form><p class="note">Este acceso no inicia sesión en el panel de administración. El panel conserva su propio login y permisos.</p><footer>Entorno privado de revisión. Producción no está afectada.</footer></main></body></html>`;
}
export const STAGING_ACCESS_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  // Conservar Origin en POST same-origin; no-referrer lo convierte en null.
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
export async function readStagingAccessForm(request) {
  if (request.method !== 'POST' || request.headers.get('origin') !== request.nextUrl.origin) return null;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) return null;
  const declared = Number(request.headers.get('content-length') || '0');
  if (!Number.isFinite(declared) || declared < 0 || declared > 2048) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const form = new URLSearchParams(new TextDecoder().decode(bytes));
  const username = form.get('username');
  const password = form.get('password');
  if (!username || !password || username.length > 128 || password.length > 256) return null;
  return { username, password, returnTo: safeStagingReturn(form.get('next')) };
}
