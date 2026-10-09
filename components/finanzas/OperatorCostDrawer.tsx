"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

/** Native dialog provides focus trapping, Escape and restoration to its opener. */
export default function OperatorCostDrawer({
  title,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previous;
    };
  }, [mounted]);
  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }
  useEffect(() => {
    const node = dialog.current;
    const handler = () => requestClose();
    node?.addEventListener("request-close", handler);
    return () => node?.removeEventListener("request-close", handler);
  }, [mounted, busy, dirty]);
  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialog}
      id="operator-cost-drawer"
      aria-labelledby="operator-drawer-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-slate-950 backdrop:bg-slate-950/50"
    >
      <div className="flex h-full justify-end">
        <button
          type="button"
          aria-label="Cerrar panel lateral"
          tabIndex={-1}
          disabled={busy}
          onClick={requestClose}
          className="hidden flex-1 cursor-default sm:block"
        />
        <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-4xl">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <h2 id="operator-drawer-title" className="text-lg font-extrabold">
              {title}
            </h2>
            <button
              autoFocus
              type="button"
              disabled={busy}
              onClick={requestClose}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-100 focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
            >
              <XMarkIcon className="h-4 w-4" /> Cerrar panel
            </button>
          </header>
          {confirmClose && (
            <div
              role="alert"
              className="shrink-0 border-b border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <p className="font-bold">
                ¿Cerrar el formulario? Los cambios que no hayas guardado se
                perderán.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!busy) setConfirmClose(false);
                  }}
                  className="rounded-lg border border-amber-400 bg-white px-3 py-2 font-bold focus:ring-2 focus:ring-amber-700"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!busy) onClose();
                  }}
                  className="rounded-lg bg-amber-900 px-3 py-2 font-bold text-white focus:ring-2 focus:ring-amber-700"
                >
                  Descartar y cerrar
                </button>
              </div>
            </div>
          )}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5"
            onClickCapture={(event) => {
              const button = (event.target as HTMLElement).closest("button");
              if (
                button &&
                /Elegir|Quitar|Añadir|Eliminar|seleccion/i.test(
                  button.textContent || "",
                )
              )
                setDirty(true);
            }}
            onChangeCapture={() => {
              setDirty(true);
              setConfirmClose(false);
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
