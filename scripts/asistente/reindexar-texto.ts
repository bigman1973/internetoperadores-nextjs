/**
 * Recalcula `asistente_fragmentos.contenido_norm` (y con ello la columna
 * generada `tsv`) con `textoIndexable(titulo, contenido)`, que incluye el
 * título del documento. No cambia contenido, estado, espacio, roles ni
 * activación: sólo el texto normalizado sobre el que se busca.
 *
 * Uso:
 *   tsx scripts/asistente/reindexar-texto.ts                      # ensayo en BD local
 *   tsx scripts/asistente/reindexar-texto.ts --apply              # aplica en BD local
 *   tsx scripts/asistente/reindexar-texto.ts --target=staging     # ensayo en staging
 *   tsx scripts/asistente/reindexar-texto.ts --target=staging --apply
 * Producción no es un destino válido.
 */
import { config as cargarEntorno } from 'dotenv'

const args = new Set(process.argv.slice(2))
const aplicar = args.has('--apply')
const objetivo = [...args].find(arg => arg.startsWith('--target='))?.split('=')[1] || 'local'
if (!['local', 'staging'].includes(objetivo)) throw new Error('TARGET_INVALIDO')
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
  const { default: prisma } = await import('@/lib/prisma')
  const { textoIndexable } = await import('@/lib/asistente/ingesta')
  try {
    const fragmentos = await prisma.asistenteFragmento.findMany({ select: { id: true, titulo: true, contenido: true, contenidoNorm: true, activo: true } })
    const cambios = fragmentos
      .map(fragmento => ({ id: fragmento.id, activo: fragmento.activo, nuevo: textoIndexable(fragmento.titulo, fragmento.contenido), anterior: fragmento.contenidoNorm }))
      .filter(cambio => cambio.nuevo !== cambio.anterior)
    const resumen = { target: objetivo, dryRun: !aplicar, fragmentos: fragmentos.length, aActualizar: cambios.length, activosAActualizar: cambios.filter(cambio => cambio.activo).length }
    if (!aplicar) { console.log(JSON.stringify(resumen)); return }
    let actualizados = 0
    await prisma.$transaction(async tx => {
      for (const cambio of cambios) {
        const r = await tx.asistenteFragmento.updateMany({ where: { id: cambio.id, contenidoNorm: cambio.anterior }, data: { contenidoNorm: cambio.nuevo } })
        actualizados += r.count
      }
      if (actualizados !== cambios.length) throw new Error('REINDEX_CONCURRENTE')
    }, { timeout: 120_000 })
    const total = await prisma.asistenteFragmento.count()
    if (total !== fragmentos.length) throw new Error('REINDEX_CONSERVACION')
    console.log(JSON.stringify({ ...resumen, actualizados, totalDespues: total }))
  } finally {
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'REINDEX_FALLIDO'); process.exitCode = 1 })
