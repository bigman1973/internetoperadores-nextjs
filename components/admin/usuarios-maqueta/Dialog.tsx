'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

export default function Dialog({ title, children, onClose, busy = false, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={wide ? 'area4-dialog wide' : 'area4-dialog'} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="area4-dialog-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="btn ghost" aria-label="Cerrar diálogo" disabled={busy} onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>
}
