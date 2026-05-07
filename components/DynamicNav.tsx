'use client'

import { useSegment } from './SegmentProvider'
import ParticularNav from './ParticularNav'
import EmpresaNav from './EmpresaNav'

interface DynamicNavProps {
  currentPage?: string
}

export default function DynamicNav({ currentPage = '' }: DynamicNavProps) {
  const { segment } = useSegment()

  if (segment === 'particular') {
    return <ParticularNav currentPage={currentPage} />
  }

  return <EmpresaNav currentPage={currentPage} />
}
