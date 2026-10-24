'use client'

/** Sólo protege la petición; nunca decide qué usuario o permiso es válido. */
export async function actuationControlHeaders(): Promise<Record<string, string>> {
  const response = await fetch('/api/admin/actuar-como', {
    headers: { Accept: 'application/json' }, cache: 'no-store',
  })
  if (!response.ok) throw new Error('No se pudo comprobar tu sesión. No se ha cambiado de usuario.')
  const value: unknown = await response.json()
  const token = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).csrfToken : null
  if (typeof token !== 'string' || token.length < 32 || token.length > 2048 || !/^[A-Za-z0-9_.-]+$/.test(token)) {
    throw new Error('No se pudo proteger la solicitud. Actualiza el estado y vuelve a intentarlo.')
  }
  return { 'Content-Type': 'application/json', Accept: 'application/json', 'x-io-actuation-csrf': token }
}
