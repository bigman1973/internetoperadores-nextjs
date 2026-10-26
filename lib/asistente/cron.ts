export type EntornoCronInforme = Record<string, string | undefined>

export const SCHEDULE_INFORME_VERCEL_UTC = '0 6,7 * * *'
export const HORA_INFORME_MADRID = 8

function horaEnMadrid(ahora: Date): number {
  const parte = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora).find(valor => valor.type === 'hour')?.value
  return Number(parte || -1)
}

/** La doble programación UTC se reduce a una única ventana local de las 08:xx. */
export function esHoraInformeMadrid(ahora: Date): boolean {
  return horaEnMadrid(ahora) === HORA_INFORME_MADRID
}

/**
 * El informe programado sólo se permite en el runtime de producción de Vercel.
 * Preview, staging, la ventana financiera de sólo lectura y cualquier modo no
 * extractivo fallan cerrados. El widget público no interviene en este proceso.
 */
export function cronInformeHabilitado(env: EntornoCronInforme = process.env): boolean {
  const horaConfigurada = env.ASSISTANT_DAILY_REPORT_HOUR?.trim()
  return env.ASSISTANT_CRON_ENABLED === 'true'
    && env.ASSISTANT_MODE === 'extractivo'
    && env.NODE_ENV === 'production'
    && env.VERCEL_ENV === 'production'
    && env.FINANCE_STAGING_SANDBOX !== '1'
    && env.FINANCE_DEPLOYMENT_READ_ONLY !== '1'
    && (horaConfigurada === undefined || horaConfigurada === '' || horaConfigurada === String(HORA_INFORME_MADRID))
}
