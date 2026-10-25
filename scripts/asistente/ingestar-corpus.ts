import fs from 'node:fs'
import path from 'node:path'
import { config as cargarEntorno } from 'dotenv'

const args = new Set(process.argv.slice(2))
const aplicar = args.has('--apply')
const objetivo = [...args].find(arg => arg.startsWith('--target='))?.split('=')[1] || 'local'
if (!['local', 'staging'].includes(objetivo)) throw new Error('TARGET_INVALIDO')
if (objetivo === 'staging' && !aplicar) throw new Error('STAGING_REQUIERE_APPLY')
if (objetivo === 'staging') {
  cargarEntorno({ path: '/home/ubuntu/internetoperadores-nextjs-margin/.env' })
  try {
    if (new URL(process.env.DATABASE_URL || '').pathname !== '/io_staging_finanzas') throw new Error('STAGING_DB_GUARD')
  } catch { throw new Error('STAGING_DB_GUARD') }
} else {
  cargarEntorno({ path: '/home/ubuntu/asistente-ia-20261025/pruebas/.env.local-dev' })
  process.env.DATABASE_URL = process.env.ASSISTANT_TEST_DATABASE_URL
  if (!process.env.DATABASE_URL) throw new Error('LOCAL_DB_GUARD')
}

async function main() {
  const { extraerFaqEstaticas, indexarFuente, tarifasPublicas } = await import('@/lib/asistente/ingesta')
  const faqs = await extraerFaqEstaticas()
  if (!aplicar) {
    console.log(JSON.stringify({ dryRun: true, target: objetivo, fuentes: faqs.map(fuente => ({ tipo: fuente.tipo, titulo: fuente.titulo, origen: fuente.origen })), tarifas: 'no consultadas en dry-run' }, null, 2))
    return
  }
  let tarifas = []
  try { tarifas = await tarifasPublicas() } catch (error: any) {
    if (objetivo !== 'local' || error?.code !== 'P2021') throw error
  }
  const fuentes = [...faqs, ...tarifas]
  const resultados = []
  // FAQ estáticas y tarifas con publicarWeb* ya están publicadas en la web: entran como PÚBLICO/PUBLICADO.
  for (const fuente of fuentes) resultados.push(await indexarFuente(fuente, undefined, { espacio: 'PUBLICO', estado: 'PUBLICADO' }))
  console.log(JSON.stringify({ dryRun: false, target: objetivo, total: resultados.length, creados: resultados.filter(resultado => resultado.creado).length }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'INGESTA_FALLIDA'); process.exitCode = 1 })
