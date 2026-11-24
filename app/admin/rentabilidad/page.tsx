import { requireRentabilidadPage } from '@/lib/rentabilidad/auth';
import { getRentabilidadReport } from '@/lib/rentabilidad/report';
import { INITIAL_PRODUCTS } from '@/lib/rentabilidad/types';
import { ispAvailability } from '@/lib/rentabilidad/isp';
import RentabilidadClient from './RentabilidadClient';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function RentabilidadPage({ searchParams }: { searchParams: Promise<{ month?: string; mode?: string }> }) {
  await requireRentabilidadPage();
  const params = await searchParams;
  const month = typeof params.month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : undefined;
  const mode = params.mode === 'contratado' ? 'contratado' : 'real';
  const report = await getRentabilidadReport(month, mode);
  const initialReport = { ...report, productCatalog: report.productCatalog ?? INITIAL_PRODUCTS,
    syncStatus: { isp: ispAvailability(), scheduled: false, environment: process.env.VERCEL_ENV ?? 'staging',
      reason: 'Las sincronizaciones programadas no están activas en Vercel preview. La API avanzada de contratos ISP está bloqueada (403).' },
  };
  return <RentabilidadClient initialReport={initialReport} />;
}
