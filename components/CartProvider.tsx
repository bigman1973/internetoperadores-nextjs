'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface CartItem {
  tarifaId: number
  nombre: string
  descripcion?: string
  precioConIva: number
  precioSinIva: number
  cuotaAlta?: number
  periodicidad: 'MENSUAL' | 'ANUAL' | 'PUNTUAL'
  categoria?: string
  tipoCliente?: 'PARTICULAR' | 'EMPRESA'
  cantidad: number
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'cantidad'>) => void
  removeItem: (tarifaId: number) => void
  updateQuantity: (tarifaId: number, cantidad: number) => void
  clearCart: () => void
  itemCount: number
  totalConIva: number
  totalSinIva: number
  totalAltas: number
  totalGeneral: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

const CART_STORAGE_KEY = 'io_cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isHydrated, setIsHydrated] = useState(false)

  // Cargar del localStorage al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        setItems(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Error loading cart from localStorage:', e)
    }
    setIsHydrated(true)
  }, [])

  // Guardar en localStorage cuando cambie
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
      } catch (e) {
        console.error('Error saving cart to localStorage:', e)
      }
    }
  }, [items, isHydrated])

  const addItem = useCallback((item: Omit<CartItem, 'cantidad'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.tarifaId === item.tarifaId)
      if (existing) {
        // Si ya existe, incrementar cantidad
        return prev.map(i =>
          i.tarifaId === item.tarifaId
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        )
      }
      return [...prev, { ...item, cantidad: 1 }]
    })
  }, [])

  const removeItem = useCallback((tarifaId: number) => {
    setItems(prev => prev.filter(i => i.tarifaId !== tarifaId))
  }, [])

  const updateQuantity = useCallback((tarifaId: number, cantidad: number) => {
    if (cantidad <= 0) {
      setItems(prev => prev.filter(i => i.tarifaId !== tarifaId))
    } else {
      setItems(prev =>
        prev.map(i =>
          i.tarifaId === tarifaId ? { ...i, cantidad } : i
        )
      )
    }
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const itemCount = items.reduce((sum, i) => sum + i.cantidad, 0)
  const totalConIva = items.reduce((sum, i) => sum + i.precioConIva * i.cantidad, 0)
  const totalSinIva = items.reduce((sum, i) => sum + i.precioSinIva * i.cantidad, 0)
  const totalAltas = items.reduce((sum, i) => sum + (i.cuotaAlta || 0) * i.cantidad, 0)
  const totalGeneral = totalConIva + totalAltas

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount,
        totalConIva,
        totalSinIva,
        totalAltas,
        totalGeneral,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
