'use client'

import dynamic from 'next/dynamic'
import { useActuation } from './ActuationProvider'
export { ActuationProvider, useActuation, notifyActuationChanged } from './ActuationProvider'

const BannerUi = dynamic(() => import('./ImpersonationBannerUi'))

/** An active session always renders its banner, including the server HTML. */
export default function ImpersonationBanner() {
  const { active } = useActuation()
  return active ? <BannerUi /> : null
}
