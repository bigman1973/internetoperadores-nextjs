export const METRICOOL_INITIAL_SNIPPET = 'function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"512fdb9b70373111e3aad7add4a1990c"})});'

const PRIVATE_ROOTS = ['/admin', '/cliente', '/empleado', '/login', '/auth', '/api', '/registro', '/recuperar-password', '/reset-password']

export function isMetricoolPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname || !pathname.startsWith('/')) return false
  return !PRIVATE_ROOTS.some(root => pathname === root || pathname.startsWith(`${root}/`))
}
