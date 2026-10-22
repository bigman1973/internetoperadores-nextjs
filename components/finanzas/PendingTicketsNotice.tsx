'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {usePermisoArea} from '@/hooks/usePermisoArea'

export default function PendingTicketsNotice() {
  const {canRead}=usePermisoArea('admin.finanzas.conciliacion')
  const [count,setCount]=useState<number|null>(null)
  useEffect(()=>{
    if(!canRead){setCount(null);return}
    const controller=new AbortController()
    fetch('/api/admin/finanzas/pendientes?recurso=avisos',{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('notice unavailable');const value=await response.json();if(!Number.isSafeInteger(value.total)||value.total<0)throw Error('invalid notice');if(!controller.signal.aborted)setCount(value.total)})
      .catch(()=>{if(!controller.signal.aborted)setCount(null)})
    return()=>controller.abort()
  },[canRead])
  if(!count)return null
  return <aside data-testid="b5-ticket-notice" className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"><p><strong>Tienes {count} {count===1?'cargo de tarjeta pendiente':'cargos de tarjeta pendientes'} de justificar.</strong> Puedes añadir el ticket y revisarlo desde Finanzas; subirlo no concilia el banco automáticamente.</p><Link href="/admin/finanzas/pendientes?vista=CARGOS_SIN_DOCUMENTO" className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-2 font-semibold text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-orange-500">Revisar tickets</Link></aside>
}
