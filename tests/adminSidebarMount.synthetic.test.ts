import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'components/admin/AdminSidebar.tsx'), 'utf8')
const match = source.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[pathname, setIsOpen\]\)/)
assert.ok(match, 'existe el efecto real de cierre por cambio de ruta')
// Se ejecuta el cuerpo real, no una implementación duplicada de la transición.
const body = match![1].slice(match![1].lastIndexOf('if (previousPath.current'))
const effect = new Function('previousPath', 'pathname', 'setIsOpen', body)
const previous = { current: '/admin/finanzas/conciliar' as string | null }
const calls: boolean[] = []
const close = (open: boolean) => calls.push(open)
effect(previous, '/admin/finanzas/conciliar', close)
assert.deepEqual(calls, [], 'no pierde un clic recibido durante el primer montaje')
effect(previous, '/admin/finanzas/conciliar', close)
assert.deepEqual(calls, [], 'no se cierra por volver a evaluar la misma ruta')
effect(previous, '/admin/finanzas/para-pedir', close)
assert.deepEqual(calls, [false], 'una navegación real sí cierra el overlay')
assert.equal(previous.current, '/admin/finanzas/para-pedir')
const unknown = { current: null }
effect(unknown, '/admin/finanzas/conciliar', close)
assert.deepEqual(calls, [false], 'resolver por primera vez el pathname no se considera navegación')
const header = readFileSync(resolve(process.cwd(), 'components/admin/AdminHeader.tsx'), 'utf8')
assert.match(header, /const \[menuReady, setMenuReady\] = useState\(false\)/)
assert.match(header, /useEffect\(\(\) => \{ setMenuReady\(true\) \}, \[\]\)/)
assert.match(header, /disabled=\{!menuReady\}/)
assert.match(header, /aria-busy=\{!menuReady\}/)
assert.doesNotMatch(header, /if \(!menuReady\) return/, 'no se oculta el encabezado ni el contenido SSR')
console.log('admin sidebar initial hydration click and navigation close: ok')
