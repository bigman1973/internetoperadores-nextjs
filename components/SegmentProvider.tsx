'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Segment = 'particular' | 'empresa'

interface SegmentContextType {
  segment: Segment
  setSegment: (s: Segment) => void
}

const SegmentContext = createContext<SegmentContextType>({
  segment: 'particular',
  setSegment: () => {},
})

export function useSegment() {
  return useContext(SegmentContext)
}

export default function SegmentProvider({ children }: { children: ReactNode }) {
  const [segment, setSegmentState] = useState<Segment>('particular')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('io_segment') as Segment | null
    if (saved === 'empresa' || saved === 'particular') {
      setSegmentState(saved)
    }
    setMounted(true)
  }, [])

  const setSegment = (s: Segment) => {
    setSegmentState(s)
    localStorage.setItem('io_segment', s)
  }

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <SegmentContext.Provider value={{ segment, setSegment }}>
      {children}
    </SegmentContext.Provider>
  )
}
