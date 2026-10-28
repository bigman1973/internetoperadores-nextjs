import assert from 'node:assert/strict'
import fs from 'node:fs'

const sidebar = fs.readFileSync('components/admin/AdminSidebar.tsx', 'utf8')
const header = fs.readFileSync('components/admin/AdminHeader.tsx', 'utf8')

const navigationLink = sidebar.match(/<Link\s+href=\{item\.href\}([\s\S]*?)<\/Link>/)
assert.ok(navigationLink, 'el sidebar conserva un enlace Next por cada entrada autorizada')
assert.match(navigationLink[1], /prefetch=\{false\}/, 'las entradas del menú no prefetched rutas ni código no solicitado al entrar en Conciliar')

const logoLink = sidebar.match(/<Link href=\{easyOnly \? easyHome : '\/admin'\}([\s\S]*?)<\/Link>/)
assert.ok(logoLink, 'el sidebar conserva el enlace de retorno del logotipo')
assert.match(logoLink[1], /prefetch=\{false\}/, 'el enlace persistente del logotipo tampoco inicia una precarga adicional')

assert.match(header, /from '@\/components\/impersonation\/ActuationProvider'/, 'la cabecera obtiene el estado de actuación del proveedor sin importar el wrapper de la banda')
assert.doesNotMatch(header, /from '\.\.\/impersonation\/ImpersonationBanner'/, 'la cabecera no arrastra el wrapper visual de impersonación')
const actuationLink = header.match(/<Link\s+href="\/admin\/actuar-como"([\s\S]*?)<\/Link>/)
assert.ok(actuationLink, 'el acceso a actuar como se conserva para sesiones autorizadas')
assert.match(actuationLink[1], /prefetch=\{false\}/, 'Actuar como no descarga su workspace hasta que el usuario lo solicite')

console.log('admin sidebar prefetch synthetic test: ok')
