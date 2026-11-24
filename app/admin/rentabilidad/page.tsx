import { requireRentabilidadPage } from '@/lib/rentabilidad/auth';
import { getRentabilidadReport } from '@/lib/rentabilidad/report';
import { INITIAL_PRODUCTS } from '@/lib/rentabilidad/types';
import { rentabilidadAutomationStatus } from '@/lib/rentabilidad/status';
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
    syncStatus: report.syncStatus ?? rentabilidadAutomationStatus(report.runs ?? []),
  };
  return <RentabilidadClient initialReport={initialReport} />;
}
