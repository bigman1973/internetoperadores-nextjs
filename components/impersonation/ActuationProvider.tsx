'use client'

import { useSession } from 'next-auth/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type ActiveActuation, type ActuationState, parseActuationState } from './contract'

type ActuationContextValue = {
  state: ActuationState | null
  active: ActiveActuation | null
  canStart: boolean
  isActing: boolean
  loading: boolean
  refresh: () => Promise<void>
}

const ActuationContext = createContext<ActuationContextValue>({
  state: null,
  active: null,
  canStart: false,
  isActing: false,
  loading: false,
  refresh: async () => {},
})

const CHANGE_STORAGE_KEY = 'io.actuation.changed'

function activeFromSession(session: unknown): ActiveActuation | null {
  const candidate = (session as { impersonation?: unknown } | null)?.impersonation
  if (!candidate || typeof candidate !== 'object') return null

  try {
    const source = candidate as Record<string, unknown>
    return parseActuationState({
      enabled: true,
      canStart: false,
      active: source,
    }).active
  } catch {
    return null
  }
}

/**
 * Estado compartido de la actuación real. Nunca decide permisos: sólo pinta el
 * estado que la sesión y el endpoint del servidor ya autorizaron.
 */
export function ActuationProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const seededActive = activeFromSession(session)
  const [state, setState] = useState<ActuationState | null>(null)
  const [loading, setLoading] = useState(false)
  const latestSeedRef = useRef<ActiveActuation | null>(seededActive)

  useEffect(() => {
    latestSeedRef.current = seededActive
  }, [seededActive])

  const refresh = useCallback(async () => {
    if (status === 'loading') {
      setLoading(true)
      return
    }

    // Anonymous visitors of the public website never have anything to show:
    // skip the control request there. Inside /admin and /empleado it still
    // runs, because an expired acting cookie also projects as unauthenticated
    // and needs the metadata-only recovery state to offer the exit.
    if (status === 'unauthenticated' && !latestSeedRef.current && !/^\/(?:admin|empleado)(?:\/|$)/.test(window.location.pathname)) {
      setState(null)
      setLoading(false)
      return
    }

    // A closed effective JWE can make NextAuth's session projection fail before
    // its own control GET runs. Still ask the closed control plane: it returns
    // either active:null or metadata-only EXPIRED/REVOKED recovery, never a
    // target grant, so the orange exit remains reachable after a reload.
    setLoading(true)
    try {
      const response = await fetch('/api/admin/actuar-como', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (response.status === 401 || response.status === 403) {
        // Un rechazo de acceso no elimina la prueba cifrada de salida ni oculta
        // la banda cuando ya sabemos que existe una actuación.
        if (latestSeedRef.current) return
        latestSeedRef.current = null
        setState(null)
        return
      }
      if (!response.ok) throw new Error(`No se pudo actualizar el estado (${response.status}).`)
      const nextState = parseActuationState(await response.json())
      const previous = latestSeedRef.current
      if (previous && previous.sessionId !== nextState.active?.sessionId) {
        // No conservar formularios con la identidad anterior si otra pestaña
        // ha salido o ha iniciado una actuación diferente.
        window.location.reload()
        return
      }
      latestSeedRef.current = nextState.active
      setState(nextState)
    } catch {
      // Conserva la identidad de la sesión inicial para no hacer desaparecer la salida
      // ante un fallo transitorio de red.
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFocus = () => void refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === CHANGE_STORAGE_KEY) void refresh()
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  // Cuando ya existe una lectura válida, incluso active:null debe prevalecer sobre
  // una marca antigua de la sesión inicial (por ejemplo, tras salir en otra pestaña).
  const active = state ? state.active : latestSeedRef.current

  useEffect(() => {
    if (!active) return
    const originalFetch = window.fetch
    const expectedSession = active.sessionId
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(method) || url.pathname.startsWith('/api/auth/') || url.pathname === '/api/admin/actuar-como') {
        return originalFetch.call(window, input, init)
      }
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      // Es una precondición, no un permiso: el servidor comprueba que el ID
      // corresponde a la cookie efectiva y rechaza formularios antiguos.
      headers.set('x-io-acting-session', expectedSession)
      return originalFetch.call(window, input, { ...init, headers })
    }
    return () => { window.fetch = originalFetch }
  }, [active?.sessionId])

  const value = useMemo<ActuationContextValue>(() => ({
    state,
    active,
    canStart: Boolean(state?.canStart && !active),
    isActing: Boolean(active),
    loading,
    refresh,
  }), [state, active, loading, refresh])

  return <ActuationContext.Provider value={value}>{children}</ActuationContext.Provider>
}

export function useActuation() {
  return useContext(ActuationContext)
}

/** Notifica una mutación confirmada para que las demás pestañas relean al servidor. */
export function notifyActuationChanged() {
  try {
    window.localStorage.setItem(CHANGE_STORAGE_KEY, `${Date.now()}:${Math.random()}`)
  } catch {
    // La sincronización entre pestañas es una mejora; la cookie/sesión sigue siendo la fuente de verdad.
  }
}

