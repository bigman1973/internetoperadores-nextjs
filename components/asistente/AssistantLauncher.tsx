'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ComponentType, type RefObject } from 'react'
import { isAssistantExcludedPath } from '@/lib/asistente/public-flag'
import type { AssistantPanelProps } from './AssistantPanel'

type PanelComponent = ComponentType<AssistantPanelProps>

type AssistantLoadingShellProps = {
  dialogRef: RefObject<HTMLDivElement | null>
  closeButtonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  failed: boolean
}

function AssistantLoadingShell({ dialogRef, closeButtonRef, onClose, failed }: AssistantLoadingShellProps) {
  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/30 sm:bg-transparent" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="asistente-titulo" className="fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:left-6 sm:h-[min(600px,calc(100dvh-7rem))] sm:w-[min(380px,calc(100vw-3rem))] sm:rounded-2xl sm:border sm:border-slate-200">
        <header className="flex shrink-0 items-center justify-between bg-primary px-4 py-3 text-white">
          <h2 id="asistente-titulo" className="text-base font-bold">Asistente de IA</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Cerrar asistente">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-700" aria-live="polite" role={failed ? "alert" : "status"}>{failed ? "No hemos podido cargar el asistente. Cierra el diálogo y vuelve a intentarlo." : "Preparando el asistente…"}</div>
      </div>
    </div>
  )
}

/**
 * Lanzador deliberadamente pequeño. El panel sólo se descarga tras una interacción
 * deliberada y no se monta hasta haber dejado pintar la respuesta inmediata al clic.
 */
export default function AssistantLauncher() {
  const pathname = usePathname()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const loadingDialogRef = useRef<HTMLDivElement>(null)
  const loadingCloseButtonRef = useRef<HTMLButtonElement>(null)
  const intentTimerRef = useRef<number | null>(null)
  const panelPromiseRef = useRef<Promise<{ default: PanelComponent }> | null>(null)
  const [Panel, setPanel] = useState<PanelComponent | null>(null)
  const [open, setOpen] = useState(false)
  const [panelVisible, setPanelVisible] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => setHydrated(true), [])

  const excluded = isAssistantExcludedPath(pathname)

  const loadPanel = useCallback(() => {
    if (!panelPromiseRef.current) {
      const promise = import('./AssistantPanel')
      panelPromiseRef.current = promise
      void promise.catch(() => {
        if (panelPromiseRef.current === promise) panelPromiseRef.current = null
      })
    }
    return panelPromiseRef.current
  }, [])

  const clearIntentTimer = useCallback(() => {
    if (intentTimerRef.current !== null) {
      window.clearTimeout(intentTimerRef.current)
      intentTimerRef.current = null
    }
  }, [])

  const scheduleIdleLoad = useCallback(() => {
    if (panelPromiseRef.current || intentTimerRef.current !== null) return
    const schedule = () => {
      const idle = window.requestIdleCallback
      if (typeof idle === 'function') {
        idle(() => { void loadPanel().catch(() => undefined) }, { timeout: 4500 })
      } else {
        void loadPanel().catch(() => undefined)
      }
    }
    // Sólo después de una interacción deliberada; el retardo protege LCP/TBT.
    intentTimerRef.current = window.setTimeout(() => {
      intentTimerRef.current = null
      schedule()
    }, 4500)
  }, [loadPanel])

  const close = useCallback(() => {
    setPanelVisible(false)
    setOpen(false)
    window.setTimeout(() => launcherRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!open || panelVisible) return
    let cancelled = false
    let secondFrame: number | null = null
    // Dos frames reservan un paint de la carcasa antes de descargar o montar el diálogo completo.
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void loadPanel()
          .then(({ default: PanelComponent }) => {
            if (!cancelled) {
              setPanel(() => PanelComponent)
              setPanelVisible(true)
            }
          })
          .catch(() => { if (!cancelled) setLoadFailed(true) })
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [loadPanel, open, panelVisible])

  useEffect(() => {
    if (!open || panelVisible) return
    const focusCloseButton = window.setTimeout(() => loadingCloseButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = loadingDialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusCloseButton)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close, open, panelVisible])

  useEffect(() => {
    if (excluded) {
      clearIntentTimer()
      setPanelVisible(false)
      setOpen(false)
    }
  }, [clearIntentTimer, excluded])

  useEffect(() => () => clearIntentTimer(), [clearIntentTimer])

  if (excluded || unavailable) return null

  const showLoadingShell = open && !panelVisible
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
          setLoadFailed(false)
          setPanelVisible(false)
          setOpen(true)
        }}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-200 hover:bg-orange-600 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 motion-reduce:transition-none sm:bottom-6 sm:left-6 sm:h-14 sm:w-14"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m7-1a8 8 0 01-8 8 8.7 8.7 0 01-3.8-.88L4 20l.88-2.2A8 8 0 1119 11z" />
        </svg>
        <span className="sr-only">Asistente virtual</span>
      </button>
      {showLoadingShell ? <AssistantLoadingShell dialogRef={loadingDialogRef} closeButtonRef={loadingCloseButtonRef} onClose={close} failed={loadFailed} /> : null}
      {Panel && open && panelVisible ? (
        <Panel
          launcherRef={launcherRef}
          onClose={close}
          onUnavailable={() => {
            clearIntentTimer()
            setPanelVisible(false)
            setOpen(false)
            launcherRef.current?.focus()
            setUnavailable(true)
          }}
        />
      ) : null}
    </>
  )
}
