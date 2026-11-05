'use client'

import { usePathname } from 'next/navigation'
import { isMetricoolPublicPath, METRICOOL_INITIAL_SNIPPET } from './metricool-policy'
import MetricoolSpaObserver from './MetricoolSpaObserver'
import { METRICOOL_COORDINATOR } from './metricool-coordinator'

/** The literal initial tracker and separate observer exist only in public head. */
export default function MetricoolHead() {
  const pathname = usePathname()
  if (!isMetricoolPublicPath(pathname)) return null
  return <>
    <script id="metricool-public-coordinator" data-cookieconsent="ignore" dangerouslySetInnerHTML={{ __html: METRICOOL_COORDINATOR }} />
    <script id="metricool-public-tracker" data-cookieconsent="ignore" dangerouslySetInnerHTML={{ __html: METRICOOL_INITIAL_SNIPPET }} />
    <MetricoolSpaObserver />
  </>
}
