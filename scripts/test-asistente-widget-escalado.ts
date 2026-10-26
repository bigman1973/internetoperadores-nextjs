import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const requireReal = createRequire(import.meta.url)
const ROOT = process.cwd()

type Registro = {
  create: Array<Record<string, unknown>>
  update: Array<Record<string, unknown>>
  contactos: Array<Record<string, unknown>>
  conversaciones: number
}

function cargarRuta(registro: Registro, opciones: { contactoFalla?: boolean } = {}) {
  const fuente = fs.readFileSync(path.join(ROOT, 'app/api/asistente/escalado/route.ts'), 'utf8')
  const compilado = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  let escalado = 0
  const tx = {
    asistenteEscalado: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        registro.create.push(data)
        return { id: `00000000-0000-4000-8000-00000000000${++escalado}` }
      },
    },
    asistenteConversacion: { update: async ({ data }: { data: Record<string, unknown> }) => { registro.update.push(data); return data } },
    asistenteContactoSeguro: { upsert: async ({ create }: { create: Record<string, unknown> }) => { registro.contactos.push(create); return create } },
  }
  const prisma = {
    $transaction: async (fn: (client: typeof tx) => Promise<void>) => {
      const start = { create: registro.create.length, update: registro.update.length, contactos: registro.contactos.length }
      try { await fn(tx) } catch (error) {
        registro.create.length = start.create
        registro.update.length = start.update
        registro.contactos.length = start.contactos
        throw error
      }
    },
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
    '@/lib/asistente/contacto-seguro': {
      guardarContactoSeguro: async (_db: unknown, input: Record<string, unknown>) => {
        if (opciones.contactoFalla) throw new Error('CONTACTO_CIFRADO_NO_CONFIGURADO')
        await tx.asistenteContactoSeguro.upsert({ create: {
          referenciaTipo: input.referenciaTipo,
          referenciaId: input.referenciaId,
          conversacionId: input.conversacionId,
          borrarDespues: input.borrarDespues,
          cifrado: '{"version":"v1","contenido":"cifrado-sintetico"}',
          keyVersion: 'contacto-v1',
        } })
      },
    },
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

const contacto = {
  motivo: 'PETICION',
  nombre: 'Persona sintética',
  telefono: '600000000',
  preferencia: 'LLAMADA',
  consentimiento: true,
}

async function main() {
  const exitoso: Registro = { create: [], update: [], contactos: [], conversaciones: 0 }
  const postExitoso = cargarRuta(exitoso)
  const respuesta = await postExitoso(request(contacto))
  assert.equal(respuesta.status, 200)
  assert.equal((await respuesta.json()).ok, true)
  assert.equal(exitoso.create.length, 1)
  const escalado = exitoso.create[0]
  assert.equal(escalado.contactoNombre, null)
  assert.equal(escalado.contactoTelefono, null)
  assert.equal(escalado.contactoEmail, null)
  assert.equal(escalado.preferencia, 'LLAMADA')
  assert.equal(escalado.consentimiento, true)
  assert.equal(exitoso.contactos.length, 1, 'El contacto se delega al helper seguro de captación')
  const seguro = JSON.stringify(exitoso.contactos[0])
  assert.ok(!seguro.includes('Persona sintética') && !seguro.includes('600000000'), 'El registro seguro de la ruta no lleva PII en claro')

  const fallido: Registro = { create: [], update: [], contactos: [], conversaciones: 0 }
  const postFallido = cargarRuta(fallido, { contactoFalla: true })
  const sinSecreto = await postFallido(request(contacto))
  assert.equal(sinSecreto.status, 503)
  assert.deepEqual(await sinSecreto.json(), { codigo: 'CONTACTO_SEGURO_NO_CONFIGURADO' })
  assert.equal(fallido.create.length, 0, 'El escalado se revierte si el contacto cifrado no se puede guardar')
  assert.equal(fallido.contactos.length, 0)

  const sinContacto: Registro = { create: [], update: [], contactos: [], conversaciones: 0 }
  const postSinContacto = cargarRuta(sinContacto)
  assert.equal((await postSinContacto(request({ motivo: 'ENFADO', consentimiento: false }))).status, 200)
  assert.equal(sinContacto.contactos.length, 0)
  assert.equal(sinContacto.create[0]?.contactoNombre, null)
  console.log('Widget escalado: contacto delegado al helper seguro, sin PII en claro y fallo cerrado sin secreto.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
