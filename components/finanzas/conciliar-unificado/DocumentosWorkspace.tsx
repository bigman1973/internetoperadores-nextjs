'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

const DocumentosPanel = dynamic(() => import('./DocumentosPanel'), { ssr: false })
const ConfirmingDocumentos = dynamic(() => import('./ConfirmingDocumentos'), { ssr: false })
const DocumentosComparacion = dynamic(() => import('./DocumentosComparacion'), { ssr: false })
type Tab = 'manual' | 'confirmings' | 'comparacion'
const TABS: readonly [Tab, string][] = [['manual', 'Subida y revisión manual'], ['confirmings', 'Leer confirming'], ['comparacion', 'Panel frente a carpetas']]

/** Presentation only: each API repeats Stage, live permissions and no acting.
 * No mailbox, Graph inventory, upload or validation runs when this shell opens.
 */
export default function DocumentosWorkspace(p: Readonly<{ stagingOnly: boolean; acting: boolean; canWrite: boolean; onClose: () => void }>) {
  const { data: session } = useSession()
  const [tab, setTab] = useState<Tab | null>(null)
  const viewAs = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verComo')
  if (!p.stagingOnly || p.acting || session?.impersonation != null || viewAs) return null
  return <section className="panel" id="documentos" aria-label="Documentos de Conciliar">
    <div className="row" style={{ justifyContent: 'space-between' }}><h2>Documentos</h2><button type="button" className="btn small" onClick={p.onClose}>Cerrar Documentos</button></div>
    <p className="help">Entrada principal prevista: administracion@internetoperadores.com. <b>Lectura del correo pendiente de permiso y prueba.</b> La subida manual funciona en paralelo; no se ha activado una sincronización.</p>
    <p className="small muted">Preparación sólo en staging. Convivencia del 30/11 al 4/12; corte objetivo el 9/12, condicionado a correo operativo, comparación completa sin faltas, validación de Lorena sin atascos y lote de noviembre A3 correcto. No hay corte automático.</p>
    <div className="row" aria-label="Herramientas documentales" style={{ marginTop: 12, flexWrap: 'wrap' }}>{TABS.map(([key, label]) => <button type="button" className={`btn${tab === key ? ' primary' : ''}`} aria-pressed={tab === key} key={key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === null && <p className="small muted" style={{ marginTop: 12 }}>Elige una herramienta. Abrir este espacio no consulta el buzón ni las carpetas.</p>}
    {tab === 'manual' && <div style={{ marginTop: 16 }}><DocumentosPanel readOnly={!p.canWrite} /></div>}
    {tab === 'confirmings' && <ConfirmingDocumentos stagingOnly={p.stagingOnly} acting={p.acting} canUpload={p.canWrite} />}
    {tab === 'comparacion' && <div style={{ marginTop: 16 }}><DocumentosComparacion eligible={true} stagingOnly={p.stagingOnly} acting={p.acting} /></div>}
  </section>
}
