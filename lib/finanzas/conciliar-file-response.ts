const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii')
const PDF_FRAME_POLICY = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'"

export class ConciliarFileResponseError extends Error {
  constructor(public readonly code: 'ARCHIVO_NO_PDF') {
    super(code)
  }
}

/** The upstream download is bounded before it reaches this response builder. */
export function isConciliarPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PDF_SIGNATURE.byteLength
    && PDF_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/**
 * Produces an RFC 5987 value, including the characters encodeURIComponent leaves
 * unescaped but that are not valid attr-chars in a filename* parameter.
 */
function encodeFilename(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Never trust a stored filename to carry response-header syntax. */
export function safeConciliarPdfFilename(value: unknown): string {
  const cleaned = (typeof value === 'string' ? value : '')
    .replace(/[\u0000-\u001f\u007f"\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)

  if (!cleaned) return 'documento.pdf'
  if (/\.pdf$/iu.test(cleaned)) return cleaned

  const stem = cleaned.replace(/[. ]+$/u, '').slice(0, 176)
  return `${stem || 'documento'}.pdf`
}

/**
 * The browser only receives verified PDF bytes from this origin. Graph redirects,
 * provider URLs and locators remain server-side and never enter this response.
 */
export function conciliarPdfFileResponse(bytes: Uint8Array, filename: unknown): Response {
  if (!isConciliarPdf(bytes)) throw new ConciliarFileResponseError('ARCHIVO_NO_PDF')

  const safeFilename = safeConciliarPdfFilename(filename)
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeFilename(safeFilename)}`,
      'Content-Security-Policy': PDF_FRAME_POLICY,
      // Kept exact for a same-origin document viewer; every external ancestor is denied.
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
