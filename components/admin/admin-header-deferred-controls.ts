export const ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS = 1200

export type DeferredAdminHeaderControlsState = Readonly<{
  isSuperAdmin: boolean
  idleReached: boolean
}>

/** Superficie mínima que permite probar el planificador sin DOM ni navegador. */
export type AdminHeaderIdleHost = Readonly<{
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout: (callback: () => void, delay: number) => number
  clearTimeout: (handle: number) => void
}>

/**
 * Crea el adaptador del navegador al ejecutar la isla cliente, nunca durante
 * SSR. requestIdleCallback limita el trabajo al tiempo ocioso y el timeout
 * garantiza que los controles no queden inaccesibles en una página ocupada.
 */
export function createAdminHeaderIdleHost(browser: Window): AdminHeaderIdleHost {
  return {
    requestIdleCallback: typeof browser.requestIdleCallback === 'function'
      ? (callback, options) => browser.requestIdleCallback(() => callback(), options)
      : undefined,
    cancelIdleCallback: typeof browser.cancelIdleCallback === 'function'
      ? handle => browser.cancelIdleCallback(handle)
      : undefined,
    setTimeout: (callback, delay) => browser.setTimeout(callback, delay),
    clearTimeout: handle => browser.clearTimeout(handle),
  }
}

/**
 * Programa la importación fuera de la interacción actual. Cuando el navegador
 * no dispone de requestIdleCallback conserva el límite temporal anterior como
 * fallback; el cleanup cancela cualquiera de las dos vías al desmontar.
 */
export function scheduleDeferredAdminHeaderControls(
  onIdle: () => void,
  host: AdminHeaderIdleHost,
): () => void {
  if (host.requestIdleCallback) {
    const handle = host.requestIdleCallback(onIdle, { timeout: ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS })
    return () => host.cancelIdleCallback?.(handle)
  }

  const handle = host.setTimeout(onIdle, ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS)
  return () => host.clearTimeout(handle)
}

/**
 * Los controles de previsualización y de inicio de actuación no participan en
 * una decisión de permisos. Esta función sólo determina cuándo se descarga su
 * interfaz tras intención o tiempo ocioso.
 */
export function shouldLoadDeferredAdminHeaderControls({
  isSuperAdmin,
  idleReached,
}: DeferredAdminHeaderControlsState): boolean {
  return isSuperAdmin && idleReached
}
