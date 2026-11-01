import { timingSafeEqual } from 'node:crypto'

/**
 * El token de AltaServicio es una capacidad opaca del cliente para consultar
 * exclusivamente su alta. Esta comparación no revela información mediante una
 * salida temprana para tokens de la misma longitud.
 */
export function hasAltaContractCapability(storedToken: string | null | undefined, suppliedToken: string | null | undefined): boolean {
  if (!storedToken || !suppliedToken) return false
  const stored = Buffer.from(storedToken)
  const supplied = Buffer.from(suppliedToken)
  return stored.length === supplied.length && timingSafeEqual(stored, supplied)
}

export function altaContractPublicUrl(baseUrl: string, altaId: string, token: string): string {
  const query = new URLSearchParams({ altaId, token, format: 'html' })
  return `${baseUrl.replace(/\/$/, '')}/api/altas/contrato?${query.toString()}`
}
