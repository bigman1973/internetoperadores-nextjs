import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const requireReal = createRequire(import.meta.url)
const ROOT = process.cwd()

type Registro = { create: Array<Record<string, unknown>>; update: Array<Record<string, unknown>>; conversaciones: number }

function cargarRuta(registro: Registro) {
  const fuente = fs.readFileSync(path.join(ROOT, 'app/api/asistente/escalado/route.ts'), 'utf8')
  const compilado = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const prisma = {
    asistenteEscalado: { create: async ({ data }: { data: Record<string, unknown> }) => { registro.create.push(data); return data } },
    asistenteConversacion: { update: async ({ data }: { data: Record<string, unknown> }) => { registro.update.push(data); return data } },
  }
  const mocks: Record<string, unknown> = {
    '@/lib/prisma': { __esModule: true, default: prisma },
    '@/lib/asistente/config': { getAssistantRuntime: async () => ({ publicEnabled: true, retencionMeses: 12, horario: { zona: 'Europe/Madrid', dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' } }) },
    '@/lib/asistente/horario': { dentroHorarioHumano: () => true },
    '@/lib/asistente/http': {
      esMismoOrigen: () => true,
      ipSolicitud: () => '198.51.100.10',
      jsonPrivado: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      leerJsonLimitado: async (request: Request) => ({ ok: true as const, datos: await request.json() }),
    },
    '@/lib/asistente/rate-limit': { consumirRateLimit: async () => ({ permitido: true }), hmacAsistente: () => 'visitante-de-prueba' },
    '@/lib/asistente/responder': { conversacionPublicaSegura: async () => { registro.conversaciones += 1; return '00000000-0000-4000-8000-000000000001' } },
  }
  const exports: Record<string, unknown> = {}
  new Function('require', 'exports', compilado)(
    (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : requireReal(name),
    exports,
  )
  assert.equal(typeof exports.POST, 'function', 'La ruta de escalado debe exportar POST')
  return exports.POST as (request: Request) => Promise<Response>
}

function request(body: unknown): Request {
  return new Request('https://widget.local/api/asistente/escalado', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://widget.local', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body),
  })
}

async function main() {
  const registro: Registro = { create: [], update: [], conversaciones: 0 }
  const POST = cargarRuta(registro)

  const conContacto = await POST(request({
    motivo: 'PETICION',
    nombre: 'Persona sintética',
    telefono: '600000000',
    consentimiento: true,
  }))
  assert.equal(conContacto.status, 503)
  assert.deepEqual(await conContacto.json(), { codigo: 'CONTACTO_SEGURO_NO_CONFIGURADO' })
  assert.equal(registro.create.length, 0, 'No debe persistir escalado con PII sin helper seguro')
  assert.equal(registro.conversaciones, 0, 'No debe crear conversación si se rechaza la captura')

  const sinContacto = await POST(request({ motivo: 'ENFADO', consentimiento: false }))
  assert.equal(sinContacto.status, 200)
  const data = registro.create[0]
  assert.ok(data, 'Debe registrar una escalada sin datos de contacto')
  assert.equal(data.contactoNombre, null)
  assert.equal(data.contactoTelefono, null)
  assert.equal(data.contactoEmail, null)
  assert.equal(data.preferencia, null)
  assert.equal(data.franja, null)
  assert.equal(data.consentimiento, false)
  console.log('Widget escalado: la captura de contacto falla cerrada y no persiste PII en claro.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
