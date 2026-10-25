'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'
import { crmBusinessUnitLabel } from '@/lib/crm-unidades-negocio'
import { canEditCrmBusinessUnits, mergeCrmBusinessUnitOptions, type CrmBusinessUnitOption } from './crmBusinessUnitQuickEditorDeferred.helpers'

const CrmBusinessUnitQuickEditor = dynamic(() => import('./CrmBusinessUnitQuickEditor'), {
  ssr: false,
  loading: () => <div role="status" aria-label="Cargando editor de unidades" className="min-h-11 text-xs text-gray-500">Cargando editor…</div>,
})

type Props = {
  contactId: string
  initialUnits: string[]
  options: CrmBusinessUnitOption[]
  editable: boolean
  version: number
  sourceSyncedAt: string | null
  refreshOnSaved?: boolean
}

/**
 * El directorio muestra hasta 40 filas. La edición conserva exactamente el
 * mismo permiso y API, pero su estado, router y código de guardado se cargan
 * únicamente al pulsar "Editar unidades" en la fila elegida.
 */
export default function CrmBusinessUnitQuickEditorDeferred(props: Props) {
  const [editorRequested, setEditorRequested] = useState(false)
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = canEditCrmBusinessUnits({
    editable: props.editable,
    isViewingAs,
    isSuperAdmin,
    hasAreaAccess: hasAreaAccess('admin.crm.contactos', 'escritura'),
  })

  if (editorRequested) return <CrmBusinessUnitQuickEditor {...props} initialEditing />

  const allOptions = mergeCrmBusinessUnitOptions(props.options, props.initialUnits)

  return (
    <div className="min-w-48 max-w-sm">
      {props.initialUnits.length === 0 ? <span className="text-xs font-medium text-amber-700">Sin unidad asignada</span> : <div className="flex flex-wrap gap-1">{props.initialUnits.map((unit) => <span key={unit} className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800">{crmBusinessUnitLabel(unit, allOptions)}</span>)}</div>}
      {canWrite && <button type="button" onClick={() => setEditorRequested(true)} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 text-[11px] font-semibold text-gray-700 transition hover:border-orange-300 hover:text-orange-800"><PencilSquareIcon className="h-3.5 w-3.5" />Editar unidades</button>}
      {!props.editable && <p className="mt-2 text-[11px] leading-4 text-amber-700">Edición pendiente de completar el catálogo de campos.</p>}
    </div>
  )
}
