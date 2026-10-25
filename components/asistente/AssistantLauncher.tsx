'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { isAssistantExcludedPath } from '@/lib/asistente/public-flag'
import type { AssistantPanelProps } from './AssistantPanel'

type PanelComponent = ComponentType<AssistantPanelProps>

/**
 * Lanzador deliberadamente pequeño. El import dinámico se instancia en la primera
 * interacción, evitando solicitar el panel de conversación durante LCP.
 */
export default function AssistantLauncher() {
  const pathname = usePathname()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const intentTimerRef = useRef<number | null>(null)
  const [Panel, setPanel] = useState<PanelComponent | null>(null)
  const [open, setOpen] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => setHydrated(true), [])

  const excluded = isAssistantExcludedPath(pathname)

  const loadPanel = useCallback(() => {
    // La descarga real del chunk no se solicita hasta una interacción del usuario.
    void import('./AssistantPanel').catch(() => undefined)
    setPanel((current) => {
      if (current) return current
      return dynamic<AssistantPanelProps>(() => import('./AssistantPanel'), { ssr: false })
    })
  }, [])

  const clearIntentTimer = useCallback(() => {
    if (intentTimerRef.current !== null) {
      window.clearTimeout(intentTimerRef.current)
      intentTimerRef.current = null
    }
  }, [])

  const scheduleIdleLoad = useCallback(() => {
    if (Panel || intentTimerRef.current !== null) return
    const schedule = () => {
      const idle = window.requestIdleCallback
      if (typeof idle === 'function') {
        idle(() => loadPanel(), { timeout: 4500 })
      } else {
        loadPanel()
      }
    }
    // Sólo después de una interacción deliberada; el retardo protege LCP/TBT.
    intentTimerRef.current = window.setTimeout(schedule, 4500)
  }, [Panel, loadPanel])

  const close = useCallback(() => {
    setOpen(false)
    window.setTimeout(() => launcherRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (excluded) {
      clearIntentTimer()
      setOpen(false)
    }
  }, [clearIntentTimer, excluded])

  useEffect(() => () => clearIntentTimer(), [clearIntentTimer])

  if (excluded || unavailable) return null

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        disabled={!hydrated}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente virtual'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onPointerEnter={scheduleIdleLoad}
        onFocus={scheduleIdleLoad}
        onClick={() => {
          clearIntentTimer()
          loadPanel()
          setOpen(true)
        }}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-200 hover:bg-orange-600 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 motion-reduce:transition-none sm:bottom-6 sm:left-6 sm:h-14 sm:w-14"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m7-1a8 8 0 01-8 8 8.7 8.7 0 01-3.8-.88L4 20l.88-2.2A8 8 0 1119 11z" />
        </svg>
        <span className="sr-only">Asistente virtual</span>
      </button>
      {Panel && open ? (
        <Panel
          launcherRef={launcherRef}
          onClose={close}
          onUnavailable={() => {
            clearIntentTimer()
            setOpen(false)
            launcherRef.current?.focus()
            setUnavailable(true)
          }}
        />
      ) : null}
    </>
  )
}
