import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const middleware = readFileSync(resolve(root, 'middleware.js'), 'utf8')
const autoRoute = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliacion/auto/route.ts'), 'utf8')

function includes(source: string, value: string, message = value) {
  assert.ok(source.includes(value), `Falta el límite de producción: ${message}`)
}

function main() {
  // Static inspection only: this test imports no app or Prisma module and opens no DB connection.
  includes(middleware, "process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED === '1'")
  includes(middleware, "segment.startsWith('sync') || segment.startsWith('sincroniz')")
  assert.ok(middleware.indexOf("process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED === '1'") < middleware.indexOf("process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1'"))
  includes(middleware, "process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1'")
  includes(middleware, "'/api/admin/permisos' && request.method === 'POST'")
  includes(middleware, "pathname.startsWith('/api/auth/')")
  includes(middleware, "path.startsWith('/api/cron/')")
  includes(middleware, "segment.startsWith('sync')")
  includes(middleware, "segment.startsWith('sincroniz')")
  includes(middleware, "segment.startsWith('import')")
  includes(middleware, "segment.startsWith('graph')")
  includes(middleware, "/^(mail|email|correo|notific|comunic|enviar)/")
  includes(middleware, "'/api/admin/finanzas/conciliacion/auto'")
  includes(middleware, "'/api/admin/finanzas/conciliacion'")
  includes(middleware, "'/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings'")
  includes(middleware, "status: 409")

  includes(autoRoute, "export async function POST()")
  includes(autoRoute, "codigo: 'FINANCE_AUTOMATIC_LINKS_DISABLED'")
  includes(autoRoute, 'status: 409')
  assert.doesNotMatch(autoRoute, /\bprisma\b/i, 'El auto-handler no debe cargar Prisma')
  assert.doesNotMatch(autoRoute, /req\.json|request\.json/i, 'El auto-handler no debe leer solicitudes antes de bloquear')
  assert.doesNotMatch(autoRoute, /getServerSession|require.*Access|next-auth/i, 'El auto-handler no debe autenticar antes de bloquear')
  assert.doesNotMatch(autoRoute, /process\.env/, 'El auto-handler no debe tener una bandera de reactivación')

  console.log('Límites de producción financiera verificados estáticamente; no se abrió ninguna conexión de base de datos.')
}

main()
