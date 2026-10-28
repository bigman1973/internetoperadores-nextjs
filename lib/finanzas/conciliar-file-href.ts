/** Pure shared allowlist. It grants no access: both file routes recheck effective B4 permissions. */
export function safeConciliarDocumentHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 900 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value) || value.includes('..')) return null;
  try {
    const url = new URL(value, 'https://conciliar.local');
    if (url.origin !== 'https://conciliar.local' || url.hash || url.username || url.password) return null;
    if (/^\/api\/admin\/finanzas\/conciliar\/archivo\/[A-Za-z0-9_-]{1,160}$/.test(url.pathname) && !url.search) return url.pathname;
    if (!/^\/api\/admin\/finanzas\/movimientos\/[A-Za-z0-9_-]{1,100}\/archivos$/.test(url.pathname)) return null;
    const entries = [...url.searchParams.entries()];
    if (entries.length !== 1 || entries[0][0] !== 'archivoId' || !/^ADJUNTO_B5:[A-Za-z0-9_-]{1,100}$/.test(entries[0][1])) return null;
    return `${url.pathname}?archivoId=${encodeURIComponent(entries[0][1])}`;
  } catch { return null; }
}
