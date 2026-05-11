'use client'

import { useState } from 'react'
import { useCart, type CartItem } from './CartProvider'

interface AddToCartButtonProps {
  tarifa: {
    id: number
    nombre?: string
    nombreComercial?: string
    descripcionCorta?: string
    precioConIva: number
    precioSinIva: number
    cuotaAlta?: number | null
    tipoPeriodicidad?: number
    categoria?: string
  }
  className?: string
  variant?: 'primary' | 'secondary'
  compact?: boolean
}

export default function AddToCartButton({ tarifa, className, variant = 'primary', compact = false }: AddToCartButtonProps) {
  const { addItem, items } = useCart()
  const [added, setAdded] = useState(false)

  const isInCart = items.some(i => i.tarifaId === tarifa.id)

  const handleAdd = () => {
    addItem({
      tarifaId: tarifa.id,
      nombre: tarifa.nombreComercial || tarifa.nombre || 'Producto',
      descripcion: tarifa.descripcionCorta || undefined,
      precioConIva: tarifa.precioConIva,
      precioSinIva: tarifa.precioSinIva,
      cuotaAlta: tarifa.cuotaAlta || undefined,
      periodicidad: (tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12) ? 'ANUAL' : 'MENSUAL',
      categoria: tarifa.categoria || undefined,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  // Compact mode for table rows
  if (compact) {
    if (added) {
      return (
        <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Añadido
        </span>
      )
    }
    return (
      <button
        onClick={handleAdd}
        className={`bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors ${className || ''}`}
      >
        Contratar
      </button>
    )
  }

  const baseClasses = variant === 'primary'
    ? 'block w-full text-center py-2.5 mt-4 rounded-lg font-semibold transition-all text-sm'
    : 'block w-full text-center py-3 rounded-lg font-medium transition-colors'

  if (added) {
    return (
      <button
        disabled
        className={`${baseClasses} bg-green-600 text-white cursor-default ${className || ''}`}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Añadido al carrito
        </span>
      </button>
    )
  }

  if (isInCart) {
    return (
      <button
        onClick={handleAdd}
        className={`${baseClasses} bg-gray-700 text-white hover:bg-gray-800 ${className || ''}`}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          En el carrito — Añadir otro
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={handleAdd}
      className={`${baseClasses} bg-orange-600 text-white hover:bg-orange-700 ${className || ''}`}
    >
      <span className="flex items-center justify-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        Añadir al carrito
      </span>
    </button>
  )
}
