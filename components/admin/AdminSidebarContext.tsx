'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type SidebarContextValue = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

export const SidebarContext = createContext<SidebarContextValue>({
  isOpen: false,
  setIsOpen: () => {},
})

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
