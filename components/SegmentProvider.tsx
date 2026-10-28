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

  useEffect(() => {
    const saved = localStorage.getItem('io_segment') as Segment | null
    if (saved === 'empresa' || saved === 'particular') {
      setSegmentState(saved)
    }
  }, [])

  const setSegment = (s: Segment) => {
    setSegmentState(s)
    localStorage.setItem('io_segment', s)
  }

  // Keep the same provider on the server, during hydration and after reading
  // storage. Replacing a Fragment with a Provider remounted the entire panel.
  return (
    <SegmentContext.Provider value={{ segment, setSegment }}>
      {children}
      </SegmentContext.Provider>
  )
}
