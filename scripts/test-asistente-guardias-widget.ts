import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const requireReal = createRequire(import.meta.url)
const ROOT = process.cwd()

type CallLog = { buscar: number; proveedor: number }

async function cargarRespondedor(calls: CallLog) {
  const [guard, texto] = await Promise.all([
    import('@/lib/asistente/guard'),
    import('@/lib/asistente/text'),
  ])
  const fuente = fs.readFileSync(path.join(ROOT, 'lib/asistente/responder.ts'), 'utf8')
  const compilado = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  let secuencia = 0
  const prisma = {
    asistenteConversacion: {
      findFirst: async () => null,
      create: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      update: async () => ({}),
    },
    asistenteMensaje: { create: async () => ({ id: `00000000-0000-4000-8000-00000000000${++secuencia}` }) },
    asistenteHueco: { upsert: async () => ({}) },
  }
  const mocks: Record<string, unknown> = {
    '@/lib/prisma': { __esModule: true, default: prisma },
    '@/lib/asistente/acl': { resolverAlcance: async () => ({ espacios: ['PUBLICO'], roles: [], tenantId: null, usuarioId: null }) },
    '@/lib/asistente/config': { getAssistantRuntime: async () => ({ modo: 'extractivo', maxChars: 1500, temasProhibidos: ['criptomonedas'], retencionMeses: 12, horario: { zona: 'Europe/Madrid', dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' }, bienvenida: 'Hola' }) },
    '@/lib/asistente/guard': guard,
    '@/lib/asistente/horario': { dentroHorarioHumano: () => true },
    '@/lib/asistente/pii': { redactarPII: async (value: string) => value },
    '@/lib/asistente/provider': { proveedorPara: () => ({ responder: async () => { calls.proveedor += 1; return { respuesta: 'Respuesta [1]', fuentes: [{ n: 1, titulo: 'Prueba', url: '/prueba', fragmento: 'Prueba', documentoId: 'd', versionId: 'v' }] } } }) },
    '@/lib/asistente/retrieval': { buscar: async () => { calls.buscar += 1; return [{ id: 'f', documentoId: 'd', versionId: 'v', titulo: 'Prueba', contenido: 'Contenido de prueba con información fundada.', urlFuente: '/prueba', puntuacion: 1 }] } },
    '@/lib/asistente/text': texto,
  }
  const exports: Record<string, unknown> = {}
  new Function('require', 'exports', compilado)(
    (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : requireReal(name),
    exports,
  )
  assert.equal(typeof exports.responderMensaje, 'function')
  return exports.responderMensaje as (input: { mensaje: string; contexto: 'PUBLICO'; visitanteHash: string }) => Promise<Record<string, unknown>>
}

async function main() {
  const calls: CallLog = { buscar: 0, proveedor: 0 }
  const responderMensaje = await cargarRespondedor(calls)
  const bloqueada = await responderMensaje({ mensaje: '¿Podéis asesorarme sobre criptomonedas?', contexto: 'PUBLICO', visitanteHash: 'visitante-sintetico' })
  assert.equal(calls.buscar, 0, 'Un tema prohibido no debe llegar a recuperación')
  assert.equal(calls.proveedor, 0, 'Un tema prohibido no debe llegar al proveedor')
  assert.equal(bloqueada.sinFuente, true)
  assert.equal(bloqueada.escalar, true)
  assert.equal(bloqueada.motivoEscalado, 'FUERA_DOMINIO')

  const permitida = await responderMensaje({ mensaje: '¿Qué conexión recomendáis para teletrabajo?', contexto: 'PUBLICO', visitanteHash: 'visitante-sintetico' })
  assert.equal(calls.buscar, 1, 'Una pregunta permitida debe continuar a recuperación')
  assert.equal(calls.proveedor, 1, 'Una pregunta con fuente debe alcanzar el proveedor extractivo')
  assert.equal(permitida.sinFuente, false)
  console.log('Guardias widget: temas prohibidos bloqueados antes de recuperación y proveedor.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
