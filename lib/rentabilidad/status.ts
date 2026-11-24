import { ispAvailability } from './isp';

type Env = Record<string, string | undefined>;

/** Live metadata only: does not read invoices, call ISP or modify a snapshot. */
export function rentabilidadAutomationStatus(runs: any[], env: Env = process.env) {
  const availability = ispAvailability(env);
  const registered = env.RENTABILIDAD_SCHEDULER === 'MANUS_SCHEDULE'
    && Boolean(env.RENTABILIDAD_SCHEDULE_ID)
    && Boolean(env.RENTABILIDAD_STAGING_CRON_SECRET)
    && env.RENTABILIDAD_ENABLED === '1'
    && env.FINANCE_STAGING_SANDBOX === '1'
    && env.VERCEL_ENV !== 'production';
  const latest = runs.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .find(run => ['DAILY_END', 'RENTABILIDAD_DAILY'].includes(String(run.process ?? run.payload?.process)));
  return {
    isp: { contracts: availability.contracts, lines: availability.lines, reason: availability.reason },
    scheduler: {
      provider: registered ? 'MANUS_SCHEDULE' : 'MANUAL_ONLY',
      registered,
      scheduleId: registered ? env.RENTABILIDAD_SCHEDULE_ID : null,
      cron: registered ? '0 0 4 * * *' : null,
      timezone: 'Europe/Madrid',
      monthlyClose: 'Día 5 de Europe/Madrid: mes anterior, conservando pendientes',
      lastExecutionAt: latest?.createdAt ?? null,
      lastResult: latest?.estado ?? latest?.payload?.estado ?? null,
      latestInvocationIsNotFutureDeliveryProof: true,
    },
    reason: registered
      ? 'Programación diaria registrada para staging. Consulta las ejecuciones: una fuente ISP bloqueada no se convierte en sincronización completa.'
      : 'No hay programación diaria registrada y acreditada para este entorno.',
  };
}
