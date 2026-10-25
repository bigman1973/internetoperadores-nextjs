#!/usr/bin/env node
export {}

/**
 * Ejecuta informes pendientes en una única instancia de la aplicación.
 *
 * Uso de host autorizado (staging):
 *   ./node_modules/.bin/tsx scripts/asistente/ejecutar-informes.ts --target=staging
 *
 * El modo local-test sólo existe para la BD vacía exclusiva de este equipo y
 * requiere ASSISTANT_REPORT_ALLOW_LOCAL_TEST=true. No existe destino producción.
 */
function valorArgumento(nombre: string): string | null {
  const prefijo = `${nombre}=`
  const argumento = process.argv.slice(2).find(valor => valor.startsWith(prefijo))
  return argumento ? argumento.slice(prefijo.length) : null
}

function ahoraControlado(valor: string | null): Date {
  if (!valor) return new Date()
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) throw new Error('RELOJ_INVALIDO')
  return fecha
}

function comprobarDestino(destino: string): void {
  if (process.env.ASSISTANT_MODE !== 'extractivo') throw new Error('MODO_ASISTENTE_INVALIDO')
  let url: URL
  try { url = new URL(process.env.DATABASE_URL || '') } catch { throw new Error('DATABASE_URL_INVALIDA') }
  if (url.hostname !== '127.0.0.1' && destino === 'local-test') throw new Error('LOCAL_HOST_REQUERIDO')
  if (destino === 'staging') {
    if (url.pathname !== '/io_staging_finanzas') throw new Error('STAGING_DB_GUARD')
    return
  }
  if (destino === 'local-test' && process.env.ASSISTANT_REPORT_ALLOW_LOCAL_TEST === 'true' && url.pathname === '/asistente_fases_informes') return
  throw new Error('DESTINO_NO_AUTORIZADO')
}

async function main() {
  const destino = valorArgumento('--target') || process.env.ASSISTANT_REPORT_EXECUTION_TARGET || ''
  if (destino !== 'staging' && destino !== 'local-test') throw new Error('TARGET_INVALIDO')
  comprobarDestino(destino)
  const ahora = ahoraControlado(valorArgumento('--now'))
  // DATABASE_URL y las guardias se validan antes de importar Prisma.
  const [{ ejecutarInformesProgramados }, { default: prisma }] = await Promise.all([
    import('@/lib/asistente/informes'),
    import('@/lib/prisma'),
  ])
  try {
    const resultados = await ejecutarInformesProgramados(ahora, 'planificador:cli')
    console.log(JSON.stringify({
      ok: true,
      target: destino,
      now: ahora.toISOString(),
      informes: resultados.map(resultado => ({ tipo: resultado.tipo, generado: resultado.generado, motivo: resultado.motivo })),
    }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'EJECUTOR_INFORMES_FALLIDO')
  process.exitCode = 1
})
