'use client'

import { useEffect } from 'react'
import { observeMetricoolSpa } from './metricool-spa-observer'

export default function MetricoolSpaObserver() {
  useEffect(() => observeMetricoolSpa(window), [])
  return null
}
