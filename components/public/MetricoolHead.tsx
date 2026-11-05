'use client'

import { usePathname } from 'next/navigation'
import { isMetricoolPublicPath, METRICOOL_INITIAL_SNIPPET } from './metricool-policy'

/** The literal initial tracker is rendered only in the public document head.
 * SPA page-view support is deliberately pending the user's separate approval. */
export default function MetricoolHead() {
  const pathname = usePathname()
  if (!isMetricoolPublicPath(pathname)) return null
  return <script id="metricool-public-tracker" data-cookieconsent="ignore" dangerouslySetInnerHTML={{ __html: METRICOOL_INITIAL_SNIPPET }} />
}
