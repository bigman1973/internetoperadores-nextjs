import assert from 'node:assert/strict'
import fs from 'node:fs'

const sidebarGate = fs.readFileSync('components/admin/AdminSidebar.tsx', 'utf8')
const interactiveMenu = fs.readFileSync('components/admin/lazy/InteractiveAdminSidebarMenu.tsx', 'utf8')
const serverMenu = fs.readFileSync('components/admin/server/AdminSidebarMenu.tsx', 'utf8')
const header = fs.readFileSync('components/admin/AdminHeader.tsx', 'utf8')

assert.match(sidebarGate, /\(\) => import\('\.\/lazy\/InteractiveAdminSidebarMenu'\)/, 'el menú completo queda detrás de una importación dinámica')
assert.match(sidebarGate, /\{isOpen && \(/, 'el panel móvil sólo monta el menú al abrirse')
assert.match(interactiveMenu, /<Link\s+href=\{item\.href\}([\s\S]*?)<\/Link>/, 'el menú dinámico conserva un enlace Next por entrada autorizada')
assert.match(interactiveMenu, /prefetch=\{false\}/, 'el menú interactivo no precarga rutas ni código no solicitado')
assert.match(interactiveMenu, /href=\{easyOnly \? easyHome : '\/admin'\}\s+prefetch=\{false\}/, 'el logotipo del menú interactivo tampoco inicia precargas')
assert.match(serverMenu, /<a\s+href=\{item\.href\}/, 'el primer HTML usa anclas nativas navegables sin JavaScript')
assert.doesNotMatch(serverMenu, /from 'next\/link'/, 'el renderer SSR no incorpora el cliente de Next Link')
assert.match(serverMenu, /<details/, 'los grupos de escritorio conservan expansión nativa sin JS')

assert.match(header, /from '@\/components\/impersonation\/ActuationProvider'/, 'la cabecera obtiene el estado de actuación del proveedor sin importar el wrapper de la banda')
assert.doesNotMatch(header, /from '\.\.\/impersonation\/ImpersonationBanner'/, 'la cabecera no arrastra el wrapper visual de impersonación')
const actuationLink = header.match(/<Link\s+href="\/admin\/actuar-como"([\s\S]*?)<\/Link>/)
assert.ok(actuationLink, 'el acceso a actuar como se conserva para sesiones autorizadas')
assert.match(actuationLink[1], /prefetch=\{false\}/, 'Actuar como no descarga su workspace hasta que el usuario lo solicite')

console.log('admin sidebar SSR/dynamic prefetch synthetic test: ok')
