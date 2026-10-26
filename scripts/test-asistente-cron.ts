import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cronInformeHabilitado, esHoraInformeMadrid, HORA_INFORME_MADRID, SCHEDULE_INFORME_VERCEL_UTC } from '@/lib/asistente/cron'

let comprobaciones = 0
function comprobar(condicion: unknown, mensaje: string): void { assert.ok(condicion, mensaje); comprobaciones += 1 }

const produccionExtractiva = {
  ASSISTANT_CRON_ENABLED: 'true',
  ASSISTANT_MODE: 'extractivo',
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
}

function main(): void {
  // 06:00 UTC equivale a las 08:00 CEST; 07:00 UTC equivale a las 08:00 CET.
  comprobar(esHoraInformeMadrid(new Date('2026-03-30T06:00:00.000Z')), '08:00 CEST debe permitir el informe')
  comprobar(!esHoraInformeMadrid(new Date('2026-03-30T07:00:00.000Z')), '09:00 CEST debe rechazarse')
  comprobar(!esHoraInformeMadrid(new Date('2026-10-26T06:00:00.000Z')), '07:00 CET debe rechazarse')
  comprobar(esHoraInformeMadrid(new Date('2026-10-26T07:00:00.000Z')), '08:00 CET debe permitir el informe')
  comprobar(HORA_INFORME_MADRID === 8, 'la hora local autorizada es las 08:00')

  comprobar(cronInformeHabilitado(produccionExtractiva), 'producción extractiva explícitamente habilitada debe permitir el cron')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, NODE_ENV: 'development' }), 'NODE_ENV ajeno a producción queda bloqueado')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, VERCEL_ENV: 'preview' }), 'Preview queda bloqueado')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, FINANCE_STAGING_SANDBOX: '1' }), 'staging queda bloqueado')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, FINANCE_DEPLOYMENT_READ_ONLY: '1' }), 'solo lectura queda bloqueada')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, ASSISTANT_MODE: 'local' }), 'modo no extractivo queda bloqueado')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, ASSISTANT_CRON_ENABLED: 'false' }), 'flag de cron apagado queda bloqueado')
  comprobar(!cronInformeHabilitado({ ...produccionExtractiva, ASSISTANT_DAILY_REPORT_HOUR: '9' }), 'una hora configurada distinta de 08:00 queda bloqueada')

  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
  const informe = vercel.crons.filter(cron => cron.path === '/api/cron/asistente-informe')
  comprobar(informe.length === 1 && informe[0]?.schedule === SCHEDULE_INFORME_VERCEL_UTC, 'la programación UTC dual del informe debe ser única y exacta')
  comprobar(vercel.crons.some(cron => cron.path === '/api/cron/finance-sync-worker' && cron.schedule === '*/5 * * * *'), 'se conserva el cron financiero worker')
  comprobar(vercel.crons.some(cron => cron.path === '/api/cron/finance-sync-daily' && cron.schedule === '0 1 * * *'), 'se conserva el cron financiero diario')

  console.log(`TEST_ASISTENTE_CRON_OK: ${comprobaciones} comprobaciones unitarias, sin red ni BD`)
}

main()
