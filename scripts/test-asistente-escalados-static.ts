import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
function archivo(relativo: string): string { return fs.readFileSync(path.join(raiz, relativo), 'utf8') }

const lista = archivo('app/api/admin/asistente/escalados/route.ts')
const contacto = archivo('app/api/admin/asistente/escalados/[id]/contacto/route.ts')
const bandeja = archivo('components/asistente-admin/BandejaEscalados.tsx')
const pagina = archivo('app/admin/asistente/conversaciones/page.tsx')

// Ruta de listado: firma GET completa, permiso de conversaciones y proyección sin PII.
assert.match(lista, /export async function GET\(req: Request\)/)
assert.match(lista, /exigirAdminAsistente\('admin\.asistente\.conversaciones', 'lectura'\)/)
assert.match(lista, /max\(50\)/)
assert.match(lista, /take: limit/)
assert.match(lista, /jsonPrivado/)
assert.doesNotMatch(lista, /contacto(Nombre|Telefono|Email)|consentimiento|conversacionId|leerContactoSeguro|contacto:/)
assert.doesNotMatch(lista, /export async function (POST|PATCH|PUT|DELETE)/)

// Ruta de detalle: sesión y denegación de Actuar como antes de acceso, después permiso granular.
assert.match(contacto, /export async function GET\(_req: Request, contexto: \{ params: Promise<\{ id: string \}> \}\)/)
assert.match(contacto, /getServerSession\(authOptions\)/)
assert.match(contacto, /impersonation/)
assert.match(contacto, /exigirAdminAsistente\('admin\.asistente\.leads\.contacto', 'lectura'\)/)
assert.ok(contacto.indexOf('impersonation') < contacto.indexOf("exigirAdminAsistente('admin.asistente.leads.contacto', 'lectura')"))
assert.match(contacto, /if \(!escalado\.consentimiento\) return jsonPrivado\(\{ contacto: null \}\)/)
assert.match(contacto, /leerContactoSeguro\(prisma, \{[\s\S]*referenciaTipo: 'ESCALADO',[\s\S]*referenciaId: escalado\.id,[\s\S]*conversacionId: escalado\.conversacionId,/)
assert.doesNotMatch(contacto, /export async function (POST|PATCH|PUT|DELETE)/)

// UI: consulta explícita no cacheada, sin IDs visibles ni promesa de atención/chat en vivo.
assert.match(bandeja, /fetch\(`\/api\/admin\/asistente\/escalados\/\$\{id\}\/contacto`, \{ cache: 'no-store' \}\)/)
assert.match(bandeja, /Ver contacto consentido/)
assert.match(bandeja, /No implican atención en tiempo real/)
assert.match(bandeja, /min-h-11/)
assert.doesNotMatch(bandeja, /console\.|conversacionId|aria-label=\{`[^`]*\$\{[^}]+\}/)
assert.match(pagina, /BandejaEscalados/)

console.log('TEST_ASISTENTE_ESCALADOS_STATIC_OK')
