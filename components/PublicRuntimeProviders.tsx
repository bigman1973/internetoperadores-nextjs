'use client'

import Script from 'next/script'
import dynamic from 'next/dynamic'
import SessionProvider from './SessionProvider'
import { CartProvider } from './CartProvider'
import SegmentProvider from './SegmentProvider'
import NewsletterFloat from './public/NewsletterFloat'
import ImpersonationBanner from './impersonation/ImpersonationBanner'
import { ActuationProvider } from './impersonation/ActuationProvider'
import type { ReactNode } from 'react'

const AssistantLauncher = dynamic(() => import('./asistente/AssistantLauncher'))

/** Same public contexts and consent order; this module is not mounted on /admin. */
export default function PublicRuntimeProviders({ children, assistantEnabled }: { children: ReactNode; assistantEnabled: boolean }) {
  return <>
    <Script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="1621b6e2-0bdc-4d8d-8995-ed4e9db62ee5" data-blockingmode="auto" strategy="beforeInteractive" />
    <SessionProvider>
      <ActuationProvider>
        <ImpersonationBanner />
        <SegmentProvider>
          <CartProvider>
            {children}
            <NewsletterFloat />
            {assistantEnabled && <AssistantLauncher />}
          </CartProvider>
        </SegmentProvider>
      </ActuationProvider>
    </SessionProvider>
  </>
}
