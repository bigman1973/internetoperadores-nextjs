'use client'

import { Bars3Icon } from '@heroicons/react/24/outline'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface ReorderTarifa {
  id: number
  subcategoria: string | null
  nombre: string
  nombreComercial: string | null
  precioConIva: number
  publicarWebParticular: boolean
  publicarWebEmpresa: boolean
}

interface ReorderTarifasModalProps {
  category: string
  categoryClassName: string
  subcategory: string | null
  categoryTarifas: ReorderTarifa[]
  tarifas: ReorderTarifa[]
  saving: boolean
  onSubcategoryChange: (subcategory: string) => void
  onTarifasChange: (tarifas: ReorderTarifa[]) => void
  onCancel: () => void
  onSave: () => void
}

export default function ReorderTarifasModal({
  category,
  categoryClassName,
  subcategory,
  categoryTarifas,
  tarifas,
  saving,
  onSubcategoryChange,
  onTarifasChange,
  onCancel,
  onSave,
}: ReorderTarifasModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )
  const subcats = Array.from(new Set(categoryTarifas.map(tarifa => tarifa.subcategoria || 'Sin subcategoría')))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tarifas.findIndex(tarifa => tarifa.id === active.id)
    const newIndex = tarifas.findIndex(tarifa => tarifa.id === over.id)
    onTarifasChange(arrayMove(tarifas, oldIndex, newIndex))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Reordenar tarifas</h3>
              <p className="mt-1 text-sm text-gray-500">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${categoryClassName}`}>{category}</span>
              </p>
            </div>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {subcats.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {subcats.map(sub => (
                <button
                  key={sub}
                  onClick={() => onSubcategoryChange(sub)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    subcategory === sub
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-xs text-gray-400">Arrastra para cambiar el orden. El orden se aplica en todas las vistas web.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tarifas.map(tarifa => tarifa.id)} strategy={verticalListSortingStrategy}>
              {tarifas.map((tarifa, index) => (
                <SortableReorderItem key={tarifa.id} tarifa={tarifa} index={index} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar orden'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SortableReorderItem({ tarifa, index }: { tarifa: ReorderTarifa; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tarifa.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-2 flex items-center gap-3 rounded-lg border p-3 ${
        isDragging ? 'border-orange-300 bg-orange-50 shadow-lg' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing">
        <Bars3Icon className="h-5 w-5" />
      </button>
      <span className="w-6 text-center text-xs font-bold text-gray-400">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{tarifa.nombre}</p>
        {tarifa.nombreComercial && <p className="truncate text-xs text-orange-600">{tarifa.nombreComercial}</p>}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-semibold text-gray-900">{tarifa.precioConIva.toFixed(2)} €</p>
        <div className="mt-0.5 flex justify-end gap-1">
          {tarifa.publicarWebParticular && <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0 text-[10px] font-medium text-blue-600">P</span>}
          {tarifa.publicarWebEmpresa && <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0 text-[10px] font-medium text-orange-600">E</span>}
        </div>
      </div>
    </div>
  )
}
