'use client'

import { ArrowPathIcon, ArrowUturnLeftIcon, ClockIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { actuationControlHeaders } from './control-client'
import { type ExitAttempt, createExitAttempt, minutesUntil, retryExitAttempt, safeInternalRedirect } from './contract'
import { notifyActuationChanged, useActuation } from './ActuationProvider'

function requestKey(): string {
  if (typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function') {
    throw new Error('Este navegador no puede crear una solicitud segura. Actualízalo para volver a intentarlo.')
  }
  return window.crypto.randomUUID()
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.error === 'string') return body.error
    if (typeof body?.message === 'string') return body.message
  } catch {
    // Una respuesta sin JSON no debe ocultar la posibilidad de reintentar con la misma clave.
  }
  return `No se pudo completar la solicitud (${response.status}).`
}

const GLOBAL_SAFE_SPACE_CSS = `
  html[data-actuation-active='true'] body {
    padding-top: var(--actuation-banner-height, 0px);
  }
  @media (min-width: 1024px) {
    html[data-actuation-active='true'] [data-admin-shell] > div:first-child {
      top: var(--actuation-banner-height, 0px) !important;
      height: calc(100dvh - var(--actuation-banner-height, 0px)) !important;
    }
  }
  /* [data-admin-shell] uses overflow-x:hidden, so it is the sticky header's
     scroll container. The body padding already places it below the banner;
     adding the banner height here again would leave an empty gap. */
  html[data-actuation-active='true'] aside.fixed {
    top: var(--actuation-banner-height, 0px) !important;
  }
  html[data-actuation-active='true'] button.fixed {
    top: calc(var(--actuation-banner-height, 0px) + 1rem) !important;
  }
  html[data-actuation-active='true'] [role='dialog'] > .fixed {
    top: var(--actuation-banner-height, 0px) !important;
  }
`

/** Banda persistente para toda la aplicación mientras la sesión efectiva sea otra identidad. */
export default function ImpersonationBanner() {
  const { active } = useActuation()
  const bannerRef = useRef<HTMLDivElement>(null)
  const [exitAttempt, setExitAttempt] = useState<ExitAttempt | null>(null)
  const [exitError, setExitError] = useState<string | null>(null)
  const [exiting, setExiting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const root = document.documentElement
    if (!active) {
      root.removeAttribute('data-actuation-active')
      root.style.removeProperty('--actuation-banner-height')
      return
    }

    root.setAttribute('data-actuation-active', 'true')
    const measure = () => {
      const height = bannerRef.current?.getBoundingClientRect().height ?? 0
      root.style.setProperty('--actuation-banner-height', `${Math.ceil(height)}px`)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' && bannerRef.current ? new ResizeObserver(measure) : null
    if (bannerRef.current && observer) observer.observe(bannerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      root.removeAttribute('data-actuation-active')
      root.style.removeProperty('--actuation-banner-height')
    }
  }, [active])

  const leave = useCallback(async (attempt: ExitAttempt) => {
    setExiting(true)
    setExitError(null)
    try {
      const response = await fetch('/api/admin/actuar-como', {
        method: 'POST',
        headers: await actuationControlHeaders(),
        body: JSON.stringify({ action: 'salir', idempotencyKey: attempt.idempotencyKey }),
      })
      if (!response.ok) throw new Error(await responseMessage(response))
      const body = await response.json()
      if (body?.ok !== true) throw new Error('La respuesta de salida no se pudo verificar.')
      notifyActuationChanged()
      // Recarga completa: la identidad, permisos y navegación vuelven a proceder del servidor.
      window.location.assign(safeInternalRedirect(body.redirectTo, '/admin'))
    } catch (error) {
      setExitAttempt(retryExitAttempt(attempt))
      setExitError(error instanceof Error ? error.message : 'No se pudo volver a tu usuario. Reintenta la misma solicitud.')
      setExiting(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const expiresAt = Date.parse(active.expiresAt)
    const delay = Math.max(0, expiresAt - Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 15_000)
    const timeout = window.setTimeout(() => {
      // El servidor sigue denegando cualquier acción caducada. Esta salida
      // expresa usa la identidad original cifrada, nunca concede un permiso local.
      const attempt = createExitAttempt(requestKey)
      setExitAttempt(attempt)
      void leave(attempt)
    }, delay + 50)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [active, leave])

  if (!active) return null

  const remainingMinutes = minutesUntil(active.expiresAt, now)
  const exitLabel = exiting ? 'Volviendo a mi usuario…' : exitError ? 'Reintentar volver a mi usuario' : 'Volver a mi usuario'

  return <>
    <style>{GLOBAL_SAFE_SPACE_CSS}</style>
    <div ref={bannerRef} className="fixed inset-x-0 top-0 z-[100] border-b border-orange-800 bg-orange-700 px-3 py-2 text-white shadow-lg sm:px-6" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 text-sm font-semibold">
            <span>Estás actuando como {active.targetName}</span>
            <span className="hidden font-normal text-orange-100 sm:inline"> · Las acciones se realizan con los permisos de esta persona.</span>
          </p>
          <span className="hidden items-center gap-1 rounded-full bg-orange-800/70 px-2 py-0.5 text-xs text-orange-50 md:inline-flex">
            <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {remainingMinutes > 0 ? `${remainingMinutes} min restantes` : 'Comprobando caducidad…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {exitError && <p className="max-w-xs text-xs text-orange-50" role="alert">No se confirmó la salida. Reintenta sin cambiar de pestaña.</p>}
          <button
            type="button"
            onClick={() => {
              const attempt = exitAttempt ?? createExitAttempt(requestKey)
              setExitAttempt(attempt)
              void leave(attempt)
            }}
            disabled={exiting}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-bold text-orange-800 shadow-sm transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-orange-700 disabled:cursor-wait disabled:opacity-75"
          >
            {exiting ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden="true" />}
            {exitLabel}
          </button>
        </div>
      </div>
    </div>
  </>
}
