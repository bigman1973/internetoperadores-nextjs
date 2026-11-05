import { isMetricoolPublicPath, METRICOOL_INITIAL_SNIPPET } from './metricool-policy'
import { METRICOOL_COORDINATOR, type MetricoolWindow } from './metricool-coordinator'

const HASH = '512fdb9b70373111e3aad7add4a1990c'

/** The literal owns the initial call. A separate coordinator guards and dedupes
 * actual calls, including a late load. No polling, persistence or private data. */
export function observeMetricoolSpa(win: MetricoolWindow): () => void {
  const publicNow = () => isMetricoolPublicPath(win.location.pathname)
  function cancelPending() {
    if (win.beTracker) return
    for (const script of win.document.querySelectorAll<HTMLScriptElement>('script[src="https://tracker.metricool.com/resources/be.js"]')) {
      script.onload = null
      ;(script as HTMLScriptElement & { onreadystatechange: unknown }).onreadystatechange = null
      script.remove()
    }
    if (win.__ioMetricoolPublic) win.__ioMetricoolPublic.requested = false
  }
  if (!publicNow()) { cancelPending(); return () => undefined }
  if (!win.__ioMetricoolPublic) {
    // Inline script nodes inserted by React during SPA navigation are inert.
    // Execute a single fresh node when entering public from a private document.
    win.document.getElementById('metricool-public-coordinator')?.remove()
    const setup = win.document.createElement('script')
    setup.id = 'metricool-public-coordinator'
    setup.text = METRICOOL_COORDINATOR
    setup.setAttribute('data-cookieconsent', 'ignore')
    win.document.head.appendChild(setup)
    if (win.__ioMetricoolPublic) win.__ioMetricoolPublic.requested = false
  }
  if (win.__ioMetricoolPublic && !win.__ioMetricoolPublic.requested && !win.beTracker) {
    win.__ioMetricoolPublic.requested = true
    win.document.getElementById('metricool-public-tracker')?.remove()
    const initial = win.document.createElement('script')
    initial.id = 'metricool-public-tracker'
    initial.text = METRICOOL_INITIAL_SNIPPET
    initial.setAttribute('data-cookieconsent', 'ignore')
    win.document.head.appendChild(initial)
  }
  let stopped = false
  const push = win.history.pushState
  const replace = win.history.replaceState
  function stop() {
    if (stopped) return
    stopped = true
    win.removeEventListener('popstate', changed)
    if (win.history.pushState === wrappedPush) win.history.pushState = push
    if (win.history.replaceState === wrappedReplace) win.history.replaceState = replace
    if (!publicNow()) cancelPending()
  }
  function changed() {
    if (stopped) return
    if (!publicNow()) { stop(); return }
    // If not loaded, the original load callback will record the current URL.
    // If loaded, the coordinator ignores initial/same-URL/hash duplicates.
    try { win.beTracker?.t({ hash: HASH }) } catch { /* Never break navigation. */ }
  }
  const wrappedPush: History['pushState'] = function(...args) {
    const result = push.apply(win.history, args)
    win.queueMicrotask(changed)
    return result
  }
  const wrappedReplace: History['replaceState'] = function(...args) {
    const result = replace.apply(win.history, args)
    win.queueMicrotask(changed)
    return result
  }
  win.history.pushState = wrappedPush
  win.history.replaceState = wrappedReplace
  win.addEventListener('popstate', changed)
  changed()
  return stop
}
